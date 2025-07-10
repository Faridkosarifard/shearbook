from flask import Blueprint, jsonify

from entity import Blacklist
from utils.db import SessionLocal

blacklist_api = Blueprint("blacklist_api", __name__)


@blacklist_api.route("/blacklist/<phone>", methods=["GET"])
def is_blacklisted(phone: str):
    session = SessionLocal()

    try:
        entry = session.query(Blacklist).filter(Blacklist.phone == phone).first()
        return jsonify({"blacklisted": bool(entry)})
    finally:
        session.close()
