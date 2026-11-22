"""Phone number normalization (kept simple and country-agnostic)."""

from __future__ import annotations

import re

_NON_DIGIT = re.compile(r"\D+")


def normalize_phone(raw: str | None) -> str:
    """Keep digits only. A leading 00 is converted to a bare country code."""
    if not raw:
        return ""
    digits = _NON_DIGIT.sub("", str(raw))
    if digits.startswith("00") and len(digits) > 4:
        digits = digits[2:]
    return digits


def phones_match(stored: str, provided: str) -> bool:
    a, b = normalize_phone(stored), normalize_phone(provided)
    if not a or not b:
        return False
    return a == b or a.endswith(b) or b.endswith(a)
