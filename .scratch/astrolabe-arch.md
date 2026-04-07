# The Astrolabe — API Contract

Status: **WIP**

Package: `@shardworks/astrolabe` · Plugin id: `astrolabe`

> **⚠️ Mountain-form.** This document captures the Astrolabe's purpose and boundaries. API surface, kit interface, behavioral details, and configuration will be fleshed out through commissions as the design matures.

---

## Purpose

The Astrolabe refines minimal briefs from the patron into detailed work specifications. When the patron commissions work — often as little as a sentence or two — the Astrolabe takes that raw intent and produces a structured spec: decisions to be made, requirements to be met, and acceptance criteria to be verified. The output is what the Spider needs to build a rig.

The Astrolabe does **not** execute work (that's the rig's domain). It does **not** manage the commission lifecycle or writ state (that's the Clerk's). It sits between the patron's intent and the guild's labor — a computing instrument that turns "build me X" into a precise course of action.

---

## Dependencies

```
requires: [clerk, stacks]
```

- **Clerk** — the Astrolabe reacts to incoming commissions and writes its output back as structured spec artifacts attached to the writ.
- **Stacks** — spec artifacts and refinement state are persisted as book entries.

---

## Open Questions

- **Patron interaction model.** The current external plan-writer uses a decision-point flow where the patron reviews analyst recommendations and can override. How does this translate to a guild-native apparatus? Does the Astrolabe pause the writ and surface decisions to the patron, or is the interaction handled externally?
- **Kit extensibility.** Should kits be able to contribute domain-specific analysis strategies to the Astrolabe (e.g. "for codex X, always consider these architectural constraints")? Or is analysis logic entirely internal?
- **Relationship to the Sage role.** The guild metaphor defines Sages as planners who decompose commissions. Is the Astrolabe the apparatus that Sages staff, the way a quick engine is the apparatus an Artificer staffs? Or is it purely clockwork?
- **Spec format.** What is the output schema? The current plan-writer produces markdown specs with YAML decision files. The guild-native version may want a more structured format that downstream engines can parse programmatically.
