/**
 * main.js
 * BlastSeq frontend — main app controller.
 * Connects form inputs → API → canvas renderer + charts + results table.
 */

import { api }          from "/static/src/utils/api.js";
import { BlastRenderer }from "/static/src/utils/renderer.js";
import { renderPPVChart, renderMCPDChart } from "/static/src/utils/charts.js";
import { exportCSV, exportReport }         from "/static/src/utils/export.js";

// ── State ─────────────────────────────────────────────────────────
let result       = null;   // last API response
let renderer     = null;
let selectedDelay= 25;     // inter-hole delay ms
let isAnimating  = false;

// ── DOM shortcuts ─────────────────────────────────────────────────
const $  = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const gv = (id) => parseFloat(document.getElementById(id)?.value) || 0;
const gs = (id) => document.getElementById(id)?.value || "";

// ── Boot ──────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
  await checkBackend();
  initDelayButtons();
  initCanvas();
  initTabs();
  bindEvents();
  // Auto-run with defaults
  await runOptimise();
});

// ── Backend health check ──────────────────────────────────────────
async function checkBackend() {
  try {
    await api.health();
    setStatus("Connected to backend", "good");
  } catch {
    setStatus("Backend offline — start Flask server (python backend/api/api.py)", "bad");
  }
}

// ── Delay buttons ─────────────────────────────────────────────────
function initDelayButtons() {
  const container = document.getElementById("holeDelayGroup");
  [17, 25, 42].forEach((ms) => {
    const btn = document.createElement("button");
    btn.className = `delay-btn${ms === selectedDelay ? " active" : ""}`;
    btn.textContent = `${ms} ms`;
    btn.dataset.delay = ms;
    btn.addEventListener("click", async () => {
      selectedDelay = ms;
      $$(".delay-btn").forEach((b) =>
        b.classList.toggle("active", Number(b.dataset.delay) === ms)
      );
      updateRowDelayBadge(ms);
      if (result) await runOptimise();
    });
    container.appendChild(btn);
  });
}

function updateRowDelayBadge(holeDelayMs) {
  const map = { 17: 25, 25: 42, 42: 84 };
  const el  = document.getElementById("rowDelayBadge");
  if (el) el.textContent = `Row delay → ${map[holeDelayMs] || holeDelayMs * 2} ms`;
}

// ── Canvas ────────────────────────────────────────────────────────
function initCanvas() {
  const canvas = document.getElementById("blastCanvas");
  renderer = new BlastRenderer(canvas);
  renderer.onStep = (step, delay) => {
    const el = document.getElementById("stepIndicator");
    if (el) el.textContent = delay !== undefined ? `Firing: ${delay} ms` : "";
  };
  renderer.onDone = () => {
    isAnimating = false;
    const btn = document.getElementById("animBtn");
    if (btn) { btn.textContent = "▶ Animate"; btn.classList.remove("active"); }
  };
  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);
}

function resizeCanvas() {
  const wrap = $(".canvas-wrap");
  if (!wrap) return;
  const w = wrap.clientWidth  - 32;
  const h = wrap.clientHeight - 32;
  renderer?.resize(Math.max(400, w), Math.max(300, h));
}

// ── Tabs ──────────────────────────────────────────────────────────
function initTabs() {
  $$(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab;
      $$(".tab-btn").forEach((b) => b.classList.toggle("active", b === btn));
      $$(".tab-panel").forEach((p) =>
        p.classList.toggle("active", p.id === `panel-${tab}`)
      );
      if (tab === "compare" && result) renderCompare();
      if (tab === "ppv"     && result) renderPPVTab();
    });
  });
}

