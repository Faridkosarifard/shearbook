# friseurbot/utils/reservation_code.py
from __future__ import annotations

import datetime
import re
import secrets
from typing import Optional

from friseurbot.entity import Appointment
from friseurbot.utils.db.manager import db_manager

DEFAULT_PREFIX = "KR"
CODE_RE = re.compile(r"^[A-Z]{2,10}-\d{4}-\d{4}$")  # e.g., KR-0814-4821


def generate_reservation_code(
    prefix: str = DEFAULT_PREFIX,
    date: Optional[datetime.date] = None,
) -> str:
    """
    Generate a reservation code (without DB check).

    Format: PREFIX-MMDD-XXXX
      - PREFIX: 2–10 uppercase letters (default 'KR')
      - MMDD: month+day of provided date or today
      - XXXX: cryptographically secure 4-digit number

    Args:
        prefix: Code prefix, typically business initials.
        date: Optional date; defaults to today.

    Returns:
        Code string like 'KR-0814-4821'.
    """
    if not prefix or not prefix.isalpha():
        prefix = DEFAULT_PREFIX
    prefix = prefix.upper()[:10]

    if date is None:
        date = datetime.date.today()

    date_str = date.strftime("%m%d")
    rand_part = secrets.randbelow(9000) + 1000  # 1000–9999
    return f"{prefix}-{date_str}-{rand_part}"


def generate_unique_reservation_code(
    prefix: str = DEFAULT_PREFIX,
    date: Optional[datetime.date] = None,
    max_attempts: int = 32,
    session=None,
) -> str:
    """
    Generate a reservation code guaranteed to be unique in the DB.

    Tries up to `max_attempts` random codes; on each attempt checks the
    Appointment table for collisions. If a collision occurs, it retries
    with a new random tail.

    Args:
        prefix: Code prefix (default 'KR').
        date: Optional date for the code's MMDD section.
        max_attempts: Safety cap for retries (default 32).
        session: Optional SQLAlchemy session. If None, a session is created.

    Returns:
        A unique code string.

    Raises:
        RuntimeError: If a unique code could not be generated within attempts.
    """
    own_session = False
    if session is None:
        session = db_manager.get_session()
        own_session = True

    try:
        seen = set()
        for _ in range(max_attempts):
            code = generate_reservation_code(prefix=prefix, date=date)
            if code in seen:
                continue
            seen.add(code)

            exists = (
                session.query(Appointment)
                .filter(Appointment.reservation_code == code)
                .first()
            )
            if not exists:
                return code

        raise RuntimeError(
            "Failed to generate a unique reservation code after "
            f"{max_attempts} attempts."
        )
    finally:
        if own_session:
            db_manager.close()


def is_valid_reservation_code(code: str) -> bool:
    """
    Quick format validation, e.g. 'KR-0814-4821'.

    Note:
        This only validates shape, not DB existence.
    """
    return bool(code and CODE_RE.match(code))
