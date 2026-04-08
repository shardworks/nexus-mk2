---
author: plan-writer
estimated_complexity: 5
---

# Astrolabe MVP Part 2: spec-publish Engine, decisionSummary Wiring, and Consistency Validation

## Summary

Add the `astrolabe.spec-publish` clockwork engine to the Astrolabe planning pipeline: it posts the generated specification as a mandate writ, links it back to the originating brief via a `refines` link, records the `generatedWritId` on the PlanDoc, and transitions the plan to `completed`. Also wire the `decisionSummary` yield into the spec-writer prompt, and add consistency validation to the decision-review re-run path.

## Current State

The Astrolabe plugin (`packages/plugins/astrolabe/`) has three clockwork engines (`plan-init`, `inventory-check`, `decision-review`), seven tools, and a rig template mapping `brief` → `astrolabe.planning`. The rig template defines 8 engine slots:

```
plan-init → draft → reader → inventory-check → analyst → decision-review → spec-writer → seal
```

The pipeline reaches the `spec-writer` stage, which writes the specification to `PlanDoc.spec` via the `spec-write` tool. After that, `seal` abandons the draft. But:

- **No writ is posted.** The generated spec is never posted as a mandate writ to the Clerk.
- **No link is created.** There is no `refines` link from mandate back to brief.
- **`PlanDoc.generatedWritId` is never set.** The field is defined in `types.ts` but unused.
- **PlanDoc never transitions to `'completed'`.** It stalls at `'writing'` forever.
- **The spec-writer prompt does not include `decisionSummary`.** The decision-review engine yields `{ decisionSummary }` but the spec-writer's prompt does not reference `${yields.decision-review.decisionSummary}`.
- **decision-review does not validate consistency.** After reconciling patron answers, it does not check that every decision has `selected` or `patronOverride`.

### Key current signatures

```typescript
// packages/plugins/astrolabe/src/types.ts
export type PlanStatus = 'reading' | 'analyzing' | 'reviewing' | 'writing' | 'completed' | 'failed';

export interface PlanDoc {
  [key: string]: unknown;
  id: string;
  codex: string;
  status: PlanStatus;
  inventory?: string;
  observations?: string;
  scope?: ScopeItem[];
  decisions?: Decision[];
  spec?: string;
  generatedWritId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AstrolabeConfig {
  generatedWritType?: string; // default: 'mandate'
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
```

```typescript
// packages/plugins/astrolabe/src/engines/index.ts
export { createPlanInitEngine } from './plan-init.ts';
export { createInventoryCheckEngine } from './inventory-check.ts';
export { createDecisionReviewEngine } from './decision-review.ts';
```

The sage role in `astrolabe.ts`:
```typescript
sage: {
  permissions: ['astrolabe:read', 'astrolabe:write', 'clerk:read'],
  strict: true,
  instructionsFile: 'sage.md',
}
```

## Requirements

- R1: A new clockwork engine `astrolabe.spec-publish` must be created. When run, it posts a new writ to the Clerk using the plan's spec as the body, then creates a `refines` link from the new writ to the brief, records `generatedWritId` on the PlanDoc, and transitions the plan status to `'completed'`.

- R2: The `astrolabe.spec-publish` engine must validate that `plan.status === 'writing'` before proceeding. When the status is not `'writing'`, the engine must throw an error.

- R3: The `astrolabe.spec-publish` engine must validate that `plan.spec` is a non-empty string. When the spec is missing or empty, the engine must throw an error.

- R4: The generated writ must use the writ type from `guild().guildConfig().astrolabe?.generatedWritType ?? 'mandate'`.

- R5: The generated writ must use the same title as the brief writ (retrieved via `clerk.show(planId)`).

- R6: The generated writ must use `plan.spec` as its body.

- R7: The generated writ must target `plan.codex`.

- R8: After posting the writ, the engine must call `clerk.link(generatedWrit.id, planId, 'refines')` — mandate (source) → brief (target) with type `'refines'`.

- R9: The engine must patch the PlanDoc with `{ generatedWritId: generatedWrit.id, status: 'completed', updatedAt: now }`.

- R10: The engine must return `{ status: 'completed', yields: { generatedWritId: generatedWrit.id } }`.

- R11: The engine must be created via a factory function `createSpecPublishEngine(getPlansBook: () => Book<PlanDoc>): EngineDesign` consistent with the other astrolabe engine factories.

- R12: The engine must be registered in `astrolabe.ts` supportKit.engines under key `'astrolabe.spec-publish'`.

