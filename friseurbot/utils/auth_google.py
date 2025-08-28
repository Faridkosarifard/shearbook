# friseurbot/utils/auth_google.py
from __future__ import annotations

"""
Utilities for authenticating with Google APIs (Calendar) and building a service client.

Environment variables:
- GOOGLE_SCOPES: Comma-separated list of OAuth scopes to request.
                 Defaults to 'https://www.googleapis.com/auth/calendar'.
- GOOGLE_TOKEN_PATH: Absolute/relative path to the OAuth token JSON (token.json).
                     If not provided, a project-local default path is used:
                     <repo_root>/friseurbot/credentials/token.json
"""

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

# Default OAuth scopes if GOOGLE_SCOPES is not provided
DEFAULT_SCOPES = ["https://www.googleapis.com/auth/calendar"]


def _load_scopes() -> List[str]:
    """
    Load OAuth scopes from the environment (GOOGLE_SCOPES).
    Returns a list of scopes; falls back to DEFAULT_SCOPES if unset/empty.
    """
    env_scopes = os.getenv("GOOGLE_SCOPES", "").strip()
    return [s.strip() for s in env_scopes.split(",") if s.strip()] or DEFAULT_SCOPES


def _resolve_token_path() -> Path:
    """
    Determine the token.json path in the following order:
      1) GOOGLE_TOKEN_PATH environment variable (highest priority)
      2) Project-local default: <repo_root>/friseurbot/credentials/token.json

    Note:
    - We intentionally log with 'error' level here to make the chosen path
      very visible in production logs. Adjust to 'info' if desired.
    """
    # 1) Prefer explicit environment variable
    env_token = os.getenv("GOOGLE_TOKEN_PATH")
    if env_token:
        p = Path(env_token)
        logger.error(f"[auth_google] Using GOOGLE_TOKEN_PATH = {p}")  # surface prominently in logs
        return p

    # 2) Fallback to project-local default: /opt/friseurbot/friseurbot/credentials/token.json
    #    'parents[2]' climbs up to the repository root (two levels up from this file).
    root = Path(__file__).resolve().parents[2]  # important: 2, not 3
    p = root / "friseurbot" / "credentials" / "token.json"
    logger.error(f"[auth_google] Using default token path = {p}")  # surface prominently in logs
    return p


def get_credentials() -> Credentials:
    """
    Load Google OAuth credentials from token.json and refresh if expired.

    Behavior:
    - Reads the token file from the resolved path (see _resolve_token_path).
    - Uses scopes from _load_scopes().
    - If the credentials are expired and a refresh_token is available, refreshes
      them and writes the updated token back to disk.
    - Raises:
        * FileNotFoundError if the token file does not exist.
        * RuntimeError if credentials are expired and no refresh_token is present.

    Returns:
        google.oauth2.credentials.Credentials: An authenticated credentials object.
    """
    token_path = _resolve_token_path()
    scopes = _load_scopes()

    if not token_path.exists():
        raise FileNotFoundError(
            f"Google OAuth token file not found at: {token_path}\n"
            "Please complete the OAuth flow to generate token.json."
        )

    creds = Credentials.from_authorized_user_file(str(token_path), scopes)

    # If token is expired, attempt to refresh using the stored refresh_token
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
    """
    Build and return a Google Calendar API service client (v3) using current credentials.
    """
    return build("calendar", "v3", credentials=get_credentials())
