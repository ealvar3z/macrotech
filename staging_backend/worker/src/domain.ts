export type ClaimResult = "CLAIMED" | "PROCESSED" | "LEASED" | "MISSING";

export function cleanHeaderValue(value: unknown): string {
  return String(value ?? "").replace(/[\r\n\u0000-\u001F\u007F]+/g, " ").replace(/\s+/g, " ").trim();
}

export function encodedSubject(value: unknown): string {
  const cleaned = cleanHeaderValue(value);
  return `=?UTF-8?B?${Buffer.from(cleaned, "utf8").toString("base64")}?=`;
}

export function statusLabel(status: unknown): string {
  if (status === "APPROVED") return "Approved";
  if (status === "RETURNED_FOR_CORRECTION") return "Returned for Correction";
  if (status === "PENDING_REVIEW") return "Pending Review";
  return "Quotation Update";
}

export function safeEventId(value: string): string {
  const cleaned = value.replace(/[^A-Za-z0-9._-]/g, "-").slice(0, 180);
  return cleaned || "event";
}

export function firestoreDocumentName(subject: string, bodyName: unknown): string {
  const fromSubject = subject.match(/documents\/(.+)$/)?.[1];
  if (fromSubject) return fromSubject;

  const name = String(bodyName ?? "");
  const marker = "/documents/";
  const index = name.indexOf(marker);
  if (index >= 0) return name.slice(index + marker.length);

  throw new Error("Could not determine Firestore document name from Eventarc event.");
}

export function normalizedCurrency(value: unknown): string {
  const currency = String(value ?? "PHP").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(currency) ? currency : "PHP";
}

export function moneyLabel(value: unknown, currencyValue: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "Not provided";
  const currency = normalizedCurrency(currencyValue);

  try {
    return new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  } catch {
    return `${currency} ${value.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
}

export function percentLabel(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "Not provided";
  return `${value.toLocaleString("en-PH", { maximumFractionDigits: 2 })}%`;
}

export type DataCheckState = "NOT_RUN" | "PASSED" | "ATTENTION_REQUIRED";

export interface DataChecksLike {
  requiredFields?: unknown;
  calculationsVat?: unknown;
  templateFidelity?: unknown;
  fileNaming?: unknown;
  warnings?: unknown;
}

function normalizedCheckState(value: unknown): DataCheckState {
  if (value === "PASSED" || value === "ATTENTION_REQUIRED") return value;
  return "NOT_RUN";
}

export function overallDataCheckState(checksValue: unknown): DataCheckState {
  const checks = (typeof checksValue === "object" && checksValue !== null ? checksValue : {}) as DataChecksLike;
  const states = [
    normalizedCheckState(checks.requiredFields),
    normalizedCheckState(checks.calculationsVat),
    normalizedCheckState(checks.templateFidelity),
    normalizedCheckState(checks.fileNaming)
  ];
  const warnings = Array.isArray(checks.warnings) ? checks.warnings : [];

  if (warnings.length > 0 || states.includes("ATTENTION_REQUIRED")) return "ATTENTION_REQUIRED";
  if (states.every(state => state === "PASSED")) return "PASSED";
  return "NOT_RUN";
}

export function dataCheckLabel(checksValue: unknown): string {
  const state = overallDataCheckState(checksValue);
  if (state === "PASSED") return "Passed";
  if (state === "ATTENTION_REQUIRED") return "Attention Required";
  return "Not Run";
}
