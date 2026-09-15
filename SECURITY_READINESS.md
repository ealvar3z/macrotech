# Security and pre-approval readiness

## Verdict

**Suitable for further offline development and controlled Windows evaluation; NOT a production or connected-staging release.** This was a source/offline audit, not a new inspection of authenticated cloud consoles. No current infrastructure ownership, billing, IAM or deployed-service state is certified here.

The desktop remains a local pilot with simulated roles. Server controls have been implemented and unit-tested in backend source, but are not governing the desktop until the integration is completed and separately tested.

## Requirement coverage

| Requirement | Implemented / preserved evidence | Remaining gate |
|---|---|---|
| Discount + Total After Discount | Domain validation, editor/review totals, customer projections/PDF and email preview; invalid/zero/repeat cases tested | Native UI and real email-client rendering |
| Buyer → Offer → Supplier | Existing React hierarchy retained; accessible expand state added | Smooth animation, long text and scaling on Windows |
| Visible notifications | Top toast, sticky status, existing notification queue retained | Small-screen/native overlap check |
| Safe deletion | Existing eligible-draft-only desktop gate preserved; backend v1 uses locked, recoverable tombstones | Windows confirmation/recovery check |
| No employee Master controls | UI role conditions and bridge restrictions retained; offline regression passes | Native navigation review; real server identity integration |
| Approved actions | Final PDF, customer compose, PO recording and new revision retained; recall policy separate | Full native click sequence |
| Extra customer attachments | Optional managed copies, content/type/size/hash checks, missing/changed indicators | Native picker; scanning/quarantine and safe cloud upload |
| Internal approval vs customer PO | Separate statuses; partial quantities supported; excess/unknown values denied | Real multi-device refresh and business acceptance review |
| Alternate suppliers private | Internal options retained; allowlisted customer projection and PDF exclude suppliers/cost notes | Server-generated PDF pipeline |
| Final low-ink Terms | Mandatory separate final section/page, original wording preserved; synthetic PDF rendered | Long/many-line and printer checks; commercial approval of any future wording changes |
| Approval email preview | Responsive app-theme HTML, conditional discount/final total, Approve/Reject/View Record; all preview links inert | Cross-client rendering; no delivery attempted |

## Implemented backend controls

- Firebase token-verification middleware retains signature/revocation checks and verified email. Active server `users/{uid}` membership and allowed roles are checked, rather than trusting client role strings or an email bootstrap bypass.
- Submission and decision use assigned approver UID in v2. Self-approval, including an admin's own quote, fails unless server policy explicitly permits it. Revoked roles and policy changes are rechecked.
- Submitted snapshots include internal commercial inputs, a separately allowlisted customer projection, versioned Terms and pinned file references. Hash integrity and version checks prevent stale/changed review decisions.
- Idempotency IDs are actor-scoped; reused IDs with changed content conflict. The transaction writes snapshot/status, Q-Code counter, receipt, audit and outbox together. Tests inject concurrent retries and commit failure.
- Expiry is an explicit server policy; absent/invalid expiry policy fails closed. Recall invalidates review. Return-for-correction preserves prior snapshot and requires a new revision.
- Partial/full customer PO is recorded separately, with exact quantity comparisons and its own audit event. Recording PO is not an instruction to send mail or fulfil an order.
- API logs use correlation IDs, route patterns, status and duration, not bodies, tokens, query strings or raw exceptions. Worker failure codes are redacted. Audit records contain business data and need protected access/retention.
- Private file manifests require owner, quotation, revision, CLEAN status, allowed type, bounded bytes, object generation and SHA-256. These checks do not themselves upload, scan or prove that the PDF matches the commercial snapshot.
- Outbox delivery uses a lease/fencing state machine. Explicit pre-send rejection may retry with backoff, at most five attempts. Timeout/unknown acceptance becomes UNCERTAIN for reconciliation; do not blindly resend. Exactly-once email delivery is NOT claimed.

