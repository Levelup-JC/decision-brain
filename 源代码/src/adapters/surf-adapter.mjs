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
    projectSummary: `${asset.symbol} 当前使用 mock Surf dossier，需要后续接真实研究流程。`,
    fundingBackground: "待补充",
    exchangePath: "待补充",
    liquidityReview: "待补充"
  };
}

export function createSurfAdapter() {
  return {
    name: "surf-mock-adapter",
    buildProjectDossier(asset) {
      return buildMockSurfDossier(asset);
    }
  };
}
