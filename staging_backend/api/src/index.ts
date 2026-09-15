import crypto from "node:crypto";
import express, { type NextFunction, type Request, type Response } from "express";
import helmet from "helmet";
import { FieldValue, Timestamp, type DocumentReference } from "firebase-admin/firestore";
import {
  actorDisplayName,
  actorEmail,
  requireAuth,
  requirePreparer,
  requireApprover,
  type AuthenticatedRequest
} from "./auth.js";
import { config } from "./config.js";
import {
  assertAssignedApprover,
  assertDecisionAllowed,
  isApprovalId,
  isStatus,
  nextStatus,
  safeRequestId
} from "./domain.js";
import { HttpError } from "./errors.js";
import { db, storage } from "./firebase.js";
import { formatQCode } from "./qcode.js";
import {
  createApprovalSchema,
  decisionSchema,
  pilotTrackerSubmissionSchema,
  quotationDraftPayloadSchema,
  quotationTrackerSubmissionSchema,
  saveQuotationDraftSchema,
  type PilotTrackerSubmission
} from "./schemas.js";
import {
  defaultQuotationDraftPayload,
  draftPayloadToTrackerSubmission,
  isNewerDraftRevision
} from "./draft-domain.js";
import { syncPilotTrackerRows } from "./tracker.js";
import { readinessRoutes } from './readiness-routes.js';
import { fingerprint } from './readiness-workflow.js';
import { assertMember, assertReviewPolicy } from './membership.js';

const app = express();
app.disable("x-powered-by");
app.use(helmet({ contentSecurityPolicy: false }));
app.use((req, res, next) => {
  const correlationId = safeRequestId(req.header('x-request-id') ?? undefined) ?? crypto.randomUUID();
  res.locals.correlationId = correlationId;
  res.set('X-Request-ID', correlationId);
  const started = performance.now();
  res.on('finish', () => console.info(JSON.stringify({ severity: 'INFO', message: 'Request completed',
    correlationId, method: req.method, route: req.route?.path ?? 'unmatched',
    status: res.statusCode, durationMs: Math.round(performance.now() - started) })));
  next();
});
app.use(express.json({ limit: "768kb" }));
app.use('/api/v2', readinessRoutes(db));

function requestId(req: Request): string {
  return req.res?.locals.correlationId ?? crypto.randomUUID();
}

function approvalId(): string {
  return crypto.randomBytes(32).toString("base64url");
}

function routeId(req: Request): string {
  const value = req.params["id"];
  if (typeof value !== "string" || !isApprovalId(value)) {
    // Deliberately return the same not-found response used for a missing record.
    throw new HttpError(404, "NOT_FOUND", "Approval not found.");
  }
  return value;
}

function iso(value: unknown): string | null {
  return value instanceof Timestamp ? value.toDate().toISOString() : null;
}

function safeDataCheckState(value: unknown): "NOT_RUN" | "PASSED" | "ATTENTION_REQUIRED" {
  if (value === "PASSED" || value === "ATTENTION_REQUIRED") return value;
  return "NOT_RUN";
}

