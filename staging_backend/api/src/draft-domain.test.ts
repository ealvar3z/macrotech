import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultQuotationDraftPayload,
  draftPayloadToCustomerQuotationSubmission,
  draftPayloadToTrackerSubmission,
  isNewerDraftRevision
} from "./draft-domain.js";
import {
  pilotTrackerSubmissionSchema,
  quotationDraftPayloadSchema,
  quotationTrackerSubmissionSchema
} from "./schemas.js";

test("new draft begins with one selected supplier option", () => {
  const draft = defaultQuotationDraftPayload("TST");
  assert.equal(draft.items.length, 1);
  assert.equal(draft.items[0]?.supplierOptions.length, 1);
  assert.equal(draft.items[0]?.selectedSupplierOptionId, "supplier-1");
  assert.equal(draft.items[0]?.markupMultiplier, 1.75);
});

test("autosave recovery ignores stale or repeated client revisions", () => {
  assert.equal(isNewerDraftRevision(8, 9), true);
  assert.equal(isNewerDraftRevision(8, 8), false);
  assert.equal(isNewerDraftRevision(8, 7), false);
});

test("only the selected supplier drives customer-facing quotation values", () => {
  const draft = quotationDraftPayloadSchema.parse({
    employeeCode: "TST",
    quotationDueDate: "2026-09-30",
    rfqReference: "RFQ-MULTI-001",
    customer: "Pilot Customer",
    buyer: "buyer@example.com",
    coSbm: "SBM",
    items: [{
      itemNumber: "1",
      description: "Test motor",
      offer: "Motor model A",
      uom: "PC",
      quantity: 2,
      supplierOptions: [
        {
          id: "lowest-price",
          supplier: "Supplier Low / low@example.com",
          currency: "USD",
          unitPrice: 100,
          freightCost: 500,
          packingCost: 20,
          bankCharges: 5,
          otherCharges: 0,
          supplierDeliveryPeriod: "12 weeks",
          availability: "Made to order",
          internalNotes: "Cheapest unit price only",
          forexRate: 58,
          dutyRatePercent: 8
        },
        {
          id: "selected-fast",
          supplier: "Supplier Fast / fast@example.com",
          currency: "EUR",
          unitPrice: 130,
          freightCost: 40,
          packingCost: 10,
          bankCharges: 3,
          otherCharges: 2,
          supplierDeliveryPeriod: "2 weeks",
          availability: "In stock",
          internalNotes: "Selected for delivery",
          forexRate: 67,
          dutyRatePercent: 5
        }
      ],
      selectedSupplierOptionId: "selected-fast",
      markupMultiplier: 1.75,
      macrotechDeliveryPeriod: "4 weeks",
      markupRemarks: "",
      additionalRemarks: "Discounts remain remarks-only."
    }]
  });

  const candidate = draftPayloadToCustomerQuotationSubmission(
    "550e8400-e29b-41d4-a716-446655440000",
    draft
  );
  const final = pilotTrackerSubmissionSchema.parse(candidate);
  assert.equal(final.items.length, 1);
  assert.equal(final.items[0]?.supplier, "Supplier Fast / fast@example.com");
  assert.equal(final.items[0]?.currency, "EUR");
  assert.equal(final.items[0]?.unitPrice, 130);
  assert.equal(final.items[0]?.freightCost, 40);
  assert.equal(final.items[0]?.supplierDeliveryPeriod, "2 weeks");
  assert.equal(final.items[0]?.forexRate, 67);
  assert.equal(final.items[0]?.dutyRatePercent, 5);
  assert.equal(final.items[0]?.additionalRemarks, "Discounts remain remarks-only.");
  assert.equal(final.items[0]?.isAlternateSupplier, false);
});

test("changing the selected supplier changes customer output without changing alternates", () => {
  const draft = defaultQuotationDraftPayload("TST");
  const item = draft.items[0]!;
  item.description = "Recovery test item";
  item.offer = "Offer";
  item.supplierOptions[0] = {
    ...item.supplierOptions[0]!,
    id: "a",
    supplier: "Supplier A",
    unitPrice: 10,
    forexRate: 58
  };
  item.supplierOptions.push({
    ...item.supplierOptions[0],
    id: "b",
    supplier: "Supplier B",
    unitPrice: 20,
    internalNotes: "Must remain private"
  });
  item.selectedSupplierOptionId = "b";

  const output = draftPayloadToCustomerQuotationSubmission("draft-id", draft) as {
    items: Array<{ supplier: string; unitPrice: number | null }>;
  };
  assert.deepEqual(output.items, [{
    itemNumber: "1",
    description: "Recovery test item",
    offer: "Offer",
    supplier: "Supplier B",
    uom: "PC",
    quantity: 1,
    currency: "USD",
    unitPrice: 20,
    freightCost: 0,
    packingCost: 0,
    bankCharges: 0,
    otherCharges: 0,
    supplierDeliveryPeriod: "",
    forexRate: 58,
    dutyRatePercent: 8,
    markupMultiplier: 1.75,
    macrotechDeliveryPeriod: "",
    markupRemarks: "",
    additionalRemarks: ""
  }]);
  assert.equal(item.supplierOptions[0]?.supplier, "Supplier A");
  assert.equal(item.supplierOptions[1]?.internalNotes, "Must remain private");
});

