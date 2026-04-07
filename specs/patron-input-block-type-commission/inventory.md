# Inventory: Patron Input Block Type Commission

---

## Brief Summary

Add a `patron-input` block type to the Spider. Engines block by creating an `InputRequestDoc` in the `spider/input-requests` Stacks book, then returning `{ status: 'blocked', blockType: 'patron-input', condition: { requestId } }`. The checker polls the book for status transitions. The patron answers questions via new CLI tools, then explicitly completes or rejects the request. Rejection fails the engine via the standard `CheckResult { status: 'failed' }` path.

Also adds `rigId` to `EngineRunContext` in the Fabricator apparatus.

---

## Affected Files

### Files to create (new)

| Path | Purpose |
|------|---------|
| `packages/plugins/spider/src/block-types/patron-input.ts` | New block type: polls `input-requests` book by `requestId` |
| `packages/plugins/spider/src/tools/input-request-list.ts` | CLI: list pending input requests |
| `packages/plugins/spider/src/tools/input-request-show.ts` | CLI: show a request with questions/answers |
| `packages/plugins/spider/src/tools/input-request-answer.ts` | CLI: answer a single question |
| `packages/plugins/spider/src/tools/input-request-complete.ts` | CLI: complete a request (validates all answered) |
| `packages/plugins/spider/src/tools/input-request-reject.ts` | CLI: reject a request with optional reason |

### Files to modify

| Path | Change |
|------|--------|
| `packages/plugins/fabricator/src/fabricator.ts` | Add `rigId: string` to `EngineRunContext` |
| `packages/plugins/fabricator/src/index.ts` | No change needed (already re-exports `EngineRunContext`) |
| `packages/plugins/spider/src/spider.ts` | (1) Add `input-requests` book to `supportKit.books`; (2) Add `patron-input` to `supportKit.blockTypes`; (3) Add new CLI tools to `supportKit.tools`; (4) Pass `rigId: rig.id` in context assembled in `tryRun()` and `tryCollect()`; (5) Initialize `inputRequestsBook` in `start()` |
| `packages/plugins/spider/src/block-types/index.ts` | Export `patronInputBlockType` |
| `packages/plugins/spider/src/tools/index.ts` | Export six new tool defaults |
| `packages/plugins/spider/src/types.ts` | Add `InputRequestDoc`, question spec types, answer types, `InputRequestStatus` |
| `packages/plugins/spider/src/index.ts` | Re-export new public types from `types.ts` |
| `packages/plugins/spider/src/spider.test.ts` | Tests that construct `EngineRunContext` objects directly will need `rigId` added; tests that assert on `SpiderApi` mock already have all needed fields |

---

## Current Type Signatures (Verbatim from Code)

### `EngineRunContext` — `packages/plugins/fabricator/src/fabricator.ts` lines 26–45

```typescript
export interface EngineRunContext {
  /** Simple string identity for this engine instance (e.g. 'draft', 'implement'). */
  engineId: string;
  /** All upstream yields, keyed by engine id. */
  upstream: Record<string, unknown>;
  /**
   * Present when this engine was previously blocked and has been restarted.
   * Advisory — do not depend on for correctness.
   * Note: Defined inline to avoid a circular package dependency with spider-apparatus.
   * Shape matches spider-apparatus BlockRecord exactly.
   */
  priorBlock?: {
    type: string;
    condition: unknown;
    blockedAt: string;
    message?: string;
    lastCheckedAt?: string;
  };
}
```

**Change:** add `rigId: string` field.

### `BlockType` — `packages/plugins/spider/src/types.ts` lines 197–216

```typescript
export interface BlockType {
  id: string;
  check: (condition: unknown) => Promise<CheckResult>;
  conditionSchema: ZodSchema;
  pollIntervalMs?: number;
}
```

### `CheckResult` — `packages/plugins/spider/src/types.ts` lines 188–191

```typescript
export interface CheckResult {
  status: 'cleared' | 'pending' | 'failed';
  reason?: string;
}
```

