from __future__ import annotations

import json
import os
import sys
import webbrowser
import re
from datetime import date, datetime, timedelta
from decimal import Decimal
from pathlib import Path
from typing import Any

from .domain import QuotationDraft, SupplierOption, decimal_value, draft_from_tracker_rows, text


LIVE_TRACKER_ID = "1EO_bXeuM0X42nmMAzfVdaBFb1KyKQkq56Vmk6ukhCYY"
DUMMY_TRACKER_ID = "1x0rBTW1uhdQqwR9nNjduqEQOXvDEw5O3IybbW2lA0M8"
TRACKER_TAB = "MARK-UP"
TEMPLATE_ROW = 3
FIRST_WRITE_ROW = 6
TRACKER_TEMPLATE_VERSION = "2026-TR-MARK-UP-v1-2026-09-12"
CONFIG_TAB = "_PILOT_CONFIG"

SCOPES = [
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive.metadata.readonly",
]

HEADERS = [
    "NO.", "ITEM NO.", "DESCRIPTION / RFQ ", "OUR OFFER", "CO SBM",
    "QUOTATION DUE DATE", "MACROTECH Q-CODE 23QMBC", "DAY OF OFFER TO CUSTOMER",
    "RFQ/PR REFERENCE NO.", "COMPANY / CUSTOMER / TIN No.", "BUYER / EMAIL",
    "SUPPLIER / EMAIL ADDRESS", "UOM", "QTY", "UNIT PRICE (USD/EUR/ETC)",
    "SUB-TOTAL (USD/EUR/ETC)", "FREIGHT COST", "PACKING", "BANK CHARGES",
    "OTHER CHARGES", "TOTAL IN (USD/EUR/ETC)", "SUPPLIER DEL PD.",
    "FOREX TODAY +4 OR +2", "DUTIABLE VALUE IN PHP", "DT%",
    "FORWARDER & DT IN PHP", "SUB-TOTAL", "5% SAFETY FACTOR",
    "TLC OR TOTAL LOCAL PURCHASE VATIN", "MARK-UP", "TOTAL IN QUOTATION (P.O) VAT-IN",
    "TOTAL VAT-EX", "VAT-IN PER/PC", "PRICE TO OFFER VAT-EX PER/PC",
    "MACROTECH DEL PD.", "GP", "MINUS 12% TAX ", "B.CODE", "ABC %",
    "total B-code", "E.CODE", "ABC %", "total E-code", "TOTAL %",
    "TOTAL ABC PHP", "PAID ABC?", "SUBNET - PROFIT", "AWARD TO MACRO",
    "PO NUMBER", "SR CODE", "MARK UP REMARKS", "ADDITIONAL REMARKS",
]

INPUT_BLOCKS = ((0, 15), (16, 20), (21, 23), (24, 25), (29, 30), (34, 35), (37, 39), (40, 42), (47, 52))

# These cells are calculated by the verified formula template in Dummy row 3.
# AB and AC are intentionally handled separately because Macrotech's existing
# process permits a conditional safety-factor formula and a local/override cost
# basis in those two columns.
FORMULA_TEMPLATES = {
    15: "=N{row}*O{row}",
    20: "=SUM(P{row}:T{row})",
    23: "=U{row}*W{row}",
    25: "=X{row}*Y{row}",
    26: "=X{row}+Z{row}",
    28: "=AA{row}+AB{row}",
    30: "=AC{row}*AD{row}",
    31: "=AE{row}/1.12",
    32: "=AE{row}/N{row}",
    33: "=AF{row}/N{row}",
    35: "=AE{row}-AC{row}",
    36: "=AE{row}*0.12",
    39: "=AF{row}*AM{row}",
    42: "=AF{row}*AP{row}",
    43: "=AM{row}+AP{row}",
    44: "=AN{row}+AQ{row}",
    45: "=VLOOKUP(A{row},ACTUAL!A:AX,50,false)",
    46: "=AJ{row}-AK{row}-AS{row}",
}


def resource_path(relative: str) -> Path:
    root = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parents[1]))
    return root / relative


def app_data_dir() -> Path:
    base = Path(os.environ.get("LOCALAPPDATA", Path.home() / ".macrotech-demo"))
    path = base / "Macrotech" / "Quotation Pilot Review v0.10.0"
    path.mkdir(parents=True, exist_ok=True)
    return path


