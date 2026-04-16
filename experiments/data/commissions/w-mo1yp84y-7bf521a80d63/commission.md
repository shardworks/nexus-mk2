# Update Astrolabe sage instructions with value-laden razor and three codified defaults

## Goal

Codify the findings from the planner-redesign umbrella (`c-mo1mq93f`) into the Astrolabe sage instructions. Apply a sharp razor for which decisions surface to the patron, and three policy defaults for decisions that would otherwise surface. Expected effect: drop patron override rate from the ~3.7% baseline (see `c-mo1yb8zb`) toward ~2%, without expanding the set of surfaced decisions.

## Source Material

- **Razor for value-laden decisions** — concluded click `c-mo1yb8aj`
- **Codified policy defaults** — concluded click `c-mo1yb8nf`
- **Empirical baseline** — concluded click `c-mo1yb8zb` (3.7% override rate across 38 specs / ~945 decisions)
- **Umbrella** — `c-mo1mq93f` (Redesign Astrolabe planner for intent-and-constraints specs)
- **Shipped precedents** — `w-mo0ypqs4` (v1 task manifest), `w-mo0yqdyr` (v2 task-loop engine)
- **Archived context** — `docs/archive/quests/w-mo0v636y-41c8aeff857f.json` (original planner-redesign quest body)

## The Razor

A planner decision surfaces to the patron only if it falls into one of five categories:

1. **Vocabulary/pattern establishment** — new guild terms, categorical distinctions, patterns other code will follow.
2. **Human-facing surface** — CLI text, error messages, agent personalities, doc phrasing, UX details.
3. **Scope boundary** — cutlines between commission and follow-up; 'should we also do X?' questions.
4. **Shape of persisted or inter-component data** — typed vs opaque, required vs optional, configured vs convention, when other components will consume the shape.
5. **Component responsibility boundaries** — who owns a behavior across engines/tools/apparatuses, when the decision sets a pattern for ownership.

All other decisions: pick and record. Planner uncertainty is not a surfacing signal — it is a cue to investigate more (read the codebase, check conventions, look at git history).

## The Three Codified Defaults

When resolving decisions that do not meet the razor, apply these defaults:

1. **Prefer removal to deprecation.** When refactoring, rip out the old path. No deprecation windows unless the patron explicitly asks.
2. **Prefer fail-loud to silent fallback.** Throw on missing input; no defaults-when-absent unless the absent case is a legitimate state.
3. **Extend the API at the right layer; don't route around it.** If the recommendation involves a workaround or 'the anima handles it via prompt,' default to adding the method/tool instead.

## Scope

Decisions surface during the reading-analyst stage, are recommended and audience-tagged during the analyst stage, and are rendered in the final doc during the writer stage. The razor must apply at the point of identification, not just the point of rendering. Changes apply across all four sage roles:

- **sage-reading-analyst instructions** — PRIMARY TARGET. Apply the razor when identifying decisions. A decision only gets tagged for patron audience if it matches one of the five razor criteria. Uncertainty about a non-razor decision is a cue to investigate more (extend the inventory scan, check codebase patterns), not to surface.
- **sage-analyst instructions** — apply the three codified defaults when picking among options for non-surfaced decisions. Also enforce the razor at audience-tagging: decisions with patron audience must cite the razor criterion that surfaces them.
- **sage-writer instructions** — render decisions faithfully; no razor logic here. Update to match any record-format adjustments from analyst changes.
- **sage-reader instructions** — no change expected. Reader produces the inventory; razor is downstream.

## Out of Scope

- Preference-model / correction-graduation automation — dropped per `c-mo1mq9f6`
- Handoff notes for implement-loop — dropped per `c-mo1mqa1y`
- Tiered plumbing distinctions — scrapped per `c-mo1mq9qa`
- Atlas staleness work — separate cluster `c-mo1mqhes`
- Decision record format changes beyond razor-citation (keep current fields: question, options, selected, rationale, confidence, audience)

## Acceptance

- All four sage instruction files updated as described above.
- sage-reading-analyst instructions explicitly list the five razor criteria and the investigation-before-surfacing rule.
- sage-analyst instructions explicitly list the three codified defaults and require razor-citation on patron-audience decisions.
- Verification: dispatch the planner on 3-5 matched commissions post-change; measure override rate vs the 3.7% baseline. Target: below 2.5%.
- Decisions the analyst tags as patron-audience must be explainable via one of the five razor criteria.