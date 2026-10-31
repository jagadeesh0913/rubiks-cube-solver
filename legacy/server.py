import http.server
import socketserver
import urllib.parse
import json
import webbrowser
import os
import sys

# Ensure local modules are found
DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, DIR)

from pykociemba.search import Search
searcher = Search()

SOLVED_K = "UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB"

class CubeHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIR, **kwargs)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/solve":
            params = urllib.parse.parse_qs(parsed.query)
            cube_str = params.get("cube", [""])[0].strip().upper()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()

            if len(cube_str) != 54:
                resp = {"status": "error", "message": f"Expected 54 facelets, got {len(cube_str)}"}
            elif cube_str == SOLVED_K:
                resp = {"status": "success", "solution": "", "moves": [], "move_count": 0, "message": "Already solved!"}
            else:
                try:
                    sol = searcher.solution(cube_str, 24, 1000, False).strip()
                    moves = sol.split() if sol else []
                    resp = {
                        "status": "success",
                        "solution": sol,
                        "moves": moves,
                        "move_count": len(moves),
                        "algorithm": "Kociemba Two-Phase Algorithm",
                        "comparison": {
                            "kociemba_moves": len(moves),
                            "typical_cfop_moves": 55,
                            "typical_roux_moves": 48
                        }
                    }
                except Exception as exc:
                    resp = {"status": "error", "message": str(exc)}

            self.wfile.write(json.dumps(resp).encode("utf-8"))
            return

        return super().do_GET()

def start_server(port=8000, open_browser=True):
    for p in range(port, port + 10):
        try:
            httpd = socketserver.TCPServer(("", p), CubeHandler)
            url = f"http://localhost:{p}/index.html"
            print(f"Cube Solver Web Server running at: {url}")
            if open_browser:
                webbrowser.open(url)
            try:
                httpd.serve_forever()
            except KeyboardInterrupt:
                print("Server stopped.")
            finally:
                httpd.server_close()
            break
        except OSError:
            continue

if __name__ == "__main__":
    start_server()