- R13: The engine must be exported from the `engines/index.ts` barrel.

- R14: The rig template must be updated to include a `spec-publish` engine slot between `spec-writer` and `seal`, with `upstream: ['spec-writer']` and `givens: { planId: '${yields.plan-init.planId}' }`.

- R15: The spec-writer prompt in the rig template must be updated to append `\n\nDecision summary:\n${yields.decision-review.decisionSummary}` to the existing prompt string.

- R16: In the `decision-review` engine's re-run path (`plan.status === 'reviewing'`), after reconciling answers but before building the decisionSummary, the engine must validate that every decision in the array has either `selected` or `patronOverride` set. When any decision lacks both, the engine must throw with the message format: `Unresolved decisions after patron review: D2, D5` (listing the IDs of all unresolved decisions).

- R17: The sage role permissions must NOT be changed. No `clerk:write` is needed — the clockwork engine calls ClerkApi directly.

## Design

### Type Changes

No type changes. `PlanDoc`, `Decision`, `AstrolabeConfig`, and all other types remain as-is. The `generatedWritId` field and `'completed'` status already exist in the type definitions.

### Behavior

#### spec-publish engine (`packages/plugins/astrolabe/src/engines/spec-publish.ts`)

The new engine file follows the factory pattern established by the other three astrolabe engines:

```typescript
import { guild } from '@shardworks/nexus-core';
import type { EngineDesign, EngineRunContext, EngineRunResult } from '@shardworks/fabricator-apparatus';
import type { Book } from '@shardworks/stacks-apparatus';
import type { ClerkApi } from '@shardworks/clerk-apparatus';
import type { PlanDoc } from '../types.ts';

export function createSpecPublishEngine(getPlansBook: () => Book<PlanDoc>): EngineDesign {
  return {
    id: 'astrolabe.spec-publish',

    async run(
      givens: Record<string, unknown>,
      _context: EngineRunContext,
    ): Promise<EngineRunResult> {
      const planId = givens.planId as string;
      const book = getPlansBook();

      const plan = await book.get(planId);
      if (!plan) {
        throw new Error(`Plan "${planId}" not found.`);
      }

      // Validate status
      if (plan.status !== 'writing') {
        throw new Error(
          `spec-publish: expected plan status "writing" but got "${plan.status}" for plan "${planId}".`,
        );
      }

      // Validate spec exists
      if (typeof plan.spec !== 'string' || plan.spec.length === 0) {
        throw new Error(
          `Plan "${planId}" has no spec — spec-writer stage did not produce output.`,
        );
      }

      const clerk = guild().apparatus<ClerkApi>('clerk');

      // Read the brief writ for its title
      const briefWrit = await clerk.show(planId);

      // Resolve generated writ type from config
      const generatedWritType = guild().guildConfig().astrolabe?.generatedWritType ?? 'mandate';

      // Post the mandate writ
      const generatedWrit = await clerk.post({
        type: generatedWritType,
        title: briefWrit.title,
        body: plan.spec,
        codex: plan.codex,
      });

      // Link: mandate (source) → brief (target), type 'refines'
      await clerk.link(generatedWrit.id, planId, 'refines');

      // Update PlanDoc
      const now = new Date().toISOString();
      await book.patch(planId, {
        generatedWritId: generatedWrit.id,
        status: 'completed',
        updatedAt: now,
      });

      return {
        status: 'completed',
        yields: { generatedWritId: generatedWrit.id },
      };
    },
  };
}
```

The engine reads config inline (`guild().guildConfig().astrolabe?.generatedWritType ?? 'mandate'`) rather than importing `resolveAstrolabeConfig` — keeps the engine self-contained with no coupling to the parent module.

#### decision-review consistency validation (`packages/plugins/astrolabe/src/engines/decision-review.ts`)

In the re-run path (inside the `if (plan.status === 'reviewing')` block), insert validation **after** the `for (const [key, answer] of ...)` reconciliation loop and **before** the `buildDecisionSummary` call:

```typescript
// ── Validate consistency ──────────────────────────────
const unresolved = decisions.filter(
  d => d.selected === undefined && d.patronOverride === undefined,
);
if (unresolved.length > 0) {
  const ids = unresolved.map(d => d.id).join(', ');
  throw new Error(`Unresolved decisions after patron review: ${ids}`);
}
```

This goes at approximately line 247 of the current file (between the reconciliation loop ending at line 245 and the `buildDecisionSummary` call at line 247).

