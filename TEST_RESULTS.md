# Current test results

Historical v0.10.0-tallies.1 baseline evidence follows. Candidate v0.10.1-online-alpha.1 results are reported separately after the targeted transport regression run.

## Primary baseline comparison

| Check | Result |
|---|---|
| Baseline identity | **v0.9.0-readiness.2** |
| Protected baseline manifest | **All 286 files unchanged** |
| Fresh v0.9.0 Python run | **101 passed**, external sockets blocked |
| Fresh v0.9.0 API run | **82 passed**, Node network denial active |
| Fresh v0.9.0 worker run | **28 passed**, provider doubles only |
| v0.9.0 desktop/backend builds and self-test | **Passed** |
| v0.9.0 synthetic document generation | **Passed** |
| v0.9.0 → v0.10.0 source comparison | **Passed**, no unexpected paths |

The v0.9.0 suite was run from a disposable copy so its protected folder remained read-only. v0.8.0 was separately verified as historical rollback ancestry only; it is not the v0.10.0 development baseline. New cases use synthetic data and doubles. Some inherited regressions read the bundled historical Tracker snapshot as a local fixture; no live Tracker was read or written.

## Current verification

| Check | Result and scope |
|---|---|
| Python offline suite | **107 passed**; isolated LOCALAPPDATA, socket operations blocked; includes pricing snapshots, PDF wording/branding, directory audit, archive safety, modal/motion and wording regressions |
| API tests | **82 passed**; Node network-denial preload |
| Worker tests | **28 passed**; fake delivery/store, no Gmail calls |
| Desktop React/TypeScript | `tsc --noEmit` and Vite build passed |
| Backend web/API/worker | All typechecks and builds passed |
| Python source | Entry points/modules parse successfully |
| Unpackaged desktop self-test | Passed with isolated state and external network blocked; not a Windows EXE test |
| Golden quotation reconciliation | Available 26QJCG140 Tracker/template/app evidence matches unit, line, subtotal, VAT and grand total to the centavo; four awarded lines across three available Q-codes also reconcile |
| Synthetic quotation PDF | Two legal-size pages; centered integrated logo/contact header, requested customer wording, exact cancellation notice, discount/final total and final Terms page; private supplier names/notes absent; rendered pages visually inspected |
| Email/web/PDF synchronization | Submitted and approved snapshots are immutable and reused across output paths; escaping, responsive CSS, conditional discount and inert actions are unit-tested |
| Credential-pattern scan | No matches in release-eligible source, compiled assets and evidence; no values printed |
| Source ZIP | CRC and each manifested entry checked; source manifest and external SHA-256 checksum supplied |

The machine-readable before/after evidence is `evidence/verification/v090_regression_comparison.json`.

Windows portability correction: the first readiness.1 Windows run stopped because its test fixture tried to create a real symbolic link without the required Windows privilege (`WinError 1314`). Readiness.2 always verifies the application's symlink rejection through a controlled test double and additionally verifies a real filesystem symlink where the operating system permits creation. The production validation rule remains unchanged.

## Important negative paths

- 50 concurrent backend submissions allocate 50 unique codes with transaction retries, audit and outbox records.
- 20 identical concurrent submissions produce one code/approval/outbox entry; changed content with reused ID conflicts.
- Injected commit failure leaves no partial counter/snapshot; retry succeeds.
- Identical decisions retry safely; conflicting, revoked, unauthorized, self, stale, expired and forwarded requests are denied.
- Local saved submissions survive interrupted receipt creation and repair on retry/startup. This is not a multi-file atomic transaction.
- Partial PO is separate from approval; invalid/excess/unknown quantities fail.
- Alternate suppliers remain internal, absent from customer projections/PDF.
- Attachment type/content/size, Office ZIP safety, hashes, symlinks and private owner/revision manifests are checked.
- Concurrent delivery claims yield one send attempt; capped retries and UNCERTAIN status prevent blind resends after possible acceptance.

## Not passed / unavailable here

1. **Windows EXE, PyInstaller, WebView2:** not compiled/executed. PowerShell builder reviewed and source-asserted only.
2. **Interactive browser smoke:** attempted; Playwright/Chromium was unavailable. `tests/readiness_ui.cjs` is supplied but is not counted as passing evidence. No current browser screenshots are claimed.
3. **Clean dependency install:** desktop `npm ci --offline` failed because a Vite package was missing from cache. Both disposable v0.9.0 and v0.10.0 verification used the protected v0.9.0 dependency trees without modifying them. Clean supported-version installation is still required.
4. **Current vulnerability advisories:** no registry advisory audit or dependency remediation. Credential-pattern scanning is neither a vulnerability audit nor penetration testing.
5. **Firestore emulator/cloud/IAM/rules:** memory transaction double only. Adapter compilation does not prove actual permissions, indexes, contention or deployment behavior.
6. **Email-client rendering:** no delivery to Gmail, Outlook or iOS Mail; exact appearance is unverified.
7. **True multi-PC, native interrupted UI, installer upgrade/rollback, signed updates:** unverified.
8. **Broader completed-quotation reconciliation:** the available golden examples pass, but CEO-confirmed rounding handoff and a larger representative quotation set remain required before production.
9. **OAuth/Gmail/Workspace, upload/scanning, v2 portal/desktop wiring and dispatcher:** not complete end-to-end.

## Reproduce

```text
python -B evidence/verify_release.py
```

Runtime: Node 24.19.0, npm 11.9.0. The backend declares Node >=24 and a different preferred npm version in packageManager; supported-version clean-install validation remains open. Never weaken authentication or make storage public to obtain a passing test.