def extract_sheet_id(value: str) -> str:
    raw = str(value or "").strip()
    match = re.search(r"/spreadsheets/d/([A-Za-z0-9_-]{20,100})", raw)
    sheet_id = match.group(1) if match else raw
    if not re.fullmatch(r"[A-Za-z0-9_-]{20,100}", sheet_id):
        raise ValueError("Paste a valid Google Sheets link or spreadsheet ID.")
    return sheet_id


class GoogleSession:
    def __init__(self, credentials_path: Path | None = None):
        self.credentials_path = credentials_path or app_data_dir() / "credentials.json"
        self._creds = None
        self._sheets = None
        self._drive = None

    def available(self) -> bool:
        return self.credentials_path.exists()

    def _credentials(self):
        if self._creds is not None and getattr(self._creds, "valid", False):
            return self._creds
        try:
            from google.auth.transport.requests import Request
            from google.oauth2.credentials import Credentials
            from google_auth_oauthlib.flow import InstalledAppFlow
        except ImportError as exc:
            raise RuntimeError("Google support is unavailable in this build.") from exc
        if not self.credentials_path.exists():
            raise FileNotFoundError("Pilot credentials.json was not found beside the application.")
        token = app_data_dir() / "google_token.json"
        creds = None
        if token.exists():
            try:
                creds = Credentials.from_authorized_user_file(str(token), SCOPES)
                if not creds.has_scopes(SCOPES):
                    creds = None
            except Exception:
                creds = None
        if creds and creds.expired and creds.refresh_token:
            try:
                creds.refresh(Request())
            except Exception:
                creds = None
        if not creds or not creds.valid:
            flow = InstalledAppFlow.from_client_secrets_file(str(self.credentials_path), SCOPES)
            creds = flow.run_local_server(port=0, prompt="select_account consent")
            token.write_text(creds.to_json(), encoding="utf-8")
        self._creds = creds
        return creds

    def sheets(self):
        if self._sheets is None:
            from googleapiclient.discovery import build
            self._sheets = build("sheets", "v4", credentials=self._credentials(), cache_discovery=False)
        return self._sheets

    def drive(self):
        if self._drive is None:
            from googleapiclient.discovery import build
            self._drive = build("drive", "v3", credentials=self._credentials(), cache_discovery=False)
        return self._drive

    def assert_live_is_read_only(self) -> None:
        metadata = self.drive().files().get(fileId=LIVE_TRACKER_ID, fields="id,name,capabilities(canEdit,canModifyContent)").execute()
        capabilities = metadata.get("capabilities") or {}
        if capabilities.get("canEdit") or capabilities.get("canModifyContent"):
            raise RuntimeError("Safety stop: the signed-in account has edit capability on the live 2026 Tracker. Use the approved view-only account.")

    def signed_in_email(self) -> str:
        import urllib.request
        token = getattr(self._credentials(), "token", "")
        request = urllib.request.Request("https://www.googleapis.com/oauth2/v2/userinfo", headers={"Authorization": f"Bearer {token}"})
        with urllib.request.urlopen(request, timeout=20) as response:
            return text(json.loads(response.read().decode("utf-8")).get("email"))


def _cell(row: list[Any], index: int, default: Any = "") -> Any:
    return row[index] if index < len(row) and row[index] is not None else default


def _row_record(row: list[Any], row_number: int) -> dict[str, Any]:
    return {
        "sourceRow": row_number,
        "itemNo": _cell(row, 1), "description": _cell(row, 2), "offer": _cell(row, 3),
        "coSbm": _cell(row, 4), "quotationDueDate": _cell(row, 5), "qCode": _cell(row, 6),
        "offerDate": _cell(row, 7), "rfqReference": _cell(row, 8), "customer": _cell(row, 9),
        "buyer": _cell(row, 10), "supplier": _cell(row, 11), "uom": _cell(row, 12),
        "quantity": _cell(row, 13), "unitPrice": _cell(row, 14), "freightCost": _cell(row, 16, 0),
        "packingCost": _cell(row, 17, 0), "bankCharges": _cell(row, 18, 0), "otherCharges": _cell(row, 19, 0),
        "supplierDeliveryPeriod": _cell(row, 21), "forexRate": _cell(row, 22), "dutyRate": _cell(row, 24),
        "safetyFactor": _cell(row, 27, 0), "totalLocalPurchaseVatIn": _cell(row, 28, 0),
        "markupMultiplier": _cell(row, 29), "manualUnitVatEx": _cell(row, 33), "macrotechDeliveryPeriod": _cell(row, 34),
        "awardToMacro": _cell(row, 47), "poNumber": _cell(row, 48), "srCode": _cell(row, 49),
        "markupRemarks": _cell(row, 50), "additionalRemarks": _cell(row, 51),
    }


