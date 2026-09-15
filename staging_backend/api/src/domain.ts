import { HttpError } from "./errors.js";

export type Status = "PENDING_REVIEW" | "APPROVED" | "RETURNED_FOR_CORRECTION";
export type DecisionAction = "APPROVE" | "RETURN";

export interface ApprovalDecisionState {
  status: Status;
  approverEmail: string;
  decisionRequestId?: string | null;
  decisionComment?: string | null;
}

export function normalizedEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function assertAssignedApprover(assigned: string, actor: string): void {
  if (normalizedEmail(assigned) !== normalizedEmail(actor)) {
    // Do not disclose the assigned address to a different signed-in user.
    throw new HttpError(
      403,
      "WRONG_APPROVER",
      "This approval is assigned to a different Google account. Switch accounts to continue."
    );
  }
}

export function nextStatus(action: DecisionAction): Status {
  return action === "APPROVE" ? "APPROVED" : "RETURNED_FOR_CORRECTION";
}

export function isStatus(value: unknown): value is Status {
  return value === "PENDING_REVIEW" || value === "APPROVED" || value === "RETURNED_FOR_CORRECTION";
}

export function normalizedComment(value: string | null | undefined): string {
  return (value ?? "").trim();
}

export function assertDecisionAllowed(
  state: ApprovalDecisionState,
  requestId: string,
  action: DecisionAction,
  comment: string
): "NEW" | "IDEMPOTENT" {
  if (!isStatus(state.status)) {
    throw new HttpError(409, "INVALID_APPROVAL_STATE", "This approval is in an invalid state and requires administrator review.");
  }

  if (state.status === "PENDING_REVIEW") return "NEW";

  if (state.decisionRequestId === requestId) {
    const sameStatus = state.status === nextStatus(action);
    const sameComment = normalizedComment(state.decisionComment) === normalizedComment(comment);

    if (sameStatus && sameComment) return "IDEMPOTENT";

    throw new HttpError(
      409,
      "IDEMPOTENCY_CONFLICT",
      "This request identifier was already used for a different decision. Refresh the approval before trying again."
    );
  }

  throw new HttpError(
    409,
    "FINAL_DECISION_EXISTS",
    `This quotation already has a final decision: ${state.status}.`
  );
}

export function isApprovalId(value: string): boolean {
  return /^[A-Za-z0-9_-]{20,80}$/.test(value);
}

export function safeRequestId(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return /^[A-Za-z0-9._:-]{1,100}$/.test(trimmed) ? trimmed : null;
}
