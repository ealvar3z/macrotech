from __future__ import annotations

import json
import os
import subprocess
import sys
import webbrowser
from copy import deepcopy
from datetime import date, datetime, timezone
from decimal import Decimal
from pathlib import Path
from threading import RLock as Lock
from uuid import uuid4

from macrotech_demo.domain import QuotationDraft, QuotationItem, next_demo_q_code, text
from macrotech_demo.pdf_output import generate_quotation_pdf
from macrotech_demo.forex import current_php_rate
from macrotech_demo.notifications import GmailPilotSender
from macrotech_demo.platform_store import PlatformStore, now
from macrotech_demo.state_store import DraftStore, TermsStore
from macrotech_demo.tracker_io import (
    DUMMY_TRACKER_ID, DummyTrackerSink, GoogleSession, ReadOnlyEmployeeTracker,
    Snapshot2026Tracker, app_data_dir, resource_path,
)
from macrotech_demo.web_preview import generate_customer_preview
from macrotech_demo.approval_transport import (
    ApprovalService, ApprovalTransportConfig, ConnectionMode,
    EnvironmentTokenProvider, HttpApprovalTransport, LocalApprovalTransport,
)


APPROVED = {"INTERNALLY_APPROVED", "CUSTOMER_PO_PARTIAL", "CUSTOMER_PO_ACCEPTED"}


from macrotech_demo.pilot_workflow import PilotWorkflow