function safeApproval(id: string, data: FirebaseFirestore.DocumentData) {
  if (!isStatus(data.status)) {
    throw new HttpError(409, "INVALID_APPROVAL_STATE", "This approval requires administrator review.");
  }

  return {
    id,
    snapshotHash: data.snapshotHash ?? '',
    qCode: data.qCode ?? "",
    sourceType: data.sourceType ?? "",
    sourceReference: data.sourceReference ?? "",
    rfqInquiry: data.rfqInquiry ?? "",
    revision: data.revision ?? "",
    customer: data.customer ?? "",
    commercial: {
      currency: data.commercial?.currency ?? "PHP",
      subtotal: typeof data.commercial?.subtotal === "number" ? data.commercial.subtotal : null,
      vatRatePercent: typeof data.commercial?.vatRatePercent === "number" ? data.commercial.vatRatePercent : null,
      vatAmount: typeof data.commercial?.vatAmount === "number" ? data.commercial.vatAmount : null,
      totalAmount: typeof data.commercial?.totalAmount === "number" ? data.commercial.totalAmount : null,
      discountPercent: typeof data.commercial?.discountPercent === "number" ? data.commercial.discountPercent : null,
      discountAmount: typeof data.commercial?.discountAmount === "number" ? data.commercial.discountAmount : null,
      totalAfterDiscount: typeof data.commercial?.totalAfterDiscount === "number" ? data.commercial.totalAfterDiscount : null,
      markupPercent: typeof data.commercial?.markupPercent === "number" ? data.commercial.markupPercent : null,
      dutiesAndTaxes: data.commercial?.dutiesAndTaxes ?? "",
      safetyFactor: data.commercial?.safetyFactor ?? "",
      delivery: data.commercial?.delivery ?? ""
    },
    dataChecks: {
      requiredFields: safeDataCheckState(data.dataChecks?.requiredFields),
      calculationsVat: safeDataCheckState(data.dataChecks?.calculationsVat),
      templateFidelity: safeDataCheckState(data.dataChecks?.templateFidelity),
      fileNaming: safeDataCheckState(data.dataChecks?.fileNaming),
      warnings: Array.isArray(data.dataChecks?.warnings)
        ? data.dataChecks.warnings
          .filter((value: unknown): value is string => typeof value === "string")
          .map((value: string) => value.replace(/[\u0000-\u001F\u007F]/g, " ").trim().slice(0, 300))
          .filter(Boolean)
          .slice(0, 20)
        : []
    },
    requesterName: data.requesterName ?? "",
    requesterEmail: data.requesterEmail ?? "",
    requesterComment: data.requesterComment ?? "",
    approverEmail: data.approverEmail ?? "",
    status: data.status,
    quotationAvailable: Boolean(data.quotationStorageObject),
    submittedAt: iso(data.submittedAt),
    reviewOpenedAt: iso(data.reviewOpenedAt),
    decisionAt: iso(data.decisionAt),
    decisionByEmail: data.decisionByEmail ?? null,
    decisionComment: data.decisionComment ?? ""
  };
}

function approvalRef(id: string): DocumentReference {
  return db.collection("approvals").doc(id);
}

async function loadApprovalOr404(id: string) {
  const ref = approvalRef(id);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpError(404, "NOT_FOUND", "Approval not found.");
  return { ref, snap, data: snap.data()! };
}

async function loadAuthorizedApproval(id: string, actor: string) {
  const loaded = await loadApprovalOr404(id);
  assertAssignedApprover(String(loaded.data.approverEmail ?? ""), actor);
  return loaded;
}

async function markFirstReview(
  id: string,
  actor: string,
  actorUid: string
): Promise<FirebaseFirestore.DocumentData> {
  const ref = approvalRef(id);
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpError(404, "NOT_FOUND", "Approval not found.");

    const current = snap.data()!;
    assertAssignedApprover(String(current.approverEmail ?? ""), actor);

    if (current.reviewOpenedAt) return;

    const now = FieldValue.serverTimestamp();
    tx.update(ref, {
      reviewOpenedAt: now,
      lastUpdated: now
    });

    // Deterministic audit ID ensures concurrent first-open transactions cannot
    // create duplicate "opened" audit records.
    tx.create(ref.collection("audit").doc("review-opened"), {
      type: "APPROVAL_REVIEW_OPENED",
      actorEmail: actor,
      actorUid,
      at: now
    });
  });

  const snap = await ref.get();
  if (!snap.exists) throw new HttpError(404, "NOT_FOUND", "Approval not found.");

  // Re-read to materialize the server timestamp after a first-open write.
  return snap.data()!;
}

app.get("/api/health", (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({ ok: true, service: "macrotech-approval-api", buildId: config.buildId });
});

function pilotTrackerFingerprint(value: PilotTrackerSubmission): string {
  const { requestId: _requestId, ...payload } = value;
  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function validCounter(value: unknown, fallback: number, minimum: number): number {
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isInteger(value) || value < minimum) {
    throw new HttpError(409, "INVALID_PILOT_COUNTER", "The pilot counter requires administrator review.");
  }
  return value;
}

type PilotTrackerSyncResult = {
  created: boolean;
  qCode: string;
  startRow: number;
  endRow: number;
  status: "SYNCED";
};