class ReadOnly2026Tracker:
    def __init__(self, session: GoogleSession):
        self.session = session

    def load(self, lookup: str) -> QuotationDraft:
        self.session.assert_live_is_read_only()
        api = self.session.sheets().spreadsheets().values()
        query = text(lookup).upper()
        if not query:
            raise ValueError("Enter a 2026 Q Code, RFQ, or PR reference.")
        values = api.batchGet(
            spreadsheetId=LIVE_TRACKER_ID,
            ranges=[f"'{TRACKER_TAB}'!G2:G", f"'{TRACKER_TAB}'!I2:I"],
            valueRenderOption="FORMATTED_VALUE",
        ).execute().get("valueRanges", [])
        q_values = (values[0].get("values") if values else []) or []
        ref_values = (values[1].get("values") if len(values) > 1 else []) or []
        q_code = ""
        for row in q_values:
            if text(row[0] if row else "").upper() == query:
                q_code = text(row[0])
                break
        if not q_code:
            candidates = []
            for index, row in enumerate(ref_values):
                if query in text(row[0] if row else "").upper() and index < len(q_values):
                    found = text(q_values[index][0] if q_values[index] else "")
                    if found and found not in candidates:
                        candidates.append(found)
            if len(candidates) != 1:
                raise ValueError("The reference was not found uniquely. Enter the exact 2026 Q Code.")
            q_code = candidates[0]
        row_numbers = [index + 2 for index, row in enumerate(q_values) if text(row[0] if row else "").upper() == q_code.upper()]
        start, end = min(row_numbers), max(row_numbers)
        raw = api.get(
            spreadsheetId=LIVE_TRACKER_ID,
            range=f"'{TRACKER_TAB}'!A{start}:AZ{end}",
            valueRenderOption="UNFORMATTED_VALUE",
        ).execute().get("values") or []
        records = [_row_record(row, start + index) for index, row in enumerate(raw) if text(_cell(row, 6)).upper() == q_code.upper()]
        return draft_from_tracker_rows(records)


class ReadOnlyEmployeeTracker:
    """Reads an employee-owned Tracker-shaped Google Sheet; it exposes no writes."""
    def __init__(self, session: GoogleSession):
        self.session = session

    def load(self, spreadsheet_id: str, lookup: str, tab: str = TRACKER_TAB) -> QuotationDraft:
        sheet_id = extract_sheet_id(spreadsheet_id)
        if sheet_id == DUMMY_TRACKER_ID:
            raise RuntimeError("The Dummy Tracker is an output only and cannot be imported as an employee source.")
        if sheet_id == LIVE_TRACKER_ID:
            self.session.assert_live_is_read_only()
        query = text(lookup).upper()
        if not query:
            raise ValueError("Enter the employee Q Code or RFQ / PR reference.")
        api = self.session.sheets().spreadsheets().values()
        ranges = [f"'{tab}'!G2:G", f"'{tab}'!I2:I"]
        values = api.batchGet(spreadsheetId=sheet_id, ranges=ranges, valueRenderOption="FORMATTED_VALUE").execute().get("valueRanges", [])
        q_values = (values[0].get("values") if values else []) or []
        ref_values = (values[1].get("values") if len(values) > 1 else []) or []
        matches: list[str] = []
        for index in range(max(len(q_values), len(ref_values))):
            q = text(q_values[index][0] if index < len(q_values) and q_values[index] else "")
            ref = text(ref_values[index][0] if index < len(ref_values) and ref_values[index] else "")
            if q and (q.upper() == query or query in ref.upper()) and q not in matches:
                matches.append(q)
        if len(matches) != 1:
            raise ValueError("The employee reference was not found uniquely. Enter the exact Q Code.")
        q_code = matches[0]
        row_numbers = [index + 2 for index, row in enumerate(q_values) if text(row[0] if row else "").upper() == q_code.upper()]
        start, end = min(row_numbers), max(row_numbers)
        raw = api.get(spreadsheetId=sheet_id, range=f"'{tab}'!A{start}:AZ{end}", valueRenderOption="UNFORMATTED_VALUE").execute().get("values") or []
        records = [_row_record(row, start + index) for index, row in enumerate(raw) if text(_cell(row, 6)).upper() == q_code.upper()]
        return draft_from_tracker_rows(records)


