import assert from "node:assert/strict";
import test from "node:test";
import {
  cleanHeaderValue,
  dataCheckLabel,
  encodedSubject,
  firestoreDocumentName,
  overallDataCheckState,
  safeEventId,
  statusLabel
} from "./domain.js";

test("email header values cannot inject CRLF headers", () => {
  assert.equal(cleanHeaderValue("Quote\r\nBcc: attacker@example.com"), "Quote Bcc: attacker@example.com");
});

test("subjects are RFC 2047 encoded after sanitization", () => {
  const subject = encodedSubject("Quotation ✓");
  assert.match(subject, /^=\?UTF-8\?B\?.+\?=$/);
  assert.equal(Buffer.from(subject.slice(10, -2), "base64").toString("utf8"), "Quotation ✓");
});

test("status labels are human readable", () => {
  assert.equal(statusLabel("APPROVED"), "Approved");
  assert.equal(statusLabel("RETURNED_FOR_CORRECTION"), "Returned for Correction");
  assert.equal(statusLabel("UNKNOWN"), "Quotation Update");
});

test("event ids are safe for deterministic Message-ID values", () => {
  assert.equal(safeEventId("decided/abc?123"), "decided-abc-123");
});

test("Firestore document path is parsed from CloudEvent subject", () => {
  assert.equal(
    firestoreDocumentName("documents/outbox/created-abc", ""),
    "outbox/created-abc"
  );
});

test("Firestore document path is parsed from event body name", () => {
  assert.equal(
    firestoreDocumentName("", "projects/p/databases/(default)/documents/outbox/created-abc"),
    "outbox/created-abc"
  );
});

test("missing Firestore document path is rejected", () => {
  assert.throws(() => firestoreDocumentName("", "not-a-firestore-name"));
});

test("commercial money labels use Philippine currency formatting", async () => {
  const { moneyLabel } = await import("./domain.js");
  assert.equal(moneyLabel(179928, "PHP"), "₱179,928.00");
  assert.equal(moneyLabel(null, "PHP"), "Not provided");
});

test("commercial percentage labels preserve useful precision", async () => {
  const { percentLabel } = await import("./domain.js");
  assert.equal(percentLabel(25), "25%");
  assert.equal(percentLabel(25.375), "25.38%");
  assert.equal(percentLabel(null), "Not provided");
});


test("data checks report passed only when every validation category passed", () => {
  const checks = {
    requiredFields: "PASSED",
    calculationsVat: "PASSED",
    templateFidelity: "PASSED",
    fileNaming: "PASSED",
    warnings: []
  };
  assert.equal(overallDataCheckState(checks), "PASSED");
  assert.equal(dataCheckLabel(checks), "Passed");
});

test("data check warnings force attention even if category states passed", () => {
  const checks = {
    requiredFields: "PASSED",
    calculationsVat: "PASSED",
    templateFidelity: "PASSED",
    fileNaming: "PASSED",
    warnings: ["Supplier field requires review"]
  };
  assert.equal(overallDataCheckState(checks), "ATTENTION_REQUIRED");
  assert.equal(dataCheckLabel(checks), "Attention Required");
});

test("missing or partial data checks never fabricate a pass", () => {
  assert.equal(overallDataCheckState(undefined), "NOT_RUN");
  assert.equal(overallDataCheckState({ requiredFields: "PASSED" }), "NOT_RUN");
  assert.equal(dataCheckLabel({}), "Not Run");
});
