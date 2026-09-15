import assert from "node:assert/strict";
import test from "node:test";
import {
  createApprovalSchema,
  decisionSchema,
  pilotTrackerSubmissionSchema,
  quotationDraftPayloadSchema,
  saveQuotationDraftSchema
} from "./schemas.js";

const base = {
  qCode: "25QLPR053",
  sourceType: "Q_CODE" as const,
  customer: "Sample Customer Inc.",
  approverEmail: "Approver@Example.com",
  quotationStorageObject: "quotations/25QLPR053.pdf"
};

test("create approval normalizes approver email", () => {
  const parsed = createApprovalSchema.parse(base);
  assert.equal(parsed.approverEmail, "approver@example.com");
});

test("Q_CODE source requires a q code", () => {
  const result = createApprovalSchema.safeParse({ ...base, qCode: "" });
  assert.equal(result.success, false);
});

test("RFQ source can be used before a q code exists", () => {
  const result = createApprovalSchema.safeParse({
    ...base,
    qCode: "",
    sourceType: "RFQ",
    sourceReference: "B-25-12329"
  });
  assert.equal(result.success, true);
});

test("RFQ or inquiry source requires a reference", () => {
  const result = createApprovalSchema.safeParse({ ...base, qCode: "", sourceType: "RFQ", sourceReference: "", rfqInquiry: "" });
  assert.equal(result.success, false);
});

test("single-line business fields reject CRLF header injection", () => {
  const result = createApprovalSchema.safeParse({ ...base, customer: "Acme\r\nBcc: attacker@example.com" });
  assert.equal(result.success, false);
});

test("quotation object accepts a relative pdf path", () => {
  const result = createApprovalSchema.safeParse({ ...base, quotationStorageObject: "quotations/2026/25QLPR053.pdf" });
  assert.equal(result.success, true);
});

test("quotation object rejects traversal-like or non-pdf paths", () => {
  assert.equal(createApprovalSchema.safeParse({ ...base, quotationStorageObject: "../secret.pdf" }).success, false);
  assert.equal(createApprovalSchema.safeParse({ ...base, quotationStorageObject: "/absolute/quote.pdf" }).success, false);
  assert.equal(createApprovalSchema.safeParse({ ...base, quotationStorageObject: "quotations/quote.exe" }).success, false);
});

test("return decision requires a comment", () => {
  const result = decisionSchema.safeParse({ action: "RETURN", comment: "", requestId: "550e8400-e29b-41d4-a716-446655440000" });
  assert.equal(result.success, false);
});

test("approve decision may omit a comment", () => {
  const result = decisionSchema.safeParse({ action: "APPROVE", requestId: "550e8400-e29b-41d4-a716-446655440000" });
  assert.equal(result.success, true);
});

test("commercial approval snapshot accepts CEO review fields", () => {
  const parsed = createApprovalSchema.parse({
    ...base,
    commercial: {
      currency: "php",
      subtotal: 160650,
      vatRatePercent: 12,
      vatAmount: 19278,
      totalAmount: 179928,
      discountPercent: 5,
      discountAmount: 8996.4,
      totalAfterDiscount: 170931.6,
      markupPercent: 25.5,
      delivery: "10-12 WEEKS OR EARLIER"
    }
  });

  assert.equal(parsed.commercial.currency, "PHP");
  assert.equal(parsed.commercial.totalAmount, 179928);
  assert.equal(parsed.commercial.discountPercent, 5);
  assert.equal(parsed.commercial.discountAmount, 8996.4);
  assert.equal(parsed.commercial.totalAfterDiscount, 170931.6);
  assert.equal(parsed.commercial.markupPercent, 25.5);
  assert.equal(parsed.commercial.delivery, "10-12 WEEKS OR EARLIER");
});

test("commercial snapshot defaults safely for legacy or staged creation", () => {
  const parsed = createApprovalSchema.parse(base);
  assert.deepEqual(parsed.commercial, {
    currency: "PHP",
    subtotal: null,
    vatRatePercent: null,
    vatAmount: null,
    totalAmount: null,
    discountPercent: null,
    discountAmount: null,
    totalAfterDiscount: null,
    markupPercent: null,
    dutiesAndTaxes: "",
    safetyFactor: "",
    delivery: ""
  });
});

test("commercial snapshot rejects negative money and malformed currency", () => {
  assert.equal(createApprovalSchema.safeParse({
    ...base,
    commercial: { currency: "PHP", totalAmount: -1 }
  }).success, false);

  assert.equal(createApprovalSchema.safeParse({
    ...base,
    commercial: { currency: "PESO", totalAmount: 100 }
  }).success, false);
});

test("commercial markup can represent a loss but cannot be below minus one hundred percent", () => {
  assert.equal(createApprovalSchema.safeParse({
    ...base,
    commercial: { currency: "PHP", markupPercent: -5 }
  }).success, true);

  assert.equal(createApprovalSchema.safeParse({
    ...base,
    commercial: { currency: "PHP", markupPercent: -101 }
  }).success, false);
});

