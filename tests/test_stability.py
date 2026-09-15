import runpy,tempfile,unittest
from pathlib import Path
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import patch
from macrotech_demo.domain import next_demo_q_code, QuotationDraft, QuotationItem, SupplierOption
from macrotech_demo.state_store import DraftStore,TermsStore
from macrotech_demo.platform_store import PlatformStore
from macrotech_demo.tracker_io import Snapshot2026Tracker, build_tracker_rows, DummyTrackerSink
ROOT=Path(__file__).resolve().parents[1]
Bridge=runpy.run_path(str(ROOT/'web_app.pyw'))['DesktopBridge']
class StabilityTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
  self.b=Bridge();p=Path(self.tmp.name)
  self.b.store=DraftStore(p/'d.json');self.b.terms=TermsStore(p/'t.json');self.b.platform=PlatformStore(p/'p.json')
  self.d=Snapshot2026Tracker().load('26QJCG140')
  self.d.employee_comments='Review the offer';self.b.store.save(self.d)
 def approved(self):
  self.d.submit_for_internal_approval();self.b.store.save(self.d);self.b.demo_role='CEO'
  with patch.dict(Bridge.approve.__globals__,{'generate_quotation_pdf':lambda *a,**k:Path(self.tmp.name)/'approved.pdf'}):
   self.b.approve_percent(self.d.to_dict(),'forged actor','5')
  self.d=self.b.store.get(self.d.draft_id)
 def test_employee_cannot_approve(self):
  self.d.submit_for_internal_approval();self.b.store.save(self.d)
  with self.assertRaises(PermissionError):self.b.approve_percent(self.d.to_dict(),'CEO','0')
 def test_forged_po_status_rejected(self):
  payload=self.d.to_dict();payload['status']='INTERNALLY_APPROVED'
  with self.assertRaises(ValueError):self.b.record_po(payload,'FAKE','',{'1':'1'})
  self.assertEqual(self.b.store.get(self.d.draft_id).status,'QUOTATION_DRAFT')
 def test_revision_preserves_original_and_sequence(self):
  self.approved();payload=self.d.to_dict();payload['customer']='FORGED'
  a=self.b.create_revision(payload);b=self.b.create_revision(payload)
  self.assertEqual(self.b.store.get(self.d.draft_id).customer,self.d.customer)
  self.assertEqual((a['revision'],b['revision']),('R1','R2'))
 def test_approved_pdf_uses_saved_payload(self):
  self.approved();payload=self.d.to_dict();payload['customer']='FORGED';pdf=Path(self.tmp.name)/'approved.pdf';pdf.write_bytes(b'%PDF-1.4\n%%EOF\n')
  seen=[];opened=[]
  # Exercise Windows behavior without opening a viewer during the build test.
  with patch.dict(Bridge.generate_pdf.__globals__,{'generate_quotation_pdf':lambda d,**k:(seen.append(d.customer) or pdf),'os':SimpleNamespace(name='nt',startfile=lambda p:opened.append(p))}):
   self.b.generate_pdf(payload,True)
  self.assertEqual(seen,[self.d.customer])
  self.assertEqual(opened,[str(pdf)])
 def test_recall_clears_approval_and_discount(self):
  self.approved();result=self.b.recall_approval(self.d.draft_id,'Price needs review')
  self.assertEqual(result['status'],'PENDING_INTERNAL_APPROVAL');self.assertEqual(result['approved_pdf_path'],'')
  self.assertEqual(Decimal(result['discount_amount']),0)
  self.assertEqual(result['approval_history'][-1]['action'],'APPROVAL_RECALLED')
  with self.assertRaises(ValueError):self.b.generate_pdf(self.d.to_dict(),True)
 def test_recall_after_po_blocked(self):
  self.approved();self.b.record_po(self.d.to_dict(),'PO-1','',{'1':'1'})
  with self.assertRaises(ValueError):self.b.recall_approval(self.d.draft_id,'Recall')
 def test_audit_visible_to_ceo_only(self):
  self.approved();self.b.demo_role='EMPLOYEE';boot=self.b.bootstrap()
  self.assertEqual(boot['platform']['auditEvents'],[])
  self.assertTrue(all(d['approval_history']==[] for d in boot['saved']))
  self.b.demo_role='CEO';self.assertTrue(self.b.bootstrap()['platform']['auditEvents'])
 def test_ceo_control_rejects_employee(self):
  with self.assertRaises(PermissionError):self.b.set_self_approval(True)
  with self.assertRaises(PermissionError):self.b.publish_terms('Changed')
 def test_corruption_preserved(self):
  self.b.store.path.write_text('{broken')
  with self.assertRaises(RuntimeError):self.b.store.save(self.d)
  self.assertEqual(self.b.store.path.read_text(),'{broken')
 def test_backup_preserves_prior_version(self):
  self.d.customer='UPDATED';self.b.store.save(self.d)
  backup=DraftStore(self.b.store.path.with_suffix('.backup.json'))
  self.assertNotEqual(backup.get(self.d.draft_id).customer,'UPDATED')
 def test_qcode_after_999(self):
  self.assertEqual(next_demo_q_code(['26QDEM999','26QDEM1000'],2026),'26QDEM1001')
 def test_po_invalid_values_do_not_mutate(self):
  self.approved()
  for values in ({'1':'-1'},{'1':'NaN'},{'1':'Infinity'},{'unknown':'1'},{'1':'9999999'}):
   before=self.d.to_dict()
   with self.assertRaises(ValueError):self.d.record_customer_po('BAD',values)
   self.assertEqual(self.d.to_dict(),before)
 def test_duplicate_item_numbers_blocked(self):
  from copy import deepcopy
  self.d.items.append(deepcopy(self.d.items[0]))
  with self.assertRaises(ValueError):self.d.validate()
 def test_invalid_pricing_blocked(self):
  for field in ['unit_price','forex_rate','markup_multiplier','duty_rate']:
   for value in ['NaN','Infinity','-1']:
    d=Snapshot2026Tracker().load('26QJCG140');setattr(d.items[0].selected(),field,Decimal(value))
    with self.assertRaises(ValueError):d.validate()
 def test_external_side_effects_disabled(self):
  with self.assertRaises(PermissionError):self.b.sync_dummy(self.d.to_dict())
  with self.assertRaises(PermissionError):self.b.send_queued_notifications()
 def test_usd_eur_php_calculation_reference(self):
  for currency,fx in [('PHP','1'),('USD','60'),('EUR','65')]:
   o=SupplierOption(id='s',currency=currency,unit_price=Decimal('100'),freight_cost=Decimal('10'),forex_rate=Decimal(fx),duty_rate=Decimal('.07'),markup_multiplier=Decimal('1.5'),safety_factor_rate=Decimal('.05'))
   i=QuotationItem('1','Valve','PC',Decimal('2'),[o],'s',macrotech_offer='Valve')
   d=QuotationDraft('test','26QDEM001','','RFQ','Customer','Buyer','','',[i])
   expected=Decimal('210')*Decimal(fx)*Decimal('1.07')*Decimal('1.05')*Decimal('1.5')
   self.assertEqual(d.totals()['total_vat_in'],expected.quantize(Decimal('.01')))
 def test_alternate_supplier_not_customer_total(self):
  from copy import deepcopy
  total=self.d.totals();alt=deepcopy(self.d.items[0].selected());alt.id='alternate';alt.unit_price=Decimal('999999')
  self.d.items[0].supplier_options.append(alt)
  self.assertEqual(self.d.totals(),total)
  rows=build_tracker_rows(self.d,self.d.q_code,self.d.draft_id)
  self.assertEqual(rows[1][1],'');self.assertEqual(rows[1][4],alt.co_sbm)
 def test_partial_po_quantity(self):
  self.approved();self.d.record_customer_po('PO-1',{'1':'1'})
  self.assertEqual(self.d.status,'CUSTOMER_PO_PARTIAL')
  self.assertEqual(self.d.items[0].accepted_quantity,1)
