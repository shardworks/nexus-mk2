# Laboratory Operations

Operational guides for running trials through the Laboratory
apparatus (`packages/laboratory/`). This directory captures the
reusable how-to and gotchas that recur across experiments —
consolidated here so individual experiment specs don't have to
restate them.

## Trial doctypes

The lab supports two distinct trial shapes. Pick the one that
matches what you're measuring:

- **xguild trial** — full sub-guild fidelity. The lab host posts a
  commission into a disposable test guild that runs the production
  pipeline (plan → implement → review → revise → seal). Use when
  end-to-end pipeline behavior is the variable, when you need
  faithful spider/loom/animator orchestration, or when the rig
  template itself is what's under test. Higher per-trial cost and
  setup time; full apparatus fidelity.
- **claude-direct trial** — single (or short-chain) claude session
  in a fresh codex checkout, no test guild. Use when the variable
  lives in the prompt or role-file layer (briefs, role
  instructions, model selection, inventory format) and the rest
  of the pipeline is ceremony around the measurement. Lower
  per-trial cost and wallclock, faster iteration, slight
  production-fidelity drift.

When in doubt, prefer claude-direct for spec/prompt/role
experiments and xguild for everything else.

## Guides

- **[running-xguild-trials.md](./running-xguild-trials.md)** —
  full sub-guild trials. Trial shapes, plugin sets, framework
  pinning, known gotchas, codex selection, and the spec-only
  (planning-only) rig recipe.
- **[running-claude-direct-trials.md](./running-claude-direct-trials.md)** —
  lightweight single-session trials. Manifest shape, optional
  review→revise loop, verification policy, and production-fidelity
  caveats.
- **[calculating-costs.md](./calculating-costs.md)** — what the
  stamped `costUsd` field actually represents under our Pro Max
  20x subscription, the systematic 3× gap between stamped values
  and manual list-price recalculations, and the discipline for
  keeping experiment cost numbers comparable across trials.
  Applies to both trial doctypes.
- **[trial-workload-portfolio.md](./trial-workload-portfolio.md)** —
  curated set of historical implementer rigs cleared for use as
  benchmark workloads. Each workload calibrated with codex pin,
  sealed-state baseline failure profile, discrimination thresholds,
  and ready-to-drop manifest fixtures spanning 11 distinct work
  shapes (cross-package rename, greenfield apparatus, bugfix,
  frontend, non-nexus codex, etc.).
- **[experiment-discipline.md](./experiment-discipline.md)** —
  two-tier threshold framework distinguishing detection (statistical
  confidence at low n) from deployment (expected-value gate for
  low-risk shipping). Codifies when to use production telemetry as
  primary evidence vs trial measurement, and the discipline for
  stacking small wins and rolling back from production monitoring.

More guides land here as the apparatus grows. Examples of likely
future additions: probe authoring, fixture composition patterns,
cross-guild scenario design, archive/extract workflow.
