# X020 Runlog

Live tracking for the X020 code-lookup-for-the-implementer trial
sequence. Coco appends to this as trials land. Each trial row
carries the canonical reference data; per-trial findings /
observations land under the section below the table.

**Click:** `c-mophhb96`. **Spec:** [`spec.md`](../spec.md).
**Predecessor:** X019 (reverse-usage index for the reader-analyst,
H1 not supported on N=1 — diagnosed as role mismatch).

## Trial sequence

Run order is sequential. Spider concurrency on the lab host
serializes trials anyway, but we deliberately wait for each to
land + a quick review before posting the next.

| # | manifest | purpose | trial writ | rig | status | impl cost | impl duration | adoption % | notes |
|---|---|---|---|---|---|---|---|---|---|
| 0 | `baseline-dropbook.yaml` (v0, raw-brief) | apparatus check | `w-mopib9cd` | `rig-mopuhati` | superseded | $10.94 | 23.1 min | n/a | scoped narrowly — missed cartograph + tier4 + arch docs; brief was raw `writ.body`, not plandoc spec |
| 1 | `baseline-dropbook.yaml` (v1, plandoc spec) | calibration **and** A/B baseline anchor | `w-mopwwox1` | `rig-mopwx2gd` | **completed** | **$15.95** | **27.6 min** | n/a | calibration **PASSED** — −1.2% vs $16.15 reference; full scope coverage incl. cartograph + tier4 + arch docs. Single baseline doubles as the H1 comparator anchor (X019 pattern) |
| – | `baseline-dropbook.yaml` (v1) | redundant baseline rerun | `w-mopyh1hm` | — | cancelled | — | — | n/a | posted then cancelled — Sean caught that a second baseline at N=1 with no variance machinery is just spend without measurement value |
| 2 | `with-tool-dropbook.yaml` | A/B variant — **H1 measurement** | `w-mopyzctu` | — | open, queued | — | — | — | gate: ≥25% reduction vs row 1 ($15.95 anchor) |

**Reference data (from production, for orientation):**

- Real-world implementer session `ses-mok2say8` (sealed commit
  `c25353ff` for writ `w-mojnftby`): **$16.15 / 33.8 min**, 22
  files / 9 packages / +770 / -35.
- Codex pin: `93f8ce5089e0a115775c166534ca46f7ec196b8d` (parent of
  the sealed commit).
- Plandoc: `w-mojnftby-473d4e94c053`. The brief shipped to the
  lab implementer is the plandoc's `$.spec` field
  (`briefs/dropbook-replay.md`), matching what
  `plan-and-ship` feeds into `implement` via
  `prompt: '${yields.plan-finalize.spec}'`.
- Reverse-usage index: 793 KB, 666 unique symbols, 12,207
  references — pre-built once for codex SHA `93f8ce50`,
  shipped to the with-tool variant via `files:`.

## Hypothesis status

- **H1** — `code-lookup` reduces implementer session cost ≥25%
  on the dropBook commission, anchored to the row 1 lab baseline
  ($15.95), not the real-world $16.15. Comparing trial 1 to
  trial 2 holds apparatus, codex, brief, and trial-shape constant —
  the only difference is the code-lookup tool injection.
  - **Status:** unresolved. Needs row 2 vs row 1.
- **Adoption metric (secondary measurement, not a hypothesis)** —
  ≥20% of the implementer's tool calls reach for `code-lookup`
  in the with-tool variant. X019's planner-side rate was 2/67
  (3%); converting mechanism → cost requires roughly an order of
  magnitude more.
  - **Status:** unresolved. Measured from row 3.

## Trial run history

### Trial 0 — apparatus check on raw-brief (superseded)

- **Writ:** `w-mopib9cd-cff5af022e40`
- **Posted:** 2026-05-03T08:26 UTC (after two `givens.files[0].sourcePath must be absolute in v1` failures —
  host daemon held stale lab dist; switched to absolute `/workspace/...`
  paths as a workaround, see `manifests/baseline-dropbook.yaml`).
