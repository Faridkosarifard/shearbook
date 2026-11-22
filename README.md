# ShearBook

<p align="center">
  <img src="assets/logo.svg" alt="ShearBook logo" width="128" height="128">
</p>

<p align="center"><strong>Open-source appointment booking for small salons.</strong></p>

ShearBook is a self-hosted booking desk: customers make, change or cancel
appointments over WhatsApp, and staff manage the book from a browser. It is
built to run on a single machine, typically a Raspberry Pi on the salon LAN.

The default customer language is German, with English available through
configuration. The admin interface and this documentation are English.

## Features

- WhatsApp booking, cancellation and rescheduling with a short conversation flow
- German and English customer messages (locale is configurable)
- Admin desk: calendar, stylists, weekly hours, day exceptions, services,
  assignments, a block list, settings and WhatsApp pairing
- Availability from weekly templates, off/custom exceptions, global closed
  days, public holidays and already-booked intervals
- Optional Google Calendar sync, or a local database calendar that needs no
  Google account
- Reservation codes, block list, optional number allow-list
- SQLite by default (good for one Pi); PostgreSQL is optional
- systemd units and an install script that do not hardcode a system user

## Architecture

```
customer WhatsApp  -->  Node bot (whatsapp-web.js)
                              |
                              |  X-Bot-Token
                              v
                         Flask API  <-->  SQLite or PostgreSQL
                              ^             + optional Google Calendar
                              |
staff browser  <------  admin UI (React, served by Flask)
```

- `src/shearbook` — Flask application factory, SQLAlchemy models, booking and
  availability logic, REST API under `/api`.
- `bot/` — unofficial WhatsApp Web client, conversation flows and a loopback
  admin API (QR / status) that Flask proxies at `/wa`.
- `admin/` — Vite + React + Tailwind desk. Production builds land in
  `admin/dist` and are served by Flask.
- `deploy/` — parameterized systemd units and an installer for Raspberry Pi OS
  or Debian.

## Quick start

Requirements: Python 3.11+, Node.js 18+ (22 recommended).

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env
# Replace every change-me secret with a long random string, for example:
#   python -c "import secrets; print(secrets.token_urlsafe(48))"

shearbook init-db
shearbook seed
shearbook create-admin --username admin
shearbook serve
```

In two more terminals:

```bash
cd admin && npm install && npm run dev
cd bot && npm install && npm start
```

Open http://127.0.0.1:5173, sign in, add stylists and services, then pair
WhatsApp from the WhatsApp page. For a production build, run
`npm run build` in `admin/` and use `shearbook serve` (or gunicorn) on port
8000; Flask will serve the built UI.

## Configuration

All settings are environment variables, documented in `.env.example` and in
`docs/configuration.rst`. Important ones:

| Variable | Purpose |
| --- | --- |
| `SECRET_KEY`, `JWT_SECRET`, `BOT_TOKEN`, `WHATSAPP_ADMIN_TOKEN` | Required secrets |
| `DATABASE_URL` | SQLite or PostgreSQL |
| `TIMEZONE` | Salon timezone (default `Europe/Berlin`) |
| `CUSTOMER_LOCALE` | `de` (default) or `en` |
| `HOLIDAY_COUNTRY`, `HOLIDAY_REGION` | Public holidays, e.g. `DE` and `DE-RP` |
| `CALENDAR_BACKEND` | `local` or `google` |
| `SLOT_STEP_MIN` | Slot grid in minutes |

`credentials/credentials.json` and `credentials/token.json` are gitignored.
Put Google OAuth files there only on the machine that runs the API, then run
`shearbook auth-google`.

## Raspberry Pi

See `docs/raspberry-pi.rst` for OS, Node/Python, systemd, Google OAuth,
WhatsApp pairing, Cloudflare Tunnel or Tailscale Funnel, and backups.

Short path:

```bash
sudo ./deploy/install.sh --dir /opt/shearbook --user salon
sudo -u salon /opt/shearbook/.venv/bin/shearbook create-admin -u admin
```

The installer never assumes the user is called `pi`. Put a reverse proxy or a
tunnel in front of `127.0.0.1:8000` if you need access from outside the LAN.

## Testing

```bash
make lint        # Ruff (and mypy)
make test        # pytest, with coverage (fails under 85%)
make bot-test    # Node unit tests for dates, guard and flows
make admin-test  # Vitest
```

GitHub Actions (`.github/workflows/ci.yml`) runs the same checks on Python
3.11–3.13 and Node 22.

## Security

- Admin sessions are HTTP-only JWT cookies plus a CSRF token for mutations.
- The WhatsApp process authenticates to the API with `X-Bot-Token`.
- The `/wa` proxy requires an admin session; the bot's admin port binds to
  localhost only.
- Production startup rejects placeholder secrets.
- Do not commit `.env`, Google client files, or WhatsApp session data
  (`.wwebjs_auth/`).
- Do not expose gunicorn or the bot port directly to the public internet.

If this project was derived from a private deployment, rotate the Google
Cloud OAuth client secret and revoke any refresh or access tokens that were
ever stored in `credentials/token.json`.

## Limitations

- **WhatsApp is unofficial.** The bot uses
  [whatsapp-web.js](https://github.com/pedroslopez/whatsapp-web.js), which
  automates WhatsApp Web. That may break without notice and may violate
  [WhatsApp's terms of service](https://www.whatsapp.com/legal). Use it only
  if you accept that risk; there is no official WhatsApp Business API in this
  project.
- This is a single-salon, single-process-friendly app. The settings cache is
  in memory; keep the worker count small (the systemd unit uses two).
- The local calendar is not Google Calendar. Switching backends does not
  migrate historical events.
- There is no multi-tenant mode, no staff roles beyond a single admin login,
  and no built-in SMS or email channel.
- Public holidays depend on the `holidays` package and the country/region you
  configure.

## License

Copyright 2026 Farid Kosarifard.

Licensed under the Apache License, Version 2.0. See `LICENSE`.
