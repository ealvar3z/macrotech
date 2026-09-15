# Current handoff — v0.10.1-online-alpha.1

Use this folder only as the local transport candidate derived from the verified **v0.10.0-tallies.1** customer baseline. Preserve that protected folder and **v0.9.0-readiness.2**. The included `0.3.1-desktop-alpha.1` backend source is undeployed.

## Current authoritative reports

START_HERE.md, CHANGELOG_v0.10.0.md, TEST_RESULTS.md, SECURITY_READINESS.md, CONNECTION_SETUP_STATUS.md and WINDOWS_MANUAL_TESTS.md. Read `staging_backend/docs/RELEASE_POLICY.md`; clean install, browser/Windows tests and known rollback remain stable-release gates.

## Main changes to inspect

- `macrotech_demo/domain.py`, `web_app.pyw`: full-precision pricing, immutable commercial snapshots, synchronized customer output, and directory bridge.
- `macrotech_demo/pdf_output.py`, `email_preview.py`, `web_preview.py`: one snapshot across the legal PDF, approval email, and web preview; exact approved wording and official integrated logo.
- `dashboard/src/App.tsx`, `executive.tsx`, `workflow.tsx`, `dialogs.tsx`, `ui/readiness.css`: collapsed lines, stable modals, state-specific actions, archive controls, customer hierarchy/directory, and restrained motion.
- `staging_backend/api/src/readiness-pricing.ts`, worker templates/assets: staged shared snapshot contract and official brand asset. Nothing was deployed or sent.
- `tests/test_tallies_v010.py`, `evidence/verify_release.py`, `compare_v090_baseline.py`, `package_release.py`: tally regressions, fresh v0.9.0 comparison and repeatable release checks.

## Continue in this order

1. Obtain a broader set of CEO-completed quotations and re-run centavo-level reconciliation; the available 26QJCG140 evidence passes but is not universal proof.
2. Run the supplied browser smoke test when Chromium is available, then build and complete the v0.10.0 Windows checklist on a disposable profile.
3. Complete the shared-service integration gaps: authenticated desktop/portal transport, trusted PDF lifecycle, private files, dispatcher, emulator/HTTP tests, migration, rollback, and update signing.
4. Only with fresh explicit approval: configure or deploy isolated staging and perform allowlisted internal email tests. Do not send customer email or touch either Tracker.

No live readiness guarantee, full cloud audit, account sanitization or Google-compliance certification is implied by this release. No production data migration, project creation, domain change, Gmail access, OAuth change, billing enablement or mail send occurred.
