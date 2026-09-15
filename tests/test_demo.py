from __future__ import annotations

import json
import runpy
import sys
import tempfile
import unittest
from datetime import date
from decimal import Decimal
from pathlib import Path
from types import SimpleNamespace


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from macrotech_demo import __version__
from macrotech_demo.web_preview import generate_customer_preview
from macrotech_demo.domain import next_demo_q_code
from macrotech_demo.state_store import DEFAULT_TERMS, DraftStore, TermsStore
from macrotech_demo.platform_store import PlatformStore
from macrotech_demo.notifications import GmailPilotSender
from macrotech_demo.tracker_io import DUMMY_TRACKER_ID, FORMULA_TEMPLATES, HEADERS, INPUT_BLOCKS, LIVE_TRACKER_ID, DummyTrackerSink, ReadOnlyEmployeeTracker, Snapshot2026Tracker, build_tracker_rows, extract_sheet_id


class DemoDomainTests(unittest.TestCase):
    def setUp(self):
        self.snapshot = Snapshot2026Tracker(ROOT / "data" / "2026_tracker_snapshot.json")

    @staticmethod
    def complete_controls(draft):
        """Historical blanks stay visible; tests resolve them as an employee would."""
        for item in draft.items:
            for supplier in item.supplier_options:
                if supplier.co_sbm not in {"CO", "SBM", "N/A"}:
                    supplier.co_sbm = "N/A"
        return draft

    def test_live_and_dummy_ids_are_distinct(self):
        self.assertNotEqual(LIVE_TRACKER_ID, DUMMY_TRACKER_ID)
        self.assertEqual(len(HEADERS), 52)
        self.assertEqual(HEADERS[4], "CO SBM")

    def test_release_version_markers_are_aligned(self):
        release_version = (ROOT / "VERSION").read_text(encoding="utf-8").strip()
        package = json.loads((ROOT / "dashboard" / "package.json").read_text(encoding="utf-8"))
        lock = json.loads((ROOT / "dashboard" / "package-lock.json").read_text(encoding="utf-8"))
        self.assertEqual(release_version, "0.10.1-online-alpha.1")
        self.assertEqual(__version__, release_version)
        self.assertEqual(package["version"], release_version)
        self.assertEqual(lock["version"], release_version)
        self.assertEqual(lock["packages"][""]["version"], release_version)

    def test_customer_total_labels_are_canonical_everywhere(self):
        labels = ("TOTAL VATABLE AMOUNT", "VAT AMOUNT - 12%", "GRAND TOTAL")
        for relative in ("dashboard/src/App.tsx", "macrotech_demo/web_preview.py", "macrotech_demo/pdf_output.py"):
            source = (ROOT / relative).read_text(encoding="utf-8")
            for label in labels:
                self.assertIn(label, source, f"{label} missing from {relative}")

    def test_compiled_dashboard_matches_release_source(self):
        dist = ROOT / "dashboard" / "dist"
        bundles = "\n".join(path.read_text(encoding="utf-8") for path in (dist / "assets").glob("*.*") if path.suffix in {".js", ".css"})
        for marker in ("New Quotation", "Difference vs Item", "TOTAL QUANTITY", "TOTAL VATABLE AMOUNT", "Buyer Requirement", "Q-Code Pending", "Send for Approval & Assign Q-Code", "Start typing a company code", "Customer Directory"):
            self.assertIn(marker, bundles)
        self.assertTrue((dist / "macrotech_full_logo.jpg").is_file())

    def test_customer_directory_contains_company_specific_contacts(self):
        directory = json.loads((ROOT / "data" / "customer_directory.json").read_text(encoding="utf-8"))
        companies = {entry["code"]: entry for entry in directory["companies"]}
        self.assertGreaterEqual(len(companies), 60)
        self.assertIn("GNPD", companies)
        self.assertIn("GNPK", companies)
        self.assertGreater(len(companies["GNPD"]["contacts"]), 1)
        self.assertGreater(len(companies["GNPK"]["contacts"]), 1)
        self.assertTrue(any(contact["email"].lower().endswith("@gnpk.com.ph") for contact in companies["GNPK"]["contacts"]))
        self.assertEqual(directory["source"]["sheet"], "MARK-UP")

    def test_customer_directory_does_not_invent_missing_company_fields(self):
        directory = json.loads((ROOT / "data" / "customer_directory.json").read_text(encoding="utf-8"))
        serialized = json.dumps(directory["companies"]).lower()
        for invented_field in ('"address"', '"tin"', '"phone"', '"legal_name"'):
            self.assertNotIn(invented_field, serialized)

    def test_demo_q_code_allocator_uses_next_available_sequence(self):
        prefix = f"{date.today().year % 100:02d}QDEM"
        self.assertEqual(next_demo_q_code([], date.today().year), f"{prefix}001")
        self.assertEqual(
            next_demo_q_code([f"{prefix}001", "26QJCG140", f"{prefix}007"], date.today().year),
            f"{prefix}008",
        )

    def test_co_sbm_defaults_to_na_for_new_and_blank_imports(self):
        from macrotech_demo.domain import SupplierOption
        self.assertEqual(SupplierOption(id="new").co_sbm, "N/A")
        draft = self.snapshot.load("26QJCG140")
        for item in draft.items:
            for supplier in item.supplier_options:
                self.assertIn(supplier.co_sbm, {"CO", "SBM", "N/A"})

    def test_submission_assigns_q_code_once_and_retains_it(self):
        bridge_type = runpy.run_path(str(ROOT / "web_app.pyw"))["DesktopBridge"]
        with tempfile.TemporaryDirectory() as folder:
            bridge = bridge_type()
            bridge.store = DraftStore(Path(folder) / "drafts.json")
            bridge.terms = TermsStore(Path(folder) / "terms.json")
            draft = self.complete_controls(self.snapshot.load("26QJCG140"))
            draft.draft_id = "q-code-assignment-test"
            draft.employee_comments = "Please review."
            draft.q_code = ""
            payload = draft.to_dict()

            first = bridge.submit(payload)
            repeated = bridge.submit(payload)

            prefix = f"{date.today().year % 100:02d}QDEM"
            self.assertEqual(first["q_code"], f"{prefix}001")
            self.assertEqual(first["status"], "PENDING_INTERNAL_APPROVAL")
            self.assertEqual(repeated["q_code"], first["q_code"])
            self.assertEqual(len(bridge.store.list()), 1)

    def test_employee_q_code_is_read_only_until_submission(self):
        source = (ROOT / "dashboard" / "src" / "App.tsx").read_text(encoding="utf-8")
        self.assertIn("Q-Code Pending", source)
        self.assertIn("Send for Approval & Assign Q-Code", source)
        self.assertNotIn('label="Macrotech Q-Code" value={draft.q_code}', source)

    def test_pre_submission_pdf_uses_pending_placeholder_without_assigning(self):
        bridge_type = runpy.run_path(str(ROOT / "web_app.pyw"))["DesktopBridge"]
        bridge = bridge_type()
        draft = self.complete_controls(self.snapshot.load("26QJCG140"))
        draft.q_code = ""
        captured = {}
        method_globals = bridge_type.generate_pdf.__globals__
        original = method_globals["generate_quotation_pdf"]
        original_os = method_globals["os"]

        def fake_generate(render_draft, final=False):
            captured["q_code"] = render_draft.q_code
            captured["final"] = final
            return Path("pending-preview.pdf")

        try:
            method_globals["generate_quotation_pdf"] = fake_generate
            # Exercise the Windows-only branch without asking Windows to open
            # the deliberately fake PDF returned by this unit test.
            method_globals["os"] = SimpleNamespace(
                name="nt",
                startfile=lambda path: captured.update(opened=path),
            )
            result = bridge.generate_pdf(draft.to_dict(), False)
        finally:
            method_globals["generate_quotation_pdf"] = original
            method_globals["os"] = original_os

        self.assertEqual(
            captured,
            {"q_code": "Q-CODE-PENDING", "final": False, "opened": "pending-preview.pdf"},
        )
        self.assertEqual(result["draft"]["q_code"], "")

    def test_multi_supplier_import_and_exactly_one_selection(self):
        draft = self.snapshot.load("26QPJR023")
        self.assertEqual(len(draft.items), 2)
        self.assertGreaterEqual(len(draft.items[0].supplier_options), 3)
        for item in draft.items:
            self.assertEqual(sum(1 for option in item.supplier_options if option.id == item.selected_supplier_id), 1)

    def test_supplier_selection_changes_calculated_customer_price(self):
        draft = self.snapshot.load("26QJCG140")
        item = draft.items[0]
        original = draft.totals()["total_vat_in"]
        original_unit = item.calculation()["unit_vat_ex"]
        alternate = next(x for x in item.supplier_options if x.id != item.selected_supplier_id)
        item.selected_supplier_id = alternate.id
        changed = draft.totals()["total_vat_in"]
        self.assertNotEqual(original, changed)
        self.assertNotEqual(original_unit, item.calculation()["unit_vat_ex"])
        self.assertEqual(item.calculation()["unit_vat_ex"], item.calculation()["suggested_unit_vat_ex"])

    def test_tracker_projection_selected_first_and_alternates_private(self):
        draft = self.complete_controls(self.snapshot.load("26QPJR023"))
        rows = build_tracker_rows(draft, "26QTST9999", "request-test")
        expected = sum(len(item.supplier_options) for item in draft.items)
        self.assertEqual(len(rows), expected)
        offset = 0
        for item in draft.items:
            group = rows[offset:offset + len(item.supplier_options)]
            self.assertEqual(group[0][11], item.selected().supplier)
            self.assertEqual(group[0][1], item.item_no)
            self.assertTrue(all(row[1] == "" for row in group[1:]))
            self.assertTrue(all(row[2] == item.description for row in group))
            self.assertTrue(all("internal" not in str(row[51]).lower() for row in group))
            offset += len(group)

    def test_internal_approval_does_not_equal_customer_acceptance(self):
        draft = self.complete_controls(self.snapshot.load("26QPJR023"))
        draft.submit_for_internal_approval()
        draft.approve_internally("Test Approver")
        self.assertEqual(draft.status, "INTERNALLY_APPROVED")
        self.assertFalse(any(item.po_accepted for item in draft.items))
        draft.record_customer_po("PO-TEST", [draft.items[0].item_no])
        self.assertEqual(draft.status, "CUSTOMER_PO_PARTIAL")
        self.assertTrue(draft.items[0].po_accepted)
        self.assertFalse(draft.items[1].po_accepted)

    def test_po_only_marks_selected_supplier_row(self):
        draft = self.complete_controls(self.snapshot.load("26QPJR023"))
        draft.submit_for_internal_approval(); draft.approve_internally("Test Approver")
        draft.record_customer_po("PO-TEST", [draft.items[0].item_no])
        rows = build_tracker_rows(draft, "26QTST9999", "request-test")
        first_group_size = len(draft.items[0].supplier_options)
        self.assertEqual(rows[0][47], "YES")
        self.assertEqual(rows[0][48], "PO-TEST")
        self.assertTrue(all(row[47] == "NO" and row[48] == "" for row in rows[1:first_group_size]))
        self.assertTrue(all(row[47] == "NO" for row in rows[first_group_size:]))

    def test_supplier_pending_cannot_use_manual_customer_price(self):
        draft = self.snapshot.load("26QJCG140")
        item = draft.items[0]
        item.supplier_options = []
        item.selected_supplier_id = ""
        item.manual_unit_vat_ex = Decimal("2500")
        item.quoted_unit_vat_ex = Decimal("2500")
        self.assertEqual(item.calculation()["unit_vat_ex"], Decimal("0.00"))
        with self.assertRaisesRegex(ValueError, "calculated automatically"):
            draft.validate()

    def test_customer_negotiation_creates_preserved_next_revision(self):
        original = self.complete_controls(self.snapshot.load("26QPJR023"))
        original.submit_for_internal_approval(); original.approve_internally("Approver")
        original.approved_pdf_path = "approved-r0.pdf"
        revised = original.start_revision()
        revised.items[0].description = "Negotiated description"
        self.assertEqual(original.revision, "R0")
        self.assertEqual(revised.revision, "R1")
        self.assertEqual(original.status, "INTERNALLY_APPROVED")
        self.assertEqual(revised.status, "QUOTATION_DRAFT")
        self.assertEqual(revised.approved_pdf_path, "")
        self.assertNotEqual(original.items[0].description, revised.items[0].description)

    def test_customer_web_preview_excludes_supplier_identity(self):
        draft = self.snapshot.load("26QJCG140")
        supplier = draft.items[0].selected().supplier
        path = generate_customer_preview(draft)
        html = path.read_text(encoding="utf-8")
        self.assertNotIn(supplier, html)
        self.assertIn(draft.rfq_reference, html)

    def test_dummy_sink_rejects_unapproved_draft_before_google_access(self):
        class NoGoogleSession:
            def sheets(self):
                raise AssertionError("Google must not be contacted for an unapproved draft")
        draft = self.snapshot.load("26QJCG140")
        with self.assertRaisesRegex(RuntimeError, "submitted"):
            DummyTrackerSink(NoGoogleSession()).sync(draft, draft.draft_id)

    def test_dummy_tracker_is_blocked_as_employee_import_source(self):
        class NoGoogleSession:
            def sheets(self):
                raise AssertionError("Google must not be contacted for a blocked source")
        with self.assertRaisesRegex(RuntimeError, "output only"):
            ReadOnlyEmployeeTracker(NoGoogleSession()).load(DUMMY_TRACKER_ID, "26QPJR023")

    def test_dummy_input_blocks_never_include_canonical_formula_columns(self):
        writable = {column for start, end in INPUT_BLOCKS for column in range(start, end)}
        self.assertTrue(writable.isdisjoint(FORMULA_TEMPLATES))
        self.assertNotIn(15, writable)  # P: supplier subtotal
        self.assertNotIn(45, writable)  # AT: ACTUAL lookup

    def test_complete_formula_verification_is_blocking(self):
        start_row = 6
        matrix = []
        pricing = []
        for row_number in (6, 7):
            row = [""] * 52
            row[6] = "26QTST0001"
            for column, formula in FORMULA_TEMPLATES.items():
                row[column] = formula.format(row=row_number)
            matrix.append(row)
            pricing.append(({"values": []}, "", f"=AA{row_number}+AB{row_number}"))
        DummyTrackerSink._verify_written_values(matrix, "26QTST0001", start_row, pricing)
        matrix[1][15] = ""
        with self.assertRaisesRegex(RuntimeError, "Required formula is missing"):
            DummyTrackerSink._verify_written_values(matrix, "26QTST0001", start_row, pricing)

    def test_full_google_sheet_url_is_reduced_to_id(self):
        sheet_id = "1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-"
        self.assertEqual(extract_sheet_id(f"https://docs.google.com/spreadsheets/d/{sheet_id}/edit#gid=0"), sheet_id)
        self.assertEqual(extract_sheet_id(sheet_id), sheet_id)

    def test_partial_po_quantity_is_distinct_from_internal_approval(self):
        draft = self.complete_controls(self.snapshot.load("26QPJR023"))
        draft.submit_for_internal_approval(); draft.approve_internally("Approver")
        first = draft.items[0]
        accepted = first.quantity / Decimal("2")
        draft.record_customer_po("PO-PARTIAL", {first.item_no: accepted})
        self.assertEqual(draft.status, "CUSTOMER_PO_PARTIAL")
        self.assertEqual(first.accepted_quantity, accepted)
        self.assertEqual(draft.internal_approver, "Approver")

    def test_markup_multiplier_is_direct_tracker_input_and_controls_price(self):
        draft = self.complete_controls(self.snapshot.load("26QJCG140"))
        item = draft.items[0]
        before = item.calculation()["unit_vat_ex"]
        item.selected().markup_multiplier = Decimal("1.60")
        after = item.calculation()["unit_vat_ex"]
        rows = build_tracker_rows(draft, "26QTST9999", "price-test")
        self.assertGreater(after, before)
        self.assertEqual(rows[0][29], 1.60)
        self.assertTrue(all(row[29] == 1.45 for row in rows[1:]))

    def test_qjcg140_price_matches_live_2026_tracker_formula(self):
        draft = self.complete_controls(self.snapshot.load("26QJCG140"))
        item = draft.items[0]
        self.assertEqual(item.selected().safety_factor_rate, Decimal("0"))
        self.assertEqual(item.calculation()["landed_php"], Decimal("49532.80"))
        self.assertEqual(item.calculation()["quotation_vat_in"], Decimal("71822.56"))
        self.assertEqual(item.calculation()["unit_vat_ex"], Decimal("6412.73"))

    def test_customer_price_field_cannot_override_formula(self):
        draft = self.complete_controls(self.snapshot.load("26QJCG140"))
        item = draft.items[0]
        calculated = item.calculation()["unit_vat_ex"]
        item.quoted_unit_vat_ex = Decimal("999999")
        item.manual_unit_vat_ex = Decimal("888888")
        self.assertEqual(item.calculation()["unit_vat_ex"], calculated)

    def test_tracker_repeated_row_convention(self):
        draft = self.complete_controls(self.snapshot.load("26QPJR023"))
        rows = build_tracker_rows(draft, "26QTST9999", "repeat-test")
        first_item_rows = rows[:len(draft.items[0].supplier_options)]
        self.assertNotEqual(first_item_rows[0][1], "")
        self.assertTrue(all(row[1] == "" for row in first_item_rows[1:]))
        for column in (2, 5, 6, 7, 8, 9, 10, 12, 13):
            self.assertTrue(all(row[column] == first_item_rows[0][column] for row in first_item_rows))

    def test_discount_is_applied_only_after_original_grand_total(self):
        draft = self.complete_controls(self.snapshot.load("26QJCG140"))
        original = draft.totals()["grand_total_before_discount"]
        draft.discount_requested_amount = Decimal("1000")
        draft.discount_request_note = "Customer asked for a commercial concession"
        draft.submit_for_internal_approval()
        self.assertEqual(draft.totals()["final_total"], original)
        draft.approve_internally("CEO", "750")
        totals = draft.totals()
        self.assertEqual(totals["grand_total_before_discount"], original)
        self.assertEqual(totals["discount"], Decimal("750.00"))
        self.assertEqual(totals["final_total"], original - Decimal("750.00"))

    def test_internal_submission_comment_is_not_in_customer_preview(self):
        draft = self.complete_controls(self.snapshot.load("26QJCG140"))
        draft.employee_comments = "PRIVATE APPROVER COMMENT 8372"
        path = generate_customer_preview(draft)
        self.assertNotIn(draft.employee_comments, path.read_text(encoding="utf-8"))

    def test_first_approver_wins_and_later_approver_sees_authoritative_state(self):
        bridge_type = runpy.run_path(str(ROOT / "web_app.pyw"))["DesktopBridge"]
        with tempfile.TemporaryDirectory() as folder:
            bridge = bridge_type()
            bridge.store = DraftStore(Path(folder) / "drafts.json")
            bridge.terms = TermsStore(Path(folder) / "terms.json")
            bridge.platform = PlatformStore(Path(folder) / "platform.json")
            draft = self.complete_controls(self.snapshot.load("26QJCG140"))
            draft.submit_for_internal_approval()
            bridge.store.save(draft)
            method_globals = bridge_type.approve.__globals__
            original = method_globals["generate_quotation_pdf"]
            try:
                method_globals["generate_quotation_pdf"] = lambda *_args, **_kwargs: Path(folder) / "approved.pdf"
                bridge.demo_role = "CEO"
                first = bridge.approve(draft.to_dict(), "Approver A", "100")
                bridge.demo_role = "APPROVER"
                # A changed retry now reports conflict instead of silently looking successful.
                with self.assertRaisesRegex(ValueError, "conflicts"):
                    bridge.approve(draft.to_dict(), "Approver B", "900")
                second = bridge.store.get(draft.draft_id).to_dict()
            finally:
                method_globals["generate_quotation_pdf"] = original
            self.assertEqual(first["internal_approver"], "Macrotech CEO")
            self.assertEqual(second["internal_approver"], "Macrotech CEO")
            self.assertEqual(second["discount_amount"], "100.00")

    def test_directory_requests_persist_and_deduplicate(self):
        with tempfile.TemporaryDirectory() as folder:
            store = PlatformStore(Path(folder) / "platform.json")
            first = store.request_contact("CONTACT", "GNPK", "Demo Buyer <buyer@example.com>", "Employee A")
            repeated = store.request_contact("CONTACT", "gnpk", "Demo Buyer <buyer@example.com>", "Employee B")
            self.assertEqual(first["id"], repeated["id"])
            store.decide_contact(first["id"], "APPROVED", "CEO")
            reloaded = PlatformStore(Path(folder) / "platform.json")
            self.assertEqual(reloaded.approved_directory()[0]["code"], "GNPK")

    def test_email_is_allowlisted_and_not_a_workflow_dependency(self):
        with tempfile.TemporaryDirectory() as folder:
            store = PlatformStore(Path(folder) / "platform.json")
            event = store.queue_approval("draft-1", "26QDEM001", "TEST CUSTOMER")
            self.assertEqual(event["status"], "QUEUED")
            with self.assertRaisesRegex(RuntimeError, "allowlisted"):
                GmailPilotSender().send_approval({**event, "recipients": ["not-allowed@example.com"]}, ["allowed@example.com"], "http://127.0.0.1/approval")

    def test_firebase_emulator_and_role_rules_are_packaged(self):
        firebase = json.loads((ROOT / "firebase.json").read_text(encoding="utf-8"))
        self.assertEqual(firebase["emulators"]["firestore"]["port"], 8080)
        rules = (ROOT / "firestore.rules").read_text(encoding="utf-8")
        self.assertIn("CEO", rules)
        self.assertIn("APPROVER", rules)
        self.assertNotIn("macrotech.quotations@gmail.com", rules)
        self.assertIn("employeeKeptProtectedFields", rules)
        self.assertIn("request.resource.data.qCode == resource.data.qCode", rules)

    def test_approval_notification_token_is_signed_and_expires(self):
        with tempfile.TemporaryDirectory() as folder:
            from unittest.mock import patch
            with patch("macrotech_demo.notifications.app_data_dir", return_value=Path(folder)):
                token = GmailPilotSender._approval_token("draft-123")
                self.assertEqual(GmailPilotSender.verify_approval_token(token), "draft-123")
                tampered = ("A" if token[0] != "A" else "B") + token[1:]
                with self.assertRaisesRegex(ValueError, "invalid or expired"):
                    GmailPilotSender.verify_approval_token(tampered)

    def test_next_demo_dashboard_features_are_compiled(self):
        bundles = "\n".join(path.read_text(encoding="utf-8") for path in (ROOT / "dashboard" / "dist" / "assets").glob("*.js"))
        for marker in ("CEO Dashboard", "Approver Dashboard", "Open Approved PDF", "How Firestore stores the platform", "Requested discount after Grand Total", "Use latest reference rate", "EUR - Euro"):
            self.assertIn(marker, bundles)
        self.assertNotIn("Save a Copy", bundles)

    def test_windows_builder_uses_short_isolated_retry_paths(self):
        script = (ROOT / "build_windows_exe.ps1").read_text(encoding="utf-8")
        self.assertIn("MTQ-Build-0101", script)
        self.assertIn("Package integrity preflight passed", script)
        self.assertIn('"build-requirements.txt"', script)
        self.assertLess(script.index("$MissingPaths"), script.index("Downloading the Python environment builder"))
        self.assertIn("$Attempt -le 3", script)
        self.assertIn("$SuccessfulDist", script)
        self.assertLess(script.index("Start-Process -FilePath $TemporaryExe"), script.index("if (Test-Path $OutputRoot)"))

    def test_windows_build_package_is_complete_and_has_no_credentials(self):
        required = (
            "build-requirements.txt",
            "requirements.txt",
            "README - WINDOWS DEMO.txt",
            "START_HERE.md",
            "dashboard/package-lock.json",
            "assets/macrotech_quotation.ico",
        )
        for relative in required:
            self.assertTrue((ROOT / relative).is_file(), f"required build file missing: {relative}")
        credential_names = {"credentials.json", "token.json", "service-account.json", "service_account.json"}
        packaged_credentials = [path for path in ROOT.rglob("*") if path.is_file() and path.name.lower() in credential_names and "node_modules" not in path.parts]
        self.assertEqual(packaged_credentials, [])

    def test_settings_about_identity_is_compiled(self):
        bundles = "\n".join(path.read_text(encoding="utf-8") for path in (ROOT / "dashboard" / "dist" / "assets").glob("*.js"))
        for marker in ("About this installation", "For Authorized Macrotech Use Only", "Macrotech system administrator", "0.10.1-online-alpha.1", "TEST / PILOT"):
            self.assertIn(marker, bundles)

    def test_terms_baseline_and_versioned_publish(self):
        self.assertIn("ORDER CANCELLATION", DEFAULT_TERMS)
        self.assertNotIn("one-year warranty", DEFAULT_TERMS)
        with tempfile.TemporaryDirectory() as folder:
            store = TermsStore(Path(folder) / "terms.json")
            baseline = store.get()
            store.save_draft(baseline["published_text"] + "\n\nCEO DRAFT")
            self.assertEqual(store.get()["version"], 1)
            published = store.publish(store.get()["draft_text"], "2026-09-11")
            self.assertEqual(published["version"], 2)
            self.assertEqual(published["history"][0]["text"], baseline["published_text"])


if __name__ == "__main__":
    unittest.main()
