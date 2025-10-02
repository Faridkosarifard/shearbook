# Standard library
import datetime

# Third-party (others)
from flask import Blueprint
from flask import jsonify

# SQLAlchemy
from sqlalchemy import func

# Friseurbot
from friseurbot.entity import Appointment
from friseurbot.entity import Service
from friseurbot.security import require_admin
from friseurbot.security import require_bot_token
from friseurbot.utils.db.manager import db_manager

stats_api = Blueprint("stats_api", __name__)


@stats_api.route("/appointments/today", methods=["GET"])
@require_admin
def appointments_today():
    """
    Return today's appointments ordered by time.

    Access:
        - Admin UI only
    """
    session = db_manager.get_session()
    try:
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
        return jsonify(data)
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500
    finally:
        db_manager.close()


@stats_api.route("/appointments/week-count", methods=["GET"])
@require_admin
def appointments_this_week():
    """
    Return the number of appointments for the current week (Mon–Sun).

    Access:
        - Admin UI only
    """
    session = db_manager.get_session()
    try:
        today = datetime.date.today()
        monday = today - datetime.timedelta(days=today.weekday())
        sunday = monday + datetime.timedelta(days=6)
        count = (
            session.query(func.count(Appointment.id))
            .filter(Appointment.date.between(monday, sunday))
            .scalar()
        )
        return jsonify({"count": count})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500
    finally:
        db_manager.close()


@stats_api.route("/customers/count", methods=["GET"])
@require_admin
def customer_count():
    """
    Return the count of unique customers (distinct phone numbers).

    Access:
        - Admin UI only
    """
    session = db_manager.get_session()
    try:
        unique_count = session.query(
            func.count(func.distinct(Appointment.phone))
        ).scalar()
        return jsonify({"count": unique_count})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500
    finally:
        db_manager.close()


@stats_api.route("/services/top", methods=["GET"])
@require_admin
def top_services():
    """
    Return top 5 services by total appointment count.

    Access:
        - Admin UI only
    """
    session = db_manager.get_session()
    try:
        result = (
            session.query(Service.name, func.count(Appointment.id))
            .join(Appointment, Appointment.service_id == Service.id)
            .group_by(Service.name)
            .order_by(func.count(Appointment.id).desc())
            .limit(5)
            .all()
        )
        return jsonify([{"service": r[0], "count": r[1]} for r in result])
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500
    finally:
        db_manager.close()


@stats_api.route("/appointments/tomorrow/message", methods=["GET"])
@require_bot_token
def appointments_tomorrow_message():
    """
    Build a human-readable message for tomorrow's appointments.
    Intended for Bot usage (e.g., daily reminders).

    Access:
        - Bot only
    """
    session = db_manager.get_session()
    try:
        tomorrow = datetime.date.today() + datetime.timedelta(days=1)
        results = (
            session.query(Appointment)
            .filter(Appointment.date == tomorrow)
            .order_by(Appointment.time)
            .all()
        )

        if not results:
            return jsonify({"message": "Keine Termine für morgen."})

        msg_lines = [f"📅 Termine für {tomorrow.strftime('%A, %d.%m.%Y')}:"]
        for a in results:
            name = a.name
            time = a.time.strftime("%H:%M")
            service = a.service.name if a.service else ""
            msg_lines.append(f"• {time} – {name} ({service})")

        return jsonify({"message": "\n".join(msg_lines)})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500
    finally:
        db_manager.close()
