import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { mergeDecisionBrainIntoConfig } from "./mcp-config-utils.mjs";

const targetPath = process.argv[2];

if (!targetPath) {
  process.stderr.write("Usage: node src/scripts/install-lobster-config.mjs /absolute/path/to/mcp_config.json\n");
  process.exit(1);
}

let existing = {};

try {
  const raw = await readFile(targetPath, "utf8");
  existing = JSON.parse(raw);
} catch {
  existing = {};
}

const next = mergeDecisionBrainIntoConfig(existing);

await mkdir(dirname(targetPath), { recursive: true });
await writeFile(targetPath, `${JSON.stringify(next, null, 2)}\n`);

process.stdout.write(`Installed Decision Brain MCP config into ${targetPath}\n`);
