# Promote MRA Pipeline to Default and Split Sage Role

## Summary

Replace the `planning`/`planning-mra` rig templates with `two-phase-planning` (default) and `three-phase-planning`, split the monolithic `sage` role into four job-specific roles, simplify anima-session prompts to thin runtime shims, remove cross-session `conversationId` reuse, and update all tests and documentation.

## Current State

**`packages/plugins/astrolabe/src/astrolabe.ts`** — Main plugin factory. Contains:
- An inline `planningTemplate: RigTemplate` with 9 engines (plan-init, draft, reader, inventory-check, analyst, decision-review, spec-writer, spec-publish, seal). The three anima-session stages (`reader`, `analyst`, `spec-writer`) all use `role: 'astrolabe.sage'`, verbose prompts with `MODE:` headers, and `conversationId` chaining from upstream stages.
- Import of `planningMraTemplate` from `./planning-mra.ts`.
- `supportKit.writTypes`: `['brief', 'brief-mra']`.
- `supportKit.roles`: single `sage` role with `permissions: ['astrolabe:read', 'astrolabe:write', 'clerk:read']`, `strict: true`, `instructionsFile: 'sage.md'`.
- `supportKit.rigTemplates`: `{ planning: planningTemplate, 'planning-mra': planningMraTemplate }`.
- `supportKit.rigTemplateMappings`: `{ brief: 'astrolabe.planning', 'brief-mra': 'astrolabe.planning-mra' }`.

**`packages/plugins/astrolabe/src/planning-mra.ts`** — Exports `planningMraTemplate: RigTemplate` with 8 engines. The `reader-analyst` stage uses `role: 'astrolabe.sage'`, a long inline prompt with `MODE: READER-ANALYST`, and `metadata: { engineId: 'reader-analyst' }`. The `spec-writer` stage has `MODE: WRITER` in its prompt. No `conversationId` in either anima-session stage.

**`packages/plugins/astrolabe/sage.md`** — Single role file with mode-dispatch preamble ("You are a planning agent that operates in one of three modes"), shared Tools section listing all 7 tools, and three mode sections (READER, ANALYST, WRITER) plus a Finishing Your Work footer.

**`packages/plugins/astrolabe/src/supportkit.test.ts`** — Tests the supportKit shape: asserts single `sage` role, `planning` template with 9 engines, `brief → astrolabe.planning` mapping, `conversationId` chaining in analyst/spec-writer, and all 7 tools.

**`packages/plugins/astrolabe/src/planning-mra.test.ts`** — Tests `planning-mra` template registration, `brief-mra` writ type, `MODE: READER-ANALYST` in prompt, and `conversationId` absence.

**`packages/plugins/astrolabe/README.md`** — Documents both `brief` and `brief-mra` writ types, single `sage` role, both templates, but omits `spec-publish` from the engines table.

**`packages/plugins/astrolabe/package.json`** — `files` array includes `"sage.md"`.

## Requirements