async function reserveAndSyncPilotTrackerEntry(
  input: PilotTrackerSubmission,
  req: AuthenticatedRequest
): Promise<PilotTrackerSyncResult> {
  if (!config.pilotTrackerEnabled || !config.pilotTrackerSheetId) {
    throw new HttpError(503, "PILOT_TRACKER_DISABLED", "The automated Tracker pilot is not enabled in this test environment.");
  }

  if (input.employeeCode !== config.pilotTrackerEmployeeCode) {
    throw new HttpError(
      400,
      "PILOT_EMPLOYEE_CODE_REQUIRED",
      `This isolated pilot currently uses employee code ${config.pilotTrackerEmployeeCode}.`
    );
  }

  const actor = actorEmail(req);
  const fingerprint = pilotTrackerFingerprint(input);
  const entryRef = db.collection("pilotTrackerEntries").doc(input.requestId);
  const year = new Date().getUTCFullYear();
  const qCounterRef = db.collection("_systemCounters").doc(`qcode-${year}-${input.employeeCode}`);
  const trackerKey = crypto.createHash("sha256").update(config.pilotTrackerSheetId).digest("hex").slice(0, 24);
  const rowCounterRef = db.collection("_systemCounters").doc(`pilot-tracker-${trackerKey}`);
  const now = FieldValue.serverTimestamp();

  const reservation = await db.runTransaction(async tx => {
    const existing = await tx.get(entryRef);
    if (existing.exists) {
      const data = existing.data()!;
      if (data.requesterUid !== req.actor!.uid || data.payloadFingerprint !== fingerprint) {
        throw new HttpError(
          409,
          "IDEMPOTENCY_CONFLICT",
          "This Tracker request identifier was already used for a different submission."
        );
      }
      return {
        created: false,
        qCode: String(data.qCode),
        startRow: Number(data.startRow),
        endRow: Number(data.endRow),
        syncStatus: String(data.syncStatus)
      };
    }

    const qCounter = await tx.get(qCounterRef);
    const rowCounter = await tx.get(rowCounterRef);
    const lastSequence = validCounter(qCounter.data()?.lastSequence, 0, 0);
    const sequence = lastSequence + 1;
    if (sequence > 9999) {
      throw new HttpError(409, "QCODE_SEQUENCE_EXHAUSTED", "The employee Q-Code sequence is full for this year.");
    }

    const startRow = validCounter(
      rowCounter.data()?.nextRow,
      config.pilotTrackerFirstWriteRow,
      config.pilotTrackerFirstWriteRow
    );
    const endRow = startRow + input.items.length - 1;
    const qCode = formatQCode({ year, employeeCode: input.employeeCode, sequence });

    tx.set(qCounterRef, {
      year,
      employeeCode: input.employeeCode,
      lastSequence: sequence,
      updatedAt: now
    });
    tx.set(rowCounterRef, {
      sheetId: config.pilotTrackerSheetId,
      sheetName: config.pilotTrackerSheetName,
      nextRow: endRow + 1,
      updatedAt: now
    });
    tx.create(entryRef, {
      requestId: input.requestId,
      payloadFingerprint: fingerprint,
      requesterUid: req.actor!.uid,
      requesterEmail: actor,
      requesterName: actorDisplayName(req),
      qCode,
      year,
      sequence,
      startRow,
      endRow,
      itemCount: input.items.length,
      payload: input,
      syncStatus: "PENDING",
      createdAt: now,
      lastUpdated: now,
      schemaVersion: 1
    });

    return { created: true, qCode, startRow, endRow, syncStatus: "PENDING" };
  });

  if (reservation.syncStatus !== "SYNCED") {
    try {
      await syncPilotTrackerRows({
        input,
        qCode: reservation.qCode,
        startRow: reservation.startRow,
        offeredOn: new Date()
      });
      await entryRef.update({
        syncStatus: "SYNCED",
        syncedAt: FieldValue.serverTimestamp(),
        syncError: null,
        lastUpdated: FieldValue.serverTimestamp()
      });
    } catch (error) {
      await entryRef.update({
        syncStatus: "FAILED",
        syncError: 'TRACKER_SYNC_FAILED',
        lastUpdated: FieldValue.serverTimestamp()
      });
      throw new HttpError(
        502,
        "PILOT_TRACKER_SYNC_FAILED",
        "The pilot entry was safely reserved, but the Dummy Tracker could not be updated. Retry the same submission."
      );
    }
  }

  return {
    created: reservation.created,
    qCode: reservation.qCode,
    startRow: reservation.startRow,
    endRow: reservation.endRow,
    status: "SYNCED"
  };
}

