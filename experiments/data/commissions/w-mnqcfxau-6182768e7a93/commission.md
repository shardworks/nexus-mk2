---
author: plan-writer
estimated_complexity: 8
---

# Astrolabe MVP, Part 1

## Summary

Implement the Astrolabe apparatus — a new plugin package that refines patron briefs into structured work specifications. This commission covers the full foundation: package scaffolding, the `astrolabe/plans` book with PlanDoc/ScopeItem/Decision types, 7 tools for reading and writing plan artifacts, 3 clockwork engine designs, kit contributions (brief writ type, sage role, 8-step rig template with mapping), and configuration.

## Current State

No Astrolabe package exists. The architecture spec lives at `docs/architecture/apparatus/astrolabe.md`. All integration points are ready:

- **Clerk** (`packages/plugins/clerk/src/clerk.ts`): Consumes `writTypes` kit contributions via `ctx.kits('writTypes')` in `start()`. Interface: `WritTypeEntry[]` with `{ name: string, description?: string }`.
- **Loom** (`packages/plugins/loom/src/loom.ts`): Consumes `roles` kit contributions via `ctx.kits('roles')`. Qualifies as `pluginId.roleName`. Interface: `KitRoleDefinition` with `{ permissions: string[], strict?: boolean, instructions?: string, instructionsFile?: string }`.
- **Fabricator** (`packages/plugins/fabricator/src/fabricator.ts`): Consumes `engines` kit contributions via `ctx.kits('engines')`. Stores by `value.id` field (not object key).
- **Spider** (`packages/plugins/spider/src/spider.ts`): Consumes `rigTemplates` and `rigTemplateMappings`. Qualifies template names as `pluginId.templateName`. Supports `${yields.*}` inline string interpolation in givens at run-time.
- **Stacks** (`packages/plugins/stacks/src/stacks.ts`): Consumes `books` kit contributions. Uses `entry.pluginId` as `ownerId`.

The Spider's `patron-input` block type already exists and checks `spider/input-requests` book status. The `anima-session` engine exists as a Spider built-in. The `draft` and `seal` engines exist as Spider built-ins.

## Requirements

- R1: A new package `@shardworks/astrolabe-apparatus` exists at `packages/plugins/astrolabe/` with correct package.json, tsconfig.json, and barrel export.
- R2: The package exports `PlanDoc`, `ScopeItem`, `Decision`, `PlanStatus`, `PlanFilters`, `AstrolabeConfig`, and `AstrolabeApi` types.
- R3: The apparatus declares `requires: ['stacks', 'clerk']`, `recommends: ['spider', 'loom', 'fabricator', 'oculus']`, and does not declare `consumes`.
- R4: The `supportKit.books` declares a `plans` book with indexes `['status', 'codex', 'createdAt']`.
- R5: The `supportKit.writTypes` contributes `[{ name: 'brief', description: 'A patron brief triggering the planning pipeline' }]`.
- R6: The `supportKit.roles` contributes a `sage` role with permissions `['astrolabe:read', 'astrolabe:write', 'clerk:read']`, `strict: true`, and an `instructionsFile` pointing to a markdown file in the package.
- R7: The `supportKit.engines` contributes three clockwork engine designs with IDs `astrolabe.plan-init`, `astrolabe.inventory-check`, and `astrolabe.decision-review`.
- R8: The `supportKit.rigTemplates` contributes a `planning` template with 8 engine steps, and `supportKit.rigTemplateMappings` maps `brief` to `astrolabe.planning`.
- R9: The `supportKit.tools` contributes all 7 tools: `plan-show`, `plan-list`, `inventory-write`, `scope-write`, `decisions-write`, `observations-write`, `spec-write`.
- R10: The `AstrolabeApi` exposes `show(planId)`, `list(filters?)`, and `patch(planId, fields)` methods.
- R11: The apparatus `provides` the `AstrolabeApi` object, populated during `start()`.
- R12: A `GuildConfig` module augmentation adds an optional `astrolabe?: AstrolabeConfig` section, with `generatedWritType` resolved lazily as `guild().guildConfig().astrolabe?.generatedWritType ?? 'mandate'`.
- R13: When `plan-init` runs, it creates a `PlanDoc` keyed by the brief writ ID, validates that `writ.codex` exists, checks no plan with that ID already exists, sets status to `'reading'`, and yields `{ planId }`.
- R14: When `inventory-check` runs, it reads the plan, validates that `inventory` is a non-empty string, and completes. If inventory is missing or empty, it throws.
- R15: When `decision-review` runs for the first time (PlanDoc status is `'analyzing'`), it maps each `Decision` to a `ChoiceQuestionSpec` and each `ScopeItem` to a `BooleanQuestionSpec`, creates an `InputRequestDoc` in the `spider/input-requests` book, sets PlanDoc status to `'reviewing'`, and returns a `blocked` result with block type `patron-input`. When the plan has no decisions and no scope items, it completes immediately with an empty `decisionSummary`.
- R16: When `decision-review` runs for the second time (PlanDoc status is `'reviewing'`), it reads the completed `InputRequestDoc`, reconciles decision answers (`selected`/`patronOverride`) and scope item inclusion back into the PlanDoc, sets status to `'writing'`, and yields `{ decisionSummary }` as human-readable markdown.
- R17: Each of the 5 write tools patches only its artifact field plus `updatedAt`. Tools do not transition the PlanDoc status.
- R18: `plan-show` returns the full `PlanDoc` and throws if not found. `plan-list` queries with optional `status`, `codex`, `limit`, and `offset` filters, ordered by `createdAt` descending.
- R19: All tools include an `instructions` string and use permission namespace `astrolabe:read` (read tools) or `astrolabe:write` (write tools).
- R20: The rig template's `anima-session` engine entries use `${yields.plan-init.planId}` inline interpolation in their prompt givens, and pass `writ: '${writ}'` to all three sessions.
- R21: The rig template's prompt givens are non-empty placeholder strings that will be refined in a later commission.
- R22: Tests cover tools (CRUD, error cases), engines (plan-init validation, inventory-check, decision-review two-pass flow), and supportKit shape, in separate test files.

