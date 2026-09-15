import assert from "node:assert/strict";
import test from "node:test";

test("Gmail message embeds the official Macrotech logo without an external URL", async () => {
  process.env.PUBLIC_APP_URL = "https://example.web.app";
  process.env.SYSTEM_EMAIL = "macrotech.quotations@gmail.com";
  process.env.APPROVAL_SHEET_ID = "12345678901234567890";
  process.env.GMAIL_CLIENT_ID = "test-client-id";
  process.env.GMAIL_CLIENT_SECRET = "test-client-secret";
  process.env.GMAIL_REFRESH_TOKEN = "test-refresh-token";

  const { encodeMessage } = await import("./gmail.js");
  const raw = encodeMessage(
    "approver@example.com",
    "Quotation Approval Required",
    "Plain text fallback",
    '<img src="cid:macrotech-logo" alt="MACROTECH">',
    "<event@example.web.app>"
  );
  const decoded = Buffer.from(raw.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");

  assert.match(decoded, /Content-Type: multipart\/related/);
  assert.match(decoded, /Content-Type: multipart\/alternative/);
  assert.match(decoded, /Content-ID: <macrotech-logo>/);
  assert.match(decoded, /Content-Disposition: inline; filename="macrotech-full-logo\.jpg"/);
  assert.match(decoded, /\/9j\//);
  assert.doesNotMatch(decoded, /<img src="https?:/);
});
