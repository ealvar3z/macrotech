import { dataCheckLabel, moneyLabel, percentLabel, statusLabel } from "./domain.js";

export interface NotificationContent {
  subject: string;
  text: string;
  html: string;
}

function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function present(value: unknown): string {
  const text = String(value ?? "").trim();
  return text || "Not provided";
}

function compactMoneySubjectLabel(value: unknown, currencyValue: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const currency = String(currencyValue ?? "PHP").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) return null;

  try {
    return new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency,
      notation: "compact",
      minimumFractionDigits: 0,
      maximumFractionDigits: 1
    }).format(value);
  } catch {
    return null;
  }
}

function detailRow(label: string, value: string): string {
  return `<tr>
    <td style="padding:11px 14px;border-bottom:1px solid #edf0f2;color:#66727f;font-size:13px;vertical-align:top">${esc(label)}</td>
    <td style="padding:11px 14px;border-bottom:1px solid #edf0f2;color:#17212b;font-size:13px;font-weight:700;text-align:right;vertical-align:top">${esc(value || "-")}</td>
  </tr>`;
}

function optionalDetailRow(label: string, value: unknown): string {
  const text = present(value);
  return text === "Not provided" || text === "-" ? "" : detailRow(label, text);
}

function metricCard(label: string, value: string, note = ""): string {
  return `<div style="border:1px solid #dfe5e9;border-radius:10px;background:#fff;padding:14px;min-height:60px">
    <div style="font-size:11px;color:#66727f;font-weight:700;text-transform:uppercase;letter-spacing:.7px">${esc(label)}${note ? ` <span style="color:#0e6c34;font-weight:700">${esc(note)}</span>` : ""}</div>
    <div style="margin-top:6px;color:#17212b;font-size:20px;font-weight:800;line-height:1.2;word-break:break-word">${esc(value)}</div>
  </div>`;
}

function brandHeader(): string {
  return `<div style="padding:10px 22px 15px;background:#fff;border-bottom:3px solid #138a42;text-align:center">
    <img src="cid:macrotech-logo" width="330" alt="Macrotech Industrial Trading" style="display:block;width:330px;max-width:82%;height:auto;border:0;margin:-52px auto">
    <div style="color:#5e6d64;font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase">Quotation Approval System</div>
  </div>`;
}

function statusPill(label: string, kind: "pending" | "approved" | "returned"): string {
  const colors = kind === "approved"
    ? { background: "#eaf7ef", border: "#a8d3b8", text: "#0e6c34" }
    : kind === "returned"
      ? { background: "#fbecef", border: "#e0b6ba", text: "#a82b35" }
      : { background: "#fff5df", border: "#e2c984", text: "#a76700" };
  return `<span style="display:inline-block;padding:6px 10px;border:1px solid ${colors.border};border-radius:20px;background:${colors.background};color:${colors.text};font-size:11px;font-weight:800;letter-spacing:.7px;text-transform:uppercase">${esc(label)}</span>`;
}

function emailFrame(content: string, maxWidth = 640): string {
  return `<div style="margin:0;padding:24px 10px;background:#f3f6f7;color:#17212b;font-family:Bahnschrift,'Arial Narrow','Segoe UI',Arial,sans-serif">
    <div style="max-width:${maxWidth}px;margin:0 auto;border:1px solid #dfe5e9;border-radius:13px;background:#fff;box-shadow:0 4px 18px rgba(20,40,50,.06);overflow:hidden">${content}</div>
  </div>`;
}