## Design

### Type Changes

All new types — no modifications to existing packages.

**`packages/plugins/astrolabe/src/types.ts`:**

```typescript
import type { BookEntry } from '@shardworks/stacks-apparatus';

// ── Plan status ─────────────────────────────────────────────────────

export type PlanStatus = 'reading' | 'analyzing' | 'reviewing' | 'writing' | 'completed' | 'failed';

// ── Documents ───────────────────────────────────────────────────────

export interface PlanDoc {
  [key: string]: unknown;
  /** The brief writ ID — primary key. */
  id: string;
  /** The codex this plan targets. */
  codex: string;
  /** Planning status. */
  status: PlanStatus;

  // ── Reader output ─────────────────────────────────────────
  /** Codebase inventory: affected files, types, interfaces, patterns. */
  inventory?: string;

  // ── Analyst output ────────────────────────────────────────
  /** Analyst observations: refactoring opportunities, risks, conventions. */
  observations?: string;
  /** Scope items: what's in and what's out. */
  scope?: ScopeItem[];
  /** Architectural/design decisions with options and analysis. */
  decisions?: Decision[];

  // ── Spec-writer output ────────────────────────────────────
  /** The generated specification. */
  spec?: string;
  /** The writ ID of the generated mandate (or configured type). */
  generatedWritId?: string;

  createdAt: string;
  updatedAt: string;
}

export interface ScopeItem {
  id: string;
  description: string;
  rationale: string;
  included: boolean;
}

export interface Decision {
  id: string;
  scope: string[];
  question: string;
  context?: string;
  options: Record<string, string>;
  recommendation?: string;
  rationale?: string;
  selected?: string;
  patronOverride?: string;
}

// ── Filters ─────────────────────────────────────────────────────────

export interface PlanFilters {
  /** Filter by status. */
  status?: PlanStatus;
  /** Filter by codex name. */
  codex?: string;
  /** Maximum number of results (default: 20). */
  limit?: number;
  /** Number of results to skip. */
  offset?: number;
}

// ── Configuration ───────────────────────────────────────────────────

export interface AstrolabeConfig {
  /** The writ type posted by the spec-writer engine. Default: 'mandate'. */
  generatedWritType?: string;
}

declare module '@shardworks/nexus-core' {
  interface GuildConfig {
    astrolabe?: AstrolabeConfig;
  }
}

// ── API ─────────────────────────────────────────────────────────────

export interface AstrolabeApi {
  /** Show a plan by id. Throws if not found. */
  show(planId: string): Promise<PlanDoc>;
  /** List plans with optional filters, ordered by createdAt descending. */
  list(filters?: PlanFilters): Promise<PlanDoc[]>;
  /** Partially update a plan. Returns the updated document. Throws if not found. */
  patch(planId: string, fields: Partial<Omit<PlanDoc, 'id'>>): Promise<PlanDoc>;
}
```

