# Production System Inventory

This file describes the intended production inventory. It is not proof that every item is already enabled; use `CONTINUITY_STATUS.md` and a fresh `continuity-snapshot.ps1` output for current evidence.

| Component | Expected identifier / location | Purpose | Authoritative? | Recovery note |
|---|---|---|---|---|
| Google Cloud / Firebase project | `macrotech-approval-production` | Production control plane | Yes for deployed resources | Do not recreate under a new project ID during an incident unless a disaster-recovery plan explicitly requires it. |
| Firebase Hosting | project default web site | Stable employee-facing URL | No business data | Can be redeployed from source/release. |
| Firebase Authentication | Google sign-in | Verified employee/approver identity | Identity source | Preserve provider configuration and authorized domains. |
| Firestore | `(default)`, `asia-east1` | Approval state, audit history, roles, outbox | **Yes** | Protect with backup/PITR strategy and test restore separately. |
| Cloud Run API | `macrotech-approval-api`, `asia-east1` | Authenticated approval business logic | No business data at rest | Redeploy/rollback to known-good revision. |
| API service account | `macrotech-approval-api@macrotech-approval-production.iam.gserviceaccount.com` | Runtime identity | Security-critical config | Requires only documented least-privilege roles. |
| Quotation bucket | `macrotech-approval-production-quotations`, `asia-east1` | Private quotation PDFs | **Yes for documents** | Public Access Prevention stays on; soft delete is recovery aid, not backup policy. |
| Cloud Run worker | deployment name defined at worker deployment | Gmail + Sheet outbox processing | No authoritative approval state | Can be redeployed; pending outbox state remains in Firestore. |
| Eventarc trigger | deployment-defined | Delivers outbox events to worker | No | Recreate from documented deployment config if lost. |
| Gmail sender | dedicated Macrotech quotation mailbox | Approval/requester notifications | No | OAuth secrets belong in Secret Manager; email is never approval evidence. |
| Google Sheet mirror | dedicated production spreadsheet/tab | Human-readable reporting | No | Rebuild from Firestore if damaged. |
| Secret Manager | project secrets for worker OAuth | Stores sensitive credentials | Security-critical | Never store secret values in repo, screenshots, frontend env, or documentation. |
| Source repository / release archive | owner-controlled | Rebuild/maintenance source | **Yes for code** | Every production release must be identifiable by version + commit/tag or immutable archive + hashes. |

## Region policy

Current application data plane is standardized around `asia-east1` for Firestore, quotation storage, and Cloud Run. A future region change is a migration project, not an incident workaround.
