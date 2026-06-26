import { formatCompactNumber, formatUsd, zoneLabel, zoneClass } from "./utils.js";

let stateCache = null;
let pollInterval = null;

export function initPortfolio() {
  document.getElementById("tfSubmit").addEventListener("click", submitTrade);
}

export function startPolling(fetchFn, intervalMs = 5000) {
  if (pollInterval) clearInterval(pollInterval);
  pollInterval = setInterval(async () => {
    stateCache = await fetchFn();
    renderPortfolio(stateCache);
  }, intervalMs);
}

export function stopPolling() {
  if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
}

export function getStateCache() { return stateCache; }
export function setStateCache(s) { stateCache = s; }

function animateValue(el, newVal, formatter) {
  const oldText = el.textContent;
  const oldNum = parseFloat(oldText.replace(/[^0-9.-]/g, ""));
  const newNum = parseFloat(String(newVal).replace(/[^0-9.-]/g, ""));

  if (isNaN(oldNum) || isNaN(newNum) || oldNum === newNum) {
    el.textContent = formatter ? formatter(newVal) : newVal;
    return;
  }

  const diff = newNum - oldNum;
  if (Math.abs(diff) < 1) {
    el.textContent = formatter ? formatter(newVal) : newVal;
    return;
  }

  el.classList.add("changed");
  const duration = 400;
  const start = performance.now();
  const from = oldNum;

  function tick(now) {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = from + diff * eased;
    el.textContent = formatter ? formatter(current) : Math.round(current).toString();
    if (progress < 1) requestAnimationFrame(tick);
    else {
      el.textContent = formatter ? formatter(newVal) : newVal;
      setTimeout(() => el.classList.remove("changed"), 600);
    }
  }
  requestAnimationFrame(tick);
}

export function renderPortfolio(state) {
  stateCache = state;

  animateValue(document.getElementById("statAssets"), state.counts?.assets ?? 0, v => Math.round(v));
  animateValue(document.getElementById("statPositions"), state.counts?.positions ?? 0, v => Math.round(v));
  animateValue(document.getElementById("statPlans"), state.counts?.plans ?? 0, v => Math.round(v));

  const totalVal = (state.positions || []).reduce((sum, p) => sum + (Number(p.portfolioValue) || 0), 0);
  animateValue(document.getElementById("statPortfolio"), totalVal, v => formatUsd(v));

  const list = document.getElementById("assetMiniList");
  const assets = state.assets || [];
  const positions = state.positions || [];
  const plans = state.plans || [];
  const valuations = state.valuationModels || [];
  const reports = state.researchReports || [];

  if (!assets.length) {
    list.innerHTML = '<div class="muted" style="padding:14px;font-size:13px;text-align:center;">暂未纳入资产。<br>在对话中研究一个资产即可添加。</div>';
    return;
  }

  list.innerHTML = assets.map(asset => {
    const pos = positions.find(p => p.assetId === asset.id);
    const plan = plans.find(p => p.assetId === asset.id);
    const valn = valuations.find(v => v.assetId === asset.id);
    const report = reports.find(r => r.assetId === asset.id);

    const fdv = valn?.currentMetrics?.fdv;
    const zone = detectZone(valn);
    const zClass = zoneClass(zone);
    const zText = zoneLabel(zone);

    return `
      <div class="asset-mini" data-asset="${asset.id}">
        <div class="am-top">
          <span class="am-sym">${asset.symbol}</span>
          <span class="am-zone ${zClass}">${zText}</span>
        </div>
        <div class="am-detail">
          持有：${pos?.units ?? 0} | 成本：${pos?.averageCost ?? "--"} | FDV：${formatCompactNumber(fdv)}
        </div>
        ${renderHonestFields(report)}
        ${plan ? `<div class="am-detail">计划：${plan.status} | ${plan.sellZone || ""}</div>` : ""}
      </div>
    `;
  }).join("");

  list.querySelectorAll(".asset-mini").forEach(card => {
    card.addEventListener("click", () => {
      const assetId = card.dataset.asset;
      showDetailPanel(assetId, state);
    });
  });
}

