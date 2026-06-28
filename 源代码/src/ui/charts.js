let klineChartInst = null;
let klineCandleSeries = null;
let klineVolumeSeries = null;
let klineEmaSeries = null;
let portfolioChartInst = null;

// Google Dark Theme palette
const C = {
  bg: "#202124",
  surface: "#2d2e31",
  elevated: "#303134",
  textPrimary: "#e8eaed",
  textSecondary: "#9aa0a6",
  textMuted: "#6e7681",
  border: "#3c4043",
  accent: "#8ab4f8",
  accentGlow: "#a8c7fa",
  green: "#34a853",
  greenGlow: "#4ade80",
  red: "#ea4335",
  redGlow: "#f87168",
  yellow: "#fbbc04",
  cyan: "#78d9ec",
};

function ema(data, period) {
  const k = 2 / (period + 1);
  const result = [];
  let prev = data[0]?.close || 0;
  for (const d of data) {
    prev = d.close * k + prev * (1 - k);
    result.push({ time: d.time, value: prev });
  }
  return result;
}

export async function renderKlineChart(asset, days = 30) {
  const box = document.getElementById("klineChartBox");
  if (!box) return;

  box.style.display = "block";

  const symbol = (asset || "BTC").toUpperCase();
  const container = document.getElementById("klineChart");
  container.innerHTML = "";

  if (klineChartInst) {
    klineChartInst.remove();
    klineChartInst = null;
    klineCandleSeries = null;
    klineVolumeSeries = null;
    klineEmaSeries = null;
  }

  klineChartInst = LightweightCharts.createChart(container, {
    layout: {
      background: { color: C.bg },
      textColor: C.textSecondary,
    },
    grid: {
      vertLines: { color: C.border, style: 3 },
      horzLines: { color: C.border, style: 3 },
    },
    crosshair: {
      mode: 1,
      vertLine: { color: C.accent, style: 2, width: 1, labelBackgroundColor: C.surface },
      horzLine: { color: C.accent, style: 2, width: 1, labelBackgroundColor: C.surface },
    },
    rightPriceScale: {
      borderColor: C.border,
      scaleMargins: { top: 0.05, bottom: 0.25 },
      autoScale: true,
    },
    timeScale: {
      borderColor: C.border,
      timeVisible: true,
    },
    handleScroll: { vertTouchDrag: false },
    width: container.clientWidth,
    height: 420,
  });

  klineCandleSeries = klineChartInst.addCandlestickSeries({
    upColor: C.greenGlow,
    downColor: C.redGlow,
    borderUpColor: C.greenGlow,
    borderDownColor: C.redGlow,
    wickUpColor: C.greenGlow,
    wickDownColor: C.redGlow,
  });

  klineVolumeSeries = klineChartInst.addHistogramSeries({
    priceFormat: { type: "volume" },
    priceScaleId: "volume",
  });

  klineChartInst.priceScale("volume").applyOptions({
    scaleMargins: { top: 0.78, bottom: 0 },
  });

  klineEmaSeries = klineChartInst.addLineSeries({
    color: C.accent,
    lineWidth: 1.5,
    priceLineVisible: false,
    lastValueVisible: false,
    crosshairMarkerVisible: false,
  });

  try {
    const resp = await fetch(`/api/ohlcv?asset=${encodeURIComponent(symbol)}&days=${days}`);
    const json = await resp.json();
    if (!json.ok || !json.data?.length) {
      container.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:${C.textMuted};font-size:13px;">${symbol} K线数据暂不可用</div>`;
      return;
    }

    const ohlcv = json.data.map((d) => ({
      time: Math.floor(new Date(d.timestamp).getTime() / 1000),
      open: d.open, high: d.high, low: d.low, close: d.close,
      volume: d.volume || 0,
    }));

    klineCandleSeries.setData(ohlcv);

    const volumeData = ohlcv.map((d, i) => {
      const prev = i > 0 ? ohlcv[i - 1].close : d.open;
      const isUp = d.close >= prev;
      return {
        time: d.time,
        value: d.volume,
        color: isUp ? C.green + "44" : C.red + "44",
      };
    });
    klineVolumeSeries.setData(volumeData);

    klineEmaSeries.setData(ema(ohlcv, 9));

    klineChartInst.timeScale().fitContent();

    // Mark last price
    const last = ohlcv[ohlcv.length - 1];
    if (last) {
      klineCandleSeries.createPriceLine({
        price: last.close,
        color: C.textSecondary,
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: symbol,
      });
    }
  } catch {
    container.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:${C.red};font-size:13px;">K线数据加载失败</div>`;
  }
}

export function hideKlineChart() {
  const box = document.getElementById("klineChartBox");
  if (box) box.style.display = "none";
}

export function renderValuationChart() {
  // replaced by renderKlineChart
  hideKlineChart();
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
  gradient.addColorStop(0, "rgba(138,180,248,0.3)");
  gradient.addColorStop(1, "rgba(138,180,248,0.02)");

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
      },
      scales: {
        x: {
          ticks: { color: C.textMuted, font: { size: 9 } },
          grid: { color: C.border },
        },
        y: {
          ticks: {
            color: C.textMuted,
            font: { size: 9 },
            callback: v => "$" + v.toLocaleString(),
          },
          grid: { color: C.border },
        },
      },
      interaction: { intersect: false, mode: "index" },
    },
  });
}