### Behavior

#### Package scaffolding

**`package.json`** follows the `@shardworks/clerk-apparatus` pattern:

```json
{
  "name": "@shardworks/astrolabe-apparatus",
  "version": "0.0.0",
  "license": "ISC",
  "repository": {
    "type": "git",
    "url": "https://github.com/shardworks/nexus",
    "directory": "packages/plugins/astrolabe"
  },
  "description": "The Astrolabe — brief-to-specification planning apparatus",
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
    "@shardworks/loom-apparatus": "workspace:*",
    "zod": "4.3.6"
  },
  "devDependencies": {
    "@types/node": "25.5.0"
  },
  "files": ["dist"],
  "publishConfig": {
    "exports": {
      ".": {
        "types": "./dist/index.d.ts",
        "import": "./dist/index.js"
      }
    }
  }
}
```

Note: `@shardworks/loom-apparatus` is included as an npm dependency for type-safe role definitions via `satisfies`.

**`tsconfig.json`** extends root config:

```json
{
  "extends": "../../../tsconfig.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src"],
  "exclude": ["src/**/*.test.ts"]
}
```

**`src/index.ts`** barrel:

```typescript
export type {
  PlanDoc,
  ScopeItem,
  Decision,
  PlanStatus,
  PlanFilters,
  AstrolabeConfig,
  AstrolabeApi,
} from './types.ts';

export { createAstrolabe } from './astrolabe.ts';

export default createAstrolabe();
```

#### Apparatus factory (`src/astrolabe.ts`)

The `createAstrolabe()` factory function follows the `createClerk()` pattern:

- A closure variable `let plansBook: Book<PlanDoc>` is assigned in `start()`.
- The `AstrolabeApi` object is created at factory scope and populated — `show` calls `plansBook.get()` and throws if null, `list` calls `plansBook.find()` with optional where clauses, `patch` calls `plansBook.patch()`.
- Engine factory functions from `src/engines/` are called with a book accessor `() => plansBook`, returning `EngineDesign` objects.
- Tools from `src/tools/` are imported and reference the closure variable.
- The rig template and mapping are defined inline.

```typescript
apparatus: {
  requires: ['stacks', 'clerk'],
  recommends: ['spider', 'loom', 'fabricator', 'oculus'],

  supportKit: {
    books: {
      plans: { indexes: ['status', 'codex', 'createdAt'] },
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
        permissions: ['astrolabe:read', 'astrolabe:write', 'clerk:read'],
        strict: true,
        instructionsFile: 'src/sage.md',
      },
    } satisfies Record<string, KitRoleDefinition>,
    rigTemplates: {
      planning: planningTemplate,
    },
    rigTemplateMappings: {
      brief: 'astrolabe.planning',
    },
    tools: [ /* all 7 tools */ ],
  },

  provides: api,

  start(ctx: StartupContext): void {
    const stacks = guild().apparatus<StacksApi>('stacks');
    plansBook = stacks.book<PlanDoc>('astrolabe', 'plans');
  },
}
```

The `satisfies Record<string, KitRoleDefinition>` assertion uses the type imported from `@shardworks/loom-apparatus`.

#### Role instructions file (`src/sage.md`)

A minimal placeholder markdown file:

```markdown
You are the Astrolabe sage — a planning anima that refines patron briefs into structured specifications.
```

This file is referenced by `instructionsFile: 'src/sage.md'` in the role definition. The Loom resolves it relative to the package root at `node_modules/@shardworks/astrolabe-apparatus/src/sage.md`. The content is a placeholder to be refined in a later commission.

#### Engine designs (`src/engines/`)

Engine files export factory functions that receive a book accessor and return `EngineDesign` objects.

**`src/engines/plan-init.ts`** — `createPlanInitEngine(getPlansBook: () => Book<PlanDoc>): EngineDesign`

- `id: 'astrolabe.plan-init'`
- Receives `givens.writ` (a `WritDoc`).
- When `writ.codex` is undefined or empty, throws: `'Writ "${writ.id}" has no codex — cannot create a plan.'`
- When a plan with `writ.id` already exists (via `book.get(writ.id)`), throws: `'Plan "${writ.id}" already exists.'`
- Creates a `PlanDoc` with `{ id: writ.id, codex: writ.codex, status: 'reading', createdAt: now, updatedAt: now }` via `book.put()`.
- Returns `{ status: 'completed', yields: { planId: writ.id } }`.

