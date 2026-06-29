#!/usr/bin/env node
// Plan XIII 负责人4 — Layout Acceptance Script
// Verifies: asset dashboard in center column, Agent war room in right column,
//   dispatch policy + log + trace in right, klineChart in center,
//   assetMiniList NOT in right column
//
// Usage:
//   node tests/plan13-layout-acceptance.mjs --http=http://localhost:4177

import { ProxyAgent, fetch as undiciFetch } from "undici";

const HTTP_FETCH_TIMEOUT_MS = 30_000;

function parseHttpFlag(argv) {
  const arg = argv.find((a) => a.startsWith("--http="));
  if (!arg) return null;
  const url = arg.split("=")[1];
  try { new URL(url); return url.replace(/\/$/, ""); } catch {
    console.error(`Invalid --http URL: "${url}"`);
    process.exit(1);
  }
}

function getFetchDispatcher() {
  const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.https_proxy || process.env.http_proxy;
  if (proxyUrl) {
    try {
      return {
        dispatcher: new ProxyAgent({ uri: proxyUrl, requestTls: { rejectUnauthorized: false }, connections: 8, pipelining: 1 }),
        fetcher: undiciFetch,
      };
    } catch { return undefined; }
  }
  return undefined;
}

async function fetchHtml(httpBase) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HTTP_FETCH_TIMEOUT_MS);
  const proxyConfig = getFetchDispatcher();
  const fetcher = proxyConfig?.fetcher || fetch;
  const resp = await fetcher(`${httpBase}/`, {
    signal: controller.signal,
    ...(proxyConfig?.dispatcher ? { dispatcher: proxyConfig.dispatcher } : {}),
  });
  clearTimeout(timer);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.text();
}

// Extract HTML section between two regex patterns (from startPattern match to endPattern match)
function extractBetween(html, startPattern, endPattern) {
  const startMatch = html.match(startPattern);
  if (!startMatch) return "";
  const startIdx = startMatch.index;
  const afterStart = html.slice(startIdx);
  const endMatch = afterStart.match(endPattern);
  if (!endMatch) return afterStart;
  return afterStart.slice(0, endMatch.index);
}

// Find the right column section precisely: from col-right opening div to its closing div
// We use a simpler approach: find each column by known class markers
function findCenterSection(html) {
  const centerStart = html.match(/<div\s+class="[^"]*\bcol-center\b[^"]*"/i);
  const rightStart = html.match(/<div\s+class="[^"]*\bcol-right\b[^"]*"/i);
  if (!centerStart) return "";
  const begin = centerStart.index;
  const end = rightStart ? rightStart.index : html.length;
  return html.slice(begin, end);
}

function findRightSection(html) {
  const rightStart = html.match(/<div\s+class="[^"]*\bcol-right\b[^"]*"/i);
  // Right column ends at </div> before <script> containing Brain Wireframe
  const scriptMarker = html.match(/<script>\s*\/\*\s+=+\s*\n\s+Brain Wireframe/i);
  if (!rightStart) return "";
  const begin = rightStart.index;
  // Walk back from script marker to find closing </div>
  const end = scriptMarker ? scriptMarker.index : html.length;
  // Find last </div> before the script marker
  const beforeScript = html.slice(begin, end);
  return beforeScript;
}

