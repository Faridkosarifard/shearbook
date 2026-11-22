import pytest

from shearbook.config import load_settings


def test_rejects_placeholder_secrets(monkeypatch):
    monkeypatch.setenv("SECRET_KEY", "change-me")
    monkeypatch.setenv("JWT_SECRET", "x")
    monkeypatch.setenv("BOT_TOKEN", "y")
    monkeypatch.delenv("SHEARBOOK_TESTING", raising=False)
    with pytest.raises(RuntimeError):
        load_settings(testing=False)


def test_testing_defaults(monkeypatch):
    monkeypatch.delenv("SECRET_KEY", raising=False)
    monkeypatch.delenv("JWT_SECRET", raising=False)
    monkeypatch.delenv("BOT_TOKEN", raising=False)
    settings = load_settings(testing=True)
    assert settings.secret_key
    assert settings.reservation_prefix == "SB"
    assert settings.calendar_backend == "local"
