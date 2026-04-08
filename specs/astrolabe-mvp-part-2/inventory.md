# Inventory — Astrolabe MVP: Part 2

Slug: `astrolabe-mvp-part-2`

---

## Executive Summary

The brief calls for four deliverables: `plan-init` engine, `inventory-check` engine, `decision-review` engine, and writ linking (mandate→brief `refines` link). The first three are **already implemented and fully tested** in the current codebase. The fourth — writ linking — is explicitly absent: no mechanism exists to post the generated mandate writ or create the `refines` link from the sage role. This is the true remaining scope.

---

## Affected Files

### Already Implemented (Part 2 engines — present and tested)

| File | Status | Notes |
|---|---|---|
| `packages/plugins/astrolabe/src/engines/plan-init.ts` | Exists, complete | Creates PlanDoc, validates codex, yields `{ planId }` |
| `packages/plugins/astrolabe/src/engines/inventory-check.ts` | Exists, complete | Validates inventory, transitions `reading` → `analyzing` |
| `packages/plugins/astrolabe/src/engines/decision-review.ts` | Exists, complete | Two-pass: blocks on patron-input, reconciles answers, yields `decisionSummary` |
| `packages/plugins/astrolabe/src/engines/index.ts` | Exists, complete | Barrel re-export of all three engines |
| `packages/plugins/astrolabe/src/engines.test.ts` | Exists, comprehensive | Tests all three engines with in-memory Stacks |

### Affected by Writ Linking Work

| File | Change Type | Notes |
|---|---|---|
| `packages/plugins/astrolabe/src/astrolabe.ts` | Modify | Sage role permissions, rig template spec-writer prompt, possibly a new engine registration |
| `packages/plugins/astrolabe/src/types.ts` | Possibly modify | `generatedWritId` field exists; no changes expected unless a new tool type is needed |
| `packages/plugins/astrolabe/src/engines/decision-review.ts` | Possibly modify | Brief suggests wiring might land here |
| `packages/plugins/astrolabe/sage.md` | Possibly modify | Sage instructions if new behavior needs to be described |
| `packages/plugins/astrolabe/src/supportkit.test.ts` | Modify | Will need updates if permissions or tools change |
| `packages/plugins/astrolabe/src/engines.test.ts` | Possibly modify | If decision-review engine gains new behavior |

### New Files (if a new engine is added)

| File | Change Type | Notes |
|---|---|---|
| `packages/plugins/astrolabe/src/engines/spec-publish.ts` | Possibly create | New clockwork engine to post mandate + link; one candidate approach |

---

## Types and Interfaces

### `PlanDoc` (current — `packages/plugins/astrolabe/src/types.ts`)

```typescript
export interface PlanDoc {
  [key: string]: unknown;
  id: string;            // brief writ ID — primary key
  codex: string;
  status: PlanStatus;    // 'reading' | 'analyzing' | 'reviewing' | 'writing' | 'completed' | 'failed'
  inventory?: string;
  observations?: string;
  scope?: ScopeItem[];
  decisions?: Decision[];
  spec?: string;
  generatedWritId?: string;  // ← defined, but NEVER SET by any current engine
  createdAt: string;
  updatedAt: string;
}
```

`generatedWritId` is declared but not populated anywhere. The `'completed'` status is a valid `PlanStatus` but no current code transitions to it.

### `Decision` (current — `packages/plugins/astrolabe/src/types.ts`)

```typescript
export interface Decision {
  id: string;
  scope: string[];
  question: string;
  context?: string;
  options: Record<string, string>;
  recommendation?: string;
  rationale?: string;
  selected?: string;          // set by decision-review on re-run
  patronOverride?: string;    // set by decision-review on re-run
}
```

### `AstrolabeConfig` (current)

```typescript
export interface AstrolabeConfig {
  generatedWritType?: string;  // default: 'mandate'
}
```

`resolveAstrolabeConfig()` is exported from `astrolabe.ts` for lazy access. No engine currently reads this config.

### `InputRequestDoc` (from `packages/plugins/spider/src/types.ts`)

```typescript
export interface InputRequestDoc {
  [key: string]: unknown;
  id: string;
  rigId: string;
  engineId: string;
  status: InputRequestStatus;   // 'pending' | 'completed' | 'rejected'
  message?: string;
  questions: Record<string, QuestionSpec>;
  answers: Record<string, AnswerValue>;
  rejectionReason?: string;
  createdAt: string;
  updatedAt: string;
}
```

### `ClerkApi` (from `packages/plugins/clerk/src/types.ts`)

```typescript
export interface ClerkApi {
  post(request: PostCommissionRequest): Promise<WritDoc>;
  show(id: string): Promise<WritDoc>;
  list(filters?: WritFilters): Promise<WritDoc[]>;
  count(filters?: WritFilters): Promise<number>;
  transition(id: string, to: WritStatus, fields?: Partial<WritDoc>): Promise<WritDoc>;
  link(sourceId: string, targetId: string, type: string): Promise<WritLinkDoc>;
  links(writId: string): Promise<WritLinks>;
  unlink(sourceId: string, targetId: string, type: string): Promise<void>;
}
```

