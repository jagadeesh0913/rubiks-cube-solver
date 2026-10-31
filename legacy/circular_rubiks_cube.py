import tkinter as tk
from tkinter import ttk, messagebox
import math
import random
import numpy as np
import webbrowser
import subprocess
import os
import sys

# Ensure local pykociemba is imported
DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, DIR)

from pykociemba.search import Search

# ==============================================================================
# Rubik's Cube — 3D Cube with Sides, Circular Physics & Kociemba Two-Phase Solver
# ==============================================================================

W, H = 1000, 940
CX, CY = 500, 360
DEFAULT_SCALE = 120.0
DEFAULT_PITCH = math.radians(24)
DEFAULT_YAW = math.radians(-34)

FACE_ORDER = ["U", "D", "L", "R", "F", "B"]
FACE_NAMES = {
    "U": "Upper", "D": "Down", "L": "Left",
    "R": "Right", "F": "Front", "B": "Back"
}
FACE_COLORS = {
    "U": "#f5f5f7",  # White
    "D": "#f6d32d",  # Yellow
    "L": "#ff9a1f",  # Orange
    "R": "#e63946",  # Red
    "F": "#22c55e",  # Green
    "B": "#1d78f2",  # Blue
}
PLASTIC_BODY = "#111215"
BG = "#07080b"
PANEL_BG = "#101217"
TEXT = "#eaeaea"
ANIM_STEPS = 14
ANIM_MS = 16

# ------------------------------------------------------------------------------
# 3D Slot Geometry & Cube Math
# ------------------------------------------------------------------------------
def slot_geometry(face, row, col):
    if face == "U": return (col - 1, 1, row - 1), (0, 1, 0)
    if face == "D": return (col - 1, -1, 1 - row), (0, -1, 0)
    if face == "F": return (col - 1, 1 - row, 1), (0, 0, 1)
    if face == "B": return (1 - col, 1 - row, -1), (0, 0, -1)
    if face == "R": return (1, 1 - row, 1 - col), (1, 0, 0)
    if face == "L": return (-1, 1 - row, col - 1), (-1, 0, 0)
    raise ValueError(face)

SLOTS = []
SLOT_LOOKUP = {}
for face in FACE_ORDER:
    for row in range(3):
        for col in range(3):
            pos, normal = slot_geometry(face, row, col)
            idx = len(SLOTS)
            SLOTS.append({
                "face": face, "row": row, "col": col,
                "pos": pos, "normal": normal
            })
            SLOT_LOOKUP[(pos, normal)] = idx

FACE_AXIS = {
    "R": (0, 1), "L": (0, -1),
    "U": (1, 1), "D": (1, -1),
    "F": (2, 1), "B": (2, -1),
}
AXIS_VECTORS = {
    0: np.array([1.0, 0.0, 0.0]),
    1: np.array([0.0, 1.0, 0.0]),
    2: np.array([0.0, 0.0, 1.0])
}

def rotate_positive_axis(vec, axis):
    x, y, z = vec
    if axis == 0: return (x, -z, y)
    if axis == 1: return (z, y, -x)
    return (-y, x, z)

def rotate_vec(vec, axis, quarter_turns):
    result = tuple(vec)
    for _ in range(quarter_turns % 4):
        result = rotate_positive_axis(result, axis)
    return result

def move_permutation(face, turns=1):
    axis, sign = FACE_AXIS[face]
    quarter_turns = (-sign * turns) % 4
    mapping = list(range(54))
    layer_value = sign
    for old_idx, slot in enumerate(SLOTS):
        pos = slot["pos"]
        if pos[axis] == layer_value:
            new_pos = rotate_vec(pos, axis, quarter_turns)
            new_normal = rotate_vec(slot["normal"], axis, quarter_turns)
            mapping[old_idx] = SLOT_LOOKUP[(new_pos, new_normal)]
    return mapping

PERMUTATIONS = {}
for f in FACE_ORDER:
    for amount, suffix in [(1, ""), (3, "'"), (2, "2")]:
        PERMUTATIONS[f + suffix] = move_permutation(f, amount)

def solved_state():
    return [slot["face"] for slot in SLOTS]

def apply_move(state, move):
    face = move[0]
    suffix = move[1:] if len(move) > 1 else ""
    turns = {"": 1, "'": 3, "2": 2}[suffix]
    mapping = move_permutation(face, turns)
    result = list(state)
    for old_idx, new_idx in enumerate(mapping):
        result[new_idx] = state[old_idx]
    return result

def invert_move(move):
    if move.endswith("'"): return move[:-1]
    if move.endswith("2"): return move
    return move + "'"

def parse_sequence(text):
    tokens = text.strip().upper().split()
    valid = set(PERMUTATIONS)
    for token in tokens:
        if token not in valid:
            raise ValueError(f"Unknown move: {token}. Use moves like R, L', U2, F2.")
    return tokens

def rodrigues(p, u, theta):
    cos_t = math.cos(theta)
    sin_t = math.sin(theta)
    return p * cos_t + np.cross(u, p) * sin_t + u * np.dot(u, p) * (1.0 - cos_t)

def state_to_kociemba(st):
    k_str = ""
    for f in ["U", "R", "F", "D", "L", "B"]:
        for r in range(3):
            for c in range(3):
                idx = SLOT_LOOKUP[slot_geometry(f, r, c)]
                k_str += st[idx]
    return k_str

