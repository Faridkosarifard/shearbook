# Friseurbot

💈 **Friseurbot** is an end-to-end booking system for beauty/hair salons. It includes:

- A **Flask (Python)** backend with Google Calendar integration
- A **React + Tailwind + Vite** admin UI
- A **WhatsApp bot** (Node.js, `whatsapp-web.js`) for customers to book, change, or cancel appointments

The system manages services, stylists, working hours & exceptions, and customers — with fine-grained availability logic (weekly templates, exceptions, global days off, Baden-Württemberg public holidays, and Google Calendar busy times).

---

## 📚 Features

- **Bookings**: create, update, cancel (via UI & WhatsApp bot)
- **Availability**:
  - Global days off (`days_off` setting)
  - Per-stylist weekly template (multiple ranges per weekday)
  - Per-stylist exceptions: `OFF` (all-day) and `CUSTOM` (partial closures)
  - Google Calendar busy events respected
  - Public holiday detection (Baden-Württemberg)
- **Calendar UI**:
  - Week/Day/Month views
  - Filter by stylist, optional resource/column view
  - Color coding per service + per stylist outline
- **Services & Stylists**:
  - Manage services (with duration & display order)
  - Manage stylists (active/inactive, calendar mapping)
- **Settings**:
  - Business hours, days off, message templates (e.g. booking/Help text) with caching
- **WhatsApp bot**:
  - Flows: `termin` (new), `ändern` (change), `absagen` (cancel)
  - Blacklist check
  - Friendly step-by-step UX with validation and reasoned errors (“stylist off”, “public holiday”, …)
- **Customer management**:
  - Save customers on booking
- **Security**:
  - Bot vs Admin authorization, CSRF for state-changing requests

---

## 🗂 Project Structure (high-level)

```
friseurbot/
  api/                  # Flask blueprints (appointments, free_times, ...)
  entity/               # SQLAlchemy models (Appointment, Service, Friseur, ...)
  utils/                # Google auth, calendar tools, DB manager, settings, ...
  credentials/          # token.json (Google OAuth) - path configurable
  ...
bot/
  handlers/             # changeHandler, cancelHandler, bookingHandler, ...
  utils/                # backend axios client, settingsHelper, logger, ...
  index.js              # WhatsApp bot entrypoint
admin-ui/
  src/
    TerminListe.jsx     # Calendar UI
    FriseurSchedulePage.jsx # Stylists weekly template & exceptions editor
    AddAppointmentModal.jsx # Create booking modal (select stylist included)
    api.js              # Axios client for admin UI
```

---

## 🚀 Quick Start

### 1) Backend (Flask + Poetry)

**Prerequisites**
- Python 3.11+
- PostgreSQL (recommended)
- A valid Google OAuth token (`token.json`) with Calendar scope

**Install & Run**
```bash
poetry install
poetry run python app.py
# or with a WSGI server in production (e.g. gunicorn)
# poetry run gunicorn -w 4 'app:app'
```

**Environment / Config**
- Google credentials/scopes:
  - `GOOGLE_TOKEN_PATH` (optional): path to `token.json`
  - `GOOGLE_SCOPES` (optional): defaults to `https://www.googleapis.com/auth/calendar`
  - If not provided, token defaults to: `<repo_root>/friseurbot/credentials/token.json`
- App secrets / DB:
  - e.g. `DATABASE_URL`, `SECRET_KEY`, admin cookie key, bot token, CSRF secrets

> If your token is expired and has a `refresh_token`, it will refresh automatically. Otherwise, re-run OAuth consent to regenerate `token.json`.

```env
# .env (backend) - example
DATABASE_URL=postgresql+psycopg2://user:pass@localhost:5432/friseurbot
SECRET_KEY=change-me
BOT_TOKEN=super-secret-bot-token
CSRF_SECRET=change-me-too

# Google
GOOGLE_TOKEN_PATH=/opt/friseurbot/friseurbot/credentials/token.json
GOOGLE_SCOPES=https://www.googleapis.com/auth/calendar
```

---

### 2) Admin UI (React + Vite + Tailwind)

**Prerequisites**
- Node.js 18+ (recommended) / 20+
- The backend must be reachable (e.g. `/api` or same origin in dev)

**Install & Run**
```bash
npm install
npm run dev
```

- Calendar view (week/day/month), filter by stylist, resource (column) view
- Add / edit appointments
- Manage services & stylists
- **Termin creation modal** includes **stylist selection** and passes both `friseur_id` and `calendar_id` to `/create-event`

---

### 3) WhatsApp Bot (Node.js + whatsapp-web.js)

**Prerequisites**
- Node.js 18+ (works with 20/22 too)
- A terminal to scan QR code (first run)

**Configure**
- `.env` (for the bot process):
  - `BACKEND_URL` → e.g. `http://localhost:8000` (must be accessible)
  - `X_BOT_TOKEN` or header configured by your axios client
  - (optional) settings cache TTL, logger level, etc.

**Run**
```bash
node bot/index.js
# On first run, scan the QR code displayed in the terminal.
```

**Commands**
- `termin` → start booking (choose service → stylist → date → time → name)
- `ändern` → change existing appointment by reservation code (the bot asks for the code, validates ownership, then proceeds)
- `absagen` → cancel existing appointment (the bot asks for the code first, then confirms)

