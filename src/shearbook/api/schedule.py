from datetime import date, timedelta

from flask import Blueprint, jsonify, request

from shearbook.db.session import get_session
from shearbook.models import ExceptionType, Stylist, StylistException, StylistWeeklyHour
from shearbook.security import require_admin, require_bot_or_admin, require_csrf
from shearbook.timeutil import parse_hhmm

schedule_api = Blueprint("schedule", __name__)


def _wh_json(row: StylistWeeklyHour) -> dict:
    return {
        "id": row.id,
        "weekday": row.weekday,
        "start": row.start_time.strftime("%H:%M"),
        "end": row.end_time.strftime("%H:%M"),
    }


def _ex_json(row: StylistException) -> dict:
    body = {
        "id": row.id,
        "date": row.date.isoformat(),
        "type": row.type.value,
        "note": row.note,
    }
    if row.type == ExceptionType.CUSTOM and row.start_time and row.end_time:
        body["start"] = row.start_time.strftime("%H:%M")
        body["end"] = row.end_time.strftime("%H:%M")
    return body


@schedule_api.get("/stylists/<int:stylist_id>/schedule")
@require_bot_or_admin
def get_schedule(stylist_id: int):
    session = get_session()
    if not session.get(Stylist, stylist_id):
        return jsonify({"status": "error", "message": "not_found"}), 404
    weekly = (
        session.query(StylistWeeklyHour)
        .filter_by(stylist_id=stylist_id)
        .order_by(StylistWeeklyHour.weekday, StylistWeeklyHour.start_time)
        .all()
    )
    query = session.query(StylistException).filter_by(stylist_id=stylist_id)
    start = request.args.get("from")
    end = request.args.get("to")
    if start:
        query = query.filter(StylistException.date >= date.fromisoformat(start))
    if end:
        query = query.filter(StylistException.date <= date.fromisoformat(end))
    exceptions = query.order_by(StylistException.date).all()
    return jsonify(
        {
            "status": "ok",
            "weekly": [_wh_json(x) for x in weekly],
            "exceptions": [_ex_json(x) for x in exceptions],
        }
    )


@schedule_api.put("/stylists/<int:stylist_id>/schedule")
@require_admin
@require_csrf
def upsert_schedule(stylist_id: int):
    data = request.get_json(silent=True) or {}
    weekly = data.get("weekly", [])
    session = get_session()
    if not session.get(Stylist, stylist_id):
        return jsonify({"status": "error", "message": "not_found"}), 404
    session.query(StylistWeeklyHour).filter_by(stylist_id=stylist_id).delete()
    try:
        for item in weekly:
            start = parse_hhmm(item["start"])
            end = parse_hhmm(item["end"])
            weekday = int(item["weekday"])
            if start is None or end is None or end <= start or weekday < 0 or weekday > 6:
                raise ValueError("invalid window")
            session.add(
                StylistWeeklyHour(
                    stylist_id=stylist_id,
                    weekday=weekday,
                    start_time=start,
                    end_time=end,
                )
            )
        session.commit()
    except Exception as exc:
        session.rollback()
        return jsonify({"status": "error", "message": str(exc)}), 400
    return jsonify({"status": "ok"})


@schedule_api.post("/stylists/<int:stylist_id>/exceptions")
@require_admin
@require_csrf
def add_exception(stylist_id: int):
    data = request.get_json(silent=True) or {}
    session = get_session()
    if not session.get(Stylist, stylist_id):
        return jsonify({"status": "error", "message": "not_found"}), 404
    try:
        ex_type = ExceptionType(data["type"])
        day = date.fromisoformat(data["date"])
        ex = StylistException(
            stylist_id=stylist_id,
            date=day,
            type=ex_type,
            start_time=parse_hhmm(data.get("start")) if data.get("start") else None,
            end_time=parse_hhmm(data.get("end")) if data.get("end") else None,
            note=data.get("note"),
        )
        if ex_type == ExceptionType.CUSTOM and (
            not ex.start_time or not ex.end_time or ex.end_time <= ex.start_time
        ):
            raise ValueError("CUSTOM exceptions need a start and end time")
        session.add(ex)
        session.commit()
        return jsonify({"status": "ok", "id": ex.id})
    except Exception as exc:
        session.rollback()
        return jsonify({"status": "error", "message": str(exc)}), 400


@schedule_api.post("/stylists/<int:stylist_id>/exceptions/bulk-off")
@require_admin
@require_csrf
def bulk_off(stylist_id: int):
    data = request.get_json(silent=True) or {}
    session = get_session()
    if not session.get(Stylist, stylist_id):
        return jsonify({"status": "error", "message": "not_found"}), 404
    try:
        start = date.fromisoformat(data["start_date"])
        end = date.fromisoformat(data["end_date"])
        if end < start:
            raise ValueError("end_date must be on or after start_date")
        created = 0
        day = start
        while day <= end:
            exists = (
                session.query(StylistException)
                .filter_by(stylist_id=stylist_id, date=day, type=ExceptionType.OFF)
                .first()
            )
            if not exists:
                session.add(
                    StylistException(
                        stylist_id=stylist_id,
                        date=day,
                        type=ExceptionType.OFF,
                        note=data.get("note"),
                    )
                )
                created += 1
            day += timedelta(days=1)
        session.commit()
        return jsonify({"status": "ok", "created": created})
    except Exception as exc:
        session.rollback()
        return jsonify({"status": "error", "message": str(exc)}), 400


@schedule_api.delete("/stylists/<int:stylist_id>/exceptions/<int:ex_id>")
@require_admin
@require_csrf
def delete_exception(stylist_id: int, ex_id: int):
    session = get_session()
    n = session.query(StylistException).filter_by(stylist_id=stylist_id, id=ex_id).delete()
    session.commit()
    return jsonify({"status": "ok", "deleted": n})
