from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
import time
from email.message import EmailMessage
from pathlib import Path
from typing import Any

from .tracker_io import app_data_dir, resource_path


GMAIL_SCOPES = ["openid", "https://www.googleapis.com/auth/userinfo.email", "https://www.googleapis.com/auth/gmail.send"]


class GmailPilotSender:
    """Explicit, allowlisted pilot sender. Email failure never changes workflow state."""

    def __init__(self, credentials_path: Path | None = None):
        self.credentials_path = credentials_path or resource_path("credentials.json")

    def _service(self, expected_sender: str):
        from google.auth.transport.requests import Request
        from google.oauth2.credentials import Credentials
        from google_auth_oauthlib.flow import InstalledAppFlow
        from googleapiclient.discovery import build

        sender_key = hashlib.sha256(expected_sender.lower().encode("utf-8")).hexdigest()[:16]
        token_path = app_data_dir() / f"gmail_notification_token_{sender_key}.json"
        creds = None
        if token_path.exists():
            try:
                creds = Credentials.from_authorized_user_file(str(token_path), GMAIL_SCOPES)
                if not creds.has_scopes(GMAIL_SCOPES):
                    creds = None
            except Exception:
                creds = None
        if creds and creds.expired and creds.refresh_token:
            try:
                creds.refresh(Request())
            except Exception:
                creds = None
        if not creds or not creds.valid:
            if not self.credentials_path.exists():
                raise FileNotFoundError("Approved pilot credentials.json was not found.")
            flow = InstalledAppFlow.from_client_secrets_file(str(self.credentials_path), GMAIL_SCOPES)
            creds = flow.run_local_server(port=0, prompt="select_account consent")
        # gmail.send cannot call Gmail users.getProfile. Use the already
        # requested identity scope; do not add mailbox-reading permissions.
        identity = build("oauth2", "v2", credentials=creds, cache_discovery=False).userinfo().get().execute()
        self._validate_sender(identity, expected_sender)
        # Cache only after confirming the selected sender. Never log credentials.
        token_path.parent.mkdir(parents=True, exist_ok=True)
        token_path.write_text(creds.to_json(), encoding="utf-8")
        return build("gmail", "v1", credentials=creds, cache_discovery=False)

    @staticmethod
    def _validate_sender(identity: dict[str, Any], expected_sender: str) -> None:
        actual_sender = str(identity.get("email") or "").strip().lower()
        if identity.get("verified_email") is not True or actual_sender != expected_sender.strip().lower():
            raise RuntimeError("Google did not verify the selected approved sender account. No email was sent.")

    @staticmethod
    def _approval_token(draft_id: str) -> str:
        key_path = app_data_dir() / "approval_link_signing_key.bin"
        if key_path.exists():
            key = key_path.read_bytes()
        else:
            key = secrets.token_bytes(32)
            key_path.write_bytes(key)
        payload = f"{draft_id}|{int(time.time()) + 72 * 60 * 60}".encode("utf-8")
        signature = hmac.new(key, payload, hashlib.sha256).digest()
        return base64.urlsafe_b64encode(payload + b"|" + signature).decode("ascii").rstrip("=")

    @staticmethod
    def verify_approval_token(token: str, at_time: int | None = None) -> str:
        """Validate a pilot link token and return its draft id.

        A future approval endpoint must still require an authenticated authorized
        approver; possession of this notification token alone is never approval.
        """
        try:
            padded = token + "=" * (-len(token) % 4)
            decoded = base64.urlsafe_b64decode(padded.encode("ascii"))
            draft_raw, expiry_raw, signature = decoded.split(b"|", 2)
            payload = draft_raw + b"|" + expiry_raw
            key = (app_data_dir() / "approval_link_signing_key.bin").read_bytes()
            expected = hmac.new(key, payload, hashlib.sha256).digest()
            if not hmac.compare_digest(signature, expected):
                raise ValueError
            if int(expiry_raw) < int(at_time if at_time is not None else time.time()):
                raise ValueError
            return draft_raw.decode("utf-8")
        except Exception as exc:
            raise ValueError("The approval link is invalid or expired.") from exc

    def send_approval(self, event: dict[str, Any], allowed_recipients: list[str], approval_base_url: str, selected_sender: str = "macrotech.quotations@gmail.com", allowed_senders: list[str] | None = None) -> dict[str, Any]:
        allowed = {x.strip().lower() for x in allowed_recipients}
        recipients = [x.strip().lower() for x in event.get("recipients", []) if x.strip().lower() in allowed]
        if not recipients:
            raise RuntimeError("No confirmed allowlisted test recipients are configured.")
        approved_senders = {x.strip().lower() for x in (allowed_senders or [selected_sender])}
        selected_sender = selected_sender.strip().lower()
        if selected_sender not in approved_senders:
            raise RuntimeError("The selected Gmail sender is not in the approved sender-account list.")
        link = f"{approval_base_url}?token={self._approval_token(event['draftId'])}"
        message = EmailMessage()
        message["From"] = selected_sender
        message["To"] = ", ".join(recipients)
        message["Subject"] = f"Approval required: {event['qCode']} — {event['customer']}"
        message.set_content(
            "A Macrotech quotation is awaiting internal approval.\n\n"
            f"Q-Code: {event['qCode']}\nCustomer: {event['customer']}\n\n"
            f"Open the isolated approval portal: {link}\n\n"
            "Email delivery is only a notification. The approval queue remains available in the application if email is unavailable."
        )
        raw = base64.urlsafe_b64encode(message.as_bytes()).decode("ascii")
        result = self._service(selected_sender).users().messages().send(userId="me", body={"raw": raw}).execute()
        return {"messageId": result.get("id", ""), "sender": selected_sender, "recipients": recipients, "approvalLink": link}
