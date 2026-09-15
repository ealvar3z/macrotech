# Connection status — 0.10.1-online-alpha.1

This document originated with the v0.10.0 readiness baseline. `ONLINE_TRANSPORT_ALPHA.md` is authoritative for the newly implemented desktop approval transport and its remaining deployment/authentication gate.

**NOT READY for connected “Send for approval → Approved” testing.** Offline source/tests have progressed; no live connections were established or changed. Do not mistake the preview or demo role switch for a functioning Google-authenticated workflow.

## Source integration still needed (not blocked merely by a login)

1. Wire Windows identity/session management and an authenticated transport adapter to v2. Keep tokens out of persisted quote JSON/logs and remove demo role authority from the connected mode. Implement stable persisted operation IDs and conflict/recovery UI.
2. Connect a mobile approval-record UI to the same v2 revision/hash/state contract. Existing web source remains on v1; email links must not mix schemas.
3. Connect the now-implemented local PDF/snapshot finalization to the trusted shared-service manifest lifecycle. Current v2 submission still requires a pre-existing trusted PDF manifest before it is runnable end-to-end.
4. Implement private upload/quarantine/scanning/download adapters and their negative tests. Only trusted workers may create CLEAN manifests. Optional customer attachments must not leak internal supplier documents.
5. Wire `notificationOutbox` to the new dispatcher with authorized recipient resolution, the synchronized staged template, retries/scheduling and UNCERTAIN reconciliation. The old worker consumes a different collection.
6. Add emulator/HTTP integration tests, legacy-record migration fixtures, schema rollback and true multi-PC conflict tests. Current backend tests cover the core with doubles, not the whole transport.
7. Add protected release/update metadata, signing and rollback. The local version/About markers are not an update service.

## External or user-interaction blockers

| Area | Required later | Current boundary |
|---|---|---|
| Windows | Approved build machine, dependencies, WebView2, UI/EXE tests, signing choice | No EXE compiled or tested here |
| Browser tooling | Installed compatible Chromium; run prepared smoke script and refine selectors if necessary | Launch failed here; script is unvalidated |
| Firebase/GCP staging | Verify selected project/IAM/database/bucket; authorize any deployment/configuration | No resources inspected/changed in this development pass |
| Approval policy | Approved employee prefixes, approver assignments, self-approval exceptions and expiry; reconcile UTC year boundary | No production policy chosen; v2 fails closed when required policy is absent |
| Q-Code bootstrap | Approved staging-only fixture/high-water mark and collision review | Do not allocate from or modify either Tracker |
| OAuth/Firebase Authentication | User-controlled sign-in/consent, approved client settings, token flow and real role tests | No OAuth changes, passwords or verification codes requested |
| Gmail/internal test sender | Authorized test-only mailbox, send-only authorization, verified allowlisted recipients, explicit send approval | No email sent, no production Gmail accessed |
| Google Workspace | Administrator access and commercial decision only if using a professional company sender | NOT required for offline testing; no subscription purchase or mailbox creation |
| Domain/Squarespace/DNS | Only if later approved for professional sender/custom domain | No changes required for this offline release |
| Billing/paid services | Separate user approval and budgets before enabling paid resources | No billing/resource changes |

Restored account/project access does not prove compliance, identity ownership or delivery reliability. Prior console screenshots and connection notes are historical evidence only; this pass did not re-audit the live account.

The live 2026 Master Tracker, Dummy Tracker, production Gmail, customer recipients, OAuth, Squarespace, DNS and Workspace remain untouched. Test success does not authorize changing them.
