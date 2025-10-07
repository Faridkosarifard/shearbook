# Standard library
from contextlib import contextmanager

# Third-party (others)
from flask import Blueprint
from flask import jsonify
from flask import request

# SQLAlchemy
from sqlalchemy import and_
from sqlalchemy import delete
from sqlalchemy import exists
from sqlalchemy import insert
from sqlalchemy import literal
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

# Friseurbot
from friseurbot.entity import Friseur
from friseurbot.entity import Service
from friseurbot.entity import friseur_service
from friseurbot.security import require_bot_or_admin
from friseurbot.security import require_csrf
from friseurbot.utils.db.manager import db_manager

friseur_services_api = Blueprint(
    "friseur_services_api", __name__, url_prefix="/friseure_services"
)


@contextmanager
def session_scope():
    """
    Context manager that provides a transactional SQLAlchemy session.
    """
    session = db_manager.get_session()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def _ensure_friseur(session, friseur_id: int) -> Friseur | None:
    """Return Friseur or None if not exists."""
    return session.get(Friseur, friseur_id)


def _load_services_by_ids(session, service_ids: list[int]) -> list[Service]:
    """Return services for given IDs; preserves no order."""
    if not service_ids:
        return []
    stmt = select(Service).where(Service.id.in_(service_ids))
    return session.scalars(stmt).all()


def _list_services_for_friseur(session, friseur_id: int) -> list[dict]:
    """Return list of services (dict) assigned to friseur_id."""
    stmt = (
        select(Service)
        .join(friseur_service, Service.id == friseur_service.c.service_id)
        .where(friseur_service.c.friseur_id == friseur_id)
        .order_by(Service.position, Service.id)
    )
    rows = session.execute(stmt).unique().scalars().all()
    return [
        {
            "id": s.id,
            "name": s.name,
            "duration_min": s.duration_min,
            "position": s.position,
        }
        for s in rows
    ]


# -----------------------------
# GET /friseure/<id>/services
# -----------------------------
@friseur_services_api.route("/<int:friseur_id>/services", methods=["GET"])
@require_bot_or_admin
def get_friseur_services(friseur_id: int):
    """
    Get the list of services allowed for a given friseur.
    """
    with session_scope() as session:
        fr = _ensure_friseur(session, friseur_id)
        if not fr:
            return (
                jsonify({"status": "not_found", "message": "Friseur not found."}),
                404,
            )

        services = _list_services_for_friseur(session, friseur_id)
        return jsonify(
            {
                "status": "ok",
                "friseur_id": friseur_id,
                "count": len(services),
                "services": services,
            }
        )


# -----------------------------------------
# PUT /friseure/<id>/services  (bulk set)
# -----------------------------------------
@friseur_services_api.route("/<int:friseur_id>/services", methods=["PUT"])
@require_bot_or_admin
@require_csrf
def replace_friseur_services(friseur_id: int):
    """
    Replace the entire allowed service list for the given friseur.

    Request JSON:
      { "service_ids": [1,2,3] }

    Response JSON:
      {
        "status":"ok",
        "friseur_id": 6,
        "added": <n_added>,
        "removed": <n_removed>,
        "services": [...]
      }
    """
    payload = request.get_json(silent=True) or {}
    service_ids = payload.get("service_ids", [])
    if not isinstance(service_ids, list) or any(
        not isinstance(x, int) for x in service_ids
    ):
        return (
            jsonify(
                {"status": "bad_request", "message": "service_ids must be a list[int]."}
            ),
            400,
        )

    # normalize: unique ids
    desired_ids = set(service_ids)

    with session_scope() as session:
        fr = _ensure_friseur(session, friseur_id)
        if not fr:
            return (
                jsonify({"status": "not_found", "message": "Friseur not found."}),
                404,
            )

        # validate IDs exist
        found = _load_services_by_ids(session, list(desired_ids))
        found_ids = {s.id for s in found}
        missing = desired_ids - found_ids
        if missing:
            return (
                jsonify(
                    {
                        "status": "bad_request",
                        "message": f"Unknown service_ids: {sorted(missing)}",
                    }
                ),
                400,
            )

        # current set
        current_stmt = select(friseur_service.c.service_id).where(
            friseur_service.c.friseur_id == friseur_id
        )
        current_ids = {sid for (sid,) in session.execute(current_stmt).all()}

        to_add = sorted(found_ids - current_ids)
        to_remove = sorted(current_ids - found_ids)

        # add (Postgres upsert)
        if to_add:
            stmt_ins = insert(friseur_service).from_select(
                ["friseur_id", "service_id"],
                select(literal(friseur_id), Service.id).where(Service.id.in_(to_add)),
            )
            session.execute(stmt_ins)

        # remove
        removed = 0
        if to_remove:
            del_stmt = delete(friseur_service).where(
                and_(
                    friseur_service.c.friseur_id == friseur_id,
                    friseur_service.c.service_id.in_(to_remove),
                )
            )
            res = session.execute(del_stmt)
            removed = res.rowcount or 0

        # response list
        services = _list_services_for_friseur(session, friseur_id)
        return jsonify(
            {
                "status": "ok",
                "friseur_id": friseur_id,
                "added": len(to_add),
                "removed": removed,
                "services": services,
            }
        )


