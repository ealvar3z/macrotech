from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from copy import deepcopy
import re
from typing import Any, Iterable
from uuid import uuid4


MONEY = Decimal("0.01")


def next_demo_q_code(existing_codes: Iterable[str], year: int) -> str:
    """Return the next production-shaped, explicitly non-production pilot Q-Code."""
    prefix = f"{year % 100:02d}QDEM"
    pattern = re.compile(rf"^{re.escape(prefix)}(\d{{3,}})$", re.IGNORECASE)
    assigned = []
    for value in existing_codes:
        match = pattern.fullmatch(text(value))
        if match:
            assigned.append(int(match.group(1)))
    return f"{prefix}{max(assigned, default=0) + 1:03d}"


def text(value: Any) -> str:
    return " ".join(str(value or "").replace("\r", " ").split()).strip()


def decimal_value(value: Any, default: str = "0") -> Decimal:
    if isinstance(value, Decimal):
        return value
    raw = str(value if value is not None else "").strip().replace(",", "")
    if not raw or raw.lower() in {"free", "n/a", "na", "none", "nil", "-"}:
        return Decimal(default)
    raw = raw.replace("%", "")
    try:
        return Decimal(raw)
    except InvalidOperation:
        return Decimal(default)


def money(value: Decimal) -> Decimal:
    return value.quantize(MONEY, rounding=ROUND_HALF_UP)


@dataclass
class SupplierOption:
    id: str
    supplier: str = ""
    offer: str = ""
    co_sbm: str = "N/A"
    currency: str = "PHP"
    unit_price: Decimal = Decimal("0")
    freight_cost: Decimal = Decimal("0")
    packing_cost: Decimal = Decimal("0")
    bank_charges: Decimal = Decimal("0")
    other_charges: Decimal = Decimal("0")
    supplier_delivery: str = ""
    availability: str = ""
    internal_notes: str = ""
    forex_rate: Decimal = Decimal("1")
    duty_rate: Decimal = Decimal("0")
    markup_multiplier: Decimal = Decimal("1")
    safety_factor_rate: Decimal = Decimal("0")
    cost_basis_mode: str = "IMPORTED"
    cost_basis_override: Decimal = Decimal("0")
    macrotech_delivery: str = ""
    sr_code: str = ""
    markup_remarks: str = ""
    additional_remarks: str = ""
    forex_source: str = "Manual"
    forex_retrieved_at: str = ""
    forex_provider_updated_at: str = ""
    source_row: int = 0


