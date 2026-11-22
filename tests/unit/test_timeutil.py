from datetime import date, time

from shearbook.timeutil import hhmm, localize, parse_hhmm, zone


def test_parse_and_format():
    assert parse_hhmm("9:0") == time(9, 0)
    assert parse_hhmm("09:00:00") == time(9, 0)
    assert parse_hhmm(time(10, 30)) == time(10, 30)
    assert hhmm("7:5") == "07:05"
    assert parse_hhmm(None, time(8, 0)) == time(8, 0)


def test_localize():
    dt = localize(date(2026, 7, 1), time(9, 0), "Europe/Berlin")
    assert dt.tzinfo == zone("Europe/Berlin")
    assert dt.hour == 9
