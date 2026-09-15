# Multi-Supplier Tracker Pilot — v0.2.7.1

## Scope and safety boundary

This source-only revision extends the v0.2.6 Employee Workspace and corrects the v0.2.7 Tracker behavior. It does not deploy or change Cloud Run, Firebase Hosting, Firestore rules/indexes, Google Sheets, Gmail, OAuth, or any live Master Tracker.

The isolated Dummy Tracker guard, exact 52-column header check, generation lock, Q-Code transaction, My Quotations ownership, autosave revisions, and reload recovery remain in place. Current Dummy Tracker column E remains `CO SBM`, as independently verified for the 2026 structure.

## Draft and selection model

Each item holds one to ten supplier options and exactly one `selectedSupplierOptionId`. Supplier options retain supplier/name/email, currency, unit price, supplier lead time, availability, internal notes, freight, packing, bank charges, other charges, forex rate, and duty rate.

The selected ID remains authoritative in the private Firestore/app draft. No selection column or written selection marker is added to the Tracker. Stable option IDs and per-option costs permit future cheapest, fastest, lowest-landed-cost, and preferred-supplier indicators without implementing ranking in this pilot.

## Separate customer and Tracker projections

Generation now has two explicit boundaries:

1. The customer-quotation projection emits exactly one row per quotation item and uses only the selected supplier's commercial values.
2. The Tracker projection emits the selected supplier first, followed by all alternate supplier options for that item.

Customer-facing code must consume the selected-only projection. Availability, internal supplier notes, alternate suppliers, and alternate commercial values are absent from it. This prevents a repeated Tracker row from becoming a customer quotation line merely because both projections originate from the same draft.

## Repeated Tracker-row mapping

No Tracker columns were added. For each supplier option, the mapper uses the existing 52-column layout:

| Row field | Selected row | Alternate rows |
|---|---|---|
| Item number, description, offer, CO SBM | Repeated item context | Repeated item context |
| Due date, Q Code, offer date, RFQ, customer, buyer | Repeated quotation context | Repeated quotation context |
| UOM, quantity, mark-up, Macrotech delivery | Repeated item context | Repeated item context |
| Supplier/email, unit price, landed-cost inputs, supplier lead time, forex, duty | Selected option values | Corresponding alternate option values |
| Formula/result columns | Copied from the existing Dummy Tracker template row | Copied from the existing Dummy Tracker template row |
| Mark-up remarks and item Additional Remarks | Preserved | Blank; not duplicated |
| Existing AZ pilot currency/safety marker | Preserved with selected currency | Preserved with alternate currency |
| Availability and supplier internal notes | Not written | Not written |

Discount handling remains free text in existing remark fields. No discount field or formula was added.

## Read-only workbook evidence

The available Project files were searched for an actual current `2026 TR` workbook. None was available in the Project at revision time, so no live or connected Sheet was accessed. The current Dummy Tracker column-E `CO SBM` rule supplied by Macrotech therefore takes precedence over the older 2025 header.

Read-only inspection of uploaded `2025 TR.xlsx`, sheet `MARK-UP`, found 13,226 non-empty rows through row 15,423. A normalized Q Code + customer + description comparison found 293 multi-supplier candidate groups. A stricter near-consecutive scan found 133 comparison blocks and 159 alternate rows.

The stricter scan observed:

- Q Code, customer, and quantity repeated on all 159 alternate rows.
- RFQ repeated on 157, buyer on 156, UOM on 155, and description on 151; the small exceptions reflect incomplete or changed historical entries.
- Supplier differed on all 159 alternate rows; unit price differed on 156 and was blank on 3; supplier lead time differed on 116, repeated on 32, and was blank on 11.
- Item number was blank on 85 alternate rows and repeated on 74. It is not a reliable selection marker.
- Mark-up remarks were blank on 124 alternate rows and varied on 35. Additional Remarks were blank on 145 and varied on 14.
- Calculated commercial columns were populated by row formulas rather than by a new supplier-comparison schema.

Because the historical item-number convention is split and the 2026 workbook is unavailable, v0.2.7.1 repeats the item number on every generated option row. This is lossless and does not pretend that a blank item number identifies the chosen supplier. Kelvin should confirm the preferred 2026 display convention before deployment.

## Existing draft recovery

Legacy v0.2.6 flat supplier items are still migrated into one option named `supplier-1`, which is selected automatically. Existing item, costing, delivery, mark-up, and remarks values are retained. Multi-supplier autosave preserves all options and selected ID; stale or repeated client revisions remain rejected/ignored under the existing monotonic revision rule.

## Discount evidence

The 2025 sheet has no dedicated discount column. A conservative scan found 144 rows with discount wording in `MARK UP REMARKS` (AY) or `ADDITIONAL REMARKS` (AZ). All retained an AE total-quotation formula, but only one visibly embedded a discount factor. This is not evidence of an established formula, so this revision leaves discount calculation unchanged and stores discount wording only in existing remarks.

## Confirmations still required before deployment

1. In the actual 2026 Tracker, should Item No. repeat on every supplier option row or be blank after the first row?
2. Should item-level Mark-up Remarks / Additional Remarks remain only on the selected row, as this pilot does, or repeat on every supplier row?
3. Should supplier availability ever be copied into an existing remarks field, or always remain private draft data?
4. Is selected-first row ordering acceptable as an operational convenience even though it is not a durable selected-supplier marker?
5. Should an incomplete alternate supplier block generation, as this pilot does, or may Macrotech intentionally retain a partial comparison row?

No deployment should occur until these points are checked against a read-only copy/export of the actual 2026 Tracker and Kelvin confirms the intended convention.