The bot:
- Checks blacklist (`/blacklist/:phone`)
- Fetches services (`/services`)
- Uses `/free-times` to load slots; if none, it returns a specific reason and offers suggestions

```env
# .env (bot) - example
BACKEND_URL=http://localhost:8000
X_BOT_TOKEN=super-secret-bot-token
FR_SETTINGS_TTL_MS=60000
LOG_LEVEL=info
```

---

## ⚙️ Settings

Settings are read via the backend `/settings` endpoint and cached in the bot (`utils/settingsHelper.js`, TTL = 60s by default). Examples:

- `business_hours_start` / `business_hours_end` (fallback 09:00–18:00)
- `days_off` (comma-separated weekday names → salon closed globally)
- `booking_text` (template used in bot confirmation)
- `help_text` (bot help message)

---

## 🔌 API Overview (selected)

### `POST /create-event`  *(Bot/Admin, CSRF)*
Create a Google Calendar event + DB appointment.

Body:
```json
{
  "name": "Jane Doe",
  "phone": "4912345678",
  "service_id": 1,
  "start": "2025-08-29T14:30:00",
  "calendar_id": "example@group.calendar.google.com",
  "friseur_id": 2
}
```
Returns `{"status":"ok","reservation_code":"KR-0829-1234"}`

> **Note:** Both `friseur_id` **and** `calendar_id` are required when creating events.

---

### `POST /free-times`  *(Bot/Admin)*
Return free time slots for a given date & duration (optionally per stylist).

Body:
```json
{ "date": "2025-08-29", "duration": 30, "friseur_id": 2 }
```

Enhanced variant (server-side) returns a **reason** in addition to slots (used by the bot to send friendly messages):

Possible reasons:
- `ok` (has slots)
- `global_day_off` (salon closed by setting)
- `public_holiday` (Baden-Württemberg holiday)
- `stylist_off` (stylist OFF exception)
- `closed_weekly` (no weekly rows for that weekday)
- `no_calendar` (no calendar mapped to stylist)
- `no_windows` (no working windows after exceptions)
- `fully_booked` (all windows filled by existing events)
- `invalid` (bad input)

---

### `GET /appointments`  *(Admin)*
List all appointments (joined with service & stylist).

Returns:
```json
[
  {
    "id": 1,
    "name": "Jane Doe",
    "phone": "49123...",
    "service": "Damen Haarschnitt",
    "duration": 45,
    "date": "2025-08-29",
    "time": "14:30",
    "reservation_code": "KR-0829-1234",
    "friseur_id": 2,
    "friseur_name": "Alex",
    "calendar_id": "..."
  }
]
```

---

### `PUT /update-reservation/<code>`  *(Bot/Admin, CSRF)*
Change date/time of a booking.

Body:
```json
{ "new_date": "2025-09-01", "new_time": "11:00" }
```

---

### `DELETE /cancel-reservation/<code>`  *(Bot/Admin, CSRF)*
Cancel a booking by reservation code.

---

### `GET /appointment/<code>`
Return appointment details.  
- Public requests must include `?phone=<number>` and match the stored phone.
- Bot/Admin requests do not need `phone`.

---

### `GET /appointment/change/<code>`
Verify a reservation code before change.  
- Public requests must include `?phone=<number>`.

---

## 🧠 Availability Logic (Server)

- **Global days off**: `days_off` setting (e.g., `sunday, monday` → salon closed on these weekdays)
- **Public holidays**: Baden-Württemberg holidays are treated as closed (`public_holiday`)
- **Per-stylist weekly template**: base working windows by weekday
- **Per-stylist exceptions**:
  - `OFF`: closed all day
  - `CUSTOM`: partial closures subtracted from weekly windows
- **Google Calendar busy**: events are fetched and subtracted per working window
- **Today filter**: past times are automatically excluded

**Slot generation**: step equals the service duration.

---

## 🧩 Admin UI Notes

- Calendar shows color coding by **service** (fill) and outlines by **stylist**.
- Filter by stylist; optional **resource/column view** groups events by stylist.
- **Termin creation modal** includes **stylist selection** and passes both `friseur_id` and `calendar_id` to `/create-event`.
- **Schedule editor**:
  - Create multiple time ranges per weekday
  - Add exceptions (`OFF`/`CUSTOM`)
  - *(Optional)* Bulk OFF range can be enabled with a new backend endpoint (e.g., `POST /friseure/<id>/exceptions/bulk-off` with `start_date`, `end_date`).

---

## 🔐 Security

- **Bot vs Admin**:
  - Bot calls include an `X-Bot-Token` header; verified on the server (`require_bot_or_admin`)
  - Admin UI uses a cookie/session (`require_admin`)
- **CSRF**:
  - Required for state-changing operations (e.g., create, update, delete)
- **Public access**:
  - Certain endpoints allow public read only if `phone` matches the record; otherwise 403

---

## 🧪 Development Tips

- Use **settings** to customize the bot’s help/booking texts without code changes.
- If availability returns no slots, the bot now sends a **specific reason** and suggests up to three alternative days that truly have slots.
- Admin UI `TerminListe.jsx`: filtering by stylist and resource view both rely on `friseur_id` attached to each event.

---

## 📄 License

MIT (or your preferred license)

---

## 🙌 Credits

- Flask, SQLAlchemy
- React, Vite, Tailwind, react-big-calendar
- whatsapp-web.js
- Google Calendar API
