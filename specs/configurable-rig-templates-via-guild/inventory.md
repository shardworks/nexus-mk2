# Inventory — Configurable Rig Templates via Guild Config

## Files Directly Affected

### Modified

- `packages/plugins/spider/src/spider.ts` — Primary change site. Four change areas:
  1. `buildStaticEngines()` — kept intact as fallback; new template-resolution function alongside it
  2. `trySpawn()` — call site dispatches to template-based engine building vs. static fallback based on writ type and config
  3. `start()` — adds template validation after reading spiderConfig; CDC handler updated for resolution fallback when no seal engine exists
  4. Closure-scoped `spiderConfig` variable captures the full config including templates at startup

- `packages/plugins/spider/src/types.ts` — New types: `RigTemplateEngine`, `RigTemplate`. Updated: `SpiderConfig` gains `rigTemplates?`. GuildConfig module augmentation already here and picks up the `SpiderConfig` change automatically.

### Possibly created (or inlined into existing files)

- `packages/plugins/spider/src/template-validator.ts` — pure validation function for configured templates; checks designId registry, upstream references, acyclicity. Could be inline in spider.ts.
- `packages/plugins/spider/src/resolve-givens.ts` — variable interpolation logic; resolves `$writ`, `$role`, `$spider.*` references against writ + config. Could be inline in spider.ts.

### Test files affected

- `packages/plugins/spider/src/spider.test.ts` — All existing tests must continue passing. New test cases required for template behavior (see Test File section below).

### Confirmed unaffected

- `packages/plugins/spider/src/engines/*.ts` — all 5 engine implementations unchanged; they consume `givensSpec` as-is.
- `packages/plugins/spider/src/tools/*.ts` — all tools unchanged.
- `packages/plugins/spider/src/index.ts` — re-exports; new types added to `types.ts` will need export entries here if they are public API.
- `packages/plugins/fabricator/src/fabricator.ts` — no API changes; Spider calls `getEngineDesign()` during validation.
- `packages/plugins/clerk/src/types.ts` — `WritDoc.type` already present; no changes needed.
- `packages/framework/core/src/guild-config.ts` — open via module augmentation; no framework-level changes.
- All other apparatus packages.

---

## Current Type Signatures (verbatim)

### `SpiderConfig` — `packages/plugins/spider/src/types.ts` (lines 142–161)

```typescript
export interface SpiderConfig {
  role?: string;          // Role to summon for quick engine sessions. Default: 'artificer'.
  pollIntervalMs?: number; // Polling interval for crawlContinual tool (ms). Default: 5000.
  buildCommand?: string;  // Build command passed to review engine givens.
  testCommand?: string;   // Test command passed to review engine givens.
}
```

GuildConfig module augmentation (same file, lines 250–254):
```typescript
declare module '@shardworks/nexus-core' {
  interface GuildConfig {
    spider?: SpiderConfig;
  }
}
```

### `EngineInstance` — `packages/plugins/spider/src/types.ts` (lines 25–46)

```typescript
export interface EngineInstance {
  id: string;
  designId: string;
  status: EngineStatus;
  upstream: string[];
  givensSpec: Record<string, unknown>;  // always holds resolved literal values, never $refs
  yields?: unknown;
  error?: string;
  sessionId?: string;
  startedAt?: string;
  completedAt?: string;
}
```

### `RigDoc` — `packages/plugins/spider/src/types.ts` (lines 58–72)

```typescript
export interface RigDoc {
  [key: string]: unknown;
  id: string;
  writId: string;
  status: RigStatus;
  engines: EngineInstance[];
  createdAt: string;
}
```

No `templateId`, `writType`, or resolution-hint fields currently on `RigDoc`.

### `FabricatorApi` — `packages/plugins/fabricator/src/fabricator.ts` (lines 80–86)

```typescript
export interface FabricatorApi {
  getEngineDesign(id: string): EngineDesign | undefined;
}
```

Only exposes `getEngineDesign(id)`. No `listEngineDesigns()` or `hasEngineDesign()`. Template validation must call `getEngineDesign(designId) !== undefined` per-entry.

### `WritDoc` — `packages/plugins/clerk/src/types.ts` (lines 27–52)

```typescript
export interface WritDoc {
  [key: string]: unknown;
  id: string;
  type: string;       // ← key field: writ type is the template lookup key
  status: WritStatus;
  title: string;
  body: string;
  codex?: string;
  createdAt: string;
  updatedAt: string;
  acceptedAt?: string;
  resolvedAt?: string;
  resolution?: string;
}
```

