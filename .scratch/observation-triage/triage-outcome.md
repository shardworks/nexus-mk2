# Observation-set triage — outcome (2026-04-28)

Companion to `triage-summary.md` (the proposal). This is what was actually executed.

## Headline

- **414 unpromoted observation children** entered triage.
- **390 cancelled & link-traced** to umbrella/sweep parents.
- **14 cancelled outright** (no archival value).
- **7 lifted to clicks** (open design questions, not obligations).
- **17 kept** under their original observation-set parents (real focused follow-ups).
- **3 subsystem umbrella writs** + **5 sweep writs** created (all in `new` draft phase, codex `nexus`, marked DO NOT DISPATCH).
- **5 empty sweep writs** cancelled (their content was absorbed by the subsystem umbrellas).
- **1 stale `_plan/` directory** removed from the framework repo root and pushed.

Net: books drop from 414 unpromoted observation children to 17 retained + 3 holding-pen umbrellas + 5 active doc-hygiene drafts + 6 lifted clicks. **Books are 89% lighter.**

---

## Subsystem holding-pen umbrellas

Top-level draft mandates created to gather observations for areas under heavy active churn. **All marked DO NOT DISPATCH** — reopen and triage once the in-flight ladder commissions settle.

| Umbrella | Subsumed | Writ id |
|---|---|---|
| Reckoner subsystem cleanup holding-pen | 83 obs | `w-moi2tbwq-941d52dcb63e` |
| Clerk subsystem cleanup holding-pen | 72 obs | `w-moi2tl6x-e7a3f7ad7788` |
| Clockworks/events subsystem cleanup holding-pen | 133 obs | `w-moi2tlp3-878ea870361a` |

The Reckoner umbrella covers: legacy queue-observer rename to sentinel, new petition-scheduler skeleton + CDC handler, petitioner-registration design, reckonings book design, vision-keeper kit, cartograph integration.

The Clerk umbrella covers: T2/T3/T5 ladder follow-ons, multi-type writ machinery, `WritDoc.ext`/`setWritExt`, classification migration in downstream consumers, parent-terminal cascade work.

The Clockworks umbrella covers: C1–C5 events ladder, dropped sugar forms, daemon + cron + tick CLI, CDC auto-wiring, signal validator replacement.

## Doc-hygiene sweep writs (kept active)

These survived because they have observations attached and the doc is outside the three hot subsystems:

| Sweep | Subsumed | Writ id |
|---|---|---|
| `docs/architecture/apparatus/spider.md` post-MVP refresh | 36 obs | `w-moi2w7rn-86be04d5084f` |
| Animator follow-ups holding-pen | 24 obs | `w-moi2wcmo-fcd6f18fe68a` |
| Claude-code complexity-diagnosis follow-ups | 15 obs | `w-moi2wc2i-0e77e3e5d6cf` |
| Spider dashboard UX polish (badges, em-dash, aria) | 8 obs | `w-moi2wbg0-f77346abf329` |
| `docs/architecture/index.md` legacy-plugin-id sweep | 2 obs | `w-moi2v2fc-2ba5c1e9294f` |
| CLI tool auto-builder v2 | 2 obs | `w-moi2wdqr-4ae529c3f925` |
| `docs/reference/core-api.md` post-v2 refresh | 1 obs | `w-moi2v1gl-702ac6d3f4ad` |

All are draft mandates with codex `nexus`. Their bodies enumerate the observations they cover.

## Empty sweep writs (cancelled)

Created speculatively but received zero observations after categorization (their would-be content got absorbed into the three subsystem umbrellas). Cancelled with a note pointing to this doc:

- `docs/reference/schema.md` post-shipped-types refresh
- `docs/guides/adding-writ-types.md` post-T2 rewrite
- `docs/guides/building-engines.md` engine-factory disambiguation
- `docs/architecture/apparatus/animator.md` post-rate-limit refresh
- Cross-cutting kit-collision validator + kebab-suffix grammar

The underlying concerns are not lost — they live inside the subsystem umbrella bodies and in this triage record.

## Lifted to clicks

Open design questions wearing writ clothing. Lifted to clicks under root (no obvious existing parent), original writs cancelled with a pointer.