### `BlockRecord` — `packages/plugins/spider/src/types.ts` lines 22–33

```typescript
export interface BlockRecord {
  type: string;
  condition: unknown;
  blockedAt: string;
  message?: string;
  lastCheckedAt?: string;
}
```

### `EngineRunResult` — `packages/plugins/fabricator/src/fabricator.ts` lines 55–58

```typescript
export type EngineRunResult =
  | { status: 'completed'; yields: unknown }
  | { status: 'launched'; sessionId: string }
  | { status: 'blocked'; blockType: string; condition: unknown; message?: string };
```

### `BookEntry` — `packages/plugins/stacks/src/types.ts` line 32

```typescript
export type BookEntry = { id: string } & Record<string, unknown>;
```

### `Book<T>` / `ReadOnlyBook<T>` — `packages/plugins/stacks/src/types.ts`

```typescript
export interface ReadOnlyBook<T extends BookEntry> {
  get(id: string): Promise<T | null>;
  find(query: BookQuery): Promise<T[]>;
  list(options?: ListOptions): Promise<T[]>;
  count(where?: WhereClause | { or: WhereClause[] }): Promise<number>;
}
export interface Book<T extends BookEntry> extends ReadOnlyBook<T> {
  put(entry: T): Promise<void>;
  patch(id: string, fields: Partial<Omit<T, 'id'>>): Promise<T>;
  delete(id: string): Promise<void>;
}
```

---

## New Types Required

### `InputRequestDoc` (new, lives in `spider/src/types.ts`)

Document stored in `spider/input-requests` book.

```typescript
export type InputRequestStatus = 'pending' | 'completed' | 'rejected';

export type QuestionType = 'choice' | 'boolean' | 'text';

export interface ChoiceQuestionSpec {
  type: 'choice';
  label: string;
  options: Record<string, string>;   // key → display label
  allowCustom: boolean;
}
export interface BooleanQuestionSpec {
  type: 'boolean';
  label: string;
}
export interface TextQuestionSpec {
  type: 'text';
  label: string;
}
export type QuestionSpec = ChoiceQuestionSpec | BooleanQuestionSpec | TextQuestionSpec;

// Discriminated answer for choice questions
export type ChoiceAnswer = { selected: string } | { custom: string };
// Answer union across all question types
export type AnswerValue = ChoiceAnswer | boolean | string;

export interface InputRequestDoc {
  [key: string]: unknown;              // BookEntry constraint
  id: string;                          // ULID-style via generateId()
  rigId: string;
  engineId: string;
  status: InputRequestStatus;
  questions: Record<string, QuestionSpec>;   // questionKey → spec
  answers: Record<string, AnswerValue>;       // questionKey → answer (partial until completed)
  rejectionReason?: string;            // set on rejection
  createdAt: string;                   // ISO timestamp
  updatedAt: string;                   // ISO timestamp
}
```

---

## Functions That Will Change

### `tryRun()` — `packages/plugins/spider/src/spider.ts` lines 574–703

Context assembly at line ~594–599:
```typescript
// CURRENT:
const context = {
  engineId: pending.id,
  upstream,
  ...(priorBlock ? { priorBlock } : {}),
};

// CHANGE TO:
const context = {
  engineId: pending.id,
  rigId: rig.id,   // ADD THIS
  upstream,
  ...(priorBlock ? { priorBlock } : {}),
};
```

### `tryCollect()` — `packages/plugins/spider/src/spider.ts` line 436

Context assembly for `collect()` call:
```typescript
// CURRENT:
const context = { engineId: engine.id, upstream };

// CHANGE TO:
const context = { engineId: engine.id, rigId: rig.id, upstream };
```

### `start()` — `packages/plugins/spider/src/spider.ts` lines 876–965

Must initialize a `Book<InputRequestDoc>` variable alongside `rigsBook`.

Must add `input-requests` to the `supportKit.books` declaration.

