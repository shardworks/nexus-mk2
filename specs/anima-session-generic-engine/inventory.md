# Inventory — anima-session-generic-engine

## Brief Summary

Add a new `anima-session` quick engine to the Spider's support kit. Unlike the existing quick engines (`implement`, `revise`) which hard-code their prompt logic, `anima-session` is a reusable building block: role, prompt, cwd, conversationId, and writ are all supplied through givens. The brief also notes: "ideally, givenSpec template variables can be part of the prompt" — pointing toward a new `$yields.*` template variable pattern that isn't yet implemented.

---

## Files — Direct Impact

### Will be created

- `packages/plugins/spider/src/engines/anima-session.ts`
  - New `EngineDesign` object, id `'anima-session'`
  - Analogous in structure to `implement.ts` and `revise.ts`

### Will be modified

- `packages/plugins/spider/src/engines/index.ts`
  - Add `export { default as animaSessionEngine } from './anima-session.ts';`

- `packages/plugins/spider/src/spider.ts`
  - **supportKit.engines dict** (line ~1291): add `'anima-session': animaSessionEngine`
  - **`validateTemplates` → `builtinEngineIds` Set** (line ~222): add `animaSessionEngine.id`
  - **`buildDesignSourceMap` → `builtinIds` array** (line ~404): add `animaSessionEngine.id`
  - **Import** (line ~44): add `animaSessionEngine` to the import from `./engines/index.ts`
  - **Generic collect step** (line ~854): potentially update to include `conversationId` from `session.conversationId`
  - **If `$yields.*` is in scope**: `resolveGivens` and/or `tryRun` need significant additions; `validateTemplates` and `validateKitTemplate` variable validation also need updating

- `packages/plugins/spider/src/types.ts`
  - Add `AnimaSessionYields` interface (if not relying solely on generic default shape)
  - Potentially update `ReviseYields` to include `conversationId?: string` if generic default is extended
  - If `$yields.*` variable support is added: update `RigTemplateEngine.givens` JSDoc comment

- `packages/plugins/spider/src/index.ts`
  - Export `AnimaSessionYields` if added to types.ts

### Will be tested

- `packages/plugins/spider/src/spider.test.ts`
  - New test section for `anima-session` engine behavior
  - Possibly update mock `SessionDoc` builder to populate `conversationId` for `conversationId`-in-yields tests

---

## Types and Interfaces — Current Signatures

### `EngineDesign` (from `packages/plugins/fabricator/src/fabricator.ts`)
```typescript
export interface EngineDesign {
  id: string;
  run(givens: Record<string, unknown>, context: EngineRunContext): Promise<EngineRunResult>;
  collect?(sessionId: string, givens: Record<string, unknown>, context: EngineRunContext): Promise<unknown>;
}
```

### `EngineRunContext`
```typescript
export interface EngineRunContext {
  rigId: string;
  engineId: string;
  upstream: Record<string, unknown>;
  priorBlock?: {
    type: string;
    condition: unknown;
    blockedAt: string;
    message?: string;
    lastCheckedAt?: string;
  };
}
```

### `EngineRunResult`
```typescript
export type EngineRunResult =
  | { status: 'completed'; yields: unknown }
  | { status: 'launched'; sessionId: string }
  | { status: 'blocked'; blockType: string; condition: unknown; message?: string };
```

### `SummonRequest` (from `packages/plugins/animator/src/types.ts`)
```typescript
export interface SummonRequest {
  prompt: string;
  role?: string;
  cwd: string;
  conversationId?: string;
  metadata?: Record<string, unknown>;
  streaming?: boolean;
  environment?: Record<string, string>;
}
```

### `AnimatorApi`
```typescript
export interface AnimatorApi {
  summon(request: SummonRequest): AnimateHandle;
  animate(request: AnimateRequest): AnimateHandle;
}
```

