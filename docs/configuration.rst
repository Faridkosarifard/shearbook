Configuration
=============

ShearBook reads settings from the process environment and, if present, a
``.env`` file in the project root. Copy ``.env.example`` to ``.env`` and fill
it in. Never commit ``.env`` or anything under ``credentials/``.

Secrets
-------

``SECRET_KEY``, ``JWT_SECRET``, ``BOT_TOKEN`` and ``WHATSAPP_ADMIN_TOKEN`` must
be long random strings in production. The application refuses to start when a
placeholder such as ``change-me`` is used outside of tests.

- ``SECRET_KEY`` — Flask secret.
- ``JWT_SECRET`` — signs the admin session cookie.
- ``BOT_TOKEN`` — shared token the WhatsApp process sends as ``X-Bot-Token``.
- ``WHATSAPP_ADMIN_TOKEN`` — token the API uses when it proxies ``/wa/*`` to
  the bot's local admin server.

Database
--------

``DATABASE_URL`` defaults to SQLite at ``data/shearbook.db``. That is the
recommended setup on a single Raspberry Pi. PostgreSQL is optional::

    DATABASE_URL=postgresql+psycopg://user:pass@localhost:5432/shearbook

Salon and locale
----------------

- ``TIMEZONE`` — IANA timezone used for slots and "today" (default
  ``Europe/Berlin``).
- ``CUSTOMER_LOCALE`` — WhatsApp customer language, ``de`` or ``en``.
- ``HOLIDAY_COUNTRY`` / ``HOLIDAY_REGION`` — public holidays (for example
  ``DE`` and ``DE-RP``). Leave the region empty for nationwide holidays only.
- ``RESERVATION_PREFIX`` — prefix of reservation codes.
- ``SLOT_STEP_MIN`` — slot grid, in minutes.

Calendar
--------

``CALENDAR_BACKEND`` is ``local`` (busy times stored in the database) or
``google``. For Google, place a Desktop OAuth client at
``GOOGLE_CREDENTIALS_PATH`` and run ``shearbook auth-google`` once so that
``GOOGLE_TOKEN_PATH`` is written on the machine. Those files are gitignored
and must stay off the repository.

WhatsApp
--------

The Node process talks to the Flask API with ``BACKEND_URL`` and
``BOT_TOKEN``. It also binds a loopback admin API (QR and status) at
``WHATSAPP_ADMIN_URL``. The Flask app proxies ``/wa/*`` to that server after
checking the admin cookie, and attaches ``WHATSAPP_ADMIN_TOKEN`` itself.

``ALLOWED_NUMBERS``, if set, is a comma-separated allow-list of customer
numbers. Leave it empty to accept anyone who is not on the block list.

Admin UI
--------

After ``npm run build`` in ``admin/``, Flask serves ``ADMIN_DIST`` (default
``admin/dist``) at ``/``. During development, Vite on port 5173 proxies
``/api`` and ``/wa`` to the API. Set ``ALLOWED_ORIGINS`` accordingly and use
``COOKIE_SECURE=1`` when serving over HTTPS.
