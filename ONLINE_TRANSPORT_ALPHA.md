# v0.10.1 Online Transport Alpha

This is a local test candidate derived from `v0.10.0-tallies.1`. It is not deployed and production mode is deliberately blocked.

## Contract

All workflow routes require a verified Firebase ID token except health.

| Operation | Method and route | Purpose |
|---|---|---|
| Health | `GET /api/health` | Reachability and build identity |
| Current user | `GET /api/v2/desktop/current-user` | Server-resolved identity, active state, role and employee code |
| Submit | `POST /api/v2/desktop/submissions` | Create an immutable test approval from an allowlisted v0.10 snapshot |
| State | `GET /api/v2/desktop/quotations/{quotationId}` | Retrieve authoritative approval state |
| Approve/return | `POST /api/v2/desktop/approvals/{approvalId}/decision` | Persist an authorized approval or return-for-correction decision |

The desktop never sends a role. The backend verifies the Firebase token, reads `users/{uid}`, checks active membership, enforces the assigned approver and self-approval policy, and allocates the Q-Code transactionally.

## Modes

- `LOCAL_OFFLINE` is the default and retains the existing local JSON workflow.
- `TEST_ONLINE` enables the authenticated HTTP transport.
- `PRODUCTION_ONLINE` raises `PRODUCTION_DISABLED` in this alpha.

Test-online runtime configuration:

- `MACROTECH_CONNECTION_MODE=TEST_ONLINE`
- `MACROTECH_API_URL=https://<dedicated-v010-test-endpoint>`
- `MACROTECH_TEST_APPROVER_UID=<provisioned-test-approver-uid>`
- `MACROTECH_API_TIMEOUT_SECONDS=15` (optional, range 1–60)
- `MACROTECH_TEST_ID_TOKEN=<short-lived-token>`

The token environment provider is only a controlled-test bridge. It does not store or log tokens. Before production, replace it with interactive Firebase Google sign-in and Windows secure session storage.

## Safety boundaries

- HTTP handling is centralized in `macrotech_demo/approval_transport.py`.
- A failed or malformed online response is raised as an error before local workflow success is recorded.
- Customer requests use an explicit field allowlist; owner-control and client role data are not serialized.
- The desktop adapter does not upload PDFs. PDFs remain local in this candidate.
- Submission notifications are held in `desktopApprovalOutbox` with delivery disabled. The existing mail/Sheets worker is not invoked.
- No Tracker write is part of this transport contract.

## Deployment gate

A controlled test requires a new dedicated v0.10 test API deployment with Firebase Authentication and test-only Firestore memberships, approval policy and Q-Code counter. Do not point this candidate at the historical v0.2.4 service. No production configuration or Google Sheet permission is required for approval-transport testing.