### `AnimateHandle`
```typescript
export interface AnimateHandle {
  sessionId: string;
  chunks: AsyncIterable<SessionChunk>;
  result: Promise<SessionResult>;
}
```

### `SessionDoc` (from `packages/plugins/animator/src/types.ts`)
```typescript
export interface SessionDoc {
  id: string;
  status: 'running' | 'completed' | 'failed' | 'timeout';
  startedAt: string;
  endedAt?: string;
  durationMs?: number;
  provider: string;
  exitCode?: number;
  error?: string;
  conversationId?: string;    // ← this is the source for yields.conversationId
  providerSessionId?: string;
  tokenUsage?: TokenUsage;
  costUsd?: number;
  metadata?: Record<string, unknown>;
  output?: string;
  [key: string]: unknown;
}
```

### `WritDoc` (from `packages/plugins/clerk/src/types.ts`)
```typescript
export interface WritDoc {
  [key: string]: unknown;
  id: string;
  type: string;
  status: WritStatus;
  title: string;
  body: string;
  codex?: string;
  // ... timestamps, etc.
}
```

### `DraftYields` (from `packages/plugins/spider/src/types.ts`)
```typescript
export interface DraftYields {
  draftId: string;
  codexName: string;
  branch: string;
  path: string;
  baseSha: string;
}
```

### `ReviseYields` (from `packages/plugins/spider/src/types.ts`)
```typescript
export interface ReviseYields {
  sessionId: string;
  sessionStatus: 'completed' | 'failed';
}
// Note: no conversationId; uses generic default collect
```

### `SpiderKit` (from `packages/plugins/spider/src/spider.ts`)
```typescript
export interface SpiderKit {
  rigTemplates?: Record<string, RigTemplate>;
  rigTemplateMappings?: Record<string, string>;
}
```
Note: `SpiderKit` does NOT include engine contributions — kit-contributed engines flow through the Fabricator's own `engines` key in the kit object, not through `SpiderKit`.

### `RigTemplateEngine` (from `packages/plugins/spider/src/types.ts`)
```typescript
export interface RigTemplateEngine {
  id: string;
  designId: string;
  upstream?: string[];
  /**
   * Givens to pass at spawn time.
   * String values starting with '$' are variable references resolved at spawn time:
   *   '$writ' or '${writ}' — the WritDoc
   *   '$vars.<key>' or '${vars.<key>}' — value from spider.variables config
   */
  givens?: Record<string, unknown>;
}
```

---

## Functions — Direct Impact

### `resolveGivens` (spider.ts ~line 171)
```typescript
function resolveGivens(
  givens: Record<string, unknown> | undefined,
  context: { writ: WritDoc; spiderConfig: SpiderConfig },
): Record<string, unknown>
```
- Currently resolves only `$writ` and `$vars.<key>` at spawn time
- If `$yields.*` support is in scope, this function (or a new counterpart in `tryRun`) would need extension

### `normalizeVarRef` (spider.ts ~line 158)
```typescript
function normalizeVarRef(value: string): string
// '${foo}' → '$foo', '$foo' → '$foo'
```

### `validateTemplates` (spider.ts ~line 218)
- Uses a hardcoded `builtinEngineIds` Set containing the 5 current engines
- **Must add `animaSessionEngine.id`** to this set

### `buildDesignSourceMap` in `RigTemplateRegistry` (spider.ts ~line 402)
- Maintains `designSourceMap` for kit template engine designId validation
- Has hardcoded `builtinIds` array with the 5 current engines
- **Must add `animaSessionEngine.id`** to this array

### `tryCollect` (spider.ts ~line 828)
The current generic default yields block:
```typescript
yields = {
  sessionId: session.id,
  sessionStatus: session.status,
  ...(session.output !== undefined ? { output: session.output } : {}),
};
```
- Does NOT include `conversationId`
- The brief describes yields as `{ sessionId, sessionStatus, output?, conversationId }` and says "No custom collect — uses the Spider's generic default"
- **This is a discrepancy**: to match the brief's described yield shape without a custom collect, the generic default would need to be updated to include `conversationId` from `session.conversationId`

