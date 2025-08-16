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
# Default scope: full access to Calendar (matches previous behavior)
DEFAULT_SCOPES = ["https://www.googleapis.com/auth/calendar"]

ENV_TOKEN = os.getenv("GOOGLE_TOKEN_PATH")


def _load_scopes() -> List[str]:
    """
    Load OAuth scopes from environment or fall back to DEFAULT_SCOPES.
    Set GOOGLE_SCOPES as a comma-separated list if you need custom scopes.
    """
    env_scopes = os.getenv("GOOGLE_SCOPES", "").strip()
    if not env_scopes:
        return DEFAULT_SCOPES
    return [s.strip() for s in env_scopes.split(",") if s.strip()]


def _resolve_token_path() -> Path:
    """
    Resolve token.json path from environment or use project default.
    Set GOOGLE_TOKEN_PATH to override.
    """
    if ENV_TOKEN:
        TOKEN_PATH = Path(ENV_TOKEN)
    else:
        ROOT = Path(__file__).resolve().parents[3]
        TOKEN_PATH = ROOT / "friseurbot" / "credentials" / "token.json"
    logger.info(TOKEN_PATH)
    return TOKEN_PATH


def get_credentials() -> Credentials:
    """
    Load Google OAuth credentials from token.json.
    - Refreshes the token if expired and a refresh_token is present.
    - Writes back the refreshed token to disk.
    Raises:
        FileNotFoundError: if token.json does not exist.
        RuntimeError: if credentials are expired and cannot be refreshed.
        ValueError: if token file is invalid/corrupted.
    """
    token_path = _resolve_token_path()
    scopes = _load_scopes()

    if not token_path.exists():
        raise FileNotFoundError(
            f"Google OAuth token file not found at: {token_path}\n"
            "Please complete the OAuth flow to generate token.json."
        )

    try:
        creds = Credentials.from_authorized_user_file(str(token_path), scopes)
    except Exception as e:
        raise ValueError(
            f"Failed to load credentials from token file '{token_path}': {e}"
        ) from e

    # Refresh if needed
    if creds and creds.expired:
        if not creds.refresh_token:
            # Cannot refresh → user must redo OAuth
            raise RuntimeError(
                "Google credentials are expired and no refresh_token is available. "
                "Re-run the OAuth consent flow to obtain a valid token.json."
            )
        # Attempt refresh
        creds.refresh(Request())
        # Persist refreshed token
        token_path.parent.mkdir(parents=True, exist_ok=True)
        token_path.write_text(creds.to_json(), encoding="utf-8")

    return creds


def get_calendar_service():
    """
    Convenience helper to build a Google Calendar service client using current credentials.
    Returns:
        googleapiclient.discovery.Resource: Calendar v3 client.
    """
    creds = get_credentials()
    return build("calendar", "v3", credentials=creds)
