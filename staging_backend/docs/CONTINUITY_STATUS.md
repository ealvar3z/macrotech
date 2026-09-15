# Continuity Readiness Status

Last source update: V0.2.3 continuity hardening.

This is a readiness ledger, not marketing language. `Documented` means the procedure exists; `Verified` means evidence from a real exercise exists.

| Control | Status | Notes / next evidence required |
|---|---|---|
| Architecture documented | Implemented | `ARCHITECTURE.md` |
| Environment/config reference | Implemented | `ENVIRONMENT.md`; secret values intentionally absent |
| IAM model | Implemented / live verification pending | API least-privilege model documented; run preflight after adding required live roles |
| Source release manifest | Implemented | Run `release-manifest.ps1` on Node 24 workstation before release |
| Non-secret cloud continuity snapshot | Implemented | Run `continuity-snapshot.ps1` after live deployment |
| Read-only rollback planner | Implemented | `rollback-plan.ps1`; actual rollback drill still pending |
| Business Continuity Mode | Documented | Management emergency-approval method and reconciliation owner still need formal acceptance |
| New-developer handoff | Documented | Handoff drill not yet performed |
| Cloud Run rollback | Documented, not yet proven | Perform staging/pilot recovery drill |
| Firebase Hosting rollback | Documented, not yet proven | Perform staging/pilot recovery drill |
| Quotation Storage recovery | Protection exists; recovery drill pending | Current bucket has PAP and observed 45-day soft delete; verify live policy and perform test-object drill |
| Firestore backup/PITR | **Open production gate** | Select/enable appropriate mechanism, record cost/retention, test restore into separate recovery target |
| Reporting Sheet rebuild | Architecture supports it; tooling/process incomplete | Build supported reconciliation/rebuild tooling before relying on automated recovery |
| Gmail/OAuth recovery | Documented; production OAuth setup pending | Complete OAuth production configuration and failure/retry drill |
| Eventarc/worker recovery | Architecture documented; live deployment pending | Deploy then capture trigger/service config in snapshot |
| Second human recovery administrator | **Open governance gate** | Designate and verify at least one additional recoverable admin before broad rollout |
| Private source repository | **Open continuity gate** | Move from local ZIP workflow to owner-controlled private Git repository before V1.0 |
| Off-device release archive | Open | Keep immutable release artifacts/manifests in a second secure location |
| Continuity reconciliation feature | Roadmap | Needed to reconcile emergency manual quotations cleanly |

## Production claim rule

Do not describe the system as disaster-recovery proven until the relevant drill has passed and evidence has been recorded. A documented control is not the same as a tested control.
