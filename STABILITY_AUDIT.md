> Historical baseline report. For the current pilot, read V0.8.0_RELEASE_REVIEW.md.

# Macrotech stability audit — exact v0.7.0 baseline and revised v0.7.1 pilot

Review date: 12 September 2026. Decision: suitable for further isolated pilot review; NOT production-ready.

## Scope and integrity
The supplied v0.7.0 archive was preserved unchanged. SHA-256: `312cf66de16eab8afa7a76f12998717b2722bcc0f72c66ec41d66d9a630fdf4c`.
Your final request to implement remaining tallies was treated as authorization for a separate v0.7.1 pilot, after baseline inspection. No live/Dummy Sheet writes, email sends, OAuth configuration changes, deployment, Firebase Hosting changes or Cloud Run changes were performed. Tests used temporary local state and blocked network connections; Sheets and forex interactions were mocked. Dependency installation used network access only for development tooling.

## What the baseline actually contains
| Area | Status and boundary |
|---|---|
| React/TypeScript employee and executive UI | Implemented; Python desktop bridge and local stores |
| Quotation calculations, VAT, selected suppliers, percentage discounts | Implemented; reference examples tested, not independently reconciled against every live formula |
| Customer directory | Bundled snapshot and local request workflow; no durable shared customer database |
| Q-Code on submission | Local demo allocator; not official or safe across computers |
| Approvals and delegated roles | Local simulation; role switch is not authenticated identity |
| Revision, PDF and partial PO | Implemented, with serious baseline trust/state defects described below |
| Tracker template, input-cell writes, formula verification and rollback | Implemented code; mocked here, not a connected parity certification |
| Forex | Online lookup code with manual fallback; mocked success/failure here |
| Notifications | Queue/settings exist; remote delivery and authenticated remote approval not certified |
| Firestore/cloud files | Reference configuration only, not a deployed shared service |
| Windows application | Build configuration; no Windows executable produced or executed in this audit |

## Prioritized findings
P0 means blocks production; P1 means material pilot/release risk; P2 means usability or maintainability.

| Priority | Evidence in original build | Revised pilot / recommended follow-up |
|---|---|---|
| P0 | Local role selection and JSON stores cannot establish employee identity or secure permissions across 10–20 PCs. `platform_store.py`, desktop role flow. | Added bridge role guards and CEO-only audit projection, but still explicitly a local simulation. Production requires authenticated server authorization, shared transactions and tested access rules. |
| P0 | Probe `FORGED_PO_ACCEPTED CUSTOMER_PO_PARTIAL`: bridge accepted caller-supplied approval state. | PO and final PDF now load stored authoritative drafts. Add authenticated server enforcement before connected release. |
| P0 | Probe `REVISION_OVERWROTE_ORIGINAL True`: edited caller payload could overwrite approved original during revision. | Revisions load stored approved originals, preserve originals and allocate next local revision. Multi-process concurrency still requires central transactions. |
| P0 | Original archive and Windows build included `credentials.json` with desktop OAuth installed-client configuration, including a client-secret field. | Removed from new package and build resources. External per-user configuration only. This was not a user access token or proof of malware; no credential values were printed. Review distribution history and ownership before any connected release. |
| P0 | Tracker writes remain vulnerable to concurrent writers; append position depends on Q-Code occupancy, not all data cells. Timeout after server commit remains ambiguous. | Tightened request marker matching and row ownership verification. Mocked rollback passed. Require isolated connected fault-injection and occupied-row tests; transactional reservation/idempotency design needed before multi-PC use. |
| P1 | Probe `CORRUPT_STORE_OVERWRITTEN True`: malformed JSON treated as empty, risking loss on next save. | Fail closed on corrupt draft/platform/terms state; previous draft snapshot backed up on replacement. Full crash/power-loss recovery and simultaneous processes still unverified. |
| P1 | Probe allocator at 999/1000 returned existing `26QDEM1000`. | Regex accepts 3+ digits; boundary regression passes. No official cross-PC allocator supplied. |
| P1 | Invalid PO quantities and duplicate item identifiers could create inconsistent acceptance state. | Validate all quantities before mutation, reject nonfinite/negative/oversized values and unknown item IDs. Multiple POs over time and discounted partial-PO allocation still need business rules. |
| P1 | Original bundled tests passed despite the above reproducible failures. | Expanded isolated suite from 44 to 66 tests. Passing this suite is not acceptance of all checklist items. |
| P1 | Windows PyInstaller and antivirus failures previously reported; no Windows runner available here. | Removed bundled credential dependency, improved packaged self-test invocation, local Node PATH and version labels. Signing, Defender and clean-machine installer tests remain mandatory. Do not bypass a detection. |
| P1 | Python dependencies use version ranges; builder downloads uv without a pinned checksum. | Pin/hash reviewed build tools and Python dependencies and build in controlled Windows CI before release. JavaScript lockfile/build was verified. |
| P1 | Supplier-pending lines have no supported positive automatic customer cost basis. | Options are preserved when set pending, but submission still needs a valid pricing basis. Agree how to quote without a supplier without introducing manual customer-price override. |
| P1 | Discounts are represented in remarks, not a independently validated dedicated Tracker mapping. | Percentage approval retained after grand total; confirm actual target mapping and accounting/PO treatment before connected use. |
| P2 | PDF sample has cramped/small text, substantial terms-page whitespace and visible character-spacing problems in this renderer. | Terms final page, official artwork and private-field exclusion tested. Typography, long descriptions and expanded terms still require correction and print review; not claimed customer-ready. |
| P2 | Autosave navigation could leave unsaved edits. | Back/sidebar navigation awaits save. Abrupt window close, disk-full and concurrent-editor conflict recovery still need coverage. |

