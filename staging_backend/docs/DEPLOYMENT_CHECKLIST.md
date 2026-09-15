# Production Deployment Checklist

This checklist separates the **current controlled pilot** from the later company-wide production release. Do not skip a gate because a service happens to deploy successfully.

## Current foundation already established

- [x] Firebase / Google Cloud project: `macrotech-approval-production`.
- [x] Cloud Billing enabled with budget alerting.
- [x] Firestore Native mode in `asia-east1`.
- [x] Private quotation bucket: `macrotech-approval-production-quotations` in `asia-east1`.
- [x] Public Access Prevention enabled on the quotation bucket.
- [x] Firebase Authentication enabled with Google provider.
- [x] Firebase web app registered and Hosting configured in source.
- [x] API runtime service account created: `macrotech-approval-api@macrotech-approval-production.iam.gserviceaccount.com`.
- [x] API service account granted `roles/datastore.user`.
- [x] API service account granted bucket-level `roles/storage.objectViewer`.
- [ ] **Required before API deployment:** grant API service account `roles/firebaseauth.viewer` because revoked-token checking is enabled.

## Local release gate

Run from repository root on Node 24.21.0 / npm 11.19.0:

```powershell
node --version
npm --version
npm ci
npm run typecheck
npm test
npm run build
```

Expected release state:

- Typecheck: zero errors.
- Automated tests: all pass.
- Build: all three workspaces succeed.
- No `.env`, credential, `.bak`, `node_modules`, or stale `dist` content is committed/distributed as source.
- Review `npm audit --omit=dev`; do not use `npm audit fix --force` to silence a transitive finding by downgrading Firebase Admin.

## APIs to enable before first API deployment

At minimum for the API/Hosting phase:

- Cloud Run API (`run.googleapis.com`)
- Cloud Build API (`cloudbuild.googleapis.com`)
- Artifact Registry API (`artifactregistry.googleapis.com`)
- Firestore API (`firestore.googleapis.com`)
- Cloud Storage API (`storage.googleapis.com`)
- Identity Toolkit / Firebase Authentication service as required by the project

For the worker phase also enable:

- Eventarc API (`eventarc.googleapis.com`)
- Pub/Sub API (`pubsub.googleapis.com`)
- Secret Manager API (`secretmanager.googleapis.com`)
- Gmail API (`gmail.googleapis.com`)
- Google Sheets API (`sheets.googleapis.com`)

## API deployment gate

- [ ] Run `scripts/iam-setup.ps1` and verify the three API permissions.
- [ ] Restore `web/.env` locally from the known Firebase web configuration; never put Gmail OAuth credentials there.
- [ ] Set `PUBLIC_APP_URL=https://macrotech-approval-production.web.app`.
- [ ] Set `QUOTATION_BUCKET=macrotech-approval-production-quotations`.
- [ ] Use the dedicated API service account explicitly.
- [ ] Pilot Cloud Run minimum instances = **0** and maximum instances = **10**.
- [ ] Deploy API to `asia-east1`.
- [ ] Confirm direct `/api/health` returns the expected build ID.
- [ ] Deploy deny-all Firestore browser rules and Firebase Hosting.
- [ ] Confirm Hosting `/api/health` returns the same build ID.
- [ ] Do not deploy the worker in the same step until its secrets and identities are complete.

## Preparer/bootstrap gate

- [ ] Establish `users/{uid}` role documents for authorized preparer/admin accounts.
- [ ] If `BOOTSTRAP_ADMIN_EMAIL` is temporarily used, document the reason and removal date.
- [ ] Remove `BOOTSTRAP_ADMIN_EMAIL` after the real role records are verified.
- [ ] Confirm a normal signed-in user without preparer/admin role cannot create an approval.

## Worker identity and Eventarc gate

Use separate identities for execution and event delivery.

Worker runtime service account needs only what it uses:

- `roles/datastore.user` on the project.
- Secret Manager accessor on the **specific Gmail OAuth secrets**, not all secrets if avoidable.
- Direct edit access to the dedicated reporting spreadsheet by sharing that spreadsheet with the worker service-account email.

Eventarc trigger service account needs:

- `roles/eventarc.eventReceiver` on the project.
- `roles/run.invoker` on the private `macrotech-approval-worker` Cloud Run service.

Create a Firestore **document-created** trigger in `asia-east1` for:

- Event type: `google.cloud.firestore.document.v1.created`
- Database: `(default)`
- Document path pattern: `outbox/{eventId}`
- Destination: private `macrotech-approval-worker`

Do **not** configure one-shot/no-retry delivery. The outbox worker is designed for normal Eventarc retry behavior.

## Gmail/OAuth production gate

- [ ] Use only the `https://www.googleapis.com/auth/gmail.send` Gmail scope.
- [ ] Create the OAuth client for the controlled sender account.
- [ ] Store client ID, client secret, and refresh token in Secret Manager.
- [ ] Do not leave an External OAuth app in **Testing** for a durable production sender; testing authorizations/refresh tokens are time-limited.
- [ ] Complete the applicable Google OAuth brand/sensitive-scope verification or adopt a future Macrotech Workspace-managed sender design.
- [ ] Send live tests to at least Gmail and one non-Gmail mailbox.
- [ ] Confirm From/Reply-To identity is correct and no secret is present in logs.

## Google Sheet reporting mirror gate

- [ ] Create a dedicated `Production Approvals` tab or separate production spreadsheet.
- [ ] Do not overwrite the Apps Script prototype `Approvals` tab.
- [ ] Set `APPROVAL_SHEET_ID` and `APPROVAL_SHEET_NAME` on the worker only.
- [ ] Confirm headers exactly match the worker's expected schema.
- [ ] Test create, approve, and return synchronization.
- [ ] Intentionally make Sheets unavailable and confirm approval decisions still commit in Firestore.

## Required staging/pilot integration tests

- [ ] Correct assigned approver can view approval and PDF.
- [ ] Wrong Google account receives 403 and cannot view approval details or PDF.
- [ ] Signed-out user is prompted to sign in.
- [ ] Revoked/disabled session is rejected.
- [ ] Forwarded approval link cannot be used by another account.
- [ ] Direct browser Firestore read/write is denied.
- [ ] Return without a comment is rejected.
- [ ] Double-click and two-tab duplicate decisions result in one final state.
- [ ] Concurrent Approve vs Return results in exactly one final state.
- [ ] A final decision cannot be overwritten.
- [ ] Worker retries temporary Gmail/Sheets failures.
- [ ] Sheet header mismatch causes a safe refusal rather than overwrite.
- [ ] Private PDF cannot be fetched anonymously.
- [ ] Health endpoint reports the release build ID.

## Device/browser gate

Test the actual email-to-browser flow on iPhone Safari, iPhone Chrome, Android Chrome, desktop Chrome, desktop Edge, and a private/incognito browser. Repeat with correct account, wrong account, multiple Google accounts, and no active Google session.

## Company-wide release gate

Before opening the system to all employees:

- [ ] Controlled pilot has passed all integration/device tests.
- [ ] OAuth sender is durable and no longer dependent on short-lived Testing authorization.
- [ ] Rollback procedure has been exercised.
- [ ] Firestore backup/export policy is configured.
- [ ] Monitoring/alert ownership is assigned.
- [ ] A separate staging project is created before routine future releases.
- [ ] Administrator runbook is stored with the product documentation.

## CEO commercial notification gate

- [ ] Dedicated reporting tab is blank or intentionally migrated to the V0.2.2 A:AD header schema.
- [ ] Approval test email shows Total Amount and Markup before the review button.
- [ ] Approval portal repeats Total Amount and Markup before Approve/Return.
- [ ] Email link does not alter approval state until authenticated portal confirmation.