- R1: The supportKit must register two rig templates keyed `'two-phase-planning'` and `'three-phase-planning'`. No template keyed `'planning'` or `'planning-mra'` may exist.
- R2: The `two-phase-planning` template must have exactly 8 engines in order: `plan-init`, `draft`, `reader-analyst`, `inventory-check`, `decision-review`, `spec-writer`, `spec-publish`, `seal`. The `three-phase-planning` template must have exactly 9 engines in order: `plan-init`, `draft`, `reader`, `inventory-check`, `analyst`, `decision-review`, `spec-writer`, `spec-publish`, `seal`.
- R3: Both templates must set `resolutionEngine: 'spec-writer'`.
- R4: The exported constant names must be `twoPhaseRigTemplate` and `threePhaseRigTemplate`.
- R5: Every `anima-session` stage in both templates must have `metadata: { engineId: '<stage-id>' }` where `<stage-id>` is the engine's `id` value.
- R6: No `anima-session` stage in either template may have a `conversationId` given.
- R7: All `anima-session` stages in both templates must have `writ: '${writ}'` and `cwd: '${yields.draft.path}'` givens.
- R8: Anima-session prompts must be thin runtime shims: no `MODE:` header, no job descriptions, no references to prior stages. The reader-analyst prompt is `'Plan ID: ${yields.plan-init.planId}'`. The reader prompt is `'Plan ID: ${yields.plan-init.planId}'`. The analyst prompt is `'Plan ID: ${yields.plan-init.planId}'`. The spec-writer prompt (in both templates) is `'Plan ID: ${yields.plan-init.planId}\n\nDecision summary:\n${yields.decision-review.decisionSummary}'`.
- R9: The two-phase-planning template's `reader-analyst` stage must use `role: 'astrolabe.sage-reading-analyst'`. The `spec-writer` stage must use `role: 'astrolabe.sage-writer'`.
- R10: The three-phase-planning template's `reader` stage must use `role: 'astrolabe.sage-reader'`, `analyst` must use `role: 'astrolabe.sage-analyst'`, `spec-writer` must use `role: 'astrolabe.sage-writer'`.
- R11: The supportKit must register four roles: `'sage-reader'`, `'sage-analyst'`, `'sage-writer'`, `'sage-reading-analyst'`. Each must have `permissions: ['astrolabe:read', 'astrolabe:write', 'clerk:read']`, `strict: true`, and an `instructionsFile` pointing to `'sage-reader.md'`, `'sage-analyst.md'`, `'sage-writer.md'`, `'sage-reading-analyst.md'` respectively. No role keyed `'sage'` may exist.
- R12: Each role file must be standalone — no mode-dispatch preamble, no `MODE:` references. The opening line must use the existing role description: "You are a codebase inventory agent." (reader), "You are a scope and decision analyst." (analyst), "You are a spec writer." (writer), "You are a codebase inventory agent and scope/decision analyst." or similar unified opening (reading-analyst).
- R13: Each role file's Tools section must list only the tools that role uses. Additionally, all role files must document the Clerk read tools (`writ-show`, `writ-list`, `writ-types`) available via `clerk:read` permission.
  - `sage-reader.md`: `plan-show`, `plan-list`, `inventory-write` + clerk read tools
  - `sage-analyst.md`: `plan-show`, `plan-list`, `scope-write`, `decisions-write`, `observations-write` + clerk read tools
  - `sage-writer.md`: `plan-show`, `plan-list`, `spec-write`, `observations-write` + clerk read tools
  - `sage-reading-analyst.md`: `plan-show`, `plan-list`, `inventory-write`, `scope-write`, `decisions-write`, `observations-write` + clerk read tools
- R14: Each role file's Finishing Your Work footer must list only the write tools relevant to that role:
  - reader: `inventory-write`
  - analyst: `scope-write`, `decisions-write`, `observations-write`
  - writer: `spec-write` (primary), `observations-write` (for gap reporting)
  - reading-analyst: `inventory-write`, `scope-write`, `decisions-write`, `observations-write`
- R15: The `sage-reading-analyst.md` file must have a single unified Process section with numbered steps that naturally interleave reading and analysis (not two bolted-together sections). Use the inline MRA prompt from `planning-mra.ts` as structural backbone.
- R16: The shared preamble content (boundary statement, file-reading tools mention) must be adapted for each role — same information but wording tuned to the specific role's job.
- R17: The supportKit must declare exactly one writ type: `{ name: 'brief', description: 'A patron brief triggering the planning pipeline' }`. No `brief-mra` writ type may exist.
- R18: The `rigTemplateMappings` must be `{ brief: 'astrolabe.two-phase-planning' }`. No `brief-mra` mapping may exist.
- R19: The `package.json` `files` array must include `'sage-reader.md'`, `'sage-analyst.md'`, `'sage-writer.md'`, `'sage-reading-analyst.md'` and must not include `'sage.md'`.
- R20: The README must document: single `brief` writ type; four roles with their qualified names and stage annotations; both templates with engine sequences; `spec-publish` in the engines table; a "Rig Template Selection" section showing the `spider.rigTemplateMappings` guild.json override path.
- R21: A new `two-phase-planning.test.ts` test file must assert: 8 engines in correct order, `resolutionEngine` is `spec-writer`, role assignments (`astrolabe.sage-reading-analyst`, `astrolabe.sage-writer`), prompts contain `planId` interpolation, spec-writer prompt contains `decisionSummary` interpolation, prompts do NOT contain `'MODE:'`, `reader-analyst` has `metadata.engineId`, `reader-analyst` has `writ` and `cwd` givens, no `conversationId` on any stage, all shared engines match `three-phase-planning` designIds.
- R22: A new `three-phase-planning.test.ts` test file must assert: 9 engines in correct order, `resolutionEngine` is `spec-writer`, role assignments (`astrolabe.sage-reader`, `astrolabe.sage-analyst`, `astrolabe.sage-writer`), prompts contain `planId` interpolation, spec-writer prompt contains `decisionSummary` interpolation, prompts do NOT contain `'MODE:'`, no `conversationId` on any stage, all anima-session stages have `metadata.engineId`, `writ`, and `cwd` givens.
- R23: The `supportkit.test.ts` must be updated to: assert four roles (sage-reader, sage-analyst, sage-writer, sage-reading-analyst) with correct permissions; assert templates keyed `two-phase-planning` and `three-phase-planning`; assert mapping `brief → astrolabe.two-phase-planning`; assert no `conversationId` given appears in any engine of either template; assert absence of old identifiers (`sage`, `planning-mra`, `brief-mra`, `astrolabe.sage`, `planning`) from roles, rigTemplates, rigTemplateMappings, and writTypes.
- R24: The files `planning-mra.ts`, `planning-mra.test.ts`, and `sage.md` must be deleted.

