thread_id: 019eb5fe-da31-7ba1-ab21-18283375f464
updated_at: 2026-06-17T11:10:43+00:00
rollout_path: /Users/jasoncong/.codex/sessions/2026/06/11/rollout-2026-06-11T17-23-58-019eb5fe-da31-7ba1-ab21-18283375f464.jsonl
cwd: /Users/jasoncong/Documents/New project
git_branch: main

# Refined a Bitget-hackathon Decision Brain into a Chinese, P0-first PRD and then implemented/verified a memory-first workflow with clean BTW demos.

Rollout context: The user first asked for feasibility/optimization feedback on an investment-discipline plan, then repeatedly steered the idea toward a Decision Brain product that should be agent-pluggable, research-first, valuation-first, and confirmation-before-execution. Later turns shifted from concept discussion into PRD writing and code refinement in `/Users/jasoncong/Documents/New project/decision-brain`, including real HTTP/demo verification.

## Task 1: PRD rewrite and MVP scope clarification

Outcome: success

Preference signals:

- The user objected that the PRD was "太乱了，太长了" and asked that the "具体的功能点详细的凝练的写在一开始" -> future PRDs should lead with the confirmed MVP functions and keep the structure short and readable.
- The user explicitly asked for the PRD to be written in Chinese, which suggests Chinese is preferred for project docs and execution notes in this thread.
- The user repeatedly emphasized that the plan should be confirmed very clearly before running the project, which strongly suggests a confirm-plan-before-execution default.
- The user kept steering the concept toward comparables and valuation before adding or selling, suggesting the product should default to research-first, valuation-second, execution-third.
- The user said “你的仓位完全可以让他给你记录嘛…交易只是最次末的一端” -> keep Decision Brain centered on memory, thesis, plan, and discussion layers rather than treating execution as the core product.

Key steps:

- Rewrote the PRD in Chinese and compressed it into a P0-first structure.
- Moved the core MVP functions to the top: asset identity, position memory, project scouting, comparable valuation, plan generation, plan confirmation, event tracking, add/sell advice, final recommendation, and decision trace.
- Made the plan confirmation gate explicit: the plan stays `draft` until user confirmation, then becomes `active`.
- Added a clear “no auto trading / no private keys / no custody” boundary.
- Refined the workflow so the system first researches the project, then finds comparable projects, then estimates valuation, then proposes the plan.

Failures and how to do differently:

- The first version was too sprawling and too much like an implementation brainstorm. Future PRDs should be much shorter and should separate confirmed MVP scope from roadmap ideas.
- The initial structure overemphasized reminders and generic risk gating. The better order is research -> comparable valuation -> draft plan -> user confirmation -> monitoring.

Reusable knowledge:

- The user wants the product to be an “Investment Brain / Decision Memory Layer” rather than a trade execution assistant.
- The PRD should present the agent workflow as: user intent -> research -> comparable valuation -> draft plan -> confirmation -> ongoing monitoring -> final recommendation.
- The product should remain local-first and planning-focused in MVP.

References:

- File: `decision-brain/PRD.md`
- Key phrasing in the final PRD: “one-sentence investment planning layer for trading agents,” “plan is draft until the user confirms it,” and “does not execute trades / does not manage private keys.”

## Task 2: Implementing memory-first valuation workflow and clean BTW demo

Outcome: success

Preference signals:

- The user said event entry should be done by the agent: “事件我没法去录入，你要去找信息员,” which indicates they want agent-driven monitoring/research rather than manual event maintenance.
- The user wanted the system to manage a position after one sentence and to keep the execution layer secondary, which reinforces a memory-first, automation-assisted workflow.
- The user repeatedly asked to continue the implementation in small bursts, implying they prefer incremental progress with validation rather than a single large speculative rewrite.

Key steps:

- Implemented/adjusted Bitget market-data enrichment in the Decision Brain implementation so asset identity and market facts flow into the main workflow.
- Added `resolveAssetIdentity` / enrichment plumbing so symbols like `BTW` are no longer treated as unmanaged/unclassified by default.
- Drove the end-to-end demo via a local HTTP server at `127.0.0.1:4177`.
- Verified the project’s test suite remained green at `30/30`.
- Used a clean isolated data directory for the demo to avoid stale state contamination.
- Verified that `evaluate-candidate(BTW)` requires confirmation when no prior holding history exists, which is the intended memory-first behavior.
- Verified that `manage-position(BTW, 500, avg cost 1, portfolio 10000)` now returns real market data and creates a draft plan.

Failures and how to do differently:

- The first demo run was polluted by previous state and changed defaults; a clean isolated state directory was required to get a trustworthy verification.
- The initial recommendation phrasing sometimes blurred facts and thesis. The later cleanup separated factual inputs from thesis and research gaps.
- One demo test failed because the default demo asset changed from SOL to BTW; the test and demo expectation had to be aligned.

Reusable knowledge:

- Clean demo execution should use an isolated `DECISION_BRAIN_DATA_DIR` to prevent old state from leaking into `/api/state`.
- The local server listens on `http://127.0.0.1:4177`.
- The reliable verification chain for this repo is: `npm test` -> clean HTTP demo -> endpoint inspection.
- The project now treats `BTW` as a concrete on-chain token on Solana with market data available, rather than an unknown asset.

References:

- `npm test` passed 30/30 after the final changes.
- Clean demo responses showed `BTW` as a Solana on-chain token with:
  - `marketCap: 68,002,149`
  - `fdv: 68,002,149`
  - `liquidityUsd: 67,002,118.91`
  - `dailyVolumeUsd: 3.99`
- The clean demo also showed the intended confirmation behavior when no prior holding history exists.

## Task 3: Making research gaps explicit in the product model

Outcome: success

Preference signals:

- The user repeatedly asked that after buying a position, the system should find comparable projects and expected valuation first, then design the sell/add plan, and only then continue execution. That strongly supports a valuation-first gate.
- The user emphasized that the core value is the research/decision layer rather than the UI or record-keeping surface, so missing thesis inputs should be surfaced explicitly.

Key steps:

- Added structured research draft fields to the research model: `comparablesDraft`, `listingPathDraft`, and `fundingUnlockDraft`.
- Propagated those draft fields into `decisionPack` and `investmentMemo`, so the recommendation layer can explain exactly what is missing.
- Updated the recommendation layer to mention these specific gaps in add/sell rationale instead of only saying “research thin.”
- Updated the dashboard so it surfaces asset identity, current FDV, current market cap, and the three research draft states more clearly.

Failures and how to do differently:

- A generic “research thin” state was too vague for the workflow the user wants. The better default is to name the exact missing research dimension.
- Market facts alone are not enough. The next agent should always separate facts, thesis, and research gaps in the response model.

Reusable knowledge:

- A useful internal split for this product is: `factual_inputs` vs `research_gaps` vs `structured_research`.
- The product now better supports the user’s desired flow: after a buy/position event, the system can say exactly whether it still needs comparables, listing-path, or funding/unlock research before the plan should be considered robust.

References:

- New fields added and verified in live responses: `comparablesDraft`, `listingPathDraft`, `fundingUnlockDraft`.
- Relevant files: `src/services/research-service.mjs`, `src/services/candidate-service.mjs`, `src/services/recommendation-service.mjs`, `src/ui/dashboard.js`.
- Clean BTW manage-position response now includes the three structured research drafts, and the memo includes `research_gaps` and `structured_research`.

