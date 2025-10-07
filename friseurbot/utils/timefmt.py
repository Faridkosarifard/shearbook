# utils/timefmt.py
# Standard library
from datetime import datetime
from datetime import time


def normalize_hhmm(val) -> str:
    """
    Normalize a time value to the canonical 'HH:MM' format.

    Accepts either a `datetime.time` or a string such as '9:0', '9:00',
    '09:00', or '09:00:00', and returns 'HH:MM' (e.g., '09:00').
    """
    if isinstance(val, time):
        return val.strftime("%H:%M")
    s = str(val).strip()
    # Try common formats first
    for fmt in ("%H:%M", "%H:%M:%S"):
        try:
            dt = datetime.strptime(s, fmt)
            return dt.strftime("%H:%M")
        except Exception:
            pass
    # Fallback: zero-pad naive 'H:M' style strings
    parts = s.split(":")
    if len(parts) >= 2:
        hh = parts[0].zfill(2)
        mm = parts[1].zfill(2)
        return f"{hh}:{mm}"
    return s
