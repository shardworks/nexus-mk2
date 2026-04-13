# Claude-Code Provider Cleanup

## Summary

A bounded cleanup pass on the `claude-code` session provider package fixing six orphan findings from a code review: a parser side-effect, a retry-logic hack, exit-code information loss, a platform-fragile entry-point check, a dead import, and undocumented transcript-drop behavior.

## Current State

All changes target `packages/plugins/claude-code/src/`. One type change touches `packages/plugins/animator/src/types.ts`.

### `index.ts`

`parseStreamJsonMessage` (line 362–419) is a parser that converts NDJSON messages into `SessionChunk[]` and accumulates transcript/metrics into a mutable accumulator. At line 382, it writes `process.stderr.write(block.text)` as a side-effect — coupling a pure parsing function to process-level I/O.

Two spawn helpers call this parser:

- `spawnClaudeStreamJson` (line 457–507) — non-streaming, returns `Promise<StreamJsonResult>`. Close handler (line 491): `proc.on('close', (code) => { ... resolve({ exitCode: code ?? 1, ... }) })`. Does not capture `signal`.
- `spawnClaudeStreamingJson` (line 516–602) — streaming, returns `AsyncIterable<SessionChunk>` + `Promise<StreamJsonResult>`. Close handler (line 567): same pattern, does not capture `signal`.

Both spawn helpers are only called from `launchAttached` (line 196–304). Neither the babysitter nor any other code calls them.

Line 33 imports `type DetachedLaunchOptions` from `./detached.ts` — unused.

`buildResult` (line 129–141) maps `StreamJsonResult` to `SessionProviderResult`. Does not pass through any `signal` field.

```typescript
export interface StreamJsonResult {
  exitCode: number;
  transcript: Record<string, unknown>[];
  costUsd?: number;
  tokenUsage?: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
  };
  providerSessionId?: string;
}
```

### `babysitter.ts`

`callGuildHttpApi` (line 139–193) retry logic at line 173–175:
```typescript
const isRetryable = (code && RETRYABLE_CODES.has(code)) ||
  (causeCode && RETRYABLE_CODES.has(causeCode)) ||
  (lastError.message.includes('fetch failed'));
```
The `'fetch failed'` substring match is a catch-all that causes non-retryable errors (e.g. bad URL) to spin for the full 60-second retry budget.

Close handler (line 596): `claudeProc!.on('close', (code) => { resolve(code ?? 1); })` — does not capture `signal`.

`reportResult` (line 450–478) builds payload with `status` and `exitCode` but no `signal`.

Entry-point check (line 669–671):
```typescript
const isEntryPoint = process.argv[1] &&
  (process.argv[1] === fileURLToPath(import.meta.url) ||
   process.argv[1].endsWith('/babysitter.js'));
```
The `.endsWith('/babysitter.js')` branch does not match `.ts` (source mode) and uses `/` which fails on Windows.

### `detached.ts`

`docToProviderResult` (line 253–269) builds `SessionProviderResult` from a terminal `SessionDoc`. The `transcript` field is omitted with a comment — architecturally correct (transcript lives in the transcripts book) but undocumented at the type level.

### `packages/plugins/animator/src/types.ts`

```typescript
export interface SessionProviderResult {
  status: 'completed' | 'failed' | 'timeout' | 'cancelled';
  exitCode: number;
  error?: string;
  providerSessionId?: string;
  tokenUsage?: TokenUsage;
  costUsd?: number;
  /** The session's full transcript — array of NDJSON message objects. */
  transcript?: TranscriptMessage[];
  output?: string;
}
```

No `signal` field. No docstring on `transcript` explaining detached-mode behavior.

## Requirements