## Design

### Type Changes

No type changes. `RigTemplate`, `RigTemplateEngine`, `KitRoleDefinition`, and all `PlanDoc`-related types remain unchanged.

### Behavior

#### Template files

**`packages/plugins/astrolabe/src/two-phase-planning.ts`**

Create this file exporting `twoPhaseRigTemplate`. Module-level JSDoc: brief functional description only (what the template does, which stages it has).

```typescript
import type { RigTemplate } from '@shardworks/spider-apparatus';

export const twoPhaseRigTemplate: RigTemplate = {
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
      id: 'reader-analyst',
      designId: 'anima-session',
      upstream: ['draft'],
      givens: {
        role: 'astrolabe.sage-reading-analyst',
        prompt: 'Plan ID: ${yields.plan-init.planId}',
        cwd: '${yields.draft.path}',
        writ: '${writ}',
        metadata: { engineId: 'reader-analyst' },
      },
    },
    {
      id: 'inventory-check',
      designId: 'astrolabe.inventory-check',
      upstream: ['reader-analyst'],
      givens: { planId: '${yields.plan-init.planId}' },
    },
    {
      id: 'decision-review',
      designId: 'astrolabe.decision-review',
      upstream: ['inventory-check'],
      givens: { planId: '${yields.plan-init.planId}' },
    },
    {
      id: 'spec-writer',
      designId: 'anima-session',
      upstream: ['decision-review'],
      givens: {
        role: 'astrolabe.sage-writer',
        prompt:
          'Plan ID: ${yields.plan-init.planId}\n\n' +
          'Decision summary:\n${yields.decision-review.decisionSummary}',
        cwd: '${yields.draft.path}',
        writ: '${writ}',
        metadata: { engineId: 'spec-writer' },
      },
    },
    {
      id: 'spec-publish',
      designId: 'astrolabe.spec-publish',
      upstream: ['spec-writer'],
      givens: { planId: '${yields.plan-init.planId}' },
    },
    {
      id: 'seal',
      designId: 'seal',
      upstream: ['spec-publish'],
      givens: { abandon: true },
    },
  ],
  resolutionEngine: 'spec-writer',
};
```

**`packages/plugins/astrolabe/src/three-phase-planning.ts`**

Create this file exporting `threePhaseRigTemplate`. Module-level JSDoc: brief functional description only.

```typescript
import type { RigTemplate } from '@shardworks/spider-apparatus';

export const threePhaseRigTemplate: RigTemplate = {
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
        role: 'astrolabe.sage-reader',
        prompt: 'Plan ID: ${yields.plan-init.planId}',
        cwd: '${yields.draft.path}',
        writ: '${writ}',
        metadata: { engineId: 'reader' },
      },
    },
    {
      id: 'inventory-check',
      designId: 'astrolabe.inventory-check',
      upstream: ['reader'],
      givens: { planId: '${yields.plan-init.planId}' },
    },
    {
      id: 'analyst',
      designId: 'anima-session',
      upstream: ['inventory-check'],
      givens: {
        role: 'astrolabe.sage-analyst',
        prompt: 'Plan ID: ${yields.plan-init.planId}',
        cwd: '${yields.draft.path}',
        writ: '${writ}',
        metadata: { engineId: 'analyst' },
      },
    },
    {
      id: 'decision-review',
      designId: 'astrolabe.decision-review',
      upstream: ['analyst'],
      givens: { planId: '${yields.plan-init.planId}' },
    },
    {
      id: 'spec-writer',
      designId: 'anima-session',
      upstream: ['decision-review'],
      givens: {
        role: 'astrolabe.sage-writer',
        prompt:
          'Plan ID: ${yields.plan-init.planId}\n\n' +
          'Decision summary:\n${yields.decision-review.decisionSummary}',
        cwd: '${yields.draft.path}',
        writ: '${writ}',
        metadata: { engineId: 'spec-writer' },
      },
    },
    {
      id: 'spec-publish',
      designId: 'astrolabe.spec-publish',
      upstream: ['spec-writer'],
      givens: { planId: '${yields.plan-init.planId}' },
    },
    {
      id: 'seal',
      designId: 'seal',
      upstream: ['spec-publish'],
      givens: { abandon: true },
    },
  ],
  resolutionEngine: 'spec-writer',
};
```

