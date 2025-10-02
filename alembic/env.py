# Standard library
import os
import sys
from logging.config import fileConfig
from typing import Optional

# Third-party (others)
# Third-party
from dotenv import load_dotenv

# SQLAlchemy
# SQLAlchemy / Alembic
from sqlalchemy import engine_from_config
from sqlalchemy import pool

# First-party
from alembic import context

# --- مسیر پروژه برای ایمپورت مدل‌ها ---
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

# Load .env قبل از خواندن config
load_dotenv()

# Alembic config
config = context.config

# اگر DATABASE_URL در env باشد، به alembic.ini تزریق کن
database_url = os.getenv("DATABASE_URL")


def _to_sync_url(url: Optional[str]) -> Optional[str]:
    """Convert async DB URL (e.g., postgresql+asyncpg) to sync for Alembic."""
    if not url:
        return url
    if url.startswith("postgresql+asyncpg://"):
        return url.replace("postgresql+asyncpg://", "postgresql+psycopg2://", 1)
    if url.startswith("sqlite+aiosqlite://"):
        return url.replace("sqlite+aiosqlite://", "sqlite://", 1)
    return url


if database_url:
    config.set_main_option("sqlalchemy.url", _to_sync_url(database_url))

# Logging
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Friseurbot
# ---- Import models so that Base.metadata is fully populated ----
from friseurbot.entity.appointment import Appointment  # noqa: F401
from friseurbot.entity.base import Base
from friseurbot.entity.blacklist import Blacklist  # noqa: F401
from friseurbot.entity.customer import Customer  # noqa: F401
from friseurbot.entity.friseur import Friseur  # noqa: F401
from friseurbot.entity.friseur_schedule import ExceptionType  # noqa: F401
from friseurbot.entity.friseur_schedule import FriseurException  # noqa: F401
from friseurbot.entity.friseur_schedule import FriseurWeeklyHour  # noqa: F401
from friseurbot.entity.friseur_service import friseur_service  # noqa: F401
from friseurbot.entity.services import Service  # noqa: F401
from friseurbot.entity.session import Session  # noqa: F401
from friseurbot.entity.setting import Setting  # noqa: F401
from friseurbot.entity.user import User  # noqa: F401

target_metadata = Base.metadata


# (اختیاری) می‌توانی جداول خاص را از اتوجن حذف کنی
def include_object(object, name, type_, reflected, compare_to):
    # جدول نسخه‌ی Alembic را نادیده بگیر
    if name == "alembic_version":
        return False
    return True


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode'."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        include_object=include_object,
        compare_type=True,
        compare_server_default=True,
        # render_as_batch برای SQLiteِ قدیمی مفید است؛ برای PG بی‌اثر است
        render_as_batch=url and url.startswith("sqlite"),
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode'."""
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            include_object=include_object,
            compare_type=True,
            compare_server_default=True,
            render_as_batch=str(connectable.url).startswith("sqlite"),
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
