# Inventory: update-rig-template-variable-handling

## Brief (Verbatim)

> Goals: not mix 'rig template variables' in with standard spider configs, such as `rigTemplates` itself.
>
> Current State: In rig templates, `$spider.<name>` evaluates the value of the 'name' property on the `spider` apparatus config. I'd like to replace the `spider.` prefix with `vars.`, and also only resolve from a `variables` key nested under spider.
>
> Additional Changes: The `$role` special value should also be removed. If a `role` variable is desired, it should be placed under the `variables` key and referenced via `$vars.foo` directly.

---

## Affected Files

### Will be modified

| File | Role |
|---|---|
| `packages/plugins/spider/src/types.ts` | Add `variables` to `SpiderConfig`; update `RigTemplateEngine` JSDoc |
| `packages/plugins/spider/src/spider.ts` | `resolveGivens`, `validateTemplates`, `buildFromTemplate` context |
| `packages/plugins/spider/src/spider.test.ts` | `STANDARD_TEMPLATE`, all variable-resolution and validation tests |
| `docs/architecture/apparatus/spider.md` | Config example, static graph example, variable docs |

### May need minor updates (doc/note changes only)

| File | Why |
|---|---|
| `docs/architecture/apparatus/review-loop.md` | References `buildCommand`, `testCommand`, `role` as spider config fields in the implementation note; these still exist in `SpiderConfig` but the note says they're accessible by template vars (implicitly via old `$spider.*`) |

### Will NOT be modified

| File | Why |
|---|---|
| `packages/plugins/spider/src/engines/*` | Engines read from `givens.role` etc. directly — their received values come from resolved givens, not from the template system |
| `packages/plugins/spider/src/tools/*` | No variable resolution logic lives here |
| `packages/framework/core/src/guild-config.ts` | `GuildConfig` is plugin-agnostic; spider config lives under `spider:` key typed as `Record<string, unknown>` via extension, not defined here |

---

## Current Type Signatures (copied from source)

### `packages/plugins/spider/src/types.ts`

```typescript
/**
 * A single engine slot declared in a rig template.
 */
export interface RigTemplateEngine {
  /** Engine id unique within this template. */
  id: string;
  /** Engine design id to look up in the Fabricator. */
  designId: string;
  /** Engine ids within this template whose completion is required first. Defaults to []. */
  upstream?: string[];
  /**
   * Givens to pass at spawn time.
   * String values starting with '$' are variable references resolved at spawn time.
   * Non-string values are passed through literally.
   * Variables that resolve to undefined cause the key to be omitted.
   */
  givens?: Record<string, unknown>;
}

/**
 * Spider apparatus configuration — lives under the `spider` key in guild.json.
 */
export interface SpiderConfig {
  /**
   * Role to summon for quick engine sessions.
   * Default: 'artificer'.
   */
  role?: string;
  /**
   * Polling interval for crawlContinual tool (milliseconds).
   * Default: 5000.
   */
  pollIntervalMs?: number;
  /**
   * Build command to pass to quick engines.
   */
  buildCommand?: string;
  /**
   * Test command to pass to quick engines.
   */
  testCommand?: string;
  /**
   * Writ type → rig template mappings.
   * 'default' key is the fallback for unmatched writ types.
   * Spawning fails if no matching template is found.
   */
  rigTemplates?: Record<string, RigTemplate>;
}
```

### `packages/plugins/spider/src/spider.ts`

#### `resolveGivens` (lines 167–196)

```typescript
/**
 * Resolve a template engine's givens map using a variables context.
 * '$writ' → WritDoc, '$role' → role string, '$spider.<key>' → spiderConfig[key].
 * Keys resolving to undefined are omitted from the output.
 * Non-'$' prefixed values are passed through as literals.
 */
function resolveGivens(
  givens: Record<string, unknown> | undefined,
  context: { writ: WritDoc; role: string; spiderConfig: SpiderConfig },
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(givens ?? {})) {
    if (typeof value !== 'string' || !value.startsWith('$')) {
      result[key] = value;
    } else if (value === '$writ') {
      result[key] = context.writ;
    } else if (value === '$role') {
      result[key] = context.role;
    } else if (/^\$spider\.[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
      const spiderKey = value.slice('$spider.'.length);
      const resolved = (context.spiderConfig as Record<string, unknown>)[spiderKey];
      if (resolved !== undefined) {
        result[key] = resolved;
      }
      // undefined → omit key entirely
    }
    // Unrecognized $-prefixed strings are caught at validation time
  }
  return result;
}
```

