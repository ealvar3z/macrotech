import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { ReadinessWorkflow, type TransactionStore, type RecordData, type Identity } from './readiness-workflow.js';
import { priceSnapshot, discountCents, compareDecimal } from './readiness-pricing.js';

// Optimistic concurrency double: competing transactions retry from fresh reads.
// It also detects reads after writes, create collisions, and commit failure.
class MemoryStore implements TransactionStore {
  rows = new Map<string, RecordData>(); versions = new Map<string, number>();
  failNextCommit = false; retries = 0;
  seed(path: string, value: RecordData) { this.rows.set(path, structuredClone(value)); this.versions.set(path, (this.versions.get(path) ?? 0) + 1); }
  async run<T>(work: Parameters<TransactionStore['run']>[0]): Promise<T> {
    for (let attempt = 0; attempt < 200; attempt++) {
      const reads = new Map<string, number>(), writes = new Map<string, { create: boolean; value: RecordData }>();
      const result = await work({
        get: async path => {
          assert.equal(writes.size, 0, 'Firestore requires all reads before writes');
          reads.set(path, this.versions.get(path) ?? 0); return structuredClone(this.rows.get(path));
        },
        create: (path, value) => { assert(!writes.has(path)); writes.set(path, { create: true, value: structuredClone(value) }); },
        set: (path, value) => { writes.set(path, { create: false, value: structuredClone(value) }); }
      });
      if ([...reads].some(([path, version]) => (this.versions.get(path) ?? 0) !== version)) { this.retries++; continue; }
      if (this.failNextCommit) { this.failNextCommit = false; throw new Error('SIMULATED_INTERRUPTION'); }
      for (const [path, write] of writes) assert(!write.create || !this.rows.has(path), 'Create must not overwrite existing records');
      for (const [path, write] of writes) this.seed(path, write.value);
      return result as T;
    }
    throw new Error('Contention retry limit');
  }
}
const employee: Identity = { uid: 'employee', email: 'employee@example.invalid', verified: true };
const reviewer: Identity = { uid: 'reviewer', email: 'reviewer@example.invalid', verified: true };
const option = { id: 'selected', supplier: 'PRIVATE SUPPLIER', offer: 'Pump offered', co_sbm: 'SBM', currency: 'PHP',
  unit_price: '100', freight_cost: '0', packing_cost: '0', bank_charges: '0', other_charges: '0', forex_rate: '1',
  duty_rate: '0', markup_multiplier: '1.12', safety_factor_rate: '0', cost_basis_mode: 'LOCAL', cost_basis_override: '0' };
const snapshot = { customer: 'Mock customer', buyer: 'Mock buyer', rfq_reference: 'OFFLINE-RFQ', terms_version: 1,
  terms_text: 'Existing terms preserved for this mock.', discount_requested_percent: '5', items: [
    { item_no: '1', description: 'Pump required', uom: 'PC', quantity: '10', selected_supplier_id: 'selected', supplier_options: [option, { ...option, id: 'alternate', supplier: 'SECRET ALTERNATE', unit_price: '999', internal_notes: 'PRIVATE NOTE' }] }
  ] };
function fixture() {
  const store = new MemoryStore(); let now = Date.UTC(2026, 8, 12);
  for (const [actor, role] of [[employee, 'preparer'], [reviewer, 'approver']] as const)
    store.seed(`users/${actor.uid}`, { email: actor.email, active: true, role, employeeCode: 'TST' });
  store.seed('workflowPolicy/approval', { allowSelfApproval: false, expiryHours: 72 });
  store.seed('qCodeCounters/2026-TST', { lastSequence: 0, bootstrapped: true });
  const service = new ReadinessWorkflow(store, () => now);
  const stage = async (qid = 'q1') => {
    await service.save(employee, qid, randomUUID(), 0, snapshot);
    store.seed(`privateFiles/${qid}-pdf`, { ownerUid: employee.uid, quotationId: qid, revision: 0, scanStatus: 'CLEAN', reference: {
      object: `quotations/${qid}/r0/quotation.pdf`, generation: '1', sha256: 'a'.repeat(64), bytes: 1000, name: 'quotation.pdf', contentType: 'application/pdf' } });
    return { quotationId: qid, requestId: randomUUID(), expectedVersion: 1, approverUid: reviewer.uid, pdfId: `${qid}-pdf`, attachmentIds: [] };
  };
  return { store, service, stage, expire: () => { now += 73 * 3600000; } };
}
const decision = (submitted: RecordData) => ({ requestId: randomUUID(), expectedVersion: submitted.version,
  snapshotHash: submitted.snapshotHash, action: 'APPROVE', approvedDiscountPercent: '5', comment: '' });