function optionalCommercialMetricRow(discount: string, totalAfterDiscount: string): string {
  const cards = [
    discount !== "Not provided" ? `<div style="border:1px solid #d9c896;border-radius:10px;background:#fffaf0;padding:14px;min-height:60px">
      <div style="color:#8a5c00;font-size:11px;font-weight:800;letter-spacing:.7px;text-transform:uppercase">Discount</div>
      <div style="margin-top:6px;color:#704b00;font-size:20px;font-weight:800;line-height:1.2">${esc(discount)}</div>
    </div>` : "",
    totalAfterDiscount !== "Not provided" ? `<div style="border:1px solid #9dc6ad;border-radius:10px;background:#f3faf5;padding:14px;min-height:60px">
      <div style="color:#175438;font-size:11px;font-weight:800;letter-spacing:.7px;text-transform:uppercase">Total After Discount</div>
      <div style="margin-top:6px;color:#154c2c;font-size:22px;font-weight:800;line-height:1.2">${esc(totalAfterDiscount)}</div>
    </div>` : ""
  ].filter(Boolean);

  if (cards.length === 0) return "";
  if (cards.length === 1) {
    return `<tr><td colspan="2" style="padding:6px 0 0;vertical-align:top">${cards[0]}</td></tr>`;
  }
  return `<tr>
    <td style="width:50%;padding:6px 6px 0 0;vertical-align:top">${cards[0]}</td>
    <td style="width:50%;padding:6px 0 0 6px;vertical-align:top">${cards[1]}</td>
  </tr>`;
}

export function commercialValues(a: FirebaseFirestore.DocumentData) {
  const commercial = a.commercial ?? {};
  const currency = commercial.currency ?? "PHP";
  const total = moneyLabel(commercial.totalAmount, currency);
  const subtotal = moneyLabel(commercial.subtotal, currency);
  const vat = moneyLabel(commercial.vatAmount, currency);
  const markup = percentLabel(commercial.markupPercent);
  const discountPercent = percentLabel(commercial.discountPercent);
  const discountAmount = moneyLabel(commercial.discountAmount, currency);
  const discount = discountPercent !== "Not provided" && discountAmount !== "Not provided"
    ? `${discountPercent} (${discountAmount})`
    : discountPercent !== "Not provided"
      ? discountPercent
      : discountAmount;
  const totalAfterDiscount = moneyLabel(commercial.totalAfterDiscount, currency);
  const vatLabel = typeof commercial.vatRatePercent === "number"
    ? `VAT (${percentLabel(commercial.vatRatePercent)})`
    : "VAT";

  return {
    total,
    subtotal,
    vat,
    markup,
    discount,
    totalAfterDiscount,
    vatLabel,
    dutiesAndTaxes: present(commercial.dutiesAndTaxes),
    safetyFactor: present(commercial.safetyFactor),
    delivery: present(commercial.delivery)
  };
}

