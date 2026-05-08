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

**Running order (revised 2026-05-07, Sean):** Upgrade design to
n=3 per variant cell. Six trials posted as a single
depends-on chain, interleaved (sub, ctrl, sub, ctrl, sub, ctrl)
so any environmental drift across the run window distributes
evenly. All six posted as drafts, linked, then published —
Spider holds successors in `open` until each predecessor reaches
a terminal state. Substantive baseline initially stayed at n=1
(trial 1's $39.76); after rows 2–7 landed and showed a ~12%
combined-cell delta, **rows 8–9** (2026-05-08) were posted to
firm the baseline against X021's measured 3–12% noise floor.
Control baseline still conditional.

**Trial-shape note:** rows 1 used the older xguild trial doctype
(separate review + revise + seal sessions); rows 2–9 use the
post-2026-05-08 claude-direct doctype (single implement session,
verifyCommand-as-seal). Compare implementer-alone numbers
($37.35 from row 1's implementer session) against rows 2/4/6/8/9
total cost for apples-to-apples cell comparison.

| run order | manifest | rig | role file | trial writ | depends-on | status | cost | duration | notes |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `rig-moj12h4o-baseline.yaml` | substantive | baseline | `w-mopuwdsp` | — | **completed** | $39.76 (impl-only $37.35) | 74.9 min | xguild doctype. Tier 1 PASS. Sealed `7c810bb`. Reviewer-1 killed by 90s heartbeat-timeout reconciler at 28.9 min, framework auto-retried review (3.5 min, $2.28), revise was no-op ($0.13). |
| 2 | `rig-moj12h4o-combined.yaml` | substantive | combined-nudges | `w-mowe5lsl` | — (head) | **completed** | $34.40 | 55.2 min | claude-direct. Sealed `ffcf038`. Tier 1 PASS (verifyCommand exit 0). H1 replicate 1/3. |
| 3 | `rig-moji64hs-combined.yaml` | control | combined-nudges | `w-mowe90mm` | `w-mowe5lsl` | **completed** | $9.46 | 18.6 min | claude-direct. Tier 1 PASS. H2 replicate 1/3. |
| 4 | `rig-moj12h4o-combined.yaml` | substantive | combined-nudges | `w-mowe93t2` | `w-mowe90mm` | **completed** | $33.90 | 45.6 min | claude-direct. Tier 1 PASS. H1 replicate 2/3. |
| 5 | `rig-moji64hs-combined.yaml` | control | combined-nudges | `w-mowe97r2` | `w-mowe93t2` | **completed** | $11.32 | 22.5 min | claude-direct. Tier 1 PASS. H2 replicate 2/3. |
| 6 | `rig-moj12h4o-combined.yaml` | substantive | combined-nudges | `w-mowe9ane` | `w-mowe97r2` | **completed** | $30.14 | 42.8 min | claude-direct. Tier 1 PASS. H1 replicate 3/3. |
| 7 | `rig-moji64hs-combined.yaml` | control | combined-nudges | `w-mowe9dm5` | `w-mowe9ane` | **completed** | $6.84 | 15.1 min | claude-direct. Tier 1 PASS. H2 replicate 3/3. |
| 8 | `rig-moj12h4o-baseline.yaml` | substantive | baseline | `w-mowr4jq1` | — (head 2) | open | — | — | claude-direct. Sub-baseline replicate 2/3. Posted 2026-05-08 to firm H1 against noise floor. |
| 9 | `rig-moj12h4o-baseline.yaml` | substantive | baseline | `w-mowr4mri` | `w-mowr4jq1` | open (held) | — | — | claude-direct. Sub-baseline replicate 3/3. |

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
`animator/sessions` rows — each engine stamps its own
`$.costUsd` (note the field name; not `totalCostUsd`) into its
session record on completion. Aggregate trial cost is the sum of
per-engine costUsd; available either via `nsg lab trial-extract`
or by querying the test guild's `nexus.db` directly with sqlite3
(`SELECT json_extract(content,'$.metadata.engineId'), json_extract(content,'$.costUsd') FROM books_animator_sessions`).

## Hypothesis status

- **H1** — Combined-nudges variant cuts substantive cost ≥10% on rig-moj12h4o vs baseline.
  - **Preliminary signal (2026-05-08):** combined mean (n=3) = $32.81; baseline (n=1) = $37.35 → **~12.2% reduction**, clears threshold. Caveat: baseline n=1 inside X021's measured 3–12% noise floor. Rows 8–9 posted to firm.
  - **Status:** preliminary positive; awaiting n=3 baseline.
- **H2** — Combined-nudges variant cuts control cost ≥5% on rig-moji64hs vs baseline.
  - **Comparator (2026-05-03):** lab combined cost vs production full-rig cost ($20.39) as first-pass.
  - **Result (2026-05-08):** combined mean (n=3) = $9.21, range $6.84–$11.32 — all three runs **well under $20**. **H2 supported** without a lab-baseline run.
  - **Status:** supported.
- **H3** — Neither variant produces an outcome-quality regression vs its baseline (Tier 1 mechanical + Tier 2 manual diff).
  - **Tier 1 (2026-05-08):** all 6 variant trials exited 0 with their verifyCommand passing (build+test on substantive; typecheck on control). **PASS.**
  - **Tier 2:** pending (manual diff of trials 2/4/6 sealed commits vs trial 1's `7c810bb`).
  - **Status:** Tier 1 supported; Tier 2 pending.

## Trial run history

### Trial 1 — substantive baseline

- **Writ:** `w-mopuwdsp`
- **Posted:** 2026-05-03 14:18 UTC
- **Picked up:** 2026-05-03 15:13 UTC after Sean restarted the daemon (post spider sync-bug fix).
- **Lab guild:** `x022-rig-moj12h4o-baseline-a987a557` (daemon pid 114861).
- **Rig:** `rig-mopwus31-f5f4e2aa`.
- **Mandate writ in test guild:** `w-mopwuofn-1d3cbb02c87e`.

#### Implementer (15:13–15:56 UTC, 42.3 min, exit 0)

- Session: `ses-mopwus5w-70d82f58`, role: artificer, engine: implement.
- **Cost: $37.35** (input 253 / output 125,607 / cache-read 62,662,291 / cache-write 458,963).
- Sealed: 1 commit `7c810bb reckoner: switch from per-writ-update CDC to a periodic tick relay` on draft branch atop codex base `0e1e81f`.
- **Tier 1 mechanical (PASS):** `pnpm typecheck` clean; `pnpm test` 0 failures across all 25 packages (3939 passing tests, 80 in Reckoner). Audit greps confirm CDC paths gone and `reckoner.tick` spelled consistently.
- Brief task coverage: all 6 tasks (t1–t6) addressed per implementer's completion summary.
- Calibration: $37.35 vs spec estimate $25–35 → ~7% above the upper bound, within the ±30% gate. Reviewer + revise costs still pending.

#### Reviewer attempt 1 (15:56–16:25 UTC, FAILED by reconciler)

- Session: `ses-mopydk35-b6fc94c8`, role: reviewer, engine: review.
- **Status:** failed, exitCode 1.
- **Error:** `"No heartbeat received for 90s — session host presumed dead (reconciled)"`.
- Duration before reconciler killed it: 29.0 min.
- Cost: $0.00 (no API turns recorded).
- Mechanical pre-checks (run by review engine before invoking the reviewer LLM, stamped on the session record): build ✓ (3.3 sec) / test ✓ (9.9 sec).
- This is the seizing pattern Sean is investigating. Reconciler did its job — flipped the session to failed, freed the rig to retry.

#### Reviewer attempt 2 (16:25–16:29 UTC, completed)

- Spider auto-retried `review` after attempt 1 failed.
- **Status:** completed, exitCode 0.
- Duration: 3.5 min. Cost: $2.28 (input 26 / output 12,449 / cache-read 2,326,842).
- No required changes (output empty in book record), revise consequently no-op.

#### Revise (16:29 UTC, completed)

- engine: revise, role: artificer.
- Duration: 0.1 min. Cost: $0.13 (input 7 / output 347).
- Effectively a no-op — review-2 had no required changes.

#### Trial terminal (16:29:57 UTC)

- Mandate writ in test guild reached terminal; scenario engine on lab host returned.
- `lab.archive` engine wrote `lar-mopzkrza-d47537a11aec` capturing all probe data.
- `lab.guild-teardown` + `lab.codex-teardown` wiped the lab guild dir + bare codex repo.
- Trial writ `w-mopuwdsp` transitioned `open → completed (success)`.
- Total trial cost (sum of session costs): **$39.76**. Total session wallclock: **74.9 min**.

#### Tier 1 mechanical (PASS)

- ✓ Sealed cleanly (1 commit `7c810bb`)
- ✓ Build + test green at sealed commit (mechanical-checks block on review session)
- ✓ All 6 brief task IDs covered per implementer's completion summary
- ✓ Audit greps satisfied (CDC paths gone, `reckoner.tick` spelling consistent)

#### Captured artifacts

`2026-05-03-trial-1-results/`:
- `extracted/` — full `nsg lab trial-extract` output (manifest, README, codex-history with the sealed patch, stacks-export with all books)
- `sessions-summary.json` — per-engine cost / duration / exit / error table
- `sealed-commit-7c810bb.patch` — 196 KB, the implementer's full diff
- `sealed-commit-message.txt`, `sealed-commit-diffstat.txt`

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

### Trials 2–7 — variant chain (claude-direct, 2026-05-08)

Six-trial interleaved chain (sub, ctrl, sub, ctrl, sub, ctrl)
ran 04:08–07:29 UTC, all six exited cleanly.

| run | writ | cell | cost | duration | output tokens | cache-read | exit |
|---|---|---|---:|---:|---:|---:|---:|
| 2 | `w-mowe5lsl` | sub-combined #1 | $34.40 | 55.2 min | 143,081 | 55.6M | 0 |
| 3 | `w-mowe90mm` | ctrl-combined #1 | $9.46 | 18.6 min | 44,070 | 14.2M | 0 |
| 4 | `w-mowe93t2` | sub-combined #2 | $33.90 | 45.6 min | 134,639 | 55.3M | 0 |
| 5 | `w-mowe97r2` | ctrl-combined #2 | $11.32 | 22.5 min | 45,189 | 17.5M | 0 |
| 6 | `w-mowe9ane` | sub-combined #3 | $30.14 | 42.8 min | 115,317 | 49.3M | 0 |
| 7 | `w-mowe9dm5` | ctrl-combined #3 | $6.84 | 15.1 min | 39,509 | 10.1M | 0 |

**Cell summaries:**
- Substantive combined (n=3): mean **$32.81**, range $30.14–$34.40, CV 7.1%
- Control combined (n=3): mean **$9.21**, range $6.84–$11.32, CV 24.4%

**Mechanism signal — cache-read tokens.** Trial 1 baseline implementer
cache-read: 62.7M. Combined cell cache-reads: 49.3M / 55.3M / 55.6M
(consistently lower). Output tokens flat-to-slightly-higher in
combined runs, so savings come from less context replay (fewer
repeat-greps + narrower test runs) — exactly the nudge mechanism.

**Tier 1 (PASS for all 6).** Each trial's `verifyCommand` ran as
the seal step: filtered build+test on substantive (rig-moj12h4o)
manifests, workspace typecheck on control (rig-moji64hs)
manifests. All exited 0; sealed commits pushed via `git push
origin HEAD:main` inside the disposable lab guild's bare codex.

**Tier 2 (pending).** Manual diff of trials 2/4/6 sealed commits
vs trial 1's `7c810bb`.

**Captured extracts:** `/tmp/x022-extract/{w-mowe5lsl,...}/`
(stacks-export, codex-history, README, manifest). Persistent
copies under `artifacts/2026-05-08-trial-2-7-extracts/` if/when
this commits.

### Trials 8–9 — substantive baseline firming (posted 2026-05-08 10:07 UTC)

After rows 2–7 showed a ~12% combined-cell delta vs trial 1's
n=1 baseline, two more substantive baseline trials were posted
to firm H1 against X021's measured 3–12% noise floor.

- Row 8: `w-mowr4jq1` (head)
- Row 9: `w-mowr4mri` (depends-on row 8)

Both manifests: `rig-moj12h4o-baseline.yaml` (claude-direct,
identical to row 8). Estimated chain cost: $36–$80 ($18–$28 ×2,
+/- variance).

## Cumulative spend

| | trials | spend |
|---|---|---|
| Estimated (n=3 active plan) | 6 variant + 2 baseline-firming | $147–$209 |
| Actual to date | 7 completed (1 + 6) | **$165.82** |
| In flight (8, 9) | 2 baseline | est $36–$80 |

Trial 1: $39.76. Trials 2–7: $126.06. Total: $165.82.

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
