# X022 Runlog

Live tracking for the X022 implementer-behavior-nudges trial sequence.
Coco appends to this as trials land. Each trial row carries the
canonical reference data; per-trial findings/observations land
under the section below the table.

**Click:** `c-mopiarth-611047126115` (under parent `c-mok4oct1`).
**Spec:** [`spec.md`](../spec.md).

## Trial sequence

Run order is sequential. Spider concurrency on the lab host
serializes trials anyway, but we deliberately wait for each to
land + a quick review before posting the next.

The 2x2 design varies role-file × rig-brief; brief content is
identical baseline-vs-variant (the intervention lives in
`roles/artificer.md`, not the brief).

| # | manifest | rig | role file | trial writ | status | cost | duration | sealed commit | notes |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `rig-moj12h4o-baseline.yaml` | substantive | baseline | `w-mopuwdsp` | queued | — | — | — | gate: lab cost within ±30% of $25–35 production-implement portion |
| 2 | `rig-moj12h4o-combined.yaml` | substantive | combined-nudges | — | — | — | — | — | gate: ≥10% cost reduction vs row 1 (H1) |
| 3 | `rig-moji64hs-baseline.yaml` | control | baseline | — | — | — | — | — | gate: lab cost within ±30% of $10–20 production-implement portion |
| 4 | `rig-moji64hs-combined.yaml` | control | combined-nudges | — | — | — | — | — | gate: ≥5% cost reduction vs row 3 (H2) |

**Reference data (from production, for orientation):**

- rig-moj12h4o (substantive, Reckoner periodic tick / `w-moiy8hkv`):
  full-rig cost $47.26. Pre-rig SHA `0e1e81f4` (parent of draft commit
  `7bed456`). Production implementer transcript pure-read share:
  **49.1%** per X011 instrument. Rig exhibits ideas #10 (repeat-greps
  on `handleWritsChange|runCatchUpScan|stacks.watch`) and #11/#12
  (full-workspace test runs ~6+ times) most strongly.
- rig-moji64hs (control, vision-keeper deletion / `w-moji63xm`):
  full-rig cost $20.39. Pre-rig SHA `d6e34097` (parent of first sealed
  commit `721c9ec`; 6 sealed inscriptions total). Production
  implementer transcript pure-read share: **1.9%**. Rig exhibits idea
  #8 (10 sequential Edits to a single fixture string) most strongly.

**Brief shape:** trimmed to spec-only on 2026-05-03 (commit
`5a7ff5ae`) after X021 trial-runner identified the original
extraction included full plandoc context (~2.4× production input).
- `rig-moj12h4o-baseline.md`: 25 KB / 253 lines (production: ~26 KB)
- `rig-moji64hs-baseline.md`: 22 KB / 147 lines

**Cost reporting note:** all anima sessions run inside the test
guild, not the lab host. The lab host's `nsg writ show` for trial
writs reports `$0` because no anima sessions executed there.
Per-trial cost numbers in the table come from the test guild's
`animator/sessions` rows (post-extract, via `nsg lab trial-extract`).

## Hypothesis status

- **H1** — Combined-nudges variant cuts substantive cost ≥10% on rig-moj12h4o vs baseline.
  - **Status:** unresolved. Needs row 2 vs row 1.
- **H2** — Combined-nudges variant cuts control cost ≥5% on rig-moji64hs vs baseline.
  - **Status:** unresolved. Needs row 4 vs row 3.
- **H3** — Neither variant produces an outcome-quality regression vs its baseline (Tier 1 mechanical + Tier 2 manual diff).
  - **Status:** unresolved. Tier 1 reads from probe artifacts; Tier 2 manual after each variant.

## Trial run history

### Trial 1 — substantive baseline

- **Writ:** `w-mopuwdsp`
- **Posted:** 2026-05-03 14:18 UTC
- **Status:** queued — spider blocked on a synchronous-scenario-engine bug Sean is resolving async.

#### First post (cancelled, host-restart event)

- Writ `w-mopib8yh` posted 08:26 UTC.
- Lab guild bootstrapped, implementer session started at 08:27.
- Session log shows only MCP proxy connection — 0 turns recorded before the lab guild's daemon was killed (~08:29 UTC).
- System-wide event around that time killed every other lab-guild daemon too (X018/X019/X021/X022 pidfiles all stale at the time of inspection).
- Stuck in `open` state for ~6h until Coco noticed.
- Cancelled at 14:18 UTC. Lab guild dir + codex bare repo cleaned up.
- No Anthropic spend (no implementer turns ran).
- Reposted as `w-mopuwdsp` immediately after.

#### Brief-trim correction (2026-05-03 ~14:30 UTC, before trial picks up)

Inherited X021's bloated baseline briefs (61 KB / 55 KB) when production saw spec-only (~26 KB / ~22 KB). Trimmed both briefs to spec-only at commit `5a7ff5ae` while trial was still queued. Scenario engine reads brief content at execution time (`scenario-xguild.ts:475`), so the queued trial picks up the trimmed brief automatically when spider unblocks. No re-post needed.

## Cumulative spend

| | trials | implementer billed | total |
|---|---|---|---|
| Estimated (spec, post-trim) | 4 | $5–$15/trial | $30–$60 |
| Actual to date | 0 completed | $0 | $0 |

(Trial 1 first post cancelled before billable implement work; counted as $0.)

## Open questions / decisions to revisit

- **N=2 expansion threshold.** Spec says N=1 directional first;
  expand if signal warrants. Concrete trigger: if H1 substantive
  delta lands in the 5–10% margin (where N=1 variance could swamp
  the signal), run a second pair on the load-bearing cell before
  declaring outcome.
- **Per-idea ablation.** Combined variant bundles all five nudges;
  if H1 holds, follow-up should isolate per-idea contribution
  (#8 alone, #11+#12 alone, etc.) before promoting any to vibers.
- **Role-file vs brief-prepend injection point.** This experiment
  modifies the role file, betting that loom binds the role at
  session start and the directives stay in scope. If the variant
  cost matches baseline (no signal), worth re-running with the
  same nudges prepended to the brief to test whether the role
  surface is the issue.
- **Tier 3 quality gate.** Currently relying on Tier 1 (seal/tests)
  + Tier 2 (manual diff vs baseline sealed commit). If Tier 1+2
  flag concern, escalate then.

## Beyond the sequence (post-trial work)

- [ ] Author `scripts/extract-tool-use-metrics.py` — Bash-vs-Edit
  ratio, Read-after-Grep targeting, Grep pattern uniqueness,
  full-workspace test count. Mechanism evidence for each nudge.
- [ ] Write `results.md` with H1/H2/H3 verdicts + recommendation.
- [ ] Conclude or transition click `c-mopiarth` based on outcome.
- [ ] Update parent landscape click `c-mok4nke6` with measured
  Category 3 savings.
- [ ] If H1 + H2 sustained: ship the nudges to vibers'
  `roles/artificer.md` as a baseline change.
- [ ] If H1 sustained but H2 fails: spawn follow-up per-idea
  ablation experiment before generalising.
- [ ] Sweep stale lab-guild dirs at
  `/workspace/vibers/.nexus/laboratory/guilds/x022-*` after final
  trial extracts.
