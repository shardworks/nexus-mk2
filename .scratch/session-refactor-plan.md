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
   * Full conversation transcript — everything that happened during the session.
   * Provider returns this as structured data; the funnel writes it to disk.
   * For claude-code with --output-format stream-json: array of message events.
   * For API providers: the messages array from the conversation.
   */
  transcript?: TranscriptMessage[];
}

/** A single message in a session transcript. */
interface TranscriptMessage {
  role: 'system' | 'user' | 'assistant' | 'tool_use' | 'tool_result';
  content: string;
  /** Timestamp of the message, if available from the provider. */
  timestamp?: string;
  /** For tool_use: which tool was called. */
  toolName?: string;
  /** For tool_use: the input parameters. */
  toolInput?: Record<string, unknown>;
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
2. **`workshop` present, no `worktreePath`** → create a fresh temporary worktree checked out to main. This is `workshop-temp`. The session funnel creates it before launching and tears it down after. Every session gets a clean, current snapshot. No staleness, no conflicts between concurrent sessions.
3. **Neither** → guildhall. `cwd` is `home`.

For callers outside clockworks (e.g. `nsg consult --workshop frontend-app`), the CLI resolves the workspace context before calling `launchSession()`. Same rules apply.

**Session launcher** — the single code path:
```typescript
/**
 * Launch a session through the registered provider.
 *
 * This is THE code path for all sessions. It:
 * 1. If workspace is workshop-temp: create fresh worktree from main
 * 2. Records session.started in the Ledger
 * 3. Signals session.started event
 * 4. Delegates to the provider (passing resolved cwd)
 * 5. Records session.ended in the Ledger (with metrics)
 * 6. Signals session.ended event (with full metrics in payload)
 * 7. If workspace is workshop-temp: tear down the worktree
 * 8. Returns the result
 */
function launchSession(options: SessionLaunchOptions): Promise<SessionResult>
```

**Session provider registration:**
```typescript
function registerSessionProvider(provider: SessionProvider): void
```

### engine-session-claude-code (new package, absorbs two existing packages):

Absorbs:
- `engine-mcp-server` — MCP server that serves tools over stdio (inlined, not a dependency)
- `session.ts` from CLI — temp file management, claude process spawning
- MCP config generation from `engine-manifest` — `generateMcpConfig()`

Implements `SessionProvider`:
- `launch()` builds MCP config from resolved tools, writes temp files, spawns `claude --print` (or interactive), captures output, parses `--output-format stream-json` for metrics and transcript
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
- `program.ts` — at startup, imports `engine-session-claude-code`, registers it as the session provider
- No more `session.ts` or `summon.ts` in CLI

### Clockworks simplifies:

- `registerSummonHandler()` callback goes away
- `executeAnimaOrder()` calls `core.manifest()` + `core.launchSession()` directly
- The summon orchestration logic (resolve role, read commission, write assignment, update status) stays in clockworks — that's commission lifecycle, not session infrastructure

## Dependency Graph (after)

```
cli → core                          ✅
cli → engine-session-claude-code    ✅ (registers at startup)
core → (nothing above it)           ✅
engine-session-claude-code → core   ✅ (for types, tool definitions)
stdlib → core                       ✅ (tools + engines use core APIs)
stdlib → engine-worktree-setup      ✅ (workshop-prepare/merge use worktree ops)
engine-worktree-setup → core        ✅ (for workshopBarePath, etc.)
```

No circular dependencies. No callback hacks.

### Packages deleted by this refactor:
- `engine-manifest` → absorbed into core
- `engine-mcp-server` → absorbed into engine-session-claude-code

### Packages unchanged:
- `stdlib` — tools and engines stay put
- `engine-worktree-setup` — commission worktree lifecycle stays separate
- `engine-ledger-migrate` — not touched
- `guild-starter-kit` — not touched (may need bundle manifest updates if package names change)

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
  → (funnel creates fresh worktree, tears it down after)

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
2. Writes a `sessions` row to the Ledger (start time, anima, provider, trigger source, workspace)
3. Signals `session.started` event (for clockworks standing orders)
4. Delegates to the provider (with resolved `cwd`)
5. Updates the `sessions` row (end time, exit code, token usage, cost, duration)
6. Signals `session.ended` event (with full metrics in payload)
7. If `workshop-temp`: tear down the worktree

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
  session-1.json      -- full session record (record_path = ".nexus/sessions/session-1.json")
  session-2.json
  ...
```

Each file contains a `SessionRecord`:

```typescript
interface SessionRecord {
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
  /** Full conversation transcript from the provider. */
  transcript: TranscriptMessage[];
}
```

This is the object written to disk at the path stored in `sessions.record_path`. It captures full provenance: you can see not just what the anima was told, but *why* — which curriculum produced which training, which roles contributed which instructions, which tools were available and which weren't. Useful for experiments (X009: does changing the curriculum change behavior?) and for debugging (why did the anima do that? what was in its temperament?).

The session funnel:
1. Before launch: captures anima composition, system prompt, user prompt, tools — all known before the provider runs
2. After launch: adds transcript from `SessionResult.transcript` — comes back from the provider
3. Writes the `SessionRecord` JSON to `.nexus/sessions/`
4. Records `record_path` in the sessions table

This means every session has a complete, reviewable record: what the anima was told, what it did, what it said. Queryable via the Ledger (find sessions by anima, workshop, curriculum version, cost), readable in detail via the session record files.

## Migration Path

This is a refactor of existing code, not new features. The external behavior doesn't change — commissions still work, consult still works. The packages shift.

### Phase 1: Move manifest into core
- Move all functions from `engine-manifest/src/index.ts` into `core/src/manifest.ts`
- Widen `readAnima()` query to include `curriculum_name`, `curriculum_version`, `temperament_name`, `temperament_version` from `anima_compositions`
- Update `manifest()` to retain individual composition ingredients (codex, role instructions, curriculum, temperament, tool instructions) on `ManifestResult.composition` instead of discarding them after prompt assembly
- Remove MCP config generation (stays behind for Phase 2)
- Update all imports (cli, summon, tests)
- Delete `engine-manifest` package

### Phase 2: Create engine-session-claude-code
- New package `packages/engine-session-claude-code/`
- Move `cli/src/session.ts` logic here
- Move `engine-mcp-server` code here (inline as internal module, not a separate package)
- Move `generateMcpConfig()` here (from what was engine-manifest)
- Implement `SessionProvider` interface
- Delete `engine-mcp-server` package
- Update stdlib if it had any direct dependency on engine-mcp-server (it doesn't — stdlib signals events, doesn't launch sessions)

### Phase 3: Session funnel in core
- Add `SessionProvider` interface and `registerSessionProvider()` to core
- Add `WorkspaceContext`, `ResolvedWorkspace` types
- Add `resolveWorkspace(eventPayload)` — inspects event payload for standard `workshop`/`worktreePath` fields, returns `ResolvedWorkspace`
- Add `createTempWorktree()` / `removeTempWorktree()` to core — thin wrappers around `git worktree add/remove` for `workshop-temp` sessions (simpler than engine-worktree-setup's commission branch lifecycle)
- Add `launchSession()` to core — the funnel with workspace lifecycle, logging, events, metrics, transcript capture
  - `workshop-temp`: create temp worktree before, tear down after
  - `workshop-managed`: use as-is
  - `guildhall`: use `home`
- Add `sessions` table migration
- Update clockworks to use `core.launchSession()` directly, remove `registerSummonHandler()`
- Move summon orchestration logic (resolve role, read commission, write assignment, update status) from `cli/src/summon.ts` into clockworks — it was only in CLI because of the session launcher dependency

### Phase 4: Wire it up in CLI
- `program.ts` imports `engine-session-claude-code`, registers it
- `nsg consult` calls `core.manifest()` + `core.launchSession()`
- Delete `cli/src/summon.ts`
- Delete `cli/src/session.ts`

### Phase 5: Metrics capture
- Update `engine-session-claude-code` to use `--output-format json` and parse token usage from claude's output
- Feed metrics into `SessionResult`
- Core's funnel records them in the Ledger automatically

## Decisions (from review)

- **Interactive sessions through the funnel** — yes, same funnel, `interactive: true` flag changes provider behavior (inherit stdio, no `--print`). No open question.
- **Interactive consult + temp worktree** — fine for now. Temp worktree is torn down after session. Anima instructions should note this so the anima can alert the user or handle merging if needed.
- **Temp worktree naming** — use a crypto-safe random hash, not timestamps. E.g. `.nexus/worktrees/{workshop}/{hash}/`.

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

This means both session types get full transcript capture. The format differs (stream-json events vs claude's JSONL), but the `SessionArchive` normalizes them into a common structure.

## Open Questions

1. **Claude JSONL format stability.** The `~/.claude/projects/` JSONL files are claude's internal storage — not a documented public API. Format could change between versions. Worth abstracting the reader so it's easy to update. Alternatively, if interactive sessions eventually support `--output-format` alongside the TUI, we can switch to the official format.