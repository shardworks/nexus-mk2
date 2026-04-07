---
author: plan-writer
estimated_complexity: 8
---

# Patron Input Block Type

## Summary

Add a `patron-input` block type to the Spider so engines can pose structured questions to the patron, block until answered, and resume with the responses. Includes the data model, block checker, seven CLI tools, YAML export/import, and the addition of `rigId` to `EngineRunContext`.

## Current State

**EngineRunContext** (`packages/plugins/fabricator/src/fabricator.ts` lines 26–45):

```typescript
export interface EngineRunContext {
  /** Simple string identity for this engine instance (e.g. 'draft', 'implement'). */
  engineId: string;
  /** All upstream yields, keyed by engine id. */
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

**Existing block types** (`packages/plugins/spider/src/block-types/`): `writ-status`, `scheduled-time`, `book-updated`. All follow the same pattern — standalone module exporting a `BlockType` object with `id`, `conditionSchema`, `pollIntervalMs`, and `check()`.

**Spider supportKit** (`packages/plugins/spider/src/spider.ts` lines 853–872) declares one book (`rigs`), five engines, three block types, and six tools. Block types are registered via the `blockTypes` key on `supportKit`; the Spider's `consumes: ['blockTypes']` mechanism scans kits for this key at startup.

**Context assembly** happens at two sites in `spider.ts`:
- `tryRun()` line ~595: `const context = { engineId: pending.id, upstream, ...(priorBlock ? { priorBlock } : {}) };`
- `tryCollect()` line ~436: `const context = { engineId: engine.id, upstream };`

Neither currently passes `rigId`.

## Requirements

- R1: `EngineRunContext` in `@shardworks/fabricator-apparatus` must include a `rigId: string` field, positioned before `engineId`.
- R2: The Spider must pass `rigId: rig.id` in every `EngineRunContext` it constructs — both in `tryRun()` and `tryCollect()`.
- R3: New types must be added to `packages/plugins/spider/src/types.ts`: `InputRequestStatus`, `QuestionType`, `ChoiceQuestionSpec`, `BooleanQuestionSpec`, `TextQuestionSpec`, `QuestionSpec`, `ChoiceAnswer`, `AnswerValue`, and `InputRequestDoc`.
- R4: The Spider must declare an `input-requests` book in `supportKit.books` with indexes `['status', 'rigId', 'engineId', 'createdAt', ['rigId', 'engineId', 'status']]`.
- R5: A `patron-input` block type must be registered in `supportKit.blockTypes`. It must poll every 10 seconds, accept condition `{ requestId: string }`, and return `cleared` when the request status is `completed`, `failed` (with reason) when `rejected`, `failed` when the document is not found, and `pending` otherwise.
- R6: The `input-request-answer` tool must accept choice answers via mutually exclusive `--select` and `--custom` params. `selected` must be validated against the question's options map. `custom` must only be accepted when `allowCustom` is true. Boolean and text answers use a `--value` param; boolean values must be `'true'` or `'false'`.
- R7: The `input-request-complete` tool must throw an error listing unanswered question keys when any questions lack answers. When all questions are answered, it must transition status to `completed` and return the updated document.
- R8: The `input-request-reject` tool must transition status to `rejected` with an optional `rejectionReason`, regardless of how many questions have been answered.
- R9: All mutation tools (`answer`, `complete`, `reject`) must throw if the request status is not `pending`.
- R10: The `input-request-answer` tool must allow overwriting previously-given answers while the request is pending.
- R11: The `input-request-list` tool must default to filtering by `status: 'pending'`, with an optional `--status` override.
- R12: All input-request tools must not specify `callableBy` (available to all caller types: cli, anima, library).
- R13: A shared validation module must exist at `packages/plugins/spider/src/input-request-validation.ts` containing answer validation logic used by the answer tool, complete tool, and import tool.
- R14: An `input-request-export` tool must return a YAML string containing the request `id`, `message`, `questions`, and current `answers`.
- R15: An `input-request-import` tool must accept a file path, parse the YAML, validate all answers using the shared validation module, and patch the request's `answers` and `updatedAt`.
- R16: New types must be re-exported from `packages/plugins/spider/src/index.ts`.
- R17: Existing tests in `spider.test.ts` that directly construct `EngineRunContext` objects must be updated to include `rigId`.
- R18: New tests for the block type checker, CLI tools, and validation logic must live in `packages/plugins/spider/src/input-request.test.ts` and `packages/plugins/spider/src/input-request-validation.test.ts`.
- R19: The `input-requests` book must be ensured in the existing `buildBlockingFixture()` helper in `spider.test.ts`.
- R20: The `yaml` npm package must be added to `packages/plugins/spider/package.json` dependencies.

## Design

### Type Changes

Add to `packages/plugins/spider/src/types.ts`:

```typescript
// ── Input request types ──────────────────────────────────────────────

