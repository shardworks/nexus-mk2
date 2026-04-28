# Observation-set triage — 2026-04-28

## Shape of the problem

- **68 `observation-set` parent writs**, each lifted from the planning run of one commission.
- **438 child mandate writs** beneath them.
  - **414 in `phase: new`** — drafts that were lifted but never promoted to action.
  - **24 in `phase: completed`** — the only ones that made it through curator review and shipped.
- **Promotion rate ≈ 6%.** The other 94% are sitting in the books, undirected, contributing to perceived weight without contributing to outcomes.

The lift mechanism is doing what it was designed to do (capture every observation a planner notices), but the curator is the bottleneck and the writ count is the dragon's tail.

## Why it feels like a cycle

It is a cycle, and the cycle has a clear shape:

1. Plan a commission → the planner lifts ~5–12 observations.
2. Each observation becomes a child mandate writ in `new`.
3. When *any* of those writs is later turned into its own commission, **its** planning run lifts another 5–12 observations.
4. The branching factor is ≥1, so the tree never converges.

Worse, most of the observations are not bugs or design questions — they're **doc drift**. And the doc drift is mostly self-healing: the next time anyone touches the doc, the stale text falls out naturally. Lifting doc drift as a discrete writ creates an obligation that the system has already implicitly committed to discharging via normal traffic.

The two structural causes:

- **No quality gate on lift.** A planner emits anything that catches its eye; everything becomes a writ.
- **Wrong primitive for ~half of these.** "This doc still says X" is not an obligation in any meaningful sense — it's a sticky note. Modeling it as a mandate (with a phase machine, retry policy, dispatch path) overcommits the substrate.

## Cross-parent duplicate clusters

These are the same observation appearing under multiple parents. **Every cluster collapses to one writ (or zero).**

| Count | Cluster | Disposition |
|---|---|---|
| 15 | Reckoner rename / split / sentinel hand-off | Already covered by the in-flight Reckoner subtree (`c-mod99ris` and children). **Discard all 15** — the Reckoner work owns these. |
| 8 | `RESERVED_EVENT_NAMESPACES` references in docs | One sweep-PR. **Collapse to one writ** — "delete every `RESERVED_EVENT_NAMESPACES` reference in docs/." |
| 6 | `summon:` / `brief:` sugar still in docs | Same shape — one sweep. **Collapse to one writ.** |
| 6 | Dashboard badge / aria polish | One UX-polish writ across spider/animator/feedback dashboards. **Collapse to one.** |
| 5 | `commission.*` event rename drift | One sweep covering events that got renamed in C2/C4. **Collapse to one.** |
| 5 | Stale `_plan/` at repo root | This is *one git rm*. **Collapse to one trivial chore.** Probably should just be done now without a writ. |
| 5 | `piece` → `step` rename leftovers | Already a known sweep — should fold into the rename commission's tail or a single follow-up. **Collapse to one.** |
| 4 | `guild-vocabulary.md` updates | Per the vocabulary-discovery habit, these belong as edits made when the relevant vocabulary is touched. **Discard as writs**; track as a single "vocabulary-tome refresh" click if useful. |
| 4 | `apparatus.stop()` never invoked | Real architectural gap (Arbor lifecycle). **One writ** under the lifecycle/shutdown subtree. |
| 3 | `session.*` event rename drift | Roll into the C4 sweep writ. **Collapse to one.** |
| 3 | Kit-collision validator / framework-wide policy | Real cross-cutting design. **One writ** — "extract framework-wide kit-collision validator." |
| 3 | `core-api.md` drift | One refresh sweep. **Collapse to one.** |
| 3 | `nexus-*` legacy plugin id drift | One sweep. **Collapse to one.** |
| 3 | `TERMINAL_STATUSES` defined in 4 files | One DRY refactor. **One writ.** |
| 2 | `schema.md` drift | One refresh. **Collapse to one.** |
| 2 | em-dash placeholder dedupe | One small DRY refactor. **One writ.** |
| 2 | CLI tool auto-builder gaps | Real surface area — `program.ts` has 5 separate observations. **One umbrella writ** "CLI tool auto-builder v2". |
| 2 | mandate-phase string hardcoding (post-T5 classification migration) | Real follow-on work, owned by the T5/T6 ladder. **One writ** under the cascade-engine subtree. |
| 1 | kebab-suffix grammar regex | Tiny DRY. **One writ.** |

