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

| # | manifest | purpose | trial writ | rig | status | cost | duration | pure-read % | notes |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `rig-moj12h4o-baseline.yaml` | calibration (substantive) | `w-mopursfj` | (queued) | open | — | — | — | gate: lab cost within ±30% of $25–35 production-implement portion |
| 2 | `rig-moj12h4o-v1-inline-types.yaml` | #3 alone | — | — | — | — | — | — | predicted: drops Reads on types.ts files (~25K chars) |
| 3 | `rig-moj12h4o-v2-inline-templates.yaml` | #4 alone | — | — | — | — | — | — | predicted: drops Reads on summon-relay/decline-relay (~31K chars) |
| 4 | `rig-moj12h4o-v3-do-not-read.yaml` | #5 alone | — | — | — | — | — | — | predicted: drops Reads on 4 no-change files (~38K chars) |
| 5 | `rig-moj12h4o-v4-combined.yaml` | combined — H1 sustain | — | — | — | — | — | — | gate: ≥15% reduction vs row 1 |
| 6 | `rig-moji64hs-baseline.yaml` | control calibration | — | — | — | — | — | — | — |
| 7 | `rig-moji64hs-v4-combined.yaml` | control variant — H3 | — | — | — | — | — | — | gate: within ±5% of row 6 |

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
