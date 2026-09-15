# Macrotech Continuity & Recovery Package

## Purpose

This package exists so the Macrotech Quotation Approval Platform can be operated, diagnosed, rebuilt, and recovered without relying on a ChatGPT conversation, one laptop, or one developer's memory.

## Governing principle

**No critical knowledge required to operate, repair, rebuild, or deploy the platform may exist only in chat, personal memory, or an untracked local file.**

Every production-impacting decision must ultimately be represented in source control, documented configuration, an approved runbook, or an auditable cloud resource.

## Document map

Read these in this order when taking over the system:

1. `ARCHITECTURE.md` — how requests, identity, approvals, storage, notifications, and reporting fit together.
2. `SYSTEM_INVENTORY.md` — expected production components and what each one does.
3. `SYSTEM_OWNERSHIP_AND_ACCESS.md` — who should own/administer each critical resource and what access must never be shared casually.
4. `ENVIRONMENT.md` — configuration values and which are secrets.
5. `SECURITY_MODEL.md` — authorization, least privilege, private PDFs, and approval integrity.
6. `DEPLOYMENT_CHECKLIST.md` — controlled deployment process.
7. `SOURCE_CONTROL_AND_RELEASES.md` — versioning, tags, release records, and rollback prerequisites.
8. `OPERATIONS_RUNBOOK.md` — normal health checks and incident triage.
9. `BUSINESS_CONTINUITY.md` — how Macrotech keeps working if the platform is temporarily unavailable.
10. `DISASTER_RECOVERY.md` — data protection, restore principles, and recovery order.
11. `RECOVERY_DRILLS.md` — practical tests that must be performed before claiming recovery readiness.
12. `DEPENDENCY_MAINTENANCE.md` — how to handle Node/npm/library/security updates without destabilizing production.
13. `NEW_DEVELOPER_ONBOARDING.md` — handoff checklist for a replacement/second developer.
14. `CONTINUITY_STATUS.md` — what is implemented, what is only documented, and what still requires a live test.

## Read-only evidence tools

- `scripts/release-manifest.ps1` creates a local release manifest containing source hashes and tool versions.
- `scripts/continuity-snapshot.ps1` captures non-secret cloud configuration and deployment evidence for troubleshooting/recovery.
- `scripts/rollback-plan.ps1` produces a read-only rollback plan. It does **not** move production traffic.

These scripts are intentionally non-destructive.

## What is authoritative

- **Approval state and audit trail:** Firestore.
- **Quotation PDFs:** private Cloud Storage bucket.
- **Application code:** source-controlled repository/release archive.
- **Deployment identity/configuration:** Google Cloud/Firebase plus recorded release evidence.
- **Google Sheet:** reporting mirror only.
- **Gmail:** notification channel only.

Never reconstruct final approval truth from email or the reporting Sheet when Firestore is available.
