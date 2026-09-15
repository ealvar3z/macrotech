# Macrotech Approval Platform v0.3.0-readiness.1 — source only

Read ../SECURITY_READINESS.md and ../CONNECTION_SETUP_STATUS.md first.
This copy derives from cloud_app v0.2.7-3, not an older desktop baseline.
It adds a v2 transactional workflow contract. The desktop and existing v1 portal
are NOT integrated with it. Do not run deployment, provisioning, migration,
Gmail, Tracker, or counter-bootstrap scripts from this package.
Project names/configuration below are historical, not verified live state.

## Historical backend README

> **Pilot safety boundary:** The included Firebase configuration targets only
> `macrotech-approval-pilot-kc26` and the Cloud Run service
> `macrotech-approval-api-pilot`. The Firebase web environment file must be
> generated for that pilot project before building. Never reuse a production
> `web/.env` file in this package.

Production-oriented quotation approval platform for Macrotech.

## What this test build contains

- Firebase Hosting employee-facing web application.
- Firebase Authentication with Google sign-in.
- Cloud Run approval API with verified Firebase ID tokens.
- Firestore as the authoritative approval and audit store.
- Private Cloud Storage quotation PDFs streamed only after authorization.
- Transactional, immutable final approval decisions with idempotency protection.
- Event/outbox worker for Gmail notifications and Google Sheets reporting mirror.
- Isolated automated-fill pilot that generates a test Q Code and writes one row per line item to a separate Dummy Tracker.
- CEO approval notification and portal review context: total, markup, subtotal, VAT, delivery, revision, RFQ/inquiry, preparer, and pre-approval data-check status.
- Deny-all Firestore browser rules.
- Production deployment, security, recovery, and operations documentation.
- Continuity package designed to remove dependency on chat history or one developer: system inventory, ownership/access matrix, business continuity procedure, recovery drills, source-control policy, dependency maintenance, new-developer handoff, and read-only recovery evidence scripts.

## Repository layout

- `web/` - responsive approval UI.
- `api/` - authenticated approval API.
- `worker/` - asynchronous email and reporting mirror worker.
- `scripts/` - controlled IAM/deployment helpers.
- `docs/` - architecture, security, runbooks, audit, tests, and deployment guidance.

## Local verification

Use Node.js 24 or newer.

```powershell
npm ci
npm run typecheck
npm test
npm run build
```

The frontend also needs a local `web/.env`, created from `web/.env.example`. Environment files are intentionally excluded from the distributable source.

## Production principles

1. Firestore is authoritative. Google Sheets is only a reporting mirror.
2. The browser cannot directly read or write Firestore approval data.
3. The API never trusts an approver email supplied by the browser.
4. A final decision cannot be overwritten.
5. Quotation PDFs remain private in Cloud Storage.
6. Runtime service accounts use least privilege.
7. Production changes are deployed deliberately and smoke-tested before pilot use.

Read `docs/CONTINUITY_AND_RECOVERY_INDEX.md`, `docs/CEO_NOTIFICATION_SPEC.md`, and `docs/DEPLOYMENT_CHECKLIST.md` before deploying.

For the Dummy Tracker test boundary and setup, read `docs/PILOT_TRACKER_AUTOFILL.md`. The pilot must remain disabled in production and must never target the live `2026 TR` sheet.

**Continuity rule:** no critical knowledge needed to operate, repair, rebuild, or deploy this platform may exist only in a ChatGPT conversation, personal memory, or one local machine.

## v0.2.7.1 Multi-Supplier Tracker Pilot

The pilot includes `/workspace` for private employee quotation drafts and **My Quotations**. Drafts auto-save through the API and hold multiple supplier options for each quotation item. The employee explicitly selects the only supplier used for customer-facing quotation calculations. Dummy Tracker synchronization emits the selected supplier first and retains alternates as repeated comparison rows without adding columns; alternate options remain hidden from the customer. Internal supplier notes and availability stay in the private draft. The existing Q-Code reservation and guarded Dummy Tracker path remain in place, and the live Macrotech Master Tracker remains disabled. See `docs/EMPLOYEE_WORKSPACE_V0.2.6.md` and `docs/MULTI_SUPPLIER_ITEM_V0.2.7.md`.
