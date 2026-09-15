import crypto from "node:crypto";
import express, { type Request } from "express";
import helmet from "helmet";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { config } from "./config.js";
import { firestoreDocumentName, type ClaimResult } from "./domain.js";
import { db } from "./firebase.js";
import { sendApprovalCreatedEmail, sendApprovalDecisionEmail } from "./gmail.js";
import { syncApprovalToSheet } from "./sheets.js";

const app = express();
app.disable("x-powered-by");
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "1mb" }));

const FIRESTORE_CREATED_EVENT = "google.cloud.firestore.document.v1.created";
const OUTBOX_LEASE_MS = 5 * 60 * 1000;
const SHEET_LOCK_LEASE_MS = 2 * 60 * 1000;

function eventDocumentName(req: Request): string {
  const subject = req.header("ce-subject") ?? "";
  const bodyName = req.body?.value?.name ?? req.body?.data?.value?.name ?? "";
  return firestoreDocumentName(subject, bodyName);
}

function assertExpectedEvent(req: Request): void {
  const type = req.header("ce-type") ?? "";
  if (type !== FIRESTORE_CREATED_EVENT) {
    throw new Error(`Unexpected CloudEvent type: ${type || "missing"}`);
  }
}

async function claim(eventId: string, owner: string): Promise<ClaimResult> {
  const ref = db.collection("outbox").doc(eventId);

  return db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists) return "MISSING";

    const data = snap.data()!;
    if (data.processedAt) return "PROCESSED";
    if (data.deliveryState === 'UNCERTAIN') return 'PROCESSED';

    const now = Date.now();
    const leaseUntil = data.leaseUntil instanceof Timestamp
      ? data.leaseUntil.toMillis()
      : 0;

    if (leaseUntil > now) return "LEASED";
    if (data.deliveryState === 'SENDING') {
      tx.update(ref, { deliveryState: 'UNCERTAIN', lastError: 'ACKNOWLEDGEMENT_UNKNOWN', leaseUntil: null });
      return 'PROCESSED'; // Manual reconciliation, not automatic resend.
    }

    tx.update(ref, {
      leaseOwner: owner,
      leaseUntil: Timestamp.fromMillis(now + OUTBOX_LEASE_MS),
      lastAttemptAt: FieldValue.serverTimestamp(),
      attempts: FieldValue.increment(1)
    });
    return "CLAIMED";
  });
}

async function acquireSheetLock(approvalId: string, owner: string): Promise<boolean> {
  const ref = db.collection("_systemLocks").doc(`sheet-${approvalId}`);

  return db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const current = snap.data();
    const leaseUntil = current?.leaseUntil instanceof Timestamp
      ? current.leaseUntil.toMillis()
      : 0;

    if (leaseUntil > Date.now() && current?.owner !== owner) return false;

    tx.set(ref, {
      owner,
      leaseUntil: Timestamp.fromMillis(Date.now() + SHEET_LOCK_LEASE_MS),
      updatedAt: FieldValue.serverTimestamp()
    });
    return true;
  });
}

async function releaseSheetLock(approvalId: string, owner: string): Promise<void> {
  const ref = db.collection("_systemLocks").doc(`sheet-${approvalId}`);

  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.data()?.owner !== owner) return;
    tx.delete(ref);
  });
}

async function syncSheetWithLock(approvalId: string, approval: FirebaseFirestore.DocumentData): Promise<void> {
  const owner = crypto.randomUUID();
  const acquired = await acquireSheetLock(approvalId, owner);
  if (!acquired) throw new Error(`Sheet synchronization is already in progress for approval ${approvalId}.`);

  try {
    await syncApprovalToSheet(approvalId, approval);
  } finally {
    try {
      await releaseSheetLock(approvalId, owner);
    } catch (error) {
      console.error(JSON.stringify({
        severity: "WARNING",
        message: "Could not release approval sheet lock",
        approvalId,
        error: "Operation failed; inspect approved diagnostics without credentials"
      }));
    }
  }
}

