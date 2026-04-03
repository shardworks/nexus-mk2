# Engine Collect Callback & AnimateHandle SessionId

Status: **Draft**

Complexity: **3**

Codex: nexus

## Problem

Two related issues in the quick engine lifecycle:

**1. The Spider hardcodes engine-specific collect logic.** The Spider's `tryCollect` step branches on `engine.id === 'review'` to assemble review-specific yields. Every new engine with custom collect logic would require another `if` branch in `spider.ts`. The engine should own its own yield assembly.

**2. Quick engines block on session completion.** `run()` must `await handle.result` just to get the `sessionId` — the only way to extract it from `AnimateHandle`. By the time `run()` returns `{ status: 'launched' }`, the session is already done. The engine is never visibly `running` in the Stacks.

## What to build

### 1. Add `sessionId` to `AnimateHandle`

In `@shardworks/animator-apparatus`, expose the session ID on the handle immediately:

```typescript
interface AnimateHandle {
  /** Session ID, available immediately after launch. */
  sessionId: string;
  chunks: AsyncIterable<SessionChunk>;
  result: Promise<SessionResult>;
}
```

Update `animator.summon()` to generate the session ID up front and include it on the returned handle before the session promise resolves.

This lets quick engines return without blocking:

```typescript
// Before (blocks until session completes):
const handle = animator.summon({...});
const sessionResult = await handle.result;
return { status: 'launched', sessionId: sessionResult.id };

// After (returns immediately):
const handle = animator.summon({...});
return { status: 'launched', sessionId: handle.sessionId };
```

### 2. Update all quick engines to use `handle.sessionId`

Remove the `await handle.result` from `run()` in:
- `implement.ts`
- `review.ts`
- `revise.ts`

Each engine's `run()` should return immediately after `animator.summon()`, using `handle.sessionId`.

### 3. Add optional `collect` to `EngineDesign`

In `@shardworks/fabricator-apparatus`, extend the `EngineDesign` interface:

```typescript
interface EngineDesign {
  id: string;
  run(givens: Record<string, unknown>, context: EngineRunContext): Promise<EngineRunResult>;

  /**
   * Assemble yields from a completed session.
   *
   * Called by the Spider's collect step when a quick engine's session
   * reaches a terminal state. The engine looks up whatever it needs
   * via guild() — same dependency pattern as run().
   *
   * If not defined, the Spider uses a generic default:
   *   { sessionId, sessionStatus, output? }
   *
   * Only relevant for quick engines (those that return `{ status: 'launched' }`).
   * Clockwork engines return yields directly from run().
   */
  collect?(sessionId: string, givens: Record<string, unknown>, context: EngineRunContext): Promise<unknown>;
}
```

No new types needed in the Fabricator — `collect` reuses `EngineRunContext`. The signature mirrors `run(givens, context)` with `sessionId` as the primary input: "collect *this session*, given *these inputs*, in *this context*."

### 4. Update the Spider's collect step

Replace the `if (engine.id === 'review')` branch with a design lookup:

```typescript
// In tryCollect, after confirming terminal session:
const design = fabricator.getEngineDesign(engine.designId);
const givens = { ...engine.givensSpec };
const upstream = buildUpstreamMap(rig);
const context = { engineId: engine.id, upstream };

let yields: unknown;
if (design?.collect) {
  yields = await design.collect(engine.sessionId, givens, context);
} else {
  // Generic default for engines without a collect callback
  yields = {
    sessionId: session.id,
    sessionStatus: session.status,
    ...(session.output !== undefined ? { output: session.output } : {}),
  };
}
```

The Spider still reads the session itself to check for terminal status — that doesn't change. The `collect` callback only handles yield assembly.

### 5. Move review collect logic into the review engine

Add a `collect` method to the review engine design:

```typescript
const reviewEngine: EngineDesign = {
  id: 'review',

  async run(givens, context) {
    // ... unchanged, except uses handle.sessionId instead of awaiting ...
  },

  async collect(sessionId, _givens, _context) {
    const stacks = guild().apparatus<StacksApi>('stacks');
    const sessionsBook = stacks.readBook<SessionDoc>('animator', 'sessions');
    const session = await sessionsBook.get(sessionId);
    const findings = session?.output ?? '';
    const passed = /^###\s*Overall:\s*PASS/mi.test(findings);
    const mechanicalChecks = (session?.metadata?.mechanicalChecks as unknown[]) ?? [];
    return { sessionId, passed, findings, mechanicalChecks };
  },
};
```

### 6. Update specs

**Fabricator spec** (`docs/architecture/apparatus/fabricator.md`):
- Add `collect` to the `EngineDesign` interface definition

**Spider spec** (`docs/architecture/apparatus/spider.md`):
- Update collect step description to mention `design.collect()` dispatch
- Update review engine section: collect logic on the design, not Spider-side
- Note that implement/revise use the generic default

**Animator spec** (`docs/architecture/apparatus/animator.md`):
- Update `AnimateHandle` interface to include `sessionId`

---

## What to validate

- **AnimateHandle.sessionId:** available immediately, matches the session that eventually resolves on `handle.result`
- **Quick engines return immediately:** `run()` does not await `handle.result`; engine is visibly `running` in the Stacks while the session executes
- **Collect dispatch:** Spider calls `design.collect(sessionId)` when defined, falls back to generic when not
- **Review engine collect:** same yields as before (sessionId, passed, findings, mechanicalChecks)
- **Implement/revise engines:** no `collect` method, generic yields unchanged
- **Full pipeline:** `draft → implement → review → revise → seal` completes as before
- **Fabricator type guard:** `isEngineDesign` still works (collect is optional)

## Prerequisites

- **Walker → Spider rename** — there is an active commission renaming the Walker apparatus to Spider. This commission should be dispatched after that rename lands. All references in this spec use the new name (Spider).

## What is NOT in scope

- Adding `collect` to clockwork engines (they return yields directly from `run()`)
- Changing `SessionDoc` type in the Animator
- Making the Spider's terminal-status check use `collect` (Spider still reads the session to detect completion)
