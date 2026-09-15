# Product Roadmap

## Gate 1 - First permanent pilot

Deploy the hardened API and Firebase Hosting, then run the first end-to-end authenticated approval against a real test quotation. Verify the permanent `web.app` URL, private PDF access, correct/wrong-account behavior, transaction integrity, and audit records.

## Gate 2 - Notification and reporting pipeline

Finish the dedicated worker identity, Secret Manager configuration, durable Gmail OAuth publishing/verification state, Eventarc trigger, and dedicated Google Sheet reporting mirror. Validate retry behavior by intentionally causing temporary Gmail and Sheets failures.

## Gate 3 - Employee-ready experience

Build the visible product layer that makes the system feel like Macrotech software rather than an automation script:

- branded Macrotech navigation and responsive design system;
- employee dashboard with Pending, Approved, Returned, and My Requests views;
- search by Q Code, RFQ/inquiry, customer, requester, and status;
- clear approval timeline/audit history;
- quotation preview and revision context;
- polished email templates and action status pages;
- administrator user/role management instead of bootstrap configuration;
- operational dashboard for stuck notifications/reporting sync.

## Gate 4 - Quotation generation workflow

Connect the approval platform to the quotation-generation engine and Master Tracker inputs. Support Q Code when available, RFQ as the pre-Q-Code source, and parts inquiry when no formal RFQ exists. Generated quotations remain print-friendly, use minimal ink, include the company logo as the principal color element, visually separate line-item blocks, and include Terms & Conditions as the final page. Support optional product/offering images on quotations without making images mandatory; images should be sourced deliberately, resized/compressed safely, and kept from exposing internal-only material.

## Gate 5 - Management value layer

Add quotation-cycle metrics, workload visibility, conversion/decision reporting, revision frequency, response time, employee activity where appropriate, and funnel indicators that show how automation reduces quotation labor and prevents opportunities from being skipped during high workload.

## Gate 6 - Commercial hardening

Before licensing broadly: separate staging/production, formalize backups and retention, custom Macrotech domain, monitoring/alerting ownership, software/version licensing controls, privacy/terms documentation, access review cadence, dependency update policy, tested disaster recovery, a private source repository, a second recovery-capable human administrator, and a tested new-maintainer handoff. Add an administrator-supported continuity reconciliation workflow so emergency manual quotations can be imported without falsifying audit history.
