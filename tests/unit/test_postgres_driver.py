import builtins

import pytest

from shearbook.db.session import configure_engine, dispose_engine


def test_postgres_missing_driver_message(monkeypatch):
    real_import = builtins.__import__

    def blocked(name, globals=None, locals=None, fromlist=(), level=0):
        if name == "psycopg" or name.startswith("psycopg."):
            raise ImportError("simulated missing psycopg")
        return real_import(name, globals, locals, fromlist, level)

    monkeypatch.setattr(builtins, "__import__", blocked)
    dispose_engine()
    with pytest.raises(RuntimeError) as excinfo:
        configure_engine("postgresql+psycopg://postgres:pwd@localhost:5432/shearbook")
    message = str(excinfo.value)
    assert "psycopg" in message
    assert 'pip install -e ".[postgres]"' in message
    dispose_engine()
