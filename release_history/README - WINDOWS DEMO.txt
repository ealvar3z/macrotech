MACROTECH QUOTATION APPROVAL PLATFORM - WINDOWS PILOT DEMO
Version 0.7.0-demo (Executive Review Pilot)

READ START HERE v0.7.0.txt FIRST. It supersedes the historical workflow notes below.
Submission now attempts a pending Dummy write using the assigned Q-Code.
New discounts use percentages. The Send to Customer composer is a local preview;
its Send button is disabled until Gmail integration is tested.

SAFETY BOUNDARY
- This package does not deploy anything.
- It contains an allowlisted pilot Gmail sender and Firebase Emulator/rules files,
  but does not deploy or send anything automatically.
- The live 2026 Tracker is read only. The program refuses a live connection if
  the signed-in Google account can edit that spreadsheet.
- The only spreadsheet write destination compiled into the demo is the existing
  Macrotech Automated Fill Pilot Tracker - DUMMY.
- Column E is verified and fixed as CO SBM.

BUILD THE REAL WINDOWS APPLICATION
1. Extract this entire folder on a Windows 10/11 x64 computer.
2. The verified first-demo Desktop OAuth client is already included as
   credentials.json. It contains no user login token or password.
3. Double-click the readable BUILD WINDOWS EXE.cmd script.
4. The application will be placed in:
   READY_TO_TEST\Macrotech Quotation Pilot Demo
5. Open that folder and run Macrotech Quotation Pilot Demo.exe.

The package intentionally contains no custom launcher executable. The earlier
2.5 KB launcher was removed after Microsoft Defender classified its command-launch
behavior as Trojan:Win32/Wacatac.B!ml. The readable CMD/PowerShell build path is
used instead. Do not restore or reuse the removed v0.4.0/v0.4.1 launcher.

The build downloads private local Python and Node.js build toolchains, installs
the locked dependencies, rebuilds the React + TypeScript dashboard from the
included source, runs the unit tests, packages one Windows GUI application folder,
and self-tests its real .exe. No preinstalled Python or Node.js is required. The
onedir format avoids executable self-extraction behavior that can also trigger
antivirus heuristics. The build does not connect to either Tracker.

V0.6.1 WINDOWS BUILD RELIABILITY
The packaging stage now uses a short Windows temporary path, automatically retries
three clean builds if executable-resource editing is interrupted, and preserves an
existing READY_TO_TEST folder until the replacement executable passes its offline
self-test. This addresses EndUpdateResourceW error 122 seen when building from a
deeply nested Downloads folder or while antivirus is scanning the temporary EXE.

EMPLOYEE DEMO
The application opens as a React + TypeScript dashboard in a native Windows
window. Kelvin Castro's Tracker is prefilled with recognizable 2026 samples:
26QJCG140, 26QPJR023, and 26QPJR046. Select a row to open it. You may also paste a
complete Google Sheets URL (or only its spreadsheet ID) and exact Q Code/RFQ to
read a Tracker-shaped employee sheet. The ID is extracted automatically. The
Dummy Tracker is blocked as an import source. Draft changes auto-save under
LocalAppData\Macrotech.

Each line has three distinct areas: Buyer Requirements, Macrotech Offer, and
Supplier Sourcing - Internal Only. Supplier cards collapse to compact previews.
The workspace supports Supplier Pending during drafting, PHP/USD/EUR supplier cost,
optional current online forex, percentage-style duty, CO/SBM/N/A, automatic customer
pricing, customer-only preview, revision history, and quantity-level partial PO
acceptance. A complete selected cost basis is required before submission or PDF
generation; customer unit price cannot be typed or overridden manually.

Q-CODE ASSIGNMENT IN THIS PILOT
The recognizable 2026 examples are existing quotations, so their Q-Codes were
already assigned before import. A quotation created with + New Quotation instead
shows Q-Code Pending. The employee cannot type or change that field. When Send for
approval & assign Q-Code succeeds, the pilot assigns the next 26QDEM### code and
locks the submitted revision. The assigned code is retained by negotiated R1/R2
revisions. A pre-submission preview displays Q-CODE-PENDING without consuming an
assignment. The DEM segment visibly marks this as a non-production demonstration.

Production will use the same submission trigger with a secured central allocator
so simultaneous employees cannot receive duplicate official Q-Codes. The local
pilot allocator is intentionally not presented as the production numbering store.

GOOGLE TESTING
The samples came from bounded read-only inspection of 2026 TR. If 2026 TR is used
as a source, the demo checks Drive capability and stops if the signed-in account
can edit it. The OAuth client identifies the app only; access comes from the Google
account chosen at sign-in. Use an account that is view-only on 2026 TR and can edit
the Dummy Tracker. Gmail authorization uses a separate token and occurs only after
an explicit allowlisted test-send action from the CEO/approver dashboard.
The CEO may configure more than one approved Gmail sender identity. Each identity
uses a separate local OAuth token and the app verifies that the signed-in Gmail
account matches the selected sender before sending.

