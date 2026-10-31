"""
Kociemba Two-Phase Optimal Rubik's Cube Solver interface.
Computes solutions in ~20 moves (<0.2s) using precomputed pattern databases.
"""

import os
import sys
import time
from typing import Dict, Any, List

# Ensure local pykociemba package is found
SOLVER_DIR = os.path.dirname(os.path.abspath(__file__))
if SOLVER_DIR not in sys.path:
    sys.path.insert(0, SOLVER_DIR)

from pykociemba.search import Search

_SEARCHER = None

def get_searcher() -> Search:
    """Lazy initialization of Kociemba searcher."""
    global _SEARCHER
    if _SEARCHER is None:
        _SEARCHER = Search()
    return _SEARCHER


def solve(k_str: str, max_depth: int = 24, timeout_ms: int = 1000) -> Dict[str, Any]:
    """
    Solves a 54-character Kociemba string (U1..U9 R1..R9 F1..F9 D1..D9 L1..L9 B1..B9).
    Returns dict with status, moves, count, duration, and algorithm comparison info.
    """
    k_str = k_str.strip().upper()
    if len(k_str) != 54:
        raise ValueError(f"Cube string must be exactly 54 characters, got {len(k_str)}")

    # Check already solved
    from core.constants import SOLVED_KOCIEMBA
    if k_str == SOLVED_KOCIEMBA:
        return {
            "status": "success",
            "solution": "",
            "moves": [],
            "move_count": 0,
            "duration_ms": 0.0,
            "message": "Cube is already solved!"
        }

    searcher = get_searcher()
    t0 = time.perf_counter()
    sol_str = searcher.solution(k_str, max_depth, timeout_ms, False).strip()
    t1 = time.perf_counter()

    moves: List[str] = sol_str.split() if sol_str else []

    return {
        "status": "success",
        "solution": sol_str,
        "moves": moves,
        "move_count": len(moves),
        "duration_ms": round((t1 - t0) * 1000, 2),
        "algorithm": "Kociemba Two-Phase Algorithm",
        "comparison": {
            "kociemba_moves": len(moves),
            "typical_cfop_moves": 55,
            "typical_roux_moves": 48
        }
    }