app.post(
  "/api/v1/pilot-tracker/entries",
  requireAuth,
  requirePreparer,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const parsed = pilotTrackerSubmissionSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new HttpError(400, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid Tracker entry.");
      }

      const result = await reserveAndSyncPilotTrackerEntry(parsed.data, req);
      res.status(result.created ? 201 : 200).set("Cache-Control", "no-store").json({
        requestId: parsed.data.requestId,
        qCode: result.qCode,
        itemCount: parsed.data.items.length,
        sheetName: config.pilotTrackerSheetName,
        rowRange: `A${result.startRow}:AZ${result.endRow}`,
        status: result.status
      });
    } catch (error) {
      next(error);
    }
  }
);

function quotationDraftId(req: Request): string {
  const value = req.params["id"];
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new HttpError(404, "NOT_FOUND", "Quotation draft not found.");
  }
  return value;
}

function safeDraft(id: string, data: FirebaseFirestore.DocumentData) {
  const parsedPayload = quotationDraftPayloadSchema.safeParse(data.payload);
  return {
    id,
    status: data.status === "GENERATED" ? "GENERATED" : "DRAFT",
    payload: parsedPayload.success
      ? parsedPayload.data
      : defaultQuotationDraftPayload(config.pilotTrackerEmployeeCode),
    qCode: typeof data.qCode === "string" ? data.qCode : null,
    trackerSheetName: typeof data.trackerSheetName === "string" ? data.trackerSheetName : null,
    trackerRowRange: typeof data.trackerRowRange === "string" ? data.trackerRowRange : null,
    clientRevision: typeof data.clientRevision === "number" ? data.clientRevision : 0,
    createdAt: iso(data.createdAt),
    updatedAt: iso(data.updatedAt),
    generatedAt: iso(data.generatedAt)
  };
}

async function loadOwnedDraftOr404(id: string, req: AuthenticatedRequest) {
  const ref = db.collection("quotationDrafts").doc(id);
  const snap = await ref.get();
  if (!snap.exists || snap.data()?.ownerUid !== req.actor!.uid || snap.data()?.status === 'DELETED') {
    throw new HttpError(404, "NOT_FOUND", "Quotation draft not found.");
  }
  return { ref, snap, data: snap.data()! };
}

app.get(
  "/api/v1/quotation-drafts",
  requireAuth,
  requirePreparer,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const snapshot = await db.collection("quotationDrafts")
        .where("ownerUid", "==", req.actor!.uid)
        .limit(100)
        .get();
      const drafts = snapshot.docs
        .filter(doc => doc.data().status !== "DELETED").map(doc => safeDraft(doc.id, doc.data()))
        .sort((a, b) => String(b.updatedAt ?? b.createdAt ?? "").localeCompare(String(a.updatedAt ?? a.createdAt ?? "")));
      res.set("Cache-Control", "no-store").json({ drafts });
    } catch (error) {
      next(error);
    }
  }
);

app.post(
  "/api/v1/quotation-drafts",
  requireAuth,
  requirePreparer,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const id = crypto.randomUUID();
      const now = FieldValue.serverTimestamp();
      const ref = db.collection("quotationDrafts").doc(id);
      await ref.create({
        ownerUid: req.actor!.uid,
        ownerEmail: actorEmail(req),
        ownerName: actorDisplayName(req),
        status: "DRAFT",
        payload: defaultQuotationDraftPayload(config.pilotTrackerEmployeeCode),
        qCode: null,
        trackerSheetName: null,
        trackerRowRange: null,
        clientRevision: 0,
        createdAt: now,
        updatedAt: now,
        generatedAt: null,
        schemaVersion: 2
      });
      const snap = await ref.get();
      res.status(201).set("Cache-Control", "no-store").json(safeDraft(id, snap.data()!));
    } catch (error) {
      next(error);
    }
  }
);

app.get(
  "/api/v1/quotation-drafts/:id",
  requireAuth,
  requirePreparer,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const id = quotationDraftId(req);
      const loaded = await loadOwnedDraftOr404(id, req);
      res.set("Cache-Control", "no-store").json(safeDraft(id, loaded.data));
    } catch (error) {
      next(error);
    }
  }
);

