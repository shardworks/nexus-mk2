# Engine Designs

This document covers engine designs — the blueprints kits contribute for the Spider to mount into rigs. For the broader system context, see [overview.md](overview.md). For how the Spider uses engine designs to build and run rigs, see [the Spider architecture](spider.md) *(forthcoming)*.

---

## What an Engine Design Is

An engine design is a blueprint for a unit of work. The Spider draws from all installed engine designs when assembling a rig for a commission — each design describes what an engine does, what it needs, and what it produces. The Spider mounts engines into rigs, satisfies their dependencies, and sets them in motion.

An engine may be:
- **Clockwork** — deterministic, no anima required. Runs as a mechanical process.
- **Quick** — inhabited by an anima during execution. Used for work requiring judgment.

Engine designs are contributed by kits and consumed by the Spider apparatus. They are declared statically in the manifest — the Spider reads them at load time before any commission runs.

---

## SpiderKit

The Spider apparatus publishes a `SpiderKit` interface that kit authors import for type safety:

```typescript
// Published by nexus-spider
interface SpiderKit {
  engines?: EngineDesign[]
}
```

A plugin contributing engine designs satisfies `SpiderKit`:

```typescript
import type { SpiderKit } from "nexus-spider"

export default {
  name: "nexus-git",
  kit: {
    engines: [createBranchEngine, deleteBranchEngine, mergeBranchEngine],
    recommends: ["nexus-spider"],
  } satisfies SpiderKit,
} satisfies Plugin
```

---

## Engine Design Structure

*This section is a placeholder pending Spider design specification.*

An engine design declares:
- **Identity** — name and version
- **Kind** — `clockwork` or `quick`
- **Needs** — inputs/preconditions the engine requires before it can run
- **Yields** — outputs the engine produces on completion
- **Handler** — the module or script that performs the work

```typescript
// Approximate shape — pending Spider spec
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

- Full `EngineDesign` type contract (pending Spider specification)
- How the Spider resolves engine designs at rig assembly time
- Rig descriptor format for declaring which engines a commission requires
- Engine versioning and upgrade paths