const desktopSubmission = (qid = 'desktop-q1') => ({ quotationId: qid, requestId: randomUUID(),
  approverUid: reviewer.uid, snapshot });

test('PO decimal comparison preserves fractions beyond Number precision', () => {
  assert.equal(compareDecimal('999999999999.000000001', '999999999999.000000002'), -1);
  assert.equal(compareDecimal('10.0', '10'), 0);
});
test('oversized Firestore snapshot fails before any write', () => {
  const huge = structuredClone(snapshot);
  huge.items = Array.from({length:25}, (_, i) => ({ ...huge.items[0]!, item_no:String(i),
    supplier_options:Array.from({length:10}, (_, j) => ({...option,id:String(j),supplier:'S'.repeat(4000)})), selected_supplier_id:'0' }));
  assert.throws(()=>priceSnapshot(huge), /document size/);
});

test('50 concurrent submissions allocate distinct Q-Codes atomically with audit and outbox', async () => {
  const f = fixture(), inputs = await Promise.all(Array.from({ length: 50 }, (_, n) => f.stage(`q${n}`)));
  const results = await Promise.all(inputs.map(input => f.service.submit(employee, input)));
  assert.equal(new Set(results.map(r => r.qCode)).size, 50);
  assert.equal(f.store.rows.get('qCodeCounters/2026-TST')!.lastSequence, 50);
  assert.equal([...f.store.rows.keys()].filter(key => key.startsWith('notificationOutbox/')).length, 50);
  assert(f.store.retries > 0);
});
test('parallel duplicate submits produce one Q-Code, approval and notification', async () => {
  const f = fixture(), input = await f.stage();
  const results = await Promise.all(Array.from({ length: 20 }, () => f.service.submit(employee, input)));
  assert(results.every(r => r.approvalId === results[0]!.approvalId));
  assert.equal(f.store.rows.get('qCodeCounters/2026-TST')!.lastSequence, 1);
  await assert.rejects(f.service.submit(employee, { ...input, approverUid: employee.uid }), /Request ID/);
});
test('commit interruption loses no partial counter, snapshot or outbox; retry succeeds', async () => {
  const f = fixture(), input = await f.stage(); f.store.failNextCommit = true;
  await assert.rejects(f.service.submit(employee, input), /SIMULATED_INTERRUPTION/);
  assert.equal(f.store.rows.get('qCodeCounters/2026-TST')!.lastSequence, 0);
  assert.equal(f.store.rows.get('workflowQuotations/q1')!.status, 'DRAFT');
  const result = await f.service.submit(employee, input); assert.equal(result.qCode, '26QTST0001');
});
test('active role and verified identity required; disabled and unauthorized users denied', async () => {
  const f = fixture(), input = await f.stage();
  for (const actor of [{ ...employee, verified: false }, { ...employee, uid: 'stranger' }, reviewer])
    await assert.rejects(f.service.submit(actor, input));
  f.store.seed('users/employee', { email: employee.email, active: false, role: 'preparer' });
  await assert.rejects(f.service.submit(employee, input));
});
test('no self approval including admin unless explicit policy permits it, rechecked on decision', async () => {
  const f = fixture(), input = await f.stage();
  f.store.seed('users/employee', { email: employee.email, active: true, role: 'admin', employeeCode: 'TST' });
  input.approverUid = employee.uid;
  await assert.rejects(f.service.submit(employee, input), /Self-approval/);
  f.store.seed('workflowPolicy/approval', { allowSelfApproval: true, expiryHours: 72 });
  const submitted = await f.service.submit(employee, input);
  f.store.seed('workflowPolicy/approval', { allowSelfApproval: false, expiryHours: 72 });
  await assert.rejects(f.service.decide(employee, submitted.approvalId, decision(submitted)), /Self-approval/);
});
test('same decision retries once; changed payload and competing approval/reject conflict', async () => {
  const f = fixture(), submitted = await f.service.submit(employee, await f.stage()), input = decision(submitted);
  const results = await Promise.all(Array.from({ length: 20 }, () => f.service.decide(reviewer, submitted.approvalId, input)));
  assert(results.every(r => r.status === 'APPROVED'));
  await assert.rejects(f.service.decide(reviewer, submitted.approvalId, { ...input, approvedDiscountPercent: '10' }), /Request ID/);
  await assert.rejects(f.service.decide(reviewer, submitted.approvalId, { ...input, requestId: randomUUID(), action: 'REJECT', comment: 'Change' }));
  const count = [...f.store.rows.values()].filter(row => row.type === 'DECIDED').length;
  assert.equal(count, 1);
});
test('forwarded links and revoked reviewer role cannot approve or view', async () => {
  const f = fixture(), submitted = await f.service.submit(employee, await f.stage());
  await assert.rejects(f.service.decide(employee, submitted.approvalId, decision(submitted)));
  f.store.seed('users/reviewer', { email: reviewer.email, active: true, role: 'preparer' });
  await assert.rejects(f.service.decide(reviewer, submitted.approvalId, decision(submitted)));
  await assert.rejects(f.service.read(reviewer, 'q1'));
});
test('submitted snapshot is immutable; stale save, hash changes, and expiry rejected', async () => {
  const f = fixture(), submitted = await f.service.submit(employee, await f.stage());
  await assert.rejects(f.service.save(employee, 'q1', randomUUID(), 1, snapshot));
  await assert.rejects(f.service.save(employee, 'q1', randomUUID(), 2, snapshot), /immutable/);
  await assert.rejects(f.service.decide(reviewer, submitted.approvalId, { ...decision(submitted), snapshotHash: 'b'.repeat(64) }));
  f.expire(); await assert.rejects(f.service.decide(reviewer, submitted.approvalId, decision(submitted)), /expired/);
});
test('recall makes previous decision stale; revision retains Q-Code and archived snapshot', async () => {
  const f = fixture(), submitted = await f.service.submit(employee, await f.stage());
  await f.service.recall(employee, 'q1', randomUUID(), 2, 'Correct delivery');
  await assert.rejects(f.service.decide(reviewer, submitted.approvalId, decision(submitted)));
  const revision = await f.service.revise(employee, 'q1', randomUUID(), 3);
  assert.equal(revision.qCode, submitted.qCode); assert.equal(revision.revision, 1);
  assert.equal(f.store.rows.get(`workflowApprovals/${submitted.approvalId}`)!.snapshot.customer, snapshot.customer);
});
test('partial PO is distinct from internal approval and validates line quantities', async () => {
  const f = fixture(), submitted = await f.service.submit(employee, await f.stage());
  await assert.rejects(f.service.recordPO(employee, 'q1', randomUUID(), 2, 'PO1', { '1': '3' }));
  await f.service.decide(reviewer, submitted.approvalId, decision(submitted));
  for (const accepted of ([{ '1': '11' }, { unknown: '1' }, { '1': '-1' }, { '1': 'NaN' }] as Record<string,string>[]))
    await assert.rejects(f.service.recordPO(employee, 'q1', randomUUID(), 3, 'PO1', accepted));
  assert.equal((await f.service.recordPO(employee, 'q1', randomUUID(), 3, 'PO1', { '1': '3' })).status, 'PO_PARTIAL');
  await assert.rejects(f.service.recall(employee, 'q1', randomUUID(), 4, 'Cancel'));
  assert.equal((await f.service.recordPO(employee, 'q1', randomUUID(), 4, 'PO1', { '1': '10' })).status, 'PO_ACCEPTED');
});
test('files require clean owner/revision manifests; paths, types, size and generation checked', async () => {
  for (const alteration of [{ ownerUid: 'other' }, { revision: 8 }, { scanStatus: 'NOT_SCANNED' },
    { reference: { object: '../private.pdf' } }]) {
    const f = fixture(), input = await f.stage(), original = f.store.rows.get('privateFiles/q1-pdf')!;
    f.store.seed('privateFiles/q1-pdf', { ...original, ...alteration });
    await assert.rejects(f.service.submit(employee, input));
  }
});
test('financial projection reconciles discount and excludes all supplier data', () => {
  const priced = priceSnapshot(snapshot);
  assert.equal(priced.customer.totalCents, 112000);
  assert.equal(priced.customer.requestedDiscountCents, 5600);
  assert.equal(priced.customer.proposedFinalCents, 106400);
  assert.equal(priced.snapshot.items[0]!.supplier_options.length, 2);
  assert(!JSON.stringify(priced.customer).includes('PRIVATE'));
  assert(!JSON.stringify(priced.customer).includes('ALTERNATE'));
  assert.equal(discountCents(101, '50'), 51);
  for (const invalid of ['-1', '101', 'NaN', 'Infinity', 'wrong']) assert.throws(() => priceSnapshot({ ...snapshot, discount_requested_percent: invalid }));
});
test('failure of notification delivery does not alter committed quotation', async () => {
  const f = fixture(), submitted = await f.service.submit(employee, await f.stage());
  const key = `notificationOutbox/submitted-${submitted.approvalId}`;
  f.store.seed(key, { ...f.store.rows.get(key), status: 'RETRY', lastErrorCode: 'PROVIDER_UNAVAILABLE' });
  assert.equal((await f.service.read(employee, 'q1')).status, 'PENDING');
  assert.equal((await f.service.submit(employee, { quotationId: 'q1', requestId: [...f.store.rows.values()].find(row => row.type === 'SUBMITTED')!.correlationId,
    expectedVersion: 1, approverUid: reviewer.uid, pdfId: 'q1-pdf', attachmentIds: [] })).qCode, submitted.qCode);
});

