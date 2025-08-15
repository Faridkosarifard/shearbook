from pathlib import Path

import typer
from rich import print

from friseurbot.cli.helpers import run_command, run_in_background, stop_process

app = typer.Typer(help="Whatsapp Bot management")
BASE_DIR = Path(__file__).resolve().parents[2]
BOT_DIR = BASE_DIR / "friseurbot" / "bot"
BOT_PID_FILE = BASE_DIR / "bot.pid"
BOT_LOG_FILE = BASE_DIR / "bot.log"


@app.command()
def start():
    """Start the WhatsApp bot with npm index.js."""
    print("[bold green]🤖 Starting Bot...[/bold green]")
    if BOT_PID_FILE.exists():
        print("[bold yellow]⚠ Bot already running. Stop it first.[/bold yellow]")
        return

    pid = run_in_background(["npm", "start"], cwd=BOT_DIR, log_file=BOT_LOG_FILE)

    with open(BOT_PID_FILE, "w") as f:
        f.write(str(pid))

    print(f"[bold cyan]Bot started with PID {pid}[/bold cyan]")
    return pid


@app.command()
def stop():
    """Stop WhatsApp Bot."""
    print("[bold yellow]⏹ Stopping Bot...[/bold yellow]")
    stop_process(BOT_PID_FILE, "Bot")


@app.command()
def install():
    """Install Node.js dependencies for the Bot."""
    print("[bold green]📦 Installing Bot dependencies (npm install)...[/bold green]")
    try:
        run_command(["npm", "install"], cwd=BOT_DIR)
    except Exception as e:
        print(f"[bold red]❌ Error installing Bot dependencies: {e}[/bold red]")
