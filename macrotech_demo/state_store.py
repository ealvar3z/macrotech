from __future__ import annotations

import json
from decimal import Decimal
from pathlib import Path

from .domain import QuotationDraft, QuotationItem, SupplierOption
from .tracker_io import app_data_dir


# Baseline transcribed from the supplied Macrotech quotation workbook. It is not
# expanded with model-authored legal language; an authorized CEO user may publish
# a replacement version from the protected administration page.
DEFAULT_TERMS = """1. VALIDITY OF THE OFFER
This offer is valid for Thirty (30) Days from the date of submission unless otherwise specified. Prices and availability are subject to change after this period without prior notice.

2. PRICING VALIDITY & QUANTITY
All prices are quoted in Philippine Peso and are inclusive of applicable taxes, duties and freight charges unless otherwise stated. The price quoted is valid only for the specified item and quantity in this offer. Macrotech Industrial Trading reserves the right to adjust the price in the event of partial orders or any changes in the ordered quantity.

3. PAYMENT TERMS
Standard payment terms are Net 30 Days (N/30) unless agreed to otherwise in writing. Payment in full is due to Macrotech Industrial Trading within 30 calendar days from the date of invoice or date of delivery receipt, whichever occurs later. No early payment discounts apply unless otherwise agreed to in writing.

4. DELIVERY LEAD TIME
The estimated delivery lead time is as quoted from the receipt of a confirmed Purchase Order and the acknowledgment of all commercial and technical details thereof.

5. SHIPPING & HANDLING
Delivery Terms are Freight on Board Destination Point, unless otherwise stated and agreed to in writing.

6. WARRANTY
Our offer comes with One (1) year warranty against factory defects, upon receipt of delivery.

7. QUOTATION REFERENCE & ORDER ACCEPTANCE
As a reference, the customer is to indicate Macrotech Industrial Trading's Quotation Number in the submitted Purchase Order. Upon confirmed receipt and acknowledgement of the Purchase Order, all specifications in our offer and attached datasheets will be deemed reviewed, technically evaluated, and approved by the customer and its end users. Any requested and expressed changes to the terms, conditions, or information in our initial offer will require a new quotation.

8. ORDER CONFIRMATION
All orders must be submitted in writing and supported by an official Purchase Order. Submitted Purchase Orders are subject to confirmation by Macrotech Industrial Trading. An official order acknowledgment will be issued by an authorized sales representative.

9. ORDER CANCELLATION/CHANGES
The ORDER CANCELLATION notice printed on the quotation page governs total or partial cancellation. It is incorporated into these Terms & Conditions without replacement or paraphrase.

10. CONFIDENTIALITY
This offer, including all pricing, specifications, and related terms, is confidential and intended solely for the recipient. Any information stated in this offer must not be disclosed and/or distributed to any third party without the consent of Macrotech Industrial Trading.

11. FORCE MAJEURE
Macrotech Industrial Trading shall not be held liable for delays on non-performance due to causes beyond our reasonable control, including but not limited to natural disasters, transportation issues, and/or supplier delays.

12. GOVERNING LAW
This quotation and any related transactions shall be governed by and construed in accordance with the laws of Las Piñas City, Philippines."""


LEGACY_BASELINE_TERMS = """ORDER CANCELLATION

Once a Purchased Order has been accepted, the Client may only cancel the Order under an agreement reached with MACROTECH INDUSTRIAL TRADING on the conditions for such total or partial cancellation.

On cancellation or revocation of an Order by the Client, the Client shall compensate MACROTECH INDUSTRIAL TRADING for full amount indicated in the purchase order and damages caused to be determine by the court in Las Pinas City Philippines."""


