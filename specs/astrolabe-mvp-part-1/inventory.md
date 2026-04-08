# Inventory: astrolabe-mvp-part-1

## Brief

Implement the Astrolabe foundation:
- Package scaffolding, plugin registration, dependency declarations
- Book: `astrolabe/plans` with full PlanDoc/ScopeItem/Decision schema + indexes
- All 7 tools (plan-show, inventory-write, scope-write, decisions-write, observations-write, spec-write, plan-list)
- Kit contributions: `brief` writ type → Clerk, `astrolabe.sage` role → Loom
- Kit contributions: rig template definition (8-step pipeline) + `brief` → template mapping
- Configuration (`generatedWritType`)

Architecture spec: `docs/architecture/apparatus/astrolabe.md`

---

## Files That Will Be Created

All new — no existing astrolabe package:

```
packages/plugins/astrolabe/package.json
packages/plugins/astrolabe/tsconfig.json
packages/plugins/astrolabe/src/index.ts
packages/plugins/astrolabe/src/astrolabe.ts
packages/plugins/astrolabe/src/types.ts
packages/plugins/astrolabe/src/tools/index.ts
packages/plugins/astrolabe/src/tools/plan-show.ts
packages/plugins/astrolabe/src/tools/plan-list.ts
packages/plugins/astrolabe/src/tools/inventory-write.ts
packages/plugins/astrolabe/src/tools/scope-write.ts
packages/plugins/astrolabe/src/tools/decisions-write.ts
packages/plugins/astrolabe/src/tools/observations-write.ts
packages/plugins/astrolabe/src/tools/spec-write.ts
packages/plugins/astrolabe/src/engines/index.ts
packages/plugins/astrolabe/src/engines/plan-init.ts
packages/plugins/astrolabe/src/engines/inventory-check.ts
packages/plugins/astrolabe/src/engines/decision-review.ts
```

### Not modified

The contribution system is entirely via `supportKit` (Wire phase): no changes to Clerk, Loom, Spider, or Fabricator source code. Those apparatuses consume `ctx.kits(type)` at startup and pick up the Astrolabe's contributions automatically.

---

## Architecture Spec Verbatim Types

From `docs/architecture/apparatus/astrolabe.md`:

```typescript
interface PlanDoc {
  id: string;               // brief writ ID — primary key
  codex: string;            // target codex
  status: 'reading' | 'analyzing' | 'reviewing' | 'writing' | 'completed' | 'failed';
  inventory?: string;       // markdown
  observations?: string;    // markdown
  scope?: ScopeItem[];
  decisions?: Decision[];
  spec?: string;            // markdown
  generatedWritId?: string; // writ ID of generated mandate (or configured type)
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;   // BookEntry constraint
}

interface ScopeItem {
  id: string;
  description: string;
  rationale: string;
  included: boolean;
}

interface Decision {
  id: string;
  scope: string[];              // scope item IDs
  question: string;
  context?: string;
  options: Record<string, string>;   // key → description
  recommendation?: string;
  rationale?: string;
  selected?: string;            // set by decision-review engine
  patronOverride?: string;      // set by decision-review engine
}
```

Indexes declared in spec: `['status', 'codex', 'createdAt']`

---

## Plugin Identity

**npm package name:** `@shardworks/astrolabe` (spec says "Package: `@shardworks/astrolabe`")

**Plugin ID derivation** (from `docs/architecture/plugins.md`):
1. Strip `@shardworks/` scope: `@shardworks/astrolabe` → `astrolabe`
2. No `-apparatus`/`-kit` suffix to strip

**Plugin ID:** `astrolabe`

**Configuration key in guild.json:** `astrolabe`

Note: All existing apparatus packages in this repo use the `-apparatus` suffix (`@shardworks/clerk-apparatus`, `@shardworks/spider-apparatus`, etc.), but the architecture spec explicitly says "Package: `@shardworks/astrolabe`". The spec is authoritative.

---

## Dependency Analysis

Architecture spec says: `requires: [clerk, stacks, spider, loom, fabricator]`

Apparatus `requires` (affects start ordering AND validates installation):
- `stacks` — needs to open the plans book in `start()`
- `clerk` — spec-write tool and engines post writs via ClerkApi
- `spider` — rig template references `spider/input-requests` book; planning template is contributed to Spider
- `loom` — not called in `start()`, but role contributions go to Loom; the astrolabe doc lists it as a dependency
- `fabricator` — clockwork engines contributed to Fabricator via supportKit

