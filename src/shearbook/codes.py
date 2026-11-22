"""Reservation codes of the form PREFIX-MMDD-XXXX."""

from __future__ import annotations

import re
import secrets
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from shearbook.models import Appointment

CODE_RE = re.compile(r"^[A-Z]{2,10}-\d{4}-\d{4}$")


def generate_reservation_code(prefix: str = "SB", on: date | None = None) -> str:
    prefix = (prefix or "SB").upper()
    prefix = "".join(ch for ch in prefix if ch.isalpha())[:10] or "SB"
    on = on or date.today()
    tail = secrets.randbelow(9000) + 1000
    return f"{prefix}-{on.strftime('%m%d')}-{tail}"


def generate_unique_reservation_code(
    session: Session,
    prefix: str = "SB",
    on: date | None = None,
    max_attempts: int = 32,
) -> str:
    seen: set[str] = set()
    for _ in range(max_attempts):
        code = generate_reservation_code(prefix=prefix, on=on)
        if code in seen:
            continue
        seen.add(code)
        exists = session.scalar(select(Appointment.id).where(Appointment.reservation_code == code))
        if exists is None:
            return code
    raise RuntimeError(
        f"Could not generate a unique reservation code after {max_attempts} attempts"
    )


def is_valid_reservation_code(code: str | None) -> bool:
    return bool(code and CODE_RE.match(code))