`writ.type` is always present on a spawned writ. The Spider reads the full `WritDoc` in `trySpawn()` and has it available for template lookup.

---

## Current Function Signatures

### `buildStaticEngines` — `packages/plugins/spider/src/spider.ts` (lines 95–111)

```typescript
function buildStaticEngines(writ: WritDoc, config: SpiderConfig): EngineInstance[] {
  const role = config.role ?? 'artificer';
  const reviewGivens: Record<string, unknown> = {
    writ,
    role: 'reviewer',
    ...(config.buildCommand !== undefined ? { buildCommand: config.buildCommand } : {}),
    ...(config.testCommand !== undefined ? { testCommand: config.testCommand } : {}),
  };

  return [
    { id: 'draft',     designId: 'draft',     status: 'pending', upstream: [],           givensSpec: { writ } },
    { id: 'implement', designId: 'implement', status: 'pending', upstream: ['draft'],     givensSpec: { writ, role } },
    { id: 'review',    designId: 'review',    status: 'pending', upstream: ['implement'], givensSpec: reviewGivens },
    { id: 'revise',    designId: 'revise',    status: 'pending', upstream: ['review'],    givensSpec: { writ, role } },
    { id: 'seal',      designId: 'seal',      status: 'pending', upstream: ['revise'],    givensSpec: {} },
  ];
}
```

This is the only location of the hardcoded 5-engine pipeline. Must be preserved for backwards-compatible fallback.

### `trySpawn` (relevant call site) — `packages/plugins/spider/src/spider.ts` (line 321)

```typescript
const engines = buildStaticEngines(writ, spiderConfig);
```

This line becomes the dispatch point: look up template by `writ.type`, fall back to `'default'` template, fall back to `buildStaticEngines()`.

### `start()` — `packages/plugins/spider/src/spider.ts` (lines 420–461)

```typescript
start(_ctx: StartupContext): void {
  const g = guild();
  spiderConfig = g.guildConfig().spider ?? {};

  const stacks = g.apparatus<StacksApi>('stacks');
  clerk = g.apparatus<ClerkApi>('clerk');
  fabricator = g.apparatus<FabricatorApi>('fabricator');

  rigsBook = stacks.book<RigDoc>('spider', 'rigs');
  sessionsBook = stacks.readBook<SessionDoc>('animator', 'sessions');
  writsBook = stacks.readBook<WritDoc>('clerk', 'writs');

  // CDC — Phase 1 cascade on rigs book.
  stacks.watch<RigDoc>(
    'spider',
    'rigs',
    async (event) => {
      if (event.type !== 'update') return;
      const rig = event.entry;
      const prev = event.prev;
      if (rig.status === prev.status) return;
      if (rig.status === 'completed') {
        // ← HARDCODED: looks for engine id === 'seal'
        const sealEngine = rig.engines.find((e) => e.id === 'seal');
        const resolution = sealEngine?.yields
          ? JSON.stringify(sealEngine.yields)
          : 'Rig completed';
        await clerk.transition(rig.writId, 'completed', { resolution });
      } else if (rig.status === 'failed') {
        const failedEngine = rig.engines.find((e) => e.status === 'failed');
        const resolution = failedEngine?.error ?? 'Engine failure';
        await clerk.transition(rig.writId, 'failed', { resolution });
      }
    },
    { failOnError: true },
  );
}
```

Two changes needed: (1) template validation added after `spiderConfig` is read; (2) CDC completion handler updated to fall back gracefully when no `seal` engine exists.

---

## Key Constraint: Fabricator Engine Registration Timing

**Spider's own built-in engines are NOT in the Fabricator when Spider's `start()` runs.**

The `arbor.ts` startup sequence:
```
1. Load all plugins (kits + apparatus)
2. Fire plugin:initialized for all KIT plugins
   → Fabricator.start() already ran; it scans g.kits() in start()
   → Any engines in kit packages are now registered in Fabricator
3. Start apparatus in topological order:
   ├── stacks.start()
   ├── clerk.start()
   ├── fabricator.start()
   │   └── scans all kits (done)
   │   └── ctx.on('plugin:initialized') → registers supportKit engines from future apparatus
   ├── [other apparatus...]  → plugin:initialized → Fabricator registers their supportKit engines
   └── spider.start()  ← HERE: Fabricator has all kits + all apparatus started before Spider
       └── [validation logic runs at this point]
4. plugin:initialized fires for Spider
   → Fabricator registers Spider's supportKit: draft, implement, review, revise, seal
```

