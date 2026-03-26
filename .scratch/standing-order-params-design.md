# Standing Order Params & Summon-as-Engine — Design Draft

## Problem

Two related problems, one design:

1. **Engines can't receive configuration from standing orders.** An engine gets `(event, { home })` but no params. A circuit-breaker engine needs `maxAttempts`; a deploy engine might need `environment`. There's no way to pass config through.

2. **Anima dispatch is baked into the framework.** The `executeAnimaOrder()` function in clockworks.ts (~130 lines) handles writ binding, manifest, prompt hydration, session launch, and post-session writ lifecycle. This logic can't be customized, upgraded, or replaced without framework changes.

## Design: Two Parts

### Part 1 — Rest-Params on Standing Orders

Any key on a standing order that isn't a reserved structural key (`on`, `run`) is a **param** passed to the engine.

```json
{ "on": "writ.interrupted", "run": "circuit-breaker", "maxAttempts": 3 }
{ "on": "deploy.requested", "run": "deploy", "environment": "staging", "dryRun": true }
```

**Extraction** happens at dispatch time via a runtime helper:

```typescript
const RESERVED_KEYS = new Set(['on', 'run']);

function extractParams(order: Record<string, unknown>): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(order)) {
    if (!RESERVED_KEYS.has(key)) params[key] = value;
  }
  return params;
}
```

**EngineContext** gains a `params` field:

```typescript
export interface EngineContext {
  home: string;
  params: Record<string, unknown>;  // {} when no params provided
}
```

**The `StandingOrder` TypeScript type does not change.** guild.json is user-edited JSON — extra keys flow through `JSON.parse` whether the type declares them or not. The typed interface stays clean; extraction is a runtime concern. This avoids the index signature problem where `[key: string]: unknown` infects the known fields.

**Backwards compatible.** Existing engines don't destructure `params`, so they're unaffected. Existing standing orders have no extra keys, so `extractParams()` returns `{}`.

### Part 2 — Summon-as-Engine

The `summon` verb on standing orders becomes **syntactic sugar** for invoking a `summon-engine`:

```json
// What the operator writes (sugar):
{ "on": "mandate.ready", "summon": "artificer", "prompt": "You have been assigned..." }

// What the framework dispatches (desugared):
{ "on": "mandate.ready", "run": "summon-engine", "role": "artificer", "prompt": "You have been assigned..." }
```

The `summon` value maps to the `role` param. The `prompt` value passes through as a param. Any other keys the operator adds become params too:

```json
{ "on": "mandate.ready", "summon": "artificer", "prompt": "...", "maxSessions": 3 }
// desugars to:
{ "on": "mandate.ready", "run": "summon-engine", "role": "artificer", "prompt": "...", "maxSessions": 3 }
```

**Desugaring happens at dispatch time** — in `processEvent()`, before engine resolution. The operator's guild.json is never mutated. The config stays as-written; the framework translates on the fly.

```typescript
function desugarOrder(order: StandingOrder): Record<string, unknown> {
  const raw = order as Record<string, unknown>;

  if ('summon' in raw && typeof raw.summon === 'string') {
    const { summon, ...rest } = raw;
    return { ...rest, run: 'summon-engine', role: summon };
  }

  return raw;
}
```

After desugaring, every standing order is `{ on, run, ...params }`. One shape. One dispatch path.

### The Summon Engine

The `summon-engine` ships in **stdlib** alongside `workshop-prepare` and `workshop-merge`. It extracts from `executeAnimaOrder()` the logic that currently lives in clockworks.ts:

1. Resolve role to anima (`params.role`)
2. Bind or synthesize writ (from event payload)
3. Manifest the anima
4. Resolve workspace from event payload
5. Hydrate prompt template (`params.prompt`)
6. Build progress appendix for resumed writs
7. Check session provider — **throw if none registered** (the standing-order-failed event handles it like any other engine failure)
8. Activate writ and launch session
9. Post-session: check writ status, mark interrupted if needed

**Circuit breaker** is a param on the summon engine, not a separate engine:

```typescript
export default engine({
  name: 'summon-engine',
  handler: async (event, { home, params }) => {
    const role = params.role as string;
    const prompt = params.prompt as string | undefined;
    const maxSessions = params.maxSessions as number | undefined;

    // Circuit breaker: count prior sessions for this writ
    if (maxSessions != null) {
      const writId = (event?.payload as Record<string, unknown>)?.writId as string;
      if (writId) {
        const count = db.prepare(
          'SELECT COUNT(*) as n FROM sessions WHERE writ_id = ?'
        ).get(writId) as { n: number };
        if (count.n >= maxSessions) {
          failWrit(home, writId, `Circuit breaker: ${count.n} sessions attempted (max: ${maxSessions})`);
          return;
        }
      }
    }

    // ... rest of summon logic (manifest, launch, etc.)
  }
});
```

### What This Changes in the Framework

**clockworks.ts shrinks significantly:**

- `executeAnimaOrder()` (~130 lines) — **deleted**. Logic moves to summon-engine in stdlib.
- `processEvent()` — simplified to: desugar → match → execute engine. One path.
- `WRIT_SESSION_PROTOCOL` — moves to summon-engine (it's the engine that injects it).
- `resolveAnimaByRole()` — moves to summon-engine or becomes a shared utility in core.

**Before (three dispatch paths):**
```
processEvent()
  ├── { on, run }     → executeEngineOrder()
  ├── { on, summon }  → executeAnimaOrder()
  └── { on, brief }   → executeAnimaOrder()
```

**After (one dispatch path):**
```
processEvent()
  └── desugar() → { on, run, ...params } → executeEngineOrder()
```

### StandingOrder Type

The union type simplifies. Since `summon` is sugar and `brief` was already removed as a concept (though code remains — cleanup needed), the type could collapse to:

```typescript
// The canonical form — what the framework dispatches
export type StandingOrder = { on: string; run: string };

// Sugar forms — what operators can write in guild.json (desugared at dispatch time)
// { on: string; summon: string; prompt?: string; ... }
//
// These aren't in the type because the framework normalizes them before use.
// guild.json validation (if we add it) would accept both forms.
```

In practice, we may keep the union type for documentation/validation purposes:

```typescript
export type StandingOrder =
  | { on: string; run: string }
  | { on: string; summon: string; prompt?: string };
```

Either way, the dispatch path sees only `{ on, run, ...params }` after desugaring.

### Sugar: Why Include It

Summoning an anima is the most common standing order pattern. The sugar reads naturally:

```json
{ "on": "mandate.ready", "summon": "artificer", "prompt": "..." }
```

vs. the desugared form:

```json
{ "on": "mandate.ready", "run": "summon-engine", "role": "artificer", "prompt": "..." }
```

The sugar hides the engine indirection that operators don't need to think about. They're saying *what* they want (summon an artificer), not *how* (run the summon engine with role=artificer). Operators who want to customize can use the explicit `run` form and swap in their own engine.

### What About `brief`?

`brief` was removed as a distinct concept. Code references remain in clockworks.ts and guild-config.ts — those should be cleaned up as part of this work.

If there's a future need for informational-vs-urgent dispatch, that's a param on the summon engine (`"notice": "brief"` or similar), not a framework verb.

## Implementation Sequence

### Step 1: Engine params
- Add `params: Record<string, unknown>` to `EngineContext` in `engine.ts`
- Add `extractParams()` helper
- Pass extracted params through in `executeEngineOrder()`
- Update existing engines (they receive `params` but don't need to use it — non-breaking)

### Step 2: Summon engine
- Create `summon-engine` in `packages/stdlib/src/engines/`
- Extract logic from `executeAnimaOrder()` into the engine
- Include `maxSessions` circuit-breaker logic
- Move `WRIT_SESSION_PROTOCOL` to the engine
- Move or export `resolveAnimaByRole()` as a core utility

### Step 3: Desugar + simplify dispatch
- Add `desugarOrder()` to clockworks.ts
- Collapse `processEvent()` to one dispatch path
- Remove `executeAnimaOrder()`
- Clean up `brief` references
- Starter kit: ensure `summon-engine` is installed by default

### Step 4: Docs + curriculum
- Update clockworks architecture doc
- Update guild-operations curriculum (standing order section)
- Update event-catalog if needed

## Backwards Compatibility

- **guild.json**: Existing `{ on, summon, prompt }` standing orders continue to work — they're desugared transparently.
- **Engines**: Existing engines receive `params: {}` — non-breaking.
- **summon-engine must be installed**: The starter kit includes it. Existing guilds upgrading will need it added to their `engines` registry. The `nsg upgrade` path should handle this (new engine in the bundle).
- **No DB migration**: Session counting uses existing `sessions.writ_id` column.
