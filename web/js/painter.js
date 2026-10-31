/**
 * Unified Cube Painter Controller (Simultaneous 2D & 3D Synchronization)
 * Any modification in 2D immediately displays in 3D, and vice versa.
 */

const PALETTE_COLORS = [
  { key: 'U', name: 'White', hex: '#f5f5f7', text: '#000' },
  { key: 'D', name: 'Yellow', hex: '#f6d32d', text: '#000' },
  { key: 'F', name: 'Green', hex: '#22c55e', text: '#fff' },
  { key: 'B', name: 'Blue', hex: '#1d78f2', text: '#fff' },
  { key: 'L', name: 'Orange', hex: '#ff9a1f', text: '#fff' },
  { key: 'R', name: 'Red', hex: '#e63946', text: '#fff' }
];

class UnifiedPainter {
  constructor(app) {
    this.app = app;
    this.selectedColor = 'U';
    this.paintHistory = [];
    this.prePaintState = null;

    this.paletteContainer = document.getElementById('palette-container');
    this.countersContainer = document.getElementById('counters-container');
    this.gridContainer = document.getElementById('net-2d-container');

    this.cellElements = {};
    this.paletteButtons = {};

    this.initUI();
  }

  initUI() {
    // 1. Build Color Palette
    if (this.paletteContainer) {
      this.paletteContainer.innerHTML = '';
      PALETTE_COLORS.forEach((col, idx) => {
        const btn = document.createElement('button');
        btn.className = 'palette-btn' + (col.key === this.selectedColor ? ' selected' : '');
        btn.style.backgroundColor = col.hex;
        btn.style.color = col.text;
        btn.textContent = col.key;
        btn.title = `${col.name} (${col.key}) — Shortcut [${idx + 1}]`;
        btn.onclick = () => this.selectColor(col.key);
        this.paletteContainer.appendChild(btn);
        this.paletteButtons[col.key] = btn;
      });
    }

    // Number keys 1..6 for quick color selection
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT') return;
      const num = parseInt(e.key);
      if (num >= 1 && num <= 6) {
        this.selectColor(PALETTE_COLORS[num - 1].key);
      }
      // Ctrl+Z or Cmd+Z for undo paint
      if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z') && !e.shiftKey) {
        e.preventDefault();
        this.undo();
      }
    });

    // 2. Build 2D Flat Unfolded Net Grid
    // Layout:
    // Row 0: . U . .
    // Row 1: L F R B
    // Row 2: . D . .
    if (this.gridContainer) {
      this.gridContainer.innerHTML = '';
      const netGrid = document.createElement('div');
      netGrid.className = 'net-2d-grid';

      const layout = [
        [null, 'U', null, null],
        ['L', 'F', 'R', 'B'],
        [null, 'D', null, null]
      ];

      for (let gr = 0; gr < 3; gr++) {
        for (let gc = 0; gc < 4; gc++) {
          const face = layout[gr][gc];
          if (!face) {
            const empty = document.createElement('div');
            netGrid.appendChild(empty);
            continue;
          }

          const faceBox = document.createElement('div');
          faceBox.className = 'net-2d-face';

          const label = document.createElement('div');
          label.className = 'net-2d-label';
          label.style.color = COLOR_MAP[face] ? '#' + COLOR_MAP[face].toString(16).padStart(6, '0') : '#fff';
          label.textContent = face;
          faceBox.appendChild(label);

          for (let r = 0; r < 3; r++) {
            for (let c = 0; c < 3; c++) {
              const isCenter = (r === 1 && c === 1);
              const cell = document.createElement('div');
              cell.className = 'net-2d-cell' + (isCenter ? ' locked' : '');
              cell.title = isCenter ? `${face} Center (Locked)` : `${face} [Row ${r+1}, Col ${c+1}] — Click to paint`;

              if (!isCenter) {
                cell.onclick = () => this.handle2DCellClick(face, r, c);
              }

              faceBox.appendChild(cell);
              this.cellElements[`${face}_${r}_${c}`] = cell;
            }
          }

          netGrid.appendChild(faceBox);
        }
      }

      this.gridContainer.appendChild(netGrid);
    }

    // Initial sync
    setTimeout(() => {
      this.syncFrom3D();
      this.updateUndoButtons();
    }, 50);
  }

  selectColor(colorKey) {
    this.selectedColor = colorKey;
    Object.keys(this.paletteButtons).forEach(k => {
      this.paletteButtons[k].classList.toggle('selected', k === colorKey);
    });
  }

  updateUndoButtons() {
    const btnUndo = document.getElementById('btn-undo-paint');
    const btnRevert = document.getElementById('btn-revert-paint');
    const hasHistory = this.paintHistory && this.paintHistory.length > 0;
    if (btnUndo) {
      btnUndo.disabled = !hasHistory;
      btnUndo.textContent = hasHistory ? `↩ Undo (${this.paintHistory.length})` : '↩ Undo';
    }
    if (btnRevert) {
      btnRevert.disabled = !hasHistory;
    }
  }

  clearHistory() {
    this.paintHistory = [];
    this.prePaintState = null;
    this.updateUndoButtons();
  }

  undo() {
    if (!this.paintHistory || this.paintHistory.length === 0) {
      this.app.notify('ℹ️ No paint actions to undo.', 'info');
      return;
    }

    const last = this.paintHistory.pop();
    this.app.cube3d.setStickerColor(last.face, last.r, last.c, last.prevColor);
    this.syncFrom3D();
    this.updateCounters();
    this.updateUndoButtons();

    if (this.app.resetSolution) {
      this.app.resetSolution(false);
    }

    if (this.paintHistory.length === 0 && this.prePaintState) {
      this.app.originalState = this.prePaintState;
    }

    const colObj = PALETTE_COLORS.find(p => p.key === last.prevColor);
    const colName = colObj ? colObj.name : last.prevColor;
    this.app.notify(`↩ Undid paint on ${last.face} [Row ${last.r+1}, Col ${last.c+1}] (restored ${colName})`, 'info');
  }

  revertAll() {
    if (!this.prePaintState) {
      this.app.notify('ℹ️ No painted state to revert.', 'info');
      return;
    }

    this.app.cube3d.applyKociembaState(this.prePaintState);
    this.syncFrom3D();
    this.updateCounters();
    this.paintHistory = [];
    this.updateUndoButtons();
    this.app.originalState = this.prePaintState;
    this.prePaintState = null;

    if (this.app.resetSolution) {
      this.app.resetSolution(false);
    }
    this.app.notify('↺ Reverted all sticker colors back to pre-painting state.', 'success');
  }

  // ── Action: User Clicks on 2D Net Cell ──
  handle2DCellClick(face, r, c) {
    if (r === 1 && c === 1) return; // Locked center

    // Save pre-paint snapshot before first modification
    if (!this.prePaintState) {
      this.prePaintState = this.app.cube3d.getKociembaString();
    }

    const prevColor = this.app.cube3d.getStickerColor(face, r, c);
    if (prevColor === this.selectedColor) return; // Already this color

    // Record for undo
    this.paintHistory.push({
      face,
      r,
      c,
      prevColor,
      newColor: this.selectedColor
    });

    // 1. Immediately update 3D Cube sticker
    this.app.cube3d.setStickerColor(face, r, c, this.selectedColor);

    // 2. Immediately update 2D cell
    const cell = this.cellElements[`${face}_${r}_${c}`];
    if (cell) {
      const hex = COLOR_MAP[this.selectedColor];
      cell.style.backgroundColor = '#' + hex.toString(16).padStart(6, '0');
    }

    // 3. Update live counters & buttons
    this.updateCounters();
    this.updateUndoButtons();
    if (this.app.resetSolution) {
      this.app.resetSolution(true);
    }
  }

  // ── Action: User Clicks on 3D Cube Sticker ──
  handle3DStickerClick(stickerMesh) {
    if (!stickerMesh || !stickerMesh.userData) return;

    if (stickerMesh.userData.isCenter) {
      this.app.showToast('⚠️ Center sticker defines the face and cannot be altered.');
      return;
    }

    // Save pre-paint snapshot before first modification
    if (!this.prePaintState) {
      this.prePaintState = this.app.cube3d.getKociembaString();
    }

    const face = stickerMesh.userData.face;
    const r = stickerMesh.userData.row;
    const c = stickerMesh.userData.col;
    const prevColor = stickerMesh.userData.colorLetter || this.app.cube3d.getStickerColor(face, r, c);

    if (prevColor === this.selectedColor) return; // Already this color

    // Record for undo
    this.paintHistory.push({
      face,
      r,
      c,
      prevColor,
      newColor: this.selectedColor
    });

    // 1. Update 3D sticker
    const hex = COLOR_MAP[this.selectedColor];
    stickerMesh.userData.colorLetter = this.selectedColor;
    stickerMesh.userData.baseColor = hex;
    stickerMesh.material.color.setHex(hex);

    // 2. Immediately sync to 2D Net
    this.syncFrom3D();

    // 3. Update live counters & buttons
    this.updateCounters();
    this.updateUndoButtons();
    if (this.app.resetSolution) {
      this.app.resetSolution(true);
    }
  }

  // ── Live Sync: Update 2D Net from 3D Cube State ──
  syncFrom3D() {
    if (!this.app.cube3d) return;
    const st3d = this.app.cube3d.getState();
    let idx = 0;

    FACE_ORDER.forEach(f => {
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          const letter = st3d[idx] || f;
          const cell = this.cellElements[`${f}_${r}_${c}`];
          if (cell) {
            const hex = COLOR_MAP[letter] || 0xffffff;
            cell.style.backgroundColor = '#' + hex.toString(16).padStart(6, '0');
          }
          idx++;
        }
      }
    });

    this.updateCounters();
  }

  updateCounters() {
    if (!this.app.cube3d || !this.countersContainer) return;
    const counts = { 'U': 0, 'D': 0, 'L': 0, 'R': 0, 'F': 0, 'B': 0 };
    const state = this.app.cube3d.getState();
    state.forEach(c => counts[c] = (counts[c] || 0) + 1);

    this.countersContainer.innerHTML = '';
    let allValid = true;

    PALETTE_COLORS.forEach(col => {
      const c = counts[col.key] || 0;
      const ok = (c === 9);
      if (!ok) allValid = false;

      const item = document.createElement('div');
      item.className = 'counter-item ' + (ok ? 'ok' : 'bad');
      item.textContent = `${col.key}:${c}/9`;
      this.countersContainer.appendChild(item);
    });

    return allValid;
  }
}
