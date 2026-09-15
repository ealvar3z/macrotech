from __future__ import annotations

import tempfile
import unittest
from copy import deepcopy
from decimal import Decimal
from pathlib import Path

from pypdf import PdfReader

from macrotech_demo.domain import money
from macrotech_demo.pdf_output import (
    APPRECIATION,
    BUSINESS_CONTACT,
    INTRODUCTION,
    ORDER_CANCELLATION,
    generate_quotation_pdf,
)
from macrotech_demo.platform_store import PlatformStore
from macrotech_demo.state_store import DEFAULT_TERMS
from macrotech_demo.tracker_io import Snapshot2026Tracker


class RemainingTalliesTests(unittest.TestCase):
    def setUp(self):
        self.draft = Snapshot2026Tracker().load("26QJCG140")

    def test_submission_and_approval_use_separate_frozen_snapshots(self):
        self.draft.discount_requested_percent = Decimal("5")
        self.draft.submit_for_internal_approval()
        submitted = deepcopy(self.draft.submitted_snapshot)
        self.assertEqual(submitted["subtotal_vat_ex"], "64127.29")
        self.assertEqual(submitted["vat"], "7695.27")
        self.assertEqual(submitted["grand_total_before_discount"], "71822.56")
        self.assertEqual(submitted["lines"][0]["unit_vat_ex"], "6412.73")
        self.assertEqual(submitted["lines"][0]["line_vat_ex"], "64127.29")
        self.assertEqual(submitted["discount_requested_amount"], "3591.13")

        # A later mutation cannot alter the submitted commercial record.
        self.draft.items[0].selected().unit_price = Decimal("999999")
        self.assertEqual(self.draft.totals()["grand_total_before_discount"], Decimal("71822.56"))
        self.draft.discount_approved_percent = Decimal("3")
        self.draft.approve_internally("Macrotech CEO", money(Decimal("71822.56") * Decimal("0.03")))
        self.assertEqual(self.draft.submitted_snapshot, submitted)
        self.assertEqual(self.draft.approval_snapshot["discount"], "2154.68")
        self.assertEqual(self.draft.approval_snapshot["final_total"], "69667.88")

    def test_pdf_keeps_existing_theme_and_adds_approved_content(self):
        self.draft.billing_address = "Billing Address"
        self.draft.delivery_address = "Delivery Address"
        self.draft.customer_tin = "000-000-000"
        self.draft.buyer_email = "buyer@example.com"
        with tempfile.TemporaryDirectory() as folder:
            original = Path.cwd()
            try:
                import os
                os.chdir(folder)
                path = generate_quotation_pdf(self.draft, final=False)
                pages = PdfReader(str(path)).pages
            finally:
                os.chdir(original)
        self.assertEqual(len(pages), 2)
        first = pages[0].extract_text()
        final = pages[-1].extract_text()
        for value in (INTRODUCTION, APPRECIATION, self.draft.q_code,
                      "ORDER CANCELLATION:", "www.macrotech-industrial.com",
                      "info@macrotech-industrial.com", "QUOTATION"):
            self.assertIn(value, first)
        self.assertIn("NEXTSTEP", first.replace("\n", ""))
        for paragraph in ORDER_CANCELLATION.split("\n\n"):
            self.assertIn(paragraph, first.replace("\n", " "))
        self.assertIn("TERMS & CONDITIONS", final)
        self.assertIn("notice printed on the quotation page", final)
        self.assertNotIn("Orders cancelled or modified after confirmation may incur", final)
        self.assertIn("DRAFT - NOT FOR CUSTOMER RELEASE", first)
        self.assertNotIn("Revision R0", first[first.find("NEXT STEP"):])

    def test_directory_updates_are_audited_and_do_not_touch_quote_snapshot(self):
        self.draft.submit_for_internal_approval()
        frozen = deepcopy(self.draft.submitted_snapshot)
        with tempfile.TemporaryDirectory() as folder:
            store = PlatformStore(Path(folder) / "platform.json")
            saved = store.save_directory_company({
                "code": "GNPD", "billing_address": "New billing", "delivery_address": "New delivery",
                "tin": "123", "active": True,
                "contacts": [{"name": "Buyer Name", "email": "buyer@example.com", "active": True}],
            }, "Macrotech CEO")
            self.assertEqual(saved["contacts"][0]["email"], "buyer@example.com")
            self.assertTrue(any(x["action"] == "CUSTOMER_DIRECTORY_UPDATED" for x in store.get()["auditEvents"]))
        self.assertEqual(self.draft.submitted_snapshot, frozen)

    def test_terms_reference_exact_page_one_notice(self):
        self.assertIn("ORDER CANCELLATION notice printed on the quotation page", DEFAULT_TERMS)
        self.assertNotIn("Orders cancelled or modified after confirmation may incur", DEFAULT_TERMS)

    def test_interface_markers_cover_remaining_tallies(self):
        root = Path(__file__).resolve().parents[1]
        app = (root / "dashboard/src/App.tsx").read_text(encoding="utf-8")
        executive = (root / "dashboard/src/executive.tsx").read_text(encoding="utf-8")
        css = (root / "ui/readiness.css").read_text(encoding="utf-8")
        for marker in ("Email to Customer", "Preview Customer Quotation", "Open Submitted Draft PDF",
                       "Customer Directory", "Company / Customer", "Buyer / Contact"):
            self.assertIn(marker, app)
        self.assertIn("Show archived (", executive)
        self.assertIn("useState(false)", app)
        self.assertIn("scrollbar-gutter:stable", css)
        self.assertIn("prefers-reduced-motion", css)
        self.assertIn("macrotech_full_logo.jpg", app)
        self.assertNotIn(">Send to Customer<", app)


if __name__ == "__main__":
    unittest.main()
