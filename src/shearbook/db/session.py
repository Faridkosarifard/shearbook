"""SQLAlchemy engine and session helpers."""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, scoped_session, sessionmaker
from sqlalchemy.pool import StaticPool

from shearbook.models import Base


def _require_postgres_driver(url: str) -> None:
    if not url.startswith("postgresql"):
        return
    try:
        import psycopg  # noqa: F401
    except ImportError as exc:
        raise RuntimeError(
            "PostgreSQL is configured (DATABASE_URL) but the psycopg driver is not installed. "
            'Install it with: pip install -e ".[postgres]"'
        ) from exc


_engine: Engine | None = None
_SessionLocal: scoped_session | None = None


def configure_engine(url: str, *, echo: bool = False) -> Engine:
    global _engine, _SessionLocal
    if _engine is not None:
        _engine.dispose()

    kwargs: dict = {"future": True, "echo": echo}
    if url.startswith("sqlite"):
        connect_args = {"check_same_thread": False}
        # Shared in-memory databases need a static pool so every session sees the same file.
        if url in {"sqlite://", "sqlite:///:memory:", "sqlite:///:memory"}:
            kwargs["poolclass"] = StaticPool
        kwargs["connect_args"] = connect_args
        engine = create_engine(url, **kwargs)

        @event.listens_for(engine, "connect")
        def _sqlite_fk(dbapi_conn, _rec):  # pragma: no cover - hook
            dbapi_conn.execute("PRAGMA foreign_keys=ON")
    else:
        _require_postgres_driver(url)
        kwargs.update(
            pool_pre_ping=True,
            pool_size=10,
            max_overflow=20,
            pool_recycle=1800,
        )
        engine = create_engine(url, **kwargs)

    _engine = engine
    _SessionLocal = scoped_session(
        sessionmaker(bind=engine, autoflush=False, expire_on_commit=False, future=True)
    )
    return engine


def get_engine() -> Engine:
    if _engine is None:
        raise RuntimeError("Database is not configured. Call configure_engine() first.")
    return _engine


def get_session() -> Session:
    if _SessionLocal is None:
        raise RuntimeError("Database is not configured. Call configure_engine() first.")
    return _SessionLocal()


def remove_session() -> None:
    if _SessionLocal is not None:
        _SessionLocal.remove()


def dispose_engine() -> None:
    global _engine, _SessionLocal
    if _SessionLocal is not None:
        _SessionLocal.remove()
    if _engine is not None:
        _engine.dispose()
    _engine = None
    _SessionLocal = None


def create_schema() -> None:
    Base.metadata.create_all(get_engine())


@contextmanager
def session_scope() -> Iterator[Session]:
    session = get_session()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        remove_session()
