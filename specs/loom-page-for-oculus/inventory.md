# Inventory — loom-page-for-oculus

## Brief

The loom should add a `recommends` dependency on the oculus and contribute a page via its kit. This page should allow viewing information about roles which exist in the guild, including their name, configuration, and source (plugin or guild config). In addition to the key data, it should be possible to select a role and see the tools which are available to animas with that role, its environment variable, and what its final System Prompt would be after weaving.

---

## Directly Affected Files

### Modified

| File | Why |
|------|-----|
| `packages/plugins/loom/src/loom.ts` | Add `recommends: ['oculus']`, add `RoleInfo` type, add `listRoles()` to `LoomApi`, implement `listRoles()` in api closure, add `supportKit` with patron tools and page contribution, add runtime `tool` import |
| `packages/plugins/loom/src/index.ts` | Export `RoleInfo` type |
| `packages/plugins/loom/package.json` | Add `pages` to `publishConfig.files`, potentially add page dir to package root |

### Created

| File | Why |
|------|-----|
| `packages/plugins/loom/pages/loom/index.html` | Static page asset served by the Oculus at `/pages/loom/` |
| `packages/plugins/loom/src/loom.test.ts` | Extended with tests for `listRoles()` and the new supportKit tools |

---

## Key Types — Current Signatures

### `LoomApi` (in `packages/plugins/loom/src/loom.ts`)

```typescript
export interface LoomApi {
  weave(request: WeaveRequest): Promise<AnimaWeave>;
}
```

Must add: `listRoles(): RoleInfo[]`

### `RoleDefinition` (in `packages/plugins/loom/src/loom.ts`)

```typescript
export interface RoleDefinition {
  permissions: string[];
  strict?: boolean;
}
```

### `LoomConfig` (in `packages/plugins/loom/src/loom.ts`)

```typescript
export interface LoomConfig {
  roles?: Record<string, RoleDefinition>;
}
```

### `KitRoleDefinition` (in `packages/plugins/loom/src/loom.ts`)

```typescript
export interface KitRoleDefinition {
  permissions: string[];
  strict?: boolean;
  instructions?: string;
  instructionsFile?: string;
}
```

Note: after `registerKitRoles()` processes a `KitRoleDefinition`, only the `RoleDefinition` subset (permissions + strict) is stored in `kitRoles`. The instructions are stored separately in `roleInstructions`.

### `AnimaWeave` (in `packages/plugins/loom/src/loom.ts`)

```typescript
export interface AnimaWeave {
  systemPrompt?: string;
  tools?: ResolvedTool[];
  environment?: Record<string, string>;
}
```

Note: `tools` is `ResolvedTool[]` which contains Zod schemas and function references — **not JSON-serializable as-is**. The page API needs a stripped-down representation.

### `ResolvedTool` (in `packages/plugins/tools/src/instrumentarium.ts`)

```typescript
export interface ResolvedTool {
  definition: ToolDefinition;
  pluginId: string;
}
```

### `ToolDefinition` (in `packages/plugins/tools/src/tool.ts`)

```typescript
export interface ToolDefinition<TShape extends ZodShape = ZodShape> {
  readonly name: string;
  readonly description: string;
  readonly instructions?: string;
  readonly instructionsFile?: string;
  readonly callableBy?: ToolCaller[];
  readonly permission?: string;
  readonly params: z.ZodObject<TShape>;
  readonly handler: (params: z.infer<z.ZodObject<TShape>>) => unknown | Promise<unknown>;
}
```

### `PageContribution` (in `packages/plugins/oculus/src/types.ts`)

```typescript
export interface PageContribution {
  id: string;
  title: string;
  dir: string;  // relative to package root in node_modules
}
```

### `OculusKit` (in `packages/plugins/oculus/src/types.ts`)

```typescript
export interface OculusKit {
  pages?: PageContribution[];
  routes?: RouteContribution[];
}
```

### `RouteContribution` (in `packages/plugins/oculus/src/types.ts`)

```typescript
export interface RouteContribution {
  method: string;
  path: string;
  handler: (c: Context) => Response | Promise<Response>;
}
```

### `Kit` (in `packages/framework/core/src/plugin.ts`)

```typescript
export type Kit = {
  requires?:   string[]
  recommends?: string[]
  [key: string]: unknown
}
```

### `Apparatus` (in `packages/framework/core/src/plugin.ts`)

```typescript
export type Apparatus = {
  requires?:    string[]
  recommends?:  string[]
  provides?:    unknown
  start:        (ctx: StartupContext) => void | Promise<void>
  stop?:        () => void | Promise<void>
  supportKit?:  Kit
  consumes?:    string[]
}
```

---

## Loom Internal State (Closure Variables)

The `createLoom()` factory captures these in a closure:

```typescript
let config: LoomConfig = {};           // from guild.json on start()
let charterContent: string | undefined; // charter.md contents
let roleInstructions: Map<string, string> = new Map(); // role name → instructions text
let kitRoles: Map<string, RoleDefinition> = new Map(); // qualified name → def
```

