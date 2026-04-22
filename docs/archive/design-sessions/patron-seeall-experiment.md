# Patron-anima "see all decisions" experiment — 2026-04-22

Re-ran the 5 test writs through the patron role (via `nsg summon --role patron`) with ALL decisions in the prompt, not just the analyst-surfaced subset.

Sessions:
- rig-1 (w-mo8a0my5, Oculus/Spider cost aggregation) — ses-mo9hoer0-8382658a
- rig-2 (w-mo89zxri, rig-list tbody rebuild) — ses-mo9hr7z9-49fb2773
- rig-3 (w-mo89zd0u, RigDoc terminalAt) — ses-mo9hr9ff-ca8dadc8
- rig-4 (w-mo89yr4w, rig-meta duplication) — ses-mo9hrall-03b3b974
- rig-5 (w-mo89y0cf, dashboard cost precision) — ses-mo9hrc3t-ee921e11

Prompt builder: `.scratch/patron-seeall-experiment/build-seeall-prompt.ts`

## Aggregate totals

| Dimension | Original (razor gating) | See-all |
|---|---:|---:|
| Decisions total | 29 | 29 |
| Reviewed | 6 (21%) | 23 (79%) |
| Overrides | 1 | 2 |
| Confirms | 5 | 21 |
| Abstentions (absent) | 0 | 6 (21% of decisions) |
| Patron-anima cost (5 rigs) | ~$0.15 (rigs 1+5 only) | $0.887 |

## The new override (rig-1 D6)

The signature find. Originally, D6 ("how should the new method handle missing session ids?") was pre-filled by the analyst with `silent-skip`, citing "preserves existing enrichRigView semantics" — a legitimate local rationale. The razor never surfaced it.

See-all's verdict:

> D6 override → `explicit-null` (high, #11 **Skip-when-unset over framework defaults for taste**) — 'missing means zero' is taste, and the framework should not supply it; AnimatorApi returns what it found, rig-view applies the zero-policy at its layer where the existing test already pins it.

This is exactly the kind of call the razor was designed to miss — the decision is low-reach (one caller) and high-patch (cheap to reverse), so it fails both the Reach Test and the Patch Test. But a patron principle (#11) does fire cleanly — the framework should return raw data; the taste ("missing = zero contribution") belongs to the caller. The see-all patron-anima caught a silent taste-violation that shipped unreviewed.

This is a concrete example of the razor throwing away principle checks.

## Abstention rate under current semantics = 21%

This is the crux of why the abstention-rewrite is needed. If we ship "send all decisions to patron-anima" without fixing abstention semantics, **21% of decisions would stall the pipeline for human review**. That's a regression from the razor's world.

Where abstentions happened and what the new semantics would do:

| Abstention | Under new semantics |
|---|---|
| rig-1 D4 (proceed vs decline) | low-confirm `proceed` — no principle speaks; analyst's pick is fine |
| rig-3 D2 (all-four terminal statuses) | low-confirm `all-four` — no principle speaks |
| rig-3 D4 (small-helper vs inline) | low-confirm `small-helper` — no principle speaks |
| rig-3 D5 (keep vs remove fallback) | low-confirm `keep-fallback` — no principle speaks |
| rig-3 D6 (doc-scope minimal vs broader) | low-confirm `minimal` — no principle speaks |
| rig-5 D1 (2-decimal vs 4-decimal precision) | low-confirm `converge-all-to-2` — no principle speaks |

Every one of these abstentions is a "no principle speaks" case. Under the proposed new semantics, they become low-confidence confirms and the pipeline continues. Zero human blocks.

## Per-rig outputs

### rig-1 (6 decisions, 3 reviewed originally)

Original PA: D1 override, D3 confirm, D5 confirm. See-all PA: D1 override ✓, D2 confirm (new), D3 confirm ✓, D4 ABSTAIN, D5 confirm ✓, **D6 OVERRIDE** (new, #11).

### rig-2 (9 decisions, 0 reviewed originally)

See-all PA: all 9 confirmed. Principles cited: mostly #13 (precedent-set-by-first-writer) — reasonable since the brief explicitly cites a canonical pattern (createPipelineNode). One med-confidence confirm (D6) with explicit #13 vs #18 conflict reasoning. This is the analyst's best case: the codebase convention is the principle.

### rig-3 (7 decisions, 0 reviewed originally)

See-all PA: 3 confirmed (D1, D3, D7), 4 abstained. This rig has the highest abstention rate — 57%. Most are "how deep should testing go" or "what code path should touch the timestamp" style questions that are genuinely principle-inert. Under new abstention semantics, all become low-confirm.

### rig-4 (1 decision, 0 reviewed originally)

See-all PA: D1 confirm (no-op), cites #18. The decision is literally "does the brief's precondition still fire?" — a codebase-check question. Principle #18 fires cleanly here.

### rig-5 (6 decisions, 3 reviewed originally)

Original PA: D2 confirm, D3 confirm, D6 confirm (med). See-all PA: D2 confirm ✓, D3 confirm ✓, D4 confirm (new), D5 confirm (new), **D6 confirm at HIGH** (was med), D1 ABSTAIN.

Interesting: D6's confidence rose from med → high. Under the original, D6 was flagged with a principle conflict resolved toward inclusion. With more decisions in view, the see-all patron-anima found #23 and #36 aligned (not conflicting) on the same call. This is a calibration artifact worth noting — more decisions in a prompt may change how the same decision gets confidence-tagged, because surrounding context shifts which principles feel primary.

## Cost

See-all total: $0.887 across 5 rigs × avg 5.8 decisions = $0.03 per decision.
Analyst stage is typically $5+ per rig. See-all patron-anima review is ~3% of that — trivial.

## Conclusions for the razor-removal + abstention-rewrite pair

1. **Razor removal finds real overrides.** Rig-1 D6 is a textbook example. The analyst silently shipped a taste-violation that a principle catches. At one override per five rigs, call it ~3% of pre-filled decisions getting corrected — not a huge rate, but not zero, and the rate doesn't need to be high to justify the tiny cost.

2. **Razor removal must ship WITH abstention rewrite.** 21% abstention under current semantics = massive regression. Low-confirm semantics neutralize this entirely — all observed abstentions in this experiment are "no principle speaks" cases where deferring to the analyst is correct.

3. **Confidence calibration has a mild context dependency.** Same decision, more surrounding decisions in the prompt, different principle interpreted as primary. Worth watching but probably not a blocker.

4. **Cost is negligible.** $0.03 per decision, single-digit percentage of analyst stage cost.
