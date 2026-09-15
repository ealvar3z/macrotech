import { google } from "googleapis";
import { config } from "./config.js";

const HEADERS = [
  "Approval ID",
  "Source Type",
  "Source Reference",
  "Q Code",
  "RFQ / Inquiry",
  "Revision",
  "Customer",
  "Currency",
  "Subtotal",
  "VAT Rate %",
  "VAT Amount",
  "Total Amount",
  "Markup %",
  "Duties and Taxes",
  "Safety Factor",
  "Delivery",
  "Required Fields Check",
  "Calculations & VAT Check",
  "Template Fidelity Check",
  "File Naming Check",
  "Data Check Warnings",
  "Requester Name",
  "Requester Email",
  "Requester Comment",
  "Approver Email",
  "Status",
  "Submitted At",
  "Review Opened At",
  "Decision At",
  "Decision By",
  "Decision Comment",
  "Quotation Storage Object",
  "Last Updated"
];

function timestamp(value: any): string {
  if (!value) return "";
  if (typeof value.toDate === "function") return value.toDate().toISOString();
  return String(value);
}

function numberOrBlank(value: unknown): number | "" {
  return typeof value === "number" && Number.isFinite(value) ? value : "";
}

function row(approvalId: string, a: FirebaseFirestore.DocumentData): Array<string | number> {
  const commercial = a.commercial ?? {};

  return [
    approvalId,
    a.sourceType ?? "",
    a.sourceReference ?? "",
    a.qCode ?? "",
    a.rfqInquiry ?? "",
    a.revision ?? "",
    a.customer ?? "",
    commercial.currency ?? "PHP",
    numberOrBlank(commercial.subtotal),
    numberOrBlank(commercial.vatRatePercent),
    numberOrBlank(commercial.vatAmount),
    numberOrBlank(commercial.totalAmount),
    numberOrBlank(commercial.markupPercent),
    commercial.dutiesAndTaxes ?? "",
    commercial.safetyFactor ?? "",
    commercial.delivery ?? "",
    a.dataChecks?.requiredFields ?? "NOT_RUN",
    a.dataChecks?.calculationsVat ?? "NOT_RUN",
    a.dataChecks?.templateFidelity ?? "NOT_RUN",
    a.dataChecks?.fileNaming ?? "NOT_RUN",
    Array.isArray(a.dataChecks?.warnings) ? a.dataChecks.warnings.join(" | ") : "",
    a.requesterName ?? "",
    a.requesterEmail ?? "",
    a.requesterComment ?? "",
    a.approverEmail ?? "",
    a.status ?? "",
    timestamp(a.submittedAt),
    timestamp(a.reviewOpenedAt),
    timestamp(a.decisionAt),
    a.decisionByEmail ?? "",
    a.decisionComment ?? "",
    a.quotationStorageObject ?? "",
    timestamp(a.lastUpdated)
  ];
}

function quotedSheetName(): string {
  return `'${config.approvalSheetName.replace(/'/g, "''")}'`;
}

async function sheetsClient() {
  const auth = new google.auth.GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/spreadsheets"]
  });
  return google.sheets({ version: "v4", auth });
}

export async function syncApprovalToSheet(
  approvalId: string,
  a: FirebaseFirestore.DocumentData
): Promise<void> {
  const sheets = await sheetsClient();
  const headerRange = `${quotedSheetName()}!A1:AG1`;

  const header = await sheets.spreadsheets.values.get({
    spreadsheetId: config.approvalSheetId,
    range: headerRange
  });

  const existingHeaders = header.data.values?.[0] ?? [];

  if (existingHeaders.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: config.approvalSheetId,
      range: headerRange,
      valueInputOption: "RAW",
      requestBody: { values: [HEADERS] }
    });
  } else if (existingHeaders.join("|") !== HEADERS.join("|")) {
    throw new Error(
      `Refusing to overwrite unexpected headers in sheet "${config.approvalSheetName}". ` +
      "Create a dedicated production tab or migrate the headers intentionally."
    );
  }

  const idRange = `${quotedSheetName()}!A2:A`;
  const ids = await sheets.spreadsheets.values.get({
    spreadsheetId: config.approvalSheetId,
    range: idRange,
    majorDimension: "ROWS"
  });

  const values = ids.data.values ?? [];
  const existingIndex = values.findIndex(r => r?.[0] === approvalId);
  const approvalRow = row(approvalId, a);

  if (existingIndex >= 0) {
    const targetRow = existingIndex + 2;
    await sheets.spreadsheets.values.update({
      spreadsheetId: config.approvalSheetId,
      range: `${quotedSheetName()}!A${targetRow}:AG${targetRow}`,
      valueInputOption: "RAW",
      requestBody: { values: [approvalRow] }
    });
    return;
  }

  // Append is used for new rows rather than computing values.length + 2.
  // This prevents two different approval events from choosing and overwriting
  // the same "next" row when workers run concurrently.
  await sheets.spreadsheets.values.append({
    spreadsheetId: config.approvalSheetId,
    range: `${quotedSheetName()}!A:AG`,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [approvalRow] }
  });
}
