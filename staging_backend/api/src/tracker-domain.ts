import type { PilotTrackerSubmission } from "./schemas.js";

export const PILOT_TRACKER_HEADERS = [
  "NO.", "ITEM NO.", "DESCRIPTION / RFQ", "OUR OFFER", "CO SBM",
  "QUOTATION DUE DATE", "MACROTECH Q-CODE", "DAY OF OFFER TO CUSTOMER",
  "RFQ/PR REFERENCE NO.", "COMPANY / CUSTOMER / TIN No.", "BUYER / EMAIL",
  "SUPPLIER / EMAIL ADDRESS", "UOM", "QTY", "UNIT PRICE (USD/EUR/ETC)",
  "SUB-TOTAL (USD/EUR/ETC)", "FREIGHT COST", "PACKING", "BANK CHARGES",
  "OTHER CHARGES", "TOTAL IN (USD/EUR/ETC)", "SUPPLIER DEL PD.",
  "FOREX TODAY +4 OR +2", "DUTIABLE VALUE IN PHP", "DT%",
  "FORWARDER & DT IN PHP", "SUB-TOTAL", "5% SAFETY FACTOR",
  "TLC OR TOTAL LOCAL PURCHASE VATIN", "MARK-UP", "TOTAL IN QUOTATION (P.O) VAT-IN",
  "TOTAL VAT-EX", "VAT-IN PER/PC", "PRICE TO OFFER VAT-EX PER/PC",
  "MACROTECH DEL PD.", "GP", "MINUS 12% TAX", "B.CODE", "ABC %",
  "total B-code", "E.CODE", "ABC %", "total E-code", "TOTAL %",
  "TOTAL ABC PHP", "PAID ABC?", "SUBNET - PROFIT", "AWARD TO MACRO",
  "PO NUMBER", "SR CODE", "MARK UP REMARKS", "ADDITIONAL REMARKS"
] as const;

function googleSerialDate(value: string | Date): number {
  const date = typeof value === "string"
    ? new Date(`${value}T00:00:00Z`)
    : new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  return (date.getTime() - Date.UTC(1899, 11, 30)) / 86_400_000;
}

export function buildPilotTrackerRows(
  input: PilotTrackerSubmission,
  qCode: string,
  offeredOn: Date
): Array<Array<string | number>> {
  return input.items.map(item => {
    const row: Array<string | number> = Array.from({ length: PILOT_TRACKER_HEADERS.length }, () => "");
    row[1] = item.itemNumber;
    row[2] = item.description;
    row[3] = item.offer;
    row[4] = input.coSbm;
    row[5] = googleSerialDate(input.quotationDueDate);
    row[6] = qCode;
    row[7] = googleSerialDate(offeredOn);
    row[8] = input.rfqReference;
    row[9] = input.customer;
    row[10] = input.buyer;
    row[11] = item.supplier;
    row[12] = item.uom;
    row[13] = item.quantity;
    row[14] = item.unitPrice;
    row[16] = item.freightCost;
    row[17] = item.packingCost;
    row[18] = item.bankCharges;
    row[19] = item.otherCharges;
    row[21] = item.supplierDeliveryPeriod;
    row[22] = item.forexRate;
    row[24] = item.dutyRatePercent / 100;
    row[29] = item.markupMultiplier;
    row[34] = item.macrotechDeliveryPeriod;
    // Historical comparison rows usually leave free-text remarks blank. Keep
    // quotation-level discount/remarks on the selected row only, while every
    // row retains the existing pilot currency/safety marker in AZ.
    row[50] = item.isAlternateSupplier ? "" : item.markupRemarks;
    const additionalRemarks = item.isAlternateSupplier ? "" : item.additionalRemarks;
    row[51] = additionalRemarks
      ? `PILOT AUTO-FILL — Currency: ${item.currency}. ${additionalRemarks}`
      : `PILOT AUTO-FILL — Currency: ${item.currency}. NOT LIVE`;
    return row;
  });
}
