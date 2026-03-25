# CLI Restructure Spec: Noun-Verb Pattern + Work Decomposition

## Summary

Restructure the `nsg` CLI to use a consistent `nsg <noun> <verb>` pattern for all resource management, with a small set of top-level exceptions for high-frequency special operations. Add noun groups for the work decomposition hierarchy (work, piece, job, stroke). Establish a naming convention that enables auto-wiring between CLI commands and MCP tools.

## Motivation

The current CLI mixes patterns: some commands are top-level verbs (`commission`, `consult`), some are noun groups (`workshop`, `clock`, `anima`), and the verb sets within noun groups are inconsistent. The work decomposition hierarchy (designed in the previous session) has no CLI surface. Standardizing around `nsg <noun> <verb>` makes the CLI predictable, enables tooling (auto-wiring, help generation), and provides a natural home for all CRUD operations on guild entities.

## Design Principles

1. **Every guild entity gets a noun group.** Workshops, animas, commissions, tools, and the four work hierarchy levels (work, piece, job, stroke) are all nouns with standard verbs.
2. **Standard verbs are: `create`, `list`, `show`, `update`, `remove`.** Not every noun needs all five, but when a verb applies, it uses this spelling. No synonyms (`add`/`new`/`make`). Work items (work, piece, job, stroke) do not get `remove` — they are historical records; cancellation is a status transition via `update`.
3. **Top-level exceptions are rare and intentional.** Only commands that are both high-frequency and semantically distinct from CRUD earn a top-level slot: `init`, `status`, `consult`, `signal`.
4. **CLI commands and MCP tools share implementations.** Every `nsg <noun> <verb>` maps to a `<noun>-<verb>` tool. The tool handler is the canonical implementation; the CLI is a thin shell that parses args and calls it.
5. **All tools are registered; guilds control the surface.** Read-only tools (`list`, `show`) exist as real tools. Which tools an anima sees is controlled by role configuration in `guild.json`, not by omitting tools from the framework.

## CLI Structure

### Top-Level Commands (no noun-verb pattern)

These are special operations that don't manage a resource:

| Command | Description | Tool? |
|---------|-------------|-------|
| `nsg init` | One-time guild setup | No (CLI-only) |
| `nsg status` | Guild dashboard | No (CLI-only) |
| `nsg consult [role]` | Interactive consultation with an anima | No (CLI-only, launches session) |
| `nsg signal <name>` | Signal a custom guild event | Yes (`signal` — existing, stays as-is) |

### Noun Groups

#### `nsg guild`

Guild-wide operations that don't fit under a specific entity.

| Subcommand | Description | Tool? |
|------------|-------------|-------|
| `guild restore` | Rehydrate runtime state from git-tracked guild state | No (CLI-only, operator action) |

#### `nsg workshop`

| Subcommand | Description | Tool? | Notes |
|------------|-------------|-------|-------|
| `workshop create <org/name>` | Create GitHub repo + register | `workshop-create` | |
| `workshop register <url>` | Clone existing remote + register as workshop | `workshop-register` | Distinct from `create` — registers an existing repo rather than creating a new one. |
| `workshop list` | List registered workshops | `workshop-list` | |
| `workshop show <name>` | Detail view of one workshop | `workshop-show` | **New** |
| `workshop remove <name>` | Remove workshop + bare clone + worktrees | `workshop-remove` | |

#### `nsg tool`

| Subcommand | Description | Tool? | Notes |
|------------|-------------|-------|-------|
| `tool install <source>` | Install tool/engine/curriculum/etc. | `tool-install` | Renamed from `install-tool` |
| `tool remove <name>` | Remove a tool | `tool-remove` | Renamed from `remove-tool` |
| `tool list` | List installed tools | `tool-list` | **New** |

> **Note on `install`/`remove` vs. `create`/`remove`:** Tools are installed from external sources, not created in-place. `install`/`remove` is the correct domain vocabulary here, even though it deviates from the standard CRUD verbs. This is an acceptable, self-explanatory exception.