class Snapshot2026Tracker:
    def __init__(self, path: Path | None = None):
        self.path = path or resource_path("data/2026_tracker_snapshot.json")
        self.document = json.loads(self.path.read_text(encoding="utf-8"))

    def q_codes(self) -> list[str]:
        return list(dict.fromkeys(text(x.get("qCode")) for x in self.document["rows"] if text(x.get("qCode"))))

    def load(self, lookup: str) -> QuotationDraft:
        query = text(lookup).upper()
        matches = [x for x in self.document["rows"] if text(x.get("qCode")).upper() == query or query in text(x.get("rfqReference")).upper()]
        q_codes = list(dict.fromkeys(text(x.get("qCode")) for x in matches))
        if len(q_codes) != 1:
            raise ValueError("Choose one of the bundled recognizable 2026 Q Codes.")
        return draft_from_tracker_rows([x for x in matches if text(x.get("qCode")) == q_codes[0]])


def _serial(value: Any) -> float:
    if isinstance(value, (int, float)):
        return float(value)
    raw = text(value)
    try:
        parsed = datetime.fromisoformat(raw).date()
    except ValueError:
        parsed = date.today() + timedelta(days=14)
    return float((parsed - date(1899, 12, 30)).days)


def build_tracker_rows(draft: QuotationDraft, q_code: str, request_id: str) -> list[list[Any]]:
    draft.validate()
    rows: list[list[Any]] = []
    for item in draft.items:
        selected = item.selected_or_none()
        calculation = item.calculation()
        options: list[SupplierOption | None] = ([selected] + [x for x in item.supplier_options if x.id != selected.id]) if selected else [None]
        for option_index, option in enumerate(options):
            row: list[Any] = [""] * 52
            row[1] = item.item_no if option_index == 0 else ""
            row[2] = item.description
            row[3] = item.macrotech_offer if option_index == 0 else (option.offer if option else item.manual_offer)
            row[4] = option.co_sbm if option else ""
            row[5] = _serial(draft.quotation_due_date)
            row[6] = q_code
            row[7] = _serial(date.today().isoformat())
            row[8] = draft.rfq_reference
            row[9] = draft.customer
            row[10] = draft.buyer
            row[11] = option.supplier if option else ""
            row[12] = item.uom
            row[13] = float(item.quantity)
            row[14] = float(option.unit_price) if option else 0.0
            row[16] = float(option.freight_cost) if option else 0.0
            row[17] = float(option.packing_cost) if option else 0.0
            row[18] = float(option.bank_charges) if option else 0.0
            row[19] = float(option.other_charges) if option else 0.0
            row[21] = option.supplier_delivery if option else ""
            row[22] = ("LOCAL" if option and option.cost_basis_mode == "LOCAL" else float(option.forex_rate)) if option else 1.0
            row[24] = float(option.duty_rate) if option else 0.0
            row[29] = float(option.markup_multiplier) if option else 1.0
            row[34] = item.macrotech_delivery if option_index == 0 else (option.macrotech_delivery if option else item.manual_delivery)
            accepted_selected = option_index == 0 and item.accepted_quantity > 0
            row[47] = "YES" if accepted_selected else "NO"
            row[48] = draft.customer_po_number if accepted_selected else ""
            row[49] = option.sr_code if option else ""
            row[50] = option.markup_remarks if option else ""
            basis = f"Currency: {option.currency} | Status: {draft.status} | Discount requested: {draft.discount_requested_percent}% | Approved discount: {draft.discount_approved_percent}%" if option else "COST BASIS INCOMPLETE"
            accepted_note = f" | Accepted qty: {item.accepted_quantity}" if accepted_selected else ""
            discount_note = f" | Grand Total: PHP {draft.totals()['grand_total_before_discount']} | Approved Discount: PHP {draft.discount_amount} | Final Total: PHP {draft.totals()['final_total']}" if option_index == 0 and draft.discount_status == "APPROVED" else ""
            employee_note = f" | Employee approval note: {draft.employee_comments}" if option_index == 0 and draft.employee_comments else ""
            marker = f"PILOT AUTO-FILL | Source: {draft.source_q_code or draft.q_code} | Revision: {draft.revision} | {basis} | Quoted unit VAT-EX: PHP {calculation['unit_vat_ex']} | Request: {request_id}{accepted_note}{discount_note}{employee_note}"
            remarks = option.additional_remarks if option else ""
            row[51] = f"{remarks} | {marker}".strip(" |").strip()
            rows.append(row)
    return rows


