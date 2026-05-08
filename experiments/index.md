# Experiments Index

Maintained by Coco. Update when experiments are created, activated, or closed.

## Active

| # | Name | Research Question |
|---|---|---|
| [X006](X006-guild-metaphor/spec.md) | The Guild Metaphor | Does the guild metaphor improve agent performance and patron experience compared to plain instructions? |
| [X008](X008-patrons-hands/spec.md) | The Patron's Hands | How does the bootstrap period (Coco doing implementation) shape patron expectations when autonomous agents come online? |
| [X010](X010-staged-sessions/spec.md) | Staged Sessions | What is the relationship between session length, cost, and output quality for autonomous commissions? Phase 1 (cost curve) complete at original scale; Apr 29 addendum sharpens H4 into H4a/H4b/H4c sub-hypotheses (cost model + handoff thresholds) and adds H5 (inventory pure-read bloat). |
| [X011](X011-context-debt/spec.md) | Context Debt | How much context window is consumed by tool output never referenced again, and can we reduce it? Activated 2026-04-29 with the read-utilization instrument as its first artifact. |
| [X016](X016-orientation-suppression/spec.md) | Orientation Suppression | When a fresh implementer session enters mid-flow, how many turns elapse before it produces productive work? Does an imperative anti-orientation directive in the brief reduce that turn count to <5? Phase 2c completed 2026-05-02 (N=1 baseline vs N=1 strong-prompt). H1 falsified at the original <5 threshold — the orientation floor for cascade-shaped work is ~17 calls. Strong-prompt suppressed redundant orientation cleanly (43→18 first-edit turns, −58%) but did not shorten the session overall. Open derivative question: re-run X010 H1 piece-sessions with strong-prompt enabled (click `c-moo9o9q3` under idea #15). |
| [X015](X015-spec-detail-model-substitute/spec.md) | Spec Detail as Model Substitute | Can planning-pipeline specs reduce the model capability threshold, enabling Sonnet-class models to match Opus outcomes? Activated 2026-05-02 with trial 1 — Sonnet implementer + Opus reviewer rerunning the Clerk refactor commission (writ w-mod6458g, $45.55 / 440 turns / 4 implement attempts under all-Opus). Per-role model override (framework 0.1.294, AnimaWeave.model) is the load-bearing dependency. |
| [X022](X022-implementer-behavior-nudges/spec.md) | Implementer Behavior Nudges | Does prepending five behavior nudges (Bash bulk edits, targeted Reads after Grep, repeat-grep avoidance, narrow test filters, no re-test of unchanged packages) to the **artificer role file** reduce implementer session cost ≥10% on real historical commissions without degrading outcomes? Tests Category 3 of the Apr 29 cost-optimization landscape (`c-mok4oct1`). Trial doctype migrated xguild → claude-direct 2026-05-08 (matches X021); intervention is now a role-file path passed to `spider.graft-rig-template`'s `claude-direct-monolithic` template. 4 trials: 2x2 (rig-moj12h4o substantive + rig-moji64hs control) × (baseline + combined nudges), $60–$85 estimated under claude-direct. **Recommended n=3 expansion** before running, given X021's measured 10% noise floor — current n=1-per-cell design is underpowered. Activated 2026-05-03. |
| [X023](X023-implementer-strategy-nudges/spec.md) | Implementer Strategy Nudges | Do two strategy nudges (single-commit decomposition + iteration-conservative implementation) prepended to the artificer role file reduce implementer session cost ≥20% on substantive opus workload at n=3? Motivated by X021 cheap-outlier observations: three claude-direct runs landed 8–14% below their group means via mechanisms unrelated to X021's spec-content interventions. Sibling of X022 (tool-use micro-discipline); same role-file intervention surface, different mechanism axis. Trial doctype claude-direct, codex pins reused from X021. Spec ready 2026-05-08; trials not yet run. Click `c-mowd893x`. |

## Ready (approved, not yet started)

| # | Name | Research Question |
|---|---|---|
| [X003](X003-commission-prompt-tuning/spec.md) | Commission Prompt Tuning | How do pre-commission instructions affect agent performance on identical tasks? |
| [X004](X004-iteration-context/spec.md) | Iteration Context | How does context about prior sessions affect quality and safety when an agent iterates on its own work? |
| [X009](X009-metaphor-as-instruction/spec.md) | Metaphor as Implicit Instruction | Does the guild metaphor carry actual behavioral weight, or is it decorative? |

## Draft (not yet approved)

| # | Name | Research Question |
|---|---|---|
| [X005](X005-greenfield-assembly/spec.md) | Greenfield Assembly | What if agents never iterate on existing code — only build net-new? |
| [X012](X012-agent-oriented-code/spec.md) | Agent-Oriented Code | Do conventional clean code principles still apply when agents are the primary authors? |
| [X014](X014-technical-spec-quality/spec.md) | Technical Spec Quality | Do technically detailed specs outperform mountain-quality specs — and does it depend on complexity? |
| [X017](X017-test-redundancy/spec.md) | Test Redundancy in Agent-Written Code | What fraction of agent-written test code is structurally redundant, and what fraction survives human spot-check as deletable? Probe data from framework/core (74%) and framework/arbor (80%) suggests substantial redundancy but unmeasured human survival rate. |

## Complete

| # | Name | Outcome |
|---|---|---|
| [X001](X001-fruit-delivery/spec.md) | Fruit Delivery | Complete |
| [X007](X007-first-contact/spec.md) | First Contact | Complete — H1 (manifest gap) confirmed |
| [X018](X018-package-surface-map-injection/spec.md) | Package Surface Map Injection | Complete — H1 (≥25% cost reduction) **not sustained**; mechanism confirmed (−79% Bash, −76% Grep on the injection variant) but cost ceiling at −13% on cartograph N=1. Three injection formats (compact JSON / tight text / YAML) tested; compact JSON was the local optimum, both shrinkage and YAML moved off it in the wrong direction. Pivot recommendation to a queryable-interface mechanism (X019-style); resolves click `c-mop6w43o`. |
| [X019](X019-reverse-usage-index/spec.md) | Reverse Usage Index | Complete — H1 (≥25% reader-analyst cost reduction) **not supported** on N=1 (cartograph; -1.3% cost delta). Mechanism intact: tool exists, model used it, cache reads down 10%. Diagnosis: **role mismatch** — the reader-analyst's bottleneck is *understanding implementations* (deep-Read), not *finding things* (lookup/navigation). Of 67 tool calls, code-lookup was used twice — both for discovery (locate-then-Read), neither for "find all usages" (the structural-win use case). Hypothesis ports cleanly to the implementer role (X020); reusable assets carry forward (published prerelease, generator, snippet, splice script). Findings: `2026-05-03-findings.md`. |
| [X020](X020-code-lookup-implementer/spec.md) | Code-Lookup for the Implementer | Complete — H1 cost target **not supported** (-20.6% < 25% gate) and mechanism didn't fire (0/116 adoption vs ≥20% target) on N=1 dropBook trial pair. Transcript walk falsifies the X019 role-mismatch story: ~6 of 11 Greps were canonical code-lookup workflows (SqliteBackend usages, dropBook usages, Apparatus interface). The role HAD the queries; it answered all of them with Grep despite a 3-layer prompt push (tool description, loom per-tool instructions, role-file snippet). X018+X019+X020 collectively show: ship-snippet-and-hope-for-adoption is a dead lever; structured cross-reference data isn't picked up organically. Strategic pivot: investigate what produced the 52%-fewer-Edit-calls signal in trial 2 (real cost lever, fired without code-lookup adoption). Apparatus side-finding: implement-only with raw writ.body produces ~32% lower cost vs plandoc-spec brief (X016 territory). Findings: `2026-05-03-findings.md`. Click `c-mophhb96`. |
| [X021](X021-inventory-format/spec.md) | Inventory Format Optimization | Complete — H1 (≥15% cost reduction on substantive v4) **NOT SUSTAINED** at n=3 under claude-direct methodology: −11.4% mean (range −6 to −18%). The original xguild headline (−26%) was **contaminated by xguild trial shape**: xguild baseline pure-read 71% vs production 49% vs claude-direct 53.7%; ~half of xguild's apparent savings was the intervention "fixing" its own contamination. H2 underpowered (per-idea decomposition vs ~10% CV noise floor); H3 mostly sustained (control median delta −1%). Mechanism corroborated: total Read content −22% on substantive v4. Run-to-run noise floor measured: 3–12% CV (median 9%) — n=3 cannot reliably detect <15% effects. Cheap-outlier observations across three runs (commit decomposition −14%; implementation conciseness −8 to −13%) motivate **X023**. Total spend $257.78 across 14 trials. Findings: `artifacts/results.md`. Click `c-mophvf0d` concluded 2026-05-08. |
| [X024](X024-implementer-turn-discipline/spec.md) | Implementer Turn Discipline | Complete — H1 (≥10% cost reduction) **NOT SUSTAINED** at n=3: −3.5% (well inside baseline noise CV 14.6%). Goal-stated reframe of X022's imperatives delivered substantively weaker effect than X022 (-13% vs -3.5%); only 1 of 3 named examples (`sed -i` ↑) moved in predicted direction; total searches +14%, workspace tests +24%, filter-tests −67% all wrong direction. Falsifies the "X022's effect was the framing, not the rules" hypothesis — **imperative form carries weight that the goal-stated reframe loses**. Foil cell cancelled (substantive cell didn't clear H1). Findings: `artifacts/results.md`. Reused X022's baseline cell as comparator. Total spend $109.58 / 3 trials. |

## Superseded

| # | Name | Reason |
|---|---|---|
| [X002](X002-agent-session-launcher/spec.md) | Agent Session Launcher | Deliverable built as part of session refactor; experiment no longer needed |
| [X013](X013-commission-outcomes/spec.md) | Commission Outcomes | Spec generation became automated (Astrolabe pipeline), eliminating spec-quality variance; structured patron review (complexity, outcome, failure_mode, reviewed_at) was retired 2026-04-30. The four hypotheses depended on patron-set instrumentation that no longer exists. Historical dataset (150 patron-touched entries) preserved as a frozen baseline in the X013 and X008 artifacts dirs. |
