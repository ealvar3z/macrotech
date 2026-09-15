"""Local pilot controls. No network work occurs until a configured sync runs."""
from copy import deepcopy
from pathlib import Path
from uuid import uuid4
import shutil
import webbrowser
import hashlib
from .attachment_validation import validate_attachment, MAX_EXTRA_BYTES

from .platform_store import now
from .tracker_io import DUMMY_TRACKER_ID, LIVE_TRACKER_ID, DummyTrackerSink, extract_sheet_id


class EmployeeMirrorSink(DummyTrackerSink):
    def __init__(self, session, approved_id):
        super().__init__(session)
        self.approved_id = extract_sheet_id(approved_id)
        self.spreadsheet_id = self.approved_id

    def _guard(self):
        if self.spreadsheet_id != self.approved_id or self.spreadsheet_id in {LIVE_TRACKER_ID, DUMMY_TRACKER_ID}:
            raise PermissionError("Employee mirror cannot target the live or Dummy master.")
        # The original formula in AT references ACTUAL. Never replace it to make
        # a MARK-UP-only workbook appear compatible.
        doc = self.session.sheets().spreadsheets().get(
            spreadsheetId=self.spreadsheet_id, fields="sheets(properties(title))").execute()
        if not {"MARK-UP", "ACTUAL", "_PILOT_CONFIG"}.issubset(
                {s.get("properties", {}).get("title") for s in doc.get("sheets", [])}):
            raise ValueError("Employee mirror needs the verified MARK-UP template and its ACTUAL and _PILOT_CONFIG dependencies (which may be hidden). No cells changed.")


