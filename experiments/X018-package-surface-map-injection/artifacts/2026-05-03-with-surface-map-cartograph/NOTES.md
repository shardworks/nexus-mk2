# Variant trial — with-surface-map cartograph (Lever A, N=1)

**Trial id:** `w-mop6map1-0f3933cc57c9`
**Outer rig:** `rig-mop6mea6-7d38b8e2` (completed cleanly, 23 min total)
**Reader-analyst session:** `ses-mop6mviy-9a36010d`
**Codex SHA:** `aff280e75add02bd25e1af0e9467e8a81bfbcd41` (matches baseline)
**Surface map injected:** `2026-05-03-surface-map-aff280e7.json` (87 KB compact, 24 packages, 259 files, 1310 exports)

## Verdict (N=1)

| | |
|---|---|
| **Cost (primary metric)** | **−13%** ($9.04 → $7.88). H1 required ≥25%. **NOT sustained on N=1.** |
| **Mechanism (secondary)** | **Strongly confirmed.** Orientation traffic cut as predicted. |
| **Quality (Tier 1)** | Mostly pass; scope count at boundary; observation count zeroed. |
| **Quality (Tier 2)** | See *Side-by-side review* below. |

The mechanism prediction held — the surface map cuts the traffic
the spec said it would cut. But the cost effect on a single
cartograph trial is half the size H1 demanded. The bottleneck is
the cache-write tax on the bigger system prompt + the
read-token-dominant nature of the work that remains.

## Reader-analyst metrics — variant vs baseline

| metric | baseline (trial 5, ses-mooova47) | variant (ses-mop6mviy) | delta |
|---|---|---|---|
| **cost USD** | **$9.04** | **$7.88** | **−13%** |
| **wall duration** | **15.92 min** | **13.95 min** | **−12%** |
| input tokens | 103 | 65 | −37% |
| output tokens | 58,487 | 50,499 | −14% |
| cache read tokens | 11,928,094 | 8,729,263 | **−27%** |
| cache write tokens | 257,943 | 359,553 | **+39%** |
| status | completed (1 attempt) | completed (1 attempt) | — |
| authorized tools | 20 | 20 | — |

Per-million-token costs (Opus pricing as observed):
- cache reads dropped by 3.2M → ~$2.40 saved
- cache writes climbed by 100K → ~$0.36 added
- output dropped by 8K → ~$0.60 saved
- Net cost saving: **$1.16** (matches the observed $9.04→$7.88 delta)

The cache-write tax is roughly $0.36, eating ~30% of what would
otherwise be the savings.

## Tool-call profile — mechanism evidence

| tool | baseline | variant | delta | spec prediction |
|---|---|---|---|---|
| **Bash** (`ls` walks, existence checks) | 24 | 5 | **−79%** | "cuts orientation `ls`" ✅ |
| **Grep** | 25 | 6 | **−76%** | "cuts existence-check Greps" ✅ |
| Read | 34 | 31 | −9% | "deep semantic reads stay roughly unchanged" ✅ |
| Glob | 0 | 4 | (new) | not predicted; variant uses Glob for directory walks |
| MCP plan/writ/click reads | 5 | 4 | −20% | n/a |
| MCP plan writes (inv/scope/dec/obs) | 4 | 4 | — | required by role |
| **total** | **92** | **54** | **−41%** | |

