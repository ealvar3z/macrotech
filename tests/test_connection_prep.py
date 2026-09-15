import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

from macrotech_demo.notifications import GmailPilotSender


class SenderIdentityTests(unittest.TestCase):
    def test_verified_selected_identity_required(self):
        GmailPilotSender._validate_sender(
            {"email": "TEST@example.com", "verified_email": True}, "test@example.com")
        for identity in ({}, {"email": "test@example.com"},
                         {"email": "test@example.com", "verified_email": False},
                         {"email": "other@example.com", "verified_email": True}):
            with self.subTest(identity=identity), self.assertRaises(RuntimeError):
                GmailPilotSender._validate_sender(identity, "test@example.com")

    def test_send_only_credentials_use_identity_service_not_mailbox_profile(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            # The cache contains an inert fixture, never a real credential.
            import hashlib
            cache = root / ("gmail_notification_token_" + hashlib.sha256(
                b"test@example.com").hexdigest()[:16] + ".json")
            cache.write_text("{}")
            creds = MagicMock(valid=True, expired=False)
            creds.has_scopes.return_value = True
            creds.to_json.return_value = "{}"
            identity_api = MagicMock()
            identity_api.userinfo.return_value.get.return_value.execute.return_value = {
                "email": "test@example.com", "verified_email": True}
            gmail_api = MagicMock()
            with patch("macrotech_demo.notifications.app_data_dir", return_value=root), \
                 patch("google.oauth2.credentials.Credentials.from_authorized_user_file", return_value=creds), \
                 patch("googleapiclient.discovery.build", side_effect=[identity_api, gmail_api]) as build:
                service = GmailPilotSender()._service("test@example.com")
                self.assertIs(service, gmail_api)
                self.assertEqual([(c.args[0], c.args[1]) for c in build.call_args_list],
                                 [("oauth2", "v2"), ("gmail", "v1")])
                gmail_api.users.assert_not_called()


if __name__ == "__main__":
    unittest.main()
