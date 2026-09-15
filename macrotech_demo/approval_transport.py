from __future__ import annotations

import json
import hashlib
import os
import socket
from copy import deepcopy
from dataclasses import dataclass
from enum import Enum
from typing import Any, Callable, Mapping, Protocol
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlparse
from urllib.request import Request, urlopen
from uuid import UUID, uuid4

from .domain import QuotationDraft


class ConnectionMode(str, Enum):
    LOCAL_OFFLINE = "LOCAL_OFFLINE"
    TEST_ONLINE = "TEST_ONLINE"
    PRODUCTION_ONLINE = "PRODUCTION_ONLINE"


class ApprovalTransportError(RuntimeError):
    def __init__(self, message: str, *, code: str = "TRANSPORT_ERROR", status: int | None = None,
                 retryable: bool = False):
        super().__init__(message)
        self.code = code
        self.status = status
        self.retryable = retryable


@dataclass(frozen=True)
class ApprovalTransportConfig:
    mode: ConnectionMode = ConnectionMode.LOCAL_OFFLINE
    api_url: str = ""
    timeout_seconds: float = 15.0
    approver_uid: str = ""

    @classmethod
    def from_env(cls, environ: Mapping[str, str] | None = None) -> "ApprovalTransportConfig":
        values = os.environ if environ is None else environ
        raw_mode = values.get("MACROTECH_CONNECTION_MODE", "LOCAL_OFFLINE").strip().upper()
        aliases = {"LOCAL": "LOCAL_OFFLINE", "OFFLINE": "LOCAL_OFFLINE", "TEST": "TEST_ONLINE"}
        try:
            mode = ConnectionMode(aliases.get(raw_mode, raw_mode))
        except ValueError as exc:
            raise ApprovalTransportError("Unknown Macrotech connection mode.", code="INVALID_CONFIGURATION") from exc
        if mode is ConnectionMode.PRODUCTION_ONLINE:
            raise ApprovalTransportError(
                "Production online mode is disabled in this local alpha candidate.",
                code="PRODUCTION_DISABLED",
            )
        try:
            timeout = float(values.get("MACROTECH_API_TIMEOUT_SECONDS", "15"))
        except ValueError as exc:
            raise ApprovalTransportError("API timeout must be a number.", code="INVALID_CONFIGURATION") from exc
        if not 1 <= timeout <= 60:
            raise ApprovalTransportError("API timeout must be between 1 and 60 seconds.", code="INVALID_CONFIGURATION")
        api_url = values.get("MACROTECH_API_URL", "").strip().rstrip("/")
        approver_uid = values.get("MACROTECH_TEST_APPROVER_UID", "").strip()
        if mode is ConnectionMode.TEST_ONLINE:
            parsed = urlparse(api_url)
            local_http = parsed.scheme == "http" and parsed.hostname in {"127.0.0.1", "localhost"}
            if not api_url or not (parsed.scheme == "https" or local_http) or not parsed.netloc:
                raise ApprovalTransportError(
                    "TEST ONLINE requires an HTTPS API URL (HTTP is allowed only for localhost).",
                    code="INVALID_CONFIGURATION",
                )
            if not approver_uid:
                raise ApprovalTransportError(
                    "TEST ONLINE requires MACROTECH_TEST_APPROVER_UID.",
                    code="INVALID_CONFIGURATION",
                )
        return cls(mode=mode, api_url=api_url, timeout_seconds=timeout, approver_uid=approver_uid)


class IdentityTokenProvider(Protocol):
    def token(self) -> str: ...


class EnvironmentTokenProvider:
    """Controlled-test token input. Tokens are never persisted or logged.

    A production client must replace this with interactive Firebase sign-in and
    secure OS-backed session storage before PRODUCTION_ONLINE is enabled.
    """

    def __init__(self, variable: str = "MACROTECH_TEST_ID_TOKEN", environ: Mapping[str, str] | None = None):
        self.variable = variable
        self.environ = os.environ if environ is None else environ

    def token(self) -> str:
        value = self.environ.get(self.variable, "").strip()
        if not value:
            raise ApprovalTransportError(
                "TEST ONLINE requires a current authenticated Firebase ID token.",
                code="AUTH_REQUIRED",
                status=401,
            )
        return value


def _decimal(value: Any) -> str:
    return str(value)


def _stable_request_id(*parts: str) -> str:
    return str(UUID(bytes=hashlib.sha256("|".join(parts).encode("utf-8")).digest()[:16], version=4))


