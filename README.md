# 3D Rubik's Cube Solver (Two-Phase Optimal Engine)

A hardware-accelerated 3D Rubik's Cube simulator and optimal solver featuring **circular rotation mechanics**, **direct 3D sticker painting**, and **Kociemba's Two-Phase Algorithm** (solves any state in ~20 moves in under 0.2 seconds).

---

## 📁 Clean Project Architecture

```
Cube_solver/
│
├── run.py                 # 🚀 Master launcher (starts server + opens browser)
├── requirements.txt       # Dependencies
├── README.md              # Documentation
│
├── core/                  # 🧠 Cube state, 3D math & move algebra
│   ├── __init__.py
│   ├── constants.py       # Color palettes, notations, face indices
│   └── cube.py            # RubiksCube class, permutations, validation
│
├── solver/                # ⚡ Kociemba Two-Phase Optimal Solver
│   ├── __init__.py
│   ├── kociemba.py        # High-level Python solver API
│   └── pykociemba/        # Pure Python engine & pruning pattern databases
│
├── server/                # 🌐 Backend server & REST endpoints
│   ├── __init__.py
│   └── app.py             # HTTP server & /api/solve endpoint
│
└── web/                   # 🎨 Three.js WebGL 3D Frontend
    ├── index.html         # User interface
    ├── css/
    │   └── style.css      # Dark glassmorphism styling
    └── js/
        ├── three.min.js   # Local Three.js (offline ready)
        ├── OrbitControls.js # 3D Camera navigation
        ├── cube3d.js      # 3D cubies, circular layer physics & raycasting
        ├── painter.js     # Direct 3D sticker color painting
        ├── player.js      # Step-by-step solution player & speed controls
        └── app.js         # Main application controller
```

---

## 🚀 Quick Start

Run one simple command from the project root:

```bash
python run.py
```

This starts the local solver server and automatically opens the 3D interactive cube in your default browser at `http://localhost:8000/index.html`.

---

## 🎨 How to Set Your Unsolved Cube (Direct 3D Painting)

1. Click **`🎨 Paint Cube (Click 3D Stickers)`** in the top bar.
2. Select any color from the floating palette:
   - **[ U ] White** | **[ D ] Yellow** | **[ F ] Green** | **[ B ] Blue** | **[ L ] Orange** | **[ R ] Red**
   - Or use keyboard shortcuts `1` through `6`.
3. **Click directly on any sticker of the 3D cube** to paint it.
4. **Drag anywhere** on the background to orbit the cube and view all 6 sides.
5. The live counters show `W:9/9`, `Y:9/9`, etc.
6. Click **`✅ Done`**, then click **`⚡ Solve Cube (Optimal)`**!

---

## ⚡ Algorithm Comparison

| Method | Moves | Computation Time | Solves Any State? |
| :--- | :--- | :--- | :--- |
| **Kociemba Two-Phase (Used here)** | **~20–22** | **< 0.2 seconds** | ✅ **Optimal / Near God's Number** |
| **CFOP (Fridrich)** | ~55–65 | Human-oriented | Layer-by-layer |
| **Roux** | ~45–50 | Human-oriented | Block-building |
