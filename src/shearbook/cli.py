"""Command-line interface for ShearBook."""

from __future__ import annotations

import os
from pathlib import Path

import typer
from rich import print

from shearbook.config import REPO_ROOT, load_settings
from shearbook.db.session import configure_engine, create_schema, session_scope

app = typer.Typer(help="ShearBook: salon appointment system", no_args_is_help=True)


def _boot(testing: bool = False):
    settings = load_settings(testing=testing)
    url = settings.database_url
    if url.startswith("sqlite:///"):
        db_path = Path(url.replace("sqlite:///", "", 1))
        if not db_path.is_absolute():
            db_path = REPO_ROOT / db_path
            url = f"sqlite:///{db_path.as_posix()}"
        db_path.parent.mkdir(parents=True, exist_ok=True)
    configure_engine(url)
    return settings


@app.command("init-db")
def init_db():
    """Create database tables."""
    _boot()
    create_schema()
    print("[green]Database schema is ready.[/green]")


@app.command()
def seed():
    """Insert default settings, services, and a demo stylist if they are missing."""
    settings = _boot()
    create_schema()
    from shearbook.calendar.local import LocalCalendar
    from shearbook.db.seed import seed_all

    with session_scope() as session:
        calendar = LocalCalendar(session)
        # For Google backend we still seed a local calendar id first; Google calendars
        # are created when stylists are added from the admin UI after auth.
        seed_all(session, calendar=calendar)
    print("[green]Seed data is in place.[/green]")
    if settings.calendar_backend == "google":
        print(
            "[yellow]Calendar backend is Google. Add stylists from the admin UI after `shearbook auth-google`.[/yellow]"
        )


@app.command("create-admin")
def create_admin_cmd(
    username: str = typer.Option(..., "--username", "-u"),
    password: str = typer.Option(..., "--password", "-p", prompt=True, hide_input=True),
):
    """Create an admin user for the web panel."""
    _boot()
    create_schema()
    from shearbook.users import create_admin

    with session_scope() as session:
        create_admin(session, username, password)
    print(f"[green]Admin '{username}' created.[/green]")


@app.command("change-password")
def change_password_cmd(
    username: str = typer.Option(..., "--username", "-u"),
    password: str = typer.Option(..., "--password", "-p", prompt=True, hide_input=True),
):
    """Change an admin user's password."""
    _boot()
    from shearbook.users import change_password

    with session_scope() as session:
        change_password(session, username, password)
    print(f"[green]Password updated for '{username}'.[/green]")


@app.command("auth-google")
def auth_google():
    """Run the Google OAuth desktop flow and write credentials/token.json."""
    settings = load_settings()
    from shearbook.calendar.google import run_oauth_flow

    path = run_oauth_flow(
        settings.google_token_path, settings.google_credentials_path, settings.google_scopes
    )
    print(f"[green]Token saved to {path}[/green]")


@app.command()
def serve(
    host: str = typer.Option(None, help="Bind address"),
    port: int = typer.Option(None, help="Bind port"),
):
    """Run the development server (use gunicorn in production)."""
    from shearbook.app import create_app

    settings = load_settings()
    application = create_app(settings=settings)
    application.run(
        host=host or settings.host,
        port=port or settings.port,
        debug=os.getenv("FLASK_DEBUG") == "1",
    )


@app.callback()
def _main():
    """ShearBook CLI."""


if __name__ == "__main__":
    app()