test("commercial discount percentage must remain between zero and one hundred", () => {
  assert.equal(createApprovalSchema.safeParse({
    ...base,
    commercial: { currency: "PHP", discountPercent: 5 }
  }).success, true);

  assert.equal(createApprovalSchema.safeParse({
    ...base,
    commercial: { currency: "PHP", discountPercent: 101 }
  }).success, false);
});

test("commercial discount amounts and final total must reconcile", () => {
  assert.equal(createApprovalSchema.safeParse({
    ...base,
    commercial: {
      currency: "PHP",
      totalAmount: 1000,
      discountPercent: 5,
      discountAmount: 50,
      totalAfterDiscount: 950
    }
  }).success, true);

  assert.equal(createApprovalSchema.safeParse({
    ...base,
    commercial: {
      currency: "PHP",
      totalAmount: 1000,
      discountPercent: 5,
      discountAmount: 75,
      totalAfterDiscount: 925
    }
  }).success, false);
});


test("data checks default to not run instead of fabricating validation", () => {
  const parsed = createApprovalSchema.parse(base);
  assert.deepEqual(parsed.dataChecks, {
    requiredFields: "NOT_RUN",
    calculationsVat: "NOT_RUN",
    templateFidelity: "NOT_RUN",
    fileNaming: "NOT_RUN",
    warnings: []
  });
});

test("data checks accept generator-produced pass and attention states", () => {
  const parsed = createApprovalSchema.parse({
    ...base,
    dataChecks: {
      requiredFields: "PASSED",
      calculationsVat: "ATTENTION_REQUIRED",
      templateFidelity: "PASSED",
      fileNaming: "PASSED",
      warnings: ["VAT total requires review"]
    }
  });
  assert.equal(parsed.dataChecks.calculationsVat, "ATTENTION_REQUIRED");
  assert.deepEqual(parsed.dataChecks.warnings, ["VAT total requires review"]);
});

test("data check warnings reject control characters and excessive entries", () => {
  assert.equal(createApprovalSchema.safeParse({
    ...base,
    dataChecks: { warnings: ["bad\nwarning"] }
  }).success, false);

  assert.equal(createApprovalSchema.safeParse({
    ...base,
    dataChecks: { warnings: Array.from({ length: 21 }, (_, i) => `Warning ${i}`) }
  }).success, false);
});


const incompleteDraft = {
  employeeCode: "TST",
  quotationDueDate: "",
  rfqReference: "",
  customer: "",
  buyer: "",
  coSbm: "SBM",
  items: [{
    itemNumber: "1",
    description: "",
    offer: "",
    uom: "PC",
    quantity: 1,
    supplierOptions: [{
      id: "supplier-1",
      supplier: "",
      currency: "USD",
      unitPrice: null,
      freightCost: 0,
      packingCost: 0,
      bankCharges: 0,
      otherCharges: 0,
      supplierDeliveryPeriod: "",
      availability: "",
      internalNotes: "",
      forexRate: null,
      dutyRatePercent: 8
    }],
    selectedSupplierOptionId: "supplier-1",
    markupMultiplier: 1.75,
    macrotechDeliveryPeriod: "",
    markupRemarks: "",
    additionalRemarks: ""
  }]
};

test("quotation drafts allow incomplete work to autosave", () => {
  assert.equal(quotationDraftPayloadSchema.safeParse(incompleteDraft).success, true);
  assert.equal(saveQuotationDraftSchema.safeParse({ clientRevision: 1, payload: incompleteDraft }).success, true);
});

test("final tracker generation still rejects incomplete draft values", () => {
  const draft = quotationDraftPayloadSchema.parse(incompleteDraft);
  const selected = draft.items[0]!.supplierOptions[0]!;
  const finalCandidate = {
    requestId: "550e8400-e29b-41d4-a716-446655440000",
    ...draft,
    items: [{
      itemNumber: draft.items[0]!.itemNumber,
      description: draft.items[0]!.description,
      offer: draft.items[0]!.offer,
      supplier: selected.supplier,
      uom: draft.items[0]!.uom,
      quantity: draft.items[0]!.quantity,
      currency: selected.currency,
      unitPrice: selected.unitPrice,
      freightCost: selected.freightCost ?? 0,
      packingCost: selected.packingCost ?? 0,
      bankCharges: selected.bankCharges ?? 0,
      otherCharges: selected.otherCharges ?? 0,
      supplierDeliveryPeriod: selected.supplierDeliveryPeriod,
      forexRate: selected.forexRate,
      dutyRatePercent: selected.dutyRatePercent ?? 0,
      markupMultiplier: draft.items[0]!.markupMultiplier ?? 0,
      macrotechDeliveryPeriod: draft.items[0]!.macrotechDeliveryPeriod,
      markupRemarks: draft.items[0]!.markupRemarks,
      additionalRemarks: draft.items[0]!.additionalRemarks
    }]
  };
  assert.equal(pilotTrackerSubmissionSchema.safeParse(finalCandidate).success, false);
});

