# Standard library
from pathlib import Path

# Third-party (others)
import typer
from rich import print

# Friseurbot
from friseurbot.cli.helpers import run_command
from friseurbot.cli.helpers import run_in_background
from friseurbot.cli.helpers import stop_process

app = typer.Typer(help="Frontend management")
BASE_DIR = Path(__file__).resolve().parents[2]
FRONTEND_DIR = BASE_DIR / "friseurbot" / "admin-panel"
FRONTEND_PID_FILE = BASE_DIR / "frontend.pid"
FRONTEND_LOG_FILE = BASE_DIR / "frontend.log"


@app.command()
def start():
    """Start React frontend (Vite)."""
    print("[bold green]🚀 Starting Frontend (Vite)...[/bold green]")
    if FRONTEND_PID_FILE.exists():
        print("[bold yellow]⚠ Frontend already running. Stop it first.[/bold yellow]")
        return

    try:
        pid = run_in_background(
            ["npm", "run", "dev"], cwd=FRONTEND_DIR, log_file=FRONTEND_LOG_FILE
        )

        with open(FRONTEND_PID_FILE, "w") as f:
            f.write(str(pid))

        print(f"[bold cyan]Frontend started with PID {pid}[/bold cyan]")

    except Exception as e:
        print(f"[bold red]❌ Error starting Frontend: {e}[/bold red]")
    return pid


@app.command()
def stop():
    """Stop React frontend (Vite)."""
    print("[bold yellow]⏹ Stopping Frontend...[/bold yellow]")
    stop_process(FRONTEND_PID_FILE, "Frontend")


@app.command()
def build():
    """Build React frontend (Vite)."""
    print("[bold blue]🔨 Building Frontend (npm run build)...[/bold blue]")
    run_command(["npm", "run", "build"], cwd=FRONTEND_DIR)


@app.command()
def install():
    """Install Node.js dependencies for the Frontend."""
    print(
        "[bold green]📦 Installing Frontend dependencies (npm install)...[/bold green]"
    )
    try:
        run_command(["npm", "install"], cwd=FRONTEND_DIR)
    except Exception as e:
        print(f"[bold red]❌ Error installing Frontend dependencies: {e}[/bold red]")
