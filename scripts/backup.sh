#!/usr/bin/env bash
# Copy the SQLite database and WhatsApp session to a backup directory.
# Usage: backup.sh /var/backups/shearbook
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="${1:-$ROOT/data/backups}"
STAMP="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$DEST/$STAMP"
if [[ -f "$ROOT/data/shearbook.db" ]]; then
  sqlite3 "$ROOT/data/shearbook.db" ".backup '$DEST/$STAMP/shearbook.db'" 2>/dev/null \
    || cp -a "$ROOT/data/shearbook.db" "$DEST/$STAMP/shearbook.db"
fi
if [[ -d "$ROOT/bot/.wwebjs_auth" ]]; then
  cp -a "$ROOT/bot/.wwebjs_auth" "$DEST/$STAMP/wwebjs_auth"
fi
# Keep the last 14 backups
ls -1dt "$DEST"/* 2>/dev/null | tail -n +15 | xargs -r rm -rf
echo "Backup written to $DEST/$STAMP"
