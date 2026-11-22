Raspberry Pi deployment
=======================

ShearBook is designed to run on a single always-on machine, typically a
Raspberry Pi, on the salon LAN. The API, admin UI and WhatsApp client all
live on that host. Nothing here requires a particular account name; the
installer uses the user you pass in, not ``pi``.

Operating system
----------------

Use a current 64-bit Raspberry Pi OS (Debian) or Ubuntu Server. A Pi 4 or 5
with 2 GB or more of RAM is comfortable. Give the machine a static IPv4
address on the LAN, or a DHCP reservation.

Software
--------

You need:

- Python 3.11 or newer
- Node.js 18 or newer (22 recommended)
- Chromium (used by the unofficial WhatsApp Web client)
- sqlite3 (or PostgreSQL, if you prefer)
- systemd

The install script at ``deploy/install.sh`` installs the Debian packages,
creates a virtualenv, builds the admin UI, seeds the database, and installs
parameterized systemd units.

Install
-------

From a clone of this repository::

    sudo ./deploy/install.sh --dir /opt/shearbook --user salon

Then:

1. Review ``/opt/shearbook/.env``. Generated secrets are already filled in.
2. Create an admin user::

       sudo -u salon /opt/shearbook/.venv/bin/shearbook create-admin -u admin

3. Visit ``http://127.0.0.1:8000`` (or the Pi's LAN address through a reverse
   proxy) and sign in.
4. Open the WhatsApp page and scan the QR code with the salon phone.
5. Add stylists, services, weekly hours and assignments.

Google Calendar (optional)
--------------------------

1. In Google Cloud, create a project and enable the Calendar API.
2. Create a Desktop OAuth client and download the client JSON to
   ``credentials/credentials.json`` on the Pi. Do not put this file in git.
3. Run ``shearbook auth-google`` on the Pi (it starts a local loopback
   flow — use a forwarded display or run the command from a machine that can
   complete the browser step and copy ``token.json`` over).
4. Set ``CALENDAR_BACKEND=google`` and restart ``shearbook-api``.

Remote access
-------------

Do not expose Flask or the WhatsApp port to the public internet without a
reverse proxy and HTTPS. Two workable options:

- **Cloudflare Tunnel** — run ``cloudflared`` as a service and point a
  hostname at ``http://127.0.0.1:8000``.
- **Tailscale Funnel** or a Tailscale subnet — keep the Pi on your tailnet
  and, if you want, publish only the admin UI via Funnel.

The WhatsApp admin API already binds to ``127.0.0.1`` only. Flask should stay
on loopback and let the proxy terminate TLS.

Backups
-------

``scripts/backup.sh`` copies the SQLite database and the WhatsApp Web session
directory. Run it from cron, for example daily::

    15 3 * * * /opt/shearbook/scripts/backup.sh /var/backups/shearbook

Keep the backup off the Pi as well (another disk, or an object store you
control). After a restore, restart both systemd units so the bot reloads its
session.

Updates
-------

::

    sudo -u salon git -C /opt/shearbook pull
    sudo -u salon /opt/shearbook/.venv/bin/pip install -e /opt/shearbook
    sudo -u salon bash -lc 'cd /opt/shearbook/bot && npm install'
    sudo -u salon bash -lc 'cd /opt/shearbook/admin && npm install && npm run build'
    sudo systemctl restart shearbook-api shearbook-bot

Limitations of this layout
--------------------------

This is a one-box, one-salon deployment. The settings cache is in-process, so
run a small number of gunicorn workers (the unit uses two). The WhatsApp
integration uses ``whatsapp-web.js``, which is an unofficial client and may
stop working or violate WhatsApp's terms; see the README.