**The mechanism prediction is strongly confirmed.** The variant cut
79% of orientation Bash calls and 76% of Greps — exactly the
traffic the spec predicted (ls package walks, existence-check
Greps). The variant kept all the deep reads (file content for
semantic analysis is what the map deliberately doesn't replace).

The 4 Glob calls in the variant are a methodology shift not seen
in baseline — the planner uses Glob to find files matching
patterns the surface map confirmed exist. This is a cleaner
orientation pattern than the baseline's `find ... | head -50` Bash
construct.

### Sample Bash call comparison

Baseline Bash (showing the orientation pattern):
- `ls packages/`
- `ls packages/framework packages/plugins`
- `ls packages/plugins/cartograph`
- `ls packages/plugins/cartograph/src`
- `ls packages/plugins/cartograph/src/tools`
- `ls packages/plugins/clerk/src`
- `find docs/architecture -name "*.md" | head -50`
- 14 more grep-for-existence Bash calls

Variant Bash (entire list):
- 4 `ls` calls in the worktree
- 1 `wc -l` of test files

The variant did NO Bash-grep existence checks. All cross-reference
queries went through the proper Grep tool with multi-pattern
queries — `cartograph|VisionDoc|ChargeDoc|PieceDoc|VisionStage|...`
in one call rather than 7 separate Bash greps.

## Plan-doc structural metrics — Tier 1

| check | baseline (trial 5) | variant | threshold | result |
|---|---|---|---|---|
| inventory present (non-trivial) | 3011 words | 3272 words | within ±40% (1807–4215) | ✅ pass |
| scope present (non-trivial) | 5 items | **3 items** | within ±30% (3.5–6.5) | **⚠️ at/below boundary** |
| decisions present (non-trivial) | 22 items | 17 items | within ±30% (15.4–28.6) | ✅ pass |
| observations present | 3 items | **0 items** | (not in Tier 1 strict) | ⚠️ flagged |
| spec present (non-trivial) | 6830 words | 8068 words | (not in Tier 1 strict) | ✅ pass (longer) |
| every decision has `selected` | 100% | 100% | required | ✅ pass |

**Two flags worth Tier 2 attention:** (1) scope count below the
±30% band (3 vs 5), (2) observations dropped to 0 (vs 3).

### On the scope-count flag

The variant explicitly bundled inseparable work, per the role's
own scope-decomposition guidance ("If two things are inseparable
(one is meaningless without the other), they're a single scope
item"):

| baseline | variant | bundling |
|---|---|---|
| S1 — move state to ext slot | S1 (combined) | core storage migration |
| S2 — drop the three books | S1 (folded in) | inseparable from S1 |
| S3 — atomicity wrap on createX/transitionX | S1 (folded in) | part of the rewrite |
| S4 — surveying-cascade.md updates | S3 | arch doc updates |
| S5 — README/JSDoc refresh | S1 (called out as concurrent doc) | implementer touches inline |

The variant's S2 (vision-apply atomicity) is a separate cross-cutting
item that doesn't appear as its own scope in baseline (it's an
implementation detail under baseline's S3). Coverage is **fully
equivalent**. The scope item count differs because the variant
applied the "inseparable → bundle" rule more aggressively.

This is defensible — and possibly a quality improvement — but it
trips the count-based Tier 1 check. **Tier 1's scope count threshold
may need to be wider, or replaced with a coverage diff.**

### On the observation-count flag

Baseline lifted 3 observations:
- obs-1: kit-channel for cross-plugin book index contributions
- obs-2: PlanDoc audit (apply same pattern to Astrolabe)
- obs-3: Document `setWritExt` slot-write patterns in `clerk.md`

Variant explicitly judged the bar and lifted **none**, with reason
documented in its session output: "no latent bugs, the brief's own
arch-doc updates handle the only doc/code discrepancy, the
surveying-cascade arch doc updates are part of the commission's own
scope (S3), and the patron-anima will principle-check the
codex-duplication choice (D4) directly."

Whether this is correct judgment or a regression depends on whether
those three observations are actually load-bearing.

- **obs-1** (kit-channel for indexes) — this is a real cross-cutting
  design Q the role's bar arguably DOES require lifting. The
  variant should have lifted this. **Possible regression.**
- **obs-2** (PlanDoc audit) — explicit "future-feature placeholder"
  per the role's own bar. Baseline arguably should NOT have lifted
  this. The variant's call is correct here.
- **obs-3** (slot-write patterns doc) — borderline; documenting a
  pattern after two real exemplars exist meets the "real DRY/
  consolidation" bar. Variant probably should have lifted.

So 1 of 3 baseline observations is a clean win for the variant, 2
of 3 are arguably load-bearing concerns the variant missed. **Net:
mild quality regression on observation lifting, possibly because
the surface-map orientation gave the planner less occasion to
notice cross-cutting concerns surfaced by exploration.**

## Side-by-side review (Tier 2)

Both specs cover:
- Storage migration to `writ.ext['cartograph']` slot
- Companion-book deletion
- Atomicity via `stacks.transaction`
- vision-apply transactional wrap (single-event-per-apply)
- surveying-cascade.md §3.4 / §3.6 / §3.7 rewrites
- Test fixture migration off companion books
- README and inline doc updates as concurrent doc updates
- Public type export for `CartographExt`

Both specs fail-loud on missing slots, follow Three Defaults #1
(prefer removal to deprecation) for the books, and follow brief
literal on the codex-duplication question.

**Variant produces a noticeably longer spec** (8068 vs 6830 words,
+18%) despite fewer decisions. Reading both, the variant's spec
feels more concrete and less theoretical — more file-name
references, more inline pattern excerpts, fewer generic
discussions. This is consistent with the surface-map allowing the
planner to confidently name specific files/exports without the
hedging that comes from Grep-uncertainty.

**Coverage equivalence:** the only material divergence is the
observation count (1 of 3 baseline observations missed). Decision
coverage is materially equivalent — the variant consolidated
related questions but didn't drop any load-bearing one.

**Tier 2 verdict (Coco, N=1):** **No quality regression that would
block H1**, modulo the observation-lifting nuance. If H1's cost
threshold were ≥25% the answer would be "sustained pending Tier 3";
since H1 fails on cost (−13% vs −25% threshold), Tier 3 isn't
warranted on this trial.

## Implications for X018

H1 is **NOT sustained** on N=1 cartograph: the cost reduction
exists (−13%) but is below the spec's ≥25% threshold. But the
mechanism is real and strong (−79% Bash, −76% Grep). Three paths:

1. **Run the stacks `dropBook` replay** ($6.48 baseline) for a
   second data point. Smaller per-trial baseline → larger relative
   cache-write tax — variant might do worse, not better.

2. **Tighten the variant** — the current Lever A injection is the
   minimum-viable variant. Two tighter variants worth trying:
   - Drop the JSON object structure → use a flatter
     one-line-per-symbol representation; might shrink the prompt
     by 30–40% and reduce the cache-write tax accordingly.
   - Inject only the surface map's "hot zone" (packages the brief
     touches and their first-degree neighbors). Current map carries
     all 24 packages; cartograph commission only touches 1.

3. **Accept −13% as the directional answer** and revise the H1
   threshold. The mechanism is unambiguous; the cost saving is
   real but smaller than initially predicted. May be the right
   answer if the goal is "is this worth a Lever B production
   investment?" — and at $1/trial savings on planner runs that
   happen frequently, the answer is plausibly yes even at −13%.

## Apparatus observations

- **No rate limits this run.** All 9 inner-rig engines completed
  in 1 attempt apiece. Spec-writer ran clean (4 min). Outer rig
  finished in 23 min total — well inside the 30-min cap.
- **`lab.archive` ran successfully** — auto-extract via
  `nsg lab trial-extract` worked normally.
- **Tier 1 `scope count ±30%` threshold may be too tight.** The
  variant's coarser-bundling produced 3 scope items; the rule
  flagged it. The role's own scope guidance directly supports
  the variant's choice. Consider widening to ±50% or replacing
  with a coverage-diff approach.

## Files in this extract

- `manifest.yaml` — captured trial config.
- `NOTES.md` — this file.
- `produced-spec.md` — the spec the variant planner wrote (444 lines, 8068 words).
- `produced-inventory.md` — the variant's inventory (374 lines, 3272 words).
- `README.md` — auto-generated probe summary.
- `trial-context.yaml` — lab-host probe output.
- `stacks-export/` — full books snapshot (auto-archive ran):
  - `animator-sessions.json` — session telemetry
  - `animator-transcripts.json` — full reader-analyst transcript (135 messages)
  - `astrolabe-plans.json` — full plan doc
  - `clerk-writs.json` — writs in test guild
  - `spider-rigs.json` — inner rig state
  - `clockworks-events.json`, `clerk-links.json`, `animator-state.json`