Spider's own engine IDs (`draft`, `implement`, `review`, `revise`, `seal`) are added to the Fabricator registry **after** `start()` returns. So:

- A template containing `"designId": "implement"` cannot be validated via `fabricator.getEngineDesign('implement')` inside `start()` — it will return `undefined` at that point.
- Templates referencing engine designs from kit packages (which loaded before Spider) CAN be validated at `start()` time.
- Templates referencing designs from apparatus that loaded before Spider CAN be validated at `start()` time.

**Implication for the implementation:** The validation logic must account for this. Options:
- A) Validate in `start()` but treat Spider's own builtin IDs as implicitly valid (Spider knows its own supportKit engines at compile time).
- B) Use `ctx.on('plugin:initialized')` to defer a single validation pass after all apparatus have loaded — but `plugin:initialized` fires per-apparatus, not once at the end.
- C) Validate lazily in `trySpawn()` on first use — functionally "fails early" but not technically "at startup."

The brief says "fail guild startup with a clear error message." Option A is the most direct approach that satisfies the intent while working within the timing constraint. The Spider can check `fabricator.getEngineDesign(id) !== undefined || BUILTIN_ENGINE_IDS.has(id)` where `BUILTIN_ENGINE_IDS = new Set(['draft', 'implement', 'review', 'revise', 'seal'])`.

---

## Variable Resolution Design Space

The brief specifies:
- **`$writ`** — the full `WritDoc` object
- **`$role`** — the configured role (`spiderConfig.role ?? 'artificer'`)
- **General mechanism** for passing arbitrary Spider/guild config values (not just the two above)

Current `buildStaticEngines` implicitly encodes these mappings as hardcoded logic. The template system externalizes them as explicit given references.

**Proposed variable syntax** inferred from brief wording ("rather than enumerating specific keys like buildCommand or testCommand"):

| Variable | Resolves to |
|---|---|
| `$writ` | The full `WritDoc` object |
| `$role` | `spiderConfig.role ?? 'artificer'` |
| `$spider.buildCommand` | `spiderConfig.buildCommand` (undefined → omit key) |
| `$spider.testCommand` | `spiderConfig.testCommand` (undefined → omit key) |
| `$spider.<key>` | `(spiderConfig as Record<string, unknown>)[key]` |

The `$role` shorthand is equivalent to `$spider.role` but `$role` is listed as a "well-known reference" with a defined default (`'artificer'`). `$spider.role` without the default logic would just return `undefined` if not set — different behavior.

**Undefined resolution:** if a `$spider.key` resolves to `undefined` (key not present in config), the entry is **omitted from givensSpec** entirely. This matches `buildStaticEngines` behavior for `buildCommand`/`testCommand`.

**Non-string literal values in givens:** The `givens` map in template config (JSON) can contain literal non-string values like `"role": "reviewer"` (a hardcoded string, not a `$ref`). The resolver should only attempt variable substitution for string values that start with `$`.

**Example resolved output:**
```typescript
// Template givens: { writ: "$writ", role: "$role", buildCommand: "$spider.buildCommand" }
// config: { role: "artificer", buildCommand: "pnpm build" }
// → givensSpec: { writ: WritDoc, role: "artificer", buildCommand: "pnpm build" }

// Template givens: { writ: "$writ", role: "reviewer", buildCommand: "$spider.buildCommand" }
// config: { role: "artificer" }  // no buildCommand
// → givensSpec: { writ: WritDoc, role: "reviewer" }  // buildCommand omitted
```

---

## CDC Resolution Fallback — Two Options

### Current behavior (hardcoded)

```typescript
const sealEngine = rig.engines.find((e) => e.id === 'seal');
const resolution = sealEngine?.yields
  ? JSON.stringify(sealEngine.yields)
  : 'Rig completed';
```

### Option A: Last completed engine's yields (automatic fallback)

```typescript
const sealEngine = rig.engines.find((e) => e.id === 'seal');
const lastCompleted = [...rig.engines]
  .reverse()
  .find((e) => e.status === 'completed' && e.yields !== undefined);
const resolutionEngine = sealEngine ?? lastCompleted;
const resolution = resolutionEngine?.yields
  ? JSON.stringify(resolutionEngine.yields)
  : 'Rig completed';
```

