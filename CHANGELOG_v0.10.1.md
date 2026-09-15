# v0.10.1-online-alpha.1

- Created an isolated local candidate from `v0.10.0-tallies.1`.
- Added local and authenticated HTTP approval transports behind one `ApprovalService` boundary.
- Added explicit LOCAL/OFFLINE, TEST ONLINE and blocked PRODUCTION ONLINE modes.
- Added server-resolved current-user identity and a v0.10 desktop submission adapter.
- Added online submit, state retrieval, approve and return-for-correction support.
- Added strict response validation and safe 401, 403, timeout, malformed-response and server-error handling.
- Kept PDFs local and held all new notification events with delivery disabled.
- Added transport, authentication, role-boundary, no-false-success and owner-data leakage tests.
- No deployment or production resource change.
