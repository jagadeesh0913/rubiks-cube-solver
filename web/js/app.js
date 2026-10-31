/**
 * Main Application Controller
 * Features: 3D + 2D bidirectional sync, Kociemba solver, celebration modal,
 *           panel notifications, original-state restore, mobile 2D panel, confetti.
 */

class App {
  constructor() {
    this.moveIndicator   = document.getElementById('active-move-display');
    this.toastTimer      = null;
    this.panelNotifTimer = null;
    this.originalState   = null;   // saved pre-scramble / pre-edit snapshot
    this.solveCount      = 0;      // how many times solved so far
    this._confettiAF     = null;   // requestAnimationFrame handle
    this._solveStartTime = null;   // when the current solve was started
    this.isScrambling    = false;  // lock during scramble animation
    this._solvePulseTimer = null;

    // Initialize 3D Engine
    const container = document.getElementById('canvas-container');
    this.cube3d = new Cube3D(container, (hitMesh) => {
      this.painter.handle3DStickerClick(hitMesh);
    });

    // Unified Painter (Bidirectional 2D & 3D Sync)
    this.painter = new UnifiedPainter(this);

    // Solution Player & Speed Controller
    this.player = new SolutionPlayer(this);

    // Capture original (solved) state
    this.originalState = this.cube3d.getKociembaString();

    this.initUI();
  }

