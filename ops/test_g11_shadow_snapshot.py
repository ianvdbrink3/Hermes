"""Projection integrity checks against a disposable copy of recorded evidence."""
import fcntl
import importlib.util
import json
import shutil
import tempfile
import unittest
from datetime import UTC, datetime
from pathlib import Path

spec = importlib.util.spec_from_file_location("g11_projector", Path(__file__).with_name("g11_shadow_snapshot.py"))
projector = importlib.util.module_from_spec(spec)
spec.loader.exec_module(projector)

class ProjectionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        source = projector.STOCKS / "runtime/g11-observation"
        for name in ("latest.json", "portfolio.json", "observations.jsonl", "journal.jsonl"):
            shutil.copy2(source / name, self.root / name)
        self.before = {p.name: p.read_bytes() for p in self.root.iterdir()}
    def tearDown(self):
        self.temp.cleanup()
    def snapshot(self):
        return projector.build_snapshot(self.root, datetime.now(UTC))
    def test_real_projection_does_not_mutate_accounting(self):
        result = self.snapshot()
        self.assertFalse(result["live_orders_enabled"])
        self.assertFalse(result["latest"]["fixture"])
        self.assertTrue(result["safety"]["reconciled"])
        self.assertEqual(self.before, {p.name: p.read_bytes() for p in self.root.iterdir()})
    def test_reader_never_contends_with_execution_lock(self):
        with (self.root / "execution.lock").open("w") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            self.assertFalse(self.snapshot()["live_orders_enabled"])
    def test_tampered_latest_rejected(self):
        path = self.root / "latest.json"
        value = json.loads(path.read_text()); value["equity"] = "200000"
        path.write_text(json.dumps(value))
        with self.assertRaisesRegex(ValueError, "checkpoint"):
            self.snapshot()
    def test_tampered_history_rejected(self):
        path = self.root / "observations.jsonl"
        value = json.loads(path.read_text().splitlines()[0]); value["equity"] = "200000"
        path.write_text(json.dumps(value) + "\n")
        with self.assertRaisesRegex(ValueError, "integrity"):
            self.snapshot()
    def test_tampered_portfolio_rejected(self):
        path = self.root / "portfolio.json"
        value = json.loads(path.read_text()); value["cash"] = "200000"
        path.write_text(json.dumps(value))
        with self.assertRaises(ValueError):
            self.snapshot()
    def test_tampered_journal_rejected(self):
        path = self.root / "journal.jsonl"
        value = json.loads(path.read_text().splitlines()[0]); value["payload"]["tampered"] = True
        path.write_text(json.dumps(value) + "\n")
        with self.assertRaisesRegex(ValueError, "integrity"):
            self.snapshot()
    def test_explicit_kill_and_pending_truthful(self):
        (self.root / "KILL_SWITCH").touch(); (self.root / "PENDING").touch()
        result = self.snapshot()
        self.assertTrue(result["safety"]["kill_switch"])
        self.assertTrue(result["safety"]["pending_recovery"])
        self.assertFalse(result["safety"]["reconciled"])

if __name__ == "__main__": unittest.main()
