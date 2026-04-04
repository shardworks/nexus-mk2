# URGENT: Unified Instrument Context for Cache Efficiency

**Status:** Blocked — commissioning paused until resolved
**Filed:** 2026-04-04
**Context:** Session 023683e5-bf03-4fe4-820c-fae9dd2fad7a (Coco + Sean cost investigation)

## Problem

Instruments are the largest single cost category (~$368 of ~$836 total in the last 60 hours). The root cause is **zero cache sharing** between instrument runs. Each commission currently triggers 3 instruments × 3 runs = 9 independent `claude --print` calls, each with a slightly different prompt. Every call pays full cache-write cost on ~120K tokens of context. No call benefits from any other call's cache.

The cache is prefix-based — two API calls sharing the same prompt prefix get cache hits. Our prompts currently differ from the very start (different system prompts per instrument), so there is zero prefix overlap.

## Key Finding

From our cost investigation and model comparison experiment:

- **Cache write:** $18.75/M tokens (Opus). Each instrument call writes ~120K tokens = ~$2.25.
- **Cache read:** $1.875/M tokens (10% of write). A cache hit on 120K tokens = ~$0.23.
- **Current cost per commission:** 9 calls × $2.25 = ~$20.25 in cache writes alone.
- **With cache sharing:** 1 write + 8 reads = $2.25 + 8×$0.23 = ~$4.05. **A 5x reduction.**
- Cache TTL is 1 hour (confirmed from actual run data: `ephemeral_1h_input_tokens`). Sequential calls within a commission easily fit.
- Switching to Sonnet was also tested: only 1.6x savings (not 5x as hoped), with worse reliability and higher variance. Cache unification is the bigger lever and stacks with any model choice.

## Design

### 1. Unified Context Preamble

Assemble ONE context block per commission containing the superset of all extractor outputs:

```
Commission Context:
  - DIFF (from diff.sh)
  - FULL_FILES (from full-files.sh)
  - CONTEXT_FILES (from context-files.sh)
  - FILE_TREE (from file-tree.sh)
  - SPEC (from spec.sh, if available)
  - API_SURFACE (from api-surface.sh, if available)
  - REFERENCED_FILES (from referenced-files.sh, if available)
```

This preamble is identical across all instruments for a given commission. It becomes the **cacheable prefix**.

### 2. Per-Instrument Rubric Suffix

Each instrument appends its specific instructions AFTER the shared preamble:

```
[...shared context preamble, ~120K tokens...]

---

## Scoring Instructions

You are evaluating this commission for **code quality** (spec-blind).
Rate each of the following dimensions on a 1-5 scale:
- test_quality: ...
- code_structure: ...
- error_handling: ...
- codebase_consistency: ...

Respond in YAML format: ...
```

The rubric is ~500 tokens. Because it comes after the shared prefix, it doesn't break cache alignment.

### 3. Sequential Execution

Run all calls for a commission **sequentially**, not in parallel:

1. blind-run-1 → **cache WRITE** on shared prefix ($2.25)
2. blind-run-2 → **cache READ** ($0.23)
3. blind-run-3 → cache read
4. aware-run-1 → cache read (same prefix!)
5. aware-run-2 → cache read
6. aware-run-3 → cache read
7. integration-run-1 → cache read
8. integration-run-2 → cache read
9. integration-run-3 → cache read

Wall-clock impact: individual runs take 10-50s (Opus). Sequential 9-run chain ≈ 2-4 minutes typical, well within 1-hour cache TTL. Worst case ~7 minutes, still safe.

### 4. System Prompt

Must also be identical across all calls. Move instrument-specific instructions entirely into the user message suffix. System prompt becomes a generic:

> "You are an expert code reviewer. You will be given the context of a code commission (spec, diff, source files) followed by specific scoring instructions. Evaluate carefully and respond in the requested format."

## Implementation Plan

1. **New "commission review" mode in the instrument runner** — orchestrates multiple instruments against a shared context for one commission. The existing single-instrument mode stays for backwards compat.

2. **Context assembler** — new module that runs the superset of all extractors and builds the shared preamble. Deduplicate: if blind and aware both run `diff.sh`, it runs once.

3. **Rubric templates** — each instrument defines a rubric template (scoring instructions + dimensions + output format) that gets appended as the suffix. These replace the current full prompt templates.

4. **Sequential executor** — runs calls one at a time within a commission, collecting results. Parallel across commissions is still fine (different contexts = no cache sharing anyway).

5. **Update `instrument-review.sh`** — switch to commission-review mode by default.

## Also Done This Session

- **Instrument runner now captures full JSON envelopes** from `claude --print --output-format json` — token usage, cost, session ID, duration per run.
- **Per-run transcript files** saved to `instruments/<name>/runs/run-N.json` for forensic analysis.
- **Cost summary** in `result.yaml` — aggregate cost across runs.
- **Sonnet instrument versions** created (v2-sonnet, v1-sonnet) — usable for future comparison or cost-sensitive runs.
- **Model comparison data** in `experiments/data/model-comparison/` — full results for 3 commissions × 3 instruments × 2 models.

## Files Changed (uncommitted)

- `packages/instruments/src/execute.ts` — JSON output, usage extraction
- `packages/instruments/src/artifact.ts` — run transcripts, cost aggregation
- `packages/instruments/src/types.ts` — RunUsage, AggregateCost types
- `packages/instruments/src/cli.ts` — plumbing for cost data + transcripts
- `experiments/instruments/*/v2-sonnet/` — sonnet instrument versions
- `experiments/instruments/codebase-integration-scorer/v1-sonnet/` — sonnet version
- `experiments/data/model-comparison/` — comparison run artifacts
- `bin/sonnet-comparison.sh` — comparison runner script
