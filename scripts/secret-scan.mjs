#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { basename } from "node:path";

const mode = process.argv.includes("--all") ? "all" : "staged";

const secretPatterns = [
  {
    name: "API key token",
    regex: /\bsk-[A-Za-z0-9._-]{20,}\b/g,
  },
  {
    name: "OpenRouter key",
    regex: /\bsk-or-v1-[A-Za-z0-9._-]{20,}\b/g,
  },
  {
    name: "Bearer token",
    regex: /Authorization:\s*Bearer\s+[A-Za-z0-9._-]{20,}/gi,
  },
  {
    name: "Private key block",
    regex: /BEGIN (?:RSA|OPENSSH|EC|PRIVATE) KEY/g,
  },
  {
    name: "Mnemonic or seed phrase assignment",
    regex: /\b(?:mnemonic|seed phrase|seed_phrase)\s*[:=]\s*["']?[^"'\n]{12,}/gi,
  },
  {
    name: "Sensitive env assignment",
    regex: /^(?:export\s+)?(?:OPENAI_API_KEY|OPENROUTER_API_KEY|DEEPSEEK_API_KEY|LLM_API_KEY|BITGET_API_KEY|BITGET_SECRET|BITGET_PASSPHRASE)\s*=\s*(?!REPLACE_ME|YOUR_|<|$)[^\s#]+/g,
  },
];

const allowedTokenLines = [
  /REPLACE_ME/,
  /YOUR_/,
  /internal sensitive/i,
  /敏感信息扫描/,
  /具体规则不在公开文档中记录/,
];

const skippedExtensions = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".zip",
  ".pptx",
  ".pdf",
  ".lock",
]);

const skippedPathParts = new Set([
  ".git",
  "node_modules",
  ".vercel",
  "out",
]);

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" });
}

function listFiles() {
  const args =
    mode === "all"
      ? ["ls-files", "-co", "--exclude-standard"]
      : ["diff", "--cached", "--name-only", "--diff-filter=ACMR"];
  return git(args)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function shouldSkipPath(file) {
  if (file.split("/").some((part) => skippedPathParts.has(part))) {
    return true;
  }
  const lower = file.toLowerCase();
  for (const ext of skippedExtensions) {
    if (lower.endsWith(ext)) return true;
  }
  return false;
}

function readStagedFile(file) {
  try {
    return execFileSync("git", ["show", `:${file}`], {
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return "";
  }
}

function readWorkingFile(file) {
  try {
    if (!existsSync(file) || !statSync(file).isFile()) return "";
    return readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

function mask(value) {
  return value.replace(/\bsk-[A-Za-z0-9._-]{8,}\b/g, (match) => {
    return `${match.slice(0, 5)}...${match.slice(-4)}`;
  });
}

const hits = [];

for (const file of listFiles()) {
  if (shouldSkipPath(file)) continue;

  const text = mode === "all" ? readWorkingFile(file) : readStagedFile(file);
  if (!text) continue;

  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    if (allowedTokenLines.some((pattern) => pattern.test(line))) return;

    for (const pattern of secretPatterns) {
      pattern.regex.lastIndex = 0;
      if (pattern.regex.test(line)) {
        hits.push({
          file,
          line: index + 1,
          type: pattern.name,
          text: mask(line.trim()).slice(0, 240),
        });
      }
    }
  });
}

if (hits.length > 0) {
  console.error(`Secret scan failed (${mode}). Remove or rotate these values before committing:`);
  for (const hit of hits) {
    console.error(`- ${hit.file}:${hit.line} [${hit.type}] ${hit.text}`);
  }
  process.exit(1);
}

console.log(`Secret scan passed (${mode}).`);
