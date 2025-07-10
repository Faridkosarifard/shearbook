import os

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials

SCOPES = ["https://www.googleapis.com/auth/calendar"]
TOKEN_PATH = "credentials/token.json"


def get_credentials():
    if not os.path.exists(TOKEN_PATH):
        raise FileNotFoundError(
            "❗ Token-Datei nicht gefunden. Bitte zuerst 'auth_google.py' ausführen."
        )

    creds = Credentials.from_authorized_user_file(TOKEN_PATH, SCOPES)

    if creds and creds.expired and creds.refresh_token:
        creds.refresh(Request())

        # فایل رو آپدیت کن تا توکن جدید ذخیره بشه
        with open(TOKEN_PATH, "w") as token_file:
            token_file.write(creds.to_json())

    return creds
