# v0.2.7.1 Verification Record

Date: 2026-09-11

## Safety boundary

- Source-only local revision.
- No Cloud Run, Firebase Hosting, Firestore, Google Sheets, Gmail, OAuth, or production action was performed.
- No current/live 2026 Tracker was modified or accessed through a connected service.
- Existing Dummy Tracker configuration and exact-header safeguards are unchanged.

## Read-only evidence

- Project/Library search did not find an available `2026 TR` workbook.
- `2025 TR.xlsx` was inspected read-only with `openpyxl`.
- The current Dummy Tracker column E remains `CO SBM` based on Macrotech's independently verified 2026 rule; the older 2025 column-E header was not adopted.

## Automated verification

Commands completed successfully from the source root:

```text
npm run typecheck
npm run build
npm test
```

Results:

- Web, API, and worker typechecks passed.
- Web Vite build and API/worker TypeScript builds passed.
- API tests: 63 passed.
- Worker tests: 21 passed.
- Total: 84 passed, 0 failed.

Coverage added or retained includes:

- multiple suppliers for one quotation item;
- exactly one selected supplier and selection changes;
- selected-only customer quotation projection;
- selected-first repeated Tracker rows retaining every alternate;
- repeated/option-specific/blank Tracker field behavior;
- alternate supplier autosave and recovery;
- validation of incomplete alternates before Tracker generation;
- v0.2.6 flat single-supplier draft migration;
- monotonic autosave revisions, generation locking, Q-Code rules, and existing approval/notification safeguards.

## Packaging boundary

The review ZIP is source-only. Dependency directories, generated `dist` output, caches, logs, and local analysis scripts/workbooks are excluded.
