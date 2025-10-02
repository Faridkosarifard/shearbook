# Standard library
from pathlib import Path

# Third-party (others)
import typer
from rich import print

# Friseurbot
from friseurbot.cli.helpers import run_command
from friseurbot.utils.db.manager import db_manager
from friseurbot.utils.db.seed import seed_services
from friseurbot.utils.db.seed import seed_settings

app = typer.Typer(help="Database management")
BASE_DIR = Path(__file__).resolve().parents[2]


@app.command()
def initialize():
    """Run database migrations using Alembic."""
    print("[bold green]🗄 Initializing database (Alembic upgrade head)...[/bold green]")
    run_command(["alembic", "-c", "alembic.ini", "upgrade", "head"], cwd=BASE_DIR)


@app.command()
def seed():
    """Insert initial data into the database."""
    print("[bold green]🌱 Seeding database with initial data...[/bold green]")
    db = db_manager.get_session()
    try:
        seed_services(db)
        seed_settings(db)
        db.commit()
        print("[bold cyan]✅ Database seeded successfully![/bold cyan]")
    except Exception as e:
        db.rollback()
        print(f"[bold red]❌ Error while seeding: {e}[/bold red]")
    finally:
        db_manager.close()