Pros: no new template fields, no new RigDoc fields, backwards compatible (seal engine is still preferred when present).
Cons: "last completed" engine order may not be meaningful for non-linear pipelines.

### Option B: Template declares `resolutionEngine` id

Template config:
```json
{ "engines": [...], "resolutionEngine": "summarize" }
```

At spawn time, Spider stores `resolutionEngineId` on RigDoc (new field). CDC handler looks it up:
```typescript
const resolverId = (rig as RigDocWithResolver).resolutionEngineId ?? 'seal';
const resolverEngine = rig.engines.find((e) => e.id === resolverId) 
  ?? [...rig.engines].reverse().find((e) => e.status === 'completed');
```

Pros: explicit author control, meaningful for complex pipelines.
Cons: requires new `RigDoc` field (a `[key: string]: unknown` index signature is already present, so no type-system blocker), and new template field.

### Brief's stated preference

"use the last completed engine's yields, or allow the template to declare which engine provides the resolution" — lists both as valid. The analyst must pick.

---

## Template Config Shape (Expected in guild.json)

```json
{
  "spider": {
    "role": "artificer",
    "buildCommand": "pnpm build",
    "testCommand": "pnpm test",
    "rigTemplates": {
      "default": {
        "engines": [
          { "id": "draft",     "designId": "draft",     "upstream": [],            "givens": { "writ": "$writ" } },
          { "id": "implement", "designId": "implement", "upstream": ["draft"],     "givens": { "writ": "$writ", "role": "$role" } },
          { "id": "review",    "designId": "review",    "upstream": ["implement"], "givens": { "writ": "$writ", "role": "reviewer", "buildCommand": "$spider.buildCommand", "testCommand": "$spider.testCommand" } },
          { "id": "revise",    "designId": "revise",    "upstream": ["review"],    "givens": { "writ": "$writ", "role": "$role" } },
          { "id": "seal",      "designId": "seal",      "upstream": ["revise"],    "givens": {} }
        ]
      },
      "hotfix": {
        "engines": [
          { "id": "implement", "designId": "implement", "upstream": [],            "givens": { "writ": "$writ", "role": "$role" } },
          { "id": "seal",      "designId": "seal",      "upstream": ["implement"], "givens": {} }
        ]
      }
    }
  }
}
```

The `"default"` key is the fallback used when no template matches the writ's type.

---

## New Types Needed

```typescript
// packages/plugins/spider/src/types.ts — new

/**
 * A single engine slot declared in a rig template.
 */
export interface RigTemplateEngine {
  /** Engine id unique within this template (e.g. 'draft', 'my-custom-engine'). */
  id: string;
  /** Engine design id to look up in the Fabricator (e.g. 'draft', 'implement'). */
  designId: string;
  /** Engine ids within this template whose completion is required before this engine runs. */
  upstream: string[];
  /**
   * Givens to pass at spawn time.
   * String values starting with '$' are treated as variable references resolved at spawn time.
   * Non-string values are passed through literally.
   * Resolved undefined values are omitted from givensSpec.
   */
  givens?: Record<string, unknown>;
}

/**
 * A complete rig template — an ordered list of engine slots.
 */
export interface RigTemplate {
  /** Ordered list of engine slot declarations. */
  engines: RigTemplateEngine[];
  /**
   * Engine id whose yields to use as the writ resolution summary.
   * Falls back to last-completed-engine yields if omitted or the named engine has no yields.
   */
  resolutionEngine?: string;
}

// Extended SpiderConfig:
export interface SpiderConfig {
  role?: string;
  pollIntervalMs?: number;
  buildCommand?: string;
  testCommand?: string;
  /**
   * Writ type → rig template mappings.
   * 'default' key is the fallback for unmatched writ types.
   * If absent entirely, the hardcoded 5-engine pipeline is used unchanged.
   */
  rigTemplates?: Record<string, RigTemplate>;
}
```

---

## Validation Rules (from brief)

1. Every `engine.designId` in every template must exist in the Fabricator's engine registry at validation time (or be one of Spider's own built-in engine designs — see timing constraint).
2. Every `engine.upstream` entry must reference an `engine.id` that exists within the **same** template.
3. The `upstream` dependency graph of each template must be acyclic (DFS cycle detection, same algorithm as `guild-lifecycle.ts`).
4. If any validation fails, throw with a message identifying: which template (by writ type key), which engine (`id`/`designId`), and which rule was violated.
5. Validation must run during guild startup (in `start()` or deferred via startup context), not lazily.

