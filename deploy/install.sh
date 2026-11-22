#!/usr/bin/env bash
# Install ShearBook on a Debian/Ubuntu or Raspberry Pi OS host.
# The service user is the account that runs this script (or --user), never hardcoded to "pi".
set -euo pipefail

USER_NAME="${SUDO_USER:-$USER}"
WORKDIR=""
WITH_GOOGLE=0

usage() {
  cat <<USAGE
Usage: sudo ./deploy/install.sh --dir /opt/shearbook [--user NAME] [--google]

  --dir DIR     Install location (the repository working copy)
  --user NAME   Systemd service account (defaults to the user who invoked sudo)
  --google      Remind you to run the Google Calendar OAuth flow after install
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dir) WORKDIR="$2"; shift 2 ;;
    --user) USER_NAME="$2"; shift 2 ;;
    --google) WITH_GOOGLE=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage; exit 1 ;;
  esac
done

if [[ -z "$WORKDIR" ]]; then
  echo "--dir is required" >&2
  usage
  exit 1
fi
if [[ "$(id -u)" -ne 0 ]]; then
  echo "Please run this script with sudo so it can install packages and systemd units." >&2
  exit 1
fi
if ! id "$USER_NAME" >/dev/null 2>&1; then
  echo "User $USER_NAME does not exist." >&2
  exit 1
fi

GROUP_NAME="$(id -gn "$USER_NAME")"
WORKDIR="$(readlink -f "$WORKDIR")"

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y python3 python3-venv python3-pip python3-dev build-essential \
  nodejs npm chromium sqlite3 curl

# Node from apt may be old on some Pi images; 18+ is required.
NODE_MAJOR="$(node -v | sed 's/v\([0-9]*\).*/\1/')"
if [[ "${NODE_MAJOR:-0}" -lt 18 ]]; then
  echo "Node.js 18 or newer is required. Install a current Node from NodeSource or nvm, then re-run." >&2
  exit 1
fi

install -d -o "$USER_NAME" -g "$GROUP_NAME" "$WORKDIR/data" "$WORKDIR/credentials"

if [[ ! -f "$WORKDIR/.env" ]]; then
  if [[ -f "$WORKDIR/.env.example" ]]; then
    cp "$WORKDIR/.env.example" "$WORKDIR/.env"
    # Fill required secrets if they are still placeholders.
    python3 - "$WORKDIR/.env" <<'GENSECRETS'
import re, secrets, sys
from pathlib import Path
path = Path(sys.argv[1])
text = path.read_text()

def fill(key, body):
    return re.sub(rf"^{key}=change-me.*$", f"{key}={secrets.token_urlsafe(48)}", body, count=1, flags=re.M)

for key in ("SECRET_KEY", "JWT_SECRET", "BOT_TOKEN", "WHATSAPP_ADMIN_TOKEN"):
    text = fill(key, text)
path.write_text(text)
GENSECRETS
    chown "$USER_NAME:$GROUP_NAME" "$WORKDIR/.env"
    chmod 600 "$WORKDIR/.env"
    echo "Wrote $WORKDIR/.env with generated secrets. Review it before going live."
  fi
fi

sudo -u "$USER_NAME" python3 -m venv "$WORKDIR/.venv"
sudo -u "$USER_NAME" "$WORKDIR/.venv/bin/pip" install --upgrade pip
sudo -u "$USER_NAME" "$WORKDIR/.venv/bin/pip" install -e "$WORKDIR"
sudo -u "$USER_NAME" bash -lc "cd '$WORKDIR/bot' && PUPPETEER_SKIP_DOWNLOAD=1 npm install"
sudo -u "$USER_NAME" bash -lc "cd '$WORKDIR/admin' && npm install && npm run build"
sudo -u "$USER_NAME" "$WORKDIR/.venv/bin/shearbook" init-db
sudo -u "$USER_NAME" "$WORKDIR/.venv/bin/shearbook" seed

UNIT_DIR=/etc/systemd/system
for unit in shearbook-api shearbook-bot; do
  sed -e "s|{{USER}}|$USER_NAME|g" \
      -e "s|{{GROUP}}|$GROUP_NAME|g" \
      -e "s|{{WORKDIR}}|$WORKDIR|g" \
      "$WORKDIR/deploy/${unit}.service" > "$UNIT_DIR/${unit}.service"
done
systemctl daemon-reload
systemctl enable --now shearbook-api.service
systemctl enable --now shearbook-bot.service

echo
echo "Installed. Next steps:"
echo "  1. Review $WORKDIR/.env"
echo "  2. Create an admin: sudo -u $USER_NAME $WORKDIR/.venv/bin/shearbook create-admin -u admin"
echo "  3. Open http://127.0.0.1:8000 and pair WhatsApp from the WhatsApp page."
echo "  4. Put a reverse proxy (Caddy, nginx) or a tunnel in front if you need remote access."
if [[ "$WITH_GOOGLE" -eq 1 ]]; then
  echo "  5. Place Google OAuth client credentials in $WORKDIR/credentials/credentials.json"
  echo "     then run: sudo -u $USER_NAME $WORKDIR/.venv/bin/shearbook auth-google"
  echo "     and set CALENDAR_BACKEND=google in .env, then restart shearbook-api."
fi
