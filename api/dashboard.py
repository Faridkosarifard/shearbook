import datetime

from flask import Blueprint, jsonify
from sqlalchemy import func

from entity import Appointment, Service
from utils.db import SessionLocal

stats_api = Blueprint("stats_api", __name__)


@stats_api.route("/appointments/today", methods=["GET"])
def appointments_today():
    session = SessionLocal()
    today = datetime.date.today()
    results = (
        session.query(Appointment)
        .filter(Appointment.date == today)
        .order_by(Appointment.time)
        .all()
    )
    data = [
        {
            "name": a.name,
            "service": a.service.name if a.service else "",
            "time": a.time.strftime("%H:%M"),
        }
        for a in results
    ]
    session.close()
    return jsonify(data)


@stats_api.route("/appointments/week-count", methods=["GET"])
def appointments_this_week():
    session = SessionLocal()
    today = datetime.date.today()
    monday = today - datetime.timedelta(days=today.weekday())
    sunday = monday + datetime.timedelta(days=6)
    count = (
        session.query(func.count(Appointment.id))
        .filter(Appointment.date.between(monday, sunday))
        .scalar()
    )
    session.close()
    return jsonify({"count": count})


@stats_api.route("/customers/count", methods=["GET"])
def customer_count():
    session = SessionLocal()
    unique_count = session.query(func.count(func.distinct(Appointment.phone))).scalar()
    session.close()
    return jsonify({"count": unique_count})


@stats_api.route("/services/top", methods=["GET"])
def top_services():
    session = SessionLocal()
    result = (
        session.query(Service.name, func.count(Appointment.id))
        .join(Appointment, Appointment.service_id == Service.id)
        .group_by(Service.name)
        .order_by(func.count(Appointment.id).desc())
        .limit(5)
        .all()
    )
    session.close()
    return jsonify([{"service": r[0], "count": r[1]} for r in result])


@stats_api.route("/appointments/tomorrow/message", methods=["GET"])
def appointments_tomorrow_message():
    session = SessionLocal()
    tomorrow = datetime.date.today() + datetime.timedelta(days=1)
    results = (
        session.query(Appointment)
        .filter(Appointment.date == tomorrow)
        .order_by(Appointment.time)
        .all()
    )
    session.close()

    if not results:
        return jsonify({"message": "Keine Termine für morgen."})

    msg_lines = [f"📅 Termine für {tomorrow.strftime('%A, %d.%m.%Y')}:"]
    for a in results:
        name = a.name
        time = a.time.strftime("%H:%M")
        service = a.service.name if a.service else ""
        msg_lines.append(f"• {time} – {name} ({service})")

    return jsonify({"message": "\n".join(msg_lines)})