// ── Events ────────────────────────────────────────────────────────
function bindEvents() {
  document.getElementById("calcBtn")       ?.addEventListener("click", runOptimise);
  document.getElementById("animBtn")       ?.addEventListener("click", toggleAnim);
  document.getElementById("resetBtn")      ?.addEventListener("click", resetAnim);
  document.getElementById("exportCSVBtn")  ?.addEventListener("click", handleCSV);
  document.getElementById("exportReportBtn")?.addEventListener("click", handleReport);
  document.getElementById("seqPref")       ?.addEventListener("change", runOptimise);
}

// ── Main API call ─────────────────────────────────────────────────
async function runOptimise() {
  setBusy(true);
  try {
    const payload = {
      production_tonnes:  gv("production"),
      diameter_mm:        gv("diameter"),
      rock_density:       gv("density"),
      bench_depth:        gv("depth"),
      num_benches:        gv("benches"),
      hole_delay_ms:      selectedDelay,
      ppv_distance_m:     gv("ppvDist"),
      K:                  gv("kConst"),
      alpha:              gv("alpha"),
      explosive_type:     gs("explosiveType"),
      preferred_pattern:  gs("seqPref"),
    };

    result = await api.optimise(payload);

    updateMetrics();
    updateCanvasChips();
    loadCanvas();
    renderResultsTab();
    updateRowDelayBadge(selectedDelay);

    toast(`Optimised: ${result.best_label} | MCPD: ${result.chosen.mcpd} kg | PPV: ${result.chosen.ppv.ppv_mm_s} mm/s`, "good");

  } catch (err) {
    toast(`Error: ${err.message}`, "bad");
    console.error(err);
  } finally {
    setBusy(false);
  }
}

// ── Metrics bar ───────────────────────────────────────────────────
function updateMetrics() {
  const { geometry: g, distribution: d, chosen: c } = result;

  setMetric("m-burden",  g.burden,           "m");
  setMetric("m-spacing", g.spacing,           "m");
  setMetric("m-stemming",g.stemming,          "m");
  setMetric("m-holes",   d.total_holes,       "");
  setMetric("m-mcpd",    c.mcpd,              "kg",    "highlight");

  const ppvClass = c.ppv.ppv_mm_s < 10 ? "good" : c.ppv.ppv_mm_s < 50 ? "" : "danger";
  setMetric("m-ppv", c.ppv.ppv_mm_s, "mm/s", ppvClass);
}

function setMetric(id, val, unit, cls = "") {
  const el = document.getElementById(id);
  if (!el) return;
  const card = el.closest(".metric");
  card.className = `metric ${cls}`;
  el.textContent = val;
  const u = card.querySelector(".m-unit");
  if (u) u.textContent = unit;
}

// ── Canvas ────────────────────────────────────────────────────────
function updateCanvasChips() {
  const { best_pattern, chosen: c } = result;
  const chip = document.getElementById("patternChip");
  if (chip) {
    chip.textContent = result.best_label;
    chip.className   = `tag-chip pattern-${best_pattern}`;
  }
  const dChip = document.getElementById("delayChip");
  if (dChip) dChip.textContent = `${c.hole_delay_ms} ms col / ${c.row_delay_ms} ms row`;
}

function loadCanvas() {
  const { chosen: c, distribution: d } = result;
  renderer.load(c.holes, d.rows, d.cols);
  resetAnim();
}

// ── Animation ─────────────────────────────────────────────────────
function toggleAnim() {
  if (!result) return;
  isAnimating = !isAnimating;
  const btn = document.getElementById("animBtn");
  if (isAnimating) {
    btn.textContent = "⏸ Pause"; btn.classList.add("active");
    renderer.animate(700);
  } else {
    renderer.stop();
    btn.textContent = "▶ Animate"; btn.classList.remove("active");
  }
}

function resetAnim() {
  isAnimating = false;
  const btn = document.getElementById("animBtn");
  if (btn) { btn.textContent = "▶ Animate"; btn.classList.remove("active"); }
  const ind = document.getElementById("stepIndicator");
  if (ind) ind.textContent = "";
  renderer?.reset();
}

