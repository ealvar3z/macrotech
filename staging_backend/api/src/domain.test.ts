import assert from "node:assert/strict";
import test from "node:test";
import {
  assertAssignedApprover,
  assertDecisionAllowed,
  isApprovalId,
  isStatus,
  nextStatus,
  normalizedComment,
  normalizedEmail,
  safeRequestId
} from "./domain.js";

const pending = { status: "PENDING_REVIEW" as const, approverEmail: "a@example.com" };

test("email normalization trims and lowercases", () => {
  assert.equal(normalizedEmail("  Approver@Example.COM  "), "approver@example.com");
});

test("assigned approver comparison is case-insensitive", () => {
  assert.doesNotThrow(() => assertAssignedApprover("Approver@Example.com", "approver@example.com"));
});

test("wrong approver is rejected without disclosing assigned email", () => {
  assert.throws(
    () => assertAssignedApprover("assigned@example.com", "other@example.com"),
    (error: any) => error?.code === "WRONG_APPROVER" && !String(error?.message).includes("assigned@example.com")
  );
});

test("pending approval accepts a new approval decision", () => {
  assert.equal(assertDecisionAllowed(pending, "r1", "APPROVE", ""), "NEW");
});

test("pending approval accepts a return decision", () => {
  assert.equal(assertDecisionAllowed(pending, "r1", "RETURN", "Fix price"), "NEW");
});

test("same request id is idempotent after an identical approval", () => {
  assert.equal(
    assertDecisionAllowed(
      { status: "APPROVED", approverEmail: "a@example.com", decisionRequestId: "r1", decisionComment: "ok" },
      "r1",
      "APPROVE",
      " ok "
    ),
    "IDEMPOTENT"
  );
});

test("same request id with a different action is rejected as an idempotency conflict", () => {
  assert.throws(
    () => assertDecisionAllowed(
      { status: "APPROVED", approverEmail: "a@example.com", decisionRequestId: "r1", decisionComment: "" },
      "r1",
      "RETURN",
      "Fix"
    ),
    (error: any) => error?.code === "IDEMPOTENCY_CONFLICT"
  );
});

test("same request id with a different comment is rejected as an idempotency conflict", () => {
  assert.throws(
    () => assertDecisionAllowed(
      { status: "RETURNED_FOR_CORRECTION", approverEmail: "a@example.com", decisionRequestId: "r1", decisionComment: "A" },
      "r1",
      "RETURN",
      "B"
    ),
    (error: any) => error?.code === "IDEMPOTENCY_CONFLICT"
  );
});

test("different request id cannot overwrite a final decision", () => {
  assert.throws(
    () => assertDecisionAllowed(
      { status: "APPROVED", approverEmail: "a@example.com", decisionRequestId: "r1", decisionComment: "" },
      "r2",
      "APPROVE",
      ""
    ),
    (error: any) => error?.code === "FINAL_DECISION_EXISTS"
  );
});

test("decision status mapping", () => {
  assert.equal(nextStatus("APPROVE"), "APPROVED");
  assert.equal(nextStatus("RETURN"), "RETURNED_FOR_CORRECTION");
});

test("known statuses are accepted and unknown statuses are rejected", () => {
  assert.equal(isStatus("PENDING_REVIEW"), true);
  assert.equal(isStatus("APPROVED"), true);
  assert.equal(isStatus("RETURNED_FOR_CORRECTION"), true);
  assert.equal(isStatus("DELETED"), false);
});

test("comment normalization trims retry payloads consistently", () => {
  assert.equal(normalizedComment("  needs work  "), "needs work");
  assert.equal(normalizedComment(null), "");
});

test("approval id validation accepts opaque URL-safe ids", () => {
  assert.equal(isApprovalId("AbcdefghijklmnopQRST_1234-xyz"), true);
});

test("approval id validation rejects short, spaced, or path-like ids", () => {
  assert.equal(isApprovalId("short"), false);
  assert.equal(isApprovalId("abcdefghijklmnopqrst /bad"), false);
  assert.equal(isApprovalId("../../abcdefghijklmnopqrst"), false);
});

test("request id sanitization accepts safe correlation ids", () => {
  assert.equal(safeRequestId(" abc-123:retry.1 "), "abc-123:retry.1");
});

test("request id sanitization rejects control and unsafe characters", () => {
  assert.equal(safeRequestId("bad\nheader"), null);
  assert.equal(safeRequestId("<script>"), null);
  assert.equal(safeRequestId(undefined), null);
});
