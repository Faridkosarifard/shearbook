import pytest

from shearbook.db.session import get_session
from shearbook.users import change_password, create_admin, validate_password, validate_username


def test_validation():
    with pytest.raises(ValueError):
        validate_username("ab")
    with pytest.raises(ValueError):
        validate_password("short")
    assert validate_username("shop-owner") == "shop-owner"


def test_create_and_change(app):
    with app.app_context():
        session = get_session()
        user = create_admin(session, "owner", "supersecret")
        session.commit()
        with pytest.raises(ValueError):
            create_admin(session, "owner", "supersecret")
        change_password(session, "owner", "evenmoresecret")
        session.commit()
        assert user.password_hash
