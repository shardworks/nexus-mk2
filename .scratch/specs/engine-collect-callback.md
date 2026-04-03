# Engine Collect Callback

Status: **Draft**

Complexity: **2**

Codex: nexus

## Problem

The Spider's `tryCollect` step currently hardcodes engine-specific yield assembly:

```typescript
// spider.ts — tryCollect
if (engine.id === 'review') {
  // parse session.output for findings, extract passed flag, retrieve mechanicalChecks
  yields = { sessionId, passed, findings, mechanicalChecks };
} else {
  // generic: sessionId + sessionStatus + output
  yields = { sessionId, sessionStatus, output };
}
```

This couples the Spider core to the review engine's data model. Every new engine with custom collect logic requires another `if` branch in `spider.ts`. The engine should own its own yield assembly.

## What to build

### 1. Add optional `collect` to `EngineDesign`

In `@shardworks/fabricator-apparatus`, extend the `EngineDesign` interface:

```typescript
interface EngineDesign {
  id: string;
  run(givens: Record<string, unknown>, context: EngineRunContext): Promise<EngineRunResult>;

  /**
   * Assemble yields from a completed session record.
   *
   * Called by the Spider's collect step when a quick engine's session
   * reaches a terminal state. The engine inspects the session record
   * and returns the yields to store on the engine instance.
   *
   * If not defined, the Spider uses a generic default:
   *   { sessionId, sessionStatus, output? }
   *
   * Only relevant for quick engines (those that return `{ status: 'launched' }`).
   * Clockwork engines return yields directly from `run()`.
   */
  collect?(session: SessionRecord): unknown;
}
```

The `SessionRecord` type passed to `collect` should be a read-only view of the session document. Use the existing `SessionDoc` from `@shardworks/animator-apparatus` — the Spider already imports it.

**Decision: import or inline?** The Fabricator currently has zero dependencies on the Animator. Adding `SessionDoc` as a parameter type would create a coupling. Two options:

- **Option A: Use `SessionDoc` directly.** The Fabricator imports `SessionDoc` from `@shardworks/animator-apparatus`. Simple, but couples the engine design contract to the Animator's type.
- **Option B: Define a minimal `SessionRecord` in the Fabricator.** Just the fields engines need: `{ id, status, output?, metadata?, error? }`. Decoupled, but duplicates part of the Animator's type surface.

**Recommendation: Option B.** The Fabricator is meant to be the canonical home for engine authoring types. A minimal `SessionRecord` keeps the contract self-contained. Engines that need more can import `SessionDoc` themselves and cast.

```typescript
/** Minimal session record passed to engine collect callbacks. */
interface SessionRecord {
  id: string;
  status: string;
  output?: string;
  metadata?: Record<string, unknown>;
  error?: string;
}
```

### 2. Update the Spider's collect step

Replace the `if (engine.id === 'review')` branch with a design lookup:

```typescript
// In tryCollect, after confirming terminal session:
const design = fabricator.getEngineDesign(engine.designId);

let yields: unknown;
if (design?.collect) {
  yields = design.collect(session);
} else {
  // Generic default for engines without a collect callback
  yields = {
    sessionId: session.id,
    sessionStatus: session.status,
    ...(session.output !== undefined ? { output: session.output } : {}),
  };
}
```

### 3. Move review collect logic into the review engine

Add a `collect` method to the review engine design:

```typescript
const reviewEngine: EngineDesign = {
  id: 'review',

  async run(givens, context) { /* ... unchanged ... */ },

  collect(session) {
    const findings = session.output ?? '';
    const passed = /^###\s*Overall:\s*PASS/mi.test(findings);
    const mechanicalChecks = (session.metadata?.mechanicalChecks as unknown[]) ?? [];
    return { sessionId: session.id, passed, findings, mechanicalChecks };
  },
};
```

### 4. Update the Fabricator spec

Add the `collect` method to the `EngineDesign` interface definition in `docs/architecture/apparatus/fabricator.md`. Add the `SessionRecord` type.

### 5. Update the Spider spec

Update the collect step descriptions throughout `docs/architecture/apparatus/spider.md`:
- The general collect step description (step 1 in priority ordering) should mention `design.collect()` dispatch
- The implement engine's collect step should note it uses the generic default (no `collect` method)
- The review engine's collect step should show the `collect` method on the design, not Spider-side code
- The revise engine's collect step should note it uses the generic default

---

## What to validate

- **Collect dispatch:** Spider calls `design.collect(session)` when defined, falls back to generic when not
- **Review engine collect:** same yields as before (sessionId, passed, findings, mechanicalChecks)
- **Implement/revise engines:** no `collect` method, generic yields unchanged
- **Full pipeline:** `draft → implement → review → revise → seal` completes as before
- **Fabricator type guard:** `isEngineDesign` still works (collect is optional, doesn't affect the guard)
- **Spec sync:** both Fabricator and Spider specs updated

## What is NOT in scope

- Making `collect` async (session record is already loaded by the Spider)
- Adding `collect` to clockwork engines (they return yields directly from `run()`)
- Changing the `SessionDoc` type in the Animator
