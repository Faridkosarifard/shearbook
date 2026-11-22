import pytest

from shearbook.config import load_settings


def test_rejects_placeholder_secrets(monkeypatch):
    monkeypatch.setenv("SECRET_KEY", "change-me")
    monkeypatch.setenv("JWT_SECRET", "x")
    monkeypatch.setenv("BOT_TOKEN", "y")
    monkeypatch.delenv("SHEARBOOK_TESTING", raising=False)
    with pytest.raises(RuntimeError) as excinfo:
        load_settings(testing=False)
    message = str(excinfo.value)
    assert "SECRET_KEY" in message
    assert "Looked for a .env file" in message
    assert "shearbook init-env" in message
    assert ".env" in message


def test_testing_defaults(monkeypatch):
    monkeypatch.delenv("SECRET_KEY", raising=False)
    monkeypatch.delenv("JWT_SECRET", raising=False)
    monkeypatch.delenv("BOT_TOKEN", raising=False)
    settings = load_settings(testing=True)
    assert settings.secret_key
    assert settings.reservation_prefix == "SB"
    assert settings.calendar_backend == "local"


def test_loads_env_from_repo_root(tmp_path, monkeypatch):
    root = tmp_path / "repo"
    other = tmp_path / "other"
    root.mkdir()
    other.mkdir()
    (root / ".env").write_text(
        "SECRET_KEY=root-secret-value-is-long-enough\n"
        "JWT_SECRET=root-jwt-value-is-long-enough\n"
        "BOT_TOKEN=root-bot-value-is-long-enough\n",
        encoding="utf-8",
    )
    monkeypatch.chdir(other)
    monkeypatch.setattr("shearbook.config.REPO_ROOT", root)
    for key in ("SECRET_KEY", "JWT_SECRET", "BOT_TOKEN", "SHEARBOOK_TESTING"):
        monkeypatch.delenv(key, raising=False)
    settings = load_settings(testing=False)
    assert settings.secret_key == "root-secret-value-is-long-enough"
    assert settings.jwt_secret == "root-jwt-value-is-long-enough"
    assert settings.bot_token == "root-bot-value-is-long-enough"


def test_cwd_env_wins_over_repo_root(tmp_path, monkeypatch):
    root = tmp_path / "repo"
    here = tmp_path / "here"
    root.mkdir()
    here.mkdir()
    (root / ".env").write_text(
        "SECRET_KEY=from-root\nJWT_SECRET=jwt-from-root-value\nBOT_TOKEN=bot-from-root-value\n",
        encoding="utf-8",
    )
    (here / ".env").write_text(
        "SECRET_KEY=from-cwd-secret-value\nJWT_SECRET=jwt-from-cwd-value\nBOT_TOKEN=bot-from-cwd-value\n",
        encoding="utf-8",
    )
    monkeypatch.chdir(here)
    monkeypatch.setattr("shearbook.config.REPO_ROOT", root)
    for key in ("SECRET_KEY", "JWT_SECRET", "BOT_TOKEN", "SHEARBOOK_TESTING"):
        monkeypatch.delenv(key, raising=False)
    settings = load_settings(testing=False)
    assert settings.secret_key == "from-cwd-secret-value"
