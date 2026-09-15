import { writeFileSync } from "node:fs";
import { buildApprovalCreatedContent, buildApprovalDecisionContent } from "../worker/src/notifications.ts";

const sample = {
  qCode: "25QLPR053",
  customer: "Sample Customer Inc.",
  revision: "2",
  sourceReference: "RFQ-2026-001",
  rfqInquiry: "RFQ-2026-001",
  requesterName: "Sample Preparer",
  requesterEmail: "preparer@example.com",
  approverEmail: "approver@example.com",
  requesterComment: "Please review the commercial assumptions before approval.",
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
  dataChecks: {
    requiredFields: "PASSED",
    calculationsVat: "PASSED",
    templateFidelity: "PASSED",
    fileNaming: "PASSED",
    warnings: []
  }
};

const appUrl = "https://macrotech-approval-production.web.app";
const approvalId = "sample-approval-record-12345";
const request = buildApprovalCreatedContent(appUrl, approvalId, sample);
const decision = buildApprovalDecisionContent(appUrl, approvalId, {
  ...sample,
  status: "APPROVED",
  decisionByEmail: "approver@example.com",
  decisionComment: "Approved with the displayed discount."
});
const browserPreview = html => html.replaceAll("cid:macrotech-logo", "../worker/assets/macrotech_full_logo.jpg");

const document = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Macrotech Approval Notification Preview</title>
</head>
<body style="margin:0;background:#f3f3f3;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;color:#222">
  <div style="max-width:640px;margin:0 auto 14px;padding:10px 12px;border:1px solid #ccc;background:#fff;font-size:12px;color:#555;border-radius:8px"><strong>SAMPLE PREVIEW ONLY.</strong> These values are demonstration data and are not a real Macrotech quotation.</div>
  <h1 style="max-width:640px;margin:22px auto 10px;font-size:18px">Approval request email</h1>
  ${browserPreview(request.html)}
  <h1 style="max-width:620px;margin:34px auto 10px;font-size:18px">Approval decision email</h1>
  ${browserPreview(decision.html)}
</body>
</html>`;

for (const path of ["docs/APPROVAL_TEST_NOTIFICATION_PREVIEW.html", "docs/CEO_NOTIFICATION_PREVIEW.html"]) {
  writeFileSync(path, document);
}