class DummyTrackerSink:
    def __init__(self, session: GoogleSession):
        self.session = session
        self.spreadsheet_id = DUMMY_TRACKER_ID

    def _guard(self) -> None:
        if self.spreadsheet_id != DUMMY_TRACKER_ID or self.spreadsheet_id == LIVE_TRACKER_ID:
            raise RuntimeError("Safety stop: Demo writes are permitted only to the fixed Dummy Tracker ID.")

    def open_in_browser(self) -> None:
        webbrowser.open(f"https://docs.google.com/spreadsheets/d/{DUMMY_TRACKER_ID}/edit")

    @staticmethod
    def _row_style(document: dict) -> tuple[list[dict], int]:
        try:
            grid = document["sheets"][0]["data"][0]
            cells = grid.get("rowData", [{}])[0].get("values", [])
            metadata = grid.get("rowMetadata", [{}])[0]
        except (KeyError, IndexError, TypeError) as exc:
            raise RuntimeError("Could not read the verified Dummy template row formatting.") from exc
        if not cells:
            raise RuntimeError("The verified Dummy template row is empty.")
        styles = []
        for index in range(52):
            cell = cells[index] if index < len(cells) else {}
            entry = {"userEnteredFormat": cell.get("userEnteredFormat", {})}
            if cell.get("dataValidation"):
                entry["dataValidation"] = cell["dataValidation"]
            styles.append(entry)
        return styles, int(metadata.get("pixelSize", 21))

    def _template_style(self) -> tuple[list[dict], int]:
        document = self.session.sheets().spreadsheets().get(
            spreadsheetId=self.spreadsheet_id,
            ranges=[f"'{TRACKER_TAB}'!A{TEMPLATE_ROW}:AZ{TEMPLATE_ROW}"],
            includeGridData=True,
            fields="sheets(data(rowData(values(userEnteredFormat,dataValidation)),rowMetadata(pixelSize)))",
        ).execute()
        return self._row_style(document)

    @staticmethod
    def _snapshot_rows(document: dict, row_count: int) -> tuple[list[dict], list[int]]:
        try:
            grid = document["sheets"][0]["data"][0]
        except (KeyError, IndexError, TypeError) as exc:
            raise RuntimeError("Could not create the required pre-write Dummy Tracker backup.") from exc
        row_data = grid.get("rowData") or []
        row_metadata = grid.get("rowMetadata") or []
        rows: list[dict] = []
        heights: list[int] = []
        for index in range(row_count):
            source = row_data[index].get("values", []) if index < len(row_data) else []
            cells = [source[column] if column < len(source) else {} for column in range(52)]
            rows.append({"values": cells})
            metadata = row_metadata[index] if index < len(row_metadata) else {}
            heights.append(int(metadata.get("pixelSize", 21)))
        return rows, heights

    @staticmethod
    def _expected_pricing_cells(draft: QuotationDraft, start_row: int) -> list[tuple[dict, Any, Any]]:
        result: list[tuple[dict, Any, Any]] = []
        target_row = start_row
        for item in draft.items:
            selected = item.selected_or_none()
            options = ([selected] + [x for x in item.supplier_options if x.id != selected.id]) if selected else [None]
            for option in options:
                if option and option.safety_factor_rate > 0 and option.cost_basis_mode == "IMPORTED":
                    ab_formula = f"=AA{target_row}*{option.safety_factor_rate}"
                    ab = {"userEnteredValue": {"formulaValue": ab_formula}}
                    expected_ab: Any = ab_formula
                else:
                    ab = {}
                    expected_ab = ""
                if option and option.cost_basis_mode == "OVERRIDE" and option.cost_basis_override > 0:
                    expected_ac = float(option.cost_basis_override)
                    ac = {"userEnteredValue": {"numberValue": expected_ac}}
                elif option and option.cost_basis_mode == "LOCAL":
                    expected_ac = f"=U{target_row}"
                    ac = {"userEnteredValue": {"formulaValue": expected_ac}}
                else:
                    expected_ac = f"=AA{target_row}+AB{target_row}"
                    ac = {"userEnteredValue": {"formulaValue": expected_ac}}
                result.append(({"values": [ab, ac]}, expected_ab, expected_ac))
                target_row += 1
        return result

    def _restore_snapshot(
        self, sheets: Any, sheet_id: int, start_row: int, end_row: int,
        snapshot_rows: list[dict], snapshot_heights: list[int],
    ) -> None:
        requests: list[dict[str, Any]] = [{
            "updateCells": {
                "range": {"sheetId": sheet_id, "startRowIndex": start_row - 1, "endRowIndex": end_row, "startColumnIndex": 0, "endColumnIndex": 52},
                "rows": snapshot_rows,
                "fields": "userEnteredValue,userEnteredFormat,dataValidation,note",
            }
        }]
        for offset, height in enumerate(snapshot_heights):
            requests.append({"updateDimensionProperties": {
                "range": {"sheetId": sheet_id, "dimension": "ROWS", "startIndex": start_row - 1 + offset, "endIndex": start_row + offset},
                "properties": {"pixelSize": height}, "fields": "pixelSize",
            }})
        sheets.spreadsheets().batchUpdate(spreadsheetId=self.spreadsheet_id, body={"requests": requests}).execute()

    @staticmethod
    def _verify_written_values(
        matrix: list[list[Any]], q_code: str, start_row: int,
        pricing: list[tuple[dict, Any, Any]],
    ) -> None:
        if len(matrix) != len(pricing):
            raise RuntimeError("Formula verification returned an unexpected row count.")
        for offset, row in enumerate(matrix):
            row_number = start_row + offset
            if len(row) < 52 or text(row[6]) != q_code:
                raise RuntimeError(f"Dummy Tracker row {row_number} identity or shape verification failed.")
            for column, template in FORMULA_TEMPLATES.items():
                if column == 28:
                    continue
                expected = template.format(row=row_number)
                if text(row[column]) != expected:
                    raise RuntimeError(f"Required formula is missing or changed at row {row_number}, column {column + 1}.")
            expected_ab, expected_ac = pricing[offset][1], pricing[offset][2]
            actual_ab = row[27] if len(row) > 27 else ""
            actual_ac = row[28] if len(row) > 28 else ""
            if text(actual_ab) != text(expected_ab):
                raise RuntimeError(f"Safety-factor cell AB{row_number} failed verification.")
            if isinstance(expected_ac, float):
                try:
                    if Decimal(str(actual_ac)) != Decimal(str(expected_ac)):
                        raise ValueError
                except (ValueError, ArithmeticError):
                    raise RuntimeError(f"Cost-basis cell AC{row_number} failed verification.") from None
            elif text(actual_ac) != text(expected_ac):
                raise RuntimeError(f"Cost-basis formula AC{row_number} failed verification.")

    def sync(self, draft: QuotationDraft, request_id: str) -> dict[str, Any]:
        self._guard()
        if draft.status not in {"PENDING_INTERNAL_APPROVAL", "INTERNALLY_APPROVED", "CUSTOMER_PO_PARTIAL", "CUSTOMER_PO_ACCEPTED"}:
            raise RuntimeError("Safety stop: only a submitted quotation revision can be synchronized.")
        sheets = self.session.sheets()
        values = sheets.spreadsheets().values()
        header = values.get(spreadsheetId=self.spreadsheet_id, range=f"'{TRACKER_TAB}'!A1:AZ1").execute().get("values", [[]])[0]
        if header != HEADERS:
            raise RuntimeError("Dummy Tracker headers changed. Synchronization stopped before writing.")
        config = values.get(spreadsheetId=self.spreadsheet_id, range=f"'{CONFIG_TAB}'!A1:B3").execute().get("values") or []
        if len(config) < 3 or config[0] != ["TRACKER_TEMPLATE_VERSION", TRACKER_TEMPLATE_VERSION]:
            raise RuntimeError("Dummy Tracker template version is missing or unsupported. Synchronization stopped before writing.")
        if config[2] != ["WRITE_POLICY", "INPUT CELLS ONLY; FORMULA FAILURE BLOCKS AND ROLLS BACK"]:
            raise RuntimeError("Dummy Tracker write policy changed. Synchronization stopped before writing.")
        template = values.get(
            spreadsheetId=self.spreadsheet_id,
            range=f"'{TRACKER_TAB}'!A{TEMPLATE_ROW}:AZ{TEMPLATE_ROW}",
            valueRenderOption="FORMULA",
        ).execute().get("values", [[]])[0]
        for column, formula in FORMULA_TEMPLATES.items():
            expected = formula.format(row=TEMPLATE_ROW)
            if len(template) <= column or text(template[column]) != expected:
                raise RuntimeError(f"Dummy formula template is invalid at row {TEMPLATE_ROW}, column {column + 1}. No data was written.")
        existing = values.batchGet(
            spreadsheetId=self.spreadsheet_id,
            ranges=[f"'{TRACKER_TAB}'!G{FIRST_WRITE_ROW}:G", f"'{TRACKER_TAB}'!AZ{FIRST_WRITE_ROW}:AZ"],
        ).execute().get("valueRanges") or []
        q_values = (existing[0].get("values") if existing else []) or []
        marker_values = (existing[1].get("values") if len(existing) > 1 else []) or []
        flat_q = [text(x[0] if x else "") for x in q_values]
        flat_markers = [text(x[0] if x else "") for x in marker_values]
        is_update = bool(draft.dummy_q_code and draft.dummy_start_row and draft.dummy_end_row)
        if not is_update:
            recovered = [i for i, marker in enumerate(flat_markers) if re.search(r'(?:^|\|)\s*Request: ' + re.escape(request_id) + r'(?:\s*\||$)', marker)]
            if recovered:
                if recovered != list(range(recovered[0], recovered[-1] + 1)):
                    raise RuntimeError('Previously written rows are not contiguous. Review Dummy before retrying.')
                draft.dummy_start_row = FIRST_WRITE_ROW + recovered[0]
                draft.dummy_end_row = FIRST_WRITE_ROW + recovered[-1]
                draft.dummy_q_code = flat_q[recovered[0]]
                is_update = True
        numbers = []
        for q in flat_q:
            if q.upper().startswith("26QTST") and q[6:].isdigit():
                numbers.append(int(q[6:]))
        q_code = draft.dummy_q_code if is_update else draft.q_code
        last_used = FIRST_WRITE_ROW - 1
        for offset, q in enumerate(flat_q):
            if q:
                last_used = FIRST_WRITE_ROW + offset
        start_row = draft.dummy_start_row if is_update else max(FIRST_WRITE_ROW, last_used + 1)
        rows = build_tracker_rows(draft, q_code, request_id)
        end_row = draft.dummy_end_row if is_update else start_row + len(rows) - 1
        if end_row - start_row + 1 != len(rows):
            raise RuntimeError("Supplier rows changed after this revision was synchronized. Create a new revision before changing its supplier list.")
        metadata = sheets.spreadsheets().get(spreadsheetId=self.spreadsheet_id, fields="sheets(properties(sheetId,title,gridProperties(rowCount,columnCount)))").execute()
        target = next((x for x in metadata.get("sheets", []) if x.get("properties", {}).get("title") == TRACKER_TAB), None)
        if not target:
            raise RuntimeError("Dummy Tracker MARK-UP tab was not found.")
        sheet_id = target["properties"]["sheetId"]
        if end_row > int(target["properties"].get("gridProperties", {}).get("rowCount", 0)):
            raise RuntimeError("Dummy Tracker has no remaining prepared rows. An administrator must extend the verified template.")
        template_styles, template_row_height = self._template_style()
        if is_update:
            selected_markers = flat_markers[start_row - FIRST_WRITE_ROW:end_row - FIRST_WRITE_ROW + 1]
            if len(selected_markers) != len(rows) or any(not re.search(r'(?:^|\|)\s*Request: ' + re.escape(request_id) + r'(?:\s*\||$)', marker) for marker in selected_markers):
                raise RuntimeError("Dummy request identity differs. No rows were overwritten.")
            current_q = values.get(spreadsheetId=self.spreadsheet_id, range=f"'{TRACKER_TAB}'!G{start_row}:G{end_row}").execute().get("values") or []
            if len(current_q) != len(rows) or any(text(x[0] if x else "") != q_code for x in current_q):
                raise RuntimeError("Dummy Tracker row identity check failed. Update stopped before writing.")
        snapshot = sheets.spreadsheets().get(
            spreadsheetId=self.spreadsheet_id,
            ranges=[f"'{TRACKER_TAB}'!A{start_row}:AZ{end_row}"],
            includeGridData=True,
            fields="sheets(data(rowData(values(userEnteredValue,userEnteredFormat,dataValidation,note)),rowMetadata(pixelSize)))",
        ).execute()
        snapshot_rows, snapshot_heights = self._snapshot_rows(snapshot, len(rows))
        if not is_update:
            # A missing Q-Code does not make an employee's populated row blank.
            # Never reuse such a row merely because column G is empty.
            for snapshot_row in snapshot_rows:
                cells = snapshot_row.get("values", [])
                for first, last in INPUT_BLOCKS:
                    for cell in cells[first:last]:
                        entered = cell.get("userEnteredValue", {})
                        if entered.get("stringValue", "") or "numberValue" in entered or "boolValue" in entered:
                            raise RuntimeError("Target rows contain existing input data without this request identity. No cells were changed; an administrator must choose prepared empty rows.")
        requests: list[dict[str, Any]] = []
        for paste_type in ("PASTE_FORMAT", "PASTE_DATA_VALIDATION", "PASTE_FORMULA"):
            requests.append({"copyPaste": {
                "source": {"sheetId": sheet_id, "startRowIndex": TEMPLATE_ROW - 1, "endRowIndex": TEMPLATE_ROW, "startColumnIndex": 0, "endColumnIndex": 52},
                "destination": {"sheetId": sheet_id, "startRowIndex": start_row - 1, "endRowIndex": end_row, "startColumnIndex": 0, "endColumnIndex": 52},
                "pasteType": paste_type, "pasteOrientation": "NORMAL",
            }})
        requests.append({"updateDimensionProperties": {
            "range": {"sheetId": sheet_id, "dimension": "ROWS", "startIndex": start_row - 1, "endIndex": end_row},
            "properties": {"pixelSize": template_row_height}, "fields": "pixelSize",
        }})
        for start_col, end_col in INPUT_BLOCKS:
            payload_rows = []
            for row in rows:
                values_out = []
                for value in row[start_col:end_col]:
                    values_out.append({"userEnteredValue": {"numberValue": value}} if isinstance(value, (int, float)) else {"userEnteredValue": {"stringValue": str(value)}})
                payload_rows.append({"values": values_out})
            requests.append({"updateCells": {"range": {"sheetId": sheet_id, "startRowIndex": start_row - 1, "endRowIndex": end_row, "startColumnIndex": start_col, "endColumnIndex": end_col}, "rows": payload_rows, "fields": "userEnteredValue"}})

        # Preserve the live Tracker's AB/AC pricing behavior instead of inheriting
        # the Dummy template row's 5% safety factor for every quotation.
        pricing = self._expected_pricing_cells(draft, start_row)
        pricing_rows = [entry[0] for entry in pricing]
        requests.append({"updateCells": {"range": {"sheetId": sheet_id, "startRowIndex": start_row - 1, "endRowIndex": end_row, "startColumnIndex": 27, "endColumnIndex": 29}, "rows": pricing_rows, "fields": "userEnteredValue"}})
        wrote = False
        try:
            sheets.spreadsheets().batchUpdate(spreadsheetId=self.spreadsheet_id, body={"requests": requests}).execute()
            wrote = True
            check = values.get(
                spreadsheetId=self.spreadsheet_id,
                range=f"'{TRACKER_TAB}'!A{start_row}:AZ{end_row}",
                valueRenderOption="FORMULA",
            ).execute().get("values") or []
            self._verify_written_values(check, q_code, start_row, pricing)
            formatted = sheets.spreadsheets().get(
                spreadsheetId=self.spreadsheet_id,
                ranges=[f"'{TRACKER_TAB}'!A{start_row}:AZ{start_row}"],
                includeGridData=True,
                fields="sheets(data(rowData(values(userEnteredFormat,dataValidation)),rowMetadata(pixelSize)))",
            ).execute()
            written_styles, written_height = self._row_style(formatted)
            if written_styles != template_styles or written_height != template_row_height:
                raise RuntimeError("Dummy Tracker formatting or validation changed during the write.")
        except Exception as exc:
            if wrote:
                try:
                    self._restore_snapshot(sheets, sheet_id, start_row, end_row, snapshot_rows, snapshot_heights)
                except Exception as restore_exc:
                    raise RuntimeError(
                        f"CRITICAL: Dummy write verification failed and automatic rollback also failed: {restore_exc}"
                    ) from exc
                raise RuntimeError(f"Dummy write was rejected and the previous rows were restored: {exc}") from exc
            raise
        return {"qCode": q_code, "startRow": start_row, "endRow": end_row, "rowCount": len(rows), "sheet": TRACKER_TAB, "updated": is_update, "templateVersion": TRACKER_TEMPLATE_VERSION}
