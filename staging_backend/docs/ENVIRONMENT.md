# Environment Variable Reference

## Web (`web/.env`)

- `VITE_FIREBASE_API_KEY` - Firebase web API key/client configuration.
- `VITE_FIREBASE_AUTH_DOMAIN` - Firebase Authentication domain.
- `VITE_FIREBASE_PROJECT_ID` - Firebase project ID.
- `VITE_FIREBASE_APP_ID` - Firebase web app ID.

These are client configuration values, not server secrets. The `.env` file is still excluded from source packages.

## API

- `PUBLIC_APP_URL` - permanent Firebase Hosting/custom-domain application origin. HTTPS required except localhost development.
- `QUOTATION_BUCKET` - private Cloud Storage bucket name.
- `BOOTSTRAP_ADMIN_EMAIL` - optional temporary bootstrap preparer/admin email. Remove after role records are established.
- `BUILD_ID` - release/build identifier returned by health endpoint.
- `PORT` - supplied by Cloud Run; defaults to 8080 locally.

## Worker

- `PUBLIC_APP_URL` - permanent application origin used in email links.
- `SYSTEM_EMAIL` - Gmail mailbox used to send notifications.
- `APPROVAL_SHEET_ID` - dedicated production reporting spreadsheet ID.
- `APPROVAL_SHEET_NAME` - dedicated reporting tab; default `Production Approvals`.
- `GMAIL_CLIENT_ID` - Secret Manager only in production.
- `GMAIL_CLIENT_SECRET` - Secret Manager only in production.
- `GMAIL_REFRESH_TOKEN` - Secret Manager only in production.
- `BUILD_ID` - release/build identifier.
- `PORT` - supplied by Cloud Run; defaults to 8080 locally.

## Startup validation

API and worker fail fast when required configuration is absent or malformed. This is intentional: a misconfigured revision should fail deployment/health checks rather than run in a partially configured state.
