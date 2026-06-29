import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const SURF_BIN = process.env.SURF_BIN || "surf";
const SURF_TIMEOUT_MS = 12000;

// In-memory cache with TTL to stay under the 30 free calls/day limit
const dossierCache = new Map();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

function getCached(key) {
  const entry = dossierCache.get(key);
  if (entry && Date.now() - entry.ts < CACHE_TTL_MS) {
    return entry.data;
  }
  dossierCache.delete(key);
  return null;
}

function setCache(key, data) {
  dossierCache.set(key, { data, ts: Date.now() });
}

async function runSurf(args) {
  try {
    const { stdout } = await execFileAsync(SURF_BIN, args, {
      timeout: SURF_TIMEOUT_MS,
      maxBuffer: 1024 * 1024,
      env: { ...process.env, HOME: process.env.HOME },
    });
    return stdout.trim();
  } catch {
    return null;
  }
}

async function searchProject(symbol) {
  const raw = await runSurf(["search-project", "--q", symbol, "--json"]);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    // Surf API wraps results in a "data" array
    const items = parsed?.data || (Array.isArray(parsed) ? parsed : []);
    if (items.length > 0) return items[0];
  } catch {
    // JSON parse failed
  }
  return null;
}

async function getProjectDetail(projectName) {
  const raw = await runSurf(["project-detail", "--q", projectName, "--json"]);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    // Surf API wraps detail in a "data" object
    return parsed?.data || parsed;
  } catch {
    return null;
  }
}

function buildMockSurfDossier(asset) {
  const dossiers = {
    SOL: {
      projectSummary: "Solana 作为成熟生态资产，重点不是项目真假，而是生态活跃、资金轮动和估值区间。",
      fundingBackground: "成熟生态，不再以传统融资轮次作为核心估值锚。",
      exchangePath: "已是主流交易所资产，更应关注增量机构入口和叙事变化。",
      liquidityReview: "高流动性，适合用估值和阶段管理仓位。"
    },
    ENA: {
      projectSummary: "Ethena 属于高关注度收益叙事资产，核心看产品采用和叙事持续性。",
      fundingBackground: "偏强的机构背景会提升市场关注，但不能替代基本面跟踪。",
      exchangePath: "已具备主流流动性，后续更多看产品数据和市场接受度。",
      liquidityReview: "流动性较强，但叙事波动会放大价格波动。"
    },
    ZORA: {
      projectSummary: "Zora 更像注意力与分发资产，项目质地要结合社区、分发和流动性一起看。",
      fundingBackground: "有一定资源与分发想象空间，但最终要回到真实使用与流动性。",
      exchangePath: "潜在上所和新增分发渠道会明显改变估值上限。",
      liquidityReview: "流动性和交易所路径都是估值中枢的重要变量。"
    }
  };

  return dossiers[asset.symbol] || {
    projectSummary: `${asset.symbol} Surf 数据暂未获取，使用 fallback 摘要。`,
    fundingBackground: "待补充（Surf 查询未命中或额度已满）",
    exchangePath: "待补充",
    liquidityReview: "待补充"
  };
}

function formatFunding(rounds) {
  if (!rounds || rounds.length === 0) return "融资信息未公开";
  const total = rounds.reduce((sum, r) => sum + (r.amount || 0), 0);
  const totalStr = total > 1e8
    ? `$${(total / 1e9).toFixed(2)}B`
    : `$${(total / 1e6).toFixed(1)}M`;
  const dates = rounds.map(r => r.date?.slice(0, 4) || "未知").join("、");
  return `总融资 ${totalStr}，轮次年份：${dates}`;
}

function buildDossierFromSurf(project, detail, asset) {
  const name = project?.name || asset.name || asset.symbol;
  const description = detail?.description || project?.description || "";
  const fundingRounds = detail?.funding?.rounds || project?.funding?.rounds || [];
  const fundingSummary = formatFunding(fundingRounds);

  // Collect exchanges from contracts and listed exchanges
  const contracts = detail?.contracts?.contracts || [];
  const chains = contracts.map(c => c.chain).filter(Boolean);
  const exchangeSummary = chains.length > 0
    ? `已部署链：${[...new Set(chains)].join("、")}`
    : "交易所信息待确认";

  return {
    projectSummary: `${name}：${description || "项目详情待补充"}。`,
    fundingBackground: fundingSummary,
    exchangePath: exchangeSummary,
    liquidityReview: "流动性数据由 market-data MCP 补充",
  };
}

export function createSurfAdapter() {
  return {
    name: "surf-adapter",
    async buildProjectDossier(asset) {
      const cacheKey = (asset.symbol || asset.name || "").toUpperCase();
      const cached = getCached(cacheKey);
      if (cached) return cached;

      try {
        const project = await searchProject(asset.symbol || asset.name);
        if (project) {
          const projectName = project.name || asset.name || asset.symbol;
          const detail = await getProjectDetail(projectName);
          const dossier = buildDossierFromSurf(project, detail, asset);
          setCache(cacheKey, dossier);
          return dossier;
        }
      } catch {
        // Surf CLI unavailable; fall through to mock
      }

      const mockDossier = buildMockSurfDossier(asset);
      setCache(cacheKey, mockDossier);
      return mockDossier;
    }
  };
}
