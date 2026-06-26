#!/usr/bin/env node
// BSTC Runner — reads BSTC corpus, executes all test cases against the orchestrator,
// collects timing + results, and writes a JSON report.
//
// Usage:
//   node tests/bstc-runner.mjs                    # run all tests (process-internal)
//   node tests/bstc-runner.mjs --filter bstc-021  # run single test
//   node tests/bstc-runner.mjs --http=http://localhost:4177   # HTTP mode (local)
//   node tests/bstc-runner.mjs --http=https://decision-brain-gray.vercel.app  # HTTP mode (public)
//   npm run bstc                                  # via package.json script

import { runOrchestrator } from "../src/chat-orchestrator.mjs";
import { BSTC } from "./bstc-corpus.mjs";
import { writeFile, mkdir } from "node:fs/promises";
import { execSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");
const OUTPUT_DIR = join(PROJECT_ROOT, "data");

const HTTP_FETCH_TIMEOUT_MS = 30_000;
const MAX_RECENT_TURNS = 10;

function getGitHash() {
  try {
    return execSync("git rev-parse --short HEAD", { cwd: PROJECT_ROOT, encoding: "utf8" }).trim();
  } catch {
    return "no-git";
  }
}

function getGitBranch() {
  try {
    return execSync("git rev-parse --abbrev-ref HEAD", { cwd: PROJECT_ROOT, encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

function getTimestamp() {
  return new Date().toISOString();
}

async function runSingleCase(testCase) {
  const results = [];
  const turns = testCase.inputs;
  let lastAsset = null;
  let lastIntent = null;

  for (let i = 0; i < turns.length; i++) {
    const input = turns[i];
    const turnContext = {
      lastAsset,
      lastIntent,
      ...(input.context || {}),
    };

    const t0 = Date.now();
    let result;
    try {
      result = await runOrchestrator(input.message, input.sessionId, turnContext);
    } catch (err) {
      result = { ok: false, error: err.message, sessionId: input.sessionId };
    }
    const tookMs = Date.now() - t0;

    result._timing = { start: t0, end: Date.now(), tookMs };
    result._turn = i;
    result._message = input.message;

    // Track lastAsset/lastIntent for multi-turn propagation
    if (result.assetQuery) lastAsset = result.assetQuery;
    if (result.intent) lastIntent = result.intent;

    results.push(result);
  }

  return results;
}

// ── HTTP-mode helpers ──────────────────────────────────────────────────

function parseHttpFlag(argv) {
  const arg = argv.find((a) => a.startsWith("--http="));
  if (!arg) return null;
  const url = arg.split("=")[1];
  try {
    new URL(url);
    return url.replace(/\/$/, "");
  } catch {
    console.error(`Invalid --http URL: "${url}"`);
    process.exit(1);
  }
}

async function fetchChat(httpBase, message, sessionId, context) {
  const body = {
    message,
    sessionId,
    context: {
      lastAsset: context.lastAsset || null,
      lastIntent: context.lastIntent || null,
      lastPrice: context.lastPrice || null,
      recentTurns: (context.recentTurns || []).slice(-MAX_RECENT_TURNS),
    },
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HTTP_FETCH_TIMEOUT_MS);

  let resp;
  try {
    resp = await fetch(`${httpBase}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!resp.ok) {
    const errorText = await resp.text().catch(() => "unknown");
    throw new Error(`HTTP ${resp.status}: ${errorText.slice(0, 200)}`);
  }

  return resp.json();
}

async function runSingleCaseHttp(testCase, httpBase) {
  const results = [];
  const turns = testCase.inputs;
  const sessionContext = {
    lastAsset: null,
    lastIntent: null,
    lastPrice: null,
    recentTurns: [],
  };

  for (let i = 0; i < turns.length; i++) {
    const input = turns[i];

    // Merge per-input context overrides
    if (input.context) {
      Object.assign(sessionContext, input.context);
    }

    const t0 = Date.now();
    let result;
    try {
      result = await fetchChat(httpBase, input.message, input.sessionId, sessionContext);
      if (result.ok === undefined) result.ok = true;
    } catch (err) {
      result = { ok: false, error: err.message, sessionId: input.sessionId };
    }
    const tookMs = Date.now() - t0;

    result._timing = { start: t0, end: Date.now(), tookMs };
    result._turn = i;
    result._message = input.message;

    // Track context for next turn (emulate dashboard.js context propagation)
    if (result.assetQuery) sessionContext.lastAsset = result.assetQuery;
    if (result.intent) sessionContext.lastIntent = result.intent;
    if (result.reply) {
      sessionContext.recentTurns.push({
        message: input.message,
        reply: typeof result.reply === "string" ? result.reply.slice(0, 200) : "",
      });
    }

    results.push(result);
  }

  return results;
}

async function main() {
  const filter = process.argv.find((a) => a.startsWith("--filter="));
  const filterId = filter ? filter.split("=")[1] : null;
  const httpBase = parseHttpFlag(process.argv);

  const cases = filterId
    ? BSTC.filter((tc) => tc.id === filterId)
    : BSTC;

  if (cases.length === 0) {
    console.error(`No test cases found${filterId ? ` for filter "${filterId}"` : ""}`);
    process.exit(1);
  }

  const gitHash = getGitHash();
  const gitBranch = getGitBranch();
  const startedAt = getTimestamp();

  const mode = httpBase ? `HTTP → ${httpBase}` : "process-internal";
  console.log(`BSTC Runner — ${cases.length} test case(s)  [${mode}]`);
  console.log(`Commit: ${gitHash}  Branch: ${gitBranch}`);
  console.log("");

  const report = {
    meta: {
      version: httpBase ? "VII-1.0" : "VI-1.0",
      mode: httpBase ? "http" : "process",
      http_base: httpBase || null,
      commit_hash: gitHash,
      branch: gitBranch,
      started_at: startedAt,
      total_cases: cases.length,
    },
    results: [],
    summary: {
      pass: 0,
      fail: 0,
      total_assertions: 0,
      passed_assertions: 0,
    },
  };

  let caseIndex = 0;
  for (const testCase of cases) {
    caseIndex++;
    const caseStart = Date.now();

    let runResults;
    let error = null;
    try {
      runResults = httpBase
        ? await runSingleCaseHttp(testCase, httpBase)
        : await runSingleCase(testCase);
    } catch (err) {
      error = err.message;
      runResults = [];
    }

    // For single-turn cases, assert_fn receives the single result object.
    // For multi-turn cases, assert_fn receives the array of results.
    let passed = false;
    let assertError = null;
    try {
      if (testCase.inputs.length === 1) {
        passed = testCase.assert_fn(runResults[0]);
      } else {
        passed = testCase.assert_fn(runResults);
      }
    } catch (err) {
      assertError = err.message;
      passed = false;
    }
    report.summary.total_assertions++;

    const tookMs = Date.now() - caseStart;
    const turns = runResults.map((r) => ({
      turn: r._turn,
      message: r._message,
      intent: r.intent,
      assetQuery: r.assetQuery,
      replyPreview: (r.reply || r.error || "").slice(0, 120),
      tookMs: r._timing?.tookMs,
      ok: r.ok,
      error: r.error || null,
    }));

    const caseReport = {
      id: testCase.id,
      category: testCase.category,
      description: testCase.description,
      passed,
      error: error || assertError || null,
      tookMs,
      turns,
    };

    report.results.push(caseReport);

    if (passed) {
      report.summary.pass++;
      report.summary.passed_assertions++;
      console.log(`  PASS  [${caseIndex}/${cases.length}] ${testCase.id}  (${tookMs}ms)  ${testCase.description}`);
    } else {
      report.summary.fail++;
      console.log(`  FAIL  [${caseIndex}/${cases.length}] ${testCase.id}  (${tookMs}ms)  ${testCase.description}`);
      if (assertError) console.log(`        Assert error: ${assertError}`);
    }
  }

  report.summary.completed_at = getTimestamp();
  report.summary.pass_rate = report.summary.total_assertions > 0
    ? (report.summary.pass / report.summary.total_assertions)
    : 0;
  report.summary.avg_turn_ms = report.results.length > 0
    ? Math.round(report.results.reduce((s, r) => s + r.tookMs, 0) / report.results.length)
    : 0;

  // Write report
  await mkdir(OUTPUT_DIR, { recursive: true });
  const reportFilename = `bstc-report-${gitHash}.json`;
  const reportPath = join(OUTPUT_DIR, reportFilename);
  const reportJSON = JSON.stringify(report, null, 2);
  await writeFile(reportPath, reportJSON, "utf8");

  // Verify file is non-empty
  const stat = await import("node:fs/promises").then((fs) => fs.stat(reportPath));
  if (stat.size === 0) {
    console.error("FATAL: Report file is 0 bytes — write failed!");
    process.exit(1);
  }

  // Also write baseline if this is a full run
  if (!filterId) {
    const baselineName = httpBase ? "bstc-baseline-VII.json" : "bstc-baseline-VI.json";
    const baselinePath = join(OUTPUT_DIR, baselineName);
    await writeFile(baselinePath, reportJSON, "utf8");
    console.log(`\nBaseline saved: ${baselinePath}`);
  }

  console.log(`\nReport: ${reportPath}`);
  console.log(`Summary: ${report.summary.pass}/${report.summary.total_assertions} passed (${(report.summary.pass_rate * 100).toFixed(1)}%)`);
  console.log(`Avg case time: ${report.summary.avg_turn_ms}ms`);

  // Verify file size
  const reportStat = await import("node:fs/promises").then((fs) => fs.stat(reportPath));
  console.log(`Report size: ${reportStat.size} bytes`);

  // Exit with appropriate code
  const threshold = Math.ceil(report.summary.total_assertions * 28 / 30);
  process.exit(report.summary.pass >= threshold ? 0 : 1);
}

main().catch((err) => {
  console.error("BSTC runner fatal error:", err);
  process.exit(2);
});