#### `astrolabe.ts` changes

1. **Remove** the inline `planningTemplate` constant (lines 51-142).
2. **Replace** `import { planningMraTemplate } from './planning-mra.ts'` with:
   ```typescript
   import { twoPhaseRigTemplate } from './two-phase-planning.ts';
   import { threePhaseRigTemplate } from './three-phase-planning.ts';
   ```
3. **Replace** `supportKit.writTypes` with a single entry:
   ```typescript
   writTypes: [
     { name: 'brief', description: 'A patron brief triggering the planning pipeline' },
   ],
   ```
4. **Replace** `supportKit.roles` with four roles:
   ```typescript
   roles: {
     'sage-reader': {
       permissions: ['astrolabe:read', 'astrolabe:write', 'clerk:read'],
       strict: true,
       instructionsFile: 'sage-reader.md',
     },
     'sage-analyst': {
       permissions: ['astrolabe:read', 'astrolabe:write', 'clerk:read'],
       strict: true,
       instructionsFile: 'sage-analyst.md',
     },
     'sage-writer': {
       permissions: ['astrolabe:read', 'astrolabe:write', 'clerk:read'],
       strict: true,
       instructionsFile: 'sage-writer.md',
     },
     'sage-reading-analyst': {
       permissions: ['astrolabe:read', 'astrolabe:write', 'clerk:read'],
       strict: true,
       instructionsFile: 'sage-reading-analyst.md',
     },
   } satisfies Record<string, KitRoleDefinition>,
   ```
5. **Replace** `supportKit.rigTemplates`:
   ```typescript
   rigTemplates: {
     'two-phase-planning': twoPhaseRigTemplate,
     'three-phase-planning': threePhaseRigTemplate,
   },
   ```
6. **Replace** `supportKit.rigTemplateMappings`:
   ```typescript
   rigTemplateMappings: {
     brief: 'astrolabe.two-phase-planning',
   },
   ```

#### Role files

Create four standalone role files at the package root (`packages/plugins/astrolabe/`). Each file follows the same structural template but with content tailored to the role.

**`sage-reader.md`**
- Opening: "You are a codebase inventory agent."
- Adapted preamble: states the agent does not implement/modify source code, reads and records only.
- Tools section listing: `plan-show`, `plan-list`, `inventory-write` (Astrolabe tools) and `writ-show`, `writ-list`, `writ-types` (Clerk read tools for reviewing quests and commissions).
- Mention of standard file-reading tools (Read, Glob, Grep).
- Full READER process section from `sage.md` (Process steps 1-3, Codebase Inventory subsection with all sub-bullets, Boundaries).
- Finishing footer listing `inventory-write` as the required submission tool.

**`sage-analyst.md`**
- Opening: "You are a scope and decision analyst."
- Adapted preamble: states the agent does not implement features, produces scope/decisions/observations.
- Tools section listing: `plan-show`, `plan-list`, `scope-write`, `decisions-write`, `observations-write` (Astrolabe tools) and `writ-show`, `writ-list`, `writ-types` (Clerk read tools).
- Mention of standard file-reading tools.
- Full ANALYST process section from `sage.md` (Steps 1-3: Scope Decomposition, Decision Analysis with full metadata docs, Observations, Boundaries).
- Finishing footer listing `scope-write`, `decisions-write`, `observations-write`.

**`sage-writer.md`**
- Opening: "You are a spec writer."
- Adapted preamble: states the agent does not make decisions, translates locked decisions into specs.
- Tools section listing: `plan-show`, `plan-list`, `spec-write`, `observations-write` (Astrolabe tools) and `writ-show`, `writ-list`, `writ-types` (Clerk read tools).
- Mention of standard file-reading tools.
- Full WRITER process section from `sage.md` (Authority hierarchy, Steps 1-5: Read Locked Inputs, Gap Check, Spec Writing with full format/style rules, Decision Compliance Check, Coverage Verification, Boundaries).
- Finishing footer listing `spec-write` as primary, `observations-write` for gap reporting.