Before each Dummy write, the app verifies the hidden Dummy template version and
the complete blank formula row stored inside the Dummy itself. It never reads the
live 2026 Tracker during a write. It copies formulas, formatting, validation, and
row height from the versioned Dummy template, then writes only Macrotech input
cells. Every required formula (including column P and the ACTUAL lookup) is checked
after the write. Any missing formula, identity mismatch, or format mismatch blocks
the operation and restores the exact pre-write rows.

WORKFLOW
Employee Tracker -> quotation -> internal approval -> approved PDF -> Dummy Tracker
-> customer PO. Internal approval never marks customer acceptance. PO acceptance
can be recorded per line and partial quantity. Customer negotiation creates R1,
R2, and later revisions while preserving earlier approvals.

CUSTOMER OUTPUT AND TERMS
Exactly one selected supplier drives the internal cost basis and the automatic
customer price. Employees change legitimate upstream Tracker inputs such as the
MARK-UP multiplier; there is no manual customer-price field or override. A draft
may remain Supplier Pending, but it cannot be submitted or converted to a
quotation PDF until pricing is complete. Supplier identities, alternates, costs,
CO SBM, margins, forex, and internal notes never appear in customer output.

Internal approval automatically generates the approved PDF and shows a prominent
ready card. Terms & Conditions are always the final page. The CEO administration
simulation can save a working terms draft and publish a new version; every quote
freezes the published version when it is submitted.

V0.4.3 PRICING LOGIC CORRECTION
- Customer unit price VAT-EX is calculated automatically from the existing Macrotech Tracker formula chain.
- Employees cannot type or override the customer unit price.
- Changing MARK-UP or another existing upstream cost input recalculates the customer price.
- The app no longer hard-codes a 5% safety factor; the imported Tracker safety-factor behavior is preserved.
- Live 2026 TR remains read-only. Dummy Tracker remains the only Google Sheet write target.

V0.4.6 BASELINE CLEANUP
- All release-version markers are aligned to 0.4.6-demo.
- The bundled dashboard is rebuilt from the included React + TypeScript source.
- Customer totals use the canonical labels TOTAL VATABLE AMOUNT,
  VAT AMOUNT - 12%, and GRAND TOTAL in the app, preview, and PDF.
- Documentation now matches the implemented automatic-pricing and post-write
  warning behavior.

V0.4.7 Q-CODE ASSIGNMENT
- New quotations display Q-Code Pending instead of an editable Q-Code input.
- A non-production 26QDEM### code is assigned atomically when submission succeeds.
- Repeated submission requests return the first assigned code instead of consuming
  another number.
- Existing imported 2026 Q-Codes are preserved and clearly labeled as existing.

V0.4.9 CUSTOMER DIRECTORY
- The pilot includes a read-only snapshot of company and buyer/contact values
  observed in 2026 TR MARK-UP columns J and K.
- Start typing a customer value such as GNP to see matching company codes.
- After selecting the company, buyer suggestions are limited to contacts observed
  with that company. Multiple matches require an employee choice.
- Free text remains available for genuinely new customers or contacts.
- The source does not reliably provide separate address, TIN, phone, legal-name,
  or buyer-role fields, so this release does not invent them.

V0.5.0 FORMULA-SAFE DUMMY TRACKER
- The Dummy is a cleared structural test copy with the original MARK-UP/ACTUAL
  headers and a hidden versioned formula-template control.
- The application no longer reads live 2026 formatting during synchronization.
- Formula columns are excluded from ordinary input writes; column P is protected.
- Post-write formula and formatting failures are blocking and roll back the row.
- Duty and safety-factor percentages no longer display binary floating artifacts.

V0.6.0 RESILIENT APPROVAL AND CEO DASHBOARD
- Employee status cards are clickable filters.
- Demo role switching exposes dedicated Employee, Approver, and CEO workspaces.
  CEO appears below the Macrotech logo; delegated approvers do not receive the CEO
  Terms control.
- Employee approval comments and discount requests are internal and excluded from
  customer output. An authorized leader applies any discount only after the
  original GRAND TOTAL is shown; FINAL TOTAL is Grand Total less approved discount.
- First approval wins. Later approvers see the authoritative approver and time.
- Company/contact requests persist, deduplicate, require leader approval, and then
  become shared autocomplete entries.
- CO SBM defaults to N/A for new/imported options. EUR and optional current online
  PHP forex rates are supported. Online rates freeze source and retrieval time;
  manual rates remain available when offline.
- The CEO dashboard explains the Firestore collections and manages a durable
  notification outbox. Workflow state never depends on Gmail delivery.
- Multiple approved Gmail sender accounts can be configured, independently
  authenticated, and selected without tying platform roles to one mailbox.
- Gmail notification authorization is separate from Sheet authorization. Sending
  occurs only after allowlisted test recipients are saved and Retry is explicitly
  clicked. No recipient is bundled into the release.
- Firebase Emulator configuration and role-based rules are included. Nothing is
  deployed. A public approval link still requires a separate TEST project/URL;
  localhost is not represented as a remote approval portal.
