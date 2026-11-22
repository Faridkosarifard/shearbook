import re
from datetime import date

from shearbook.codes import (
    generate_reservation_code,
    generate_unique_reservation_code,
    is_valid_reservation_code,
)
from shearbook.db.session import get_session


def test_generate_format():
    code = generate_reservation_code("sb", on=date(2026, 3, 9))
    assert re.match(r"^SB-0309-\d{4}$", code)
    assert is_valid_reservation_code(code)
    assert not is_valid_reservation_code("nope")
    assert not is_valid_reservation_code("")


def test_unique_codes(app):
    with app.app_context():
        session = get_session()
        codes = {
            generate_unique_reservation_code(session, prefix="SB", on=date(2026, 1, 1))
            for _ in range(10)
        }
        assert len(codes) == 10