When this validation fails, the PlanDoc is NOT patched — it stays in `'reviewing'` status, allowing the patron to correct and retry.

#### Rig template update (`packages/plugins/astrolabe/src/astrolabe.ts`)

Insert a new engine slot into the `planningTemplate.engines` array between `spec-writer` and `seal`:

```typescript
{
  id: 'spec-publish',
  designId: 'astrolabe.spec-publish',
  upstream: ['spec-writer'],
  givens: {
    planId: '${yields.plan-init.planId}',
  },
},
```

Update `seal`'s upstream from `['spec-writer']` to `['spec-publish']` since seal now depends on spec-publish completing first.

#### Spec-writer prompt update (`packages/plugins/astrolabe/src/astrolabe.ts`)

Change the spec-writer engine's `prompt` given from:

```typescript
prompt:
  'MODE: WRITER\n\nPlan ID: ${yields.plan-init.planId}\n\n' +
  'You are continuing the analyst conversation. Use plan-show to read the full ' +
  'plan including patron-reviewed decisions, then write the specification using spec-write.',
```

To:

```typescript
prompt:
  'MODE: WRITER\n\nPlan ID: ${yields.plan-init.planId}\n\n' +
  'You are continuing the analyst conversation. Use plan-show to read the full ' +
  'plan including patron-reviewed decisions, then write the specification using spec-write.' +
  '\n\nDecision summary:\n${yields.decision-review.decisionSummary}',
```

#### Engine registration (`packages/plugins/astrolabe/src/astrolabe.ts`)

In the `createAstrolabe()` factory:

1. Import the new factory alongside the existing three:
   ```typescript
   import {
     createPlanInitEngine,
     createInventoryCheckEngine,
     createDecisionReviewEngine,
     createSpecPublishEngine,
   } from './engines/index.ts';
   ```

2. Create the engine instance:
   ```typescript
   const specPublishEngine = createSpecPublishEngine(() => plansBook);
   ```

3. Register in supportKit.engines:
   ```typescript
   engines: {
     'astrolabe.plan-init': planInitEngine,
     'astrolabe.inventory-check': inventoryCheckEngine,
     'astrolabe.decision-review': decisionReviewEngine,
     'astrolabe.spec-publish': specPublishEngine,
   },
   ```

#### Barrel export (`packages/plugins/astrolabe/src/engines/index.ts`)

Add the new export:

```typescript
export { createPlanInitEngine } from './plan-init.ts';
export { createInventoryCheckEngine } from './inventory-check.ts';
export { createDecisionReviewEngine } from './decision-review.ts';
export { createSpecPublishEngine } from './spec-publish.ts';
```

### Non-obvious Touchpoints

- **`packages/plugins/astrolabe/src/supportkit.test.ts` lines 88, 106, 115, 118:** The test asserts exactly 3 engine designs, 8 rig template engines, and a specific engine ID list. All three assertions must be updated to 4 engines, 9 template engines, and include `'spec-publish'` in the ID list. The ID list assertion must become `['plan-init', 'draft', 'reader', 'inventory-check', 'analyst', 'decision-review', 'spec-writer', 'spec-publish', 'seal']`.

- **`packages/plugins/astrolabe/src/supportkit.test.ts` line 129 (`resolutionEngine`):** The `resolutionEngine` remains `'spec-writer'` — no change needed. The spec-publish engine is a post-processing step, not the resolution source.

- **Seal engine upstream:** When inserting spec-publish between spec-writer and seal, the `seal` engine's `upstream` must be updated from `['spec-writer']` to `['spec-publish']`. The seal engine needs spec-publish to complete before it cleans up the draft.

## Validation Checklist

- V1 [R1, R2, R3]: Run spec-publish engine tests. Create a PlanDoc in `'writing'` status with a non-empty `spec` field. Verify the engine returns `{ status: 'completed' }`. Create a plan in `'analyzing'` status — verify the engine throws with a message containing `"writing"`. Create a plan with no spec — verify the engine throws with a message containing `"no spec"`.

- V2 [R4, R5, R6, R7]: In the spec-publish happy path test, verify the mock `clerk.post()` was called with: `type` matching the configured `generatedWritType` (or `'mandate'` by default), `title` matching the brief writ's title, `body` matching `plan.spec`, and `codex` matching `plan.codex`.

- V3 [R8]: In the spec-publish happy path test, verify the mock `clerk.link()` was called with `(generatedWrit.id, planId, 'refines')` — source is the mandate, target is the brief.

