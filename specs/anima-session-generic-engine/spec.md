---
author: plan-writer
estimated_complexity: 3
---

# anima-session Generic Engine

## Summary

Add a new `anima-session` quick engine to the Spider's support kit — a reusable building block where the prompt, role, cwd, conversationId, and writ are all supplied through givens rather than hard-coded. Also extend the Spider's generic default collect to include `conversationId` from the session document.

## Current State

The Spider contributes five engine designs via its `supportKit.engines` dict in `packages/plugins/spider/src/spider.ts`:

```typescript
engines: {
  draft:     draftEngine,
  implement: implementEngine,
  review:    reviewEngine,
  revise:    reviseEngine,
  seal:      sealEngine,
},
```

These are imported from `packages/plugins/spider/src/engines/index.ts`:

```typescript
export { default as draftEngine } from './draft.ts';
export { default as implementEngine } from './implement.ts';
export { default as reviewEngine } from './review.ts';
export { default as reviseEngine } from './revise.ts';
export { default as sealEngine } from './seal.ts';
```

Each engine id is also enumerated in two hardcoded registration lists in `spider.ts`:

1. **`validateTemplates`** (~line 293) — a `builtinEngineIds` Set used for config template designId validation.
2. **`buildDesignSourceMap`** (~line 496) — a `builtinIds` array mapping Spider-builtin engine ids to the `'spider'` plugin id.

The existing quick engines (`implement`, `revise`) all hard-code their prompt assembly logic and always require a writ. None pass `conversationId` to `animator.summon()`.

The Spider's generic default collect in `tryCollect` (~line 987) currently produces:

```typescript
yields = {
  sessionId: session.id,
  sessionStatus: session.status,
  ...(session.output !== undefined ? { output: session.output } : {}),
};
```

It does not include `conversationId`, even though `SessionDoc` has `conversationId?: string`.

## Requirements

- R1: A new engine design with id `'anima-session'` exists, is registered in the Spider's support kit, and is resolvable via the Fabricator's `getEngineDesign('anima-session')`.
- R2: When run, the engine validates that `givens.role` is a non-empty string. When missing or not a string, the engine throws a descriptive error.
- R3: When run, the engine validates that `givens.prompt` is a non-empty string. When missing or not a string, the engine throws a descriptive error.
- R4: When run, the engine validates that `givens.cwd` is a non-empty string. When missing or not a string, the engine throws a descriptive error. There is no fallback to `context.upstream['draft']` or any other source.
- R5: When `givens.conversationId` is a string, the engine passes it to `animator.summon()`. When absent or falsy, `conversationId` is omitted from the summon request.
- R6: When `givens.writ` is present (a WritDoc), the engine passes `environment: { GIT_AUTHOR_EMAIL: '<writId>@nexus.local' }` and includes `writId` in metadata. When absent, environment is `{}` and metadata contains only `engineId`.
- R7: The engine returns `{ status: 'launched', sessionId: handle.sessionId }` — it is a quick engine with no custom `collect` method.
- R8: The engine is registered in all three Spider registration sites: `supportKit.engines`, `builtinEngineIds` in `validateTemplates`, and `builtinIds` in `buildDesignSourceMap`.
- R9: The Spider's generic default collect includes `conversationId` from the session document (when present) in the yields object, using the same conditional-spread pattern as `output`.
- R10: Rig templates (both config-declared and kit-contributed) can reference `'anima-session'` as a `designId` and pass validation.

## Design

### New File: `packages/plugins/spider/src/engines/anima-session.ts`

