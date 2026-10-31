"""
Core constants for Rubik's Cube representation, notations, and color mapping.
"""

# Standard face notations
# U = Up (White), D = Down (Yellow)
# F = Front (Green), B = Back (Blue)
# L = Left (Orange), R = Right (Red)
FACE_ORDER = ["U", "D", "L", "R", "F", "B"]
KOCIEMBA_FACE_ORDER = ["U", "R", "F", "D", "L", "B"]

FACE_NAMES = {
    "U": "Up",
    "D": "Down",
    "F": "Front",
    "B": "Back",
    "L": "Left",
    "R": "Right"
}

# Authentic Rubik's Cube hex colors
FACE_COLORS = {
    "U": "#f5f5f7",  # White
    "D": "#f6d32d",  # Yellow
    "F": "#22c55e",  # Green
    "B": "#1d78f2",  # Blue
    "L": "#ff9a1f",  # Orange
    "R": "#e63946",  # Red
}

COLOR_NAMES = {
    "U": "White",
    "D": "Yellow",
    "F": "Green",
    "B": "Blue",
    "L": "Orange",
    "R": "Red"
}

# 3D Axis definition for each face: (axis_index, direction_sign)
# X: 0 (Right +1, Left -1)
# Y: 1 (Up +1, Down -1)
# Z: 2 (Front +1, Back -1)
FACE_AXIS = {
    "R": (0, 1),
    "L": (0, -1),
    "U": (1, 1),
    "D": (1, -1),
    "F": (2, 1),
    "B": (2, -1),
}

# Solved Kociemba 54-character representation: U*9 + R*9 + F*9 + D*9 + L*9 + B*9
SOLVED_KOCIEMBA = "UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB"