## Remaining tally implementation
| Tally | v0.7.1 result |
|---|---|
| Keep original green symbol; white lettering; raised CEO tag | Implemented using official artwork layers and CSS; browser/Windows visual verification outstanding |
| Return from quotation details to approval preview | Implemented, retains review context |
| Explain Needs attention | Specific missing-field/pricing reasons exposed |
| Recall internal approval | Implemented with mandatory reason; no recall after PO acceptance; PDF access blocked through app after recall. Already downloaded/sent files cannot be revoked |
| CEO-only audit trail | UI and bridge projection implemented; local filesystem is not protected from its owner |
| Hide/show quotations and revision history | Hidden initially in general view; status filters expose relevant records |
| Approved quotations wording | Updated and distinct quotation counts used |
| Subnet/net visibility | CEO-only explicit-input worksheet for standard formula; not automatic ACTUAL-sheet import or a verified commission payout ledger |
| Earlier executive review improvements | Existing concise approval, percentage discount and queue functionality retained; isolated tests cover backend approval state |

Not all future features are implemented: customer logos, file/image attachments and employee presence remain parked. Real shared database, multi-account operational resilience, official Q-Code allocation and remote approval links remain connected-release work. Supplier-independent pricing, full Tracker parity and PDF typography remain open as noted above.

## Isolated validation and evidence
- Original bundled tests: 44 passed (`evidence/baseline_tests.txt`).
- Original defect reproductions: `evidence/baseline_probes.txt`.
- Revised tests: 66 passed (`evidence/updated_tests.txt`), with socket connections blocked and temporary local storage.
- Coverage includes USD/EUR/PHP pricing references, VAT/markup/discounts, invalid numeric input, supplier privacy, PO validation, authoritative approvals, revision integrity, Q-Code boundary, corruption preservation, backups, mock Tracker rollback and forex success/failure.
- TypeScript check and Vite build passed (`evidence/frontend_build.txt`).
- PDF/desktop self-test passed: two-page sample, terms last, supplier names and submission comment excluded (`evidence/pdf_check.txt`). Visual inspection identified typography limitations above.
- New package secret scan: no detected credential filenames or token/key patterns (`evidence/credential_scan.json`). Pattern scanning is not malware certification.
- Browser interaction tests could not run because Chromium installation repeatedly timed out. UI flow source was inspected; do not interpret the production build as a visual interaction pass.

## Acceptance-checklist disposition
The acceptance checklist remains a release gate, not a list of features assumed complete. Calculation and state examples have isolated evidence; live formula parity, real authorization, cross-computer sharing, recovery under actual failures, Windows security/installation and customer print quality remain unpassed. Existing historical checklists in `release_history` are reference material only and their earlier success claims were not revalidated against connected systems.

## Checks needing Windows or a connected TEST environment
1. Windows 10/11 clean-machine build, packaged self-test, launch, WebView2, paths with spaces/non-ASCII, installation and restart. Record executable hash, Defender results and signing status.
2. Real browser/desktop interaction: green logo/white letters, CEO badge, history filters, back-to-review, approval-next, recall and role changes.
3. Printed and exported multi-page quotations, large item descriptions, PHP/EUR symbols, all terms fitting legibly as final page.
4. Isolated Google Sheets test copy: column P and every formula unchanged; repeated supplier row pattern; input-only writes; number formats, validations, widths/heights and protections. Read live source only if separately authorized; never use it as a write target.
5. Retry after timeout before/after commit; duplicate request; simultaneous writers; occupied rows without Q-Code; missing/changed template version; rollback ownership.
6. Ten–twenty authenticated clients: unique official Q-Codes, single approval winner, stale revision rejection, shared contacts and audit access restrictions.
7. Autosave under forced close, crash, disk full, corrupted storage and restore; two simultaneous app instances.
8. Future controlled email delivery only after confirmed recipients and test setup: queue retries, sender failure, authenticated links, expiry/reuse and approval already completed.
9. Discounted partial/multiple PO acceptance and ACTUAL profit reconciliation using agreed accounting examples.

## Recommended order
First finish Windows packaging/security and PDF usability; then correct connected-write concurrency/idempotency and verify template parity in an isolated test environment. Add authenticated shared services before testing multiple employees. Keep all production changes behind explicit approval. Do not use this build for live business records.