**`src/engines/inventory-check.ts`** — `createInventoryCheckEngine(getPlansBook: () => Book<PlanDoc>): EngineDesign`

- `id: 'astrolabe.inventory-check'`
- Receives `givens.planId` (string).
- Reads the plan via `book.get(planId)`. Throws if not found.
- Validates `typeof plan.inventory === 'string' && plan.inventory.length > 0`. Throws if not: `'Plan "${planId}" has no inventory — reader stage did not produce output.'`
- Returns `{ status: 'completed', yields: {} }`.

**`src/engines/decision-review.ts`** — `createDecisionReviewEngine(getPlansBook: () => Book<PlanDoc>): EngineDesign`

- `id: 'astrolabe.decision-review'`
- Receives `givens.planId` (string).
- Reads the plan. Throws if not found.

**First-run detection:** Check `plan.status === 'analyzing'` (vs `'reviewing'` for re-run).

**First run (status is `'analyzing'`):**

1. If `plan.decisions` is empty/undefined AND `plan.scope` is empty/undefined:
   - Patch plan status to `'writing'`, return `{ status: 'completed', yields: { decisionSummary: '' } }`.

2. Build the `InputRequestDoc`:
   - `id`: `generateId('ir', 4)`
   - `rigId`: `context.rigId`
   - `engineId`: `context.engineId`
   - `status`: `'pending'`
   - `message`: Compose from plan data — include the writ title (read via `guild().apparatus<ClerkApi>('clerk').show(planId)` since planId === writId), codex, and a summary of included scope items.
   - `questions`: Map each `Decision` to a `ChoiceQuestionSpec`:
     ```
     key: decision.id
     value: {
       type: 'choice',
       label: decision.question,
       details: composeDetails(decision.context, decision.rationale),
       options: decision.options,
       allowCustom: true,
     }
     ```
     Where `composeDetails` concatenates context and rationale:
     - When both present: `context + '\n\nRecommendation rationale: ' + rationale`
     - When only context: `context`
     - When only rationale: `'Recommendation rationale: ' + rationale`
     - When neither: `undefined`

     Map each `ScopeItem` to a `BooleanQuestionSpec`:
     ```
     key: 'scope:' + scopeItem.id   (namespaced to avoid collision with decision IDs)
     value: {
       type: 'boolean',
       label: scopeItem.description,
       details: scopeItem.rationale,
     }
     ```
   - `answers`: Pre-fill decision recommendations:
     ```
     For each decision with a recommendation:
       answers[decision.id] = { selected: decision.recommendation }
     For each scope item:
       answers['scope:' + scopeItem.id] = scopeItem.included
     ```
   - `createdAt`, `updatedAt`: current ISO timestamp.

3. Write the `InputRequestDoc` to `guild().apparatus<StacksApi>('stacks').book<InputRequestDoc>('spider', 'input-requests')`.
4. Patch plan status to `'reviewing'`.
5. Return `{ status: 'blocked', blockType: 'patron-input', condition: { requestId } }`.

**Re-run (status is `'reviewing'`):**

1. Extract the `requestId` from `context.priorBlock.condition` (cast to `{ requestId: string }`). If `priorBlock` is not available, derive the request ID by querying the `spider/input-requests` book for `rigId === context.rigId` and `engineId === context.engineId`.
2. Read the `InputRequestDoc`.
3. Reconcile answers back into the plan:
   - For each decision answer: if `{ selected: key }`, set `decision.selected = key`. If `{ custom: text }`, set `decision.patronOverride = text`.
   - For each scope item answer (keys starting with `'scope:'`): set `scopeItem.included = booleanValue`.
4. Build `decisionSummary` — a human-readable markdown string:
   ```markdown
   ## Decisions

   ### D1: {question}
   **Selected:** {selected option description}
   {if patronOverride: **Patron override:** {patronOverride}}

   ### D2: {question}
   ...

   ## Scope

   - [x] S1: {description}
   - [ ] S2: {description} (excluded)
   ```
5. Patch the plan with reconciled decisions, scope, status `'writing'`, and `updatedAt`.
6. Return `{ status: 'completed', yields: { decisionSummary } }`.

**`src/engines/index.ts`** — re-exports all three factory functions.

#### Tools (`src/tools/`)

All tools import `guild` from `@shardworks/nexus-core`, `tool` and `z` from `@shardworks/tools-apparatus` / `zod`. Write tools access the plans book via a closure variable reference passed from the apparatus factory. Each tool file exports a function that receives the book accessor and returns a `ToolDefinition`.

