"""Bounded read-only v2 projection; no providers, collectors or recovery."""
from __future__ import annotations
import hashlib
import fcntl
from contextlib import nullcontext
import json
import re
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path

STOCKS=Path("/home/ubuntu/Hermes-Stocks/r9d-a04-p013-correction")
sys.path.insert(0,str(STOCKS/"src"))
from core.domain import canonical_hash,require_aware_utc
from g11.lite.portfolio_cycle import read_lite_days
from g11.lite.research import read_combined,report_payload,analysis_archive,read_verifiers
from g11.lite.budget import _read as read_budget_ledger
from g11.runtime import parse_utc
from g11.lite.mode import daemon_identity,universe_hash

def read_only_budget_status(root: Path, *, at: datetime) -> dict:
    """Read the same validated ledger without creating directories or lock files."""
    require_aware_utc(at)
    lock_path=root/"budget.lock"
    if root.is_symlink() or lock_path.is_symlink():
        raise ValueError("symlinked model budget")
    if (root/"attempts.jsonl").exists() and not lock_path.is_file():
        raise ValueError("model budget lock missing")
    def fingerprints():
        return [(name,hashlib.sha256((root/name).read_bytes()).hexdigest()
                 if (root/name).is_file() else (root/name).exists())
                for name in ("attempts.jsonl","budget-checkpoint.json","budget-write-pending")]
    with lock_path.open("r") if lock_path.is_file() else nullcontext() as lock:
        if lock is not None: fcntl.flock(lock,fcntl.LOCK_SH)
        before=fingerprints()
        rows=read_budget_ledger(root,at)
        if fingerprints()!=before: raise ValueError("model budget changed during projection")
    return {"reserved":sum(row["event"]=="RESERVED" and row["day"]==at.date().isoformat() for row in rows)}

def bounded_json(path: Path, limit: int=1024*1024) -> dict:
    if path.is_symlink() or not path.is_file() or path.stat().st_size>limit:
        raise ValueError("missing, symlinked or oversized checkpoint")
    data=json.loads(path.read_text())
    if not isinstance(data,dict): raise ValueError("invalid checkpoint")
    return data

def read_mode(runtime: Path) -> dict | None:
    path=runtime/"g11-mode.json"
    if not path.exists(): return None
    value=bounded_json(path,16000)
    body={k:v for k,v in value.items() if k!="config_hash"}
    if (value.get("config_hash")!=canonical_hash(body) or value.get("schema_version")!=2
        or value.get("mode") not in {"pilot","multi-lite"}
        or type(value.get("research_enabled")) is not bool):
        raise ValueError("invalid operation mode")
    return value

