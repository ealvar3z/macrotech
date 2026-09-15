import { z } from "zod";

const noControlCharacters = (value: string): boolean => !/[\u0000-\u001F\u007F]/.test(value);

function singleLine(max: number, label: string, options?: { min?: number }) {
  const min = options?.min ?? 0;
  return z.string()
    .trim()
    .min(min, min > 0 ? `${label} is required.` : undefined)
    .max(max, `${label} is too long.`)
    .refine(noControlCharacters, `${label} must be a single line without control characters.`);
}

function quotationObject(value: string): boolean {
  if (value === "") return true;
  if (value.startsWith("/") || value.includes("\\") || /[\u0000-\u001F\u007F]/.test(value)) return false;
  if (value.split("/").some(part => part === "." || part === ".." || part === "")) return false;
  return value.toLowerCase().endsWith(".pdf");
}

const nullableMoney = z.number()
  .finite()
  .min(0, "Money values cannot be negative.")
  .max(1_000_000_000_000, "Money value is too large.")
  .nullable()
  .default(null);

const nullablePercent = z.number()
  .finite()
  .min(-100, "Percentage cannot be below -100%.")
  .max(10_000, "Percentage is too large.")
  .nullable()
  .default(null);

const nullableDiscountPercent = z.number()
  .finite()
  .min(0, "Discount cannot be negative.")
  .max(100, "Discount cannot exceed 100%.")
  .nullable()
  .default(null);

/**
 * Immutable commercial snapshot shown to the approver before a decision.
 * The quotation-generation workflow should populate this from the same
 * validated source data used to create the PDF. Markup is internal and must
 * never be rendered into the customer-facing quotation unless separately
 * authorized by the quotation template.
 */
