MACROTECH CLOUD REFERENCE - NOT DEPLOYED

This folder contains reviewable reference code for the future isolated test and
production cloud services. Nothing here is executed by the v0.6.0 desktop pilot.

allocate_q_code.ts demonstrates an atomic, idempotent Firestore transaction so
10-20 simultaneous employees cannot receive duplicate official Q-Codes. The
official naming pattern must be confirmed before it is wired into an application.

approve_quotation.ts demonstrates first-writer-wins approval in a transaction.
Approvers opening the record later receive the stored approver identity and time,
and cannot create a conflicting second approval.

The local demo continues to assign clearly non-production 26QDEM### codes when an
employee sends a quotation for internal approval.
