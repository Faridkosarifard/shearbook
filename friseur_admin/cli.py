import subprocess
from pathlib import Path

import requests
import typer
from rich import print

app = typer.Typer(help="Admin CLI for ShearBook")

BASE_DIR = Path(__file__).parent.parent.resolve()
FRONTEND_DIR = BASE_DIR / "admin-panel"
CREATE_ADMIN_SCRIPT = BASE_DIR / "friseur_admin" / "create_admin.py"


@app.command()
def start_backend():
    print("[bold green]✅ Starting Backend (Flask)...[/bold green]")
    subprocess.run(["flask", "run"])


@app.command()
def stop_backend():
    print("[bold yellow]⏸ Stopping Backend (Flask)...[/bold yellow]")
    subprocess.run(["pkill", "-f", "flask"])


@app.command()
def start_frontend():
    print(FRONTEND_DIR)
    print("[bold green]✅ Starting Frontend (Vite)...[/bold green]")
    subprocess.run(["npm", "run", "dev"], cwd=FRONTEND_DIR, shell=True)


@app.command()
def build_frontend():
    print("[bold blue]🔨 Building Frontend (npm run build)...[/bold blue]")
    subprocess.run(["npm", "run", "build"], cwd=FRONTEND_DIR)


@app.command()
def health_check():
    print("\n[bold cyan]📋 Health Check Results:[/bold cyan]")
    try:
        r = requests.get("http://localhost:5000/health")
        print(f"Backend: {'✅ UP' if r.status_code == 200 else '❌ DOWN'}")
    except Exception:
        print("Backend: ❌ DOWN")
    try:
        r = requests.get("http://localhost:5173")
        print(f"Frontend: {'✅ UP' if r.status_code == 200 else '❌ DOWN'}")
    except Exception:
        print("Frontend: ❌ DOWN")


@app.command()
def create_admin(username: str = typer.Option(...), password: str = typer.Option(...)):
    print(f"[bold magenta]👤 Creating admin user: {username}[/bold magenta]")
    subprocess.run(
        ["python", str(CREATE_ADMIN_SCRIPT)],
        input=f"{username}\n{password}\n",
        text=True,
    )
    print(f"[bold green]✅ Admin '{username}' creation triggered.[/bold green]")


@app.command()
def status():
    print("[bold cyan]📊 Current process status:[/bold cyan]")
    subprocess.run(["ps", "aux"])


@app.command()
def restart_all():
    stop_backend()
    start_backend()
    start_frontend()


def main():
    app()


if __name__ == "__main__":
    main()
