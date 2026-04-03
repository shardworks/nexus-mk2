# Commission Data

Per-commission artifacts, organized by writ ID (e.g. `w-abc123/`). Pre-Clerk commissions used session IDs (`ses-*`) or ad-hoc labels as folder names.

## Two-Tier Data Architecture

Commission data is split across two tiers:

1. **Commission log** (`experiments/data/commission-log.yaml`) — lean, human-navigable. Contains patron-subjective judgments: complexity, spec quality (pre/post), outcome, revision required, failure mode, and notes. Designed to be read end-to-end by a human or agent.

2. **Per-commission artifacts** (this directory) — the full evidentiary record. Contains objective/automated data: session telemetry, instrument outputs, commission body, dispatch log, review notes.

The `id` field in the commission log corresponds to the folder name here. This is the join key for assembling a unified analytical dataset.

### What lives where

| Data | Location | Source |
|------|----------|--------|
| Patron complexity estimate | Commission log | Manual, at dispatch |
| Spec quality (pre/post) | Commission log | Manual |
| Outcome, revision required | Commission log | Manual, at review |
| Failure mode | Commission log | Manual, at review |
| Session cost, duration, tokens | `sessions/*.yaml` | The Laboratory (auto) |
| Instrument results | `instruments/{name}/result.yaml` | Instrument runner (auto) |
| Instrument context | `instruments/{name}/context/` | Instrument runner (auto) |
| Commission body text | `commission.md` | `inscribe.sh` (auto) |
| Dispatch lifecycle log | `dispatch.log` | `inscribe.sh` (auto) |
| Patron review notes | `review.md` | Manual |

## Directory Layout

```
{commission-id}/
  commission.md              # The writ body — what the patron commissioned
  dispatch.log               # Timestamped dispatch lifecycle log
  review.md                  # Patron review notes and observations
  sessions/                  # Session records (YAML): timing, cost, tokens
  instruments/               # Instrument results and context
    spec-blind-quality-scorer/
      result.yaml            # Scores, aggregate, per-run detail
      context/               # Assembled prompts + extracted inputs
        system-prompt.md
        user-message.md
        input-diff.txt
        input-full-files.txt
        ...
    spec-aware-quality-scorer/
      result.yaml
      context/
        ...
    codebase-integration-scorer/
      result.yaml
      context/
        input-api-surface.txt
        ...
```

## Instruments

| Instrument | Aperture | Dimensions | Trigger |
|------------|----------|------------|---------|
| `spec-blind-quality-scorer` | Narrow (diff + local) | test, structure, error, consistency | Every commission (auto) |
| `spec-aware-quality-scorer` | Narrow (diff + local + spec) | test, structure, error, consistency, requirements | Every commission with spec (auto) |
| `codebase-integration-scorer` | Wide (diff + full API surface) | utility reuse, module placement, pattern coherence, scope discipline | Every commission with spec (auto) |

Each instrument result file records the instrument name, version, parameters, and per-run detail. Results are self-describing — the `instrument.name` and `instrument.version` fields identify exactly which instrument and rubric produced the scores.

## Notes

- Legacy commission folders may contain `quality-blind.yaml`, `quality-aware.yaml`, and `quality-context/` from the pre-instruments-directory layout. These are superseded by the `instruments/` structure.
- Legacy folders may also contain `prompt.md`, `spec.md`, and `session.json` from the pre-Clerk workflow. These are superseded by `commission.md`, `instruments/*/context/`, and `sessions/` respectively.