export const commercialSummarySchema = z.object({
  currency: z.string()
    .trim()
    .transform(value => value.toUpperCase())
    .pipe(z.string().regex(/^[A-Z]{3}$/, "Currency must be a three-letter ISO currency code."))
    .default("PHP"),
  subtotal: nullableMoney,
  vatRatePercent: nullablePercent,
  vatAmount: nullableMoney,
  totalAmount: nullableMoney,
  discountPercent: nullableDiscountPercent,
  discountAmount: nullableMoney,
  totalAfterDiscount: nullableMoney,
  markupPercent: nullablePercent,
  dutiesAndTaxes: singleLine(200, "Duties and Taxes").default(""),
  safetyFactor: singleLine(120, "Safety Factor").default(""),
  delivery: singleLine(200, "Delivery").default("")
}).strict().superRefine((value, ctx) => {
  const { totalAmount, discountPercent, discountAmount, totalAfterDiscount } = value;
  const closeEnough = (left: number, right: number) => Math.abs(left - right) <= 0.011;

  if (totalAmount !== null && discountAmount !== null && discountAmount > totalAmount) {
    ctx.addIssue({ code: "custom", path: ["discountAmount"], message: "Discount amount cannot exceed the original total." });
  }
  if (totalAmount !== null && totalAfterDiscount !== null && totalAfterDiscount > totalAmount) {
    ctx.addIssue({ code: "custom", path: ["totalAfterDiscount"], message: "Total after discount cannot exceed the original total." });
  }
  if (totalAmount !== null && discountPercent !== null && discountAmount !== null) {
    const expected = Math.round((totalAmount * discountPercent / 100 + Number.EPSILON) * 100) / 100;
    if (!closeEnough(discountAmount, expected)) {
      ctx.addIssue({ code: "custom", path: ["discountAmount"], message: "Discount amount does not match the supplied percentage." });
    }
  }
  if (totalAmount !== null && discountAmount !== null && totalAfterDiscount !== null) {
    const expected = Math.round((totalAmount - discountAmount + Number.EPSILON) * 100) / 100;
    if (!closeEnough(totalAfterDiscount, expected)) {
      ctx.addIssue({ code: "custom", path: ["totalAfterDiscount"], message: "Total after discount does not match the original total less the discount." });
    }
  }
}).default({
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

export const dataCheckStateSchema = z.enum(["NOT_RUN", "PASSED", "ATTENTION_REQUIRED"]);

/**
 * Validation evidence produced by the quotation-generation pipeline. These
 * checks inform the human approver; they never fabricate a pass. Until the
 * generator supplies results, each check remains NOT_RUN.
 */
export const dataChecksSchema = z.object({
  requiredFields: dataCheckStateSchema.default("NOT_RUN"),
  calculationsVat: dataCheckStateSchema.default("NOT_RUN"),
  templateFidelity: dataCheckStateSchema.default("NOT_RUN"),
  fileNaming: dataCheckStateSchema.default("NOT_RUN"),
  warnings: z.array(singleLine(300, "Data check warning", { min: 1 })).max(20, "Too many data check warnings.").default([])
}).strict().default({
  requiredFields: "NOT_RUN",
  calculationsVat: "NOT_RUN",
  templateFidelity: "NOT_RUN",
  fileNaming: "NOT_RUN",
  warnings: []
});

export const createApprovalSchema = z.object({
  qCode: singleLine(80, "Q Code").default(""),
  sourceType: z.enum(["Q_CODE", "RFQ", "INQUIRY"]),
  sourceReference: singleLine(200, "Source reference").default(""),
  rfqInquiry: singleLine(200, "RFQ / Inquiry").default(""),
  revision: singleLine(80, "Revision").default(""),
  customer: singleLine(300, "Customer", { min: 1 }),
  requesterName: singleLine(200, "Requester name").default(""),
  approverEmail: z.email().transform(v => v.trim().toLowerCase()),
  requesterComment: z.string().trim().max(2000).refine(value => !value.includes("\u0000"), "Requester comment contains an invalid character.").default(""),
  quotationStorageObject: z.string().trim().max(512).default("")
    .refine(quotationObject, "Quotation storage object must be a relative PDF object path."),
  commercial: commercialSummarySchema,
  dataChecks: dataChecksSchema
}).strict().superRefine((value, ctx) => {
  if (value.sourceType === "Q_CODE" && !value.qCode) {
    ctx.addIssue({ code: "custom", path: ["qCode"], message: "Q Code is required when the source type is Q Code." });
  }

  if ((value.sourceType === "RFQ" || value.sourceType === "INQUIRY") && !value.sourceReference && !value.rfqInquiry) {
    ctx.addIssue({
      code: "custom",
      path: ["sourceReference"],
      message: "An RFQ or inquiry reference is required when a Q Code is not being used."
    });
  }
});

export const decisionSchema = z.object({
  expectedSnapshotHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  action: z.enum(["APPROVE", "RETURN"]),
  comment: z.string().trim().max(2000).refine(value => !value.includes("\u0000"), "Comment contains an invalid character.").default(""),
  requestId: z.uuid()
}).strict().superRefine((value, ctx) => {
  if (value.action === "RETURN" && !value.comment) {
    ctx.addIssue({
      code: "custom",
      path: ["comment"],
      message: "A correction comment is required when returning a quotation."
    });
  }
});

const pilotNonNegativeNumber = z.number()
  .finite()
  .min(0, "Tracker values cannot be negative.")
  .max(1_000_000_000_000, "Tracker value is too large.");

const pilotPositiveNumber = pilotNonNegativeNumber.refine(value => value > 0, "Value must be greater than zero.");

export const pilotTrackerItemSchema = z.object({
  itemNumber: singleLine(40, "Item number", { min: 1 }),
  description: singleLine(500, "Description", { min: 1 }),
  offer: singleLine(500, "Our offer", { min: 1 }),
  supplier: singleLine(300, "Supplier", { min: 1 }),
  uom: singleLine(30, "Unit of measure", { min: 1 }),
  quantity: pilotPositiveNumber,
  currency: z.string()
    .trim()
    .transform(value => value.toUpperCase())
    .pipe(z.string().regex(/^[A-Z]{3}$/, "Currency must be a three-letter ISO currency code.")),
  unitPrice: pilotNonNegativeNumber,
  freightCost: pilotNonNegativeNumber.default(0),
  packingCost: pilotNonNegativeNumber.default(0),
  bankCharges: pilotNonNegativeNumber.default(0),
  otherCharges: pilotNonNegativeNumber.default(0),
  supplierDeliveryPeriod: singleLine(120, "Supplier delivery period").default(""),
  forexRate: pilotPositiveNumber,
  dutyRatePercent: z.number().finite().min(0).max(100),
  markupMultiplier: z.number().finite().min(0).max(100),
  macrotechDeliveryPeriod: singleLine(120, "Macrotech delivery period").default(""),
  markupRemarks: singleLine(300, "Mark-up remarks").default(""),
  additionalRemarks: singleLine(500, "Additional remarks").default(""),
  /**
   * Internal synchronization metadata. This flag is never mapped to a
   * Tracker column; it only prevents item-level remarks from being repeated
   * onto alternate-supplier comparison rows.
   */
  isAlternateSupplier: z.boolean().default(false)
}).strict();

export const pilotTrackerSubmissionSchema = z.object({
  requestId: z.uuid(),
  employeeCode: z.string()
    .trim()
    .transform(value => value.toUpperCase())
    .pipe(z.string().regex(/^[A-Z]{3}$/, "Employee code must contain exactly three letters.")),
  quotationDueDate: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Quotation due date must use YYYY-MM-DD.")
    .refine(value => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), "Quotation due date is invalid."),
  rfqReference: singleLine(200, "RFQ / inquiry reference", { min: 1 }),
  customer: singleLine(300, "Customer", { min: 1 }),
  buyer: singleLine(300, "Buyer / email").default(""),
  coSbm: singleLine(40, "CO SBM").default("SBM"),
  items: z.array(pilotTrackerItemSchema)
    .min(1, "At least one quotation item is required.")
    .max(25, "A pilot submission can contain at most 25 items.")
}).strict();

/**
 * Employee Workspace generation can expand 25 quotation items into as many
 * as 250 supplier comparison rows. The original direct Dummy Tracker endpoint
 * retains its v0.2.6 limit of 25 flat items.
 */
export const quotationTrackerSubmissionSchema = pilotTrackerSubmissionSchema.extend({
  items: z.array(pilotTrackerItemSchema)
    .min(1, "At least one quotation item is required.")
    .max(250, "A quotation can contain at most 250 supplier rows.")
});

export type PilotTrackerSubmission = z.infer<typeof quotationTrackerSubmissionSchema>;

const draftNullableNumber = z.number()
  .finite()
  .min(0, "Draft numeric values cannot be negative.")
  .max(1_000_000_000_000, "Draft numeric value is too large.")
  .nullable();

const draftInternalNotes = z.string()
  .trim()
  .max(2000, "Internal supplier notes are too long.")
  .refine(value => !value.includes("\u0000"), "Internal supplier notes contain an invalid character.")
  .default("");

export const quotationDraftSupplierOptionSchema = z.object({
  id: z.string()
    .trim()
    .min(1, "Supplier option identifier is required.")
    .max(80, "Supplier option identifier is too long.")
    .regex(/^[A-Za-z0-9_-]+$/, "Supplier option identifier is invalid."),
  supplier: singleLine(300, "Supplier").default(""),
  currency: z.string().trim().transform(value => value.toUpperCase()).pipe(z.string().max(3)).default("USD"),
  unitPrice: draftNullableNumber.default(null),
  freightCost: draftNullableNumber.default(null),
  packingCost: draftNullableNumber.default(null),
  bankCharges: draftNullableNumber.default(null),
  otherCharges: draftNullableNumber.default(null),
  supplierDeliveryPeriod: singleLine(120, "Supplier delivery period").default(""),
  availability: singleLine(160, "Supplier availability").default(""),
  internalNotes: draftInternalNotes,
  forexRate: draftNullableNumber.default(null),
  dutyRatePercent: draftNullableNumber.default(null)
}).strict();

function migrateLegacyDraftItem(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const item = value as Record<string, unknown>;
  if (Array.isArray(item.supplierOptions)) return value;

  const optionId = "supplier-1";
  return {
    itemNumber: item.itemNumber ?? "",
    description: item.description ?? "",
    offer: item.offer ?? "",
    uom: item.uom ?? "",
    quantity: item.quantity ?? null,
    supplierOptions: [{
      id: optionId,
      supplier: item.supplier ?? "",
      currency: item.currency ?? "USD",
      unitPrice: item.unitPrice ?? null,
      freightCost: item.freightCost ?? null,
      packingCost: item.packingCost ?? null,
      bankCharges: item.bankCharges ?? null,
      otherCharges: item.otherCharges ?? null,
      supplierDeliveryPeriod: item.supplierDeliveryPeriod ?? "",
      availability: "",
      internalNotes: "",
      forexRate: item.forexRate ?? null,
      dutyRatePercent: item.dutyRatePercent ?? null
    }],
    selectedSupplierOptionId: optionId,
    markupMultiplier: item.markupMultiplier ?? null,
    macrotechDeliveryPeriod: item.macrotechDeliveryPeriod ?? "",
    markupRemarks: item.markupRemarks ?? "",
    additionalRemarks: item.additionalRemarks ?? ""
  };
}

function migrateLegacyDraftPayload(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const payload = value as Record<string, unknown>;
  if (!Array.isArray(payload.items)) return value;
  return { ...payload, items: payload.items.map(migrateLegacyDraftItem) };
}

/**
 * Drafts intentionally allow incomplete values so employees can save work in
 * progress. Final generation always re-validates through pilotTrackerSubmissionSchema.
 */
export const quotationDraftItemSchema = z.object({
  itemNumber: singleLine(40, "Item number").default(""),
  description: singleLine(500, "Description").default(""),
  offer: singleLine(500, "Our offer").default(""),
  uom: singleLine(30, "Unit of measure").default(""),
  quantity: draftNullableNumber.default(null),
  supplierOptions: z.array(quotationDraftSupplierOptionSchema)
    .min(1, "At least one supplier option is required for each item.")
    .max(10, "A quotation item can contain at most 10 supplier options."),
  selectedSupplierOptionId: z.string().trim().min(1).max(80),
  markupMultiplier: draftNullableNumber.default(null),
  macrotechDeliveryPeriod: singleLine(120, "Macrotech delivery period").default(""),
  markupRemarks: singleLine(300, "Mark-up remarks").default(""),
  additionalRemarks: singleLine(500, "Additional remarks").default("")
}).strict().superRefine((item, ctx) => {
  const ids = item.supplierOptions.map(option => option.id);
  if (new Set(ids).size !== ids.length) {
    ctx.addIssue({
      code: "custom",
      path: ["supplierOptions"],
      message: "Supplier option identifiers must be unique within an item."
    });
  }
  if (!ids.includes(item.selectedSupplierOptionId)) {
    ctx.addIssue({
      code: "custom",
      path: ["selectedSupplierOptionId"],
      message: "Select one of the item's supplier options for the quotation."
    });
  }
});

export const quotationDraftPayloadSchema = z.preprocess(migrateLegacyDraftPayload, z.object({
  employeeCode: z.string()
    .trim()
    .transform(value => value.toUpperCase())
    .pipe(z.string().regex(/^[A-Z]{0,3}$/, "Employee code can contain up to three letters while drafting."))
    .default(""),
  quotationDueDate: z.string().trim().max(10).default(""),
  rfqReference: singleLine(200, "RFQ / inquiry reference").default(""),
  customer: singleLine(300, "Customer").default(""),
  buyer: singleLine(300, "Buyer / email").default(""),
  coSbm: singleLine(40, "CO SBM").default("SBM"),
  items: z.array(quotationDraftItemSchema).min(1).max(25)
}).strict());

export const saveQuotationDraftSchema = z.object({
  clientRevision: z.number().int().min(1).max(1_000_000_000),
  payload: quotationDraftPayloadSchema
}).strict();

export type QuotationDraftPayload = z.infer<typeof quotationDraftPayloadSchema>;
export type QuotationDraftSupplierOption = z.infer<typeof quotationDraftSupplierOptionSchema>;
