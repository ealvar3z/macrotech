"""Compare this successor with the protected v0.9.0 development baseline.

This is a local release gate. It reads the protected baseline and the disposable
baseline test results; it does not modify either directory or contact services.
"""
from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
WORKSPACE = ROOT.parent.parent
BASELINE = WORKSPACE / "readiness" / "Macrotech_v0.9.0_PreApproval_Readiness"
BASELINE_RUN = WORKSPACE / "regression" / "v0.9.0-regression-copy"
OUTPUT = ROOT / "evidence" / "verification" / "v090_regression_comparison.json"

EXPECTED_TESTS = {"python_offline": 101, "api_offline": 82, "worker_offline": 28}
REQUIRED_CHECKS = {
    "desktop_build", "python_offline", "desktop_selftest", "backend_typecheck",
    "api_offline", "worker_offline", "backend_build", "document_samples",
    "python_source_parse",
}
ALLOWED_EXACT = {
    "CHANGELOG_v0.10.0.md", "CONNECTION_SETUP_STATUS.md", "PROJECT_HANDOFF.md",
    "README - WINDOWS DEMO.txt", "START_HERE.md", "TEST_RESULTS.md", "VERSION",
    "WINDOWS_MANUAL_TESTS.md", "build_windows_exe.ps1",
    "dashboard/package-lock.json", "dashboard/package.json", "dashboard/src/App.tsx",
    "dashboard/src/dialogs.tsx", "dashboard/src/email-preview.tsx",
    "dashboard/src/executive.tsx", "dashboard/src/workflow.tsx",
    "evidence/compare_v090_baseline.py", "evidence/create_samples.py",
    "evidence/package_release.py", "macrotech_demo/__init__.py",
    "macrotech_demo/domain.py", "macrotech_demo/email_preview.py",
    "macrotech_demo/pdf_output.py", "macrotech_demo/pilot_workflow.py",
    "macrotech_demo/platform_store.py", "macrotech_demo/state_store.py",
    "macrotech_demo/tracker_io.py", "macrotech_demo/web_preview.py",
    "staging_backend/api/src/readiness-pricing.ts",
    "staging_backend/scripts/generate-notification-preview.mjs",
    "staging_backend/worker/assets/macrotech_full_logo.jpg",
    "staging_backend/worker/src/gmail.test.ts", "staging_backend/worker/src/gmail.ts",
    "staging_backend/worker/src/notifications.ts", "tests/test_demo.py",
    "tests/test_tallies_v010.py", "tests/test_workflow080.py", "ui/readiness.css",
    "web_app.pyw",
}
ALLOWED_PREFIXES = ("dashboard/dist/", "staging_backend/api/dist/", "staging_backend/worker/dist/", "staging_backend/web/dist/")
SKIP_PARTS = {"node_modules", "__pycache__", ".git", ".windows-builder", "READY_TO_TEST", ".firebase", "screenshots"}


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def comparable_files(root: Path) -> dict[str, str]:
    found: dict[str, str] = {}
    for path in root.rglob("*"):
        relative = path.relative_to(root)
        if not path.is_file() or path.is_symlink() or any(part in SKIP_PARTS for part in relative.parts):
            continue
        if relative.name == "SOURCE_SHA256.json" or relative.parts[0] == "Macrotech Quotations" or any(part.startswith("Macrotech Quotation Pilot Review") for part in relative.parts):
            continue
        if relative.parts and relative.parts[0] == "evidence" and path.suffix.lower() != ".py":
            continue
        found[str(relative)] = digest(path)
    return found


def test_summary(path: Path) -> tuple[list[dict], list[str]]:
    if not path.is_file():
        return [], [f"Missing test results: {path}"]
    checks = json.loads(path.read_text(encoding="utf-8"))
    errors = [f"{item.get('check')} exited {item.get('exit')}" for item in checks if item.get("exit") != 0]
    names = {item.get("check") for item in checks}
    errors.extend(f"Missing check: {name}" for name in sorted(REQUIRED_CHECKS - names))
    by_name = {item.get("check"): item for item in checks}
    for name, expected in EXPECTED_TESTS.items():
        if by_name.get(name, {}).get("tests") != expected:
            errors.append(f"{name} expected {expected} tests, found {by_name.get(name, {}).get('tests')}")
    return checks, errors


errors: list[str] = []
if not BASELINE.is_dir() or (BASELINE / "VERSION").read_text(encoding="utf-8").strip() != "0.9.0-readiness.2":
    errors.append("Protected v0.9.0-readiness.2 baseline is missing or has the wrong identity.")

baseline_manifest = json.loads((BASELINE / "SOURCE_SHA256.json").read_text(encoding="utf-8")) if not errors else {}
baseline_mismatches = [
    name for name, expected in baseline_manifest.items()
    if not (BASELINE / name).is_file() or (BASELINE / name).is_symlink() or digest(BASELINE / name) != expected
]
if baseline_mismatches:
    errors.append(f"Protected v0.9.0 baseline has {len(baseline_mismatches)} changed or missing manifested files.")

baseline_checks, baseline_test_errors = test_summary(BASELINE_RUN / "evidence" / "verification" / "results.json")
errors.extend(baseline_test_errors)

baseline_files = comparable_files(BASELINE)
successor_files = comparable_files(ROOT)
changed = sorted(path for path in baseline_files.keys() & successor_files.keys() if baseline_files[path] != successor_files[path])
added = sorted(successor_files.keys() - baseline_files.keys())
removed = sorted(baseline_files.keys() - successor_files.keys())

def allowed(path: str) -> bool:
    return path in ALLOWED_EXACT or path.startswith(ALLOWED_PREFIXES)

unexpected = sorted(path for path in changed + added + removed if not allowed(path))
if unexpected:
    errors.append(f"Unexpected source differences from v0.9.0: {len(unexpected)}")

current_checks_path = ROOT / "evidence" / "verification" / "results.json"
current_checks = json.loads(current_checks_path.read_text(encoding="utf-8")) if current_checks_path.is_file() else []
current_errors = [f"Current {item.get('check')} exited {item.get('exit')}" for item in current_checks if item.get("exit") != 0]
errors.extend(current_errors)

report = {
    "status": "PASS" if not errors else "FAIL",
    "primary_development_baseline": "0.9.0-readiness.2",
    "successor": "0.10.0-tallies.1",
    "protected_baseline_manifest_files": len(baseline_manifest),
    "protected_baseline_mismatches": baseline_mismatches,
    "baseline_test_results": baseline_checks,
    "successor_test_results": current_checks,
    "source_difference": {"changed": changed, "added": added, "removed": removed, "unexpected": unexpected},
    "errors": errors,
    "note": "v0.8.0 is historical rollback ancestry only; it is not the v0.10.0 development baseline.",
}
OUTPUT.parent.mkdir(parents=True, exist_ok=True)
OUTPUT.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
print(json.dumps({
    "status": report["status"], "baseline": report["primary_development_baseline"],
    "manifest_files": len(baseline_manifest), "baseline_tests": EXPECTED_TESTS,
    "changed": len(changed), "added": len(added), "removed": len(removed),
    "unexpected": unexpected, "errors": errors,
}))
sys.exit(bool(errors))