class DesktopBridge(PilotWorkflow):
    def __init__(self):
        self.snapshot = Snapshot2026Tracker()
        self.google = GoogleSession()
        self.store = DraftStore(app_data_dir() / "web_demo_drafts.json")
        self.terms = TermsStore(app_data_dir() / "terms_and_conditions.json")
        self.platform = PlatformStore(app_data_dir() / "firestore_emulator_pilot.json")
        self.lock = Lock()
        self.demo_role = "EMPLOYEE"
        self.authenticated_user = None
        self.transport_config = ApprovalTransportConfig.from_env()
        if self.transport_config.mode is ConnectionMode.TEST_ONLINE:
            transport = HttpApprovalTransport(self.transport_config, EnvironmentTokenProvider())
        else:
            transport = LocalApprovalTransport(
                submit=self._submit_local,
                state=self._local_approval_state,
                approve=lambda payload, percent: self._approve_percent_local(payload, "", percent),
                reject=self._reject_local,
                current_user=self._local_current_user,
            )
        self.approvals = ApprovalService(transport)


    def set_demo_role(self, role: str):
        if self.approvals.mode is not ConnectionMode.LOCAL_OFFLINE:
            raise PermissionError("Role simulation is disabled in TEST ONLINE. Authority comes from the authenticated backend membership.")
        if role not in {"EMPLOYEE", "APPROVER", "CEO"}:
            raise ValueError("Unknown demo role.")
        self.demo_role = role
        return self.bootstrap()

    # Profit reporting is parked; no workflow endpoint is exposed.

    def _require_reviewer(self):
        if self.approvals.mode is ConnectionMode.TEST_ONLINE:
            user = self._online_user()
            if user["role"] not in {"approver", "admin"}:
                raise PermissionError("The authenticated backend membership is not authorized to review quotations.")
            return
        if self.demo_role not in {"CEO", "APPROVER"}:
            raise PermissionError("Switch to an authorized reviewer in this local role simulation.")

    def _require_ceo(self):
        if self.approvals.mode is ConnectionMode.TEST_ONLINE:
            user = self._online_user()
            if user["role"] != "admin":
                raise PermissionError("The authenticated backend membership is not authorized for this control.")
            return
        if self.demo_role != "CEO":
            raise PermissionError("This control is CEO-only in the pilot.")

    def _stored(self, payload):
        draft = self.store.get(payload.get("draft_id", ""))
        if not draft:
            raise ValueError("Saved quotation not found.")
        return draft

    def _local_current_user(self):
        roles = {"EMPLOYEE": "preparer", "APPROVER": "approver", "CEO": "admin"}
        return {"uid": f"local-{self.demo_role.lower()}", "email": "", "role": roles[self.demo_role],
            "active": True, "displayName": self.demo_role.title()}

    def _online_user(self):
        if self.authenticated_user is None:
            self.authenticated_user = self.approvals.current_user()
        return self.authenticated_user

    def _local_approval_state(self, draft_id: str):
        draft = self.store.get(draft_id)
        if not draft:
            raise ValueError("Saved quotation not found.")
        return self._public(draft)

    def _public(self, draft):
        payload = draft.to_dict()
        payload["pilot_meta"] = self._meta(draft.draft_id)
        try:
            payload["commercial_snapshot"] = draft.commercial_snapshot()
        except ValueError:
            payload["commercial_snapshot"] = {}
        if self.demo_role != "CEO":
            payload["approval_history"] = []
        return payload

    def _submission_receipts(self, draft):
        """Repairable local outbox: workflow state is saved BEFORE delivery work.

        Repeated calls and restart recovery cannot duplicate the submission audit.
        This is a single-computer journal, not a Firestore transaction.
        """
        if not draft.submitted_at:
            return
        self.platform.queue_approval(draft.draft_id, draft.q_code, draft.customer, draft.submitted_snapshot)
        self.platform.audit_once(f"submitted-{draft.draft_id}", "QUOTATION_SUBMITTED",
            draft.prepared_by, draft.draft_id, {"qCode": draft.q_code,
            "discountRequested": str(draft.discount_requested_amount)})

    @staticmethod
    def _assert_current_review(payload, draft):
        if payload.get("revision") != draft.revision or int(payload.get("approval_epoch", 0)) != draft.approval_epoch:
            raise ValueError("This review is stale or recalled. Refresh the quotation before deciding.")

    def recall_approval(self, draft_id: str, reason: str):
        self._require_reviewer()
        if not text(reason):
            raise ValueError("Provide an internal reason for recalling approval.")
        with self.lock:
            draft = self._stored({"draft_id": draft_id})
            if draft.status.startswith("CUSTOMER_PO"):
                raise ValueError("A customer PO is already recorded. Recall cannot cancel a customer commitment.")
            if draft.status != "INTERNALLY_APPROVED":
                raise ValueError("Only an internally approved quotation without a customer PO can be recalled.")
            actor = "Macrotech CEO" if self.demo_role == "CEO" else "Delegated Approver"
            draft.approval_history.append({"action": "APPROVAL_RECALLED", "approved_by": actor,
                "approved_at": now(), "reason": text(reason), "previous_approver": draft.internal_approver,
                "previous_pdf": draft.approved_pdf_path})
            draft.status = "PENDING_INTERNAL_APPROVAL"
            draft.approval_epoch += 1
            draft.internal_approver = draft.internal_approved_at = ""
            draft.approved_pdf_path = draft.approved_pdf_generated_at = ""
            draft.discount_amount = draft.discount_approved_percent = Decimal("0")
            draft.discount_approved_by = draft.discount_approved_at = ""
            draft.discount_status = "REQUESTED" if draft.discount_requested_percent > 0 else "NONE"
            draft.touch()
            self.store.save(draft)
            self.platform.audit("APPROVAL_RECALLED", actor, draft_id, {"reason": text(reason)})
            self._auto_sync(draft)
            return self._public(draft)

    @staticmethod
    def _decode(payload: dict) -> QuotationDraft:
        return DraftStore._decode(payload)

    def bootstrap(self):
        online_errors = []
        if self.approvals.mode is ConnectionMode.TEST_ONLINE:
            user = self._online_user()
            self.demo_role = {"preparer": "EMPLOYEE", "approver": "APPROVER", "admin": "CEO"}.get(user["role"], "EMPLOYEE")
            for existing in self.store.list():
                if existing.online_quotation_id and existing.status == "PENDING_INTERNAL_APPROVAL":
                    try:
                        self.refresh_approval(existing.draft_id)
                    except Exception as exc:
                        online_errors.append({"draftId": existing.draft_id, "message": str(exc)})
        if self.approvals.mode is ConnectionMode.LOCAL_OFFLINE:
            for existing in self.store.list():
                self._submission_receipts(existing)
        samples = []
        for q_code in self.snapshot.q_codes():
            draft = self.snapshot.load(q_code)
            pricing_complete = all(item.calculation()["unit_vat_ex"] > 0 for item in draft.items)
            total = str(draft.totals()["grand_total_before_discount"]) if pricing_complete else ""
            samples.append({"qCode": q_code, "rfq": draft.rfq_reference, "customer": draft.customer, "buyer": draft.buyer, "items": len(draft.items), "total": total, "pricingComplete": pricing_complete})
        saved = [self._public(draft) for draft in sorted(self.store.list(), key=lambda x: x.updated_at, reverse=True)]
        managed_directory = self._customer_directory(include_inactive=True)
        customer_directory = [{**entry, "contacts": [x for x in entry.get("contacts", []) if x.get("active", True)]}
            for entry in managed_directory if entry.get("active", True)]
        return {
            "samples": samples,
            "saved": saved,
            "oauthAvailable": self.google.available(),
            "dummyId": DUMMY_TRACKER_ID if self.demo_role == "CEO" else "",
            "pilotSettings": self.pilot_settings(),
            "employeeName": "Kelvin Castro",
            "connectionMode": self.approvals.mode.value,
            "authenticatedUser": deepcopy(self.authenticated_user) if self.authenticated_user else self._local_current_user(),
            "onlineErrors": online_errors,
            "terms": self.terms.get(),
            "customerDirectory": customer_directory,
            "managedCustomerDirectory": managed_directory if self.demo_role in {"CEO", "APPROVER"} else [],
            "platform": self.platform_snapshot(),
        }

    def _customer_directory(self, include_inactive: bool = False):
        path = resource_path("data/customer_directory.json")
        source = json.loads(path.read_text(encoding="utf-8")).get("companies", []) if path.exists() else []
        records = []
        for entry in source:
            code = str(entry.get("code") or "").strip()
            contacts = []
            for contact in entry.get("contacts") or []:
                value = dict(contact)
                value.setdefault("id", self.platform._identity(f"{code}|{value.get('raw', '')}"))
                value.setdefault("active", True)
                contacts.append(value)
            records.append({"id": self.platform._identity(code), "code": code, "record_count": int(entry.get("record_count") or len(contacts)),
                "billing_address": str(entry.get("billing_address") or ""), "delivery_address": str(entry.get("delivery_address") or ""),
                "tin": str(entry.get("tin") or ""), "active": True, "merged_into": "", "contacts": contacts})
        by_id = {x["id"]: x for x in records}
        by_code = {x["code"].casefold(): x for x in records}
        for override in self.platform.directory_overrides():
            target = by_id.get(override.get("id")) or by_code.get(str(override.get("code") or "").casefold())
            if target:
                target.update(override)
            else:
                target = dict(override); records.append(target)
            by_id[target["id"]] = target; by_code[target["code"].casefold()] = target
        for entry in self.platform.approved_directory():
            key = entry["code"].casefold()
            target = by_code.get(key)
            if not target:
                target = {"id": self.platform._identity(entry["code"]), "code": entry["code"], "record_count": 0,
                    "billing_address": "", "delivery_address": "", "tin": "", "active": True, "merged_into": "", "contacts": []}
                records.append(target); by_code[key] = target
            known = {str(x.get("raw") or "").casefold() for x in target.get("contacts", [])}
            for contact in entry.get("contacts") or []:
                if contact["raw"].casefold() not in known:
                    target.setdefault("contacts", []).append({**contact, "id": self.platform._identity(f"{target['code']}|{contact['raw']}"), "active": True})
        for record in records:
            record["record_count"] = len([x for x in record.get("contacts", []) if x.get("active", True)])
        return records if include_inactive else [x for x in records if x.get("active", True)]

    def load_sample(self, q_code: str):
        draft = self.snapshot.load(q_code)
        self.store.save(draft)
        return self._public(draft)

    def create_new(self):
        draft = QuotationDraft(
            draft_id=f"manual-{uuid4()}", q_code="", source_q_code="", rfq_reference="",
            customer="", buyer="", quotation_due_date="", offer_date=date.today().isoformat(),
            items=[QuotationItem(item_no="1", description="", uom="PC", quantity=Decimal("1"))],
            prepared_by="Kelvin Castro - Demo Preparer",
        )
        self.store.save(draft)
        return self._public(draft)

    def load_employee_sheet(self, spreadsheet_id: str, q_code: str):
        draft = ReadOnlyEmployeeTracker(self.google).load(spreadsheet_id, q_code)
        from macrotech_demo.tracker_io import extract_sheet_id, LIVE_TRACKER_ID
        if extract_sheet_id(spreadsheet_id) != LIVE_TRACKER_ID:
            self.remember_employee_tracker(spreadsheet_id)
        self.store.save(draft)
        return self._public(draft)

    def save_draft(self, payload: dict):
        with self.lock:
            draft = self._decode(payload)
            if self._meta(draft.draft_id).get("deleted"):
                raise ValueError("This draft was deleted. A delayed autosave cannot restore it.")
            existing = self.store.get(draft.draft_id)
            if existing and existing.status not in {'QUOTATION_DRAFT','RFQ_RECEIVED'}:
                raise ValueError('This revision has already been submitted. Refresh to see its current state.')
            if draft.status not in {"QUOTATION_DRAFT", "RFQ_RECEIVED"}:
                raise ValueError("Submitted and approved revisions are locked. Create a new revision to make changes.")
            if existing:
                if payload.get("updated_at") != existing.updated_at:
                    raise ValueError("A newer saved version exists. Refresh before saving; your changes were not overwritten.")
                for field in ("approval_history", "q_code", "revision", "previous_draft_id"):
                    setattr(draft, field, getattr(existing, field))
            draft.updated_at = datetime.now(timezone.utc).isoformat(timespec="microseconds")
            self.store.save(draft)
            return {"savedAt": draft.updated_at, "draft": self._public(draft)}

    def submit(self, payload: dict):
        if self.approvals.mode is ConnectionMode.TEST_ONLINE:
            return self._submit_online(payload)
        return self.approvals.submit(self._decode(payload))

    def _submit_online(self, payload: dict):
        with self.lock:
            requested = self._decode(payload)
            authoritative = self.store.get(requested.draft_id)
            if authoritative and authoritative.status == "PENDING_INTERNAL_APPROVAL" and authoritative.online_quotation_id:
                return self._public(authoritative)
            if authoritative and authoritative.status not in {"QUOTATION_DRAFT", "RFQ_RECEIVED"}:
                raise ValueError("Only a draft quotation can be submitted for internal approval.")
            draft = requested
            if self._meta(draft.draft_id).get("deleted") or self._meta(draft.draft_id).get("archived"):
                raise ValueError("Deleted or archived drafts cannot be submitted.")
            if authoritative:
                for field in ("approval_history", "q_code", "revision", "previous_draft_id"):
                    setattr(draft, field, getattr(authoritative, field))
            current_terms = self.terms.get()
            draft.terms_version = int(current_terms["version"])
            draft.terms_text = current_terms["published_text"]
            result = self.approvals.submit(draft)
            draft.q_code = result["qCode"]
            draft.submit_for_internal_approval()
            draft.online_quotation_id = result["quotationId"]
            draft.online_approval_id = result["approvalId"]
            draft.online_version = result["version"]
            draft.online_snapshot_hash = result["snapshotHash"]
            draft.online_last_synced_at = now()
            self.store.save(draft)
            return self._public(draft)

    def _submit_local(self, payload: dict):
        with self.lock:
            requested = self._decode(payload)
            authoritative = self.store.get(requested.draft_id)
            if authoritative and authoritative.status == "PENDING_INTERNAL_APPROVAL":
                self._submission_receipts(authoritative)
                self._auto_sync(authoritative)
                return self._public(authoritative)
            if authoritative and authoritative.status not in {"QUOTATION_DRAFT", "RFQ_RECEIVED"}:
                raise ValueError("Only a draft quotation can be submitted for internal approval.")
            draft = requested
            if self._meta(draft.draft_id).get("deleted") or self._meta(draft.draft_id).get("archived"):
                raise ValueError("Deleted or archived drafts cannot be submitted.")
            if authoritative:
                for field in ("approval_history", "q_code", "revision", "previous_draft_id"):
                    setattr(draft, field, getattr(authoritative, field))
            if not text(draft.q_code):
                existing_codes = [saved.q_code for saved in self.store.list()]
                existing_codes.extend(self.snapshot.q_codes())
                draft.q_code = next_demo_q_code(existing_codes, date.today().year)
            current_terms = self.terms.get()
            draft.terms_version = int(current_terms["version"])
            draft.terms_text = current_terms["published_text"]
            draft.submit_for_internal_approval()
            self.store.save(draft)
            self._submission_receipts(draft)
            self._auto_sync(draft)
            return self._public(draft)

    def approve_percent(self, payload: dict, approver: str, percent: str = "0"):
        if self.approvals.mode is ConnectionMode.TEST_ONLINE:
            return self._approve_percent_online(payload, percent)
        return self.approvals.approve(self._decode(payload), percent)

    def _approve_percent_online(self, payload: dict, percent: str = "0"):
        self._require_reviewer()
        from decimal import Decimal
        from macrotech_demo.domain import money
        with self.lock:
            draft = self._stored(payload)
            self._assert_current_review(payload, draft)
            if draft.status != "PENDING_INTERNAL_APPROVAL":
                raise ValueError("This decision conflicts with the saved approval. Refresh the quotation.")
            rate = Decimal(str(percent))
            if not rate.is_finite() or not Decimal("0") <= rate <= Decimal("100"):
                raise ValueError("Discount must be between 0 and 100%.")
            result = self.approvals.approve(draft, str(rate))
            if result["status"] != "APPROVED":
                raise RuntimeError("The backend did not confirm approval.")
            actor = self._online_user().get("displayName") or self._online_user()["email"]
            draft.approve_internally(actor, str(money(Decimal(result["approvedDiscountCents"]) / Decimal("100"))))
            draft.discount_approved_percent = rate
            draft.approval_history[-1]["approved_discount_percent"] = str(rate)
            draft.approval_snapshot["discount_approved_percent"] = str(rate)
            draft.online_version = result["version"]
            draft.online_last_synced_at = now()
            try:
                path = generate_quotation_pdf(draft, final=True)
                draft.approved_pdf_path = str(path)
                draft.approved_pdf_generated_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
            except Exception:
                draft.approved_pdf_path = ""
                draft.approved_pdf_generated_at = ""
            self.store.save(draft)
            return self._public(draft)

    def _approve_percent_local(self, payload: dict, approver: str, percent: str = "0"):
        self._require_reviewer()
        from decimal import Decimal
        from macrotech_demo.domain import money
        with self.lock:
            draft = self.store.get(payload.get("draft_id", ""))
            if not draft:
                raise ValueError("Submitted quotation not found.")
            self._assert_current_review(payload, draft)
            if draft.prepared_by == 'Delegated Approver' and approver == 'Delegated Approver' and not self.self_approval_allowed():
                raise ValueError('CEO permission is required for delegated self-approval.')
            rate = Decimal(str(percent))
            if not rate.is_finite() or not Decimal("0") <= rate <= Decimal("100"):
                raise ValueError("Discount must be between 0 and 100%.")
            if draft.status != "PENDING_INTERNAL_APPROVAL":
                if draft.status in APPROVED and draft.discount_approved_percent == rate:
                    return self._public(draft)
                raise ValueError("This decision conflicts with the saved approval. Refresh the quotation.")
            amount = money(draft.totals()["grand_total_before_discount"] * rate / 100)
            result = self._approve_local(draft.to_dict(), approver, str(amount), _defer_sync=True)
            approved = self.store.get(draft.draft_id)
            approved.discount_approved_percent = rate
            approved.approval_history[-1]["approved_discount_percent"] = str(rate)
            approved.approval_snapshot["discount_approved_percent"] = str(rate)
            self.store.save(approved)
            self._auto_sync(approved)
            return self._public(approved)

    def approve(self, payload: dict, approver: str, discount_amount: str = "0", _defer_sync: bool = False):
        if self.approvals.mode is ConnectionMode.TEST_ONLINE:
            draft = self._stored(payload)
            total = draft.totals()["grand_total_before_discount"]
            percent = Decimal(str(discount_amount)) * Decimal("100") / total if total else Decimal("0")
            return self._approve_percent_online(payload, str(percent))
        return self._approve_local(payload, approver, discount_amount, _defer_sync)

    def _approve_local(self, payload: dict, approver: str, discount_amount: str = "0", _defer_sync: bool = False):
        self._require_reviewer()
        approver = "Macrotech CEO" if self.demo_role == "CEO" else "Delegated Approver"
        with self.lock:
            requested = self._decode(payload)
            authoritative = self.store.get(requested.draft_id)
            if not authoritative:
                raise ValueError("Submitted quotation not found.")
            draft = authoritative
            self._assert_current_review(payload, draft)
            if draft.prepared_by.strip().casefold() == approver.casefold() and not self.self_approval_allowed():
                raise PermissionError("Explicit policy permission is required for self-approval, including CEO self-approval.")
            if draft.status != "PENDING_INTERNAL_APPROVAL":
                if draft.status in APPROVED and Decimal(str(discount_amount)) == draft.discount_amount and draft.internal_approver == approver:
                    return self._public(draft)
                raise ValueError("This decision conflicts with the saved approval. Refresh the quotation.")
            draft.approve_internally(approver, discount_amount)
            try:
                path = generate_quotation_pdf(draft, final=True)
                draft.approved_pdf_path = str(path)
                draft.approved_pdf_generated_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
            except Exception:
                draft.approved_pdf_path = ""
                draft.approved_pdf_generated_at = ""
            self.store.save(draft)
            self.platform.audit("QUOTATION_APPROVED", draft.internal_approver, draft.draft_id, {"approvedAt": draft.internal_approved_at, "discount": str(draft.discount_amount)})
            if not _defer_sync:
                self._auto_sync(draft)
            return self._public(draft)

    def record_po(self, payload: dict, po_number: str, po_date: str, accepted_quantities: dict):
        with self.lock:
            draft = self._stored(payload)
            draft.record_customer_po(po_number, accepted_quantities, po_date)
            self.store.save(draft)
            self.platform.audit("CUSTOMER_PO_RECORDED", draft.prepared_by, draft.draft_id, {"po": po_number})
            self._auto_sync(draft)
            return self._public(draft)

    def reject(self, payload: dict, reason: str):
        if self.approvals.mode is ConnectionMode.TEST_ONLINE:
            return self._reject_online(payload, reason)
        return self.approvals.reject(self._decode(payload), reason)

    def _reject_online(self, payload: dict, reason: str):
        self._require_reviewer()
        if not text(reason):
            raise ValueError("Give a reason for returning the quotation for correction.")
        with self.lock:
            draft = self._stored(payload)
            self._assert_current_review(payload, draft)
            if draft.status != "PENDING_INTERNAL_APPROVAL":
                raise ValueError("This quotation is no longer pending review.")
            result = self.approvals.reject(draft, reason)
            if result["status"] != "RETURNED":
                raise RuntimeError("The backend did not confirm return for correction.")
            actor = self._online_user().get("displayName") or self._online_user()["email"]
            draft.status = "RETURNED_FOR_CORRECTION"
            draft.approval_history.append({"action": "RETURNED_FOR_CORRECTION", "approved_by": actor,
                "approved_at": now(), "reason": text(reason)})
            draft.online_version = result["version"]
            draft.online_last_synced_at = now()
            draft.touch()
            self.store.save(draft)
            return self._public(draft)

    def _reject_local(self, payload: dict, reason: str):
        self._require_reviewer()
        if not text(reason):
            raise ValueError("Give a reason for returning the quotation for correction.")
        with self.lock:
            draft = self._stored(payload)
            self._assert_current_review(payload, draft)
            if draft.status != "PENDING_INTERNAL_APPROVAL":
                raise ValueError("This quotation is no longer pending review.")
            actor = "Macrotech CEO" if self.demo_role == "CEO" else "Delegated Approver"
            if draft.prepared_by.strip().casefold() == actor.casefold() and not self.self_approval_allowed():
                raise PermissionError("Explicit policy permission is required for self-review.")
            draft.status = "RETURNED_FOR_CORRECTION"
            draft.approval_history.append({"action": "RETURNED_FOR_CORRECTION", "approved_by": actor,
                "approved_at": now(), "reason": text(reason)})
            draft.touch()
            self.store.save(draft)
            self.platform.audit_once(f"returned-{draft.draft_id}-{draft.approval_epoch}", "RETURNED_FOR_CORRECTION", actor, draft.draft_id)
            return self._public(draft)

    def refresh_approval(self, draft_id: str):
        if self.approvals.mode is ConnectionMode.LOCAL_OFFLINE:
            return self._local_approval_state(draft_id)
        with self.lock:
            draft = self.store.get(draft_id)
            if not draft or not draft.online_quotation_id:
                raise ValueError("This quotation has no online approval state.")
            result = self.approvals.get_state(draft.online_quotation_id)
            draft.online_version = result["version"]
            draft.online_last_synced_at = now()
            remote = result["status"]
            if remote == "RETURNED" and draft.status == "PENDING_INTERNAL_APPROVAL":
                draft.status = "RETURNED_FOR_CORRECTION"
                draft.touch()
            elif remote == "APPROVED" and draft.status == "PENDING_INTERNAL_APPROVAL":
                cents = int(result.get("approvedDiscountCents", 0))
                approval = result.get("approval") if isinstance(result.get("approval"), dict) else {}
                actor = approval.get("decisionByEmail") or "Authenticated Approver"
                draft.approve_internally(actor, str(Decimal(cents) / Decimal("100")))
            self.store.save(draft)
            return self._public(draft)

    def create_revision(self, payload: dict):
        with self.lock:
            current = self._stored(payload)
            if current.status not in APPROVED | {"RETURNED_FOR_CORRECTION"}:
                raise ValueError("Create a revision from an approved quotation.")
            revised = current.start_revision()
            siblings = [d for d in self.store.list() if d.q_code == current.q_code]
            numbers = [int(d.revision[1:]) for d in siblings if d.revision.startswith("R") and d.revision[1:].isdigit()]
            revised.revision = f"R{max(numbers, default=0) + 1}"
            self.store.save(revised)
            return self._public(revised)

    def generate_pdf(self, payload: dict, final: bool):
        draft = self._stored(payload) if final or payload.get("status") not in {"QUOTATION_DRAFT", "RFQ_RECEIVED"} else self._decode(payload)
        if final and draft.status not in APPROVED:
            raise ValueError("This revision has no active internal approval.")
        render_draft = draft
        if not final and not text(draft.q_code):
            render_draft = deepcopy(draft)
            render_draft.q_code = "Q-CODE-PENDING"
        path = generate_quotation_pdf(render_draft, final=bool(final))
        if final:
            draft.approved_pdf_path = str(path)
            draft.approved_pdf_generated_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
            self.store.save(draft)
        if os.name == "nt": os.startfile(str(path))
        return {"path": str(path), "draft": self._public(draft)}

    def open_path(self, path: str):
        target = Path(path).resolve()
        from macrotech_demo.pdf_output import output_root
        if target.suffix.lower() != ".pdf" or not target.is_relative_to(output_root().resolve()):
            raise PermissionError("Only quotation PDFs in the pilot output folder can be opened.")
        recalled = any(any(e.get("action") == "APPROVAL_RECALLED" and e.get("previous_pdf") and Path(e["previous_pdf"]).resolve() == target for e in d.approval_history) for d in self.store.list())
        if recalled:
            raise PermissionError("This PDF was recalled. Use the currently approved revision.")
        if not target.exists():
            raise FileNotFoundError("The generated file could not be found. Generate it again.")
        if os.name == "nt":
            os.startfile(str(target))
        else:
            webbrowser.open(target.as_uri())

    def show_in_folder(self, path: str):
        target = Path(path).resolve()
        from macrotech_demo.pdf_output import output_root
        if target.suffix.lower() != ".pdf" or not target.is_relative_to(output_root().resolve()):
            raise PermissionError("Only quotation PDFs in the pilot output folder can be opened.")
        recalled = any(any(e.get("action") == "APPROVAL_RECALLED" and e.get("previous_pdf") and Path(e["previous_pdf"]).resolve() == target for e in d.approval_history) for d in self.store.list())
        if recalled:
            raise PermissionError("This PDF was recalled. Use the currently approved revision.")
        if not target.exists():
            raise FileNotFoundError("The generated file could not be found.")
        if os.name == "nt":
            subprocess.Popen(["explorer.exe", f"/select,{target}"])
        else:
            webbrowser.open(target.parent.as_uri())

    def save_terms_draft(self, value: str):
        self._require_ceo()
        return self.terms.save_draft(value)

    def publish_terms(self, value: str):
        self._require_ceo()
        return self.terms.publish(value, datetime.now(timezone.utc).isoformat(timespec="seconds"))

    def customer_preview(self, payload: dict):
        draft = self._stored(payload) if payload.get("status") not in {"QUOTATION_DRAFT", "RFQ_RECEIVED"} else self._decode(payload)
        render_draft = draft
        if not text(draft.q_code):
            render_draft = deepcopy(draft)
            render_draft.q_code = "Q-CODE-PENDING"
        path = generate_customer_preview(render_draft)
        webbrowser.open(path.as_uri())
        return {"path": str(path)}

    def approval_email_preview(self, payload: dict):
        from macrotech_demo.email_preview import render_approval_email
        draft = self._stored(payload) if payload.get("status") not in {"QUOTATION_DRAFT", "RFQ_RECEIVED"} else self._decode(payload)
        if not draft.q_code:
            draft.q_code = "Q-CODE-PENDING"
        return render_approval_email(draft)

    def sync_dummy(self, payload: dict):
        self._require_ceo()
        with self.lock:
            draft = self._stored(payload)
            if draft.status not in APPROVED | {"PENDING_INTERNAL_APPROVAL"}:
                raise ValueError("Submit the quotation before Tracker synchronization.")
            self._auto_sync(draft)
            return {"draft": self._public(draft), "sync": self._meta(draft.draft_id).get("sync")}

    def open_dummy(self):
        self._require_ceo()
        DummyTrackerSink(self.google).open_in_browser()

    def get_forex_rate(self, currency: str):
        return current_php_rate(currency)

    def request_directory_entry(self, kind: str, company: str, contact: str, requested_by: str):
        return self.platform.request_contact(kind, company, contact, requested_by)

    def self_approval_allowed(self):
        return bool(self.platform.get().get('delegateSelfApproval', False))

    def set_self_approval(self, enabled: bool):
        self._require_ceo()
        data = self.platform.get()
        data['delegateSelfApproval'] = bool(enabled)
        self.platform.save(data)
        return bool(enabled)

    def edit_directory_request(self, request_id: str, company: str, contact: str):
        self._require_reviewer()
        data = self.platform.get()
        request = next((r for r in data['contactRequests'] if r['id'] == request_id), None)
        if not request or request['status'] != 'PENDING':
            raise ValueError('Only pending requests can be edited.')
        if not company.strip() or (request['kind'] == 'CONTACT' and not contact.strip()):
            raise ValueError('Company and contact information are required.')
        if any(r['id'] != request_id and r['company'].casefold() == company.strip().casefold() and r.get('contact', '').casefold() == contact.strip().casefold() and r['status'] in {'PENDING','APPROVED'} for r in data['contactRequests']):
            raise ValueError('A matching request already exists.')
        request.update(company=company.strip(), contact=contact.strip())
        self.platform.save(data)
        return request

    def decide_directory_request(self, request_id: str, decision: str, actor: str):
        self._require_reviewer()
        return self.platform.decide_contact(request_id, decision, actor)

    def save_directory_company(self, record: dict):
        self._require_reviewer()
        actor = "Macrotech CEO" if self.demo_role == "CEO" else "Delegated Approver"
        return self.platform.save_directory_company(record, actor)

    def merge_directory_companies(self, primary_code: str, duplicate_code: str):
        self._require_reviewer()
        actor = "Macrotech CEO" if self.demo_role == "CEO" else "Delegated Approver"
        return self.platform.merge_directory_companies(primary_code, duplicate_code, actor, self._customer_directory(include_inactive=True))

    def configure_email_routing(self, recipients_csv: str, enabled: bool, senders_csv: str = "", active_sender: str = ""):
        self._require_reviewer()
        recipients = [x.strip() for x in str(recipients_csv or "").replace(";", ",").split(",")]
        senders = [x.strip() for x in str(senders_csv or "").replace(";", ",").split(",")]
        return self.platform.configure_email(recipients, enabled, senders, active_sender)

    def platform_snapshot(self):
        result = self.platform.snapshot(len(self.store.list()))
        if self.demo_role != "CEO":
            result["auditEvents"] = []
        return result

    def send_queued_notifications(self):
        raise PermissionError("Email sending is disabled in this audit build.")


