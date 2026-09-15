import { createHash } from 'node:crypto';
import { z } from 'zod';
import { formatQCode } from './qcode.js';
import { HttpError } from './errors.js';
import { priceSnapshot, discountCents, compareDecimal } from './readiness-pricing.js';

export type RecordData = Record<string, any>;
export interface Transaction {
  get(path: string): Promise<RecordData | undefined>;
  create(path: string, value: RecordData): void;
  set(path: string, value: RecordData): void;
}
export interface TransactionStore { run<T>(work: (tx: Transaction) => Promise<T>): Promise<T> }
export type Identity = { uid: string; email: string; verified: boolean };
const id = z.string().regex(/^[A-Za-z0-9_-]{1,80}$/);
const requestId = z.uuid();
const version = z.number().int().nonnegative();
const fileReference = z.object({ object: z.string().max(400), generation: z.string().regex(/^\d+$/),
  sha256: z.string().regex(/^[a-f0-9]{64}$/), bytes: z.number().int().positive().max(15 * 1024 * 1024),
  name: z.string().min(1).max(200).refine(v => !/[\x00-\x1f/\\]/.test(v)),
  contentType: z.enum(['application/pdf', 'image/png', 'image/jpeg', 'image/webp',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/plain']) }).strict();
export const submissionSchema = z.object({ quotationId: id, requestId, expectedVersion: version,
  approverUid: id, pdfId: id, attachmentIds: z.array(id).max(20).default([]) }).strict();
export const desktopSubmissionSchema = z.object({ quotationId: id, requestId,
  approverUid: id, snapshot: z.unknown() }).strict();
export const decisionInput = z.object({ requestId, expectedVersion: version, snapshotHash: z.string().regex(/^[a-f0-9]{64}$/),
  action: z.enum(['APPROVE', 'REJECT']), comment: z.string().trim().max(2000).default(''),
  approvedDiscountPercent: z.string().regex(/^\d{1,3}(?:\.\d{1,6})?$/).default('0') }).strict();
function fail(code: string, message: string, status = 409): never { throw new HttpError(status, code, message); }
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => JSON.stringify(k) + ':' + canonical(v)).join(',') + '}';
  return JSON.stringify(value);
}
export const fingerprint = (value: unknown) => createHash('sha256').update(canonical(value)).digest('hex');
async function member(tx: Transaction, actor: Identity, roles: string[]) {
  if (!actor.verified || !actor.uid || !actor.email) fail('AUTH_REQUIRED', 'Verified sign-in required.', 401);
  const user = await tx.get(`users/${id.parse(actor.uid)}`);
  if (!user || user.active !== true || user.email?.toLowerCase() !== actor.email.toLowerCase() || !roles.includes(user.role))
    fail('ROLE_REQUIRED', 'Active authorized membership is required.', 403);
  return user;
}
function owned(record: RecordData | undefined, uid: string): asserts record is RecordData {
  if (!record || record.ownerUid !== uid) fail('NOT_FOUND', 'Quotation not found.', 404);
}
function current(record: RecordData, expected: number) {
  if (record.version !== expected) fail('VERSION_CONFLICT', 'A newer revision or decision exists. Refresh before continuing.');
}
function replay(receipt: RecordData | undefined, hash: string): RecordData | undefined {
  if (!receipt) return;
  if (receipt.hash !== hash) fail('IDEMPOTENCY_CONFLICT', 'Request ID already used for different content.');
  return receipt.result;
}
function receiptPath(actor: Identity, rid: string) { return `workflowRequests/${fingerprint([actor.uid, rid])}`; }
function audit(tx: Transaction, rid: string, actor: Identity, type: string, quotationId: string, at: number, detail: RecordData = {}) {
  tx.create(`workflowAudit/${fingerprint([actor.uid, rid])}`, { type, quotationId, actorUid: actor.uid,
    correlationId: rid, at, detail, schemaVersion: 1 });
}
function notification(tx: Transaction, key: string, quotationId: string, approvalId: string, at: number) {
  // Separate collection prevents the legacy mail/Sheets worker consuming new events.
  tx.create(`notificationOutbox/${key}`, { quotationId, approvalId, status: 'PENDING', attempts: 0,
    createdAt: at, nextAttemptAt: at, leaseOwner: null, leaseUntil: 0, deliveryState: 'NOT_ATTEMPTED' });
}

/** No network or SDK dependency. The Firestore adapter supplies atomicity;
 * offline tests use an optimistic-concurrency transaction double. */
export class ReadinessWorkflow {
  constructor(private store: TransactionStore, private clock = Date.now) {}

  async currentUser(actor: Identity): Promise<RecordData> {
    return this.store.run(async tx => {
      const user = await member(tx, actor, ['preparer', 'approver', 'admin']);
      return { uid: actor.uid, email: actor.email, role: user.role, active: true,
        employeeCode: user.employeeCode ?? '', displayName: user.displayName ?? '' };
    });
  }

  async submitDesktop(actor: Identity, raw: unknown) {
    const input = desktopSubmissionSchema.parse(raw), priced = priceSnapshot(input.snapshot);
    const hash = fingerprint(['DESKTOP_SUBMIT', input.quotationId, input.approverUid, priced.snapshot]);
    return this.store.run(async tx => {
      const user = await member(tx, actor, ['preparer', 'admin']);
      const approver = await tx.get(`users/${input.approverUid}`);
      const policy = await tx.get('workflowPolicy/approval');
      const receipt = await tx.get(receiptPath(actor, input.requestId));
      const path = `workflowQuotations/${input.quotationId}`;
      const existing = await tx.get(path);
      const at = this.clock(), year = new Date(at).getUTCFullYear();
      const counterPath = `qCodeCounters/${year}-${user.employeeCode}`;
      const counter = await tx.get(counterPath);
      const prior = replay(receipt, hash); if (prior) return prior;
      if (existing) fail('REVISION_EXISTS', 'This desktop quotation was already submitted. Refresh its online state.');
      if (!approver || approver.active !== true || !['approver', 'admin'].includes(approver.role))
        fail('INVALID_APPROVER', 'Choose an active approver.', 403);
      if (input.approverUid === actor.uid && policy?.allowSelfApproval !== true)
        fail('SELF_APPROVAL', 'Self-approval is not authorized by policy.', 403);
      if (!Number.isInteger(policy?.expiryHours) || policy!.expiryHours < 1 || policy!.expiryHours > 720)
        fail('POLICY_REQUIRED', 'An administrator must approve an expiry policy before test submission.');
      if (counter?.bootstrapped !== true)
        fail('COUNTER_NOT_READY', 'Q-Code counter requires verified test bootstrap.');
      const sequence = Number(counter.lastSequence) + 1;
      const qCode = formatQCode({ year, employeeCode: user.employeeCode, sequence });
      const approvalId = fingerprint([input.quotationId, 0]);
      const snapshotHash = fingerprint({ snapshot: priced.snapshot, customer: priced.customer, files: [] });
      const result = { quotationId: input.quotationId, approvalId, qCode, version: 1, snapshotHash, status: 'PENDING' };
      tx.set(counterPath, { ...counter, lastSequence: sequence, updatedAt: at });
      tx.create(path, { ownerUid: actor.uid, status: 'PENDING', version: 1, revision: 0, qCode,
        approvalId, snapshotHash, snapshot: priced.snapshot, customer: priced.customer, updatedAt: at,
        source: 'DESKTOP_V0_10', schemaVersion: 1 });
      tx.create(`workflowApprovals/${approvalId}`, { quotationId: input.quotationId, ownerUid: actor.uid,
        approverUid: input.approverUid, revision: 0, snapshot: priced.snapshot, customer: priced.customer,
        files: [], snapshotHash, status: 'PENDING', expiresAt: at + policy!.expiryHours * 3600000,
        submittedAt: at, source: 'DESKTOP_V0_10' });
      tx.create(receiptPath(actor, input.requestId), { hash, result });
      audit(tx, input.requestId, actor, 'SUBMITTED', input.quotationId, at, { approvalId, snapshotHash, source: 'DESKTOP_V0_10' });
      tx.create(`desktopApprovalOutbox/submitted-${approvalId}`, { quotationId: input.quotationId,
        approvalId, status: 'HELD_FOR_TEST', createdAt: at, deliveryState: 'DISABLED' });
      return result;
    });
  }

  async read(actor: Identity, quotationId: string): Promise<RecordData> {
    id.parse(quotationId);
    return this.store.run(async tx => {
      const user = await member(tx, actor, ['preparer', 'approver', 'admin']);
      const record = await tx.get(`workflowQuotations/${quotationId}`);
      const approval = record?.approvalId ? await tx.get(`workflowApprovals/${record.approvalId}`) : undefined;
      if (!record || !(record.ownerUid === actor.uid ||
        (approval?.approverUid === actor.uid && ['approver', 'admin'].includes(user.role))))
        fail('NOT_FOUND', 'Quotation not found.', 404);
      return { ...record, approval };
    });
  }

  async save(actor: Identity, quotationId: string, rid: string, expectedVersion: number, raw: unknown) {
    id.parse(quotationId); requestId.parse(rid); version.parse(expectedVersion);
    const priced = priceSnapshot(raw); // submit-ready records; incomplete desktop drafts remain local.
    const hash = fingerprint(['SAVE', quotationId, expectedVersion, priced.snapshot]);
    return this.store.run(async tx => {
      await member(tx, actor, ['preparer', 'admin']);
      const receipt = await tx.get(receiptPath(actor, rid));
      const record = await tx.get(`workflowQuotations/${quotationId}`);
      const prior = replay(receipt, hash); if (prior) return prior;
      if (record) { owned(record, actor.uid); current(record, expectedVersion); }
      else if (expectedVersion !== 0) fail('VERSION_CONFLICT', 'Quotation does not exist.');
      if (record && record.status !== 'DRAFT') fail('REVISION_LOCKED', 'Submitted revisions are immutable. Create a new revision.');
      const now = this.clock(), nextVersion = expectedVersion + 1;
      tx.set(`workflowQuotations/${quotationId}`, { ...record, ownerUid: actor.uid,
        status: 'DRAFT', version: nextVersion, revision: record?.revision ?? 0,
        qCode: record?.qCode ?? null, snapshot: priced.snapshot, customer: priced.customer, updatedAt: now, schemaVersion: 1 });
      const result = { quotationId, version: nextVersion };
      tx.create(receiptPath(actor, rid), { hash, result });
      audit(tx, rid, actor, 'DRAFT_SAVED', quotationId, now);
      return result;
    });
  }

  async submit(actor: Identity, raw: unknown) {
    const input = submissionSchema.parse(raw), hash = fingerprint(['SUBMIT', input]);
    return this.store.run(async tx => {
      const user = await member(tx, actor, ['preparer', 'admin']);
      const approver = await tx.get(`users/${input.approverUid}`);
      const policy = await tx.get('workflowPolicy/approval');
      const receipt = await tx.get(receiptPath(actor, input.requestId));
      const path = `workflowQuotations/${input.quotationId}`, record = await tx.get(path);
      owned(record, actor.uid);
      const prior = replay(receipt, hash); if (prior) return prior;
      current(record, input.expectedVersion);
      if (record.status !== 'DRAFT') fail('REVISION_LOCKED', 'Only a draft can be submitted.');
      if (!approver || approver.active !== true || !['approver', 'admin'].includes(approver.role)) fail('INVALID_APPROVER', 'Choose an active approver.', 403);
      if (input.approverUid === actor.uid && policy?.allowSelfApproval !== true) fail('SELF_APPROVAL', 'Self-approval is not authorized by policy.', 403);
      // Expiry is a server-managed policy decision, never a client-supplied date.
      if (!Number.isInteger(policy?.expiryHours) || policy!.expiryHours < 1 || policy!.expiryHours > 720)
        fail('POLICY_REQUIRED', 'An administrator must approve an expiry policy before staging submission.');
      const priced = priceSnapshot(record.snapshot);
      const at = this.clock(), year = new Date(at).getUTCFullYear();
      const counterPath = `qCodeCounters/${year}-${user.employeeCode}`;
      const counter = record.qCode ? undefined : await tx.get(counterPath);
      if (!record.qCode && counter?.bootstrapped !== true) fail('COUNTER_NOT_READY', 'Q-Code counter requires verified staging bootstrap.');
      const fileIds = [input.pdfId, ...input.attachmentIds];
      if (new Set(fileIds).size !== fileIds.length) fail('INVALID_ATTACHMENTS', 'Duplicate attachment identifiers.', 400);
      const files = [];
      for (const fileId of fileIds) {
        const manifest = await tx.get(`privateFiles/${fileId}`);
        if (!manifest || manifest.ownerUid !== actor.uid || manifest.quotationId !== input.quotationId || manifest.revision !== record.revision || manifest.scanStatus !== 'CLEAN')
          fail('FILE_NOT_READY', 'Private files must be verified for this owner and revision.', 409);
        const file = fileReference.parse(manifest.reference);
        if (!file.object.startsWith(`quotations/${input.quotationId}/r${record.revision}/`) || /\.\.|[?#:\\]/.test(file.object)) fail('INVALID_FILE_PATH', 'Unsafe private file reference.', 400);
        files.push(file);
      }
      if (files[0]!.contentType !== 'application/pdf') fail('PDF_REQUIRED', 'A quotation PDF is required.', 400);
      if (files.slice(1).reduce((sum, f) => sum + f.bytes, 0) > 15 * 1024 * 1024 || files.reduce((sum, f) => sum + f.bytes, 0) > 20 * 1024 * 1024)
        fail('ATTACHMENT_LIMIT', 'Attachment size limit exceeded.', 400);
      const sequence = record.qCode ? null : Number(counter!.lastSequence) + 1;
      const qCode = record.qCode || formatQCode({ year, employeeCode: user.employeeCode, sequence: sequence! });
      const approvalId = fingerprint([input.quotationId, record.revision]);
      const snapshotHash = fingerprint({ snapshot: priced.snapshot, customer: priced.customer, files });
      // All reads above, all writes below: required by Firestore transactions.
      if (sequence !== null) tx.set(counterPath, { ...counter, lastSequence: sequence, updatedAt: at });
      tx.create(`workflowApprovals/${approvalId}`, { quotationId: input.quotationId, ownerUid: actor.uid,
        approverUid: input.approverUid, revision: record.revision, snapshot: priced.snapshot,
        customer: priced.customer, files, snapshotHash, status: 'PENDING', expiresAt: at + policy!.expiryHours * 3600000, submittedAt: at });
      const result = { quotationId: input.quotationId, approvalId, qCode, version: record.version + 1, snapshotHash, status: 'PENDING' };
      tx.set(path, { ...record, ...result, updatedAt: at });
      tx.create(receiptPath(actor, input.requestId), { hash, result });
      audit(tx, input.requestId, actor, 'SUBMITTED', input.quotationId, at, { approvalId, snapshotHash });
      notification(tx, `submitted-${approvalId}`, input.quotationId, approvalId, at);
      return result;
    });
  }

  async decide(actor: Identity, approvalId: string, raw: unknown) {
    id.parse(approvalId); const input = decisionInput.parse(raw);
    if (input.action === 'REJECT' && !input.comment) fail('COMMENT_REQUIRED', 'Give a reason for return for correction.', 400);
    const hash = fingerprint(['DECIDE', approvalId, input]);
    return this.store.run(async tx => {
      await member(tx, actor, ['approver', 'admin']);
      const approval = await tx.get(`workflowApprovals/${approvalId}`);
      if (!approval || approval.approverUid !== actor.uid) fail('NOT_FOUND', 'Approval not found.', 404);
      const policy = await tx.get('workflowPolicy/approval');
      const receipt = await tx.get(receiptPath(actor, input.requestId));
      const path = `workflowQuotations/${approval.quotationId}`, record = await tx.get(path);
      if (!record) fail('NOT_FOUND', 'Quotation not found.', 404);
      if (approval.ownerUid === actor.uid && policy?.allowSelfApproval !== true) fail('SELF_APPROVAL', 'Self-approval is not authorized.', 403);
      const prior = replay(receipt, hash); if (prior) return prior;
      current(record, input.expectedVersion);
      if (record.approvalId !== approvalId || input.snapshotHash !== approval.snapshotHash) fail('STALE_REVISION', 'Refresh the current approval revision.');
      if (fingerprint({ snapshot: approval.snapshot, customer: approval.customer, files: approval.files }) !== approval.snapshotHash) fail('SNAPSHOT_CHANGED', 'Submitted snapshot integrity check failed.');
      if (approval.status !== 'PENDING' || record.status !== 'PENDING') fail('NOT_PENDING', 'Approval was already decided or recalled.');
      if (approval.expiresAt <= this.clock()) fail('APPROVAL_EXPIRED', 'This approval expired. Recall and create a new revision.');
      const discount = discountCents(approval.customer.totalCents, input.approvedDiscountPercent);
      const status = input.action === 'APPROVE' ? 'APPROVED' : 'RETURNED';
      const result = { status, version: record.version + 1, approvedDiscountCents: input.action === 'APPROVE' ? discount : 0,
        finalTotalCents: approval.customer.totalCents - (input.action === 'APPROVE' ? discount : 0) };
      const at = this.clock();
      tx.set(path, { ...record, ...result, updatedAt: at });
      tx.set(`workflowApprovals/${approvalId}`, { ...approval, ...result, decisionByUid: actor.uid, decisionAt: at, decisionComment: input.comment });
      tx.create(receiptPath(actor, input.requestId), { hash, result });
      audit(tx, input.requestId, actor, 'DECIDED', approval.quotationId, at, { approvalId, action: input.action, snapshotHash: approval.snapshotHash });
      notification(tx, `decided-${approvalId}`, approval.quotationId, approvalId, at);
      return result;
    });
  }

  async recall(actor: Identity, quotationId: string, rid: string, expected: number, reason: string) {
    id.parse(quotationId); requestId.parse(rid); version.parse(expected);
    if (!reason.trim() || reason.length > 2000) fail('REASON_REQUIRED', 'A short recall reason is required.', 400);
    const hash = fingerprint(['RECALL', quotationId, expected, reason]);
    return this.store.run(async tx => {
      await member(tx, actor, ['preparer', 'approver', 'admin']);
      const record = await tx.get(`workflowQuotations/${quotationId}`);
      const receipt = await tx.get(receiptPath(actor, rid));
      const approval = record?.approvalId ? await tx.get(`workflowApprovals/${record.approvalId}`) : undefined;
      if (!record || !approval || ![record.ownerUid, approval.approverUid].includes(actor.uid)) fail('NOT_FOUND', 'Quotation not found.', 404);
      const prior = replay(receipt, hash); if (prior) return prior;
      current(record, expected);
      if (!['PENDING', 'APPROVED'].includes(record.status)) fail('RECALL_DENIED', 'Cannot recall a committed customer PO or inactive revision.');
      const result = { status: 'RECALLED', version: expected + 1 };
      tx.set(`workflowQuotations/${quotationId}`, { ...record, ...result });
      tx.set(`workflowApprovals/${record.approvalId}`, { ...approval, status: 'RECALLED', recallReason: reason, recalledAt: this.clock() });
      tx.create(receiptPath(actor, rid), { hash, result });
      audit(tx, rid, actor, 'RECALLED', quotationId, this.clock(), { reason });
      return result;
    });
  }

  async revise(actor: Identity, quotationId: string, rid: string, expected: number) {
    id.parse(quotationId); requestId.parse(rid); version.parse(expected);
    const hash = fingerprint(['REVISE', quotationId, expected]);
    return this.store.run(async tx => {
      await member(tx, actor, ['preparer', 'admin']);
      const record = await tx.get(`workflowQuotations/${quotationId}`);
      const receipt = await tx.get(receiptPath(actor, rid));
      owned(record, actor.uid); const prior = replay(receipt, hash); if (prior) return prior;
      current(record, expected);
      if (!['APPROVED', 'RETURNED', 'RECALLED'].includes(record.status)) fail('REVISION_DENIED', 'Resolve the pending review or customer PO before revision.');
      const result = { status: 'DRAFT', version: expected + 1, revision: record.revision + 1, qCode: record.qCode };
      tx.set(`workflowQuotations/${quotationId}`, { ...record, ...result, approvalId: null, snapshotHash: null });
      tx.create(receiptPath(actor, rid), { hash, result });
      audit(tx, rid, actor, 'REVISION_CREATED', quotationId, this.clock());
      return result;
    });
  }

  async recordPO(actor: Identity, quotationId: string, rid: string, expected: number, po: string, accepted: Record<string, string>) {
    id.parse(quotationId); requestId.parse(rid); version.parse(expected);
    z.string().trim().min(1).max(200).parse(po);
    z.record(z.string(), z.string().regex(/^\d{1,12}(?:\.\d{1,9})?$/)).parse(accepted);
    const hash = fingerprint(['PO', quotationId, expected, po, accepted]);
    return this.store.run(async tx => {
      await member(tx, actor, ['preparer', 'admin']);
      const record = await tx.get(`workflowQuotations/${quotationId}`);
      const receipt = await tx.get(receiptPath(actor, rid));
      owned(record, actor.uid); const prior = replay(receipt, hash); if (prior) return prior;
      current(record, expected);
      if (!['APPROVED', 'PO_PARTIAL', 'PO_ACCEPTED'].includes(record.status)) fail('PO_REQUIRES_APPROVAL', 'Internal approval is required before recording customer acceptance.');
      const items = record.snapshot.items as { item_no: string; quantity: string }[];
      if (Object.keys(accepted).some(key => !items.some(i => i.item_no === key)) || !Object.values(accepted).some(q => compareDecimal(q, '0') > 0)) fail('INVALID_PO', 'Choose known items and a positive quantity.', 400);
      if (items.some(i => compareDecimal(accepted[i.item_no] ?? '0', i.quantity) > 0)) fail('INVALID_PO', 'Accepted quantity exceeds quotation.', 400);
      const status = items.every(i => compareDecimal(accepted[i.item_no] ?? '0', i.quantity) === 0) ? 'PO_ACCEPTED' : 'PO_PARTIAL';
      const result = { status, version: expected + 1 };
      tx.set(`workflowQuotations/${quotationId}`, { ...record, ...result, customerPO: { number: po, accepted, at: this.clock() } });
      tx.create(receiptPath(actor, rid), { hash, result });
      audit(tx, rid, actor, 'CUSTOMER_PO_RECORDED', quotationId, this.clock(), { po, accepted });
      return result;
    });
  }
}