Alternative approach: tools can be defined inside the `createAstrolabe()` factory function body (like the Clerk's `writTypesTool`), giving them direct access to the `plansBook` closure variable. Since the tools reference a closure variable, they must be defined or configured within the factory scope.

**Practical approach:** Define the tool definitions inside `createAstrolabe()`, grouped after the closure variable declarations. This matches how the Clerk defines `writTypesTool` inline. The tools are simple enough that separate files provide organization without requiring a factory pattern per tool.

If tools are in separate files, each file exports a factory function:
```typescript
export function createPlanShowTool(getPlansBook: () => Book<PlanDoc>): ToolDefinition { ... }
```

**`plan-show`:**
```typescript
tool({
  name: 'plan-show',
  description: 'Show full detail for a plan',
  instructions: 'Returns the complete plan document including inventory, scope, decisions, observations, and spec fields. The planId is the brief writ ID.',
  params: { planId: z.string().describe('Plan id (same as the brief writ id)') },
  permission: 'astrolabe:read',
  handler: async ({ planId }) => {
    const plan = await getPlansBook().get(planId);
    if (!plan) throw new Error(`Plan "${planId}" not found.`);
    return plan;
  },
})
```

**`plan-list`:**
```typescript
tool({
  name: 'plan-list',
  description: 'List plans with optional filters',
  instructions: 'Returns plan summaries ordered by createdAt descending (newest first). Filter by status or codex to narrow results.',
  params: {
    status: z.enum(['reading', 'analyzing', 'reviewing', 'writing', 'completed', 'failed']).optional().describe('Filter by plan status'),
    codex: z.string().optional().describe('Filter by codex name'),
    limit: z.number().optional().default(20).describe('Maximum results (default: 20)'),
    offset: z.number().optional().describe('Number of results to skip'),
  },
  permission: 'astrolabe:read',
  handler: async (params) => {
    const where: WhereClause = [];
    if (params.status) where.push(['status', '=', params.status]);
    if (params.codex) where.push(['codex', '=', params.codex]);
    return getPlansBook().find({
      where: where.length > 0 ? where : undefined,
      orderBy: ['createdAt', 'desc'],
      limit: params.limit,
      ...(params.offset !== undefined ? { offset: params.offset } : {}),
    });
  },
})
```

**`inventory-write`:**
```typescript
tool({
  name: 'inventory-write',
  description: 'Write the codebase inventory for a plan',
  instructions: 'Writes or replaces the inventory field on the plan. The inventory should be a markdown document describing affected files, types, interfaces, and patterns.',
  params: {
    planId: z.string().describe('Plan id'),
    inventory: z.string().describe('Inventory content (markdown)'),
  },
  permission: 'astrolabe:write',
  handler: async ({ planId, inventory }) => {
    return getPlansBook().patch(planId, { inventory, updatedAt: new Date().toISOString() });
  },
})
```

**`scope-write`:**
```typescript
tool({
  name: 'scope-write',
  description: 'Write or replace the scope items for a plan',
  instructions: 'Writes the full scope array. Each scope item has an id, description, rationale, and included flag.',
  params: {
    planId: z.string().describe('Plan id'),
    scope: z.array(z.object({
      id: z.string(),
      description: z.string(),
      rationale: z.string(),
      included: z.boolean(),
    })).describe('Scope items'),
  },
  permission: 'astrolabe:write',
  handler: async ({ planId, scope }) => {
    return getPlansBook().patch(planId, { scope, updatedAt: new Date().toISOString() });
  },
})
```

**`decisions-write`:**
```typescript
tool({
  name: 'decisions-write',
  description: 'Write or replace the decisions for a plan',
  instructions: 'Writes the full decisions array. Each decision has an id, scope references, question, options, and optional recommendation/rationale fields.',
  params: {
    planId: z.string().describe('Plan id'),
    decisions: z.array(z.object({
      id: z.string(),
      scope: z.array(z.string()),
      question: z.string(),
      context: z.string().optional(),
      options: z.record(z.string(), z.string()),
      recommendation: z.string().optional(),
      rationale: z.string().optional(),
      selected: z.string().optional(),
      patronOverride: z.string().optional(),
    })).describe('Decision items'),
  },
  permission: 'astrolabe:write',
  handler: async ({ planId, decisions }) => {
    return getPlansBook().patch(planId, { decisions, updatedAt: new Date().toISOString() });
  },
})
```

**`observations-write`:**
```typescript
tool({
  name: 'observations-write',
  description: 'Write analyst observations for a plan',
  instructions: 'Writes or replaces the observations field. The observations should be a markdown document noting refactoring opportunities, risks, and conventions.',
  params: {
    planId: z.string().describe('Plan id'),
    observations: z.string().describe('Observations content (markdown)'),
  },
  permission: 'astrolabe:write',
  handler: async ({ planId, observations }) => {
    return getPlansBook().patch(planId, { observations, updatedAt: new Date().toISOString() });
  },
})
```

**`spec-write`:**
```typescript
tool({
  name: 'spec-write',
  description: 'Write the generated specification for a plan',
  instructions: 'Writes or replaces the spec field. The spec should be a markdown document containing the implementation specification.',
  params: {
    planId: z.string().describe('Plan id'),
    spec: z.string().describe('Specification content (markdown)'),
  },
  permission: 'astrolabe:write',
  handler: async ({ planId, spec }) => {
    return getPlansBook().patch(planId, { spec, updatedAt: new Date().toISOString() });
  },
})
```

Write tools do NOT update PlanDoc status — status transitions are the exclusive responsibility of the clockwork engines.

#### Rig template

The planning template uses `${yields.*}` inline interpolation for planId delivery:

```typescript
const planningTemplate: RigTemplate = {
  engines: [
    {
      id: 'plan-init',
      designId: 'astrolabe.plan-init',
      upstream: [],
      givens: { writ: '${writ}' },
    },
    {
      id: 'draft',
      designId: 'draft',
      upstream: ['plan-init'],
      givens: { writ: '${writ}' },
    },
    {
      id: 'reader',
      designId: 'anima-session',
      upstream: ['draft'],
      givens: {
        role: 'astrolabe.sage',
        prompt: 'MODE: READER\n\nPlan ID: ${yields.plan-init.planId}\n\nYou are beginning a new planning session. Use plan-show to read the plan, then inventory the codebase and write the inventory using inventory-write.',
        cwd: '${yields.draft.path}',
        writ: '${writ}',
      },
    },
    {
      id: 'inventory-check',
      designId: 'astrolabe.inventory-check',
      upstream: ['reader'],
      givens: {
        planId: '${yields.plan-init.planId}',
      },
    },
    {
      id: 'analyst',
      designId: 'anima-session',
      upstream: ['inventory-check'],
      givens: {
        role: 'astrolabe.sage',
        prompt: 'MODE: ANALYST\n\nPlan ID: ${yields.plan-init.planId}\n\nYou are continuing the reader conversation. Use plan-show to read the current plan state, then produce scope, decisions, and observations using the write tools.',
        cwd: '${yields.draft.path}',
        conversationId: '${yields.reader.conversationId}',
        writ: '${writ}',
      },
    },
    {
      id: 'decision-review',
      designId: 'astrolabe.decision-review',
      upstream: ['analyst'],
      givens: {
        planId: '${yields.plan-init.planId}',
      },
    },
    {
      id: 'spec-writer',
      designId: 'anima-session',
      upstream: ['decision-review'],
      givens: {
        role: 'astrolabe.sage',
        prompt: 'MODE: WRITER\n\nPlan ID: ${yields.plan-init.planId}\n\nYou are continuing the analyst conversation. Use plan-show to read the full plan including patron-reviewed decisions, then write the specification using spec-write.',
        cwd: '${yields.draft.path}',
        conversationId: '${yields.analyst.conversationId}',
        writ: '${writ}',
      },
    },
    {
      id: 'seal',
      designId: 'seal',
      upstream: ['spec-writer'],
      givens: { abandon: true },
    },
  ],
  resolutionEngine: 'spec-writer',
};
```

Key wiring details:
- `${writ}` is resolved at spawn time to the full `WritDoc` object (whole-value mode).
- `${yields.plan-init.planId}` is resolved at run-time to the planId string. When used inline within a prompt string, the Spider's inline interpolation embeds the value in the string.
- `${yields.draft.path}` is resolved at run-time to the draft worktree path.
- `${yields.reader.conversationId}` and `${yields.analyst.conversationId}` chain conversations. If the provider doesn't produce a conversationId, the yield resolves to undefined and the key is omitted (anima-session handles this gracefully).
- Prompts are placeholder strings. Each begins with `MODE: <STAGE>` for future prompt differentiation. The planId is embedded inline so the anima knows which plan to operate on. Prompt content will be refined in a later commission.
- `resolutionEngine: 'spec-writer'` is set so the rig's completion summary comes from the spec-writer session (not the seal engine's `{ abandoned: true }`).

