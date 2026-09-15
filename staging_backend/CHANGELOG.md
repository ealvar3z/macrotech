# Changelog

## 0.2.7.3 — Application-Themed Approval Email

- Restyled approval-request and approval-decision emails to match the Windows application design system: Macrotech green, dark green footer, pale green surfaces, white cards, familiar status pills, and matching primary/secondary buttons.
- Reworked the commercial summary to mirror the application's executive review hierarchy, including the prominent pre-discount Grand Total and separate discount/final-total treatment.
- Embedded the same official Macrotech logo used by the application as an inline email asset, avoiding an external image or public storage dependency.
- Retained table-based, inline email HTML and plain-text alternatives for reliable Gmail and mobile rendering.

## 0.2.7.2 — Discount Approval Notifications

- Added optional discount percentage, discount amount, and total-after-discount fields to the immutable commercial approval snapshot.
- Added a Discount (%) input to the isolated approval test form; the staged client calculates the discount amount and total after discount to two decimal places.
- Shows Discount and Total After Discount in the secure approval page, final confirmation, approval-request email, and approval-decision email only when a discount was supplied.
- Kept the original total visible so the approver can compare the pre-discount and final totals.
- Preserved legacy approvals and blank-discount submissions without displaying empty discount rows.
- Did not change any Tracker formula, Tracker column, customer email, or customer-facing quotation.

## 0.2.7.1 — Multi-Supplier Tracker Pilot

- Corrected generation so all supplier options are retained as repeated Dummy Tracker rows, with the selected supplier emitted first.
- Added a separate selected-only customer-quotation projection so alternate suppliers cannot enter customer-facing lines or calculations.
- Kept selected-supplier identity in the Firestore/app draft and added no Tracker columns or written selection flag.
- Repeated quote/item context on comparison rows, varied supplier-specific cost and lead fields, and kept item-level remarks/discount text on the selected row only.
- Preserved the independently verified current Dummy Tracker column E mapping as `CO SBM`.
- Expanded tests for selection changes, repeated-row mapping, selected-only customer output, alternate autosave/recovery, validation, and v0.2.6 migration.
- No deployment or infrastructure change is included.

## 0.2.7 — Multi-Supplier Item Pilot

- Added multiple private supplier options per Employee Workspace line item.
- Added explicit selected-supplier logic; only the selected option drives the unchanged Dummy Tracker row and quotation costing inputs.
- Added supplier availability, internal notes, lead time, currency, unit price, and supplier-specific landed-cost inputs.
- Added safe migration of legacy v0.2.6 flat supplier drafts into one selected supplier option.
- Preserved My Quotations, private ownership, autosave revisions, reload recovery, generation locking, and Dummy Tracker safeguards.
- Preserved the existing 52-column Tracker submission contract and did not introduce production columns.
- Documented the observed repeated-row multi-supplier pattern and remarks-based discount practices from `2025 TR.xlsx`.
- Added automated coverage for multi-supplier autosave/recovery, selection mapping, legacy migration, and validation.
- No deployment or infrastructure change is included.

## 0.2.6 — Employee Workspace Pilot

- Added **My Quotations** employee workspace at `/workspace`.
- Added private server-side quotation drafts scoped to the signed-in employee.
- Added online autosave with monotonic client revisions to prevent stale saves from overwriting newer edits.
- Added manual **Save Draft** and safe draft deletion.
- Added resume-after-browser/power-restart behavior through Firestore-backed drafts.
- Added generation locking: once generation begins, the draft cannot change underneath the Tracker write.
- Added idempotent Q-Code reservation and Dummy Tracker synchronization from the saved draft.
- Generated quotation snapshots are locked after the Dummy Tracker is updated.
- Preserved the existing Pilot Tracker mapping, column order, formulas, and `1.75` mark-up convention.
- Discount remains an existing-remarks concern for the Tracker; no new live Tracker column was introduced.
- The live Macrotech Master Tracker remains untouched.

## 0.2.5 Automated Tracker Fill Pilot

- Added an isolated `/tracker-test` requester route with mobile-friendly multi-line-item input.
- Added authenticated test API synchronization to the separate Dummy Tracker only.
- Added transactional, per-year Q-Code allocation using the pilot-only `TST` employee code and four numerical digits.
- Added idempotent Q-Code and row reservations so safe retries do not allocate duplicates.
- Copies the Dummy Tracker template row before writing employee/system cells, preserving formulas and formatting.
- Verifies the written Q Code and formula sentinel columns before reporting success.
- Keeps Gmail, the Gmail worker, the approval decision workflow, and the live `2026 TR` outside this pilot.
- Restored notification TypeScript source and tests that were present in compiled output but omitted from the uploaded source archive.

