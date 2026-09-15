# CEO Approval Notification Specification

## Purpose

The approval notification must give the assigned approver enough commercial context to make a meaningful review before entering a final decision. It must look like a professional Macrotech system notification, not a generic Firebase or Apps Script email.

## Verified approval context

The implemented notification carries the fields that were previously established in the Macrotech workflow plus the CEO-requested markup visibility:

- Q Code, when one exists.
- Customer.
- Revision.
- RFQ / Inquiry reference.
- Prepared By / requester identity.
- Total amount.
- Discount percentage and monetary amount, when supplied.
- Total after discount, when supplied.
- Markup percentage, explicitly identified as internal information.
- Subtotal.
- VAT rate and VAT amount when available.
- Delivery.
- Data Checks summary.
- Secure **REVIEW & APPROVE QUOTATION** entry point to review the full quotation and make the final decision.

The approval portal repeats the same commercial snapshot immediately above the quotation-review and decision controls so the approver sees the key figures before choosing Approve or Return for Correction. It also presents the pre-approval data checks and the approver comment field before the final action buttons.

## Application visual identity

Approval-request and decision emails use the same visual language as the Windows application: the official Macrotech logo, green and dark-green brand colors, pale-green review surfaces, white bordered cards, familiar approval-status pills, and the same green primary and outlined secondary button styles. The commercial hierarchy also follows the executive review screen, with the original Grand Total prominent and discount/final-total values separated below it.

The official logo is embedded inside the MIME message with a content ID. It does not require a publicly accessible image URL. All essential meaning remains in text if an email client suppresses images. Layout uses inline styles and presentation tables because they are more reliable across Gmail and mobile email clients than the application's browser CSS.

## Mobile notification behavior

The plain-text email body intentionally places Customer, Q Code, Total Amount, and Markup near the top. The HTML email also contains a short preheader with total and markup. This improves the information likely to appear in Gmail and mobile notification previews without putting internal commercial data in the email subject line.

Email clients and operating systems ultimately control exactly how much preview text is displayed, so the application does not rely on lock-screen preview text for approval integrity.

## Data checks before approval

The accepted workflow requires the secure approval page to show validation evidence before the human decision. V0.2.2 therefore carries a `dataChecks` snapshot with these categories:

- **Required Fields** — customer, item, price, supplier, delivery, and term fields.
- **Calculations & VAT** — totals, formulas, and applicable VAT treatment.
- **Template Fidelity** — expected quotation format and required sections.
- **File Naming** — expected quotation file naming convention.
- **Warnings** — concise exception messages that require human attention.

Each check is `NOT_RUN`, `PASSED`, or `ATTENTION_REQUIRED`. The overall status is **Passed** only when every category passed and no warnings exist. Missing or partial check data must never be presented as a pass. Until the quotation generator is connected, staged approvals may display **Not Run**.

The approval email includes the overall Data Checks status; the secure portal shows the individual checks and any warnings before Approve / Return for Correction. The checks support the human decision and do not replace it.

## Decision safety

Email links never mutate approval state. The email action opens the authenticated Macrotech approval portal. The assigned approver must sign in with Google and explicitly confirm Approve or Return for Correction in the portal.

This is deliberate. Email security scanners, link-preview bots, forwarded messages, and accidental taps must never be able to approve a quotation merely by following a URL.

The portal's final confirmation repeats the available total amount, discount, total after discount, and markup before the decision is recorded.

## Commercial snapshot integrity

Commercial review data is stored inside the approval record as an immutable `commercial` snapshot:

- `currency`
- `subtotal`
- `vatRatePercent`
- `vatAmount`
- `totalAmount`
- `discountPercent`
- `discountAmount`
- `totalAfterDiscount`
- `markupPercent`
- `delivery`

Percentage fields use percentage points, not fractions: `25` means **25%**, and `12` means **12% VAT**. Money fields are numeric amounts in the specified three-letter ISO currency (default `PHP`).

Discount fields are optional. When the staged requester enters a discount percentage and a total is available, the client derives the monetary discount and total after discount to two decimal places. The original total remains unchanged and visible. Missing discount fields are omitted from notification emails and approval confirmation instead of showing an empty or zero discount.

Once the quotation-generation module is connected, these values should be populated from the same validated source data used to generate the quotation PDF. They must not be independently retyped by an approver.

The approval API has no endpoint for editing these values after approval creation. Final decision state is also immutable.

## Markup confidentiality

Markup is an internal approval field. It is displayed in the approval email, secure employee approval portal, decision notification, Firestore approval record, and internal reporting mirror. It must not be inserted into the customer-facing quotation PDF unless Macrotech explicitly authorizes that template change.

## Missing-data behavior

V0.2.2 permits staged/legacy approval creation without commercial figures so existing pilot flows do not break while the quotation generator is still being connected. Missing values display as `Not provided` rather than being silently fabricated.

Before company-wide production release, the quotation generator should become the authoritative producer of this snapshot and the production gate should require the CEO-designated mandatory commercial fields.

## Intentionally not invented

Supplier cost, unit cost, gross profit, margin, payment terms, quotation validity, and other commercial fields are not added to this CEO notification merely by assumption. They can be added after Macrotech confirms they belong in the approval notification rather than only in the quotation or future management analytics.
