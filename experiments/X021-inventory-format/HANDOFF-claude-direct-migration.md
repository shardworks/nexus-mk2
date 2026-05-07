# X021 — Handoff for claude-direct re-run

**Status (2026-05-07):** All seven X021 trial manifests have been
migrated from the xguild trial doctype to the **claude-direct**
doctype. The seven trials are queued and ready to post; the next
session can run them sequentially against the existing briefs and the
existing artificer role file.

This document is the operator's runbook for completing the experiment.

---

## Why we re-ran the migration

Before 2026-05-07 X021 ran on **xguild** trials — a test guild stood
up per trial, with its own daemon, plan-and-ship pipeline, and full
review/revise/seal stages around the implementer session. That shape
worked but carried ~2-3min of fixed overhead per trial, exposed every
trial to spider-queue contention, and ran the implementer at $77/trial
on the substantive baseline (well above the spec's $5–$15 estimate).

**claude-direct** is a lighter-weight doctype landed 2026-05-07 that
spawns a single claude session against a fresh codex checkout, with no
test guild and no review pipeline. The implementer prompt and role are
identical to production (executionWrap: 'production' carries the same
EXECUTION_EPILOGUE as spider's implement engine), so the implementer's
session shape is faithful to what production produces — minus the
ceremony.

See `docs/lab-operations/running-claude-direct-trials.md` for the
doctype's full operational guide. The architectural piece making the
manifests possible is `spider.graft-rig-template` (framework v0.1.304)
and the laboratory's `claude-direct-monolithic` rig template.

### What was preserved in the migration

- Codex pins (b92dc905 substantive, d6e34097 control) — same SHAs the
  production rigs ran against.
- Brief content — the seven brief markdown files in `briefs/` are
  unchanged; they were corrected mid-X021 (commit `fcc00fef`,
  2026-05-03) and remain the canonical inputs.
- Artificer role file — `fixtures/test-guild/roles/artificer.md` is
  the production role snapshot; unchanged. (The path stays under
  `fixtures/test-guild/` for legacy reasons; claude-direct just reads
  it as a system prompt file.)
- Model: opus on every trial (matches production).

### What changed

- **Scenario engine:** `lab.commission-post-xguild` →
  `spider.graft-rig-template` grafting `laboratory.claude-direct-monolithic`.
- **Fixtures:** dropped `lab.guild-setup` (test-guild plugin install)
  and `lab.daemon-setup`; added `lab.codex-checkout` (clones the bare
  into a workdir for the implementer).
- **Probes:** dropped `lab.probe-stacks-dump`; added
  `lab.probe-trial-sessions` (filters lab-host's own animator/sessions
  by metadata.trialId, materializes byte-identical to the old
  stacks-dump shape).
- **Verify:** explicit `verifyCommand` shell command per trial
  (substantive: build + test of reckoner + clockworks; control:
  workspace-wide typecheck — see "Verify command rationale" below).
  Also includes `git push origin HEAD:main` so
  `lab.probe-git-range` captures the implementer's commit from the
  bare repo.
- **frameworkVersion:** 0.1.300-x019.0 → 0.1.304.

### Cross-shape data points retained

The xguild runs of trial 1 (substantive baseline, 2026-05-03 writ
`w-mopwwgug`, $77.30 with timeout) and trial 5 (substantive v4
combined, 2026-05-03 writ `w-mopzmkhd`, $57.09) are documented in the
runlog as cross-shape reference data. The claude-direct re-runs
produce a separate, internally-consistent dataset; they're not
intended to be cost-compared against the xguild numbers (different
overhead, different mechanics).

The xguild verdict (H1 SUSTAINED at -26% on the v4 combined
intervention) is the reason we're continuing with per-idea
decomposition under claude-direct.

---

## Run order

Spider concurrency on the lab host serializes most work, but
claude-direct trials don't queue inside a sub-guild — each trial runs
to completion in ~10-30 min wallclock under normal conditions. We
still post them sequentially so a failure on one doesn't propagate
hidden state into the next.

Post in this order; each post should wait for the previous trial to
reach terminal before posting the next.

| # | Manifest | Purpose | Stage of test | Expected cost |
|---|---|---|---|---|
| 1 | `rig-moj12h4o-baseline.yaml` | Substantive calibration baseline | Anchor for v1/v2/v3/v4 deltas | $0.40-$0.80 |
| 2 | `rig-moj12h4o-v1-inline-types.yaml` | #3 inline type sigs | Per-idea decomposition | $0.40-$0.80 |
| 3 | `rig-moj12h4o-v2-inline-templates.yaml` | #4 inline pattern templates | Per-idea decomposition | $0.40-$0.80 |
| 4 | `rig-moj12h4o-v3-do-not-read.yaml` | #5 do-not-Read list | Per-idea decomposition | $0.40-$0.80 |
| 5 | `rig-moj12h4o-v4-combined.yaml` | Combined #3+#4+#5 | H1 sanity-check at the new shape | $0.40-$0.80 |
| 6 | `rig-moji64hs-baseline.yaml` | Control calibration baseline | Anchor for control v4 delta | $0.20-$0.50 |
| 7 | `rig-moji64hs-v4-combined.yaml` | Control v4 combined | H3 (intervention has no effect on low-read rig) | $0.20-$0.50 |

**Cost expectation:** rough estimate is $3-$6 total for the
seven-trial sequence. The xguild numbers ($77+$57 ≈ $134 for two
trials) are NOT representative — claude-direct's overhead drop pulls
per-trial cost down by ~50-80x relative to xguild on this workload.

**Wallclock expectation:** each trial ~10-30 min; full sequence
~1-3 hours of operator-attended runtime. (Sequential, not parallel.)

---

## Operator commands

```bash
# 1. Verify framework + lab plugin are current.
git -C /workspace/nexus log --oneline -1   # expect 7d59dde or later
cd /workspace/nexus-mk2/packages/laboratory && pnpm test   # expect 287/287

# 2. Restart the lab daemon to pick up any plugin source changes.
nsg stop && sleep 2 && nsg start

# 3. Post trials one at a time. Wait for terminal between posts.
nsg lab trial-post experiments/X021-inventory-format/manifests/rig-moj12h4o-baseline.yaml
# Watch:
nsg writ list --type trial --classification active
# Wait for completion:
until nsg writ show <writId> 2>&1 | grep -qE 'classification: terminal'; do sleep 30; done

# 4. After each trial completes, extract its data:
nsg lab trial-extract <writId> --to artifacts/<date>-<slug>/

# 5. Repeat for each of the 7 manifests in the run order above.
```

A simple shell wrapper that runs the whole sequence is left as
operator's choice; the per-trial pattern is straightforward.

---

## Verify command rationale

Different rig families use different verify commands.

**Substantive (rig-moj12h4o, Reckoner refactor):**
```
pnpm --filter @shardworks/reckoner-apparatus --filter @shardworks/clockworks-apparatus build
pnpm --filter @shardworks/reckoner-apparatus --filter @shardworks/clockworks-apparatus test
```
Both packages are touched by the refactor; their tests are the
load-bearing verification. Filtered builds run in <60s and the test
suites in another <90s — well under the 10-minute verify timeout.

**Control (rig-moji64hs, vision-keeper deletion):**
```
pnpm -w typecheck
```
The deletion is workspace-wide. Running `pnpm -w test` would take
8-10+ minutes which is too slow for a Tier-1 mechanical check.
Workspace-wide typecheck catches "did the deletion leave dangling
references" — the load-bearing question for this rig. Test gating is
deferred to manual Tier-2 review of the trial's diff.

Both verify commands also include `git push origin HEAD:main` so
`lab.probe-git-range` captures the implementer's commit from the
bare repo (claude-direct's codex-setup creates a bare and codex-
checkout clones a workdir; without this push, the bare's HEAD never
moves and the probe sees zero commits).

---

## Analysis approach

The trial archive captures per-stage `animator/sessions` rows. For
each trial, the load-bearing data is the **implement** session row —
it carries `costUsd`, `tokenUsage` (input / output / cache-read /
cache-write), `durationMs`, and the transcript link. Extract via:

```bash
nsg lab trial-extract <trialId> --to <dir>
# implement session shape lives at:
# <dir>/stacks-export/animator-sessions.json
# transcripts under:
# <dir>/stacks-export/animator-transcripts.json
```

For each trial compute (mirroring the xguild runlog format):

- Implementer cost (USD, stamped from claude's `total_cost_usd`).
- Pure-read share — fraction of total Read content not subsequently
  edited. The X011 instrument scripts at
  `experiments/instruments/` extract this from the transcript.
- Tool-call mix — Read / Bash / Edit / Grep counts, ratio, and pattern
  uniqueness.
- File-change diffstat — files changed, insertions, deletions vs the
  baseline trial (or vs the codex pin's HEAD).
- Verify outcome — exit code from `lab.shell-command`'s yields.

Hypothesis evaluation:

- **H1** (combined v4 cuts substantive cost ≥15% vs baseline) —
  trial 5 cost vs trial 1 cost. Already SUSTAINED in the xguild data
  at -26%; this is a sanity check at the new doctype.
- **H2** (per-idea contribution roughly additive, #3 ≥ #4 ≥ #5) —
  trials 2, 3, 4 each vs trial 1. Sum of per-idea reductions should
  approximate the trial-5 combined reduction.
- **H3** (control variant produces no effect, ±5%) — trial 7 vs
  trial 6.

A `results.md` writeup belongs alongside the per-trial extract
artifacts under `artifacts/`. Once H1/H2/H3 verdicts are in, conclude
the X021 click `c-mophvf0d` and update the experiment index.

---

## Known issues to watch

1. **Animator metadata race for short sessions.** Sessions under
   ~5 seconds can have their `metadata.trialId` lost from the
   `animator/sessions` record (a framework race documented at click
   `c-movszemq`). `lab.claude-session.collect()` re-stamps metadata
   via a write-through put as a workaround, so probes still find the
   row. Implement sessions for X021 are 15-45+ minutes — won't trigger
   this — but worth knowing if a future short workload misbehaves.

2. **Framework requires v0.1.304 or later.** The `spider.graft-rig-template`
   engine landed in v0.1.304 (commit `8d717f55`); the
   nested-yields fix landed at `7d59dde`. Older daemons fail with
   "template not found" or "graft validation failed" errors. If
   re-running this in the future, ensure the nexus repo is at HEAD or
   the published v0.1.304+.

3. **Claude session cost vs published-list cost.** Numbers reported
   are claude's `total_cost_usd` field (Pro Max 20x equivalent).
   Manual recompute against published Opus list rates produces ~3×
   higher. Use the stamped value as canonical. See
   `docs/lab-operations/calculating-costs.md`.

4. **Trials post sequentially, not concurrently.** The lab daemon
   handles one trial at a time via spider's normal scheduling. Don't
   bulk-post all 7 — wait for each to terminate before the next.

---

## References

- This experiment's spec: [`spec.md`](./spec.md)
- Runlog (carries per-trial outcomes): [`artifacts/runlog.md`](./artifacts/runlog.md)
- Source clicks: parent click `c-mok4nke6` (Apr 29 cost-optimization
  landscape); this experiment's click `c-mophvf0d`.
- Doctype guide: `docs/lab-operations/running-claude-direct-trials.md`
- Framework engine docs: `nexus/docs/architecture/apparatus/spider.md`
  § `spider.graft-rig-template`
- Companion experiments: X018, X019, X020, X022.

---

## What "complete" looks like

This handoff is closed when:

1. All 7 manifests have been posted and reached terminal status (most
   `completed`; any `failed` documented in the runlog with diagnosis).
2. Per-trial extracts are materialized under `artifacts/`.
3. Per-trial pure-read / tool-mix metrics are computed.
4. `results.md` records H1 / H2 / H3 verdicts with cost numbers.
5. X021 click `c-mophvf0d` is concluded with the verdict summary.
6. Experiment index is updated (move X021 from Active to Complete).
