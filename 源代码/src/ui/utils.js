export function formatCompactNumber(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number) || number <= 0) return "--";

  if (number >= 1_0000_0000_0000) {
    return `${(number / 1_0000_0000_0000).toFixed(number >= 10_0000_0000_0000 ? 0 : 1)}万亿`;
  }
  if (number >= 1_0000_0000) {
    return `${(number / 1_0000_0000).toFixed(number >= 1000_0000_0000 ? 0 : 1)}亿`;
  }
  if (number >= 1_0000) {
    return `${(number / 1_0000).toFixed(number >= 100_0000 ? 0 : 1)}万`;
  }
  return number.toLocaleString("zh-CN");
}

export function formatUsd(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n <= 0) return "--";
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

export function zoneLabel(zone) {
  const map = {
    below_conservative: "低于保守区",
    conservative: "保守区",
    base: "基准区",
    aggressive: "高估值区",
    between_base_and_aggressive: "基准区上方"
  };
  return map[zone] || zone || "--";
}

export function zoneClass(zone) {
  if (zone === "conservative" || zone === "below_conservative") return "zone-green";
  if (zone === "base" || zone === "between_base_and_aggressive") return "zone-yellow";
  if (zone === "aggressive") return "zone-red";
  return "";
}

export function elapsed(ms) {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function timeNow() {
  return new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
