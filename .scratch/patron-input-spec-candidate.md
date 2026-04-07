# Patron Input Block Type — Commission Brief

## Problem

Engines sometimes need patron decisions before they can proceed. But currently, engines can't block on patron input, the Spider can't track whether answers are pending, and there's no tooling to submit responses.

The engine blocking infrastructure (block types, checkers, `rig-resume`) provides the mechanism. What's missing is a block type purpose-built for structured patron input — with a typed question format, answer validation, and CLI tools for the patron to respond.

## Goal

An engine can pose a structured set of questions to the patron, block until all questions are answered and the patron marks the request complete, then resume with the answers available.

## Solution

### 1. The `patron-input` block type

A new built-in block type contributed via Spider's `supportKit.blockTypes`.

**Block type ID:** `patron-input`

**Condition schema:**

```typescript
{
  requestId: string   // unique ID for this input request document
}
```

**Checker logic:** Read the input request document from the `spider/input-requests` book by `requestId`. Return `{ status: 'cleared' }` when request `status === 'completed'`. Return `{ status: 'failed', reason: 'Patron rejected input request' }` when request `status === 'rejected'`. Return `{ status: 'pending' }` otherwise.

**Poll interval:** 10000ms. Patron is actively working when input is pending — 10s is responsive enough without being aggressive. CDC-driven unblocking (the original engine-blocking brief mentioned it as a future optimization for all block types) would make this instant, but that's a separate piece of work.

### 2. The input request document

Stored in the Stacks book `spider/input-requests`. The engine writes this document before returning the blocked result. The patron fills in answers via CLI tools. The engine reads the completed document on resume.

```typescript
interface InputRequest {
  id: string               // BookEntry key — matches the requestId in the block condition
  rigId: string            // rig that produced this request
  engineId: string         // engine that produced this request
  writId: string           // writ the rig is executing
  status: 'pending' | 'completed' | 'rejected'
  prompt?: string          // optional framing text for the patron (why these questions matter)
  questions: Question[]
  createdAt: string        // ISO timestamp
  completedAt?: string     // ISO timestamp, set when patron marks complete
}
```

**Question types:**

```typescript
type Question =
  | ChoiceQuestion
  | BooleanQuestion
  | TextQuestion

interface ChoiceQuestion {
  id: string                          // unique within this request (e.g. 'D1', 'Q3')
  type: 'choice'
  label: string                       // the question text
  options: Record<string, string>     // key → display label (e.g. { a: "Option A description", b: "..." })
  allowCustom?: boolean               // if true, patron may supply a freeform answer instead of selecting a key
  context?: string                    // optional additional context (analysis, rationale, stakes)
  answer?: { selected: string } | { custom: string }  // discriminated by key — selected validated against options
}

interface BooleanQuestion {
  id: string
  type: 'boolean'
  label: string
  context?: string
  answer?: boolean
}

interface TextQuestion {
  id: string
  type: 'text'
  label: string
  hint?: string                       // placeholder/guidance for the expected answer
  context?: string
  answer?: string
}
```

**Answer semantics for `choice` questions:**

The `answer` field is a discriminated object: `{ selected: string }` or `{ custom: string }`. The `input-answer` tool determines which variant to produce based on explicit CLI flags (`--select` vs `--custom`). Validation at submit time:
- `{ selected: key }` — key must exist in `options`. Rejects unknown keys regardless of `allowCustom`.
- `{ custom: text }` — accepted only when `allowCustom` is `true`. Rejects if `allowCustom` is `false` or absent.

### 3. Engine-side usage

An engine that needs patron input:

1. Builds the `InputRequest` document with questions
2. Writes it to the `spider/input-requests` book via Stacks
3. Returns `{ status: 'blocked', blockType: 'patron-input', condition: { requestId } }`

On resume (subsequent `run()` call), the engine:

1. Detects it's resuming from a patron-input block (via `context.priorBlock?.type === 'patron-input'`)
2. Queries the `input-requests` book for the most recent completed request matching its `rigId` + `engineId`
3. Extracts answers and proceeds with its work

The book query is the primary lookup path — not `priorBlock.condition.requestId`. This is deliberate: `priorBlock` is in-memory and doesn't survive process restarts (per D31 from engine-blocking decisions). The query is resilient and also handles the multi-block case naturally — if an engine blocks for input multiple times, each iteration creates a new InputRequest with a fresh ULID, and the query always returns the most recent completed one.

Request IDs use the system's standard ULID format. No deterministic ID generation needed.

**Example — a hypothetical engine that needs patron sign-off:**

```typescript
async run(givens, context): Promise<EngineRunResult> {
  const stacks = guild().apparatus<StacksApi>('stacks');
  const requestsBook = stacks.book<InputRequest>('spider', 'input-requests');
  const writ = givens.writ as WritDoc;

  // Resuming from a patron-input block — query for the completed request
  if (context.priorBlock?.type === 'patron-input') {
    const [request] = await requestsBook.find({
      where: [
        ['rigId', '=', context.rigId],
        ['engineId', '=', context.engineId],
        ['status', '=', 'completed'],
      ],
      limit: 1,
    });
    const deployEnv = request.questions.find(q => q.id === 'deploy-env')! as ChoiceQuestion;
    const env = 'selected' in deployEnv.answer!
      ? deployEnv.answer.selected        // option key
      : deployEnv.answer.custom;          // custom text
    return { status: 'completed', yields: { environment: env } };
  }

  // First run — pose questions
  const requestId = generateId();
  await requestsBook.put({
    id: requestId,
    rigId: context.rigId,
    engineId: context.engineId,
    writId: writ.id,
    status: 'pending',
    prompt: 'Deployment configuration needed before proceeding.',
    questions: [
      {
        id: 'deploy-env',
        type: 'choice',
        label: 'Which environment should this deploy to?',
        options: { staging: 'Staging (safe)', production: 'Production (live)' },
        allowCustom: true,
      },
      {
        id: 'notify-team',
        type: 'boolean',
        label: 'Send deployment notification to the team channel?',
      },
    ],
    createdAt: new Date().toISOString(),
  });

  return {
    status: 'blocked',
    blockType: 'patron-input',
    condition: { requestId },
    message: 'Waiting for patron deployment configuration',
  };
}
```