**`sage-reading-analyst.md`**
- Opening: "You are a codebase inventory agent and scope/decision analyst." (or similar unified description conveying both functions)
- Adapted preamble: states the agent reads, catalogs, and analyzes — does not implement or write specs.
- Tools section listing: `plan-show`, `plan-list`, `inventory-write`, `scope-write`, `decisions-write`, `observations-write` (Astrolabe tools) and `writ-show`, `writ-list`, `writ-types` (Clerk read tools).
- Mention of standard file-reading tools.
- Single unified Process section with numbered steps that interleave reading and analysis. Use the inline MRA prompt from `planning-mra.ts` as the structural backbone:
  1. Call `plan-show` to read the plan and understand the brief.
  2. Read the codebase — let growing understanding guide exploration. As you read, form scope boundaries, identify decision points, notice observations.
  3. Write inventory using `inventory-write` (with the full quality bar from the READER section: affected files, types, interfaces, functions, test files, adjacent patterns, conventions, existing context, doc/code discrepancies).
  4. Write scope using `scope-write` (with the full scope decomposition guidance from ANALYST).
  5. Write decisions using `decisions-write` (with the full decision analysis guidance and metadata docs from ANALYST).
  6. Write observations using `observations-write`.
  - Include the note about interleaving: "You may interleave reading and writing — write partial inventory as you go, write scope items as they become clear."
  - Include the constraint: "When you finish, all four artifacts must be complete."
- Include the full Codebase Inventory quality bar section (from READER) and full Decision Analysis Metadata section (from ANALYST) as reference subsections within the process.
- Boundaries combining both roles.
- Finishing footer listing `inventory-write`, `scope-write`, `decisions-write`, `observations-write`.

In all four files: no `MODE:` references, no mode-dispatch language, no mention of "three modes" or other roles.

#### `package.json` changes

Replace `"sage.md"` in the `files` array with:
```json
"sage-reader.md",
"sage-analyst.md",
"sage-writer.md",
"sage-reading-analyst.md"
```

#### File deletions

- Delete `packages/plugins/astrolabe/src/planning-mra.ts`
- Delete `packages/plugins/astrolabe/src/planning-mra.test.ts`
- Delete `packages/plugins/astrolabe/sage.md`

#### README changes

Rewrite the Support Kit section of `packages/plugins/astrolabe/README.md`:

**Writ Types table:** Single entry:
| Name | Description |
|---|---|
| `brief` | A patron brief triggering the planning pipeline |

**Roles table:** Four entries with stage annotations:
| Role | Qualified Name | Permissions | Strict | Used In |
|---|---|---|---|---|
| `sage-reader` | `astrolabe.sage-reader` | `astrolabe:read`, `astrolabe:write`, `clerk:read` | `true` | three-phase reader stage |
| `sage-analyst` | `astrolabe.sage-analyst` | `astrolabe:read`, `astrolabe:write`, `clerk:read` | `true` | three-phase analyst stage |
| `sage-writer` | `astrolabe.sage-writer` | `astrolabe:read`, `astrolabe:write`, `clerk:read` | `true` | spec-writer stage (both templates) |
| `sage-reading-analyst` | `astrolabe.sage-reading-analyst` | `astrolabe:read`, `astrolabe:write`, `clerk:read` | `true` | two-phase reader-analyst stage |

**Engines table:** Add `spec-publish`:
| Engine ID | Description |
|---|---|
| `astrolabe.plan-init` | Creates a PlanDoc from the brief writ; validates codex presence |
| `astrolabe.inventory-check` | Validates that the reader produced a non-empty inventory |
| `astrolabe.decision-review` | Two-pass engine: blocks for patron review, then reconciles answers |
| `astrolabe.spec-publish` | Publishes the generated specification as a new writ |

**Rig Templates table:**
| Template | Mapped Writ Type | Engines |
|---|---|---|
| `astrolabe.two-phase-planning` | `brief` (default) | plan-init → draft → reader-analyst → inventory-check → decision-review → spec-writer → spec-publish → seal |
| `astrolabe.three-phase-planning` | — | plan-init → draft → reader → inventory-check → analyst → decision-review → spec-writer → spec-publish → seal |

**New "Rig Template Selection" section** after the Rig Templates table:

The `brief` writ type maps to `astrolabe.two-phase-planning` by default. To use the three-phase template instead, add a rig template mapping override in `guild.json`:

```json
{
  "spider": {
    "rigTemplateMappings": {
      "brief": "astrolabe.three-phase-planning"
    }
  }
}
```

Remove all references to `brief-mra`, `planning-mra`, `sage`, `astrolabe.sage`, "three modes", "experimental".

Replace the `planning-mra` subsection with a brief description of the two-phase template as the default, explaining it merges reader and analyst into a single session.

#### Test files

**`packages/plugins/astrolabe/src/two-phase-planning.test.ts`**

New test file. Uses same test patterns as existing files (`node:test`, `node:assert/strict`, `getKit()` helper). Test cases:

```
describe('two-phase-planning rig template')
  - 'two-phase-planning is registered as a rig template'
  - 'engine list: plan-init → draft → reader-analyst → inventory-check → decision-review → spec-writer → spec-publish → seal'
  - 'has 8 engines'
  - 'resolutionEngine is spec-writer'
  - 'reader-analyst uses anima-session designId'
  - 'reader-analyst uses astrolabe.sage-reading-analyst role'
  - 'reader-analyst prompt contains planId interpolation'
  - 'reader-analyst prompt does NOT contain MODE:'
  - 'reader-analyst has metadata.engineId = reader-analyst'
  - 'reader-analyst has writ given'
  - 'reader-analyst has cwd given from draft'
  - 'reader-analyst has no conversationId'
  - 'spec-writer uses astrolabe.sage-writer role'
  - 'spec-writer prompt contains planId interpolation'
  - 'spec-writer prompt contains decisionSummary interpolation'
  - 'spec-writer prompt does NOT contain MODE:'
  - 'spec-writer has metadata.engineId = spec-writer'
  - 'spec-writer has no conversationId'
  - 'inventory-check is downstream of reader-analyst'
  - 'decision-review is downstream of inventory-check'
  - 'all shared engines use same designIds as three-phase-planning'
```

**`packages/plugins/astrolabe/src/three-phase-planning.test.ts`**

New test file. Test cases:

```
describe('three-phase-planning rig template')
  - 'three-phase-planning is registered as a rig template'
  - 'engine list: plan-init → draft → reader → inventory-check → analyst → decision-review → spec-writer → spec-publish → seal'
  - 'has 9 engines'
  - 'resolutionEngine is spec-writer'
  - 'reader uses astrolabe.sage-reader role'
  - 'reader prompt contains planId interpolation'
  - 'reader prompt does NOT contain MODE:'
  - 'reader has metadata.engineId = reader'
  - 'reader has writ and cwd givens'
  - 'reader has no conversationId'
  - 'analyst uses astrolabe.sage-analyst role'
  - 'analyst prompt contains planId interpolation'
  - 'analyst prompt does NOT contain MODE:'
  - 'analyst has metadata.engineId = analyst'
  - 'analyst has writ and cwd givens'
  - 'analyst has no conversationId'
  - 'spec-writer uses astrolabe.sage-writer role'
  - 'spec-writer prompt contains planId and decisionSummary interpolation'
  - 'spec-writer prompt does NOT contain MODE:'
  - 'spec-writer has metadata.engineId = spec-writer'
  - 'spec-writer has no conversationId'
  - 'spec-publish is upstream of seal'
```

**`packages/plugins/astrolabe/src/supportkit.test.ts` changes**

Update the existing test file:

1. **Replace** the `'contributes sage role with correct permissions'` test with four individual role tests:
   - Assert `sage-reader` exists with `permissions: ['astrolabe:read', 'astrolabe:write', 'clerk:read']`, `strict: true`, `instructionsFile: 'sage-reader.md'`
   - Assert `sage-analyst` exists with same permissions, `instructionsFile: 'sage-analyst.md'`
   - Assert `sage-writer` exists with same permissions, `instructionsFile: 'sage-writer.md'`
   - Assert `sage-reading-analyst` exists with same permissions, `instructionsFile: 'sage-reading-analyst.md'`

2. **Replace** the `'contributes planning rig template with 9 engines'` test with two tests:
   - Assert `two-phase-planning` template has 8 engines with correct IDs in order
   - Assert `three-phase-planning` template has 9 engines with correct IDs in order

3. **Replace** `'maps brief to astrolabe.planning'` with `'maps brief to astrolabe.two-phase-planning'`.

4. **Replace** the `'contributes brief writType'` test to also assert only one writ type exists (no `brief-mra`).

5. **Replace** the `'analyst and spec-writer chain conversationId from upstream'` and `'reader has no conversationId'` tests with a single test: `'no engine in either template has a conversationId given'` — iterate all engines in both templates and assert `givens?.conversationId === undefined`.

6. **Add** negative assertion tests:
   - `'old identifiers do not appear in roles'`: assert `roles.sage` is `undefined`
   - `'old identifiers do not appear in rigTemplates'`: assert `rigTemplates.planning` is `undefined`, `rigTemplates['planning-mra']` is `undefined`
   - `'old identifiers do not appear in rigTemplateMappings'`: assert `mappings['brief-mra']` is `undefined`
   - `'old identifiers do not appear in writTypes'`: assert no writ type with name `'brief-mra'` exists

