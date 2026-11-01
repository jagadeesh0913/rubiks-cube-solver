/**
 * Solution Player Controller
 * Handles solution presentation, speed control (slider + presets), and user-triggered solving.
 */

class SolutionPlayer {
  constructor(app) {
    this.app = app;
    this.moves = [];
    this.currentStep = 0;
    this.isPlaying = false;
    this.timer = null;
    this.speedMs = 180;

    this.playBtn = document.getElementById('btn-play-pause');
    this.stepLabel = document.getElementById('solution-step-label');
    this.infoLabel = document.getElementById('solution-info-label');
    this.badgesContainer = document.getElementById('moves-badges-list');
    this.speedSlider = document.getElementById('speed-slider');
    this.speedVal = document.getElementById('speed-val');
    this._lastScrolledStep = -1;

    this.initUI();
  }

  initUI() {
    // Speed Slider Listener
    if (this.speedSlider) {
      this.speedSlider.value = this.speedMs;
      this.speedSlider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value);
        this.setSpeed(val);
      });
    }

    // Enable smooth mouse wheel horizontal scroll on moves badges
    if (this.badgesContainer) {
      this.badgesContainer.addEventListener('wheel', (e) => {
        if (e.deltaY !== 0) {
          e.preventDefault();
          this.badgesContainer.scrollLeft += e.deltaY;
        }
      }, { passive: false });
    }

    this.updateSpeedDisplay();
    this.updateUI();
  }

  setSolution(moves, durationMs = 0) {
    this.pause();
    this.moves = moves || [];
    this.currentStep = 0;
    this._lastScrolledStep = -1;
    this.renderBadges();
    this.updateUI();

    if (this.moves.length > 0) {
      // Highlight "Start Solving" button with pulse animation
      this.playBtn.classList.add('btn-ready-solve');
      this.playBtn.innerHTML = '▶ Start';
      this.infoLabel.textContent = `Solution: ${this.moves.length} moves (${durationMs}ms). Ready!`;
    }
  }

  clear() {
    this.pause();
    this.moves = [];
    this.currentStep = 0;
    this._lastScrolledStep = -1;
    this.playBtn.classList.remove('btn-ready-solve');
    this.badgesContainer.innerHTML = '<span style="color: var(--text-muted); font-size: 0.78rem;">Click "⚡ Find Solution" to calculate optimal moves</span>';
    this.updateUI();
  }

  renderBadges() {
    this.badgesContainer.innerHTML = '';
    this.moves.forEach((move, idx) => {
      const badge = document.createElement('span');
      badge.className = 'move-badge' + (idx === this.currentStep ? ' active' : '');
      badge.textContent = move;
      badge.title = `Step ${idx + 1}: ${move}`;
      badge.onclick = () => this.jumpToStep(idx);
      this.badgesContainer.appendChild(badge);
    });
  }

  updateUI() {
    const total = this.moves.length;
    if (total === 0) {
      const isSolved = (this.app.isSolved && this.app.isSolved());
      this.infoLabel.textContent = isSolved ? 'Solution: Cube is solved' : 'Solution: Not calculated';
      this.stepLabel.textContent = '0 / 0';
      this.playBtn.disabled = false; // Kept clickable to guide the user!
      this.playBtn.innerHTML = '▶ Start';
      this.playBtn.classList.remove('btn-ready-solve');
      this.playBtn.title = isSolved
        ? 'Cube is solved. Scramble or paint first.'
        : 'Click to start playback (Click "⚡ Find Solution" first if jumbled)';
    } else {
      if (!this.isPlaying && this.currentStep === 0) {
        this.playBtn.innerHTML = '▶ Start';
        this.playBtn.title = 'Start playback';
      } else if (!this.isPlaying && this.currentStep >= total) {
        this.playBtn.innerHTML = '✅ Solved';
        this.playBtn.title = 'Cube is solved! Scramble or paint to solve again.';
      } else if (!this.isPlaying) {
        this.playBtn.innerHTML = '▶ Resume';
        this.playBtn.title = 'Resume playback';
      } else {
        this.playBtn.innerHTML = '⏸ Pause';
        this.playBtn.title = 'Pause playback';
      }
      this.stepLabel.textContent = `${this.currentStep} / ${total}`;
      this.playBtn.disabled = false;
    }

    // Update active badge
    const badges = this.badgesContainer.querySelectorAll('.move-badge');
    badges.forEach((b, idx) => {
      b.classList.toggle('active', idx === this.currentStep);
    });

    // Only scroll badges container when active step actually changes (never on pause/resume)
    if (this._lastScrolledStep !== this.currentStep && badges[this.currentStep]) {
      this._lastScrolledStep = this.currentStep;
      const target = badges[this.currentStep];
      if (this.badgesContainer && this.badgesContainer.offsetParent !== null) {
        const containerRect = this.badgesContainer.getBoundingClientRect();
        const targetRect = target.getBoundingClientRect();
        const offset = (targetRect.left + targetRect.width / 2) - (containerRect.left + containerRect.width / 2);
        this.badgesContainer.scrollBy({ left: offset, behavior: 'smooth' });
      }
    }
  }

  togglePlay() {
    if (this.app.isScrambling) {
      this.app.notify('⚠️ Cube is currently scrambling. Please wait.', 'warning');
      return;
    }

    // When no solution moves are loaded:
    if (this.moves.length === 0) {
      const isSolved = (this.app.isSolved && this.app.isSolved());
      if (isSolved) {
        this.app.notify('✅ The cube is already solved! Scramble (🔀) or paint (🎨) first.', 'info');
      } else {
        // CUBE IS JUMBLED / SCRAMBLED, user clicked Start before Solve!
        this.app.notify('⚠️ The cube is scrambled! Please click "⚡ Find Solution" (or Solve) first to calculate the solution moves.', 'warning');
        if (this.app.highlightSolveButton) {
          this.app.highlightSolveButton();
        }
        if (this.playBtn) {
          this.playBtn.classList.add('shake-attention');
          setTimeout(() => this.playBtn.classList.remove('shake-attention'), 400);
        }
      }
      return;
    }

    if (this.isPlaying) {
      this.pause();
    } else if (this.currentStep >= this.moves.length) {
      // Cube has reached the end of the solution
      const isSolved = (this.app.isSolved && this.app.isSolved());
      if (isSolved) {
        this.app.notify('✅ All solution moves have already been played! Scramble (🔀) to solve again.', 'info');
      } else {
        this.app.notify('✏️ Cube state has changed. Please click "⚡ Find Solution" to calculate new moves.', 'warning');
        this.clear();
        if (this.app.highlightSolveButton) {
          this.app.highlightSolveButton();
        }
      }
    } else {
      this.play();
    }
  }

  restart() {
    this.pause();
    // Restore cube back to old state before solving
    if (this.app.restoreOriginalState) {
      this.app.restoreOriginalState();
    }
    this.currentStep = 0;
    this._lastScrolledStep = -1;
    this.updateUI();
    this.app.notify('🔄 Restored to original scrambled state! Press ▶ Start to solve.', 'success');
  }

  play() {
    if (this.moves.length === 0) return;
    if (this.currentStep >= this.moves.length) {
      // If at end, restore to old state first
      if (this.app.restoreOriginalState) {
        this.app.restoreOriginalState();
      }
      this.currentStep = 0;
      this._lastScrolledStep = -1;
    }
    this.isPlaying = true;
    this.playBtn.classList.remove('btn-ready-solve');
    this.playBtn.innerHTML = '⏸ Pause';
    // Notify app that solving has started (for timing)
    if (this.app.onSolveStart) this.app.onSolveStart();
    this._playNext();
  }

  _playNext() {
    if (!this.isPlaying) return;
    if (this.currentStep >= this.moves.length) {
      this.pause();
      // Trigger celebration instead of plain toast
      if (this.app.onSolveComplete) {
        this.app.onSolveComplete(this.moves.length);
      } else {
        this.app.showToast('🎉 Cube solved successfully!', 'success');
      }
      return;
    }

    const move = this.moves[this.currentStep];
    this.app.executeMove(move, () => {
      this.currentStep++;
      this.updateUI();
      if (this.isPlaying) {
        this.timer = setTimeout(() => this._playNext(), Math.max(30, this.speedMs));
      }
    });
  }

  pause() {
    this.isPlaying = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.updateUI();
  }

  stepForward() {
    if (this.app.isScrambling) return;
    if (this.moves.length === 0) {
      this.app.notify('⚠️ No solution loaded. Click "⚡ Find Solution" first to calculate moves.', 'warning');
      if (this.app.highlightSolveButton) this.app.highlightSolveButton();
      return;
    }
    if (this.isPlaying || this.currentStep >= this.moves.length) return;
    const move = this.moves[this.currentStep];
    this.app.executeMove(move, () => {
      this.currentStep++;
      this.updateUI();
    });
  }

  stepBackward() {
    if (this.app.isScrambling) return;
    if (this.moves.length === 0) {
      this.app.notify('⚠️ No solution loaded. Click "⚡ Find Solution" first to calculate moves.', 'warning');
      if (this.app.highlightSolveButton) this.app.highlightSolveButton();
      return;
    }
    if (this.isPlaying || this.currentStep <= 0) return;
    this.currentStep--;
    const move = this.moves[this.currentStep];
    const inverse = this.invertMove(move);
    this.app.executeMove(inverse, () => {
      this.updateUI();
    });
  }

  invertMove(move) {
    if (move.endsWith("2")) return move;
    if (move.endsWith("'")) return move.slice(0, -1);
    return move + "'";
  }

  jumpToStep(targetIndex) {
    if (this.isPlaying) this.pause();
    if (this.app.isScrambling) return;
    if (this.moves.length === 0) return;
    const diff = targetIndex - this.currentStep;
    if (diff === 0) return;

    if (diff === 1) {
      this.stepForward();
      return;
    }
    if (diff === -1) {
      this.stepBackward();
      return;
    }

    let remaining = Math.abs(diff);
    const forward = diff > 0;
    const runNext = () => {
      if (remaining <= 0) return;
      if (forward) {
        if (this.currentStep >= this.moves.length) return;
        const move = this.moves[this.currentStep];
        this.app.executeMove(move, () => {
          this.currentStep++;
          this.updateUI();
          remaining--;
          runNext();
        });
      } else {
        if (this.currentStep <= 0) return;
        this.currentStep--;
        const move = this.moves[this.currentStep];
        const inverse = this.invertMove(move);
        this.app.executeMove(inverse, () => {
          this.updateUI();
          remaining--;
          runNext();
        });
      }
    };
    runNext();
  }

  setSpeed(ms) {
    this.speedMs = Math.max(40, Math.min(10000, ms));
    if (this.speedSlider) this.speedSlider.value = this.speedMs;
    this.updateSpeedDisplay();
    document.querySelectorAll('.speed-presets-group .btn-preset').forEach(btn => {
      btn.classList.toggle('active', parseInt(btn.getAttribute('data-speed'), 10) === this.speedMs);
    });
    if (this.app.cube3d) {
      this.app.cube3d.setAnimDuration(this.speedMs);
    }
  }

  updateSpeedDisplay() {
    if (this.speedVal) {
      if (this.speedMs >= 1000) {
        const sec = (this.speedMs / 1000).toFixed(1);
        this.speedVal.textContent = `${sec}s`;
      } else {
        this.speedVal.textContent = `${this.speedMs}ms`;
      }
    }
  }
}