- **Picked up:** 2026-05-03T14:07 UTC (5h 41m queue wait behind
  X021 + X022 baselines saturating spider's `maxConcurrentEngines = 3`).
- **Sealed:** 2026-05-03T14:34 UTC. Sealed commit `a2931c6e`,
  fast-forward, 0 retries, 1 inscription.
- **Lab-guild cost (test-guild animator sessions):**

  | session | role | engine | cost | duration | output tokens | cache reads |
  |---|---|---|---|---|---|---|
  | `ses-mopuhv5s` | artificer | implement | $10.94 | 23.1 min | 58,299 | 15.3 M |
  | `ses-mopvbn8t` | reviewer | review | $1.12 | 3.0 min | 5,987 | 651 K |
  | `ses-mopvfi9e` | (unknown) | (unknown) | $0.04 | <1 min | 46 | 16 K |
  | **total** | | | **$12.10** | **26.1 min** | | |

- **Diff:** 16 files changed, +710 / -12 across 4 packages.
  Real-world commit was 22 files / +770 / -35 across 9 packages.
- **Coverage gap (Tier 2):** the implementer landed the substrate
  primitive cleanly (`StacksApi.dropBook`, backend method,
  `BookDeleteEvent` CDC variant, tier1+tier2 conformance, sqlite
  backend tests) but **omitted** cartograph application
  (`cartograph.start()` invocations, `cartograph.test.ts`),
  tier4-edge-cases conformance, and architecture-doc updates
  (`docs/architecture/apparatus/stacks.md`,
  `docs/architecture/index.md`).

#### Why superseded

The brief shipped to the implementer was the raw `writ.body` from
`w-mojnftby`, not the planner-elaborated spec. Implement-only
trials skip the planning pipeline, so without intervention the
implementer receives `writ.body + EXECUTION_EPILOGUE` directly. In
production (plan-and-ship), `implement` receives
`${yields.plan-finalize.spec}` — the spec-writer's elaborated
spec with explicit `<task-manifest>`. X018 / X019's
`cartograph-replay.md` was already this pattern; the X020 brief
was missing it. Scope-of-work shift, not apparatus drift —
explains the −32% cost differential without invoking any
mechanism question.

#### Resolution

- Brief replaced with the `$.spec` field of plandoc
  `w-mojnftby-473d4e94c053`, extracted via `nsg plan show`. The
  new `briefs/dropbook-replay.md` is 144 lines and includes the
  full `<task-manifest>` (t1–t8) covering substrate + backends +
  bridge + conformance Tier 1+2+4 + cartograph retro-cleanup +
  architecture docs.
- Spec annotated with a "Brief shape" section.
- Trial-extract preserved at
  `artifacts/2026-05-03-baseline-v0-raw-brief/` with `NOTES.md`
  documenting the gap. The −32% cost differential is recorded as
  a side measurement on the elaborated-spec → raw-brief shift,
  adjacent to X016's territory.

### Trial 1 — calibration on plandoc-spec brief (PASSED)

- **Writ:** `w-mopwwox1-618d422946da`
- **Rig:** `rig-mopwx2gd`
- **Posted:** 2026-05-03T15:15 UTC, after Sean restarted the
  daemon. Manifest passed pre-flight validation cleanly.
- **Sealed:** 2026-05-03T15:56 UTC. Three commits, fast-forward,
  3 inscriptions. **41-min wall-clock** start-to-seal.
- **Lab-guild cost:**

  | session | role | engine | cost | duration | output tokens | cache reads |
  |---|---|---|---|---|---|---|
  | `ses-mopwx8jz` | artificer | implement | **$15.95** | **27.6 min** | 67,509 | 25.0 M |
  | `ses-mopxwuxb` | reviewer | review | $3.25 | 12.8 min | 13,772 | 4.4 M |
  | `ses-mopyddrr` | artificer | revise | $0.10 | <1 min | 319 | 16 K |
  | **total** | | | **$19.31** | **40.5 min** | | |

- **Calibration verdict:** **−1.2% vs $16.15 reference** —
  comfortably within ±15% gate ($13.73–$18.57). Apparatus
  fidelity confirmed.

- **Diff coverage (vs real-world c25353ff):**

  | | Real | v1 | v0 (raw-brief) |
  |---|---|---|---|
  | Files | 22 | 23 | 16 |
  | Insertions / deletions | +770 / -35 | +714 / -36 | +710 / -12 |
  | Substrate (`stacks-*`) | ✅ | ✅ | ✅ |
  | Bridge (`clockworks-stacks-signals`) | ✅ | ✅ | ✅ |
  | Cartograph integration | ✅ | ✅ | ❌ |
  | Tier 4 conformance | ✅ | ✅ | ❌ |
  | Architecture docs (3 files) | ✅ | ✅ | ❌ |

  Three commits (substrate / conformance + cartograph / docs)
  vs the real-world's single commit — stylistic, not scope —
  driven by the implementer following t1–t8 task-manifest
  groupings.

- **Tier 1 quality:** ✅ build/test passed (sealed cleanly with
  inscriptions=3, retries=0). Reviewer + revise cycle ran cleanly.

- **Lesson confirmed:** the elaborated-spec → raw-brief shift is
  a real cost lever (~32%) in this codex; the planning pipeline
  contributes substantial scope-prescription value beyond what
  the writ body carries. Recorded as a side measurement; not
  X020's H1 question.

### Cancelled redundant trial (correction)

After trial 1 landed, Coco initially posted a second baseline run
(`w-mopyh1hm`, also `baseline-dropbook.yaml`) intending it as a
"paired anchor" for the A/B comparison, citing X019's
"eliminates inter-trial drift" pattern. Sean caught the
mistake: X019 ran ONE baseline that served as both calibration
and comparator; the second run would have spent another ~$19 to
confirm trial 1 wasn't a fluke without any variance machinery to
make use of the second data point. Cancelled before it picked up
a rig — $0 spend.

The cleaner pattern: trial 1's $15.95 IS the H1 comparator. The
with-tool variant is compared directly against it. Holds
apparatus / codex / brief / trial-shape constant; the only
variable is the code-lookup tool injection.

### Trial 2 — with-tool variant (H1 measurement, in flight)

- **Writ:** `w-mopyzctu-b8992f8852da`
- **Posted:** 2026-05-03T16:13 UTC. Watcher armed (`bz56h90z0`).
- **Manifest:** `with-tool-dropbook.yaml` — adds the
  `code-lookup-apparatus` plugin, `code-lookup:read` permission
  on the artificer role, the `code-lookup-index.json` artifact
  shipped to `<guild-root>`, and the implementer-flavored
  tool-preference snippet inserted into `roles/artificer.md`.
- **Status:** open, queued.

## Cumulative spend

Costs reported are lab-guild billed cost (test-guild animator
sessions). Lab-host animator sessions are $0 by construction —
the host orchestrates fixtures and probes but does not summon any
LLM-backed sessions itself.

| | trials | impl + review + revise + seal billed | total |
|---|---|---|---|
| Estimated (per trial) | — | $15–$25 | — |
| Actual to date | 1 superseded + 1 calibrated + 1 cancelled-pre-pickup | $12.10 + $19.31 + $0 | $31.41 |

## Open questions / decisions to revisit

- **Apparatus stale-daemon workaround.** Manifests currently use
  absolute `/workspace/nexus-mk2/...` paths in `files:` because
  the host daemon held stale lab-apparatus dist code at trial-post
  time, enforcing the v1 `sourcePath must be absolute` check.
  Once the daemon restarts and reloads the rebuilt dist, prefer
  reverting to manifest-relative paths (matches X019/X021).
- **N-extension threshold.** Spec says N=1 first; if H1 lands at
  −20–25% (margins where variance swamps signal) consider running
  a second N=1 baseline + with-tool pair before declaring
  outcome. Spec mentions clerk-refactor as a candidate
  N-extension rig — bigger codex, bigger cost, separate decision.
- **Adoption metric measurement.** Pulling tool-call mix requires
  walking the implementer transcript JSON. X019 did this manually
  for one trial; if X020 leads to N>1 it'll be worth promoting to
  a small extraction script (parallel to X011's
  `h4_read_utilization.py`).

## Beyond the sequence (post-trial work)

- [ ] Write `2026-05-XX-findings.md` mirroring X019's one-page
  format (Verdict / Hypothesis / Apparatus / Calibration /
  Comparison / Tool-call mix / Diagnosis / Decision /
  Reusable assets).
- [ ] Conclude or transition click `c-mophhb96` based on outcome.
- [ ] If H1 supported: open follow-up click for "integrate
  code-lookup into production implement pipeline" + decide on
  N-extension rig (clerk-refactor or alternative).
- [ ] If H1 not supported: combine X019 + X020 findings into a
  cross-experiment claim about on-demand-tool-injection (whole
  family, not just one role) and surface for blog publication.
- [ ] Sweep stale lab-guild dirs at
  `/workspace/vibers/.nexus/laboratory/guilds/x020-*` and codex
  bare clones at `/workspace/vibers/.nexus/laboratory/codexes/x020-*.git`.
