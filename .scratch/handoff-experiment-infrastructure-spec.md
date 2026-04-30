# Handoff — experiment-infrastructure spec review

**Situation.** A draft spec for experimental-infrastructure (setup,
artifact, lifecycle conventions for running framework-touching trials)
has been written at `experiments/infrastructure/setup-and-artifacts.md`.
You are picking up to refine it with Sean.

**Next move.** Open the spec, read it end-to-end, and start the
refinement conversation. Ask Sean which sections he wants to scrutinize
first; don't preemptively rewrite or summarize.

## Anti-orientation

- **Do NOT** re-derive the design conversation that produced the spec.
  Substantive design decisions are captured in the spec itself.
- **Do NOT** open `.scratch/cost-optimization-landscape.md`,
  `.scratch/p3-handoff-rig1-t52.md`, or
  `experiments/X011-context-debt/artifacts/2026-04-30-implementation-tail-analysis.md`
  unless Sean references them. They're context, not load-bearing for
  the spec review.
- **Do NOT** scan the click tree at startup beyond the standard
  orientation. The relevant clicks are listed below.

## Background context (read only if Sean refers to it)

- **Driver:** P3 (engine-pipeline-decomposition; click `c-modxxtu6`,
  cost-optimization landscape idea #15) needs empirical confirmation
  for several sub-questions, starting with Q4 (orientation suppression).
  This infrastructure is the prerequisite for those empirical trials.
- **What's settled:** the three-repo separation (sanctum, nexus
  experiment branches, short-lived codex forks), one-guild-per-trial
  model, sanctum as canonical record, manifest-driven setup, file-per-
  table stacks dump format, per-commit codex history capture.
- **What's open:** the spec's "Open implementation questions" section
  lists 8 framework-mapping questions that need answering before the
  setup/archive/cleanup scripts can be built. None are blockers for the
  spec review itself.
- **What's NOT this:** building the actual scripts. That's a follow-on
  task once the spec is settled.

## Pointers

- **The spec:** `experiments/infrastructure/setup-and-artifacts.md`
- **Driving click:** `c-modxxtu6` (P3 / idea #15) — has a child click
  pointing at this spec as a prerequisite.
- **Earlier session:** transcript at session
  `8dd39ccd-28cc-45eb-8cdb-447d0169b353` (this draft was produced near
  the end of that session; refer if Sean wants context on a specific
  decision).

## What Sean said when handing off

> "I will review the spec and continue refining it with clean context."

So expect: Sean has read or is reading the spec, has questions and/or
disagreements with specific sections, and wants targeted refinement —
not a re-pitch of the whole design.
