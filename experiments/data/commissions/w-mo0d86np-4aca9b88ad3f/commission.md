# Detached Sessions Host Logging Independence

## Summary

The babysitter process currently inherits fd 2 (stderr) from the guild. When the guild restarts, that fd becomes invalid, causing EPIPE crashes in the babysitter. This change makes the babysitter open its own per-session log file and redirect all stderr output to it, eliminating the inherited fd dependency.

## Current State

**`packages/plugins/claude-code/src/babysitter.ts`** — Entry point `main()` (line 774) reads config from stdin, then calls `runBabysitter(config)`. All logging uses `process.stderr.write()` directly (4 call sites: lines 355, 385, 627, 780). The `BabysitterConfig` interface (line 61–75) has 12 fields (10 required, 2 optional). `readConfigFromStdin()` (line 118–153) validates required fields against a string array (line 142–145). `runBabysitter()` spawns claude with `stdio: ['pipe', 'pipe', 'inherit']` (line 614), meaning claude's stderr goes to the babysitter's inherited fd 2.

```typescript
export interface BabysitterConfig {
  sessionId: string;
  guildToolUrl: string;
  dbPath: string;
  claudeArgs: string[];
  cwd: string;
  env: Record<string, string>;
  prompt: string;
  tools: SerializedTool[];
  startedAt: string;
  provider: string;
  metadata?: Record<string, unknown>;
  systemPromptTmpDir?: string;
}
```

```typescript
async function main(): Promise<void> {
  try {
    const config = await readConfigFromStdin();
    await runBabysitter(config);
    process.exit(0);
  } catch (err) {
    process.stderr.write(
      `[babysitter] Fatal error: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    process.exit(1);
  }
}
```

**`packages/plugins/claude-code/src/detached.ts`** — `launchDetached()` spawns the babysitter with `stdio: ['pipe', 'ignore', 'inherit']` (line 384), inheriting stderr from the guild. `buildBabysitterConfig()` (line 171–212) constructs config from `SessionProviderConfig`. `DetachedLaunchOptions` (line 144–163) provides test overrides for `guildToolUrl`, `dbPath`, etc. Path helpers `resolveDbPath()` (line 118) and `resolveGuildToolUrl()` (line 106) resolve from `guild().home`.

```typescript
export function resolveDbPath(): string {
  const g = guild();
  return path.join(g.home, '.nexus', 'nexus.db');
}
```

**`packages/plugins/claude-code/src/babysitter.test.ts`** — Uses `node:test` with `describe`/`it`/`afterEach`/`mock`. `makeConfig()` helper (line 47–61) creates valid `BabysitterConfig` with overrides. Mock spawn pattern uses `EventEmitter` with `stdin`/`stdout`/`pid` properties.

**`packages/plugins/claude-code/README.md`** — Documents the babysitter lifecycle, config interface, and error handling. Does not mention session logging.

## Requirements

- R1: The babysitter must open a log file at `<logDir>/<sessionId>.log` and redirect all `process.stderr.write` output to it, so that no application-level stderr write reaches the inherited fd 2.
- R2: The stderr redirect must be installed in `main()` immediately after reading config from stdin and before calling `runBabysitter()` or any other initialization.
- R3: The redirect function must handle both `string` and `Buffer`/`Uint8Array` arguments to `process.stderr.write`, converting to `Buffer` before calling `fs.writeSync`.
- R4: The first line written to the log file must be a startup banner: `[babysitter] session=<sessionId> pid=<pid> pgid=<pgid> log=<logFilePath> started at <iso>\n`.
- R5: The owned file descriptor must be closed in the `finally` block of `main()`, after `runBabysitter()` completes (or throws).
- R6: `BabysitterConfig` must gain a required `logDir: string` field. `readConfigFromStdin` must validate it as required.
- R7: A `resolveLogDir()` helper in `detached.ts` must return `path.join(guild().home, 'logs', 'sessions')`.
- R8: `buildBabysitterConfig()` must populate `logDir` using `opts?.logDir ?? resolveLogDir()`.
- R9: `DetachedLaunchOptions` must gain a `logDir?: string` override field.
- R10: The babysitter spawn in `launchDetached()` must change from `stdio: ['pipe', 'ignore', 'inherit']` to `stdio: ['pipe', 'ignore', 'ignore']`.
- R11: The claude subprocess spawn in `runBabysitter()` must change from `stdio: ['pipe', 'pipe', 'inherit']` to `stdio: ['pipe', 'pipe', 'pipe']`, with claude's stderr piped and forwarded through the babysitter's (now-redirected) `process.stderr.write`.
- R12: The redirect function must be exported as `export function redirectStderrToFile(logDir: string, sessionId: string): number` from `babysitter.ts`.
- R13: The README must document the session log location (`<guildHome>/logs/sessions/<sessionId>.log`), format (plain text, `[babysitter]`-prefixed lines), lifetime (persists until manually deleted), and ownership (babysitter process).
- R14: A test must verify that running `runBabysitter` with mock spawn creates a log file at the expected path containing the startup banner.
- R15: A test must spawn `babysitter.ts` as a real child process with stderr piped, feed config via stdin, and assert that the parent's captured stderr is empty (all output went to the log file).
- R16: An EPIPE survival test must be documented and skipped with a comment explaining why (OS-level fd lifecycle is not reliably testable in Node's test harness).

## Design

### Type Changes

**`BabysitterConfig`** — add `logDir` field:

```typescript
export interface BabysitterConfig {
  sessionId: string;
  guildToolUrl: string;
  dbPath: string;
  logDir: string;
  claudeArgs: string[];
  cwd: string;
  env: Record<string, string>;
  prompt: string;
  tools: SerializedTool[];
  startedAt: string;
  provider: string;
  metadata?: Record<string, unknown>;
  systemPromptTmpDir?: string;
}
```

**`DetachedLaunchOptions`** — add `logDir` override:

```typescript
export interface DetachedLaunchOptions {
  babysitterPath?: string;
  guildToolUrl?: string;
  dbPath?: string;
  /** Override log directory (for testing). */
  logDir?: string;
  pollIntervalMs?: number;
  pollTimeoutMs?: number;
  sessionsBook?: ReadOnlyBook<SessionDoc>;
  writableSessionsBook?: Book<SessionDoc>;
  spawnFn?: typeof spawn;
  metadata?: Record<string, unknown>;
}
```

**`redirectStderrToFile` signature:**

```typescript
/**
 * Open a per-session log file and redirect process.stderr.write to it.
 *
 * Creates the logDir (recursive) and opens `<logDir>/<sessionId>.log`
 * for append-writing. Replaces process.stderr.write with a function
 * that calls fs.writeSync on the owned fd. Writes the startup banner
 * as the first line.
 *
 * Returns the owned fd so the caller can close it in a finally block.
 *
 * @internal Exported for testing only.
 */
