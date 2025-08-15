import typer
from rich import print

from friseurbot.utils.db.admin_tools import create_admin

app = typer.Typer(help="Admin management")


@app.command()
def create(
    username: str = typer.Option(..., "--username", "-u", help="Admin username"),
    password: str = typer.Option(..., "--password", "-p", help="Admin password"),
):
    """Create an admin user."""
    print("[bold green]👤 Creating Admin User...[/bold green]")
    success = create_admin(username, password)
    if success:
        print(f"[bold cyan]Admin '{username}' created successfully![/bold cyan]")
    else:
        print(f"[bold yellow]⚠️ Admin '{username}' could not be created.[/bold yellow]")
