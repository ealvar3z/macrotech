# System Ownership & Access Matrix

## Objective

The platform must not depend on one person's browser session or one undocumented credential. At the same time, production access should be limited enough that an accidental click or compromised account cannot destroy the system.

## Ownership principles

1. The production Google Cloud/Firebase project must have at least two recoverable human administrators before company-wide rollout.
2. Human administrators use their own Google identities; shared passwords are not an administration strategy.
3. Runtime services use dedicated service accounts, not a developer's personal account.
4. Secrets are stored in Secret Manager or the approved provider's secure credential store.
5. Macrotech business data remains exportable and belongs to Macrotech under the commercial agreement.
6. Software source/IP ownership is governed separately by the licensing agreement.
7. Removing an administrator must never remove the last recovery-capable administrator.

## Recommended role matrix

| Role | Typical holder | Access needed | Must not receive by default |
|---|---|---|---|
| Product owner | Licensor / platform owner | Source repository, release control, architecture, non-secret operations docs | Shared OAuth passwords; employee impersonation |
| Cloud owner / break-glass admin | At least two named trusted humans | Project recovery/admin capability, billing recovery | Routine daily use of Owner for normal operations |
| Release operator | Named technical maintainer | Deploy Cloud Run/Hosting, view logs, inspect IAM | Ability to alter business approvals manually |
| API runtime | `macrotech-approval-api@...` | Firestore data access, Firebase Auth viewer, quotation object viewer | Project Owner/Editor; bucket admin; secret admin unless explicitly needed |
| Worker runtime | dedicated worker service account | Outbox access, invocation dependencies, Secret Manager access to only its required secrets, Sheet/Gmail integrations | Project Owner/Editor; unrelated secrets |
| Macrotech approver | individual employee Google account | Approve only records assigned to that verified identity | Firestore console/admin; source code; service-account keys |
| Macrotech preparer | individual employee Google account | Create/process quotation requests as allowed by application role | Direct Firestore mutation; infrastructure access |
| Read-only auditor | management/auditor when needed | Reporting/audit views | Deployment, IAM, secrets, manual approval mutation |

## Critical recovery records to maintain outside a single laptop

Maintain a secure administrative record containing:

- production project ID and billing account relationship;
- names of at least two authorized human recovery administrators;
- registrar/custom-domain ownership if/when a custom domain is used;
- source repository ownership/recovery method;
- Secret Manager inventory **names only** (never secret values in this document);
- Gmail/OAuth client ownership and recovery contact;
- Google Sheet reporting file identity;
- backup/PITR policy and restore owner;
- last known-good production release/version/build ID.

## Break-glass rule

A break-glass administrator is for account/resource recovery, not normal application operation. Any break-glass use should be recorded in the incident log with reason, person, time, changes made, and follow-up action.
