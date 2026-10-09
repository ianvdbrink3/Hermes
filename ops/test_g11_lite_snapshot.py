"""Credential-free isolated v2 projection harness."""
import json
import tempfile
import unittest
from unittest.mock import patch
from datetime import UTC,datetime,timedelta
from pathlib import Path
from core.domain import canonical_hash
from g11_lite_snapshot import build_lite_snapshot
from g11.lite.budget import reserve_attempt

NOW=datetime(2026,10,9,12,tzinfo=UTC)
class LiteProjectionTest(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.runtime=Path(self.temp.name)
        self.root=self.runtime/"g11-multi-observation";self.root.mkdir()
        body={"schema_version":2,"mode":"multi-lite","research_enabled":False}
        self.mode={**body,"config_hash":canonical_hash(body)}
        (self.runtime/"g11-mode.json").write_text(json.dumps(self.mode))
        self.data={"schema_version":2,"strategy_version":"g11-lite-v1","mode":"multi-lite",
            "config_hash":self.mode["config_hash"],"generated_at":NOW.isoformat(),
            "fixture":False,"read_only":True,"live_orders_enabled":False,
            "archive_anchors":[],"research":[],"latest":None,"portfolio":None,"history":[],
            "safety":{},"activation":{"research_enabled":False,"reasons_nl":["Transport geblokkeerd."]},
            "daemon":{"scheduler":"UNKNOWN","checked_at":NOW.isoformat()}}
        self.save()
    def save(self):
        (self.root/"dashboard.json").write_text(json.dumps({
            "snapshot":self.data,"snapshot_hash":canonical_hash(self.data)}))
    def test_projection_never_opens_files_for_writing(self):
        original=Path.open
        def read_only(path,mode="r",*args,**kwargs):
            if any(flag in mode for flag in ("a","w","x","+")):
                raise OSError(30,"Read-only file system")
            return original(path,mode,*args,**kwargs)
        with patch.object(Path,"open",read_only):
            value=build_lite_snapshot(self.root,NOW)
        self.assertEqual(value["budget"]["attempts_consumed"],0)
        self.assertFalse((self.runtime/"g11-model-budget").exists())

    def test_existing_budget_is_validated_without_mutation(self):
        root=self.runtime/"g11-model-budget"
        reserve_attempt(root,at=NOW,kind="ANALYSIS",instrument_id="MSFT",one_analysis=True)
        before={p.name:p.read_bytes() for p in root.iterdir()}
        original=Path.open
        def read_only(path,mode="r",*args,**kwargs):
            if any(flag in mode for flag in ("a","w","x","+")): raise OSError(30,"Read-only file system")
            return original(path,mode,*args,**kwargs)
        with patch.object(Path,"open",read_only):
            value=build_lite_snapshot(self.root,NOW)
        self.assertEqual(value["budget"]["attempts_consumed"],1)
        self.assertEqual(before,{p.name:p.read_bytes() for p in root.iterdir()})
    def test_tampered_budget_is_still_rejected(self):
        root=self.runtime/"g11-model-budget"
        reserve_attempt(root,at=NOW,kind="ANALYSIS",instrument_id="MSFT",one_analysis=True)
        path=root/"attempts.jsonl"
        path.write_text(path.read_text().replace('"MSFT"','"AAPL"'))
        with self.assertRaises(ValueError): build_lite_snapshot(self.root,NOW)
    def test_pending_budget_write_is_preserved_and_rejected(self):
        root=self.runtime/"g11-model-budget";root.mkdir()
        marker=root/"budget-write-pending";marker.write_text("incomplete")
        with self.assertRaises(ValueError): build_lite_snapshot(self.root,NOW)
        self.assertEqual(marker.read_text(),"incomplete")

    def test_valid_empty_operation_is_not_reconciled_paper(self):
        v=build_lite_snapshot(self.root,NOW+timedelta(minutes=1))
        self.assertFalse(v["safety"]["reconciled"])
        self.assertEqual(v["checkpoint_at"],NOW.isoformat())
    def test_tampered_checkpoint_rejected(self):
        self.data["fixture"]=True
        self.save()
        with self.assertRaises(ValueError):build_lite_snapshot(self.root,NOW)
    def test_config_mismatch_rejected(self):
        self.data["config_hash"]="f"*64;self.save()
        with self.assertRaises(ValueError):build_lite_snapshot(self.root,NOW)
    def test_future_checkpoint_rejected(self):
        self.data["generated_at"]=(NOW+timedelta(seconds=1)).isoformat();self.save()
        with self.assertRaises(ValueError):build_lite_snapshot(self.root,NOW)
    def test_pending_surfaces_halt_without_recovery(self):
        (self.root/"PENDING").write_text("incomplete")
        v=build_lite_snapshot(self.root,NOW)
        self.assertTrue(v["safety"]["pending_recovery"])
        self.assertFalse(v["safety"]["integrity_verified"])
        self.assertTrue((self.root/"PENDING").exists())
    def test_daemon_requires_real_matching_process_and_fresh_heartbeat(self):
        pilot=self.runtime/"g11-observation";pilot.mkdir()
        (pilot/"background-health.json").write_text(json.dumps({
            "scheduler":"RUNNING","checked_at":NOW.isoformat(),"mode":"multi-lite","pid":999999999}))
        self.assertEqual(build_lite_snapshot(self.root,NOW)["daemon"]["scheduler"],"UNKNOWN")
    def test_unbound_research_rejected(self):
        self.data["research"]=[{"instrument_id":"MSFT"}];self.save()
        with self.assertRaises(ValueError):build_lite_snapshot(self.root,NOW)

    def test_projection_preserves_checkpoint_time_and_marks_stale_scan(self):
        self.data["scan"]={"as_of":NOW.isoformat(),"rows":[]};self.save()
        value=build_lite_snapshot(self.root,NOW+timedelta(hours=2))
        self.assertEqual(value["generated_at"],NOW.isoformat())
        self.assertTrue(value["data_health"]["stale"])
    def test_budget_is_recomputed_for_current_utc_day(self):
        self.data["budget"]={"limit":2,"attempts_consumed":2,"blocked":True,"reasons_nl":[]}
        self.save()
        value=build_lite_snapshot(self.root,NOW+timedelta(days=1))
        self.assertEqual(value["budget"]["day_utc"],"2026-10-10")
        self.assertEqual(value["budget"]["attempts_consumed"],0)
    def test_failed_job_is_visible_even_with_valid_checkpoint(self):
        (self.root/"health.json").write_text(json.dumps({"status":"FAIL","checked_at":NOW.isoformat()}))
        value=build_lite_snapshot(self.root,NOW)
        self.assertEqual(value["job_health"]["status"],"FAIL")

if __name__=="__main__":unittest.main()
