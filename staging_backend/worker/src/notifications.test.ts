import assert from "node:assert/strict";
import test from "node:test";
import { buildApprovalCreatedContent, buildApprovalDecisionContent } from "./notifications.js";

const approval = {
  qCode: "25QLPR053",
  customer: "Sample Customer Inc.",
  revision: "2",
  sourceType: "RFQ",
  sourceReference: "B-25-12329",
  rfqInquiry: "B-25-12329",
  requesterName: "Sample Preparer",
  requesterEmail: "preparer@example.com",
  approverEmail: "approver@example.com",
  status: "PENDING_REVIEW",
  commercial: {
    currency: "PHP",
    subtotal: 160650,
    vatRatePercent: 12,
    vatAmount: 19278,
    totalAmount: 179928,
    discountPercent: 5,
    discountAmount: 8996.4,
    totalAfterDiscount: 170931.6,
    markupPercent: 25.5,
    dutiesAndTaxes: "8%",
    safetyFactor: "10%",
    delivery: "10-12 WEEKS OR EARLIER"
  },
  requesterComment: "Please review the commercial assumptions before approval.",
  dataChecks: {
    requiredFields: "PASSED",
    calculationsVat: "PASSED",
    templateFidelity: "PASSED",
    fileNaming: "PASSED",
    warnings: []
  }
};

const appUrl = "https://approval.example.invalid";
const approvalId = "approval-12345678901234567890";