# ------------------------------------------------------------------------------
# Main Application GUI
# ------------------------------------------------------------------------------
class CircleCubeApp:
    def __init__(self, root):
        self.root = root
        root.title("Rubik's Cube — 3D Sides & Optimal Two-Phase Solver")
        root.configure(bg=BG)
        root.geometry(f"{W}x{H}")
        root.minsize(920, 860)

        self.state = solved_state()
        self.busy = False
        self.animation_job = None

        # View settings
        self.sticker_style = "Circles"  # "Circles" or "Tiles"
        self.show_circle_guide = True

        # 3D Camera
        self.pitch = DEFAULT_PITCH
        self.yaw = DEFAULT_YAW
        self.scale = DEFAULT_SCALE
        self.mouse_last_x = 0
        self.mouse_last_y = 0

        # Layer rotation animation
        self.rotating_face = None
        self.rotating_angle = 0.0

        # Solver & Playback
        self.searcher = Search()
        self.solution_moves = []
        self.solution_step = 0
        self.is_playing = False
        self.play_job = None
        self.anim_speed_ms = 150

        # 3D Paint Mode (click stickers directly on the cube)
        self.paint_mode = False
        self.paint_color = "U"
        self.sticker_item_map = {}  # canvas item id -> slot_idx

        # Build UI layout
        self.build_ui()
        self.redraw()

    def build_ui(self):
        # Header
        header = tk.Frame(self.root, bg=BG)
        header.pack(fill="x", pady=(10, 0))

        title_frame = tk.Frame(header, bg=BG)
        title_frame.pack()
        tk.Label(
            title_frame, text="RUBIK'S CUBE 3D",
            bg=BG, fg=TEXT, font=("Georgia", 16, "bold")
        ).pack(side="left")
        tk.Label(
            title_frame, text="TWO-PHASE OPTIMAL SOLVER",
            bg="#2a0d11", fg="#e63946", font=("Helvetica", 8, "bold"),
            padx=6, pady=2
        ).pack(side="left", padx=8)

        tk.Label(
            header,
            text="Interactive 3D cube with sides • Drag to rotate • Circular layer physics • Solves in ~20 moves (<0.2s)",
            bg=BG, fg="#7e8490", font=("Helvetica", 9)
        ).pack(pady=(2, 0))

        # Top Action Toolbar
        toolbar = tk.Frame(self.root, bg=BG)
        toolbar.pack(fill="x", padx=16, pady=(6, 2))

        # Left toolbar items: Set State & Solve
        self.paint_toggle_btn = tk.Button(
            toolbar, text="🎨 Paint Cube Colors", command=self.toggle_paint_mode,
            bg="#1d222b", fg="#60a5fa", activebackground="#2c3442", activeforeground="#93c5fd",
            relief="flat", font=("Helvetica", 9, "bold"), padx=10, pady=3, cursor="hand2"
        )
        self.paint_toggle_btn.pack(side="left", padx=(0, 6))

        tk.Button(
            toolbar, text="⚡ Solve Cube (Fewest Moves)", command=self.solve_cube,
            bg="#e63946", fg="#ffffff", activebackground="#ff4757", activeforeground="#ffffff",
            relief="flat", font=("Helvetica", 9, "bold"), padx=12, pady=3, cursor="hand2"
        ).pack(side="left", padx=(0, 10))

        # Sticker Style
        self.sticker_btn = tk.Button(
            toolbar, text="Stickers: Circles", command=self.toggle_sticker_style,
            bg="#181a20", fg=TEXT, activebackground="#282c36", activeforeground=TEXT,
            relief="flat", font=("Helvetica", 9), padx=8, pady=3, cursor="hand2"
        )
        self.sticker_btn.pack(side="left", padx=(0, 6))

        # Orbit Guide Toggle
        self.guide_btn = tk.Button(
            toolbar, text="Orbit Guide: ON", command=self.toggle_guide,
            bg="#181a20", fg=TEXT, activebackground="#282c36", activeforeground=TEXT,
            relief="flat", font=("Helvetica", 9), padx=8, pady=3, cursor="hand2"
        )
        self.guide_btn.pack(side="left", padx=(0, 6))

        # Web App Launcher
        tk.Button(
            toolbar, text="🌐 Open Web 3D App", command=self.launch_web_app,
            bg="#142018", fg="#34d399", activebackground="#1e3226", activeforeground="#6ee7b7",
            relief="flat", font=("Helvetica", 9), padx=8, pady=3, cursor="hand2"
        ).pack(side="left", padx=(0, 6))

        # Reset View Angle
        tk.Button(
            toolbar, text="Reset View ↺", command=self.reset_view,
            bg="#121317", fg="#9aa0ad", activebackground="#22242c", activeforeground=TEXT,
            relief="flat", font=("Helvetica", 9), padx=8, pady=3, cursor="hand2"
        ).pack(side="right")

        # ── Paint Mode Bar (hidden by default) ──
        self.paint_bar = tk.Frame(self.root, bg="#111827", padx=10, pady=6)
        # NOT packed yet — shown when paint mode activated

        tk.Label(
            self.paint_bar, text="🎨 PAINT MODE — Click any sticker on the 3D cube to color it. Drag to rotate view.",
            bg="#111827", fg="#fbbf24", font=("Helvetica", 9, "bold")
        ).pack(side="left", padx=(0, 10))

        # Color palette buttons inside paint bar
        palette_inner = tk.Frame(self.paint_bar, bg="#111827")
        palette_inner.pack(side="left", padx=(0, 10))
        self.paint_palette_btns = {}
        paint_colors_info = [
            ("U", "W", "#f5f5f7"), ("R", "R", "#e63946"), ("F", "G", "#22c55e"),
            ("D", "Y", "#f6d32d"), ("L", "O", "#ff9a1f"), ("B", "B", "#1d78f2"),
        ]
        for key, short, hex_col in paint_colors_info:
            btn = tk.Button(
                palette_inner, text=f" {short} ", bg=hex_col, activebackground=hex_col,
                relief="solid", bd=3 if key == self.paint_color else 1,
                font=("Consolas", 10, "bold"),
                fg="#000000" if key in ("U", "D", "F") else "#ffffff",
                cursor="hand2", command=lambda k=key: self.select_paint_color(k)
            )
            btn.pack(side="left", padx=2)
            self.paint_palette_btns[key] = btn

        # Paint mode counters
        self.paint_counter_frame = tk.Frame(self.paint_bar, bg="#111827")
        self.paint_counter_frame.pack(side="left", padx=(10, 10))
        self.paint_counter_labels = {}
        cnt_names = {"U": "W", "R": "R", "F": "G", "D": "Y", "L": "O", "B": "B"}
        for f in FACE_ORDER:
            lbl = tk.Label(self.paint_counter_frame, text=f"{cnt_names[f]}:9", bg="#111827", fg="#10b981", font=("Consolas", 8, "bold"))
            lbl.pack(side="left", padx=3)
            self.paint_counter_labels[f] = lbl

        # Done / Cancel buttons
        tk.Button(
            self.paint_bar, text="✅ Done Painting", command=self.finish_paint_mode,
            bg="#10b981", fg="#ffffff", font=("Helvetica", 9, "bold"),
            relief="flat", padx=10, pady=2, cursor="hand2"
        ).pack(side="right", padx=(4, 0))

        tk.Button(
            self.paint_bar, text="Cancel", command=self.cancel_paint_mode,
            bg="#374151", fg="#d1d5db", font=("Helvetica", 9),
            relief="flat", padx=8, pady=2, cursor="hand2"
        ).pack(side="right", padx=4)

        tk.Button(
            self.paint_bar, text="Scramble", command=self.scramble_for_paint,
            bg="#1e293b", fg="#93c5fd", font=("Helvetica", 9),
            relief="flat", padx=8, pady=2, cursor="hand2"
        ).pack(side="right", padx=4)

        tk.Button(
            self.paint_bar, text="Reset Solved", command=self.reset_for_paint,
            bg="#1e293b", fg="#93c5fd", font=("Helvetica", 9),
            relief="flat", padx=8, pady=2, cursor="hand2"
        ).pack(side="right", padx=4)

        # Main Canvas Area
        self.canvas = tk.Canvas(self.root, bg=BG, highlightthickness=0)
        self.canvas.pack(fill="both", expand=True, padx=10, pady=(2, 0))

        # Mouse interaction for 3D view rotation + paint click
        self.canvas.bind("<ButtonPress-1>", self.on_mouse_down)
        self.canvas.bind("<B1-Motion>", self.on_mouse_drag)
        self.canvas.bind("<ButtonRelease-1>", self.on_mouse_up)
        self.canvas.bind("<MouseWheel>", self.on_mouse_wheel)

        # Active move letter indicator
        self.indicator_id = self.canvas.create_text(
            CX, CY + 338, text="•", fill="#d94943",
            font=("Georgia", 38, "bold")
        )

        # Bottom Container
        bottom_box = tk.Frame(self.root, bg=BG)
        bottom_box.pack(fill="x", padx=16, pady=(0, 8))

        # Solution Playback Control Bar (Shown when a solution is loaded)
        self.player_bar = tk.Frame(bottom_box, bg=PANEL_BG, padx=10, pady=6)
        self.player_bar.pack(fill="x", pady=(0, 6))

        self.sol_info_label = tk.Label(
            self.player_bar, text="Solution: Ready", bg=PANEL_BG, fg=TEXT,
            font=("Helvetica", 9, "bold")
        )
        self.sol_info_label.pack(side="left", padx=(0, 10))

        self.step_label = tk.Label(
            self.player_bar, text="Step: 0 / 0", bg=PANEL_BG, fg="#9ca3af",
            font=("Consolas", 9)
        )
        self.step_label.pack(side="left", padx=(0, 12))

        tk.Button(
            self.player_bar, text="⏮ Step Back", command=self.step_backward,
            bg="#1f232b", fg=TEXT, activebackground="#333a47", relief="flat",
            font=("Helvetica", 8, "bold"), padx=8, pady=2, cursor="hand2"
        ).pack(side="left", padx=2)

        self.play_btn = tk.Button(
            self.player_bar, text="▶ Auto Play", command=self.toggle_play_solution,
            bg="#e63946", fg="#ffffff", activebackground="#ff4757", relief="flat",
            font=("Helvetica", 8, "bold"), padx=10, pady=2, cursor="hand2"
        )
        self.play_btn.pack(side="left", padx=2)

        tk.Button(
            self.player_bar, text="Step Next ⏭", command=self.step_forward,
            bg="#1f232b", fg=TEXT, activebackground="#333a47", relief="flat",
            font=("Helvetica", 8, "bold"), padx=8, pady=2, cursor="hand2"
        ).pack(side="left", padx=2)

        # Speed Selector
        tk.Label(self.player_bar, text="Speed:", bg=PANEL_BG, fg="#8b92a0", font=("Helvetica", 8)).pack(side="left", padx=(12, 4))
        for spd_label, spd_ms in [("Slow", 280), ("Normal", 130), ("Fast", 40)]:
            tk.Button(
                self.player_bar, text=spd_label, command=lambda ms=spd_ms: self.set_speed(ms),
                bg="#1a1c22", fg="#b0b5c0", activebackground="#2c3038", relief="flat",
                font=("Helvetica", 8), padx=5, pady=1, cursor="hand2"
            ).pack(side="left", padx=1)

        # 18 Move Buttons
        btn_frame = tk.Frame(bottom_box, bg=BG)
        btn_frame.pack(pady=(0, 4))
        self.make_move_buttons(btn_frame)

        # Sequence entry & Actions
        actions_frame = tk.Frame(bottom_box, bg=BG)
        actions_frame.pack(fill="x", pady=(2, 0))

        seq_left = tk.Frame(actions_frame, bg=BG)
        seq_left.pack(side="left")

        tk.Label(
            seq_left, text="Sequence:", bg=BG, fg=TEXT,
            font=("Helvetica", 9, "bold")
        ).pack(side="left", padx=(0, 6))

        self.sequence_entry = tk.Entry(
            seq_left, width=28, font=("Consolas", 11),
            bg="#131417", fg=TEXT, insertbackground=TEXT,
            relief="flat", highlightthickness=1, highlightbackground="#2e323b"
        )
        self.sequence_entry.pack(side="left", ipady=3)
        self.sequence_entry.insert(0, "R U R' U'")
        self.sequence_entry.bind("<Return>", lambda _e: self.run_sequence())

        tk.Button(
            seq_left, text="Run sequence", command=self.run_sequence,
            bg="#e5e7eb", fg="#111111", activebackground="#ffffff",
            relief="flat", font=("Helvetica", 8, "bold"), padx=10, pady=3, cursor="hand2"
        ).pack(side="left", padx=6)

        act_right = tk.Frame(actions_frame, bg=BG)
        act_right.pack(side="right")

        tk.Button(
            act_right, text="Scramble (20)", command=self.scramble,
            bg="#212429", fg=TEXT, activebackground="#333740",
            activeforeground=TEXT, relief="flat", font=("Helvetica", 8), padx=10, pady=3, cursor="hand2"
        ).pack(side="left", padx=3)

        tk.Button(
            act_right, text="Reset Solved", command=self.reset,
            bg="#212429", fg=TEXT, activebackground="#333740",
            activeforeground=TEXT, relief="flat", font=("Helvetica", 8), padx=10, pady=3, cursor="hand2"
        ).pack(side="left", padx=3)

        # Status text
        self.status = tk.Label(
            self.root, text="Click & drag cube to inspect sides • Click 'Set Unsolved State' or 'Solve Cube'",
            bg=BG, fg="#8b909a", font=("Helvetica", 9)
        )
        self.status.pack(pady=(0, 5))

    def make_move_buttons(self, parent):
        moves = [
            "U", "U'", "U2", "D", "D'", "D2",
            "L", "L'", "L2", "R", "R'", "R2",
            "F", "F'", "F2", "B", "B'", "B2"
        ]
        for i, move in enumerate(moves):
            btn = tk.Button(
                parent, text=move, width=4,
                command=lambda m=move: self.start_move(m),
                bg="#1a1c20", fg=TEXT, activebackground="#383c44",
                activeforeground=TEXT, relief="flat", font=("Consolas", 10, "bold"),
                cursor="hand2"
            )
            btn.grid(row=i // 9, column=i % 9, padx=3, pady=1)

    # --------------------------------------------------------------------------
    # Mouse Orbit Camera Controls + 3D Paint Click
    # --------------------------------------------------------------------------
    def on_mouse_down(self, event):
        self.mouse_last_x = event.x
        self.mouse_last_y = event.y
        self._mouse_start_x = event.x
        self._mouse_start_y = event.y
        self._mouse_dragged = False

    def on_mouse_drag(self, event):
        dx = event.x - self.mouse_last_x
        dy = event.y - self.mouse_last_y
        self.mouse_last_x = event.x
        self.mouse_last_y = event.y

        # Track total drag distance from press point
        total_dx = abs(event.x - self._mouse_start_x)
        total_dy = abs(event.y - self._mouse_start_y)
        if total_dx > 4 or total_dy > 4:
            self._mouse_dragged = True

        self.yaw += dx * 0.012
        self.pitch += dy * 0.012
        max_pitch = math.radians(84)
        self.pitch = max(-max_pitch, min(max_pitch, self.pitch))
        self.redraw()

    def on_mouse_up(self, event):
        """If in paint mode and user clicked (not dragged), paint the sticker under cursor."""
        if not self.paint_mode or self._mouse_dragged or self.busy:
            return
        # Find which canvas item was clicked
        item = self.canvas.find_closest(event.x, event.y)
        if item:
            item_id = item[0]
            slot_idx = self.sticker_item_map.get(item_id)
            if slot_idx is not None:
                # Don't allow painting center stickers (they define the face)
                slot = SLOTS[slot_idx]
                if slot["row"] == 1 and slot["col"] == 1:
                    return
                self.state[slot_idx] = self.paint_color
                self.update_paint_counters()
                self.redraw()

    def on_mouse_wheel(self, event):
        if event.delta > 0:
            self.scale = min(220.0, self.scale * 1.08)
        else:
            self.scale = max(60.0, self.scale / 1.08)
        self.redraw()

    def reset_view(self):
        self.pitch = DEFAULT_PITCH
        self.yaw = DEFAULT_YAW
        self.scale = DEFAULT_SCALE
        self.redraw()

    def toggle_sticker_style(self):
        if self.sticker_style == "Circles":
            self.sticker_style = "Tiles"
            self.sticker_btn.config(text="Stickers: Tiles")
        else:
            self.sticker_style = "Circles"
            self.sticker_btn.config(text="Stickers: Circles")
        self.redraw()

    def toggle_guide(self):
        self.show_circle_guide = not self.show_circle_guide
        self.guide_btn.config(text=f"Orbit Guide: {'ON' if self.show_circle_guide else 'OFF'}")
        self.redraw()

    def set_speed(self, ms):
        self.anim_speed_ms = ms

    # --------------------------------------------------------------------------
    # 3D Cube Rendering & Circular Layer Physics
    # --------------------------------------------------------------------------
    def redraw(self):
        self.canvas.delete("cube_draw")
        self.render_3d()
        self.canvas.tag_raise(self.indicator_id)

    def render_3d(self):
        cos_y, sin_y = math.cos(self.yaw), math.sin(self.yaw)
        cos_p, sin_p = math.cos(self.pitch), math.sin(self.pitch)
        Ry = np.array([[cos_y, 0, sin_y], [0, 1, 0], [-sin_y, 0, cos_y]])
        Rx = np.array([[1, 0, 0], [0, cos_p, -sin_p], [0, sin_p, cos_p]])
        R_view = Rx @ Ry

        light_dir = np.array([0.45, 0.85, 0.55])
        light_dir = light_dir / np.linalg.norm(light_dir)

        cubie_hw = 0.46
        sticker_hw = 0.39
        sticker_r = 0.38

        rot_axis = None
        rot_sign = None
        rot_unit = None
        rot_theta = 0.0
        if self.rotating_face is not None:
            rot_axis, rot_sign = FACE_AXIS[self.rotating_face]
            rot_unit = AXIS_VECTORS[rot_axis]
            rot_theta = self.rotating_angle

        polygons = []

        for x in [-1, 0, 1]:
            for y in [-1, 0, 1]:
                for z in [-1, 0, 1]:
                    c_pos = np.array([x, y, z], dtype=float)
                    is_moving = (rot_axis is not None and c_pos[rot_axis] == rot_sign)

                    for norm, u_ax, v_ax in [
                        (np.array([0, 1, 0]), np.array([1, 0, 0]), np.array([0, 0, -1])),   # U
                        (np.array([0, -1, 0]), np.array([1, 0, 0]), np.array([0, 0, 1])),   # D
                        (np.array([1, 0, 0]), np.array([0, 0, -1]), np.array([0, 1, 0])),   # R
                        (np.array([-1, 0, 0]), np.array([0, 0, 1]), np.array([0, 1, 0])),   # L
                        (np.array([0, 0, 1]), np.array([1, 0, 0]), np.array([0, 1, 0])),    # F
                        (np.array([0, 0, -1]), np.array([-1, 0, 0]), np.array([0, 1, 0])),  # B
                    ]:
                        is_outer = (
                            (norm[0] == x and x != 0) or
                            (norm[1] == y and y != 0) or
                            (norm[2] == z and z != 0)
                        )
                        is_internal_exposed = is_moving or (
                            rot_axis is not None and not is_moving and
                            norm[rot_axis] == rot_sign and c_pos[rot_axis] == 0
                        )

                        if not (is_outer or is_internal_exposed):
                            continue

                        # Base cubie quad
                        p0 = c_pos + norm * cubie_hw
                        quad_body = [
                            p0 - u_ax * cubie_hw - v_ax * cubie_hw,
                            p0 + u_ax * cubie_hw - v_ax * cubie_hw,
                            p0 + u_ax * cubie_hw + v_ax * cubie_hw,
                            p0 - u_ax * cubie_hw + v_ax * cubie_hw
                        ]
                        curr_norm = norm.copy()

                        if is_moving:
                            quad_body = [rodrigues(v, rot_unit, rot_theta) for v in quad_body]
                            curr_norm = rodrigues(curr_norm, rot_unit, rot_theta)

                        polygons.append({
                            "verts": quad_body, "norm": curr_norm,
                            "color": PLASTIC_BODY, "outline": "#23262e"
                        })

                        # Colored outer sticker
                        slot_key = (tuple(c_pos.astype(int)), tuple(norm.astype(int)))
                        if is_outer and slot_key in SLOT_LOOKUP:
                            slot_idx = SLOT_LOOKUP[slot_key]
                            stk_color = FACE_COLORS[self.state[slot_idx]]
                            p_st = c_pos + norm * (cubie_hw + 0.006)

                            if self.sticker_style == "Circles":
                                stk_verts = []
                                for k in range(16):
                                    ang = k * 2.0 * math.pi / 16.0
                                    pt = p_st + (u_ax * math.cos(ang) + v_ax * math.sin(ang)) * sticker_r
                                    stk_verts.append(pt)
                            else:
                                stk_verts = [
                                    p_st - u_ax * sticker_hw - v_ax * sticker_hw,
                                    p_st + u_ax * sticker_hw - v_ax * sticker_hw,
                                    p_st + u_ax * sticker_hw + v_ax * sticker_hw,
                                    p_st - u_ax * sticker_hw + v_ax * sticker_hw
                                ]

                            if is_moving:
                                stk_verts = [rodrigues(v, rot_unit, rot_theta) for v in stk_verts]

                            polygons.append({
                                "verts": stk_verts, "norm": curr_norm,
                                "color": stk_color,
                                "outline": "#000000" if stk_color != "#f5f5f7" else "#d0d0d5",
                                "slot_idx": slot_idx
                            })

        # Project and sort
        d_cam = 8.5
        to_draw = []
        for poly in polygons:
            v_cam = [R_view @ v for v in poly["verts"]]
            n_cam = R_view @ poly["norm"]

            if n_cam[2] <= 0.015:
                continue

            diffuse = max(0.0, float(np.dot(poly["norm"], light_dir)))
            shade = 0.72 + 0.28 * diffuse
            color = self.shade_hex(poly["color"], shade)

            avg_z = sum(v[2] for v in v_cam) / len(v_cam)
            pts_2d = []
            for v in v_cam:
                persp = d_cam / (d_cam - v[2] * 0.1)
                px = CX + v[0] * self.scale * persp
                py = CY - v[1] * self.scale * persp
                pts_2d.append((px, py))

            flat_pts = [coord for pt in pts_2d for coord in pt]
            to_draw.append((avg_z, flat_pts, color, poly["outline"], poly.get("slot_idx")))

        to_draw.sort(key=lambda item: item[0])
        self.sticker_item_map = {}
        for _z, flat_pts, color, outline, slot_idx in to_draw:
            item_id = self.canvas.create_polygon(
                flat_pts, fill=color, outline=outline, width=1.1, tags="cube_draw"
            )
            if slot_idx is not None:
                self.sticker_item_map[item_id] = slot_idx

        if self.show_circle_guide and self.rotating_face is not None:
            self.draw_3d_rotation_ring(R_view, rot_axis, rot_sign)

    def draw_3d_rotation_ring(self, R_view, axis, sign):
        u_ax = AXIS_VECTORS[(axis + 1) % 3]
        v_ax = AXIS_VECTORS[(axis + 2) % 3]
        n_ax = AXIS_VECTORS[axis] * (1.56 * sign)
        ring_radius = 1.50
        pts_2d = []
        d_cam = 8.5
        for deg in range(0, 365, 6):
            rad = math.radians(deg)
            p3 = n_ax + (u_ax * math.cos(rad) + v_ax * math.sin(rad)) * ring_radius
            v_cam = R_view @ p3
            persp = d_cam / (d_cam - v_cam[2] * 0.1)
            px = CX + v_cam[0] * self.scale * persp
            py = CY - v_cam[1] * self.scale * persp
            pts_2d.append((px, py))

        flat_pts = [coord for pt in pts_2d for coord in pt]
        self.canvas.create_line(
            flat_pts, fill="#e63946", width=2.5, tags="cube_draw", smooth=True
        )

    @staticmethod
    def shade_hex(hex_str, factor):
        hex_str = hex_str.lstrip('#')
        r = int(hex_str[0:2], 16)
        g = int(hex_str[2:4], 16)
        b = int(hex_str[4:6], 16)
        r = min(255, int(r * factor))
        g = min(255, int(g * factor))
        b = min(255, int(b * factor))
        return f"#{r:02x}{g:02x}{b:02x}"

    # --------------------------------------------------------------------------
    # Move Engine
    # --------------------------------------------------------------------------
    def start_move(self, move, on_complete=None):
        if self.busy:
            return
        self.animate_moves([move], on_complete)

    def animate_moves(self, moves, on_all_complete=None):
        if self.busy or not moves:
            return
        self.busy = True
        self._animate_next(moves, 0, on_all_complete)

    def _animate_next(self, moves, move_index, on_all_complete):
        if move_index >= len(moves):
            self.busy = False
            self.rotating_face = None
            self.rotating_angle = 0.0
            self.redraw()
            if on_all_complete:
                on_all_complete()
            return

        move = moves[move_index]
        face = move[0]
        suffix = move[1:] if len(move) > 1 else ""
        turns = {"": 1, "'": 3, "2": 2}[suffix]

        self.canvas.itemconfig(self.indicator_id, text=move)

        axis, sign = FACE_AXIS[face]
        angle_magnitude = (math.pi / 2.0) if turns != 2 else math.pi
        target_angle = -sign * (angle_magnitude if turns != 3 else -math.pi / 2.0)

        new_state = apply_move(self.state, move)
        self.rotating_face = face

        def frame(step):
            t = step / ANIM_STEPS
            t_smooth = t * t * (3.0 - 2.0 * t)
            self.rotating_angle = target_angle * t_smooth
            self.redraw()

            if step < ANIM_STEPS:
                self.animation_job = self.root.after(ANIM_MS, lambda: frame(step + 1))
            else:
                self.state = new_state
                self.rotating_face = None
                self.rotating_angle = 0.0
                self.redraw()
                self.status.config(text=f"Move: {move}  ({move_index + 1}/{len(moves)})")
                delay = 30 if len(moves) == 1 else self.anim_speed_ms
                self.root.after(delay, lambda: self._animate_next(moves, move_index + 1, on_all_complete))

        frame(0)

    def run_sequence(self):
        if self.busy:
            return
        try:
            moves = parse_sequence(self.sequence_entry.get())
        except ValueError as exc:
            messagebox.showerror("Invalid move sequence", str(exc))
            return
        if moves:
            self.animate_moves(moves)

    def scramble(self):
        if self.busy:
            return
        self.pause_solution()
        faces = ["U", "D", "L", "R", "F", "B"]
        suffixes = ["", "'", "2"]
        moves = []
        prev = None
        for _ in range(20):
            opts = [f for f in faces if f != prev]
            face = random.choice(opts)
            moves.append(face + random.choice(suffixes))
            prev = face
        self.sequence_entry.delete(0, tk.END)
        self.sequence_entry.insert(0, " ".join(moves))
        self.animate_moves(moves)

    def reset(self):
        if self.busy:
            return
        self.pause_solution()
        self.state = solved_state()
        self.solution_moves = []
        self.solution_step = 0
        self.canvas.itemconfig(self.indicator_id, text="•")
        self.update_solution_ui()
        self.redraw()
        self.status.config(text="Reset to solved state")

    # --------------------------------------------------------------------------
    # Kociemba Two-Phase Optimal Solver
    # --------------------------------------------------------------------------
    def solve_cube(self):
        if self.busy:
            return
        self.pause_solution()

        k_str = state_to_kociemba(self.state)
        solved_k = "UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB"
        if k_str == solved_k:
            messagebox.showinfo("Solved", "The cube is already solved!")
            return

        self.status.config(text="Searching optimal solution with Kociemba Two-Phase algorithm...")
        self.root.update_idletasks()

        try:
            # Run two-phase search
            sol_str = self.searcher.solution(k_str, 24, 1000, False).strip()
            self.solution_moves = sol_str.split() if sol_str else []
            self.solution_step = 0
            self.update_solution_ui()
            self.status.config(
                text=f"Optimal solution found: {len(self.solution_moves)} moves (Kociemba Two-Phase)"
            )
            # Auto play
            self.play_solution()
        except Exception as exc:
            messagebox.showerror("Solver Error", f"Unable to solve state: {exc}\nPlease ensure cube parity is valid.")
            self.status.config(text="Solver error: invalid state")

    def update_solution_ui(self):
        total = len(self.solution_moves)
        cur = self.solution_step
        if total > 0:
            self.sol_info_label.config(
                text=f"Solution: {total} moves ({' '.join(self.solution_moves)})"
            )
            self.step_label.config(text=f"Step: {cur} / {total}")
        else:
            self.sol_info_label.config(text="Solution: Ready")
            self.step_label.config(text="Step: 0 / 0")

    def toggle_play_solution(self):
        if self.is_playing:
            self.pause_solution()
        else:
            self.play_solution()

    def play_solution(self):
        if not self.solution_moves:
            return
        if self.solution_step >= len(self.solution_moves):
            self.solution_step = 0
        self.is_playing = True
        self.play_btn.config(text="⏸ Pause", bg="#2563eb")
        self._play_next_step()

    def _play_next_step(self):
        if not self.is_playing:
            return
        if self.solution_step >= len(self.solution_moves):
            self.pause_solution()
            self.status.config(text="🎉 Solution complete! Cube is solved.")
            return

        move = self.solution_moves[self.solution_step]
        self.start_move(move, on_complete=self._on_play_step_done)

    def _on_play_step_done(self):
        self.solution_step += 1
        self.update_solution_ui()
        if self.is_playing:
            self.play_job = self.root.after(self.anim_speed_ms, self._play_next_step)

    def pause_solution(self):
        self.is_playing = False
        if self.play_job:
            self.root.after_cancel(self.play_job)
            self.play_job = None
        self.play_btn.config(text="▶ Auto Play", bg="#e63946")

    def step_forward(self):
        if self.busy or not self.solution_moves:
            return
        self.pause_solution()
        if self.solution_step < len(self.solution_moves):
            move = self.solution_moves[self.solution_step]
            self.start_move(move, on_complete=self._on_manual_step_forward)

    def _on_manual_step_forward(self):
        self.solution_step += 1
        self.update_solution_ui()

    def step_backward(self):
        if self.busy or not self.solution_moves:
            return
        self.pause_solution()
        if self.solution_step > 0:
            self.solution_step -= 1
            move = self.solution_moves[self.solution_step]
            inv = invert_move(move)
            self.start_move(inv, on_complete=self.update_solution_ui)

    # --------------------------------------------------------------------------
    # 3D Paint Mode — click stickers directly on the cube
    # --------------------------------------------------------------------------
    def toggle_paint_mode(self):
        if self.busy:
            return
        if self.paint_mode:
            self.finish_paint_mode()
        else:
            self.enter_paint_mode()

    def enter_paint_mode(self):
        self.pause_solution()
        self.paint_mode = True
        self._paint_saved_state = list(self.state)  # backup for cancel
        self.paint_toggle_btn.config(
            text="🎨 PAINTING (click stickers)", bg="#1e3a5f", fg="#fbbf24"
        )
        # Show paint bar below toolbar
        self.paint_bar.pack(fill="x", padx=16, pady=(0, 2), before=self.canvas)
        self.update_paint_counters()
        self.redraw()
        self.status.config(text="🎨 Paint Mode: Pick a color → Click stickers on the 3D cube → Drag to rotate view")

    def exit_paint_mode(self):
        self.paint_mode = False
        self.paint_toggle_btn.config(
            text="🎨 Paint Cube Colors", bg="#1d222b", fg="#60a5fa"
        )
        self.paint_bar.pack_forget()
        self.redraw()

    def select_paint_color(self, key):
        self.paint_color = key
        for k, btn in self.paint_palette_btns.items():
            btn.config(bd=3 if k == key else 1)

    def update_paint_counters(self):
        cnt_names = {"U": "W", "R": "R", "F": "G", "D": "Y", "L": "O", "B": "B"}
        counts = {f: 0 for f in FACE_ORDER}
        for col_face in self.state:
            counts[col_face] += 1
        for f in FACE_ORDER:
            c = counts[f]
            self.paint_counter_labels[f].config(
                text=f"{cnt_names[f]}:{c}",
                fg="#10b981" if c == 9 else "#ef4444"
            )

    def finish_paint_mode(self):
        # Validate: each color must appear exactly 9 times
        counts = {f: 0 for f in FACE_ORDER}
        for col_face in self.state:
            counts[col_face] += 1
        for f, c in counts.items():
            if c != 9:
                messagebox.showerror(
                    "Invalid Sticker Counts",
                    f"Color '{f}' appears {c} times (needs exactly 9).\n"
                    f"Paint more stickers until all counters show 9."
                )
                return
        self.exit_paint_mode()
        self.solution_moves = []
        self.solution_step = 0
        self.update_solution_ui()
        self.status.config(text="✅ Custom cube state set! Click '⚡ Solve Cube' to find the optimal solution.")

    def cancel_paint_mode(self):
        self.state = self._paint_saved_state
        self.exit_paint_mode()
        self.status.config(text="Paint mode cancelled — cube restored to previous state.")

    def scramble_for_paint(self):
        """Scramble the cube state while staying in paint mode."""
        st = solved_state()
        faces = ["U", "D", "L", "R", "F", "B"]
        suffixes = ["", "'", "2"]
        prev = None
        for _ in range(20):
            opts = [f for f in faces if f != prev]
            face = random.choice(opts)
            st = apply_move(st, face + random.choice(suffixes))
            prev = face
        self.state = st
        self.update_paint_counters()
        self.redraw()

    def reset_for_paint(self):
        """Reset to solved state while staying in paint mode."""
        self.state = solved_state()
        self.update_paint_counters()
        self.redraw()

    def launch_web_app(self):
        # Start server if not running and open browser
        server_script = os.path.join(DIR, "server.py")
        subprocess.Popen([sys.executable, server_script])

# ------------------------------------------------------------------------------
# Color Painter Dialog
# ------------------------------------------------------------------------------
class PainterDialog(tk.Toplevel):
    def __init__(self, parent, app):
        super().__init__(parent)
        self.app = app
        self.title("Set Unsolved Cube State — Color Painter")
        self.configure(bg="#0c0e14")
        self.geometry("680x750")
        self.resizable(False, False)

        self.selected_color = "U"
        # Copy current state into painter dict: (face, r, c) -> facelet color
        self.painter_data = {}
        for face in FACE_ORDER:
            for r in range(3):
                for c in range(3):
                    slot_idx = SLOT_LOOKUP[slot_geometry(face, r, c)]
                    self.painter_data[(face, r, c)] = self.app.state[slot_idx]

        self.cells = {}
        self.build_dialog()

    def build_dialog(self):
        tk.Label(
            self, text="🎨  Set Your Unsolved Cube State",
            bg="#0c0e14", fg="#f0f2f5", font=("Georgia", 14, "bold")
        ).pack(pady=(12, 2))

        # Step-by-step instructions box
        instr_frame = tk.Frame(self, bg="#151820", padx=12, pady=8, relief="solid", bd=1)
        instr_frame.pack(padx=20, pady=(4, 8), fill="x")
        steps_text = (
            "How to set your real cube:\n"
            "  Step 1 → Pick a color from the palette below\n"
            "  Step 2 → Click sticker cells on the 2D net to paint them\n"
            "  Step 3 → Repeat until all 54 stickers match your cube (9 of each color)\n"
            "  Step 4 → Click  ✅ Apply to 3D Cube  then  ⚡ Solve Cube"
        )
        tk.Label(
            instr_frame, text=steps_text, bg="#151820", fg="#a0a8b8",
            font=("Consolas", 9), justify="left", anchor="w"
        ).pack(anchor="w")

        # Palette
        palette_frame = tk.Frame(self, bg="#0c0e14")
        palette_frame.pack(pady=(0, 12))

        self.palette_btns = {}
        colors_info = [
            ("U", "White (U)", "#f5f5f7"),
            ("R", "Red (R)", "#e63946"),
            ("F", "Green (F)", "#22c55e"),
            ("D", "Yellow (D)", "#f6d32d"),
            ("L", "Orange (L)", "#ff9a1f"),
            ("B", "Blue (B)", "#1d78f2"),
        ]
        for key, name, hex_col in colors_info:
            btn = tk.Button(
                palette_frame, text="  ", width=3, height=1, bg=hex_col,
                activebackground=hex_col, relief="solid", bd=2 if key == self.selected_color else 1,
                cursor="hand2", command=lambda k=key: self.select_color(k)
            )
            btn.pack(side="left", padx=5)
            self.palette_btns[key] = btn

        self.palette_label = tk.Label(
            self, text="Selected: White (U)", bg="#0c0e14", fg="#e2e8f0",
            font=("Helvetica", 9, "bold")
        )
        self.palette_label.pack(pady=(0, 10))

        # Net Grid Container
        # Row 0: . U . .
        # Row 1: L F R B
        # Row 2: . D . .
        net_box = tk.Frame(self, bg="#0c0e14")
        net_box.pack(pady=4)

        net_layout = [
            [None, "U", None, None],
            ["L", "F", "R", "B"],
            [None, "D", None, None]
        ]

        face_label_names = {
            "U": "U – White (Top)",
            "D": "D – Yellow (Bottom)",
            "F": "F – Green (Front)",
            "B": "B – Blue (Back)",
            "L": "L – Orange (Left)",
            "R": "R – Red (Right)",
        }

        for grid_r in range(3):
            for grid_c in range(4):
                face = net_layout[grid_r][grid_c]
                if not face:
                    tk.Label(net_box, text="", width=11, height=6, bg="#0c0e14").grid(row=grid_r, column=grid_c, padx=3, pady=3)
                    continue

                # Outer container for label + grid
                face_container = tk.Frame(net_box, bg="#0c0e14")
                face_container.grid(row=grid_r, column=grid_c, padx=4, pady=2)

                # Face label above the sticker grid
                tk.Label(
                    face_container, text=face_label_names[face],
                    bg="#0c0e14", fg=FACE_COLORS[face],
                    font=("Helvetica", 7, "bold")
                ).pack(pady=(0, 1))

                face_frame = tk.Frame(face_container, bg="#000000", padx=2, pady=2, relief="solid", bd=1)
                face_frame.pack()

                for r in range(3):
                    for c in range(3):
                        is_center = (r == 1 and c == 1)
                        cell_col = FACE_COLORS[self.painter_data[(face, r, c)]]
                        btn = tk.Button(
                            face_frame, bg=cell_col, activebackground=cell_col,
                            width=3, height=1, relief="flat", bd=0,
                            cursor="arrow" if is_center else "hand2"
                        )
                        btn.grid(row=r, column=c, padx=1, pady=1)
                        if not is_center:
                            btn.config(command=lambda f=face, row=r, col=c: self.paint_cell(f, row, col))
                        self.cells[(face, r, c)] = btn

        # Color Counters
        counter_names = {"U": "White", "R": "Red", "F": "Green", "D": "Yellow", "L": "Orange", "B": "Blue"}
        self.counter_frame = tk.Frame(self, bg="#0c0e14")
        self.counter_frame.pack(pady=6)
        self.counter_labels = {}
        for f in FACE_ORDER:
            lbl = tk.Label(self.counter_frame, text=f"{f} {counter_names[f]}: 9/9", bg="#0c0e14", fg="#10b981", font=("Consolas", 8, "bold"))
            lbl.pack(side="left", padx=6)
            self.counter_labels[f] = lbl

        self.update_counters()

        # Bottom Action Buttons
        btn_box = tk.Frame(self, bg="#0c0e14")
        btn_box.pack(fill="x", padx=20, pady=(12, 10))

        tk.Button(
            btn_box, text="Random Scramble", command=self.scramble_painter,
            bg="#212429", fg="#eaeaea", relief="flat", padx=10, pady=5, cursor="hand2"
        ).pack(side="left", padx=4)

        tk.Button(
            btn_box, text="Reset to Solved", command=self.reset_painter,
            bg="#212429", fg="#eaeaea", relief="flat", padx=10, pady=5, cursor="hand2"
        ).pack(side="left", padx=4)

        tk.Button(
            btn_box, text="✅ Apply to 3D Cube", command=self.apply_to_cube,
            bg="#10b981", fg="#ffffff", font=("Helvetica", 10, "bold"),
            relief="flat", padx=14, pady=5, cursor="hand2"
        ).pack(side="right", padx=4)

    def select_color(self, key):
        self.selected_color = key
        names = {"U": "White (U)", "R": "Red (R)", "F": "Green (F)", "D": "Yellow (D)", "L": "Orange (L)", "B": "Blue (B)"}
        self.palette_label.config(text=f"Selected: {names[key]}")
        for k, btn in self.palette_btns.items():
            btn.config(bd=3 if k == key else 1)

    def paint_cell(self, face, r, c):
        self.painter_data[(face, r, c)] = self.selected_color
        col_hex = FACE_COLORS[self.selected_color]
        self.cells[(face, r, c)].config(bg=col_hex, activebackground=col_hex)
        self.update_counters()

    def update_counters(self):
        counter_names = {"U": "White", "R": "Red", "F": "Green", "D": "Yellow", "L": "Orange", "B": "Blue"}
        counts = {f: 0 for f in FACE_ORDER}
        for col_face in self.painter_data.values():
            counts[col_face] += 1
        all_valid = True
        for f in FACE_ORDER:
            c = counts[f]
            ok = (c == 9)
            if not ok:
                all_valid = False
            self.counter_labels[f].config(
                text=f"{f} {counter_names[f]}: {c}/9",
                fg="#10b981" if ok else "#ef4444"
            )

    def scramble_painter(self):
        st = solved_state()
        faces = ["U", "D", "L", "R", "F", "B"]
        suffixes = ["", "'", "2"]
        prev = None
        for _ in range(20):
            opts = [f for f in faces if f != prev]
            face = random.choice(opts)
            st = apply_move(st, face + random.choice(suffixes))
            prev = face
        for face in FACE_ORDER:
            for r in range(3):
                for c in range(3):
                    slot_idx = SLOT_LOOKUP[slot_geometry(face, r, c)]
                    self.painter_data[(face, r, c)] = st[slot_idx]
                    hex_col = FACE_COLORS[st[slot_idx]]
                    self.cells[(face, r, c)].config(bg=hex_col, activebackground=hex_col)
        self.update_counters()

    def reset_painter(self):
        for face in FACE_ORDER:
            for r in range(3):
                for c in range(3):
                    self.painter_data[(face, r, c)] = face
                    hex_col = FACE_COLORS[face]
                    self.cells[(face, r, c)].config(bg=hex_col, activebackground=hex_col)
        self.update_counters()

    def apply_to_cube(self):
        # Validate count = 9 for each color
        counts = {f: 0 for f in FACE_ORDER}
        for col_face in self.painter_data.values():
            counts[col_face] += 1
        for f, c in counts.items():
            if c != 9:
                messagebox.showerror(
                    "Invalid Facelet Counts",
                    f"Face color '{f}' appears {c} times (must be exactly 9).\nPlease paint remaining stickers."
                )
                return

        # Commit to app state
        new_state = list(self.app.state)
        for face in FACE_ORDER:
            for r in range(3):
                for c in range(3):
                    slot_idx = SLOT_LOOKUP[slot_geometry(face, r, c)]
                    new_state[slot_idx] = self.painter_data[(face, r, c)]

        self.app.pause_solution()
        self.app.state = new_state
        self.app.solution_moves = []
        self.app.solution_step = 0
        self.app.update_solution_ui()
        self.app.redraw()
        self.app.status.config(text="Custom cube state applied! Click 'Solve Cube' to find optimal solution.")
        self.destroy()

def main():
    root = tk.Tk()
    CircleCubeApp(root)
    root.mainloop()

if __name__ == "__main__":
    main()