#### `nsg anima`

| Subcommand | Description | Tool? | Notes |
|------------|-------------|-------|-------|
| `anima create <name>` | Instantiate a new anima | `anima-create` | Renamed from `instantiate` |
| `anima list` | List animas (with status/role filters) | `anima-list` | **New** |
| `anima show <name>` | Detail view (roles, curriculum, temperament, status) | `anima-show` | **New** |
| `anima update <name>` | Update anima fields (roles, status, etc.) | `anima-update` | **New** |
| `anima remove <name>` | Retire/remove an anima | `anima-remove` | **New** |
| `anima manifest <name>` | Resolve composition + show session config | No | Special verb — debug/inspect tool, not CRUD. Not useful as an agent tool. |

#### `nsg commission`

| Subcommand | Description | Tool? | Notes |
|------------|-------------|-------|-------|
| `commission create <spec>` | Post a commission to the guild | `commission-create` | Renamed from `commission` |
| `commission list` | List commissions (with status filters) | `commission-list` | **New** |
| `commission show <id>` | Detail view of a commission | `commission-show` | **New** |
| `commission update <id>` | Update commission (status transitions, etc.) | `commission-update` | **New** |

**Alias:** `nsg commission <spec>` (bare, without a subcommand) is shorthand for `nsg commission create <spec>`. Commander supports default subcommands to enable this.

#### `nsg clock`

| Subcommand | Description | Tool? | Notes |
|------------|-------------|-------|-------|
| `clock list` | Show pending events | `clock-list` | |
| `clock tick [id]` | Process one event | `clock-tick` | |
| `clock run` | Drain event queue | `clock-run` | |

> Clock uses domain-specific verbs (`tick`, `run`) — not CRUD. These are operational actions on the event queue, not resources.

### New: Work Decomposition Nouns

These four noun groups provide the CLI surface for the work hierarchy designed in the previous session. All four follow the same CRUD pattern.

#### `nsg work`

| Subcommand | Description | Tool? |
|------------|-------------|-------|
| `work create` | Create a work item | `work-create` |
| `work list` | List works (filterable by status, commission) | `work-list` |
| `work show <id>` | Detail view — pieces, status, commission lineage | `work-show` |
| `work update <id>` | Update fields, status transitions | `work-update` |

#### `nsg piece`

| Subcommand | Description | Tool? |
|------------|-------------|-------|
| `piece create` | Create a piece (under a work or standalone) | `piece-create` |
| `piece list` | List pieces (filterable by parent work, status) | `piece-list` |
| `piece show <id>` | Detail view — jobs, status, parent work | `piece-show` |
| `piece update <id>` | Update fields, status transitions | `piece-update` |

#### `nsg job`

| Subcommand | Description | Tool? |
|------------|-------------|-------|
| `job create` | Create a job (under a piece or standalone) | `job-create` |
| `job list` | List jobs (filterable by piece, status, assignee) | `job-list` |
| `job show <id>` | Detail view — strokes, assignment, progress | `job-show` |
| `job update <id>` | Update fields, status transitions | `job-update` |

#### `nsg stroke`

| Subcommand | Description | Tool? |
|------------|-------------|-------|
| `stroke create` | Record a new stroke against a job | `stroke-create` |
| `stroke list` | List strokes for a job | `stroke-list` |
| `stroke show <id>` | Detail view of a stroke | `stroke-show` |
| `stroke update <id>` | Update status (pending → complete, etc.) | `stroke-update` |

### Complete Tool Inventory

Every `nsg <noun> <verb>` maps to a `<noun>-<verb>` tool. Full list:

**Existing (renamed):**
- `commission-create` (was `commission`)
- `anima-create` (was `instantiate`)
- `tool-install` (was `install-tool`)
- `tool-remove` (was `remove-tool`)
- `signal` (stays as-is — top-level exception)