**Guild roles**: stored in `config.roles` (simple name keys like `"artificer"`)
**Kit-contributed roles**: stored in `kitRoles` (qualified name keys like `"animator.scribe"`)
**Source inference**: all `config.roles` entries → source `'guild'`; all `kitRoles` entries → source is the prefix before the first `.` in the key (the plugin id)

---

## Loom Apparatus — Current Shape

```typescript
return {
  apparatus: {
    requires: ['tools'],
    consumes: ['roles'],
    provides: api,

    start(ctx: StartupContext): void { ... },
  },
};
```

Must add: `recommends: ['oculus']` and `supportKit` with pages + tools.

---

## How the Oculus Handles Page Contributions

**Scanning at startup** (`oculus.ts` lines ~396–401): iterates `g.kits()` and `g.apparatuses()` at start time. For apparatuses, it calls `scanApparatus(apparatus)` which looks at `apparatus.apparatus.supportKit` for `OculusKit.pages` and `OculusKit.routes`.

**Late arrivals** (`oculus.ts` lines ~497–513): subscribes to `plugin:initialized`. When a new apparatus fires the event, `scanApparatus()` runs again. So the order of Loom vs Oculus startup doesn't matter — if Oculus starts first, the Loom's supportKit is picked up via `plugin:initialized`.

**Directory resolution** (`oculus.ts` line ~239):
```typescript
function resolveDirForPackage(packageName: string, dir: string): string {
  return path.join(g.home, 'node_modules', packageName, dir);
}
```
So `dir: 'pages/loom'` for `@shardworks/loom-apparatus` resolves to:
`{guild.home}/node_modules/@shardworks/loom-apparatus/pages/loom`

In a pnpm workspace, `node_modules/@shardworks/loom-apparatus` is a symlink to `packages/plugins/loom`, so the path resolves to `packages/plugins/loom/pages/loom/`.

**Chrome injection**: For `index.html`, the Oculus injects the shared nav and `/static/style.css` link automatically. The page gets the Tokyo Night stylesheet and the nav bar for free.

**Tool→REST mapping**: Patron-callable tools are auto-exposed as REST endpoints. `toolNameToRoute('loom-roles')` → `/api/loom/roles` (GET since no permission, default); `toolNameToRoute('loom-weave')` → `/api/loom/weave` (GET since no permission).

---

## How the Oculus Handles Tool Routes

```typescript
const patronTools = allTools.filter(
  (r) => !r.definition.callableBy || r.definition.callableBy.includes('patron'),
);
for (const resolved of patronTools) {
  registerToolRoute(resolved.definition, instrumentarium);
}
```

The tool name maps to route via:
```typescript
export function toolNameToRoute(name: string): string {
  const idx = name.indexOf('-');
  if (idx === -1) return `/api/${name}`;
  return `/api/${name.slice(0, idx)}/${name.slice(idx + 1)}`;
}
```

`loom-roles` → `/api/loom/roles`  
`loom-weave` → `/api/loom/weave`

Both would be GET (no permission → `permissionToMethod(undefined)` → `'GET'`).

---

## Loom Package — Current Dependencies

```json
{
  "dependencies": {
    "@shardworks/nexus-core": "workspace:*",
    "@shardworks/tools-apparatus": "workspace:*",
    "zod": "4.3.6"
  }
}
```

Current import from `@shardworks/tools-apparatus` in `loom.ts`: **type-only** (`import type { InstrumentariumApi, ResolvedTool }`). Adding `tool()` usage requires a runtime import.

No new npm dependencies needed if using patron tools (avoids needing `hono`).

---

## How `registerKitRoles` Determines Source

Kit roles are registered with a qualified name:
```typescript
const qualifiedName = `${pluginId}.${roleName}`;
```

So `kitRoles.keys()` are things like `"animator.scribe"`, `"clerk.manager"`. The source plugin is `qualifiedName.split('.')[0]`.

Guild roles are the plain keys from `config.roles` (e.g., `"artificer"`, `"admin"`, but also potentially `"animator.scribe"` if the guild overrides a kit role by its qualified name).

---

## Current `index.ts` Exports

```typescript
export {
  type LoomApi,
  type WeaveRequest,
  type AnimaWeave,
  type LoomConfig,
  type RoleDefinition,
  type KitRoleDefinition,
  type LoomKit,
  createLoom,
} from './loom.ts';
```

Needs `RoleInfo` added.

---

## Test File Patterns — `loom.test.ts`

The test file uses:
- `setupGuild(opts)` helper that calls `setGuild()` with mock guild
- `startLoom(eventHandlers?)` that creates and starts a loom, returns `LoomApi`
- `mockInstrumentarium(tools)` that returns `{ api, calls }` 
- `makeLoadedKit(id, packageName, kit)` builder
- `makeLoadedApparatus(id, packageName, supportKit?)` builder
- `emitPluginInitialized(handlers, plugin)` to simulate late-arriving plugins

Tests are in `describe('The Loom', ...)` with nested `describe` blocks per feature. New tests for `listRoles()` would follow the same pattern.

The loom test file is ~15K tokens, so it's already quite large. New `listRoles()` tests follow the same guild setup → startLoom → call api pattern.

---

