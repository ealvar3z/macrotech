# Q-Code Generation Pilot Specification

Status: local prototype only. Not connected to Firebase, Firestore, the live
Master Tracker, or employee Google Sheets.

## Confirmed format

New Q Codes use:

`YYQEEE####`

- `YY` is the final two digits of the calendar year.
- `Q` identifies a quotation.
- `EEE` is the employee's confirmed three-letter code.
- `####` is that employee's annual quotation sequence, left-padded to four
  digits from `0001` through `9999`.

Examples:

- `26QJCG0001`
- `26QJCG0140`
- `27QLPR0001`

Each employee has an independent sequence that restarts at `0001` each year.
Historical Q Codes are preserved exactly as recorded and are not reformatted.

## One quotation, multiple line items

A Q Code identifies the quotation, not an individual spreadsheet row. Every
line item belonging to the same quotation uses the same Q Code. Each line item
must also receive a separate immutable internal line-item identifier so it can
be tracked through partial customer PO acceptance, delivery, invoicing, and
collection without changing the quotation identity.

## Revisions

Revisions retain the base Q Code. The revision number is stored separately and
displayed as quotation metadata. New records must not append `.1`, `R1`,
`REV1`, or similar text to the Q-Code field.

## Safe allocation

The production generator must allocate a number inside one Firestore
transaction using one counter document per calendar year and employee code.
Scanning the Master Tracker and then choosing the highest number is permitted
only for migration/bootstrap analysis; it is not safe for live allocation
because two employees or browser tabs could select the same next number.
If the bootstrap scan finds an unrecognized value containing the requested
year-and-employee series, it stops for manual review instead of silently
ignoring the value and risking a duplicate.

The transaction must:

1. verify the authenticated employee and their assigned employee code;
2. read the matching annual counter;
3. reject a counter above `9998` rather than producing a fifth digit;
4. increment the counter exactly once using an idempotent request identifier;
5. create the immutable Q-Code reservation and audit record in the same
   transaction;
6. return the reserved Q Code to the employee workspace;
7. never recycle a reserved number after cancellation or abandonment.

## Employee-sheet integration

Employees may continue using a spreadsheet-style entry experience. Employee
input fields should be submitted to the application, validated, and mapped to
the Master Tracker schema. Formula-controlled and management-only fields must
not be copied from an employee sheet into the Master Tracker. A trusted system
identity will write only the normalized, approved field set after pilot access
and mappings are confirmed.

When an RFQ or parts inquiry arrives before a Q Code exists, the application
creates a pre-Q-Code intake record using the RFQ/inquiry reference. The Q Code
is reserved only at the confirmed quotation-start point. That exact business
trigger remains a pilot configuration decision before live integration.

## Current local test coverage

The isolated prototype verifies four-digit formatting, normalization of the
three-letter employee code, yearly and per-employee sequence separation,
legacy one-to-four-digit parsing for bootstrap analysis, observed legacy
revision suffix handling, multiple-line-item repetition, invalid input, and
sequence exhaustion.
