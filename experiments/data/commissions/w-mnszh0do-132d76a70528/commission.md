_Imported from `.scratch/todo/URGENT-unified-instrument-context.md` (2026-04-10)._

## Goal

Cut instrument cost ~5x by unifying the prompt prefix across all instrument runs for a single commission, so the ~120K-token context block gets one cache write and eight cache reads instead of nine independent cache writes. Each instrument's specific rubric becomes a small suffix appended after the shared prefix; the system prompt is generic; runs go sequential within a commission so they fit inside the 1-hour cache TTL.

## Status

Active investigation. Not blocking — instruments are currently disabled to bypass the cost problem while we keep collecting context. Not resolved — the cache-unification design has not been implemented; we are still in "notice and gather" mode.

## Next Steps

When ready to act: build the commission-review mode in the instrument runner (orchestrating multiple instruments against shared context for one commission), with the existing single-instrument mode preserved for backwards compat. Start by extracting the context-assembler module that runs the superset of all extractors and dedupes overlapping ones (e.g. blind and aware both calling `diff.sh` → run once). Then convert each instrument from a full prompt template to a rubric template that gets appended as the suffix. Switch `instrument-review.sh` to the new mode by default.

## Context

**Problem.** Instruments are the largest single cost category (~$368 of ~$836 total in the last 60 hours). Root cause: zero cache sharing between runs. Each commission triggers 3 instruments × 3 runs = 9 independent `claude --print` calls, each with a slightly different prompt. Every call pays full cache-write cost on ~120K tokens. The cache is prefix-based — calls sharing a prompt prefix get cache hits — but our prompts differ from the very start (different system prompts per instrument), so there's zero overlap.

**Cost math** (Opus, from cost-investigation session 023683e5):

- Cache write: $18.75/M tokens. 120K tokens ≈ $2.25/call.
- Cache read: $1.875/M tokens (10% of write). 120K read ≈ $0.23/call.
- **Current per commission:** 9 × $2.25 = ~$20.25 in cache writes alone.
- **With cache sharing:** 1 write + 8 reads = $2.25 + 8×$0.23 ≈ $4.05. **5x reduction.**
- Cache TTL: 1 hour (confirmed via `ephemeral_1h_input_tokens` in run data). Sequential 9-run chain ≈ 2–4 min typical, well within TTL.
- Sonnet was tested as an alternative: only 1.6x savings, with worse reliability and higher variance. Cache unification is the bigger lever and stacks with any model choice.

**Design.**

1. **Unified context preamble** — one block per commission containing the superset of extractor outputs (DIFF, FULL_FILES, CONTEXT_FILES, FILE_TREE, SPEC, API_SURFACE, REFERENCED_FILES). Identical across all instruments. Becomes the cacheable prefix.

2. **Per-instrument rubric suffix** — each instrument appends ~500 tokens of scoring instructions after the shared preamble. Doesn't break cache alignment because it comes after.

3. **Sequential execution within a commission** — blind-run-1 writes the cache, all 8 subsequent runs (blind 2/3, aware 1/2/3, integration 1/2/3) read it. Parallel across commissions still fine (different contexts = no sharing anyway).

4. **Generic system prompt** — must be identical across all calls. Move instrument-specific instructions entirely into the user message suffix. System becomes: "You are an expert code reviewer. You will be given the context of a code commission (spec, diff, source files) followed by specific scoring instructions. Evaluate carefully and respond in the requested format."

**Implementation plan** (5 pieces):

1. New "commission review" mode in the instrument runner — orchestrates multi-instrument runs against shared context for one commission. Existing single-instrument mode stays.
2. Context assembler — runs the superset of extractors, builds the shared preamble, dedupes overlapping calls.
3. Rubric templates — each instrument defines a rubric (scoring instructions + dimensions + output format) appended as suffix. Replaces current full prompt templates.
4. Sequential executor — runs calls one at a time within a commission, collects results.
5. Update `instrument-review.sh` — switch to commission-review mode by default.

**Already done in the cost-investigation session** (uncommitted at time of import):

- Instrument runner captures full JSON envelopes from `claude --print --output-format json` (token usage, cost, session ID, duration per run).
- Per-run transcript files saved to `instruments/<name>/runs/run-N.json`.
- Cost summary in `result.yaml` — aggregate cost across runs.
- Sonnet instrument versions (v2-sonnet, v1-sonnet) for future comparison.
- Model comparison data in `experiments/data/model-comparison/` — full results for 3 commissions × 3 instruments × 2 models.

## References

- Parent quest: T4 (`x013-instrumentation-review`)
- Source doc: `.scratch/todo/URGENT-unified-instrument-context.md`
- Cost investigation session: `023683e5-bf03-4fe4-820c-fae9dd2fad7a`
- Files (uncommitted at import time):
  - `packages/instruments/src/execute.ts` — JSON output, usage extraction
  - `packages/instruments/src/artifact.ts` — run transcripts, cost aggregation
  - `packages/instruments/src/types.ts` — `RunUsage`, `AggregateCost` types
  - `packages/instruments/src/cli.ts` — plumbing for cost data + transcripts
  - `experiments/instruments/*/v2-sonnet/`, `experiments/instruments/codebase-integration-scorer/v1-sonnet/`
  - `experiments/data/model-comparison/`
  - `bin/sonnet-comparison.sh`

## Notes

- Originally filed as **URGENT** with commissioning paused. Re-classified 2026-04-10: bypass landed (instruments disabled) so the urgency is gone, but the inquiry is still live and worth implementing — the cache-sharing structure is the right shape regardless of cost pressure.
- 2026-04-10: opened as child of T4.