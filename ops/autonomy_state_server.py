#!/usr/bin/env python3
from __future__ import annotations

from collections import Counter
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import hmac
import json
import os
import re
import subprocess

REPO = Path(os.environ.get("AUTONOMY_REPO", "/home/ubuntu/Hermes-Stocks/hermes-investment-machine")).resolve()
RESEARCH_ENV = Path(os.environ.get("RESEARCH_ENV", "/home/ubuntu/.hermes/profiles/his-research/.env"))
PORT = int(os.environ.get("AUTONOMY_STATE_PORT", "8670"))
COMPUTE_DIR = REPO / "state/autonomy/compute"

def env_value(path: Path, key: str) -> str:
    for raw in path.read_text(encoding="utf-8").splitlines():
        if "=" not in raw or raw.lstrip().startswith("#"):
            continue
        name, value = raw.split("=", 1)
        if name.strip() == key:
            return value.strip().strip('"').strip("'")
    return ""

API_KEY = env_value(RESEARCH_ENV, "API_SERVER_KEY")
if not API_KEY:
    raise SystemExit("research API_SERVER_KEY is missing")

def normalize_heading(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", value.lower()).strip("_")

def parse_current() -> dict:
    path = REPO / "state/autonomy/CURRENT.md"
    if not path.exists():
        return {}
    sections: dict[str, list[str]] = {}
    current = None
    for raw in path.read_text(encoding="utf-8").splitlines():
        if raw.startswith("## "):
            current = normalize_heading(raw[3:].strip())
            sections.setdefault(current, [])
            continue
        if current is not None:
            sections[current].append(raw)
    result: dict[str, object] = {}
    for key, lines in sections.items():
        cleaned = [line.strip() for line in lines if line.strip()]
        if key == "important_evidence":
            result[key] = [re.sub(r"^[-*]\s*", "", line) for line in cleaned]
        else:
            result[key] = "\n".join(cleaned) if cleaned else "None"
    return result

def read_jsonl(name: str) -> tuple[list[dict], int]:
    path = REPO / "state/autonomy" / name
    if not path.exists():
        return [], 0
    records: list[dict] = []
    errors = 0
    for raw in path.read_text(encoding="utf-8").splitlines():
        if not raw.strip():
            continue
        try:
            value = json.loads(raw)
            if isinstance(value, dict):
                records.append(value)
            else:
                errors += 1
        except json.JSONDecodeError:
            errors += 1
    return records, errors

def none_like(value: object) -> bool:
    normalized = str(value or "").strip().lower()
    if normalized in {"", "none", "-", "—", "n/a", "null", "nothing", "geen", "no blockers"}:
        return True
    return normalized.startswith((
        "none for current repository-local work",
        "no current human/owner action",
    ))

def run_git(*args: str) -> str:
    return subprocess.check_output(
        ["git", "-C", str(REPO), *args],
        text=True,
        stderr=subprocess.DEVNULL,
        timeout=4,
    ).strip()

def git_state() -> dict:
    try:
        head = run_git("rev-parse", "HEAD")
        tree = run_git("rev-parse", "HEAD^{tree}")
        branch = run_git("branch", "--show-current") or "detached"
        status = run_git("status", "--porcelain")
        return {
            "branch": branch,
            "head": head,
            "head_short": head[:12],
            "tree": tree,
            "tree_short": tree[:12],
            "dirty": bool(status),
            "changed_paths": len(status.splitlines()) if status else 0,
        }
    except Exception as exc:
        return {"error": str(exc), "dirty": True}

def latest_backlog(records: list[dict]) -> list[dict]:
    latest: dict[str, dict] = {}
    anonymous: list[dict] = []
    for record in records:
        task_id = str(record.get("task_id") or "")
        if task_id:
            latest[task_id] = record
        else:
            anonymous.append(record)
    items = list(latest.values()) + anonymous
    priority_order = {"P0": 0, "P1": 1, "P2": 2, "P3": 3}
    return sorted(
        items,
        key=lambda item: (
            priority_order.get(str(item.get("priority") or "").upper(), 9),
            str(item.get("updated_at") or item.get("created_at") or ""),
        ),
    )

def backlog_counts(records: list[dict]) -> dict:
    counter = Counter(str(item.get("status") or "UNKNOWN").upper() for item in records)
    return {
        "pending": sum(v for k, v in counter.items() if k in {"PENDING", "IN_PROGRESS", "READY", "QUEUED"}),
        "complete": counter.get("COMPLETE", 0),
        "blocked": sum(v for k, v in counter.items() if "BLOCKED" in k),
        "rejected": counter.get("REJECTED", 0),
        "all": dict(counter),
    }

def experiment_counts(records: list[dict]) -> dict:
    counter = Counter(str(item.get("verdict") or "UNKNOWN").upper() for item in records)
    return {
        "pass": counter.get("PASS", 0),
        "reject": counter.get("REJECT", 0),
        "inconclusive": counter.get("INCONCLUSIVE", 0),
        "all": dict(counter),
    }

def quality_from_experiments(records: list[dict]) -> dict:
    quality: dict[str, object] = {}
    for record in reversed(records):
        metrics = record.get("metrics")
        if not isinstance(metrics, dict):
            continue
        if "pytest_passed" not in quality and "pytest_passed" in metrics:
            quality["pytest_passed"] = metrics["pytest_passed"]
        if "pytest_failed" not in quality and "pytest_failed" in metrics:
            quality["pytest_failed"] = metrics["pytest_failed"]
        if "pytest_skipped" not in quality and "pytest_skipped" in metrics:
            quality["pytest_skipped"] = metrics["pytest_skipped"]
        if "ruff" not in quality and "ruff_exit_code" in metrics:
            quality["ruff"] = "PASS" if metrics["ruff_exit_code"] == 0 else "FAIL"
        if "mypy" not in quality:
            code = metrics.get("mypy_exit_code_after_environment_sync", metrics.get("mypy_exit_code"))
            if code is not None:
                quality["mypy"] = "PASS" if code == 0 else "FAIL"
        if {"pytest_passed", "pytest_failed", "ruff", "mypy"}.issubset(quality):
            break
    return quality

def read_json_file(path: Path) -> dict:
    if not path.exists():
        return {}
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return value if isinstance(value, dict) else {}


def read_jsonl_file(path: Path) -> tuple[list[dict], int]:
    if not path.exists():
        return [], 0
    records: list[dict] = []
    errors = 0
    for raw in path.read_text(encoding="utf-8").splitlines():
        if not raw.strip():
            continue
        try:
            value = json.loads(raw)
        except json.JSONDecodeError:
            errors += 1
            continue
        if isinstance(value, dict):
            records.append(value)
        else:
            errors += 1
    return records, errors


def parse_timestamp(value: object) -> datetime | None:
    if not isinstance(value, str) or not value.strip():
        return None
    raw = value.strip()
    if raw.endswith("Z"):
        raw = raw[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(raw)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def numeric(value: object) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float) and value.is_integer():
        return int(value)
    return None


def usage_is_verified(record: dict) -> bool:
    if "usage_verified" in record:
        return record.get("usage_verified") is True
    if record.get("accounting_status") == "ESTIMATED_FROM_RESERVATION":
        return False
    return all(numeric(record.get(key)) is not None for key in ("input_tokens", "output_tokens", "total_tokens"))


def provider_runtime(now: datetime) -> dict:
    cooldown = read_json_file(COMPUTE_DIR / "provider-cooldown.json")
    retry_raw = cooldown.get("retry_not_before_utc")
    retry_at = parse_timestamp(retry_raw)
    active = bool(retry_at and retry_at > now)
    return {
        "provider": cooldown.get("provider") or "openai-codex",
        "model": cooldown.get("model") or "gpt-5.6-sol",
        "state": "COOLDOWN" if active else "READY_OR_UNKNOWN",
        "retry_not_before_utc": retry_raw if isinstance(retry_raw, str) else None,
        "cooldown_active": active,
        "historical_cooldown_record": bool(cooldown),
        "reason": cooldown.get("reason") if cooldown else None,
    }


def compute_runtime(now: datetime) -> dict:
    budget = read_json_file(COMPUTE_DIR / "BUDGET.json")
    reservations, reservation_errors = read_jsonl_file(COMPUTE_DIR / "reservations.jsonl")
    usage, usage_errors = read_jsonl_file(COMPUTE_DIR / "gated_usage.jsonl")
    voids, void_errors = read_jsonl_file(COMPUTE_DIR / "reservation_voids.jsonl")
    window_hours = numeric(budget.get("rolling_window_hours")) or 24
    window_start = now - timedelta(hours=window_hours)

    def in_window(record: dict) -> bool:
        ts = parse_timestamp(record.get("ts"))
        return bool(ts and window_start <= ts <= now)

    starts_24h = [r for r in reservations if r.get("decision") == "ALLOW" and in_window(r)]
    usage_24h = [u for u in usage if in_window(u)]
    voids_24h = [v for v in voids if in_window(v)]
    accounted_ids = {str(u.get("reservation_id")) for u in usage if u.get("reservation_id")}
    voided_ids = {str(v.get("reservation_id")) for v in voids if v.get("reservation_id")}
    unresolved = [r for r in reservations if r.get("decision") == "ALLOW" and r.get("reservation_id") and str(r.get("reservation_id")) not in accounted_ids and str(r.get("reservation_id")) not in voided_ids]
    unresolved_24h = [r for r in unresolved if in_window(r)]
    max_open_age = numeric(budget.get("max_open_reservation_age_minutes")) or 60
    stale_unresolved = []
    for record in unresolved:
        ts = parse_timestamp(record.get("ts"))
        if ts and now - ts > timedelta(minutes=max_open_age):
            stale_unresolved.append(record)
    verified_usage = [u for u in usage_24h if usage_is_verified(u)]
    estimated_usage = [u for u in usage_24h if not usage_is_verified(u)]
    successful_verified = [u for u in verified_usage if u.get("completed") is True and u.get("failed") is not True]
    failed_usage = [u for u in usage_24h if u.get("failed") is True or u.get("failure_present") is True]

    def token_sum(rows: list[dict], key: str) -> int:
        return sum(numeric(row.get(key)) or 0 for row in rows)

    dated_reservations = [(parse_timestamp(r.get("ts")), r) for r in reservations]
    dated_reservations = [(ts, r) for ts, r in dated_reservations if ts]
    latest_reservation = max(dated_reservations, key=lambda item: item[0])[1] if dated_reservations else None
    latest_start = max((ts for ts, _ in dated_reservations), default=None)
    dated_usage = [(parse_timestamp(u.get("ts")), u) for u in usage]
    dated_usage = [(ts, u) for ts, u in dated_usage if ts]
    latest_accounted = max((ts for ts, _ in dated_usage), default=None)
    latest_verified = max((ts for ts, u in dated_usage if usage_is_verified(u)), default=None)
    provider_policy = budget.get("provider_policy") if isinstance(budget.get("provider_policy"), dict) else {}

    return {
        "runs_24h": len(starts_24h),
        "max_runs_24h": numeric(budget.get("max_deep_runs")),
        "prompt_tokens_24h": token_sum(usage_24h, "input_tokens"),
        "max_prompt_tokens_24h": numeric(budget.get("max_prompt_tokens")),
        "total_tokens_24h": token_sum(usage_24h, "total_tokens"),
        "max_total_tokens_24h": numeric(budget.get("max_total_tokens")),
        "open_reservations": len(unresolved),
        "open_reservations_24h": len(unresolved_24h),
        "voided_reservations": len(voids),
        "voided_reservations_24h": len(voids_24h),
        "stale_unresolved_reservations": len(stale_unresolved),
        "estimated_context_bytes": numeric(latest_reservation.get("estimated_context_bytes")) if latest_reservation else None,
        "max_context_bytes": numeric(budget.get("max_estimated_context_bytes")),
        "verified_prompt_tokens_24h": token_sum(verified_usage, "input_tokens"),
        "verified_total_tokens_24h": token_sum(verified_usage, "total_tokens"),
        "estimated_prompt_tokens_24h": token_sum(estimated_usage, "input_tokens"),
        "estimated_total_tokens_24h": token_sum(estimated_usage, "total_tokens"),
        "successful_verified_runs_24h": len(successful_verified),
        "failed_accounted_runs_24h": len(failed_usage),
        "unverified_accounted_runs_24h": len(estimated_usage),
        "latest_start_utc": latest_start.isoformat() if latest_start else None,
        "latest_accounted_run_utc": latest_accounted.isoformat() if latest_accounted else None,
        "latest_verified_run_utc": latest_verified.isoformat() if latest_verified else None,
        "rolling_window_hours": window_hours,
        "max_open_reservation_age_minutes": max_open_age,
        "provider": "openai-codex",
        "model": provider_policy.get("model"),
        "parse_errors": reservation_errors + usage_errors + void_errors,
    }


def snapshot() -> dict:
    current = parse_current()
    backlog_raw, backlog_errors = read_jsonl("BACKLOG.jsonl")
    experiments_raw, experiment_errors = read_jsonl("EXPERIMENTS.jsonl")
    decisions_raw, decision_errors = read_jsonl("DECISIONS.jsonl")
    backlog = latest_backlog(backlog_raw)

    needs_human = current.get("needs_human", "None")
    in_progress = current.get("in_progress", "None")
    if not none_like(needs_human):
        mode = "blocked"
    elif not none_like(in_progress):
        mode = "working"
    else:
        mode = "between_cycles"

    now = datetime.now(timezone.utc)
    compute = compute_runtime(now)
    provider = provider_runtime(now)

    return {
        "generated_at": now.isoformat(),
        "mode": mode,
        "runtime": {
            "compute": compute,
            "provider": provider,
            "provider_cooldown": {
                "retry_not_before_utc": provider["retry_not_before_utc"],
                "cooldown_active": provider["cooldown_active"],
                "reason": provider["reason"],
            },
        },
        "current": current,
        "backlog": {
            "entries": backlog,
            "counts": backlog_counts(backlog),
            "parse_errors": backlog_errors,
        },
        "experiments": {
            "recent": list(reversed(experiments_raw[-12:])),
            "counts": experiment_counts(experiments_raw),
            "parse_errors": experiment_errors,
        },
        "decisions": list(reversed(decisions_raw[-10:])),
        "decision_parse_errors": decision_errors,
        "git": git_state(),
        "quality": quality_from_experiments(experiments_raw),
    }

class Handler(BaseHTTPRequestHandler):
    server_version = "HermesAutonomyState/1.0"

    def authorized(self) -> bool:
        expected = f"Bearer {API_KEY}"
        supplied = self.headers.get("Authorization", "")
        return hmac.compare_digest(supplied, expected)

    def send_json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        if not self.authorized():
            self.send_json(401, {"error": "Unauthorized"})
            return
        if self.path == "/health":
            self.send_json(200, {"ok": True})
            return
        if self.path == "/g11-shadow":
            try:
                result = subprocess.run(
                    ["/home/ubuntu/Hermes-Stocks/r9d-a04-p013-correction/.venv/bin/python",
                     "/home/ubuntu/Hermes-OS-g11/ops/g11_shadow_snapshot.py"],
                    capture_output=True, text=True, timeout=20, check=True,
                )
                self.send_json(200, json.loads(result.stdout))
            except Exception:
                self.send_json(503, {"error": "shadow_snapshot_unavailable"})
            return
        if self.path == "/snapshot":
            try:
                self.send_json(200, snapshot())
            except Exception as exc:
                self.send_json(500, {"error": "snapshot_failed", "detail": type(exc).__name__})
            return
        self.send_json(404, {"error": "Not found"})

    def log_message(self, fmt: str, *args: object) -> None:
        return

if __name__ == "__main__":
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    server.serve_forever()
