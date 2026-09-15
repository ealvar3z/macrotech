function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function appUrl(name: string): string {
  const raw = required(name).replace(/\/+$/, "");
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`${name} must be a valid absolute URL.`);
  }

  const local = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  if (parsed.protocol !== "https:" && !(local && parsed.protocol === "http:")) {
    throw new Error(`${name} must use HTTPS (HTTP is allowed only for localhost development).`);
  }

  if (parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== "/") {
    throw new Error(`${name} must be a clean application origin without credentials, path, query parameters, or fragments.`);
  }

  return parsed.origin;
}

function optionalEmail(name: string): string {
  const value = (process.env[name] ?? "").trim().toLowerCase();
  if (!value) return "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) || /[\r\n]/.test(value)) {
    throw new Error(`${name} must be a valid email address when provided.`);
  }
  return value;
}

function bucketName(name: string): string {
  const value = required(name);
  if (!/^[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]$/.test(value)) {
    throw new Error(`${name} is not a valid Cloud Storage bucket name.`);
  }
  return value;
}

function port(): number {
  const value = Number(process.env.PORT ?? "8080");
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error("PORT must be an integer from 1 through 65535.");
  }
  return value;
}

function enabled(name: string): boolean {
  const value = (process.env[name] ?? "false").trim().toLowerCase();
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0" || value === "") return false;
  throw new Error(`${name} must be true or false.`);
}

function optionalSheetId(name: string): string {
  const value = (process.env[name] ?? "").trim();
  if (value && !/^[A-Za-z0-9_-]{20,200}$/.test(value)) {
    throw new Error(`${name} is invalid.`);
  }
  return value;
}

function optionalSheetName(name: string, fallback: string): string {
  const value = (process.env[name] ?? fallback).trim();
  if (!value || value.length > 100 || /[\u0000-\u001F\u007F]/.test(value)) {
    throw new Error(`${name} is invalid.`);
  }
  return value;
}

function positiveInteger(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? String(fallback));
  if (!Number.isInteger(value) || value < 1 || value > 100_000) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
}

function employeeCode(name: string, fallback: string): string {
  const value = (process.env[name] ?? fallback).trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(value)) {
    throw new Error(`${name} must contain exactly three letters.`);
  }
  return value;
}

const pilotTrackerEnabled = enabled("PILOT_TRACKER_ENABLED");
const pilotTrackerSheetId = optionalSheetId("PILOT_TRACKER_SHEET_ID");
const pilotTrackerTemplateRow = positiveInteger("PILOT_TRACKER_TEMPLATE_ROW", 3);
const pilotTrackerFirstWriteRow = positiveInteger("PILOT_TRACKER_FIRST_WRITE_ROW", 6);

if (pilotTrackerEnabled && !pilotTrackerSheetId) {
  throw new Error("PILOT_TRACKER_SHEET_ID is required when PILOT_TRACKER_ENABLED is true.");
}

if (pilotTrackerFirstWriteRow <= pilotTrackerTemplateRow) {
  throw new Error("PILOT_TRACKER_FIRST_WRITE_ROW must be after PILOT_TRACKER_TEMPLATE_ROW.");
}

export const config = {
  publicAppUrl: appUrl("PUBLIC_APP_URL"),
  quotationBucket: bucketName("QUOTATION_BUCKET"),
  bootstrapAdminEmail: optionalEmail("BOOTSTRAP_ADMIN_EMAIL"),
  pilotTrackerEnabled,
  pilotTrackerSheetId,
  pilotTrackerSheetName: optionalSheetName("PILOT_TRACKER_SHEET_NAME", "MARK-UP"),
  pilotTrackerEmployeeCode: employeeCode("PILOT_TRACKER_EMPLOYEE_CODE", "TST"),
  pilotTrackerTemplateRow,
  pilotTrackerFirstWriteRow,
  buildId: (process.env.BUILD_ID ?? "unknown").trim().slice(0, 100) || "unknown",
  port: port()
};
