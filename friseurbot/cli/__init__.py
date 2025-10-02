# Third-party (others)
import typer

# Friseurbot
from friseurbot.cli import admin
from friseurbot.cli import backend
from friseurbot.cli import bot
from friseurbot.cli import control
from friseurbot.cli import db
from friseurbot.cli import frontend
from friseurbot.cli import status

app = typer.Typer(help="Admin CLI for ShearBook")


app.add_typer(control.app, name="control")
app.add_typer(backend.app, name="backend")
app.add_typer(frontend.app, name="frontend")
app.add_typer(bot.app, name="bot")
app.add_typer(db.app, name="db")
app.add_typer(admin.app, name="admin")
app.add_typer(status.app, name="ps")

if __name__ == "__main__":
    app()
