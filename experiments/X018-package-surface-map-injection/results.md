# X018 Results — Package Surface Map Injection

**Completed:** 2026-05-03
**Verdict:** H1 (≥25% reader-analyst cost reduction without quality regression) **not sustained** on Lever A prompt injection. Mechanism (orientation-traffic suppression) **confirmed**.

## Verdict

**H1 not sustained on Lever A.** Three injection variants were run
(N=1 each) on the cartograph commission replay; reference baseline
trial 5 cost $9.04 / 15.92 min:

| variant | format / size | reader-analyst cost | Δ vs baseline |
|---|---|---|---|
| 1 | compact JSON, 22K tokens | $7.88 | **−13%** |
| 2 | tight text (levers 1+2+3), 7K tokens | $8.24 | −9% |
| 3 | YAML, full schema, 28K tokens | $11.55 | **+28%** |

Best variant achieved −13%, well below H1's ≥25% threshold. The
shape of the curve is informative: variant 1 was a local optimum;
both shrinking the payload (v2) and switching to YAML syntax (v3)
moved off it in a worse direction. Compact JSON appears to be a
sweet spot for LLM-readable structured reference material.

**Mechanism confirmed.** The spec's tool-call profile prediction
held cleanly on variant 1: orientation-class calls dropped while
deep semantic reads stayed roughly unchanged.

| tool | baseline | variant 1 | Δ |
|---|---|---|---|
| Bash (`ls` walks, existence checks) | 24 | 5 | **−79%** |
| Grep (existence/cross-ref) | 25 | 6 | **−76%** |
| Read (deep semantic) | 34 | 31 | −9% |

The planner WILL skip orientation work when the answer is
structurally available in its prompt. This is the load-bearing
finding even though H1 didn't sustain.

**Quality flagged but not red-flagged.** Variant 1's plan was
materially equivalent to baseline on coverage, but bundled scope
items more aggressively (3 vs 5 items), consolidated decisions
(17 vs 22), and missed 1 of 3 baseline observations (the kit-channel
cross-cutting design Q). Tier 2 read found no decisions or scope
elements absent — the variant produced a structurally complete
plan in fewer "items." Whether this is a regression or an
improvement (per the role's own scope-decomposition guidance, which
favors bundling inseparable work) is a judgment call.

**Cost ceiling diagnosis.** The cache-write tax on the bigger
system prompt is the bottleneck. Variant 1's net savings:
- cache reads: −$2.40 (less re-reading of orientation files)
- cache writes: +$0.36 (caching the bigger system prompt)
- output tokens: −$0.60 (smaller plan)
- net: −$1.16 per cartograph trial

Shrinking the prompt past variant 1's size traded cache-write
savings for cache-read regressions (the planner re-read the smaller
map MORE because it lost confidence in it).

## Recommendation

**Do not productionize Lever A or Lever B as currently scoped.**
−13% on an $8 baseline (~$1/run) does not clear the bar for the
framework investment Lever B would require, and the Lever A
mechanism is bounded by the cache-write tax + the format-readability
constraint (variants 2 and 3 establish the local maximum is at v1).

**Pivot to a queryable-interface approach** (X019-style; see
companion experiment). The mechanism finding is real and worth
preserving: the planner does substantial wasteful orientation work
that a structured answer can suppress. A tool-based interface
delivers the same signal without the cache-write tax, with no
quality-regression risk from an information-dense prompt, and with
better scaling to larger codexes than injection allows.

Captured as click `c-mop840e3` during analysis; the Lever A trials
above resolve that question with a clean negative result on
injection.

**Defer the cost-saving generalization question** until N≥3 trials
on the cartograph baseline + at least one other workload. N=1 per
variant is sufficient for *directional* H1 evidence (and we got
clean directional answers); it's not sufficient to rule out
between-run variance in the cost numbers. The mechanism finding
(tool-call profile shifts) is robust at N=1 because the magnitude
is so large.

## Artifacts

Trial extracts under `artifacts/`:
- `2026-05-02-calibration-baseline/` — trial 1 (Sonnet vs Opus mismatch; diagnostic)
- `2026-05-02-calibration-baseline-opus/` — trial 4 (Opus, loom kit-validator bug; diagnostic)
- `2026-05-03-calibration-baseline-opus-fixed/` — trial 5 (apparatus-fixed Opus baseline; the reference)
- `2026-05-03-with-surface-map-cartograph/` — variant 1 (compact JSON injection; H1 evaluation)
- `2026-05-03-with-surface-map-tight-cartograph/` — variant 2 (tight format; falsified shrinkage hypothesis)
- `2026-05-03-with-surface-map-yaml-cartograph/` — variant 3 (YAML; falsified format-readability hypothesis)

Surface-map artifacts (re-usable for X019 or follow-up):
- `2026-05-03-surface-map-aff280e7.json` — canonical generator output
- `2026-05-03-surface-map-aff280e7.yaml` — YAML rendering
- `2026-05-03-surface-map-aff280e7-tight.txt` — tight textual rendering
- `2026-05-02-surface-map-30ea3c8e1db6.json` — earlier generator output (different SHA)

Generator + transform scripts under `scripts/` and variant-builder
under `variants/`.

## Side findings (worth carrying forward)

- **Loom kit-validator bug** (`c-mooouduy`) — astrolabe role
  permissions reference clerk and ratchet via the `requires` set,
  but the lookup happens before astrolabe is fully registered as
  an apparatus, so it falls back to an empty deps list and drops
  `clerk:read` and `ratchet:read`. Workaround: guild-level role
  overrides + role files copied via the `files:` mechanism.
  Captured for follow-up.
- **Spec-only trials need rig-based wait** — the `lab.plan-only`
  rig template's mandate writ never seals (no seal engine), so
  writ-based wait would always time out. Built `lab.wait-for-rig-
  terminal-xguild` to poll the spider rig directly. Landed in
  `packages/laboratory/src/engines/scenario-xguild.ts`.
- **Spec-writer rate-limit cascade** — under Anthropic rate
  limiting, the spec-writer (engine 7 of 9 in lab.plan-only) can
  retry hourly indefinitely, blowing past the outer rig's
  `waitForRigTerminal` cap. The reader-analyst (engine 3) is
  unaffected. For X018-shape experiments, a `lab.plan-only-after-
  analyst` rig that resolves at `inventory-check` would skip the
  irrelevant downstream chain. Captured for laboratory roadmap.
- **Surface-map size at scale** (`c-moojxn2c`) — for the current
  Nexus monorepo (24 packages, 259 files, 1310 exports), the
  surface map is ~87 KB compact / ~22K tokens. For larger codexes
  this approach would be infeasible; the queryable-interface route
  scales better.
