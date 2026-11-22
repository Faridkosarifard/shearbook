"""Environment-driven configuration for ShearBook."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

from shearbook.envutil import load_env_files, missing_secret_message

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_SQLITE = f"sqlite:///{(REPO_ROOT / 'data' / 'shearbook.db').as_posix()}"


def _bool(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _int(name: str, default: int) -> int:
    raw = os.getenv(name)
    return default if raw is None or raw == "" else int(raw)


def _list(name: str, default: str) -> list[str]:
    raw = os.getenv(name, default)
    return [item.strip() for item in raw.split(",") if item.strip()]


@dataclass
class Settings:
    secret_key: str
    jwt_secret: str
    bot_token: str
    database_url: str
    timezone: str = "Europe/Berlin"
    customer_locale: str = "de"
    holiday_country: str = "DE"
    holiday_region: str = ""
    reservation_prefix: str = "SB"
    slot_step_min: int = 30
    calendar_backend: str = "local"
    google_credentials_path: Path = field(
        default_factory=lambda: REPO_ROOT / "credentials" / "credentials.json"
    )
    google_token_path: Path = field(
        default_factory=lambda: REPO_ROOT / "credentials" / "token.json"
    )
    google_scopes: list[str] = field(
        default_factory=lambda: ["https://www.googleapis.com/auth/calendar"]
    )
    host: str = "127.0.0.1"
    port: int = 8000
    allowed_origins: list[str] = field(default_factory=list)
    cookie_secure: bool = False
    cookie_samesite: str = "Lax"
    jwt_exp_hours: int = 8
    jwt_leeway_seconds: int = 10
    cookie_max_age_hours: int = 8
    admin_dist: Path = field(default_factory=lambda: REPO_ROOT / "admin" / "dist")
    whatsapp_admin_url: str = "http://127.0.0.1:5001"
    whatsapp_admin_token: str = ""
    testing: bool = False


def load_settings(*, testing: bool = False) -> Settings:
    testing = testing or _bool("SHEARBOOK_TESTING")
    looked = load_env_files(REPO_ROOT)
    secret_key = os.getenv("SECRET_KEY", "")
    jwt_secret = os.getenv("JWT_SECRET", "")
    bot_token = os.getenv("BOT_TOKEN", "")
    if not testing:
        missing = [
            name
            for name, value in (
                ("SECRET_KEY", secret_key),
                ("JWT_SECRET", jwt_secret),
                ("BOT_TOKEN", bot_token),
            )
            if not value or value.startswith("change-me")
        ]
        if missing:
            raise RuntimeError(missing_secret_message(missing, looked))
    else:
        secret_key = secret_key or "test-secret"
        jwt_secret = jwt_secret or "test-jwt"
        bot_token = bot_token or "test-bot-token"

    creds = Path(
        os.getenv("GOOGLE_CREDENTIALS_PATH", str(REPO_ROOT / "credentials" / "credentials.json"))
    )
    token = Path(os.getenv("GOOGLE_TOKEN_PATH", str(REPO_ROOT / "credentials" / "token.json")))
    if not creds.is_absolute():
        creds = REPO_ROOT / creds
    if not token.is_absolute():
        token = REPO_ROOT / token

    scopes = _list("GOOGLE_SCOPES", "https://www.googleapis.com/auth/calendar")
    admin_dist = Path(os.getenv("ADMIN_DIST", str(REPO_ROOT / "admin" / "dist")))
    if not admin_dist.is_absolute():
        admin_dist = REPO_ROOT / admin_dist

    region = os.getenv("HOLIDAY_REGION", "").strip().upper()
    if region.startswith("DE-"):
        region = region[3:]

    return Settings(
        secret_key=secret_key,
        jwt_secret=jwt_secret,
        bot_token=bot_token,
        database_url=os.getenv("DATABASE_URL", DEFAULT_SQLITE),
        timezone=os.getenv("TIMEZONE", "Europe/Berlin"),
        customer_locale=os.getenv("CUSTOMER_LOCALE", "de").strip().lower(),
        holiday_country=os.getenv("HOLIDAY_COUNTRY", "DE").strip().upper() or "DE",
        holiday_region=region,
        reservation_prefix=(os.getenv("RESERVATION_PREFIX", "SB") or "SB").upper(),
        slot_step_min=_int("SLOT_STEP_MIN", 30),
        calendar_backend=os.getenv("CALENDAR_BACKEND", "local").strip().lower(),
        google_credentials_path=creds,
        google_token_path=token,
        google_scopes=scopes,
        host=os.getenv("HOST", "127.0.0.1"),
        port=_int("PORT", 8000),
        allowed_origins=_list(
            "ALLOWED_ORIGINS",
            "http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:8000",
        ),
        cookie_secure=_bool("COOKIE_SECURE"),
        cookie_samesite=os.getenv("COOKIE_SAMESITE", "Lax"),
        jwt_exp_hours=_int("JWT_EXP_HOURS", 8),
        jwt_leeway_seconds=_int("JWT_LEEWAY_SECONDS", 10),
        cookie_max_age_hours=_int("COOKIE_MAX_AGE_HOURS", 8),
        admin_dist=admin_dist,
        whatsapp_admin_url=os.getenv("WHATSAPP_ADMIN_URL", "http://127.0.0.1:5001").rstrip("/"),
        whatsapp_admin_token=os.getenv("WHATSAPP_ADMIN_TOKEN", ""),
        testing=testing,
    )