@dataclass
class QuotationItem:
    item_no: str
    description: str
    uom: str
    quantity: Decimal
    supplier_options: list[SupplierOption] = field(default_factory=list)
    selected_supplier_id: str = ""
    macrotech_offer: str = ""
    quoted_unit_vat_ex: Decimal = Decimal("0")
    macrotech_delivery: str = ""
    manual_offer: str = ""
    manual_unit_vat_ex: Decimal = Decimal("0")
    manual_delivery: str = ""
    po_accepted: bool = False
    accepted_quantity: Decimal = Decimal("0")

    def selected_or_none(self) -> SupplierOption | None:
        matches = [x for x in self.supplier_options if x.id == self.selected_supplier_id]
        return matches[0] if len(matches) == 1 else None

    def selected(self) -> SupplierOption:
        matches = [x for x in self.supplier_options if x.id == self.selected_supplier_id]
        if len(matches) != 1:
            raise ValueError(f"Item {self.item_no or '?'} must have exactly one supplier selected.")
        return matches[0]

    def customer_offer(self) -> str:
        option = self.selected_or_none()
        return self.macrotech_offer or (option.offer if option else self.manual_offer) or self.description

    def customer_delivery(self) -> str:
        option = self.selected_or_none()
        return self.macrotech_delivery or (option.macrotech_delivery if option else self.manual_delivery) or "To be confirmed"

    def raw_calculation(self) -> dict[str, Decimal]:
        option = self.selected_or_none()
        if option is None:
            return {
                "foreign_subtotal": Decimal("0"), "total_foreign": Decimal("0"),
                "dutiable_php": Decimal("0"), "duty_php": Decimal("0"),
                "safety_factor": Decimal("0"), "landed_php": Decimal("0"),
                "quotation_vat_in": Decimal("0"),
                "quotation_vat_ex": Decimal("0"),
                "suggested_unit_vat_ex": Decimal("0"),
                "unit_vat_ex": Decimal("0"),
            }
        foreign_subtotal = self.quantity * option.unit_price
        total_foreign = foreign_subtotal + option.freight_cost + option.packing_cost + option.bank_charges + option.other_charges
        if option.cost_basis_mode == "LOCAL":
            dutiable_php = Decimal("0")
            duty_php = Decimal("0")
            safety_factor = Decimal("0")
            landed_php = total_foreign
        else:
            dutiable_php = total_foreign * option.forex_rate
            duty_php = dutiable_php * option.duty_rate
            subtotal_php = dutiable_php + duty_php
            safety_factor = subtotal_php * option.safety_factor_rate
            calculated_cost_basis = subtotal_php + safety_factor
            landed_php = option.cost_basis_override if option.cost_basis_mode == "OVERRIDE" and option.cost_basis_override > 0 else calculated_cost_basis
        quotation_vat_in = landed_php * option.markup_multiplier
        quotation_vat_ex = quotation_vat_in / Decimal("1.12")
        unit_vat_ex = quotation_vat_ex / self.quantity if self.quantity else Decimal("0")
        return {"foreign_subtotal": foreign_subtotal, "total_foreign": total_foreign,
            "dutiable_php": dutiable_php, "duty_php": duty_php,
            "safety_factor": safety_factor, "landed_php": landed_php,
            "suggested_unit_vat_ex": unit_vat_ex,
            "quotation_vat_in": quotation_vat_in,
            "quotation_vat_ex": quotation_vat_ex,
            "unit_vat_ex": unit_vat_ex}

    def calculation(self) -> dict[str, Decimal]:
        """Customer display values; source math remains unrounded until output."""
        return {key: money(value) for key, value in self.raw_calculation().items()}



WORKFLOW_STATES = (
    "RFQ_RECEIVED",
    "QUOTATION_DRAFT",
    "PENDING_INTERNAL_APPROVAL",
    "INTERNALLY_APPROVED",
    "CUSTOMER_PO_PARTIAL",
    "CUSTOMER_PO_ACCEPTED",
)


