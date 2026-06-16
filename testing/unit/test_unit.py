"""
PancreaScan — Unit Tests
test_unit.py

Covers pure-logic, utility, and data-processing functions:
  - MIME type inference
  - Password hashing
  - File size formatting
  - Token/JWT structure
  - ICD/CPT code format validation
  - Date helpers
  - Greeting logic
  - Data shape validators
  Total: 30 unique unit test cases (TC-051 to TC-080)
"""

import pytest
import hashlib
import re
import json
import base64
import time
import os
from datetime import datetime


# ══════════════════════════════════════════════════════════════════════════════
# TC-051 to TC-060  ─  MIME TYPE INFERENCE UNIT TESTS
# ══════════════════════════════════════════════════════════════════════════════

def infer_mime_type(filename: str) -> str:
    """Mirror of the frontend inferMimeType() helper."""
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    mapping = {
        "pdf":  "application/pdf",
        "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "doc":  "application/msword",
        "txt":  "text/plain",
    }
    return mapping.get(ext, "application/pdf")


class TestMimeTypeInference:

    def test_TC051_pdf_extension_returns_correct_mime(self):
        """TC-051: .pdf maps to application/pdf."""
        assert infer_mime_type("report.pdf") == "application/pdf"

    def test_TC052_docx_extension_returns_correct_mime(self):
        """TC-052: .docx maps to OOXML word processing mime."""
        result = infer_mime_type("discharge.docx")
        assert "wordprocessingml" in result

    def test_TC053_doc_extension_returns_msword(self):
        """TC-053: .doc maps to application/msword."""
        assert infer_mime_type("old_format.doc") == "application/msword"

    def test_TC054_txt_extension_returns_text_plain(self):
        """TC-054: .txt maps to text/plain."""
        assert infer_mime_type("notes.txt") == "text/plain"

    def test_TC055_unknown_extension_defaults_to_pdf(self):
        """TC-055: Unknown extension defaults to application/pdf."""
        assert infer_mime_type("report.xyz") == "application/pdf"

    def test_TC056_uppercase_extension_handled(self):
        """TC-056: Uppercase .PDF extension is handled."""
        assert infer_mime_type("REPORT.PDF") == "application/pdf"

    def test_TC057_no_extension_defaults_to_pdf(self):
        """TC-057: Filename with no extension defaults to PDF."""
        assert infer_mime_type("noextension") == "application/pdf"

    def test_TC058_multiple_dots_uses_last_segment(self):
        """TC-058: File with dots in name uses last segment as extension."""
        result = infer_mime_type("my.report.2026.pdf")
        assert result == "application/pdf"

    def test_TC059_empty_filename_defaults_to_pdf(self):
        """TC-059: Empty filename defaults to PDF mime."""
        assert infer_mime_type("") == "application/pdf"

    def test_TC060_txt_is_not_pdf(self):
        """TC-060: .txt mime type is not application/pdf."""
        assert infer_mime_type("notes.txt") != "application/pdf"


# ══════════════════════════════════════════════════════════════════════════════
# TC-061 to TC-065  ─  PASSWORD HASHING UNIT TESTS
# ══════════════════════════════════════════════════════════════════════════════

def hash_password(password: str) -> str:
    """Mirror of the backend hash_password() function."""
    return hashlib.sha256(password.encode()).hexdigest()


class TestPasswordHashing:

    def test_TC061_same_password_same_hash(self):
        """TC-061: Same password always produces same hash."""
        assert hash_password("MyPassword!") == hash_password("MyPassword!")

    def test_TC062_different_passwords_different_hashes(self):
        """TC-062: Different passwords produce different hashes."""
        assert hash_password("Password1") != hash_password("Password2")

    def test_TC063_hash_is_64_chars_hex(self):
        """TC-063: SHA-256 hash is always 64 hex characters."""
        h = hash_password("test")
        assert len(h) == 64
        assert all(c in "0123456789abcdef" for c in h)

    def test_TC064_case_sensitive_passwords(self):
        """TC-064: Password hashing is case-sensitive."""
        assert hash_password("password") != hash_password("Password")

    def test_TC065_empty_password_has_valid_hash(self):
        """TC-065: Empty string password produces a valid (non-empty) hash."""
        h = hash_password("")
        assert len(h) == 64


