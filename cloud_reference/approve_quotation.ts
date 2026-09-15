/**
 * Reference-only first-writer-wins cloud approval transaction.
 * This file is not deployed or called by the v0.6.0 pilot.
 */
import {Firestore, FieldValue} from "@google-cloud/firestore";

export async function approveQuotation(
  db: Firestore,
  quotationId: string,
  approverUid: string,
  approverName: string,
  approvedDiscount: number,
) {
  const quotationRef = db.collection("quotations").doc(quotationId);
  return db.runTransaction(async transaction => {
    const snapshot = await transaction.get(quotationRef);
    if (!snapshot.exists) throw new Error("Quotation does not exist.");
    const quote = snapshot.data()!;

    // All later approvers receive this same authoritative state.
    if (quote.status !== "PENDING_INTERNAL_APPROVAL") return quote;
    const grandTotal = Number(quote.grandTotalBeforeDiscount || 0);
    if (approvedDiscount < 0 || approvedDiscount > grandTotal) {
      throw new Error("Discount must be between zero and the original Grand Total.");
    }

    const now = FieldValue.serverTimestamp();
    const update = {
      status: "INTERNALLY_APPROVED",
      approvedByUid: approverUid,
      approvedBy: approverName,
      approvedAt: now,
      discountAmount: approvedDiscount,
      finalTotal: grandTotal - approvedDiscount,
      updatedAt: now,
    };
    transaction.update(quotationRef, update);
    transaction.create(db.collection("auditEvents").doc(), {
      action: "QUOTATION_APPROVED",
      quotationId,
      actorUid: approverUid,
      approvedDiscount,
      createdAt: now,
    });
    return {...quote, ...update};
  });
}
