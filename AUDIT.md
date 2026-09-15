# Quick Code Quality Audit Plan

Date: 2026-09-15  
Scope: `macrotech_demo/`, `web_app.pyw`, `staging_backend/api/`, `staging_backend/worker/`, and `dashboard/`.

Method: the closest matching Codex skill is `auditing-code-quality`. This plan applies its SOLID and system architecture checks, calibrated for a Python/TypeScript pilot that is explicitly not production-ready.

## Assessment

The code has useful seams around pricing, transport, persistence, and server
workflow, and it fails closed in several important paths. The main risks are
boundary drift between the desktop and v2 backend, a customer-data privacy
regression in the pricing projection, and incomplete reproducible verification.
Keep the current offline/test-only boundary while closing these gaps; do not
deploy as a connected production workflow.

## Findings

| Category | HIGH | MEDIUM | LOW |
|---|---:|---:|---:|
| SOLID | 0 | 1 | 0 |
| Architecture / security | 2 | 2 | 0 |
| Verification / delivery | 0 | 1 | 0 |
| **Total** | **2** | **4** | **0** |

### 1. HIGH — Internal pricing fields enter the customer projection

Location: `staging_backend/api/src/readiness-pricing.ts:83-97`

`priceSnapshot()` says the customer allowlist excludes markup and sourcing data, but each customer item includes `markupMultiplier`, `dutyRate`, and `safetyFactorRate` at lines 88-89. The privacy test at `staging_backend/api/src/readiness-workflow.test.ts:161-170` checks only for the words `PRIVATE` and `ALTERNATE`, so it does not catch these fields.

Action: remove the three internal fields from the returned `customer.items` shape. Add assertions that the keys are absent and that generated customer/PDF/email payloads contain only the documented customer contract. Re-run API tests and inspect serialized output.

### 2. HIGH — Online desktop actions can diverge from authoritative backend state

Locations: `web_app.pyw:141-166`, `web_app.pyw:458-465`; `macrotech_demo/approval_transport.py:170-177, 282-325`

`HttpApprovalTransport` implements submit, read, approve, and reject, but no recall or customer-PO operation. `DesktopBridge.recall_approval()` and `record_po()` always mutate the local JSON/platform store and call local synchronization. In `TEST_ONLINE`, this can present a local recall or PO state that the v2 service never recorded.

Action: add authenticated v2 transport methods and server routes for every online state transition, or disable those buttons in online mode until they exist. Apply the same version/hash/idempotency checks used by approval decisions. Add negative tests proving a failed remote mutation cannot create local success.

### 3. MEDIUM — Online refresh does not reconcile all server states

Location: `web_app.pyw:514-534`

`refresh_approval()` maps only `RETURNED` and `APPROVED`. It does not handle backend `RECALLED`, `PO_PARTIAL`, `PO_ACCEPTED`, or expiry states, and it stores the local draft after updating only the version and timestamp. A successful server transition can therefore remain invisible in the desktop.

Action: define one explicit mapping from v2 statuses to desktop statuses, including terminal/committed states and conflict handling. Return the authoritative decision/PO data from the API and test every mapping, including stale local state and refresh failure.

### 4. MEDIUM — `DesktopBridge` is a change hotspot

Location: `web_app.pyw:38-689` (approximately 650 lines and dozens of public operations)

The bridge coordinates UI RPCs, role/authentication, local persistence, online HTTP, PDF generation, Tracker synchronization, terms, directory management, and notification configuration. This is an SRP and separation-of-concerns smell: changes in one actor’s policy or integration can affect unrelated workflow operations.

Action: extract focused adapters incrementally: `OnlineApprovalFacade`, `LocalDraftWorkflow`, `DocumentService`, and `DirectoryService`. Keep `DesktopBridge` as a thin composition/facade layer and preserve existing API method names during the split.

### 5. MEDIUM — Test dependencies are not fully declared/reproducible

Location: `requirements.txt`; `tests/test_tallies_v010.py:9`; `tests/test_connection_prep.py:35-36`

The test run reached 20 tests but failed 10 module-loading cases because this environment lacks `reportlab`, `google`, and `pypdf`. `requirements.txt` declares ReportLab and Google packages but omits `pypdf`, which is imported directly by the test suite. The current result is therefore a dependency/setup failure, not evidence of passing behavior.

Action: add `pypdf` to a clearly named test/build dependency set (or document a separate test requirements file), install from a clean environment, and run the full offline suite. Record the exact supported Python version and command in the test documentation.

### 6. MEDIUM — Integration and release gates remain unverified

Locations: `SECURITY_READINESS.md:57-66`, `ONLINE_TRANSPORT_ALPHA.md`, `staging_backend/docs/RELEASE_POLICY.md`

The documented v2 integration is source-only: trusted PDF finalization, private-file scanning, dispatcher/reconciliation, migration fixtures, emulator/HTTP coverage, Windows build/smoke tests, and update signing remain open. This is consistent with the code’s current alpha boundary, but it blocks any connected acceptance claim.

Action: track these as explicit release gates. Finish offline doubles first, then emulator/HTTP integration and migration/rollback fixtures, then clean Windows/browser verification. Keep production mode disabled until all gates and an authorized isolated staging test pass.

## Top priorities

1. Remove internal pricing fields and strengthen the privacy contract test.
2. Make every online state transition server-authoritative, or disable unsupported online actions.
3. Reconcile all server statuses in desktop refresh before connected testing.
4. Restore a clean, repeatable test environment and declare `pypdf`.
5. Split the bridge only after behavior is protected by the expanded tests.

## Verification checklist

- [ ] `npm ci && npm test && npm run typecheck && npm run build` in `staging_backend/`.
- [ ] Clean Python environment installed from the declared requirements; run `PYTHONDONTWRITEBYTECODE=1 python3 evidence/run_offline.py .`.
- [ ] Add privacy regression coverage for forbidden projection keys.
- [ ] Add online failure, stale-version, recall, expiry, and customer-PO contract tests.
- [ ] Run browser smoke tests and the Windows manual checklist on a disposable profile.
- [ ] Re-review `SECURITY_READINESS.md` and `staging_backend/docs/RELEASE_POLICY.md` before any staging or mail action.