app.put(
  "/api/v1/quotation-drafts/:id",
  requireAuth,
  requirePreparer,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const id = quotationDraftId(req);
      const parsed = saveQuotationDraftSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new HttpError(400, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid quotation draft.");
      }
      if (parsed.data.payload.employeeCode !== config.pilotTrackerEmployeeCode) {
        throw new HttpError(400, "PILOT_EMPLOYEE_CODE_REQUIRED", `This isolated pilot currently uses employee code ${config.pilotTrackerEmployeeCode}.`);
      }

      const ref = db.collection("quotationDrafts").doc(id);
      await db.runTransaction(async tx => {
        const snap = await tx.get(ref);
        if (!snap.exists || snap.data()?.ownerUid !== req.actor!.uid) {
          throw new HttpError(404, "NOT_FOUND", "Quotation draft not found.");
        }
        const current = snap.data()!;
        if (current.status !== "DRAFT" || current.generationState === "GENERATING") {
          throw new HttpError(409, "DRAFT_LOCKED", "This quotation is being generated or has already been generated and is locked from draft edits.");
        }
        const currentRevision = typeof current.clientRevision === "number" ? current.clientRevision : 0;
        if (currentRevision === parsed.data.clientRevision && fingerprint(current.payload) === fingerprint(parsed.data.payload)) return;
        if (parsed.data.clientRevision !== currentRevision + 1) throw new HttpError(409, 'VERSION_CONFLICT', 'A concurrent edit exists. Reload the saved draft before editing.');
        tx.update(ref, {
          payload: parsed.data.payload,
          clientRevision: parsed.data.clientRevision,
          updatedAt: FieldValue.serverTimestamp()
        });
      });
      const snap = await ref.get();
      if (!snap.exists) throw new HttpError(404, "NOT_FOUND", "Quotation draft not found.");
      res.set("Cache-Control", "no-store").json(safeDraft(id, snap.data()!));
    } catch (error) {
      next(error);
    }
  }
);

app.delete(
  "/api/v1/quotation-drafts/:id",
  requireAuth,
  requirePreparer,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const id = quotationDraftId(req);
      const ref = db.collection('quotationDrafts').doc(id);
      await db.runTransaction(async tx => {
        const snap = await tx.get(ref), data = snap.data();
        if (!data || data.ownerUid !== req.actor!.uid) throw new HttpError(404, 'NOT_FOUND', 'Quotation draft not found.');
        if (data.status !== 'DRAFT' || data.qCode || data.generationState === 'GENERATING')
          throw new HttpError(409, 'DRAFT_LOCKED', 'Only an unassigned, unsubmitted draft may be deleted.');
        // Recoverable tombstone retains history; no document deletion.
        tx.update(ref, { status: 'DELETED', deletedAt: FieldValue.serverTimestamp() });
      });
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  }
);

app.post(
  "/api/v1/quotation-drafts/:id/generate",
  requireAuth,
  requirePreparer,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const id = quotationDraftId(req);
      const loaded = await loadOwnedDraftOr404(id, req);
      if (loaded.data.status === "GENERATED") {
        res.set("Cache-Control", "no-store").json(safeDraft(id, loaded.data));
        return;
      }

      const generation = await db.runTransaction(async tx => {
        const snap = await tx.get(loaded.ref);
        if (!snap.exists || snap.data()?.ownerUid !== req.actor!.uid) {
          throw new HttpError(404, "NOT_FOUND", "Quotation draft not found.");
        }
        const current = snap.data()!;
        if (current.status === "GENERATED") {
          return { alreadyGenerated: true as const, finalPayload: null };
        }
        if (current.status !== 'DRAFT' || current.generationState === 'GENERATING') {
          throw new HttpError(409, 'DRAFT_LOCKED', 'Only an eligible idle draft can be generated.');
        }
        const draftPayload = quotationDraftPayloadSchema.safeParse(current.payload);
        if (!draftPayload.success) {
          throw new HttpError(409, "INVALID_DRAFT_STATE", "This draft requires administrator review before generation.");
        }
        const finalPayload = quotationTrackerSubmissionSchema.safeParse(draftPayloadToTrackerSubmission(id, draftPayload.data));
        if (!finalPayload.success) {
          throw new HttpError(400, "VALIDATION_ERROR", finalPayload.error.issues[0]?.message ?? "Complete the required quotation fields before generating.");
        }
        tx.update(loaded.ref, {
          generationState: "GENERATING",
          updatedAt: FieldValue.serverTimestamp()
        });
        return { alreadyGenerated: false as const, finalPayload: finalPayload.data };
      });

      if (generation.alreadyGenerated) {
        const current = await loaded.ref.get();
        res.set("Cache-Control", "no-store").json(safeDraft(id, current.data()!));
        return;
      }

      try {
        const tracker = await reserveAndSyncPilotTrackerEntry(generation.finalPayload, req);
        const trackerRowRange = `A${tracker.startRow}:AZ${tracker.endRow}`;
        await loaded.ref.update({
          status: "GENERATED",
          generationState: null,
          qCode: tracker.qCode,
          trackerSheetName: config.pilotTrackerSheetName,
          trackerRowRange,
          generatedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp()
        });
      } catch (error) {
        await loaded.ref.update({
          generationState: null,
          updatedAt: FieldValue.serverTimestamp()
        }).catch(() => undefined);
        throw error;
      }

      const updated = await loaded.ref.get();
      res.set("Cache-Control", "no-store").json(safeDraft(id, updated.data()!));
    } catch (error) {
      next(error);
    }
  }
);

