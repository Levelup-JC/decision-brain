import { mergeDecisionBrainIntoConfig } from "./mcp-config-utils.mjs";

const payload = mergeDecisionBrainIntoConfig({});

process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