function showDetailPanel(assetId, state) {
  const asset = (state.assets || []).find(a => a.id === assetId);
  const pos = (state.positions || []).find(p => p.assetId === assetId);
  const plan = (state.plans || []).find(p => p.assetId === assetId);
  const valn = (state.valuationModels || []).find(v => v.assetId === assetId);
  const sources = (state.sources || []).filter(s => s.assetId === assetId);
  const report = (state.researchReports || []).find(r => r.assetId === assetId);

  const panel = document.getElementById("detailPanel");
  if (!asset) { panel.classList.remove("open"); return; }

  const zone = detectZone(valn);
  const fdv = valn?.currentMetrics?.fdv;

  panel.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
      <strong>${asset.symbol}</strong>
      <span style="font-size:11px;color:var(--muted);cursor:pointer;" onclick="document.getElementById('detailPanel').classList.remove('open')">关闭</span>
    </div>
    <div class="dp-row"><span class="dp-label">名称</span><span class="dp-value">${asset.name}</span></div>
    <div class="dp-row"><span class="dp-label">类型</span><span class="dp-value">${asset.assetType}${asset.chain ? ` / ${asset.chain}` : ""}</span></div>
    <div class="dp-row"><span class="dp-label">当前 FDV</span><span class="dp-value">${formatCompactNumber(fdv)}</span></div>
    <div class="dp-row"><span class="dp-label">估值区间</span><span class="dp-value">${zoneLabel(zone)}</span></div>
    <div class="dp-row"><span class="dp-label">持仓</span><span class="dp-value">${pos?.units ?? 0} 个 / 成本 ${pos?.averageCost ?? "--"} / 现价 ${pos?.currentPrice ?? "--"}</span></div>
    <div class="dp-row"><span class="dp-label">计划</span><span class="dp-value">${plan?.status || "无"}</span></div>
    <div class="dp-row"><span class="dp-label">来源数</span><span class="dp-value">${sources.length}</span></div>
    <div class="dp-row"><span class="dp-label">对标估值</span><span class="dp-value">${!report || !report?.comparablesDraft || report?.comparablesDraft?.status === "missing" ? '<span class="placeholder-gray">待补充</span>' : report?.comparablesDraft?.summary || "已就绪"}</span></div>
    <div class="dp-row"><span class="dp-label">上所路径</span><span class="dp-value">${!report || !report?.listingPathDraft || report?.listingPathDraft?.status === "missing" ? '<span class="placeholder-gray">待补充</span>' : "已就绪"}</span></div>
  `;
  panel.classList.add("open");
  panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function renderHonestFields(report) {
  const fields = [
    { key: "comparablesDraft", label: "对标估值" },
    { key: "listingPathDraft", label: "上所路径" },
    { key: "fundingUnlockDraft", label: "融资/解锁" }
  ];
  if (!report) {
    return fields.map(f =>
      `<div class="am-detail">${f.label}：<span class="placeholder-gray">待补充</span></div>`
    ).join("");
  }
  return fields.map(f => {
    const draft = report[f.key];
    if (!draft || draft.status === "missing") {
      return `<div class="am-detail">${f.label}：<span class="placeholder-gray">待补充</span></div>`;
    }
    if (draft.status === "partial") {
      return `<div class="am-detail">${f.label}：${draft.summary || "部分就绪"} <span style="color:var(--gold);font-size:11px;font-weight:600;">补强</span></div>`;
    }
    return `<div class="am-detail">${f.label}：${draft.summary || "已就绪"}</div>`;
  }).join("");
}

function detectZone(valuation) {
  if (!valuation?.currentMetrics?.fdv || !valuation?.scenarios?.length) return "unknown";
  const fdv = Number(valuation.currentMetrics.fdv);
  const cons = valuation.scenarios.find(s => s.name === "conservative");
  const base = valuation.scenarios.find(s => s.name === "base");
  const aggr = valuation.scenarios.find(s => s.name === "aggressive");
  if (!cons || !base || !aggr) return "unknown";

  if (fdv <= cons.targetFdvRange[0]) return "below_conservative";
  if (fdv <= cons.targetFdvRange[1]) return "conservative";
  if (fdv <= base.targetFdvRange[1]) return "base";
  if (fdv >= aggr.targetFdvRange[0]) return "aggressive";
  return "between_base_and_aggressive";
}

async function submitTrade() {
  const symbol = document.getElementById("tfSymbol").value.trim();
  const units = document.getElementById("tfUnits").value;
  const cost = document.getElementById("tfCost").value;
  const portfolioValue = document.getElementById("tfPortfolioValue").value;

  if (!symbol || !units || !cost) return;

  try {
    await fetch("/api/manage-position", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        asset: symbol,
        units: Number(units),
        averageCost: Number(cost),
        portfolioValue: portfolioValue ? Number(portfolioValue) : undefined
      })
    });
  } catch {
    // API may not exist yet
  }

  document.getElementById("tfSymbol").value = "";
  document.getElementById("tfUnits").value = "";
  document.getElementById("tfCost").value = "";
  document.getElementById("tfPortfolioValue").value = "";

  if (stateCache) {
    stateCache.counts.positions = (stateCache.counts.positions || 0) + 1;
    renderPortfolio(stateCache);
  }
}
