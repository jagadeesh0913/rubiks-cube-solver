#!/usr/bin/env python3
"""
3D Rubik's Cube Solver — Main Application Runner
Starts the local solver server and launches the 3D WebGL user interface in browser.
"""

import sys
import os

# Ensure project root is in sys.path
PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from server import start_server

def main():
    print("================================================================")
    print("       3D RUBIK'S CUBE SOLVER (KOCIEMBA TWO-PHASE ENGINE)       ")
    print("================================================================")
    import os
    is_cloud = bool(os.environ.get("PORT"))
    print("Starting backend server and launching 3D interactive cube...")
    start_server(port=8000, open_browser=not is_cloud)

if __name__ == "__main__":
    main()
