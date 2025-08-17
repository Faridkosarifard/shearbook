# friseurbot/api/friseur_schedule.py
from flask import Blueprint, jsonify, request

from friseurbot.entity import (
    ExceptionType,
    Friseur,
    FriseurException,
    FriseurWeeklyHour,
)
from friseurbot.security import require_admin, require_bot_or_admin, require_csrf
from friseurbot.utils.db.manager import db_manager

schedule_api = Blueprint("schedule_api", __name__)


@schedule_api.get("/friseure/<int:friseur_id>/schedule")
@require_bot_or_admin
def get_schedule(friseur_id):
    session = db_manager.get_session()
    try:
        if not session.get(Friseur, friseur_id):
            return jsonify({"status": "error", "message": "friseur_not_found"}), 404

        weekly = (
            session.query(FriseurWeeklyHour)
            .filter(FriseurWeeklyHour.friseur_id == friseur_id)
            .order_by(FriseurWeeklyHour.weekday, FriseurWeeklyHour.start_time)
            .all()
        )
        q = session.query(FriseurException).filter(
            FriseurException.friseur_id == friseur_id
        )
        frm = request.args.get("from")
        to = request.args.get("to")
        if frm:
            q = q.filter(FriseurException.date >= frm)
        if to:
            q = q.filter(FriseurException.date <= to)
        exceptions = q.order_by(FriseurException.date).all()

        def wh_json(x):
            return {
                "id": x.id,
                "weekday": x.weekday,
                "start": x.start_time.isoformat(timespec="minutes"),
                "end": x.end_time.isoformat(timespec="minutes"),
            }

        def ex_json(x):
            body = {
                "id": x.id,
                "date": x.date.isoformat(),
                "type": x.type.value,
                "note": x.note,
            }
            if x.type == ExceptionType.CUSTOM:
                body.update(
                    {
                        "start": x.start_time.isoformat(timespec="minutes"),
                        "end": x.end_time.isoformat(timespec="minutes"),
                    }
                )
            return body

        return jsonify(
            {
                "status": "ok",
                "weekly": [wh_json(x) for x in weekly],
                "exceptions": [ex_json(x) for x in exceptions],
            }
        )
    finally:
        db_manager.close()


@schedule_api.put("/friseure/<int:friseur_id>/schedule")
@require_admin
@require_csrf
def upsert_schedule(friseur_id):
    """
    Body:
    { "weekly": [
        {"weekday":0,"start":"09:00","end":"13:00"},
        {"weekday":0,"start":"14:00","end":"18:00"},
        {"weekday":1,"start":"10:00","end":"16:00"}
      ]
    }
    """
    data = request.get_json(silent=True) or {}
    weekly = data.get("weekly", [])
    session = db_manager.get_session()
    try:
        if not session.get(Friseur, friseur_id):
            return jsonify({"status": "error", "message": "friseur_not_found"}), 404

        session.query(FriseurWeeklyHour).filter_by(friseur_id=friseur_id).delete()
        for item in weekly:
            session.add(
                FriseurWeeklyHour(
                    friseur_id=friseur_id,
                    weekday=int(item["weekday"]),
                    start_time=item["start"],
                    end_time=item["end"],
                )
            )
        session.commit()
        return jsonify({"status": "ok"})
    except Exception as e:
        session.rollback()
        return jsonify({"status": "error", "message": str(e)}), 400
    finally:
        db_manager.close()


@schedule_api.post("/friseure/<int:friseur_id>/exceptions")
@require_admin
@require_csrf
def add_exception(friseur_id):
    """
    Body:
    OFF:
      {"type":"OFF","date":"2025-08-25","note":"Vacation"}
    CUSTOM:
      {"type":"CUSTOM","date":"2025-08-26","start":"11:00","end":"15:00","note":"Short day"}
    """
    data = request.get_json(silent=True) or {}
    session = db_manager.get_session()
    try:
        if not session.get(Friseur, friseur_id):
            return jsonify({"status": "error", "message": "friseur_not_found"}), 404

        ex_type = ExceptionType(data["type"])
        ex = FriseurException(
            friseur_id=friseur_id,
            date=data["date"],
            type=ex_type,
            start_time=data.get("start"),
            end_time=data.get("end"),
            note=data.get("note"),
        )
        session.add(ex)
        session.commit()
        return jsonify({"status": "ok", "id": ex.id})
    except Exception as e:
        session.rollback()
        return jsonify({"status": "error", "message": str(e)}), 400
    finally:
        db_manager.close()


@schedule_api.delete("/friseure/<int:friseur_id>/exceptions/<int:ex_id>")
@require_admin
@require_csrf
def delete_exception(friseur_id, ex_id):
    session = db_manager.get_session()
    try:
        n = (
            session.query(FriseurException)
            .filter_by(friseur_id=friseur_id, id=ex_id)
            .delete()
        )
        session.commit()
        return jsonify({"status": "ok", "deleted": n})
    except Exception as e:
        session.rollback()
        return jsonify({"status": "error", "message": str(e)}), 400
    finally:
        db_manager.close()
