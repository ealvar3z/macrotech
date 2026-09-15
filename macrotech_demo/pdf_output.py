from __future__ import annotations

import os
from datetime import date
from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import legal
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import Image, KeepTogether, PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from .domain import QuotationDraft
from .state_store import DEFAULT_TERMS
from .tracker_io import resource_path


INK = colors.HexColor("#202421")
MID = colors.HexColor("#667069")
LIGHT = colors.HexColor("#D9DEDB")
PALE = colors.HexColor("#F4F7F5")
GREEN = colors.HexColor("#1E633B")
GREEN_PALE = colors.HexColor("#EDF5F0")

BUSINESS_ADDRESS = "#5 Roseberg Res. Santiago St. Manuyo Dos<br/>Las Piñas City, Philippines 1744"
BUSINESS_CONTACT = "+63 917 114 0582 &nbsp;|&nbsp; www.macrotech-industrial.com &nbsp;|&nbsp; info@macrotech-industrial.com"
INTRODUCTION = "We are pleased to present our offer for your review and evaluation."
APPRECIATION = "We appreciate the opportunity to support your requirement and look forward to receiving your valued order."
ORDER_CANCELLATION = (
    "Once a Purchased Order has been accepted, the Client may only cancel the Order under an agreement reached with "
    "MACROTECH INDUSTRIAL TRADING on the conditions for such total or partial cancellation.\n\n"
    "On cancellation or revocation of an Order by the Client, the Client shall compensate MACROTECH INDUSTRIAL TRADING "
    "for full amount indicated in the purchase order and damages caused to be determine by the court in Las Pinas City Philippines."
)


def output_root() -> Path:
    base = Path.home() / "Documents" if os.name == "nt" else Path.cwd()
    path = base / "Macrotech Quotations"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _styles():
    base = getSampleStyleSheet()
    return {
        "quote_title": ParagraphStyle("quote_title", parent=base["Normal"], fontName="Helvetica-Bold", fontSize=17, leading=19, alignment=TA_CENTER, textColor=INK),
        "label": ParagraphStyle("label", parent=base["Normal"], fontName="Helvetica-Bold", fontSize=7.2, leading=8.5, textColor=GREEN, spaceAfter=2),
        "customer": ParagraphStyle("customer", parent=base["Normal"], fontName="Helvetica-Bold", fontSize=16, leading=18, textColor=INK),
        "rfq": ParagraphStyle("rfq", parent=base["Normal"], fontName="Helvetica-Bold", fontSize=12, leading=14, textColor=INK),
        "body": ParagraphStyle("body", parent=base["Normal"], fontName="Helvetica", fontSize=8.2, leading=10.5, textColor=INK),
        "body_bold": ParagraphStyle("body_bold", parent=base["Normal"], fontName="Helvetica-Bold", fontSize=8.2, leading=10.5, textColor=INK),
        "small": ParagraphStyle("small", parent=base["Normal"], fontName="Helvetica", fontSize=7.4, leading=9.2, textColor=INK),
        "small_green": ParagraphStyle("small_green", parent=base["Normal"], fontName="Helvetica-Bold", fontSize=7.4, leading=9.2, textColor=GREEN),
        "right": ParagraphStyle("right", parent=base["Normal"], fontName="Helvetica", fontSize=8, leading=10, alignment=TA_RIGHT, textColor=INK),
        "right_bold": ParagraphStyle("right_bold", parent=base["Normal"], fontName="Helvetica-Bold", fontSize=8.4, leading=10.5, alignment=TA_RIGHT, textColor=INK),
        "terms_title": ParagraphStyle("terms_title", parent=base["Normal"], fontName="Helvetica-Bold", fontSize=16, leading=19, alignment=TA_CENTER, textColor=INK),
        "terms_intro": ParagraphStyle("terms_intro", parent=base["Normal"], fontName="Helvetica", fontSize=10.5, leading=14, alignment=TA_CENTER, textColor=MID, spaceAfter=20),
        "term": ParagraphStyle("term", parent=base["Normal"], fontName="Helvetica", fontSize=7.7, leading=10.2, spaceAfter=6, textColor=INK),
        "brand_subtitle": ParagraphStyle("brand_subtitle", parent=base["Normal"], fontName="Helvetica-Bold", fontSize=8.3, leading=9, alignment=TA_CENTER, textColor=INK),
        "brand_contact": ParagraphStyle("brand_contact", parent=base["Normal"], fontName="Helvetica", fontSize=7.3, leading=9.2, alignment=TA_CENTER, textColor=INK),
        "intro": ParagraphStyle("intro", parent=base["Normal"], fontName="Helvetica", fontSize=8.5, leading=11, alignment=TA_LEFT, textColor=INK),
        "next_step": ParagraphStyle("next_step", parent=base["Normal"], fontName="Helvetica", fontSize=8, leading=10.5, textColor=INK),
        "cancellation": ParagraphStyle("cancellation", parent=base["Normal"], fontName="Helvetica", fontSize=6.5, leading=8.2, textColor=INK),
    }