def submission_snapshot(draft: QuotationDraft) -> dict[str, Any]:
    """Explicit customer-app allowlist for the v0.10 desktop contract."""
    check = deepcopy(draft)
    check.q_code = check.q_code or "ONLINE-PENDING"
    check.validate()
    return {
        "customer": draft.customer,
        "buyer": draft.buyer,
        "rfq_reference": draft.rfq_reference,
        "billing_address": draft.billing_address,
        "delivery_address": draft.delivery_address,
        "customer_tin": draft.customer_tin,
        "buyer_email": draft.buyer_email,
        "employee_comments": draft.employee_comments,
        "discount_requested_percent": _decimal(draft.discount_requested_percent),
        "terms_version": draft.terms_version,
        "terms_text": draft.terms_text,
        "items": [
            {
                "item_no": item.item_no,
                "description": item.description,
                "uom": item.uom,
                "quantity": _decimal(item.quantity),
                "macrotech_offer": item.macrotech_offer,
                "macrotech_delivery": item.macrotech_delivery,
                "selected_supplier_id": item.selected_supplier_id,
                "supplier_options": [
                    {
                        "id": option.id,
                        "supplier": option.supplier,
                        "offer": option.offer,
                        "co_sbm": option.co_sbm,
                        "currency": option.currency,
                        "unit_price": _decimal(option.unit_price),
                        "freight_cost": _decimal(option.freight_cost),
                        "packing_cost": _decimal(option.packing_cost),
                        "bank_charges": _decimal(option.bank_charges),
                        "other_charges": _decimal(option.other_charges),
                        "forex_rate": _decimal(option.forex_rate),
                        "duty_rate": _decimal(option.duty_rate),
                        "markup_multiplier": _decimal(option.markup_multiplier),
                        "safety_factor_rate": _decimal(option.safety_factor_rate),
                        "cost_basis_mode": option.cost_basis_mode,
                        "cost_basis_override": _decimal(option.cost_basis_override),
                        "macrotech_delivery": option.macrotech_delivery,
                        "supplier_delivery": option.supplier_delivery,
                        "internal_notes": option.internal_notes,
                        "availability": option.availability,
                    }
                    for option in item.supplier_options
                ],
            }
            for item in draft.items
        ],
    }


class ApprovalTransport(Protocol):
    mode: ConnectionMode
    def health(self) -> dict[str, Any]: ...
    def current_user(self) -> dict[str, Any]: ...
    def submit(self, draft: QuotationDraft) -> dict[str, Any]: ...
    def get_state(self, quotation_id: str) -> dict[str, Any]: ...
    def approve(self, draft: QuotationDraft, percent: str) -> dict[str, Any]: ...
    def reject(self, draft: QuotationDraft, reason: str) -> dict[str, Any]: ...


class LocalApprovalTransport:
    mode = ConnectionMode.LOCAL_OFFLINE

    def __init__(self, *, submit: Callable[[dict[str, Any]], dict[str, Any]],
                 state: Callable[[str], dict[str, Any]],
                 approve: Callable[[dict[str, Any], str], dict[str, Any]],
                 reject: Callable[[dict[str, Any], str], dict[str, Any]],
                 current_user: Callable[[], dict[str, Any]]):
        self._submit = submit
        self._state = state
        self._approve = approve
        self._reject = reject
        self._current_user = current_user

    def health(self) -> dict[str, Any]:
        return {"ok": True, "mode": self.mode.value}

    def current_user(self) -> dict[str, Any]:
        return self._current_user()

    def submit(self, draft: QuotationDraft) -> dict[str, Any]:
        return self._submit(draft.to_dict())

    def get_state(self, quotation_id: str) -> dict[str, Any]:
        return self._state(quotation_id)

    def approve(self, draft: QuotationDraft, percent: str) -> dict[str, Any]:
        return self._approve(draft.to_dict(), percent)

    def reject(self, draft: QuotationDraft, reason: str) -> dict[str, Any]:
        return self._reject(draft.to_dict(), reason)