**Net effect of dedupe alone: 88 writs collapse to ~17.**

## Per-file concentration (top doc-drift hotspots)

These files are touched by many observations because they're undergoing active churn. Most of these will be rewritten in the natural course of the in-flight work.

| File | Observation count | Recommendation |
|---|---|---|
| `docs/architecture/clockworks.md` | 26 | Single comprehensive refresh writ. The sub-issues are all variants of "this doc lags the C1–C5 ladder." |
| `docs/reference/event-catalog.md` | 22 | Same — one refresh writ. |
| `packages/plugins/clerk/src/clerk.ts` | 16 | Mostly post-T2/T3/T5 follow-ons, mixed with real bugs. **Triage individually.** |
| `docs/architecture/apparatus/clerk.md` | 15 | One refresh writ. |
| `packages/plugins/clockworks/src/types.ts` | 14 | One refresh writ + a couple real-design issues teased out. |
| `packages/plugins/clerk/src/types.ts` | 13 | Mixed — real type-narrowing items + drift. Triage. |
| `docs/architecture/apparatus/reckoner.md` | 10 | Already owned by the Reckoner-rename / new-Reckoner work. **Discard as standalone writs.** |
| `docs/architecture/index.md` | 10 | One refresh sweep. |
| `packages/plugins/clockworks/src/clockworks.ts` | 9 | Mostly forward design; triage. |
| `docs/reference/core-api.md` | 8 | One refresh sweep. |
| `packages/plugins/reckoner/src/reckoner.ts` | 8 | Mostly Reckoner-subtree-owned; discard. |
| `packages/plugins/claude-code/src/babysitter.ts` | 8 | Already covered by the babysitter-runtime extraction commission's plan. Some are good follow-ons. Triage. |

**Heuristic:** any file with 5+ observations is in active flux. The right move is one umbrella refresh writ per file, not ten individual writs.

## Categories — what's actually in the 414

After dedupe and clustering, the residual breakdown:

### Tier 1 — Actually useful, lift to clicks or commission soon (~30 items)

These are real bugs, real soft hazards, or real design questions that deserve a click in the appropriate subtree.

**Soft hazards / latent bugs:**
- Concurrent dispatch races on `event_dispatches` and `summon-relay sessionAttempts` (2 obs, real)
- `parseChildFailures` regex matches free-text resolutions opportunistically (real, edge case)
- `recordSession` doesn't read existing before terminal write (animator inconsistency)
- `MAX_CASCADE_DEPTH = 16` error message is misleading on legitimate deep hierarchies
- `AnimatorStatusDoc` index signature swallows arbitrary fields (schema drift surface)
- `book.*` namespace unreserved → anima can spoof CDC events (already partially closed by C3)
- `reckoning.` namespace unreserved
- Spider's `failEngine` / rescue tool transactional atomicity audit
- Stacks `transaction()` semantics for chained `transition` + `setWritStatus` calls
- Arbor never calls `apparatus.stop()` — real lifecycle gap
- Spider rig completion bypasses children-terminal preflight on writ completion

**Cross-cutting design (good clicks under existing subtrees):**
- Framework-wide kit-collision validator (Clerk/Spider/Fabricator/Reckoner)
- Kebab-suffix grammar regex shared helper
- Per-trigger pretty rendering for `pulse-show` and unified `RigView` shape
- CLI tool auto-builder v2 (Zod object/record support, optional positionals, exit-code semantics, caller context)
- AsyncLocalStorage-backed pluginId stamping (rejected for Reckoner; revisit globally)
- JSON-path indexes on `writs.ext` once Reckoner consumers exist
- Pulse payload size cap in Lattice
- Petition payload size cap in Reckoner

**Substrate / typing improvements:**
- `WritFilters.phase` typing mandate-narrow but runtime accepts any string
- `Children-summary count` typed `Record<WritPhase, number>` mandate-narrow
- `EngineRetryConfig` duplicated between fabricator and spider types
- `SpiderStuckCause` widening discipline
- `ClerkApi` has no `delete` primitive (real ergonomic gap; cartograph already worked around it)

