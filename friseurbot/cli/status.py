import time
from collections import deque
from pathlib import Path

import psutil
import typer
from rich import print
from rich.console import Console
from rich.layout import Layout
from rich.live import Live
from rich.panel import Panel
from rich.table import Table
from rich.text import Text

from friseurbot.cli.helpers import check_service

app = typer.Typer(help="Check status of Friseurbot services")

BASE_DIR = Path(__file__).resolve().parents[2]

SERVICES = {
    "Backend": {
        "pid_file": BASE_DIR / "backend.pid",
        "log_file": BASE_DIR / "backend.log",
    },
    "Frontend": {
        "pid_file": BASE_DIR / "frontend.pid",
        "log_file": BASE_DIR / "frontend.log",
    },
    "Bot": {"pid_file": BASE_DIR / "bot.pid", "log_file": BASE_DIR / "bot.log"},
}

console = Console()


@app.command()
def show():
    """Show status of Backend, Frontend, and Bot."""
    print("[bold magenta]🔍 Checking Friseurbot services...[/bold magenta]")

    table = Table(title="Friseurbot Services Status")
    table.add_column("Service", style="cyan", no_wrap=True)
    table.add_column("Status", style="green")
    table.add_column("PID", style="magenta")
    table.add_column("Logs", style="yellow")

    for name, paths in SERVICES.items():
        status = check_service(name, paths["pid_file"], paths["log_file"])
        table.add_row(*status)

    print(table)


def highlight_line(line: str) -> Text:
    """Apply color highlighting to a log line."""
    if "ERROR" in line.upper():
        return Text(line.strip(), style="bold red")
    elif "WARNING" in line.upper():
        return Text(line.strip(), style="bold yellow")
    elif "INFO" in line.upper():
        return Text(line.strip(), style="bold green")
    else:
        return Text(line.strip(), style="white")


@app.command()
def tail(
    service: str,
    lines: int = typer.Option(
        50, "--lines", "-n", help="Number of last lines to show before streaming"
    ),
):
    """Tail logs of a given service with color highlighting."""
    service = service.capitalize()
    if service not in SERVICES:
        print(
            f"[bold red]❌ Unknown service '{service}'. Choose from: Backend, Frontend, Bot[/bold red]"
        )
        raise typer.Exit(1)

    log_file = SERVICES[service]["log_file"]
    if not log_file.exists():
        print(f"[bold red]❌ Log file not found for {service}: {log_file}[/bold red]")
        raise typer.Exit(1)

    print(
        f"[bold cyan]📜 Showing up to {lines} lines for {service}, then streaming live logs... Press Ctrl+C to stop.[/bold cyan]"
    )

    try:
        with open(log_file, "r", encoding="utf-8", errors="replace") as f:
            # گرفتن آخرین n خط (اگر کمتر بود → فقط همونا)
            last_lines = deque(f, maxlen=lines)
            for line in last_lines:
                console.print(highlight_line(line))

            # رفتن به انتهای فایل برای استریم
            f.seek(0, 2)
            while True:
                line = f.readline()
                if line:
                    console.print(highlight_line(line))
                else:
                    time.sleep(0.5)
    except KeyboardInterrupt:
        print(f"[bold yellow]\n⏹ Stopped tailing logs for {service}[/bold yellow]")


@app.command()
def monitor(
    service: str,
    log_lines: int = typer.Option(
        10, "--log-lines", help="Number of log lines to show"
    ),
):
    """Monitor a given service with CPU/RAM charts and live logs (no clearing)."""
    service = service.capitalize()
    if service not in SERVICES:
        print(
            f"[bold red]❌ Unknown service '{service}'. Choose from: Backend, Frontend, Bot[/bold red]"
        )
        raise typer.Exit(1)

    pid_file = SERVICES[service]["pid_file"]
    log_file = SERVICES[service]["log_file"]

    if not pid_file.exists():
        print(
            f"[bold red]❌ {service}: No PID file found. Service may not be running.[/bold red]"
        )
        raise typer.Exit(1)

    with open(pid_file, "r") as f:
        pid = int(f.read().strip())

    try:
        process = psutil.Process(pid)
    except psutil.NoSuchProcess:
        print(f"[bold red]❌ {service}: Process not found (dead PID).[/bold red]")
        raise typer.Exit(1)

    print(
        f"[bold cyan]📡 Monitoring {service} (PID {pid})... Press Ctrl+C to exit.[/bold cyan]"
    )

    cpu_history = deque(maxlen=30)
    mem_history = deque(maxlen=30)
    log_buffer = deque(maxlen=log_lines)
    log_pos = 0

    try:
        with Live(refresh_per_second=1) as live:  # بدون screen=True
            while True:
                cpu = process.cpu_percent(interval=None)
                mem = process.memory_info().rss / (1024 * 1024)
                uptime = f"{time.time() - process.create_time():.0f} s"
                threads = str(process.num_threads())

                cpu_history.append(cpu)
                mem_history.append(mem)

                # جدول اطلاعات
                table = Table(title=f"{service} Monitoring")
                table.add_column("Metric", style="cyan", no_wrap=True)
                table.add_column("Value", style="green")

                table.add_row("CPU", f"{cpu:.1f} %")
                table.add_row("Memory", f"{mem:.2f} MB")
                table.add_row("Threads", threads)
                table.add_row("Uptime", uptime)

                # خواندن زنده لاگ
                if log_file.exists():
                    with open(log_file, "r", encoding="utf-8", errors="replace") as log:
                        log.seek(log_pos)
                        new_lines = log.readlines()
                        if new_lines:
                            for line in new_lines:
                                if "ERROR" in line.upper():
                                    log_buffer.append(
                                        Text(line.strip(), style="bold red")
                                    )
                                elif "WARNING" in line.upper():
                                    log_buffer.append(
                                        Text(line.strip(), style="yellow")
                                    )
                                elif "INFO" in line.upper():
                                    log_buffer.append(Text(line.strip(), style="green"))
                                else:
                                    log_buffer.append(Text(line.strip(), style="white"))
                            log_pos = log.tell()

                log_text = Text()
                for l in log_buffer:
                    log_text.append(l)
                    log_text.append("\n")

                log_panel = Panel(log_text, title="Live Logs", border_style="blue")

                # نمودار ساده CPU/RAM
                cpu_chart = "".join("█" if v > 0 else " " for v in cpu_history)
                mem_chart = "".join("█" if v > 0 else " " for v in mem_history)

                charts = Table(show_header=False, box=None)
                charts.add_row("CPU:", f"{cpu_chart} {cpu:.1f}%")
                charts.add_row("RAM:", f"{mem_chart} {mem:.2f} MB")

                layout = Layout()
                layout.split_column(
                    Layout(table, ratio=2),
                    Layout(charts, ratio=1),
                    Layout(log_panel, ratio=3),
                )

                live.update(layout)
                time.sleep(1)

    except KeyboardInterrupt:
        print(f"\n[bold yellow]⏹ Stopped monitoring {service}[/bold yellow]")