## 0.2.4 Approval Test

- Added requester submission screen for approval workflow testing.
- Added Q Code, Mark-Up, Duties and Taxes, Safety Factor, and requester comment to approver review.
- Added these fields to the approval-required email and reporting mirror.
- Keeps tracker/Q-code generation intentionally out of this test.
- Added an isolated, non-wired Q-Code generation prototype for the confirmed
  `YYQEEE####` format, legacy bootstrap analysis, and local automated testing.
- Added `docs/QCODE_GENERATION_SPEC.md`; live counter allocation and Tracker
  writes remain deliberately unimplemented until pilot permissions and field
  mappings are confirmed.

# Changelog

## 0.2.3 - Continuity and recovery hardening

- Established the project rule that no critical operational/recovery knowledge may exist only in chat, memory, or one laptop.
- Added a complete continuity/recovery document index and production system inventory.
- Added system ownership/access matrix with two-admin recovery principle and least-privilege handoff guidance.
- Added Business Continuity Mode so quotation work can continue safely during a platform outage without fabricating audit history.
- Added new-developer onboarding and a handoff acceptance test.
- Added dependency/runtime maintenance policy and private source-control/release policy.
- Added practical rollback, Storage recovery, Firestore restore, Sheet rebuild, Gmail outage, and maintainer-handoff drills.
- Added an explicit continuity readiness ledger distinguishing implemented/documented controls from live-verified controls.
- Added read-only `release-manifest.ps1`, `continuity-snapshot.ps1`, and `rollback-plan.ps1` evidence/recovery-planning tools.
- Expanded disaster recovery guidance with recovery order, evidence requirements, RTO/RPO decision points, and explicit non-destructive restore rules.
- Added incident severity, incident-record, continuity evidence, and manual-continuity guidance to the operations runbook.

## 0.2.2 - CEO approval data-check alignment

- Aligned the approval email CTA with the accepted **REVIEW & APPROVE QUOTATION** wording while keeping the email link non-mutating.
- Added immutable pre-approval `dataChecks` snapshot for required fields, calculations/VAT, template fidelity, file naming, and warnings.
- Added overall Data Checks status to the CEO approval notification.
- Added a detailed Quotation Data Checks card to the authenticated approval page before the Approve / Return controls.
- Added validation status to the final decision confirmation so the approver sees it at the point of commitment.
- Extended the internal Google Sheets reporting mirror from A:Y to A:AD to preserve the validation snapshot.
- Expanded source tests from 42 to 49; the dependency-free executable audit subset expanded from 29 to 33 tests.

## 0.2.1 - CEO commercial approval notification

- Added immutable commercial approval snapshot: currency, subtotal, VAT rate/amount, total amount, markup percentage, and delivery.
- Added Total Amount and Markup prominently to the approval email and secure approval portal before decision controls.
- Added revision, RFQ/inquiry, subtotal, VAT, delivery, and preparer context to the approval notification.
- Added a mobile-friendly email preheader so total and markup are more likely to appear in notification previews.
- Kept email action links non-mutating; final Approve/Return remains an authenticated, confirmed portal action.
- Added commercial context to the final decision confirmation and requester decision notification.
- Extended the Google Sheets reporting mirror to preserve the commercial snapshot.
- Added focused tests for commercial validation, formatting, notification content, HTML escaping, and non-mutating email actions.
- Added `docs/CEO_NOTIFICATION_SPEC.md` so this requirement is explicit and does not depend on chat memory.

## 0.2.0 - Production-readiness hardening

- Hardened authenticated approval API and decision idempotency semantics.
- Added safe Firebase Authentication error mapping and revoked-token IAM documentation.
- Made first-review recording transactional.
- Hardened business-field, object-path, and configuration validation.
- Removed assigned-approver email disclosure from wrong-account errors.
- Hardened private PDF streaming failure behavior.
- Fixed frontend sign-in retry and improved mobile/error/busy states.
- Hardened Gmail MIME headers and deterministic notification identifiers.
- Added outbox processing leases, per-approval Sheet synchronization lock, and stale-notification suppression.
- Switched new Sheet mirror rows to atomic append behavior.
- Added deny-by-default web/security headers and explicit Firestore indexes file.
- Corrected Cloud Run pilot scale-to-zero and explicit API service-account deployment.
- Expanded automated API/worker tests from 6 to 32 source tests.
- Added operations, security, deployment, recovery, test, audit, and product-roadmap documentation.
- Removed local environment, backup, dependency, and build-output artifacts from the distributable source.