class TermsStore:
    def __init__(self, path: Path | None = None):
        self.path = path or app_data_dir() / "terms_and_conditions.json"

    def get(self) -> dict:
        if self.path.exists():
            try:
                data = json.loads(self.path.read_text(encoding="utf-8"))
                if isinstance(data, dict) and data.get("published_text"):
                    if int(data.get("version", 1)) == 1 and data.get("published_at", "Baseline") == "Baseline" and data.get("published_text", "").strip() == LEGACY_BASELINE_TERMS.strip():
                        data.update({"draft_text": DEFAULT_TERMS, "published_text": DEFAULT_TERMS})
                        self._write(data)
                    return data
            except Exception as exc:
                raise RuntimeError("Terms store is damaged. Preserve it and restore a backup before continuing.") from exc
            raise RuntimeError("Terms store has an invalid structure. No terms were reset.")
        return {"draft_text": DEFAULT_TERMS, "published_text": DEFAULT_TERMS, "version": 1, "published_at": "Baseline", "history": []}

    def save_draft(self, value: str) -> dict:
        data = self.get()
        data["draft_text"] = str(value or "").strip()
        if not data["draft_text"]:
            raise ValueError("Terms & Conditions cannot be empty.")
        self._write(data)
        return data

    def publish(self, value: str, published_at: str) -> dict:
        data = self.get()
        clean = str(value or "").strip()
        if not clean:
            raise ValueError("Terms & Conditions cannot be empty.")
        history = list(data.get("history") or [])
        history.append({"version": data.get("version", 1), "text": data.get("published_text", DEFAULT_TERMS), "published_at": data.get("published_at", "Baseline")})
        data.update({"draft_text": clean, "published_text": clean, "version": int(data.get("version", 1)) + 1, "published_at": published_at, "history": history[-10:]})
        self._write(data)
        return data

    def _write(self, data: dict) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temp = self.path.with_suffix(".tmp")
        temp.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
        temp.replace(self.path)