**Existing (unchanged):**
- `clock-list`, `clock-tick`, `clock-run` (new tool wrappers for existing core functions)

**New — entity CRUD:**
- `commission-list`, `commission-show`, `commission-update`
- `anima-list`, `anima-show`, `anima-update`, `anima-remove`
- `workshop-create`, `workshop-register`, `workshop-list`, `workshop-show`, `workshop-remove`
- `tool-list`

**New — work decomposition:**
- `work-create`, `work-list`, `work-show`, `work-update`
- `piece-create`, `piece-list`, `piece-show`, `piece-update`
- `job-create`, `job-list`, `job-show`, `job-update`
- `stroke-create`, `stroke-list`, `stroke-show`, `stroke-update`

**Not tools (CLI-only):**
- `init`, `status`, `consult`, `guild restore`, `anima manifest`

Total: ~37 tools (up from 6 currently).

## Auto-Wiring Architecture

### The Pattern

Every CLI noun-verb command is a thin shell:

```typescript
// nsg job create → finds tool 'job-create' → invokes handler
createCommand('create')
  .description('...')
  .argument('<spec>', '...')
  .action((spec, options, cmd) => {
    const home = resolveHome(cmd);
    const tool = resolveToolByName('job-create');
    const result = tool.handler({ spec, ...options }, { home });
    // format and print result
  });
```

The dream state is a generic noun-group factory:

```typescript
// Hypothetical — register a noun group with standard verbs auto-wired to tools
registerNounGroup('job', {
  create: { args: ['<spec>'], options: ['--piece <piece-id>'] },
  list:   { options: ['--piece <piece-id>', '--status <status>'] },
  show:   { args: ['<id>'] },
  update: { args: ['<id>'], options: ['--status <status>'] },
});
```

This is aspirational. The practical first step is the naming convention — even if the wiring is still hand-written, the convention makes it mechanical and predictable.

### Tool Resolution

The auto-wiring needs a way to look up a tool by name at CLI time. Currently, tools are resolved through the manifest engine (file-based, in `node_modules`). The CLI needs a lighter-weight path:

1. **CLI imports tool definitions directly** from stdlib (or wherever the tools are published). This is already how the CLI works for `commission` — it imports `commission` from core and calls it.
2. **Tool handlers call core functions.** The tool is a thin wrapper around a core function. `job-create` tool calls `createJob()` from core.
3. **CLI can call core functions directly** as a fallback, bypassing the tool layer. The tool layer adds description/instructions/params schema; the CLI already has its own descriptions and Commander-defined params.

The cleanest architecture: **core exports the functions, tools wrap them for agent access, CLI wraps them for human access.** Both access paths call the same core function. The tool definition adds agent-facing metadata (instructions, param schemas for MCP). The CLI command adds human-facing metadata (help text, Commander options).

```
core: createJob(), listJobs(), showJob(), updateJob()
  ↑                    ↑
  |                    |
tool: job-create     CLI: nsg job create
(agent access)       (human access)
```

### Instructions Strategy

With ~37 tools, per-tool instruction files become a real concern:
- Token cost: every tool's instructions are injected into the system prompt
- Maintenance cost: 37 instruction files to keep in sync
- Most CRUD tools have simple, predictable usage

**Recommendation:** Use inline `instructions` (short strings) for standard CRUD tools, not `instructionsFile`. Reserve instruction files for tools with complex usage patterns (signal, commission-create). Example:

```typescript
tool({
  name: 'job-list',
  description: 'List jobs, optionally filtered by piece or status',
  instructions: 'Returns jobs from the Ledger. Use --piece to filter by parent piece, --status to filter by lifecycle status.',
  params: { ... },
  handler: (params, ctx) => listJobs(ctx.home, params),
});
```

