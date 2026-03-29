/**
 * export.js
 * CSV and printable HTML report export from blast results.
 */

export function exportCSV(schedule, geo, dist, chosen) {
  const header = ["Hole","Row","Col","Bench","Delay (ms)","Simultaneous","Delay Charge (kg)"];
  const rows   = schedule.map((r) =>
    [r.id, r.row, r.col, r.bench, r.delay_ms, r.simultaneous, r.delay_charge_kg].join(",")
  );
  const csv = [header.join(","), ...rows].join("\n");
  _download(csv, "text/csv", `blast_schedule_${chosen.pattern}_${Date.now()}.csv`);
}

export function exportReport(result) {
  const { geometry: g, distribution: d, chosen: c, comparison, ppv_distance_curve } = result;
  const pLabel = { row: "Row-to-Row", diagonal: "Diagonal (Echelon)", v_shape: "V-Shape (Chevron)" };
  const ts = new Date().toLocaleString();

  const limitsRows = c.ppv.limits.map((l) =>
    `<tr><td>${l.label}</td><td>${l.limit_mm_s}</td></tr>`
  ).join("");

  const compRows = comparison.map((p) =>
    `<tr${p.is_best ? ' style="background:#0a2a1a"' : ""}>
      <td>${p.label}</td>
      <td>${p.mcpd}</td>
      <td style="color:${p.risk_color}">${p.ppv_mm_s}</td>
      <td>${p.num_delay_steps}</td>
      <td>${p.blast_duration}</td>
      <td>${p.hole_delay_ms} / ${p.row_delay_ms}</td>
      <td>${p.is_best ? "✓ SELECTED" : "—"}</td>
    </tr>`
  ).join("");

  const schedRows = c.schedule.slice(0, 80).map((r) =>
    `<tr><td>${r.id}</td><td>R${r.row}</td><td>C${r.col}</td><td>${r.delay_ms}</td><td>${r.simultaneous}</td><td>${r.delay_charge_kg}</td></tr>`
  ).join("");

  const html = `<!DOCTYPE html><html>
<head><meta charset="UTF-8"><title>Blast Report — ${ts}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Courier New',monospace;font-size:10.5pt;color:#1a1a1a;background:#fff;padding:2cm}
h1{font-size:17pt;border-bottom:2px solid #1a1a1a;padding-bottom:8px;margin-bottom:6px}
h2{font-size:12pt;margin:20px 0 8px;border-left:4px solid #E24B4A;padding-left:10px;color:#333}
.meta{font-size:9pt;color:#666;margin-bottom:18px}
table{width:100%;border-collapse:collapse;margin-bottom:14px;font-size:9.5pt}
th{background:#0d1117;color:#fff;padding:5px 8px;text-align:left;font-size:9pt}
td{padding:4px 8px;border-bottom:0.5px solid #ddd}
tr:nth-child(even) td{background:#f9f9f9}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:14px}
.card{border:1px solid #ddd;padding:8px 12px;border-radius:3px}
.card .lbl{font-size:8.5pt;color:#888}.card .val{font-size:14pt;font-weight:bold}
.footer{margin-top:28px;font-size:8.5pt;color:#bbb;border-top:1px solid #eee;padding-top:8px}
@media print{body{padding:1cm}}
</style></head><body>
<h1>BlastSeq — Blast Design Report</h1>
<div class="meta">Generated: ${ts} &nbsp;|&nbsp; Pattern: ${pLabel[c.pattern] || c.pattern} &nbsp;|&nbsp; Optimised for minimum MCPD</div>

<h2>1. Input Parameters</h2>
<table><tr><th>Parameter</th><th>Value</th><th>Unit</th></tr>
<tr><td>Hole diameter</td><td>${g.diameter_mm}</td><td>mm</td></tr>
<tr><td>Rock density</td><td>${g.rock_density}</td><td>t/m³</td></tr>
<tr><td>Bench depth</td><td>${g.bench_depth}</td><td>m</td></tr>
<tr><td>Explosive type</td><td>${g.explosive_type}</td><td>—</td></tr>
<tr><td>Inter-hole delay</td><td>${c.hole_delay_ms}</td><td>ms</td></tr>
<tr><td>Row delay</td><td>${c.row_delay_ms}</td><td>ms</td></tr>
</table>

<h2>2. Blast Geometry</h2>
<div class="grid">
<div class="card"><div class="lbl">Burden</div><div class="val">${g.burden} m</div></div>
<div class="card"><div class="lbl">Spacing</div><div class="val">${g.spacing} m</div></div>
<div class="card"><div class="lbl">Stemming</div><div class="val">${g.stemming} m</div></div>
<div class="card"><div class="lbl">Subgrade</div><div class="val">${g.subgrade} m</div></div>
<div class="card"><div class="lbl">Charge/hole</div><div class="val">${g.charge_per_hole} kg</div></div>
<div class="card"><div class="lbl">Powder factor</div><div class="val">${g.powder_factor} kg/t</div></div>
</div>

<h2>3. Hole Distribution</h2>
<table><tr><th>Parameter</th><th>Value</th></tr>
<tr><td>Total holes</td><td>${d.total_holes}</td></tr>
<tr><td>Grid</td><td>${d.rows} rows × ${d.cols} cols</td></tr>
<tr><td>Benches</td><td>${d.num_benches}</td></tr>
<tr><td>Actual production</td><td>${d.actual_production.toLocaleString()} t</td></tr>
</table>

<h2>4. Pattern Comparison</h2>
<table><tr><th>Pattern</th><th>MCPD (kg)</th><th>PPV (mm/s)</th><th>Delay steps</th><th>Duration (ms)</th><th>Col/Row delay</th><th>Verdict</th></tr>
${compRows}</table>

<h2>5. Vibration Assessment</h2>
<table><tr><th>Parameter</th><th>Value</th></tr>
<tr><td>MCPD</td><td>${c.mcpd} kg</td></tr>
<tr><td>PPV at reference distance</td><td>${c.ppv.ppv_mm_s} mm/s — ${c.ppv.classification.level}</td></tr>
<tr><td>Scaled distance (SD)</td><td>${c.ppv.scaled_distance} m/kg^0.5</td></tr>
</table>

<h2>6. Regulatory Limits (Reference)</h2>
<table><tr><th>Structure type</th><th>Limit (mm/s)</th></tr>${limitsRows}</table>

<h2>7. Firing Schedule (first 80 holes)</h2>
<table><tr><th>Hole</th><th>Row</th><th>Col</th><th>Delay (ms)</th><th>Simultaneous</th><th>Delay charge (kg)</th></tr>
${schedRows}
${c.schedule.length > 80 ? `<tr><td colspan="6" style="text-align:center;color:#aaa">…${c.schedule.length - 80} more holes — export CSV for full list</td></tr>` : ""}
</table>

<div class="footer">BlastSeq — For engineering reference only. All blast designs must be reviewed by a qualified blast engineer.</div>
</body></html>`;

  const win = window.open("", "_blank");
  if (win) { win.document.write(html); win.document.close(); }
}

function _download(content, type, filename) {
  const blob = new Blob([content], { type });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
