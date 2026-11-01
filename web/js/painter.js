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

    // 3D Paint Elements
    this.paint3dGrid = document.getElementById('paint3d-cards-grid');
    this.brushDot = document.getElementById('brush-dot');
    this.brushTitle = document.getElementById('brush-title');
    this.balanceMsg = document.getElementById('paint3d-balance-msg');
    this.hudDot = document.getElementById('hud-swatch-dot');
    this.hudText = document.getElementById('hud-brush-text');

    this.cellElements = {};
    this.paletteButtons = {};
    this.paint3dCards = {};
    this.paint3dBadges = {};

    this.initUI();
  }

  initUI() {
    // 1. Build Color Palette (in 2D Net Panel)
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

    // 1B. Build Dedicated 3D Interactive Color Cards Grid
    if (this.paint3dGrid) {
      this.paint3dGrid.innerHTML = '';
      PALETTE_COLORS.forEach((col, idx) => {
        const card = document.createElement('div');
        card.className = 'paint3d-color-card' + (col.key === this.selectedColor ? ' selected' : '');
        card.setAttribute('data-key', col.key);

        card.innerHTML = `
          <div class="color-card-swatch" style="background-color: ${col.hex}; color: ${col.text};">
            <span class="color-key-badge">${col.key}</span>
          </div>
          <div class="color-card-meta">
            <div class="color-card-name">${col.name}</div>
            <div class="color-card-count count-ok" id="count-badge-${col.key}">9/9 ✓</div>
          </div>
        `;

        card.onclick = () => this.selectColor(col.key);
        this.paint3dGrid.appendChild(card);
        this.paint3dCards[col.key] = card;
        this.paint3dBadges[col.key] = card.querySelector(`#count-badge-${col.key}`);
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
    const colObj = PALETTE_COLORS.find(p => p.key === colorKey) || PALETTE_COLORS[0];

    // 1. Toggle 2D palette buttons
    Object.keys(this.paletteButtons).forEach(k => {
      this.paletteButtons[k].classList.toggle('selected', k === colorKey);
    });

    // 2. Toggle 3D interactive color cards
    Object.keys(this.paint3dCards).forEach(k => {
      this.paint3dCards[k].classList.toggle('selected', k === colorKey);
    });

    // 3. Update 3D Top Bar Brush Indicator
    if (this.brushDot) this.brushDot.style.backgroundColor = colObj.hex;
    if (this.brushTitle) {
      this.brushTitle.innerHTML = `Brush: <strong>${colObj.name} (${colObj.key})</strong>`;
    }

    // 4. Update Floating Canvas Brush HUD
    if (this.hudDot) this.hudDot.style.backgroundColor = colObj.hex;
    if (this.hudText) {
      this.hudText.innerHTML = `Brush: <strong>${colObj.name} (${colObj.key})</strong> • Tap 3D sticker to paint`;
    }
  }

  updateUndoButtons() {
    const btnUndo = document.getElementById('btn-undo-paint');
    const btnRevert = document.getElementById('btn-revert-paint');
    const btnUndo3D = document.getElementById('btn-undo-3d');
    const btnRevert3D = document.getElementById('btn-revert-3d');

    const hasHistory = this.paintHistory && this.paintHistory.length > 0;
    const undoText = hasHistory ? `↩ Undo (${this.paintHistory.length})` : '↩ Undo';

    [btnUndo, btnUndo3D].forEach(btn => {
      if (btn) {
        btn.disabled = !hasHistory;
        btn.textContent = undoText;
      }
    });

    [btnRevert, btnRevert3D].forEach(btn => {
      if (btn) btn.disabled = !hasHistory;
    });
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
    if (!this.app.cube3d) return false;
    const counts = { 'U': 0, 'D': 0, 'L': 0, 'R': 0, 'F': 0, 'B': 0 };
    const state = this.app.cube3d.getState();
    state.forEach(c => counts[c] = (counts[c] || 0) + 1);

    let allValid = true;
    const diffs = [];

    // 1. Update 2D Panel Counters
    if (this.countersContainer) {
      this.countersContainer.innerHTML = '';
      PALETTE_COLORS.forEach(col => {
        const c = counts[col.key] || 0;
        const ok = (c === 9);
        if (!ok) allValid = false;

        const item = document.createElement('div');
        item.className = 'counter-item ' + (ok ? 'ok' : 'bad');
        item.textContent = `${col.key}:${c}/9`;
        this.countersContainer.appendChild(item);
      });
    }

    // 2. Update 3D Interactive Color Cards with Rich Count Badges
    PALETTE_COLORS.forEach(col => {
      const c = counts[col.key] || 0;
      const badge = this.paint3dBadges[col.key];
      const card = this.paint3dCards[col.key];

      if (badge) {
        if (c === 9) {
          badge.className = 'color-card-count count-ok';
          badge.innerHTML = `9/9 <span class="chk">✓</span>`;
        } else if (c < 9) {
          allValid = false;
          const need = 9 - c;
          badge.className = 'color-card-count count-under';
          badge.innerHTML = `${c}/9 <span class="diff">(+${need})</span>`;
          diffs.push(`+${need} ${col.name}`);
        } else {
          allValid = false;
          const over = c - 9;
          badge.className = 'color-card-count count-over';
          badge.innerHTML = `${c}/9 <span class="diff">(-${over})</span>`;
          diffs.push(`-${over} ${col.name}`);
        }
      }

      if (card) {
        card.classList.toggle('card-balanced', c === 9);
      }
    });

    // 3. Update 3D Balance Message
    if (this.balanceMsg) {
      if (allValid) {
        this.balanceMsg.innerHTML = '<span class="status-ok">🎉 All 6 colors balanced (9/9) • Ready to solve!</span>';
      } else {
        const summary = diffs.slice(0, 3).join(', ') + (diffs.length > 3 ? '…' : '');
        this.balanceMsg.innerHTML = `<span class="status-warn">⚠️ Needs: ${summary}</span>`;
      }
    }

    return allValid;
  }
}