Must add `patronInputBlockType` to `supportKit.blockTypes`.

Must add new tools to `supportKit.tools` array.

---

## Existing Block Types (Reference Implementations)

### `writ-status.ts` — closest analog

```typescript
const writStatusBlockType: BlockType = {
  id: 'writ-status',
  conditionSchema: z.object({ writId: z.string(), targetStatus: z.string() }),
  pollIntervalMs: 10_000,
  async check(condition: unknown): Promise<CheckResult> {
    const { writId, targetStatus } = conditionSchema.parse(condition);
    const stacks = guild().apparatus<StacksApi>('stacks');
    const writsBook = stacks.readBook<WritDoc>('clerk', 'writs');
    const results = await writsBook.find({ where: [['id', '=', writId]], limit: 1 });
    if (results.length === 0) return { status: 'failed', reason: 'Writ not found' };
    const writ = results[0];
    if (writ.status === targetStatus) return { status: 'cleared' };
    if (TERMINAL_STATUSES.has(writ.status)) {
      return { status: 'failed', reason: `Writ reached terminal status...` };
    }
    return { status: 'pending' };
  },
};
```

Notes:
- Uses `guild().apparatus<StacksApi>('stacks')` inside `check()` — same pattern needed for `patron-input`
- Uses `readBook()` (read-only cross-plugin access) for querying — appropriate since the checker reads but does not write
- Zod validates condition at check time (belt and suspenders, condition was validated by Spider at block time)
- Returns `{ status: 'failed', reason: '...' }` for permanent failures

### `scheduled-time.ts` — no stacks dependency

No book access needed. `pollIntervalMs: 30_000`.

### `book-updated.ts` — per-document and per-book variants

Uses `stacks.readBook<BookEntry>(ownerId, book)` with dynamic book name.

---

## Spider `supportKit` (Current, for Reference)

```typescript
supportKit: {
  books: {
    rigs: {
      indexes: ['status', 'writId', ['status', 'writId'], 'createdAt'],
    },
  },
  engines: {
    draft:     draftEngine,
    implement: implementEngine,
    review:    reviewEngine,
    revise:    reviseEngine,
    seal:      sealEngine,
  },
  blockTypes: {
    'writ-status':    writStatusBlockType,
    'scheduled-time': scheduledTimeBlockType,
    'book-updated':   bookUpdatedBlockType,
  },
  tools: [crawlOneTool, crawlContinualTool, rigShowTool, rigListTool, rigForWritTool, rigResumeTool],
},
```

**Changes needed:**
- Add `input-requests` book entry with appropriate indexes
- Add `'patron-input': patronInputBlockType` to `blockTypes`
- Add six new tools to `tools` array

---

## Book Registration Pattern

Books are declared in `supportKit.books` — key is the book name, value is a `BookSchema`. The `ownerId` is inferred from the apparatus's plugin ID (e.g. `spider`). The Stacks apparatus scans `books` contributions from kits/supportKits at startup and creates indexes.

Example from `clerk.ts`:
```typescript
supportKit: {
  books: {
    writs: {
      indexes: ['status', 'type', 'createdAt', ['status', 'type'], ['status', 'createdAt']],
    },
    links: {
      indexes: ['sourceId', 'targetId', 'type', ['sourceId', 'type'], ['targetId', 'type']],
    },
  },
  tools: [...],
},
```

For `input-requests`, the checker queries by id (`book.get(requestId)`) — id is primary key, no index needed. List tool queries by `status`. Engine queries by `rigId + engineId + status`. Recommended indexes:

```typescript
'input-requests': {
  indexes: ['status', 'rigId', 'engineId', 'createdAt', ['rigId', 'engineId', 'status']],
},
```

---

## Stacks Access Pattern in Spider

At `start()`, spider initializes:
```typescript
rigsBook = stacks.book<RigDoc>('spider', 'rigs');
sessionsBook = stacks.readBook<SessionDoc>('animator', 'sessions');
writsBook = stacks.readBook<WritDoc>('clerk', 'writs');
```