`link()` is idempotent — duplicate (sourceId, targetId, type) returns the existing link. Validates both writs exist, rejects self-links. Commission-post requires `clerk:write` permission; `link()` also requires `clerk:write`.

---

## Current Engine Implementations

### `plan-init` (`packages/plugins/astrolabe/src/engines/plan-init.ts`)

```
run(givens: { writ: WritDoc }, context) → EngineRunResult
```

- Validates `writ.codex` is non-empty string (throws if absent or blank)
- Checks `book.get(writ.id)` — throws if a plan already exists (idempotency guard)
- Creates `PlanDoc` with `status: 'reading'`, `id = writ.id`, `codex = writ.codex`
- Returns `{ status: 'completed', yields: { planId: writ.id } }`

### `inventory-check` (`packages/plugins/astrolabe/src/engines/inventory-check.ts`)

```
run(givens: { planId: string }, context) → EngineRunResult
```

- Loads plan by `planId` (throws if not found)
- Checks `typeof plan.inventory === 'string' && plan.inventory.length > 0` (throws if empty/absent)
- Patches plan status from `'reading'` → `'analyzing'`
- Returns `{ status: 'completed', yields: {} }`

### `decision-review` (`packages/plugins/astrolabe/src/engines/decision-review.ts`)

```
run(givens: { planId: string }, context: EngineRunContext) → EngineRunResult
```

**First run** (`plan.status === 'analyzing'`):
- Fast-path: if no decisions AND no scope, patches status to `'writing'`, returns completed immediately with `{ decisionSummary: '' }`
- Maps each `Decision` → `ChoiceQuestionSpec` (key = decision.id, `allowCustom: true`)
- Maps each `ScopeItem` → `BooleanQuestionSpec` (key = `scope:${item.id}`)
- Pre-fills `answers` map: decisions with recommendations get `{ selected: recommendation }`, scope items get `item.included`
- Composes `message` by calling `clerk.show(planId)` to get the writ title (falls back gracefully)
- Creates `InputRequestDoc` via `generateId('ir', 4)` and writes to `spider/input-requests` book
- Patches plan status to `'reviewing'`
- Returns `{ status: 'blocked', blockType: 'patron-input', condition: { requestId } }`

**Re-run** (`plan.status === 'reviewing'`):
- Recovers `requestId` from `context.priorBlock.condition.requestId` (fallback: queries book by rigId+engineId)
- Loads the completed `InputRequestDoc`
- Reconciles `answers`: scope keys update `item.included`; decision keys set `decision.selected` (for `{ selected }` answers) or `decision.patronOverride` (for `{ custom }` answers)
- Calls `buildDecisionSummary(decisions, scopeItems)` → markdown string
- Patches plan with updated decisions, scope, and status `'writing'`
- Returns `{ status: 'completed', yields: { decisionSummary: <markdown string> } }`

**Note:** Does NOT validate that all decisions are resolved. No consistency checks are performed.

`composeDetails(context, rationale)` helper: combines context + rationale into the `details` field for the question spec.

`buildDecisionSummary(decisions, scope)` helper: builds markdown with `## Decisions` and `## Scope` sections.

---

## Current Rig Template (`planningTemplate` in `astrolabe.ts`)

```
plan-init → draft → reader → inventory-check → analyst → decision-review → spec-writer → seal
```

`resolutionEngine: 'spec-writer'`

**spec-writer engine givens (current):**
```javascript
{
  role: 'astrolabe.sage',
  prompt: 'MODE: WRITER\n\nPlan ID: ${yields.plan-init.planId}\n\n' +
          'You are continuing the analyst conversation. Use plan-show to read the full ' +
          'plan including patron-reviewed decisions, then write the specification using spec-write.',
  cwd: '${yields.draft.path}',
  conversationId: '${yields.analyst.conversationId}',
  writ: '${writ}',
}
```

**Gap:** The `decisionSummary` yield from `decision-review` is NOT injected into the spec-writer prompt. The doc (`astrolabe.md`) describes wiring it as `${yields.decision-review.decisionSummary}`, but this is absent from the template.

---

## Current Sage Role

In `astrolabe.ts` supportKit:
```typescript
sage: {
  permissions: ['astrolabe:read', 'astrolabe:write', 'clerk:read'],
  strict: true,
  instructionsFile: 'sage.md',
}
```

**Gap:** `clerk:write` is absent. The sage cannot call `commission-post` (requires `clerk:write`) or `writ-link` (requires `clerk:write`). This is the core permission gap for writ linking.

---

## Writ Linking — What's Missing

The following are defined but not wired:
1. **No `generatedWritId` population** — `PlanDoc.generatedWritId` is declared but no code ever sets it.
2. **No `'completed'` status transition** — PlanDoc transitions through `reading → analyzing → reviewing → writing` but the pipeline ends at `'writing'` with no further transition.
3. **No writ posting** — No engine or tool in the current astrolabe code calls `clerk.post()` to create the mandate writ.
4. **No link creation** — No engine or tool calls `clerk.link(mandateId, briefId, 'refines')`.
5. **No `commission-post` / `writ-link` tool in sage's toolset** — The seven astrolabe tools are all plan-document tools (`plan-show`, `plan-list`, `inventory-write`, `scope-write`, `decisions-write`, `observations-write`, `spec-write`). None triggers a writ posting or linking operation.

