"""Authenticated adapter boundary check using a disposable test credential."""
import json
import os
import socket
import subprocess
import tempfile
import time
import unittest
from unittest.mock import patch
import importlib.util
import urllib.error
import urllib.request
from pathlib import Path

class StateServiceTests(unittest.TestCase):
    def test_slow_read_only_projection_fits_the_handler_budget(self):
        spec=importlib.util.spec_from_file_location("state_adapter",Path(__file__).with_name("autonomy_state_server.py"))
        module=importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        class Request:
            path="/g11-shadow"
            def authorized(self): return True
            def send_json(self,status,payload): self.result=(status,payload)
        request=Request()
        def slow_projection(command,**kwargs):
            if kwargs["timeout"] < 9:
                raise subprocess.TimeoutExpired(command,kwargs["timeout"])
            return subprocess.CompletedProcess(command,0,'{"read_only":true,"live_orders_enabled":false}')
        with patch.object(module.subprocess,"run",side_effect=slow_projection):
            module.Handler.do_GET(request)
        self.assertEqual(request.result[0],200)
        self.assertTrue(request.result[1]["read_only"])

    def test_authentication_and_real_read_only_projection(self):
        with tempfile.TemporaryDirectory() as directory:
            config = Path(directory) / "test.env"
            config.write_text("API_SERVER_KEY=unit-test-placeholder\n")
            with socket.socket() as sock:
                sock.bind(("127.0.0.1", 0)); port = sock.getsockname()[1]
            env = {**os.environ, "RESEARCH_ENV": str(config), "AUTONOMY_STATE_PORT": str(port)}
            server = subprocess.Popen(["/usr/bin/python3", str(Path(__file__).with_name("autonomy_state_server.py"))], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            try:
                origin = f"http://127.0.0.1:{port}"
                for _ in range(100):
                    try:
                        urllib.request.urlopen(origin + "/health", timeout=1)
                    except urllib.error.HTTPError as error:
                        if error.code == 401: break
                    except OSError:
                        time.sleep(.1)
                else: self.fail("Test adapter failed to start")
                for token in ("", "wrong-test-key"):
                    request = urllib.request.Request(origin + "/g11-shadow", headers={"Authorization": f"Bearer {token}"})
                    with self.assertRaises(urllib.error.HTTPError) as context: urllib.request.urlopen(request, timeout=10)
                    self.assertEqual(context.exception.code, 401)
                request = urllib.request.Request(origin + "/g11-shadow", headers={"Authorization": "Bearer unit-test-placeholder"})
                with urllib.request.urlopen(request, timeout=25) as response:
                    self.assertEqual(response.headers["Cache-Control"], "no-store")
                    result = json.load(response)
                self.assertFalse(result["live_orders_enabled"])
                if result["schema_version"] == 2:
                    self.assertFalse(result["fixture"])
                    self.assertTrue(result["safety"]["integrity_verified"])
                    self.assertEqual(result["counts"]["tracked_stocks"],20)
                else:
                    self.assertFalse(result["latest"]["fixture"])
                    self.assertTrue(result["safety"]["journal_verified"])
                self.assertTrue(result["read_only"])
                request = urllib.request.Request(origin + "/g11-shadow", headers={"Authorization": "Bearer unit-test-placeholder"}, method="POST", data=b"{}")
                with self.assertRaises(urllib.error.HTTPError) as context: urllib.request.urlopen(request, timeout=5)
                self.assertEqual(context.exception.code, 501)
            finally:
                server.terminate(); server.wait(timeout=5)
if __name__ == "__main__": unittest.main()
