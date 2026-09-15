# Disaster Recovery and Data Protection

## Recovery objective

The platform must be recoverable without reconstructing behavior from chat history or memory. Firestore and private quotation PDFs are the critical business data. Application binaries can be rebuilt from a known source release.

## Authoritative data

Firestore is the source of truth for approvals and audit history. Google Sheets is not a backup and must not be used to reconstruct authoritative state without reconciliation.

## Recovery targets

Formal RTO/RPO values must be agreed with Macrotech management before company-wide V1.0 rollout. Until then:

- do not promise a contractual recovery time;
- design for rapid application rollback (minutes rather than rebuild-from-scratch);
- configure data protection based on acceptable loss window and cost;
- preserve Business Continuity Mode so quotation work can continue during a longer outage.

## Firestore

Before broad production rollout:

- Select and enable an appropriate Firestore backup/PITR strategy supported by the production database plan.
- Record whether PITR and/or scheduled backups are enabled, schedule, retention, expected RPO, cost impact, and recovery owner.
- Test restore into a separate non-production/recovery target before claiming restore readiness.
- Never overwrite active production merely to test restore capability.
- Never run destructive migration/setup scripts against production.

A reporting Sheet or email archive is **not** an acceptable Firestore backup.

## Quotation PDFs

The production quotation bucket has Public Access Prevention enabled and soft-delete protection was configured during setup. The observed configuration was a 45-day soft-delete window; verify the live bucket policy with `scripts/continuity-snapshot.ps1` before relying on it.

Soft delete is accidental-deletion recovery, not a substitute for an agreed business retention/backup policy. Before changing lifecycle or retention settings, verify Macrotech's contractual/accounting requirements and cost impact.

## Source code and deployment evidence

Every production release needs an identifiable source version and release manifest. Keep source/release evidence off the developer's single laptop. A private Git repository is the preferred long-term source of truth.

For each production release preserve:

- version/tag/commit or immutable source archive;
- package lock and source hashes;
- Cloud Run revision/build ID;
- Hosting release/rollback reference;
- non-secret configuration snapshot;
- verification result.

## Google Sheet mirror

If the reporting Sheet is lost or damaged, rebuild/reconcile it from Firestore rather than treating the Sheet as authoritative. The worker refuses to overwrite unexpected Sheet headers.

Before V1.0, provide a supported rebuild/reconciliation procedure/tool and test it in staging.

## Gmail

Notification delivery state is recorded in outbox documents. Email is a notification channel, not authoritative approval evidence. Firestore audit records govern the approval decision.

If Gmail/OAuth is unavailable, approvals must remain possible when business policy permits; failed downstream notifications are repaired/retried after the integration is restored.

## Application rollback

- Identify the prior known-good release **before** deployment.
- Firebase Hosting/Cloud Run release relationships must be recorded as deployment evidence.
- Roll back application code without reverting Firestore business documents.
- Schema changes must remain backward compatible unless a separately tested migration and rollback plan exists.
- Use `scripts/rollback-plan.ps1` to inspect current/recent Cloud Run revisions; it is intentionally read-only.

## Disaster recovery order

When multiple components are affected, restore in this priority unless the incident demands otherwise:

1. Google account/project administrative access.
2. Firestore authoritative data availability/integrity.
3. Private quotation document availability.
4. Authentication and API.
5. Firebase Hosting employee front door.
6. Worker/Eventarc notification processing.
7. Google Sheet reporting mirror.

This order protects business truth before convenience integrations.

## Evidence and drills

Follow `RECOVERY_DRILLS.md`. Recovery is not considered proven simply because a document exists.