### `tryRun` (spider.ts ~line 989)
```typescript
const givens = { ...pending.givensSpec };
```
- givens are the frozen givensSpec from spawn time
- If late-resolution of `$yields.*` is in scope, a new step here would resolve yield-based template references against the current `upstream` map

---

## Comparable Implementations (Existing Quick Engines)

### `implement.ts` — closest analog
```typescript
const implementEngine: EngineDesign = {
  id: 'implement',
  async run(givens, context) {
    const animator = guild().apparatus<AnimatorApi>('animator');
    const writ = givens.writ as WritDoc;
    const draft = context.upstream['draft'] as DraftYields;
    const prompt = `${writ.body}\n\nCommit all changes before ending your session.`;
    const handle = animator.summon({
      role: givens.role as string,
      prompt,
      cwd: draft.path,
      environment: { GIT_AUTHOR_EMAIL: `${writ.id}@nexus.local` },
      metadata: { engineId: context.engineId, writId: writ.id },
    });
    return { status: 'launched', sessionId: handle.sessionId };
  },
};
```
- No custom collect; uses generic default → yields `{ sessionId, sessionStatus, output? }`
- `writ` and `role` come from givens; `cwd` from context.upstream
- `conversationId` NOT passed to summon

### `revise.ts` — also has no custom collect
```typescript
const reviseEngine: EngineDesign = {
  id: 'revise',
  async run(givens, context) {
    const animator = guild().apparatus<AnimatorApi>('animator');
    const writ = givens.writ as WritDoc;
    const draft = context.upstream['draft'] as DraftYields;
    const review = context.upstream['review'] as ReviewYields;
    // ... assembles prompt from review findings ...
    const handle = animator.summon({
      role: givens.role as string,
      prompt,
      cwd: draft.path,
      environment: { GIT_AUTHOR_EMAIL: `${writ.id}@nexus.local` },
      metadata: { engineId: context.engineId, writId: writ.id },
    });
    return { status: 'launched', sessionId: handle.sessionId };
  },
};
```
- No `conversationId` in summon call
- No custom collect; uses generic default → `ReviseYields = { sessionId, sessionStatus }`

### `review.ts` — has custom collect
```typescript
const reviewEngine: EngineDesign = {
  id: 'review',
  async run(givens, context) { ... },
  async collect(sessionId, givens, context) {
    // reads session.output, parses PASS/FAIL, reads metadata
    // returns ReviewYields
  },
};
```
- Custom collect reads `session.output` and `session.metadata` to assemble typed yields

---

## Key Differences: `anima-session` vs Existing Quick Engines

| Feature | `implement` / `revise` | `anima-session` |
|---|---|---|
| Prompt | Hard-coded assembly | Supplied as given |
| Role | From given | From given (same) |
| cwd | From `context.upstream['draft']` | From given OR fallback to `context.upstream['draft']` |
| conversationId | Not supported | Optional given |
| writ | Required given | Optional given |
| environment | Always `{ GIT_AUTHOR_EMAIL }` | Only if writ provided |
| Custom collect | No (revise) / Yes (review) | No (generic default) |
| Yields shape | `{ sessionId, sessionStatus }` | `{ sessionId, sessionStatus, output?, conversationId? }` |

---

## Critical Gap: Generic Default Collect vs. Brief's Described Yields

The brief says:
> "Collect step: No custom `collect` — uses the Spider's generic default."

And the brief's described yields are: `{ sessionId, sessionStatus, output?, conversationId }`

The current generic default in `tryCollect` (spider.ts ~line 854) produces:
```typescript
yields = {
  sessionId: session.id,
  sessionStatus: session.status,
  ...(session.output !== undefined ? { output: session.output } : {}),
};
```

**`conversationId` is NOT included in the current generic default.**

