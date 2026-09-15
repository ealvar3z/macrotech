# V0.2 Production-Readiness Audit

Audit target: the uploaded current V0.1 working source after the local fixes that had already passed the user's Node 24 typecheck, six original tests, and production build.

## Executive assessment

V0.2 is a substantial hardening release and is suitable for the **next controlled deployment/pilot step**. It is **not yet cleared for company-wide production use** because several live-environment gates cannot be proven by static source review: API revocation-check IAM, OAuth sender durability/verification, worker secrets/Eventarc wiring, and the full device/end-to-end matrix.

No live Firebase/Google Cloud resource was modified during this audit.

## Critical findings

None identified in the reviewed source after V0.2 fixes.

## High findings

### H-01 - Revoked-token verification required an additional runtime IAM permission

The API intentionally calls Firebase Admin token verification with revocation checking enabled. This performs an additional Authentication backend lookup. The previously created API service account had Firestore and Storage permissions but not the read-only Firebase Authentication permission required by this design.

**Disposition:** Code/documentation/script fixed. `scripts/iam-setup.ps1` now grants `roles/firebaseauth.viewer`. **Live IAM change remains a deployment gate** and must be executed/verified before API deployment.

### H-02 - Deployment script could have used the default Cloud Run runtime identity

The previous deployment path did not guarantee that Cloud Run would run under the dedicated API service account, which could defeat the least-privilege architecture.

**Disposition:** Fixed. Deployment explicitly supplies the dedicated runtime service account.

### H-03 - Pilot scaling configuration conflicted with the agreed cost posture

The earlier deployment automation used a nonzero minimum instance setting even though the pilot plan is scale-to-zero.

**Disposition:** Fixed. Pilot defaults are minimum `0`, maximum `10`.

### H-04 - Durable Gmail sender cannot remain in OAuth Testing mode

The worker uses Gmail `gmail.send` via an offline refresh token. External OAuth applications left in Testing have time-limited test authorizations/refresh tokens. That would eventually break a supposedly permanent notification service.

**Disposition:** Deployment blocker documented. Use only `gmail.send`, put the OAuth app into the appropriate production publishing state, and complete applicable sensitive-scope/brand verification before company-wide use. Secrets remain server-side in Secret Manager.

## Medium findings

### M-01 - Firebase configuration referenced a missing Firestore index file

`firebase.json` referenced `firestore.indexes.json`, but the uploaded source did not contain it.

**Disposition:** Fixed by adding an explicit indexes file.

### M-02 - Same idempotency key could be replayed with a different decision payload

The old behavior could interpret reuse of a request ID as idempotent without proving the action/comment matched.

**Disposition:** Fixed. An identical retry is idempotent; reuse with a different action or normalized comment returns `IDEMPOTENCY_CONFLICT`.

### M-03 - First-review timestamp was vulnerable to concurrent overwrite/duplicate audit behavior

**Disposition:** Fixed with a Firestore transaction and a deterministic first-review audit document.

### M-04 - Invalid/revoked session failures could surface as generic server errors

**Disposition:** Fixed known Firebase Authentication token errors to safe 401 responses.

### M-05 - Wrong-account response disclosed the assigned approver address

A holder of a forwarded link who signed in with another account did not need to know the assigned employee's address.

**Disposition:** Fixed. The server returns a generic wrong-account message.

### M-06 - Business fields used in email subjects were not explicitly protected against MIME header injection

**Disposition:** Fixed. Business single-line fields reject control characters and the worker sanitizes/encodes subject headers.

### M-07 - Frontend sign-in retry control was rendered without a working retry listener

**Disposition:** Fixed with a reusable sign-in render/action flow.

### M-08 - Reporting mirror new-row writes could race

Two workers could calculate the same next row.

**Disposition:** Fixed with Sheets append for new rows and a per-approval Firestore lease around mirror synchronization.

### M-09 - Outbox event races and crash recovery required stronger leasing semantics

**Disposition:** Fixed with claim states, retryable `LEASED` response, processing leases, sheet locks, and stale-created-notification suppression.

