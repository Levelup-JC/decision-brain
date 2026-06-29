import { formatCompactNumber, formatUsd, zoneLabel, zoneClass } from "./utils.js";

let stateCache = null;
let pollInterval = null;
let onRefreshRequested = null;

export function setRefreshCallback(fn) {
  onRefreshRequested = fn;
}

export function initPortfolio() {
  // Plans expand toggle
  const plansCard = document.getElementById("statPlansCard");
  if (plansCard) {
    plansCard.addEventListener("click", () => {
      const panel = document.getElementById("plansExpand");
      if (panel) {
        const isOpen = panel.classList.toggle("open");
        plansCard.classList.toggle("expanded", isOpen);
        const lbl = plansCard.querySelector(".lbl");
        if (lbl) lbl.textContent = isOpen ? "计划 ▴" : "计划 ▾";
      }
    });
  }

  // Positions toggle: show/hide asset card list
  const posCard = document.getElementById("statPositionsCard");
  const assetList = document.getElementById("assetMiniList");
  if (posCard && assetList) {
    // Default: collapsed (hidden)
    assetList.classList.add("collapsed");
    _listCollapsed = true;
    posCard.addEventListener("click", () => {
      const isHidden = assetList.classList.toggle("collapsed");
      _listCollapsed = isHidden;
      posCard.classList.toggle("expanded", !isHidden);
      const lbl = posCard.querySelector(".lbl");
      if (lbl) lbl.textContent = isHidden ? "持仓 ▾" : "持仓 ▴";
    });
  }
}

let _plansExpandData = [];
let _expandedSymbol = null;
let _detailHTML = null;
let _listCollapsed = true;