#### `buildFromTemplate` (lines 201–213)

```typescript
function buildFromTemplate(
  template: RigTemplate,
  context: { writ: WritDoc; role: string; spiderConfig: SpiderConfig },
): { engines: EngineInstance[]; resolutionEngineId?: string } {
  const engines: EngineInstance[] = template.engines.map((entry) => ({
    id: entry.id,
    designId: entry.designId,
    status: 'pending' as const,
    upstream: entry.upstream ?? [],
    givensSpec: resolveGivens(entry.givens, context),
  }));
  return { engines, resolutionEngineId: template.resolutionEngine };
}
```

#### `validateTemplates` — R7 variable validation (lines 305–321)

```typescript
// R7: Variable reference validation
for (const engine of engines) {
  for (const value of Object.values(engine.givens ?? {})) {
    if (typeof value === 'string' && value.startsWith('$')) {
      if (
        value === '$writ' ||
        value === '$role' ||
        /^\$spider\.[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)
      ) {
        continue; // valid
      }
      throw new Error(
        `[spider] rigTemplates.${templateKey}: engine "${engine.id}" has unrecognized variable "${value}"`
      );
    }
  }
}
```

#### `trySpawn` — buildFromTemplate call site (lines 728–733)

```typescript
const template = lookupTemplate(writ.type, spiderConfig);
const { engines, resolutionEngineId } = buildFromTemplate(template, {
  writ,
  role: spiderConfig.role ?? 'artificer',
  spiderConfig,
});
```

#### `buildStaticEngines` (lines 131–147) — **dead code**

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

Note: `buildStaticEngines` is **not called anywhere** in the current production code path. `trySpawn` always uses `buildFromTemplate`. The function is preserved by an explicit test (`describe('Spider — buildStaticEngines preserved')`). This change does not require modifying `buildStaticEngines`.

---

## Key Functions Changed

### 1. `resolveGivens` in `spider.ts`

The central resolution function. Currently handles:
- `$writ` → `context.writ` (stays)
- `$role` → `context.role` (removed)
- `$spider.<key>` → `(context.spiderConfig as Record<string, unknown>)[key]` (replaced)

New behavior:
- `$writ` → `context.writ` (unchanged)
- `$vars.<key>` → `(context.spiderConfig.variables ?? {})[key]` (new)
- `$role` → error (caught at validation time, not a runtime branch)
- `$spider.<key>` → error (caught at validation time, not a runtime branch)

Context parameter type changes:
- `role: string` field can be dropped since `$role` no longer exists

### 2. `validateTemplates` R7 block in `spider.ts`

Currently valid set: `{ '$writ', '$role', /^\$spider\.[a-zA-Z_][a-zA-Z0-9_]*$/ }`

New valid set: `{ '$writ', /^\$vars\.[a-zA-Z_][a-zA-Z0-9_]*$/ }`

Error message for anything else is unchanged: `[spider] rigTemplates.${templateKey}: engine "${engine.id}" has unrecognized variable "${value}"`

### 3. `buildFromTemplate` context in `spider.ts`

Currently: `{ writ: WritDoc; role: string; spiderConfig: SpiderConfig }`
New: `{ writ: WritDoc; spiderConfig: SpiderConfig }` (role dropped)

The `trySpawn` call site: remove `role: spiderConfig.role ?? 'artificer'` from the context object.

### 4. `SpiderConfig` in `types.ts`

Add:
```typescript
/**
 * User-defined variables available in rig template givens via '$vars.<key>'.
 * Values are passed through literally (string, number, boolean).
 * Variables resolving to undefined (key absent) cause the givens key to be omitted.
 */
variables?: Record<string, unknown>;
```

---

## Test File Inventory

### `packages/plugins/spider/src/spider.test.ts`

**`STANDARD_TEMPLATE`** (lines 39–48) — used by the default `buildFixture()`:

```typescript
const STANDARD_TEMPLATE: RigTemplate = {
  engines: [
    { id: 'draft',     designId: 'draft',     givens: { writ: '$writ' } },
    { id: 'implement', designId: 'implement', upstream: ['draft'],     givens: { writ: '$writ', role: '$role' } },
    { id: 'review',    designId: 'review',    upstream: ['implement'], givens: { writ: '$writ', role: 'reviewer', buildCommand: '$spider.buildCommand', testCommand: '$spider.testCommand' } },
    { id: 'revise',    designId: 'revise',    upstream: ['review'],    givens: { writ: '$writ', role: '$role' } },
    { id: 'seal',      designId: 'seal',      upstream: ['revise'],    givens: {} },
  ],
  resolutionEngine: 'seal',
};
```

