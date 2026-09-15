"""Pure HTML preview. No credentials, network, delivery, or approval mutations."""
import base64
from decimal import Decimal
from html import escape
from .domain import QuotationDraft, decimal_value, money
from .tracker_io import resource_path


def render_approval_email(draft: QuotationDraft) -> str:
    totals = draft.totals()
    snapshot = draft.commercial_snapshot()
    grand = totals['grand_total_before_discount']
    approved = draft.discount_status == 'APPROVED'
    rate = draft.discount_approved_percent if approved else draft.discount_requested_percent
    discount = totals['discount'] if approved else money(grand * rate / Decimal('100'))
    final = money(grand - discount)
    def amount(value): return f'PHP {value:,.2f}'
    def row(label, value):
        return f'<tr><th>{escape(label)}</th><td>{escape(str(value))}</td></tr>'
    details = ''.join(row(label, value) for label, value in (
        ('Q-Code', snapshot.get('q_code', draft.q_code)), ('Revision', snapshot.get('revision', draft.revision)),
        ('Customer', snapshot.get('customer', draft.customer)), ('RFQ / PR', snapshot.get('rfq_reference', draft.rfq_reference)),
        ('Prepared by', snapshot.get('prepared_by', draft.prepared_by)),
        ('Line items', snapshot.get('line_count', len(draft.items))), ('Subtotal VAT-ex', amount(totals['subtotal_vat_ex'])),
        ('VAT · 12%', amount(totals['vat'])), ('Grand Total', amount(grand))))
    lines = snapshot.get('lines') or []
    def factor(key, suffix='', scale=Decimal('1')):
        values = sorted({str(decimal_value(line.get(key)) * scale) for line in lines})
        return (values[0] + suffix) if len(values) == 1 else ('Varies by item' if values else 'Not available')
    details += ''.join(row(label, value) for label, value in (
        ('Mark-Up', factor('markup_multiplier', '×')),
        ('Duties / forwarder rate', factor('duty_rate', '%', Decimal('100'))),
        ('Safety Factor', factor('safety_factor_rate', '%', Decimal('100'))),
    ))
    discount_rows = ''
    if discount > 0:
        discount_rows = row('Approved discount' if approved else 'Requested discount · pending approval', f'{rate}% · {amount(discount)}')
        discount_rows += row('Total After Discount' if approved else 'Total After Discount · if approved', amount(final))
    logo_path = resource_path('assets/macrotech_full_logo.jpg')
    logo = f"data:image/jpeg;base64,{base64.b64encode(logo_path.read_bytes()).decode('ascii')}" if logo_path.exists() else ''
    return f'''<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Macrotech approval email · Preview only</title><style>
*{{box-sizing:border-box}}body{{margin:0;background:#f3f6f7;color:#17212b;font:15px 'Segoe UI',Arial,sans-serif}}
.shell{{max-width:660px;margin:24px auto;background:white;border:1px solid #dfe5e9;border-radius:13px;overflow:hidden}}
header{{background:white;text-align:center;padding:10px 24px;border-bottom:3px solid #138a42}}header img{{width:330px;max-width:80%;aspect-ratio:16/9;object-fit:contain;margin:-52px auto;display:block}}header small{{display:block;color:#405047;letter-spacing:.08em;margin:4px 0 8px}}
main{{padding:24px}}h1{{font-size:26px;margin:12px 0}}.eyebrow{{color:#138a42;font-size:11px;letter-spacing:.14em;text-transform:uppercase}}
.notice{{padding:12px;background:#fff5df;border-radius:8px;color:#785200;font-size:13px}}
.total{{background:#eaf7ef;padding:18px;border-radius:10px;margin:18px 0}}.total strong{{display:block;font-size:30px;color:#0e6c34;margin-top:8px}}
table{{border-collapse:collapse;width:100%;margin:18px 0}}th,td{{padding:10px 4px;border-bottom:1px solid #dfe5e9;text-align:left;vertical-align:top;overflow-wrap:anywhere}}th{{width:45%;color:#66727f;font-size:13px;font-weight:500}}
.actions a{{display:inline-block;text-decoration:none;border-radius:8px;padding:13px 18px;margin:5px 8px 5px 0;border:1px solid #bdc8ce;color:#17212b;font-weight:650}}
.actions .approve{{background:#138a42;color:white;border-color:#138a42}}.actions .reject{{color:#a82b35;border-color:#e0b6ba}}
.muted{{color:#66727f;font-size:12px;line-height:1.6}}.comment{{white-space:pre-wrap;overflow-wrap:anywhere;background:#f5f7f5;padding:14px;border-radius:8px}}
@media(max-width:480px){{.shell{{margin:0;border-radius:0}}main,header{{padding:18px}}.actions a{{display:block;text-align:center;margin:10px 0}}.total strong{{font-size:26px}}}}
</style></head><body><div class="shell"><header>{f'<img src="{logo}" alt="Macrotech Industrial Trading">' if logo else '<b>MACROTECH INDUSTRIAL TRADING</b>'}<small>QUOTATION PLATFORM · INTERNAL APPROVAL</small></header>
<main><div class="notice">OFFLINE PREVIEW · Nothing has been sent. Buttons cannot approve or reject.</div>
<p class="eyebrow">Internal quotation review</p><h1>Approval required</h1>
<div class="total">{'Total After Discount · if approved' if discount > 0 and not approved else 'Final total'}<strong>{amount(final)}</strong></div>
<table>{details}{discount_rows}</table><p class="comment">{escape(draft.employee_comments or 'No additional comments.')}</p>
<div class="actions"><a class="approve" href="#preview-only">Approve</a><a class="reject" href="#preview-only">Reject</a><a href="#preview-only">View Approval Record</a></div>
<p class="muted" id="preview-only">In the connected application, these actions open the signed-in approval record. Opening an email link never records a decision. The server checks the assigned approver, revision and policy before a separate confirmation. Reject means return for correction, not customer PO cancellation.</p>
<p class="muted">Internal approval is separate from customer purchase-order acceptance. Supplier comparisons remain internal and are excluded from customer documents.</p></main></div></body></html>'''
