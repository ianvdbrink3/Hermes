"""Read-only G11 projection for the existing authenticated state service."""
from __future__ import annotations
import hashlib
import json
import sys
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from pathlib import Path

STOCKS = Path("/home/ubuntu/Hermes-Stocks/r9d-a04-p013-correction")
sys.path.insert(0, str(STOCKS / "src"))
from g11.observation import read_history
from g11.observation_metrics import evaluate_observations
from g11.research import read_research
from g11.journal import DecisionJournal
from g11.runtime import portfolio_from_dict

def read_json(root: Path, name: str) -> dict:
    path = root / name
    return json.loads(path.read_text()) if path.exists() else {}

def build_snapshot(root: Path, now: datetime) -> dict:
    names = ("observations.jsonl", "latest.json", "portfolio.json", "journal.jsonl", "PENDING", "KILL_SWITCH")
    def fingerprints():
        return {name: hashlib.sha256((root / name).read_bytes()).hexdigest() if (root / name).exists() else None for name in names}
    before = fingerprints()
    rows = read_history(root)
    latest = read_json(root, "latest.json")
    if rows:
        expected = {k: v for k, v in rows[-1].items() if k not in ("record_hash", "previous_hash")}
        if latest != expected:
            raise ValueError("latest checkpoint mismatch")
        if any(row.get("fixture") is not False or row.get("live_execution_allowed") is not False for row in rows):
            raise ValueError("non-shadow observation")
        stored = read_json(root, "portfolio.json")
        portfolio = portfolio_from_dict(stored, as_of=datetime.fromisoformat(stored["as_of"]))
        if portfolio.snapshot_hash != stored.get("snapshot_hash") or stored.get("snapshot_hash") != latest.get("portfolio_after_hash"):
            raise ValueError("portfolio checkpoint mismatch")
    elif latest or read_json(root, "portfolio.json"):
        raise ValueError("orphan portfolio checkpoint")
    journal = DecisionJournal(root / "journal.jsonl")
    if not journal.verify():
        raise ValueError("journal integrity failure")
    pending = (root / "PENDING").exists()
    incomplete = bool(journal.incomplete_decisions())
    if rows and (not journal.entries() or journal.entries()[-1]["payload"].get("after_hash") != latest.get("portfolio_after_hash")):
        raise ValueError("journal checkpoint mismatch")
    research = read_research(root, now=now)
    assessments = []
    if research:
        for role, item in sorted(research["roles"].items()):
            report = item["report"]
            analysis = report["analysis"]["g11"]
            times = [datetime.fromisoformat(report["generated_at"])] + [datetime.fromisoformat(s["retrieved_at"]) for s in item["sources"]]
            assessments.append({"role": role, "generated_at": report["generated_at"], "score": analysis["score"], "confidence": analysis["confidence"], "thesis": analysis["thesis"], "stale": max(now - at for at in times) > timedelta(hours=6)})
    equity = latest.get("equity")
    pnl = str(Decimal(equity) - Decimal(latest["initial_equity"])) if equity is not None else None
    result = {"schema_version": 1, "generated_at": now.isoformat(), "read_only": True,
        "live_orders_enabled": False, "latest": latest, "history": list(reversed(rows[-30:])),
        "metrics": evaluate_observations(rows, now=now), "pnl": pnl,
        "health": read_json(root, "health.json"), "research_health": read_json(root, "research-health.json"),
        "daemon": read_json(root, "background-health.json"), "research": assessments,
        "research_fixture": research["fixture"] if research else None,
        "safety": {"kill_switch": (root / "KILL_SWITCH").exists(), "pending_recovery": pending,
                   "journal_verified": True, "incomplete_decisions": incomplete,
                   "reconciled": latest.get("reconciled") is True and not pending and not incomplete},
        "risk_counts": {"blocks": sum(r.get("risk_status") == "BLOCK" for r in rows),
                        "resizes": sum(r.get("risk_status") == "RESIZE" for r in rows)}}

    if fingerprints() != before:
        raise ValueError("accounting changed during projection")
    return result

def main() -> None:
    root = STOCKS / "runtime/g11-observation"
    # Optimistic consistency: never contend with the paper engine's nonblocking lock.
    value = build_snapshot(root, datetime.now(UTC))
    print(json.dumps(value, default=str, allow_nan=False))

if __name__ == "__main__":
    main()
