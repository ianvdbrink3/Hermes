import importlib.util
import json
import os
from pathlib import Path
from unittest.mock import patch


def load_server(tmp_path):
    env = tmp_path / "test.env"
    env.write_text("API_SERVER_KEY=disposable-test-key\n")
    with patch.dict(os.environ, {"RESEARCH_ENV": str(env)}):
        spec = importlib.util.spec_from_file_location("council_state", Path(__file__).with_name("autonomy_state_server.py"))
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
    return module


def test_snapshot_endpoint_authenticates_before_projection(tmp_path):
    module = load_server(tmp_path)
    class Request:
        path = "/council/snapshot"
        def authorized(self): return False
        def send_json(self, status, payload): self.result = (status, payload)
    request = Request()
    with patch.object(module.subprocess, "run") as run:
        module.Handler.do_GET(request)
    assert request.result[0] == 401
    run.assert_not_called()


def test_council_snapshot_has_fixed_bounded_command(tmp_path):
    module = load_server(tmp_path)
    class Request:
        path = "/council/snapshot?cursor=100&q=small"
        def authorized(self): return True
        def send_json(self, status, payload): self.result = (status, payload)
    request = Request()
    import subprocess
    with patch.object(module.subprocess, "run", return_value=subprocess.CompletedProcess([], 0, '{"fixture":false}')) as run:
        module.Handler.do_GET(request)
    assert request.result[0] == 200
    args = run.call_args[0][0]
    assert "--cursor" in args and "100" in args
    assert "--query" in args and "small" in args
    assert run.call_args.kwargs["timeout"] <= 25


def test_unknown_or_oversized_query_is_rejected(tmp_path):
    module = load_server(tmp_path)
    class Request:
        path = "/council/snapshot?cursor=../../secret"
        def authorized(self): return True
        def send_json(self, status, payload): self.result = (status, payload)
    request = Request()
    with patch.object(module.subprocess, "run") as run:
        module.Handler.do_GET(request)
    assert request.result[0] == 400
    run.assert_not_called()


def test_archive_auth_is_checked_before_read(tmp_path):
    module = load_server(tmp_path)
    class Request:
        path = "/council/archive?case=case:2026-10-13:MSFT"
        def authorized(self): return False
        def send_json(self, status, payload): self.result = (status, payload)
    request = Request()
    with patch.object(module.subprocess, "run") as run:
        module.Handler.do_GET(request)
    assert request.result[0] == 401
    run.assert_not_called()

def test_archive_reads_only_fixed_worker_and_selected_verified_case(tmp_path):
    import subprocess
    module = load_server(tmp_path)
    class Request:
        path = "/council/archive?case=case:2026-10-13:MSFT"
        def authorized(self): return True
        def send_json(self, status, payload): self.result = (status, payload)
    request = Request()
    with patch.object(module.subprocess, "run", return_value=subprocess.CompletedProcess([],0,'{"fixture":false}')) as run:
        module.Handler.do_GET(request)
    assert request.result[0] == 200
    assert run.call_args[0][0][-2:] == ["--case","case:2026-10-13:MSFT"]
    assert run.call_args.kwargs["timeout"] <= 25
