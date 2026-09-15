# V0.2.2 Verification Record

## Scope

This record documents checks completed during the source-level production-readiness audit of Macrotech Approval Platform V0.2.2. It deliberately distinguishes checks that were actually executed from checks that still require the supported Node 24 workstation and live Google Cloud/Firebase environment.

## Executed in the audit environment

- Commercial/approval logic and notification test subset: **33/33 passed** using Node's test runner after dependency-free TypeScript transpilation.
- Repository source contains **49 automated API/worker domain/schema/notification tests**; dependency-bound schema tests remain part of the mandatory Node 24 full-suite gate.
- TypeScript syntax/transpilation scan: **22 non-declaration `.ts` source/test files parsed with 0 syntax/transpile errors**. The Vite declaration file is intentionally excluded from this syntax-only count.
- JSON parse validation: **10/10 repository JSON files valid** (excluding dependency directories).
- Static secret scan: **0 Firebase API keys, private keys, refresh tokens, or hard-coded client secrets detected** in the distributable source.
- Packaging scan: **0 actual `.env`, `.pem`, `.key`, `.bak`, credential/service-account key files, `dist`, or `node_modules` are permitted in the release archive**.
- CEO approval notification tests verify that Total Amount, Markup, Data Checks status, and the accepted `REVIEW & APPROVE QUOTATION` entry point are surfaced before the secure review action; business text is HTML-escaped and the email link cannot mutate approval state.

## Full dependency-aware gate still required

The audit container provides Node **22.16.0** and npm **10.9.2**, while this repository intentionally requires Node **24+** and specifies npm **11.19.0**. Its local dependency tree is incomplete because the audit environment cannot complete a clean registry-backed install. A dependency-aware `npm run typecheck` attempt therefore stopped on missing `@types/*` packages in that incomplete local tree; this is an environment/dependency-install limitation, not a reported source pass.

Before any deployment, run the following on the supported Windows development workstation (currently Node 24.21.0 / npm 11.19.0):

```powershell
npm ci
npm run typecheck
npm test
npm run build
```

**Deployment must stop if any of those four commands fails.** Do not weaken TypeScript settings, skip tests, or use `npm audit fix --force` to force the gate green.

## Live integration gates still required

Source-level tests do not prove Firebase Authentication revocation behavior, Firestore transactions under real concurrency, Cloud Storage IAM, Hosting-to-Cloud-Run routing, Eventarc delivery/retry behavior, Gmail OAuth durability/delivery, Google Sheets mirroring, or mobile/desktop browser behavior. These remain mandatory controlled-pilot checks in `docs/TEST_MATRIX.md` and `docs/DEPLOYMENT_CHECKLIST.md`.

## Release status

**V0.2.2 status: source-hardened and ready for final local verification; not yet cleared for company-wide production deployment.**