**Real DRY refactors with payoff:**
- `TERMINAL_STATUSES` defined in 4 files
- Source-mode (`.ts` vs `.js`) detection in 3 places (claude-code)
- Multi-apparatus boot fixture duplicated in 3+ integration tests → shared testing helper
- `MANDATE_CONFIG` duplicated between clerk.ts and children-behavior-engine.test.ts

**Recommendation:** these ~30 items become ~15–20 clicks/writs after further dedup, slotted under existing subtrees. Many already belong under `c-mo1mqeti` (writ↔rig substrate) or the children-behavior subtree.

### Tier 2 — Doc-drift sweeps, batch by file (~150 items)

These are real but low-value as discrete writs. They collapse into ~10 sweep writs:

1. `clockworks.md` post-C1–C5 refresh
2. `event-catalog.md` refresh
3. `core-api.md` refresh (most of it is pre-MVP relic — consider deletion or wholesale rewrite)
4. `reference/schema.md` refresh
5. `reckonings-book.md` post-C1 refresh
6. `architecture/index.md` refresh (legacy plugin ids, "not yet extracted" language)
7. `apparatus/clerk.md` post-T2/T3/T5 refresh
8. `apparatus/spider.md` refresh (BlockTypes, grafts, templates, tool surface)
9. `apparatus/animator.md` refresh
10. `apparatus/scriptorium.md` worktree-state preconditions

Each sweep writ has acceptance criteria like "grep for `summon:` returns zero hits in this file" or "every event name in this doc appears in the merged kit set." That's testable.

**Recommendation:** dispatch as a single "documentation hygiene sprint" — one commission per doc, run them serially (low conflict surface). Or, more sustainably, **fold doc fixes into whatever commission next touches that file** as a pre-flight step, and stop lifting doc drift as standalone observations.

### Tier 3 — Brief-meta-observations (~10 items, discard)

Things like "this brief cites stale line numbers," "this brief mislocates X file," "mandate body cites pre-T5 line numbers." These are observations *about* the staleness of the planning artifacts themselves. They have no downstream value once the commission ships — the brief becomes archival.

**Recommendation:** discard outright. Stop lifting these.

### Tier 4 — Forward design questions miscoded as writs (~30 items, convert to clicks)

Things like "consider `reckoner.engine-exhausted` distinct trigger," "decide petitions book ownership before Reckoner core," "design hot-edit support for scheduled standing orders," "evaluate parentTerminal for cartograph." These are open questions, not obligations. They want to be **clicks**, not mandates.

**Recommendation:** for each, open a click under the appropriate subtree (most belong under `c-mo1mqeti`, `c-moa42fn6` Reckoner subtree, or the writ-types subtree). Then cancel the mandate writ.

### Tier 5 — "Future commissions" stubs (~15 items, fold into briefs)

Things explicitly tagged "Future commission needed: cartograph CLI surface" / "vision-keeper agent runtime" / "Reckoner integration with cartograph." These are placeholders for commissions someone else will eventually write.

**Recommendation:** cancel as writs. They're tracked correctly elsewhere (the relevant subtree click) — duplicating them as writs adds noise without adding visibility.

### Tier 6 — Test infra / scaffolding observations (~20 items)

"Lift the multi-apparatus boot fixture into a shared testing helper," "duplicate auto-publish wrapper across spider package test files," "Reckoner Phase 2 observer unit tests deeply duplicate the boot scaffolding." Real DRY observations on the test surface, but each one is a small refactor.

**Recommendation:** one umbrella writ — "consolidate integration-test boot fixtures across plugin packages." High payoff because it touches every plugin and reduces drift.

### Tier 7 — Operator-UX nice-to-haves (~30 items, defer)

Daemon log machine-parseability, deprecation warnings on dropped event names, namespace-level help text, per-trigger pretty-rendering, dropdown auto-build from enums, etc. Each is reasonable; none is urgent.

**Recommendation:** keep one "operator-UX polish" tracking click. Pull individual items into commissions only when an operator hits the friction.

### Tier 8 — Already-in-flight or already-known (~30 items, cancel)

Things the active subtrees already cover: Reckoner-subtree work, parent-terminal cascade work, T2/T3/T5 follow-ons, the C1–C5 events ladder, predicted-files gate downstream consumers. These are fine writs in isolation but they're all redundant with active design conversations.

