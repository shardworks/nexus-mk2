# Patron Anima: automated decision-filling in Astrolabe plans

## Intent

Introduce a Patron Anima stage to Astrolabe's planning pipeline that automatically fills plan decisions on behalf of the patron, so the decision-review step only blocks on items the anima cannot confidently resolve. This turns the existing "analyst pre-decides → decision-review auto-skips" path into a general mechanism where a configured patron anima also pre-decides — reducing human-in-the-loop latency while capturing per-decision verdict + confidence for planner-quality instrumentation.

## Motivation

Today every unfilled decision in a plan blocks on human patron input via the `decision-review` engine. For decisions where a well-grounded patron stand-in could answer in the patron's voice, this is friction with no judgment gain. A Patron Anima — an anima loaded from a guild-authored role file capturing the patron's taste as principles — can absorb those routine decisions, leaving only genuinely novel ones for the human.

The commission also instruments the interaction: every decision the anima touches records its verdict and confidence on the PlanDoc, making override-rate × confidence a first-class queryable signal for assessing planner quality and anima fidelity over time.

Natural consumer: Astrolabe's `plan-and-ship` (and equivalent) rig template, invoked whenever a commission runs through framework planning.

## Non-negotiable decisions

### Pipeline position

The Patron Anima engine runs **after `inventory-check` and before `decision-review`** in the plan-and-ship rig template. This placement matches the existing "analyst pre-decides → decision-review auto-skips" semantics: anima-filled decisions carry a `selected` (or `patronOverride`) value and therefore bypass the patron-input block.

Source: c-mo3o292o (pipeline position).

### Config surface

The patron anima is selected via a new Astrolabe config variable, `astrolabe.patronRole` (name subject to sage refinement). The rig template threads it into the engine's givens as `${vars.astrolabe.patronRole}` (or equivalent substitution syntax). The extension point — the piece each guild customises — is *setting the role*; the engine itself is configured generically in the rig template.

When `patronRole` is unset or empty, the engine no-ops (completes with no plan changes) and `decision-review` proceeds as it does today. There is no framework-default patron — every patron's taste is unique, and a shared default would represent no patron's taste.

Sources: c-mo3tivzf (no framework default), c-mo3o2b49 (single role, not a family).

### Engine behaviour when a patron is configured

For each `Decision` in the plan where `selected === undefined` (i.e., the reviewable set `decision-review` would otherwise surface), the engine:

1. Invokes the patron anima (via the existing anima-session infrastructure) with a prompt constructed from the decision's question, context, options, and analyst recommendation/rationale.
2. Receives a structured emission carrying, per decision:
   - `verdict`: `confirm` | `override` | `fill-in`
   - `selection`: one of the decision's offered option keys
   - `confidence`: `low` | `med` | `high`
3. Applies the result to the PlanDoc:
   - `confirm` → sets `Decision.selected` to the analyst's `recommendation`.
   - `override` → sets `Decision.selected` to the anima's `selection`.
   - `fill-in` (no analyst recommendation) → sets `Decision.selected` to the anima's `selection`.
4. Records the full verdict + rationale on the PlanDoc (see instrumentation section below).

The anima must only select from the options the analyst offered — no custom/free-text selections. The human patron retains that escape hatch via `decision-review`'s `allowCustom: true` input; the anima is deliberately more constrained so its output is machine-consumable and measurable.

Sources: c-mo3o28hb (output shape), c-mo3o2bqi (self-uncertainty handling).

### Self-uncertainty — default to confirm at low confidence

When the anima is uncertain about a decision, it emits `verdict: confirm` with the analyst's recommendation and `confidence: low`. It does not abstain at verdict-time (forced output), does not apply fallback meta-heuristics (any meta-preferences Sean holds live in the role's principles list and surface as high-confidence confirms via that principle), and low-confidence verdicts do **not** trigger escalation to the human by default. The high-confirm / low-confidence accumulation is the intended diagnostic signal — "anima doesn't know patron well enough on this surface."

Source: c-mo3o2bqi.

### Per-decision instrumentation on the PlanDoc

Add a patron-emission section to `Decision` parallel to the existing analyst `recommendation` / `rationale` fields. Exact shape is a sage call, but it must carry per-decision: the verdict, the anima's selection, the confidence level, and a short rationale string. Grouping into a single nested object (e.g., `Decision.patron: { verdict, selection, confidence, rationale }`) keeps the patron's output cleanly distinct from the analyst's.

This data is the substrate for the primary planner-quality instrument: **override rate × confidence**, a four-quadrant diagnostic:

