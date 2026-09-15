"""Regenerate synthetic, inert email and quotation samples. No service calls."""
import os, socket, sys, tempfile, shutil
from pathlib import Path
from decimal import Decimal
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[1]
sys.path[:0]=[str(ROOT),str(ROOT/'tests')]
os.environ['LOCALAPPDATA']=tempfile.mkdtemp(prefix='macrotech-samples-')
def blocked(*a,**k):raise RuntimeError('OFFLINE: network prohibited')
socket.socket.connect=blocked;socket.create_connection=blocked
from test_readiness090 import mock_draft
from macrotech_demo.email_preview import render_approval_email
from macrotech_demo.pdf_output import generate_quotation_pdf
from macrotech_demo.state_store import DEFAULT_TERMS
from pypdf import PdfReader
output=ROOT/'evidence'/'samples';output.mkdir(parents=True,exist_ok=True)
draft=mock_draft('sample-only');draft.q_code='26QDEMO001'
draft.employee_comments='OFFLINE SAMPLE — Review the offered pump and requested 5% discount.'
draft.terms_text=DEFAULT_TERMS;draft.terms_version=1
(output/'approval_email_preview.html').write_text(render_approval_email(draft),encoding='utf-8')
draft.submit_for_internal_approval();draft.approve_internally('Mock approver',Decimal('56'))
with tempfile.TemporaryDirectory() as temp, patch('macrotech_demo.pdf_output.output_root',return_value=Path(temp)):
    generated=generate_quotation_pdf(draft,final=True)
    shutil.copyfile(generated,output/'sample_quotation.pdf')
pages=PdfReader(output/'sample_quotation.pdf').pages
assert len(pages)>=2
assert 'TERMS & CONDITIONS' in pages[-1].extract_text()
text='\n'.join(page.extract_text() for page in pages)
assert 'TOTAL AFTER DISCOUNT' in text.upper()
for forbidden in ['PRIVATE SELECTED','PRIVATE ALTERNATE','SECRET NOTE']:
    assert forbidden not in text
print(f'PASS: synthetic PDF {len(pages)} pages; final Terms page, discounted total, no private suppliers. Email is inert HTML.')