def _p(value: object, style) -> Paragraph:
    return Paragraph(escape(str(value or "")).replace("\n", "<br/>"), style)


def _page_marks(canvas, doc, draft: QuotationDraft, final: bool) -> None:
    width, height = legal
    canvas.saveState()
    canvas.setStrokeColor(LIGHT)
    canvas.line(.34 * inch, .36 * inch, width - .34 * inch, .36 * inch)
    canvas.setFillColor(MID)
    canvas.setFont("Helvetica", 6.5)
    canvas.drawString(.36 * inch, .20 * inch, f"MACROTECH INDUSTRIAL TRADING | {draft.q_code} | {draft.revision}")
    canvas.drawRightString(width - .36 * inch, .20 * inch, f"Page {doc.page}")
    if not final:
        canvas.setFillColor(colors.HexColor("#D8D8D8"))
        canvas.setFont("Helvetica-Bold", 26)
        canvas.translate(width / 2, height / 2)
        canvas.rotate(35)
        canvas.drawCentredString(0, 0, "DRAFT - NOT FOR CUSTOMER RELEASE")
    canvas.restoreState()


def _brand_block(styles: dict, width: float = 3.70 * inch):
    logo = resource_path("assets/macrotech_full_logo.jpg")
    if not logo.exists():
        return Paragraph("MACROTECH INDUSTRIAL TRADING", styles["terms_title"])
    return Image(str(logo), width=width, height=width * 9 / 16, hAlign="CENTER")


def _corporate_header(styles: dict, title: str) -> list:
    contact = Paragraph(f"{BUSINESS_ADDRESS}<br/>{BUSINESS_CONTACT}", styles["brand_contact"])
    rule = Table([[""]], colWidths=[7.7 * inch], rowHeights=[2])
    rule.setStyle(TableStyle([("LINEBELOW", (0, 0), (-1, -1), 1.1, GREEN)]))
    return [_brand_block(styles), Spacer(1, -20), contact, Spacer(1, 7), rule, Spacer(1, 5), Paragraph(title, styles["quote_title"]), Spacer(1, 8)]


def _terms_story(draft: QuotationDraft, styles: dict) -> list:
    paragraphs = [part.strip() for part in (draft.terms_text or DEFAULT_TERMS).strip().split("\n\n") if part.strip()]
    story = [PageBreak(), *_corporate_header(styles, "TERMS &amp; CONDITIONS"), Paragraph(f"Quotation {escape(draft.q_code)} - Revision {escape(draft.revision)} | Terms version {draft.terms_version}", styles["terms_intro"])]
    for paragraph in paragraphs:
        heading, sep, body = paragraph.partition("\n")
        if sep:
            rendered = f"<b>{escape(heading)}</b><br/>{escape(body)}"
        else:
            first, dot, rest = paragraph.partition(". ")
            rendered = f"<b>{escape(first)}.</b> {escape(rest)}" if dot and first[:1].isdigit() else escape(paragraph)
        story.append(Paragraph(rendered, styles["term"]))
    story.extend([Spacer(1, 5), Table([[Paragraph("Macrotech Industrial Trading", styles["body_bold"]), Paragraph("Customer acknowledgement is established through an accepted purchase order.", styles["right"]) ]], colWidths=[2.6 * inch, 5.1 * inch], style=TableStyle([("LINEABOVE", (0, 0), (-1, 0), .5, LIGHT), ("TOPPADDING", (0, 0), (-1, -1), 6)]))])
    return story


def safe_filename(value):
    import re
    return re.sub(r'[<>:"/\\|?*\x00-\x1f]', '_', str(value)).strip(" .")[:90] or "quotation"


