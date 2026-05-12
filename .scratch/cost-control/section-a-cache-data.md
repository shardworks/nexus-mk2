# Section A — Cache-Aware Prompting: Empirical Findings

Data backing for the Cache-Aware Prompting section of `prompt-engineering-landscape.md`. Pulled from the vibers guild books, sample window **2026-04-25 → 2026-05-12** (~17 days, 776 completed engine sessions, $2,644 total spend).

> **Revision note (May 12 2026, evening).** An earlier version of this
> appendix used `cache_read_input_tokens` from production transcripts as a
> direct measure of "cached prefix size per API call." A controlled one-off
> `claude --print` run (`/tmp/nexus-debug`, see `prompt-debug-experiment.md`)
> showed the production numbers materially overstate the true static
> prefix size — the per-API-call prefix for a fresh implement-shaped call
> with no MCP is ~13K tokens, not the 80K I had reported. The cache-read
> sums in production transcripts appear to accumulate across multiple
> internal iterations (title-generation pre-calls, retries, subagent
> bookkeeping). Cache-utilization *ratios* in this appendix remain valid;
> absolute token sizes have been re-stated below.

## Headline

**The cache infrastructure is already working.** Cost-dominant engines show 95-98% cache-read share on the input side. Cross-session cache reuse is happening — implement sessions land on a 95%-warm cache on their very first turn. Extended (1h) TTL is in use for the main agent models (Sonnet, Opus); 5m TTL is correctly reserved for Haiku side-helper turns.

The cache layout audit Priority 1 in the landscape document estimated "~10-25% structural savings." **The data suggests there is not 10-25% to be found in cache-hit-rate** — we are at the ceiling. The real lever is **volume of cached input**, not hit rate.

## Per-engine cache utilization (since 2026-04-25)

| Engine | Sessions | Total $ | Avg $ | Avg turns | Avg input-side per session | Cache-read share | Cache-write / cache-read |
|---|---:|---:|---:|---:|---:|---:|---:|
| implement | 153 | $1,547 | $10.10 | ~156 | 14.4M | **98.5%** | 1.5% |
| reader-analyst | 124 | $600 | $4.84 | — | 5.6M | 96.6% | 3.6% |
| review | 124 | $170 | $1.37 | — | 1.4M | 95.1% | 5.2% |
| spec-writer | 123 | $155 | $1.26 | ~17 | 0.47M | **87.9%** | 13.8% |
| revise | 108 | $92 | $0.85 | — | 1.25M | 97.4% | 2.7% |
| seal-manual-merge | 20 | $43 | $2.13 | — | 2.57M | 97.3% | 2.7% |
| patron-anima | 124 | $38 | $0.31 | — | 0.035M | **54.9%** | 82.1% |

Cache-read share = `cacheReadTokens / (inputTokens + cacheReadTokens + cacheWriteTokens)`.

### Outliers worth noting

- **patron-anima at 54.9%**: low cache reuse, but sessions are tiny (~35K tokens avg) and total spend is $38. Not worth optimizing.
- **spec-writer at 87.9%**: lower than the others, but the explanation is session length. Spec-writer sessions are short (~17 turns) so cache-write fixed costs dominate the ratio. Each session writes ~9K tokens on turn 1 vs implement's ~3K — there is some genuine "per-session volatile content" headroom here, but at $155 total spend it is a small lever.

## Per-turn analysis (71 implement sessions, May 1–12 2026)

Pulled by joining `books_animator_sessions` (per-session totals) with `books_animator_transcripts` (per-turn detail). Each Sonnet/Opus/Haiku turn carries its own `usage` object with `input_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`, and the TTL split `cache_creation.ephemeral_5m_input_tokens` / `ephemeral_1h_input_tokens`.

**Important methodology note.** Claude Code emits multiple transcript events per API completion — one each for `text`, `thinking`, and `tool_use` content blocks — all sharing the same `message.id` and the same `usage` stats. Earlier per-turn counts were inflated ~1.8× by deduping on `uuid`; correct dedup is by `message.id`. Numbers below use the corrected dedup.

A second methodology note: the transcript stream also captures **subagent turns** (Claude Code Task tool spawning a child agent). Those have non-null `parent_tool_use_id`. The numbers below split main-agent and subagent turns explicitly.

