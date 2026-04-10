# Astrolabe Cost Profile

*Source: 51 astrolabe.sage sessions in the guild books, pulled via `nsg session show`. Date: 2026-04-10.*

## Headline

**Reader is 65% of astrolabe's total spend, and its cost is dominated by turn count — not by how much context it loads.** The average reader session re-reads its accumulated cache **~25 times** before finishing. Caching or scoping the *input* to reader will help less than reducing the *number of turns* it takes to produce its inventory. A single-shot or two-shot reader prompt is the highest-leverage intervention.

---

## 1. Per-stage rollup

Total astrolabe spend captured: **$107.35** across 51 sessions (22 reader, 17 analyst, 12 spec-writer).

| stage | n | total $ | % of astrolabe | mean $ | p50 | p95 | max | mean duration |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| **reader** | 22 | **$69.75** | **65.0%** | $3.17 | $3.13 | $4.95 | **$8.22** | 547 s |
| analyst | 17 | $21.13 | 19.7% | $1.24 | $1.04 | $3.61 | $3.61 | 271 s |
| spec-writer | 12 | $16.46 | 15.3% | $1.37 | $1.43 | $2.42 | $2.42 | 287 s |

**Failure rate:** 2/22 reader sessions exited non-zero (9.1%), 1/17 analyst sessions. No spec-writer failures. Both reader failures still consumed ~$2.40 each and ~560 s of wall time before exiting — failed reads are not cheap.

**Cost spread within a stage:** reader ranges from $1.59 to $8.22 — a **5.2× spread** across 22 writs. Whatever reader is doing scales strongly with something writ-specific (probably the surface area of the brief in the target repo), and the tail matters more than the median.

## 2. Token shape per stage

| stage | mean cacheRead | mean cacheWrite | mean output | cacheRead:output ratio |
|---|---:|---:|---:|---:|
| **reader** | **2.76 M** | 107 k | 16.8 k | **164 : 1** |
| analyst | 1.44 M | 35 k | 11.3 k | 128 : 1 |
| spec-writer | 1.31 M | 57 k | 11.9 k | 111 : 1 |

Fresh (un-cached) input is essentially zero everywhere — <0.05% of tokens for every stage. Astrolabe is entirely a cache-read economy. The interesting structure is in the relationship between `cacheWrite` (fresh material ingested) and `cacheRead` (material re-read on later turns).

## 3. The real finding: reader's cost is dominated by turn count

For a single session, `cacheRead / cacheWrite` approximates **how many turns the session took** — each turn re-reads the growing prompt cache, so the ratio is the turn count on a model where every turn reads everything loaded so far.

Across the 22 reader sessions:

| metric | value |
|---|---:|
| mean "turns" (cacheRead ÷ cacheWrite) | **25.2** |
| min / max turns | 12 / 38 |
| mean fresh material loaded (cacheWrite) | 107 k tokens |
| range of fresh material loaded | 66 k – 192 k tokens |

The cheapest reader run ($1.59) loaded 66 k of fresh material and took 24 turns. The single most expensive ($8.22) loaded 118 k and took 26 turns — *only ~2× the material of the cheap run, but 5× the cost.* The $4.95 outlier loaded the largest prompt (192 k) across 30 turns. Cost tracks the **product** of load-size and turn-count, but turn-count is the bigger multiplier because it stacks.

This reframes the intervention space. If reader's expense were *fresh reading*, caching and scoping would win. Because it's *re-reading the same cache 25 times*, the winning move is to **reduce turns** — collapse the scan into a single or two-phase prompt that emits a structured inventory without iterative exploration.

## 4. What reader actually produces

Reading the `output` field of every reader session: they all emit the same shape — a markdown inventory with consistent sections:

- **Brief summary** (1–2 sentences)
- **Primary files to modify** (annotated file list, typically 3–6 entries)
- **Key findings** (3–6 numbered bullets identifying the gap, critical prerequisite bugs, circular/race risks)
- **Test files** (paths and pattern notes)
- **Adjacent patterns** (code references the implementer will want to mirror)
- **Doc/code discrepancies** (optional, often 3–6 items)

This is a **well-bounded, structured output**. Every reader session is producing a document of roughly the same shape, ~17 k tokens ± 50%. There is no open-ended exploration stage — the agent knows what it's looking for by the end. But it's getting there via ~25 turns of filesystem poking.

One session in the sample emitted a telling note: the `plan-show` and `inventory-write` tools were not available in the Claude Code session, so the agent could not read the brief writ or write to the PlanDoc. It fell back to writing a file into the worktree and committing it — and still billed $2.26 and 545 s. This is a separate finding (observability gap: tool-availability failures silently degrade reader to a less useful mode without failing the stage), but it underscores that **reader's 25-turn exploration is not contingent on finding the right information** — it happens even when reader's own output path is broken.

## 5. Does downstream reuse reader's work?

In shared-conversation runs, downstream stages inherit reader's prompt cache. I split the 17 multi-stage writs by whether analyst/spec-writer shared reader's conversation:

| pattern | writs | avg reader $ | avg analyst $ | avg spec-writer $ |
|---|---:|---:|---:|---:|
| shared conv (reader cache reused) | 9 | $3.86 | $1.06 | $1.12 |
| separate conv (reader is discarded) | 8 | $2.85 | $1.45 | $0.80 |

Shared-conv reader sessions are ~35% more expensive on average (likely because those writs are larger, hence the decision to share), but downstream analyst sessions **are not dramatically cheaper** — $1.06 vs $1.45, a 27% reduction. That is much less savings than you'd expect if analyst were riding reader's cache for a free lift. Possible explanations:

- Claude Code's session handoff loses most of the cache benefit across session boundaries even with the same `conversationId`.
- Analyst is loading substantially different material than reader (consistent with analyst doing focused decision-point analysis rather than scanning).
- Analyst is still doing its own multi-turn exploration and paying the same cache-read tax that reader pays.

The 27% delta is not enough to justify the shared-conv complexity as a primary optimization lever. **Cutting reader cost directly is the higher-leverage play than trying to improve handoff efficiency.**

## 6. Cross-stage handoff: what analyst/spec-writer don't need

Analyst sessions average **1.44 M cacheRead** and **11.3 k output**. Spec-writer averages **1.31 M cacheRead** and **11.9 k output**. Both are doing substantial multi-turn work themselves on material that *may or may not* overlap with what reader loaded. Without a tool-call trace I can't prove reader is producing unused material, but the fact that downstream stages load ~1.3 M of their own cache *on top of* any inherited reader cache strongly suggests **downstream is re-reading source material directly, not consuming reader's structured output.**

If that's true, the most efficient world may not include reader at all — or reader reduced to a single-shot *directory structure + entry-point identification* step that saves the other stages navigation time without trying to pre-digest findings for them.

## 7. Intervention shortlist (ranked by estimated impact)

### A. Single-shot or two-shot reader prompt *(highest leverage)*

Re-frame reader as "produce this structured inventory in one response" rather than "explore the codebase and then emit a report." Give the agent the brief, the file tree, and a strict output template. Allow one follow-up turn for clarification reads if needed.

- **Expected impact:** turn count drops from ~25 to 1–2. If cache-read scales linearly with turns (it approximately does), that's a **10–20× reduction in reader cost** — from $69.75 → $3.50–$7.00 across the sample.
- **Risk:** reader quality degrades because the agent can't iteratively explore. Mitigation: pre-compute the file tree + first-500-lines-of-each-file as a single prompt payload so the agent has everything upfront and only needs to *select* rather than *discover*.
- **Experimentally testable:** replay 5 existing briefs through the new prompt, compare inventories produced against the originals for completeness and decision-point coverage.

### B. Eliminate reader entirely; push exploration into analyst

The 27%-only downstream savings from cache-sharing and the evidence that downstream stages do their own 1.3 M cache-read anyway suggests reader may be redundant with analyst. Merging them — "analyst reads and decides in one stage" — removes 65% of astrolabe spend at the cost of a longer analyst stage. If merged-analyst stays under ~$3, net savings is ~$2 per writ.

- **Expected impact:** $69.75 total reader spend → $0, analyst spend grows by ~30%, net savings ~50% of astrolabe cost.
- **Risk:** loses the separation-of-concerns pattern that the astrolabe rig relies on for checkpointing. The plan doc currently has an inventory-then-analysis handoff that makes recovery clean.
- **Experimentally testable:** commission one writ with a combined analyst prompt and see how it compares.

### C. Shrink the cache-read tax per turn

Reader pays ~25 turns × ~110 k tokens average = cache-read multiplier. If each turn's loaded context were smaller, the multiplier would be smaller. Techniques: aggressive file chunking (don't Read entire files when only first 100 lines are needed), drop tool-call scratch output from prompt history, or switch to a model with cheaper cache pricing for reader.

- **Expected impact:** 20–40% reduction in reader cost. Helpful but an order of magnitude less than option A.
- **Risk:** quality depends on the agent making good chunking decisions, which it may not. Model switch changes cost/quality trade-off in ways I can't predict from session data alone.

### D. Fail-fast on reader's observability gap

The one session where tools weren't available still burned $2.26 and 545 s before exiting cleanly with a degraded output. Detect tool-availability failures at startup and fail the stage immediately instead of letting reader muddle through.

- **Expected impact:** small — maybe $2/failure × 1 failure per ~20 runs = ~$0.10 per writ average. Not a cost play, but a correctness / data-quality play (bad reader outputs poison downstream).
- **Risk:** low.
- **Category:** hygiene, not optimization.

### E. Retry-with-cache for the 2/22 failed reader sessions *(do not pursue)*

Low-value: the failures are ~9% of runs and cost ~$2.40 each. Fixing reader quality via A or B will likely address failures too.

## 8. What we can't see without new instrumentation

- **Which tools reader is calling and how often.** The session record doesn't include a tool-call trace. Confirming the "25 turns of exploration" hypothesis would need the raw provider transcript. The hypothesis is strong on token math alone, but a trace would let us see exactly which files reader is reading and in what order — valuable input for prompt redesign.
- **Per-turn token attribution.** Would let us isolate whether early turns (scanning) or late turns (writing inventory) dominate.
- **Actual handoff consumption.** Can't prove downstream isn't consuming reader output without reading analyst/spec-writer transcripts and checking what content they reference.

None of these block picking an intervention. They would sharpen the experimental design for intervention A.

---

## Recommended next step

Dispatch a commission to implement **intervention A** (single-shot reader) as an experimental alternate rig template, commission 3–5 writs through it alongside 3–5 through the current rig, and compare:

- Total cost per writ (headline metric)
- Reader output completeness vs current reader on the same brief (quality floor)
- Downstream analyst/spec-writer performance (does quality degrade downstream?)

If intervention A succeeds (>5× cost reduction with acceptable quality), it obviates further optimization work on reader and shifts the cost-reduction focus to the artificer rig (where `implement` is still the biggest line item at $183 across 90 runs).
