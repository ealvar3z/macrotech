"""All data is synthetic or isolated copies; external sockets blocked by runner."""
import unittest
import tempfile
import runpy
import json
import os
from pathlib import Path
from decimal import Decimal
from unittest.mock import patch
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from macrotech_demo.domain import QuotationDraft, QuotationItem, SupplierOption
from macrotech_demo.state_store import DraftStore, TermsStore
from macrotech_demo.platform_store import PlatformStore
from macrotech_demo.email_preview import render_approval_email
from macrotech_demo.attachment_validation import validate_attachment

ROOT = Path(__file__).resolve().parents[1]
Bridge = runpy.run_path(str(ROOT / 'web_app.pyw'))['DesktopBridge']


def mock_draft(identity='mock-quotation'):
    return QuotationDraft(identity, '', '', 'MOCK-RFQ', 'Mock customer', 'Mock buyer', '', '', [
        QuotationItem('1', 'Pump required', 'PC', Decimal('10'), [
            SupplierOption('selected', supplier='PRIVATE SELECTED', offer='Pump offered', currency='PHP',
                unit_price=Decimal('100'), markup_multiplier=Decimal('1.12'), cost_basis_mode='LOCAL'),
            SupplierOption('alternate', supplier='PRIVATE ALTERNATE', offer='Internal alternative', currency='PHP',
                unit_price=Decimal('999'), cost_basis_mode='LOCAL', internal_notes='SECRET NOTE')
        ], 'selected')], prepared_by='Mock employee', discount_requested_percent=Decimal('5'))


class ReadinessTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.b = Bridge()
        self.b.store = DraftStore(self.root / 'drafts.json')
        self.b.platform = PlatformStore(self.root / 'platform.json')
        self.b.terms = TermsStore(self.root / 'terms.json')
        self.d = mock_draft(); self.b.store.save(self.d)
        self.addCleanup(patch.stopall)
        patch.dict(Bridge.approve.__globals__, {'generate_quotation_pdf': lambda *a, **k: self.root / 'mock.pdf'}).start()

    def test_submission_recovers_outbox_after_interruption(self):
        with patch.object(self.b.platform, 'queue_approval', side_effect=OSError('Mock interrupted receipt')):
            with self.assertRaises(OSError): self.b.submit(self.d.to_dict())
        saved = self.b.store.get(self.d.draft_id)
        self.assertEqual(saved.status, 'PENDING_INTERNAL_APPROVAL')
        self.b.submit(self.d.to_dict()); self.b.submit(self.d.to_dict())
        state = self.b.platform.get()
        self.assertEqual(len(state['notificationOutbox']), 1)
        self.assertEqual(len([e for e in state['auditEvents'] if e['action'] == 'QUOTATION_SUBMITTED']), 1)

    def test_managed_attachment_integrity_detects_same_size_tamper(self):
        file = self.root / 'sample.txt'; file.write_text('Mock original')
        added = self.b._copy_attachments(self.d.draft_id, [str(file)])
        self.assertTrue(self.b.list_attachments(self.d.draft_id)[0]['available'])
        managed = self.b._attachment_root() / added[0]['id']
        managed.write_text('Mock tampered')
        self.assertFalse(self.b.list_attachments(self.d.draft_id)[0]['available'])
        with self.assertRaises(ValueError): self.b.remove_attachment(self.d.draft_id, '../sample.txt')

    def test_parallel_local_submissions_have_unique_qcodes(self):
        drafts = [mock_draft(f'mock-{i}') for i in range(20)]
        for draft in drafts: self.b.store.save(draft)
        with ThreadPoolExecutor(max_workers=8) as executor:
            results = list(executor.map(lambda d: self.b.submit(d.to_dict()), drafts))
        self.assertEqual(len({r['q_code'] for r in results}), 20)

    def test_stale_save_rejected_without_overwriting_latest(self):
        stale = self.d.to_dict()
        changed = deepcopy(stale); changed['customer'] = 'Latest customer'
        self.b.save_draft(changed)
        with self.assertRaisesRegex(ValueError, 'newer'): self.b.save_draft(stale)
        self.assertEqual(self.b.store.get(self.d.draft_id).customer, 'Latest customer')

    def test_recalled_review_cannot_reapprove_from_old_payload(self):
        submitted = self.b.submit(self.d.to_dict()); self.b.demo_role = 'CEO'
        self.b.approve_percent(submitted, 'ignored caller name', '5')
        self.b.recall_approval(self.d.draft_id, 'Fix delivery')
        with self.assertRaisesRegex(ValueError, 'stale'): self.b.approve_percent(submitted, 'CEO', '5')

    def test_ceo_self_approval_requires_explicit_policy(self):
        self.d.prepared_by = 'Macrotech CEO'; self.b.store.save(self.d)
        submitted = self.b.submit(self.d.to_dict()); self.b.demo_role = 'CEO'
        with self.assertRaises(PermissionError): self.b.approve_percent(submitted, 'Different name', '5')
        self.b.set_self_approval(True)
        self.assertEqual(self.b.approve_percent(submitted, 'Different name', '5')['status'], 'INTERNALLY_APPROVED')

    def test_reject_retains_immutable_revision_and_creates_correction(self):
        submitted = self.b.submit(self.d.to_dict()); self.b.demo_role = 'APPROVER'
        returned = self.b.reject(submitted, 'Review delivery')
        with self.assertRaises(ValueError): self.b.save_draft(returned)
        revised = self.b.create_revision(returned)
        self.assertEqual(revised['q_code'], submitted['q_code'])
        self.assertEqual(revised['revision'], 'R1')
        self.assertEqual(self.b.store.get(self.d.draft_id).status, 'RETURNED_FOR_CORRECTION')

    def test_invalid_discounts_never_silently_become_zero(self):
        self.d.q_code = '26QDEM001'
        for bad in ['NaN', 'Infinity', '-1', '101']:
            self.d.discount_requested_percent = Decimal(bad)
            with self.assertRaises(ValueError): self.d.submit_for_internal_approval()
        self.d.discount_requested_percent = Decimal('5'); self.d.submit_for_internal_approval()
        for bad in ['garbage', 'NaN', 'Infinity', '-1', '2000']:
            with self.assertRaises(ValueError): self.d.approve_internally('Reviewer', bad)
        self.assertEqual(self.d.status, 'PENDING_INTERNAL_APPROVAL')

    def test_preview_is_safe_responsive_conditional_and_private(self):
        self.d.q_code = '26QDEM001'; self.d.employee_comments = '<script>unsafe()</script>'
        html = render_approval_email(self.d)
        for token in ['Approve', 'Reject', 'View Approval Record', 'Total After Discount', 'PHP 1,064.00', '@media', '#138a42']:
            self.assertIn(token, html)
        self.assertNotIn('<script>', html)
        self.assertNotIn('PRIVATE ALTERNATE', html)
        self.assertNotIn('SECRET NOTE', html)
        self.assertNotIn('https://', html)
        self.d.discount_requested_percent = Decimal('0')
        self.assertNotIn('Requested discount', render_approval_email(self.d))

    def test_attachment_renaming_symlinks_and_bad_office_rejected(self):
        for name, data in [('bad.pdf', b'MZ-executable'), ('bad.png', b'%PDF-test'), ('bad.docx', b'not-zip'), ('bad.txt', b'\0binary')]:
            path = self.root / name; path.write_bytes(data)
            with self.assertRaises(ValueError): validate_attachment(path)
        target = self.root / 'good.txt'; target.write_text('Safe text')
        # Exercise the application's symlink rejection on every platform, even
        # when the current Windows account is not permitted to create symlinks.
        with patch.object(Path, 'is_symlink', return_value=True):
            with self.assertRaises(ValueError): validate_attachment(target)
        # Also exercise a real filesystem symlink whenever the OS permits it.
        link = self.root / 'link.txt'
        try:
            link.symlink_to(target)
        except OSError as exc:
            if not (os.name == 'nt' and getattr(exc, 'winerror', None) == 1314):
                raise
        else:
            with self.assertRaises(ValueError): validate_attachment(link)

    def test_audit_retention_does_not_silently_trim_history(self):
        data = self.b.platform.get(); data['auditEvents'] = [{'id': str(n)} for n in range(600)]
        self.b.platform.save(data); self.b.platform.audit('TEST', 'MOCK', 'MOCK')
        self.assertEqual(len(self.b.platform.get()['auditEvents']), 601)
