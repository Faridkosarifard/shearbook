"""Configurable public-holiday calendar."""

from __future__ import annotations

from datetime import date
from functools import lru_cache
from types import ModuleType

holidays_lib: ModuleType | None
try:
    import holidays as holidays_lib
except Exception:  # pragma: no cover
    holidays_lib = None


@lru_cache(maxsize=32)
def holiday_map(country: str, region: str, year: int) -> dict:
    if holidays_lib is None:
        return {}
    try:
        if region:
            calendar = holidays_lib.country_holidays(country, years=year, subdiv=region)
        else:
            calendar = holidays_lib.country_holidays(country, years=year)
        return dict(calendar)
    except Exception:
        try:
            return dict(holidays_lib.country_holidays(country, years=year))
        except Exception:
            return {}


def is_public_holiday(d: date, country: str, region: str) -> bool:
    if not country:
        return False
    return d in holiday_map(country, region or "", d.year)


def holiday_name(d: date, country: str, region: str) -> str | None:
    return holiday_map(country, region or "", d.year).get(d)


def clear_holiday_cache() -> None:
    holiday_map.cache_clear()