export function buildApprovalCreatedContent(
  publicAppUrl: string,
  approvalId: string,
  a: FirebaseFirestore.DocumentData
): NotificationContent {
  const url = `${publicAppUrl}/a/${encodeURIComponent(approvalId)}`;
  const commercial = commercialValues(a);
  const subjectAmount = compactMoneySubjectLabel(a.commercial?.totalAmount, a.commercial?.currency);
  const subject = `${subjectAmount ? `${subjectAmount} ` : ""}Quotation Approval Required${a.qCode ? ` • ${a.qCode}` : ""}`;
  const source = a.rfqInquiry || a.sourceReference || "-";
  const revision = a.revision || "-";
  const preparedBy = a.requesterName || a.requesterEmail || "-";
  const requesterComment = String(a.requesterComment ?? "").trim() || "No comment provided";
  const checks = dataCheckLabel(a.dataChecks);

  const text = [
    "Quotation approval required.",
    `Q Code: ${a.qCode || "Not assigned"}`,
    `Customer: ${a.customer || "-"}`,
    `Total Amount: ${commercial.total}`,
    commercial.discount !== "Not provided" ? `Discount: ${commercial.discount}` : "",
    commercial.totalAfterDiscount !== "Not provided" ? `Total After Discount: ${commercial.totalAfterDiscount}` : "",
    `Markup: ${commercial.markup}`,
    `Duties and Taxes: ${commercial.dutiesAndTaxes}`,
    `Safety Factor: ${commercial.safetyFactor}`,
    "",
    commercial.subtotal !== "Not provided" ? `Subtotal: ${commercial.subtotal}` : "",
    commercial.vat !== "Not provided" ? `${commercial.vatLabel}: ${commercial.vat}` : "",
    `Delivery: ${commercial.delivery}`,
    `Data Checks: ${checks}`,
    `Revision: ${revision}`,
    `RFQ / Inquiry: ${source}`,
    `Prepared By: ${preparedBy}`,
    `Requester Comment: ${requesterComment}`,
    "",
    `APPROVE: ${url}`,
    `REJECT: ${url}`,
    `VIEW APPROVAL RECORD: ${url}`,
    "",
    "Approval is recorded only after the assigned approver signs in with Google and confirms the decision in the secure portal."
  ].filter(line => line !== "").join("\n");

  const preheader = `${a.qCode || "Quotation"} • ${commercial.total} • ${commercial.markup} markup • Approval required`;
  const html = `
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>@media(max-width:480px){.approval-action{display:block!important;margin:8px 0!important;box-sizing:border-box;width:100%}}</style>
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${esc(preheader)}</div>
    ${emailFrame(`
      ${brandHeader()}
      <div style="padding:23px 22px 20px;border-top:5px solid #138a42;border-bottom:1px solid #dfe5e9;background:#f7fbf8;background-image:linear-gradient(120deg,#fff 0%,#f7fbf8 63%,#edf6f0 100%)">
        ${statusPill("Pending Approval", "pending")}
        <div style="margin-top:13px;color:#138a42;font-size:11px;font-weight:800;letter-spacing:1.4px;text-transform:uppercase">Internal Macrotech Approval</div>
        <h2 style="margin:6px 0 5px;color:#17212b;font-size:27px;line-height:1.2">Quotation Approval Required</h2>
        <div style="color:#66727f;font-size:14px">${esc(a.customer || "-")}</div>
        <div style="display:inline-block;margin-top:13px;padding:8px 12px;border:1px solid #a8d3b8;border-radius:10px;background:#eaf7ef;color:#175438;font-size:14px;font-weight:800;letter-spacing:.4px">${esc(a.qCode || "Q Code not assigned")}</div>
      </div>
      <div style="padding:21px 22px;background:#fff;border-bottom:1px solid #dfe5e9">
        <div style="color:#6d7f71;font-size:11px;font-weight:700;letter-spacing:.8px;text-transform:uppercase">Grand Total</div>
        <div style="margin:6px 0 3px;color:#164e32;font-size:36px;font-weight:800;line-height:1.1">${esc(commercial.total)}</div>
        <div style="color:#6d7f71;font-size:11px">Before approved discount</div>
        <table role="presentation" style="width:100%;margin-top:17px;border-collapse:separate;border-spacing:0;table-layout:fixed">
          <tr>
            <td style="width:50%;padding:0 6px 6px 0;vertical-align:top">${metricCard("Markup", commercial.markup, "• Internal")}</td>
            <td style="width:50%;padding:0 0 6px 6px;vertical-align:top">${metricCard("Duties & Taxes", commercial.dutiesAndTaxes)}</td>
          </tr>
          <tr>
            <td style="width:50%;padding:6px 6px 0 0;vertical-align:top">${metricCard("Safety Factor", commercial.safetyFactor)}</td>
            <td style="width:50%;padding:6px 0 0 6px;vertical-align:top">${metricCard(commercial.vatLabel, commercial.vat)}</td>
          </tr>
          ${optionalCommercialMetricRow(commercial.discount, commercial.totalAfterDiscount)}
        </table>
      </div>
      <table role="presentation" style="width:100%;border-collapse:collapse;background:#fff">
        ${detailRow("Revision", revision)}
        ${detailRow("RFQ / Inquiry", source)}
        ${optionalDetailRow("Subtotal", commercial.subtotal)}
        ${detailRow("Delivery", commercial.delivery)}
        ${detailRow("Data Checks", checks)}
        ${detailRow("Prepared By", preparedBy)}
      </table>
      <div style="margin:18px 22px 0;padding:16px;border-radius:9px;background:#f5f7f5">
        <div style="color:#75857a;font-size:11px;font-weight:800;letter-spacing:.8px;text-transform:uppercase">Employee Submission Comment</div>
        <div style="margin-top:7px;color:#17212b;font-size:14px;line-height:1.55;white-space:pre-wrap">${esc(requesterComment)}</div>
      </div>
      <div style="padding:23px 22px 25px;text-align:center">
        <a class="approval-action" href="${esc(url)}" style="display:inline-block;margin:4px;border:1px solid #138a42;border-radius:8px;background:#138a42;color:#fff;text-decoration:none;padding:13px 20px;font-size:14px;font-weight:800">APPROVE</a>
        <a class="approval-action" href="${esc(url)}" style="display:inline-block;margin:4px;border:1px solid #a83939;border-radius:8px;background:#fff;color:#a83939;text-decoration:none;padding:13px 20px;font-size:14px;font-weight:800">REJECT</a>
        <a class="approval-action" href="${esc(url)}" style="display:inline-block;margin:4px;border:1px solid #ccd5dc;border-radius:8px;background:#f5f7f8;color:#17212b;text-decoration:none;padding:13px 20px;font-size:14px;font-weight:800">VIEW APPROVAL RECORD</a>
        <p style="margin:14px 0 0;color:#66727f;font-size:12px;line-height:1.5">All three buttons open the secure approval record. Google sign-in and final confirmation are still required. Email links never approve or reject a quotation automatically.</p>
      </div>
      <div style="padding:14px 22px;background:#183c29;color:#b9d0c2;font-size:11px;line-height:1.45;text-align:center">Macrotech Industrial Trading · Quotation Approval System</div>
    `)}`;

  return { subject, text, html };
}