const TEST_CASES = [
  {
    id: "XIII-L01",
    description: "实时资产看板 header is in center column",
    check(html) {
      const section = findCenterSection(html);
      return {
        passed: section.includes("实时资产看板"),
        detail: section.includes("实时资产看板") ? "found in center column" : "NOT found in center column",
      };
    },
  },
  {
    id: "XIII-L02",
    description: "Agent 作战室 header is in right column",
    check(html) {
      const section = findRightSection(html);
      return {
        passed: section.includes("Agent 作战室"),
        detail: section.includes("Agent 作战室") ? "found in right column" : "NOT found in right column",
      };
    },
  },
  {
    id: "XIII-L03",
    description: "调度制度 section is in right column",
    check(html) {
      const section = findRightSection(html);
      return {
        passed: section.includes("调度制度"),
        detail: section.includes("调度制度") ? "found in right column" : "NOT found in right column",
      };
    },
  },
  {
    id: "XIII-L04",
    description: "Chief 调度日志 section is in right column",
    check(html) {
      const section = findRightSection(html);
      return {
        passed: section.includes("Chief 调度日志"),
        detail: section.includes("Chief 调度日志") ? "found in right column" : "NOT found in right column",
      };
    },
  },
  {
    id: "XIII-L05",
    description: "klineChartBox is in center column",
    check(html) {
      const section = findCenterSection(html);
      return {
        passed: section.includes('id="klineChartBox"'),
        detail: section.includes('id="klineChartBox"') ? "found in center column" : "NOT found in center column",
      };
    },
  },
  {
    id: "XIII-L06",
    description: "assetMiniList is NOT in right column",
    check(html) {
      const section = findRightSection(html);
      const found = section.includes('id="assetMiniList"');
      return {
        passed: !found,
        detail: found ? "INCORRECTLY found in right column" : "correctly absent from right column",
      };
    },
  },
  {
    id: "XIII-L07",
    description: "动态 Trace section is in right column",
    check(html) {
      const section = findRightSection(html);
      return {
        passed: section.includes("动态 Trace"),
        detail: section.includes("动态 Trace") ? "found in right column" : "NOT found in right column",
      };
    },
  },
  {
    id: "XIII-L08",
    description: "Bitget MCP Skills section is in right column",
    check(html) {
      const section = findRightSection(html);
      return {
        passed: section.includes("Bitget MCP Skills"),
        detail: section.includes("Bitget MCP Skills") ? "found in right column" : "NOT found in right column",
      };
    },
  },
  {
    id: "XIII-L09",
    description: "Dashboard serves valid HTML with 3-column layout",
    check(html) {
      const hasLeft = /col-left/.test(html);
      const hasCenter = /col-center/.test(html);
      const hasRight = /col-right/.test(html);
      return {
        passed: hasLeft && hasCenter && hasRight,
        detail: `left=${hasLeft}, center=${hasCenter}, right=${hasRight}`,
      };
    },
  },
  {
    id: "XIII-L10",
    description: "Agent cards exist in right column (agentGrid)",
    check(html) {
      const section = findRightSection(html);
      return {
        passed: section.includes('id="agentGrid"'),
        detail: section.includes('id="agentGrid"') ? "agentGrid found in right column" : "agentGrid NOT found in right column",
      };
    },
  },
];

async function main() {
  const httpBase = parseHttpFlag(process.argv);
  if (!httpBase) {
    console.error("ERROR: --http=<base_url> is required (e.g. --http=http://localhost:4177)");
    process.exit(1);
  }

  const verbose = process.argv.includes("--verbose");
  console.log(`Plan XIII Layout Acceptance  [HTTP → ${httpBase}]\n`);

  let html;
  try {
    html = await fetchHtml(httpBase);
    console.log(`  Dashboard HTML fetched: ${html.length} bytes\n`);
  } catch (err) {
    console.error(`  FATAL: Cannot fetch dashboard: ${err.message}`);
    console.error("  Make sure the server is running: npm start");
    process.exit(2);
  }

  let passed = 0;
  let failed = 0;

  for (const tc of TEST_CASES) {
    let result;
    try {
      result = tc.check(html);
    } catch (err) {
      result = { passed: false, detail: `error: ${err.message}` };
    }

    if (result.passed) passed++;
    else failed++;

    const icon = result.passed ? "PASS" : "FAIL";
    console.log(`  ${icon}  ${tc.id}  ${tc.description}`);
    if (verbose || !result.passed) {
      console.log(`        ${result.detail}`);
    }
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Results: ${passed}/${TEST_CASES.length} layout checks passed`);
  console.log(`Pass rate: ${(passed / TEST_CASES.length * 100).toFixed(1)}%`);

  if (failed > 0) {
    console.log(`\nFAIL: ${failed} layout check(s) failed.`);
  } else {
    console.log("\nPASS: All Plan XIII layout checks passed.");
  }

  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(2);
});