- high override / high confidence → planner weak on taste-relevant decisions
- high override / low confidence → anima flailing
- high confirm / low confidence → anima doesn't know patron well enough
- high confirm / high confidence → system working

Source: c-mo3o28hb.

### Output emission, not tool calls

The anima emits a single structured response (e.g., a JSON array keyed by decision id) rather than calling a per-decision tool. Emission is simpler to parse, maps cleanly onto the existing per-decision fields, and exhaustiveness is trivially checked by zipping emitted ids against the reviewable set. If emission quality degrades at scale (model loses track across many decisions), per-decision sharding or tool-call infrastructure is a known future upgrade path.

### Single session for all decisions

The engine runs the patron anima in a single session that receives all reviewable decisions at once and emits verdicts for all of them in one response. Per-decision sessions (one invocation per decision) are a known alternative with different trade-offs — simpler exhaustiveness, better failure isolation, more tokens — and are captured as a post-MVP option to revisit if single-session quality degrades with decision count.

### Exhaustiveness and malformed output — single pass, fall through

The engine runs the anima session once. Any decision that does not receive a well-formed verdict in that response — whether from missing ids, partial parse failure, or a completely unparseable emission — is left unfilled on the PlanDoc. `decision-review` then surfaces those decisions to the human in the normal flow. The engine does **not** retry the anima session.

Rationale: stuck-but-recoverable-with-answers (human supplies the missing decisions via `decision-review`) is strictly better than stuck-and-requires-repost. The framework never loses the human escape hatch, and transient anima failures cost one human intervention rather than a commission restart.

### Confidence calibration (role-authoring hint)

The role file is authored in principles-list format. Confidence is calibrated structurally against the principles: exactly one principle applies cleanly → `high`; multiple principles conflict → `med` (with a note on the conflict); no principle applies → `low`. This guidance belongs in the role file's instructions to the anima and is surfaced here so the sage writes the engine's prompt template to reinforce it.

Sources: c-mo3o2a8h (principles-list format), c-mo3o2bqi (calibration scheme).

## Out of scope

- **Interview-time patron invocation.** The pre-plan Distiller `ask-patron` tool is not part of this commission; interview-style patron use is the Distiller's concern and lands in a later brief. At interview-time, the patron role is simply an anima session with a different prompt — no new framework mechanism is needed here.
- **Corpus → role file generation.** Authoring the patron role file from a guild's taste corpus (concluded click conclusions, session notes, philosophy and agent docs) is patron-side authoring work, not framework code. The framework ships the slot; consumers fill it.
- **Planner meta-heuristics for low-confidence handling.** Whether the planner should apply "prefer reversibility / simpler option / smaller change" to low-confidence anima verdicts is a separate planner-strategy question (c-mo49zsst). This engine applies the anima's output verbatim and records confidence; downstream consumers can layer heuristics later.
- **Family of specialized patron variants.** MVP is a single patron role applied to every decision. Per-domain patron variants (architecture, ergonomics, etc.) are deferred until forcing functions surface.
- **Expanded corpus sources.** MVP corpus authoring uses concluded clicks, session notes, and philosophy/guild-metaphor/CLAUDE docs. Transcripts, commission log, coco log, git history, and other higher-volume sources are deferred.
- **Surfacing override-rate × confidence in a CLI or dashboard.** This commission records the data on the PlanDoc; any reporting surface (aggregation, CLI subcommand, downstream observers) is a separate follow-up.
- **Rigs other than `plan-and-ship`.** If other rig templates also run planning, extending them is out of scope unless they share the plan-and-ship pipeline structure trivially.

## References

- Parent design click: **c-mo3d6trd** — Patron Anima design.
- MVP scope: **c-mo3o0euk** (concluded) with collated shape in **c-mo3o2cm3** (authoritative MVP cut).
- Supporting design decisions:
  - c-mo3o292o — pipeline position
  - c-mo3o28hb — output shape and override × confidence instrument
  - c-mo3o2bqi — self-uncertainty handling
  - c-mo3o2b49 — single role (not a family)
  - c-mo3o2a8h — corpus and principles-list format
  - c-mo3tivzf — skip-when-unset, no framework default
- Deferred siblings:
  - c-mo49zsst — planner meta-heuristics for low-confidence (separate commission later)
  - c-mo3phwj6 — mid-plan analyst-initiated consultation (parked)
  - c-mo3u8ay0 — socratic-interview corpus refinement (parked)
  - c-mo4bi1gy — per-decision patron sessions (alternative to MVP single-session)