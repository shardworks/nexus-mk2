# Next Work — Priorities

Updated: 2026-04-02

## Priority 1: Rigging Review Loop

**Why first:** This is a quality multiplier at the execution layer. Every commission
that comes back clean is one the patron doesn't have to re-spec and re-dispatch.
Empirically ~40% of commissions have needed revision — automating the inner
review loop attacks the biggest source of patron friction.

**Status:** Seed spec drafted at `.scratch/specs/rigging-review-loop-seed.md`.
Next step: dispatch to nexus codex to expand it into a full design doc
at `docs/architecture/apparatus/review-loop.md`.

**Pointers:** Architecture at `/workspace/nexus/docs/architecture/rigging.md`,
origination design at `docs/future/origination-engine-architecture.md`.

## Priority 2: Guild Operations Dashboard

**Why second:** Makes patron ops faster — commission status, session status,
posting form. Pure quality-of-life for the patron workflow. Doesn't improve
output quality directly, but reduces the friction of operating the guild.

**Status:** Idea stage. No spec yet. Existing notes at `docs/future/dashboard-monitor/`.

**Notes:** This is guild ops only — no lab/experiment instrumentation. Commission
status, session status, form for sending commissions. Could be a simple CLI
tool or a lightweight web UI.

## Priority 3: Loom Content (Agent Instructions)

**Why third:** Better standing instructions = better first-try quality. Feeds
X013's research question about spec quality vs outcomes. But the review loop
(Priority 1) addresses the same problem from a different angle — catch errors
after the fact rather than preventing them. Both are valuable, but the review
loop has higher expected ROI because it works regardless of instruction quality.

**Status:** Known gap documented in `docs/future/known-gaps.md` (role instructions
not upgradeable, animas don't know to commit). The commit instruction is currently
a stopgap in dispatch.sh.

**Notes:** Could itself be a commission — dog-food the pipeline. But the Loom
apparatus needs role instruction support first (currently future work).

## Completed / Superseded

- ~~Patron review of w-mnhq6gpv and w-mnhq8v8z~~ — done
- ~~Quality scorer manual runs~~ — done
- ~~Commission log gap-fill~~ — done (except w-mnhq8v8z outcome, in progress in another session)
- ~~Uncommitted sanctum changes~~ — in progress in another session

## Backlog (no priority assigned)

- Clean out completed specs from `.scratch/specs/`
- Clockworks event system (deferred — not needed yet, CDC covers observation)
- Scorer blind/aware divergence as X013 data point
- `inscribe.sh` archival (superseded by `dispatch.sh`)