app.post(
  "/api/v1/approvals",
  requireAuth,
  requirePreparer,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const parsed = createApprovalSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new HttpError(400, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid request.");
      }

      const actor = actorEmail(req);
      const submissionId = req.header('x-idempotency-key') ?? '';
      if (!/^[0-9a-f-]{36}$/i.test(submissionId)) throw new HttpError(400, 'IDEMPOTENCY_REQUIRED', 'Use a stable submission request ID.');
      const id = fingerprint([req.actor!.uid, submissionId]);
      const now = FieldValue.serverTimestamp();
      const ref = approvalRef(id);
      const auditRef = ref.collection("audit").doc(crypto.randomUUID());
      const outboxRef = db.collection("outbox").doc(`created-${id}`);
      const verifiedName = actorDisplayName(req);

      const data = {
        ...parsed.data,
        requesterName: verifiedName || parsed.data.requesterName || actor,
        requesterEmail: actor,
        requesterUid: req.actor!.uid,
        status: "PENDING_REVIEW",
        submittedAt: now,
        reviewOpenedAt: null,
        decisionAt: null,
        decisionAction: null,
        decisionByEmail: null,
        decisionByUid: null,
        decisionComment: "",
        decisionRequestId: null,
        createdAt: now,
        lastUpdated: now,
        schemaVersion: 5
      };

      const creationHash = fingerprint(parsed.data);
      const submissionRef = db.collection('approvalSubmissionRequests').doc(id);
      const logicalRef = db.collection('approvalRevisionKeys').doc(fingerprint([req.actor!.uid, parsed.data.qCode || parsed.data.sourceReference || parsed.data.rfqInquiry, parsed.data.revision]));
      let pdfGeneration: string | null = null;
      if (parsed.data.quotationStorageObject) {
        const [metadata] = await storage.bucket(config.quotationBucket).file(parsed.data.quotationStorageObject).getMetadata();
        if (metadata.metadata?.ownerUid !== req.actor!.uid || metadata.metadata?.scanStatus !== 'CLEAN' || metadata.contentType !== 'application/pdf')
          throw new HttpError(409, 'FILE_NOT_READY', 'PDF requires verified private ownership and clean scan status.');
        pdfGeneration = String(metadata.generation);
      }
      await db.runTransaction(async batch => {
      const [receipt, logical, policy, activeUser] = await Promise.all([
        batch.get(submissionRef), batch.get(logicalRef), batch.get(db.doc('workflowPolicy/approval')), batch.get(db.doc(`users/${req.actor!.uid}`))
      ]);
      assertMember(activeUser.data(), actor, ['preparer', 'admin']);
      if (receipt.exists) {
        if (receipt.data()?.creationHash !== creationHash) throw new HttpError(409, 'IDEMPOTENCY_CONFLICT', 'Submission request ID was reused with different content.');
        return;
      }
      if (logical.exists) throw new HttpError(409, 'REVISION_EXISTS', 'This quotation revision was already submitted. Open the existing record.');
      const approvers = await batch.get(db.collection('users').where('email', '==', parsed.data.approverEmail).limit(2));
      if (approvers.size !== 1) throw new HttpError(403, 'INVALID_APPROVER', 'Select a uniquely provisioned active approver.');
      assertMember(approvers.docs[0]!.data(), parsed.data.approverEmail, ['approver', 'admin']);
      const expiryHours = policy.data()?.expiryHours;
      if (!Number.isInteger(expiryHours) || expiryHours < 1 || expiryHours > 720) throw new HttpError(409, 'POLICY_REQUIRED', 'An administrator must approve the staging expiry policy.');
      assertReviewPolicy(req.actor!.uid, parsed.data.approverEmail === actor ? req.actor!.uid : 'other', policy.data()?.allowSelfApproval);
      const immutable = { ...parsed.data, quotationGeneration: pdfGeneration };
      Object.assign(data, { snapshotHash: fingerprint(immutable), immutableSnapshot: immutable,
        quotationGeneration: pdfGeneration, expiresAt: Timestamp.fromMillis(Date.now() + expiryHours * 3600000) });
      batch.create(submissionRef, { creationHash, approvalId: id });
      batch.create(logicalRef, { approvalId: id });
      batch.create(ref, data);
      batch.create(auditRef, {
        type: "APPROVAL_CREATED",
        actorEmail: actor,
        actorUid: req.actor!.uid,
        at: now
      });
      batch.create(outboxRef, {
        eventType: "APPROVAL_CREATED",
        approvalId: id,
        createdAt: now,
        emailSentAt: null,
        emailMessageId: null,
        emailSkippedReason: null,
        sheetSyncedAt: null,
        processedAt: null,
        leaseUntil: null,
        attempts: 0
      });
      });

      res.status(201).json({
        id,
        status: "PENDING_REVIEW",
        approvalUrl: `${config.publicAppUrl}/a/${id}`
      });
    } catch (error) {
      next(error);
    }
  }
);

