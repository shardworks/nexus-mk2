# v3: Preference Model — Patron Corrections Graduate Decisions Through Tiers

## Summary

Build the feedback loop that makes the tiered decision model learn over time. When the patron overrides a planner decision (correcting a default), that correction is captured, stored, and used to improve future defaults. Decisions graduate downward through the tiers as patterns accumulate: a Tier 4 decision (required patron signal) that gets the same correction three times becomes a Tier 2 (configurable preference with a known default).

Depends on v1 (decision table in implementation briefs) and benefits from v2 (task-loop surfaces decisions more granularly).

## Motivation

Without a preference model, the tiered decision system is static — the planner makes the same best guesses forever. The patron corrects the same decisions repeatedly. The system never learns that "Sean always wants X in this situation." The preference model closes this loop: corrections accumulate into lore that improves future defaults.

This is the mechanism by which the system converges toward true autonomous operation — not by being right from the start, but by learning from corrections over time.

## Design sketch

### Correction capture

When the patron reviews a completed commission and overrides a decision (via the ratification/correction UI), the override is recorded as a correction event:
- Which decision was overridden (linked to the decision table entry)
- What the default was
- What the patron chose instead
- The context (commission type, codex, domain area)

### Correction storage

Corrections accumulate in a persistent store (likely a Stacks book or a dedicated apparatus). The store supports queries like:
- "For decisions of type X in codex Y, what has the patron chosen historically?"
- "How many times has this default been overridden?"
- "What's the most common patron choice for this decision category?"

### Tier graduation

When a decision category accumulates enough consistent corrections (threshold TBD — maybe 3 consistent overrides), the system proposes graduating it:
- Tier 4 → Tier 2: "The patron always chooses X for this. Recording as a preference."
- Tier 3 → Tier 2: "Outcome data consistently favors X. Recording as a preference."
- Tier 2 → Tier 1: "This preference has been stable across 10+ commissions. Hardcoding."

Graduation proposals are surfaced to the patron for ratification (the system doesn't silently change its own behavior).

### Planner integration

When the planner builds a decision table for a new commission, it queries the preference model:
- "For this type of decision, is there a known patron preference?"
- If yes: use it as the default and lower the tier
- If no: use best-guess default at the current tier

## Open questions

- What's the right storage mechanism? Stacks book? Dedicated apparatus? File-based in the sanctum?
- How are decisions categorized for cross-commission pattern matching? By name? By domain? By semantic similarity?
- What's the graduation threshold? Fixed count? Statistical confidence?
- How does this interact with multi-codex setups? Per-codex preferences? Global preferences?
- What's the correction UI? Part of Oculus? Part of the Coco review workflow?
- How do we handle preference conflicts (patron chose X for commission A but Y for similar commission B)?

## Vocabulary connections

- **Lore** — the preference model is accumulated lore about patron decision patterns
- **Rune** — patron preferences, once crystallized, could be expressed as reusable instruction fragments

## References

- Quest: w-mo0v636y (decision-centric planner — preference model section)
- Prerequisite: v1 commission (decision tables in implementation briefs)
- Benefits from: v2 commission (task-loop surfaces granular decisions)
- Related: w-mnsz0ve6 (assumptions mode — invert discussion default from "ask me" to "correct me")