let valuationChartInst = null;
let portfolioChartInst = null;

const C = {
  accent: "#00F0FF",
  accent2: "#00C8D6",
  gold: "#F7931A",
  ink: "#1A2332",
  ink2: "#4A5568",
  muted: "#94A3B8",
  line: "#E4E8EE",
  ok: "#00C853",
  risk: "#FF5252",
  greenZone: "rgba(0,200,83,0.18)",
  yellowZone: "rgba(247,147,26,0.16)",
  redZone: "rgba(255,82,82,0.14)"
};

export function renderValuationChart(valuation) {
  if (!valuation?.scenarios?.length || !valuation.currentMetrics?.fdv) {
    document.getElementById("valuationChartBox").style.display = "none";
    return;
  }

  document.getElementById("valuationChartBox").style.display = "block";
  const ctx = document.getElementById("valuationChart").getContext("2d");

  if (valuationChartInst) valuationChartInst.destroy();

  const fdv = Number(valuation.currentMetrics.fdv);
  const cons = valuation.scenarios.find(s => s.name === "conservative");
  const base = valuation.scenarios.find(s => s.name === "base");
  const aggr = valuation.scenarios.find(s => s.name === "aggressive");

  const labels = [];
  const data = [];
  const bgColors = [];
  const borderColors = [];

  if (cons) {
    labels.push("保守区");
    data.push([cons.targetFdvRange[0] / 1e6, cons.targetFdvRange[1] / 1e6]);
    bgColors.push(C.greenZone);
    borderColors.push("rgba(0,200,83,0.5)");
  }
  if (base) {
    labels.push("基准区");
    data.push([base.targetFdvRange[0] / 1e6, base.targetFdvRange[1] / 1e6]);
    bgColors.push(C.yellowZone);
    borderColors.push("rgba(247,147,26,0.5)");
  }
  if (aggr) {
    labels.push("高估值区");
    data.push([aggr.targetFdvRange[0] / 1e6, aggr.targetFdvRange[1] / 1e6]);
    bgColors.push(C.redZone);
    borderColors.push("rgba(255,82,82,0.5)");
  }

  const currentFdvM = fdv / 1e6;

  valuationChartInst = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "估值区间 ($M FDV)",
        data: data.map(d => d[1] - d[0]),
        backgroundColor: bgColors,
        borderColor: borderColors,
        borderWidth: 1,
        borderRadius: 4,
        barThickness: 32,
        base: data.map(d => d[0])
      }]
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 600, easing: "easeOutQuart" },
      plugins: { legend: { display: false } },
      scales: {
        x: {
          title: { text: "FDV ($M)", color: C.muted, display: true },
          ticks: { color: C.muted, font: { size: 10 } },
          grid: { color: C.line }
        },
        y: {
          ticks: { color: C.ink, font: { size: 11, weight: 500 } },
          grid: { display: false }
        }
      }
    },
    plugins: [{
      id: "fdvLine",
      afterDraw(chart) {
        const xScale = chart.scales.x;
        const yScale = chart.scales.y;
        const x = xScale.getPixelForValue(currentFdvM);
        if (x < xScale.left || x > xScale.right) return;

        chart.ctx.save();
        chart.ctx.beginPath();
        chart.ctx.moveTo(x, yScale.top);
        chart.ctx.lineTo(x, yScale.bottom);
        chart.ctx.strokeStyle = C.accent;
        chart.ctx.lineWidth = 2.5;
        chart.ctx.setLineDash([5, 4]);
        chart.ctx.stroke();

        // Current FDV label badge
        const label = `当前 $${currentFdvM.toFixed(1)}M`;
        const textW = chart.ctx.measureText(label).width + 14;
        const bx = x - textW / 2;
        const by = yScale.top - 22;

        chart.ctx.fillStyle = C.accent;
        chart.ctx.beginPath();
        chart.ctx.roundRect(bx, by, textW, 18, 4);
        chart.ctx.fill();

        chart.ctx.fillStyle = "#FFFFFF";
        chart.ctx.font = "bold 10px monospace";
        chart.ctx.textAlign = "center";
        chart.ctx.fillText(label, x, by + 13);
        chart.ctx.restore();
      }
    }]
  });
}

export function renderPortfolioChart(positions) {
  if (!positions.length) {
    document.getElementById("portfolioChartBox").style.display = "none";
    return;
  }

  document.getElementById("portfolioChartBox").style.display = "block";
  const ctx = document.getElementById("portfolioChart").getContext("2d");

  if (portfolioChartInst) portfolioChartInst.destroy();

  const now = Date.now();
  const labels = positions.map((_, i) => {
    const d = new Date(now - (positions.length - 1 - i) * 300000);
    return d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  });

  const values = positions.map(p => Number(p.portfolioValue) || 0);

  const gradient = ctx.createLinearGradient(0, 0, 0, 160);
  gradient.addColorStop(0, "rgba(0,240,255,0.18)");
  gradient.addColorStop(1, "rgba(0,240,255,0.01)");

  portfolioChartInst = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: "组合估值",
        data: values,
        borderColor: C.accent,
        backgroundColor: gradient,
        fill: true,
        tension: 0.35,
        pointRadius: 3,
        pointBackgroundColor: C.accent,
        pointBorderColor: "#FFFFFF",
        pointBorderWidth: 1.5,
        pointHoverRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 500, easing: "easeOutQuart" },
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: C.muted, font: { size: 9 } }, grid: { display: false } },
        y: {
          ticks: { color: C.muted, font: { size: 9 }, callback: v => "$" + v.toLocaleString() },
          grid: { color: C.line }
        }
      },
      interaction: { intersect: false, mode: "index" }
    }
  });
}