app.get(
  "/api/v1/approvals/:id",
  requireAuth,
  requireApprover,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const id = routeId(req);
      const actor = actorEmail(req);
      const data = await markFirstReview(id, actor, req.actor!.uid);

      res.set({
        "Cache-Control": "no-store, max-age=0",
        Pragma: "no-cache"
      });
      res.json(safeApproval(id, data));
    } catch (error) {
      next(error);
    }
  }
);

app.get(
  "/api/v1/approvals/:id/quotation",
  requireAuth,
  requireApprover,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const id = routeId(req);
      const actor = actorEmail(req);
      const { data } = await loadAuthorizedApproval(id, actor);

      const objectName = String(data.quotationStorageObject ?? "").trim();
      if (!objectName) {
        throw new HttpError(404, "QUOTATION_NOT_ATTACHED", "The quotation PDF has not been attached yet.");
      }

      if (!data.quotationGeneration) throw new HttpError(409, 'FILE_REVIEW_REQUIRED', 'Legacy PDF requires a verified immutable generation.');
      const file = storage.bucket(config.quotationBucket).file(objectName, { generation: data.quotationGeneration });
      let metadata;
      try {
        [metadata] = await file.getMetadata();
      } catch (error) {
        const code = typeof error === "object" && error !== null && "code" in error
          ? Number((error as { code?: unknown }).code)
          : 0;
        if (code === 404) {
          throw new HttpError(404, "QUOTATION_NOT_FOUND", "The quotation PDF is unavailable.");
        }
        throw error;
      }

      const contentType = String(metadata.contentType ?? "").toLowerCase();
      if (contentType && contentType !== "application/pdf") {
        throw new HttpError(409, "INVALID_QUOTATION_FILE", "The attached quotation is not a valid PDF document.");
      }

      const filename = `${String(data.qCode || "quotation").replace(/[^A-Za-z0-9_-]/g, "_")}.pdf`;
      res.set({
        "Cache-Control": "private, no-store, max-age=0",
        Pragma: "no-cache",
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`
      });

      const stream = file.createReadStream();
      stream.on("error", error => {
        if (!res.headersSent) {
          next(error);
          return;
        }
        res.destroy(error instanceof Error ? error : new Error(String(error)));
      });
      stream.pipe(res);
    } catch (error) {
      next(error);
    }
  }
);

app.post(
  "/api/v1/approvals/:id/decision",
  requireAuth,
  requireApprover,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const parsed = decisionSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new HttpError(400, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid decision.");
      }

      const actor = actorEmail(req);
      const id = routeId(req);
      const ref = approvalRef(id);
      const auditRef = ref.collection("audit").doc(parsed.data.requestId);
      const outboxRef = db.collection("outbox").doc(`decided-${id}-${parsed.data.requestId}`);

      const result = await db.runTransaction(async tx => {
        const snap = await tx.get(ref);
        if (!snap.exists) throw new HttpError(404, "NOT_FOUND", "Approval not found.");

        const current = snap.data()!;
        assertAssignedApprover(String(current.approverEmail ?? ""), actor);

        const [user, policy] = await Promise.all([tx.get(db.doc(`users/${req.actor!.uid}`)), tx.get(db.doc('workflowPolicy/approval'))]);
        assertMember(user.data(), actor, ['approver', 'admin']);
        assertReviewPolicy(String(current.requesterUid), req.actor!.uid, policy.data()?.allowSelfApproval);
        if (!current.snapshotHash || parsed.data.expectedSnapshotHash !== current.snapshotHash)
          throw new HttpError(409, 'STALE_REVISION', 'Refresh the immutable review. Legacy approvals require migration review.');
        if (fingerprint(current.immutableSnapshot) !== current.snapshotHash)
          throw new HttpError(409, 'SNAPSHOT_CHANGED', 'Submitted snapshot integrity check failed.');

        const allowed = assertDecisionAllowed(
          {
            status: current.status,
            approverEmail: current.approverEmail,
            decisionRequestId: current.decisionRequestId,
            decisionComment: current.decisionComment
          },
          parsed.data.requestId,
          parsed.data.action,
          parsed.data.comment
        );

        if (allowed === "IDEMPOTENT") {
          return { status: current.status as string };
        }

        if (!(current.expiresAt instanceof Timestamp) || current.expiresAt.toMillis() <= Date.now())
          throw new HttpError(409, 'APPROVAL_EXPIRED', 'This approval expired or requires lifecycle review.');

        const status = nextStatus(parsed.data.action);
        const now = FieldValue.serverTimestamp();

        tx.update(ref, {
          status,
          decisionAt: now,
          decisionAction: parsed.data.action,
          decisionByEmail: actor,
          decisionByUid: req.actor!.uid,
          decisionComment: parsed.data.comment,
          decisionRequestId: parsed.data.requestId,
          lastUpdated: now
        });

        tx.create(auditRef, {
          type: "APPROVAL_DECIDED",
          action: parsed.data.action,
          status,
          actorEmail: actor,
          actorUid: req.actor!.uid,
          comment: parsed.data.comment,
          at: now
        });

        tx.create(outboxRef, {
          eventType: "APPROVAL_DECIDED",
          approvalId: id,
          createdAt: now,
          emailSentAt: null,
          emailMessageId: null,
          emailSkippedReason: null,
          sheetSyncedAt: null,
          processedAt: null,
          leaseUntil: null,
          attempts: 0
        });

        return { status };
      });

      res.set("Cache-Control", "no-store");
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

app.use((req, _res, next) => {
  next(new HttpError(404, "ROUTE_NOT_FOUND", "The requested API endpoint does not exist."));
});

app.use((error: unknown, req: Request, res: Response, _next: NextFunction) => {
  const id = requestId(req);
  res.set({
    "X-Request-Id": id,
    "Cache-Control": "no-store"
  });

  const httpError = error instanceof HttpError
    ? error
    : new HttpError(500, "INTERNAL_ERROR", "The request could not be completed.");

  if (httpError.status >= 500) {
    console.error(JSON.stringify({
      severity: "ERROR",
      requestId: id,
      method: req.method,
      route: req.route?.path ?? "unmatched",
      message: "API operation failed",
      errorCode: httpError.code
    }));
  }

  res.status(httpError.status).json({
    error: {
      code: httpError.code,
      message: httpError.message,
      requestId: id
    }
  });
});

const server = app.listen(config.port, "0.0.0.0", () => {
  console.log(JSON.stringify({
    severity: "INFO",
    message: "Macrotech approval API started",
    port: config.port,
    buildId: config.buildId
  }));
});

function shutdown(signal: string): void {
  console.log(JSON.stringify({ severity: "INFO", message: "Shutting down Macrotech approval API", signal }));
  server.close(error => {
    if (error) {
      console.error(JSON.stringify({ severity: "ERROR", message: "API shutdown failed", code: 'SHUTDOWN_FAILED' }));
      process.exitCode = 1;
    }
  });

  setTimeout(() => {
    console.error(JSON.stringify({ severity: "ERROR", message: "API shutdown timed out" }));
    process.exit(1);
  }, 10_000).unref();
}

process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));
