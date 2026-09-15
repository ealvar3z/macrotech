# Automated Tracker Fill Pilot

## Scope

This feature is an isolated test path for the Macrotech quotation project. It writes only to the separate **Macrotech Automated Fill Pilot Tracker - DUMMY** spreadsheet and never writes to the CEO's live `2026 TR` Master Tracker.

- Test web route: `/tracker-test`
- Test API route: `POST /api/v1/pilot-tracker/entries`
- Target tab: `MARK-UP`
- Pilot employee code: `TST`
- Gmail dependency: none
- Live Master Tracker access: none

The existing approval submission, approval decision, PDF security, Gmail worker, and production reporting mirror remain separate and unchanged.

## What the pilot does

1. The requester signs in with Firebase Authentication.
2. The API verifies the Firebase ID token and the preparer role.
3. A Firestore transaction reserves one Q Code using `YYQEEE####` and one unique spreadsheet row per quoted item.
4. The same Q Code is used for every line item in the submission.
5. The API copies the Dummy Tracker's template row into each reserved row so formulas and formatting are preserved.
6. The API writes only the system and employee-input columns. Calculated columns remain formulas.
7. The API reads back the Q Code and formula sentinel columns before reporting success.

The client supplies a UUID request ID. Retrying the same unchanged request uses the same reserved Q Code and rows instead of creating duplicates.

## Pilot-only Q-Code safety

The test environment is intentionally restricted to employee code `TST`. This prevents a pilot submission from looking like an official employee's live Q Code. Real employee-code mappings and historical counter bootstrap must be confirmed before expanding this rule.

## Configuration for the test API only

```text
PILOT_TRACKER_ENABLED=true
PILOT_TRACKER_SHEET_ID=1x0rBTW1uhdQqwR9nNjduqEQOXvDEw5O3IybbW2lA0M8
PILOT_TRACKER_SHEET_NAME=MARK-UP
PILOT_TRACKER_EMPLOYEE_CODE=TST
PILOT_TRACKER_TEMPLATE_ROW=3
PILOT_TRACKER_FIRST_WRITE_ROW=6
```

The frontend may use this non-secret convenience setting:

```text
VITE_PILOT_TRACKER_URL=https://docs.google.com/spreadsheets/d/1x0rBTW1uhdQqwR9nNjduqEQOXvDEw5O3IybbW2lA0M8/edit
```

The test Cloud Run API runtime service account needs editor permission on the Dummy Tracker. Use Google-managed runtime credentials; never download or package a service-account key.

## Field and formula boundary

The application fills the quote identifiers, customer, buyer, supplier, item, quantity, unit price, charges, currency evidence, delivery, duty rate, pilot mark-up multiplier, and remarks. Currency remains explicit in the stored Firestore payload and is also written into Additional Remarks because the observed `MARK-UP` tab has no dedicated currency column.

The API does not invent formulas. It copies the formula cells already present in the Dummy Tracker template row. Those formulas are still pilot assumptions until Macrotech confirms the official Master Tracker mappings for mark-up, duties and taxes, safety factor, commissions, and currency treatment.

## Test sequence

1. Confirm `firebase use` reports `macrotech-approval-pilot-kc26`.
2. Deploy only the API service `macrotech-approval-api-pilot` with the pilot settings above.
3. Deploy only the Firebase `approval-test` preview channel using `firebase.approval-test.json` and site `macrotech-approval-pilot-kc26`.
4. Open `/tracker-test` while signed in as the authorized requester.
5. Submit one item and confirm a new `26QTST####` code and one new row.
6. Submit two items and confirm both new rows share one new Q Code.
7. Confirm formulas remain formulas in the new rows.
8. Retry an identical request after a simulated network interruption and confirm no duplicate Q Code or row reservation is created.

Do not deploy the Gmail worker while the sender account is disabled. Do not change the live `2026 TR` sharing or contents for this pilot.