- V4 [R9, R10]: After the spec-publish engine completes, read the PlanDoc from the book. Verify `generatedWritId` equals the posted writ's ID, `status` equals `'completed'`, and `updatedAt` is recent. Verify the engine yields `{ generatedWritId: <posted writ ID> }`.

- V5 [R11, R13]: Verify `createSpecPublishEngine` is importable from `'./engines/index.ts'` and returns an `EngineDesign` with `id === 'astrolabe.spec-publish'` and a `run` function.

- V6 [R12, R14]: Run the supportKit shape tests (`supportkit.test.ts`). Verify the engine count assertion passes with 4 engines, the rig template engine count passes with 9, the engine ID list includes `'spec-publish'` between `'spec-writer'` and `'seal'`, and the `astrolabe.spec-publish` engine is present in the supportKit.engines map.

- V7 [R15]: Inspect the rig template's spec-writer engine givens.prompt string. Verify it ends with `\n\nDecision summary:\n${yields.decision-review.decisionSummary}`. Run the existing supportKit test that checks anima session engines have non-empty prompts and planId interpolation — it should still pass.

- V8 [R16]: In decision-review re-run tests, set up a plan with two decisions. Simulate a completed InputRequestDoc where one decision has `{ selected: 'A' }` and the other has no answer (empty answers map for that key). Run the engine in re-run mode. Verify it throws with message `Unresolved decisions after patron review: D2` (the specific ID of the unresolved decision). Verify the PlanDoc remains in `'reviewing'` status (not patched to `'writing'`).

- V9 [R17]: Inspect the sage role permissions in the supportKit. Verify they are exactly `['astrolabe:read', 'astrolabe:write', 'clerk:read']` — no `clerk:write`.

- V10 [R14]: Verify the seal engine's upstream in the rig template is `['spec-publish']` (not `['spec-writer']`).

## Test Cases

### spec-publish engine — happy path
- **Scenario:** PlanDoc in `'writing'` status with `spec: '# Spec\nContent'` and `codex: 'my-codex'`. Brief writ has `title: 'Feature X'`. Guild config has no `astrolabe` override (default `'mandate'`).
- **Expected:** Engine returns `{ status: 'completed', yields: { generatedWritId: '<new-id>' } }`. PlanDoc updated: `generatedWritId` set, `status: 'completed'`. Clerk.post called with `{ type: 'mandate', title: 'Feature X', body: '# Spec\nContent', codex: 'my-codex' }`. Clerk.link called with `(newWritId, planId, 'refines')`.

### spec-publish — custom generatedWritType
- **Scenario:** Guild config has `astrolabe: { generatedWritType: 'reviewed-mandate' }`.
- **Expected:** Clerk.post called with `type: 'reviewed-mandate'`.

### spec-publish — plan not found
- **Scenario:** planId points to a nonexistent plan.
- **Expected:** Throws error containing `"not found"`.

### spec-publish — wrong status
- **Scenario:** PlanDoc in `'analyzing'` status.
- **Expected:** Throws error containing `"writing"`.

### spec-publish — missing spec
- **Scenario:** PlanDoc in `'writing'` status with `spec: undefined`.
- **Expected:** Throws error containing `"no spec"`.

### spec-publish — empty spec
- **Scenario:** PlanDoc in `'writing'` status with `spec: ''`.
- **Expected:** Throws error containing `"no spec"`.

### decision-review — consistency validation passes
- **Scenario:** All decisions have `selected` set after reconciliation (existing happy path tests).
- **Expected:** Engine completes normally. No change to existing passing behavior.

### decision-review — consistency validation catches unresolved decision
- **Scenario:** PlanDoc in `'reviewing'` status with decisions `[D1, D2]`. InputRequestDoc answers only contain answer for D1. D2 has no answer entry.
- **Expected:** Throws `Unresolved decisions after patron review: D2`. PlanDoc stays in `'reviewing'` status.

### decision-review — consistency validation catches multiple unresolved
- **Scenario:** PlanDoc in `'reviewing'` status with decisions `[D1, D2, D3]`. Only D2 has an answer.
- **Expected:** Throws `Unresolved decisions after patron review: D1, D3`.

### decision-review — patronOverride satisfies validation
- **Scenario:** Decision has `patronOverride` set (via `{ custom: '...' }` answer) but no `selected`.
- **Expected:** Validation passes for that decision. (This is already covered by the existing `patronOverride` reconciliation test, but verify it explicitly doesn't trigger the new validation.)