Observations:
- The Loom consumes kit role contributions at its own `start()` time via `ctx.kits('roles')`. The Astrolabe doesn't call `guild().apparatus<LoomApi>('loom')` in `start()`. So `loom` could be `recommends` rather than `requires`. However, the spec lists it as a dependency, so it should be in `requires`.
- The `decision-review` engine writes to `spider/input-requests` book via `guild().apparatus<StacksApi>('stacks')`. It doesn't call `guild().apparatus<SpiderApi>('spider')`. But having `spider` in `requires` ensures the book schema is registered before any engine handler runs.
- For the kit template validation: the Spider's `registerKitTemplates` adds `'spider'` to `allowedPlugins` unconditionally (hardcoded in validation logic), so referencing spider's built-in engines (`anima-session`, `draft`, `seal`) in the template is always allowed.

---

## How Contributions Flow: Wire Phase

From `packages/plugins/stacks/src/stacks.ts`:
```typescript
// Stacks scans ctx.kits('books') at start()
// entry.pluginId is used as ownerId
// So our plans book will be: ownerId='astrolabe', bookName='plans'
```

From `packages/plugins/clerk/src/clerk.ts`:
```typescript
// Clerk scans ctx.kits('writTypes') at start()
// Interface: WritTypeEntry[] (array of { name: string, description?: string })
// Contributed as: supportKit.writTypes: WritTypeEntry[]
export interface ClerkKit {
  writTypes?: WritTypeEntry[];
}
```

From `packages/plugins/loom/src/loom.ts`:
```typescript
// Loom scans ctx.kits('roles') at start()
// Kit roles are qualified: pluginId + '.' + roleName
// So our role 'sage' → registered as 'astrolabe.sage'
export interface LoomKit {
  roles?: Record<string, KitRoleDefinition>;
}
// KitRoleDefinition:
export interface KitRoleDefinition {
  permissions: string[];
  strict?: boolean;
  instructions?: string;
  instructionsFile?: string;
}
```

From `packages/plugins/spider/src/spider.ts`:
```typescript
// Spider scans ctx.kits('rigTemplates') and ctx.kits('rigTemplateMappings') at start()
// Kit templates are qualified: pluginId + '.' + templateName
// So our template 'planning' → registered as 'astrolabe.planning'
// The rigTemplateMappings value is the qualified template name
export interface SpiderKit {
  rigTemplates?: Record<string, RigTemplate>;
  rigTemplateMappings?: Record<string, string>;
}
```

From `packages/plugins/fabricator/src/fabricator.ts`:
```typescript
// Fabricator scans ctx.kits('engines') at start()
// entry.value IS the engines record: { 'astrolabe.plan-init': engine, ... }
// Engine IDs must be globally unique
```

---

## Apparatus supportKit — Contribution Shape

Looking at how Spider declares its own supportKit (the gold standard):

```typescript
return {
  apparatus: {
    requires: ['stacks', 'clerk', 'fabricator'],
    recommends: ['oculus'],
    consumes: ['blockTypes', 'rigTemplates', 'rigTemplateMappings'],
    supportKit: {
      books: {
        rigs: { indexes: ['status', 'writId', ['status', 'writId'], 'createdAt'] },
        'input-requests': { indexes: ['status', 'rigId', 'engineId', 'createdAt', ['rigId', 'engineId', 'status']] },
      },
      engines: {
        'anima-session': animaSessionEngine,
        draft: draftEngine,
        // ...
      },
      blockTypes: { 'writ-status': writStatusBlockType, ... },
      tools: [...],
    },
    provides: api,
    start(ctx) { ... },
  },
};
```

The Astrolabe's supportKit will include:
- `books` (consumed by Stacks)
- `engines` (consumed by Fabricator)
- `writTypes` (consumed by Clerk)
- `roles` (consumed by Loom)
- `rigTemplates` (consumed by Spider)
- `rigTemplateMappings` (consumed by Spider)
- `tools` (consumed by tools apparatus)

The `consumes` field on the apparatus declaration is for things the apparatus itself reads from other kits. The Astrolabe likely doesn't scan any kit contributions itself, so `consumes: []` or omit.

---

## Engine Designs

Three clockwork engines to implement:

### `astrolabe.plan-init`

