/**
 * renderer.js
 * Canvas-based renderer for the blast hole grid and firing sequence animation.
 */

export class BlastRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx    = canvas.getContext("2d");
    this.holes  = [];
    this.rows   = 0;
    this.cols   = 0;
    this.fireStep     = -1;
    this.uniqueDelays = [];
    this.animTimer    = null;
    this.isAnimating  = false;
    this.onStep       = null; // callback(stepIndex, delayMs)
    this.onDone       = null; // callback()
  }

  load(holes, rows, cols) {
    this.holes        = holes;
    this.rows         = rows;
    this.cols         = cols;
    this.uniqueDelays = [...new Set(holes.map((h) => h.delay_ms))].sort((a, b) => a - b);
    this.fireStep     = -1;
  }

  // ── Layout ─────────────────────────────────────────────────────
  _layout() {
    const W = this.canvas.width;
    const H = this.canvas.height;
    const padL = 54, padT = 48, padR = 16, padB = 36;
    const cellW = (W - padL - padR) / Math.max(this.cols, 1);
    const cellH = (H - padT - padB) / Math.max(this.rows, 1);
    const r0    = Math.min(cellW, cellH) * 0.29;
    return { W, H, padL, padT, cellW, cellH, r0 };
  }

  // ── Main render ────────────────────────────────────────────────
  render() {
    if (!this.holes.length) return;
    const ctx = this.ctx;
    const { W, H, padL, padT, cellW, cellH, r0 } = this._layout();

    ctx.clearRect(0, 0, W, H);

    // Background
    ctx.fillStyle = "#0d1117";
    ctx.fillRect(0, 0, W, H);

    // Grid lines
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth   = 0.5;
    for (let r = 0; r <= this.rows; r++) {
      const y = padT + r * cellH;
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + this.cols * cellW, y); ctx.stroke();
    }
    for (let c = 0; c <= this.cols; c++) {
      const x = padL + c * cellW;
      ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, padT + this.rows * cellH); ctx.stroke();
    }

    // Axis labels
    ctx.fillStyle  = "rgba(255,255,255,0.35)";
    ctx.font       = "500 10px 'IBM Plex Mono', monospace";
    ctx.textAlign  = "center";
    for (let c = 0; c < this.cols; c++)
      ctx.fillText(`C${c + 1}`, padL + c * cellW + cellW / 2, padT - 24);
    ctx.textAlign = "right";
    for (let r = 0; r < this.rows; r++)
      ctx.fillText(`R${r + 1}`, padL - 8, padT + r * cellH + cellH / 2 + 4);

    // Current delay indicator
    const currentDelay = this.fireStep >= 0 ? this.uniqueDelays[this.fireStep] : null;
    if (currentDelay !== null) {
      ctx.fillStyle  = "#EF9F27";
      ctx.textAlign  = "left";
      ctx.font       = "700 11px 'IBM Plex Mono', monospace";
      ctx.fillText(`Firing delay: ${currentDelay} ms`, padL, 26);
    }

    // Draw holes
    this.holes.forEach((h) => {
      const cx = padL + h.col * cellW + cellW / 2;
      const cy = padT + h.row * cellH + cellH / 2;

      const fired     = currentDelay !== null && h.delay_ms <= currentDelay;
      const isCurrent = currentDelay !== null && h.delay_ms === currentDelay;

      // Glow
      if (isCurrent) {
        ctx.fillStyle = "rgba(239,159,39,0.18)";
        ctx.beginPath(); ctx.arc(cx, cy, r0 * 2.0, 0, Math.PI * 2); ctx.fill();
      } else if (fired) {
        ctx.fillStyle = "rgba(29,158,117,0.15)";
        ctx.beginPath(); ctx.arc(cx, cy, r0 * 1.5, 0, Math.PI * 2); ctx.fill();
      }

      // Main circle
      ctx.fillStyle = isCurrent ? "#EF9F27" : fired ? "#1D9E75" : "#E24B4A";
      ctx.beginPath(); ctx.arc(cx, cy, r0, 0, Math.PI * 2); ctx.fill();

      // Stemming cap
      const sw = r0 * 0.7, sh = r0 * 0.6;
      ctx.fillStyle = "#185FA5";
      ctx.fillRect(cx - sw / 2, cy - r0 - sh, sw, sh);

      // Delay number
      const fs = Math.max(7, Math.min(12, r0 * 0.7));
      ctx.fillStyle      = "#fff";
      ctx.font           = `700 ${fs}px 'IBM Plex Mono', monospace`;
      ctx.textAlign      = "center";
      ctx.textBaseline   = "middle";
      ctx.fillText(h.delay_ms, cx, cy);
      ctx.textBaseline   = "alphabetic";

      // Tick for fired
      if (fired && !isCurrent && r0 > 8) {
        ctx.fillStyle = "#1D9E75";
        ctx.font      = `${Math.max(9, r0 * 0.6)}px sans-serif`;
        ctx.fillText("✓", cx + r0 * 0.95, cy - r0 * 0.85);
      }
    });

    // Footer note
    ctx.fillStyle  = "rgba(255,255,255,0.2)";
    ctx.font       = "10px 'IBM Plex Mono', monospace";
    ctx.textAlign  = "left";
    ctx.fillText("Numbers = delay (ms) | Blue cap = stemming | Grid: Bench 1", padL, H - 8);
  }

  // ── Resize to fill container ─────────────────────────────────
  resize(w, h) {
    this.canvas.width  = Math.max(300, w);
    this.canvas.height = Math.max(240, h);
    this.render();
  }

  // ── Animation ─────────────────────────────────────────────────
  animate(intervalMs = 700) {
    this.stop();
    this.isAnimating = true;
    this.fireStep    = -1;

    const step = () => {
      if (!this.isAnimating) return;
      this.fireStep++;
      this.render();
      if (this.onStep) this.onStep(this.fireStep, this.uniqueDelays[this.fireStep]);
      if (this.fireStep < this.uniqueDelays.length - 1) {
        this.animTimer = setTimeout(step, intervalMs);
      } else {
        this.isAnimating = false;
        if (this.onDone) this.onDone();
      }
    };

    this.animTimer = setTimeout(step, 400);
  }

  stop() {
    this.isAnimating = false;
    clearTimeout(this.animTimer);
  }

  reset() {
    this.stop();
    this.fireStep = -1;
    this.render();
  }

  // ── Mini preview for compare panel ───────────────────────────
  renderMini(miniCanvas, holes, rows, cols) {
    const ctx = miniCanvas.getContext("2d");
    const W = miniCanvas.width, H = miniCanvas.height, pad = 14;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#0d1117";
    ctx.fillRect(0, 0, W, H);

    const cw  = (W - pad * 2) / Math.max(cols, 1);
    const ch  = (H - pad * 2) / Math.max(rows, 1);
    const rad = Math.min(cw, ch) * 0.28;
    const maxD = Math.max(...holes.map((h) => h.delay_ms), 1);

    holes.forEach((h) => {
      const cx = pad + h.col * cw + cw / 2;
      const cy = pad + h.row * ch + ch / 2;
      const t  = h.delay_ms / maxD;
      ctx.fillStyle = `hsl(${Math.round(120 - t * 110)}, 65%, 48%)`;
      ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2); ctx.fill();
      if (rad > 7) {
        ctx.fillStyle      = "#fff";
        ctx.font           = `700 ${Math.max(6, rad * 0.72)}px 'IBM Plex Mono', monospace`;
        ctx.textAlign      = "center";
        ctx.textBaseline   = "middle";
        ctx.fillText(h.delay_ms, cx, cy);
        ctx.textBaseline   = "alphabetic";
      }
    });
  }
}