# -----------------------------------------
# POST /friseure/<id>/services  (append)
# -----------------------------------------
@friseur_services_api.route("/<int:friseur_id>/services", methods=["POST"])
@require_bot_or_admin
@require_csrf
def add_friseur_services(friseur_id: int):
    """
    Append one or multiple services to a friseur without affecting existing ones.

    Request JSON:
      { "service_ids": [1,2,3] }  or  { "service_id": 5 }

    Response:
      {
        "status":"ok",
        "friseur_id": 6,
        "added": <n_added>,
        "services": [...]
      }
    """
    payload = request.get_json(silent=True) or {}
    # support both singular and plural
    if "service_id" in payload and "service_ids" not in payload:
        service_ids = [payload["service_id"]]
    else:
        service_ids = payload.get("service_ids", [])

    if (
        not isinstance(service_ids, list)
        or not service_ids
        or any(not isinstance(x, int) for x in service_ids)
    ):
        return (
            jsonify(
                {
                    "status": "bad_request",
                    "message": "Provide service_id or service_ids (list[int]).",
                }
            ),
            400,
        )

    desired_ids = set(service_ids)

    with session_scope() as session:
        fr = _ensure_friseur(session, friseur_id)
        if not fr:
            return (
                jsonify({"status": "not_found", "message": "Friseur not found."}),
                404,
            )

        # validate exist
        found = _load_services_by_ids(session, list(desired_ids))
        found_ids = {s.id for s in found}
        missing = desired_ids - found_ids
        if missing:
            return (
                jsonify(
                    {
                        "status": "bad_request",
                        "message": f"Unknown service_ids: {sorted(missing)}",
                    }
                ),
                400,
            )

        # upsert insert
        stmt = insert(friseur_service).from_select(
            ["friseur_id", "service_id"],
            select(literal(friseur_id), Service.id).where(
                Service.id.in_(list(found_ids))
            ),
        )
        res = session.execute(stmt)

        services = _list_services_for_friseur(session, friseur_id)
        return jsonify(
            {
                "status": "ok",
                "friseur_id": friseur_id,
                "added": res.rowcount or 0,
                "services": services,
            }
        )


# -------------------------------------------------
# DELETE /friseure/<id>/services/<service_id>
# -------------------------------------------------
@friseur_services_api.route(
    "/<int:friseur_id>/services/<int:service_id>", methods=["DELETE"]
)
@require_bot_or_admin
@require_csrf
def remove_friseur_service(friseur_id: int, service_id: int):
    """
    Remove a single friseur-service link. If you have enforced a composite FK
    from appointments(friseur_id, service_id) -> friseur_service, this may raise
    an IntegrityError if appointments exist. We return 409 in that case.
    """
    with session_scope() as session:
        fr = _ensure_friseur(session, friseur_id)
        if not fr:
            return (
                jsonify({"status": "not_found", "message": "Friseur not found."}),
                404,
            )

        # optional: check service exists to give a cleaner 404
        svc_exists = session.scalar(select(exists().where(Service.id == service_id)))
        if not svc_exists:
            return (
                jsonify({"status": "not_found", "message": "Service not found."}),
                404,
            )

        try:
            del_stmt = delete(friseur_service).where(
                and_(
                    friseur_service.c.friseur_id == friseur_id,
                    friseur_service.c.service_id == service_id,
                )
            )
            res = session.execute(del_stmt)
            deleted = res.rowcount or 0
        except IntegrityError:
            # likely blocked by composite FK because appointments exist
            return (
                jsonify(
                    {
                        "status": "conflict",
                        "message": "Cannot remove link: existing appointments depend on this friseur-service pair.",
                    }
                ),
                409,
            )

        services = _list_services_for_friseur(session, friseur_id)
        return jsonify(
            {
                "status": "ok",
                "friseur_id": friseur_id,
                "deleted": deleted,
                "services": services,
            }
        )


@friseur_services_api.route("/<int:service_id>/friseure", methods=["GET"])
@require_bot_or_admin
def get_friseure_for_service(service_id: int):
    """
    Return list of hairdressers (Friseur) who provide the given service.

    Query params (optional):
      - active=true|false  -> filter by Friseur.active

    Response:
      {
        "status": "ok",
        "service_id": 3,
        "count": 2,
        "friseure": [
          {"id": 6, "name": "Anna", "active": true, "calendar_id": "..." },
          ...
        ]
      }
    """
    active_q = request.args.get("active")
    active_filter = None
    if active_q is not None:
        active_filter = active_q.lower() in ("1", "true", "yes")

    with session_scope() as session:
        svc = session.get(Service, service_id)
        if not svc:
            return (
                jsonify({"status": "not_found", "message": "Service not found."}),
                404,
            )

        stmt = (
            select(Friseur)
            .join(friseur_service, Friseur.id == friseur_service.c.friseur_id)
            .where(friseur_service.c.service_id == service_id)
            .order_by(Friseur.name.asc())
        )
        if active_filter is not None:
            stmt = stmt.where(Friseur.active == active_filter)

        friseure = session.execute(stmt).unique().scalars().all()

        return jsonify(
            [
                {
                    "id": f.id,
                    "name": f.name,
                    "calendar_id": f.calendar_id,
                    "active": f.active,
                }
                for f in friseure
            ]
        )
