# New Developer Onboarding / Technical Handoff

## Purpose

A competent replacement developer should be able to understand and safely maintain this platform without reading historical ChatGPT conversations.

## First-hour reading order

1. `README.md`
2. `docs/CONTINUITY_AND_RECOVERY_INDEX.md`
3. `docs/ARCHITECTURE.md`
4. `docs/SECURITY_MODEL.md`
5. `docs/SYSTEM_INVENTORY.md`
6. `docs/ENVIRONMENT.md`
7. `docs/OPERATIONS_RUNBOOK.md`
8. `docs/RELEASE_POLICY.md`

## Local setup

- Install the Node/npm versions declared by the repository.
- Install Firebase CLI and Google Cloud CLI.
- Do not obtain production Owner access merely to develop locally.
- Create environment files from `.env.example`; obtain production secrets only through the approved access process.
- Run:

```powershell
npm ci
npm run typecheck
npm test
npm run build
```

No developer should deploy a first change before all four succeed and the current production release/rollback target are identified.

## Business concepts that must be understood before modifying behavior

- An RFQ is a Request for Quotation; some customer inquiries may arrive without a formal RFQ.
- A Q Code may not exist at the earliest stage of a quotation.
- Firestore is the approval system of record.
- Google Sheets is a reporting mirror only.
- The assigned approver is enforced from verified authentication, not browser-supplied email.
- Final approval decisions are immutable through the normal application API.
- Markup is internal commercial information and is not automatically a customer-facing field.
- Automated data checks must never display Passed unless the generator actually performed the checks.
- Quotation PDFs are private objects and are delivered through an authenticated API path.
- Some quotations may include optional product/offering images; image support is a planned quotation-generator enhancement and must not expose private/internal source material accidentally.

## Safe first change

A new developer's first production-oriented exercise should be a non-business-critical UI/text change deployed to staging, followed by a rollback drill. Do not make authentication, approval-state, IAM, schema, or data-retention changes as a first task.

## Questions that require product-owner confirmation

Do not infer these from code alone:

- changes to approval authority or routing;
- new commercial fields visible to approvers/customers;
- quotation pricing/markup calculation rules;
- what qualifies as a required data check;
- customer document layout/template changes;
- retention/accounting policy;
- new integrations or business modules;
- licensing/commercial scope.

## Handoff completion test

A handoff is successful only when the new maintainer can, without chat history:

1. explain the architecture and source of truth;
2. run the local verification suite;
3. locate all non-secret configuration references;
4. identify the current deployed build and previous rollback target;
5. diagnose a simulated failed API health check;
6. explain how to recover a deleted quotation object and a damaged reporting Sheet;
7. explain why a wrong approver cannot be bypassed;
8. execute a staging deployment and rollback drill under supervision.
