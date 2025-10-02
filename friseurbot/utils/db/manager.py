# friseurbot/utils/db/manager.py
"""
SQLAlchemy engine/session manager.

Features:
- Configurable via environment variables
- Safe defaults for Postgres in production (pooling) and SQLite in dev
- Scoped session compatible with Flask app context and teardown
- Backward-compatible db_manager shim (get_session/close)
"""

# Standard library
import os
from contextlib import contextmanager
from typing import Iterator

# Third-party (others)
from dotenv import load_dotenv

# SQLAlchemy
from sqlalchemy import create_engine
from sqlalchemy.orm import scoped_session
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

# -----------------------------
# Configuration
# -----------------------------
load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")

DB_POOL_SIZE = int(os.getenv("DB_POOL_SIZE", "10"))
DB_MAX_OVERFLOW = int(os.getenv("DB_MAX_OVERFLOW", "20"))
DB_POOL_TIMEOUT = int(os.getenv("DB_POOL_TIMEOUT", "30"))  # seconds
DB_POOL_RECYCLE = int(os.getenv("DB_POOL_RECYCLE", "1800"))  # seconds
DB_ECHO = os.getenv("DB_ECHO", "0") == "1"  # SQL echo


# -----------------------------
# Engine factory
# -----------------------------
def _create_engine(url: str):
    """
    Build a SQLAlchemy engine with sensible defaults for Postgres.
    For SQLite, use NullPool and disable same-thread check.
    """
    is_sqlite = url.startswith("sqlite")

    if is_sqlite:
        # SQLite: lighter config; avoid thread restriction for Flask/WSGI
        return create_engine(
            url,
            future=True,
            echo=DB_ECHO,
            poolclass=NullPool,  # no pooling for local sqlite files
            connect_args={"check_same_thread": False},
        )

    # Default (Postgres/MySQL/etc): tuned pool
    return create_engine(
        url,
        future=True,
        echo=DB_ECHO,
        pool_pre_ping=True,
        pool_size=DB_POOL_SIZE,
        max_overflow=DB_MAX_OVERFLOW,
        pool_timeout=DB_POOL_TIMEOUT,
        pool_recycle=DB_POOL_RECYCLE,
    )


# Create engine & session factory
engine = _create_engine(DATABASE_URL)

SessionLocal = scoped_session(
    sessionmaker(
        bind=engine,
        autoflush=False,
        autocommit=False,
        expire_on_commit=False,  # keep ORM attributes accessible after commit
        future=True,
    )
)


# -----------------------------
# Public helpers
# -----------------------------
def get_session():
    """
    Return a new Session bound to the scoped_session for the current context.
    The returned Session can be used as a context manager:
        with get_session() as s:
            ...
    """
    return SessionLocal()


def remove_session():
    """
    Remove the current scoped Session.
    Call this in Flask's teardown_appcontext to prevent connection leaks.
    """
    SessionLocal.remove()


@contextmanager
def session_scope() -> Iterator:
    """
    Provide a transactional scope around a series of operations:

        with session_scope() as s:
            s.add(obj)
            ...

    Commits on success, rolls back on exceptions.
    """
    session = get_session()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        remove_session()


def dispose_engine():
    """
    Dispose the engine and close all pooled connections.
    Rarely needed, but handy for tests or graceful shutdowns.
    """
    engine.dispose()


# -----------------------------
# Backwards compatibility shim
# -----------------------------
class DummyDBManager:
    """
    Minimal adapter to keep existing code working:
      - get_session()
      - close() -> remove_session()
    """

    def get_session(self):
        return get_session()

    def close(self):
        remove_session()


db_manager = DummyDBManager()
