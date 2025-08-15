import subprocess
import sys
from pathlib import Path

import psutil
import typer
from rich import print


def run_command(command, cwd=None):
    try:
        subprocess.run(
            command,
            cwd=cwd,
            shell=True if sys.platform == "win32" else False,
            check=True,
        )
        print(
            f"[bold green]✅ Command executed successfully: {' '.join(command)}[/bold green]"
        )
    except subprocess.CalledProcessError as e:
        print(f"[bold red]❌ Error executing command: {e}[/bold red]")


def run_in_background(command, cwd=None, log_file="process.log", env=None):
    try:
        with open(log_file, "a") as f:
            process = subprocess.Popen(
                command,
                cwd=cwd,
                shell=True if sys.platform == "win32" else False,
                stdout=f,
                env=env,
                stderr=subprocess.STDOUT,
                close_fds=True,
            )
        print(
            f"[bold green]✅ Started in background with PID {process.pid}[/bold green]"
        )
        return process.pid
    except Exception as e:
        print(f"[bold red]❌ Error starting process: {e}[/bold red]")
        return None


def stop_process(pid_file: Path, service_name: str):
    """Stop a process safely using psutil."""
    if not pid_file.exists():
        print(
            f"[bold red]❌ {service_name}: No PID file found. Service may not be running.[/bold red]"
        )
        return

    with open(pid_file, "r") as f:
        pid = int(f.read().strip())

    try:
        process = psutil.Process(pid)
        process.terminate()
        process.wait(timeout=5)
        print(
            f"[bold cyan]{service_name}: ✅ Process {pid} terminated successfully.[/bold cyan]"
        )
    except psutil.NoSuchProcess:
        print(f"[bold red]{service_name}: ❌ No such process found.[/bold red]")
    except psutil.TimeoutExpired:
        print(
            f"[bold yellow]{service_name}: ⚠ Terminate timed out, killing forcefully...[/bold yellow]"
        )
        try:
            process.kill()
            print(f"[bold cyan]{service_name}: ✅ Process {pid} killed.[/bold cyan]")
        except Exception as e:
            print(f"[bold red]{service_name}: ❌ Error killing process: {e}[/bold red]")
    finally:
        pid_file.unlink(missing_ok=True)


def check_service(name: str, pid_file: Path, log_file: Path):
    if not pid_file.exists():
        return (name, "⏹ Inactive", "-", str(log_file))

    try:
        with open(pid_file, "r") as f:
            pid = int(f.read().strip())
        process = psutil.Process(pid)
        if process.is_running():
            return (name, "✅ Running", str(pid), str(log_file))
        else:
            raise psutil.NoSuchProcess(pid)
    except (psutil.NoSuchProcess, ValueError):

        if typer.confirm(
            f"[bold yellow]{name}: PID file exists but process not running. Remove stale PID file?"
        ):
            pid_file.unlink(missing_ok=True)
            return (name, "🗑️ Cleaned", "-", str(log_file))
        return (name, "❌ Dead PID", "-", str(log_file))
