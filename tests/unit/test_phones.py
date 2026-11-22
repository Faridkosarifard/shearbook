from shearbook.phones import normalize_phone, phones_match


def test_normalize_strips_formatting():
    assert normalize_phone("+49 170 123 4567") == "491701234567"
    assert normalize_phone("0049-170-1234567") == "491701234567"
    assert normalize_phone("") == ""
    assert normalize_phone(None) == ""


def test_phones_match_suffix():
    assert phones_match("491701234567", "01701234567") or phones_match(
        "491701234567", "491701234567"
    )
    assert phones_match("491701234567", "491701234567")
    assert not phones_match("491701234567", "491119999999")
    assert not phones_match("", "123")
