# QS-2: Add Structured Concern List to Quality Scorers

**Source:** X013 data collection assessment (2026-04-03)

**What:** Add a `concerns` qualitative field to all three instruments (spec-blind, spec-aware, integration). Each scoring run outputs "top 3 quality concerns in order of severity, or state that none were found."

**Why:** Manual review notes consistently surface concerns the scorer misses or can't express numerically. A structured list captures nuance the quantitative scale cannot — architectural choices, subtle debt, minor-but-real issues that don't warrant a score reduction. Still analyzable (count concern types, track recurrence) without forcing everything through a numeric funnel.

**Implementation:**
- Add `concerns` as a `block_scalar` qualitative field in each instrument's `instrument.yaml`
- Update prompt output schema to request the list (severity-tagged bullets)
- No parser changes needed — qualitative fields already handled
- Suggested format in prompt:
  ```yaml
  concerns: |
    1. [severity: high/medium/low] Brief description. (file.ts:42)
    2. [severity: medium] Another concern.
    3. None — no significant quality concerns identified.
  ```

**Status:** Tabled (2026-04-06). Instrument runs paused pending cache-prefix cost fix. Revisit after URGENT-unified-instrument-context.md is resolved.
