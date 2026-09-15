# Macrotech Approval Workflow Test v0.2.4

Purpose: validate the requester-to-approver experience before integrating live Q-code generation.

## Test fields
- Q Code
- Customer
- RFQ / Inquiry
- Total Amount
- Mark-Up
- Duties and Taxes
- Safety Factor
- Delivery
- Requester Comment
- Approver Google email

## Test flow
1. Requester signs in with Google.
2. Requester enters the approval test values and a comment.
3. API creates a pending approval and immutable commercial snapshot.
4. Notification worker emails the assigned approver.
5. Approver opens the secure mobile review page and signs in with the assigned Google account.
6. Approver sees Q Code, total, markup, duties/taxes, safety factor, requester comment, and data-check state.
7. Approver chooses Approve or Return for Correction.
8. Return requires an approver comment; Approve comment is optional.
9. Final decision is recorded once and notification is sent back to the requester.

## Deliberate exclusions
- No Master Tracker reads or writes in this test.
- No Q-code generation in this test.
- No fabricated data-check passes; checks remain NOT_RUN unless a future generator supplies evidence.
- No customer release action.