test("approval notification surfaces commercial review fields", () => {
  const content = buildApprovalCreatedContent(appUrl, approvalId, approval);
  assert.equal(content.subject, "₱179.9K Quotation Approval Required • 25QLPR053");
  for (const value of [
    "Q Code: 25QLPR053",
    "Customer: Sample Customer Inc.",
    "Total Amount: ₱179,928.00",
    "Discount: 5% (₱8,996.40)",
    "Total After Discount: ₱170,931.60",
    "Markup: 25.5%",
    "Duties and Taxes: 8%",
    "Safety Factor: 10%",
    "VAT (12%): ₱19,278.00",
    "Requester Comment: Please review the commercial assumptions before approval."
  ]) {
    assert.match(content.text, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  for (const label of ['APPROVE', 'REJECT', 'VIEW APPROVAL RECORD']) assert.ok(content.html.includes(`>${label}</a>`));
  assert.match(content.html, /@media\(max-width:480px\)/);
  assert.match(content.html, /Total After Discount/);
});

test("notification HTML matches the Macrotech application theme", () => {
  const created = buildApprovalCreatedContent(appUrl, approvalId, approval);
  const decided = buildApprovalDecisionContent(appUrl, approvalId, {
    ...approval,
    status: "APPROVED",
    decisionByEmail: "approver@example.com"
  });

  for (const content of [created, decided]) {
    assert.match(content.html, /cid:macrotech-logo/);
    assert.match(content.html, /#f3f6f7/);
    assert.match(content.html, /#17212b/);
    assert.match(content.html, /#138a42/);
    assert.match(content.html, /#183c29/);
    assert.match(content.html, /font-family:Bahnschrift/);
  }
  assert.match(created.html, /background:#138a42;color:#fff/);
  assert.match(decided.html, /Quotation Approved/);
});

test("approval notification uses compact PHP amount in the subject", () => {
  const content = buildApprovalCreatedContent(appUrl, approvalId, {
    ...approval,
    commercial: { ...approval.commercial, totalAmount: 4_600_000 }
  });
  assert.equal(content.subject, "₱4.6M Quotation Approval Required • 25QLPR053");
});

test("approval notification preserves USD", () => {
  const content = buildApprovalCreatedContent(appUrl, approvalId, {
    ...approval,
    commercial: { ...approval.commercial, currency: "USD", totalAmount: 84_500 }
  });
  assert.equal(content.subject, "$84.5K Quotation Approval Required • 25QLPR053");
  assert.match(content.text, /Total Amount: \$84,500\.00/);
});

test("approved decision notification preserves USD", () => {
  const content = buildApprovalDecisionContent(appUrl, approvalId, {
    ...approval,
    status: "APPROVED",
    decisionByEmail: "approver@example.com",
    commercial: { ...approval.commercial, currency: "USD", totalAmount: 84_500 }
  });
  assert.equal(content.subject, "$84.5K Quotation Approved • 25QLPR053");
  assert.match(content.text, /Approved By: approver@example\.com/);
  assert.match(content.text, /Discount: 5% \(\$8,996\.40\)/);
  assert.match(content.text, /Total After Discount: \$170,931\.60/);
});

test("returned decision notification makes correction action explicit", () => {
  const content = buildApprovalDecisionContent(appUrl, approvalId, {
    ...approval,
    status: "RETURNED_FOR_CORRECTION",
    decisionByEmail: "approver@example.com",
    decisionComment: "Please confirm duties and taxes before resubmitting.",
    commercial: { ...approval.commercial, totalAmount: 4_600_000 }
  });
  assert.equal(content.subject, "₱4.6M Quotation Correction Required • 25QLPR053");
  assert.match(content.text, /Correction Request: Please confirm duties and taxes before resubmitting\./);
  assert.match(content.html, /REVIEW CORRECTION REQUEST/);
});

test("notification links are review-only", () => {
  const content = buildApprovalCreatedContent(appUrl, approvalId, approval);
  assert.match(content.text, /assigned approver signs in with Google and confirms the decision/);
  assert.doesNotMatch(content.html, /action=APPROVE/i);
  assert.doesNotMatch(content.html, /\/decision/);
});

test("notification HTML escapes customer and decision comments", () => {
  const created = buildApprovalCreatedContent(appUrl, approvalId, {
    ...approval,
    customer: '<img src=x onerror="alert(1)">'
  });
  assert.doesNotMatch(created.html, /<img src=x/);
  assert.match(created.html, /&lt;img src=x/);

  const decided = buildApprovalDecisionContent(appUrl, approvalId, {
    ...approval,
    status: "RETURNED_FOR_CORRECTION",
    decisionComment: '<img src=x onerror="alert(1)">'
  });
  assert.doesNotMatch(decided.html, /<img src=x/);
  assert.match(decided.html, /&lt;img src=x/);
});

test("approval notification omits unavailable subtotal and VAT", () => {
  const content = buildApprovalCreatedContent(appUrl, approvalId, {
    ...approval,
    commercial: {
      ...approval.commercial,
      subtotal: undefined,
      vatAmount: undefined,
      vatRatePercent: undefined
    }
  });
  assert.doesNotMatch(content.html, />Subtotal<\/td>/);
  assert.doesNotMatch(content.text, /^Subtotal:/m);
  assert.doesNotMatch(content.text, /^VAT/m);
});

test("approval notifications omit discount fields when no discount was entered", () => {
  const withoutDiscount = {
    ...approval,
    commercial: {
      ...approval.commercial,
      discountPercent: null,
      discountAmount: null,
      totalAfterDiscount: null
    }
  };
  const created = buildApprovalCreatedContent(appUrl, approvalId, withoutDiscount);
  const decided = buildApprovalDecisionContent(appUrl, approvalId, {
    ...withoutDiscount,
    status: "APPROVED",
    decisionByEmail: "approver@example.com"
  });

  for (const content of [created, decided]) {
    assert.doesNotMatch(content.text, /^Discount:/m);
    assert.doesNotMatch(content.text, /^Total After Discount:/m);
    assert.doesNotMatch(content.html, />Discount</);
    assert.doesNotMatch(content.html, />Total After Discount</);
  }
});

test("validation warnings do not claim a pass", () => {
  const content = buildApprovalCreatedContent(appUrl, approvalId, {
    ...approval,
    dataChecks: {
      ...approval.dataChecks,
      calculationsVat: "ATTENTION_REQUIRED",
      warnings: ["VAT total requires review"]
    }
  });
  assert.match(content.text, /Data Checks: Attention Required/);
  assert.doesNotMatch(content.text, /Data Checks: Passed/);
});