#### Configuration

The `generatedWritType` config field is declared in `AstrolabeConfig` and augmented onto `GuildConfig`. It is resolved lazily at invocation time:

```typescript
const writType = guild().guildConfig().astrolabe?.generatedWritType ?? 'mandate';
```

No value is cached at `start()` time.

### Non-obvious Touchpoints

- **pnpm workspace**: The new package at `packages/plugins/astrolabe/` must be recognized by the pnpm workspace. Verify that the workspace `packages` glob in `pnpm-workspace.yaml` (or equivalent) covers `packages/plugins/*`.
- **Engine key vs id**: The `supportKit.engines` object keys should match the engine design's `id` field (e.g. key `'astrolabe.plan-init'` for engine with `id: 'astrolabe.plan-init'`). The Fabricator uses `value.id`, not the key — but matching them prevents confusion.
- **Sage role instructionsFile path**: The Loom resolves `instructionsFile` as `path.join(home, 'node_modules', packageName, instructionsFile)`. The `instructionsFile` value in the role definition must be relative to the package root. Since the package's published files include `dist/` and the file lives at `src/sage.md`, add `"src/sage.md"` to the package.json `files` array — or move the file to a top-level location like `sage.md` and reference it as `'sage.md'`. The simplest approach: place the file at `packages/plugins/astrolabe/sage.md`, reference it as `'sage.md'`, and add `"sage.md"` to the `files` array in package.json.
- **InputRequestDoc import**: The `decision-review` engine imports `InputRequestDoc`, `ChoiceQuestionSpec`, `BooleanQuestionSpec`, and `AnswerValue` from `@shardworks/spider-apparatus`. These types are re-exported from `packages/plugins/spider/src/index.ts`.
- **Scope question key namespacing**: Scope items in the InputRequestDoc use keys prefixed with `'scope:'` (e.g. `'scope:S1'`) to avoid collision with decision IDs (e.g. `'D1'`). The reconciliation logic must split on this prefix to distinguish scope answers from decision answers.