This uses `$role` (×3) and `$spider.buildCommand`, `$spider.testCommand` (×1 each). All must be updated.

**`buildFixture`** (lines 77–238): The `fakeGuildConfig.spider` block will need `variables` populated if the `STANDARD_TEMPLATE` resolves `$vars.*`.

**`describe('Spider — variable resolution')`** (lines 1977–2103): Tests for `$writ`, `$role`, `$spider.*` resolution. Every `$role` and `$spider.*` test case must be rewritten for `$vars.*`. Affected test cases:

| Test | Line (approx) | Action |
|---|---|---|
| `$role resolves to spiderConfig.role when set` | ~1999 | Replace with `$vars.role` test |
| `$role defaults to "artificer" when not set` | ~2013 | Replace with `$vars.role` default |
| `$spider.buildCommand resolves to configured value` | ~2027 | Replace with `$vars.buildCommand` |
| `$spider.* undefined causes key to be omitted` | ~2041 | Replace with `$vars.*` omission test |
| `mixed literals and $-variables resolve correctly` | ~2070 | Update to use `$vars.*` |

**`describe('Spider — startup validation')`** (lines 2105+): R7 variable validation tests. Affected:

| Test | Line (approx) | Action |
|---|---|---|
| `throws for unrecognized variable ($buildCommand)` | ~2258 | Keep (still an error) |
| `throws for nested $spider path ($spider.a.b)` | ~2278 | Keep or convert to `$spider.foo` is now invalid test |
| `accepts $spider.buildCommand as a valid variable` | ~2298 | Change: must now THROW (previously valid, now invalid) |
| (new needed) `accepts $vars.buildCommand as a valid variable` | — | New test |
| (new needed) `$role is an unrecognized variable` | — | New test |
| (new needed) `$spider.foo is an unrecognized variable` | — | New test |

**Tests that use `$role` in templates but are not in the variable-resolution suite** (scattered through integration tests):
- Line ~2136: `{ writ: '$writ', role: '$role' }` in 3-engine CDC test
- Line ~2443: `{ writ: '$writ', role: '$role' }` in fallback test
- Line ~2613: `{ writ: '$writ', role: '$role' }` in full pipeline test

All must be updated to `$vars.role` (and guild config must include `variables: { role: 'artificer' }` for those fixtures).

---

## Adjacent Patterns

### How `$writ` is handled (unchanged reference)

`$writ` is a special case that doesn't come from any config key — it injects the full `WritDoc` object. It stays unchanged. The pattern: special-cased exact match in both `resolveGivens` and `validateTemplates`.

### How undefined vars are handled (inherit)

Current: `$spider.<key>` that resolves to `undefined` causes the givens key to be omitted entirely. The new `$vars.<key>` should follow the same convention: if the key is absent from `variables`, omit the givens key. This is explicit in the existing code comment: `// undefined → omit key entirely`.

### How non-$ values are handled (inherit)

Literal values (non-string, or strings not starting with `$`) pass through unchanged. This is unaffected by this change.

### Test fixture conventions

Tests in `spider.test.ts` use `buildFixture(guildConfig)` which constructs a `fakeGuildConfig` with:
```typescript
spider: {
  rigTemplates: { default: STANDARD_TEMPLATE },
  ...(guildConfig.spider ?? {}),
}
```
Tests that override spider config use spread merge. Tests that add `variables` will need:
```typescript
spider: { variables: { role: 'artificer', buildCommand: 'make build' }, rigTemplates: { default: myTemplate } }
```

---

## Existing Context & Notes

### Doc/Code Discrepancies

1. **`docs/architecture/apparatus/spider.md` describes the static graph** (lines 150–163) using `spawnStaticRig(writ, config)` directly reading `config.role`, `config.buildCommand`, `config.testCommand`. The actual code has moved to `buildFromTemplate`/`lookupTemplate` — the doc reflects the old MVP design, not current code. This change requires the doc to be updated regardless (to show the new `variables` config key and `$vars.*` syntax).

2. **`docs/architecture/apparatus/spider.md` config example** (lines 648–659) shows:
   ```json
   {
     "spider": {
       "role": "artificer",
       "pollIntervalMs": 5000,
       "buildCommand": "pnpm build",
       "testCommand": "pnpm test"
     }
   }
   ```
   This shows `role`, `buildCommand`, `testCommand` as flat spider config fields. After this change, these remain valid `SpiderConfig` fields (used by `buildStaticEngines` and potentially direct code), but are no longer accessible via `$spider.*` in templates. The doc needs a new `variables` example.

