"""Helpers for finding, loading and filling .env files."""

from __future__ import annotations

import secrets
from pathlib import Path

from dotenv import load_dotenv

SECRET_KEYS = ("SECRET_KEY", "JWT_SECRET", "BOT_TOKEN", "WHATSAPP_ADMIN_TOKEN")


def is_placeholder(value: str) -> bool:
    text = value.strip().strip("'").strip('"')
    return not text or text.startswith("change-me")


def unique_env_paths(repo_root: Path, cwd: Path | None = None) -> list[Path]:
    """Candidate .env paths: current directory first, then the repository root."""
    here = (cwd or Path.cwd()).resolve()
    paths: list[Path] = []
    seen: set[Path] = set()
    for raw in (here / ".env", repo_root.resolve() / ".env"):
        if raw not in seen:
            paths.append(raw)
            seen.add(raw)
    return paths


def describe_env_paths(repo_root: Path, cwd: Path | None = None) -> list[tuple[Path, bool]]:
    return [(path, path.is_file()) for path in unique_env_paths(repo_root, cwd)]


def load_env_files(repo_root: Path, cwd: Path | None = None) -> list[tuple[Path, bool]]:
    """Load .env files without overriding variables already set in the process."""
    looked = describe_env_paths(repo_root, cwd)
    for path, exists in looked:
        if exists:
            load_dotenv(path, override=False)
    return looked


def example_and_target(repo_root: Path, cwd: Path | None = None) -> tuple[Path, Path]:
    """Locate .env.example and the .env path that should be written next to it."""
    here = (cwd or Path.cwd()).resolve()
    cwd_example = here / ".env.example"
    root_example = repo_root.resolve() / ".env.example"
    if cwd_example.is_file():
        return cwd_example, here / ".env"
    if root_example.is_file():
        return root_example, repo_root.resolve() / ".env"
    raise FileNotFoundError(
        "Could not find .env.example in the current directory "
        f"({here}) or the project root ({repo_root.resolve()})."
    )


def new_secret() -> str:
    return secrets.token_urlsafe(48)


def apply_env_updates(
    text: str,
    replacements: dict[str, str],
    *,
    only_if_placeholder: set[str] | None = None,
) -> tuple[str, list[str]]:
    """Replace or append KEY=value lines. Preserves comments and unrelated keys."""
    skip_if_set = only_if_placeholder or set()
    updated: list[str] = []
    seen: set[str] = set()
    lines: list[str] = []
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in line:
            lines.append(line)
            continue
        key, _, value = line.partition("=")
        name = key.strip()
        if name not in replacements:
            lines.append(line)
            continue
        seen.add(name)
        current = value.strip()
        if name in skip_if_set and not is_placeholder(current):
            lines.append(line)
            continue
        new_value = replacements[name]
        lines.append(f"{name}={new_value}")
        if current != new_value:
            updated.append(name)
    for name, new_value in replacements.items():
        if name not in seen:
            lines.append(f"{name}={new_value}")
            updated.append(name)
    body = "\n".join(lines)
    if body and not body.endswith("\n"):
        body += "\n"
    elif not body:
        body = "\n".join(f"{k}={v}" for k, v in replacements.items()) + "\n"
    return body, updated


def missing_secret_message(missing: list[str], looked: list[tuple[Path, bool]]) -> str:
    lines = [
        "Missing or placeholder secrets: " + ", ".join(missing) + ".",
        "",
        "Looked for a .env file in:",
    ]
    for path, exists in looked:
        if exists:
            lines.append(f"  {path} (found, but it still has placeholder or empty values)")
        else:
            lines.append(f"  {path} (not found)")
    lines.append("")
    lines.append("Create or fill one with: shearbook init-env")
    lines.append("If .env already exists and you want new secrets, run: shearbook init-env --force")
    return "\n".join(lines)
