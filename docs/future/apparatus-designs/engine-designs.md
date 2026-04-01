# Engine Designs

This document covers engine designs — the blueprints kits contribute for the Walker to mount into rigs. For the broader system context, see [overview.md](overview.md). For how the Walker uses engine designs to build and run rigs, see [the Walker architecture](walker.md) *(forthcoming)*.

---

## What an Engine Design Is

An engine design is a blueprint for a unit of work. The Walker draws from all installed engine designs when assembling a rig for a commission — each design describes what an engine does, what it needs, and what it produces. The Walker mounts engines into rigs, satisfies their dependencies, and sets them in motion.

An engine may be:
- **Clockwork** — deterministic, no anima required. Runs as a mechanical process.
- **Quick** — inhabited by an anima during execution. Used for work requiring judgment.

Engine designs are contributed by kits and consumed by the Walker apparatus. They are declared statically in the manifest — the Walker reads them at load time before any commission runs.

---

## WalkerKit

The Walker apparatus publishes a `WalkerKit` interface that kit authors import for type safety:

```typescript
// Published by nexus-walker
interface WalkerKit {
  engines?: EngineDesign[]
}
```

A plugin contributing engine designs satisfies `WalkerKit`:

```typescript
import type { WalkerKit } from "nexus-walker"

export default {
  name: "nexus-git",
  kit: {
    engines: [createBranchEngine, deleteBranchEngine, mergeBranchEngine],
    recommends: ["nexus-walker"],
  } satisfies WalkerKit,
} satisfies Plugin
```

---

## Engine Design Structure

*This section is a placeholder pending Walker design specification.*

An engine design declares:
- **Identity** — name and version
- **Kind** — `clockwork` or `quick`
- **Needs** — inputs/preconditions the engine requires before it can run
- **Yields** — outputs the engine produces on completion
- **Handler** — the module or script that performs the work

```typescript
// Approximate shape — pending Walker spec
type EngineDesign = {
  name:    string
  kind:    "clockwork" | "quick"
  needs?:  NeedDeclaration[]
  yields?: YieldDeclaration[]
  handler: string  // module path or script path
}
```

---

## Open Questions

- Full `EngineDesign` type contract (pending Walker specification)
- How the Walker resolves engine designs at rig assembly time
- Rig descriptor format for declaring which engines a commission requires
- Engine versioning and upgrade paths
