# Teach analysts the razor + codify pre-fill defaults; engine fast-paths when nothing is reviewable

## Intent

Add codified policy to the Astrolabe sage instruction files (the razor's five criteria and three pre-fill defaults) and change the decision-review engine so pre-decided decisions are excluded from the InputRequestDoc and plans with nothing reviewable skip the patron-approval gate entirely. The goal is fewer rubber-stamp decisions reaching the patron.

## Rationale

The empirical baseline over 38 specs is a 3.7% override rate — analysts are surfacing many decisions the patron accepts unchanged. The razor (five criteria) gives analysts a sharp test for *what warrants surfacing*; the three codified defaults give them a disposition for *everything else*. Without the engine change, analysts could pre-fill all day and the patron-approval gate would still open — so the engine must honor the analyst's pre-decision by dropping those decisions from the InputRequestDoc and short-circuiting when nothing remains to review.

## Scope & Blast Radius

Changes are confined to `packages/plugins/astrolabe`. There are no cross-plugin changes, no type/schema changes, no rig-template changes, and no tool-registration changes.

Affected systems:

- **Two sage instruction markdown files** — parallel content additions: the new razor section, the new three-defaults section, a revised `selected` pre-fill rule, and an added Process-step note about "investigate, don't punt." Both files must end up with structurally equivalent decision-analysis guidance.
- **The decision-review engine's first pass** — a filter on `selected === undefined` governs both the InputRequestDoc membership and the fast-path condition.
- **The decision-review engine test suite** — new coverage for the filter-and-fast-path scenarios.

Cross-cutting concerns to verify independently (the implementer must audit, not trust this list):

- **Duplicate decision-analysis language across `sage-reading-analyst.md` and `sage-analyst.md`.** Every razor/defaults change must appear in both files. Verify parity by diffing the two decision-analysis sections after editing; the only expected differences are file-local framing (heading levels, surrounding Process steps) — the razor content, three defaults, and pre-fill rule must read the same.
- **References to the old "always pre-fill `selected` with your recommendation" rule.** Grep both sage files for residual phrasing; any survivor is a bug. The new conditional rule must replace, not accompany, the old text.
- **Consumers of the `Decision.selected` field.** The engine's first pass, the reconcile pass, `buildDecisionSummary`, and the invariant check all read `selected`. The analyst-set-`selected` pathway must work through all four — verify the existing invariant check still holds when `selected` is analyst-set rather than patron-set.

**Explicit scope deferral (D11):** The post-change verification pass (dispatching the planner on 3–5 commissions, measuring override-rate vs. 3.7% baseline, measuring gate-shrinkage) is deferred to a follow-up commission. Do not attempt verification here beyond running the automated test suite.

## Decisions

| # | Decision | Answer | Rationale |
|---|----------|--------|-----------|
| D1 | Where should the razor and three defaults live in the sage files? | Two new subsections `#### The Razor` and `#### The Three Defaults` inside `### Decision Analysis`, placed just before the existing "Each decision needs:" field list; rewrite the `selected` field description to reference them. | Co-locates policy with the flow it governs; analysts get stable named vocabulary. |
| D2 | Exact phrasing of the new `selected` pre-fill rule | "If the decision matches any of the five razor criteria, leave `selected` unset. Otherwise, apply the three defaults, pick the answer, and pre-fill `selected` with your choice." | Explicitly names both cases to prevent habitual pre-fill. |
| D3 | Cross-reference razor to existing `analysis.category`/`observable`/`confidence`/`stakes`? | Present the razor as a standalone classification; analysis metadata remains a UX-filter aid and is not logically tied to razor-match. | Keeps the razor a sharp policy tool; no schema change. |
| D4 | How strongly to codify "uncertainty about a non-razor decision is a cue to investigate, not to surface"? | Name it in **both** the razor section (as the "investigate, don't punt" rule) **and** the numbered Process steps / decision-analysis procedure. | Target behavior change; dual placement raises salience. |
| D5 | Ordering and format for the five razor criteria | Use the brief's exact numbering and short names as headers/bullets; expand each with one sentence of definition and one short example question. | Stable numbering matches source material and future reference. |
| D6 | New fast-path condition in the engine's first pass | Fast-path when reviewable decisions is empty **regardless of scope** (scope items are implicitly auto-accepted in that case). | Patron-directed: skip the gate whenever the analyst has settled all decisions, even if scope items exist. |
| D7 | How to treat pre-decided decisions in the InputRequestDoc? | Skip entirely — produce no `questions[id]` entry and no `answers[id]` entry. Only reviewable decisions and scope items populate the doc. | Simpler; no spider schema change; reconcile works unchanged for untouched decisions. |
| D8 | Validate analyst-set `selected`? | No. Trust the analyst; rely on the existing reconcile-time invariant for well-formedness. | Matches existing engine style; reconcile-time invariant is the existing enforcement locus. |
| D9 | `buildDecisionSummary` rendering of auto-decided vs. patron-confirmed decisions | No change. Auto-decided and patron-confirmed `selected` entries render identically. | Spec-writer sees uniform `selected` semantics regardless of origin. |
| D10 | New test scenarios | Add **all** of: (a) fast-path when all decisions pre-decided and no scope; (b) mixed reviewable + pre-decided + scope; (c) pre-decided only with scope; (d) reconcile preserves analyst-set `selected` through the round trip. | Matches the existing test-file thoroughness bar. |
| D11 | Verification pass scope | Ship the code+docs change; defer verification to a follow-up commission. | Out-of-commission for this change; S4 is not executed here. |

**D6 ↔ D10 consistency note for the implementer:** D6 selected scope-agnostic fast-path. Therefore the D10 test scenario "pre-decided only with scope" must assert the fast-path behavior (plan transitions to `writing`, no InputRequestDoc emitted, no input-request block) rather than "only scope questions appear." The four D10 scenarios still each get their own test; only the expected behavior for scenario (c) derives from D6.

## Acceptance Signal

- `pnpm -w --filter @shardworks/astrolabe test` passes, with the decision-review engine describe block containing new tests covering each of the four D10 scenarios; at least one of these tests fails against the pre-change engine code (proving the test actually exercises the new behavior).
- `pnpm -w typecheck` passes.
- Both `packages/plugins/astrolabe/sage-reading-analyst.md` and `packages/plugins/astrolabe/sage-analyst.md` contain `#### The Razor` and `#### The Three Defaults` subsections inside `### Decision Analysis`, with the razor criteria presented in the brief's canonical numbering/format and the D2-worded pre-fill rule replacing the old unconditional rule. A diff of the decision-analysis subsections between the two files shows only file-specific framing differences.
- In both sage files, "investigate, don't punt" guidance appears in both the razor section and a numbered Process step.
- Grepping the repository for `pre-fill.*selected.*with.*recommendation` (case-insensitive) returns no residual matches in sage instruction files — the old unconditional phrasing is gone.
- A plan whose decisions all have `selected` pre-set (regardless of whether scope items exist) transitions directly from `analyzing` to `writing` on the first engine pass, and no input-request block is emitted.

## Existing Patterns

- **Fast-path short-circuit shape** — see the existing `decisions.length === 0 && scopeItems.length === 0` check in `packages/plugins/astrolabe/src/engines/decision-review.ts` (around line 143). The new fast-path is a generalization of this pattern.
- **Conditional-include precedent** — the existing first-pass logic that omits `answers[decision.id]` when `recommendation` is missing (same file, around lines 170–173) is the closest precedent for the new "skip entirely" behavior. The new filter extends the pattern to skip the question, not just the answer.
- **Invariant enforcement style** — the reconcile-time invariant check (same file, around lines 293–302) demonstrates the engine's throw-with-ID-listing style; no new invariant is introduced here but the existing one must continue to pass.
- **Test-file conventions** — `packages/plugins/astrolabe/src/engines.test.ts` already contains the patterns to follow: `completes immediately when plan has no decisions and no scope` (fast-path test shape), `blocks on first run with decisions and scope items` (first-pass InputRequestDoc assertions), `pre-fills answers for decisions with recommendations and scope items` (pre-fill mechanics), and `custom override clears stale selected (regression: dual-state bug)` (pre-set `selected` scenarios — this last one already simulates the "analyst pre-set `selected`" shape the new tests will need).
- **Decision-analysis section layout** — the current `### Decision Analysis` section in `packages/plugins/astrolabe/sage-reading-analyst.md` shows the heading nesting style (`###` section, `####` subsections) and the field-list style to match when adding `#### The Razor` and `#### The Three Defaults`.

## What NOT To Do

- Do NOT modify `packages/plugins/astrolabe/src/types.ts`. No schema changes to `Decision`, `ScopeItem`, `PlanDoc`, or any other type.
- Do NOT modify `packages/plugins/astrolabe/sage-writer.md` or `packages/plugins/astrolabe/sage-reader.md`. The writer's "`selected` means the patron chose a listed option" text is slightly stale under the new semantics, but it is explicitly out of scope — fix it in a separate commission.
- Do NOT add first-pass validation of analyst-set `selected` (e.g., checking the key exists in `options`). Trust the analyst per D8.
- Do NOT add markers, flags, or distinguishing prose to `buildDecisionSummary` to differentiate auto-decided vs. patron-confirmed decisions. They must render identically per D9.
- Do NOT refactor the decision-analysis language shared between `sage-reading-analyst.md` and `sage-analyst.md` into a shared include or canonical single source. Duplication is accepted for this commission.
- Do NOT modify rig templates (`two-phase-planning.ts`, `three-phase-planning.ts`), the `decisions-write` tool, the `astrolabe.ts` tool registration, or `buildAnalysisTags`.
- Do NOT dispatch the planner on commissions to measure override rates or gate shrinkage. Verification is deferred to a follow-up commission per D11.
- Do NOT cross-reference the razor criteria to the existing `analysis.category`/`observable`/`confidence`/`stakes` fields. The razor is presented as an independent classification per D3.