## Validation Checklist

- V1 [R1]: Run `pnpm install` at repo root. Verify `packages/plugins/astrolabe/` is linked into the workspace. Run `cd packages/plugins/astrolabe && pnpm typecheck` — must pass with no errors.
- V2 [R2, R9]: Verify `PlanDoc`, `ScopeItem`, `Decision`, `PlanStatus`, `PlanFilters`, `AstrolabeConfig`, `AstrolabeApi` are all exported from `@shardworks/astrolabe-apparatus` barrel.
- V3 [R3]: Inspect the apparatus declaration. Verify `requires` is exactly `['stacks', 'clerk']`, `recommends` is `['spider', 'loom', 'fabricator', 'oculus']`, and no `consumes` field is present.
- V4 [R4]: Verify `supportKit.books.plans.indexes` is `['status', 'codex', 'createdAt']`.
- V5 [R5]: Verify `supportKit.writTypes` contains exactly `[{ name: 'brief', description: 'A patron brief triggering the planning pipeline' }]`.
- V6 [R6]: Verify `supportKit.roles.sage` has `permissions: ['astrolabe:read', 'astrolabe:write', 'clerk:read']`, `strict: true`, and `instructionsFile` pointing to an existing file. Verify the file exists and contains non-empty markdown.
- V7 [R7]: Verify `supportKit.engines` contains keys for all three engine designs. Verify each engine's `id` property matches `'astrolabe.plan-init'`, `'astrolabe.inventory-check'`, `'astrolabe.decision-review'`.
- V8 [R8]: Verify `supportKit.rigTemplates.planning` has 8 engines in the correct order: plan-init, draft, reader, inventory-check, analyst, decision-review, spec-writer, seal. Verify `supportKit.rigTemplateMappings` maps `'brief'` to `'astrolabe.planning'`. Verify `resolutionEngine` is `'spec-writer'`.
- V9 [R9, R19]: Verify all 7 tools are in `supportKit.tools`. For each tool, verify it has a non-empty `instructions` string, and uses `astrolabe:read` or `astrolabe:write` permission as appropriate.
- V10 [R10, R11]: Call `api.show('nonexistent')` — must throw. Call `api.list()` — must return empty array. Call `api.patch('nonexistent', {})` — must throw (from Stacks).
- V11 [R12]: Verify `guild().guildConfig().astrolabe` is typed as `AstrolabeConfig | undefined` (module augmentation works).
- V12 [R13]: In tests, call `plan-init` with a writ that has no codex — must throw with a message containing "no codex". Call with a valid writ — must create a PlanDoc with status `'reading'`. Call again with the same writ ID — must throw with "already exists".
- V13 [R14]: In tests, call `inventory-check` on a plan with no inventory — must throw. Set inventory to empty string — must throw. Set inventory to non-empty string — must complete.
- V14 [R15, R16]: In tests, set up a plan with decisions and scope items. Call `decision-review` (first run, status `'analyzing'`) — must create an InputRequestDoc, set plan status to `'reviewing'`, return blocked. Simulate patron answering. Call `decision-review` again (re-run, status `'reviewing'`) — must reconcile answers, set status to `'writing'`, return completed with decisionSummary.
- V15 [R15]: In tests, call `decision-review` on a plan with no decisions and no scope — must complete immediately with empty decisionSummary and set status to `'writing'`.
- V16 [R17]: In tests, call `inventory-write` — verify only `inventory` and `updatedAt` fields change. Verify `status` is unchanged.
- V17 [R18]: In tests, call `plan-list` with status filter — verify only matching plans returned. Call with codex filter — verify only matching plans returned. Verify ordering is createdAt descending.
- V18 [R20, R21]: Inspect the rig template. Verify `reader`, `analyst`, and `spec-writer` engines all have `writ: '${writ}'` and a non-empty prompt containing `${yields.plan-init.planId}`. Verify `reader` has no `conversationId`, `analyst` has `conversationId: '${yields.reader.conversationId}'`, and `spec-writer` has `conversationId: '${yields.analyst.conversationId}'`.
- V19 [R22]: Run `pnpm --filter @shardworks/astrolabe-apparatus test` — all tests pass.

