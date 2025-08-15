import typer
from rich import print
from rich.table import Table

from friseurbot.cli.backend import start as backend_start
from friseurbot.cli.backend import stop as backend_stop
from friseurbot.cli.bot import start as bot_start
from friseurbot.cli.bot import stop as bot_stop
from friseurbot.cli.frontend import start as frontend_start
from friseurbot.cli.frontend import stop as frontend_stop

app = typer.Typer(help="Control all services together")


@app.command()
def start_all():
    """Start Backend, Frontend and Bot together."""
    print("[bold green]🚀 Starting all services...[/bold green]")
    statuses = []

    try:
        backend_pid = backend_start()
        statuses.append(("Backend", "✅ Running", backend_pid, "backend.log"))

        frontend_pid = frontend_start()
        statuses.append(("Frontend", "✅ Running", frontend_pid, "frontend.log"))

        bot_pid = bot_start()
        statuses.append(("Bot", "✅ Running", bot_pid, "bot.log"))

    except Exception as e:
        print(f"[bold red]❌ Error starting services: {e}[/bold red]")
        return

    table = Table(title="Friseurbot Services")
    table.add_column("Service", style="cyan", no_wrap=True)
    table.add_column("Status", style="green")
    table.add_column("PID", style="magenta")
    table.add_column("Logs", style="yellow")

    for service, status, pid, log_file in statuses:
        table.add_row(service, status, str(pid), log_file)

    print(table)


@app.command()
def stop_all():
    """Stop Backend, Frontend and Bot together."""
    print("[bold yellow]⏹ Stopping all services...[/bold yellow]")
    statuses = []

    try:
        backend_stop()
        statuses.append(("Backend", "⏹ Stopped"))

        frontend_stop()
        statuses.append(("Frontend", "⏹ Stopped"))

        bot_stop()
        statuses.append(("Bot", "⏹ Stopped"))

    except Exception as e:
        print(f"[bold red]❌ Error stopping services: {e}[/bold red]")
        return

    table = Table(title="Friseurbot Services Stopped")
    table.add_column("Service", style="cyan", no_wrap=True)
    table.add_column("Status", style="yellow")

    for service, status in statuses:
        table.add_row(service, status)

    print(table)