test('desktop current-user identity and role come from server membership', async () => {
  const f = fixture();
  assert.deepEqual(await f.service.currentUser(employee), {
    uid: employee.uid, email: employee.email, role: 'preparer', active: true,
    employeeCode: 'TST', displayName: ''
  });
  await assert.rejects(f.service.currentUser({ ...employee, uid: 'unknown' }));
});

test('desktop submit creates immutable online approval without cloud PDF or delivery', async () => {
  const f = fixture(), input = desktopSubmission();
  const submitted = await f.service.submitDesktop(employee, input);
  assert.equal(submitted.status, 'PENDING');
  assert.equal(submitted.qCode, '26QTST0001');
  assert.equal(f.store.rows.get(`workflowApprovals/${submitted.approvalId}`)!.files.length, 0);
  assert.equal(f.store.rows.get(`desktopApprovalOutbox/submitted-${submitted.approvalId}`)!.deliveryState, 'DISABLED');
  assert.equal([...f.store.rows.keys()].filter(key => key.startsWith('notificationOutbox/')).length, 0);
  assert.equal((await f.service.read(employee, input.quotationId)).status, 'PENDING');
  assert.equal((await f.service.submitDesktop(employee, input)).qCode, submitted.qCode);
});

test('desktop approve and return persist distinct server states', async () => {
  const approvedFixture = fixture();
  const approved = await approvedFixture.service.submitDesktop(employee, desktopSubmission('desktop-approve'));
  const approvalResult = await approvedFixture.service.decide(reviewer, approved.approvalId, decision(approved));
  assert.equal(approvalResult.status, 'APPROVED');
  assert.equal((await approvedFixture.service.read(employee, 'desktop-approve')).status, 'APPROVED');

  const returnedFixture = fixture();
  const returned = await returnedFixture.service.submitDesktop(employee, desktopSubmission('desktop-return'));
  const returnResult = await returnedFixture.service.decide(reviewer, returned.approvalId, {
    ...decision(returned), action: 'REJECT', approvedDiscountPercent: '0', comment: 'Correct delivery'
  });
  assert.equal(returnResult.status, 'RETURNED');
  assert.equal((await returnedFixture.service.read(employee, 'desktop-return')).status, 'RETURNED');
});

test('desktop contract rejects client-supplied role and backend enforces authority', async () => {
  const f = fixture();
  await assert.rejects(f.service.submitDesktop(employee, { ...desktopSubmission(), role: 'admin' }));
  await assert.rejects(f.service.submitDesktop(reviewer, desktopSubmission('reviewer-cannot-submit')));
  const submitted = await f.service.submitDesktop(employee, desktopSubmission('employee-owned'));
  await assert.rejects(f.service.decide(employee, submitted.approvalId, decision(submitted)));
});
