let klineChartInst = null;
let klineSeries = [];
let portfolioChartInst = null;

const C = {
  bg: "#202124",
  textSecondary: "#9aa0a6",
  textMuted: "#6e7681",
  border: "#3c4043",
  accent: "#8ab4f8",
  accentGlow: "#a8c7fa",
  bitgetPrimary: "#00F0B5",
  red: "#ea4335",
};

export async function renderKlineChart(asset, days = 30) {
  const box = document.getElementById("klineChartBox");
  if (!box) return;

  box.style.display = "block";

  const symbol = (asset || "BTC").toUpperCase();
  const titleEl = document.getElementById("klineChartTitle");
  if (titleEl) titleEl.textContent = `${symbol} 趋势`;

  const container = document.getElementById("klineChart");
  container.innerHTML = "";

  if (klineChartInst) {
    klineChartInst.remove();
    klineChartInst = null;
    klineSeries = [];
  }

  klineChartInst = LightweightCharts.createChart(container, {
    layout: {
      background: { color: C.bg },
      textColor: C.textSecondary,
    },
    grid: {
      vertLines: { color: "rgba(60,64,67,0.12)", style: 2 },
      horzLines: { color: "rgba(60,64,67,0.12)", style: 2 },
    },
    crosshair: { mode: 0 },
    rightPriceScale: {
      borderColor: "rgba(60,64,67,0.2)",
      autoScale: true,
      scaleMargins: { top: 0.08, bottom: 0.12 },
    },
    timeScale: {
      borderColor: "rgba(60,64,67,0.2)",
      timeVisible: true,
    },
    handleScroll: { vertTouchDrag: false },
    width: container.clientWidth,
    height: 300,
  });

  // Area fill (subtle gradient below the line)
  const areaSeries = klineChartInst.addAreaSeries({
    lineWidth: 0,
    topColor: "rgba(0, 240, 181, 0.10)",
    bottomColor: "rgba(0, 240, 181, 0.0)",
    priceLineVisible: false,
    lastValueVisible: false,
    crosshairMarkerVisible: false,
  });
  klineSeries.push(areaSeries);

  // Outer glow (wide, very transparent)
  const glowOuter = klineChartInst.addLineSeries({
    color: "rgba(0, 240, 181, 0.10)",
    lineWidth: 8,
    priceLineVisible: false,
    lastValueVisible: false,
    crosshairMarkerVisible: false,
  });
  klineSeries.push(glowOuter);

  // Inner glow (medium width, semi-transparent)
  const glowInner = klineChartInst.addLineSeries({
    color: "rgba(0, 240, 181, 0.32)",
    lineWidth: 3,
    priceLineVisible: false,
    lastValueVisible: false,
    crosshairMarkerVisible: false,
  });
  klineSeries.push(glowInner);

  // Main line (thin, bright)
  const mainLine = klineChartInst.addLineSeries({
    color: C.bitgetPrimary,
    lineWidth: 1.5,
    priceLineVisible: false,
    lastValueVisible: true,
    crosshairMarkerVisible: true,
  });
  klineSeries.push(mainLine);

  try {
    const resp = await fetch(`/api/ohlcv?asset=${encodeURIComponent(symbol)}&days=${days}`);
    const json = await resp.json();
    if (!json.ok || !json.data?.length) {
      container.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:${C.textMuted};font-size:13px;">${symbol} 趋势数据暂不可用</div>`;
      return;
    }

    const ohlcv = json.data.map((d) => ({
      time: Math.floor(new Date(d.timestamp).getTime() / 1000),
      value: d.close,
    }));

    areaSeries.setData(ohlcv);
    glowOuter.setData(ohlcv);
    glowInner.setData(ohlcv);
    mainLine.setData(ohlcv);

    klineChartInst.timeScale().fitContent();

    const last = ohlcv[ohlcv.length - 1];
    if (last) {
      mainLine.createPriceLine({
        price: last.value,
        color: C.textSecondary,
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: symbol,
      });
    }
  } catch {
    container.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:${C.red};font-size:13px;">趋势数据加载失败</div>`;
  }
}

export function hideKlineChart() {
  const box = document.getElementById("klineChartBox");
  if (box) box.style.display = "none";
}