- R1: `parseStreamJsonMessage` must not write to `process.stderr`. It must be a pure function (given its accumulator-mutation contract).
- R2: Both `spawnClaudeStreamJson` and `spawnClaudeStreamingJson` must write assistant text chunks to `process.stderr` in their data handler callbacks, after calling `parseStreamJsonMessage`.
- R3: The trailing `process.stderr.write('\n')` on close in both spawn helpers must remain unchanged.
- R4: The babysitter must not mirror assistant text to stderr. After removing the side-effect from the parser, no new mirroring should be added in the babysitter's data handler.
- R5: `callGuildHttpApi` must not use `lastError.message.includes('fetch failed')` for retry decisions.
- R6: A utility function must walk the error cause chain (up to a depth cap) checking each error's `code` against `RETRYABLE_CODES`. When no retryable code is found at any level, the error is non-retryable and must throw immediately.
- R7: `StreamJsonResult` must include an optional `signal?: string` field.
- R8: Both spawn helpers must capture the `signal` argument from the `close` event handler and include it in the resolved `StreamJsonResult`.
- R9: `buildResult` must propagate the `signal` field from `StreamJsonResult` to `SessionProviderResult`.
- R10: `SessionProviderResult` in `packages/plugins/animator/src/types.ts` must include an optional `signal?: string` field typed as `string`.
- R11: The babysitter's close handler must capture the `signal` argument and include it in the `StreamJsonResult` it builds.
- R12: `reportResult` must include the `signal` field in the payload sent to the guild.
- R13: The `isEntryPoint` fallback check must use `path.basename(process.argv[1])` and match against both `'babysitter.js'` and `'babysitter.ts'`.
- R14: The dead `type DetachedLaunchOptions` import in `index.ts` line 33 must be removed.
- R15: `docToProviderResult` in `detached.ts` must have a comment above the return statement explaining that transcript is intentionally omitted because it lives in the transcripts book. The transcript field must remain omitted (not explicitly set to `undefined`).
- R16: `SessionProviderResult.transcript` in `packages/plugins/animator/src/types.ts` must have a docstring explaining that in detached mode, the transcript is available via `stacks.book('animator', 'transcripts').get(sessionId)` rather than on the result object.
- R17: A new test must verify that `callGuildHttpApi` does not consume the retry budget when a non-retryable error occurs (e.g. bad URL producing a non-connection error).
- R18: Existing tests for `parseStreamJsonMessage` must continue to pass without modification (they don't assert on stderr side-effects).

## Design

### Type Changes

#### `StreamJsonResult` (in `packages/plugins/claude-code/src/index.ts`)

```typescript
export interface StreamJsonResult {
  exitCode: number;
  transcript: Record<string, unknown>[];
  costUsd?: number;
  tokenUsage?: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
  };
  providerSessionId?: string;
  /** Process signal name if killed by signal (e.g. 'SIGTERM'). */
  signal?: string;
}
```

#### `SessionProviderResult` (in `packages/plugins/animator/src/types.ts`)

```typescript
export interface SessionProviderResult {
  /** Exit status. */
  status: 'completed' | 'failed' | 'timeout' | 'cancelled';
  /** Numeric exit code from the process. */
  exitCode: number;
  /** Error message if failed. */
  error?: string;
  /** Provider's session id (e.g. for --resume). */
  providerSessionId?: string;
  /** Token usage, if the provider can report it. */
  tokenUsage?: TokenUsage;
  /** Cost in USD, if the provider can report it. */
  costUsd?: number;
  /**
   * The session's full transcript — array of NDJSON message objects.
   *
   * In attached mode, this is populated directly from the NDJSON stream.
   * In detached mode, the transcript is written to SQLite by the babysitter
   * and is available via `stacks.book('animator', 'transcripts').get(sessionId)`
   * rather than on this result object.
   */
  transcript?: TranscriptMessage[];
  /**
   * The final assistant text from the session.
   * Extracted from the last assistant message's text content blocks.
   * Undefined if the session produced no assistant output.
   */
  output?: string;
  /** Process signal name if the session was killed by signal (e.g. 'SIGTERM', 'SIGKILL'). */
  signal?: string;
}
```

### Behavior

#### S1: Parser side-effect removal and mirroring relocation

When `parseStreamJsonMessage` encounters a text block (`block.type === 'text'`), it must return the `{ type: 'text', text: block.text }` chunk without writing to stderr.

When `spawnClaudeStreamJson`'s data handler calls `parseStreamJsonMessage`, it must then iterate the returned chunks and, for each chunk with `type === 'text'`, call `process.stderr.write(chunk.text)`. This mirrors assistant text to the terminal during attached-mode execution.

When `spawnClaudeStreamingJson`'s data handler calls `parseStreamJsonMessage`, it must apply the same mirroring logic: iterate returned chunks and write text ones to stderr.

The trailing `process.stderr.write('\n')` on close in both helpers stays as-is — it's cosmetic formatting for the live text stream and already scoped to attached mode.

The babysitter's data handler at line 578–589 calls `parseStreamJsonMessage` directly. After the parser change, no stderr mirroring occurs in the babysitter — this is correct. No new mirroring should be added there.

#### S2: Cause chain walking utility

Extract a new function in `babysitter.ts`:

```typescript
/**
 * Walk an error's cause chain looking for a retryable error code.
 * Returns the first retryable code found, or null if none.
 * Caps traversal depth to prevent infinite loops from circular cause chains.
 */
function findRetryableCode(err: unknown, maxDepth: number = 5): string | null {
  let current: unknown = err;
  for (let i = 0; i < maxDepth && current != null; i++) {
    const code = (current as NodeJS.ErrnoException).code;
    if (code && RETRYABLE_CODES.has(code)) {
      return code;
    }
    current = (current as Error).cause;
  }
  return null;
}
```

In `callGuildHttpApi`, replace the existing retryable check with:

```typescript
const isRetryable = findRetryableCode(err) !== null;
```

When `isRetryable` is false, the error is thrown immediately — no further retry iterations. When `isRetryable` is true, the existing backoff logic continues unchanged.

#### S3: Signal capture and propagation

In `spawnClaudeStreamJson`'s close handler (currently `proc.on('close', (code) => { ... })`):

```typescript
proc.on('close', (code, signal) => {
  if (acc.transcript.length > 0) {
    process.stderr.write('\n');
  }
  resolve({
    exitCode: code ?? 1,
    transcript: acc.transcript,
    costUsd: acc.costUsd,
    tokenUsage: acc.tokenUsage,
    providerSessionId: acc.providerSessionId,
    signal: signal ?? undefined,
  });
});
```

Apply the same pattern to `spawnClaudeStreamingJson`'s close handler.

In `buildResult`, propagate signal:

```typescript
function buildResult(raw: StreamJsonResult): SessionProviderResult {
  const status = raw.exitCode === 0 ? 'completed' as const : 'failed' as const;
  return {
    status,
    exitCode: raw.exitCode,
    error: status === 'failed' ? `claude exited with code ${raw.exitCode}` : undefined,
    costUsd: raw.costUsd,
    tokenUsage: raw.tokenUsage,
    providerSessionId: raw.providerSessionId,
    transcript: raw.transcript,
    output: extractFinalAssistantText(raw.transcript),
    signal: raw.signal,
  };
}
```

In the babysitter's close handler (line 596):

```typescript
claudeProc!.on('close', (code, signal) => {
  resolve({ code: code ?? 1, signal: signal ?? undefined });
});
```

(Adjust the resolved value shape so both `code` and `signal` are captured. The `exitCode` variable assignment and the `StreamJsonResult` construction below must use these values.)

In `reportResult`, include signal in the payload:

```typescript
const payload = {
  sessionId: config.sessionId,
  status,
  exitCode: result.exitCode,
  signal: result.signal,
  error: status === 'failed' ? `claude exited with code ${result.exitCode}` : undefined,
  costUsd: result.costUsd,
  tokenUsage: result.tokenUsage,
  output,
  providerSessionId: result.providerSessionId,
  transcript,
};
```

The `exitCode: code ?? 1` fallback remains — a signal-killed process still reports exit code 1, but now the signal field provides the additional disambiguation.

#### S4: isEntryPoint fix

Replace line 669–671 with:

```typescript
const isEntryPoint = process.argv[1] &&
  (process.argv[1] === fileURLToPath(import.meta.url) ||
   (path.basename(process.argv[1]) === 'babysitter.js' ||
    path.basename(process.argv[1]) === 'babysitter.ts'));
```

`path.basename` handles both `/` and `\` separators. Matching both `.js` and `.ts` covers compiled and source-mode execution, mirroring `resolveBabysitterPath()` in `detached.ts`.

#### S5: Dead import removal

Remove from `index.ts` line 33:

```typescript
// Before:
import { launchDetached, type DetachedLaunchOptions } from './detached.ts';

// After:
import { launchDetached } from './detached.ts';
```

#### S6: Transcript drop documentation

In `detached.ts`, `docToProviderResult` — keep the existing comment style. The field remains omitted from the returned object (not explicitly set to `undefined`). The existing comment at lines 266–267 already explains the rationale:

```typescript
// Note: transcript is not included here — it's in the transcripts book.
// The babysitter writes it directly to SQLite.
```

This comment is sufficient. No code change needed in `docToProviderResult` itself.

In `packages/plugins/animator/src/types.ts`, the `transcript` field docstring is expanded (see Type Changes section above) to explain that in detached mode, the transcript is in the transcripts book rather than on the result object.

### Non-obvious Touchpoints

- **`packages/plugins/animator/src/types.ts`** — the only cross-package change. Adding `signal?: string` to `SessionProviderResult` and expanding the `transcript` docstring. Existing consumers continue to compile because both changes are additive (optional field, documentation).
- **`packages/plugins/claude-code/src/stream-parser.test.ts`** — tests `parseStreamJsonMessage`. Current tests do not assert on stderr, so removing the side-effect won't break them. But the tests should be reviewed to ensure they still provide adequate coverage.
- **`packages/plugins/claude-code/src/babysitter.test.ts`** — tests `callGuildHttpApi` and `runBabysitter`. The `callGuildHttpApi` tests need a new case for non-retryable errors. The `runBabysitter` tests use mock spawn functions — these mock `close` events should be updated to emit `(code, signal)` to test signal propagation.

## Validation Checklist

- V1 [R1]: Verify `parseStreamJsonMessage` in `index.ts` contains no `process.stderr.write` calls. Run `grep -n 'stderr' packages/plugins/claude-code/src/index.ts` and confirm no hits inside the `parseStreamJsonMessage` function body.
- V2 [R2, R9]: In `spawnClaudeStreamJson`'s data handler, confirm text chunks are written to stderr after `parseStreamJsonMessage` returns. In `spawnClaudeStreamingJson`, confirm the same. Run a manual trace: calling `parseStreamJsonMessage` with an assistant text message should not produce stderr output; the spawn helper's callback should.
- V3 [R3]: Confirm both spawn helpers still have `process.stderr.write('\n')` in their close handlers.
- V4 [R4]: Confirm the babysitter's data handler (around line 578–589) calls `parseStreamJsonMessage` without any additional `process.stderr.write` calls.
- V5 [R5, R6]: Run `grep -n 'fetch failed' packages/plugins/claude-code/src/babysitter.ts` — no matches. Confirm `findRetryableCode` function exists and is called from `callGuildHttpApi`.
- V6 [R7, R8]: Confirm `StreamJsonResult` has `signal?: string`. Confirm both spawn helpers' close handlers destructure `(code, signal)` and include `signal` in the resolved result.
- V7 [R10]: Confirm `SessionProviderResult` in `packages/plugins/animator/src/types.ts` has `signal?: string`.
- V8 [R9]: Confirm `buildResult` spreads or assigns `signal: raw.signal` in the returned object.
- V9 [R11, R12]: Confirm babysitter's close handler captures `signal`. Confirm `reportResult` payload includes `signal`.
- V10 [R13]: Confirm `isEntryPoint` check uses `path.basename` and matches both `'babysitter.js'` and `'babysitter.ts'`.
- V11 [R14]: Confirm `index.ts` does not import `DetachedLaunchOptions`. Run `grep 'DetachedLaunchOptions' packages/plugins/claude-code/src/index.ts` — no matches.
- V12 [R15]: Confirm `docToProviderResult` in `detached.ts` has a comment explaining transcript omission. Confirm transcript is not explicitly set to `undefined` in the return object.
- V13 [R16]: Confirm `SessionProviderResult.transcript` docstring in `packages/plugins/animator/src/types.ts` mentions detached mode and the transcripts book.
- V14 [R17]: Confirm a test exists in `babysitter.test.ts` that calls `callGuildHttpApi` with a URL/scenario that produces a non-retryable error (e.g. HTTP 500, or an error with no retryable code in the cause chain) and verifies it throws immediately without exhausting the retry timeout.
- V15 [R18]: Run `pnpm -w test` — all existing tests pass. Run `pnpm -w lint` — no lint errors.

## Test Cases

### Parser purity (S1)

- **No stderr from parser:** Call `parseStreamJsonMessage` with an assistant message containing text blocks. Verify the returned chunks include `{ type: 'text', text: '...' }`. Verify `process.stderr.write` was NOT called (mock `process.stderr.write` and assert zero calls).
- **Tool use chunks unaffected:** Call `parseStreamJsonMessage` with an assistant message containing tool_use blocks. Verify chunks are returned correctly and no stderr writes occur.

### Retry logic (S2)

- **Non-retryable error throws immediately:** Call `callGuildHttpApi` with a setup that produces an error whose code (and cause chain codes) are not in RETRYABLE_CODES (e.g. a mock fetch that throws `TypeError` with cause `{ code: 'ERR_INVALID_URL' }`). Verify the function throws within milliseconds, not after the retry timeout.
- **Retryable code in cause.cause:** Call `callGuildHttpApi` with a mock fetch that throws `TypeError { cause: Error { cause: Error { code: 'ECONNREFUSED' } } }` (two levels deep). Verify the function retries.
- **No retryable code at any level:** Call with `TypeError { message: 'fetch failed', cause: Error { code: 'ERR_INVALID_URL' } }`. Verify immediate throw — the 'fetch failed' message alone is no longer sufficient for retry.

### Signal propagation (S3)

- **Signal captured on kill:** In tests that mock the spawn process, emit `close` with `(null, 'SIGTERM')`. Verify the `StreamJsonResult` has `exitCode: 1` and `signal: 'SIGTERM'`.
- **No signal on normal exit:** Emit `close` with `(0, null)`. Verify `signal` is `undefined`.
- **buildResult propagates signal:** Call `buildResult` with a `StreamJsonResult` that has `signal: 'SIGKILL'`. Verify the returned `SessionProviderResult` has `signal: 'SIGKILL'`.
- **Babysitter signal capture:** In `runBabysitter` tests, mock the close event with `(null, 'SIGTERM')`. Verify the `reportResult` payload includes `signal: 'SIGTERM'`.

### isEntryPoint check (S4)

- **Matches .ts extension:** Set `process.argv[1]` to `/path/to/babysitter.ts`. Verify `isEntryPoint` is `true`.
- **Matches .js extension:** Set `process.argv[1]` to `/path/to/babysitter.js`. Verify `isEntryPoint` is `true`.
- **Does not match unrelated script:** Set `process.argv[1]` to `/path/to/other-script.js`. Verify `isEntryPoint` is `false`.
- **Windows path with backslash:** Set `process.argv[1]` to `C:\path\to\babysitter.ts`. Verify `isEntryPoint` is `true` (path.basename handles `\`).

### Transcript documentation (S6)

- **docToProviderResult omits transcript:** Call `docToProviderResult` with a terminal `SessionDoc`. Verify the returned object does not have a `transcript` property (i.e., `'transcript' in result` is `false`).