class DraftStore:
    def __init__(self, path: Path | None = None):
        self.path = path or app_data_dir() / "demo_drafts.json"

    def save(self, draft: QuotationDraft) -> None:
        records = self._records()
        records[draft.draft_id] = draft.to_dict()
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temp = self.path.with_suffix(".tmp")
        temp.write_text(json.dumps(records, indent=2, ensure_ascii=False), encoding="utf-8")
        if self.path.exists():
            import shutil
            shutil.copy2(self.path, self.path.with_suffix(".backup.json"))
        temp.replace(self.path)

    def delete(self, draft_id: str) -> None:
        records = self._records()
        records.pop(draft_id, None)
        import shutil
        temp = self.path.with_suffix(".tmp")
        temp.write_text(json.dumps(records, indent=2, ensure_ascii=False), encoding="utf-8")
        if self.path.exists():
            shutil.copy2(self.path, self.path.with_suffix(".backup.json"))
        temp.replace(self.path)

    def list(self) -> list[QuotationDraft]:
        return [self._decode(x) for x in self._records().values()]

    def get(self, draft_id: str) -> QuotationDraft | None:
        raw = self._records().get(draft_id)
        return self._decode(raw) if isinstance(raw, dict) else None

    def _records(self) -> dict:
        if not self.path.exists():
            return {}
        try:
            data = json.loads(self.path.read_text(encoding="utf-8"))
            if not isinstance(data, dict):
                raise ValueError("Expected a quotation record object.")
            return data
        except Exception as exc:
            raise RuntimeError(f"Draft store cannot be read. No records were overwritten. Preserve {self.path.name} and restore its backup.") from exc

    @staticmethod
    def _decode(data: dict) -> QuotationDraft:
        items = []
        for raw_item in data.get("items", []):
            options = []
            for raw in raw_item.get("supplier_options", []):
                options.append(SupplierOption(
                    id=raw["id"], supplier=raw.get("supplier", ""), offer=raw.get("offer", ""), co_sbm=raw.get("co_sbm") or "N/A",
                    currency=raw.get("currency", "USD"), unit_price=Decimal(raw.get("unit_price", "0")), freight_cost=Decimal(raw.get("freight_cost", "0")),
                    packing_cost=Decimal(raw.get("packing_cost", "0")), bank_charges=Decimal(raw.get("bank_charges", "0")), other_charges=Decimal(raw.get("other_charges", "0")),
                    supplier_delivery=raw.get("supplier_delivery", ""), availability=raw.get("availability", ""), internal_notes=raw.get("internal_notes", ""),
                    forex_rate=Decimal(raw.get("forex_rate", "1")), duty_rate=Decimal(raw.get("duty_rate", "0")), markup_multiplier=Decimal(raw.get("markup_multiplier", "1")),
                    safety_factor_rate=Decimal(raw.get("safety_factor_rate", "0")), cost_basis_mode=raw.get("cost_basis_mode", "IMPORTED"), cost_basis_override=Decimal(raw.get("cost_basis_override", "0")),
                    macrotech_delivery=raw.get("macrotech_delivery", ""), sr_code=raw.get("sr_code", ""), markup_remarks=raw.get("markup_remarks", ""),
                    additional_remarks=raw.get("additional_remarks", ""), source_row=int(raw.get("source_row", 0)),
                    forex_source=raw.get("forex_source", "Manual"), forex_retrieved_at=raw.get("forex_retrieved_at", ""), forex_provider_updated_at=raw.get("forex_provider_updated_at", ""),
                ))
            items.append(QuotationItem(
                item_no=raw_item.get("item_no", ""), description=raw_item.get("description", ""), uom=raw_item.get("uom", "PC"),
                quantity=Decimal(raw_item.get("quantity", "1")), supplier_options=options, selected_supplier_id=raw_item.get("selected_supplier_id", ""),
                macrotech_offer=raw_item.get("macrotech_offer", raw_item.get("manual_offer", "")),
                quoted_unit_vat_ex=Decimal(raw_item.get("quoted_unit_vat_ex", raw_item.get("manual_unit_vat_ex", "0"))),
                macrotech_delivery=raw_item.get("macrotech_delivery", raw_item.get("manual_delivery", "")),
                manual_offer=raw_item.get("manual_offer", ""), manual_unit_vat_ex=Decimal(raw_item.get("manual_unit_vat_ex", "0")), manual_delivery=raw_item.get("manual_delivery", ""),
                po_accepted=bool(raw_item.get("po_accepted", False)), accepted_quantity=Decimal(raw_item.get("accepted_quantity", "0")),
            ))
        return QuotationDraft(
            draft_id=data["draft_id"], q_code=data.get("q_code", ""), source_q_code=data.get("source_q_code", ""), rfq_reference=data.get("rfq_reference", ""),
            customer=data.get("customer", ""), buyer=data.get("buyer", ""), quotation_due_date=data.get("quotation_due_date", ""), offer_date=data.get("offer_date", ""),
            items=items, billing_address=data.get("billing_address", ""), delivery_address=data.get("delivery_address", ""),
            customer_tin=data.get("customer_tin", ""), buyer_email=data.get("buyer_email", ""),
            status=data.get("status", "QUOTATION_DRAFT"), revision=data.get("revision", "R0"), prepared_by=data.get("prepared_by", ""),
            internal_approver=data.get("internal_approver", ""), internal_approved_at=data.get("internal_approved_at", ""), customer_po_number=data.get("customer_po_number", ""),
            customer_po_at=data.get("customer_po_at", ""), created_at=data.get("created_at", ""), updated_at=data.get("updated_at", ""),
            previous_draft_id=data.get("previous_draft_id", ""), dummy_q_code=data.get("dummy_q_code", ""),
            dummy_start_row=int(data.get("dummy_start_row", 0)), dummy_end_row=int(data.get("dummy_end_row", 0)),
            terms_version=int(data.get("terms_version", 1)), terms_text=data.get("terms_text", ""),
            approved_pdf_path=data.get("approved_pdf_path", ""), approved_pdf_generated_at=data.get("approved_pdf_generated_at", ""),
            employee_comments="\n\n".join(dict.fromkeys(v.strip() for v in [data.get("employee_comments", ""), data.get("discount_request_note", "")] if v.strip())),
            submitted_at=data.get('submitted_at', ''),
            approval_epoch=int(data.get('approval_epoch', 0)),
            discount_requested_percent=Decimal(str(data.get('discount_requested_percent', '0'))),
            discount_approved_percent=Decimal(str(data.get('discount_approved_percent', '0'))),
            discount_requested_amount=Decimal(data.get("discount_requested_amount", "0")), discount_request_note="",
            discount_status=data.get("discount_status", "NONE"), discount_amount=Decimal(data.get("discount_amount", "0")),
            discount_approved_by=data.get("discount_approved_by", ""), discount_approved_at=data.get("discount_approved_at", ""),
            approval_history=list(data.get("approval_history") or []),
            submitted_snapshot=dict(data.get("submitted_snapshot") or {}), approval_snapshot=dict(data.get("approval_snapshot") or {}),
            online_quotation_id=data.get("online_quotation_id", ""),
            online_approval_id=data.get("online_approval_id", ""),
            online_version=int(data.get("online_version", 0)),
            online_snapshot_hash=data.get("online_snapshot_hash", ""),
            online_last_synced_at=data.get("online_last_synced_at", ""),
        )