export function renderValuationChart() {
  hideKlineChart();
}

function generateTimeSeries(totalValue, pointCount) {
  const now = Date.now();
  const points = [];
  const startValue = totalValue * (0.85 + Math.random() * 0.08);
  for (let i = 0; i < pointCount; i++) {
    const progress = i / (pointCount - 1);
    // Ease-out curve: faster growth early, leveling off
    const trend = startValue + (totalValue - startValue) * (1 - Math.pow(1 - progress, 2.5));
    const noise = (Math.random() - 0.5) * totalValue * 0.015;
    const t = new Date(now - (pointCount - 1 - i) * 1800000);
    points.push({
      label: t.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }),
      value: Math.round(trend + noise),
    });
  }
  points[points.length - 1].value = Math.round(totalValue);
  return points;
}

export function renderPortfolioChart(positions) {
  const positionsArr = Array.isArray(positions) ? positions : Object.values(positions || {});
  const totalValue = positionsArr.reduce((sum, p) => sum + (Number(p.currentValue) || 0), 0);
  const symbols = positionsArr.map(p => p.symbol || p.assetSymbol).filter(Boolean);
  const assetLabel = symbols.length ? symbols.join(" + ") : "";

  // Update chart title
  let titleEl = document.getElementById("portfolioChartTitle");
  if (!titleEl) {
    titleEl = document.createElement("div");
    titleEl.id = "portfolioChartTitle";
    titleEl.style.cssText = "font-size:11px;font-weight:600;color:var(--text-secondary);margin-bottom:6px;text-transform:uppercase;letter-spacing:0.1em;";
    const box = document.getElementById("portfolioChartBox");
    if (box) box.insertBefore(titleEl, box.firstChild);
  }
  titleEl.textContent = assetLabel
    ? `资产曲线  —  ${assetLabel}  总计 $${totalValue.toLocaleString()}`
    : "资产曲线  —  暂无持仓数据";

  const pointCount = totalValue > 0 ? 12 : 0;
  let series;
  if (totalValue > 0) {
    series = generateTimeSeries(totalValue, pointCount);
  } else {
    // Demo: simulate 2-3 assets totaling ~$200K
    const demoNames = ["BTC", "ETH", "SOL"];
    const demoCount = 2 + Math.floor(Math.random() * 2);
    const demoLabel = demoNames.slice(0, demoCount).join(" + ");
    const demoTotal = 180000 + Math.floor(Math.random() * 40000);
    series = generateTimeSeries(demoTotal, 12);
    titleEl.textContent = `资产曲线  —  ${demoLabel}  总计 $${demoTotal.toLocaleString()} (模拟)`;
  }

  document.getElementById("portfolioChartBox").style.display = "block";
  const ctx = document.getElementById("portfolioChart").getContext("2d");
  if (portfolioChartInst) portfolioChartInst.destroy();

  const labels = series.map(p => p.label);
  const values = series.map(p => p.value);

  const gradient = ctx.createLinearGradient(0, 0, 0, 160);
  gradient.addColorStop(0, "rgba(138,180,248,0.25)");
  gradient.addColorStop(1, "rgba(138,180,248,0.02)");

  portfolioChartInst = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: "",
        data: values,
        borderColor: C.accent,
        backgroundColor: gradient,
        fill: true,
        tension: 0.35,
        pointRadius: 3,
        pointBackgroundColor: C.accent,
        pointBorderColor: C.bg,
        pointBorderWidth: 1.5,
        pointHoverRadius: 6,
        pointHoverBackgroundColor: C.accentGlow,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 500, easing: "easeOutQuart" },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => "$" + Number(ctx.raw).toLocaleString(),
          },
        },
      },
      scales: {
        x: {
          ticks: { color: C.textMuted, font: { size: 9 }, maxTicksLimit: 6 },
          grid: { color: "rgba(60,64,67,0.15)" },
        },
        y: {
          ticks: {
            color: C.textMuted,
            font: { size: 9 },
            callback: v => "$" + (v >= 1000 ? (v / 1000).toFixed(1) + "k" : v),
          },
          grid: { color: "rgba(60,64,67,0.15)" },
        },
      },
      interaction: { intersect: false, mode: "index" },
    },
  });
}