```typescript
/**
 * Anima-session engine — quick (Animator-backed).
 *
 * A generic reusable engine that summons an anima session. Unlike the other
 * quick engines which embed prompt logic, anima-session receives all parameters
 * through givens: role, prompt, cwd, and optionally conversationId and writ.
 *
 * Returns `{ status: 'launched', sessionId }` so the Spider's collect step
 * can poll for completion on subsequent walks. Uses the generic default
 * collect — no custom collect method.
 */

import { guild } from '@shardworks/nexus-core';
import type { EngineDesign } from '@shardworks/fabricator-apparatus';
import type { AnimatorApi } from '@shardworks/animator-apparatus';
import type { WritDoc } from '@shardworks/clerk-apparatus';

const animaSessionEngine: EngineDesign = {
  id: 'anima-session',

  async run(givens, context) {
    // Validate required givens
    if (typeof givens.role !== 'string' || givens.role.length === 0) {
      throw new Error('anima-session engine requires a non-empty string "role" given.');
    }
    if (typeof givens.prompt !== 'string' || givens.prompt.length === 0) {
      throw new Error('anima-session engine requires a non-empty string "prompt" given.');
    }
    if (typeof givens.cwd !== 'string' || givens.cwd.length === 0) {
      throw new Error('anima-session engine requires a non-empty string "cwd" given.');
    }

    const animator = guild().apparatus<AnimatorApi>('animator');
    const writ = givens.writ as WritDoc | undefined;

    const handle = animator.summon({
      role: givens.role,
      prompt: givens.prompt,
      cwd: givens.cwd,
      ...(givens.conversationId ? { conversationId: givens.conversationId as string } : {}),
      environment: writ ? { GIT_AUTHOR_EMAIL: `${writ.id}@nexus.local` } : {},
      metadata: { engineId: context.engineId, ...(writ ? { writId: writ.id } : {}) },
    });

    return { status: 'launched', sessionId: handle.sessionId };
  },
};

export default animaSessionEngine;
```

### Behavior

**Givens validation (R2, R3, R4):**
- When `givens.role` is not a string or is empty, throw `Error('anima-session engine requires a non-empty string "role" given.')`.
- When `givens.prompt` is not a string or is empty, throw `Error('anima-session engine requires a non-empty string "prompt" given.')`.
- When `givens.cwd` is not a string or is empty, throw `Error('anima-session engine requires a non-empty string "cwd" given.')`.
- Validation runs before any apparatus lookup. The error message includes the engine name for debuggability.
- There is no cwd fallback — cwd must be explicitly provided in givens. This is a patron directive.

**conversationId handling (R5):**
- When `givens.conversationId` is truthy, it is passed as `conversationId` in the `SummonRequest`.
- When falsy or absent, `conversationId` is omitted from the request entirely (not passed as undefined).

**writ-conditional fields (R6):**
- When `givens.writ` is present: `environment` is `{ GIT_AUTHOR_EMAIL: '<writ.id>@nexus.local' }` and metadata is `{ engineId: context.engineId, writId: writ.id }`.
- When `givens.writ` is absent: `environment` is `{}` and metadata is `{ engineId: context.engineId }`.

**Generic default collect update (R9):**

In `tryCollect` within `packages/plugins/spider/src/spider.ts`, the `else` branch (~line 987) that assembles generic default yields becomes:

```typescript
yields = {
  sessionId: session.id,
  sessionStatus: session.status,
  ...(session.output !== undefined ? { output: session.output } : {}),
  ...(session.conversationId !== undefined ? { conversationId: session.conversationId } : {}),
};
```

This is additive — `conversationId` is only included when the session document has it. Existing engines that use the generic default (`implement`, `revise`) are unaffected because their sessions don't set `conversationId`. The `ReviseYields` type is not updated (it is already inaccurate, missing `output`; fixing yield types is a separate cleanup).

### Registration Touchpoints

**`packages/plugins/spider/src/engines/index.ts`** — add one line:

```typescript
export { default as animaSessionEngine } from './anima-session.ts';
```

**`packages/plugins/spider/src/spider.ts`** — three changes:

1. **Import** (~line 44): add `animaSessionEngine` to the import from `./engines/index.ts`.

2. **`validateTemplates` → `builtinEngineIds`** (~line 293): add `animaSessionEngine.id` to the Set.

3. **`buildDesignSourceMap` → `builtinIds`** (~line 496): add `animaSessionEngine.id` to the array.

4. **`supportKit.engines`** (~line 1424): add `'anima-session': animaSessionEngine` to the dict.

### Non-obvious Touchpoints

- The `builtinEngineIds` Set in `validateTemplates` and the `builtinIds` array in `buildDesignSourceMap` are easily missed — they are separate from the `supportKit.engines` dict and serve different validation purposes. Missing either causes template validation failures when templates reference `'anima-session'` as a designId.

## Validation Checklist

- V1 [R1, R8, R10]: Run the Spider test suite (`node --test packages/plugins/spider/src/spider.test.ts`). Verify the Fabricator resolves `getEngineDesign('anima-session')` after the Spider's supportKit is registered. Create a rig template referencing `designId: 'anima-session'` and verify it passes `validateTemplates`.

