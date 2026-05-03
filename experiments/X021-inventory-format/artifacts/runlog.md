# X021 Runlog

Live tracking for the X021 inventory-format trial sequence. Coco
appends to this as trials land. Each trial row carries the
canonical reference data; per-trial findings/observations land
under the section below the table.

**Click:** `c-mophvf0d`. **Spec:** [`spec.md`](../spec.md).

## Trial sequence

Run order is sequential. Spider concurrency on the lab host
serializes trials anyway, but we deliberately wait for each to
land + a quick review before posting the next.

**Note:** all trials wait for guild restart. Briefs and manifests
were redesigned 2026-05-03 ~15:00 UTC after a brief-content flaw
was found mid-trial-1. See trial 1 history below for details.

| # | manifest | purpose | trial writ | rig | status | cost | duration | pure-read % | notes |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `rig-moj12h4o-baseline.yaml` | calibration (substantive, spec-only) | `w-mopwwgug` | `rig-mopwwji2` | **failed (timeout)** | **~$77.30** | 43m impl + 14m stuck | **71.0%** | implementer committed at turn 157, then stuck; session killed during recovery; trial timed out at 60min |
| 2 | `rig-moj12h4o-v1-inline-types.yaml` | #3 — additive type-sigs preamble | — | — | — | — | — | — | targets autonomous-orientation reads on types.ts files (~63 KB pure-read in production) |
| 3 | `rig-moj12h4o-v2-inline-templates.yaml` | #4 — pattern excerpt in `## Existing Patterns` | — | — | — | — | — | — | targets template-cite reads on summon-relay/decline-relay (~31 KB pure-read) |
| 4 | `rig-moj12h4o-v3-do-not-read.yaml` | #5 — additive do-not-Read list | — | — | — | — | — | — | targets speculative reads on adjacent/barrel/test files (~50 KB pure-read) |
| 5 | `rig-moj12h4o-v4-combined.yaml` | combined — H1 sustain | — | — | — | — | — | — | gate: ≥15% reduction vs row 1 |
| 6 | `rig-moji64hs-baseline.yaml` | control calibration | — | — | — | — | — | — | — |
| 7 | `rig-moji64hs-v4-combined.yaml` | control variant — H3 | — | — | — | — | — | — | gate: within ±5% of row 6 (only #4 has surface on this rig) |

**Reference data (from production, for orientation):**

- rig-moj12h4o (substantive) full-rig cost $47.26, sealed at draft base SHA `b92dc905`. Implement-portion estimate: ~$25–35. Production implementer transcript pure-read share: **49.1%** (225K chars across 13 files).
- rig-moji64hs (control) full-rig cost $20.39, sealed at draft base SHA `d6e34097`. Production implementer transcript pure-read share: **1.9%**.

## Hypothesis status

- **H1** — Combined v4 cuts substantive cost ≥15% on rig-moj12h4o vs baseline.
  - **Status:** unresolved. Needs row 5 vs row 1.
- **H2** — Per-idea contribution roughly additive, ordered #3 ≥ #4 ≥ #5.
  - **Status:** unresolved. Needs rows 2/3/4/5 to compare.
- **H3** — Control variant produces ~no effect (within ±5% of control baseline).
  - **Status:** unresolved. Needs row 7 vs row 6.

## Trial run history

### Trial 1 — substantive baseline (calibration)

- **Writ:** `w-mopursfj`
- **Posted:** 2026-05-03T14:15 UTC
- **Status:** open, queued

#### Pickup delay (2026-05-03 ~14:30 UTC)

Sean noted that spider was blocked on a bug in the scenario
engine (synchronous, blocking the spider thread). He resolved it
and the trial picked up.

#### Pickup (2026-05-03 14:34 UTC)

Rig `rig-mopvfpog-a628ccab` spawned. Setup / scenario / probes /
archive / teardown phase engines all completed (orchestration
scaffold). The actual `scenario` engine (`lab.commission-post-xguild`)
is running — this is where the implementer commission lives.
Probes and archive phases are pending the scenario terminal.

#### Reposted (2026-05-03 15:15 UTC) — corrected baseline

After redesign committed (commit `fcc00fef`), reposted the
substantive baseline with the spec-only brief (~25 KB matching
production prompt). Trial writ `w-mopwwgug`. Outer rig
`rig-mopwwji2-522df98b` spawned.

#### Failed (2026-05-03 16:16 UTC) — timeout, stuck-after-finish

The implementer ran cleanly from 15:15:28 → 15:58:39 UTC (43 min,
159 turns), reaching turn 157 with `git commit -m "feat(reckoner):
switch evaluation from CDC to periodic tick"` followed by `git
status -s` to verify clean. **Implementer's actual code work was
complete.**

But the babysitter never signaled the implement engine terminal
(documented click `c-moj6ue1g` — stuck-after-finish). The session
sat idle for 14 minutes. At ~16:11 UTC, in an attempt to unstick,
Coco killed the claude+babysitter+test-guild daemon and restarted
just the daemon. Sean clarified afterward that he meant only the
daemon should be killed (not the implementer); by then it was too
late.

The outer scenario engine timed out at the 60-min cap (16:16 UTC)
because the inner test-guild rig never reached terminal. Trial
writ + outer rig both transitioned to **failed**.

**Implementer-side data captured (substantive output despite trial-level failure):**

| metric | value |
|---|---|
| First turn | 2026-05-03T15:15:28.658Z |
| Last turn | 2026-05-03T15:58:39.481Z (committing the work) |
| Wall-clock (actual implement time) | 43 min |
| Wall-clock (idle stuck-after-finish) | +14 min before killed |
| Turns | 159 |
| Tokens in | 169 |
| Tokens out | 112,308 |
| Cache reads (cumulative across turns) | 40,617,827 |
| Cache creates | 423,779 |
| **Estimated cost (Opus, 5-min cache TTL)** | **$77.30** |
| Total Read content | 462,879 chars |
| Pure-read content | 328,826 chars across 18 files |
| **Pure-read share** | **71.0%** |

**Comparison with production rig 2:**

| metric | production rig 2 (full rig) | X021 lab baseline (impl only) |
|---|---|---|
| Pure-read share | 49.1% | **71.0%** (+22pp) |
| Pure-read content | 225 KB | **329 KB** (+46%) |
| Total Read content | 459 KB | 463 KB (≈) |
| Cost | $47.26 (whole 13-engine rig) | **$77.30** (just implement) |

**Cost concern.** The implement engine alone in the lab cost ~1.6x
the entire production rig (planning + implement + review + revise
+ seal + observation lift). At $77/trial, the seven-trial sequence
projects to **~$540** vs the spec's $50–$120 estimate.

The pure-read share went *up* (49% → 71%), not down — the lab
implementer is reading more orientation/test/source content than
production did, despite the brief now matching production's spec
content byte-for-byte modulo the cwd preamble. Diagnosis pending.

The committed code is in the test-guild's draft worktree at
`x021-rig-moj12h4o-baseline-f754b5c7/.nexus/worktrees/.../draft-mopwwxrg-c7178434`
should we want to inspect work quality.

#### Cancelled (2026-05-03 ~15:00 UTC) — design flaw discovered

While trial 1 was running, Sean flagged a flaw in X020's design
(it was using the original writ body as the implementer brief
instead of the plandoc's spec content). Coco verified by
inspecting both production implementer transcripts:

- The production rig-moj12h4o implementer received a **26 KB
  prompt** consisting only of the plandoc's `spec` section.
- The production rig-moji64hs implementer received a **22 KB
  prompt**, same shape.
- Neither implementer made any plandoc tool calls, `.nexus/`
  reads, or MCP tool calls — confirming the spec content in the
  initial prompt was the entire input.

The X021 baseline brief I'd extracted was 61 KB (inventory + scope
+ decisions + observations + spec all concatenated) — 2.4× the
content production saw, with most of the variance in sections
production never received. The variants v1/v3 transformed the
inventory section, which the production implementer never sees.
v2's pattern-citation transformation was on a transformation
target that *did* exist in the spec, so v2 was salvageable.

**Decision:** redesign cleanly (option A — cancel + re-extract).
Variants reframed as additive interventions to the spec:

- v1 (#3) → ADD a `## Type signatures (inlined)` section
- v2 (#4) → TRANSFORM the spec's `## Existing Patterns` section
- v3 (#5) → ADD a `## Files you do not need to Read` section
- v4 → all three combined

Trial 1 cancelled at 15:00 UTC. No follow-on trials to be posted —
Sean will restart the guild when ready.

The original (broken) briefs and manifests are preserved in the
git history as commits `cd740482` (verbatim baselines) and
`0b931770` (variant briefs). The corrected briefs replace them
in-place at the same paths.

#### First post (cancelled, host-restart timing)

- Writ `w-mopi5qtn` posted 08:22 UTC.
- Trial-guild daemon spun up, fixtures completed, implement engine started.
- Vibers daemon was restarted around 08:29 UTC; the trial guild's daemon went down with it and never recovered. The implement engine had not yet produced any code edits at that point — only setup phases had completed.
- Cancelled at 14:10 UTC after 5h 48m of stuck-in-running state.
- No spend on Anthropic side (the implementer session never ran far enough to make billable calls). Lesson: if the lab host is restarted mid-trial, the test-guild daemon does not get re-spawned automatically.
- Documented as click `c-mop6kxqm` (cancelling a trial writ should tear down its daemon — observation).
- Reposted as `w-mopursfj` after Sean confirmed processes were clean.

## Cumulative spend

| | trials | implementer billed | total |
|---|---|---|---|
| Estimated (spec) | 7 | $5–$15/trial | $50–$120 |
| Actual to date | 0 completed | $0 | $0 |

(Trial 1 first post cancelled before billable implement work; counted as $0.)

## Open questions / decisions to revisit

- **N=2 expansion threshold.** Spec says N=1 directional first; expand if signal warrants. Concrete trigger: if v4 substantive lands within 5–15% reduction (margins where N=1 variance could swamp the signal), run a second v4 substantive before declaring outcome.
- **Tier 3 quality gate (deferred per Sean).** Currently relying on Tier 1 (seal/tests) + Tier 2 (manual diff vs baseline sealed commit). If Tier 1+2 flag concern, escalate then.
- **#6 vestigial-reference cleanup** and **#7 pre-quoted excerpts** are out of scope for X021. Worth their own experiments after X021 lands (separate spinoff).

## Beyond the sequence (post-trial work)

- [ ] Write `results.md` with H1/H2/H3 verdicts + recommendation.
- [ ] Conclude or transition click `c-mophvf0d` based on outcome.
- [ ] Update parent landscape click `c-mok4nke6` with measured Category 2 savings.
- [ ] If H1 sustained: spawn follow-up child click for sage-writer prompt change (Phase 2 / Lever B).
- [ ] Sweep stale lab-guild dirs at `/workspace/vibers/.nexus/laboratory/guilds/x021-*`.