def build_lite_snapshot(root: Path,now: datetime) -> dict:
    mode=read_mode(root.parent)
    if not mode or mode["mode"]!="multi-lite": raise ValueError("lite mode not selected")
    if mode.get("universe_hash") is not None and universe_hash(root.parent.parent)!=mode["universe_hash"]:
        raise ValueError("universe configuration changed")
    names=["dashboard.json","portfolio.json","checkpoint.json","observations.jsonl",
           "PENDING","KILL_SWITCH","research-index.json","verifier-index.json","health.json"]
    def fingerprints():
        return [(name,hashlib.sha256((root/name).read_bytes()).hexdigest()
                 if (root/name).is_file() else (root/name).exists()) for name in names]
    before=fingerprints()
    wrapper=bounded_json(root/"dashboard.json",8*1024*1024)
    data=wrapper.get("snapshot")
    if (not isinstance(data,dict) or wrapper.get("snapshot_hash")!=canonical_hash(data)
        or data.get("schema_version")!=2 or data.get("strategy_version")!="g11-lite-v1"
        or data.get("config_hash")!=mode["config_hash"] or data.get("fixture") is not False
        or data.get("read_only") is not True or data.get("live_orders_enabled") is not False
        or parse_utc(data["generated_at"])>now):
        raise ValueError("invalid lite dashboard checkpoint")
    anchors=data.get("archive_anchors")
    research=data.get("research")
    if not isinstance(anchors,list) or not isinstance(research,list) or len(anchors)>50:
        raise ValueError("invalid research anchors")
    if len(anchors)!=len(research): raise ValueError("unbound displayed research")
    total=0
    expected={f'research/{r["instrument_id"]}/{r["report_hash"]}.json':r for r in research}
    for anchor in anchors:
        relative=anchor.get("path","")
        if (not re.fullmatch(r"research/[A-Z][A-Z0-9.-]{0,9}/[a-f0-9]{64}\.json",relative)
            or relative not in expected):
            raise ValueError("invalid archive path")
        path=root/relative
        if any(p.is_symlink() for p in (path,path.parent,path.parent.parent)):
            raise ValueError("symlinked archive")
        total+=path.stat().st_size
        if total>64*1024*1024 or path.stat().st_size>8*1024*1024:
            raise ValueError("research projection exceeds bounds")
        if hashlib.sha256(path.read_bytes()).hexdigest()!=anchor["sha256"]:
            raise ValueError("archived research changed")
        displayed=expected[relative]
        generated=parse_utc(displayed["generated_at"])
        # Reader validates original sources and report without renewing their timestamps.
        verified=read_combined(root,displayed["instrument_id"],now=now,allow_stale=True,config_hash=mode["config_hash"])
        payload={k:v for k,v in displayed.items() if k not in {"stale","report_hash"}}
        if verified is None or report_payload(verified)!=payload:
            raise ValueError("displayed research does not match original")
        displayed["stale"]=(now-generated).total_seconds()>21600
    pending=any((p/"PENDING").exists() for p in (root,root.parent/"g11-observation"))
    killed=any((p/"KILL_SWITCH").exists() for p in (root,root.parent/"g11-observation"))
    if pending or killed:
        data["safety"]={"pending_recovery":pending,"kill_switch":killed,
                        "integrity_verified":False,"reconciled":False}
        data["latest"]=None;data["portfolio"]=None;data["history"]=[]
        data["activation"]={"research_enabled":False,
                           "reasons_nl":["Een veiligheidsmarker blokkeert de oefenoperatie."]}
    else:
        rows=read_lite_days(root)
        if any(r["fixture"] is not False for r in rows):
            raise ValueError("fixture portfolio cannot be projected")
        expected_latest=rows[-1] if rows else None
        if data.get("latest")!=expected_latest:
            raise ValueError("paper checkpoint mismatch")
        data["safety"]={"pending_recovery":False,"kill_switch":False,
                       "integrity_verified":True,"reconciled":bool(rows)}
    daemon_path=root.parent/"g11-observation/background-health.json"
    if daemon_path.exists():
        daemon=bounded_json(daemon_path,64000)
        checked=daemon.get("checked_at",daemon.get("at",daemon.get("updated_at")))
        if checked is not None:
            if parse_utc(checked)>now: raise ValueError("future scheduler heartbeat")
            matched=(daemon.get("mode")=="multi-lite" and daemon_identity(daemon.get("pid"),STOCKS/"scripts/g11-background.py")
                     and timedelta(0)<=now-parse_utc(checked)<=timedelta(minutes=2))
            data["daemon"]={"scheduler":daemon.get("scheduler","UNKNOWN") if matched else "UNKNOWN","checked_at":checked}
    if fingerprints()!=before or read_mode(root.parent)!=mode:
        raise ValueError("state changed during projection")
    data["checkpoint_at"]=data["generated_at"]
    data["retrieved_at"]=now.isoformat()
    scan_at=data.get("scan",{}).get("as_of",data["checkpoint_at"])
    age=(now-parse_utc(scan_at)).total_seconds()
    data["data_health"]={"stale":age>3600,"scan_age_seconds":age,
        "reasons_nl":["De laatste koersscan is meer dan een uur oud."] if age>3600 else []}
    health_path=root/"health.json"
    job=bounded_json(health_path,64000) if health_path.exists() else {"status":"UNKNOWN"}
    if job.get("checked_at") and parse_utc(job["checked_at"])>now:
        raise ValueError("future job health")
    data["job_health"]={"status":job.get("status","UNKNOWN"),"checked_at":job.get("checked_at")}
    budget=read_only_budget_status(root.parent/"g11-model-budget",at=now)
    unknown=mode.get("legacy_usage_blocked_day")==now.date().isoformat()
    reasons=list(data["activation"]["reasons_nl"])
    data["budget"]={"limit":2,"day_utc":now.date().isoformat(),
        "attempts_consumed":None if unknown else budget["reserved"],
        "blocked":not mode["research_enabled"] or unknown,"reasons_nl":reasons}
    versions=analysis_archive(root,now=now); verifiers=read_verifiers(root,now=now)
    if data.get("analysis_versions",versions)!=versions or data.get("verifications",verifiers)!=verifiers:
        raise ValueError("displayed archive does not match originals")
    data["analysis_versions"]=versions
    data["verifications"]=verifiers
    if fingerprints()!=before or read_mode(root.parent)!=mode:
        raise ValueError("state changed during archive projection")
    return data

def main() -> None:
    print(json.dumps(build_lite_snapshot(STOCKS/"runtime/g11-multi-observation",datetime.now(UTC)),
                     allow_nan=False))

if __name__=="__main__": main()