async function processOutbox(eventId: string): Promise<ClaimResult> {
  const owner = crypto.randomUUID();
  const claimResult = await claim(eventId, owner);
  if (claimResult !== "CLAIMED") return claimResult;

  const outboxRef = db.collection("outbox").doc(eventId);
  const fencedUpdate = async (updates: FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData>) => {
    await db.runTransaction(async tx => {
      const snap = await tx.get(outboxRef), current = snap.data();
      if (current?.leaseOwner !== owner || current?.deliveryState === 'UNCERTAIN' ||
        !(current?.leaseUntil instanceof Timestamp) || current.leaseUntil.toMillis() <= Date.now())
        throw new Error('OUTBOX_LEASE_LOST');
      tx.update(outboxRef, updates);
    });
  };

  try {
    let outbox = (await outboxRef.get()).data();
    if (!outbox) return "MISSING";

    const approvalRef = db.collection("approvals").doc(outbox.approvalId);
    const approvalSnap = await approvalRef.get();
    if (!approvalSnap.exists) throw new Error(`Approval ${outbox.approvalId} does not exist.`);
    const approval = approvalSnap.data()!;

    if (!outbox.emailSentAt && !outbox.emailSkippedReason) {
      if (outbox.eventType === "APPROVAL_CREATED" && approval.status !== "PENDING_REVIEW") {
        // If the approval was already finalized before the creation event was
        // delivered, do not send a stale "Approval Required" message.
        await outboxRef.update({
          emailSkippedReason: "APPROVAL_ALREADY_FINAL"
        });
      } else {
        // Durable marker before the provider call. A crash or unknown response
        // must never result in an automatic duplicate email.
        await fencedUpdate({ deliveryState: 'SENDING' });
        const emailResult = outbox.eventType === "APPROVAL_CREATED"
          ? await sendApprovalCreatedEmail(eventId, outbox.approvalId, approval)
          : outbox.eventType === "APPROVAL_DECIDED"
            ? await sendApprovalDecisionEmail(eventId, outbox.approvalId, approval)
            : (() => { throw new Error(`Unknown outbox event type: ${outbox.eventType}`); })();

        await fencedUpdate({
          emailSentAt: FieldValue.serverTimestamp(),
          emailMessageId: emailResult.providerMessageId,
          emailRfcMessageId: emailResult.rfcMessageId
          ,deliveryState: 'SENT'
        });
      }
    }

    outbox = (await outboxRef.get()).data()!;
    if (!outbox.sheetSyncedAt) {
      await syncSheetWithLock(outbox.approvalId, approval);
      await outboxRef.update({
        sheetSyncedAt: FieldValue.serverTimestamp()
      });
    }

    await outboxRef.update({
      processedAt: FieldValue.serverTimestamp(),
      leaseUntil: null,
      lastError: null
    });

    return "PROCESSED";
  } catch (error) {
    await db.runTransaction(async tx => {
    const failed = (await tx.get(outboxRef)).data();
    if (failed?.leaseOwner !== owner) return;
    tx.set(outboxRef, {
      ...(failed?.deliveryState === 'SENDING' ? { deliveryState: 'UNCERTAIN' } : {}),
      leaseUntil: null,
      lastError: "WORKER_OPERATION_FAILED",
      lastFailedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    });

    throw error;
  }
}

app.get("/health", (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({ ok: true, service: "macrotech-approval-worker", buildId: config.buildId });
});

app.post("/", async (req, res) => {
  try {
    assertExpectedEvent(req);
    const documentName = eventDocumentName(req);
    const match = documentName.match(/^outbox\/([^/]+)$/);
    if (!match?.[1]) {
      res.status(204).end();
      return;
    }

    const result = await processOutbox(match[1]);

    if (result === "LEASED") {
      // A previous invocation may still be running. Returning a non-2xx status
      // ensures Eventarc retries rather than acknowledging an event that could
      // otherwise become stranded after a hard process crash.
      res.set("Retry-After", "30");
      res.status(503).json({ ok: false, retry: true });
      return;
    }

    res.status(204).end();
  } catch (error) {
    console.error(JSON.stringify({
      severity: "ERROR",
      correlationId: crypto.randomUUID(),
      message: "Worker operation failed",
      errorCode: "WORKER_OPERATION_FAILED"
    }));
    // Eventarc retries standard deliveries when the destination returns non-2xx.
    res.status(500).json({ ok: false });
  }
});

const server = app.listen(config.port, "0.0.0.0", () => {
  console.log(JSON.stringify({
    severity: "INFO",
    message: "Macrotech approval worker started",
    port: config.port,
    buildId: config.buildId
  }));
});

function shutdown(signal: string): void {
  console.log(JSON.stringify({ severity: "INFO", message: "Shutting down Macrotech approval worker", signal }));
  server.close(error => {
    if (error) {
      console.error(JSON.stringify({ severity: "ERROR", message: "Worker shutdown failed", code: 'SHUTDOWN_FAILED' }));
      process.exitCode = 1;
    }
  });

  setTimeout(() => {
    console.error(JSON.stringify({ severity: "ERROR", message: "Worker shutdown timed out" }));
    process.exit(1);
  }, 10_000).unref();
}

process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));