### M-10 - Service startup accepted malformed configuration too easily

**Disposition:** Fixed URL/origin, email, bucket, sheet name/ID, and port validation. Startup fails fast when required configuration is absent or malformed.

### M-11 - Cloud Run source Docker builds are not fully lockfile-reproducible per service

The root monorepo has a lockfile, but `gcloud run deploy --source api` and the service-local Dockerfile operate from the `api` build context, which does not contain its own service lockfile. Top-level runtime package versions are pinned, but transitive resolution can change across future container rebuilds.

**Disposition:** Partially hardened by pinning the Node container version. A later build-pipeline improvement should produce service-specific lockfiles or a root-context Cloud Build configuration before high-scale/compliance-sensitive operation. Not a blocker for the controlled pilot when the built revision is smoke-tested and retained for rollback.

### M-12 - Approver assignment currently trusts an authorized preparer's chosen email

Approval access is cryptographically enforced against that email, but the creation endpoint does not yet require the chosen approver to be present in an administrator-managed approver registry. A trusted preparer could therefore intentionally or accidentally assign a quotation to an external Google address.

**Disposition:** Documented for the employee-ready phase. Implement administrator-managed approver selection/registry before broad internal rollout; do not block the current controlled test accounts prematurely.

## Low / accepted pilot risks

- No App Check or application-layer rate limiter yet. Authenticated endpoints, unguessable approval IDs, Cloud Run max instances, and very low expected volume reduce pilot exposure; add stronger abuse controls as the public surface grows.
- Gmail delivery is at-least-once. There is a very small crash window after Gmail accepts a message but before Firestore records `emailSentAt`, so a retry could duplicate a notification. A duplicate is preferable to silently dropping a required notification; approval state itself remains transactional in Firestore.
- `reviewOpenedAt` is reflected in the Sheet on the next outbox-driven sync rather than generating a separate reporting event immediately. Firestore remains authoritative.

## Dependency audit

The project retains current modern Firebase/Google packages instead of forcing a breaking downgrade. The known npm advisory is transitive through Google/Firebase dependencies and `uuid` 9.x. The application does not directly invoke the affected uuid v3/v5/v6 external-buffer API. Do not use `npm audit fix --force`; track the upstream dependency chain and update normally when compatible patched transitive versions arrive.

## Automated test expansion

V0.1 had six core domain tests. V0.2.2 source contains **49 automated API/worker domain/schema/notification tests**, covering assigned-approver matching/privacy, status transitions, final-state immutability, idempotency payload conflicts, email normalization, request/approval IDs, Q Code/RFQ/inquiry validation, quotation path validation, correction comments, commercial snapshot validation/formatting, pre-approval data-check validation/status aggregation, CEO notification content, HTML escaping, non-mutating email actions, MIME header sanitization, human status labels, event-ID safety, and Firestore Eventarc document-path parsing.

Full integration behavior involving Firebase Authentication, Firestore transactions, Storage IAM, Gmail, Sheets, Eventarc, Hosting, and real browsers remains in the mandatory pilot test matrix and cannot be truthfully proven by isolated unit tests.

## Packaging cleanup

Removed local `.env`, stale `dist` outputs, `node_modules`, and backup `.bak` source from the distributable. Added `.gitignore`, `VERSION`, explicit Firestore indexes, security/architecture/operations/recovery docs, a roadmap, and controlled IAM/deployment scripts.

## Verification note

The uploaded V0.1 working source had already passed full typecheck, six tests, and build on the user's supported Node 24 environment before this audit. During the V0.2 audit, an attempted fresh dependency install in the audit container could not complete because that container provides Node 22/npm 10 and cannot reach the npm registry; the repository intentionally requires Node 24. Therefore the modified V0.2.2 package must run the documented `npm ci`, `npm run typecheck`, `npm test`, and `npm run build` gate on the user's Node 24.21.0 environment before deployment. This limitation is recorded rather than falsely reporting a test pass that did not occur.