For the work decomposition tools specifically, a shared instruction file per noun group might work well — one `instructions/work-items.md` covering the hierarchy, referenced by all 16 work/piece/job/stroke tools.

## Migration Path

### Phase 1: Naming convention + restructure existing commands
- Rename existing tools (`instantiate` → `anima-create`, `install-tool` → `tool-install`, etc.)
- Move `commission` from top-level to `commission create` with alias
- Add missing `list`/`show` commands for existing nouns (anima, commission, tool)
- Update guild-starter-kit role configs to reference new tool names
- Update all instruction docs that reference old tool names

### Phase 2: Work decomposition CRUD
- Implement Ledger schema for work hierarchy (works, pieces, jobs, strokes tables)
- Implement core functions: `createWork()`, `listWorks()`, `showWork()`, `updateWork()`, etc.
- Create tool definitions wrapping core functions
- Create CLI commands for all four noun groups
- Add framework events: `work.created`, `piece.ready`, `job.ready`, `job.completed`, `job.failed`, `stroke.recorded`

### Phase 3: Auto-wiring infrastructure (optional)
- Build the generic noun-group factory for CLI registration
- Tool resolution at CLI time without going through manifest
- Possibly: auto-generate Commander subcommands from tool param schemas

Phase 3 is a nice-to-have. Phases 1 and 2 deliver all the user-facing value; the auto-wiring just reduces boilerplate.

## Breaking Changes

- **Tool renames:** `instantiate` → `anima-create`, `install-tool` → `tool-install`, `remove-tool` → `tool-remove`, `commission` → `commission-create`. Any agent instructions, standing orders, or guild configs referencing old names must be updated.
- **CLI command renames:** `nsg workshop add` → `nsg workshop register`. `nsg commission <spec>` still works via alias. `nsg anima create` and `nsg anima manifest` were already subcommands — no actual break.
- **guild.json tool references:** Role tool lists and base tools in guild configs will need to reference the new names. The guild-starter-kit migration handles this.
- **ID format migration:** All entities moving from auto-increment integers to prefixed hex IDs. Animas (`a-<hex>`), commissions (`c-<hex>`), clock events (`evt-<hex>`), sessions (`ses-<hex>`), and any other existing auto-increment columns. Requires Ledger/Daybook migrations. Foreign key references must be updated in the same migration. New entities (work items) start with the new format from day one.

## Resolved Decisions

1. **ID format: prefixed random hex, 8 characters — everywhere.** All entity IDs use a lowercase type prefix + hyphen + 8 random hex characters, generated via `crypto.randomBytes(4).toString('hex')`. No auto-increment IDs anywhere in the system. Examples: `w-a3f7b2c1` (work), `p-09d4e8f2` (piece), `j-7c2b1a09` (job), `s-e4f5d6c7` (stroke), `c-b1a2c3d4` (commission), `a-5e6f7a8b` (anima), `evt-d8e2f1a0` (clock event), `ses-4b7c9e01` (session). The prefix makes the entity type visible at a glance; the 8 hex chars provide ~4.3 billion possibilities, more than sufficient for a local system. Auto-increment is retired because sequential integers carry false weight — "event #7" sounds foundational and important; `evt-d8e2f1a0` is just a thing that happened. Sequential numbering also invites reasoning about gaps and ordering that should come from timestamps, not IDs.
2. **`workshop add` → `workshop register`.** Renamed for clarity — `register` means "register an existing remote repo as a workshop" (clone + add to guild.json). `create` means "create a new GitHub repo and register it." Both result in a registered workshop, but the operations are distinct.
3. **No `remove` verb for work items.** Work items (work, piece, job, stroke) are historical records. Cancellation is a status transition via `update`, not a deletion. Only entities with real deletion semantics (workshop, anima, tool) get `remove`.
4. **Status lifecycles for work items.** Out of scope for this spec — belongs in the Ledger schema design.

## Open Questions

None currently. All design decisions for this spec are resolved.