New pattern needed:
```typescript
inputRequestsBook = stacks.book<InputRequestDoc>('spider', 'input-requests');
```

The block checker uses `stacks.readBook()` (via `guild().apparatus<StacksApi>('stacks')`) since it is a stateless function that doesn't hold a reference to the book handle. The CLI tools will do the same pattern — call `guild().apparatus<StacksApi>('stacks').book('spider', 'input-requests')` inside the handler.

---

## CLI Tool Pattern (Reference)

All tools follow this pattern:
```typescript
import { z } from 'zod';
import { guild } from '@shardworks/nexus-core';
import { tool } from '@shardworks/tools-apparatus';
import type { SomeApi } from '../types.ts';

export default tool({
  name: 'verb-noun',
  description: '...',
  instructions: '...',
  params: {
    id: z.string().describe('The thing id.'),
  },
  permission: 'spider:write',  // or 'spider:read'
  handler: async (params) => {
    const api = guild().apparatus<SomeApi>('spider');
    // ...
  },
});
```

For read operations: `permission: 'spider:read'` or `permission: 'read'` (varies by plugin — spider uses `spider:write` for mutation tools, `'read'` for list/show).

Checking existing spider tools:
- `rig-list.ts`: `permission: 'read'`
- `rig-show.ts`: `permission: 'read'`
- `crawl-one.ts`: `permission: 'spider:write'`
- `rig-resume.ts`: `permission: 'spider:write'`

New tools permission estimates:
- `input-request-list`: `permission: 'read'`
- `input-request-show`: `permission: 'read'`
- `input-request-answer`: `permission: 'spider:write'`
- `input-request-complete`: `permission: 'spider:write'`
- `input-request-reject`: `permission: 'spider:write'`

---

## Request Lifecycle Flow

1. **Engine creates request and blocks:**
   - Engine assembles `InputRequestDoc` with questions, writes to `input-requests` book via `stacks.book('spider', 'input-requests').put(doc)`
   - Engine returns `{ status: 'blocked', blockType: 'patron-input', condition: { requestId: doc.id }, message?: '...' }`
   - Spider's `tryRun()` validates condition via `conditionSchema`, persists `BlockRecord` on engine instance, transitions engine/rig to `blocked`

2. **Patron answers questions via CLI tools:**
   - `input-request-list` — shows all `status: 'pending'` requests
   - `input-request-show` — shows request detail with question labels and current answers
   - `input-request-answer` — validates answer against question type, patches `answers[questionKey]` and `updatedAt`

3. **Patron completes or rejects:**
   - `input-request-complete` — validates all questions answered, transitions `status` to `completed`
   - `input-request-reject` — transitions `status` to `rejected`, sets `rejectionReason`

4. **Checker clears or fails the block:**
   - Spider's `tryCheckBlocked()` calls `patronInputBlockType.check({ requestId })`
   - Checker calls `stacks.readBook('spider', 'input-requests').get(requestId)`
   - `status === 'completed'` → `{ status: 'cleared' }`
   - `status === 'rejected'` → `{ status: 'failed', reason: rejectionReason ?? 'Request rejected by patron' }`
   - `status === 'pending'` → `{ status: 'pending' }`
   - document not found → `{ status: 'failed', reason: 'Input request not found' }`

5. **Engine resumes:**
   - Spider transitions engine back to `pending`, stores `priorBlock` in `pendingPriorBlocks` map
   - Next `tryRun()` builds `context` with `rigId` and `priorBlock`
   - Engine queries `input-requests` book: `stacks.readBook('spider', 'input-requests').find({ where: [['rigId', '=', context.rigId], ['engineId', '=', context.engineId], ['status', '=', 'completed']], orderBy: ['createdAt', 'desc'], limit: 1 })`
   - Engine reads answers and continues work

---

## Engine-Side Usage Pattern (How Engines Block and Resume)

