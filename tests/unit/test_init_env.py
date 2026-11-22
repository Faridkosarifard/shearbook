from typer.testing import CliRunner

from shearbook.cli import app
from shearbook.envutil import SECRET_KEYS, is_placeholder

EXAMPLE = """# example
SECRET_KEY=change-me-to-a-long-random-string
JWT_SECRET=change-me-to-a-different-long-random-string
BOT_TOKEN=change-me-shared-token-for-the-whatsapp-bridge
WHATSAPP_ADMIN_TOKEN=change-me-token-for-the-whatsapp-admin-api
DATABASE_URL=sqlite:///data/shearbook.db
TIMEZONE=Europe/Berlin
"""

runner = CliRunner()


def _parse(text: str) -> dict[str, str]:
    data = {}
    for line in text.splitlines():
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        data[key.strip()] = value.strip()
    return data


def test_init_env_creates_file_and_fills_secrets(tmp_path, monkeypatch):
    (tmp_path / ".env.example").write_text(EXAMPLE, encoding="utf-8")
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr("shearbook.cli.REPO_ROOT", tmp_path)
    result = runner.invoke(app, ["init-env"])
    assert result.exit_code == 0, result.output
    target = tmp_path / ".env"
    assert target.is_file()
    values = _parse(target.read_text(encoding="utf-8"))
    for key in SECRET_KEYS:
        assert not is_placeholder(values[key])
        assert len(values[key]) >= 32
    assert values["DATABASE_URL"] == "sqlite:///data/shearbook.db"
    assert "shearbook init-db" in result.output
    assert "Wrote" in result.output


def test_init_env_sets_database_url(tmp_path, monkeypatch):
    (tmp_path / ".env.example").write_text(EXAMPLE, encoding="utf-8")
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr("shearbook.cli.REPO_ROOT", tmp_path)
    url = "postgresql+psycopg://postgres:pwd@localhost:5432/shearbook"
    result = runner.invoke(app, ["init-env", "--database-url", url])
    assert result.exit_code == 0, result.output
    values = _parse((tmp_path / ".env").read_text(encoding="utf-8"))
    assert values["DATABASE_URL"] == url
    assert 'pip install -e ".[postgres]"' in result.output


def test_init_env_does_not_clobber_existing_secrets(tmp_path, monkeypatch):
    (tmp_path / ".env.example").write_text(EXAMPLE, encoding="utf-8")
    existing = EXAMPLE.replace("change-me-to-a-long-random-string", "already-set-secret-key")
    existing = existing.replace("change-me-to-a-different-long-random-string", "already-set-jwt")
    existing = existing.replace("change-me-shared-token-for-the-whatsapp-bridge", "already-set-bot")
    existing = existing.replace("change-me-token-for-the-whatsapp-admin-api", "already-set-wa")
    (tmp_path / ".env").write_text(existing, encoding="utf-8")
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr("shearbook.cli.REPO_ROOT", tmp_path)
    result = runner.invoke(app, ["init-env"])
    assert result.exit_code == 0, result.output
    values = _parse((tmp_path / ".env").read_text(encoding="utf-8"))
    assert values["SECRET_KEY"] == "already-set-secret-key"
    assert values["JWT_SECRET"] == "already-set-jwt"
    assert "already has" in result.output and "secrets" in result.output


def test_init_env_fills_remaining_placeholders(tmp_path, monkeypatch):
    (tmp_path / ".env.example").write_text(EXAMPLE, encoding="utf-8")
    partial = EXAMPLE.replace("change-me-to-a-long-random-string", "already-set-secret-key")
    (tmp_path / ".env").write_text(partial, encoding="utf-8")
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr("shearbook.cli.REPO_ROOT", tmp_path)
    result = runner.invoke(app, ["init-env"])
    assert result.exit_code == 0, result.output
    values = _parse((tmp_path / ".env").read_text(encoding="utf-8"))
    assert values["SECRET_KEY"] == "already-set-secret-key"
    assert not is_placeholder(values["JWT_SECRET"])
    assert not is_placeholder(values["BOT_TOKEN"])
    assert "JWT_SECRET" in result.output


def test_init_env_force_rotates_secrets(tmp_path, monkeypatch):
    (tmp_path / ".env.example").write_text(EXAMPLE, encoding="utf-8")
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr("shearbook.cli.REPO_ROOT", tmp_path)
    runner.invoke(app, ["init-env"])
    before = _parse((tmp_path / ".env").read_text(encoding="utf-8"))
    result = runner.invoke(app, ["init-env", "--force"])
    assert result.exit_code == 0, result.output
    after = _parse((tmp_path / ".env").read_text(encoding="utf-8"))
    assert after["SECRET_KEY"] != before["SECRET_KEY"]
    assert after["JWT_SECRET"] != before["JWT_SECRET"]
    assert after["BOT_TOKEN"] != before["BOT_TOKEN"]
