import {
  quotationDraftPayloadSchema,
  type QuotationDraftPayload
} from "./schemas.js";

export function isNewerDraftRevision(currentRevision: number, incomingRevision: number): boolean {
  return incomingRevision > currentRevision;
}

export function defaultQuotationDraftPayload(employeeCode: string): QuotationDraftPayload {
  return quotationDraftPayloadSchema.parse({
    employeeCode,
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
  });
}

function selectedSupplierRows(payload: QuotationDraftPayload) {
  return payload.items.map(item => {
    const selected = item.supplierOptions.find(
      option => option.id === item.selectedSupplierOptionId
    );
    return supplierRow(item, selected, false);
  });
}

function supplierRow(
  item: QuotationDraftPayload["items"][number],
  option: QuotationDraftPayload["items"][number]["supplierOptions"][number] | undefined,
  isAlternateSupplier: boolean
) {
  return {
    itemNumber: item.itemNumber,
    description: item.description,
    offer: item.offer,
    supplier: option?.supplier ?? "",
    uom: item.uom,
    quantity: item.quantity,
    currency: option?.currency ?? "",
    unitPrice: option?.unitPrice ?? null,
    freightCost: option?.freightCost ?? 0,
    packingCost: option?.packingCost ?? 0,
    bankCharges: option?.bankCharges ?? 0,
    otherCharges: option?.otherCharges ?? 0,
    supplierDeliveryPeriod: option?.supplierDeliveryPeriod ?? "",
    forexRate: option?.forexRate ?? null,
    dutyRatePercent: option?.dutyRatePercent ?? 0,
    markupMultiplier: item.markupMultiplier ?? 0,
    macrotechDeliveryPeriod: item.macrotechDeliveryPeriod,
    markupRemarks: item.markupRemarks,
    additionalRemarks: item.additionalRemarks,
    isAlternateSupplier
  };
}

/**
 * Customer-facing generators must consume this selected-only projection, not
 * the Tracker comparison-row projection. Alternate supplier values and notes
 * cannot enter customer-facing pricing through this boundary.
 */
export function draftPayloadToCustomerQuotationSubmission(
  id: string,
  payload: QuotationDraftPayload
): unknown {
  return {
    requestId: id,
    employeeCode: payload.employeeCode,
    quotationDueDate: payload.quotationDueDate,
    rfqReference: payload.rfqReference,
    customer: payload.customer,
    buyer: payload.buyer,
    coSbm: payload.coSbm,
    items: selectedSupplierRows(payload).map(item => {
      const { isAlternateSupplier: _internalOnly, ...customerItem } = item;
      return customerItem;
    })
  };
}

/**
 * Preserves Macrotech's repeated-row supplier comparison convention without
 * adding Tracker columns. The selected supplier row is emitted first for each
 * item, followed by the remaining options in draft order. Selection remains
 * authoritative only in Firestore/app state; no row marker is written.
 */
export function draftPayloadToTrackerSubmission(
  id: string,
  payload: QuotationDraftPayload
): unknown {
  return {
    requestId: id,
    employeeCode: payload.employeeCode,
    quotationDueDate: payload.quotationDueDate,
    rfqReference: payload.rfqReference,
    customer: payload.customer,
    buyer: payload.buyer,
    coSbm: payload.coSbm,
    items: payload.items.flatMap(item => {
      const selected = item.supplierOptions.find(
        option => option.id === item.selectedSupplierOptionId
      );
      const alternates = item.supplierOptions.filter(
        option => option.id !== item.selectedSupplierOptionId
      );
      return [
        supplierRow(item, selected, false),
        ...alternates.map(option => supplierRow(item, option, true))
      ];
    })
  };
}