```typescript
// Givens received at run time (from Spider via template):
// - writ: WritDoc (the brief writ)
// Behavior:
// - Opens stacks.book<PlanDoc>('astrolabe', 'plans')
// - Creates PlanDoc: { id: writ.id, codex: writ.codex, status: 'reading', createdAt, updatedAt }
// - Returns { status: 'completed', yields: { planId: writ.id } }
```

### `astrolabe.inventory-check`

```typescript
// Givens received:
// - planId: string (via ${yields.plan-init.planId})
// Behavior:
// - Reads plan from plans book
// - Checks plan.inventory !== undefined
// - If found: { status: 'completed', yields: {} }
// - If not found: throw Error (fails the engine)
```

### `astrolabe.decision-review`

```typescript
// Givens received:
// - planId: string
// Behavior — first run (no priorBlock):
// - Reads PlanDoc from plans book
// - Maps decisions → InputRequestDoc (ChoiceQuestionSpec per Decision)
// - Writes InputRequestDoc to stacks.book<InputRequestDoc>('spider', 'input-requests')
//   using generateId('ir', 4) for the ID
// - Updates PlanDoc.status to 'reviewing'
// - Returns { status: 'blocked', blockType: 'patron-input', condition: { requestId } }
// Behavior — re-run (priorBlock present):
// - Reads the InputRequestDoc from spider/input-requests book
// - Reconciles answers → PlanDoc.decisions (selected, patronOverride)
// - Updates PlanDoc.status to 'writing'
// - Builds decisionSummary string
// - Returns { status: 'completed', yields: { decisionSummary } }
```

The `priorBlock` is available via `context.priorBlock` (from `EngineRunContext`). Its presence signals re-run.

The decision → ChoiceQuestionSpec mapping (from spec):
| Decision field | InputRequestDoc field |
|---|---|
| `id` | question key in `questions` map |
| `question` | `questions[id].label` |
| `context` + `rationale` | `questions[id].details` |
| `options` | `questions[id].options` |
| `recommendation` | pre-filled in `answers[id]` as `{ selected: recommendation }` |
| always | `questions[id].allowCustom: true` |

The `InputRequestDoc.message` carries a brief + scope summary.

---

## Rig Template

The planning rig template (8 steps):

```typescript
const planningTemplate: RigTemplate = {
  engines: [
    {
      id: 'plan-init',
      designId: 'astrolabe.plan-init',
      upstream: [],
      givens: { writ: '$writ' },
    },
    {
      id: 'draft',
      designId: 'draft',
      upstream: ['plan-init'],
      givens: { writ: '$writ' },
    },
    {
      id: 'reader',
      designId: 'anima-session',
      upstream: ['draft'],
      givens: {
        role: 'astrolabe.sage',
        prompt: '<READER_PROMPT>',     // contains planId reference
        cwd: '$yields.draft.path',
        planId: '$yields.plan-init.planId',
      },
    },
    {
      id: 'inventory-check',
      designId: 'astrolabe.inventory-check',
      upstream: ['reader'],
      givens: {
        planId: '$yields.plan-init.planId',
      },
    },
    {
      id: 'analyst',
      designId: 'anima-session',
      upstream: ['inventory-check'],
      givens: {
        role: 'astrolabe.sage',
        prompt: '<ANALYST_PROMPT>',
        cwd: '$yields.draft.path',
        planId: '$yields.plan-init.planId',
        conversationId: '$yields.reader.conversationId',
      },
    },
    {
      id: 'decision-review',
      designId: 'astrolabe.decision-review',
      upstream: ['analyst'],
      givens: {
        planId: '$yields.plan-init.planId',
      },
    },
    {
      id: 'spec-writer',
      designId: 'anima-session',
      upstream: ['decision-review'],
      givens: {
        role: 'astrolabe.sage',
        prompt: '<SPEC_WRITER_PROMPT>',
        cwd: '$yields.draft.path',
        planId: '$yields.plan-init.planId',
        conversationId: '$yields.analyst.conversationId',
      },
    },
    {
      id: 'seal',
      designId: 'seal',
      upstream: ['spec-writer'],
      givens: { abandon: true },
    },
  ],
};
```

**Important notes:**
- `$yields.draft.path` — DraftYields.path — absolute filesystem path to draft worktree
- `$yields.reader.conversationId` — from the default collect yields (SpiderApi collects `session.conversationId`)
- `$yields.analyst.conversationId` — same pattern, chaining conversations
- The `anima-session` engine validates that `cwd` is a non-empty string. The path comes from the draft engine's yields.
- `writ: '$writ'` is resolved at spawn time to the WritDoc; `$yields.*` refs are resolved at run time