---

## Adjacent Patterns

### How other engines handle post-session cleanup

The `seal` engine (after spec-writer) is a clockwork engine that abandons the draft. This is the pattern for "post-anima-session cleanup" — a dedicated clockwork step. The `implement` → `review` → `revise` → `seal` pipeline in the default rig uses the same pattern.

### How writ linking is done elsewhere

In `packages/plugins/clerk/src/tools/writ-link.ts`:
```typescript
clerk.link(params.sourceId, params.targetId, params.type)
```
The Clerk API's `link()` requires both writs to exist. It creates a `WritLinkDoc` with key `{sourceId}:{targetId}:{type}` (idempotent).

There is no existing precedent for a clockwork engine calling `clerk.link()` — all existing link calls are via the `writ-link` tool (from anima sessions or patron CLI use). A new clockwork engine that posts a writ and links it would be novel.

### How `commission-post` works

`packages/plugins/clerk/src/tools/commission-post.ts` — calls `clerk.post({ title, body, type, codex })`. The type is validated against registered types; `astrolabe.AstrolabeConfig.generatedWritType` controls what type to use (default: `'mandate'`). The body is presumably the generated spec content.

### Other two-step engines (post + link in one step)

No precedent in the codebase. The closes analog is the `implement` engine, which launches an anima session, but does not also post a writ.

---

## Test Patterns Used

All test files follow a consistent pattern:
- **Import:** `node:test` (`describe`, `it`, `beforeEach`, `afterEach`), `node:assert/strict`
- **Stacks:** `MemoryBackend` from `@shardworks/stacks-apparatus/testing`; `memBackend.ensureBook(...)` to set up books with indexes
- **Guild:** `setGuild(fakeGuild)` / `clearGuild()` (in `beforeEach`/`afterEach`)
- **Engine context:** Inline `buildCtx()` helper returning `EngineRunContext` with `rigId`, `engineId`, `upstream`
- **No mocking framework** — pure manual mocks (e.g., `mockClerkApi`)
- **Assertion style:** `assert.equal`, `assert.deepEqual`, `assert.ok`, `assert.rejects`

The `engines.test.ts` registers a `mockClerkApi` in the apparatus map to avoid needing a real Clerk apparatus. Any new engine test that calls `clerk.link()` or `clerk.post()` will need to extend this mock.

---

## Doc/Code Discrepancies

1. **`requires` vs `recommends`:** `astrolabe.md` says `requires: [clerk, stacks, spider, loom, fabricator]`. The code has `requires: ['stacks', 'clerk']` and `recommends: ['spider', 'loom', 'fabricator', 'oculus']`. The doc is the aspirational design; the code is correct for the current implementation.

2. **`decisionSummary` injection:** `astrolabe.md` says: "the `decision-review` engine yields a `decisionSummary` string, wired into the prompt as `${yields.decision-review.decisionSummary}`". The current spec-writer prompt in `astrolabe.ts` does NOT include this interpolation.

3. **`decision-review` consistency validation:** `astrolabe.md` says the engine "validates all decisions resolved and scope is consistent". The current implementation does not validate anything after reconciliation.

4. **Spec-writer writ posting:** `astrolabe.md` says "Spec-writer ... posts the generated writ to the Clerk ... links generated writ back to the brief writ". No current code does this.

5. **`'completed'` status:** `PlanStatus` includes `'completed'` but nothing in the pipeline ever transitions to it. The pipeline stalls at `'writing'`.

---

## Existing Context

- **`docs/architecture/apparatus/astrolabe.md`** — marked "⚠️ Future state". Describes the full intended behavior including writ posting, linking, and `decisionSummary` injection. Treated as the design target.
- **`packages/plugins/astrolabe/sage.md`** — sage role system prompt, 12 lines. Does not mention writ posting, linking, or any commission-post behavior.

---

## Key Open Questions for Analysis

1. **Where does writ posting + linking happen?** Options:
   - (a) New clockwork engine `astrolabe.spec-publish` inserted after `spec-writer` in the rig template
   - (b) The sage anima does it (requires adding `clerk:write` to sage permissions + tools)
   - (c) `decision-review` handles it (seems wrong — too early in the pipeline)
   - (d) The spec-writer prompt instructs the anima to post + link (via existing `commission-post` + `writ-link` clerk tools, given `clerk:write` permission)

2. **Does `decisionSummary` need to be injected into spec-writer prompt?** The doc says yes, the code doesn't do it. Is this part of this commission?

3. **Should `decision-review` validate decision completeness?** Brief says "validates consistency" but current code doesn't. Is this part of this commission?

4. **What is the title and body of the generated writ?** The spec content is in `plan.spec`. The title presumably comes from the brief writ title. These details are unspecified.

5. **Does the PlanDoc need to transition to `'completed'`?** If so, which step does it? The seal engine only abandons the draft — it doesn't touch the PlanDoc.