if __name__=='__main__':unittest.main()

class TrackerTransactionTests(unittest.TestCase):
 def test_formula_failure_rolls_back_mock_transaction(self):
  from unittest.mock import MagicMock,patch
  from macrotech_demo.tracker_io import HEADERS,FORMULA_TEMPLATES,TRACKER_TEMPLATE_VERSION,DUMMY_TRACKER_ID
  d=Snapshot2026Tracker().load('26QJCG140');d.submit_for_internal_approval()
  session=MagicMock();sheets=session.sheets.return_value;sp=sheets.spreadsheets.return_value;values=sp.values.return_value
  template=['']*52
  for col,formula in FORMULA_TEMPLATES.items():template[col]=formula.format(row=3)
  def get(**kw):
   result=MagicMock();ran=kw['range']
   if ran.endswith('A1:AZ1'):data={'values':[HEADERS]}
   elif '_PILOT_CONFIG' in ran:data={'values':[['TRACKER_TEMPLATE_VERSION',TRACKER_TEMPLATE_VERSION],['x','x'],['WRITE_POLICY','INPUT CELLS ONLY; FORMULA FAILURE BLOCKS AND ROLLS BACK']]}
   elif ran.endswith('A3:AZ3'):data={'values':[template]}
   else:data={'values':[]} # Force post-write formula verification failure.
   result.execute.return_value=data;return result
  values.get.side_effect=get
  values.batchGet.return_value.execute.return_value={'valueRanges':[{'values':[]},{'values':[]}]}
  sp.get.return_value.execute.return_value={'sheets':[{'properties':{'title':'MARK-UP','sheetId':1,'gridProperties':{'rowCount':9999}},'data':[{}]}]}
  sink=DummyTrackerSink(session)
  with patch.object(sink,'_guard'),patch.object(sink,'_template_style',return_value=([],21)),patch.object(sink,'_restore_snapshot') as restore:
   with self.assertRaisesRegex(RuntimeError,'previous rows were restored'):sink.sync(d,d.draft_id)
   restore.assert_called_once()
  self.assertEqual(sp.batchUpdate.call_args.kwargs['spreadsheetId'],DUMMY_TRACKER_ID)
  self.assertEqual(sp.batchUpdate.call_count,1)
 def test_forex_failure_and_reference_response_are_isolated(self):
  from macrotech_demo.forex import current_php_rate
  from unittest.mock import patch,MagicMock
  with patch('urllib.request.urlopen',side_effect=OSError('offline')):
   with self.assertRaisesRegex(RuntimeError,'Enter the rate manually'):current_php_rate('EUR')
  response=MagicMock();response.__enter__.return_value.read.return_value=b'{"rates":{"PHP":65.25}}'
  with patch('urllib.request.urlopen',return_value=response):
   result=current_php_rate('EUR')
  self.assertEqual(result['rate'],'65.25');self.assertTrue(result['retrievedAt'])

class ProfitWorksheetTests(unittest.TestCase):
 def test_standard_actual_arithmetic(self):
  from macrotech_demo.profit import calculate_profit
  values=dict(sale_vat_in='112000',landed_cost='60000',trucking='1000',manpower='500',gas_toll='250',other_costs='100',abc_total='2000',sr_percent='5',override_percent='1',admin_percent='1')
  r=calculate_profit(values)
  self.assertEqual(r['tracker_tax_allowance'],'13440.00')
  self.assertEqual(r['subnet'],'34710.00')
  self.assertEqual(r['admin_commission'],'347.10')
  self.assertEqual(r['net'],'32280.30')
 def test_unknown_inputs_not_assumed_zero(self):
  from macrotech_demo.profit import calculate_profit
  with self.assertRaises(ValueError):calculate_profit({})