**Prompt content strategy:** For MVP, the prompts in the template are static instruction strings. The anima reads `planId` (passed as a given) and calls `plan-show` to access current plan state. The `decisionSummary` from `decision-review` yields is available but the spec-writer prompt references it via `$yields.decision-review.decisionSummary` — which the Spider resolves to a whole string value for the `spec-writer` engine's givens. The `prompt` given itself cannot use inline interpolation (Spider only resolves whole-value yield refs). For MVP the spec-writer receives `planId` and reads the plan; `decisionSummary` can be passed as a separate given and referenced in the prompt independently.

---

## 7 Tools

### `plan-show`
```typescript
// Permission: astrolabe:read
// Params: { planId: z.string() }
// Handler: reads plans book, returns full PlanDoc; throws if not found
```

### `plan-list`
```typescript
// Permission: astrolabe:read
// Params: {
//   status: z.enum([...]).optional(),
//   codex: z.string().optional(),
//   limit: z.number().optional().default(20)
// }
// Handler: queries plans book with optional where conditions
```

### `inventory-write`
```typescript
// Permission: astrolabe:write
// Params: { planId: z.string(), inventory: z.string() }
// Handler: patches plan.inventory + updatedAt
```

### `scope-write`
```typescript
// Permission: astrolabe:write
// Params: { planId: z.string(), scope: z.array(ScopeItemSchema) }
// Handler: patches plan.scope + updatedAt
```

### `decisions-write`
```typescript
// Permission: astrolabe:write
// Params: { planId: z.string(), decisions: z.array(DecisionSchema) }
// Handler: patches plan.decisions + updatedAt
```

### `observations-write`
```typescript
// Permission: astrolabe:write
// Params: { planId: z.string(), observations: z.string() }
// Handler: patches plan.observations + updatedAt
```

### `spec-write`
```typescript
// Permission: astrolabe:write
// Params: { planId: z.string(), spec: z.string() }
// Handler: patches plan.spec + updatedAt
```

All tools access stacks via `guild().apparatus<StacksApi>('stacks')`.
All write tools call `book.patch(planId, { field: value, updatedAt: new Date().toISOString() })`.
`plan-show` calls `book.get(planId)` and throws if null.
`plan-list` calls `book.find({ where: [...], orderBy: ['createdAt', 'desc'], limit })`.

---

## Configuration

```typescript
interface AstrolabeConfig {
  generatedWritType?: string;  // default: 'mandate'
}

// GuildConfig module augmentation:
declare module '@shardworks/nexus-core' {
  interface GuildConfig {
    astrolabe?: AstrolabeConfig;
  }
}
```

The `generatedWritType` is used by the spec-writer engine (and the `spec-write` tool or a separate tool) when posting the generated writ to the Clerk. MVP Part 1 does not implement the spec-writer engine's posting logic (that's the `anima-session` engine's job via tool calls), but the configuration field is declared.

---

## Adjacent Pattern: Comparable Plugin Implementations

### `packages/plugins/clerk/src/clerk.ts`

Pattern for apparatus with `supportKit.writTypes`:
```typescript
// Clerk is the CONSUMER of writTypes. Astrolabe CONTRIBUTES to it.
// In Astrolabe's supportKit:
supportKit: {
  writTypes: [{ name: 'brief', description: 'A patron brief triggering the planning pipeline' }],
  // ...
}
```

### `packages/plugins/spider/src/spider.ts`

Pattern for apparatus contributing engines + rig templates:
```typescript
supportKit: {
  engines: {
    'draft': draftEngine,
    'seal': sealEngine,
    // ...
  },
  // Spider doesn't contribute its OWN templates; it consumes them.
  // Astrolabe contributes to Spider.
}
```

For `rigTemplates` contribution shape — from SpiderKit interface:
```typescript
export interface SpiderKit {
  rigTemplates?: Record<string, RigTemplate>;
  rigTemplateMappings?: Record<string, string>;
}
```
The keys in `rigTemplates` are UNQUALIFIED names. Spider qualifies them as `pluginId.templateName` when registering.
The values in `rigTemplateMappings` map writ type names (unqualified) to template names (the QUALIFIED name `pluginId.templateName` after registration).