### 4. CLI tools

Five tools for the patron to interact with input requests. All contributed via Spider's `supportKit.tools`.

**`nsg input-list`**

List pending input requests. Shows request ID, writ ID, engine ID, question count, answered count, and creation time. Defaults to `status: 'pending'`; `--all` shows completed too.

**`nsg input-show <requestId>`**

Display a single input request with all questions, their types, options (for choice), and current answers (if any). Clear visual distinction between answered and unanswered questions.

**`nsg input-answer <requestId> <questionId> <answer>`**

Submit an answer to a single question. For choice questions, the patron specifies intent via `--select <key>` or `--custom <text>`. For boolean and text questions, the answer is positional.

Validates:
- Request exists and is pending
- Question exists
- Answer is valid for the question type:
  - `choice` with `--select`: key must exist in `options`
  - `choice` with `--custom`: `allowCustom` must be `true` on the question
  - `boolean`: answer must be `true` or `false` (parsed from string)
  - `text`: any non-empty string

Writes the answer to the question's `answer` field in the Stacks document.

**`nsg input-complete <requestId>`**

Mark the request as complete. Validates all questions have answers — rejects with a list of unanswered question IDs if incomplete. Sets `status: 'completed'` and `completedAt`. The next checker cycle picks this up and unblocks the engine.

**`nsg input-reject <requestId> [--reason <text>]`**

Reject the input request. Sets `status: 'rejected'` and optionally stores a reason. The next checker cycle returns `{ failed: '...' }`, which fails the blocked engine and cascades to rig/writ failure via the standard failure path. Requires the block checker failure signal feature (`check()` returning `'failed' | { failed: string }`).

**`nsg input-export <requestId>`** *(stretch — include if low cost)*

Export the request as YAML to stdout. Patron can pipe to a file, edit in their editor, and import back. Format mirrors the Stacks document but with a clean human-readable layout.

**`nsg input-import <requestId> [file]`** *(stretch — include if low cost)*

Import answers from a YAML file (or stdin). Merges answers into the existing request document. Does NOT auto-complete — patron still calls `input-complete` to signal they're done. Validates answer types on import.

### 5. Add `rigId` to `EngineRunContext`

Engines need their rig ID to write and query input request documents. Currently `EngineRunContext` (in `@shardworks/fabricator-apparatus`) only has `engineId`, `upstream`, and `priorBlock`.

Add `rigId: string` to `EngineRunContext`. The Spider already has the rig ID when assembling context in `tryRun()` — it just needs to pass it through. Update the context assembly:

```typescript
const context = {
  engineId: pending.id,
  rigId: rig.id,    // ← new
  upstream,
  ...(priorBlock ? { priorBlock } : {}),
};
```

This is generally useful context for any engine, not just patron-input.

### 6. Book registration

The `input-requests` book is registered by the Spider apparatus at startup, same as the `rigs` book. Schema: `InputRequest`. Owner: `spider`.


## Out of Scope

- **UI or advanced UX.** No TUI, no web interface, no interactive prompts. CLI tools and YAML are the interface.
- **Notifications.** No push notification to the patron when input is needed. The patron discovers pending requests via `nsg input-list` or Coco surfaces them.
- **Partial completion semantics.** The request is atomic — all questions must be answered before marking complete. No "answer some now, unblock, ask more later" flow.
- **Multi-patron.** One patron answers. No access control, no assignment, no approval chains.
- **Input request templates.** Engines build requests programmatically. No declarative template system.
- **Coco integration.** Coco could surface pending requests and help the patron answer them interactively — but that's Coco-side behavior, not Spider infrastructure. Not in this commission.

## Dependencies

- Engine blocking infrastructure (block types, `BlockType` interface, checker polling) — already implemented.
- Block checker failure signal (`check()` returning `CheckResult` with `'failed'` variant) — already implemented.
- Stacks book registration — existing pattern, no new capability needed.
- CLI tool registration via kit — existing pattern.

## Validation

- Engine can return `blocked` with `blockType: 'patron-input'` and a request document is persisted.
- Checker returns `{ status: 'pending' }` while request is pending, `{ status: 'cleared' }` after `input-complete`, `{ status: 'failed', reason: '...' }` after `input-reject`.
- Engine resumes and can read the completed answers.
- `input-list` shows pending requests.
- `input-show` displays questions with types and current answers.
- `input-answer` validates and persists individual answers.
- `input-complete` rejects incomplete requests, accepts complete ones.
- Choice questions: `--select` with an invalid key is rejected. `--custom` is rejected when `allowCustom` is false.
- Choice questions: `--select` with a valid key produces `{ selected: key }`. `--custom` produces `{ custom: text }`.
- Export/import round-trips cleanly (if included).