function renderPlansExpand(positions, count) {
  _plansExpandData = positions.filter((p) => p.plan);
  const panel = document.getElementById("plansExpand");
  if (!panel) return;

  if (_plansExpandData.length === 0) {
    panel.innerHTML = '<div class="muted" style="padding:14px;font-size:12px;text-align:center;">暂无投资计划</div>';
    return;
  }

  panel.innerHTML = _plansExpandData.map((p) => {
    const statusLabel = p.plan?.status === "active" ? "活跃" : "draft";
    const statusClass = p.plan?.status === "active" ? "active" : "draft";
    const zone = p.valuationZone || null;
    const zoneStr = zone ? `估值区间: ${zone}` : "";
    const tiers = p.plan?.valuationTiers
      ? `保守 ${p.plan.valuationTiers.conservative || "--"} / 基准 ${p.plan.valuationTiers.base || "--"} / 乐观 ${p.plan.valuationTiers.aggressive || "--"}`
      : "";
    const policy = p.plan?.monitoringPolicy || "";

    return `
      <div class="plans-expand-item">
        <div>
          <span class="pe-symbol">${p.symbol}</span>
          ${zoneStr ? `<div class="pe-zone">${zoneStr}</div>` : ""}
          ${tiers ? `<div class="pe-zone" style="font-size:10px;color:var(--text-muted);">${tiers}</div>` : ""}
          ${policy ? `<div class="pe-zone" style="font-size:10px;color:var(--text-muted);">策略: ${policy}</div>` : ""}
        </div>
        <span class="pe-status ${statusClass}">${statusLabel}</span>
      </div>
    `;
  }).join("");
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

  // Top counts
  const plansCount = state.counts?.plans ?? 0;
  animateValue(document.getElementById("statPlans"), plansCount, v => Math.round(v));

  // Prefer portfolioSummary totals; fall back to computing from positions as object map
  const positionsCount = portfolioSummary?.totalCount
    ?? Object.values(state.positions || {}).filter((p) => {
        const plan = (state.plans || {})[p.assetId];
        return !plan || plan.status !== "archived";
      }).length;
  animateValue(document.getElementById("statPositions"), positionsCount, v => Math.round(v));

  const totalVal = portfolioSummary?.totalPositionValue
    ?? Object.values(state.positions || {}).reduce((sum, p) => sum + (Number(p.currentValue) || 0), 0);
  animateValue(document.getElementById("statPortfolio"), totalVal, v => formatUsd(v));

  // Render plans expand panel
  renderPlansExpand(portfolioSummary?.positions || [], plansCount);

  const list = document.getElementById("assetMiniList");
  const assets = state.assets || {};
  const assetsArr = Object.values(assets);
  const reports = state.researchReports || {};

  // Save expanded state before re-render
  if (list) {
    const expanded = list.querySelector(".asset-mini.expanded");
    if (expanded) {
      _expandedSymbol = expanded.dataset.symbol;
      const inline = expanded.querySelector(".asset-detail-inline");
      _detailHTML = inline ? inline.innerHTML : null;
    } else {
      _expandedSymbol = null;
      _detailHTML = null;
    }
  }

  // Asset list from portfolio-summary (preferred), enriched with state data
  const positions = portfolioSummary?.positions || [];

  // Plan XVIII: check both portfolioSummary positions AND state.positions before showing empty.
  // portfolioSummary can be null on fetch error even when state has real positions.
  const statePositionsArr = Object.values(state.positions || {});
  const hasPortfolioData = positions.length > 0 || statePositionsArr.length > 0;

  if (!assetsArr.length && !hasPortfolioData) {
    const errorMsg = portfolioSummary === null && statePositionsArr.length === 0
      ? '<div class="muted" style="padding:14px;font-size:13px;text-align:center;">持仓读取失败，请重试</div>'
      : '<div class="muted" style="padding:14px;font-size:13px;text-align:center;">当前暂无持仓。<br>在对话中研究一个资产即可添加。</div>';
    list.innerHTML = errorMsg;
    return;
  }

  // Use portfolio-summary positions if available, otherwise build from state objects
  if (positions.length > 0) {
    list.innerHTML = positions.map(pos => {
      const asset = assets[pos.assetId] || {};
      const report = reports[pos.assetId];
      const symbol = pos.symbol || asset.symbol || "?";
      const name = asset.name || symbol;
      const planStatus = pos.plan?.status || null;
      const fdv = pos.latestMetrics?.fdv;
      const change = formatChangePct(pos);
      const zone = pos.valuationZone;
      const zClass = zoneClass(zone);
      const zText = zoneLabel(zone);
      const tiers = pos.plan?.valuationTiers;
      const researchStatus = report ? getResearchStatus(report) : "missing";
      const nextReview = pos.plan?.nextReviewAt;
      const statePos = (state.positions || {})[pos.assetId];
      const extraFlags = {
        portfolioMissing: !!(pos.units && statePos && !statePos.portfolioContextComplete),
      };

      return `
        <div class="asset-mini" data-asset="${pos.assetId}" data-symbol="${symbol}">
          <div class="am-top">
            <div class="am-left">
              <span class="am-sym">${symbol}</span>
              <span class="am-name">${name}</span>
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
            <span class="am-meta-item">均价 <strong>${pos.averageCost ? formatUsd(pos.averageCost) : "--"}</strong></span>
            <span class="am-meta-sep">|</span>
            <span class="am-meta-item">总成本 <strong>${pos.costBasisTotal ? formatUsd(pos.costBasisTotal) : "--"}</strong></span>
            <span class="am-meta-sep">|</span>
            <span class="am-meta-item">价值 <strong>${pos.currentValue ? formatUsd(pos.currentValue) : "--"}</strong></span>
          </div>
          ${tiers ? renderTierRow(tiers) : ""}
          <div class="am-meta am-meta-secondary">
            ${fdv ? `<span class="am-meta-item">FDV ${formatCompactNumber(fdv)}</span><span class="am-meta-sep">|</span>` : ""}
            <span class="am-zone ${zClass}">${zText}</span>
            <span class="am-meta-sep">|</span>
            <span class="am-meta-item">研究 ${researchStatusLabel(researchStatus)}</span>
            ${nextReview ? `<span class="am-meta-sep">|</span><span class="am-meta-item">复查 ${nextReview.slice(0, 10)}</span>` : ""}
          </div>
          <div class="asset-detail-inline"></div>
        </div>
      `;
    }).join("");
  } else {
    // Fallback: render from state objects (no portfolio-summary available)
    list.innerHTML = assetsArr.map(asset => {
      const pos = (state.positions || {})[asset.id];
      const report = reports[asset.id];
      const plan = (state.plans || {})[asset.id];
      const planStatus = plan?.status;
      const valn = (state.valuationModels || {})[asset.id];
      const fdv = valn?.currentMetrics?.fdv;
      const change = formatChangePct(pos);
      const cp = pos?.currentPrice;
      const researchStatus = report ? getResearchStatus(report) : "missing";
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
              <span class="am-sym">${asset.symbol}</span>
              ${asset.name ? `<span class="am-name">${asset.name}</span>` : ""}
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
            <span class="am-meta-item">均价 <strong>${pos?.averageCost ? formatUsd(pos.averageCost) : "--"}</strong></span>
            <span class="am-meta-sep">|</span>
            <span class="am-meta-item">总成本 <strong>${pos?.costBasisTotal ? formatUsd(pos.costBasisTotal) : "--"}</strong></span>
            <span class="am-meta-sep">|</span>
            <span class="am-meta-item">价值 <strong>${pos?.currentValue ? formatUsd(pos.currentValue) : "--"}</strong></span>
          </div>
          ${tiers ? renderTierRow(tiers) : ""}
          <div class="am-meta am-meta-secondary">
            ${fdv ? `<span class="am-meta-item">FDV ${formatCompactNumber(fdv)}</span><span class="am-meta-sep">|</span>` : ""}
            <span class="am-meta-item">研究 ${researchStatusLabel(researchStatus)}</span>
            ${plan?.nextReviewAt ? `<span class="am-meta-sep">|</span><span class="am-meta-item">复查 ${plan.nextReviewAt.slice(0, 10)}</span>` : ""}
          </div>
          <div class="asset-detail-inline"></div>
        </div>
      `;
    }).join("");
  }

  // Wire up click → inline detail expansion via /api/asset-context
  list.querySelectorAll(".asset-mini").forEach(card => {
    card.addEventListener("click", async (e) => {
      const symbol = card.dataset.symbol;
      if (!symbol) return;

      const inline = card.querySelector(".asset-detail-inline");
      if (!inline) return;

      // Toggle: if already open, close it
      if (card.classList.contains("expanded")) {
        card.classList.remove("expanded");
        inline.innerHTML = "";
        _expandedSymbol = null;
        _detailHTML = null;
        return;
      }

      // Close other expanded cards
      list.querySelectorAll(".asset-mini.expanded").forEach(c => {
        c.classList.remove("expanded");
        const otherInline = c.querySelector(".asset-detail-inline");
        if (otherInline) otherInline.innerHTML = "";
      });

      // Open this one
      card.classList.add("expanded");
      _expandedSymbol = symbol;
      inline.innerHTML = '<div class="muted" style="padding:10px 14px;text-align:center;font-size:12px;">加载中...</div>';

      try {
        const r = await fetch(`/api/asset-context?asset=${encodeURIComponent(symbol)}`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const ctx = await r.json();
        if (!ctx.ok) throw new Error("API error");
        const html = buildInlineDetail(ctx);
        inline.innerHTML = html;
        _detailHTML = html;
      } catch (err) {
        inline.innerHTML = `<div class="muted" style="padding:10px 14px;text-align:center;font-size:12px;">加载失败: ${err.message}</div>`;
        _detailHTML = null;
      }
    });
  });

  // Restore expanded state after re-render
  if (_listCollapsed) {
    list.classList.add("collapsed");
  }
  if (_expandedSymbol && _detailHTML) {
    const card = list.querySelector(`.asset-mini[data-symbol="${_expandedSymbol}"]`);
    if (card) {
      card.classList.add("expanded");
      const inline = card.querySelector(".asset-detail-inline");
      if (inline) inline.innerHTML = _detailHTML;
    }
  }
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

function buildInlineDetail(ctx) {
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

  return `
    <div class="dp-section">
      <div class="dp-section-title">基本信息</div>
      <div class="dp-row"><span class="dp-label">类型</span><span class="dp-value">${asset.assetType || "--"}${asset.chain ? ` / ${asset.chain}` : ""}</span></div>
      <div class="dp-row"><span class="dp-label">当前 FDV</span><span class="dp-value">${formatCompactNumber(fdv)}</span></div>
      <div class="dp-row"><span class="dp-label">估值区间</span><span class="dp-value ${zoneClass(zone)}">${zoneLabel(zone)}</span></div>
      ${pos ? `<div class="dp-row"><span class="dp-label">持仓</span><span class="dp-value">${pos.units ?? 0} 个 / 均价 ${formatUsd(pos.averageCost)} / 总成本 ${formatUsd(pos.costBasisTotal)} / 现价 ${formatUsd(pos.currentPrice)}</span></div>` : ""}
      ${(pos && pos.currentValue && pos.costBasisTotal) ? (() => {
        const pnlV = pos.currentValue - pos.costBasisTotal;
        const pnlP = pos.costBasisTotal > 0 ? (pnlV / pos.costBasisTotal * 100) : 0;
        return `<div class="dp-row"><span class="dp-label">浮动盈亏</span><span class="dp-value ${pnlV >= 0 ? 'up' : 'down'}">$${pnlV.toFixed(0)} (${pnlP >= 0 ? '+' : ''}${pnlP.toFixed(1)}%)</span></div>`;
      })() : ""}
      <div class="dp-row"><span class="dp-label">计划状态</span><span class="dp-value">${plan?.status || "无"}</span></div>
    </div>

    ${(mem.investmentGoal || mem.targetUnits != null || mem.originalThesis || mem.floorRule) ? `
    <div class="dp-section">
      <div class="dp-section-title">投资目标 (Plan XVI)</div>
      ${mem.investmentGoal ? `<div class="dp-row"><span class="dp-label">目标</span><span class="dp-value">${mem.investmentGoal}</span></div>` : ""}
      ${mem.targetUnits != null ? `<div class="dp-row"><span class="dp-label">目标数量</span><span class="dp-value">${mem.targetUnits} 个${mem.goalProgress ? ` (当前 ${mem.goalProgress.label})` : ""}</span></div>` : ""}
      ${mem.originalThesis ? `<div class="dp-row"><span class="dp-label">初始论题</span><span class="dp-value">${mem.originalThesis}</span></div>` : ""}
      ${mem.timeHorizon ? `<div class="dp-row"><span class="dp-label">时间跨度</span><span class="dp-value">${mem.timeHorizon}</span></div>` : ""}
      ${mem.floorRule ? `<div class="dp-row"><span class="dp-label">底仓规则</span><span class="dp-value">最低 ${mem.floorRule.minimumUnits ?? '--'} 个</span></div>` : ""}
    </div>` : ""}

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
}

function renderPlanBadge(status) {
  const labels = { draft: "Draft", active: "Active", needs_review: "Needs Review", archived: "Archived" };
  const cls = status || "draft";
  return `<span class="plan-badge ${cls}">${labels[status] || status}</span>`;
}

