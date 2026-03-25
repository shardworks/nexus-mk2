# Session Architecture Refactor

## Goal

Unify all session spawning — user-initiated (`nsg consult`), clockworks-initiated (`summon`/`brief`), engine-initiated (future) — through a single code path in core that handles logging, events, and metrics collection. Concrete session backends are pluggable engines.

## Current State

### Packages
- `core` — Ledger, guild config, events, clockworks runner
- `cli` — `nsg` commands + session launcher + summon handler (the latter two don't belong here)
- `stdlib` — consolidated standard tools (commission, signal, install, etc.) and clockwork engines (workshop-prepare, workshop-merge). Single package, two export paths: `@shardworks/nexus-stdlib/tools` and `@shardworks/nexus-stdlib/engines`
- `engine-manifest` (own package) — reads anima composition, resolves tools, assembles system prompt, generates MCP config
- `engine-mcp-server` (own package) — serves guild tools over MCP stdio protocol during claude sessions
- `engine-worktree-setup` (own package) — creates/tears down git worktrees for commissions. Used by stdlib's workshop-prepare and workshop-merge engines
- `engine-ledger-migrate` (own package) — schema migrations. Not touched by this refactor
- `guild-starter-kit` — bundle template for new guilds

### Problems
- Session launching lives in CLI but isn't a CLI concern
- `engine-manifest` is called an "engine" but is really a pure function / library
- Core uses a callback hack to reach session launching
- No unified logging, events, or metrics across session types
- MCP config generation is baked into manifest, but MCP is a Claude Code transport detail
- `engine-worktree-setup` is a separate package but is really just utility functions for git worktree operations — the session funnel will also need worktree creation/teardown for `workshop-temp` workspaces

## Target State

### core gains:

**Manifest capability** (absorbed from `engine-manifest`):
- `manifest(home, animaName)` → `ManifestResult` containing system prompt + resolved tools (Zod schemas + handlers) + full composition provenance
- The system prompt is the anima's *identity*: codex, role instructions, curriculum, temperament, tool instructions. It answers "who are you and what can you do."
- The *user prompt* (commission spec, brief content, conversation) is NOT part of the manifest — it comes from the caller via `SessionLaunchOptions.prompt`. It answers "what are you being asked to do right now."
- `readAnima()`, `resolveTools()`, `readCodex()`, `readRoleInstructions()`, `assembleSystemPrompt()`
- No MCP config generation — that's a transport detail

`ManifestResult` surfaces the individual composition ingredients alongside the assembled prompt, so callers (and the session archive) can capture full provenance:

```typescript
interface ManifestResult {
  anima: AnimaRecord;
  /** The final assembled system prompt. */
  systemPrompt: string;
  /** The individual ingredients that produced the system prompt. */
  composition: {
    codex: string;
    roleInstructions: string;
    curriculum: { name: string; version: string; content: string } | null;
    temperament: { name: string; version: string; content: string } | null;
    toolInstructions: Array<{ toolName: string; instructions: string }>;
  };
  /** Resolved tools — Zod schemas + handlers. */
  tools: ResolvedTool[];
  unavailable: UnavailableTool[];
  warnings: string[];
}
```

This requires widening the `readAnima()` query to include `curriculum_name`, `curriculum_version`, `temperament_name`, `temperament_version` from `anima_compositions` (already stored in the Ledger, just not currently selected). And threading the individual ingredients through `manifest()` instead of discarding them after `assembleSystemPrompt()` consumes them.

**Session interfaces:**
```typescript
/** What a session provider must implement. */
interface SessionProvider {
  /** Provider identifier (e.g. "claude-code", "claude-api", "bedrock"). */
  name: string;
  /** Launch a session and return when it completes. */
  launch(options: SessionLaunchOptions): Promise<SessionResult>;
}

/** Everything needed to launch a session, provider-agnostic. */
interface SessionLaunchOptions {
  /** Guild root path. */
  home: string;
  /** The manifest result — system prompt + resolved tools. */
  manifest: ManifestResult;
  /** The user-facing prompt (commission spec, consultation topic, brief). */
  prompt: string | null;  // null for interactive
  /** Whether the session is interactive (human at keyboard) or autonomous. */
  interactive: boolean;
  /** Workspace context — resolved from event payload or caller. See "Workspace Resolution". */
  workspace: ResolvedWorkspace;
  /** Display name for tracking. */
  name?: string;
  /** Budget cap, if any. */
  maxBudgetUsd?: number;
}

/** What comes back from any session, regardless of provider. */
interface SessionResult {
  /** Ledger row ID — written by the funnel before provider launch. */
  sessionId: number;
  exitCode: number;
  /** Provider-reported token usage, if available. */
  tokenUsage?: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
  };
  /** Provider-reported cost in USD, if available. */
  costUsd?: number;
  /** Wall-clock duration in milliseconds. */
  durationMs: number;
  /** Session ID from the provider, if available (e.g. claude session ID). */
  providerSessionId?: string;
  /**
   * Full conversation transcript — raw provider output, minimally typed.
   * For claude-code with --output-format stream-json: array of stream events.
   * For API providers: the messages array from the conversation.
   * Stored as-is in the session record; typed normalization deferred until
   * we need to analyze transcripts programmatically.
   */
  transcript?: Record<string, unknown>[];
}
```

**Workspace resolution:**

Any event payload can optionally carry standard workspace context fields. These are a convention, not enforced schema — custom events get the behavior for free if they include them.

```typescript
/**
 * Standard optional fields on event payloads. Any event can carry these.
 * The session launcher inspects the triggering event's payload and uses
 * them to determine the working directory for the session.
 */
interface WorkspaceContext {
  /** Workshop name — session gets a fresh temporary worktree of main. */
  workshop?: string;
  /** Explicit worktree path — used as-is (caller owns the lifecycle). */
  worktreePath?: string;
}

/** The resolved working directory for a session. */
type ResolvedWorkspace =
  | { kind: 'guildhall' }
  | { kind: 'workshop-temp'; workshop: string; worktreePath: string }
  | { kind: 'workshop-managed'; workshop: string; worktreePath: string };
```

Resolution rules (applied by the session funnel, not the provider):

1. **`worktreePath` present** → use it directly, don't touch it. Caller owns the lifecycle. This is `workshop-managed` — the commission pipeline (or whatever) created it and will clean it up. The session launcher just uses it as `cwd`.
2. **`workshop` present, no `worktreePath`** → create a fresh temporary worktree checked out to main. This is `workshop-temp`. The session funnel creates it before launching. For autonomous sessions, it tears it down after. For interactive sessions, it leaves it in place — the user may have un-pushed work. Cleanup is manual or via a future reaping mechanism.
3. **Neither** → guildhall. `cwd` is `home`.

For callers outside clockworks (e.g. `nsg consult --workshop frontend-app`), the CLI resolves the workspace context before calling `launchSession()`. Same rules apply.

**Session launcher** — the single code path:
```typescript
/**
 * Launch a session through the registered provider.
 *
 * This is THE code path for all sessions. It:
 * 1. If workspace is workshop-temp: create fresh worktree from main
 * 2. Records session.started in the Ledger → gets sessionId
 * 3. Signals session.started event
 * 4. Delegates to the provider (passing resolved cwd)
 * 5. Records session.ended in the Ledger (with metrics)
 * 6. Writes the SessionRecord JSON to .nexus/sessions/{uuid}.json
 * 7. Signals session.ended event (with full metrics + sessionId in payload)
 * 8. If workspace is workshop-temp AND session is autonomous: tear down the worktree
 *    (interactive sessions leave the worktree for manual cleanup)
 * 9. Returns the result (including sessionId)
 *
 * Error handling guarantee: Steps 5–8 MUST execute even if the provider
 * throws. The funnel wraps step 4 in try/finally. If the provider crashes,
 * the session row still gets ended_at, exit_code, and the session.ended
 * event still fires (with error details in the payload). If the funnel
 * itself fails during recording (e.g. Ledger locked), it signals
 * session.record-failed as a core event and continues with remaining
 * cleanup steps. Worktree teardown failures are logged but do not throw —
 * stale worktrees are assumed to be reaped by a separate mechanism (out
 * of scope for this refactor).
 */
function launchSession(options: SessionLaunchOptions): Promise<SessionResult>
```

**Session provider registration:**
```typescript
function registerSessionProvider(provider: SessionProvider): void
```

### claude-code-session-provider (new package, absorbs two existing packages):

This is a **platform dependency** of the CLI, not a guild-registered engine. The CLI imports it at startup and registers it via `registerSessionProvider()`. Guilds don't configure it — it's a transitive dep of `@shardworks/nexus`. No `nexus-engine.json`, not in the bundle manifest.

Absorbs:
- `engine-mcp-server` — MCP server that serves tools over stdio (inlined, not a dependency)
- `session.ts` from CLI — temp file management, claude process spawning
- MCP config generation from `engine-manifest` — `generateMcpConfig()`

Implements `SessionProvider`:
- `launch()` builds MCP config from resolved tools, writes temp files, spawns `claude` via async `spawn` (not `spawnSync` — required for stream-json parsing, timeout enforcement, and future concurrent sessions), captures output, parses `--output-format stream-json` for metrics and transcript
- Owns the `buildClaudeMcpConfig()` helper, the wrapper script generation, all the Claude Code-specific flag assembly
- The MCP server code ships inside this package (no separate `engine-mcp-server`)

### stdlib stays as-is, with minor updates:

- Tools (`@shardworks/nexus-stdlib/tools`) — unchanged
- Engines (`@shardworks/nexus-stdlib/engines`) — workshop-prepare and workshop-merge stay here. They continue to depend on `engine-worktree-setup` for commission-specific worktree lifecycle (isolated branches, merge-back)
- stdlib does NOT depend on session infrastructure — it signals events and the clockworks/session funnel handles the rest

### engine-worktree-setup stays as a separate package:

- Provides `setupWorktree()` and `teardownWorktree()` for commission-specific worktrees (dedicated branches, merge-back lifecycle)
- The session funnel in core also needs basic worktree create/destroy for `workshop-temp` sessions, but that's simpler — just `git worktree add` from main, no branch management. Core can either use engine-worktree-setup as a dependency or implement the simpler temp worktree operations directly
- Decision: core should implement its own thin `createTempWorktree()` / `removeTempWorktree()` rather than depending on engine-worktree-setup. The commission worktree lifecycle (branches, merge-back) is more complex than what temp sessions need, and core shouldn't depend on engine packages

### CLI goes back to being just the CLI:

- `nsg consult` — calls `core.manifest()`, then `core.launchSession()` (which delegates to the registered provider)
- `nsg clock` — calls `core.clockRun()`, which calls `core.launchSession()` for summon orders
- `program.ts` — at startup, imports `claude-code-session-provider`, registers it as the session provider
- No more `session.ts` or `summon.ts` in CLI

### Clockworks simplifies:

- `registerSummonHandler()` callback goes away
- `executeAnimaOrder()` calls `core.manifest()` + `core.launchSession()` directly
- The summon orchestration logic (resolve role, read commission, write assignment, update status) stays in clockworks — that's commission lifecycle, not session infrastructure

## Dependency Graph (after)

```
cli → core                            ✅
cli → claude-code-session-provider    ✅ (registers at startup)
core → (nothing above it)             ✅
claude-code-session-provider → core   ✅ (for types, tool definitions)
stdlib → core                         ✅ (tools + engines use core APIs)
```

No circular dependencies. No callback hacks.

### Packages deleted by this refactor:
- `engine-manifest` → absorbed into core
- `engine-mcp-server` → absorbed into claude-code-session-provider

### Packages renamed:
- `engine-session-claude-code` → `claude-code-session-provider` (not an engine, not guild-registered)

### Packages unchanged:
- `stdlib` — tools and engines stay put
- `guild-starter-kit` — session-claude-code removed from bundle (platform dep, not guild concern)

## The Session Funnel

ALL sessions flow through `core.launchSession()`:

```
nsg consult (interactive, guildhall)
  → core.manifest(home, animaName)
  → core.launchSession({ interactive: true, prompt: null,
      workspace: { kind: 'guildhall' } })

nsg consult --workshop frontend-app (interactive, workshop)
  → core.manifest(home, animaName)
  → core.launchSession({ interactive: true, prompt: null,
      workspace: { kind: 'workshop-temp', workshop: 'frontend-app' } })
  → (funnel creates fresh worktree, leaves it in place — interactive, no auto-teardown)

clockworks summon (commissioned — event has worktreePath from workshop-prepare)
  → core.manifest(home, animaName)
  → core.launchSession({ interactive: false, prompt: commissionSpec,
      workspace: { kind: 'workshop-managed', workshop, worktreePath } })
  → (funnel uses worktreePath as-is, doesn't touch lifecycle)

clockworks summon (non-commission — event has workshop but no worktreePath)
  → core.manifest(home, animaName)
  → core.launchSession({ interactive: false, prompt: briefContent,
      workspace: { kind: 'workshop-temp', workshop: 'frontend-app' } })
  → (funnel creates fresh worktree, tears it down after)

clockworks brief (guildhall — event has no workspace fields)
  → core.manifest(home, animaName)
  → core.launchSession({ interactive: false, prompt: briefContent,
      workspace: { kind: 'guildhall' } })
```

Every path through the funnel:
1. If `workshop-temp`: create fresh worktree from workshop's bare repo (checked out to main)
2. Writes a `sessions` row to the Ledger (start time, anima, provider, trigger source, workspace) → gets `sessionId`
3. Signals `session.started` event (for clockworks standing orders)
4. Delegates to the provider (with resolved `cwd`) — **wrapped in try/finally**
5. Updates the `sessions` row (end time, exit code, token usage, cost, duration)
6. Writes `SessionRecord` JSON to `.nexus/sessions/{uuid}.json`
7. Signals `session.ended` event (with full metrics + `sessionId` in payload)
8. If `workshop-temp` AND `interactive: false`: tear down the worktree

Steps 5–8 execute even if step 4 throws. Recording failures signal `session.record-failed` (core event) and continue. Teardown failures are logged but swallowed — stale worktree reaping is out of scope.

This means:
- `nsg status` (or a future dashboard) can show all sessions, their costs, their outcomes
- Clockworks can react to session events uniformly
- Token/cost accounting is automatic — if the provider reports it, it gets recorded
- The ethnographer gets session data for free
- Workspace lifecycle is handled uniformly — no special worktree logic scattered across callers

## Ledger Schema Addition

New `sessions` table:

```sql
CREATE TABLE sessions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  anima_id      INTEGER NOT NULL REFERENCES animas(id),
  provider      TEXT NOT NULL,            -- 'claude-code', 'claude-api', 'bedrock'
  model         TEXT,                     -- 'claude-sonnet-4-6', 'claude-opus-4-6', etc.
  trigger       TEXT NOT NULL,            -- 'consult', 'summon', 'brief', 'engine'
  workshop      TEXT,                     -- workshop name, null for guildhall sessions
  workspace_kind TEXT NOT NULL,           -- 'guildhall', 'workshop-temp', 'workshop-managed'
  curriculum_name    TEXT,                -- curriculum used (null if none)
  curriculum_version TEXT,                -- curriculum version at session time
  temperament_name    TEXT,               -- temperament used (null if none)
  temperament_version TEXT,               -- temperament version at session time
  roles         TEXT,                     -- JSON array of role names, e.g. '["artificer","advisor"]'
  started_at    TEXT NOT NULL,
  ended_at      TEXT,
  exit_code     INTEGER,
  input_tokens  INTEGER,
  output_tokens INTEGER,
  cache_read_tokens  INTEGER,
  cache_write_tokens INTEGER,
  cost_usd      REAL,
  duration_ms   INTEGER,
  provider_session_id TEXT,              -- claude session ID, API request ID, etc.
  record_path   TEXT                     -- path to session record JSON file, relative to guild root
);

-- Links commissions to the sessions used to complete them.
-- Separate from sessions because: not all sessions are commissions,
-- and a commission may involve multiple sessions (retries, sub-tasks).
CREATE TABLE commission_sessions (
  commission_id INTEGER NOT NULL REFERENCES commissions(id),
  session_id    INTEGER NOT NULL REFERENCES sessions(id),
  PRIMARY KEY (commission_id, session_id)
);
```

The Ledger captures provenance metadata (name/version, roles, model) so you can query across sessions without opening record files: "all sessions using advisor curriculum v0.3.0", "compare outcomes between temperament versions", "how much did artificer sessions cost this week", "total spend on opus vs sonnet." The full content (prompt text, tool instructions, transcript) lives in the record file — the Ledger has the keys for filtering and aggregation.

### Session record storage

Session records are stored as JSON files on disk, not in SQLite. The Ledger row points to the file via `record_path`.

```
.nexus/sessions/
  {uuid}.json      -- full session record (record_path = ".nexus/sessions/{uuid}.json")
  ...
```

File names are UUIDs (v4), not Ledger row IDs. This decouples disk storage from database identity — safe across Ledger rebuilds, migrations, and test environments.

Each file contains a `SessionRecord`:

```typescript
interface SessionRecord {
  /** Ledger session row ID (for cross-reference). */
  sessionId: number;
  /** The anima that ran this session, with full composition provenance. */
  anima: {
    id: number;
    name: string;
    roles: string[];
    codex: string;
    roleInstructions: string;
    curriculum: { name: string; version: string; content: string } | null;
    temperament: { name: string; version: string; content: string } | null;
    toolInstructions: Array<{ toolName: string; instructions: string }>;
  };
  /** The final assembled system prompt (composed from anima ingredients above). */
  systemPrompt: string;
  /** Tools available to the anima. */
  tools: Array<{ name: string; description: string }>;
  /** Tools that were resolved but failed preconditions. */
  unavailableTools: Array<{ name: string; reasons: string[] }>;
  /** The user-facing prompt (commission spec, brief, etc). */
  userPrompt: string | null;
  /** Raw conversation transcript from the provider — minimally typed. */
  transcript: Record<string, unknown>[];
}
```

This is the object written to disk at the path stored in `sessions.record_path`. It captures full provenance: you can see not just what the anima was told, but *why* — which curriculum produced which training, which roles contributed which instructions, which tools were available and which weren't. Useful for experiments (X009: does changing the curriculum change behavior?) and for debugging (why did the anima do that? what was in its temperament?).

The session funnel:
1. Before launch: captures anima composition, system prompt, user prompt, tools — all known before the provider runs
2. After launch: adds transcript from `SessionResult.transcript` (raw `Record<string, unknown>[]`) — comes back from the provider
3. Writes the `SessionRecord` JSON to `.nexus/sessions/{uuid}.json`
4. Records `record_path` in the sessions table

If step 3 or 4 fails, the funnel signals `session.record-failed` and continues cleanup. The session row still gets `ended_at` from step 5 of the main funnel.

This means every session has a complete, reviewable record: what the anima was told, what it did, what it said. Queryable via the Ledger (find sessions by anima, workshop, curriculum version, cost), readable in detail via the session record files.

## Migration Path

This is a refactor of existing code, not new features. The external behavior doesn't change — commissions still work, consult still works. The packages shift.

### Phase 1: Move manifest into core + create engine-session-claude-code

These two moves happen together because `generateMcpConfig()` needs a home at every point — it leaves engine-manifest and lands in engine-session-claude-code in the same phase. No broken intermediate state.

**Manifest → core:**
- Move all functions from `engine-manifest/src/index.ts` into `core/src/manifest.ts`
- Widen `readAnima()` query to include `curriculum_name`, `curriculum_version`, `temperament_name`, `temperament_version` from `anima_compositions`
- Update `manifest()` to retain individual composition ingredients (codex, role instructions, curriculum, temperament, tool instructions) on `ManifestResult.composition` instead of discarding them after prompt assembly
- `generateMcpConfig()` does NOT move to core — it goes to engine-session-claude-code (transport detail)
- Update all imports (cli, summon, tests)
- Delete `engine-manifest` package

**engine-session-claude-code (new package):**
- New package `packages/engine-session-claude-code/`
- Move `cli/src/session.ts` logic here, **switching from `spawnSync` to async `spawn`** (required for stream-json parsing, timeout enforcement, future concurrent sessions)
- Move `engine-mcp-server` code here (inline as internal module, not a separate package)
- Move `generateMcpConfig()` here (from engine-manifest)
- Implement `SessionProvider` interface
- Delete `engine-mcp-server` package
- Update stdlib if it had any direct dependency on engine-mcp-server (it doesn't — stdlib signals events, doesn't launch sessions)

### Phase 2: Session funnel in core
- Add `SessionProvider` interface and `registerSessionProvider()` to core
- Add `WorkspaceContext`, `ResolvedWorkspace` types
- Add `resolveWorkspace(eventPayload)` — inspects event payload for standard `workshop`/`worktreePath` fields, returns `ResolvedWorkspace`
- Add `createTempWorktree()` / `removeTempWorktree()` to core — thin wrappers around `git worktree add/remove` for `workshop-temp` sessions (simpler than engine-worktree-setup's commission branch lifecycle)
- Add `launchSession()` to core — the funnel with workspace lifecycle, logging, events, metrics, transcript capture, session record writing
  - `workshop-temp` + autonomous: create temp worktree before, tear down after
  - `workshop-temp` + interactive: create temp worktree before, leave in place after
  - `workshop-managed`: use as-is
  - `guildhall`: use `home`
- Error handling: try/finally around provider launch; recording failures signal `session.record-failed`; teardown failures logged and swallowed; stale worktree reaping out of scope (assumed handled by a separate mechanism, e.g. future clockwork standing order or CLI command)
- Add `sessions` table migration
- Update clockworks to use `core.launchSession()` directly, remove `registerSummonHandler()`
- Move summon orchestration logic (resolve role, read commission, write assignment, update status) from `cli/src/summon.ts` into clockworks — it was only in CLI because of the session launcher dependency

### Phase 3: Wire it up in CLI
- `program.ts` imports `engine-session-claude-code`, registers it
- `nsg consult` calls `core.manifest()` + `core.launchSession()`
- Delete `cli/src/summon.ts`
- Delete `cli/src/session.ts`

### Phase 4: Metrics capture
- Update `engine-session-claude-code` to use `--output-format stream-json` and parse token usage from claude's streamed output
- Feed metrics into `SessionResult`
- Core's funnel records them in the Ledger automatically

## Decisions (from review)

- **Interactive sessions through the funnel** — yes, same funnel, `interactive: true` flag changes provider behavior (inherit stdio, no `--print`). No open question.
- **Interactive consult + temp worktree** — the funnel does NOT auto-teardown `workshop-temp` worktrees for interactive sessions. Interactive sessions may have un-pushed commits; tearing down would destroy work. The worktree is left in place and must be cleaned up manually (e.g. `nsg workshop cleanup` or a future reaping mechanism). Auto-teardown only applies to autonomous (`interactive: false`) sessions.
- **Temp worktree naming** — use a crypto-safe random hash, not timestamps. E.g. `.nexus/worktrees/{workshop}/{hash}/`.
- **Async spawn** — `engine-session-claude-code` uses async `spawn` (not `spawnSync`). Required for stream-json transcript parsing, timeout enforcement, and eventual concurrent session support. Interactive mode still inherits stdio; async spawn handles this fine.
- **Session ID surfacing** — the funnel writes the Ledger session row before launching the provider, so `sessionId` is known. It's returned on `SessionResult` so callers (e.g. clockworks commission pipeline) can write join rows like `commission_sessions`.
- **Session record file naming** — UUID v4, not Ledger row ID. Decouples disk from database identity.
- **Transcript typing** — `Record<string, unknown>[]` for now. Raw provider output, stored as-is. Typed normalization deferred until we need programmatic transcript analysis.
- **Funnel error events** — recording failures (Ledger write, session record write) signal `session.record-failed` as a core event, following the same pattern as `standing-order.failed`. Teardown failures are logged but swallowed. Stale worktree reaping is out of scope for this refactor.

## Transcript Capture Strategy

**Autonomous sessions (`--print`):**
- Use `--output-format stream-json` — structured message events streamed to stdout
- `engine-session-claude-code` parses the stream, extracts transcript + metrics
- Complete and reliable

**Interactive sessions (no `--print`):**
- Claude already persists full conversation transcripts as JSONL files at `~/.claude/projects/{project-path}/{sessionId}.jsonl`
- The funnel pre-generates a UUID and passes `--session-id {uuid}` to the claude process
- After the session exits, the funnel reads the JSONL file from claude's storage and copies/references it as the session transcript
- No TUI interference, no tee hack — just read what claude already saved

This means both session types get full transcript capture. The format differs (stream-json events vs claude's JSONL), but both are stored as `Record<string, unknown>[]` in the session record. Typed normalization is deferred until we need programmatic analysis.

## Open Questions

1. **Claude JSONL format stability.** The `~/.claude/projects/` JSONL files are claude's internal storage — not a documented public API. Format could change between versions. Worth abstracting the reader so it's easy to update. Alternatively, if interactive sessions eventually support `--output-format` alongside the TUI, we can switch to the official format.