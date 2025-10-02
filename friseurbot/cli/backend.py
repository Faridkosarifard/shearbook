# Standard library
import os
from pathlib import Path

# Third-party (others)
import typer
from rich import print

# Friseurbot
from friseurbot.cli.helpers import run_in_background
from friseurbot.cli.helpers import stop_process

app = typer.Typer(help="Backend management")

BASE_DIR = Path(__file__).resolve().parents[2]
PID_FILE = BASE_DIR / "backend.pid"
LOG_FILE = BASE_DIR / "backend.log"


@app.command()
def start():
    """Start Flask backend."""
    print("[bold green]🚀 Starting Backend (Flask)...[/bold green]")

    if PID_FILE.exists():
        print("[bold yellow]⚠ Backend already running. Stop it first.[/bold yellow]")
        return

    env = os.environ.copy()
    env["FLASK_APP"] = "friseurbot/main.py"
    env["FLASK_ENV"] = "development"

    pid = run_in_background(["flask", "run"], cwd=BASE_DIR, log_file=LOG_FILE, env=env)

    with open(PID_FILE, "w") as f:
        f.write(str(pid))

    print(f"[bold cyan]Backend started with PID {pid}[/bold cyan]")
    return pid


@app.command()
def stop():
    """Stop Flask backend."""
    print("[bold yellow]⏹ Stopping Backend...[/bold yellow]")
    stop_process(PID_FILE, "Backend")
