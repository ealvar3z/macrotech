# Changelog — 0.9.0-readiness.2

Desktop baseline: 0.8.0-demo. Backend baseline: cloud_app 0.2.7-3; successor: 0.3.0-readiness.1. Minor prereleases identify new workflow contracts without making a stable-release claim. Existing release-policy gates remain mandatory.

## Readiness.2 Windows correction

- Corrected the attachment-security test fixture for ordinary Windows accounts that cannot create symbolic links (`WinError 1314`). The security rejection is still tested on every platform, and a real symbolic link is additionally tested where supported.
- Kept the application attachment validator unchanged; this correction does not relax its symlink protection.

## Desktop and documents

- Added app-themed approval-email preview with conditional discount, final total and three inert actions; responsive CSS and sandboxed iframe. Nothing is sent.
- Added reviewer return-for-correction and corrected-revision UI. Submitted revisions remain locked and preserved.
- Added stale-save timestamps and review epochs; recalled approvals cannot be reused by stale payloads. Serialized mutation calls and save acknowledgements reduce autosave/submit races.
- Tightened invalid discounts, zero-discount reset and conflicting repeated decisions. Caller-provided names do not establish reviewer identity. CEO self-approval requires explicit demo policy.
- Made local submission receipts recoverable after draft-store/outbox interruption, with deterministic audit/outbox deduplication. Submitted quotations survive receipt creation failure.
- Removed local audit-history truncation; corrected the label to say it is not tamper-proof.
- Added attachment content/type/size/Office-archive checks and managed-file hashes; blocked traversal IDs, symlinks, disguised executables and changed/missing files. This is not malware scanning.
- Preserved buyer → offer → supplier hierarchy, selected-only customer output, approved actions, partial customer PO, eligible-draft-only deletion and employee Master-control restrictions.
- Added expansion accessibility state, keyboard focus, reduced-motion support, top notifications and sticky status. Windows interaction/visual testing remains required.
- Preserved the mandatory final low-ink Terms page and commercial wording. Widened the PDF ITEM column; rendered and inspected the synthetic PDF.
- Aligned version/data/output paths and Windows builder checks. No Windows binary created.

## Backend source

- Added v2 Firestore transaction adapter and injectable workflow: exact pricing, version compare-and-set, immutable snapshot hash, server roles, self-approval policy, expiry/recall and idempotency receipts.
- Added transactional annual employee Q-Code allocation, audit events, private-file manifests, explicit customer projection and atomic outbox writes.
- Added partial/full customer PO state distinct from approval, with exact decimal comparison.
- Added provider-neutral delivery state machine: leases, fencing, capped retries, backoff and UNCERTAIN handling after ambiguous delivery.
- Hardened v1 roles, snapshot checks, stable request IDs, pinned PDF object generation and recoverable draft tombstones. New policy/manifest requirements fail closed on unprepared legacy data; no migration performed.
- Added redacted structured API logs/correlation IDs; removed raw worker/Tracker error details from stored statuses/logs.
- Updated notification source to three review-only actions. Sign-in and confirmation are still required.

## Tests and boundaries

Added concurrency, interruption, role revocation, self-approval, stale/expired revision, invalid discount, privacy, document-size, precise PO quantity, attachment integrity and ambiguous-delivery tests. See TEST_RESULTS.md.

No dependencies upgraded, real credentials generated, services deployed or provider configuration changed.