## Oculus Test File Patterns — `oculus.test.ts`

- `wireGuild(opts)` calls `setGuild()` with mock guild
- `createMockInstrumentarium(tools)` builds fake InstrumentariumApi
- `mockKit(id, tools, pages?, routes?)` builds LoadedKit
- Integration tests start a real Oculus server on a random port, make real HTTP requests

---

## No Existing Comparable Page Implementations

No plugin in the current codebase contributes an `OculusKit.pages` entry via a `supportKit`. The only examples of page contributions are in the Oculus test file (test fixtures, not real implementations). The Loom page would be the **first real page contributor**.

There are no existing patterns for static HTML pages in this monorepo outside the oculus's own home-page (which is server-side rendered inline in `oculus.ts`).

---

## Adjacent Patterns

### `recommends` usage example (Animator)

```typescript
return {
  apparatus: {
    requires: ['stacks'],
    recommends: ['loom'],
    supportKit: { ... },
    provides: api,
    start(_ctx) { ... },
  },
};
```

### Tool in supportKit example (Oculus self-tool)

```typescript
supportKit: {
  tools: [
    tool({
      name: 'oculus',
      description: 'Start the Oculus web dashboard and keep it running',
      callableBy: ['patron'],
      params: {},
      handler: async () => { ... },
    }),
  ],
},
```

### Tool in supportKit example (Instrumentarium)

```typescript
supportKit: {
  tools: [toolsList, toolsShow],
},
```

where `toolsList` and `toolsShow` are ToolDefinition objects created by `tool()`.

---

## Doc/Code Discrepancies

1. **Composition order**: `loom.md` documents the system prompt layers as:
   1. Guild charter
   2. Curriculum (future)
   3. Temperament (future)
   4. Role instructions
   5. Tool instructions
   
   But the actual code (loom.ts ~249–272) assembles:
   1. Charter
   2. Tool instructions (for each resolved tool)
   3. Role instructions
   
   Role instructions and tool instructions are **swapped** compared to the doc.

2. **Future `requires`**: `loom.md` says "Future dependencies: `requires: ['stacks', 'tools']`" but this is clearly labeled as future, not a discrepancy.

3. **`loom.md` path**: The doc references `docs/specification.md (loom)` in the source comment, but no such file exists. The doc is at `docs/architecture/apparatus/loom.md`.

---

## Oculus Static CSS Classes Available

The page can use these classes from `/static/style.css`:
- `.card` — surface card with border
- `.badge`, `.badge--success`, `.badge--error`, `.badge--warning`, `.badge--info` — color-coded labels
- `.data-table` — striped table
- `.btn`, `.btn--primary`, `.btn--danger` — buttons
- `.toolbar` — flex row for actions
- `.empty-state` — centered empty-state placeholder

CSS custom properties: `--bg`, `--surface`, `--surface2`, `--border`, `--text`, `--text-dim`, `--text-bright`, `--green`, `--red`, `--yellow`, `--cyan`, `--magenta`, `--blue`, `--font-mono`

---

## Role Data Available at Runtime

After startup, the Loom has:

| Source | Storage | Key format | Example |
|--------|---------|------------|---------|
| guild.json `loom.roles` | `config.roles` | plain name | `artificer`, `admin` |
| kit/supportKit contributions | `kitRoles` Map | `pluginId.roleName` | `animator.scribe`, `clerk.manager` |

Each role is a `RoleDefinition`: `{ permissions: string[], strict?: boolean }`.

Source inference for the page:
- `config.roles` keys → source `'guild'`
- `kitRoles` keys → source = prefix before first `.` in the key

---

## Weave Output for Page Display

`loom.weave({ role })` returns `AnimaWeave`:
- `systemPrompt?: string` — fully composed system prompt (charter + tool instructions + role instructions)
- `tools?: ResolvedTool[]` — contains Zod schemas and function handlers (not JSON-serializable)
- `environment?: Record<string, string>` — e.g. `{ GIT_AUTHOR_NAME: 'Artificer', GIT_AUTHOR_EMAIL: 'artificer@nexus.local' }`

For the API route, `tools` must be serialized to a safe format:
```typescript
type SerializableTool = {
  name: string;
  description: string;
  permission?: string;
  pluginId: string;
}
```

---

## Publishing / Files

Current `publishConfig.files`:
```json
"files": ["dist"]
```

The `pages/` directory at the package root is not currently listed. If static HTML lives at `packages/plugins/loom/pages/loom/`, the `pages` directory needs to be added to the published files list (the monorepo `"files"` field in `package.json`, not `publishConfig`).

Actually: the top-level `package.json` `"files"` field is for npm publish. The `publishConfig.exports` overrides exports at publish time. The `"files": ["dist"]` is inside `publishConfig` (wrong reading — it's a separate top-level `"files"` array). Let me re-read:

```json
"files": ["dist"],
"publishConfig": {
  "exports": { ... }
}
```

The `"files": ["dist"]` is at the top level of the package.json — it controls what gets included in the published npm package. For the pages to be accessible at publish time, `"pages"` must be added to this array. In the workspace, the symlink resolution means the `pages/` directory is accessible regardless.
