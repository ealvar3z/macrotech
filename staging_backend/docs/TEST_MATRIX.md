# Test Matrix

## Automated gates

Run before every release:

```powershell
npm ci
npm run typecheck
npm test
npm run build
```

Automated tests cover core decision state transitions, idempotency payload matching, assigned-approver comparison, email normalization, approval-ID validation, request-ID sanitization, Q Code/RFQ input rules, Return comment validation, quotation object-path validation, commercial snapshot validation, pre-approval data-check validation/status aggregation, private multi-supplier draft round-trips, selected-only customer projection, selected-first repeated Tracker rows, selection changes, legacy v0.2.6 draft recovery, stale autosave-revision rejection, supplier-option validation, PHP currency/percentage formatting, CEO notification content, notification HTML escaping, non-mutating email action links, MIME header sanitization, status presentation helpers, and Eventarc Firestore path parsing.

## Required staging integration tests

- Correct assigned approver can load approval.
- Wrong Google account receives 403 and cannot view details/PDF.
- Signed-out user receives sign-in experience.
- Disabled/revoked user session is rejected.
- Forwarded approval URL cannot be used by a different account.
- Private PDF cannot be fetched without an authorized token.
- Direct browser Firestore read/write is denied.
- Preparer role can create an approval.
- Non-preparer cannot create an approval.
- Q Code flow works.
- RFQ-without-Q-Code flow works.
- Inquiry-without-Q-Code flow works.
- Return without comment is rejected in browser and API.
- Double-click/two-tab same decision produces one final state.
- Concurrent Approve vs Return results in exactly one final state.
- Approve followed by Return is rejected.
- Idempotent retry with identical payload succeeds safely.
- Reused request ID with different payload returns conflict.
- First review timestamp/audit record is recorded once.
- Quotation object missing -> safe 404 behavior.
- Non-PDF/misconfigured quotation -> safe error behavior.
- Worker sends creation notification.
- Creation notification visibly includes Q Code, Customer, Total Amount, Markup, Subtotal, VAT, Delivery, Revision, RFQ/Inquiry, and Prepared By when supplied.
- Gmail/mobile preview text surfaces Total Amount and Markup near the beginning of the message.
- Approval portal repeats Total Amount and Markup before the decision controls.
- Final decision confirmation repeats available Total Amount and Markup.
- Missing commercial values render as `Not provided`; no values are fabricated.
- Markup does not appear in the customer-facing quotation PDF unless explicitly added by the quotation generator/template.
- Worker sends decision notification.
- Worker can retry transient Gmail failure.
- Worker can retry transient Sheets failure.
- Sheet outage does not roll back an approval decision.
- Sheet headers mismatch causes worker refusal rather than overwrite.
- Created and decided outbox events cannot overwrite each other's reporting row.
- `/api/health` reports expected build ID after deployment.
- Existing v0.2.6 one-supplier drafts reopen with all prior values in Supplier Option 1.
- A multi-supplier draft autosaves, survives refresh/sign-out/restart, and preserves the selected option.
- Removing the selected option safely selects the first remaining option and autosaves it.
- Generation writes one selected row plus repeated alternate-supplier comparison rows to the Dummy Tracker; only the selected supplier appears in the customer projection.
- Alternate supplier availability and internal notes do not appear in the Dummy Tracker row or customer-facing output.
- More than 10 supplier options and invalid/duplicate supplier option IDs are rejected.

## Device/browser matrix

- iPhone Gmail -> Safari.
- iPhone Gmail -> Chrome.
- Android Gmail -> Chrome.
- Desktop Chrome.
- Desktop Edge.
- Incognito/private browser.
- Correct Google account already signed in.
- Wrong Google account already signed in.
- Multiple Google accounts signed in.
- No Google session.
- Popup blocked once, then retry sign-in.
- Weak/mobile network during PDF open.
- Weak/mobile network during decision save.

Production should not be opened to all employees until the staging integration and device matrix are completed.
