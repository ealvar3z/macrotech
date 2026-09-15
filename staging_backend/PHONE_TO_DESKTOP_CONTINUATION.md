# Macrotech Staging Connection Continuation

## Completed while working from the phone

- Confirmed Firebase project `macrotech-approval-production` is accessible through `macrotech.quotations@gmail.com`.
- Confirmed Google sign-in, Firestore, Firebase Hosting, and the authenticated Cloud Run API work.
- Completed a requester-to-assigned-approver test using two different Google accounts.
- Confirmed the approval changed to `APPROVED` and wrote a separate audit record.
- Confirmed email/reporting events are created but stranded at zero attempts.
- Located the separate blank Google Sheet `Macrotech Approval Test Log`.
- Confirmed its only tab is `Approval Test`.
- Expanded that blank test tab from 26 to 33 columns so it can accept the worker's A:AG reporting schema.
- Confirmed the existing test Sheet already grants Editor access to the dedicated worker identity `macrotech-approval-worker-test@macrotech-approval-production.iam.gserviceaccount.com`.
- Confirmed Cloud Run has a healthy API service `macrotech-approval-api-test` in `asia-east1`, revision `macrotech-approval-api-test-00001-4tg`.
- Confirmed Eventarc has no triggers.
- Confirmed Secret Manager has no secrets.
- Confirmed visible service accounts include the default Compute Engine identity, Firebase Admin SDK identity, `macrotech-approval-api`, and `macrotech-approval-worker-test`.
- Prepared staging-locked worker preflight, Gmail OAuth, and deployment scripts that reuse that identity.
- Prepared version `0.2.7.2-discount-approval-notifications`: optional discount percentage, monetary discount, and total after discount now flow through the API, approval page, final confirmation, and both email types. Blank discounts stay hidden.
- Prepared version `0.2.7.3-application-themed-approval-email`: approval emails now use the same Macrotech visual language and official logo as the Windows application, including matching status treatments and green buttons.
- Aligned the packaged Firebase default project and Hosting rewrite with the verified staging project `macrotech-approval-production` and API service `macrotech-approval-api-test`.

## Files to run later from Windows PowerShell

Run from the extracted cloud-app source root.

1. Authenticate and lock the CLI to the existing project:

```powershell
gcloud auth login macrotech.quotations@gmail.com
gcloud config set account macrotech.quotations@gmail.com
gcloud config set project macrotech-approval-production
```

2. Inspect current state without changing anything:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\staging-worker-preflight.ps1
```

3. In Google Cloud Console, configure the OAuth consent screen for the controlled test sender and create a **Desktop app** OAuth client. Download the client JSON. Do not paste its contents into chat.

4. Store Gmail OAuth values directly in Secret Manager without printing them:

```powershell
node .\scripts\configure-gmail-oauth.mjs "$env:USERPROFILE\Downloads\YOUR_OAUTH_CLIENT_FILE.json"
```

Complete Google sign-in and consent in the browser as `macrotech.quotations@gmail.com`.

5. Review the exact plan without making cloud changes:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\deploy-staging-worker.ps1
```

6. Apply after the targets are verified:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\deploy-staging-worker.ps1 -Apply
```

7. The test log is already shared with the worker identity. Verify that permission remains **Editor**; do not add a duplicate worker account.

8. Create a brand-new internal approval test. Existing outbox records will not automatically trigger a new document-created event.

9. Deploy the staged API/web build from version 0.2.7.3 before testing the new discount display. The worker deployment installs the matching application-themed email templates and embedded official logo, but the API and Hosting build must also be updated for the new input and approval-page fields. Preserve the existing `macrotech-approval-api-test` service configuration and use the existing Firebase Hosting test channel; do not run the generic production deployment script without reviewing every target.

## Expected successful result

For both the new `APPROVAL_CREATED` and `APPROVAL_DECIDED` outbox records:

- `attempts` is at least 1.
- `emailSentAt` is populated.
- `sheetSyncedAt` is populated.
- `processedAt` is populated.
- `lastError` is empty or null.

## Safety locks built into the scripts

- Refuses any project other than `macrotech-approval-production`.
- Refuses any active account other than `macrotech.quotations@gmail.com`.
- Refuses any region other than `asia-east1`.
- Uses only `Macrotech Approval Test Log`, tab `Approval Test`.
- Requires an explicit `-Apply` switch before changing cloud resources.
- Never prints Gmail client secrets or refresh tokens.
- Grants secret access only on the three worker secrets.
- Keeps the worker private and grants invocation only to its Eventarc identity.
- Does not touch the live 2026 Master Tracker or Dummy Tracker.
- Does not send customer email.
- Leaves the live Master Tracker, Dummy Tracker, and their formulas unchanged; discount remains an approval snapshot field only.
