"""Isolated UI QA server. No Google calls; changes stay in a temporary directory."""
import json
import os, socket
os.environ["LOCALAPPDATA"]=__import__("tempfile").mkdtemp(prefix="mt-ui-audit-")
_original_connect=socket.socket.connect
def local_only(sock,address):
    if address[0] not in {"127.0.0.1","localhost","::1"}: raise RuntimeError("External network blocked in UI audit")
    return _original_connect(sock,address)
socket.socket.connect=local_only
import runpy
import sys
import tempfile
from pathlib import Path
from http.server import SimpleHTTPRequestHandler, HTTPServer
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from macrotech_demo.state_store import DraftStore,TermsStore
from macrotech_demo.platform_store import PlatformStore
sys.path.insert(0,str(ROOT/'tests'))
from test_readiness090 import mock_draft
Bridge=runpy.run_path(str(ROOT/'web_app.pyw'))['DesktopBridge']
folder=tempfile.TemporaryDirectory()
bridge=Bridge()
bridge.store=DraftStore(Path(folder.name)/'drafts.json')
bridge.terms=TermsStore(Path(folder.name)/'terms.json')
bridge.platform=PlatformStore(Path(folder.name)/'platform.json')
def synthetic_sample(code):
    result=mock_draft(f'sample-{code}'); result.q_code=code; return result
bridge.snapshot.load=synthetic_sample
bridge.customer_directory=[]
for i in range(3):
    d=mock_draft(f'qa-{i}')
    d.q_code=f'26QMOCK{i+1:03d}'
    d.employee_comments='Please review pricing and the requested commercial discount.'
    d.discount_requested_percent=__import__('decimal').Decimal('5')
    d.quotation_due_date='2026-09-12'
    try:d.submit_for_internal_approval()
    except ValueError:pass
    bridge.store.save(d)
class Handler(SimpleHTTPRequestHandler):
    def __init__(self,*a,**kw):super().__init__(*a,directory=str(ROOT/'dashboard/dist'),**kw)
    def do_POST(self):
        payload=json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        name=payload['name']
        try:
            if name not in {'set_demo_role','recall_approval','create_revision','platform_snapshot','bootstrap','approve_percent','create_new','submit','save_draft','self_approval_allowed','request_directory_entry','decide_directory_request','edit_directory_request','set_self_approval','approval_email_preview','reject','finish_onboarding','list_attachments','delete_draft','customer_preview'}:raise ValueError('External operation blocked in UI QA')
            result=getattr(bridge,name)(*payload['args'])
            body=json.dumps({'result':result}).encode()
        except Exception as e:body=json.dumps({'error':str(e)}).encode()
        self.send_response(200);self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(body)
HTTPServer(('127.0.0.1',8766),Handler).serve_forever()