  initUI() {
    // 18 Standard Move Buttons
    const moves = [
      'U', "U'", 'U2', 'D', "D'", 'D2',
      'L', "L'", 'L2', 'R', "R'", 'R2',
      'F', "F'", 'F2', 'B', "B'", 'B2'
    ];
    const movesGrid = document.getElementById('moves-grid');
    if (movesGrid) {
      movesGrid.innerHTML = '';
      moves.forEach(m => {
        const btn = document.createElement('button');
        btn.className = 'move-btn';
        btn.textContent = m;
        btn.onclick = () => this.handleManualMove(m);
        movesGrid.appendChild(btn);
      });
    }

    // Spacebar to play/pause
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT') return;
      if (e.code === 'Space') {
        e.preventDefault();
        this.player.togglePlay();
      }
    });

    // Close celebration on backdrop click
    const modal = document.getElementById('celebration-modal');
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) this.closeCelebration();
      });
    }
  }

  // ─── Cube State Helpers ──────────────────────────────────────────────────────
  isSolved() {
    const kStr = this.cube3d.getKociembaString();
    const solvedStr = 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB';
    return kStr === solvedStr;
  }

  highlightSolveButton() {
    const btn = document.getElementById('btn-solve');
    if (!btn) return;
    btn.classList.add('pulse-attention');
    clearTimeout(this._solvePulseTimer);
    this._solvePulseTimer = setTimeout(() => {
      btn.classList.remove('pulse-attention');
    }, 2800);
  }

  resetSolution(isFromPaint = true) {
    if (this.player.isPlaying) {
      this.player.pause();
    }
    this.player.clear();
    this.originalState = this.cube3d.getKociembaString();

    const isNowSolved = this.isSolved();
    if (isNowSolved) {
      this.notify('🎉 Cube is currently in solved state!', 'success');
      this.player.infoLabel.textContent = 'Solution: Cube is solved';
    } else {
      if (isFromPaint) {
        this.notify('✏️ Sticker painted. Click "⚡ Find Solution" when ready to solve.', 'info');
      }
      this.player.infoLabel.textContent = 'Cube modified. Click "⚡ Find Solution"';
    }
  }

  handleManualMove(move) {
    if (this.isScrambling) {
      this.notify('⚠️ Cube is currently scrambling. Please wait a moment.', 'warning');
      return;
    }
    if (this.player.isPlaying) {
      this.player.pause();
    }

    this.executeMove(move, () => {
      // Manual move was executed! Invalidate previous solution
      const isNowSolved = this.isSolved();
      this.player.clear();
      this.originalState = this.cube3d.getKociembaString();

      if (isNowSolved) {
        this.notify(`🎉 Manual move (${move}) completed the cube! It is now solved.`, 'success');
        this.player.infoLabel.textContent = 'Solution: Cube is solved';
      } else {
        this.notify(`✏️ Manual move (${move}) applied. Click "⚡ Find Solution" to calculate new moves.`, 'info');
        this.player.infoLabel.textContent = 'Cube modified. Click "⚡ Find Solution"';
      }
    });
  }

  executeMove(move, onDone) {
    // Move indicator overlay
    if (this.moveIndicator) {
      this.moveIndicator.textContent = move;
      this.moveIndicator.classList.add('show');
      clearTimeout(this._moveIndTimer);
      this._moveIndTimer = setTimeout(() => {
        this.moveIndicator.classList.remove('show');
      }, 400);
    }

    this.cube3d.performMove(move, () => {
      this.painter.syncFrom3D();
      if (onDone) onDone();
    });
  }

  // ─── Scramble ────────────────────────────────────────────────────────────────
  scramble() {
    if (this.isScrambling) {
      this.notify('⚠️ Cube is already scrambling. Please wait.', 'warning');
      return;
    }
    this.player.pause();
    this.isScrambling = true;

    const faces   = ['U', 'D', 'L', 'R', 'F', 'B'];
    const suffs   = ['', "'", '2'];
    const moves   = [];
    let prev      = null;
    for (let i = 0; i < 20; i++) {
      const opts = faces.filter(f => f !== prev);
      const face = opts[Math.floor(Math.random() * opts.length)];
      moves.push(face + suffs[Math.floor(Math.random() * suffs.length)]);
      prev = face;
    }

    this.player.clear();
    if (this.painter && this.painter.clearHistory) this.painter.clearHistory();
    this.notify('🔀 Scrambling with 20 moves…', 'info');

    let idx = 0;
    const nextMove = () => {
      if (idx >= moves.length) {
        this.isScrambling = false;
        this.painter.syncFrom3D();
        // Save state AFTER scramble as original (so restore goes back here)
        this.originalState = this.cube3d.getKociembaString();
        this.notify('🔀 Scrambled! Click "⚡ Find Solution" to calculate solution.', 'info');
        this.highlightSolveButton();
        return;
      }
      this.executeMove(moves[idx++], nextMove);
    };
    nextMove();
  }

  // ─── Reset ───────────────────────────────────────────────────────────────────
  reset() {
    if (this.isScrambling) {
      this.notify('⚠️ Cannot reset while scrambling.', 'warning');
      return;
    }
    this.player.pause();

    // If not solved, warn user before resetting to prevent accidental loss
    if (!this.isSolved()) {
      const confirmReset = window.confirm("Reset cube to solved state? This will discard your current scrambled or painted state.");
      if (!confirmReset) return;
    }

    this.cube3d.buildCube();
    this.painter.syncFrom3D();
    if (this.painter && this.painter.clearHistory) this.painter.clearHistory();
    this.player.clear();
    this.originalState = this.cube3d.getKociembaString();
    this.notify('↺ Cube reset to solved state.', 'success');
  }

  // ─── Solve ───────────────────────────────────────────────────────────────────
  async solveCube() {
    if (this.isScrambling) {
      this.notify('⚠️ Cube is currently scrambling. Please wait.', 'warning');
      return;
    }

    const kStr      = this.cube3d.getKociembaString();
    const solvedStr = 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB';

    if (kStr === solvedStr) {
      this.notify('✅ The cube is already solved! Scramble (🔀) or paint (🎨) first.', 'success');
      return;
    }

    // Validate 9 of each color upfront for user friendliness
    if (this.painter && this.painter.updateCounters) {
      const validCounts = this.painter.updateCounters();
      if (!validCounts) {
        this.notify('⚠️ Cannot solve: Each of the 6 colors must have exactly 9 stickers. Check counters on the right!', 'warning');
        return;
      }
    }

    this.notify('⚡ Searching optimal solution…', 'info');

    try {
      const resp = await fetch(`/api/solve?cube=${kStr}`);
      const data = await resp.json();

      if (data.status === 'success') {
        const moves = data.moves || [];
        this.originalState = kStr; // Save snapshot of pre-solve state
        this.player.setSolution(moves, data.duration_ms);
        this.notify(`✅ Solution ready: ${moves.length} moves (${data.duration_ms}ms). Press ▶ Start!`, 'success');
        // Record when user is ready to solve (for timing)
        this._solveStartTime = null;
      } else {
        this.notify(`❌ Solver error: ${data.message}`, 'error');
      }
    } catch (err) {
      this.notify(`❌ Network error contacting solver: ${err.message}`, 'error');
    }
  }

  // Called by SolutionPlayer when playback starts
  onSolveStart() {
    this._solveStartTime = Date.now();
  }

  // Called by SolutionPlayer when all moves complete
  onSolveComplete(moveCount) {
    this.solveCount++;
    const elapsed = this._solveStartTime
      ? ((Date.now() - this._solveStartTime) / 1000).toFixed(1)
      : '—';

    this.showCelebration(moveCount, elapsed);
  }

  // ─── Celebration Modal ───────────────────────────────────────────────────────
  showCelebration(moveCount, elapsedSec) {
    const modal = document.getElementById('celebration-modal');
    if (!modal) return;

    // Stats
    const statsEl = document.getElementById('celebration-stats');
    if (statsEl) {
      statsEl.innerHTML = `
        <div class="celeb-stat">
          <span class="celeb-stat-value">${moveCount}</span>
          <span class="celeb-stat-label">Moves</span>
        </div>
        <div class="celeb-stat">
          <span class="celeb-stat-value">${elapsedSec}s</span>
          <span class="celeb-stat-label">Time</span>
        </div>
        <div class="celeb-stat">
          <span class="celeb-stat-value">#${this.solveCount}</span>
          <span class="celeb-stat-label">Solve</span>
        </div>`;
    }

    // Sub message changes on subsequent solves
    const subEl = document.getElementById('celebration-sub');
    if (subEl) {
      const messages = [
        'Amazing! You solved the cube!',
        'Outstanding! Solved again!',
        'You\'re on fire! 🔥',
        'Speedcuber in the making! 🏆',
        'Unstoppable! 🚀'
      ];
      subEl.textContent = messages[Math.min(this.solveCount - 1, messages.length - 1)];
    }

    modal.style.display = 'flex';

    // Launch confetti
    this._startConfetti();
  }

  closeCelebration() {
    const modal = document.getElementById('celebration-modal');
    if (modal) modal.style.display = 'none';
    this._stopConfetti();
  }

  // Restore the state that was present before solving started
  restoreOriginalState() {
    if (!this.originalState) {
      this.notify('No saved state to restore.', 'error');
      return false;
    }
    // Rebuild to solved, then apply the saved Kociemba state to stickers
    this.cube3d.buildCube();
    this.cube3d.applyKociembaState(this.originalState);
    this.painter.syncFrom3D();
    return true;
  }

  celebrationRestart() {
    this.closeCelebration();
    if (!this.restoreOriginalState()) return;

    // Reset player step back to 0 without clearing solution moves
    this.player.currentStep = 0;
    this.player._lastScrolledStep = -1;
    this.player.updateUI();
    this.notify('🔄 Restored to original scrambled state! Press ▶ Start to solve.', 'success');
  }

  scrambleAndClose() {
    this.closeCelebration();
    this.scramble();
  }

  // ─── Confetti ────────────────────────────────────────────────────────────────
  _startConfetti() {
    const canvas = document.getElementById('confetti-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;

    const COLORS  = ['#e63946','#fbbf24','#10b981','#3b82f6','#a855f7','#f97316'];
    const pieces  = Array.from({ length: 120 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * -canvas.height,
      w: 6 + Math.random() * 9,
      h: 3 + Math.random() * 6,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      rot: Math.random() * Math.PI * 2,
      vx: (Math.random() - 0.5) * 3,
      vy: 1.5 + Math.random() * 3,
      vr: (Math.random() - 0.5) * 0.15,
    }));

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      pieces.forEach(p => {
        p.x  += p.vx;
        p.y  += p.vy;
        p.rot += p.vr;
        if (p.y > canvas.height + 20) {
          p.y = -20;
          p.x = Math.random() * canvas.width;
        }
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      });
      this._confettiAF = requestAnimationFrame(draw);
    };
    draw();
  }

  _stopConfetti() {
    if (this._confettiAF) {
      cancelAnimationFrame(this._confettiAF);
      this._confettiAF = null;
    }
    const canvas = document.getElementById('confetti-canvas');
    if (canvas) canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
  }

  // ─── Sticker style ───────────────────────────────────────────────────────────
  toggleStickerStyle() {
    const newStyle = (this.cube3d.stickerStyle === 'circles') ? 'tiles' : 'circles';
    this.cube3d.setStickerStyle(newStyle);
    const btn = document.getElementById('btn-sticker-style');
    if (btn) btn.textContent = (newStyle === 'circles') ? 'Style: Circles' : 'Style: Squares';
  }

  // ─── Mobile: toggle 2D panel slide-over ──────────────────────────────────────
  toggle2DPanel() {
    const panel = document.getElementById('side-2d-panel');
    if (!panel) return;
    const isOpen = panel.classList.toggle('mobile-open');

    // Add/remove dark backdrop so user can tap outside to close
    let backdrop = document.getElementById('mobile-backdrop');
    if (isOpen) {
      if (!backdrop) {
        backdrop = document.createElement('div');
        backdrop.id = 'mobile-backdrop';
        backdrop.style.cssText = [
          'position:fixed', 'inset:0', 'background:rgba(0,0,0,0.55)',
          'z-index:199', 'backdrop-filter:blur(2px)', 'animation:fadeIn 0.2s ease'
        ].join(';');
        backdrop.addEventListener('click', () => this.toggle2DPanel());
        document.body.appendChild(backdrop);
      }
    } else {
      if (backdrop) backdrop.remove();
    }
  }

  // ─── Single Unified Notification (Strictly one popup message!) ──────────────
  notify(msg, type = 'info') {
    const panel = document.getElementById('side-2d-panel');
    const isMobile = window.innerWidth <= 680;
    const isPanelOpen = panel && panel.classList.contains('mobile-open');

    // On mobile when 2D panel is closed, show floating toast
    if (isMobile && !isPanelOpen) {
      this._showToast(msg, type);
    } else {
      // Primary display on the 2D panel frame
      this._showPanelNotification(msg, type);
      // Ensure floating toast is hidden so exactly ONE notification appears
      const toast = document.getElementById('toast');
      if (toast) toast.style.display = 'none';
    }
  }

  showToast(msg, type = '') {
    this.notify(msg, type || 'info');
  }

  showPanelNotification(msg, type = 'info') {
    this.notify(msg, type);
  }

  _showToast(msg, type = '') {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = msg;
    toast.className = type;
    toast.style.display = 'block';
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => { toast.style.display = 'none'; }, 4500);
  }

  _showPanelNotification(msg, type = 'info') {
    const el = document.getElementById('panel-notification');
    if (!el) return;
    el.textContent = msg;
    el.className   = `panel-notification ${type}`;
    el.style.display = 'flex';
    clearTimeout(this.panelNotifTimer);
    this.panelNotifTimer = setTimeout(() => {
      el.style.display = 'none';
    }, 4500);
  }
}

// Global bootstrap
let app;
function initApp() {
  if (!app) app = new App();
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
