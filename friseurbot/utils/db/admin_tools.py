# friseurbot/utils/admin_tools.py
import re

import bcrypt
from rich import print

from friseurbot.entity import User
from friseurbot.utils.db.manager import db_manager

USERNAME_RE = re.compile(r"^[A-Za-z0-9._-]{3,50}$")


def _validate_username(username: str) -> str:
    """
    Normalize and validate username.
    Returns the trimmed username if valid; raises ValueError otherwise.
    """
    if not isinstance(username, str):
        raise ValueError("Username must be a string.")
    username = username.strip()
    if not USERNAME_RE.match(username):
        raise ValueError("Username must be 3–50 chars, alphanumeric + . _ - only.")
    return username


def _validate_password(password: str) -> str:
    """
    Validate password strength in a lightweight way.
    Returns the original password if valid; raises ValueError otherwise.
    """
    if not isinstance(password, str):
        raise ValueError("Password must be a string.")
    if len(password) < 8:
        raise ValueError("Password must be at least 8 characters long.")
    return password


def create_admin(username: str, password: str) -> bool:
    """
    Create an admin user with the given username and password.

    Returns:
        True if created successfully, False if user already exists or on error.
    """
    try:
        username = _validate_username(username)
        password = _validate_password(password)
    except ValueError as ve:
        print(f"[bold red]❌ Validation error: {ve}[/bold red]")
        return False

    session = db_manager.get_session()
    try:
        existing = session.query(User).filter_by(username=username).first()
        if existing:
            print(f"[bold yellow]⚠️ User '{username}' already exists.[/bold yellow]")
            return False

        hashed_pw = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt())
        admin = User(username=username, password=hashed_pw.decode("utf-8"))
        session.add(admin)
        session.commit()

        print(f"[bold cyan]✅ Admin '{username}' created successfully.[/bold cyan]")
        return True
    except Exception as e:
        session.rollback()
        print(f"[bold red]❌ Error creating admin '{username}': {e}[/bold red]")
        return False
    finally:
        db_manager.close()


def change_admin_password(username: str, new_password: str) -> bool:
    """
    Change password for an existing admin user.

    Returns:
        True on success, False if user not found or on error.
    """
    try:
        username = _validate_username(username)
        new_password = _validate_password(new_password)
    except ValueError as ve:
        print(f"[bold red]❌ Validation error: {ve}[/bold red]")
        return False

    session = db_manager.get_session()
    try:
        user = session.query(User).filter_by(username=username).first()
        if not user:
            print(f"[bold yellow]⚠️ User '{username}' not found.[/bold yellow]")
            return False

        hashed_pw = bcrypt.hashpw(new_password.encode("utf-8"), bcrypt.gensalt())
        user.password = hashed_pw.decode("utf-8")
        session.commit()

        print(f"[bold cyan]🔐 Password updated for '{username}'.[/bold cyan]")
        return True
    except Exception as e:
        session.rollback()
        print(f"[bold red]❌ Error updating password for '{username}': {e}[/bold red]")
        return False
    finally:
        db_manager.close()