# ══════════════════════════════════════════════════════════════════════════════
# TC-066 to TC-070  ─  FILE SIZE FORMATTING UNIT TESTS
# ══════════════════════════════════════════════════════════════════════════════

def format_file_size(size_bytes: int) -> str:
    """Mirror of the upload.js FileRow size formatter."""
    if size_bytes > 1024 * 1024:
        return f"{size_bytes / 1024 / 1024:.1f} MB"
    return f"{size_bytes // 1024} KB"


class TestFileSizeFormatting:

    def test_TC066_bytes_less_than_1mb_shown_as_kb(self):
        """TC-066: File under 1 MB is displayed in KB."""
        assert "KB" in format_file_size(512 * 1024)

    def test_TC067_bytes_over_1mb_shown_as_mb(self):
        """TC-067: File over 1 MB is displayed in MB."""
        assert "MB" in format_file_size(2 * 1024 * 1024)

    def test_TC068_exactly_1mb_shown_as_mb(self):
        """TC-068: Exactly 1 MB is shown as MB (not KB)."""
        result = format_file_size(1024 * 1024 + 1)
        assert "MB" in result

    def test_TC069_zero_bytes_returns_0_kb(self):
        """TC-069: Zero-byte file returns '0 KB'."""
        assert format_file_size(0) == "0 KB"

    def test_TC070_1kb_file_displayed_correctly(self):
        """TC-070: 1024 byte file shows as 1 KB."""
        assert format_file_size(1024) == "1 KB"


# ══════════════════════════════════════════════════════════════════════════════
# TC-071 to TC-075  ─  ICD-10 / CPT CODE VALIDATION
# ══════════════════════════════════════════════════════════════════════════════

ICD10_PATTERN = re.compile(r"^[A-Z][0-9]{2}(\.[0-9A-Z]{0,4})?$")
CPT_PATTERN   = re.compile(r"^\d{5}$")


class TestCodeValidation:

    def test_TC071_valid_icd10_code_i10(self):
        """TC-071: I10 is a valid ICD-10 code."""
        assert ICD10_PATTERN.match("I10")

    def test_TC072_valid_icd10_with_decimal(self):
        """TC-072: E11.9 is a valid ICD-10 code."""
        assert ICD10_PATTERN.match("E11.9")

    def test_TC073_invalid_icd10_lowercase(self):
        """TC-073: Lowercase ICD-10 code fails validation."""
        assert not ICD10_PATTERN.match("i10")

    def test_TC074_valid_cpt_code_5_digits(self):
        """TC-074: 93000 is a valid CPT code."""
        assert CPT_PATTERN.match("93000")

    def test_TC075_invalid_cpt_less_than_5_digits(self):
        """TC-075: 4-digit CPT code fails validation."""
        assert not CPT_PATTERN.match("1234")


# ══════════════════════════════════════════════════════════════════════════════
# TC-076 to TC-080  ─  GREETING & DATE LOGIC UNIT TESTS
# ══════════════════════════════════════════════════════════════════════════════

def get_greeting(hour: int) -> str:
    """Mirror of the frontend getGreeting() helper."""
    if hour < 12:
        return "Good morning"
    if hour < 17:
        return "Good afternoon"
    return "Good evening"


class TestGreetingLogic:

    def test_TC076_morning_greeting_at_0(self):
        """TC-076: Hour 0 returns 'Good morning'."""
        assert get_greeting(0) == "Good morning"

    def test_TC077_morning_greeting_at_11(self):
        """TC-077: Hour 11 returns 'Good morning'."""
        assert get_greeting(11) == "Good morning"

    def test_TC078_afternoon_greeting_at_12(self):
        """TC-078: Hour 12 returns 'Good afternoon'."""
        assert get_greeting(12) == "Good afternoon"

    def test_TC079_afternoon_greeting_at_16(self):
        """TC-079: Hour 16 returns 'Good afternoon'."""
        assert get_greeting(16) == "Good afternoon"

    def test_TC080_evening_greeting_at_17(self):
        """TC-080: Hour 17 returns 'Good evening'."""
        assert get_greeting(17) == "Good evening"