**Aggregate, main-agent only (n=71 implement sessions):**

| Metric | Value | Interpretation |
|---|---:|---|
| Avg main-agent turns | 73 | (plus ~12 subagent turns per session) |
| Avg first-turn cache-read | 82,892 | **NOT a clean prefix-size measure** — see revision note above. Aggregated across internal API iterations; controlled one-off measurement showed actual per-call prefix is much smaller. The ratio of cache-read to cache-write is still meaningful. |
| Avg first-turn cache-write | 1,704 | The per-session fresh content delta |
| **First-turn warm cache %** | **97%** | Cross-session reuse is high and consistent (ratio metric — valid) |
| Avg main-agent total cache-read | 8.17M | Sum across all reported iterations of all turns |
| Avg main-agent total cache-write | 159K | Mid-session writes as content accretes |
| Avg main-agent cache-write / cache-read | 1.9% | Very small invalidation tail (ratio metric — valid) |

**Distribution of first-turn warm-cache pct** (n=71):
- Median: **99%**
- 60/71 sessions ≥ 95% warm
- 6/71 between 80-94% warm (mild cold-starts)
- 3/71 below 80% warm (genuine cold-starts; see Q2 analysis below)

The data is overwhelmingly tight on the high end: a typical implement session lands on a 99% warm cache on turn 1, and the cache stays warm through ~73 main-agent turns with only ~159K cache-write tokens (1.9% of cache-read volume).

### TTL split for implement (25 sessions, by model)

| Model | Turns | Cache-write 5m | Cache-write 1h | Cache-read |
|---|---:|---:|---:|---:|
| claude-sonnet-4-6 | 3,090 | 286K (4%) | 7.35M (96%) | 255M |
| claude-opus-4-7 | 368 | 0 | 1.10M (100%) | 98M |
| claude-haiku-4-5 | 453 | 2.68M (100%) | 0 | 12.8M |

Conclusions:
- **Sonnet and Opus correctly use 1h TTL** for the main session prefix. Sonnet dominates volume (3,090 turns of 3,911 = 79%) — the Sonnet swap has shipped for implement.
- **Haiku uses 5m TTL** — these are Claude Code's auto-compaction/summarization side-helper turns. 5m TTL is appropriate for ephemeral helpers.
- A6 ("extended-TTL for stable artifacts") is **already shipped** at the model-tier level. There is no toggle to flip here.

## Implications per landscape item

| # | Idea | Original estimate | Empirical reality |
|---|---|---|---|
| A1 | Measure cache-hit rate | "instrumentation" | **Done** (this document). Headline: 95-98% on cost-dominant engines; implement median first-turn warm = 99%. |
| A2 | Stable→volatile ordering | "5-15% savings" | **Implicitly satisfied.** 97% first-turn warm cache means stable content is at the front. No movement available. |
| A3 | Explicit cache breakpoints | "compounds with A2" | **Likely placed correctly.** High cross-session reuse implies breakpoints are landing where they should. No movement available without inspecting raw prompt content. |
| A4 | Cross-session cache reuse audit | "depends on findings" | **Audit done — reuse is high.** Implement median 99% first-turn warm; even >24h-gap sessions stay warm. Cold-start cases (n=3/71) bounded at < $3 savings if eliminated. |
| A5 | Strip volatile timestamps/IDs | "1-5% savings" | **Negligible.** Implement sessions only add ~1.7K per-session fresh content. Sum of all first-turn cache-write across 71 sessions is 129K tokens (~$0.50-2.50 at current pricing). |
| A6 | Extended-TTL cache | "2-5% savings" | **Already shipped.** Sonnet/Opus use 1h TTL automatically (96-100% of cache-write goes to 1h). 5m is correctly reserved for Haiku side-helper turns. |

## What the data actually points to

Cache hit-rate is at the ceiling. The cost driver for implement is **prefix size × turn count**, not cache-miss rate:

- The dominant cost lever is the prefix that gets read repeatedly. A controlled one-off measurement (`/tmp/nexus-debug/.debug/run1.log`) showed the Claude Code static overhead with our implement systemPrompt + minimal user prompt + no MCP is ~13K tokens; adding our 15 MCP tools brings it to ~22K. So per-implement-session, ~22K tokens of cached overhead get re-read across ~73 main-agent turns. Our brief content is whatever we put in the user prompt — typically 5-50K tokens — also read repeatedly.
- Lever 1: **Shrink the cached prefix.** Three targetable surfaces:
  - The ~22K Claude-Code-and-MCP overhead (built-in tool filtering, MCP tool surface trimming) — see click `c-mp28jnjk`.
  - Our systemPrompt rendering (`loom.ts`'s `## Tool: <name>` blocks duplicate the MCP tool descriptions also sent via the API `tools` field — investigate whether the duplication is needed).
  - Our user-prompt brief content (this is where X021 / X022 inventory-trim work targets).
- Lever 2: **Reduce turn count.** Same prefix × fewer turns = less cache-read.
- Lever 3: **Subagent dispatch for big-file analysis** (already in flight: `c-mok4qihw`, `c-mok4qix1`). Keep big content in subagent context, not main.

These are **structural** levers (size and turn count), not **cache-aware** levers (layout). The catalog's Section A framing — "make the cache layout better" — overstates the available room.

## Recommendation for Section A in the landscape doc

Rewrite Section A as:

- **Lead with the empirical finding**: cache infrastructure is already 95-98% effective on cost-dominant engines. Cross-session reuse is real. Extended TTL is shipped.
- **Demote A2/A3/A5/A6** from "untested" to "shipped or non-actionable" with measurement evidence.
- **Keep A1** as a recurring measurement (the metric is useful as a regression detector — if cache-read share drops below 90% on implement, something has changed).
- **Replace "Priority 1 — Cache layout audit and restructure"** in the priority bundles section. There is no 10-25% structural lever here. Redirect Priority 1 to prefix-size-reduction or surface it as "no high-value structural cache work; move attention to prefix size and turn count."

## Q1: What is spec-writer's first-turn cache-write?

Spec-writer averages 6.1K of first-turn cache-write (vs implement's 1.7K) — a 16-percentage-point gap in first-turn warm cache (84% vs 97%). Inspection of a recent spec-writer transcript (`ses-mp24p0g1-1ab7ed4b`) shows the first user message contains a 43.9KB `tool_result` block holding the full writ JSON: codex name, status, the entire inlined inventory text, and other plan-specific scaffolding.

The 6K cache-write per spec-writer session is the plan/inventory delta. Each spec-writer run is working on a different writ, so this content is inherently per-session volatile. There are three theoretical levers:

1. **Group spec-writer runs by inventory similarity** to maximize warm-cache hits across runs — operationally complex, low realistic gain.
2. **Trim the inventory passed in** — reduces per-plan delta size. This is the X021 lever, already in flight.
3. **Place cache markers inside the writ JSON** so inventory body specifically can be cached even when other writ fields differ — requires Claude Code to expose breakpoint control we don't have today.

**Verdict:** Spec-writer total spend is $155 over 17 days. Even halving the per-session cache-write would save ~$5 in that window. Not worth dedicated work; the X021/X022 inventory-trim line is already the right place for any movement here.

## Q2: Cold-start outliers — TTL expiry or genuine first-of-shape?

The earlier-flagged "28%/65%/66% first-warm" cases were artifacts of the `uuid`-based dedup bug (each API completion was counted 1.8x). With correct `message.id` dedup and main-agent-only filtering, the distribution is much tighter:

**Implement sessions sorted by first-turn warm % (n=71, n_cold = first_warm_pct < 80):**

| sid | gap from prev | first_cw | first_cr | first_warm % | model | context |
|---|---:|---:|---:|---:|---|---|
| ses-mopvfp05 | n/a (first in window) | 12,421 | 15,867 | 56% | Opus | genuine cold start |
| ses-mp1uiuxc | 50 min | 6,096 | 18,532 | 75% | Sonnet | gap within 1h TTL, but cache pressure from intervening sessions |
| ses-mp248ebm | 155 min | 4,151 | 11,839 | 74% | Sonnet | gap > 1h TTL → expected aging |

The two within-1h-TTL cold-starts had heavy intervening session activity. For `ses-mp1uiuxc`, in the 50-minute window before the cold-start there were **12 sessions** across spec-writer, patron-anima, reader-analyst, revise, review — five distinct engine roles. The Anthropic cache has slot-pressure semantics; intervening different-role sessions can evict an implement-role cache entry even within its TTL.

**Implement first-turn warmth bucketed by gap from previous IMPLEMENT session:**

| Gap bucket | n | Avg first_warm % | Avg first_cw |
|---|---:|---:|---:|
| < 5 min | 10 | 97% | 966 |
| 5min – 1h | 43 | 96% | 2,029 |
| 1h – 4h | 11 | 96% | 889 |
| 4h – 24h | 4 | 94% | 2,165 |
| > 24h | 2 | 98% | 616 |

Surprisingly tight. Implement-session warmth barely varies with gap-from-previous-implement, including across multi-day gaps — the cache_read volume on first turn is large even at >24h gap. This implies the **role file / codex / system-prompt content** (the bulk of the cached prefix) is being re-cached frequently enough by other sessions or by Claude Code's internal cache rotation that the implement prefix stays effectively warm even across days.

**Bounding the savings opportunity:**

| Metric | Value | At Sonnet cw $3.75/MT | At Opus cw $18.75/MT |
|---|---:|---:|---:|
| Sum of first-turn cache-write across 71 sessions | 129K tokens | $0.48 | $2.42 |
| Sum of total cache-write across 71 sessions | 16.4M tokens | $61.50 | $307.50 |

If first-turn cache-write were perfectly zero across all 71 sessions, the savings would be **under $3** (9-day window, mostly Sonnet now). Annualized: $10–100.

If mid-session cache-write were entirely eliminated (unrealistic — it's the cost of new tool results / file reads), savings would be ~$60–300 across the 71 sessions. Annualized: $2.5K–12K. The realistic-target slice (a 20% cut via subagent dispatch) is the F3/F4 in-flight work, not a cache-layout question.

**Verdict:** There is essentially no actionable cold-start lever. The 3 cold-start cases out of 71 represent < 0.5% of the cache-write tab, which itself is 1.9% of the total cache-read tab. The cache is already at the ceiling.

## Other open questions still standing

1. **The 73-turn main-agent average for implement** — productive vs exploratory turn analysis. Turn-count is the bigger structural lever than cache layout. (**Tracked elsewhere — outside this section's scope.**)
2. **Cost composition** — we have token volumes but not per-token-class dollar cost without joining model used per turn against current pricing. A follow-on with model-tagged turns would let us decompose "what fraction of session cost is cache-read pricing vs cache-write vs output."
3. **The cache-read inflation in production transcripts.** A controlled `claude --print` run reports clean per-API-call cache stats (~13K for our systemPrompt + no MCP + minimal user prompt). Production transcripts report 27K-128K `cache_read` on what looks like the first main-agent message. The gap is likely Claude Code accumulating across internal iterations (title-generation pre-call, retries, etc.) into the usage stats reported on the first emitted message. Worth a follow-on if we want accurate per-call cost attribution rather than per-logical-turn aggregate. See `prompt-debug-experiment.md` for the controlled measurement.

## Data sources

- Database: `/workspace/vibers/.nexus/nexus.db`
- Tables: `books_animator_sessions` (per-session), `books_animator_transcripts` (per-turn)
- Sample window: 2026-04-25 → 2026-05-12 (17 days, 776 completed engine sessions, $2.6K spend)
- Per-turn deep-dive window: 2026-05-01 → 2026-05-12 (71 implement sessions, 15 spec-writer)
- Aggregation scripts: `/tmp/per_turn_analysis.sh`, `/tmp/per_turn_main_only.sh`, `/tmp/per_turn_model_ttl.sh`, `/tmp/gap_warmth.sh`
- Aggregated JSONL: `/tmp/implement_main_only.jsonl`, `/tmp/specwriter_main_only.jsonl`, `/tmp/impl_model_ttl.jsonl`, `/tmp/implement_with_gaps.jsonl`

(Scripts live in `/tmp/` for now; can be promoted to `bin/` if we want them as recurring instrumentation.)