### Blocking (first run)
```typescript
async run(givens, context) {
  if (!context.priorBlock) {
    // First time — create request and block
    const stacks = guild().apparatus<StacksApi>('stacks');
    const requestsBook = stacks.book<InputRequestDoc>('spider', 'input-requests');
    const requestId = generateId('ir', 4);  // or similar prefix
    await requestsBook.put({
      id: requestId,
      rigId: context.rigId,
      engineId: context.engineId,
      status: 'pending',
      questions: { /* ... */ },
      answers: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    return { status: 'blocked', blockType: 'patron-input', condition: { requestId } };
  }
  // Resumed — fall through to query answers
}
```

### Resuming (second run)
```typescript
// Context has priorBlock (and rigId always now)
const stacks = guild().apparatus<StacksApi>('stacks');
const requestsBook = stacks.readBook<InputRequestDoc>('spider', 'input-requests');
const [request] = await requestsBook.find({
  where: [
    ['rigId', '=', context.rigId],
    ['engineId', '=', context.engineId],
    ['status', '=', 'completed'],
  ],
  orderBy: ['createdAt', 'desc'],
  limit: 1,
});
const answers = request.answers;
// ... use answers to proceed
```

---

## Existing Test Patterns

### Spider test setup — `spider.test.ts`

Tests use `buildFixture()` which starts Stacks, Clerk, Fabricator, and Spider with an in-memory backend. Block type tests use a separate `buildBlockingFixture()` helper (defined around line 3250) that fires `plugin:initialized` to register custom block types.

Spider test file is large (~4300+ lines). Key sections relevant to this commission:
- Lines ~3250–3310: `buildBlockingFixture()` helper for block type tests
- Lines ~3312–3400: Crawl phase ordering tests (block check before run)
- Lines ~3381–3406: Block type registry tests
- Lines ~3408–3456: Engine blocked result → block record persistence
- Lines ~3458–3488: Unregistered block type → engine failure
- Lines ~4060–4295: `priorBlock` context tests, `rig-resume` tool tests

Tests construct `EngineRunContext` directly in several places — these will need `rigId` added:
- Line ~3322: `ctx: EngineRunContext` used in custom engine `run()` to check `ctx.priorBlock`
- Line ~4145, ~4240: same pattern

In mock contexts, `rigId` is not currently passed. After adding it to the interface, tests that read `ctx.rigId` in mock engines will need a valid value. Tests that don't use `ctx.rigId` just need TypeScript to be happy — the Spider will always pass it.

### Tools test pattern — `spider/src/tools/tools.test.ts`

Mock `SpiderApi` already has all required fields (line ~27–36). Any new tools will be testable via the same `setGuild()` pattern.

---

## `generateId()` — `packages/framework/core/src/id.ts`

```typescript
export function generateId(prefix: string, randomByteCount: number = 6): string {
  const ts = Date.now().toString(36);
  const rand = crypto.randomBytes(randomByteCount).toString('hex');
  return `${prefix}-${ts}-${rand}`;
}
```

Generates IDs like `rig-m1234abc-deadbeef1234`. NOT ULID format (see discrepancies below). Exported from `@shardworks/nexus-core`.

---

## Package Metadata

All plugin packages follow this structure:
- `"name": "@shardworks/{name}-apparatus"` 
- `"type": "module"`
- `"exports": { ".": "./src/index.ts" }`
- Dependencies: `@shardworks/nexus-core`, `@shardworks/stacks-apparatus`, `@shardworks/tools-apparatus`, `zod`

No new package needed — all new code lives in `@shardworks/spider-apparatus`.

---

## Adjacent Patterns

### How clerk.ts structures its apparatus

```typescript
return {
  apparatus: {
    requires: ['stacks'],
    supportKit: {
      books: { writs: { indexes: [...] }, links: { indexes: [...] } },
      tools: [...],
    },
    provides: api,
    start(_ctx: StartupContext): void {
      const stacks = guild().apparatus<StacksApi>('stacks');
      writs = stacks.book<WritDoc>('clerk', 'writs');
      links = stacks.book<WritLinkDoc>('clerk', 'links');
    },
  },
};
```

