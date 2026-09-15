# Macrotech Firebase / Google Cloud Infrastructure Audit

**Audit date:** September 12, 2026  
**Project:** Macrotech Approval Production  
**Project ID:** `macrotech-approval-production`  
**Intended administrative account:** `macrotech.quotations@gmail.com`  
**Current disposition:** Pilot/test environment; not cleared for production use

## Executive conclusion

Reuse the existing `macrotech-approval-production` project as the **controlled staging/pilot environment** for the current connection work. It already has working Firebase Authentication, Firestore, Hosting, and an authenticated Cloud Run API. Do not create another staging project merely because the notification worker is incomplete. Before Macrotech goes live, create a separate clean production project with an unambiguous production name and migrate only reviewed configuration and releases.

The authenticated approval workflow passed an end-to-end state-change test on September 12, 2026. A requester submitted an internal test quotation, the assigned approver opened it with a different Google account, and the approver successfully approved it. Firestore recorded both the authoritative `APPROVED` status and a separate audit record. Email delivery did not run because both the creation and decision outbox events remain unprocessed with zero attempts.

## EXISTS AND REUSABLE

| Component | Verified state | Evidence / notes |
|---|---|---|
| Google/Firebase project | Exists | Display name `Macrotech Approval Production`; Project ID `macrotech-approval-production` |
| Administrative access | Exists | Firebase Console is accessible while signed in as `macrotech.quotations@gmail.com`; exact IAM ownership hierarchy still requires Google Cloud Console verification |
| Billing linkage | Exists | Blaze plan linked to Google Cloud Free Trial; console showed $300 remaining and 88 days remaining on audit date |
| Firebase Authentication | Working | Google sign-in enabled; test users `kelvinkcastro@gmail.com` and `kelvinkcastro12@gmail.com` authenticated successfully |
| Firestore | Working | `(default)` database, Native mode behavior, region `asia-east1`; authoritative collections include `approvals` and `outbox` |
| Firestore approval authorization | Working | Only the assigned approver account could complete the test decision |
| Audit history | Working | Approval contains an `audit` subcollection with submit, review-opened, and decision events |
| Firebase Hosting | Working | Preview URL is online and serves deployed build `approval-test-v0.2.4` |
| Authenticated API | Working | `/api/health` returned healthy; unauthenticated approval API access returned `401 AUTH_REQUIRED` |
| Cloud Run API service | Working | `macrotech-approval-api-test` in `asia-east1`; healthy revision `macrotech-approval-api-test-00001-4tg` |
| Server-side approval transition | Working | Test approval changed transactionally from `PENDING_REVIEW` to `APPROVED` |
| Outbox creation | Working | Creation and decision events were written automatically by the API |

## EXISTS BUT NEEDS CONFIGURATION

| Component | Current state | Required work |
|---|---|---|
| Notification/reporting worker design | Source and a dedicated service account exist | Deploy the private Cloud Run worker after its secrets and destination configuration are completed |
| Gmail notification integration | Code exists, live delivery absent | Configure verified OAuth credentials for `macrotech.quotations@gmail.com` in Secret Manager and confirm durable authorization |
| Google Sheets reporting mirror | Code exists, live synchronization absent | Point only to a dedicated test reporting sheet/tab and share that test sheet with the worker service account; never use the live 2026 Master Tracker for pilot testing |
| App Check | Console recommends configuration | Evaluate and enable for production after compatibility testing; current server-side bearer-token authorization remains the active protection |
| Environment naming | Functional but misleading | Document this project as staging/pilot despite the `production` Project ID; use clear display names, labels, and deployment manifests |
| Desktop application connection | Preparation package exists | Replace local-only adapter/settings with the authenticated cloud client and connect it to the reviewed staging endpoints |

## MISSING OR NOT LIVE-VERIFIED

| Component | Status |
|---|---|
| Cloud Run worker service | Missing; the Cloud Run inventory contains the healthy API test service but no notification worker service |
| Eventarc trigger | Missing; the Eventarc Triggers page is empty |
| Secret Manager secrets | Missing; the Secret Manager list is empty |
| Functional email worker execution | Missing from the tested flow: outbox `attempts=0`, `emailSentAt=null`, and `processedAt=null` |
| Firebase Cloud Functions | No functions are deployed in Firebase Functions; the console shows **Get started** |
| Dedicated Eventarc delivery service account | Missing; no `macrotech-approval-eventarc-test` identity exists yet |
| OAuth client and consent-screen publication state | Not live-verified |
| Enabled Google APIs inventory | Not live-verified |
| Exact IAM role bindings | Not live-verified |
| Logging, monitoring, alert policies, and log retention | Not live-verified |
| Budget alert thresholds and recipients | Billing is linked, but alert configuration is not live-verified |
| Cloud Storage bucket inventory | Source expects a private quotation bucket; live bucket presence and IAM were not verified |
| Formal staging/production separation | Missing; only the current pilot project is confirmed |
| Application update/version service for Windows clients | Not yet connected to the deployed cloud environment |

