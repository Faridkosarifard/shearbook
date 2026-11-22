import datetime

from flask import Blueprint, current_app, jsonify
from sqlalchemy import func

from shearbook.db.session import get_session
from shearbook.models import Appointment, Service
from shearbook.security import require_admin, require_bot_token
from shearbook.timeutil import now_tz

dashboard_api = Blueprint("dashboard", __name__)


@dashboard_api.get("/dashboard")
@require_admin
def overview():
    session = get_session()
    today = now_tz(current_app.config["TIMEZONE"]).date()
    monday = today - datetime.timedelta(days=today.weekday())
    sunday = monday + datetime.timedelta(days=6)
    todays = (
        session.query(Appointment)
        .filter(Appointment.date == today)
        .order_by(Appointment.time)
        .all()
    )
    week_count = (
        session.query(func.count(Appointment.id))
        .filter(Appointment.date.between(monday, sunday))
        .scalar()
    )
    customers = session.query(func.count(func.distinct(Appointment.phone))).scalar()
    top = (
        session.query(Service.name, func.count(Appointment.id))
        .join(Appointment, Appointment.service_id == Service.id)
        .group_by(Service.name)
        .order_by(func.count(Appointment.id).desc())
        .limit(5)
        .all()
    )
    return jsonify(
        {
            "today": [
                {
                    "name": a.name,
                    "service": a.service.name if a.service else "",
                    "time": a.time.strftime("%H:%M"),
                    "stylist": a.stylist.name if a.stylist else "",
                    "reservation_code": a.reservation_code,
                }
                for a in todays
            ],
            "week_count": week_count,
            "customer_count": customers,
            "top_services": [{"service": name, "count": count} for name, count in top],
        }
    )


@dashboard_api.get("/appointments/tomorrow/message")
@require_bot_token
def tomorrow_message():
    session = get_session()
    tomorrow = now_tz(current_app.config["TIMEZONE"]).date() + datetime.timedelta(days=1)
    rows = (
        session.query(Appointment)
        .filter(Appointment.date == tomorrow)
        .order_by(Appointment.time)
        .all()
    )
    locale = current_app.config.get("CUSTOMER_LOCALE", "de")
    if not rows:
        msg = "Keine Termine für morgen." if locale != "en" else "No appointments for tomorrow."
        return jsonify({"message": msg, "count": 0})
    header = (
        f"Termine für {tomorrow.strftime('%d.%m.%Y')}:"
        if locale != "en"
        else f"Appointments for {tomorrow.isoformat()}:"
    )
    lines = [header]
    for a in rows:
        service = a.service.name if a.service else ""
        lines.append(f"• {a.time.strftime('%H:%M')} – {a.name} ({service})")
    return jsonify({"message": "\n".join(lines), "count": len(rows)})
