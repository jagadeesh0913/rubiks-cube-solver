"""
HTTP Server and REST API backend for the 3D Rubik's Cube Solver.
Serves static WebGL frontend and provides solver endpoints.
"""

import http.server
import socketserver
import urllib.parse
import json
import webbrowser
import os
import sys

# Setup project import paths
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from solver import solve
from core import RubiksCube

WEB_DIR = os.path.join(PROJECT_ROOT, "web")


class CubeRequestHandler(http.server.SimpleHTTPRequestHandler):
    """Handles static web requests and REST API calls."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=WEB_DIR, **kwargs)

    def do_OPTIONS(self):
        """Handle CORS pre-flight."""
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)

        # API: Solve cube
        if parsed.path == "/api/solve":
            params = urllib.parse.parse_qs(parsed.query)
            cube_str = params.get("cube", [""])[0].strip().upper()
            self._handle_solve(cube_str)
            return

        # API: Scramble cube
        if parsed.path == "/api/scramble":
            params = urllib.parse.parse_qs(parsed.query)
            try:
                length = int(params.get("length", ["20"])[0])
            except ValueError:
                length = 20
            cube = RubiksCube()
            moves = cube.scramble(length)
            self._send_json({
                "status": "success",
                "moves": moves,
                "scramble_str": " ".join(moves),
                "kociemba": cube.to_kociemba()
            })
            return

        # Serve static web files
        return super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/solve":
            content_len = int(self.headers.get("Content-Length", 0))
            post_body = self.rfile.read(content_len).decode("utf-8")
            try:
                data = json.loads(post_body)
                cube_str = data.get("cube", "").strip().upper()
            except Exception:
                cube_str = ""
            self._handle_solve(cube_str)
            return

        self.send_error(404, "Endpoint not found")

    def _handle_solve(self, cube_str: str):
        if len(cube_str) != 54:
            self._send_json({
                "status": "error",
                "message": f"Expected exactly 54 facelets, but received {len(cube_str)}."
            }, status_code=400)
            return

        try:
            res = solve(cube_str)
            self._send_json(res)
        except Exception as exc:
            self._send_json({
                "status": "error",
                "message": str(exc)
            }, status_code=422)

    def _send_json(self, data: dict, status_code: int = 200):
        body = json.dumps(data).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


class ThreadedHTTPServer(http.server.ThreadingHTTPServer):
    allow_reuse_address = True
    daemon_threads = True


def start_server(port: int = 8000, open_browser: bool = True):
    """Starts the HTTP server. In production (Railway), binds to $PORT env var."""
    # Railway / cloud platforms inject PORT env variable
    env_port = os.environ.get("PORT")
    if env_port:
        port = int(env_port)
        open_browser = False  # Never open browser in cloud environment

    for p in range(port, port + 20):
        try:
            httpd = ThreadedHTTPServer(("", p), CubeRequestHandler)
            url = f"http://localhost:{p}/index.html"
            print(f"==================================================")
            print(f"  3D Rubik's Cube Solver running at:")
            print(f"  --> {url}")
            print(f"==================================================")
            if open_browser:
                webbrowser.open(url)
            try:
                httpd.serve_forever()
            except KeyboardInterrupt:
                print("\nShutting down server...")
            finally:
                httpd.server_close()
            break
        except OSError:
            continue


if __name__ == "__main__":
    start_server()
