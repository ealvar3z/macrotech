# Employee Workspace Pilot — v0.2.6

## Purpose

This pilot moves quotation preparation into the Macrotech web application while preserving the existing Master Tracker structure as the downstream output format.

## Pilot behavior

- `/workspace` shows **My Quotations** for the signed-in preparer.
- Each new quotation begins as a private Firestore-backed draft owned by that signed-in account.
- Draft fields auto-save online after a short pause and also support a manual **Save Draft** action.
- Autosave requests carry a monotonically increasing client revision so a delayed older request cannot overwrite a newer save.
- Incomplete drafts are allowed to save. Final generation re-runs the strict Tracker validation rules.
- The pilot employee code remains `TST`.
- **Generate & Update Dummy Tracker** reserves the Q Code and uses the existing validated Dummy Tracker synchronization path.
- Generation locks the draft before the external Google Sheets write so an autosave cannot change the quotation while the Tracker snapshot is being written.
- After successful generation, the quotation snapshot is locked in the employee workspace.
- Generated data still writes only to the separate Dummy Tracker. The live Macrotech Master Tracker remains untouched.

## Tracker compatibility

The existing `syncPilotTrackerRows` implementation is reused unchanged. This preserves the currently tested mapping, column positions, template-row formula copy behavior, and the existing `1.75` mark-up multiplier convention.

No dedicated discount column is introduced. Discount-related context can continue through the existing remarks fields until Macrotech's historical practice is reviewed and confirmed.

## Current limitations

- This version does not yet generate the customer-facing quotation PDF from the workspace.
- This version does not yet submit a generated workspace quotation into the approval workflow automatically.
- This version does not yet provide admin/company-wide quotation search.
- This version does not yet implement revisions of a generated quotation. Generated snapshots are intentionally locked during this pilot.
- Gmail notification work remains independent and on hold.

## Validation gate before deployment

1. Run `npm ci` with the project's supported Node.js version.
2. Run `npm run build`.
3. Run `npm test`.
4. Deploy only to the existing isolated pilot Cloud Run and Firebase Hosting environment.
5. Set `BUILD_ID=v0.2.6-workspace-pilot` on the pilot API revision.
6. Confirm `/api/health` before opening `/workspace`.
7. Create one draft, edit it, wait for **Saved**, refresh the browser, and verify values persist.
8. Generate one pilot quotation and confirm the Q Code and Dummy Tracker row(s) match the saved snapshot.
9. Do not enable live Master Tracker writes.