Firestore transaction callbacks can retry and must not perform email/file-provider side effects; this design keeps them outside the transaction. See [Firestore transaction documentation](https://firebase.google.com/docs/firestore/manage-data/transactions).

## Record contracts prepared in source

| Collection | Intended contents |
|---|---|
| users | Verified UID/email, active flag, role, employee code; server-administered |
| workflowPolicy/approval | Explicit self-approval permission and approved expiry hours |
| workflowQuotations | Owner, current revision/version/status, Q-Code, structured snapshot/customer projection, PO data |
| workflowApprovals | Immutable commercial snapshot/hash/files; separate decision/recall metadata |
| workflowRequests | Actor-scoped request hash and authoritative replay result |
| qCodeCounters | Year/employee high-water mark, verified bootstrap flag |
| privateFiles | Trusted, revision-bound file metadata; not PDF bytes |
| notificationOutbox | Durable pending/retry/sent/uncertain/dead jobs and lease metadata |
| workflowAudit | Append-created business events with actor, request correlation and timestamp |

V2 commercial values use exact rational arithmetic internally and integer cent outputs. Source snapshots are capped at 400,000 UTF-8 bytes to leave room for projections/metadata. Annual counters use the existing backend's four-digit sequence and UTC year. Desktop simulation retains its existing demo allocator. Before integration, reconcile code-width/year-boundary behavior and approved employee prefixes; do not rewrite historical codes or scan a live Tracker on each allocation.

## Potential security / architecture issues

1. **Local roles and JSON are not a security boundary.** A local user can alter files; local audit history is not tamper-proof. The single bridge lock does not coordinate multiple processes or computers. Never share the JSON directory as a database.
2. **The v2 integration is unfinished.** Desktop transport, the existing v1 portal, document-processing lifecycle and notification dispatcher are not wired to v2. Deploying only these modules would not complete the user workflow.
3. **PDF/Q-Code lifecycle needs integration work.** V2 currently expects a trusted PDF manifest before submission, while the Q-Code is allocated in submission. A server render/finalization stage must bind the assigned Q-Code, final discount and exact snapshot to the reviewed PDF before connected acceptance testing. An uploaded PDF or CLEAN flag is not proof of commercial fidelity. Do not fake manifests to bypass this gap.
4. **Legacy migration is not supplied.** v1 now requires policy/active membership and snapshot/file metadata that older records may lack. Missing data fails closed. Inventory, migration fixtures and rollback tests are required before deploying over any existing service. v2 collections deliberately do not feed the old worker.
5. **Application immutability is not privileged-admin immutability.** `workflowAudit` is append-created by code but a sufficiently privileged Admin SDK identity can alter Firestore. Client rules do not restrict server SDK access; IAM and protected retention/export design remain necessary. [Firebase server SDK/rules distinction](https://firebase.google.com/docs/firestore/security/rules-conditions).
6. **Attachment checks are not malware scanning.** PDF header validation does not neutralize JavaScript or active content. Office structural checks are defensive but incomplete. Cloud quarantine/scanning and authenticated, generation-pinned downloads remain unimplemented integration work.
7. **Secrets/runtime configuration remain external.** No secret files are shipped; scan found no known credential patterns. Heuristic scans can miss arbitrary formats. Never embed service-account keys, refresh tokens or client secrets in the Windows package.
8. **Browser/Windows/dependency gates remain open.** No new browser interaction proof, signed EXE, clean install or current advisory-database audit. Static/transaction-double success is not a guarantee of real cloud behavior or flawless UI.
9. **Operational readiness is incomplete.** Alert routing, backups/restoration, retention, recovery, rate limiting, quotas, scan workers, uncertain-mail reconciliation and update signing are not configured or certified.
10. **Configuration families are not interchangeable.** Root Firebase/rules files describe the inherited desktop emulator demo; staging_backend contains a separate server-mediated design whose Firestore client rules deny direct access. Do not combine those configurations or deploy inherited project-target files without a separate review. No rule/adapter combination was emulator-tested here.

## Recommended staging architecture — design only

Use a verified, isolated Macrotech staging environment, never a project chosen merely because its name contains test. Inspect existing candidates before any reuse/create decision. Do not create a new project now. Separate staging from production for routine releases, consistent with the existing policy and [Firebase environment guidance](https://firebase.google.com/docs/projects/dev-workflows/general-best-practices).

Authenticated Windows client and mobile review portal call a server-authorized API. The API owns structured quotations, transactional Q-Codes, immutable review snapshots and audit events. Private Storage holds document bytes; Firestore holds protected references. A trusted render/scan pipeline finalizes files; a durable outbox dispatches allowlisted internal test notifications. Approval confirmation is a signed-in POST, never a mutating email GET. Customer email remains separately approved and disabled during this phase.

### Least-privilege service-account design

| Identity | Intended privileges | Excluded privileges |
|---|---|---|
| API runtime | Required staging database operations, token/user verification, required private-object reads | Gmail credentials, project Owner/Editor, deployment, arbitrary buckets |
| Render/scan worker | Quarantine reads, validated-object creation, trusted manifest/finalization interface | Employee approvals, Gmail, project administration |
| Notification worker | Required outbox/approval reads/updates and access to only its mail secret | Cloud deployment, broad storage mutation, user/role administration |
| Deployment identity | Approved staging build/deploy and necessary service-account attachment only | Day-to-day runtime use, mailbox access |
| Human administrators | Named accounts, approved admin roles and recovery/MFA | Shared credentials or silent role escalation |

These are design requirements, not applied IAM bindings. Where Firestore IAM cannot isolate individual collections, use a narrowly scoped service interface or appropriate project/database isolation; do not claim per-collection isolation from client rules. Use attached workload identities rather than downloaded keys, following [Cloud Run service identity guidance](https://docs.cloud.google.com/run/docs/securing/service-identity).

## Next gates

Finish source integration with offline doubles, then Windows UI/build verification, approved staging policy and migration fixtures, emulator integration, and only then separately authorized cloud/OAuth/mail setup and end-to-end tests. Stop before every protected service change, user verification, permission/billing choice or actual email send.