test("Tracker projection emits selected supplier first and retains all alternates", () => {
  const draft = defaultQuotationDraftPayload("TST");
  draft.quotationDueDate = "2026-09-30";
  draft.rfqReference = "RFQ-TRACKER-001";
  draft.customer = "Pilot Customer";
  const item = draft.items[0]!;
  item.description = "Multi-source motor";
  item.offer = "MT-MOTOR";
  item.supplierOptions = [
    {
      ...item.supplierOptions[0]!,
      id: "option-a",
      supplier: "Supplier A / a@example.com",
      unitPrice: 100,
      forexRate: 58,
      supplierDeliveryPeriod: "8 weeks",
      internalNotes: "Never write this note to Tracker"
    },
    {
      ...item.supplierOptions[0]!,
      id: "option-b",
      supplier: "Supplier B / b@example.com",
      currency: "EUR",
      unitPrice: 125,
      freightCost: 10,
      forexRate: 67,
      supplierDeliveryPeriod: "2 weeks"
    },
    {
      ...item.supplierOptions[0]!,
      id: "option-c",
      supplier: "Supplier C / c@example.com",
      unitPrice: 90,
      forexRate: 58,
      availability: "Back order"
    }
  ];
  item.selectedSupplierOptionId = "option-b";
  item.markupRemarks = "Internal mark-up decision";
  item.additionalRemarks = "5% discount approved in remarks only";

  const candidate = draftPayloadToTrackerSubmission(
    "550e8400-e29b-41d4-a716-446655440000",
    draft
  );
  const tracker = quotationTrackerSubmissionSchema.parse(candidate);

  assert.deepEqual(tracker.items.map(row => row.supplier), [
    "Supplier B / b@example.com",
    "Supplier A / a@example.com",
    "Supplier C / c@example.com"
  ]);
  assert.deepEqual(tracker.items.map(row => row.itemNumber), ["1", "1", "1"]);
  assert.deepEqual(tracker.items.map(row => row.isAlternateSupplier), [false, true, true]);
  assert.equal(tracker.items[0]?.unitPrice, 125);
  assert.equal(tracker.items[1]?.unitPrice, 100);
  assert.equal(tracker.items[2]?.unitPrice, 90);
  assert.equal("internalNotes" in tracker.items[1]!, false);
  assert.equal("availability" in tracker.items[2]!, false);
});

test("changing selection reorders Tracker rows but does not lose supplier options", () => {
  const draft = defaultQuotationDraftPayload("TST");
  draft.quotationDueDate = "2026-09-30";
  draft.rfqReference = "RFQ-TRACKER-002";
  draft.customer = "Pilot Customer";
  const item = draft.items[0]!;
  item.description = "Selection test";
  item.offer = "Offer";
  item.supplierOptions = [
    { ...item.supplierOptions[0]!, id: "a", supplier: "A", unitPrice: 10, forexRate: 58 },
    { ...item.supplierOptions[0]!, id: "b", supplier: "B", unitPrice: 20, forexRate: 58 }
  ];
  item.selectedSupplierOptionId = "a";
  const first = quotationTrackerSubmissionSchema.parse(
    draftPayloadToTrackerSubmission("550e8400-e29b-41d4-a716-446655440000", draft)
  );
  item.selectedSupplierOptionId = "b";
  const second = quotationTrackerSubmissionSchema.parse(
    draftPayloadToTrackerSubmission("550e8400-e29b-41d4-a716-446655440000", draft)
  );

  assert.deepEqual(first.items.map(row => row.supplier), ["A", "B"]);
  assert.deepEqual(second.items.map(row => row.supplier), ["B", "A"]);
  assert.deepEqual(new Set(second.items.map(row => row.supplier)), new Set(["A", "B"]));
});

test("generation validation requires complete commercial data for retained alternates", () => {
  const draft = defaultQuotationDraftPayload("TST");
  draft.quotationDueDate = "2026-09-30";
  draft.rfqReference = "RFQ-TRACKER-003";
  draft.customer = "Pilot Customer";
  const item = draft.items[0]!;
  item.description = "Validation test";
  item.offer = "Offer";
  item.supplierOptions[0] = {
    ...item.supplierOptions[0]!,
    id: "selected",
    supplier: "Complete Supplier",
    unitPrice: 10,
    forexRate: 58
  };
  item.supplierOptions.push({
    ...item.supplierOptions[0],
    id: "incomplete-alternate",
    supplier: "",
    unitPrice: null,
    forexRate: null
  });
  item.selectedSupplierOptionId = "selected";

  const trackerCandidate = draftPayloadToTrackerSubmission(
    "550e8400-e29b-41d4-a716-446655440000",
    draft
  );
  assert.equal(quotationTrackerSubmissionSchema.safeParse(trackerCandidate).success, false);

  const customerCandidate = draftPayloadToCustomerQuotationSubmission(
    "550e8400-e29b-41d4-a716-446655440000",
    draft
  );
  assert.equal(pilotTrackerSubmissionSchema.safeParse(customerCandidate).success, true);
});
