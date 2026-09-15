/**
 * Reference-only Firestore transaction for the future production Q-Code allocator.
 * This file is not deployed or called by the v0.6.0 pilot.
 *
 * The official prefix/padding must be confirmed by Macrotech before activation.
 */
import {Firestore, FieldValue} from "@google-cloud/firestore";

export async function allocateOfficialQCode(
  db: Firestore,
  quotationId: string,
  year: number,
  prefix = `${String(year).slice(-2)}Q`,
): Promise<string> {
  const quotationRef = db.collection("quotations").doc(quotationId);
  const counterRef = db.collection("systemCounters").doc(`qCode-${year}`);

  return db.runTransaction(async transaction => {
    const quotation = await transaction.get(quotationRef);
    if (!quotation.exists) throw new Error("Quotation does not exist.");

    // Idempotency: retries and double-clicks retain the first assigned code.
    const existing = quotation.get("qCode");
    if (typeof existing === "string" && existing.trim()) return existing;

    const counter = await transaction.get(counterRef);
    const next = Number(counter.get("lastSequence") || 0) + 1;
    const qCode = `${prefix}${String(next).padStart(3, "0")}`;
    const now = FieldValue.serverTimestamp();

    transaction.set(counterRef, {lastSequence: next, updatedAt: now}, {merge: true});
    transaction.update(quotationRef, {qCode, qCodeAssignedAt: now});
    transaction.create(db.collection("auditEvents").doc(), {
      action: "Q_CODE_ASSIGNED",
      quotationId,
      qCode,
      createdAt: now,
    });
    return qCode;
  });
}