class PilotWorkflow:
    def _settings(self):
        return self.platform.get().get("pilotSettings", {})

    def pilot_settings(self):
        data = dict(self._settings())
        if self.demo_role != "CEO":
            data.pop("mirrorApprovedId", None)
        data["credentialsAvailable"] = self.google.available()
        data["cloudConnected"] = False
        return data

    def finish_onboarding(self):
        with self.lock:
            data = self.platform.get()
            data.setdefault("pilotSettings", {})["onboardingDone"] = True
            self.platform.save(data)
        return self.pilot_settings()

    def remember_employee_tracker(self, value):
        sheet_id = extract_sheet_id(value)
        if sheet_id in {LIVE_TRACKER_ID, DUMMY_TRACKER_ID}:
            raise PermissionError("Link an employee test Tracker, not a master Tracker.")
        with self.lock:
            data = self.platform.get()
            settings = data.setdefault("pilotSettings", {})
            if settings.get("employeeSheetId") != sheet_id:
                settings.pop("mirrorApprovedId", None)
            settings.update(employeeSheetId=sheet_id, onboardingDone=True)
            self.platform.save(data)
        return self.pilot_settings()

    def configure_pilot_sync(self, enabled: bool, mirror_id: str = ""):
        self._require_ceo()
        clean = extract_sheet_id(mirror_id) if mirror_id.strip() else ""
        if clean and (clean in {LIVE_TRACKER_ID, DUMMY_TRACKER_ID} or clean != self._settings().get("employeeSheetId")):
            raise PermissionError("Approve only the currently linked employee test Tracker. Master targets are blocked.")
        with self.lock:
            data = self.platform.get()
            data.setdefault("pilotSettings", {}).update(dummySyncEnabled=bool(enabled), mirrorApprovedId=clean)
            self.platform.save(data)
            self.platform.audit("PILOT_SYNC_CONFIGURED", "Macrotech CEO", "test-settings", {"enabled": bool(enabled), "mirror": clean})
        return self.pilot_settings()

    def open_employee_tracker(self):
        target = self._settings().get("employeeSheetId", "")
        if not target or target in {LIVE_TRACKER_ID, DUMMY_TRACKER_ID}:
            raise PermissionError("No personal test Tracker is linked.")
        webbrowser.open(f"https://docs.google.com/spreadsheets/d/{extract_sheet_id(target)}/edit")

    def _record_meta(self, draft_id, **updates):
        data = self.platform.get()
        meta = data.setdefault("quotationMeta", {}).setdefault(draft_id, {})
        meta.update(updates)
        self.platform.save(data)
        return meta

    def _meta(self, draft_id):
        return self.platform.get().get("quotationMeta", {}).get(draft_id, {})

    def _auto_sync(self, draft):
        """Master first, best-effort mirror second. Same revision ID on retries."""
        config = self._settings()
        self._record_meta(draft.draft_id,
            sync={"state": "PENDING", "at": now(), "message": "Waiting for test Tracker synchronization."},
            mirror={"state": "PENDING", "at": now(), "message": "Waiting for the master update."} if config.get("mirrorApprovedId") else None)
        try:
            if not config.get("dummySyncEnabled"):
                raise PermissionError("CEO test setup is required to enable Dummy synchronization.")
            if not self.google.available():
                raise PermissionError("Google credentials are not configured on this computer.")
            result = DummyTrackerSink(self.google).sync(draft, draft.draft_id)
            draft.dummy_q_code, draft.dummy_start_row, draft.dummy_end_row = result["qCode"], result["startRow"], result["endRow"]
            self.store.save(draft)
            self._record_meta(draft.draft_id, sync={"state": "SYNCED", "at": now(), "message": "Test master updated; formulas and formatting verified."})
        except Exception as exc:
            self._record_meta(draft.draft_id, sync={"state": "PENDING", "at": now(), "message": str(exc)})
            return
        mirror_id = config.get("mirrorApprovedId", "")
        if not mirror_id:
            return
        try:
            mirror = deepcopy(draft)
            # Master row addresses must never be reused for a different sheet.
            mirror.dummy_q_code = ""
            mirror.dummy_start_row = mirror.dummy_end_row = 0
            EmployeeMirrorSink(self.google, mirror_id).sync(mirror, draft.draft_id)
            self._record_meta(draft.draft_id, mirror={"state": "SYNCED", "at": now(), "message": "Personal test Tracker updated."})
        except Exception as exc:
            self._record_meta(draft.draft_id, mirror={"state": "PENDING", "at": now(), "message": str(exc)})

    def set_archived(self, draft_id: str, archived: bool, reason: str = ""):
        with self.lock:
            draft = self._stored({"draft_id": draft_id})
            if archived and not reason.strip():
                raise ValueError("Give a reason for archiving this quotation.")
            if archived:
                assigned_draft = draft.status in {"QUOTATION_DRAFT", "RFQ_RECEIVED"} and bool(draft.q_code or draft.source_q_code)
                completed_or_returned = draft.status in {"RETURNED_FOR_CORRECTION", "REJECTED", "RECALLED", "EXPIRED", "CLOSED"}
                if draft.status == "PENDING_INTERNAL_APPROVAL":
                    raise PermissionError("Recall or return the pending approval before archiving this quotation.")
                if draft.status == "INTERNALLY_APPROVED":
                    raise PermissionError("An approved quotation awaiting the customer's decision must remain active.")
                if draft.status.startswith("CUSTOMER_PO"):
                    raise PermissionError("A quotation with an active customer PO workflow cannot be archived.")
                if not (assigned_draft or completed_or_returned):
                    raise PermissionError("Only assigned drafts and inactive returned, rejected, recalled, expired, or closed quotations can be archived.")
            self._record_meta(draft_id, archived=bool(archived), archiveReason=reason.strip())
            self.platform.audit("QUOTATION_ARCHIVED" if archived else "QUOTATION_RESTORED", draft.prepared_by, draft_id, {"reason": reason.strip()})
            return self._public(draft)

    def delete_draft(self, draft_id: str):
        with self.lock:
            draft = self._stored({"draft_id": draft_id})
            if draft.q_code or draft.source_q_code or draft.status not in {"QUOTATION_DRAFT", "RFQ_RECEIVED"}:
                raise PermissionError("Assigned or submitted quotations must be archived, not deleted.")
            self.store.delete(draft_id)
            self._record_meta(draft_id, deleted=True, deletedAt=now())
            self.platform.audit("UNASSIGNED_DRAFT_DELETED", draft.prepared_by, draft_id)
        return {"deleted": True}

    def _attachment_root(self):
        root = self.store.path.parent / "customer-attachments"
        root.mkdir(parents=True, exist_ok=True)
        return root

    def list_attachments(self, draft_id):
        self._stored({"draft_id": draft_id})
        root = self._attachment_root()
        result = []
        for attachment in self._meta(draft_id).get("attachments", []):
            identity = str(attachment.get("id", ""))
            path = root / identity
            valid_id = len(identity) == 32 and all(c in '0123456789abcdef' for c in identity)
            available = valid_id and not path.is_symlink() and path.is_file()
            if available:
                available = path.stat().st_size == attachment.get('size') and path.stat().st_size <= MAX_EXTRA_BYTES
            if available:
                available = hashlib.sha256(path.read_bytes()).hexdigest() == attachment.get('sha256')
            result.append({**attachment, "available": bool(available), "integrity": 'VERIFIED' if available else 'MISSING_OR_CHANGED'})
        return result

    def add_attachments(self, draft_id):
        self._stored({"draft_id": draft_id})
        import webview
        paths = webview.windows[0].create_file_dialog(webview.OPEN_DIALOG, allow_multiple=True,
            file_types=("Customer attachments (*.pdf;*.png;*.jpg;*.jpeg;*.webp;*.docx;*.xlsx;*.txt)",))
        if not paths:
            return self.list_attachments(draft_id)
        return self._copy_attachments(draft_id, paths)

    def _copy_attachments(self, draft_id, paths):
        # Only native file-dialog selections reach this private helper.
        allowed = {".pdf", ".png", ".jpg", ".jpeg", ".webp", ".docx", ".xlsx", ".txt"}
        with self.lock:
            current = self.list_attachments(draft_id)
            selected = [Path(p) for p in paths]
            for path in selected:
                validate_attachment(path)
            if any(not p.is_file() or p.suffix.lower() not in allowed for p in selected):
                raise ValueError("Choose PDF, image, DOCX, XLSX or text files. Executables and archives are not allowed.")
            if sum(a["size"] for a in current) + sum(p.stat().st_size for p in selected) > 15 * 1024 * 1024:
                raise ValueError("Additional attachments must total 15 MB or less, leaving room for the quotation PDF.")
            copied = []
            try:
                for path in selected:
                    identity = uuid4().hex
                    target = self._attachment_root() / identity
                    shutil.copyfile(path, target)
                    copied.append(target)
                    validate_attachment(target, path.suffix)
                    if sum(a["size"] for a in current) + target.stat().st_size > MAX_EXTRA_BYTES:
                        raise ValueError("Additional attachments must total 15 MB or less.")
                    current.append({"id": identity, "name": path.name, "size": target.stat().st_size,
                        "sha256": hashlib.sha256(target.read_bytes()).hexdigest(),
                        "type": path.suffix.lower(), "available": True, "malwareScan": "NOT_SCANNED"})
                self._record_meta(draft_id, attachments=current)
            except Exception:
                for path in copied:
                    path.unlink(missing_ok=True)
                raise
            return current

    def remove_attachment(self, draft_id, attachment_id):
        if len(attachment_id) != 32 or any(c not in '0123456789abcdef' for c in attachment_id):
            raise ValueError("Invalid managed attachment identifier.")
        with self.lock:
            current = self.list_attachments(draft_id)
            if not any(a["id"] == attachment_id for a in current):
                raise ValueError("Attachment not found.")
            self._record_meta(draft_id, attachments=[a for a in current if a["id"] != attachment_id])
            (self._attachment_root() / attachment_id).unlink(missing_ok=True)
            return self.list_attachments(draft_id)
