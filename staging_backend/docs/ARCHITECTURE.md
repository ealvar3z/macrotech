# Macrotech Approval Platform Architecture

## Request path

1. An employee opens the permanent Firebase Hosting approval URL.
2. Static frontend assets load from Firebase Hosting/CDN.
3. Firebase Authentication signs the employee in with Google.
4. The frontend sends the Firebase ID token in the `Authorization: Bearer` header to `/api/**`.
5. Firebase Hosting rewrites `/api/**` to `macrotech-approval-api` in Cloud Run.
6. The API verifies the token, including revocation status, and requires a verified email address.
7. For approval review and decision routes, the API compares the verified email with the approval's assigned approver email.
8. Quotation PDFs are streamed through the authenticated API from a private Cloud Storage bucket.
9. Approve/Return executes in a Firestore transaction and writes the approval state, audit record, and outbox event atomically.
10. Eventarc routes newly created outbox documents to the private worker.
11. The worker sends Gmail notifications and mirrors the current approval state to a dedicated Google Sheet tab.

## Source of truth

Firestore is authoritative. The Google Sheet is a reporting mirror only. Approval success never depends on Sheet availability.

## Core collections

### `approvals/{approvalId}`

Business state including source data, requester identity, assigned approver, current status, private quotation object path, timestamps, final decision metadata, an immutable internal commercial snapshot (`currency`, `subtotal`, `vatRatePercent`, `vatAmount`, `totalAmount`, `markupPercent`, and `delivery`), and a pre-approval `dataChecks` snapshot for required fields, calculations/VAT, template fidelity, file naming, and warnings.

### `approvals/{approvalId}/audit/{auditId}`

Append-only audit events for creation, first review opening, and final decision.

### `outbox/{eventId}`

Asynchronous delivery state for approval-created and approval-decided notifications/reporting synchronization.

### `_systemLocks/{lockId}`

Short-lived internal worker leases used only to serialize Google Sheet synchronization for the same approval. Browsers have no access.

## Identity and authorization

The API never trusts an email address from browser request data for approver identity. `Decision By` comes from a Firebase ID token verified by the Firebase Admin SDK.

A review or decision is permitted only when:

`verified authenticated email == assigned approver email`

The API uses `verifyIdToken(token, true)`, so its runtime service account requires read-only Firebase Authentication access (`roles/firebaseauth.viewer`) in addition to Firestore and Storage permissions.

## Approval identifiers

Approval IDs are generated from 32 cryptographically random bytes and encoded as URL-safe Base64. They are deliberately opaque and difficult to guess. Possession of the URL is not authorization; Google identity is still required.

## Decision integrity

Only `PENDING_REVIEW` may transition to `APPROVED` or `RETURNED_FOR_CORRECTION`.

The decision transaction records:

- server-generated decision timestamp,
- authenticated decision email and UID,
- action and comment,
- client-generated UUID idempotency request ID,
- audit event,
- asynchronous outbox event.

A retry using the same request ID is accepted only when its action and comment match the already-recorded decision. Reusing that request ID for a different payload returns an idempotency conflict.

## First-review integrity

The first `reviewOpenedAt` timestamp and its audit event are written transactionally. Concurrent page opens cannot intentionally create multiple first-open audit events.


## Commercial approval snapshot

The approval record carries the commercial figures the approver needs before making a decision. The approval email places Total Amount and Markup prominently near the top, and the secure portal repeats Total Amount, Markup, Subtotal, VAT, and Delivery before the decision controls. Markup is internal-only and is not a customer-facing quotation field.

The future quotation-generation module should populate the `commercial` and `dataChecks` snapshots from the same validated data used to produce the PDF. Missing checks remain `NOT_RUN`; the platform never fabricates a pass. The approval service does not expose an edit endpoint for either snapshot.

Email action links are review-only. A GET request from an email client, security scanner, or forwarded link can never approve a quotation. Final state changes require authenticated POST decision requests from the assigned approver.

## PDF security

Approval documents store a Cloud Storage object path, not a public URL. The API authorizes the user before fetching the object. Storage public access prevention remains enabled.

## Asynchronous delivery

The outbox worker uses leases to prevent concurrent processing of the same event. A leased-but-unfinished event returns a retriable response rather than being acknowledged. Sheet appends use the Google Sheets append API, and per-approval locks prevent creation/decision events for the same approval from racing the mirror update.

Gmail delivery is at-least-once at the system boundary. A deterministic RFC Message-ID and provider message ID are recorded to improve diagnostics; an extremely narrow crash window after Gmail accepts a message but before Firestore records success can still produce a duplicate on retry. Duplicate notification is preferred to silently losing a required notification.

## Failure behavior

Employee-facing errors are intentionally safe. Detailed internal failures are logged server-side with correlation IDs where appropriate. Employees should never see stack traces, Firestore paths, spreadsheet IDs, OAuth secrets, or Apps Script deployment errors.
