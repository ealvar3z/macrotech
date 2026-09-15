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

function sheetId(): string {
  const value = required("APPROVAL_SHEET_ID");
  if (!/^[A-Za-z0-9_-]{20,200}$/.test(value)) {
    throw new Error("APPROVAL_SHEET_ID is invalid.");
  }
  return value;
}

function email(name: string): string {
  const value = required(name).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) || /[\r\n]/.test(value)) {
    throw new Error(`${name} must be a valid email address.`);
  }
  return value;
}

function sheetName(): string {
  const value = (process.env.APPROVAL_SHEET_NAME ?? "Production Approvals").trim();
  if (!value || value.length > 100 || /[\u0000-\u001F\u007F]/.test(value)) {
    throw new Error("APPROVAL_SHEET_NAME is invalid.");
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

export const config = {
  publicAppUrl: appUrl("PUBLIC_APP_URL"),
  systemEmail: email("SYSTEM_EMAIL"),
  approvalSheetId: sheetId(),
  approvalSheetName: sheetName(),
  gmailClientId: required("GMAIL_CLIENT_ID"),
  gmailClientSecret: required("GMAIL_CLIENT_SECRET"),
  gmailRefreshToken: required("GMAIL_REFRESH_TOKEN"),
  buildId: (process.env.BUILD_ID ?? "unknown").trim().slice(0, 100) || "unknown",
  port: port()
};
