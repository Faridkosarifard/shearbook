"""Command-line interface for ShearBook."""

from __future__ import annotations

import os
from pathlib import Path

import typer
from rich import print
from rich.markup import escape

from shearbook.config import REPO_ROOT, load_settings
from shearbook.db.session import configure_engine, create_schema, session_scope
from shearbook.envutil import (
    SECRET_KEYS,
    apply_env_updates,
    example_and_target,
    new_secret,
)

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


@app.command("init-env")
def init_env(
    database_url: str | None = typer.Option(
        None,
        "--database-url",
        help="Set DATABASE_URL in the generated .env file.",
    ),
    force: bool = typer.Option(
        False,
        "--force",
        help="Rotate all generated secrets even if .env already has values.",
    ),
):
    """Create or fill a .env file with random secrets."""
    try:
        example, target = example_and_target(REPO_ROOT)
    except FileNotFoundError as exc:
        print(f"[red]{exc}[/red]")
        raise typer.Exit(1) from exc

    created = not target.is_file()
    if created:
        text = example.read_text(encoding="utf-8")
    else:
        text = target.read_text(encoding="utf-8")

    replacements: dict[str, str] = {}
    only_placeholders: set[str] = set()
    if force or created:
        for key in SECRET_KEYS:
            replacements[key] = new_secret()
    else:
        for key in SECRET_KEYS:
            replacements[key] = new_secret()
            only_placeholders.add(key)
    if database_url:
        replacements["DATABASE_URL"] = database_url

    new_text, updated = apply_env_updates(text, replacements, only_if_placeholder=only_placeholders)
    if not created and not updated:
        print(
            f"[yellow]{target} already has secrets set. "
            "Use --force to rotate them, or --database-url to change the database.[/yellow]"
        )
        return

    target.write_text(new_text, encoding="utf-8")
    try:
        target.chmod(0o600)
    except OSError:
        pass

    if created:
        print(f"[green]Wrote {target} with generated secrets.[/green]")
    else:
        print(f"[green]Updated {target} ({', '.join(updated)}).[/green]")
    if database_url and database_url.startswith("postgresql"):
        hint = 'pip install -e ".[postgres]"'
        print("[yellow]PostgreSQL needs the optional driver:[/yellow] " + escape(hint))
    print("Next steps:")
    print("  shearbook init-db")
    print("  shearbook seed")
    print("  shearbook create-admin --username admin")
    print("  shearbook serve")


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