## POTENTIAL SECURITY / ARCHITECTURE ISSUES

1. The Project ID says `production` while the deployed application and data are pilot/test. This raises the risk of future operators deploying real workloads into the wrong environment.
2. Email and reporting outbox events are stranded. Both the earlier September 10 event and the September 12 test event show zero attempts, which points to a missing or disconnected Eventarc/worker path rather than a transient Gmail error.
3. Secret Manager currently contains no secrets, so the Gmail worker cannot start with its required OAuth configuration.
4. A future Gmail OAuth client left in Google **Testing** status can issue refresh tokens with limited durability. The consent-screen state must be reviewed before relying on unattended notifications.
5. The current free trial is temporary. Budget alerts, spending limits/controls, and ownership contacts must be confirmed before production use.
6. App Check is not configured. Production hardening should add it after verifying the Windows/client authentication flow.
7. The desktop v0.8.0 package remains local-first and deliberately disables email sending. It is not yet a connected production client.
8. The current approval test accepted a blank approver comment. If Macrotech requires a reason or acknowledgment, the form and API should enforce that business rule explicitly.
9. Firestore is authoritative; any Google Sheet must remain a reporting mirror. The live 2026 Master Tracker must not be used as a pilot destination.

## TEST RESULT: SEPTEMBER 12, 2026

| Step | Result |
|---|---|
| Requester authentication (`kelvinkcastro@gmail.com`) | PASS |
| Submit internal approval request | PASS |
| Firestore approval creation | PASS |
| Assigned-approver enforcement | PASS |
| Approver authentication (`kelvinkcastro12@gmail.com`) | PASS |
| Approval page opened | PASS |
| Approved button / server-side decision | PASS |
| Authoritative status changed to `APPROVED` | PASS |
| Decision attributed to correct approver | PASS |
| Separate audit entry created | PASS |
| Creation email notification | FAIL / NOT PROCESSED |
| Decision email notification | FAIL / NOT PROCESSED |
| Sheet reporting mirror | NOT PROCESSED |

Test approval ID: `1OuihARX5-GkDkO53Aa6p5PQK9ox4B3ya-luK5O5gjE`  
Test Q Code: `TEST-20260912-01`

## RECOMMENDED STAGING ARCHITECTURE

Use the existing project as the current staging/pilot environment:

- Firebase Authentication with Google sign-in for employees and approvers.
- Firebase Hosting for the browser approval interface.
- Private Cloud Run API for authorization, workflow rules, audit writes, and transactional Q-Code allocation.
- Firestore as the authoritative shared database for quotations, statuses, allocation counters, and audit history.
- Private Cloud Storage for generated quotation files.
- Transactional outbox in Firestore.
- Private Cloud Run worker invoked by Eventarc for Gmail notifications and a dedicated test Sheet mirror.
- Secret Manager for Gmail OAuth credentials, with access granted only to the worker identity.
- Cloud Logging, error alerts, failed-event monitoring, budget alerts, and release/build IDs.
- A separate production project before company launch, with reviewed IAM and no copied pilot data unless deliberately migrated.

## RECOMMENDED NEXT ACTIONS

1. Use the existing `macrotech-approval-worker-test@macrotech-approval-production.iam.gserviceaccount.com` identity, which already has Editor access to the dedicated blank test reporting Sheet.
2. Create the three named Gmail OAuth secrets through the prepared user-controlled authorization helper; Secret Manager is currently empty.
3. Deploy the private `macrotech-approval-worker-test` Cloud Run service.
4. Create the missing Eventarc document-created trigger so new `outbox/{eventId}` documents invoke the private worker with retries.
5. Configure a dedicated test reporting Sheet and verify headers before granting the worker access. Do not point the worker at the live 2026 Master Tracker or Dummy Tracker.
6. Re-run the same requester-to-approver test and require `emailSentAt`, `sheetSyncedAt`, and `processedAt` to populate for both creation and decision events.
7. Connect the Windows application to staging only after the cloud worker test passes, then test safe concurrent submissions and transactional Q-Code allocation from two computers.
8. Add monitoring for unprocessed outbox events, API errors, worker failures, and budget thresholds.
9. Before production, create a separate clean production project, review least-privilege IAM, move the OAuth consent configuration to an appropriate durable state, and deploy a reviewed release.

## Protected boundaries maintained during this work

- No live 2026 Master Tracker writes.
- No Dummy Tracker changes.
- No customer emails.
- No production Gmail modification.
- No OAuth configuration changes.
- No secrets or credentials viewed, copied, regenerated, or exposed.
- No new Firebase/GCP project created.
