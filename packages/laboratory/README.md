# The Laboratory

Apparatus for running trial-shaped experiments on guild configurations.

## Audiences

- **Nexus dev** — cost/quality tuning, prompt evaluation, plugin variant
  comparison. Replaces the standalone-bash spec at
  `experiments/infrastructure/setup-and-artifacts.md`.
- **End users** — evaluate prompts, plugins, and config variants by
  authoring trial manifests against a stable apparatus surface.

## Architecture (MVP0)

- **Writ type:** `trial` — a single execution unit. Lifecycle mirrors
  mandate (`new → open → completed | failed | cancelled`, with `stuck`
  as a non-terminal off `open`). Trials are leaves in v1; the
  higher-level `experiment` grouping is parked for v2.
- **Rig template:** `post-and-collect-default` — composes
  fixture-setup, scenario, probe, teardown, and archive engines from
  the writ's `ext.laboratory.config`. One canonical template; extension
  is via plugin contributions, not in-template slots.
- **Engines:**
  - **Fixtures** — set up and tear down disposable surfaces (codex
    repos, test guilds). Form a dep DAG; topo-sorted at template
    instantiation.
  - **Scenario** — the workload. v1 uses cross-guild commission-post +
    wait-for-writ-terminal as the canonical scenario engine pair.
  - **Probes** — extract data from one or more fixtures (stacks dump,
    git range capture).
  - **Archive** — captures probe outputs for the research record.
    Storage layout in design at click `c-momaa5o9`.
- **Authoring:** YAML manifest via `nsg lab trial post --manifest <file>`.
  Manifest shape mirrors `ext.laboratory.config` exactly.

## Status

Skeleton only. The trial writ type is registered; engine designs, the
rig template, and the manifest CLI are added by subsequent
implementation children under click `c-moma9llq`.

## Background

This package previously held a CDC-based observational stub (data
mirroring of writs/sessions into the sanctum). That instrument was
retired 2026-04-30 — its underlying signals (patron-set spec quality
ratings, structured commission review) had been hollowed out by the
shift to automated planning and static review pipelines. The package
was kept as a no-op so existing `guild.json` registrations stayed
loadable; the apparatus reshape reuses the package and the registered
plugin id, but the old data-mirroring code and types are gone.