@dataclass
class QuotationDraft:
    draft_id: str
    q_code: str
    source_q_code: str
    rfq_reference: str
    customer: str
    buyer: str
    quotation_due_date: str
    offer_date: str
    items: list[QuotationItem]
    billing_address: str = ""
    delivery_address: str = ""
    customer_tin: str = ""
    buyer_email: str = ""
    status: str = "QUOTATION_DRAFT"
    revision: str = "R0"
    prepared_by: str = "Kelvin Castro - Demo Preparer"
    internal_approver: str = ""
    internal_approved_at: str = ""
    customer_po_number: str = ""
    customer_po_at: str = ""
    previous_draft_id: str = ""
    dummy_q_code: str = ""
    dummy_start_row: int = 0
    dummy_end_row: int = 0
    terms_version: int = 1
    terms_text: str = ""
    approved_pdf_path: str = ""
    approved_pdf_generated_at: str = ""
    employee_comments: str = ""
    submitted_at: str = ""
    approval_epoch: int = 0
    discount_requested_percent: Decimal = Decimal("0")
    discount_approved_percent: Decimal = Decimal("0")
    discount_requested_amount: Decimal = Decimal("0")
    discount_request_note: str = ""
    discount_status: str = "NONE"
    discount_amount: Decimal = Decimal("0")
    discount_approved_by: str = ""
    discount_approved_at: str = ""
    approval_history: list[dict[str, Any]] = field(default_factory=list)
    submitted_snapshot: dict[str, Any] = field(default_factory=dict)
    approval_snapshot: dict[str, Any] = field(default_factory=dict)
    online_quotation_id: str = ""
    online_approval_id: str = ""
    online_version: int = 0
    online_snapshot_hash: str = ""
    online_last_synced_at: str = ""
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat(timespec="seconds"))
    updated_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat(timespec="seconds"))

    def touch(self) -> None:
        self.updated_at = datetime.now(timezone.utc).isoformat(timespec="seconds")

    def validate(self) -> None:
        for name in ("discount_requested_percent", "discount_approved_percent"):
            value = getattr(self, name)
            if not value.is_finite() or not Decimal("0") <= value <= Decimal("100"):
                raise ValueError("Discount percentage must be a finite number between 0 and 100%.")
        for name in ("discount_requested_amount", "discount_amount"):
            value = getattr(self, name)
            if not value.is_finite() or value < 0:
                raise ValueError("Discount amount must be a finite, nonnegative number.")
        if not text(self.q_code):
            raise ValueError("Enter the Macrotech Q Code before submitting or generating the quotation.")
        if not self.items:
            raise ValueError("At least one quotation item is required.")
        item_numbers = [text(item.item_no) for item in self.items]
        if any(not value for value in item_numbers) or len(set(item_numbers)) != len(item_numbers):
            raise ValueError("Each quotation item must have a unique, nonempty item number.")
        for item in self.items:
            ids = [option.id for option in item.supplier_options]
            if any(not text(identity) for identity in ids) or len(ids) != len(set(ids)):
                raise ValueError("Supplier option identifiers must be nonempty and unique within each item.")
            if not item.quantity.is_finite():
                raise ValueError("Quantity must be finite.")
            for option in item.supplier_options:
                if option.currency not in {"PHP", "USD", "EUR"}:
                    raise ValueError("Supported currencies are PHP, USD and EUR.")
                for name in ("unit_price", "freight_cost", "packing_cost", "bank_charges", "other_charges", "forex_rate", "duty_rate", "markup_multiplier", "safety_factor_rate", "cost_basis_override"):
                    value = getattr(option, name)
                    if not value.is_finite() or value < 0:
                        raise ValueError(f"{name} must be a finite, nonnegative number.")
                if option.forex_rate <= 0 or option.markup_multiplier <= 0:
                    raise ValueError("Forex and markup must be greater than zero.")
                if option.currency == "PHP" and option.forex_rate != 1:
                    raise ValueError("PHP forex must be 1.")
                if option.cost_basis_mode == "LOCAL" and option.currency != "PHP":
                    raise ValueError("Local cost basis must use PHP.")
            if item.quantity <= 0:
                raise ValueError(f"Item {item.item_no or '?'} quantity must be greater than zero.")
            if item.supplier_options and item.selected_or_none() is None:
                raise ValueError(f"Item {item.item_no or '?'} has supplier options, so exactly one must be selected.")
            if item.supplier_options and item.selected().unit_price <= 0 and item.selected().cost_basis_override <= 0:
                raise ValueError(f"The selected cost basis for item {item.item_no or '?'} must be greater than zero.")
            if item.supplier_options:
                invalid = [x for x in item.supplier_options if x.co_sbm not in {"CO", "SBM", "N/A"}]
                if invalid:
                    raise ValueError(f"Choose CO, SBM, or N/A for every supplier option on item {item.item_no or '?'}.")
            if item.calculation()["unit_vat_ex"] <= 0:
                raise ValueError(f"Complete the Macrotech cost basis and markup for item {item.item_no or '?'}. Customer unit price is calculated automatically.")
            if not item.customer_offer():
                raise ValueError(f"Enter the Macrotech Offer for item {item.item_no or '?'}.")

    def _live_totals(self) -> dict[str, Decimal]:
        self.validate()
        # Match TEMPLATE_ QUOTATION BLANK exactly: line TOTAL AMOUNT is the
        # unrounded VAT-EX unit price times QTY, TOTAL VATABLE sums those lines,
        # VAT is 12% of that subtotal, and GRAND TOTAL is subtotal + VAT.
        raw_subtotal = sum((item.raw_calculation()["quotation_vat_ex"] for item in self.items), Decimal("0"))
        subtotal = money(raw_subtotal)
        vat = money(raw_subtotal * Decimal("0.12"))
        grand_total = money(raw_subtotal + (raw_subtotal * Decimal("0.12")))
        approved_discount = money(self.discount_amount) if self.discount_status == "APPROVED" else Decimal("0.00")
        if approved_discount > grand_total:
            raise ValueError("Approved discount cannot exceed the original Grand Total.")
        final_total = money(max(Decimal("0"), grand_total - approved_discount))
        return {
            "subtotal_vat_ex": subtotal,
            "vat": vat,
            "total_vat_in": grand_total,
            "grand_total_before_discount": grand_total,
            "discount": approved_discount,
            "final_total": final_total,
        }

    @staticmethod
    def _totals_from_snapshot(snapshot: dict[str, Any]) -> dict[str, Decimal]:
        def dec(name: str, default: str = "0") -> Decimal:
            return money(decimal_value(snapshot.get(name), default))
        grand = dec("grand_total_before_discount")
        discount = dec("discount")
        return {"subtotal_vat_ex": dec("subtotal_vat_ex"), "vat": dec("vat"),
            "total_vat_in": grand, "grand_total_before_discount": grand,
            "discount": discount, "final_total": dec("final_total", str(grand - discount))}

    def totals(self) -> dict[str, Decimal]:
        """Return the frozen commercial record once a revision is submitted."""
        if self.approval_snapshot and self.status in {"INTERNALLY_APPROVED", "CUSTOMER_PO_PARTIAL", "CUSTOMER_PO_ACCEPTED"}:
            return self._totals_from_snapshot(self.approval_snapshot)
        if self.submitted_snapshot and self.status not in {"QUOTATION_DRAFT", "RFQ_RECEIVED"}:
            return self._totals_from_snapshot(self.submitted_snapshot)
        return self._live_totals()

    def _snapshot(self, totals: dict[str, Decimal], *, approved: bool = False) -> dict[str, Any]:
        lines = []
        for item in self.items:
            option = item.selected()
            raw = item.raw_calculation()
            lines.append({
                "item_no": item.item_no, "description": item.description,
                "macrotech_offer": item.customer_offer(), "delivery": item.customer_delivery(),
                "quantity": str(item.quantity), "uom": item.uom,
                "unit_vat_ex": str(money(raw["unit_vat_ex"])),
                "line_vat_ex": str(money(raw["quotation_vat_ex"])),
                "line_vat_in": str(money(raw["quotation_vat_in"])),
                "markup_multiplier": str(option.markup_multiplier),
                "duty_rate": str(option.duty_rate),
                "safety_factor_rate": str(option.safety_factor_rate),
            })
        discount = totals["discount"] if approved else Decimal("0.00")
        final_total = totals["final_total"] if approved else totals["grand_total_before_discount"]
        return {
            "schema_version": 1,
            "captured_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "q_code": self.q_code, "revision": self.revision, "customer": self.customer,
            "billing_address": self.billing_address, "delivery_address": self.delivery_address,
            "customer_tin": self.customer_tin, "buyer": self.buyer,
            "buyer_email": self.buyer_email, "rfq_reference": self.rfq_reference,
            "prepared_by": self.prepared_by, "terms_version": self.terms_version,
            "line_count": len(lines), "lines": lines,
            "subtotal_vat_ex": str(totals["subtotal_vat_ex"]), "vat": str(totals["vat"]),
            "grand_total_before_discount": str(totals["grand_total_before_discount"]),
            "discount_requested_percent": str(self.discount_requested_percent),
            "discount_requested_amount": str(self.discount_requested_amount),
            "discount_status": self.discount_status,
            "discount_approved_percent": str(self.discount_approved_percent if approved else Decimal("0")),
            "discount": str(discount), "final_total": str(final_total),
        }

    def commercial_snapshot(self) -> dict[str, Any]:
        if self.approval_snapshot and self.status in {"INTERNALLY_APPROVED", "CUSTOMER_PO_PARTIAL", "CUSTOMER_PO_ACCEPTED"}:
            return deepcopy(self.approval_snapshot)
        if self.submitted_snapshot and self.status not in {"QUOTATION_DRAFT", "RFQ_RECEIVED"}:
            return deepcopy(self.submitted_snapshot)
        totals = self._live_totals()
        return self._snapshot(totals)

    def submit_for_internal_approval(self) -> None:
        self.validate()
        if not self.discount_requested_percent.is_finite() or not Decimal('0') <= self.discount_requested_percent <= Decimal('100'):
            raise ValueError('Requested discount must be between 0 and 100%.')
        live_totals = self._live_totals()
        self.discount_requested_amount = money(live_totals['grand_total_before_discount'] * self.discount_requested_percent / 100)
        if self.status not in {"QUOTATION_DRAFT", "RFQ_RECEIVED"}:
            raise ValueError("Only a draft quotation can be submitted for internal approval.")
        self.status = "PENDING_INTERNAL_APPROVAL"
        self.approval_epoch += 1
        self.submitted_at = datetime.now(timezone.utc).isoformat(timespec='seconds')
        self.discount_status = "REQUESTED" if self.discount_requested_amount > 0 else "NONE"
        self.submitted_snapshot = self._snapshot(live_totals)
        self.approval_snapshot = {}
        self.touch()

    def approve_internally(self, approver: str, discount_amount: Any = 0) -> None:
        if self.status != "PENDING_INTERNAL_APPROVAL":
            raise ValueError("Submit the quotation for internal approval first.")
        approved_by = text(approver) or "Macrotech Demo Approver"
        approved_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
        try:
            requested_discount = Decimal(str(discount_amount))
        except InvalidOperation:
            raise ValueError("Approved discount must be a number.") from None
        grand_total = self._totals_from_snapshot(self.submitted_snapshot)["grand_total_before_discount"] if self.submitted_snapshot else self._live_totals()["grand_total_before_discount"]
        if not requested_discount.is_finite() or requested_discount < 0 or requested_discount > grand_total:
            raise ValueError("The approved discount must be between zero and the original Grand Total.")
        self.internal_approver = approved_by
        self.internal_approved_at = approved_at
        self.discount_amount = money(requested_discount)
        self.discount_status = "APPROVED" if self.discount_amount > 0 else ("REJECTED" if self.discount_status == "REQUESTED" else "NONE")
        self.discount_approved_by = approved_by if self.discount_status in {"APPROVED", "REJECTED"} else ""
        self.discount_approved_at = approved_at if self.discount_status in {"APPROVED", "REJECTED"} else ""
        self.approval_history.append({
            "action": "INTERNAL_APPROVAL",
            "approved_by": approved_by,
            "approved_at": approved_at,
            "requested_discount": str(self.discount_requested_amount),
            "approved_discount": str(self.discount_amount),
        })
        self.status = "INTERNALLY_APPROVED"
        approved_totals = self._totals_from_snapshot(self.submitted_snapshot) if self.submitted_snapshot else self._live_totals()
        approved_totals["discount"] = self.discount_amount
        approved_totals["final_total"] = money(grand_total - self.discount_amount)
        self.approval_snapshot = self._snapshot(approved_totals, approved=True)
        self.touch()

    def record_customer_po(self, po_number: str, accepted_items: Iterable[str] | dict[str, Any], po_date: str = "") -> None:
        if self.status not in {"INTERNALLY_APPROVED", "CUSTOMER_PO_PARTIAL", "CUSTOMER_PO_ACCEPTED"}:
            raise ValueError("Customer PO acceptance is available only after internal Macrotech approval.")
        known = {item.item_no: item for item in self.items}
        if len(known) != len(self.items):
            raise ValueError("Item numbers must be unique before recording a PO.")
        raw = accepted_items if isinstance(accepted_items, dict) else {str(k): known[str(k)].quantity for k in accepted_items if str(k) in known}
        if set(raw) - set(known):
            raise ValueError("PO contains an unknown quotation item.")
        quantities = {}
        for key, value in raw.items():
            try:
                quantity = Decimal(str(value))
            except Exception:
                raise ValueError("Accepted quantities must be numbers.") from None
            if not quantity.is_finite() or quantity < 0 or quantity > known[key].quantity:
                raise ValueError(f"Accepted quantity for item {key} is outside the quoted range.")
            quantities[key] = quantity
        if not text(po_number) or not any(q > 0 for q in quantities.values()):
            raise ValueError("Enter a PO number and at least one positive accepted quantity.")
        self.customer_po_number = text(po_number)
        self.customer_po_at = text(po_date) or datetime.now(timezone.utc).isoformat(timespec="seconds")
        for item in self.items:
            item.accepted_quantity = quantities.get(item.item_no, Decimal("0"))
            item.po_accepted = item.accepted_quantity > 0
        self.status = "CUSTOMER_PO_ACCEPTED" if all(x.accepted_quantity == x.quantity for x in self.items) else "CUSTOMER_PO_PARTIAL"
        self.touch()

    def start_revision(self) -> "QuotationDraft":
        revised = deepcopy(self)
        revised.previous_draft_id = self.draft_id
        revised.draft_id = str(uuid4())
        try:
            number = int(self.revision.removeprefix("R")) + 1
        except ValueError:
            number = 1
        revised.revision = f"R{number}"
        revised.status = "QUOTATION_DRAFT"
        revised.submitted_at = ""
        revised.internal_approver = ""
        revised.internal_approved_at = ""
        revised.customer_po_number = ""
        revised.customer_po_at = ""
        revised.dummy_q_code = ""
        revised.dummy_start_row = 0
        revised.dummy_end_row = 0
        revised.approved_pdf_path = ""
        revised.approved_pdf_generated_at = ""
        revised.online_quotation_id = ""
        revised.online_approval_id = ""
        revised.online_version = 0
        revised.online_snapshot_hash = ""
        revised.online_last_synced_at = ""
        revised.discount_status = "REQUESTED" if revised.discount_requested_amount > 0 else "NONE"
        revised.discount_amount = Decimal("0")
        revised.discount_approved_percent = Decimal("0")
        revised.discount_approved_by = ""
        revised.discount_approved_at = ""
        revised.submitted_snapshot = {}
        revised.approval_snapshot = {}
        revised.created_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
        for item in revised.items:
            item.po_accepted = False
            item.accepted_quantity = Decimal("0")
        revised.touch()
        return revised

    def to_dict(self) -> dict[str, Any]:
        def encode(value: Any) -> Any:
            if isinstance(value, Decimal):
                return str(value)
            if isinstance(value, list):
                return [encode(x) for x in value]
            if hasattr(value, "__dataclass_fields__"):
                return {k: encode(v) for k, v in asdict(value).items()}
            if isinstance(value, dict):
                return {k: encode(v) for k, v in value.items()}
            return value
        return encode(self)


