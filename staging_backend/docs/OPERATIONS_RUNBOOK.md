# Operations Runbook

## Purpose

This runbook is for operating the Macrotech Quotation Approval Platform without relying on knowledge from a prior chat. Firestore is authoritative. Gmail and Google Sheets are delivery/reporting integrations and must never be treated as the approval system of record.

## Normal health checks

Check the permanent Hosting route first:

`https://macrotech-approval-production.web.app/api/health`

A healthy response contains `ok: true`, service name, and the expected release `buildId`. If Hosting fails but the direct Cloud Run health endpoint works, investigate Hosting/rewrite deployment. If both fail, inspect the active Cloud Run revision and logs.

## Approval incident triage

For a reported approval problem, capture the approval reference and, when available, the safe request reference shown to the employee. Do not ask employees to send Firebase ID tokens, OAuth refresh tokens, or screenshots containing credentials.

Check in this order:

1. Approval document exists in Firestore and has a valid status.
2. Assigned approver email is correct.
3. Quotation storage object exists in the private bucket if a PDF is expected.
4. Audit subcollection shows creation/review/decision events as expected.
5. Corresponding outbox documents show email and sheet processing state.
6. Cloud Run logs around the request/build ID show the server-side failure.

Never repair a failed integration by manually changing a final approval decision.

## Wrong-account reports

`WRONG_APPROVER` is expected protection, not a system error. Confirm the assigned address administratively, then have the employee use the correct Google account. Do not weaken authorization or make the quotation public to solve an account-selection problem.

## PDF problems

If an approver can load the record but not the PDF:

- Confirm `quotationStorageObject` is present and is the intended `.pdf` object.
- Confirm the `commercial` snapshot contains the expected currency, total amount, markup, subtotal, VAT, and delivery values before investigating a notification mismatch. Missing values are displayed as `Not provided`; the worker does not invent commercial figures.
- Confirm the `dataChecks` snapshot matches the generator validation result. A check must remain `NOT_RUN` unless the generator actually executed it; warnings force the overall status to `Attention Required`.
- Confirm the object exists in `macrotech-approval-production-quotations`.
- Confirm API service account still has bucket-level `roles/storage.objectViewer`.
- Keep Public Access Prevention enabled.

Do not generate public/signed links as a quick workaround unless that change has been explicitly security-reviewed.

## Stuck outbox events

An outbox record is complete only when `processedAt` is populated. During normal processing, `leaseUntil` prevents concurrent work. Temporary failures record `lastError`/`lastFailedAt` and should be retried by Eventarc.

If an event is stuck:

- Check whether `leaseUntil` is still in the future before taking action.
- Review the worker log for the event ID.
- Verify Gmail OAuth health and Google Sheet access.
- Verify Eventarc trigger health and worker invocation permission.
- Prefer retrying the existing event after fixing the root cause rather than creating a second business event.

A rare process crash can cause a duplicate notification if Gmail accepts a message immediately before the worker records success. This is preferable to silently losing a required notification. Final approval integrity is unaffected because email is downstream of Firestore.

## Google Sheet mismatch

The worker intentionally refuses to write if row 1 headers differ from the expected production schema. Do not edit code to bypass that check. Either restore the expected headers or create/migrate a dedicated production tab intentionally.

The Sheet is a mirror. If it disagrees with Firestore, reconcile from Firestore rather than editing Firestore to match the Sheet.

## Gmail/OAuth failure

Use the narrow `gmail.send` scope. If the refresh token starts failing after a short pilot interval, check the OAuth app publishing state. External apps left in Testing have time-limited test authorizations. Resolve the OAuth production/verification state rather than repeatedly regenerating tokens as an operating procedure.

Never put Gmail client secrets or refresh tokens into frontend `.env`, Firestore, Sheets, source control, or screenshots.

## Rollback

Identify the previously known-good Hosting release and Cloud Run revision before changing traffic. Firebase Hosting uses a pinned Cloud Run tag in the configured rewrite to keep a Hosting release aligned with an API revision.

After rollback, verify:

- Hosting `/api/health` returns the prior expected build ID.
- One known test approval can be opened.
- Wrong-account rejection still works.
- No final approval record was changed as part of rollback.

Do not roll back Firestore business data merely because application code was rolled back.

## Recovery principles

- Approval state and audit records are authoritative in Firestore.
- Quotation PDFs remain private in Cloud Storage.
- Google Sheets can be rebuilt/reconciled from Firestore if required.
- Notifications are downstream effects and may be retried.
- No setup or recovery script may clear production collections, buckets, or reporting data.

## Severity and escalation

Use a simple incident classification:

- **SEV-1:** company-wide inability to process critical quotation approvals, suspected loss/corruption of authoritative data, security compromise, or production administrative lockout.
- **SEV-2:** major function unavailable for multiple users but safe workaround exists; worker/notification outage while approval truth remains intact.
- **SEV-3:** isolated user/device/browser issue or non-critical reporting discrepancy.

For SEV-1, stop discretionary deployments, preserve logs/evidence, identify incident owner, activate Business Continuity Mode when appropriate, and avoid speculative data changes.

## Incident record minimum

Record:

- incident ID and severity;
- start/detection/restoration times;
- affected component/version/build ID;
- reporter and incident owner;
- customer/business impact;
- changes/actions taken;
- root cause when known;
- rollback/recovery evidence;
- follow-up actions and owner.

Do not store access tokens, refresh tokens, client secrets, passwords, or private keys in the incident record.

## Continuity evidence capture

After a stable production deployment and after material infrastructure changes, run `scripts/continuity-snapshot.ps1` and store the resulting evidence securely with the release record. The snapshot is designed to avoid secret payloads but still contains operational metadata; do not publish it publicly.

Before every production release, generate `scripts/release-manifest.ps1` and record the previous known-good build.

## If the platform is unavailable but quotations must continue

Use `BUSINESS_CONTINUITY.md`. Never fabricate application approvals or backdate audit records to make emergency manual processing look automated.
