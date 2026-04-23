`packages/plugins/astrolabe/pages/astrolabe/astrolabe.js:560-602` renders the decision detail row when a row is clicked. It reads `d.context`, `d.options`, `d.recommendation`, `d.rationale`, and `d.patronOverride` — but **not** `d.patron`. After the patron-anima fix lands and the engine starts populating `Decision.patron` with verdict / selection / confidence / rationale, none of that information will be visible in the operator UI.

The UI currently has no visibility into:
- whether the anima confirmed, overrode, or filled in
- what confidence the anima emitted (`high`/`med`/`low`)
- the anima's rationale (e.g., which principle fired)
- whether the anima abstained vs. never ran (after the fix, abstention will result in `Decision.selected` being cleared and the decision surfaced to the patron via decision-review's existing flow, but the operator looking at the completed plan in the Astrolabe page won't see *why* the patron got the question)

Not in scope for the bug fix, but planners and patrons will quickly want this once the anima starts emitting real data. Consider a follow-up commission to render `d.patron.verdict`, `d.patron.confidence`, and `d.patron.rationale` in the decision detail row, with a distinct visual (e.g., a coloured badge per verdict).