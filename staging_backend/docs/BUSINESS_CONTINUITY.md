# Business Continuity Mode

## Goal

A temporary platform outage must not prevent Macrotech from responding to customers. Business Continuity Mode keeps quotation work moving while preserving a path to reconcile records after service restoration.

## When to activate

Activate Business Continuity Mode when a confirmed platform outage prevents normal quotation generation/review/approval and the expected recovery time would materially delay a customer response.

Do **not** activate merely for a single wrong-account, browser-cache, or employee-device issue that can be resolved normally.

## Continuity process

1. Record the outage start time and a short incident reference, for example `BC-2026-09-10-01`.
2. Use the current approved manual quotation template/process already accepted by Macrotech management.
3. Preserve the source RFQ/inquiry, customer data, quoted items, commercial calculations, images/attachments, preparer, approver, and final customer-facing quotation.
4. Obtain the required management approval using Macrotech's explicitly approved emergency/manual method. Do not represent an email or verbal message as a platform approval unless company policy permits it.
5. Label the internal record as **Business Continuity / Pending Reconciliation**.
6. Never manufacture a platform approval ID, Firestore audit event, or automated data-check result while the system is unavailable.
7. After service restoration, a designated preparer/admin reconciles each continuity quotation into the platform using a future supported reconciliation/import path. Until that feature exists, keep the manual continuity register alongside the source documents and do not fake backdated application events.
8. Record reconciliation date, original continuity reference, and any discrepancy found.

## Minimum continuity register

For each affected quotation retain:

- continuity reference;
- Q Code when available;
- RFQ/inquiry reference;
- customer;
- preparer;
- approver and evidence of emergency approval;
- quotation total and markup used internally;
- quotation filename/version;
- date/time sent to customer;
- outcome if known;
- reconciliation status.

## Recovery exit criteria

Return to normal operation only after:

- permanent Hosting URL responds;
- API health returns the expected build ID;
- authenticated approval review works;
- private PDF access works for the correct approver;
- a controlled test decision succeeds;
- Firestore/outbox behavior is normal;
- incident owner announces that normal processing may resume.

## Product roadmap requirement

Before V1.0 company-wide rollout, implement an administrator-supported **continuity reconciliation** workflow so emergency manual quotations can be imported/reconciled without falsifying original timestamps or audit history.