---

## Test File Analysis

File: `packages/plugins/spider/src/spider.test.ts`

**Test framework:** `node:test` with `describe`/`it`/`beforeEach`/`afterEach`. Uses `assert` from `node:assert/strict`.

**Core fixture builder:**
```typescript
function buildFixture(
  guildConfig: Partial<GuildConfig> = {},
  initialSessionOutcome: { status: 'completed' | 'failed'; error?: string; output?: string } = { status: 'completed' },
): { stacks, clerk, fabricator, spider, summonCalls, fire, setSessionOutcome }
```

Spider config injected via: `buildFixture({ spider: { buildCommand: 'echo ...', testCommand: 'echo ...' } })`.

**New template tests will use:** `buildFixture({ spider: { rigTemplates: { 'mandate': { engines: [...] } } } })`

**Coverage pattern:** Most tests use the default `buildFixture()` (no explicit spider config) and rely on the hardcoded 5-engine pipeline. All must continue to work unchanged.

**Existing relevant test groups:**
- `describe('spawn') ` — spawn priority, FIFO ordering, writ → active transition
- `describe('run')` — engine execution, clockwork vs quick, error handling
- `describe('collect')` — session result collection, yield assembly
- `describe('CDC')` — rig completion → writ transition
- `describe('review engine')` — mechanical checks, session launch, collect
- `describe('revise engine')` — prompt assembly, session launch
- `describe('rig-show / rig-list / rig-for-writ')` — API methods

**New test groups needed:**
- `describe('rig templates — spawn')` — template matching, default fallback, no-template fallback
- `describe('rig templates — variable resolution')` — `$writ`, `$role`, `$spider.*`, undefined omission, literal passthrough
- `describe('rig templates — validation')` — bad designId, bad upstream ref, cycle, valid passes silently
- `describe('rig templates — CDC resolution')` — no seal engine → last-completed fallback

---

## Adjacent Patterns: How Other Apparatus Handle Config Validation

### Clerk — runtime validation (not startup)

Clerk validates writ type at `post()` call time by reading live config. No startup validation. Error thrown at `clerk.post()` if type unknown.

### Arbor — startup validation of requires/recommends

`validateRequires()` in `guild-lifecycle.ts` runs before any apparatus starts. Throws with `[arbor] "X" requires "Y", which is not installed.` Spider cannot use this hook (it runs after Spider starts).

### Fabricator — no validation, pure registration

Fabricator registers whatever it finds; it never validates or rejects designs. Spider must perform its own "does this designId exist?" check.

---

## Doc/Code Discrepancies

1. **`docs/guides/building-engines.md`** documents Clockworks engines (standing-orders, `nexus-engine.json`, `engine()` factory). This is a completely different concept from Spider/Fabricator `EngineDesign` objects. Both use the word "engine." The guide says nothing about writing `EngineDesign` implementations for Spider rigs. This is a documentation gap, not a bug.

2. **`docs/architecture/apparatus/spider.md` line ~92** describes rig completion as when "the terminal engine (`seal`) completes." Actual code (spider.ts line 200) marks the rig completed when `all engines are completed` (not just `seal`). For the static pipeline these are equivalent (seal is always last), but the doc is imprecise. This brief makes the imprecision matter because templates can have non-seal terminal engines.

3. **spider.md config section (lines 648–659)** shows 4 `spider` config keys (`role`, `pollIntervalMs`, `buildCommand`, `testCommand`). `rigTemplates` will be a fifth. The doc is simply incomplete for this feature — expected.

4. **spider.md "Future Evolution" note (line 627)**: "The givensSpec currently holds literal values set at rig spawn time. It will grow to support template expressions (e.g. `${draft.worktreePath}`) that resolve specific values from **upstream yields**." This feature is narrower: the template expressions (`$writ`, `$role`, `$spider.*`) resolve from **writ data and config**, not from upstream yields at run time. The upstream-yields expression system described in the doc is a different, more complex future feature. These should not be conflated.

---

## Scratch Notes / Existing Context

- No existing spec files in `specs/` directory (this is the first commission to use it).
- No commission log or prior art for this specific feature.
- `docs/architecture/apparatus/spider.md` line 7 explicitly labels the current Spider as MVP with "no dynamic extension" — this brief is the first step toward dynamic extension.
- The brief explicitly positions this as "a stop-gap before the full needs-discovery system." The implementation should be minimal and clean, not anticipating future expansion beyond what's described.