Spider will follow the same pattern for the `inputRequestsBook` variable initialization.

### How clerk tools handle state mutations

`writ-cancel.ts` style — call apparatus API method that encapsulates validation and mutation:
```typescript
handler: async (params) => {
  const clerk = guild().apparatus<ClerkApi>('clerk');
  return clerk.transition(params.id, 'cancelled', ...);
},
```

For input-request tools, since there's no high-level Spider API covering input requests (it's not in `SpiderApi`), tools will directly use Stacks: `guild().apparatus<StacksApi>('stacks').book<InputRequestDoc>('spider', 'input-requests')`.

---

## Existing Scratch Notes / TODOs / In-Progress Docs

- `docs/in-progress/parlour-implementation-tracker.md` — unrelated (Parlour apparatus)
- `docs/feature-specs/stacks-specification-v2-enhancements.md` — Stacks, not Spider
- `docs/feature-specs/clerk-patron-assessment.md` — unrelated
- No existing scratch notes or TODOs referencing patron input, blocking engines, or `patron-input` block type found

---

## Doc/Code Discrepancies

1. **"ULID format" in brief vs `generateId()` in code.** The brief says "Request IDs use the system's standard ULID format." The system uses `generateId(prefix, byteCount)` from `@shardworks/nexus-core`, which produces `{prefix}-{base36_timestamp}-{hex_random}` — not ULID. The IDs are time-sortable but use a different encoding. The implementation should use `generateId()`.

2. **`docs/guides/building-engines.md` describes a legacy architecture.** The guide references an `engine()` factory, `nexus-engine.json` descriptors, and standing orders — none of which match the current codebase. Current engines implement `EngineDesign` from `@shardworks/fabricator-apparatus` and are contributed via kit `engines` contributions. The guide is stale.

3. **`docs/architecture/kit-components.md` references wrong package for `tool()`.** The doc says tools use `tool()` from `@shardworks/nexus-core`. The code imports from `@shardworks/tools-apparatus`.

4. **`docs/architecture/apparatus/spider.md` is significantly out of date.** It describes only the static 5-engine pipeline from MVP scope. It does not document: block types, block records, `priorBlock` context, `checkBlocked` crawl phase, `rig-blocked` status, rig templates, or the `consumes: ['blockTypes']` mechanism. The implementation has advanced well beyond the doc.

5. **`docs/architecture/apparatus/spider.md` CrawlResult shape.** The doc shows 4 variants; the code has 7 (adding `engine-blocked`, `engine-unblocked`, `rig-blocked`).

---

## Key Constraints from Brief

- Block type ID: `'patron-input'`
- Condition shape: `{ requestId: string }`
- Poll interval: 10s (`pollIntervalMs: 10_000`)
- `CheckResult` returns:
  - `cleared` when request status is `'completed'`
  - `failed` (with reason) when request status is `'rejected'`
  - `pending` otherwise
- Completion is **two-phase** — answering questions does not unblock; patron must explicitly call complete/reject
- Rejection → `{ status: 'failed', reason: '...' }` → Spider fails engine → rig fails → writ fails (standard path)
- Engine resumes via `input-requests` book query (`rigId + engineId + status: 'completed'`), NOT via `priorBlock.condition.requestId`
- `rigId` must be added to `EngineRunContext` in Fabricator (needed for engine-side query on resume)
- Request lifecycle: `pending → completed | rejected` (no other transitions)
- Completion check: all questions must be answered before completing; reject can happen at any time
- Choice answers are discriminated objects: `{ selected: string } | { custom: string }`
- CLI uses `--select KEY` / `--custom VALUE` flags for choice answers
- `selected` validated against options map; `custom` only accepted when `allowCustom: true`
