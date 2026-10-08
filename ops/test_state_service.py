"""Authenticated adapter boundary check using a disposable test credential."""
import json
import os
import socket
import subprocess
import tempfile
import time
import unittest
import urllib.error
import urllib.request
from pathlib import Path

class StateServiceTests(unittest.TestCase):
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
                with urllib.request.urlopen(request, timeout=15) as response:
                    self.assertEqual(response.headers["Cache-Control"], "no-store")
                    result = json.load(response)
                self.assertFalse(result["live_orders_enabled"])
                self.assertFalse(result["latest"]["fixture"])
                self.assertTrue(result["safety"]["journal_verified"])
                self.assertTrue(result["read_only"])
                request = urllib.request.Request(origin + "/g11-shadow", headers={"Authorization": "Bearer unit-test-placeholder"}, method="POST", data=b"{}")
                with self.assertRaises(urllib.error.HTTPError) as context: urllib.request.urlopen(request, timeout=5)
                self.assertEqual(context.exception.code, 501)
            finally:
                server.terminate(); server.wait(timeout=5)
if __name__ == "__main__": unittest.main()
