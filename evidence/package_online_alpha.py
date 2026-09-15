"""Package the undeployed online-alpha candidate after local verification."""
from __future__ import annotations

import hashlib
import json
import re
import sys
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT.parent
BASELINE_ZIP = OUTPUT / "Macrotech_v0.10.0_Quotation_Workflow_Pilot.zip"
EXPECTED_BASELINE_SHA256 = "3ec748e6f08f2c36444883dc55ac534fe9b6e9cbfd03c2db09f8fecf8f6151e2"
EXCLUDED_DIRS = {"node_modules", "__pycache__", ".windows-builder", "READY_TO_TEST", ".firebase"}
EXCLUDED_SUFFIXES = {".exe", ".dll", ".pyc", ".pem", ".key", ".p12", ".pfx", ".zip"}


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def eligible(path: Path) -> bool:
    relative = path.relative_to(ROOT)
    if relative.parts and relative.parts[0] == "Macrotech Quotations":
        return False
    if path.is_symlink() or not path.is_file() or any(part in EXCLUDED_DIRS for part in relative.parts):
        return False
    if path.suffix.lower() in EXCLUDED_SUFFIXES:
        return False
    if path.name in {"SOURCE_SHA256.json"}:
        return False
    if path.name.startswith(".env"):
        return False
    return True


if not BASELINE_ZIP.is_file() or digest(BASELINE_ZIP) != EXPECTED_BASELINE_SHA256:
    sys.exit("Verified v0.10.0 baseline ZIP is missing or changed; packaging stopped.")
if (ROOT / "VERSION").read_text(encoding="utf-8").strip() != "0.10.1-online-alpha.1":
    sys.exit("Candidate version mismatch; packaging stopped.")

files = sorted(path for path in ROOT.rglob("*") if eligible(path))
patterns = {
    "private_key": re.compile(rb"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    "google_access_token": re.compile(rb"\bya29\.[A-Za-z0-9_-]{25,}"),
    "google_refresh_token": re.compile(rb"\b1//[A-Za-z0-9_-]{25,}"),
    "oauth_client_secret": re.compile(rb"\bGOCSPX-[A-Za-z0-9_-]{20,}"),
}
findings = []
for file in files:
    data = file.read_bytes()
    for kind, pattern in patterns.items():
        if pattern.search(data):
            findings.append({"path": str(file.relative_to(ROOT)), "kind": kind})
if findings:
    sys.exit("Credential-pattern findings require review; packaging stopped.")

manifest = {str(path.relative_to(ROOT)): digest(path) for path in files}
(ROOT / "SOURCE_SHA256.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
files.append(ROOT / "SOURCE_SHA256.json")
archive = OUTPUT / f"{ROOT.name}.zip"
with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as package:
    for file in files:
        package.write(file, str(Path(ROOT.name) / file.relative_to(ROOT)))
with zipfile.ZipFile(archive) as package:
    if package.testzip() is not None:
        sys.exit("ZIP integrity check failed.")
    for name, expected in manifest.items():
        member = str(Path(ROOT.name) / name)
        if hashlib.sha256(package.read(member)).hexdigest() != expected:
            sys.exit(f"ZIP member mismatch: {name}")
archive_hash = digest(archive)
(OUTPUT / f"{archive.name}.sha256").write_text(f"{archive_hash}  {archive.name}\n", encoding="ascii")
print(json.dumps({"archive": str(archive), "files": len(files), "sha256": archive_hash,
                  "baseline_sha256": EXPECTED_BASELINE_SHA256, "credential_findings": 0}))
