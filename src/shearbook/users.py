"""Admin user helpers."""

from __future__ import annotations

import re

import bcrypt
from sqlalchemy import select
from sqlalchemy.orm import Session

from shearbook.models import User

USERNAME_RE = re.compile(r"^[A-Za-z0-9._-]{3,50}$")


def validate_username(username: str) -> str:
    if not isinstance(username, str):
        raise ValueError("Username must be a string.")
    username = username.strip()
    if not USERNAME_RE.match(username):
        raise ValueError("Username must be 3-50 characters: letters, digits, '.', '_' or '-'.")
    return username


def validate_password(password: str) -> str:
    if not isinstance(password, str) or len(password) < 8:
        raise ValueError("Password must be at least 8 characters long.")
    return password


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def create_admin(session: Session, username: str, password: str) -> User:
    username = validate_username(username)
    password = validate_password(password)
    existing = session.scalar(select(User).where(User.username == username))
    if existing:
        raise ValueError(f"User '{username}' already exists.")
    user = User(username=username, password_hash=hash_password(password))
    session.add(user)
    session.flush()
    return user


def change_password(session: Session, username: str, new_password: str) -> User:
    username = validate_username(username)
    new_password = validate_password(new_password)
    user = session.scalar(select(User).where(User.username == username))
    if not user:
        raise ValueError(f"User '{username}' was not found.")
    user.password_hash = hash_password(new_password)
    session.flush()
    return user