def generate_quotation_pdf(draft: QuotationDraft, final: bool = False) -> Path:
    draft.validate()
    if final and draft.status not in {"INTERNALLY_APPROVED", "CUSTOMER_PO_PARTIAL", "CUSTOMER_PO_ACCEPTED"}:
        raise ValueError("A customer-facing final PDF requires internal Macrotech approval.")
    styles = _styles()
    root = output_root() / ("Approved Quotations" if final else "Draft Quotations") / safe_filename(draft.q_code)
    root.mkdir(parents=True, exist_ok=True)
    state = "INTERNALLY-APPROVED" if final else "DRAFT"
    candidate = root / f"QUOTATION {safe_filename(draft.q_code)} {safe_filename(draft.customer)} - {safe_filename(draft.revision)} - {state}.pdf"
    counter = 2
    while candidate.exists():
        candidate = root / f"QUOTATION {safe_filename(draft.q_code)} {safe_filename(draft.customer)} - {safe_filename(draft.revision)} - {state} ({counter}).pdf"
        counter += 1

    story: list = _corporate_header(styles, "QUOTATION")
    snapshot = draft.commercial_snapshot()

    customer_lines = [Paragraph("PREPARED FOR", styles["label"]), Paragraph(escape(str(snapshot.get("customer") or draft.customer)), styles["customer"])]
    if snapshot.get("billing_address"):
        customer_lines.append(Paragraph(f"Billing address: {escape(str(snapshot['billing_address']))}", styles["body"]))
    if snapshot.get("delivery_address"):
        customer_lines.append(Paragraph(f"Delivery address: {escape(str(snapshot['delivery_address']))}", styles["body"]))
    if snapshot.get("customer_tin"):
        customer_lines.append(Paragraph(f"TIN: {escape(str(snapshot['customer_tin']))}", styles["body"]))
    buyer_text = escape(str(snapshot.get("buyer") or draft.buyer or "Not provided"))
    if snapshot.get("buyer_email"):
        buyer_text += f" &lt;{escape(str(snapshot['buyer_email']))}&gt;"
    prepared_for = [*customer_lines, Paragraph(f"Attention: {buyer_text}", styles["body"]), Spacer(1, 7), Paragraph("IN RESPONSE TO YOUR RFQ / PR", styles["label"]), Paragraph(escape(str(snapshot.get("rfq_reference") or draft.rfq_reference or "Not provided")), styles["rfq"])]
    meta = Table([
        [_p("Macrotech Q Code", styles["label"]), _p(draft.q_code, styles["body_bold"])],
        [_p("Revision", styles["label"]), _p(draft.revision, styles["body_bold"])],
        [_p("Quotation date", styles["label"]), _p(date.today().isoformat(), styles["body"])],
        [_p("Validity", styles["label"]), _p("30 calendar days", styles["body"])],
        [_p("Payment", styles["label"]), _p("30 calendar days", styles["body"])],
    ], colWidths=[1.18 * inch, 1.52 * inch])
    meta.setStyle(TableStyle([("GRID", (0, 0), (-1, -1), .35, LIGHT), ("VALIGN", (0, 0), (-1, -1), "TOP"), ("BACKGROUND", (0, 0), (0, -1), PALE), ("LEFTPADDING", (0, 0), (-1, -1), 5), ("RIGHTPADDING", (0, 0), (-1, -1), 5), ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4)]))
    customer_box = Table([[prepared_for, meta]], colWidths=[4.95 * inch, 2.75 * inch])
    customer_box.setStyle(TableStyle([("BOX", (0, 0), (-1, -1), .7, LIGHT), ("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (0, 0), 10), ("RIGHTPADDING", (0, 0), (0, 0), 10), ("TOPPADDING", (0, 0), (-1, -1), 9), ("BOTTOMPADDING", (0, 0), (-1, -1), 9)]))
    story.extend([customer_box, Spacer(1, 9), Paragraph(INTRODUCTION, styles["intro"]), Spacer(1, 8)])

    rows = [[_p("ITEM", styles["small_green"]), _p("BUYER REQUIREMENTS", styles["small_green"]), _p("MACROTECH OFFER", styles["small_green"]), _p("QTY", styles["small_green"]), _p("UOM", styles["small_green"]), _p("UNIT PRICE\nVAT-EX", styles["small_green"]), _p("AMOUNT\nVAT-EX", styles["small_green"])]]
    row_commands = []
    for item in snapshot.get("lines", []):
        offer = f"{item.get('macrotech_offer', '')}\n\nDelivery: {item.get('delivery', '')}"
        row_index = len(rows)
        rows.append([_p(item.get("item_no"), styles["body_bold"]), _p(item.get("description"), styles["small"]), _p(offer, styles["small"]), _p(item.get("quantity"), styles["right"]), _p(item.get("uom"), styles["body"]), _p(f"PHP {float(item.get('unit_vat_ex', 0)):,.2f}", styles["right"]), _p(f"PHP {float(item.get('line_vat_ex', 0)):,.2f}", styles["right_bold"])])
        row_commands.extend([("BACKGROUND", (0, row_index), (1, row_index), PALE), ("LINEBELOW", (0, row_index), (-1, row_index), .7, LIGHT), ("LINEBEFORE", (2, row_index), (2, row_index), 1.0, GREEN)])
    items = Table(rows, colWidths=[.44 * inch, 2.00 * inch, 2.13 * inch, .42 * inch, .44 * inch, 1.08 * inch, 1.18 * inch], repeatRows=1)
    items.setStyle(TableStyle([("BOX", (0, 0), (-1, -1), .55, LIGHT), ("LINEBELOW", (0, 0), (-1, 0), 1.0, GREEN), ("BACKGROUND", (0, 0), (-1, 0), GREEN_PALE), ("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 4), ("RIGHTPADDING", (0, 0), (-1, -1), 4), ("TOPPADDING", (0, 0), (-1, 0), 6), ("BOTTOMPADDING", (0, 0), (-1, 0), 6), ("TOPPADDING", (0, 1), (-1, -1), 7), ("BOTTOMPADDING", (0, 1), (-1, -1), 8)] + row_commands))
    story.extend([items, Spacer(1, 10)])

    totals = draft.totals()
    total_rows = [[_p("TOTAL VATABLE AMOUNT", styles["right"]), _p(f"PHP {totals['subtotal_vat_ex']:,.2f}", styles["right"])], [_p("VAT AMOUNT - 12%", styles["right"]), _p(f"PHP {totals['vat']:,.2f}", styles["right"])], [_p("GRAND TOTAL", styles["right_bold"]), _p(f"PHP {totals['grand_total_before_discount']:,.2f}", styles["right_bold"])]]
    if totals["discount"] > 0:
        total_rows.extend([[_p("LESS: APPROVED DISCOUNT", styles["right"]), _p(f"- PHP {totals['discount']:,.2f}", styles["right"])], [_p("TOTAL AFTER DISCOUNT", styles["right_bold"]), _p(f"PHP {totals['final_total']:,.2f}", styles["right_bold"])]])
    highlight_row = len(total_rows) - 1
    totals_table = Table(total_rows, colWidths=[2.70 * inch, 1.55 * inch], hAlign="RIGHT")
    totals_table.setStyle(TableStyle([("LINEABOVE", (0, 0), (-1, 0), .45, LIGHT), ("BOX", (0, highlight_row), (-1, highlight_row), .9, GREEN), ("BACKGROUND", (0, highlight_row), (-1, highlight_row), GREEN_PALE), ("LEFTPADDING", (0, 0), (-1, -1), 6), ("RIGHTPADDING", (0, 0), (-1, -1), 6), ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4)]))
    next_step = Table([[Paragraph("<b>NEXT STEP</b>", styles["next_step"]), Paragraph(f"To proceed, please issue your Purchase Order referencing <b>{escape(draft.q_code)}</b>.", styles["next_step"])]], colWidths=[.72 * inch, 3.53 * inch], hAlign="RIGHT")
    next_step.setStyle(TableStyle([("BOX", (0, 0), (-1, -1), .6, LIGHT), ("BACKGROUND", (0, 0), (-1, -1), PALE), ("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 7), ("RIGHTPADDING", (0, 0), (-1, -1), 7), ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6)]))
    appreciation = Paragraph(APPRECIATION, styles["next_step"])
    story.extend([totals_table, Spacer(1, 7), next_step, Spacer(1, 5), appreciation, Spacer(1, 11)])
    approval = f"Electronically approved by {draft.internal_approver}" if final else "Pending internal Macrotech approval"
    signature = Table([[_p("PREPARED BY", styles["label"]), _p("INTERNAL APPROVAL", styles["label"])], [_p(draft.prepared_by, styles["body"]), _p(approval, styles["body"])]], colWidths=[3.85 * inch, 3.85 * inch])
    signature.setStyle(TableStyle([("LINEABOVE", (0, 0), (-1, 0), .45, LIGHT), ("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 4), ("TOPPADDING", (0, 0), (-1, -1), 6)]))
    cancellation = Paragraph(f"<b>ORDER CANCELLATION:</b><br/>{escape(ORDER_CANCELLATION).replace(chr(10), '<br/>')}", styles["cancellation"])
    story.extend([signature, Spacer(1, 9), KeepTogether([cancellation])])
    story.extend(_terms_story(draft, styles))

    doc = SimpleDocTemplate(str(candidate), pagesize=legal, leftMargin=.32 * inch, rightMargin=.32 * inch, topMargin=.34 * inch, bottomMargin=.48 * inch, title=f"Macrotech Quotation {draft.q_code}", author="Macrotech Industrial Trading")
    doc.build(story, onFirstPage=lambda c, d: _page_marks(c, d, draft, final), onLaterPages=lambda c, d: _page_marks(c, d, draft, final))
    if not candidate.exists() or candidate.stat().st_size < 1500:
        raise RuntimeError("PDF generation did not produce a valid file.")
    return candidate