// ── Results tab ───────────────────────────────────────────────────
function renderResultsTab() {
  if (!result) return;
  const { geometry: g, distribution: d, chosen: c } = result;

  const grid = document.getElementById("resultGrid");
  if (grid) {
    grid.innerHTML = [
      { l: "Burden (B)",       v: g.burden,          u: "m" },
      { l: "Spacing (S)",      v: g.spacing,         u: "m" },
      { l: "Stemming (T)",     v: g.stemming,        u: "m" },
      { l: "Subgrade (J)",     v: g.subgrade,        u: "m" },
      { l: "Charge length",    v: g.charge_length,   u: "m" },
      { l: "Charge / hole",    v: g.charge_per_hole, u: "kg" },
      { l: "Vol / hole",       v: g.vol_per_hole,    u: "m³" },
      { l: "Tonnes / hole",    v: g.tonnes_per_hole, u: "t" },
      { l: "Powder factor",    v: g.powder_factor,   u: "kg/t" },
      { l: "Grid",             v: `${d.rows}×${d.cols}`, u: "r×c" },
      { l: "Total holes",      v: d.total_holes,     u: "" },
      { l: "Actual output",    v: Number(d.actual_production).toLocaleString(), u: "t" },
      { l: "MCPD",             v: c.mcpd,            u: "kg", cls: "warn" },
      { l: "PPV",              v: c.ppv.ppv_mm_s,    u: "mm/s",
        cls: c.ppv.ppv_mm_s < 10 ? "good" : c.ppv.ppv_mm_s < 50 ? "warn" : "bad" },
      { l: "Risk level",       v: c.ppv.classification.level, u: "",
        cls: c.ppv.ppv_mm_s < 10 ? "good" : c.ppv.ppv_mm_s < 50 ? "warn" : "bad" },
      { l: "Scaled distance",  v: c.ppv.scaled_distance, u: "m/√kg" },
    ].map((i) => `
      <div class="result-card">
        <div class="r-lbl">${i.l}</div>
        <div class="r-val ${i.cls || ""}">${i.v}</div>
        <div class="r-unit">${i.u}</div>
      </div>`).join("");
  }

  // Schedule table
  const tbody = document.getElementById("schedTbody");
  if (tbody) {
    const rows = c.schedule.slice(0, 100);
    tbody.innerHTML = rows.map((r) => `
      <tr>
        <td>${r.id}</td><td>R${r.row}</td><td>C${r.col}</td><td>B${r.bench}</td>
        <td><span class="delay-badge">${r.delay_ms}</span></td>
        <td>${r.simultaneous}</td>
        <td>${r.delay_charge_kg}</td>
      </tr>`).join("");
    if (c.schedule.length > 100)
      tbody.innerHTML += `<tr><td colspan="7" class="more-row">… ${c.schedule.length - 100} more holes — export CSV</td></tr>`;
  }
}