- V2 [R2]: Write a test that calls the engine's `run()` with `givens.role` missing (or empty string, or a number). Verify it throws with a message containing `"role"`.

- V3 [R3]: Write a test that calls the engine's `run()` with `givens.prompt` missing (or empty string). Verify it throws with a message containing `"prompt"`.

- V4 [R4]: Write a test that calls the engine's `run()` with `givens.cwd` missing. Verify it throws with a message containing `"cwd"`. Verify there is NO fallback to `context.upstream['draft']` — cwd must come from givens.

- V5 [R5]: Write a test that calls `run()` with `givens.conversationId` set. Verify the captured `SummonRequest` includes `conversationId`. Call again without it; verify `conversationId` is absent from the request.

- V6 [R6]: Write a test that calls `run()` with a writ given. Verify `environment` is `{ GIT_AUTHOR_EMAIL: '<writId>@nexus.local' }` and metadata includes `writId`. Call again without writ; verify `environment` is `{}` and metadata has only `engineId`.

- V7 [R7]: Verify the engine has no `collect` property (i.e., `animaSessionEngine.collect === undefined`).

- V8 [R9]: Write a test where the mock session document includes `conversationId: 'conv-xyz'`. Run a rig with an engine using the generic default collect. Verify the engine's yields include `conversationId: 'conv-xyz'`. Also verify that when `conversationId` is absent from the session, the yields do NOT contain a `conversationId` key.

- V9 [R1]: `grep -r 'anima-session' packages/plugins/spider/src/` returns hits in at least: `engines/anima-session.ts`, `engines/index.ts`, `spider.ts` (import, supportKit, builtinEngineIds, builtinIds).

## Test Cases

**Engine givens validation:**
- Scenario: `run()` called with `givens = { prompt: 'x', cwd: '/tmp' }` (missing role) → throws error mentioning "role"
- Scenario: `run()` called with `givens = { role: '', prompt: 'x', cwd: '/tmp' }` (empty role) → throws error mentioning "role"
- Scenario: `run()` called with `givens = { role: 'scribe', cwd: '/tmp' }` (missing prompt) → throws error mentioning "prompt"
- Scenario: `run()` called with `givens = { role: 'scribe', prompt: 'x' }` (missing cwd) → throws error mentioning "cwd"
- Scenario: `run()` called with `givens = { role: 123, prompt: 'x', cwd: '/tmp' }` (non-string role) → throws error mentioning "role"

**Summon integration — happy path:**
- Scenario: `run()` called with `{ role: 'artificer', prompt: 'Do the work', cwd: '/tmp/work', writ: mockWrit }` → `animator.summon()` receives `{ role: 'artificer', prompt: 'Do the work', cwd: '/tmp/work', environment: { GIT_AUTHOR_EMAIL: '<writId>@nexus.local' }, metadata: { engineId: '<engineId>', writId: '<writId>' } }`; returns `{ status: 'launched', sessionId: '<id>' }`

**Summon integration — no writ:**
- Scenario: `run()` called with `{ role: 'scribe', prompt: 'Plan something', cwd: '/tmp' }` (no writ) → `environment` is `{}`; metadata is `{ engineId: '<engineId>' }` (no writId key)

**Summon integration — conversationId:**
- Scenario: `run()` called with `{ role: 'scribe', prompt: 'Continue', cwd: '/tmp', conversationId: 'conv-123' }` → summon request includes `conversationId: 'conv-123'`
- Scenario: `run()` called without conversationId → summon request does not have `conversationId` property

**No cwd fallback (patron directive):**
- Scenario: `run()` called with `context.upstream` containing `{ draft: { path: '/tmp/draft' } }` but `givens.cwd` is undefined → throws error mentioning "cwd" (does NOT fall back to draft path)

**Generic default collect — conversationId in yields:**
- Scenario: Spider collects a completed session where `SessionDoc.conversationId = 'conv-abc'` → engine yields include `{ sessionId, sessionStatus, output?, conversationId: 'conv-abc' }`
- Scenario: Spider collects a completed session where `SessionDoc.conversationId` is undefined → engine yields are `{ sessionId, sessionStatus, output? }` with no `conversationId` key

**Engine registration:**
- Scenario: After Spider startup, `fabricator.getEngineDesign('anima-session')` returns the engine design (truthy)
- Scenario: A config rig template referencing `designId: 'anima-session'` passes `validateTemplates` without error
- Scenario: `animaSessionEngine.collect` is undefined (no custom collect)
