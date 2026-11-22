from datetime import date

from shearbook.holidays import holiday_name, is_public_holiday


def test_german_unity_day_is_nationwide():
    d = date(2026, 10, 3)
    assert is_public_holiday(d, "DE", "")
    assert holiday_name(d, "DE", "")


def test_epiphany_is_state_specific():
    d = date(2026, 1, 6)
    assert is_public_holiday(d, "DE", "BW")
    assert not is_public_holiday(d, "DE", "BE")


def test_ordinary_weekday_is_not_holiday():
    assert not is_public_holiday(date(2026, 1, 7), "DE", "BW")