def main():
    if "--self-test" in sys.argv:
        bridge = DesktopBridge()
        boot = bridge.bootstrap()
        assert len(boot["samples"]) >= 3
        assert len(boot["customerDirectory"]) >= 2
        assert {"GNPD", "GNPK"}.issubset({entry["code"] for entry in boot["customerDirectory"]})
        draft = bridge.snapshot.load("26QPJR023")
        assert len(draft.items) == 2 and draft.revision == "R0"
        ui = resource_path("ui/index.html") if getattr(sys, "frozen", False) else resource_path("dashboard/dist/index.html")
        assert ui.exists() and ui.stat().st_size > 200
        logo = ui.parent / "macrotech_full_logo.jpg"
        assert logo.exists() and logo.stat().st_size > 1000
        print("REACT DESKTOP SELF TEST PASSED")
        return
    import webview
    ui = resource_path("ui/index.html") if getattr(sys, "frozen", False) else resource_path("dashboard/dist/index.html")
    page = ui.resolve().as_uri()
    webview.create_window(
        "Macrotech Quotation Approval Platform — Pilot Demo",
        url=page,
        js_api=DesktopBridge(),
        width=1500,
        height=930,
        min_size=(1120, 720),
        background_color="#f3f6f7",
    )
    webview.start(debug=False, private_mode=False)


if __name__ == "__main__":
    main()