class HttpApprovalTransport:
    mode = ConnectionMode.TEST_ONLINE

    def __init__(self, config: ApprovalTransportConfig, token_provider: IdentityTokenProvider,
                 opener: Callable[..., Any] = urlopen):
        if config.mode is not ConnectionMode.TEST_ONLINE:
            raise ApprovalTransportError("HTTP transport is available only in TEST ONLINE for this candidate.", code="INVALID_CONFIGURATION")
        self.config = config
        self.token_provider = token_provider
        self.opener = opener

    @staticmethod
    def _object(value: Any, operation: str) -> dict[str, Any]:
        if not isinstance(value, dict):
            raise ApprovalTransportError(f"The server returned an invalid {operation} response.", code="INVALID_RESPONSE")
        return value

    @staticmethod
    def _required(value: dict[str, Any], fields: Mapping[str, type], operation: str) -> dict[str, Any]:
        if any(field not in value or not isinstance(value[field], expected) for field, expected in fields.items()):
            raise ApprovalTransportError(f"The server returned an invalid {operation} response.", code="INVALID_RESPONSE")
        return value

    def _request(self, method: str, path: str, payload: dict[str, Any] | None = None, *, authenticated: bool = True) -> dict[str, Any]:
        headers = {"Accept": "application/json", "X-Request-ID": str(uuid4())}
        if authenticated:
            headers["Authorization"] = f"Bearer {self.token_provider.token()}"
        body = None
        if payload is not None:
            headers["Content-Type"] = "application/json"
            body = json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
        request = Request(f"{self.config.api_url}{path}", data=body, headers=headers, method=method)
        try:
            with self.opener(request, timeout=self.config.timeout_seconds) as response:
                raw = response.read(1_048_577)
                if len(raw) > 1_048_576:
                    raise ApprovalTransportError("The server response exceeded the safe size limit.", code="INVALID_RESPONSE")
                try:
                    return self._object(json.loads(raw.decode("utf-8")), "API")
                except (UnicodeDecodeError, json.JSONDecodeError) as exc:
                    raise ApprovalTransportError("The server returned malformed JSON.", code="INVALID_RESPONSE") from exc
        except ApprovalTransportError:
            raise
        except HTTPError as exc:
            try:
                detail = json.loads(exc.read(65_537).decode("utf-8"))
            except Exception:
                detail = {}
            error = detail.get("error") if isinstance(detail, dict) else None
            code = str(error.get("code") if isinstance(error, dict) else "") or f"HTTP_{exc.code}"
            message = str(error.get("message") if isinstance(error, dict) else "") or "The online approval service rejected the request."
            raise ApprovalTransportError(message, code=code, status=exc.code, retryable=exc.code >= 500) from None
        except (socket.timeout, TimeoutError) as exc:
            raise ApprovalTransportError("The online approval request timed out. Nothing was recorded locally as successful.", code="TIMEOUT", retryable=True) from exc
        except URLError as exc:
            if isinstance(exc.reason, (socket.timeout, TimeoutError)):
                raise ApprovalTransportError("The online approval request timed out. Nothing was recorded locally as successful.", code="TIMEOUT", retryable=True) from exc
            raise ApprovalTransportError("The online approval service could not be reached. Nothing was recorded locally as successful.", code="UNAVAILABLE", retryable=True) from exc

    def health(self) -> dict[str, Any]:
        return self._required(self._request("GET", "/api/health", authenticated=False), {"ok": bool}, "health")

    def current_user(self) -> dict[str, Any]:
        return self._required(
            self._request("GET", "/api/v2/desktop/current-user"),
            {"uid": str, "email": str, "role": str, "active": bool},
            "identity",
        )

    def submit(self, draft: QuotationDraft) -> dict[str, Any]:
        payload = {
            "requestId": _stable_request_id("submit", draft.draft_id, draft.updated_at),
            "quotationId": draft.draft_id,
            "approverUid": self.config.approver_uid,
            "snapshot": submission_snapshot(draft),
        }
        return self._required(
            self._request("POST", "/api/v2/desktop/submissions", payload),
            {"quotationId": str, "approvalId": str, "qCode": str, "version": int, "snapshotHash": str, "status": str},
            "submission",
        )

    def get_state(self, quotation_id: str) -> dict[str, Any]:
        safe_id = quote(quotation_id, safe="")
        return self._required(
            self._request("GET", f"/api/v2/desktop/quotations/{safe_id}"),
            {"status": str, "version": int},
            "approval state",
        )

    def _decision(self, draft: QuotationDraft, action: str, comment: str, percent: str) -> dict[str, Any]:
        if not draft.online_approval_id or not draft.online_snapshot_hash:
            raise ApprovalTransportError("This quotation has no online approval identity.", code="ONLINE_STATE_REQUIRED")
        payload = {
            "requestId": _stable_request_id("decision", draft.online_approval_id, str(draft.online_version), action, percent, comment),
            "expectedVersion": draft.online_version,
            "snapshotHash": draft.online_snapshot_hash,
            "action": action,
            "comment": comment,
            "approvedDiscountPercent": percent,
        }
        safe_id = quote(draft.online_approval_id, safe="")
        return self._required(
            self._request("POST", f"/api/v2/desktop/approvals/{safe_id}/decision", payload),
            {"status": str, "version": int, "approvedDiscountCents": int, "finalTotalCents": int},
            "decision",
        )

    def approve(self, draft: QuotationDraft, percent: str) -> dict[str, Any]:
        return self._decision(draft, "APPROVE", "", percent)

    def reject(self, draft: QuotationDraft, reason: str) -> dict[str, Any]:
        return self._decision(draft, "REJECT", reason, "0")


class ApprovalService:
    def __init__(self, transport: ApprovalTransport):
        self.transport = transport

    @property
    def mode(self) -> ConnectionMode:
        return self.transport.mode

    def health(self) -> dict[str, Any]:
        return self.transport.health()

    def current_user(self) -> dict[str, Any]:
        return self.transport.current_user()

    def submit(self, draft: QuotationDraft) -> dict[str, Any]:
        return self.transport.submit(draft)

    def get_state(self, quotation_id: str) -> dict[str, Any]:
        return self.transport.get_state(quotation_id)

    def approve(self, draft: QuotationDraft, percent: str) -> dict[str, Any]:
        return self.transport.approve(draft, percent)

    def reject(self, draft: QuotationDraft, reason: str) -> dict[str, Any]:
        return self.transport.reject(draft, reason)