## Test Cases

### Tools

- **plan-show happy path**: Create a plan via direct book.put(), call plan-show — returns the full PlanDoc.
- **plan-show not found**: Call plan-show with nonexistent ID — throws error containing "not found".
- **plan-list empty**: Call plan-list with no plans — returns empty array.
- **plan-list with filters**: Create plans with different statuses and codexes. Filter by status — only matching plans returned. Filter by codex — only matching plans returned. Verify ordering is createdAt descending.
- **plan-list pagination**: Create 5 plans. Call with limit=2 — returns 2. Call with limit=2, offset=2 — returns next 2.
- **inventory-write**: Create a plan, call inventory-write — plan's inventory field is updated, updatedAt changes, status unchanged.
- **scope-write**: Call scope-write with valid ScopeItem array — plan's scope field updated.
- **decisions-write**: Call decisions-write with full Decision array including optional fields — plan's decisions field updated.
- **observations-write**: Call observations-write — plan's observations field updated.
- **spec-write**: Call spec-write — plan's spec field updated.
- **write tool on missing plan**: Call any write tool with nonexistent planId — throws (from Stacks.patch).

### Engines

- **plan-init creates plan**: Run with valid writ (has codex) — creates PlanDoc with status 'reading', yields `{ planId: writ.id }`.
- **plan-init rejects missing codex**: Run with writ without codex — throws error mentioning "codex".
- **plan-init rejects duplicate**: Run twice with same writ ID — second call throws "already exists".
- **inventory-check passes**: Plan has non-empty inventory — completes with empty yields.
- **inventory-check fails on missing**: Plan has no inventory field — throws.
- **inventory-check fails on empty**: Plan has `inventory: ''` — throws.
- **decision-review first run with decisions**: Plan at status 'analyzing' with decisions and scope items — creates InputRequestDoc with correct questions, pre-fills answers, sets status to 'reviewing', returns blocked.
- **decision-review first run empty**: Plan at status 'analyzing' with no decisions and no scope — completes immediately, sets status to 'writing', yields empty decisionSummary.
- **decision-review re-run**: Plan at status 'reviewing', InputRequestDoc completed — reconciles answers back to plan (decision.selected, scopeItem.included), sets status to 'writing', yields markdown decisionSummary.
- **decision-review reconciles patron override**: InputRequestDoc has a custom answer `{ custom: 'text' }` — sets `patronOverride` on the decision.
- **decision-review scope reconciliation**: Scope items with boolean answers — updates `included` field on the corresponding ScopeItem.
- **decision-review details composition**: Decision with both context and rationale — details contains both separated by the prescribed format. Decision with only context — details is just context. Decision with neither — details is undefined.