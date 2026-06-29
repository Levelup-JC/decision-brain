import { readFileSync, writeFileSync } from "node:fs";
import { join, basename, extname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const uiDir = join(__dirname, "..", "src", "ui");
const outFile = join(uiDir, "static-assets.mjs");

const textFiles = [
  "login.html",
  "dashboard.html",
  "utils.js",
  "mock-data.js",
  "chat.js",
  "committee.js",
  "portfolio.js",
  "charts.js",
  "dashboard.js",
  "demo-state.json",
];

const imageFiles = [
  "decision-brain-logo.png",
  "levelup-logo-pill.png",
];

const parts = [];

// Text files — inline as template literals
for (const name of textFiles) {
  const raw = readFileSync(join(uiDir, name), "utf8");
  const escaped = raw
    .replace(/\\/g, "\\\\")
    .replace(/`/g, "\\`")
    .replace(/\$/g, "\\$");
  const key = name.replace(/[.-]/g, "_").toUpperCase();
  parts.push(`export const ${key} = \`${escaped}\`;`);
  console.log(`  ${name}: ${raw.length} chars -> export ${key}`);
}

// Binary files — base64
for (const name of imageFiles) {
  const raw = readFileSync(join(uiDir, name));
  const b64 = raw.toString("base64");
  const key = name.replace(/[.-]/g, "_").toUpperCase();
  parts.push(`export const ${key} = "${b64}";`);
  console.log(`  ${name}: ${raw.length} bytes -> base64 export ${key}`);
}

// Asset lookup maps
parts.push(`
export const HTML_MAP = {
  "login.html": LOGIN_HTML,
  "dashboard.html": DASHBOARD_HTML,
};

export const JS_MAP = {
  "utils.js": UTILS_JS,
  "mock-data.js": MOCK_DATA_JS,
  "chat.js": CHAT_JS,
  "committee.js": COMMITTEE_JS,
  "portfolio.js": PORTFOLIO_JS,
  "charts.js": CHARTS_JS,
  "dashboard.js": DASHBOARD_JS,
};

export const JSON_MAP = {
  "demo-state.json": DEMO_STATE_JSON,
};

export const IMAGE_MAP = {
  "decision-brain-logo.png": DECISION_BRAIN_LOGO_PNG,
  "levelup-logo-pill.png": LEVELUP_LOGO_PILL_PNG,
};
`);

writeFileSync(outFile, parts.join("\n\n"), "utf8");
console.log(`\nWrote ${outFile} (${parts.length} exports)`);
