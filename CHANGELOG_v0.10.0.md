# Changelog — 0.10.0-tallies.1

This isolated source prerelease implements the eleven approved Macrotech quotation tallies. It does not deploy services, send email, change either Tracker, or replace the protected v0.9.0 baseline.

## Calculation and synchronized records

- Preserved Macrotech's existing Tracker/template calculation order and full precision. Customer unit prices remain two-decimal display values while authoritative line totals retain the Tracker handoff precision.
- Added immutable submitted and approved commercial snapshots containing customer identity, line values, subtotal, VAT, discount and final total.
- Reused the same snapshot in the application, approval email, customer web preview, generated PDF, approval record and customer-PO comparison.
- Reconciled the available 26QJCG140 golden quotation and four awarded lines across three available Q-codes to the centavo. Broader CEO-completed examples remain required before production.

## Application workflow and interface

- Quotation lines now start collapsed; each line opens independently.
- Confirmation dialogs lock background scrolling and compensate for the scrollbar so the application no longer shifts. Added short iOS-inspired press, fade and scale motion with reduced-motion support; native browser dropdowns remain unchanged.
- Replaced customer-facing action wording with **Email to Customer**.
- Added state-specific preview/PDF actions and local Draft Quotations / Approved Quotations folders with Open and Show in Folder controls.
- Reworked quotation history with Show archived count/filter, Archived badges, manual reason/confirmation/audit and restrictions for active approval/PO states.
- Made Company / Customer the permanently visible parent of billing/delivery address, TIN, Buyer / Contact and Email.
- Added authorized Customer Directory search/edit, contact activation, duplicate merge and audit. Submitted/approved quotations never change retroactively.

## PDF, preview, email and branding

- Preserved the existing low-ink, legal-size quotation theme.
- Centered the official integrated website logo, official address, phone, website and email, followed by centered **QUOTATION**; the final Terms page uses the same header.
- Added the approved introduction above line items, Q-Code-only Next Step below the final total, and appreciation message.
- Restored the exact original ORDER CANCELLATION wording at the bottom left; the Terms page now references it instead of presenting a conflicting rule.
- Replaced separately typed logo components in the app, PDF and staged notification templates with the integrated official logo asset.

## Verification and boundaries

- Re-ran the complete v0.9.0-readiness.2 baseline from a disposable copy: 101 Python, 82 API and 28 worker tests, builds, self-test and document generation all passed. All 286 protected baseline files remain unchanged.
- Compared v0.9.0 with v0.10.0 at the file level; every changed, added and removed path is within the approved tally/build/documentation scope, with no unexpected paths.
- Offline unit suites, TypeScript checks, builds, synthetic email/PDF generation and two-page PDF rendering pass. See `TEST_RESULTS.md`.
- Interactive Chromium and Windows/WebView2 tests remain unavailable here. No EXE, deployment, provider configuration, credentials, live Tracker access or mail send occurred.
