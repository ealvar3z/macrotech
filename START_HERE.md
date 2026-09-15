# Macrotech v0.10.1-online-alpha.1

Local online-transport test candidate derived from `v0.10.0-tallies.1`. **Not deployed and not production-ready.** Read `ONLINE_TRANSPORT_ALPHA.md` first. No cloud service, email, OAuth, Tracker, domain or billing configuration was changed.

## Contents

- All eleven approved calculation, workflow, interface, email, archive, customer-directory, and PDF tallies implemented in the isolated pilot source.
- Frozen submitted/approved commercial snapshots feed the application, email, web preview, PDF, approval record, and PO comparison.
- Exact 26QJCG140 reconciliation against the available Tracker/template evidence passes to the centavo; wider production reconciliation remains a release gate.
- Backend v0.3.0-readiness.1 source under `staging_backend/` includes the synchronized snapshot schema and integrated official logo in notification templates.
- Fresh v0.9.0 primary-baseline run passes 101 Python, 82 API and 28 worker tests; v0.10.0 passes 107 Python, 82 API and 28 worker tests plus the same build/self-test/document gates.
- Synthetic two-page legal-size quotation PDF, current verification logs, source manifest, and ZIP checksum.

The protected `readiness/Macrotech_v0.9.0_PreApproval_Readiness` folder is the primary development baseline. All 286 manifested v0.9.0 files remain unchanged, and its tests were run from a disposable copy. v0.8.0 remains only as historical rollback ancestry. This successor uses separate v0.10.0 local application-data and document directories; do not migrate real records during this review.

## Read in order

1. `SECURITY_READINESS.md`: implemented controls, architecture and limitations.
2. `TEST_RESULTS.md`: evidence and checks that could not run.
3. `CONNECTION_SETUP_STATUS.md`: remaining code/integration work versus external blockers.
4. `WINDOWS_MANUAL_TESTS.md`: Windows build and offline acceptance checklist.
5. `CHANGELOG_v0.10.1.md`, `CHANGELOG_v0.10.0.md` and `PROJECT_HANDOFF.md`: transport and tally implementation history.

Older documents/evidence are retained for provenance. They do not override these reports. Old screenshots and v0.7/v0.8 test counts are not current verification.

## Safe verification

With dependencies already installed in an approved development environment:

```text
python -B evidence/verify_release.py
```

This rebuilds source, blocks external network in unit tests, generates synthetic samples and writes results. It does not install dependencies or launch the cloud API/worker. In the development workspace, `evidence/compare_v090_baseline.py` verifies the protected v0.9.0 manifest, fresh baseline results and expected source differences. `evidence/package_release.py` requires that comparison before assembling the ZIP. For a downloaded ZIP without the baseline, verify `SOURCE_SHA256.json` instead.

## Do not connect this prerelease

Demo role switching remains available only in LOCAL/OFFLINE. TEST ONLINE uses backend-verified Firebase identity and disables role simulation. The v0.10 desktop transport and backend adapter are source-prepared but not deployed; controlled online testing remains blocked until a dedicated test deployment and interactive Windows sign-in are authorized.

Interactive browser checks could not run because Chromium is absent. Windows/WebView2, clean dependency installation, real authentication, real Firestore concurrency, real mail and email-client rendering remain release gates. No installer signing or automatic updater is included.

Keep production services, both Trackers and the company domain unchanged. Do not put credentials beside the release or send them in chat.
