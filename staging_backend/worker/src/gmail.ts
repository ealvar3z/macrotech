import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { google } from "googleapis";
import { config } from "./config.js";
import { cleanHeaderValue, encodedSubject, safeEventId } from "./domain.js";
import { buildApprovalCreatedContent, buildApprovalDecisionContent } from "./notifications.js";

export interface SendResult {
  providerMessageId: string | null;
  rfcMessageId: string;
}

const macrotechLogoBase64 = readFileSync(new URL("../assets/macrotech_full_logo.jpg", import.meta.url))
  .toString("base64")
  .match(/.{1,76}/g)?.join("\r\n") ?? "";

function rfcMessageId(eventId: string): string {
  const domain = new URL(config.publicAppUrl).hostname;
  return `<${safeEventId(eventId)}@${domain}>`;
}

export function encodeMessage(
  to: string,
  subject: string,
  text: string,
  html: string,
  messageId: string
): string {
  const relatedBoundary = `macrotech_related_${crypto.randomBytes(12).toString("hex")}`;
  const alternativeBoundary = `macrotech_alternative_${crypto.randomBytes(12).toString("hex")}`;
  const message = [
    `From: Macrotech Quotation System <${config.systemEmail}>`,
    `To: ${cleanHeaderValue(to)}`,
    `Reply-To: ${config.systemEmail}`,
    `Subject: ${encodedSubject(subject)}`,
    `Message-ID: ${messageId}`,
    `Date: ${new Date().toUTCString()}`,
    "Auto-Submitted: auto-generated",
    "X-Auto-Response-Suppress: All",
    "MIME-Version: 1.0",
    `Content-Type: multipart/related; boundary="${relatedBoundary}"`,
    "",
    `--${relatedBoundary}`,
    `Content-Type: multipart/alternative; boundary="${alternativeBoundary}"`,
    "",
    `--${alternativeBoundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    text,
    "",
    `--${alternativeBoundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    html,
    "",
    `--${alternativeBoundary}--`,
    "",
    `--${relatedBoundary}`,
    'Content-Type: image/jpeg; name="macrotech-full-logo.jpg"',
    "Content-Transfer-Encoding: base64",
    "Content-ID: <macrotech-logo>",
    'Content-Disposition: inline; filename="macrotech-full-logo.jpg"',
    "",
    macrotechLogoBase64,
    "",
    `--${relatedBoundary}--`
  ].join("\r\n");

  return Buffer.from(message)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function client() {
  const oauth = new google.auth.OAuth2(config.gmailClientId, config.gmailClientSecret);
  oauth.setCredentials({ refresh_token: config.gmailRefreshToken });
  return google.gmail({ version: "v1", auth: oauth });
}

async function send(
  eventId: string,
  to: string,
  subject: string,
  text: string,
  html: string
): Promise<SendResult> {
  const messageId = rfcMessageId(eventId);
  const result = await client().users.messages.send({
    userId: "me",
    requestBody: { raw: encodeMessage(to, subject, text, html, messageId) }
  });

  return {
    providerMessageId: result.data.id ?? null,
    rfcMessageId: messageId
  };
}

export async function sendApprovalCreatedEmail(
  eventId: string,
  approvalId: string,
  a: FirebaseFirestore.DocumentData
): Promise<SendResult> {
  const content = buildApprovalCreatedContent(config.publicAppUrl, approvalId, a);
  return send(eventId, a.approverEmail, content.subject, content.text, content.html);
}

export async function sendApprovalDecisionEmail(
  eventId: string,
  approvalId: string,
  a: FirebaseFirestore.DocumentData
): Promise<SendResult> {
  const content = buildApprovalDecisionContent(config.publicAppUrl, approvalId, a);
  return send(eventId, a.requesterEmail, content.subject, content.text, content.html);
}
