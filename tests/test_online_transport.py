from __future__ import annotations

import io
import json
import os
import runpy
import socket
import tempfile
import unittest
from pathlib import Path
from urllib.error import HTTPError, URLError

from macrotech_demo.approval_transport import (
    ApprovalService,
    ApprovalTransportConfig,
    ApprovalTransportError,
    ConnectionMode,
    HttpApprovalTransport,
    LocalApprovalTransport,
    submission_snapshot,
)
from macrotech_demo.state_store import DraftStore, TermsStore
from macrotech_demo.tracker_io import Snapshot2026Tracker


ROOT = Path(__file__).resolve().parents[1]


class StaticToken:
    def token(self):
        return "test-token-not-a-secret"


class Response:
    def __init__(self, value):
        self.value = json.dumps(value).encode("utf-8") if not isinstance(value, bytes) else value

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def read(self, limit=-1):
        return self.value[:limit]


def configured(**overrides):
    values = {
        "MACROTECH_CONNECTION_MODE": "TEST_ONLINE",
        "MACROTECH_API_URL": "https://test-api.example.invalid",
        "MACROTECH_TEST_APPROVER_UID": "reviewer",
        "MACROTECH_API_TIMEOUT_SECONDS": "9",
    }
    values.update(overrides)
    return ApprovalTransportConfig.from_env(values)


def draft():
    value = Snapshot2026Tracker().load("26QJCG140")
    value.terms_text = "Approved test terms."
    value.terms_version = 1
    return value


