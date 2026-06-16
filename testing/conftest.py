"""
PancreaScan / Medical AI Platform — Test Configuration
conftest.py — shared fixtures, base URL, and session management
"""

import pytest
import requests
import json
import time
import os
import sys
from datetime import datetime

# ─── Config ────────────────────────────────────────────────────────────────────
BASE_API = os.getenv("API_BASE_URL", "http://10.33.115.98:8000")
AUTH_URL  = f"{BASE_API}/api/auth"
API_URL   = f"{BASE_API}/api"

TEST_USER  = {
    "name":     "Test User Automation",
    "email":    "testautomation@pancrscan.io",
    "password": "TestPass@2026",
}

TEST_USER_2 = {
    "name":     "Secondary Test User",
    "email":    "seconduser@pancrscan.io",
    "password": "SecondPass@2026",
}

# ─── Shared state ──────────────────────────────────────────────────────────────
_auth_token = None
_report_id  = None


@pytest.fixture(scope="session")
def api_base():
    return BASE_API


@pytest.fixture(scope="session")
def auth_url():
    return AUTH_URL


@pytest.fixture(scope="session")
def api_url():
    return API_URL


def _check_server():
    """Return True if backend is reachable."""
    import socket
    host = BASE_API.replace("http://", "").split(":")[0]
    port = int(BASE_API.split(":")[-1]) if ":" in BASE_API.split("//")[-1] else 8000
    try:
        s = socket.create_connection((host, port), timeout=3)
        s.close()
        return True
    except Exception:
        return False


@pytest.fixture(scope="session")
def session_token():
    """Register (or login) a test user and return the JWT bearer token.
    If server is offline, returns a dummy token to allow tests to skip gracefully."""
    global _auth_token
    if _auth_token:
        return _auth_token

    if not _check_server():
        _auth_token = "offline_dummy_token"
        return _auth_token

    s = requests.Session()
    try:
        reg = s.post(f"{AUTH_URL}/register", json=TEST_USER, timeout=15)
        if reg.status_code == 400 and "already registered" in reg.text.lower():
            login = s.post(f"{AUTH_URL}/login", json={
                "email":    TEST_USER["email"],
                "password": TEST_USER["password"],
            }, timeout=15)
            assert login.status_code == 200, f"Login failed: {login.text}"
            _auth_token = login.json()["access_token"]
        else:
            assert reg.status_code == 200, f"Register failed: {reg.text}"
            _auth_token = reg.json()["access_token"]
    except Exception:
        _auth_token = "offline_dummy_token"

    return _auth_token


@pytest.fixture(scope="session")
def auth_headers(session_token):
    return {
        "Authorization": f"Bearer {session_token}",
        "Content-Type":  "application/json",
    }


@pytest.fixture(scope="session")
def http_session(session_token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {session_token}"})
    return s


@pytest.fixture(scope="session")
def sample_pdf(tmp_path_factory):
    """Create a tiny fake PDF for upload tests."""
    p = tmp_path_factory.mktemp("uploads") / "sample_report.pdf"
    # Minimal valid PDF header
    p.write_bytes(
        b"%PDF-1.4\n1 0 obj\n<</Type /Catalog /Pages 2 0 R>>\nendobj\n"
        b"2 0 obj\n<</Type /Pages /Kids [3 0 R] /Count 1>>\nendobj\n"
        b"3 0 obj\n<</Type /Page /Parent 2 0 R /MediaBox [0 0 612 792]\n"
        b"/Contents 4 0 R>>\nendobj\n"
        b"4 0 obj\n<</Length 44>>\nstream\nBT /F1 12 Tf 100 700 Td "
        b"(Medical Report) Tj ET\nendstream\nendobj\nxref\n0 5\n"
        b"trailer\n<</Size 5 /Root 1 0 R>>\nstartxref\n0\n%%EOF\n"
    )
    return str(p)


@pytest.fixture(scope="session")
def sample_txt(tmp_path_factory):
    """Create a minimal TXT medical report for upload tests."""
    p = tmp_path_factory.mktemp("uploads") / "discharge_summary.txt"
    p.write_text(
        "Patient: John Doe\n"
        "DOB: 01/01/1980\n"
        "Diagnosis: Hypertension, Type 2 Diabetes\n"
        "ICD-10: I10, E11.9\n"
        "Procedures: Blood glucose monitoring, ECG\n"
        "CPT: 82947, 93000\n"
        "Discharge date: 2026-06-10\n",
        encoding="utf-8",
    )
    return str(p)


# ─── Pytest hooks ──────────────────────────────────────────────────────────────

def pytest_configure(config):
    config._metadata = getattr(config, "_metadata", {})
    config._metadata.update({
        "Project":    "PancreaScan / Medical AI Platform",
        "Tested By":  "Automation Suite",
        "API Base":   BASE_API,
        "Date":       datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    })


def pytest_terminal_summary(terminalreporter, exitstatus, config):
    passed  = len(terminalreporter.stats.get("passed",  []))
    failed  = len(terminalreporter.stats.get("failed",  []))
    error   = len(terminalreporter.stats.get("error",   []))
    skipped = len(terminalreporter.stats.get("skipped", []))
    print(f"\n{'─'*60}")
    print(f"  PancreaScan Test Summary")
    print(f"  ✅ Passed:  {passed}")
    print(f"  ❌ Failed:  {failed}")
    print(f"  ⚠️  Errors:  {error}")
    print(f"  ⏭  Skipped: {skipped}")
    print(f"  Total:     {passed + failed + error + skipped}")
    print(f"{'─'*60}\n")
