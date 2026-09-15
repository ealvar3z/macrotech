# Recovery Drill Program

Documentation is not considered proven until recovery steps have been exercised safely.

## Drill rules

- Use staging/non-production whenever a destructive action would otherwise be required.
- Never delete production data simply to prove recovery.
- Record date, participants, starting version, expected result, actual result, evidence, issues, and corrective actions.
- A failed drill is useful evidence; fix the process and repeat it.

## Drill A — application rollback

**Goal:** prove a bad application release can be backed out.

1. Deploy a harmless staging revision with a visible test build ID.
2. Confirm health endpoint reports the new build.
3. Identify the previous known-good Cloud Run/Hosting release.
4. Perform the documented staging rollback.
5. Verify prior build ID, authentication, approval read, wrong-account rejection, and private PDF behavior.

**Pass condition:** prior known-good application is restored without modifying final approval records.

## Drill B — quotation object recovery

**Goal:** prove an accidentally removed PDF can be recovered using configured Storage protection.

1. Create a dedicated non-production test PDF.
2. Delete it intentionally in the test environment or within an approved recovery exercise.
3. Recover it using the configured soft-delete/versioning mechanism.
4. Verify object content/hash and authenticated application access.

**Pass condition:** original bytes are recovered and remain private.

## Drill C — Firestore restore

**Goal:** prove authoritative approval/audit data can be restored.

1. Confirm backup/PITR mechanism is enabled and current.
2. Restore a controlled backup into a separate recovery target, not over active production.
3. Verify approval document, audit events, commercial snapshot, data checks, and outbox state.
4. Compare representative counts/IDs with expected source data.

**Pass condition:** recoverable data is verified without damaging production.

## Drill D — reporting Sheet loss

**Goal:** prove Sheets is replaceable.

1. Use a staging/dedicated test reporting Sheet.
2. Simulate an unusable/missing mirror.
3. Rebuild/reconcile it from Firestore using the supported process.
4. Confirm headers and representative approval rows.

**Pass condition:** reporting is restored without treating the old Sheet as authoritative.

## Drill E — Gmail/OAuth outage

**Goal:** prove approval integrity survives notification failure.

1. In staging, intentionally make worker email delivery fail safely.
2. Complete an approval through the authenticated application.
3. Verify Firestore final decision remains correct and outbox records the downstream failure.
4. Restore OAuth/configuration and retry processing.

**Pass condition:** approval remains authoritative and notification resumes without changing the decision.

## Drill F — maintainer handoff

**Goal:** prove the system is not dependent on one developer or ChatGPT history.

Give a technically competent person only the repository, approved credential/access process, and these docs. Ask them to run local verification, identify architecture/source of truth, inspect current production health, and describe the rollback/data recovery process.

**Pass condition:** they can do so without historical chats or undocumented verbal instructions.

## Required before V1.0 company-wide rollout

At minimum successfully complete A, B, D, E, and F. Complete C once the production Firestore backup/PITR mechanism has been selected and enabled.