export function buildApprovalDecisionContent(
  publicAppUrl: string,
  approvalId: string,
  a: FirebaseFirestore.DocumentData
): NotificationContent {
  const label = statusLabel(a.status);
  const url = `${publicAppUrl}/a/${encodeURIComponent(approvalId)}`;
  const commercial = commercialValues(a);
  const subjectAmount = compactMoneySubjectLabel(a.commercial?.totalAmount, a.commercial?.currency);
  const qCodeSuffix = a.qCode ? ` • ${a.qCode}` : "";
  const isApproved = a.status === "APPROVED";
  const isReturned = a.status === "RETURNED_FOR_CORRECTION";
  const headline = isApproved ? "Quotation Approved" : isReturned ? "Quotation Correction Required" : `Quotation ${label}`;
  const subject = `${subjectAmount ? `${subjectAmount} ` : ""}${headline}${qCodeSuffix}`;
  const decisionBy = a.decisionByEmail || "-";
  const decisionComment = String(a.decisionComment ?? "").trim();
  const actorLabel = isApproved ? "Approved By" : isReturned ? "Returned By" : "Decision By";
  const commentLabel = isReturned ? "Correction Request" : "Approver Comment";
  const actionLabel = isReturned ? "REVIEW CORRECTION REQUEST" : "VIEW APPROVAL RECORD";
  const opening = isApproved
    ? "Quotation approved."
    : isReturned
      ? "Quotation correction required."
      : `Quotation decision: ${label}`;

  const text = [
    opening,
    `Q Code: ${a.qCode || "Not assigned"}`,
    `Customer: ${a.customer || "-"}`,
    `Total Amount: ${commercial.total}`,
    commercial.discount !== "Not provided" ? `Discount: ${commercial.discount}` : "",
    commercial.totalAfterDiscount !== "Not provided" ? `Total After Discount: ${commercial.totalAfterDiscount}` : "",
    `${actorLabel}: ${decisionBy}`,
    decisionComment ? `${commentLabel}: ${decisionComment}` : "",
    "",
    `Markup: ${commercial.markup}`,
    `Duties and Taxes: ${commercial.dutiesAndTaxes}`,
    `Safety Factor: ${commercial.safetyFactor}`,
    `Delivery: ${commercial.delivery}`,
    "",
    `${actionLabel}: ${url}`
  ].filter(line => line !== "").join("\n");

  const preheader = isApproved
    ? `${a.qCode || "Quotation"} • ${commercial.total} • Approved`
    : isReturned
      ? `${a.qCode || "Quotation"} • ${commercial.total} • Correction required • Review approver comments`
      : `${a.qCode || "Quotation"} • ${commercial.total} • ${label}`;

  const html = `
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${esc(preheader)}</div>
    ${emailFrame(`
      ${brandHeader()}
      <div style="padding:23px 22px 20px;border-top:5px solid ${isReturned ? "#a82b35" : "#138a42"};border-bottom:1px solid #dfe5e9;background:${isReturned ? "#fff8f8" : "#f7fbf8"}">
        ${statusPill(isApproved ? "Approved" : isReturned ? "Correction Required" : label, isApproved ? "approved" : isReturned ? "returned" : "pending")}
        <div style="margin-top:13px;color:${isReturned ? "#a82b35" : "#138a42"};font-size:11px;font-weight:800;letter-spacing:1.4px;text-transform:uppercase">Internal Macrotech Approval</div>
        <h2 style="margin:6px 0 5px;color:#17212b;font-size:27px;line-height:1.2">${esc(headline)}</h2>
        <div style="color:#66727f;font-size:14px">${esc(a.customer || "-")}</div>
        <div style="display:inline-block;margin-top:13px;padding:8px 12px;border:1px solid #a8d3b8;border-radius:10px;background:#eaf7ef;color:#175438;font-size:14px;font-weight:800;letter-spacing:.4px">${esc(a.qCode || "Q Code not assigned")}</div>
      </div>
      <div style="padding:21px 22px;background:#fff;border-bottom:1px solid #dfe5e9">
        <div style="color:#6d7f71;font-size:11px;font-weight:700;letter-spacing:.8px;text-transform:uppercase">Grand Total</div>
        <div style="margin:6px 0 3px;color:#164e32;font-size:36px;font-weight:800;line-height:1.1">${esc(commercial.total)}</div>
        <div style="color:#6d7f71;font-size:11px">Before approved discount</div>
        <table role="presentation" style="width:100%;margin-top:17px;border-collapse:separate;border-spacing:0;table-layout:fixed">
          <tr>
            <td style="width:50%;padding:0 6px 6px 0;vertical-align:top">${metricCard("Markup", commercial.markup, "• Internal")}</td>
            <td style="width:50%;padding:0 0 6px 6px;vertical-align:top">${metricCard("Duties & Taxes", commercial.dutiesAndTaxes)}</td>
          </tr>
          <tr>
            <td style="width:50%;padding:6px 6px 0 0;vertical-align:top">${metricCard("Safety Factor", commercial.safetyFactor)}</td>
            <td style="width:50%;padding:6px 0 0 6px;vertical-align:top">${metricCard("Delivery", commercial.delivery)}</td>
          </tr>
          ${optionalCommercialMetricRow(commercial.discount, commercial.totalAfterDiscount)}
        </table>
      </div>
      <table role="presentation" style="width:100%;border-collapse:collapse;background:#fff">
        ${detailRow(actorLabel, decisionBy)}
      </table>
      ${decisionComment ? `<div style="margin:18px 22px 0;padding:16px;border:1px solid ${isReturned ? "#e0b6ba" : "#dfe5e9"};border-radius:9px;background:${isReturned ? "#fbecef" : "#f5f7f5"}"><div style="color:${isReturned ? "#a82b35" : "#75857a"};font-size:11px;font-weight:800;letter-spacing:.8px;text-transform:uppercase">${esc(commentLabel)}</div><div style="margin-top:7px;color:#17212b;white-space:pre-wrap;font-size:14px;line-height:1.55;font-weight:${isReturned ? "700" : "400"}">${esc(decisionComment)}</div></div>` : ""}
      <div style="padding:23px 22px 25px;text-align:center">
        <a href="${esc(url)}" style="display:inline-block;border:1px solid #138a42;border-radius:8px;background:${isReturned ? "#fff" : "#138a42"};color:${isReturned ? "#0e6c34" : "#fff"};text-decoration:none;padding:13px 20px;font-size:14px;font-weight:800">${esc(actionLabel)}</a>
        ${isReturned ? `<p style="margin:13px 0 0;color:#66727f;font-size:12px;line-height:1.5">Open the approval record to review the correction request before revising the quotation.</p>` : ""}
      </div>
      <div style="padding:14px 22px;background:#183c29;color:#b9d0c2;font-size:11px;line-height:1.45;text-align:center">Macrotech Industrial Trading · Quotation Approval System</div>
    `, 620)}`;

  return { subject, text, html };
}