export type InputRequestStatus = 'pending' | 'completed' | 'rejected';

export interface ChoiceQuestionSpec {
  type: 'choice';
  /** Human-readable question text. */
  label: string;
  /** Key → display label options map. */
  options: Record<string, string>;
  /** When true, the patron can supply a freeform answer instead of selecting. */
  allowCustom: boolean;
}

export interface BooleanQuestionSpec {
  type: 'boolean';
  /** Human-readable question text. */
  label: string;
}

export interface TextQuestionSpec {
  type: 'text';
  /** Human-readable question text. */
  label: string;
}

export type QuestionSpec = ChoiceQuestionSpec | BooleanQuestionSpec | TextQuestionSpec;

/** Discriminated choice answer — selected from options or freeform custom. */
export type ChoiceAnswer = { selected: string } | { custom: string };

/**
 * Answer value union. Runtime type is determined by the corresponding QuestionSpec:
 * - choice → ChoiceAnswer (object with 'selected' or 'custom' key)
 * - boolean → boolean
 * - text → string
 */
export type AnswerValue = ChoiceAnswer | boolean | string;

/**
 * An input request document stored in the spider/input-requests book.
 * Created by engines before blocking; answered by patrons via CLI tools.
 */
export interface InputRequestDoc {
  [key: string]: unknown;
  /** Unique ID via generateId('ir', 4). */
  id: string;
  /** Rig this request belongs to. */
  rigId: string;
  /** Engine that created this request. */
  engineId: string;
  /** Request lifecycle status. */
  status: InputRequestStatus;
  /** Optional human-readable context from the engine. */
  message?: string;
  /** Question key → question spec. */
  questions: Record<string, QuestionSpec>;
  /** Question key → answer value. Partially filled until completion. */
  answers: Record<string, AnswerValue>;
  /** Set when status transitions to 'rejected'. */
  rejectionReason?: string;
  /** ISO timestamp when the request was created. */
  createdAt: string;
  /** ISO timestamp of the last mutation. */
  updatedAt: string;
}
```

Modify `packages/plugins/fabricator/src/fabricator.ts` — the full new `EngineRunContext`:

```typescript
/** Minimal execution context passed to an engine's run() method. */
export interface EngineRunContext {
  /** The rig this engine instance belongs to. */
  rigId: string;
  /** Simple string identity for this engine instance (e.g. 'draft', 'implement'). */
  engineId: string;
  /** All upstream yields, keyed by engine id. Escape hatch for engines that need to inspect the full upstream chain. */
  upstream: Record<string, unknown>;
  /**
   * Present when this engine was previously blocked and has been restarted.
   * Advisory — do not depend on for correctness.
   *
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

### Behavior

#### Block type checker (`packages/plugins/spider/src/block-types/patron-input.ts`)

Follow the `writ-status.ts` pattern exactly:

- When `check()` is called, parse condition via `conditionSchema` (`z.object({ requestId: z.string() })`).
- Get the book: `guild().apparatus<StacksApi>('stacks').readBook<InputRequestDoc>('spider', 'input-requests')`.
- Call `book.get(requestId)`. When the document is `null`, return `{ status: 'failed', reason: 'Input request not found' }`.
- When `doc.status === 'completed'`, return `{ status: 'cleared' }`.
- When `doc.status === 'rejected'`, return `{ status: 'failed', reason: doc.rejectionReason ?? 'Request rejected by patron' }`.
- Otherwise return `{ status: 'pending' }`.
- `pollIntervalMs: 10_000`.

#### Validation module (`packages/plugins/spider/src/input-request-validation.ts`)

Export a function `validateAnswer(question: QuestionSpec, answer: unknown): AnswerValue` that:

- For `question.type === 'choice'`:
  - When `answer` is an object with a `selected` key (and no `custom` key): validate that `answer.selected` is a key in `question.options`. Throw if not.
  - When `answer` is an object with a `custom` key (and no `selected` key): validate that `question.allowCustom` is true. Throw `'Custom answers not allowed for this question'` if false.
  - When `answer` has neither or both keys: throw `'Choice answer must have exactly one of "selected" or "custom"'`.
- For `question.type === 'boolean'`:
  - Accept `true`, `false` (boolean). Also accept strings `'true'`, `'false'` and convert to boolean. Throw on any other value.
- For `question.type === 'text'`:
  - Accept any string. Throw if not a string.

Export a function `validateAllAnswered(questions: Record<string, QuestionSpec>, answers: Record<string, AnswerValue>): string[]` that returns the list of question keys that are present in `questions` but absent in `answers`. Used by the complete tool to list unanswered questions.

#### Context assembly changes in `spider.ts`

In `tryRun()` (line ~595), change the context object to:

```typescript
const context = {
  rigId: rig.id,
  engineId: pending.id,
  upstream,
  ...(priorBlock ? { priorBlock } : {}),
};
```

In `tryCollect()` (line ~436), change the context object to:

```typescript
const context = { rigId: rig.id, engineId: engine.id, upstream };
```

#### Spider supportKit changes in `spider.ts`

Add to `supportKit.books`:

```typescript
'input-requests': {
  indexes: ['status', 'rigId', 'engineId', 'createdAt', ['rigId', 'engineId', 'status']],
},
```

Add to `supportKit.blockTypes`:

```typescript
'patron-input': patronInputBlockType,
```

Add all seven new tools to the `supportKit.tools` array (alongside the six existing tools).

Import `patronInputBlockType` from `'./block-types/index.ts'` (barrel import alongside existing block types).

No module-level book handle variable is needed — the spider core never accesses the `input-requests` book directly.

#### CLI tools

All tools access the book via `guild().apparatus<StacksApi>('stacks').book<InputRequestDoc>('spider', 'input-requests')` inside the handler. None specify `callableBy` (patron override — available to all callers).

**`input-request-list`** (`packages/plugins/spider/src/tools/input-request-list.ts`):
- Name: `'input-request-list'`
- Permission: `'read'`
- Params: `status` (optional, enum `['pending', 'completed', 'rejected']`, default `'pending'`), `limit` (optional number, default 20), `offset` (optional number)
- Handler: query `book.find({ where: [['status', '=', status]], orderBy: ['createdAt', 'desc'], limit, ...(offset ? { offset } : {}) })`
- Return the array of `InputRequestDoc`

**`input-request-show`** (`packages/plugins/spider/src/tools/input-request-show.ts`):
- Name: `'input-request-show'`
- Permission: `'read'`
- Params: `id` (string)
- Handler: `book.get(id)`. Throw `'Input request "${id}" not found'` if null.
- Return the `InputRequestDoc`

**`input-request-answer`** (`packages/plugins/spider/src/tools/input-request-answer.ts`):
- Name: `'input-request-answer'`
- Permission: `'spider:write'`
- Params:
  - `id` (string) — request ID
  - `question` (string) — question key
  - `select` (optional string) — for choice: option key to select
  - `custom` (optional string) — for choice: custom freeform answer
  - `value` (optional string) — for boolean/text answers
- Handler:
  1. `book.get(id)` — throw if not found
  2. Throw if `request.status !== 'pending'` with message `'Cannot answer: request status is "${request.status}"'`
  3. Throw if `question` is not a key in `request.questions` with message `'Question "${question}" not found in request'`
  4. Look up `questionSpec = request.questions[question]`
  5. Build the raw answer:
     - If `questionSpec.type === 'choice'`: require exactly one of `select` or `custom`. If `select` is provided, raw answer is `{ selected: select }`. If `custom` is provided, raw answer is `{ custom: custom }`. If both or neither, throw `'Provide exactly one of --select or --custom for choice questions'`.
     - If `questionSpec.type === 'boolean'` or `'text'`: require `value` param. Throw `'Provide --value for ${questionSpec.type} questions'` if missing. For choice params (`select`/`custom`) being present, throw `'Use --value for ${questionSpec.type} questions, not --select/--custom'`.
     - Pass `value` as the raw answer for boolean/text.
  6. Call `validateAnswer(questionSpec, rawAnswer)` to get the validated `AnswerValue`.
  7. `book.patch(id, { answers: { ...request.answers, [question]: validatedAnswer }, updatedAt: new Date().toISOString() })`
  8. Return the patched document.

**`input-request-complete`** (`packages/plugins/spider/src/tools/input-request-complete.ts`):
- Name: `'input-request-complete'`
- Permission: `'spider:write'`
- Params: `id` (string)
- Handler:
  1. `book.get(id)` — throw if not found
  2. Throw if `request.status !== 'pending'`
  3. Call `validateAllAnswered(request.questions, request.answers)`. If the returned array is non-empty, throw `'Cannot complete: unanswered questions: ${keys.join(", ")}'`
  4. `book.patch(id, { status: 'completed', updatedAt: new Date().toISOString() })`
  5. Return the patched document.

**`input-request-reject`** (`packages/plugins/spider/src/tools/input-request-reject.ts`):
- Name: `'input-request-reject'`
- Permission: `'spider:write'`
- Params: `id` (string), `reason` (optional string)
- Handler:
  1. `book.get(id)` — throw if not found
  2. Throw if `request.status !== 'pending'`
  3. `book.patch(id, { status: 'rejected', ...(reason ? { rejectionReason: reason } : {}), updatedAt: new Date().toISOString() })`
  4. Return the patched document.

**`input-request-export`** (`packages/plugins/spider/src/tools/input-request-export.ts`):
- Name: `'input-request-export'`
- Permission: `'read'`
- Params: `id` (string)
- Handler:
  1. `book.get(id)` — throw if not found
  2. Build export object: `{ id: request.id, message: request.message, questions: request.questions, answers: request.answers }`
  3. Use `import { stringify } from 'yaml'` to serialize. Return `{ yaml: stringify(exportObj) }`.

**`input-request-import`** (`packages/plugins/spider/src/tools/input-request-import.ts`):
- Name: `'input-request-import'`
- Permission: `'spider:write'`
- Params: `file` (string — file path)
- Handler:
  1. Read file via `import { readFile } from 'node:fs/promises'`. Parse with `import { parse } from 'yaml'`.
  2. Extract `id` and `answers` from parsed YAML. Throw if `id` is missing.
  3. `book.get(id)` — throw if not found. Throw if `request.status !== 'pending'`.
  4. For each key in `answers`: look up the question in `request.questions`, call `validateAnswer(questionSpec, answerValue)`. Throw on unknown question keys.
  5. `book.patch(id, { answers: { ...request.answers, ...validatedAnswers }, updatedAt: new Date().toISOString() })`
  6. Return the patched document.

#### Barrel exports

**`packages/plugins/spider/src/block-types/index.ts`** — add:
```typescript
export { default as patronInputBlockType } from './patron-input.ts';
```

**`packages/plugins/spider/src/tools/index.ts`** — add:
```typescript
export { default as inputRequestListTool } from './input-request-list.ts';
export { default as inputRequestShowTool } from './input-request-show.ts';
export { default as inputRequestAnswerTool } from './input-request-answer.ts';
export { default as inputRequestCompleteTool } from './input-request-complete.ts';
export { default as inputRequestRejectTool } from './input-request-reject.ts';
export { default as inputRequestExportTool } from './input-request-export.ts';
export { default as inputRequestImportTool } from './input-request-import.ts';
```

**`packages/plugins/spider/src/index.ts`** — add to the re-export block:
```typescript
export type {
  // ... existing exports ...
  InputRequestStatus,
  InputRequestDoc,
  ChoiceQuestionSpec,
  BooleanQuestionSpec,
  TextQuestionSpec,
  QuestionSpec,
  ChoiceAnswer,
  AnswerValue,
} from './types.ts';
```

### Non-obvious Touchpoints

- **`packages/plugins/spider/package.json`** — add `"yaml": "^2.0.0"` (or latest) to `dependencies` for the export/import tools.
- **`packages/plugins/spider/src/spider.test.ts`** — the `buildBlockingFixture()` helper (around line 3250) must add `memBackend.ensureBook({ ownerId: 'spider', book: 'input-requests' }, { indexes: [...] })` alongside the existing `rigs` book setup. Additionally, any test that directly constructs an `EngineRunContext` literal (for `collect()` calls or similar) must include `rigId`. The Spider will pass `rigId` automatically to engine `run()` functions, so test engines that receive context from the Spider need no changes.
- **`packages/plugins/fabricator/src/fabricator.test.ts`** — if any tests construct `EngineRunContext` objects directly, they need `rigId` added. Check for this.

## Validation Checklist

- V1 [R1, R2]: In a test, run an engine via Spider crawl. In the engine's `run()` function, assert that `context.rigId` is a non-empty string. Verify the same engine receives `rigId` in a `collect()` call by defining a quick engine with a `collect` method that captures and asserts `context.rigId`.
- V2 [R3]: Run `pnpm typecheck` in `packages/plugins/spider`. Verify the new types compile without errors. Import `InputRequestDoc` from `@shardworks/spider-apparatus` in a test file to confirm re-export works.
- V3 [R4, R16]: Verify the `input-requests` book is declared in the spider's supportKit. Confirm a `find()` query with `where: [['rigId', '=', 'x'], ['engineId', '=', 'y'], ['status', '=', 'completed']]` executes without error against the memory backend.
- V4 [R5]: Write a test that creates an `InputRequestDoc` with status `'pending'` in the book, calls the checker — asserts `{ status: 'pending' }`. Patch the doc to `'completed'` — asserts `{ status: 'cleared' }`. Create another doc with status `'rejected'` and `rejectionReason: 'bad'` — asserts `{ status: 'failed', reason: 'bad' }`. Call with a non-existent requestId — asserts `{ status: 'failed', reason: 'Input request not found' }`.
- V5 [R6, R10]: Call `input-request-answer` with `--select validKey` on a choice question. Assert the answer is `{ selected: 'validKey' }`. Call again with `--select otherKey` on the same question. Assert the answer is overwritten. Call with `--select invalidKey` — assert error. Call with `--custom text` when `allowCustom: false` — assert error. Call with `--custom text` when `allowCustom: true` — assert `{ custom: 'text' }`. Call with `--value true` on a boolean question — assert answer is `true`. Call with `--value hello` on a text question — assert answer is `'hello'`.
- V6 [R7]: Call `input-request-complete` when two of three questions are answered. Assert error message contains the unanswered question key. Answer the remaining question, then call complete. Assert success and returned doc has `status: 'completed'`.
- V7 [R8]: Call `input-request-reject` with `--reason 'not applicable'` on a pending request with partial answers. Assert success, `status: 'rejected'`, `rejectionReason: 'not applicable'`. Call without `--reason`. Assert success with no `rejectionReason` field (or undefined).
- V8 [R9]: After completing a request, attempt to call `input-request-answer` — assert error mentioning status. After rejecting a different request, attempt `input-request-complete` — assert error mentioning status.
- V9 [R11]: Call `input-request-list` with no params. Assert only pending requests are returned. Call with `--status completed`. Assert only completed requests are returned.
- V10 [R12]: Verify none of the seven tool definitions have a `callableBy` property set.
- V11 [R13]: Import `validateAnswer` in a test. Call with a choice question and `{ selected: 'validKey' }` — assert returns the answer. Call with `{ selected: 'badKey' }` — assert throws. Call with `{ custom: 'text' }` when `allowCustom: false` — assert throws. Call with `'true'` for boolean — assert returns `true`. Call with `'invalid'` for boolean — assert throws.
- V12 [R14, R15]: Export a pending request with two answered questions. Verify the YAML string contains the request `id`, `questions`, and `answers`. Save to a temp file, modify an answer, import. Verify the answer is updated and validates correctly. Import with an invalid answer — assert error.
- V13 [R17, R19]: Run `pnpm test` in `packages/plugins/spider`. Verify all existing tests pass (no regressions from the `rigId` addition).
- V14 [R18]: Verify test files `input-request.test.ts` and `input-request-validation.test.ts` exist and contain tests for the checker, all seven tools, and validation edge cases.
- V15 [R20]: Verify `"yaml"` appears in `packages/plugins/spider/package.json` under `dependencies`.

## Test Cases

**Block type checker:**
- Pending request → `{ status: 'pending' }`
- Completed request → `{ status: 'cleared' }`
- Rejected request with reason → `{ status: 'failed', reason: '<the reason>' }`
- Rejected request without reason → `{ status: 'failed', reason: 'Request rejected by patron' }`
- Non-existent requestId → `{ status: 'failed', reason: 'Input request not found' }`

**Answer validation (choice):**
- `{ selected: 'validKey' }` with key in options → accepted
- `{ selected: 'missingKey' }` with key not in options → throws
- `{ custom: 'text' }` with `allowCustom: true` → accepted
- `{ custom: 'text' }` with `allowCustom: false` → throws
- `{}` (neither key) → throws
- `{ selected: 'a', custom: 'b' }` (both keys) → throws

**Answer validation (boolean):**
- `true` → `true`
- `false` → `false`
- `'true'` → `true` (string coercion)
- `'false'` → `false` (string coercion)
- `'yes'` → throws
- `42` → throws

**Answer validation (text):**
- `'hello'` → `'hello'`
- `''` (empty string) → accepted
- `42` → throws

**input-request-answer tool:**
- Answering a choice question with `--select validKey` → answer is `{ selected: 'validKey' }`
- Answering a choice question with `--custom text` where `allowCustom: true` → answer is `{ custom: 'text' }`
- Providing both `--select` and `--custom` → throws
- Providing neither `--select`, `--custom`, nor `--value` → throws
- Providing `--select` for a boolean question → throws
- Providing `--value true` for a boolean question → answer is `true`
- Providing `--value text` for a text question → answer is `'text'`
- Answering on a completed request → throws
- Answering a non-existent question key → throws
- Overwriting a previous answer while pending → succeeds with new value

**input-request-complete tool:**
- All questions answered → status becomes `completed`, returns document
- One question unanswered → throws listing the key
- Multiple questions unanswered → throws listing all keys
- Completing an already-completed request → throws
- Completing a rejected request → throws

**input-request-reject tool:**
- Reject with reason → status `rejected`, `rejectionReason` set
- Reject without reason → status `rejected`, no `rejectionReason`
- Reject after partial answers → succeeds
- Reject a completed request → throws

**input-request-list tool:**
- Default (no params) → returns only pending requests
- `--status completed` → returns only completed requests
- Empty result set → returns empty array

**input-request-export/import:**
- Export a request → YAML contains `id`, `questions`, `answers`, `message`
- Export → edit answers in file → import → answers updated
- Import with invalid choice key → throws
- Import targeting a completed request → throws
- Import with missing `id` in YAML → throws

**End-to-end (block lifecycle):**
- Engine creates request, returns blocked → checker returns pending → patron answers all questions → patron completes → checker returns cleared → engine resumes with `priorBlock` set → engine queries book by `rigId + engineId + status: 'completed'` and retrieves answers
- Engine creates request, returns blocked → patron rejects → checker returns failed → rig fails → writ transitions to failed

**rigId on EngineRunContext:**
- Existing block type tests still pass with `rigId` present
- Engine `run()` receives `context.rigId` matching the rig's id
- Engine `collect()` receives `context.rigId` matching the rig's id