export function redirectStderrToFile(logDir: string, sessionId: string): number;
```

### Behavior

**Log file creation and redirect (`redirectStderrToFile`):**

- When called, create `logDir` with `fs.mkdirSync(logDir, { recursive: true })`.
- Open `path.join(logDir, `${sessionId}.log`)` with `fs.openSync(logFilePath, 'a')` (append mode). Store the returned fd.
- Save `process.stderr.write` as `originalWrite` (not used again, but kept for type safety in the replacement).
- Replace `process.stderr.write` with a function that:
  - Accepts `chunk: string | Buffer | Uint8Array` (plus optional encoding and callback parameters matching the `write` overload signatures).
  - Converts `chunk` to a `Buffer`: if `chunk` is a string, use `Buffer.from(chunk, encoding ?? 'utf8')`; if already a `Buffer` or `Uint8Array`, use it directly.
  - Calls `fs.writeSync(fd, buffer)`.
  - Invokes the callback (if provided) with no error.
  - Returns `true`.
- Write the startup banner via `process.stderr.write(...)` (which now goes to the log file): `[babysitter] session=${sessionId} pid=${process.pid} pgid=${process.getgid?.()} log=${logFilePath} started at ${new Date().toISOString()}\n`. For `pgid`, use `process.pid` as the babysitter is spawned with `detached: true` so its PID equals its PGID.
- Return the fd.

**`main()` restructuring:**

- When `main()` runs, read config from stdin first (no change).
- Immediately after, call `redirectStderrToFile(config.logDir, config.sessionId)` to get the owned fd.
- Wrap the rest (`runBabysitter(config)` and `process.exit(0)`) in a try/finally where the finally block calls `fs.closeSync(fd)`.
- The catch block for fatal errors remains — its `process.stderr.write` call will now go to the log file (which is the desired behavior).

Updated `main()` structure:

```typescript
async function main(): Promise<void> {
  let fd: number | undefined;
  try {
    const config = await readConfigFromStdin();
    fd = redirectStderrToFile(config.logDir, config.sessionId);
    await runBabysitter(config);
    process.exit(0);
  } catch (err) {
    process.stderr.write(
      `[babysitter] Fatal error: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    process.exit(1);
  } finally {
    if (fd !== undefined) {
      try { fs.closeSync(fd); } catch { /* already closed */ }
    }
  }
}
```

**`readConfigFromStdin` validation:**

- When validating required fields, add `'logDir'` to the `required` array (line 142–145).

**`resolveLogDir()` in detached.ts:**

- When called, resolve `path.join(guild().home, 'logs', 'sessions')`.
- Follow the exact pattern of `resolveDbPath()`.

```typescript
/** Resolve the path to the guild's session log directory. */
export function resolveLogDir(): string {
  const g = guild();
  return path.join(g.home, 'logs', 'sessions');
}
```

**`buildBabysitterConfig` update:**

- When building the config object, add `logDir: opts?.logDir ?? resolveLogDir()` to the returned object.

**Spawn stdio changes:**

- When `launchDetached()` spawns the babysitter, use `stdio: ['pipe', 'ignore', 'ignore']` instead of `['pipe', 'ignore', 'inherit']`. The babysitter no longer needs the guild's stderr.
- When `runBabysitter()` spawns claude, use `stdio: ['pipe', 'pipe', 'pipe']` instead of `['pipe', 'pipe', 'inherit']`. Since the babysitter's fd 2 is now closed/`/dev/null` (spawned with `'ignore'`), inheriting it would give claude a dead stderr.

**Claude stderr forwarding:**

- After spawning claude with piped stderr, attach a `'data'` listener on `claudeProc.stderr` that forwards each chunk through `process.stderr.write(chunk)`. Since `process.stderr.write` is redirected, claude's stderr output lands in the session log file alongside the babysitter's own output.
- This listener should be installed immediately after `claudeProc.stdin!.end()` (after piping the prompt).

```typescript
// Forward claude's stderr through the babysitter's redirected stderr
claudeProc.stderr?.on('data', (chunk: Buffer) => {
  process.stderr.write(chunk);
});
```

**Test helper updates:**

- The `makeConfig()` helper in `babysitter.test.ts` must include `logDir` pointing to a temp directory. Use a pattern consistent with existing temp dir management (`fs.mkdtempSync` in `beforeEach`, `fs.rmSync` in `afterEach`).

### Non-obvious Touchpoints

- `packages/plugins/claude-code/src/babysitter.test.ts` line 47–61: `makeConfig()` helper needs `logDir` field added. Every existing test that calls `makeConfig()` will break without this.
- `packages/plugins/claude-code/src/detached.test.ts`: Tests for `buildBabysitterConfig()` need a `logDir` override in `DetachedLaunchOptions` to avoid calling `guild()` in test context.
- `readConfigFromStdin` required fields array (babysitter.ts line 142–145): string-based validation, not type-checked — easy to forget adding `'logDir'`.
- The README `SerializedTool` interface (line 92–96) is missing the `method` field. Pre-existing but visible when editing the README for R13.

## Validation Checklist

- V1 [R1, R2, R4, R5]: Call `redirectStderrToFile(tmpDir, 'test-session')`. Verify: (a) file `<tmpDir>/test-session.log` exists, (b) its first line matches the banner format `[babysitter] session=test-session pid=... pgid=... log=... started at ...`, (c) subsequent `process.stderr.write('hello')` calls append to the file, (d) after `fs.closeSync(fd)`, the file is readable and complete.
- V2 [R3]: Call `redirectStderrToFile`, then `process.stderr.write('string-test\n')` and `process.stderr.write(Buffer.from('buffer-test\n'))`. Read the log file and verify both lines appear after the banner.
- V3 [R6]: Create a config JSON missing `logDir`, pass to `readConfigFromStdin`. Verify it throws `Missing required config field: logDir`. Create a config JSON with `logDir` present, verify it parses successfully.
- V4 [R7]: Call `resolveLogDir()` (with guild home mocked/overridden). Verify it returns `<guildHome>/logs/sessions`.
- V5 [R8, R9]: Call `buildBabysitterConfig(config, { logDir: '/test/logs' })`. Verify the returned config has `logDir: '/test/logs'`. Call without override and verify it calls `resolveLogDir()`.
- V6 [R10]: In `launchDetached()`, verify the spawn call uses `stdio: ['pipe', 'ignore', 'ignore']`. Grep for `'inherit'` in the spawn options of `launchDetached` — should find none.
- V7 [R11]: In `runBabysitter()`, verify the claude spawn call uses `stdio: ['pipe', 'pipe', 'pipe']`. Verify a `'data'` listener on `claudeProc.stderr` forwards chunks through `process.stderr.write`.
- V8 [R12]: Verify `redirectStderrToFile` is exported from `babysitter.ts` and importable in test files.
- V9 [R13]: Verify the README contains a section documenting session logs at `<guildHome>/logs/sessions/<sessionId>.log`, describing format (plain text), lifetime (persists until manual deletion), and ownership (babysitter process).
- V10 [R14]: Run the log-file-creation test: `runBabysitter` with mock spawn, verify `<logDir>/<sessionId>.log` exists and contains the startup banner. Run via `node --test packages/plugins/claude-code/src/babysitter.test.ts` and confirm the test passes.
- V11 [R15]: Run the stderr-isolation test: spawn babysitter as a child process with `stdio: ['pipe', 'pipe', 'pipe']`, feed valid config via stdin (with a temp `logDir`), wait for the process to start, verify captured stderr from the parent is empty. Run via `node --test` and confirm the test passes.
- V12 [R16]: Verify a skipped test exists with `it.skip(...)` or `it.todo(...)` and a comment explaining: OS-level fd lifecycle is not reliably testable in Node's test harness; coverage is carried by the log-file-creation and stderr-isolation tests.

## Test Cases

**Unit: `redirectStderrToFile` creates log file with banner**
- Call `redirectStderrToFile(tmpDir, 'sess-001')` where `tmpDir` is a fresh `mkdtempSync` directory.
- Assert: file `<tmpDir>/sess-001.log` exists.
- Assert: first line matches `/^\[babysitter\] session=sess-001 pid=\d+ pgid=\d+ log=.+ started at \d{4}-/`.
- Cleanup: `fs.closeSync(fd)`, `fs.rmSync(tmpDir, { recursive: true })`.

**Unit: `redirectStderrToFile` handles string and Buffer writes**
- Call `redirectStderrToFile(tmpDir, 'sess-002')`.
- Call `process.stderr.write('line-one\n')`.
- Call `process.stderr.write(Buffer.from('line-two\n'))`.
- Call `process.stderr.write(new Uint8Array(Buffer.from('line-three\n')))`.
- Read the log file. Assert it contains (after the banner): `line-one`, `line-two`, `line-three` on separate lines.

**Unit: `readConfigFromStdin` rejects missing `logDir`**
- Create valid config JSON but omit `logDir`.
- Pass to `readConfigFromStdin` via stream.
- Assert: throws with message containing `Missing required config field: logDir`.

**Unit: `readConfigFromStdin` accepts config with `logDir`**
- Create valid config JSON including `logDir: '/tmp/test-logs'`.
- Pass to `readConfigFromStdin` via stream.
- Assert: returned config has `logDir === '/tmp/test-logs'`.

**Integration: `runBabysitter` creates log file (D12 — e2e via runBabysitter)**
- Set up: create temp dir for `logDir`, create `makeConfig({ logDir: tmpDir })`, set up mock spawn (EventEmitter pattern from existing tests), set up mock guild HTTP server.
- Call `redirectStderrToFile(config.logDir, config.sessionId)` then `runBabysitter(config, { spawnFn: mockSpawn, db: mockDb })`.
- Simulate claude exit (emit `'close'` on mock process).
- Assert: `<tmpDir>/<sessionId>.log` exists and contains the startup banner.
- Assert: log file contains `[babysitter] MCP proxy server listening on port` line.

**Integration: stderr isolation — parent receives no babysitter stderr (D13 — real spawn)**
- Spawn `babysitter.ts` (or `babysitter.js`) as a child process with `stdio: ['pipe', 'pipe', 'pipe']`.
- Write valid config JSON (with a temp `logDir`) to the child's stdin, then close it.
- Collect all data from the child's stderr stream.
- Wait for the child to exit (or a timeout).
- Assert: collected stderr data is empty (zero bytes).
- Assert: log file at `<logDir>/<sessionId>.log` exists and is non-empty.
- Note: the child will likely fail (no real claude binary), but the key assertion is that stderr is empty — the failure message goes to the log file, not inherited stderr.

**Skipped: EPIPE survival (D11)**
- `it.skip('survives EPIPE on inherited stderr after guild restart')` with comment: "OS-level fd lifecycle (closing the write end of a pipe that backs fd 2) is not reliably simulable in Node's test harness. The log-file-creation and stderr-isolation tests verify the redirect is in place, which is the mechanism that prevents EPIPE."

**Unit: `resolveLogDir` returns correct path**
- Mock or override `guild()` to return `{ home: '/test/guild' }`.
- Call `resolveLogDir()`.
- Assert: returns `/test/guild/logs/sessions`.

**Unit: `buildBabysitterConfig` populates `logDir` from override**
- Call `buildBabysitterConfig(config, { logDir: '/override/logs' })`.
- Assert: returned config has `logDir === '/override/logs'`.

**Unit: claude stderr forwarded to log file**
- Set up `redirectStderrToFile` to a temp dir.
- Call `runBabysitter` with mock spawn.
- Emit `'data'` on mock claude process's stderr with `Buffer.from('claude error output\n')`.
- Simulate claude exit.
- Read the log file. Assert it contains `claude error output`.

**Edge: empty logDir string rejected by `readConfigFromStdin`**
- Create config with `logDir: ''`.
- `readConfigFromStdin` should accept it (it checks for `undefined`/`null`, not empty string). The `redirectStderrToFile` call will fail with an OS error when trying to create the directory. This is acceptable — the error surfaces as a fatal error in `main()` and is written to the log file (or original stderr if redirect hasn't happened yet). No special handling needed.