// ── Compare tab ────────────────────────────────────────────────────
function renderCompare() {
  if (!result) return;
  const { comparison, distribution: d } = result;

  const grid = document.getElementById("compareGrid");
  if (!grid) return;

  grid.innerHTML = comparison.map((p) => `
    <div class="compare-card ${p.is_best ? "best" : ""}">
      <div class="compare-card-header">
        <span class="pattern-badge ${p.pattern}">${p.label}</span>
        ${p.is_best ? '<span class="best-badge">✓ BEST</span>' : ""}
      </div>
      <div class="compare-stat"><div class="cs-lbl">MCPD</div>
        <div class="cs-val">${p.mcpd} <span class="cs-unit">kg</span></div></div>
      <div class="compare-stat"><div class="cs-lbl">PPV at distance</div>
        <div class="cs-val ${p.ppv_mm_s < 10 ? "good" : p.ppv_mm_s < 50 ? "warn" : "bad"}">${p.ppv_mm_s} <span class="cs-unit">mm/s</span></div></div>
      <div class="compare-stat"><div class="cs-lbl">Risk</div>
        <div style="font-size:13px;font-weight:500;color:${p.risk_color}">${p.risk_level}</div></div>
      <div class="compare-stat"><div class="cs-lbl">Delay steps / Duration</div>
        <div class="cs-val" style="font-size:14px">${p.num_delay_steps} steps / ${p.blast_duration} ms</div></div>
      <div class="compare-stat"><div class="cs-lbl">Col delay / Row delay</div>
        <div class="cs-val" style="font-size:14px">${p.hole_delay_ms} ms / ${p.row_delay_ms} ms</div></div>
      <div class="mini-canvas-wrap">
        <canvas id="mini-${p.pattern}" width="220" height="150"></canvas>
      </div>
    </div>`).join("");

  // Mini canvases after DOM settles
  setTimeout(() => {
    comparison.forEach((p) => {
      const mc = document.getElementById(`mini-${p.pattern}`);
      if (mc) renderer.renderMini(mc, p.holes || result.chosen.holes, d.rows, d.cols);
    });
  }, 60);

  // MCPD bar chart
  renderMCPDChart("mcpdChart", comparison);
}

// ── PPV tab ────────────────────────────────────────────────────────
function renderPPVTab() {
  if (!result) return;
  const { ppv_distance_curve, chosen: c, ppv_limits } = result;
  renderPPVChart("ppvChart", ppv_distance_curve, ppv_limits, gv("ppvDist"));

  // Risk table
  const tbody = document.getElementById("ppvLimitsTbody");
  if (tbody) {
    tbody.innerHTML = ppv_limits.map((l) => {
      const safe = result.chosen.ppv.safe_mcpd_commercial || "—";
      const ok = c.ppv.ppv_mm_s <= l.limit_mm_s;
      return `<tr>
        <td>${l.label}</td>
        <td>${l.limit_mm_s}</td>
        <td style="color:${ok ? "#1D9E75" : "#E24B4A"};font-weight:700">${ok ? "✓ Safe" : "✗ Exceeds"}</td>
      </tr>`;
    }).join("");
  }
}

// ── Exports ────────────────────────────────────────────────────────
function handleCSV() {
  if (!result) return;
  exportCSV(result.chosen.schedule, result.geometry, result.distribution, result.chosen);
}
function handleReport() {
  if (!result) return;
  exportReport(result);
}

// ── UI helpers ─────────────────────────────────────────────────────
function setBusy(busy) {
  const btn = document.getElementById("calcBtn");
  if (btn) { btn.disabled = busy; btn.textContent = busy ? "⏳ Computing…" : "▶ Calculate & Optimise"; }
}

function setStatus(msg, type) {
  const el = document.getElementById("statusBar");
  if (!el) return;
  el.textContent = msg;
  el.className   = `status-bar ${type}`;
}

function toast(msg, type = "good") {
  let t = document.getElementById("toast");
  if (!t) {
    t = document.createElement("div"); t.id = "toast";
    t.style.cssText = "position:fixed;bottom:24px;right:24px;z-index:999;font-family:'IBM Plex Mono',monospace;font-size:11px;padding:8px 14px;border-radius:4px;border:0.5px solid;transition:opacity 0.3s;pointer-events:none;max-width:420px";
    document.body.appendChild(t);
  }
  const cfg = {
    good: { bg:"rgba(29,158,117,.15)",  bd:"rgba(29,158,117,.4)",  c:"#1D9E75" },
    warn: { bg:"rgba(239,159,39,.15)",  bd:"rgba(239,159,39,.4)",  c:"#EF9F27" },
    bad:  { bg:"rgba(226,75,74,.15)",   bd:"rgba(226,75,74,.4)",   c:"#E24B4A" },
  }[type] || {};
  Object.assign(t.style, { background:cfg.bg, borderColor:cfg.bd, color:cfg.c, opacity:1 });
  t.textContent = msg;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => (t.style.opacity = 0), 4000);
}
