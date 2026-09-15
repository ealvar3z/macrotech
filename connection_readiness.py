"""Offline source-readiness check. No login, network, writes, or secret reads.

This checks the v0.8.0 pilot source, not the deployed cloud infrastructure.
Exit code 2 means connected approval testing is blocked.
"""
import ast
import json
from pathlib import Path


def check(root):
    root = Path(root)
    bridge = ast.parse((root / "web_app.pyw").read_text(encoding="utf-8"))
    functions = {n.name: n for n in ast.walk(bridge) if isinstance(n, ast.FunctionDef)}
    sender = functions.get("send_queued_notifications")
    email_blocked = sender is None or any(isinstance(n, ast.Raise) for n in sender.body)
    settings = (root / "macrotech_demo/pilot_workflow.py").read_text(encoding="utf-8")
    store = (root / "macrotech_demo/platform_store.py").read_text(encoding="utf-8")
    notifications = (root / "macrotech_demo/notifications.py").read_text(encoding="utf-8")
    checks = [
        ("desktop_email_dispatch", "BLOCKED" if email_blocked else "UNVERIFIED",
         "Desktop email sending remains disabled." if email_blocked else "Requires a real delivery test."),
        ("shared_data", "BLOCKED" if 'LOCAL_FIRESTORE_MODEL' in store else "UNVERIFIED",
         "A local JSON model is not a shared cloud database."),
        ("cloud_connection", "BLOCKED" if 'data[\"cloudConnected\"] = False' in settings else "UNVERIFIED",
         "A live authenticated backend connection must be verified."),
        ("approval_portal", "BLOCKED" if '127.0.0.1:8765/approval' in store else "UNVERIFIED",
         "The default loopback approval URL cannot work from another device."),
        ("approval_link_verification", "BLOCKED" if 'approval_link_signing_key.bin' in notifications else "UNVERIFIED",
         "Desktop-local link signing must be replaced by authenticated shared approval navigation."),
        ("gmail_sender_identity", "SOURCE_FIXED" if 'self._validate_sender(identity, expected_sender)' in notifications else "UNVERIFIED",
         "Source uses identity permission to verify the sender; live OAuth and delivery are untested."),
        ("cloud_deployment", "UNVERIFIED", "No deployed services are checked by this offline tool."),
        ("windows_execution", "UNVERIFIED", "Windows build and end-to-end execution still require testing."),
    ]
    return {"scope": "OFFLINE_SOURCE_ONLY", "readyForConnectedApprovalTest": False,
            "checks": [{"id": key, "status": status, "detail": detail} for key, status, detail in checks]}


if __name__ == "__main__":
    try:
        print(json.dumps(check(Path(__file__).resolve().parent), indent=2))
    except Exception:
        print(json.dumps({"scope": "OFFLINE_SOURCE_ONLY", "readyForConnectedApprovalTest": False,
                          "error": "Readiness check could not inspect this source package."}))
    raise SystemExit(2)