test("draft save requires a monotonically positive client revision", () => {
  assert.equal(saveQuotationDraftSchema.safeParse({ clientRevision: 0, payload: incompleteDraft }).success, false);
  assert.equal(saveQuotationDraftSchema.safeParse({ clientRevision: 2, payload: incompleteDraft }).success, true);
});

test("multi-supplier draft round-trip preserves autosave and recovery fields", () => {
  const payload = quotationDraftPayloadSchema.parse(incompleteDraft);
  payload.items[0]!.supplierOptions = [
    {
      ...payload.items[0]!.supplierOptions[0]!,
      id: "primary",
      supplier: "Supplier A / a@example.com",
      currency: "usd",
      unitPrice: 125,
      availability: "In stock",
      internalNotes: "Preferred relationship"
    },
    {
      ...payload.items[0]!.supplierOptions[0]!,
      id: "alternate",
      supplier: "Supplier B / b@example.com",
      currency: "eur",
      unitPrice: 110,
      supplierDeliveryPeriod: "2 weeks",
      availability: "5 available",
      internalNotes: "Fast option"
    }
  ];
  payload.items[0]!.selectedSupplierOptionId = "alternate";

  const parsed = saveQuotationDraftSchema.parse({ clientRevision: 17, payload });
  assert.equal(parsed.payload.items[0]?.supplierOptions.length, 2);
  assert.equal(parsed.payload.items[0]?.selectedSupplierOptionId, "alternate");
  assert.equal(parsed.payload.items[0]?.supplierOptions[1]?.currency, "EUR");
  assert.equal(parsed.payload.items[0]?.supplierOptions[1]?.availability, "5 available");
  assert.equal(parsed.payload.items[0]?.supplierOptions[1]?.internalNotes, "Fast option");
});

test("draft rejects missing selections and duplicate supplier option identifiers", () => {
  const missing = quotationDraftPayloadSchema.parse(incompleteDraft);
  missing.items[0]!.selectedSupplierOptionId = "not-present";
  assert.equal(quotationDraftPayloadSchema.safeParse(missing).success, false);

  const duplicate = quotationDraftPayloadSchema.parse(incompleteDraft);
  duplicate.items[0]!.supplierOptions.push({ ...duplicate.items[0]!.supplierOptions[0]! });
  assert.equal(quotationDraftPayloadSchema.safeParse(duplicate).success, false);

  const empty = quotationDraftPayloadSchema.parse(incompleteDraft);
  empty.items[0]!.supplierOptions = [];
  assert.equal(quotationDraftPayloadSchema.safeParse(empty).success, false);

  const excessive = quotationDraftPayloadSchema.parse(incompleteDraft);
  excessive.items[0]!.supplierOptions = Array.from({ length: 11 }, (_, index) => ({
    ...excessive.items[0]!.supplierOptions[0]!,
    id: `supplier-${index + 1}`
  }));
  excessive.items[0]!.selectedSupplierOptionId = "supplier-1";
  assert.equal(quotationDraftPayloadSchema.safeParse(excessive).success, false);
});

test("legacy v0.2.6 draft migrates into one selected supplier option", () => {
  const legacyItem = {
    itemNumber: "1",
    description: "Legacy item",
    offer: "Legacy offer",
    supplier: "Legacy Supplier / legacy@example.com",
    uom: "PC",
    quantity: 2,
    currency: "usd",
    unitPrice: 88,
    freightCost: 4,
    packingCost: 1,
    bankCharges: 2,
    otherCharges: 3,
    supplierDeliveryPeriod: "3 weeks",
    forexRate: 58,
    dutyRatePercent: 8,
    markupMultiplier: 1.75,
    macrotechDeliveryPeriod: "5 weeks",
    markupRemarks: "Legacy markup note",
    additionalRemarks: "Legacy additional note"
  };
  const parsed = quotationDraftPayloadSchema.parse({ ...incompleteDraft, items: [legacyItem] });
  assert.equal(parsed.items[0]?.supplierOptions.length, 1);
  assert.equal(parsed.items[0]?.selectedSupplierOptionId, "supplier-1");
  assert.equal(parsed.items[0]?.supplierOptions[0]?.supplier, legacyItem.supplier);
  assert.equal(parsed.items[0]?.supplierOptions[0]?.currency, "USD");
  assert.equal(parsed.items[0]?.supplierOptions[0]?.unitPrice, 88);
  assert.equal(parsed.items[0]?.additionalRemarks, "Legacy additional note");
});
