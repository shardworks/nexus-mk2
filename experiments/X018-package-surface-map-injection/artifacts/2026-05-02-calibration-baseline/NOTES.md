# Calibration trial 1 — apparatus issue, Sonnet vs Opus

**Trial id:** `w-moolzyib-9393c60512c3`
**Outer rig:** `rig-moom020p-531b399a` (completed 17:45)
**Reader-analyst session:** `ses-moom0nmb-56e00e23`

## Verdict: spec-defined "branch (c) — stop, diagnose apparatus"

Cost diverged **−64%** from real-world baseline (>50% threshold).
Diagnosis complete: **model mismatch.** Production cartograph rig
ran on `claude-opus-4-7` (vibers `settings.model: opus`); calibration
trial ran on `claude-sonnet-4-6` (test guild's animator default
fallback when no `settings.model` is set).

Manifest fix landed: added `settings: { model: opus }` to the
`lab.guild-setup` config block. Calibration to be re-run.

## Side-by-side metrics

| metric | real-world (prod) | calibration trial 1 |
|---|---|---|
| model | claude-opus-4-7 | claude-sonnet-4-6 |
| cost USD | $8.08 | $2.90 |
| duration | 14.6 min | 15.5 min |
| input tokens | 113 | 78 |
| output tokens | 50,057 | 43,381 |
| cache read tokens | 10,173,478 | 4,766,172 |
| cache write tokens | 278,947 | 173,496 |
| role | sage-primer-attended | sage-primer-attended ✅ |

Wall time matched to within 6%. Token counts roughly proportional
(planner did approximately the same work). Cost difference is
dominated by Sonnet/Opus per-token pricing.

## Other observations

- **Loom permission-drop warnings.** Test guild daemon log shows
  `"sage-primer-attended" permission "clerk:read" references
  undeclared plugin "clerk" — dropped` (and similar for ratchet).
  The clerk plugin IS declared in the manifest's plugin list — this
  warning may be a false positive in the role-permission validator,
  but worth verifying didn't actually drop tools the planner needed.
  Ratchet not in plugin set is intentional (plan-only set per
  lab-operations doc) but `ratchet:read` is referenced by some
  astrolabe roles; harmless if no ratchet tools are used.
- **lab.plan-only rig completed cleanly.** No engine failures; the
  apparatus recipe works end-to-end. First spec-only trial shape.
- **`lab.wait-for-rig-terminal-xguild` worked.** New engine polled
  the inner rig correctly and unblocked the outer scenario.

## Files

- `manifest.yaml` — captured trial config (note: predates the model
  override fix; the canonical manifest at
  `experiments/X018-package-surface-map-injection/manifests/calibration-baseline.yaml`
  has been updated).
- `trial-context.yaml` — lab-host probe output.
- `stacks-export/` — full books export.
- `README.md` — auto-generated probe summary.