7. **Update** the `'anima session engines have writ givens and non-empty prompts'` test to reference `two-phase-planning` template's `reader-analyst` and `spec-writer` engines instead of `planning` template's `reader`, `analyst`, `spec-writer`.

8. **Remove** tests specific to the old `planning` template (`'spec-writer prompt includes decisionSummary interpolation'` referencing `rigTemplates.planning`).

9. **Update** the `'sage role grants resolve all expected tools...'` test to iterate all four roles and verify each resolves the same set of 7 tools (the permissions are identical across roles, so all 7 astrolabe tools are accessible to each).

10. **Update** the `'spec-publish engine is upstream of seal'` test to reference one of the new template names.

### Non-obvious Touchpoints

- **`packages/plugins/astrolabe/package.json` `files` array**: Must be updated to include the four new `sage-*.md` files and remove `sage.md`. Without this, the role files won't be included in the npm package.
- **`packages/plugins/astrolabe/src/index.ts`**: No changes needed — it re-exports `createAstrolabe` from `./astrolabe.ts` and the type exports are unaffected. However, the barrel file does NOT re-export the template constants. The templates are internal to the supportKit registration and do not need public export.

## Validation Checklist

- V1 [R1, R4]: Run `grep -r 'twoPhaseRigTemplate\|threePhaseRigTemplate' packages/plugins/astrolabe/src/` and verify the exports exist in `two-phase-planning.ts` and `three-phase-planning.ts`. Verify `astrolabe.ts` imports them. Run `grep -r "planning'" packages/plugins/astrolabe/src/astrolabe.ts` and confirm no bare `'planning'` or `'planning-mra'` keys in rigTemplates.
- V2 [R2, R3]: Run `node --experimental-transform-types --test packages/plugins/astrolabe/src/two-phase-planning.test.ts` and `node --experimental-transform-types --test packages/plugins/astrolabe/src/three-phase-planning.test.ts` — both must pass with engine count and order assertions.
- V3 [R5]: In both template files, verify every `designId: 'anima-session'` engine has a `metadata: { engineId: '<its-id>' }` entry. The template test files assert this.
- V4 [R6]: Run `grep 'conversationId' packages/plugins/astrolabe/src/two-phase-planning.ts packages/plugins/astrolabe/src/three-phase-planning.ts` — must produce no matches.
- V5 [R7, R8, R9, R10]: Inspect the `givens` objects in both template files: all anima-session stages have `writ`, `cwd`, `role`, and `prompt` givens with correct values. No `MODE:` string in any prompt. Verified by template test files.
- V6 [R11]: Run `node --experimental-transform-types -e "import { createAstrolabe } from './packages/plugins/astrolabe/src/astrolabe.ts'; const p = createAstrolabe(); const r = p.apparatus.supportKit.roles; console.log(Object.keys(r).sort());"` and verify output is `['sage-analyst', 'sage-reader', 'sage-reading-analyst', 'sage-writer']`.
- V7 [R12, R13, R14, R15, R16]: Read each of the four `sage-*.md` files and verify: no `MODE:` text, correct opening line, role-specific tool list including clerk read tools, role-specific footer, unified process in reading-analyst.
- V8 [R17, R18]: Run `node --experimental-transform-types --test packages/plugins/astrolabe/src/supportkit.test.ts` — must pass including the new negative assertions for old identifiers and the single-writ-type check.
- V9 [R19]: Run `cat packages/plugins/astrolabe/package.json | grep sage` and verify four `sage-*.md` entries, no bare `sage.md`.
- V10 [R20]: Read `README.md` and verify: single `brief` writ type, four roles table, `spec-publish` in engines table, both templates in rig templates table, "Rig Template Selection" section with `spider.rigTemplateMappings` JSON snippet, no references to `brief-mra`/`sage`/`planning-mra`/`astrolabe.sage`/"experimental"/"three modes".
- V11 [R21, R22]: Run `node --disable-warning=ExperimentalWarning --experimental-transform-types --test packages/plugins/astrolabe/src/two-phase-planning.test.ts packages/plugins/astrolabe/src/three-phase-planning.test.ts` — all tests pass.
- V12 [R23]: Run `node --disable-warning=ExperimentalWarning --experimental-transform-types --test packages/plugins/astrolabe/src/supportkit.test.ts` — all tests pass including negative assertions for `sage`, `planning`, `planning-mra`, `brief-mra`, `astrolabe.sage`.
- V13 [R24]: Verify `packages/plugins/astrolabe/src/planning-mra.ts`, `packages/plugins/astrolabe/src/planning-mra.test.ts`, and `packages/plugins/astrolabe/sage.md` do not exist.
- V14 [R1-R24]: Run the full test suite: `node --disable-warning=ExperimentalWarning --experimental-transform-types --test 'packages/plugins/astrolabe/src/**/*.test.ts'` — all tests pass with no failures.