**Recommendation:** cancel as writs; if a specific item adds detail not captured in the parent click, leave a comment on the click.

---

## Net triage outcome

| Disposition | Count | Action |
|---|---|---|
| **Lift to a click or one-liner writ in active subtree** | ~30 | Real follow-ons. Slot under `c-mo1mqeti`, `c-moa42fn6`, or specific design subtrees. |
| **Collapse into ~10 doc-hygiene sweep writs** | ~150 | One sweep per doc. Dispatch as a hygiene sprint, OR fold into next-touching commission. |
| **Convert to clicks (forward design questions)** | ~30 | Open clicks under appropriate subtrees, then cancel writs. |
| **Cancel — already in-flight elsewhere** | ~30 | Redundant with active subtree work. |
| **Cancel — meta-observations about briefs** | ~10 | Pure noise. |
| **Cancel — "future commissions" stubs** | ~15 | Tracked via clicks already. |
| **Cancel — operator-UX nice-to-haves** | ~30 | Keep one tracker click. |
| **Cancel — duplicate of another observation** | ~50+ | Cross-parent dupes, see cluster table. |
| **Genuine but low-priority polish, leave alone** | ~70 | These are the "uncategorized" residual; revisit only if relevant. |

**Books-state goal:** drop from 414 unpromoted observation children to **~20 high-signal writs** plus ~10 sweep writs.

---

## Structural recommendation: stop lifting observations as writs

The current pattern (every planner observation → child mandate) is producing mostly noise. Three possible shifts:

### Option A: Drop the auto-lift entirely

Planners stop creating child writs. The `observation-set` parent writ holds the prose enumeration. The curator reads the parent and **decides which observations deserve a writ on a case-by-case basis**, creating them by hand.

- Pro: cuts ~95% of the noise immediately.
- Pro: forces the curator to actually read each observation before it occupies a writ slot.
- Con: relies on curator attention, which is the current bottleneck. If the curator's bandwidth stays at "promote 6% of observations," the same lift-rate happens, just with cleaner books.

### Option B: Keep the lift, but raise the bar at planning time

Tell the planner: only lift observations that are **(a) a real bug, (b) a real design question, or (c) a code-level dedupe with concrete payoff**. Doc drift, brief meta-observations, and forward-feature placeholders **never** become writs — they stay in the parent's prose.

- Pro: keeps the bookkeeping benefit of structured observation capture.
- Pro: drops the writ count by ~70% while preserving the high-signal items.
- Con: relies on the planner's judgment, which has been generous to date. Need explicit instruction.

### Option C: Lift to clicks, not writs

Most of these observations are *questions* or *parked decisions*, not obligations. Lift them as clicks under a "follow-ons-from-<commission>" parent, not as child mandate writs.

- Pro: matches the substrate. Clicks already are the right primitive for parked questions.
- Pro: clicks have lighter ceremony than writs (no rig template, no engine pipeline).
- Con: clicks aren't action-oriented in the way writs are. If the goal is "queue up future work," clicks under-serve that.

### Recommended: B + C in combination

- **At planning time:** apply a quality bar. Real bugs and real design questions → lift. Doc drift, brief meta, future-commission stubs → leave in the prose only.
- **At lift time:** decide whether the observation is an *obligation* (becomes a writ) or a *question* (becomes a click). Default to click unless there's an artifact to produce.
- **At doc-touch time:** any commission that touches a doc fixes the drift on that doc. No standalone doc-drift writs.

This converts the dragon's tail from an unbounded growth function into something self-limiting.

## Open questions for Sean

1. **Disposition for the existing 414** — do you want me to actually execute the triage (cancel/collapse/migrate), or is the summary enough decision-support for now?
2. **Hygiene sprint** — worth dispatching the ~10 doc-sweep commissions in a batch this week, or fold doc fixes into normal traffic?
3. **Lift policy change** — should I draft an update to the planner's instructions encoding the quality bar in Option B, plus the click-vs-writ disposition rule from Option C?
4. **`_plan/` directory at repo root** — five different observation-sets noticed it. It's a stale artifact from a prior commission. Want me to just rm it?
