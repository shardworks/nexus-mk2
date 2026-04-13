# Claude-Code Provider Cleanup

A small, bounded cleanup pass on the `claude-code` session provider package. Fixes a set of orphan findings from a code review session that aren't addressed by any larger rewrite or in-flight work: a parser side-effect, a retry-logic hack, an exit-code information loss, an entry-point check that doesn't handle source mode, a dead import, and a silent transcript-drop in detached-mode result conversion. Every item is independently small; the value is grouping them so they land as one atomic improvement rather than drifting.

All changes live in `packages/plugins/claude-code/src/`. No protocol changes, no architectural changes, no changes to the detached-session lifecycle.

## Changes

### 1. Remove stderr side-effect from `parseStreamJsonMessage`

In `index.ts`, the `parseStreamJsonMessage` function writes assistant text to `process.stderr` as a side effect of parsing (currently around line 382: `process.stderr.write(block.text)`). This couples a pure parsing function to the current process's stderr and makes it impossible to reuse the parser in contexts that don't want live text mirroring.

- Remove the `process.stderr.write(block.text)` call from inside the parser.
- Move live text mirroring to the caller that needs it — specifically, the attached-mode streaming loop in `launchAttached` (which consumes chunks as they arrive). That loop is the only place where mirroring-to-stderr is actually wanted.
- The babysitter inherits the mirroring today by accident (its parser calls produce stderr writes that happen to land in inherited stderr). After this change, the babysitter should explicitly not mirror — its transcript is the durable artifact, and process-level logging belongs in its own log sink, not in the model output stream.

### 2. Fix the `'fetch failed'` substring hack in `callGuildHttpApi`

In `babysitter.ts`, `callGuildHttpApi`'s retry logic falls back to a substring match on the error message:

```ts
const isRetryable = (code && RETRYABLE_CODES.has(code)) ||
  (causeCode && RETRYABLE_CODES.has(causeCode)) ||
  (lastError.message.includes('fetch failed'));
```

The string-match branch is a smell. It exists because `undici`/`fetch` sometimes throws a generic `TypeError: fetch failed` wrapping a real cause code that the code above already handles. The risk case is an error whose message happens to be `'fetch failed'` but whose cause is *not* a retryable connection error — e.g., a bad URL — which would then retry for the full 60-second budget even though the request is permanently broken.

- Remove the `lastError.message.includes('fetch failed')` branch.
- Instead, when an error is caught and no `code` or `cause.code` is set, inspect `err.cause` more carefully — `cause` on a `TypeError` from fetch is typically another `Error` with a `code` property. Walk the cause chain one more level if needed.
- If after walking the cause chain there is still no retryable code, the error is not retryable. Throw immediately rather than spin-retrying.
- Add a targeted test for "bad URL" that confirms the retry budget is not consumed.

### 3. Preserve signal information on exit code

`spawnClaudeStreamJson` and `spawnClaudeStreamingJson` in `index.ts` both build their result with `exitCode: code ?? 1`. When claude is killed by a signal (SIGTERM on cancel, SIGKILL on runaway), `code` is `null` and the `?? 1` collapses that to exit-1. Downstream, cancellation and a generic failure look identical.

- Extend the `StreamJsonResult` interface with an optional `signal?: string` field.
- In both spawn helpers, the `close` handler receives both `(code, signal)` — capture the signal and include it in the result.
- Propagate `signal` through `buildResult` into `SessionProviderResult` so the Animator (and downstream laboratory code) can distinguish cancellation from crash.
- The existing `exitCode: 1` fallback on null code should remain (for status semantics) but no longer be the only information surfaced.

### 4. Fix `isEntryPoint` check in babysitter.ts

At the bottom of `babysitter.ts`, the self-entry-point check is:

```ts
const isEntryPoint = process.argv[1] &&
  (process.argv[1] === fileURLToPath(import.meta.url) ||
   process.argv[1].endsWith('/babysitter.js'));
```

The `.endsWith('/babysitter.js')` branch does not match source mode (`.ts`) and does not match Windows paths. `resolveBabysitterPath()` in `detached.ts` goes to specific trouble to pick the correct extension for the source vs compiled case; this check should mirror that logic rather than hardcoding `.js`.

- Replace the extension-specific tail check with a form that matches either `/babysitter.js` or `/babysitter.ts`, and use a path-separator-agnostic comparison (not a literal `/`).
- The `fileURLToPath(import.meta.url)` comparison is correct and should stay as the primary check; the tail check is the fallback for cases where `argv[1]` is a resolved path rather than a file URL.

### 5. Remove dead import in index.ts

`index.ts` imports `DetachedLaunchOptions` from `./detached.ts` but never uses it. Delete the import.

### 6. Document or fix `docToProviderResult`'s transcript drop

In `detached.ts`, `docToProviderResult` builds a `SessionProviderResult` from a terminal `SessionDoc` but does not include the transcript field — it's implicitly dropped with a comment saying the transcript is available via the transcripts book. That's architecturally correct for detached mode, but it means callers who previously consumed `result.transcript` in attached mode get `undefined` with no explicit signal that the transcript has moved.

- Make the drop explicit by setting `transcript: undefined` in the returned result with an inline comment.
- Add a docstring on `SessionProviderResult.transcript` in the animator-apparatus types (or wherever the type is defined) explaining that in detached mode the transcript is available via `stacks.book('animator', 'transcripts').get(sessionId)` rather than on the result object.
- Do not attempt to populate `transcript` by reading from the transcripts book inside `docToProviderResult` — that would make the result type inconsistent across the two modes and tie the result shape to a Stacks read. The policy is "transcript lives in the book; the result carries a reference."

## Out of scope

- **`extractFinalAssistantText` semantics** (the review raised a question about whether "last assistant turn" is the right value for `result.output`, since the last turn is often a trivial closing remark). This is a product decision that needs the patron's call, not a commission. Do not change the function's behavior in this commission.
- **Deleting attached mode** (`launchAttached` and `mcp-server.ts`). This is a larger architectural change with its own pending decision; keep attached mode intact for now.
- **Detached-session protocol work** (reconciliation gaps, cancellation correctness, PID recording, stderr inheritance, pre-write race). This is tracked separately; do not touch it in this commission.
- **MCP tool serialization pipeline consolidation.** Still relevant as a code-quality concern but downgraded after a separate investigation; not in scope here.

## Constraints

- One package only: `packages/plugins/claude-code/`. No changes to `animator`, `loom`, `tools`, or any other plugin.
- `SessionProviderResult` type may gain an optional `signal` field if needed for change #3, but existing consumers must continue to compile and behave the same.
- All changes must be covered by tests — either new tests, or extensions to existing tests in `index.test.ts` / `detached.test.ts` / `babysitter.test.ts`. Change #2 in particular needs a "non-retryable error does not consume retry budget" test.
- `pnpm -w lint && pnpm -w test` must pass with the same total counts as before plus the new tests.
- No behavior changes observable from the animator side other than: cancelled sessions now carry a signal field; parser no longer spams stderr.