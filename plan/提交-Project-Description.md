# Bitget Hackathon S1 — Project Description (Submission, copy-paste)

Track: Trading Agent
Project: Decision Brain
Last updated: 2026-06-26

> 用法：直接复制下面四节到提交表单。Section 1/2 评委最看重，已写满；Section 3 选填。
> 想更短就删每节的最后一两句。英文为主，方便评委。

---

## 1. Idea (Required, Highest Weight)

**The problem.** Today's trading agents are amnesiac. Every time you ask "should I add to X?", the agent reasons from a blank chat context — it forgets your cost basis, your past decisions, why you bought, and what you already researched. It also tends to react to price alone. We didn't want another charting panel or an auto-trader. We built a **decision brain** that an agent loads before it advises you.

**Core logic — an AI Investment Committee.** Decision Brain does not trade. It runs a stable decision loop: *look up memory → fan out research to specialist agents → value against comparables → draft a plan → confirm with the user → monitor once a day → give a final add/sell recommendation.* A "Chief" agent receives the user's intent and fans it out to specialist agents that work in parallel — Memory, Macro, On-chain Intel, Sentiment, Technical, News, and Valuation — then synthesizes their opinions into one recommendation.

**What signals, and why it works.** The five analyst agents are powered by Bitget's perception Skills (Skill Hub via MCP), pulling real data: macro & cross-asset (Fed, BTC vs DXY/Nasdaq/gold), on-chain & market intel (TVL, liquidity, market cap, chain identity), sentiment (Fear & Greed, long/short ratio, funding), 23 technical indicators, and a 44-source news feed. The edge is not a magic signal — it's **disciplined synthesis with memory**: a recommendation must clear valuation, events, thesis state, sector exposure, and a position floor rule before it fires.

**How risk is managed.** (1) **Floor rule** — protect a base position out of the historical peak, never round-trip a winner to zero. (2) **Valuation zones** — current FDV is placed in conservative/base/aggressive bands; advice tightens in the aggressive zone. (3) **Allocation caps by risk class** and **sector-exposure warnings**. (4) **Price curve is only one input, never the only reason.** (5) **Honesty guard** — fields the data can't prove (funding rounds, unlock schedules, subjective thesis) are explicitly marked "to be filled," never fabricated. This honesty is itself a risk control: the agent says "I don't know" instead of inventing conviction.

---

## 2. Progress

**Key challenge & how we solved it.** Our hardest problem was keeping the agent **honest and grounded in real data** while staying offline-testable. We separated *decision logic* (pure, synchronous, unit-tested) from *data acquisition* (async MCP calls injected as parameters). This let us wire real Bitget market data into the main `evaluate_candidate` path — resolving an asset's identity, chain, price, market cap, and liquidity from live MCP — while keeping all 30 tests green via an offline switch. A second challenge was making multi-agent work *visible*: the five Skills already run in parallel (`Promise.allSettled`), so we surface them as a live "committee war room" where each agent's opinion bubbles up independently as it returns.

**Completed.** Asset-memory layer (first-buy / add / re-entry / resume-watch detection); structured research layer (thesis, catalysts, risks, comparables, listing-path, funding/unlock drafts, with usable/thin/blocked readiness); valuation + add/sell recommendation engine; daily monitoring with a 24h cadence; dual HTTP + MCP server entry points; real Bitget Skill integration via market-data MCP; 30/30 tests passing.

**In progress / next steps.** Upgrading the read-only dashboard into the interactive multi-agent committee UI (Bitget-green console, chat + live asset board), a chat orchestration endpoint with an LLM-with-rule fallback, and public deployment. Still missing: fuller fundamental research auto-fill (funding/unlock/chip distribution) and stronger ambiguity resolution for name-colliding tickers.

**Stack.** Pure Node.js (zero-dependency core), HTTP + MCP (JSON-RPC stdio) dual servers, file/KV pluggable storage. LLM via OpenAI-compatible API (**DeepSeek: `api.deepseek.com/v1`, `deepseek-chat`**). **Bitget tools used: Skill Hub (all 5 perception Skills — macro-analyst, market-intel, news-briefing, sentiment-analyst, technical-analysis) + MCP Server.** We deliberately do **not** use the 58 trading Tool APIs or hold private keys — Decision Brain is a decision layer, not an executor.

---

## 3. AI Trading Thoughts (Optional)

Using Bitget's Skill Hub through MCP was the fastest part of the build — the five perception Skills map cleanly onto "analyst agents," and the public market-data MCP (no API key for read access) let us ship real signals without a credentials gate. Our main suggestion: a per-asset enrichment endpoint (identity → chain → price → liquidity in one call) would save every agent builder the same plumbing we wrote. On the future of Agentic Trading: we think the winning pattern is not a single autonomous trader but a **committee of specialist agents with shared long-term memory** — the human stays in the loop on intent and confirmation, while agents handle perception, valuation, and disciplined monitoring. Memory and honesty ("say I don't know") matter more than raw signal count.

---

## 4. Links (fill before submit)

- Demo URL: https://decision-brain-gray.vercel.app (Vercel; fallback ngrok)
- GitHub / README: https://github.com/Levelup-JC/decision-brain
- Demo video (≤3 min, optional): 待 E2E 后回填
- X post (#BitgetHackathon, optional): __________
