import typer

from friseurbot.cli import admin, backend, bot, control, db, frontend, status

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
