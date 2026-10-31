"""
Rubik's Cube state representation and mathematical move permutation engine.
"""

import random
from typing import List, Tuple, Dict
from .constants import (
    FACE_ORDER, KOCIEMBA_FACE_ORDER, FACE_AXIS, SOLVED_KOCIEMBA
)


def slot_geometry(face: str, row: int, col: int) -> Tuple[Tuple[int, int, int], Tuple[int, int, int]]:
    """
    Returns 3D (cubie_coord, face_normal) for a given facelet (face, row, col).
    row: 0..2 (top to bottom), col: 0..2 (left to right).
    """
    if face == "U":
        return (col - 1, 1, row - 1), (0, 1, 0)
    if face == "D":
        return (col - 1, -1, 1 - row), (0, -1, 0)
    if face == "F":
        return (col - 1, 1 - row, 1), (0, 0, 1)
    if face == "B":
        return (1 - col, 1 - row, -1), (0, 0, -1)
    if face == "R":
        return (1, 1 - row, 1 - col), (1, 0, 0)
    if face == "L":
        return (-1, 1 - row, col - 1), (-1, 0, 0)
    raise ValueError(f"Invalid face identifier: {face}")


# Precalculate 54 sticker slots and lookup table
SLOTS: List[Dict] = []
SLOT_LOOKUP: Dict[Tuple[Tuple[int, int, int], Tuple[int, int, int]], int] = {}

for face in FACE_ORDER:
    for row in range(3):
        for col in range(3):
            pos, norm = slot_geometry(face, row, col)
            idx = len(SLOTS)
            SLOTS.append({
                "face": face,
                "row": row,
                "col": col,
                "pos": pos,
                "normal": norm
            })
            SLOT_LOOKUP[(pos, norm)] = idx


def _rotate_positive_axis(vec: Tuple[int, int, int], axis: int) -> Tuple[int, int, int]:
    """Rotate 3D integer coordinate 90 deg around positive cardinal axis."""
    x, y, z = vec
    if axis == 0:
        return (x, -z, y)
    if axis == 1:
        return (z, y, -x)
    return (-y, x, z)


def _rotate_vec(vec: Tuple[int, int, int], axis: int, turns: int) -> Tuple[int, int, int]:
    res = tuple(vec)
    for _ in range(turns % 4):
        res = _rotate_positive_axis(res, axis)
    return res


def compute_permutation(face: str, turns: int = 1) -> List[int]:
    """Computes index mapping for 54 facelets under face turn."""
    axis, sign = FACE_AXIS[face]
    quarter_turns = (-sign * turns) % 4
    mapping = list(range(54))
    layer_val = sign

    for old_idx, slot in enumerate(SLOTS):
        if slot["pos"][axis] == layer_val:
            new_pos = _rotate_vec(slot["pos"], axis, quarter_turns)
            new_norm = _rotate_vec(slot["normal"], axis, quarter_turns)
            new_idx = SLOT_LOOKUP[(new_pos, new_norm)]
            mapping[new_idx] = old_idx
    return mapping


# Precompute all 18 standard move permutations
MOVE_PERMUTATIONS: Dict[str, List[int]] = {}
for _f in FACE_ORDER:
    MOVE_PERMUTATIONS[_f] = compute_permutation(_f, 1)
    MOVE_PERMUTATIONS[_f + "'"] = compute_permutation(_f, 3)
    MOVE_PERMUTATIONS[_f + "2"] = compute_permutation(_f, 2)


class RubiksCube:
    """Mathematical representation of a 3x3x3 Rubik's Cube."""

    def __init__(self, state: List[str] = None):
        if state is not None:
            self.state = list(state)
        else:
            self.reset()

    def reset(self):
        """Reset to solved cube state."""
        self.state = [slot["face"] for slot in SLOTS]

    def is_solved(self) -> bool:
        """Check if cube is in completely solved state."""
        return self.to_kociemba() == SOLVED_KOCIEMBA

    def apply_move(self, move: str):
        """Applies a single move (e.g. 'U', 'R'', 'F2')."""
        if move not in MOVE_PERMUTATIONS:
            raise ValueError(f"Unrecognized move notation: {move}")
        perm = MOVE_PERMUTATIONS[move]
        self.state = [self.state[src_idx] for src_idx in perm]

    def apply_moves(self, moves: List[str]):
        """Applies a sequence of moves in order."""
        for m in moves:
            self.apply_move(m)

    def scramble(self, length: int = 20) -> List[str]:
        """Scrambles cube with random moves (no redundant consecutive faces)."""
        faces = ["U", "D", "L", "R", "F", "B"]
        suffixes = ["", "'", "2"]
        moves = []
        prev = None
        for _ in range(length):
            opts = [f for f in faces if f != prev]
            face = random.choice(opts)
            move = face + random.choice(suffixes)
            moves.append(move)
            self.apply_move(move)
            prev = face
        return moves

    def to_kociemba(self) -> str:
        """Converts internal state to Kociemba 54-char string (U R F D L B order)."""
        k_str = ""
        for face in KOCIEMBA_FACE_ORDER:
            for r in range(3):
                for c in range(3):
                    idx = SLOT_LOOKUP[slot_geometry(face, r, c)]
                    k_str += self.state[idx]
        return k_str

    def from_kociemba(self, k_str: str):
        """Sets internal state from 54-char Kociemba string."""
        if len(k_str) != 54:
            raise ValueError(f"Expected 54 characters, got {len(k_str)}")
        new_state = list(self.state)
        ptr = 0
        for face in KOCIEMBA_FACE_ORDER:
            for r in range(3):
                for c in range(3):
                    idx = SLOT_LOOKUP[slot_geometry(face, r, c)]
                    new_state[idx] = k_str[ptr]
                    ptr += 1
        self.state = new_state

    def validate_counts(self) -> Tuple[bool, Dict[str, int]]:
        """Verifies exactly 9 stickers of each color."""
        counts = {f: 0 for f in FACE_ORDER}
        for facelet in self.state:
            counts[facelet] = counts.get(facelet, 0) + 1
        all_nine = all(c == 9 for c in counts.values())
        return all_nine, counts
