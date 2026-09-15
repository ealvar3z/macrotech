import tempfile
import runpy
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch
from macrotech_demo.state_store import DraftStore, TermsStore
from macrotech_demo.platform_store import PlatformStore
from macrotech_demo.tracker_io import Snapshot2026Tracker, LIVE_TRACKER_ID, DUMMY_TRACKER_ID, DummyTrackerSink
from macrotech_demo.pilot_workflow import EmployeeMirrorSink

Bridge = runpy.run_path(str(Path(__file__).resolve().parents[1] / 'web_app.pyw'))['DesktopBridge']

class WorkflowTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.b = Bridge()
        self.b.store = DraftStore(self.root/'drafts.json')
        self.b.platform = PlatformStore(self.root/'platform.json')
        self.b.terms = TermsStore(self.root/'terms.json')
        self.b.google = MagicMock()
        self.b.google.available.return_value = False
        self.d = Snapshot2026Tracker().load('26QJCG140')
        self.d.q_code = self.d.source_q_code = ''
        self.d.employee_comments = ''
        self.b.store.save(self.d)

    def enable(self, mirror=''):
        self.b.demo_role='CEO'
        self.b.configure_pilot_sync(True, mirror)
        self.b.google.available.return_value=True

    def result(self):
        return dict(qCode='26QDEM001',startRow=6,endRow=6)

    def test_optional_comment_and_no_config_make_no_network_call(self):
        result=self.b.submit(self.d.to_dict())
        self.assertEqual(result['status'],'PENDING_INTERNAL_APPROVAL')
        self.assertTrue(result['q_code'])
        self.assertEqual(result['pilot_meta']['sync']['state'],'PENDING')
        self.b.google.sheets.assert_not_called()

    def test_submit_auto_sync_and_approval_update_use_same_request(self):
        self.enable()
        calls=[]
        def sink(d, rid):
            calls.append((rid,d.status,str(d.discount_approved_percent)))
            return self.result()
        with patch.object(DummyTrackerSink,'sync',side_effect=sink), patch.dict(Bridge.approve.__globals__, {'generate_quotation_pdf':lambda *a,**k:self.root/'approved.pdf'}):
            submitted=self.b.submit(self.d.to_dict())
            approved=self.b.approve_percent(submitted,'CEO','5')
        self.assertEqual(len(calls),2)
        self.assertEqual(calls[0][0],calls[1][0])
        self.assertEqual(calls[1][1:],('INTERNALLY_APPROVED','5'))
        self.assertEqual(approved['pilot_meta']['sync']['state'],'SYNCED')
        self.assertEqual(approved['dummy_start_row'],6)

    def test_failed_write_retains_code_and_retry_identity(self):
        self.enable()
        with patch.object(DummyTrackerSink,'sync',side_effect=OSError('connection lost')):
            first=self.b.submit(self.d.to_dict())
        with patch.object(DummyTrackerSink,'sync',return_value=self.result()) as sink:
            retried=self.b.sync_dummy(first)
        self.assertEqual(retried['draft']['q_code'],first['q_code'])
        self.assertEqual(sink.call_args.args[1],self.d.draft_id)
        self.assertEqual(len(self.b.store.list()),1)

    def test_mirror_failure_never_rolls_back_master(self):
        target='employee_test_tracker_123456789'
        self.b.remember_employee_tracker(target)
        self.enable(target)
        with patch.object(DummyTrackerSink,'sync',return_value=self.result()), patch.object(EmployeeMirrorSink,'sync',side_effect=OSError('mirror offline')):
            result=self.b.submit(self.d.to_dict())
        self.assertEqual(result['pilot_meta']['sync']['state'],'SYNCED')
        self.assertEqual(result['pilot_meta']['mirror']['state'],'PENDING')

    def test_master_failure_does_not_attempt_mirror(self):
        target='employee_test_tracker_123456789'
        self.b.remember_employee_tracker(target); self.enable(target)
        with patch.object(DummyTrackerSink,'sync',side_effect=OSError('master offline')), patch.object(EmployeeMirrorSink,'sync') as mirror:
            self.b.submit(self.d.to_dict())
        mirror.assert_not_called()

    def test_mirror_never_reuses_master_row_addresses(self):
        target='employee_test_tracker_123456789'
        self.b.remember_employee_tracker(target); self.enable(target)
        with patch.object(DummyTrackerSink,'sync',return_value=self.result()), patch.object(EmployeeMirrorSink,'sync',return_value=self.result()) as mirror:
            self.b.submit(self.d.to_dict())
        draft=mirror.call_args.args[0]
        self.assertEqual((draft.dummy_q_code,draft.dummy_start_row,draft.dummy_end_row),('',0,0))

    def test_live_and_dummy_cannot_be_employee_mirrors(self):
        self.b.demo_role='CEO'
        for target in (LIVE_TRACKER_ID,DUMMY_TRACKER_ID):
            with self.assertRaises(PermissionError):self.b.remember_employee_tracker(target)
            with self.assertRaises(PermissionError):self.b.configure_pilot_sync(True,target)
            with self.assertRaises(PermissionError):EmployeeMirrorSink(self.b.google,target)._guard()
        self.b.google.sheets.assert_not_called()

    def test_incompatible_mirror_stops_before_values_write(self):
        self.b.google.sheets.return_value.spreadsheets.return_value.get.return_value.execute.return_value={'sheets':[{'properties':{'title':'MARK-UP'}}]}
        with self.assertRaisesRegex(ValueError,'dependencies'):
            EmployeeMirrorSink(self.b.google,'employee_test_tracker_123456789')._guard()
        self.b.google.sheets.return_value.spreadsheets.return_value.batchUpdate.assert_not_called()

    def test_employee_cannot_change_sync_or_open_master(self):
        with self.assertRaises(PermissionError):self.b.configure_pilot_sync(True)
        with self.assertRaises(PermissionError):self.b.open_dummy()
        with self.assertRaises(PermissionError):self.b.sync_dummy(self.d.to_dict())
        self.assertEqual(self.b.bootstrap()['dummyId'],'')

    def test_reconnect_revokes_mirror_authorization(self):
        self.b.remember_employee_tracker('employee_test_tracker_123456789');self.enable('employee_test_tracker_123456789')
        self.b.remember_employee_tracker('employee_test_tracker_987654321')
        self.assertFalse(self.b._settings().get('mirrorApprovedId'))

    def test_onboarding_persists_after_restart(self):
        self.b.finish_onboarding()
        loaded=PlatformStore(self.b.platform.path)
        self.assertTrue(loaded.get()['pilotSettings']['onboardingDone'])

    def test_delete_only_unassigned_draft_and_backup(self):
        self.b.delete_draft(self.d.draft_id)
        self.assertIsNone(self.b.store.get(self.d.draft_id))
        self.assertTrue(self.b.store.path.with_suffix('.backup.json').exists())

    def test_delayed_autosave_cannot_resurrect_deleted_draft(self):
        payload=self.d.to_dict()
        self.b.delete_draft(self.d.draft_id)
        with self.assertRaisesRegex(ValueError,'deleted'):
            self.b.save_draft(payload)
        self.assertIsNone(self.b.store.get(self.d.draft_id))

    def test_assigned_archive_restore_preserves_code_and_history(self):
        self.d.q_code=self.d.source_q_code='26QJCG140'
        self.b.store.save(self.d)
        with self.assertRaises(PermissionError):self.b.delete_draft(self.d.draft_id)
        archived=self.b.set_archived(self.d.draft_id,True,'Duplicate inquiry')
        self.assertTrue(archived['pilot_meta']['archived'])
        restored=self.b.set_archived(self.d.draft_id,False)
        self.assertFalse(restored['pilot_meta']['archived'])
        self.assertEqual(restored['q_code'],'26QJCG140')

    def test_pending_approval_must_be_recalled_before_archive(self):
        self.b.submit(self.d.to_dict())
        with self.assertRaisesRegex(PermissionError,'Recall or return'):
            self.b.set_archived(self.d.draft_id,True,'No longer needed')

    def test_legacy_comments_merge_without_duplicate_or_loss(self):
        payload=self.d.to_dict();payload.update(employee_comments='Please review',discount_request_note='Customer negotiated')
        decoded=DraftStore._decode(payload)
        self.assertEqual(decoded.employee_comments,'Please review\n\nCustomer negotiated')
        self.assertEqual(decoded.discount_request_note,'')
        self.assertEqual(DraftStore._decode(decoded.to_dict()).employee_comments,decoded.employee_comments)

    def test_attachment_copy_survives_original_deletion(self):
        file=self.root/'datasheet.pdf';file.write_bytes(b'%PDF-1.4 test')
        files=self.b._copy_attachments(self.d.draft_id,[str(file)])
        file.unlink()
        self.assertTrue(self.b.list_attachments(self.d.draft_id)[0]['available'])
        self.assertNotIn('path',files[0])
        self.b.remove_attachment(self.d.draft_id,files[0]['id'])
        self.assertEqual(self.b.list_attachments(self.d.draft_id),[])

    def test_attachment_rejects_executable_and_path_traversal(self):
        file=self.root/'danger.exe';file.write_bytes(b'MZ')
        with self.assertRaises(ValueError):self.b._copy_attachments(self.d.draft_id,[str(file)])
        with self.assertRaises(ValueError):self.b.remove_attachment(self.d.draft_id,'../drafts.json')
        self.assertTrue(self.b.store.path.exists())

    def test_missing_attachment_is_reported(self):
        file=self.root/'image.png'
        from PIL import Image
        Image.new('RGB', (2, 2), 'white').save(file)
        files=self.b._copy_attachments(self.d.draft_id,[str(file)])
        (self.b._attachment_root()/files[0]['id']).unlink()
        self.assertFalse(self.b.list_attachments(self.d.draft_id)[0]['available'])

    def test_attachment_size_limit_prevents_copy(self):
        file=self.root/'large.txt'
        with file.open('wb') as stream:stream.truncate(16*1024*1024)
        with self.assertRaises(ValueError):self.b._copy_attachments(self.d.draft_id,[str(file)])
        self.assertEqual(self.b.list_attachments(self.d.draft_id),[])

    def test_forex_precision_and_metadata_survive_save(self):
        supplier=self.d.items[0].selected()
        from decimal import Decimal
        supplier.forex_rate=Decimal('62.689229')
        supplier.forex_provider_updated_at='2026-09-12'
        self.b.save_draft(self.d.to_dict())
        saved=self.b.store.get(self.d.draft_id).items[0].selected()
        self.assertEqual(saved.forex_rate,Decimal('62.689229'))
        self.assertEqual(saved.forex_provider_updated_at,'2026-09-12')
