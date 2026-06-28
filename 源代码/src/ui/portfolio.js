import { formatCompactNumber, formatUsd, zoneLabel, zoneClass } from "./utils.js";

let stateCache = null;
let pollInterval = null;

export function initPortfolio() {
  document.getElementById("tfSubmit").addEventListener("click", submitTrade);
}

function formatChangePct(pos) {
  if (!pos || !pos.currentPrice || !pos.averageCost || pos.averageCost <= 0) return null;
  const pct = ((pos.currentPrice - pos.averageCost) / pos.averageCost * 100);
  return { value: pct, text: `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`, isUp: pct >= 0 };
}

export function startPolling(fetchFn, fetchPortfolioFn, intervalMs = 5000) {
  if (pollInterval) clearInterval(pollInterval);
  pollInterval = setInterval(async () => {
    stateCache = await fetchFn();
    let portfolioSummary = null;
    if (fetchPortfolioFn) {
      try { portfolioSummary = await fetchPortfolioFn(); } catch { /* best-effort */ }
    }
    renderPortfolio(stateCache, portfolioSummary);
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

export function renderPortfolio(state, portfolioSummary) {
  stateCache = state;

  // Top counts from /api/state
  animateValue(document.getElementById("statAssets"), state.counts?.assets ?? 0, v => Math.round(v));
  animateValue(document.getElementById("statPositions"), state.counts?.positions ?? 0, v => Math.round(v));
  animateValue(document.getElementById("statPlans"), state.counts?.plans ?? 0, v => Math.round(v));

  const totalVal = (state.positions || []).reduce((sum, p) => sum + (Number(p.portfolioValue) || Number(p.currentValue) || 0), 0);
  animateValue(document.getElementById("statPortfolio"), totalVal, v => formatUsd(v));

  const list = document.getElementById("assetMiniList");
  const assets = state.assets || [];
  const reports = state.researchReports || [];

  // Asset list from portfolio-summary (preferred), enriched with state data
  const positions = portfolioSummary?.positions || [];

  if (!assets.length && !positions.length) {
    list.innerHTML = '<div class="muted" style="padding:14px;font-size:13px;text-align:center;">暂未纳入资产。<br>在对话中研究一个资产即可添加。</div>';
    return;
  }

  // Use portfolio-summary positions if available, otherwise build from state arrays
  if (positions.length > 0) {
    list.innerHTML = positions.map(pos => {
      const asset = assets.find(a => a.id === pos.assetId) || {};
      const report = reports.find(r => r.assetId === pos.assetId);
      const symbol = pos.symbol || asset.symbol || "?";
      const name = asset.name || symbol;
      const planStatus = pos.plan?.status || null;
      const fdv = pos.latestMetrics?.fdv;
      const change = formatChangePct(pos);
      const zone = pos.valuationZone;
      const zClass = zoneClass(zone);
      const zText = zoneLabel(zone);
      const tiers = pos.plan?.valuationTiers;
      const researchStatus = getResearchStatus(report);
      const nextReview = pos.plan?.nextReviewAt;
      const origPos = (state.positions || []).find(p => p.assetId === pos.assetId);
      const extraFlags = {
        portfolioMissing: !!(pos.units && origPos && !origPos.portfolioContextComplete),
      };

      return `
        <div class="asset-mini" data-asset="${pos.assetId}" data-symbol="${symbol}">
          <div class="am-top">
            <div class="am-left">
              <span class="am-sym">${symbol} · ${name}</span>
              ${pos.currentPrice ? `<span class="am-price">${formatUsd(pos.currentPrice)}</span>` : ""}
              ${change ? `<span class="am-change ${change.isUp ? "up" : "down"}">${change.text}</span>` : ""}
            </div>
            <div class="am-right">
              ${renderStatusBadges(planStatus, researchStatus, extraFlags)}
            </div>
          </div>
          <div class="am-meta">
            <span class="am-meta-item">持仓 <strong>${pos.units ?? 0}</strong> 个</span>
            <span class="am-meta-sep">|</span>
            <span class="am-meta-item">成本 <strong>${pos.averageCost ? formatUsd(pos.averageCost) : "--"}</strong></span>
            <span class="am-meta-sep">|</span>
            <span class="am-meta-item">FDV <strong>${formatCompactNumber(fdv)}</strong></span>
          </div>
          ${tiers ? renderTierRow(tiers) : ""}
          <div class="am-meta" style="margin-top:2px;">
            <span class="am-zone ${zClass}">估值区间：${zText}</span>
            <span class="am-meta-sep">|</span>
            <span class="am-meta-item">研究：${researchStatusLabel(researchStatus)}</span>
            ${nextReview ? `<span class="am-meta-sep">|</span><span class="am-meta-item">复查：${nextReview.slice(0, 10)}</span>` : ""}
          </div>
        </div>
      `;
    }).join("");
  } else {
    // Fallback: render from state arrays (no portfolio-summary available)
    list.innerHTML = assets.map(asset => {
      const pos = (state.positions || []).find(p => p.assetId === asset.id);
      const report = reports.find(r => r.assetId === asset.id);
      const plan = (state.plans || []).find(p => p.assetId === asset.id);
      const planStatus = plan?.status;
      const valn = (state.valuationModels || []).find(v => v.assetId === asset.id);
      const fdv = valn?.currentMetrics?.fdv;
      const change = formatChangePct(pos);
      const cp = pos?.currentPrice;
      const researchStatus = getResearchStatus(report);
      const tiers = plan?.valuationTiers || (valn?.scenarios ? {
        conservative: valn.scenarios[0]?.targetFdvRange?.join("-"),
        base: valn.scenarios[1]?.targetFdvRange?.join("-"),
        aggressive: valn.scenarios[2]?.targetFdvRange?.join("-"),
      } : null);
      const extraFlags = {
        portfolioMissing: pos && !pos.portfolioContextComplete,
      };

      return `
        <div class="asset-mini" data-asset="${asset.id}" data-symbol="${asset.symbol}">
          <div class="am-top">
            <div class="am-left">
              <span class="am-sym">${asset.symbol} · ${asset.name}</span>
              ${cp ? `<span class="am-price">${formatUsd(cp)}</span>` : ""}
              ${change ? `<span class="am-change ${change.isUp ? "up" : "down"}">${change.text}</span>` : ""}
            </div>
            <div class="am-right">
              ${renderStatusBadges(planStatus, researchStatus, extraFlags)}
            </div>
          </div>
          <div class="am-meta">
            <span class="am-meta-item">持仓 <strong>${pos?.units ?? 0}</strong> 个</span>
            <span class="am-meta-sep">|</span>
            <span class="am-meta-item">成本 <strong>${pos?.averageCost ? formatUsd(pos.averageCost) : "--"}</strong></span>
            <span class="am-meta-sep">|</span>
            <span class="am-meta-item">FDV <strong>${formatCompactNumber(fdv)}</strong></span>
          </div>
          ${tiers ? renderTierRow(tiers) : ""}
          <div class="am-meta" style="margin-top:2px;">
            <span class="am-meta-item">研究：${researchStatusLabel(researchStatus)}</span>
            ${plan?.nextReviewAt ? `<span class="am-meta-sep">|</span><span class="am-meta-item">复查：${plan.nextReviewAt.slice(0, 10)}</span>` : ""}
          </div>
        </div>
      `;
    }).join("");
  }

  // Wire up click → detail panel via /api/asset-context
  list.querySelectorAll(".asset-mini").forEach(card => {
    card.addEventListener("click", () => {
      const symbol = card.dataset.symbol;
      if (symbol) showDetailPanel(symbol);
    });
  });
}

function getResearchStatus(report) {
  if (!report) return "missing";
  const fields = ["comparablesDraft", "listingPathDraft", "fundingUnlockDraft"];
  const ready = fields.filter(f => report[f]?.status === "ready").length;
  const partial = fields.filter(f => report[f]?.status === "partial").length;
  const missing = fields.filter(f => !report[f] || report[f].status === "missing").length;
  if (ready === 3) return "ready";
  if (missing === 3) return "blocked";
  if (partial > 0 || missing > 0) return "thin";
  return "thin";
}

function researchStatusLabel(status) {
  const map = {
    ready: "可用",
    thin: "偏薄",
    blocked: "阻塞",
    missing: "待补充",
  };
  return map[status] || "待补充";
}

function renderStatusBadges(planStatus, researchStatus, extraFlags) {
  const badges = [];
  if (planStatus) badges.push(renderPlanBadge(planStatus));
  if (researchStatus === "thin") badges.push('<span class="plan-badge thin">Research Thin</span>');
  if (researchStatus === "blocked") badges.push('<span class="plan-badge blocked">Research Thin</span>');
  if (extraFlags?.mcpUnavailable) badges.push('<span class="plan-badge blocked">MCP Unavailable</span>');
  if (extraFlags?.portfolioMissing) badges.push('<span class="plan-badge needs_review">Portfolio Missing</span>');
  return badges.join("");
}

function renderTierRow(tiers) {
  if (!tiers) return "";
  const conservative = tiers.conservative || "--";
  const base = tiers.base || "--";
  const aggressive = tiers.aggressive || "--";
  return `
    <div class="am-meta" style="margin-top:2px;font-size:11px;color:var(--muted);">
      估值区间：保守 ${conservative} / 基准 ${base} / 乐观 ${aggressive}
    </div>`;
}

async function showDetailPanel(assetSymbol) {
  const panel = document.getElementById("detailPanel");
  panel.innerHTML = '<div class="muted" style="padding:14px;text-align:center;">加载中...</div>';
  panel.classList.add("open");

  try {
    const r = await fetch(`/api/asset-context?asset=${encodeURIComponent(assetSymbol)}`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const ctx = await r.json();
    if (!ctx.ok) throw new Error("API error");

    const asset = ctx.asset || {};
    const pos = ctx.position;
    const plan = ctx.plan;
    const valn = ctx.valuationModel;
    const report = ctx.researchReport;
    const sources = ctx.recentSources || [];
    const traces = ctx.recentTraces || [];
    const mem = ctx.memorySummary || {};
    const zone = mem.valuationZone || "unknown";
    const fdv = valn?.currentMetrics?.fdv;

    panel.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <strong>${asset.symbol} · ${asset.name || asset.symbol}</strong>
        <span style="font-size:11px;color:var(--muted);cursor:pointer;" onclick="document.getElementById('detailPanel').classList.remove('open')">关闭</span>
      </div>

      <div class="dp-section">
        <div class="dp-section-title">基本信息</div>
        <div class="dp-row"><span class="dp-label">类型</span><span class="dp-value">${asset.assetType || "--"}${asset.chain ? ` / ${asset.chain}` : ""}</span></div>
        <div class="dp-row"><span class="dp-label">当前 FDV</span><span class="dp-value">${formatCompactNumber(fdv)}</span></div>
        <div class="dp-row"><span class="dp-label">估值区间</span><span class="dp-value ${zoneClass(zone)}">${zoneLabel(zone)}</span></div>
        ${pos ? `<div class="dp-row"><span class="dp-label">持仓</span><span class="dp-value">${pos.units ?? 0} 个 / 成本 ${formatUsd(pos.averageCost)} / 现价 ${formatUsd(pos.currentPrice)}</span></div>` : ""}
        <div class="dp-row"><span class="dp-label">计划状态</span><span class="dp-value">${plan?.status || "无"}</span></div>
      </div>

      ${mem.thesis ? `
      <div class="dp-section">
        <div class="dp-section-title">投资论点</div>
        <div class="dp-text">${Array.isArray(mem.thesis) ? mem.thesis.join("；") : mem.thesis}</div>
      </div>` : ""}

      ${mem.catalysts?.length ? `
      <div class="dp-section">
        <div class="dp-section-title">催化剂</div>
        <div class="dp-text">${mem.catalysts.map(c => `- ${c}`).join("<br>")}</div>
      </div>` : ""}

      ${mem.risks?.length ? `
      <div class="dp-section">
        <div class="dp-section-title">风险</div>
        <div class="dp-text">${mem.risks.map(r => `- ${r}`).join("<br>")}</div>
      </div>` : ""}

      ${valn?.scenarios?.length ? `
      <div class="dp-section">
        <div class="dp-section-title">估值三档</div>
        <div class="dp-text">${valn.scenarios.map(s => {
          const [lo, hi] = s.targetFdvRange || [];
          return `- ${s.name}: ${formatCompactNumber(lo)} - ${formatCompactNumber(hi)}`;
        }).join("<br>")}</div>
      </div>` : ""}

      ${plan ? `
      <div class="dp-section">
        <div class="dp-section-title">执行计划</div>
        ${plan.addZone ? `<div class="dp-row"><span class="dp-label">加仓区</span><span class="dp-value">${plan.addZone}</span></div>` : ""}
        ${plan.sellZone ? `<div class="dp-row"><span class="dp-label">止盈区</span><span class="dp-value">${plan.sellZone}</span></div>` : ""}
        ${plan.nextReviewAt ? `<div class="dp-row"><span class="dp-label">下次复查</span><span class="dp-value">${plan.nextReviewAt.slice(0, 10)}</span></div>` : ""}
      </div>` : ""}

      ${mem.missingBasics?.length ? `
      <div class="dp-section">
        <div class="dp-section-title">信息缺口</div>
        <div class="dp-text">${mem.missingBasics.map(m => `- ${m}`).join("<br>")}</div>
      </div>` : ""}

      ${sources.length ? `
      <div class="dp-section">
        <div class="dp-section-title">近期来源 (${sources.length})</div>
        <div class="dp-text" style="font-size:11px;">${sources.slice(0, 5).map(s => `- ${s.title || s.sourceType}`).join("<br>")}</div>
      </div>` : ""}

      ${traces.length ? `
      <div class="dp-section">
        <div class="dp-section-title">近期操作 (${traces.length})</div>
        <div class="dp-text" style="font-size:11px;">${traces.slice(0, 5).map(t => `- ${t.userIntent}: ${t.finalRecommendation}`).join("<br>")}</div>
      </div>` : ""}

      <div class="dp-section">
        <div class="dp-section-title">研究状态</div>
        <div class="dp-row"><span class="dp-label">完备度</span><span class="dp-value">${mem.researchReadinessLabel || "待补充"}</span></div>
        <div class="dp-row"><span class="dp-label">来源数</span><span class="dp-value">${mem.sourceCount ?? sources.length}</span></div>
      </div>
    `;
    panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
  } catch (err) {
    panel.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <strong>${assetSymbol}</strong>
        <span style="font-size:11px;color:var(--muted);cursor:pointer;" onclick="document.getElementById('detailPanel').classList.remove('open')">关闭</span>
      </div>
      <div class="muted" style="padding:14px;text-align:center;">无法加载资产详情：${err.message}</div>
    `;
  }
}

function renderPlanBadge(status) {
  const labels = { draft: "Draft", active: "Active", needs_review: "Needs Review", archived: "Archived" };
  const cls = status || "draft";
  return `<span class="plan-badge ${cls}">${labels[status] || status}</span>`;
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
        assetQuery: symbol,
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
