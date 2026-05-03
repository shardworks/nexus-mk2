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

**Running order (revised 2026-05-03 ~16:10 UTC):** Sean asked to run
the substantive variant immediately after the substantive baseline,
then move to the control variant, and only post a control baseline if
the control-variant cost lands outside the production envelope.
The 2x2 design is preserved on the substantive side; the control side
becomes single-arm against production cost as the comparator.

| run order | manifest | rig | role file | trial writ | status | cost | duration | sealed commit | notes |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `rig-moj12h4o-baseline.yaml` | substantive | baseline | `w-mopuwdsp` | **completed** | $39.76 | 74.9 min (sessions) / 16:29 UTC scenario terminal | `7c810bb` | Tier 1 PASS. Reviewer-1 killed by 90s heartbeat-timeout reconciler at 28.9 min, framework auto-retried review (3.5 min, $2.28), revise was no-op ($0.13). Calibration: $37.35 implementer alone vs $25–35 spec estimate (~7% over upper bound, within ±30% gate). |
| 2 | `rig-moj12h4o-combined.yaml` | substantive | combined-nudges | — | — | — | — | — | gate: ≥10% cost reduction vs row 1 (H1) |
| 3 | `rig-moji64hs-combined.yaml` | control | combined-nudges | — | — | — | — | — | gate: lab cost ≤ $20 (production full-rig). H2 signal indirect — see decision gate below. |
| 4 (conditional) | `rig-moji64hs-baseline.yaml` | control | baseline | — | — | — | — | — | post **only if** row 3 cost ≥ ~$20 lab — to disambiguate brief-bloat vs nudge-failure |

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
  - **Status:** unresolved. Needs row 2 vs row 1.
- **H2** — Combined-nudges variant cuts control cost ≥5% on rig-moji64hs vs baseline.
  - **Status:** unresolved. **Comparator changed (2026-05-03 ~16:10 UTC):** row 3 (control variant) compared against production full-rig cost ($20) as a first pass; only post a paired lab control baseline (row 4) if row 3 lands outside the production envelope and disambiguation is needed.
- **H3** — Neither variant produces an outcome-quality regression vs its baseline (Tier 1 mechanical + Tier 2 manual diff).
  - **Status:** unresolved. Tier 1 reads from probe artifacts; Tier 2 manual after each variant.

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

## Cumulative spend

| | trials | trial cost (sum-of-sessions) | total |
|---|---|---|---|
| Estimated (spec, post-trim) | 4 | $5–$15/trial | $30–$60 |
| Actual to date | 1 completed | $39.76 (trial 1) | **$39.76** |

(Trial 1's first post `w-mopib8yh` was cancelled before billable implement work; counted as $0. Trial 1 second post `w-mopuwdsp` ran end-to-end at $39.76 — slightly above the per-trial spec estimate because the substantive Reckoner refactor is the most expensive of the four trials; control-rig trials should run lighter.)

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