class OnlineTransportTests(unittest.TestCase):
    def test_environments_are_explicit_and_production_is_disabled(self):
        self.assertEqual(ApprovalTransportConfig.from_env({}).mode, ConnectionMode.LOCAL_OFFLINE)
        self.assertEqual(configured().mode, ConnectionMode.TEST_ONLINE)
        with self.assertRaisesRegex(ApprovalTransportError, "disabled"):
            ApprovalTransportConfig.from_env({"MACROTECH_CONNECTION_MODE": "PRODUCTION_ONLINE"})
        with self.assertRaisesRegex(ApprovalTransportError, "HTTPS"):
            configured(MACROTECH_API_URL="http://remote.example.invalid")

    def test_local_transport_regression(self):
        calls = []
        local = ApprovalService(LocalApprovalTransport(
            submit=lambda payload: calls.append(("submit", payload["draft_id"])) or {"status": "PENDING_INTERNAL_APPROVAL"},
            state=lambda key: calls.append(("state", key)) or {"status": "PENDING_INTERNAL_APPROVAL"},
            approve=lambda payload, percent: calls.append(("approve", percent)) or {"status": "INTERNALLY_APPROVED"},
            reject=lambda payload, reason: calls.append(("reject", reason)) or {"status": "RETURNED_FOR_CORRECTION"},
            current_user=lambda: {"uid": "local", "email": "", "role": "preparer", "active": True},
        ))
        value = draft()
        self.assertEqual(local.submit(value)["status"], "PENDING_INTERNAL_APPROVAL")
        self.assertEqual(local.get_state(value.draft_id)["status"], "PENDING_INTERNAL_APPROVAL")
        self.assertEqual(local.approve(value, "2")["status"], "INTERNALLY_APPROVED")
        self.assertEqual(local.reject(value, "correct") ["status"], "RETURNED_FOR_CORRECTION")
        self.assertEqual([name for name, _ in calls], ["submit", "state", "approve", "reject"])

    def test_customer_request_projection_is_allowlisted(self):
        value = draft()
        value.__dict__["owner_control"] = {"features": ["PROPRIETARY-MARKER"], "commercial": "NONCUSTOMER"}
        payload = submission_snapshot(value)
        serialized = json.dumps(payload)
        self.assertNotIn("owner_control", serialized)
        self.assertNotIn("PROPRIETARY-MARKER", serialized)
        self.assertNotIn("role", serialized.lower())
        self.assertEqual(payload["customer"], value.customer)

    def test_authenticated_submit_status_approve_and_reject_mapping(self):
        captured = []
        replies = iter([
            {"uid": "employee", "email": "employee@example.invalid", "role": "preparer", "active": True},
            {"quotationId": "q1", "approvalId": "a1", "qCode": "26QTST0001", "version": 1,
             "snapshotHash": "a" * 64, "status": "PENDING"},
            {"status": "PENDING", "version": 1},
            {"status": "APPROVED", "version": 2, "approvedDiscountCents": 100, "finalTotalCents": 900},
            {"status": "RETURNED", "version": 2, "approvedDiscountCents": 0, "finalTotalCents": 1000},
        ])

        def opener(request, timeout):
            captured.append((request, timeout))
            return Response(next(replies))

        transport = HttpApprovalTransport(configured(), StaticToken(), opener)
        value = draft()
        identity = transport.current_user()
        submitted = transport.submit(value)
        transport.get_state("q1")
        value.online_approval_id = "a1"
        value.online_snapshot_hash = "a" * 64
        value.online_version = 1
        transport.approve(value, "10")
        transport.reject(value, "Correct delivery")

        self.assertEqual(identity["role"], "preparer")
        self.assertEqual(submitted["qCode"], "26QTST0001")
        self.assertTrue(all(request.get_header("Authorization") == "Bearer test-token-not-a-secret" for request, _ in captured))
        bodies = [json.loads(request.data) for request, _ in captured if request.data]
        self.assertNotIn("role", bodies[0])
        self.assertEqual(bodies[-2]["action"], "APPROVE")
        self.assertEqual(bodies[-1]["action"], "REJECT")
        self.assertEqual({timeout for _, timeout in captured}, {9})

    def test_401_and_403_are_reported_without_role_fallback(self):
        for status, code in ((401, "INVALID_SESSION"), (403, "ROLE_REQUIRED")):
            def opener(_request, timeout, status=status, code=code):
                body = json.dumps({"error": {"code": code, "message": "Denied"}}).encode()
                raise HTTPError("https://test", status, "Denied", {}, io.BytesIO(body))
            transport = HttpApprovalTransport(configured(), StaticToken(), opener)
            with self.assertRaises(ApprovalTransportError) as caught:
                transport.current_user()
            self.assertEqual(caught.exception.status, status)
            self.assertEqual(caught.exception.code, code)

    def test_timeout_invalid_response_and_server_error_never_succeed(self):
        failures = [
            (lambda *_args, **_kwargs: (_ for _ in ()).throw(URLError(socket.timeout())), "TIMEOUT"),
            (lambda *_args, **_kwargs: Response(b"not-json"), "INVALID_RESPONSE"),
            (lambda *_args, **_kwargs: (_ for _ in ()).throw(HTTPError(
                "https://test", 503, "Unavailable", {}, io.BytesIO(json.dumps({"error": {"code": "UNAVAILABLE", "message": "Later"}}).encode())
            )), "UNAVAILABLE"),
        ]
        for opener, code in failures:
            with self.subTest(code=code):
                with self.assertRaises(ApprovalTransportError) as caught:
                    HttpApprovalTransport(configured(), StaticToken(), opener).current_user()
                self.assertEqual(caught.exception.code, code)

    def test_bridge_server_failure_does_not_create_local_success(self):
        bridge_type = runpy.run_path(str(ROOT / "web_app.pyw"))["DesktopBridge"]
        with tempfile.TemporaryDirectory() as folder:
            bridge = bridge_type()
            bridge.store = DraftStore(Path(folder) / "drafts.json")
            bridge.terms = TermsStore(Path(folder) / "terms.json")
            value = draft()
            value.draft_id = "connection-test-no-false-success"
            value.q_code = ""
            bridge.store.save(value)

            class FailingService:
                mode = ConnectionMode.TEST_ONLINE
                def submit(self, _draft):
                    raise ApprovalTransportError("Server failed", code="HTTP_500", status=500)

            bridge.approvals = FailingService()
            with self.assertRaises(ApprovalTransportError):
                bridge.submit(value.to_dict())
            saved = bridge.store.get(value.draft_id)
            self.assertEqual(saved.status, "QUOTATION_DRAFT")
            self.assertEqual(saved.q_code, "")
            self.assertEqual(saved.online_approval_id, "")

    def test_dashboard_refresh_reads_and_applies_authoritative_online_state(self):
        bridge_type = runpy.run_path(str(ROOT / "web_app.pyw"))["DesktopBridge"]
        with tempfile.TemporaryDirectory() as folder:
            bridge = bridge_type()
            bridge.store = DraftStore(Path(folder) / "drafts.json")
            bridge.terms = TermsStore(Path(folder) / "terms.json")
            value = draft()
            value.draft_id = "online-refresh-test"
            value.submit_for_internal_approval()
            value.online_quotation_id = value.draft_id
            value.online_approval_id = "approval-refresh-test"
            value.online_version = 1
            value.online_snapshot_hash = "a" * 64
            bridge.store.save(value)

            class RefreshService:
                mode = ConnectionMode.TEST_ONLINE
                def current_user(self):
                    return {"uid": "reviewer", "email": "reviewer@example.invalid", "role": "approver", "active": True}
                def get_state(self, quotation_id):
                    self.seen = quotation_id
                    return {"status": "RETURNED", "version": 2}

            bridge.approvals = RefreshService()
            result = bridge.bootstrap()
            updated = next(item for item in result["saved"] if item["draft_id"] == value.draft_id)
            self.assertEqual(updated["status"], "RETURNED_FOR_CORRECTION")
            self.assertEqual(updated["online_version"], 2)
            self.assertEqual(result["onlineErrors"], [])
            self.assertEqual(result["authenticatedUser"]["role"], "approver")


if __name__ == "__main__":
    unittest.main()
