# Security Model

## Trust boundaries

The browser is untrusted. Firebase ID tokens, not browser-supplied identity fields, establish employee identity. Firestore browser rules deny every direct read and write. Cloud Run services use Google-managed runtime credentials; no service-account key file is required in the application.

## API service account

Recommended identity:

`macrotech-approval-api@PROJECT_ID.iam.gserviceaccount.com`

Minimum current permissions:

- `roles/datastore.user` on the project for Firestore approval/audit/outbox operations.
- `roles/firebaseauth.viewer` on the project because revoked-token checking reads Authentication user state.
- `roles/storage.objectViewer` on the quotation bucket only.

Do not grant the API `Owner`, `Editor`, `Storage Admin`, or Firebase Authentication Admin.

## Authentication and authorization

- Google provider is enabled through Firebase Authentication.
- API requires a valid, non-revoked Firebase ID token.
- API requires a verified email claim.
- Approval view, PDF access, and decision compare the verified email to the assigned approver.
- Wrong-account errors do not disclose the assigned approver's email.
- Preparer/admin permission is based on the authenticated UID's `users/{uid}.role`, with an optional temporary bootstrap email.
- Remove `BOOTSTRAP_ADMIN_EMAIL` after production role records are established.

## Decision tamper resistance

- Final decision writes use a Firestore transaction.
- Only pending approvals may transition to a final state.
- Server timestamps are used for authoritative business timestamps.
- `Decision By` is derived from the verified token.
- Idempotency request IDs prevent accidental duplicate submission.
- Reusing an idempotency ID with a different payload is rejected.
- Audit and outbox writes occur in the same transaction as the final state change.

## Data exposure controls

- Quotation bucket remains private with Public Access Prevention enabled.
- The browser receives no direct Cloud Storage URL.
- Firestore client rules deny all access.
- Frontend dynamic text is HTML-escaped before use in generated markup.
- Email dynamic HTML is escaped.
- Business fields used in MIME headers reject control characters; email subjects are RFC 2047 encoded.
- API error responses do not contain stack traces.
- Production server logs suppress stack traces by default.

## Web controls

Firebase Hosting supplies defensive headers including clickjacking protection, `nosniff`, a restrictive permissions policy, a CSP intended for Firebase Authentication, and a popup-compatible Cross-Origin-Opener-Policy.

The CSP must be smoke-tested after each authentication-domain/custom-domain change.

## CSRF and replay

The API does not use browser cookies for authorization. Mutating calls require a Firebase bearer token in the Authorization header, so conventional cross-site request-forgery attacks are not the primary risk. Decision replay is constrained by final-state immutability and idempotency semantics.

## Abuse and cost controls

The pilot uses Cloud Run minimum instances `0` and a conservative maximum instance count. A $5 billing alert is configured. Rate limiting/App Check is not yet implemented and remains a production-hardening option if the service becomes publicized or materially higher volume.

## Secrets

Gmail OAuth client secret and refresh token must be stored in Secret Manager and mounted/injected only into the private worker. Never place those values in Firebase frontend config, Git, Firestore, Google Sheets, screenshots, or source ZIPs.

Firebase web API configuration is public client configuration, but `.env` files remain excluded from source packages to enforce consistent secret hygiene.
