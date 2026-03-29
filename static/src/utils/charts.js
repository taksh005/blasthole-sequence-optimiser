/**
 * charts.js
 * Chart.js-based charts: PPV vs distance curve, pattern MCPD comparison bar chart.
 * Uses Chart.js loaded via CDN in index.html.
 */

let ppvChart    = null;
let mcpdChart   = null;

// ── PPV vs Distance Curve ─────────────────────────────────────
export function renderPPVChart(canvasId, curveData, limits, markedDistance) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  if (ppvChart) { ppvChart.destroy(); ppvChart = null; }

  const labels = curveData.map((p) => p.distance_m);
  const values = curveData.map((p) => p.ppv_mm_s);

  // Limit annotation lines
  const limitLines = limits.map((l) => ({
    type: "line",
    yMin: l.limit_mm_s,
    yMax: l.limit_mm_s,
    borderColor: l.color + "88",
    borderWidth: 1,
    borderDash: [5, 4],
    label: {
      content: l.label.split("(")[0].trim(),
      enabled: true,
      position: "end",
      color: l.color,
      font: { size: 9, family: "'IBM Plex Mono', monospace" },
      backgroundColor: "transparent",
    },
  }));

  ppvChart = new Chart(canvas, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "PPV (mm/s)",
          data: values,
          borderColor: "#EF9F27",
          backgroundColor: "rgba(239,159,39,0.08)",
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.4,
          fill: true,
        },
        // Marker for selected distance
        {
          label: `At ${markedDistance}m`,
          data: labels.map((d) =>
            d === markedDistance
              ? values[labels.indexOf(d)]
              : null
          ),
          borderColor: "#E24B4A",
          backgroundColor: "#E24B4A",
          pointRadius: 6,
          pointHoverRadius: 8,
          showLine: false,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => `PPV: ${ctx.parsed.y.toFixed(2)} mm/s`,
            title: (ctx) => `Distance: ${ctx[0].label} m`,
          },
        },
      },
      scales: {
        x: {
          title: { display: true, text: "Distance (m)", color: "#8a9bb5", font: { size: 11 } },
          ticks: { color: "#8a9bb5", maxTicksLimit: 8 },
          grid:  { color: "rgba(255,255,255,0.05)" },
        },
        y: {
          title: { display: true, text: "PPV (mm/s)", color: "#8a9bb5", font: { size: 11 } },
          ticks: { color: "#8a9bb5" },
          grid:  { color: "rgba(255,255,255,0.05)" },
        },
      },
    },
  });
}

// ── Pattern MCPD Comparison Bar Chart ────────────────────────
export function renderMCPDChart(canvasId, comparison) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  if (mcpdChart) { mcpdChart.destroy(); mcpdChart = null; }

  const patColors = {
    row:      "#4A8FD4",
    diagonal: "#1D9E75",
    v_shape:  "#EF9F27",
  };

  const labels   = comparison.map((p) => p.label);
  const mcpdVals = comparison.map((p) => p.mcpd);
  const ppvVals  = comparison.map((p) => p.ppv_mm_s);
  const colors   = comparison.map((p) => patColors[p.pattern] || "#888");

  mcpdChart = new Chart(canvas, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "MCPD (kg)",
          data: mcpdVals,
          backgroundColor: colors.map((c) => c + "bb"),
          borderColor: colors,
          borderWidth: 1.5,
          borderRadius: 3,
          yAxisID: "y",
        },
        {
          label: "PPV (mm/s)",
          data: ppvVals,
          type: "line",
          borderColor: "#E24B4A",
          backgroundColor: "rgba(226,75,74,0.15)",
          borderWidth: 2,
          pointRadius: 5,
          pointBackgroundColor: "#E24B4A",
          tension: 0.3,
          yAxisID: "y2",
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: { color: "#8a9bb5", font: { size: 11, family: "'IBM Plex Mono', monospace" } },
        },
        tooltip: {
          callbacks: {
            afterBody: (ctx) => {
              const idx = ctx[0].dataIndex;
              return [`Risk: ${comparison[idx].risk_level}`];
            },
          },
        },
      },
      scales: {
        x: {
          ticks: { color: "#8a9bb5" },
          grid:  { color: "rgba(255,255,255,0.05)" },
        },
        y: {
          position: "left",
          title: { display: true, text: "MCPD (kg)", color: "#8a9bb5", font: { size: 10 } },
          ticks: { color: "#8a9bb5" },
          grid:  { color: "rgba(255,255,255,0.05)" },
        },
        y2: {
          position: "right",
          title: { display: true, text: "PPV (mm/s)", color: "#E24B4A", font: { size: 10 } },
          ticks: { color: "#E24B4A" },
          grid:  { drawOnChartArea: false },
        },
      },
    },
  });
}