To get `conversationId` in yields without a custom collect, the generic default must be updated to:
```typescript
yields = {
  sessionId: session.id,
  sessionStatus: session.status,
  ...(session.output !== undefined ? { output: session.output } : {}),
  ...(session.conversationId !== undefined ? { conversationId: session.conversationId } : {}),
};
```

This change would affect ALL engines that use the generic default (`implement`, `revise`). `ReviseYields` and the generic yields shape would gain an optional `conversationId` field. Existing tests would continue to pass since the field is only added when present.

---

## Critical Gap: `$yields.*` Template Variable Resolution

The brief describes `conversationId` as "typically wired from an upstream engine's yields via `${yields.<engineId>.conversationId}`" in the rig template givens.

**Current state:**
- `resolveGivens` only handles `$writ` and `$vars.<key>` at spawn time
- Unknown `$`-prefixed strings throw a validation error
- Upstream yields do NOT exist at spawn time — they're populated as engines complete

**`spider.md` confirms this is planned:**
> "givensSpec templates. The givensSpec currently holds literal values set at rig spawn time. It will grow to support template expressions (e.g. `${draft.worktreePath}`) that resolve specific values from upstream yields into typed givens."

**Implication:** The `$yields.<engineId>.<field>` pattern requires:
1. A late-resolution step in `tryRun` (upstream yields ARE available there)
2. OR keeping givensSpec frozen at spawn time and having the engine read from `context.upstream` directly (current pattern)
3. Validation changes to accept `$yields.*` references without throwing

The brief intro says "ideally, givenSpec template variables can be part of the prompt" — this "ideally" suggests the template variable extension may be aspirational scope, or may be a stated requirement for this commission. The analyst must clarify scope.

---

## Variable Resolution System — Current Logic

At spawn time (`resolveGivens`):
```typescript
// '$writ' or '${writ}' → WritDoc
// '$vars.<key>' or '${vars.<key>}' → spiderConfig.variables[key] (omit if undefined)
// Unknown '$' prefix → throws at validateTemplates / validateKitTemplate
// Non-'$' values → pass through as literal
```

Validation logic (in both `validateTemplates` and `RigTemplateRegistry.validateKitTemplate`):
```typescript
if (normalized === '$writ' || /^\$vars\.[a-zA-Z_][a-zA-Z0-9_]*$/.test(normalized)) {
  continue; // valid
}
throw new Error(`... unrecognized variable "${value}"`);
```

Both `validateTemplates` (for config templates) and `validateKitTemplate` (for kit templates) have this same validation logic. **Both would need updating** if `$yields.*` is added.

---

## Spider supportKit Registration Pattern

The Spider's `supportKit` in `spider.ts` (line ~1282):
```typescript
supportKit: {
  books: { rigs: { indexes: [...] }, 'input-requests': { indexes: [...] } },
  engines: {
    draft:     draftEngine,
    implement: implementEngine,
    review:    reviewEngine,
    revise:    reviseEngine,
    seal:      sealEngine,
  },
  blockTypes: { ... },
  tools: [ ... ],
  routes: spiderRoutes,
  ...
}
```

The Fabricator's `EngineRegistry.registerFromKit` reads `kit.engines` values and calls `isEngineDesign()` on each to validate. It does NOT look for a specific key name — it iterates all values. Adding `'anima-session': animaSessionEngine` to the dict is sufficient.

The `buildDesignSourceMap` in `RigTemplateRegistry` scans `supportKit.engines` to build the `designId → pluginId` map used for kit template validation. The Spider also keeps a separate `builtinIds` constant array in `buildDesignSourceMap` with the five built-in engine IDs (for the `allowedPlugins` security check). **Both the `builtinIds` array and the `builtinEngineIds` set in `validateTemplates` must be updated.**

---

## Test Patterns

From `spider.test.ts`:

The fixture uses a mock `AnimatorApi.summon()` that:
- Records requests in `summonCalls: SummonRequest[]`
- Creates a `SessionDoc` in memory with `{ id, status, startedAt, endedAt, ...outcome }`
- Does NOT include `conversationId` in the mock session doc by default

To test `conversationId` in yields, tests would need to update the mock to write `conversationId` to the session doc.

Test for implement engine integration (line ~579):
```typescript
it('calls animator.summon() with role, prompt, cwd, environment, and metadata', async () => {
  // ... sets up rig with draft complete ...
  await spider.crawl(); // run implement
  const call = summonCalls[0];
  assert.equal(call.role, 'artificer');
  assert.equal(call.cwd, draft.path);
  assert.ok(call.prompt.includes(writ.body));
  assert.deepEqual(call.environment, { GIT_AUTHOR_EMAIL: `${writ.id}@nexus.local` });
  assert.deepEqual(call.metadata, { engineId: 'implement', writId: writ.id });
});
```

The standard template for tests (line ~42):
```typescript
const STANDARD_TEMPLATE: RigTemplate = {
  engines: [
    { id: 'draft',     designId: 'draft',     givens: { writ: '$writ' } },
    { id: 'implement', designId: 'implement', upstream: ['draft'],     givens: { writ: '$writ', role: '$vars.role' } },
    { id: 'review',    designId: 'review',    upstream: ['implement'], givens: { writ: '$writ', role: 'reviewer', buildCommand: '$vars.buildCommand', testCommand: '$vars.testCommand' } },
    { id: 'revise',    designId: 'revise',    upstream: ['review'],    givens: { writ: '$writ', role: '$vars.role' } },
    { id: 'seal',      designId: 'seal',      upstream: ['revise'],    givens: {} },
  ],
  resolutionEngine: 'seal',
};
```

---

## Existing Documentation — Relevant Sections

### `docs/architecture/apparatus/spider.md`
- Confirms Spider contributes engines via `supportKit.engines`
- Explicitly calls out `givensSpec templates` as a planned future feature (line ~627)
- Documents current variable resolution (`$writ`, `$vars.*`) (line ~663)

### `docs/architecture/kit-components.md`
- Describes engine contribution via kit `engines` key
- "An engine may be clockwork (deterministic, no anima required) or quick (inhabited by an anima for work requiring judgment)."

### `docs/guides/building-engines.md`
- Only covers Clockworks engines (relays), NOT Fabricator EngineDesign objects — doc appears to describe a different engine concept
- **Doc/code discrepancy**: the "building-engines" guide describes `nexus-engine.json` descriptors and Clockworks relay engines, not the Spider's `EngineDesign` interface

---

## Doc/Code Discrepancies

1. **`docs/guides/building-engines.md`** describes Clockworks relay engines (`engine()` factory, `nexus-engine.json`), not Spider `EngineDesign` objects. The Spider's engine contribution model (returning `EngineRunResult` from `run()`) is not documented in this guide.

2. **`spider.md`** doc still mentions the "static rig graph: every commission gets the same five-engine pipeline" as an MVP note — this is outdated now that template-based rigs have been implemented.

3. **`ReviseYields` type** (in types.ts) doesn't include `output?: string` even though the generic default collect does include `output` when present. The TypeScript type and the actual runtime shape don't match.

---

## Adjacent Files Checked (Not Directly Affected)

- `packages/plugins/animator/src/animator.ts` — `summon()` implementation; passes `conversationId` through to session provider; stores `conversationId` in `SessionDoc`
- `packages/plugins/fabricator/src/fabricator.ts` — `EngineDesign`, `EngineRunContext`, `EngineRunResult` types; Fabricator scanning of `kit.engines`
- `packages/plugins/clerk/src/types.ts` — `WritDoc` shape
- `packages/plugins/spider/src/block-types/` — not affected
- `packages/plugins/spider/src/tools/` — not affected
- `packages/plugins/spider/src/index.ts` — needs export update if new type added
