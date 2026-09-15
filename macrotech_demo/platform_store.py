from __future__ import annotations

import json
import hashlib
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

from .tracker_io import app_data_dir


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class PlatformStore:
    """Local Firestore-shaped pilot store. Production swaps this adapter for Firestore."""

    def __init__(self, path: Path | None = None):
        self.path = path or app_data_dir() / "firestore_emulator_pilot.json"

    def _default(self) -> dict[str, Any]:
        return {
            "schemaVersion": 1,
            "mode": "LOCAL_FIRESTORE_MODEL",
            "users": [
                {"id": "kelvin", "name": "Kelvin Castro", "email": "", "role": "EMPLOYEE", "active": True},
                {"id": "ceo-demo", "name": "Macrotech CEO", "email": "", "role": "CEO", "active": True},
                {"id": "approver-a", "name": "Delegated Approver", "email": "", "role": "APPROVER", "active": True},
            ],
            "contactRequests": [],
            "customerDirectory": [],
            "notificationOutbox": [],
            "auditEvents": [],
            "emailRouting": {
                "sender": "macrotech.quotations@gmail.com",
                "allowedSenderAccounts": ["macrotech.quotations@gmail.com"],
                "approverRecipients": [],
                "allowedTestRecipients": [],
                "approvalBaseUrl": "http://127.0.0.1:8765/approval",
                "enabled": False,
                "providerPriority": ["GMAIL_API"],
            },
        }

    def get(self) -> dict[str, Any]:
        if self.path.exists():
            try:
                data = json.loads(self.path.read_text(encoding="utf-8"))
                if isinstance(data, dict):
                    baseline = self._default()
                    for key, value in baseline.items():
                        data.setdefault(key, value)
                    return data
            except Exception as exc:
                raise RuntimeError("Platform store is damaged. Preserve the file and restore a backup before continuing.") from exc
            raise RuntimeError("Platform store has an invalid structure. No data was overwritten.")
        return self._default()

    def save(self, data: dict[str, Any]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temp = self.path.with_suffix(".tmp")
        temp.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
        temp.replace(self.path)

    def audit(self, action: str, actor: str, entity: str, detail: dict[str, Any] | None = None) -> None:
        data = self.get()
        data["auditEvents"].append({"id": str(uuid4()), "at": now(), "action": action, "actor": actor, "entity": entity, "detail": detail or {}})
        self.save(data)

    def audit_once(self, identity: str, action: str, actor: str, entity: str, detail=None):
        data = self.get()
        if not any(event["id"] == identity for event in data["auditEvents"]):
            data["auditEvents"].append({"id": identity, "at": now(), "action": action,
                "actor": actor, "entity": entity, "detail": detail or {}})
            self.save(data)

    def request_contact(self, kind: str, company: str, contact: str, requested_by: str) -> dict[str, Any]:
        kind = str(kind or "").upper()
        if kind not in {"COMPANY", "CONTACT"}:
            raise ValueError("Request type must be COMPANY or CONTACT.")
        company = " ".join(str(company or "").split()).strip()
        contact = " ".join(str(contact or "").split()).strip()
        if not company or (kind == "CONTACT" and not contact):
            raise ValueError("Enter the company and requested contact information.")
        data = self.get()
        duplicate = next((x for x in data["contactRequests"] if x["kind"] == kind and x["company"].casefold() == company.casefold() and x.get("contact", "").casefold() == contact.casefold() and x["status"] in {"PENDING", "APPROVED"}), None)
        if duplicate:
            return duplicate
        request = {"id": str(uuid4()), "kind": kind, "company": company, "contact": contact, "requestedBy": requested_by, "requestedAt": now(), "status": "PENDING", "decidedBy": "", "decidedAt": ""}
        data["contactRequests"].append(request)
        data["auditEvents"].append({"id": str(uuid4()), "at": now(), "action": f"{kind}_REQUESTED", "actor": requested_by, "entity": request["id"], "detail": {"company": company, "contact": contact}})
        self.save(data)
        return request

    def decide_contact(self, request_id: str, decision: str, actor: str) -> dict[str, Any]:
        decision = str(decision or "").upper()
        if decision not in {"APPROVED", "REJECTED"}:
            raise ValueError("Decision must be APPROVED or REJECTED.")
        data = self.get()
        request = next((x for x in data["contactRequests"] if x["id"] == request_id), None)
        if not request:
            raise ValueError("Directory request was not found.")
        if request["status"] != "PENDING":
            return request
        request.update({"status": decision, "decidedBy": actor, "decidedAt": now()})
        data["auditEvents"].append({"id": str(uuid4()), "at": now(), "action": f"DIRECTORY_{decision}", "actor": actor, "entity": request_id, "detail": {}})
        self.save(data)
        return request

    def approved_directory(self) -> list[dict[str, Any]]:
        grouped: dict[str, list[str]] = {}
        for request in self.get()["contactRequests"]:
            if request["status"] != "APPROVED":
                continue
            grouped.setdefault(request["company"], [])
            if request["kind"] == "CONTACT" and request.get("contact"):
                grouped[request["company"]].append(request["contact"])
        return [{"code": company, "record_count": len(contacts), "contacts": [{"raw": value, "name": value.split("<", 1)[0].strip(), "email": value.split("<", 1)[1].rstrip(">").strip() if "<" in value else "", "count": 1} for value in contacts]} for company, contacts in grouped.items()]

    @staticmethod
    def _identity(value: str) -> str:
        return hashlib.sha256(value.strip().casefold().encode("utf-8")).hexdigest()[:16]

    def directory_overrides(self) -> list[dict[str, Any]]:
        return list(self.get().get("customerDirectory") or [])

    def save_directory_company(self, record: dict[str, Any], actor: str) -> dict[str, Any]:
        code = " ".join(str(record.get("code") or "").split()).strip()
        if not code:
            raise ValueError("Company / customer name is required.")
        contacts = []
        seen_emails = set()
        for raw in record.get("contacts") or []:
            name = " ".join(str(raw.get("name") or "").split()).strip()
            email = str(raw.get("email") or "").strip().lower()
            if not name and not email:
                continue
            if email and ("@" not in email or email in seen_emails):
                raise ValueError("Each saved contact email must be valid and unique within the company.")
            if email:
                seen_emails.add(email)
            contact_id = str(raw.get("id") or self._identity(f"{code}|{name}|{email}"))
            contacts.append({"id": contact_id, "name": name, "email": email,
                "raw": f"{name} <{email}>" if name and email else name or email,
                "active": bool(raw.get("active", True)), "count": int(raw.get("count") or 1)})
        clean = {"id": str(record.get("id") or self._identity(code)), "code": code,
            "billing_address": str(record.get("billing_address") or "").strip(),
            "delivery_address": str(record.get("delivery_address") or "").strip(),
            "tin": str(record.get("tin") or "").strip(), "active": bool(record.get("active", True)),
            "merged_into": str(record.get("merged_into") or ""), "contacts": contacts,
            "updated_at": now(), "updated_by": actor}
        data = self.get()
        records = data.setdefault("customerDirectory", [])
        conflict = next((x for x in records if x.get("id") != clean["id"] and x.get("code", "").casefold() == code.casefold() and x.get("active", True)), None)
        if conflict:
            raise ValueError("A matching active company already exists. Use Merge duplicates instead.")
        existing = next((x for x in records if x.get("id") == clean["id"]), None)
        if existing:
            existing.clear(); existing.update(clean)
        else:
            records.append(clean)
        data["auditEvents"].append({"id": str(uuid4()), "at": now(), "action": "CUSTOMER_DIRECTORY_UPDATED",
            "actor": actor, "entity": clean["id"], "detail": {"company": code}})
        self.save(data)
        return clean

    def merge_directory_companies(self, primary_code: str, duplicate_code: str, actor: str,
                                  source_records: list[dict[str, Any]]) -> dict[str, Any]:
        primary = next((dict(x) for x in source_records if x.get("code", "").casefold() == primary_code.strip().casefold()), None)
        duplicate = next((dict(x) for x in source_records if x.get("code", "").casefold() == duplicate_code.strip().casefold()), None)
        if not primary or not duplicate or primary.get("id") == duplicate.get("id"):
            raise ValueError("Choose two different existing companies to merge.")
        known = {(str(x.get("name", "")).casefold(), str(x.get("email", "")).casefold()) for x in primary.get("contacts", [])}
        primary["contacts"] = list(primary.get("contacts") or []) + [x for x in duplicate.get("contacts", []) if (str(x.get("name", "")).casefold(), str(x.get("email", "")).casefold()) not in known]
        saved = self.save_directory_company(primary, actor)
        duplicate["active"] = False
        duplicate["merged_into"] = saved["id"]
        self.save_directory_company(duplicate, actor)
        self.audit("CUSTOMER_DIRECTORY_MERGED", actor, saved["id"], {"duplicate": duplicate.get("id"), "company": duplicate.get("code")})
        return saved

    def queue_approval(self, draft_id: str, q_code: str, customer: str, snapshot: dict[str, Any] | None = None) -> dict[str, Any]:
        data = self.get()
        existing = next((x for x in data["notificationOutbox"] if x["draftId"] == draft_id and x["event"] == "APPROVAL_REQUEST"), None)
        if existing:
            return existing
        event = {"id": str(uuid4()), "event": "APPROVAL_REQUEST", "draftId": draft_id, "qCode": q_code, "customer": customer,
            "commercialSnapshot": dict(snapshot or {}), "recipients": list(data["emailRouting"].get("approverRecipients") or []),
            "status": "QUEUED", "attempts": 0, "createdAt": now(), "lastAttemptAt": "", "lastError": ""}
        data["notificationOutbox"].append(event)
        self.save(data)
        return event

    def configure_email(self, recipients: list[str], enabled: bool, senders: list[str] | None = None, active_sender: str = "") -> dict[str, Any]:
        clean = sorted({str(x).strip().lower() for x in recipients if "@" in str(x)})
        data = self.get()
        sender_accounts = sorted({str(x).strip().lower() for x in (senders or data["emailRouting"].get("allowedSenderAccounts") or []) if "@" in str(x)})
        if not sender_accounts:
            sender_accounts = ["macrotech.quotations@gmail.com"]
        chosen = str(active_sender or data["emailRouting"].get("sender") or "").strip().lower()
        if chosen not in sender_accounts:
            chosen = sender_accounts[0]
        data["emailRouting"].update({"sender": chosen, "allowedSenderAccounts": sender_accounts, "approverRecipients": clean, "allowedTestRecipients": clean, "enabled": bool(enabled)})
        self.save(data)
        return data["emailRouting"]

    def snapshot(self, quotations: int = 0) -> dict[str, Any]:
        data = self.get()
        requests = data["contactRequests"]
        outbox = data["notificationOutbox"]
        return {
            "mode": data["mode"],
            "users": data["users"],
            "contactRequests": requests,
            "notificationOutbox": outbox,
            "auditEvents": list(reversed(data["auditEvents"][-50:])),
            "emailRouting": data["emailRouting"],
            "collections": [
                {"name": "quotations", "documents": quotations, "purpose": "Drafts, revisions, approval and PO state"},
                {"name": "users", "documents": len(data["users"]), "purpose": "Multiple identities and role assignments"},
                {"name": "directoryRequests", "documents": len(requests), "purpose": "Company/contact approval workflow"},
                {"name": "notificationOutbox", "documents": len(outbox), "purpose": "Durable email retry queue"},
                {"name": "auditEvents", "documents": len(data["auditEvents"]), "purpose": "Local business activity history (not tamper-proof)"},
            ],
        }
