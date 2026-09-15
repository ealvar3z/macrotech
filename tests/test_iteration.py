import runpy
import tempfile
import unittest
from decimal import Decimal
from pathlib import Path
from unittest.mock import patch
from macrotech_demo.tracker_io import Snapshot2026Tracker, build_tracker_rows
from macrotech_demo.state_store import DraftStore, TermsStore
from macrotech_demo.platform_store import PlatformStore
ROOT=Path(__file__).resolve().parents[1]
class IterationTests(unittest.TestCase):
    def draft(self):
        return Snapshot2026Tracker(ROOT/'data/2026_tracker_snapshot.json').load('26QJCG140')
    def test_percentage_request_does_not_apply_until_approval(self):
        d=self.draft(); d.discount_requested_percent=Decimal('5'); grand=d.totals()['total_vat_in'];d.submit_for_internal_approval()
        self.assertEqual(d.discount_requested_amount,Decimal('3591.13'))
        self.assertEqual(d.totals()['final_total'],grand)
        decoded=DraftStore._decode(d.to_dict());self.assertEqual(decoded.discount_requested_percent,Decimal('5'))
    def test_invalid_percentage_rejected(self):
        for value in ['-1','101','NaN','Infinity']:
            d=self.draft();d.discount_requested_percent=Decimal(value)
            with self.assertRaises(ValueError):d.submit_for_internal_approval()
    def test_pending_projection_keeps_qcode_and_status_not_po(self):
        d=self.draft();d.q_code='26QDEM123';d.submit_for_internal_approval()
        rows=build_tracker_rows(d,d.q_code,d.draft_id)
        self.assertTrue(all(r[6]=='26QDEM123' for r in rows))
        self.assertTrue(all(r[47]=='NO' for r in rows))
        self.assertIn('PENDING_INTERNAL_APPROVAL',rows[0][51])
        self.assertTrue(all(r[15]=='' for r in rows))
    def test_approval_percent_first_writer_and_revision_reset(self):
        Bridge=runpy.run_path(str(ROOT/'web_app.pyw'))['DesktopBridge']
        with tempfile.TemporaryDirectory() as folder:
            b=Bridge();b.store=DraftStore(Path(folder)/'drafts.json');b.terms=TermsStore(Path(folder)/'terms.json');b.platform=PlatformStore(Path(folder)/'platform.json')
            d=self.draft();d.submit_for_internal_approval();b.store.save(d)
            with patch.dict(Bridge.approve.__globals__,{'generate_quotation_pdf':lambda *a,**kw:Path(folder)/'test.pdf'}):
                b.demo_role='CEO'
                first=b.approve_percent(d.to_dict(),'CEO','5')
                with self.assertRaisesRegex(ValueError, 'conflicts'):
                    b.approve_percent(d.to_dict(),'Other','10')
                second=b.approve_percent(d.to_dict(),'CEO','5')
            self.assertEqual(first['discount_amount'],'3591.13');self.assertEqual(second['discount_approved_percent'],'5');self.assertEqual(second['internal_approver'],'Macrotech CEO')
            revised=b.store.get(d.draft_id).start_revision();self.assertEqual(revised.discount_amount,0);self.assertEqual(revised.discount_approved_percent,0)

    def test_stale_autosave_cannot_revert_submitted_quote(self):
        Bridge=runpy.run_path(str(ROOT/'web_app.pyw'))['DesktopBridge']
        with tempfile.TemporaryDirectory() as folder:
            b=Bridge();b.store=DraftStore(Path(folder)/'drafts.json')
            d=self.draft();stale=d.to_dict();d.submit_for_internal_approval();b.store.save(d)
            with self.assertRaises(ValueError):b.save_draft(stale)
            self.assertEqual(b.store.get(d.draft_id).status,'PENDING_INTERNAL_APPROVAL')
