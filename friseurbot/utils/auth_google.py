# friseurbot/utils/auth_google.py
from __future__ import annotations

import os
from logging import getLogger
from pathlib import Path
from typing import List

from dotenv import load_dotenv
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

logger = getLogger(__name__)
load_dotenv()

DEFAULT_SCOPES = ["https://www.googleapis.com/auth/calendar"]


def _load_scopes() -> List[str]:
    env_scopes = os.getenv("GOOGLE_SCOPES", "").strip()
    return [s.strip() for s in env_scopes.split(",") if s.strip()] or DEFAULT_SCOPES


def _resolve_token_path() -> Path:
    # 1) ENV ارجح
    env_token = os.getenv("GOOGLE_TOKEN_PATH")
    if env_token:
        p = Path(env_token)
        logger.error(f"[auth_google] Using GOOGLE_TOKEN_PATH = {p}")  # دیده شود
        return p

    # 2) مسیر پیش‌فرض پروژه: /opt/friseurbot/friseurbot/credentials/token.json
    root = Path(__file__).resolve().parents[2]  # <-- مهم: 2 نه 3
    p = root / "friseurbot" / "credentials" / "token.json"
    logger.error(f"[auth_google] Using default token path = {p}")  # دیده شود
    return p


def get_credentials() -> Credentials:
    token_path = _resolve_token_path()
    scopes = _load_scopes()

    if not token_path.exists():
        raise FileNotFoundError(
            f"Google OAuth token file not found at: {token_path}\n"
            "Please complete the OAuth flow to generate token.json."
        )

    creds = Credentials.from_authorized_user_file(str(token_path), scopes)

    if creds and creds.expired:
        if not creds.refresh_token:
            raise RuntimeError(
                "Google credentials are expired and no refresh_token is available. "
                "Re-run the OAuth consent flow to obtain a valid token.json."
            )
        creds.refresh(Request())
        token_path.parent.mkdir(parents=True, exist_ok=True)
        token_path.write_text(creds.to_json(), encoding="utf-8")

    return creds


def get_calendar_service():
    return build("calendar", "v3", credentials=get_credentials())
