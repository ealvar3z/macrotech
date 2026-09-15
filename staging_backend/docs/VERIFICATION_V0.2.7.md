# v0.2.7 Verification Record

## Result

Local source verification passed on September 11, 2026 using Node.js 24.19.0 and npm 11.9.0.

- `npm ci`: passed; 362 packages installed from the lockfile.
- `npm run typecheck`: passed for web, API, and worker.
- `npm test`: passed 79 tests total (58 API and 21 worker).
- `npm run build`: passed for web, API, and worker.

## Multi-supplier coverage added

- New drafts start with one selected supplier option.
- Multiple supplier options survive draft schema round-trip/autosave serialization.
- Stale or repeated client revisions are ignored.
- Only the selected supplier maps to final Tracker values.
- Switching selection changes output without mutating alternate options.
- Missing selection, duplicate option IDs, empty option arrays, and more than ten options are rejected.
- Legacy v0.2.6 flat supplier drafts migrate to one selected supplier option.
- Incomplete drafts remain saveable, while final Tracker generation remains strict.

## Boundaries

No deployment, cloud configuration change, Firestore write, Google Sheets write, Gmail action, or OAuth action was performed during this verification.