| Click | Goal | Source writ(s) |
|---|---|---|
| `c-moi3li0a` | Apparatus shutdown lifecycle (Arbor never calls `apparatus.stop()`, Clockworks no-op, Instrumentarium missing, `clearGuild()` JSDoc stale) | `w-moei8qt3` + `w-moei8qok` |
| `c-moi3lign` | `--apply` dry-run convention for bulk-mutation CLI tools | `w-moehxoql` |
| `c-moi3liww` | Static workspace analysis tooling pattern | `w-moedt97n` |
| `c-moi3ljc8` | `tool()` factory outside the CLI | `w-moedt9eq` |
| `c-moi3ljs6` | Root `package.json` script naming convention | `w-moedt9cx` |
| `c-moi3lk9f` | `/testing` subpath audit across plugin packages | `w-moedt9b6` |

## Cancelled outright

| Reason | Count |
|---|---|
| Brief meta-observations (planning-artifact staleness) | 11 |
| "Future commission needed" stubs (already tracked via clicks) | 3 |

These add no archival value — the brief meta-obs are about the staleness of the planning artifacts themselves, which become irrelevant once the commission ships. The future-commission stubs are duplicated trackers for work already covered by clicks under the relevant subtree.

## Kept under original parent

These 17 are **real focused follow-ups** that belong with their commission's observation-set:

**Scriptorium / detached-HEAD** (3) — `w-moi18ssy`, `w-moi18sqt`, `w-moi18son` — worktree-state docs, detached-HEAD warning, error message.

**Engine-retry override** (3) — `w-mof33jdv`, `w-mof33jbw`, `w-mof33j7u` — Fabricator API surface, test-fixture mutability, max-attempts visibility.

**Lattice pulse polish** (4) — `w-moeom3v1`, `w-moeom3p7`, `w-moeom3nb`, `w-moeom3le` — payload size cap, per-trigger renderer, channel rendering contract, contextFields registry.

**Predicted-files gate downstream** (4) — `w-moed18ow`, `w-moed18n0`, `w-moed18l9`, `w-moed18ht` — auto-decompose, accuracy validation, UI surfacing, brief naming refresh.

**Astrolabe cost panel** (3) — `w-mod5x7mk`, `w-mod5x7ko`, `w-mod5x7iu` — n+1 session fetches, failure-mode collapse, `RigView` shape unification.

These will get worked through naturally as their parent commissions' areas come back into focus. They're appropriately scoped, narratively grouped, and not redundant with anything in flight.

---

## Pre-existing completed (not affected)

24 observation children already in `phase: completed`. These were promoted by a curator before triage — left alone.

---

## What this means for the books

| State | Before | After |
|---|---|---|
| Total observation children | 438 | 438 |
| Unpromoted (`new`) | 414 | 17 |
| Cancelled (`cancelled`) | 0 | 397 |
| Completed (`completed`) | 24 | 24 |
| Subsystem umbrellas (drafts) | 0 | 3 |
| Active sweep writs (drafts) | 0 | 7 |
| Cancelled empty sweeps | 0 | 5 |
| New clicks | 0 | 6 |

Active drafts in the books awaiting future curator review: **3 umbrellas + 7 sweeps = 10 writs** vs the 414 the curator was previously staring at.

---

## What was preserved as record

Every cancelled writ carries:
1. A `subsumed by …` link to its umbrella/sweep target (queryable via `nsg writ link-kinds-show` or db query on `books_clerk_links`).
2. A resolution string starting with `Subsumed by w-… Reason: …` so the audit trail is greppable.

Each umbrella/sweep writ's body explicitly enumerates the categories of observations it absorbs. Combined with the link table, you can reconstruct the full disposition for any observation by id.

---

## Files affected

- `_plan/` (framework repo root): deleted, committed `b68fa39`, pushed.
- 397 observation writs cancelled in the guild's books.
- 6 clicks created.
- 15 holding-pen / sweep writs created (5 subsequently cancelled as empty).
- DB-level patch: 6 sweep writs that were dispatched-and-failed (codex `null` → plan-init throw) reset to `phase: new` with `codex: nexus`. Failed rigs deleted.