## Test Cases

### two-phase-planning.test.ts

1. **Template registration** → `two-phase-planning` key exists in `rigTemplates`
2. **Engine count** → 8 engines
3. **Engine order** → `[plan-init, draft, reader-analyst, inventory-check, decision-review, spec-writer, spec-publish, seal]`
4. **Resolution engine** → `'spec-writer'`
5. **Reader-analyst role** → `'astrolabe.sage-reading-analyst'`
6. **Reader-analyst designId** → `'anima-session'`
7. **Reader-analyst prompt has planId** → prompt includes `'${yields.plan-init.planId}'`
8. **Reader-analyst prompt has no MODE** → prompt does not include `'MODE:'`
9. **Reader-analyst metadata** → `metadata.engineId === 'reader-analyst'`
10. **Reader-analyst writ given** → `givens.writ === '${writ}'`
11. **Reader-analyst cwd given** → `givens.cwd === '${yields.draft.path}'`
12. **Reader-analyst no conversationId** → `givens.conversationId === undefined`
13. **Spec-writer role** → `'astrolabe.sage-writer'`
14. **Spec-writer prompt has planId** → prompt includes planId interpolation
15. **Spec-writer prompt has decisionSummary** → prompt includes `'${yields.decision-review.decisionSummary}'`
16. **Spec-writer prompt has no MODE** → prompt does not include `'MODE:'`
17. **Spec-writer metadata** → `metadata.engineId === 'spec-writer'`
18. **Spec-writer no conversationId** → `givens.conversationId === undefined`
19. **Inventory-check upstream** → `['reader-analyst']`
20. **Decision-review upstream** → `['inventory-check']`
21. **Shared engine designIds match three-phase** → for each shared engine ID (plan-init, draft, inventory-check, decision-review, spec-publish, seal), designId is identical in both templates

### three-phase-planning.test.ts

1. **Template registration** → `three-phase-planning` key exists in `rigTemplates`
2. **Engine count** → 9 engines
3. **Engine order** → `[plan-init, draft, reader, inventory-check, analyst, decision-review, spec-writer, spec-publish, seal]`
4. **Resolution engine** → `'spec-writer'`
5. **Reader role** → `'astrolabe.sage-reader'`
6. **Reader prompt has planId, no MODE** → includes planId, does not include `'MODE:'`
7. **Reader metadata** → `metadata.engineId === 'reader'`
8. **Reader writ and cwd givens** → present with correct interpolation values
9. **Reader no conversationId** → `givens.conversationId === undefined`
10. **Analyst role** → `'astrolabe.sage-analyst'`
11. **Analyst prompt has planId, no MODE** → includes planId, does not include `'MODE:'`
12. **Analyst metadata** → `metadata.engineId === 'analyst'`
13. **Analyst writ and cwd givens** → present
14. **Analyst no conversationId** → `givens.conversationId === undefined`
15. **Spec-writer role** → `'astrolabe.sage-writer'`
16. **Spec-writer prompt has planId and decisionSummary, no MODE** → all present, no MODE
17. **Spec-writer metadata** → `metadata.engineId === 'spec-writer'`
18. **Spec-writer no conversationId** → `givens.conversationId === undefined`
19. **Spec-publish upstream of seal** → seal's upstream is `['spec-publish']`

### supportkit.test.ts updates

1. **Four roles exist** → keys are `sage-reader`, `sage-analyst`, `sage-writer`, `sage-reading-analyst`
2. **Each role has correct permissions** → `['astrolabe:read', 'astrolabe:write', 'clerk:read']`, `strict: true`
3. **Each role has correct instructionsFile** → `sage-reader.md`, `sage-analyst.md`, `sage-writer.md`, `sage-reading-analyst.md`
4. **Two templates exist** → keys are `two-phase-planning`, `three-phase-planning`
5. **Brief maps to two-phase** → `brief → 'astrolabe.two-phase-planning'`
6. **Single writ type** → only `brief` exists, array length is 1
7. **No conversationId in any template engine** → iterate all engines in both templates, assert `givens?.conversationId === undefined`
8. **Old role absent** → `roles.sage === undefined`
9. **Old templates absent** → `rigTemplates.planning === undefined`, `rigTemplates['planning-mra'] === undefined`
10. **Old mapping absent** → `mappings['brief-mra'] === undefined`
11. **Old writ type absent** → no entry with `name === 'brief-mra'`
12. **All four roles resolve all 7 tools** → same permission-matching test as current but iterating all four roles