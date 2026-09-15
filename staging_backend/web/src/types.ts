export type ApprovalStatus =
  | "PENDING_REVIEW"
  | "APPROVED"
  | "RETURNED_FOR_CORRECTION";


export type DataCheckState = "NOT_RUN" | "PASSED" | "ATTENTION_REQUIRED";

export interface DataChecks {
  requiredFields: DataCheckState;
  calculationsVat: DataCheckState;
  templateFidelity: DataCheckState;
  fileNaming: DataCheckState;
  warnings: string[];
}

export interface CommercialSummary {
  currency: string;
  subtotal: number | null;
  vatRatePercent: number | null;
  vatAmount: number | null;
  totalAmount: number | null;
  discountPercent: number | null;
  discountAmount: number | null;
  totalAfterDiscount: number | null;
  markupPercent: number | null;
  dutiesAndTaxes: string;
  safetyFactor: string;
  delivery: string;
}

export interface ApprovalView {
  snapshotHash: string;
  id: string;
  qCode: string;
  sourceType: string;
  sourceReference: string;
  rfqInquiry: string;
  revision: string;
  customer: string;
  commercial: CommercialSummary;
  dataChecks: DataChecks;
  requesterName: string;
  requesterEmail: string;
  requesterComment: string;
  approverEmail: string;
  status: ApprovalStatus;
  quotationAvailable: boolean;
  submittedAt: string | null;
  reviewOpenedAt: string | null;
  decisionAt: string | null;
  decisionByEmail: string | null;
  decisionComment: string;
}

export interface ApiErrorBody {
  error?: {
    code?: string;
    message?: string;
    requestId?: string;
  };
}

export interface CreateApprovalInput {
  qCode: string;
  sourceType: "Q_CODE" | "RFQ" | "INQUIRY";
  sourceReference: string;
  rfqInquiry: string;
  revision: string;
  customer: string;
  requesterName: string;
  approverEmail: string;
  requesterComment: string;
  quotationStorageObject: string;
  commercial: CommercialSummary;
  dataChecks: DataChecks;
}

export interface PilotTrackerItemInput {
  itemNumber: string;
  description: string;
  offer: string;
  supplier: string;
  uom: string;
  quantity: number;
  currency: string;
  unitPrice: number;
  freightCost: number;
  packingCost: number;
  bankCharges: number;
  otherCharges: number;
  supplierDeliveryPeriod: string;
  forexRate: number;
  dutyRatePercent: number;
  markupMultiplier: number;
  macrotechDeliveryPeriod: string;
  markupRemarks: string;
  additionalRemarks: string;
}

export interface PilotTrackerSubmissionInput {
  requestId: string;
  employeeCode: string;
  quotationDueDate: string;
  rfqReference: string;
  customer: string;
  buyer: string;
  coSbm: string;
  items: PilotTrackerItemInput[];
}

export interface PilotTrackerSubmissionResult {
  requestId: string;
  qCode: string;
  itemCount: number;
  sheetName: string;
  rowRange: string;
  status: "SYNCED";
}

export type QuotationDraftStatus = "DRAFT" | "GENERATED";

export interface QuotationDraftSupplierOption {
  id: string;
  supplier: string;
  currency: string;
  unitPrice: number | null;
  freightCost: number | null;
  packingCost: number | null;
  bankCharges: number | null;
  otherCharges: number | null;
  supplierDeliveryPeriod: string;
  availability: string;
  internalNotes: string;
  forexRate: number | null;
  dutyRatePercent: number | null;
}

export interface QuotationDraftItem {
  itemNumber: string;
  description: string;
  offer: string;
  uom: string;
  quantity: number | null;
  supplierOptions: QuotationDraftSupplierOption[];
  selectedSupplierOptionId: string;
  markupMultiplier: number | null;
  macrotechDeliveryPeriod: string;
  markupRemarks: string;
  additionalRemarks: string;
}

export interface QuotationDraftPayload {
  employeeCode: string;
  quotationDueDate: string;
  rfqReference: string;
  customer: string;
  buyer: string;
  coSbm: string;
  items: QuotationDraftItem[];
}

export interface QuotationDraftView {
  id: string;
  status: QuotationDraftStatus;
  payload: QuotationDraftPayload;
  qCode: string | null;
  trackerSheetName: string | null;
  trackerRowRange: string | null;
  clientRevision: number;
  createdAt: string | null;
  updatedAt: string | null;
  generatedAt: string | null;
}
