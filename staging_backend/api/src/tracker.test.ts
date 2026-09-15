import assert from "node:assert/strict";
import test from "node:test";
import { pilotTrackerSubmissionSchema } from "./schemas.js";
import { buildPilotTrackerRows, PILOT_TRACKER_HEADERS } from "./tracker-domain.js";

const sample = {
  requestId: "3d69ce21-3c57-4af8-b688-72348d93a63a",
  employeeCode: " tst ",
  quotationDueDate: "2026-09-30",
  rfqReference: "PILOT-RFQ-0002",
  customer: "Pilot Customer",
  buyer: "buyer@example.com",
  coSbm: "SBM",
  items: [{
    itemNumber: "1",
    description: "Pilot pump",
    offer: "MT-P100",
    supplier: "supplier@example.com",
    uom: "PC",
    quantity: 2,
    currency: "usd",
    unitPrice: 1250,
    freightCost: 150,
    packingCost: 40,
    bankCharges: 25,
    otherCharges: 0,
    supplierDeliveryPeriod: "4-6 weeks",
    forexRate: 58.5,
    dutyRatePercent: 8,
    markupMultiplier: 1.75,
    macrotechDeliveryPeriod: "8-10 weeks",
    markupRemarks: "Pilot",
    additionalRemarks: "Synthetic data"
  }]
};

test("accepts and normalizes a valid pilot tracker submission", () => {
  const parsed = pilotTrackerSubmissionSchema.parse(sample);
  assert.equal(parsed.employeeCode, "TST");
  assert.equal(parsed.items[0]?.currency, "USD");
  assert.equal(parsed.items[0]?.isAlternateSupplier, false);
});

test("rejects invalid employee codes and empty item lists", () => {
  assert.equal(pilotTrackerSubmissionSchema.safeParse({ ...sample, employeeCode: "TS" }).success, false);
  assert.equal(pilotTrackerSubmissionSchema.safeParse({ ...sample, items: [] }).success, false);
});

test("preserves the direct Dummy Tracker endpoint limit of 25 flat items", () => {
  assert.equal(pilotTrackerSubmissionSchema.safeParse({
    ...sample,
    items: Array.from({ length: 26 }, (_, index) => ({
      ...sample.items[0],
      itemNumber: String(index + 1)
    }))
  }).success, false);
});

test("maps input fields into the exact 52-column MARK-UP layout", () => {
  const parsed = pilotTrackerSubmissionSchema.parse(sample);
  const rows = buildPilotTrackerRows(parsed, "26QTST0002", new Date("2026-09-10T18:00:00Z"));
  assert.equal(PILOT_TRACKER_HEADERS.length, 52);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.length, 52);
  assert.equal(rows[0]?.[6], "26QTST0002");
  assert.equal(rows[0]?.[9], "Pilot Customer");
  assert.equal(rows[0]?.[13], 2);
  assert.equal(rows[0]?.[14], 1250);
  assert.equal(rows[0]?.[24], 0.08);
  assert.equal(rows[0]?.[29], 1.75);
  assert.equal(rows[0]?.[50], "Pilot");
  assert.equal(rows[0]?.[51], "PILOT AUTO-FILL — Currency: USD. Synthetic data");
});

test("creates one tracker row per line item with one shared Q Code", () => {
  const parsed = pilotTrackerSubmissionSchema.parse({ ...sample, items: [sample.items[0], { ...sample.items[0], itemNumber: "2" }] });
  const rows = buildPilotTrackerRows(parsed, "26QTST0003", new Date("2026-09-10T18:00:00Z"));
  assert.deepEqual(rows.map(row => row[6]), ["26QTST0003", "26QTST0003"]);
  assert.deepEqual(rows.map(row => row[1]), ["1", "2"]);
});

test("alternate supplier rows repeat item context and omit item-level remarks", () => {
  const alternate = {
    ...sample.items[0],
    supplier: "alternate@example.com",
    currency: "eur",
    unitPrice: 1100,
    supplierDeliveryPeriod: "2 weeks",
    markupRemarks: "Must not repeat",
    additionalRemarks: "5% discount applies to selected quotation only",
    isAlternateSupplier: true
  };
  const parsed = pilotTrackerSubmissionSchema.parse({
    ...sample,
    items: [sample.items[0], alternate]
  });
  const rows = buildPilotTrackerRows(parsed, "26QTST0004", new Date("2026-09-10T18:00:00Z"));

  assert.equal(rows.length, 2);
  for (const column of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 13, 29, 34]) {
    assert.equal(rows[1]?.[column], rows[0]?.[column]);
  }
  assert.equal(rows[1]?.[11], "alternate@example.com");
  assert.equal(rows[1]?.[14], 1100);
  assert.equal(rows[1]?.[21], "2 weeks");
  assert.equal(rows[1]?.[50], "");
  assert.equal(rows[1]?.[51], "PILOT AUTO-FILL — Currency: EUR. NOT LIVE");
});