def draft_from_tracker_rows(rows: list[dict[str, Any]]) -> QuotationDraft:
    if not rows:
        raise ValueError("No Tracker rows were found.")
    first = rows[0]
    q_code = text(first.get("qCode"))
    items: list[QuotationItem] = []
    current: QuotationItem | None = None
    current_item_no = ""
    current_description = ""
    for row in rows:
        raw_item = text(row.get("itemNo"))
        description = text(row.get("description")) or current_description
        begins_new = current is None or (raw_item and raw_item != current_item_no)
        if begins_new:
            current_item_no = raw_item or str(len(items) + 1)
            current_description = description
            current = QuotationItem(
                item_no=current_item_no,
                description=description,
                uom=text(row.get("uom")) or "PC",
                quantity=decimal_value(row.get("quantity"), "1"),
            )
            items.append(current)
        elif description:
            current_description = description
            if not current.description:
                current.description = description
        raw_forex = text(row.get("forexRate"))
        option = SupplierOption(
            id=f"supplier-{row.get('sourceRow') or uuid4().hex[:8]}",
            supplier=text(row.get("supplier")),
            offer=str(row.get("offer") or "").strip(),
            co_sbm=text(row.get("coSbm")) or "N/A",
            currency="PHP" if raw_forex.upper() == "LOCAL" else (text(row.get("currency")) or "USD"),
            unit_price=decimal_value(row.get("unitPrice")),
            freight_cost=decimal_value(row.get("freightCost")),
            packing_cost=decimal_value(row.get("packingCost")),
            bank_charges=decimal_value(row.get("bankCharges")),
            other_charges=decimal_value(row.get("otherCharges")),
            supplier_delivery=text(row.get("supplierDeliveryPeriod")),
            forex_rate=Decimal("1") if raw_forex.upper() == "LOCAL" else decimal_value(row.get("forexRate"), "1"),
            duty_rate=decimal_value(row.get("dutyRate")),
            markup_multiplier=decimal_value(row.get("markupMultiplier"), "1"),
            cost_basis_mode="LOCAL" if raw_forex.upper() == "LOCAL" else "IMPORTED",
            macrotech_delivery=text(row.get("macrotechDeliveryPeriod")),
            sr_code=text(row.get("srCode")),
            markup_remarks=str(row.get("markupRemarks") or "").strip(),
            additional_remarks=str(row.get("additionalRemarks") or "").strip(),
            source_row=int(row.get("sourceRow") or 0),
        )
        foreign_subtotal = current.quantity * option.unit_price
        total_foreign = foreign_subtotal + option.freight_cost + option.packing_cost + option.bank_charges + option.other_charges
        if option.cost_basis_mode == "LOCAL":
            subtotal_php = total_foreign
            raw_safety = Decimal("0")
        else:
            dutiable_php = total_foreign * option.forex_rate
            duty_php = dutiable_php * option.duty_rate
            subtotal_php = dutiable_php + duty_php
            raw_safety = decimal_value(row.get("safetyFactor"))
            if subtotal_php > 0 and raw_safety > 0:
                option.safety_factor_rate = raw_safety / subtotal_php
        raw_cost_basis = decimal_value(row.get("totalLocalPurchaseVatIn"))
        expected_cost_basis = subtotal_php + raw_safety
        if raw_cost_basis > 0 and abs(raw_cost_basis - expected_cost_basis) > Decimal("0.02"):
            option.cost_basis_mode = "OVERRIDE"
            option.cost_basis_override = raw_cost_basis
        has_supplier_basis = bool(option.supplier or option.unit_price > 0 or option.cost_basis_override > 0)
        if has_supplier_basis:
            current.supplier_options.append(option)
            if text(row.get("awardToMacro")).upper() == "YES" and not current.selected_supplier_id:
                current.selected_supplier_id = option.id
    for item in items:
        if item.supplier_options and not item.selected_supplier_id:
            complete = next((x for x in item.supplier_options if (x.supplier and x.unit_price > 0) or x.cost_basis_override > 0), item.supplier_options[0])
            item.selected_supplier_id = complete.id
        selected = item.selected_or_none()
        if selected:
            item.macrotech_offer = selected.offer
            item.macrotech_delivery = selected.macrotech_delivery
            item.quoted_unit_vat_ex = item.calculation()["suggested_unit_vat_ex"]
        else:
            # No usable cost basis means the line is intentionally incomplete.
            # Customer unit price is never manually entered in the application.
            item.quoted_unit_vat_ex = Decimal("0")
        # Loading historical data must not make the new demo commercially accepted.
        item.po_accepted = False
        item.accepted_quantity = Decimal("0")
    return QuotationDraft(
        draft_id=str(uuid4()),
        q_code=q_code,
        source_q_code=q_code,
        rfq_reference=text(first.get("rfqReference")),
        customer=text(first.get("customer")),
        buyer=text(first.get("buyer")),
        quotation_due_date=text(first.get("quotationDueDate")),
        offer_date=text(first.get("offerDate")),
        items=items,
    )