**Critical:** The mapping value must reference the qualified template name after registration. From `RigTemplateRegistry.registerKitMappings`:
```typescript
this.kitMappings.set(writType, templateName);
// templateName is whatever the kit contributed as the value
```
Then in `validateDeferredMappings`:
```typescript
if (!this.templates.has(templateName)) { ... }
```
So the mapping value must be the qualified name (`astrolabe.planning`) since that's how the template gets stored in `this.templates`.

### `packages/plugins/loom/src/loom.ts`

Role qualification pattern:
```typescript
const qualifiedName = `${pluginId}.${roleName}`;
// → 'astrolabe.sage'
```
Validation: permissions must reference plugins in `requires`/`recommends` of the contributing plugin, plus the plugin itself. So `astrolabe.sage` can grant `astrolabe:read`, `astrolabe:write`, `clerk:write` (since clerk is in astrolabe's requires), `stacks:read/write`, etc.

---

## `consumes` Field

The `consumes` field on an apparatus declaration tells Arbor which kit contribution types this apparatus reads. The Astrolabe apparatus itself does not read any kit contributions (it contributes to other apparatuses; those apparatuses declare their own `consumes`). So:

```typescript
apparatus: {
  requires: ['stacks', 'clerk', 'spider', 'loom', 'fabricator'],
  // consumes: [] or omit entirely
  supportKit: { ... },
  provides: api,
  start(ctx) { ... }
}
```

---

## Kit Template Validation: designId Scope

From `RigTemplateRegistry.validateKitTemplate()`:

```typescript
const allowedPlugins = new Set<string>([
  pluginId,          // 'astrolabe'
  ...requires,       // ['stacks', 'clerk', 'spider', 'loom', 'fabricator']
  ...recommends,     // []
  'spider',          // always added — spider built-ins always allowed
]);
```

For each engine's `designId`, the template validation looks up `this.designSourceMap.get(designId)` and checks if that plugin is in `allowedPlugins`.

- `'astrolabe.plan-init'` → sourcePlugin = `'astrolabe'` → in allowedPlugins ✓
- `'astrolabe.inventory-check'` → sourcePlugin = `'astrolabe'` → in allowedPlugins ✓
- `'astrolabe.decision-review'` → sourcePlugin = `'astrolabe'` → in allowedPlugins ✓
- `'anima-session'` → sourcePlugin = `'spider'` → always in allowedPlugins ✓
- `'draft'` → sourcePlugin = `'spider'` → always in allowedPlugins ✓
- `'seal'` → sourcePlugin = `'spider'` → always in allowedPlugins ✓

All valid. The astrolabe's engines must be contributed to the Fabricator (via `supportKit.engines`) BEFORE the Spider processes kit template contributions — the Wire phase guarantees both go into the snapshot before any `start()` runs, and Spider calls `rigTemplateRegistry.buildDesignSourceMap(ctx.kits('engines'))` at the start of its own `start()`.

---

## `anima-session` Engine Givens Validation

From `packages/plugins/spider/src/engines/anima-session.ts`:
```typescript
if (typeof givens.role !== 'string' || givens.role.length === 0) {
  throw new Error('anima-session engine requires a non-empty string "role" given.');
}
if (typeof givens.prompt !== 'string' || givens.prompt.length === 0) {
  throw new Error('anima-session engine requires a non-empty string "prompt" given.');
}
if (typeof givens.cwd !== 'string' || givens.cwd.length === 0) {
  throw new Error('anima-session engine requires a non-empty string "cwd" given.');
}
```

The `cwd` is resolved from `$yields.draft.path` at run time. `role` and `prompt` are static strings in the template. All three must be non-empty.

**Issue:** `conversationId` in the givens: when the template has `conversationId: '$yields.reader.conversationId'` for the analyst engine, and the reader session might not produce a conversationId (e.g. if the provider doesn't support conversation resumption), the yield ref resolves to `undefined` and the key is omitted from givens. This is correct behavior — the `anima-session` engine uses `...(givens.conversationId ? { ... } : {})` which handles undefined gracefully.

---

## Session Default Collect Yields

From Spider's `tryCollect()` (the generic default path):
```typescript
yields = {
  sessionId: session.id,
  sessionStatus: session.status,
  ...(session.output !== undefined ? { output: session.output } : {}),
  ...(session.conversationId !== undefined ? { conversationId: session.conversationId } : {}),
};
```

So `${yields.reader.conversationId}` resolves to the reader session's conversation ID if the provider returns one. This is the chaining mechanism.

---

## `InputRequestDoc` Creation (decision-review engine)

```typescript
// From spider/src/types.ts:
export interface InputRequestDoc {
  [key: string]: unknown;
  id: string;              // generateId('ir', 4)
  rigId: string;           // from context.rigId
  engineId: string;        // from context.engineId
  status: InputRequestStatus;   // 'pending'
  message?: string;
  questions: Record<string, QuestionSpec>;
  answers: Record<string, AnswerValue>;
  rejectionReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChoiceQuestionSpec {
  type: 'choice';
  label: string;
  details?: string;
  options: Record<string, string>;
  allowCustom: boolean;
}

export type ChoiceAnswer = { selected: string } | { custom: string };
```

The decision-review engine writes to `stacks.book<InputRequestDoc>('spider', 'input-requests')`. This book is declared in Spider's `supportKit.books` and is registered by Stacks at startup.

---

## PatronInput Block Type

```typescript
// Already registered by Spider:
const patronInputBlockType: BlockType = {
  id: 'patron-input',
  conditionSchema: z.object({ requestId: z.string() }),
  pollIntervalMs: 10_000,
  async check(condition) {
    const { requestId } = conditionSchema.parse(condition);
    const stacks = guild().apparatus<StacksApi>('stacks');
    const book = stacks.readBook<InputRequestDoc>('spider', 'input-requests');
    const doc = await book.get(requestId);
    if (doc === null) return { status: 'failed', reason: 'Input request not found' };
    if (doc.status === 'completed') return { status: 'cleared' };
    if (doc.status === 'rejected') return { status: 'failed', reason: doc.rejectionReason ?? 'Request rejected by patron' };
    return { status: 'pending' };
  },
};
```

The `decision-review` engine returns `{ status: 'blocked', blockType: 'patron-input', condition: { requestId } }` to trigger this block type. This block type is already in the Spider — astrolabe does not need to re-contribute it.

---

## package.json Shape (pattern from clerk)

```json
{
  "name": "@shardworks/astrolabe",
  "version": "0.0.0",
  "license": "ISC",
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "build": "tsc",
    "test": "node --disable-warning=ExperimentalWarning --experimental-transform-types --test 'src/**/*.test.ts'",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@shardworks/nexus-core": "workspace:*",
    "@shardworks/stacks-apparatus": "workspace:*",
    "@shardworks/tools-apparatus": "workspace:*",
    "@shardworks/clerk-apparatus": "workspace:*",
    "@shardworks/spider-apparatus": "workspace:*",
    "@shardworks/fabricator-apparatus": "workspace:*",
    "zod": "4.3.6"
  },
  "devDependencies": {
    "@types/node": "25.5.0"
  },
  "files": ["dist"],
  "publishConfig": {
    "exports": {
      ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" }
    }
  }
}
```

Note: `loom-apparatus` is NOT imported as a direct npm dependency. The Loom's role contribution interface (`LoomKit`) lives in the loom apparatus package, but the Astrolabe contributes roles via the `supportKit.roles` open record — no type import from loom is strictly required (can use a plain object). However, for type safety, importing `KitRoleDefinition` from `@shardworks/loom-apparatus` would be ideal. Since the Loom is in `requires`, it's a runtime dependency but adding it as an npm dep adds coupling. Looking at how other kits handle this: they typically use type-only imports for `satisfies` without requiring the consuming package as an npm dep. For MVP, a plain typed object for roles will work without importing from loom.

---

## tsconfig.json Shape

```json
{
  "extends": "../../../tsconfig.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"],
  "exclude": ["src/**/*.test.ts"]
}
```

Matches the pattern in `packages/plugins/clerk/tsconfig.json`.

---

## src/index.ts Shape

Pattern from `packages/plugins/clerk/src/index.ts`:
```typescript
export type {
  PlanDoc,
  ScopeItem,
  Decision,
  AstrolabeConfig,
  AstrolabeApi,
} from './types.ts';

export { createAstrolabe } from './astrolabe.ts';

export default createAstrolabe();
```

---

## src/astrolabe.ts Shape

The main apparatus factory. Follows the `createClerk()` / `createSpider()` factory pattern:

```typescript
export function createAstrolabe(): Plugin {
  let plansBook: Book<PlanDoc>;

  const api: AstrolabeApi = { ... };

  // Three clockwork engine designs (imported from engines/)
  // rig template + mapping (inline or imported)

  return {
    apparatus: {
      requires: ['stacks', 'clerk', 'spider', 'loom', 'fabricator'],
      consumes: [],          // astrolabe doesn't read kit contributions
      provides: api,
      supportKit: {
        books: {
          plans: {
            indexes: ['status', 'codex', 'createdAt'],
          },
        },
        engines: {
          'astrolabe.plan-init': planInitEngine,
          'astrolabe.inventory-check': inventoryCheckEngine,
          'astrolabe.decision-review': decisionReviewEngine,
        },
        writTypes: [
          { name: 'brief', description: 'A patron brief triggering the planning pipeline' },
        ],
        roles: {
          sage: {
            permissions: [
              'astrolabe:read',
              'astrolabe:write',
              'clerk:read',
              'clerk:write',
              'stacks:read',
            ],
          },
        },
        rigTemplates: {
          planning: planningTemplate,
        },
        rigTemplateMappings: {
          brief: 'astrolabe.planning',  // qualified name
        },
        tools: [
          planShowTool,
          planListTool,
          inventoryWriteTool,
          scopeWriteTool,
          decisionsWriteTool,
          observationsWriteTool,
          specWriteTool,
        ],
      },
      start(ctx: StartupContext): void {
        const stacks = guild().apparatus<StacksApi>('stacks');
        plansBook = stacks.book<PlanDoc>('astrolabe', 'plans');
      },
    },
  };
}
```

---

## src/types.ts Shape

```typescript
export interface PlanDoc {
  [key: string]: unknown;
  id: string;
  codex: string;
  status: 'reading' | 'analyzing' | 'reviewing' | 'writing' | 'completed' | 'failed';
  inventory?: string;
  observations?: string;
  scope?: ScopeItem[];
  decisions?: Decision[];
  spec?: string;
  generatedWritId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ScopeItem { ... }
export interface Decision { ... }

export interface AstrolabeConfig {
  generatedWritType?: string;
}

declare module '@shardworks/nexus-core' {
  interface GuildConfig {
    astrolabe?: AstrolabeConfig;
  }
}

// AstrolabeApi: runtime API via guild().apparatus<AstrolabeApi>('astrolabe')
export interface AstrolabeApi {
  // (probably empty or minimal — tools access the book directly)
}
```

---

## Engines Location and Import

Engines are clockwork (implement `EngineDesign` from `@shardworks/fabricator-apparatus`). They go in `src/engines/`:
- `src/engines/plan-init.ts` — exports `planInitEngine: EngineDesign`
- `src/engines/inventory-check.ts` — exports `inventoryCheckEngine: EngineDesign`
- `src/engines/decision-review.ts` — exports `decisionReviewEngine: EngineDesign`
- `src/engines/index.ts` — re-exports all three

The engines use `guild().apparatus<StacksApi>('stacks')` at runtime (not at module load time). They also use `generateId` from `@shardworks/nexus-core` (for `decision-review`'s InputRequestDoc id).

---

## Critical: Engine ID Namespacing

Engine IDs in the Fabricator registry must be globally unique. The Fabricator uses the engine `id` field as the key:

```typescript
// fabricator.ts — EngineRegistry:
private registerFromKit(kit: Record<string, unknown>, pluginId: string): void {
  const rawEngines = kit.engines;
  for (const value of Object.values(rawEngines)) {
    if (isEngineDesign(value)) {
      this.designs.set(value.id, value);
```

So the engine's `id` field value is what gets registered — NOT the key in the `engines` object. We need:
- `planInitEngine.id = 'astrolabe.plan-init'`
- `inventoryCheckEngine.id = 'astrolabe.inventory-check'`
- `decisionReviewEngine.id = 'astrolabe.decision-review'`

And in `supportKit.engines`:
```typescript
engines: {
  'plan-init': planInitEngine,       // key is just for organization; value.id matters
  'inventory-check': inventoryCheckEngine,
  'decision-review': decisionReviewEngine,
},
```

The Fabricator ignores the key; it uses `value.id`. The Spider's `buildDesignSourceMap` does:
```typescript
for (const entry of engineEntries) {
  this.registerEnginesFromKit(entry.pluginId, { engines: entry.value });
}
// registerEnginesFromKit: iterates Object.values(kit.engines) and uses value.id as the key
```

---

## AstrolabeApi

The Astrolabe doesn't necessarily need to expose a public API (tools access Stacks directly). But the `provides` field should exist for consistency. It could expose:
- Nothing (empty object) — tools work directly via stacks
- Or minimal helpers used by engines

Looking at how engines access the plans book: they need `guild().apparatus<StacksApi>('stacks').book<PlanDoc>('astrolabe', 'plans')`. This is fine — no AstrolabeApi needed by engines.

The `provides: api` pattern is still used (even if the api object is empty) for consistency and future extension.

---

## Existing Tests for Adjacent Code (patterns to follow)

- `packages/plugins/clerk/src/clerk.test.ts` — uses `setGuild`, `createStacksApparatus`, `MemoryBackend`, builds fake `Guild` object
- `packages/plugins/spider/src/input-request.test.ts` — same pattern, tests clockwork engines
- `packages/plugins/spider/src/spider.test.ts` — comprehensive rig execution tests

Test pattern:
```typescript
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setGuild, clearGuild, generateId } from '@shardworks/nexus-core';
import { createStacksApparatus } from '@shardworks/stacks-apparatus';
import { MemoryBackend } from '@shardworks/stacks-apparatus/testing';
```

---

## Doc/Code Discrepancies

1. **Architecture spec says `requires: [clerk, stacks, spider, loom, fabricator]`** (doc). The `loom` apparatus is not called in `start()` — only its kit consumption mechanism is used. Technically, loom could be `recommends`. However, the spec is authoritative for implementation purposes.

2. **`rigTemplateMappings` value must be qualified name.** The architecture spec says `brief → template mapping` but doesn't specify whether the mapping value should be the unqualified (`planning`) or qualified (`astrolabe.planning`) name. Code analysis of `RigTemplateRegistry.registerKitMappings` reveals templates are stored under qualified names, so mappings must also use qualified names. The value `'astrolabe.planning'` is correct.

3. **Prompt content for anima-session engines.** The architecture doc describes the rig template with `prompt` values for reader/analyst/spec-writer, but the actual prompt text content (what instructions the anima receives) is not specified — that's the `charter.md`/role instructions concern, and/or will be spelled out in Part 2. For MVP Part 1, the template must have non-empty `prompt` strings to pass `anima-session` engine validation.

4. **`planId` vs `writ.id`.** The spec says `planId = brief writ ID`. The `plan-init` engine receives the `writ` given (a `WritDoc`) and uses `writ.id` as the plan key. Downstream engines receive `planId` via `$yields.plan-init.planId`. This is consistent throughout.

5. **`plan-init` given: `writ` vs `writId`.** The `draft` engine uses `writ.codex` to know which codex to open. The `plan-init` engine also needs `writ.id` and `writ.codex`. Looking at how `draft` engine is configured: `givens: { writ: '$writ' }`. The `plan-init` engine should also receive `writ: '$writ'` so it can use `writ.codex` when creating the PlanDoc.

---

## Summary of Key Implementation Decisions (Pre-Analysis)

These are observations that will become decisions in the analyst pass:

1. **npm package name:** `@shardworks/astrolabe` (no `-apparatus` suffix, per spec)
2. **Apparatus provides API:** Empty or minimal — tools use Stacks directly. Apparatus still has `provides` field for consistency.
3. **Engine IDs:** Must be `astrolabe.plan-init`, `astrolabe.inventory-check`, `astrolabe.decision-review` (namespaced to avoid global conflicts in Fabricator registry).
4. **rigTemplateMappings value:** Must be the qualified name `astrolabe.planning` (not unqualified `planning`).
5. **Roles permissions:** What permissions does `astrolabe.sage` need? Minimally: `astrolabe:read`, `astrolabe:write`, `clerk:write` (to post the generated writ), `spider:write` (for input-request-answer? — no, that's patron-facing). The role permission analysis depends on what tools the anima needs during planning. `clerk:write` is needed so the spec-writer can post the generated mandate. `clerk:read` for writ-show.
6. **Prompt content:** For MVP, minimal static prompts in the template. Full prompt content (mode-specific instructions) is outside the scope of Part 1 per the brief ("8-step pipeline").
7. **AstrolabeApi interface:** Minimal/empty since tools go through Stacks directly.
8. **`plan-list` filter by `codex`:** Uses a where clause `['codex', '=', codex]`. The `codex` index is declared, making this efficient.
