# Staging Connection Preparation Verification

**Date:** September 12, 2026

## Verified local release checks

- `npm ci`: PASS
- TypeScript type checks for web, API, and worker: PASS
- API automated tests: 63 passed, 0 failed
- Worker automated tests: 21 passed, 0 failed
- Web production build: PASS
- API TypeScript build: PASS
- Worker TypeScript build: PASS
- Gmail OAuth helper syntax check: PASS

## Dependency audit

`npm audit --omit=dev` reported no high or critical vulnerabilities. It reported six moderate dependency-chain findings associated with `firebase-admin` -> `@google-cloud/storage` -> request helpers -> `uuid`. No forced dependency rewrite was applied because that could change the reviewed Firebase dependency graph. Review updated compatible package versions before a later production release.

## Live staging evidence

- Cloud Run service: `macrotech-approval-api-test`, region `asia-east1`
- Healthy revision: `macrotech-approval-api-test-00001-4tg`
- Hosted API health payload: service label `macrotech-approval-api`, build `approval-test-v0.2.4`
- Requester sign-in: PASS
- Assigned approver sign-in and authorization: PASS
- Approval decision transaction: PASS
- Firestore authoritative status: `APPROVED`
- Decision audit entry: PASS
- Outbox document creation: PASS
- Worker processing: FAIL / zero attempts
- Gmail email delivery: NOT RUN
- Eventarc trigger inventory: empty
- Secret Manager inventory: empty
- Test Sheet: `Macrotech Approval Test Log`, tab `Approval Test`
- Test Sheet grid: expanded from 26 to the required 33 columns; cells remain blank
- Existing worker identity: `macrotech-approval-worker-test@macrotech-approval-production.iam.gserviceaccount.com`
- Existing test Sheet permission for worker identity: Editor
- Other visible service accounts: default Compute Engine, Firebase Admin SDK, and `macrotech-approval-api`

## Deployment safety

The prepared worker scripts:

- lock the target to `macrotech-approval-production`;
- require active account `macrotech.quotations@gmail.com`;
- require region `asia-east1`;
- reuse the existing worker test identity;
- target only the dedicated test reporting Sheet;
- default to plan-only mode;
- require `-Apply` for cloud changes;
- keep the worker private;
- grant secret access only on the three named Gmail OAuth secrets;
- never print OAuth client secrets or refresh tokens;
- stop if an existing Eventarc trigger points at an unexpected destination.

PowerShell parsing could not be executed in the Linux preparation environment because PowerShell was unavailable. The scripts were reviewed manually and must first be run in plan-only/preflight mode on Windows before `-Apply`.
