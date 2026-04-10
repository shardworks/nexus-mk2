_Imported from `.scratch/todo/qs2-structured-concern-list.md` (2026-04-10)._

## Goal

Add a `concerns` qualitative field to all three quality scoring instruments (spec-blind, spec-aware, integration). Each scoring run outputs "top 3 quality concerns in order of severity, or state that none were found." Captures the nuance the quantitative scale can't express — architectural choices, subtle debt, minor-but-real issues that don't warrant a score reduction — while staying analyzable (count concern types, track recurrence) without forcing everything through a numeric funnel.

## Status

Tabled. Instrument runs paused pending the cache-prefix cost fix (T4.1). Revisit after T4.1 ships.

## Next Steps

When T4.1 lands and instruments come back online: add `concerns` as a `block_scalar` qualitative field in each instrument's `instrument.yaml`, update the prompt output schema to request the list (severity-tagged bullets), and re-run a small validation cohort to confirm the concerns surface useful signal that the numeric scores miss. No parser changes needed — qualitative fields are already handled.

## Context

**Why structured rather than freeform:** manual review notes consistently surface concerns the scorer misses or can't express numerically. A structured list captures the qualitative signal while staying machine-readable enough for analysis. The numeric scale handles "how bad," the concerns list handles "what kind."

**Suggested format in prompt:**

```yaml
concerns: |
  1. [severity: high/medium/low] Brief description. (file.ts:42)
  2. [severity: medium] Another concern.
  3. None — no significant quality concerns identified.
```

**Why this is small:** No parser changes (qualitative fields already supported). Prompt template edit + instrument.yaml field addition. Probably half a day of work plus a validation cohort.

## References

- Parent quest: T4 (`x013-instrumentation-review`)
- Source doc: `.scratch/todo/qs2-structured-concern-list.md`
- Source: X013 data collection assessment (2026-04-03)
- Blocked on: T4.1 (unified instrument context)
- Instrument configs: `experiments/instruments/*/v2/instrument.yaml` (or current version)

## Notes

- 2026-04-10: opened as child of T4.