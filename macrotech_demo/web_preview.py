from __future__ import annotations

from html import escape
from pathlib import Path

from .domain import QuotationDraft
from .pdf_output import BUSINESS_ADDRESS, BUSINESS_CONTACT, INTRODUCTION, APPRECIATION, output_root, safe_filename
from .tracker_io import resource_path


def generate_customer_preview(draft: QuotationDraft) -> Path:
    draft.validate()
    snapshot = draft.commercial_snapshot()
    items = []
    for item in snapshot.get("lines", []):
        items.append(f"""
        <article class="item">
          <div class="item-no">{escape(str(item.get('item_no', '')))}</div>
          <section class="requirement"><span>Buyer Requirements</span><p>{escape(str(item.get('description', ''))).replace(chr(10), '<br>')}</p></section>
          <section class="offer"><span>Macrotech Offer</span><p>{escape(str(item.get('macrotech_offer', ''))).replace(chr(10), '<br>')}</p><small>Delivery: {escape(str(item.get('delivery', '')))}</small></section>
          <div class="commercial"><small>{escape(str(item.get('quantity', '')))} {escape(str(item.get('uom', '')))}</small><strong>PHP {float(item.get('line_vat_ex', 0)):,.2f}</strong><em>PHP {float(item.get('unit_vat_ex', 0)):,.2f} / {escape(str(item.get('uom', '')))}</em></div>
        </article>""")
    totals = draft.totals()
    discount_rows = ""
    if totals["discount"] > 0:
        discount_rows = f'<tr><td>LESS: APPROVED DISCOUNT</td><td class="num">- PHP {totals["discount"]:,.2f}</td></tr><tr class="grand"><td>FINAL TOTAL</td><td class="num">PHP {totals["final_total"]:,.2f}</td></tr>'
    logo_uri = resource_path("assets/macrotech_full_logo.jpg").resolve().as_uri()
    css = """
:root{--green:#1e633b;--pale:#edf5f0;--ink:#202421;--muted:#68716b;--line:#d9dedb}*{box-sizing:border-box}body{font-family:Segoe UI,Arial,sans-serif;color:var(--ink);background:#eef1ef;margin:0}main{max-width:1120px;margin:24px auto;background:white;padding:38px;box-shadow:0 8px 30px #cdd3cf}header{text-align:center;border-bottom:3px solid var(--green);padding-bottom:14px}header .logo{width:min(430px,80%);aspect-ratio:16/9;object-fit:contain;display:block;margin:-70px auto -70px}header .contact{font-size:12px;line-height:1.55}header h1{margin:15px 0 0;font-size:31px}.intro{margin:18px 0 12px}.prepared{display:grid;grid-template-columns:1fr 290px;border:1px solid var(--line);margin:24px 0;padding:20px;gap:20px}.label,.item section>span{display:block;text-transform:uppercase;letter-spacing:.12em;color:var(--green);font-size:11px;font-weight:800}.customer{font-size:25px;font-weight:800;margin:5px 0}.rfq{font-size:19px;font-weight:750;margin-top:5px}.meta{display:grid;grid-template-columns:1fr 1fr;border:1px solid var(--line)}.meta div{padding:8px;border-bottom:1px solid var(--line)}.meta small{display:block;color:var(--muted)}.item{display:grid;grid-template-columns:44px 1fr 1fr 170px;border:1px solid var(--line);margin-bottom:13px}.item-no{font-size:18px;font-weight:800;padding:17px 10px;background:var(--pale);color:var(--green)}.item section{padding:16px}.requirement{background:#f5f6f5}.offer{border-left:3px solid var(--green)}.item p{line-height:1.48;margin:7px 0}.offer small{color:var(--muted)}.commercial{padding:16px;text-align:right;border-left:1px solid var(--line)}.commercial small,.commercial em{display:block;color:var(--muted);font-style:normal}.commercial strong{display:block;font-size:17px;margin:10px 0 4px}.totals{margin:22px 0 0 auto;width:390px;border-collapse:collapse}.totals td{padding:9px;border-bottom:1px solid var(--line)}.num{text-align:right}.totals .grand{font-size:18px;font-weight:800;color:var(--green);border:2px solid var(--green)}.next-step{width:390px;margin:10px 0 0 auto;padding:12px;border:1px solid var(--line);background:var(--pale)}.appreciation{width:390px;margin:8px 0 0 auto;line-height:1.45}.privacy{margin-top:28px;padding-top:12px;border-top:1px solid var(--line);color:var(--muted);font-size:12px}@media(max-width:800px){main{margin:0;padding:20px}.prepared{grid-template-columns:1fr}.item{grid-template-columns:38px 1fr}.item section,.commercial{grid-column:2}.offer,.commercial{border-left:0;border-top:1px solid var(--line)}}@media print{body{background:white}main{box-shadow:none;margin:0}}
"""
    html = f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Macrotech Quotation {escape(draft.q_code)} {escape(draft.revision)}</title><style>
{css}
 </style></head><body><main><header><img class="logo" src="{logo_uri}" alt="Macrotech Industrial Trading"><div class="contact">{BUSINESS_ADDRESS}<br>{BUSINESS_CONTACT}</div><h1>QUOTATION</h1></header>
<section class="prepared"><div><span class="label">Prepared for</span><div class="customer">{escape(str(snapshot.get('customer') or draft.customer))}</div>{f'<div>Billing address: {escape(str(snapshot.get("billing_address")))}</div>' if snapshot.get('billing_address') else ''}{f'<div>Delivery address: {escape(str(snapshot.get("delivery_address")))}</div>' if snapshot.get('delivery_address') else ''}{f'<div>TIN: {escape(str(snapshot.get("customer_tin")))}</div>' if snapshot.get('customer_tin') else ''}<div>Attention: {escape(str(snapshot.get('buyer') or draft.buyer or 'Not provided'))}{f' &lt;{escape(str(snapshot.get("buyer_email")))}&gt;' if snapshot.get('buyer_email') else ''}</div><br><span class="label">In response to your RFQ / PR</span><div class="rfq">{escape(str(snapshot.get('rfq_reference') or draft.rfq_reference or 'Not provided'))}</div></div><div class="meta"><div><small>Q Code</small><b>{escape(draft.q_code)}</b></div><div><small>Revision</small><b>{escape(draft.revision)}</b></div><div><small>Status</small>{escape(draft.status.replace('_',' ').title())}</div><div><small>Terms</small>Version {draft.terms_version}</div></div></section>
<p class="intro">{INTRODUCTION}</p>
{''.join(items)}
<table class="totals"><tr><td>TOTAL VATABLE AMOUNT</td><td class="num">PHP {totals['subtotal_vat_ex']:,.2f}</td></tr><tr><td>VAT AMOUNT - 12%</td><td class="num">PHP {totals['vat']:,.2f}</td></tr><tr class="grand"><td>GRAND TOTAL</td><td class="num">PHP {totals['grand_total_before_discount']:,.2f}</td></tr>{discount_rows}</table>
<div class="next-step"><b>NEXT STEP</b><br>To proceed, please issue your Purchase Order referencing <b>{escape(draft.q_code)}</b>.</div><p class="appreciation">{APPRECIATION}</p>
<div class="privacy">Prepared specifically for {escape(draft.customer)}. Supplier identities, costs, comparisons, CO SBM, margins, forex, and internal notes are excluded.</div>
</main></body></html>"""
    folder = output_root() / "Preview" / safe_filename(draft.q_code)
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / f"CUSTOMER PREVIEW {safe_filename(draft.q_code)} - {safe_filename(draft.revision)}.html"
    path.write_text(html, encoding="utf-8")
    return path