3. **`docs/architecture/apparatus/review-loop.md`** (line 286) states: "Configuration currently lives under `guild.json["spider"]` as part of `SpiderConfig`... Available fields: `buildCommand`, `testCommand`, `role`, `pollIntervalMs`." This note is about which config fields exist, not about template variable syntax, so it remains accurate after the change. No update required.

### `buildStaticEngines` is dead code

`buildStaticEngines` at lines 131–147 of `spider.ts` is no longer called anywhere in production. `trySpawn` exclusively uses `buildFromTemplate`. The test `describe('Spider — buildStaticEngines preserved')` just confirms the Spider starts up and uses STANDARD_TEMPLATE (which is the template equivalent of the old static behavior). This function does NOT need to be updated since it's never called in the variable resolution path.

### Why `$spider.*` is a pollution problem

`SpiderConfig` contains `rigTemplates` itself. A template author could currently write `givens: { allTemplates: '$spider.rigTemplates' }` and receive the entire template config at an engine's startup — unintentional data leakage. The `variables` namespace prevents this by only exposing an explicit, isolated dict.

---

## Config Change Summary

### Before

```json
// guild.json
{
  "spider": {
    "role": "artificer",
    "buildCommand": "pnpm build",
    "testCommand": "pnpm test",
    "rigTemplates": {
      "default": {
        "engines": [
          { "id": "implement", "designId": "implement", "upstream": ["draft"],
            "givens": { "writ": "$writ", "role": "$role" } },
          { "id": "review",    "designId": "review",    "upstream": ["implement"],
            "givens": { "writ": "$writ", "role": "reviewer",
                        "buildCommand": "$spider.buildCommand",
                        "testCommand": "$spider.testCommand" } }
        ]
      }
    }
  }
}
```

### After

```json
// guild.json
{
  "spider": {
    "rigTemplates": {
      "default": {
        "engines": [
          { "id": "implement", "designId": "implement", "upstream": ["draft"],
            "givens": { "writ": "$writ", "role": "$vars.role" } },
          { "id": "review",    "designId": "review",    "upstream": ["implement"],
            "givens": { "writ": "$writ", "role": "reviewer",
                        "buildCommand": "$vars.buildCommand",
                        "testCommand": "$vars.testCommand" } }
        ]
      }
    },
    "variables": {
      "role": "artificer",
      "buildCommand": "pnpm build",
      "testCommand": "pnpm test"
    }
  }
}
```

Using `$spider.foo` or `$role` in templates after this change is an error at startup (`validateTemplates` throws).

---

## Summary of All Touch Points

| Location | What changes |
|---|---|
| `types.ts` `SpiderConfig` | Add `variables?: Record<string, unknown>` |
| `types.ts` `RigTemplateEngine.givens` JSDoc | Update to reference `$vars.*` instead of `$spider.*` |
| `spider.ts` `resolveGivens` JSDoc | Remove `$role`/`$spider.*` references, add `$vars.*` |
| `spider.ts` `resolveGivens` function body | Remove `$role` branch, replace `$spider.*` regex with `$vars.*`, resolve from `spiderConfig.variables` |
| `spider.ts` `resolveGivens` context param type | Remove `role: string` |
| `spider.ts` `buildFromTemplate` context param type | Remove `role: string` |
| `spider.ts` `validateTemplates` R7 block | Remove `$role` and `$spider.*` from valid set; add `$vars.*` regex |
| `spider.ts` `trySpawn` call to `buildFromTemplate` | Remove `role:` from context object |
| `spider.test.ts` `STANDARD_TEMPLATE` | Replace `$role` → `$vars.role`, `$spider.buildCommand` → `$vars.buildCommand`, `$spider.testCommand` → `$vars.testCommand` |
| `spider.test.ts` `buildFixture` default config | Add `variables: { role: 'artificer' }` to spider config (so STANDARD_TEMPLATE resolves) |
| `spider.test.ts` `describe('Spider — variable resolution')` | Rewrite `$role` and `$spider.*` tests for `$vars.*` |
| `spider.test.ts` `describe('Spider — startup validation')` | Update: `$spider.buildCommand` now throws; add `$role` error test; add `$vars.buildCommand` acceptance test |
| `spider.test.ts` scattered integration tests using `$role` | Update templates to `$vars.role` and add `variables` to their fixture config |
| `docs/architecture/apparatus/spider.md` | Update config example, add `variables` section |
