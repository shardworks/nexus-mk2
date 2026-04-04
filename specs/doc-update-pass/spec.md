---
author: plan-writer
estimated_complexity: 5
---

# Doc Update Pass

## Summary

Audit and correct three documentation files: rewrite the CLI README's command tables to match actual installed tools, update `review-loop.md`'s status and engine specifications to match the Spider implementation, and delete the stale `_agent-context.md` orientation doc.

## Current State

### `packages/framework/cli/README.md`

Lines 1-117 cover framework commands (init, status, version, upgrade, plugin management) and CLI architecture (command discovery, auto-grouping, flag generation). These are accurate.

Lines 119-208 contain "Standard Guild Commands" tables and a "Migration Status" section. The command tables:
- Attribute 10 commands to `nexus-stdlib`, a package that does not exist
- List 17 commands that have no implementation in any plugin
- Use wrong source labels for 7 commands that do exist
- Omit 15 tools that exist in actual plugin packages
- The "Migration Status" section (lines 193-208) contradicts itself, listing codex tools as both "remaining in v1" and "migrated"

### `docs/architecture/apparatus/review-loop.md`

355-line design spec. Status line says `Status: **Design** (not yet implemented)`.

The doc describes Option B (review engines in the rig) as the chosen design. The doc's engine specifications diverge from the actual implementation:

- Doc says the `review` engine is kind `clockwork`. The actual engine (`packages/plugins/spider/src/engines/review.ts` line 2) is kind `quick` (Animator-backed — it launches a reviewer session).
- Doc describes a branching rig graph: `implement → review → (pass: seal | fail: revise → review2 → seal/escalate)`. The actual pipeline (`packages/plugins/spider/src/spider.ts` lines 104-109) is linear: `draft → implement → review → revise → seal`. No branching, no escalation engine.
- Doc's engine design blocks show `inputs: ['writId', 'worktreePath', 'attempt']`. Actual engines receive `givens.writ` (full `WritDoc`), read `context.upstream['draft']` (a `DraftYields`), and have no `attempt` tracking.
- Doc says `uncommitted_changes` is a separate, always-enabled check. The actual code passes `git status --porcelain` output to the reviewer prompt; there is no standalone pass/fail check.
- Doc describes configuration under `guild.json["review"]` with `enabled`, `maxRetries`, `buildCommand`, `testCommand`. Actual configuration lives under `guild.json["spider"]` (`SpiderConfig` in `packages/plugins/spider/src/types.ts` lines 142-161) with `buildCommand`, `testCommand`, `role`, `pollIntervalMs`. No `enabled` or `maxRetries`.
- Doc describes file-based artifacts (`review-loop/attempt-N/review.md`). The actual implementation stores results in the Stacks as session records — no filesystem artifacts.

### `docs/architecture/_agent-context.md`

308-line agent orientation doc written during sessions 1-4 (2026-03-31). Substantially stale: the package table lists 4 non-existent packages and is missing 10; the "Implemented vs. Aspirational" section lists Spider, Fabricator, Instrumentarium, Loom, and Animator as "not yet implemented" when all exist as packages; file paths use wrong directory prefixes (`packages/arbor/` instead of `packages/framework/arbor/`).

One file references it: `docs/architecture/index.md` line 293 links to `_agent-context.md#whats-implemented-vs-aspirational`.

## Requirements

- R1: The CLI README's "Standard Guild Commands" section (lines 119-190) must list every tool that exists in `packages/plugins/*/src/tools/*.ts`, grouped by functional domain, with accurate source attributions using plugin short names.
- R2: Commands that do not exist in code but represent planned future work must remain in the command tables, clearly marked with a *(Planned)* indicator that distinguishes them from implemented commands.
- R3: The Source column for every implemented command must use the plugin id short name (`clerk`, `animator`, `codexes`, `spider`, `tools`, `parlour`), not npm package names or display names.
- R4: The "Migration Status" section (lines 193-208) must be removed entirely.
- R5: `review-loop.md`'s status line must be updated from `Status: **Design** (not yet implemented)` to `Status: **Design**` with an implementation-status note listing which components exist in code and which do not.
- R6: `review-loop.md`'s engine design blocks and rig pattern must be verified against the actual Spider implementation, with discrepancies corrected or annotated.
- R7: `docs/architecture/_agent-context.md` must be deleted.
- R8: The broken link to `_agent-context.md` in `docs/architecture/index.md` line 293 must be removed or replaced so no dead link remains.

## Design

### CLI README: Standard Guild Commands Rewrite (R1, R2, R3, R4)

Replace lines 119-208 (from `## Standard Guild Commands` through end of `## Migration Status`) with a rewritten `## Standard Guild Commands` section. No Migration Status section follows it.

**Grouping (D1):** Organize by functional domain, not by contributing apparatus. The domain groups are:

1. **Commissions and Writs** — tools from clerk
2. **Sessions** — tools from animator and parlour
3. **Codexes and Drafts** — tools from codexes
4. **Rigs** — tools from spider
5. **Introspection** — tools from tools (Instrumentarium self-documentation)

Each group is a subsection with a markdown table: `| Command | Source | Description |`.

**Source column (D3):** Use plugin id short names: `clerk`, `animator`, `codexes`, `spider`, `tools`, `parlour`.

**Implemented commands (R1):** The complete list of tools to include, derived from `packages/plugins/*/src/tools/*.ts`. Use the `description` field from each tool's source file:

**Commissions and Writs** (source: `clerk`):

| Command | Description |
|---|---|
| `nsg commission post` | Post a new commission, creating a writ in ready status |
| `nsg writ list` | List writs with optional filters |
| `nsg writ show` | Show full detail for a writ |
| `nsg writ accept` | Accept a writ, transitioning it from ready to active |
| `nsg writ complete` | Complete a writ, transitioning it from active to completed |
| `nsg writ fail` | Fail a writ, transitioning it from active to failed |
| `nsg writ cancel` | Cancel a writ, transitioning it from ready or active to cancelled |
| `nsg writ link` | Link two writs with a typed relationship |
| `nsg writ unlink` | Remove a link between two writs |

**Sessions** (source: `animator` and `parlour`):

| Command | Source | Description |
|---|---|---|
| `nsg summon` | animator | Summon an anima -- compose context and launch a session |
| `nsg session list` | animator | List recent sessions with optional filters |
| `nsg session show` | animator | Show full detail for a single session by id |
| `nsg conversation list` | parlour | List conversations with optional filters |
| `nsg conversation show` | parlour | Show full detail for a conversation including all turns |
| `nsg conversation end` | parlour | End an active conversation |

**Codexes and Drafts** (source: `codexes`):

| Command | Description |
|---|---|
| `nsg codex add` | Register an existing git repository as a guild codex |
| `nsg codex list` | List all codexes registered with the guild |
| `nsg codex show` | Show details of a registered codex including active draft bindings |
| `nsg codex remove` | Remove a codex from the guild (does not affect the remote repository) |
| `nsg codex push` | Push a branch to the codex remote |
| `nsg draft open` | Open a draft binding on a codex (creates an isolated git worktree) |
| `nsg draft list` | List active draft bindings, optionally filtered by codex |
| `nsg draft abandon` | Abandon a draft binding (removes the git worktree and branch) |
| `nsg draft seal` | Seal a draft binding into the codex (ff-only merge or rebase; no merge commits) |

**Rigs** (source: `spider`):

| Command | Description |
|---|---|
| `nsg rig list` | List rigs with optional filters |
| `nsg rig show` | Retrieve a rig by id |
| `nsg rig for-writ` | Find the rig for a given writ |
| `nsg crawl one` | Execute one step of the Spider's crawl loop |
| `nsg crawl continual` | Run the Spider's crawl loop continuously |

**Introspection** (source: `tools`):

| Command | Description |
|---|---|
| `nsg tools list` | List available tools with optional caller/plugin filters |
| `nsg tools show` | Show full detail for a tool by name |

**Aspirational commands (R2, D2):** After the implemented command tables, include the planned commands from the original README that have no implementation. Mark each with *(Planned)* in the Description column. These are:

| Command | Source | Description |
|---|---|---|
| `nsg anima create` | — | *(Planned)* Create a new anima |
| `nsg anima list` | — | *(Planned)* List animas |
| `nsg anima show` | — | *(Planned)* Show anima detail |
| `nsg anima update` | — | *(Planned)* Update anima configuration |
| `nsg anima remove` | — | *(Planned)* Retire an anima |
| `nsg anima manifest` | — | *(Planned)* Preview the manifest for an anima |
| `nsg signal` | — | *(Planned)* Signal a custom event |
| `nsg event list` | — | *(Planned)* List recent events |
| `nsg event show` | — | *(Planned)* Show event detail |
| `nsg dispatch list` | — | *(Planned)* List recent dispatches |
| `nsg audit list` | — | *(Planned)* List audit entries |

Place these in a single table under a `### Planned` subsection with a brief note: these commands are planned but not yet implemented. The Source column uses `—` since no plugin contributes them yet.

**Remove the caveat note** at the former line 121 ("Note: The standard kits are still being developed..."). The rewritten section is accurate and does not need a caveat.

**Remove the Migration Status section** (R4, D4): Do not include a `## Migration Status` section or any v1/v2 migration tracker. The section ends after the Planned subsection.

### review-loop.md Updates (R5, R6)

**Status line (R5, D6):** Replace line 3:

```
Status: **Design** (not yet implemented)
```

with:

```
Status: **Design**

> **Implementation status (2026-04):** The Spider implements a five-engine linear pipeline (`draft → implement → review → revise → seal`) in `packages/plugins/spider/src/engines/`. The review and revise engines exist and are functional. The branching rig pattern (conditional pass/fail routing, escalation engine, retry budget) described below is not yet implemented — the current pipeline always runs all five engines in sequence. Configuration lives under `guild.json["spider"]`, not `guild.json["review"]`. See `packages/plugins/spider/src/types.ts` for `SpiderConfig`.

```

**Engine design verification (R6, D5):** Add a brief annotation before or after each engine design block (lines 73-105) noting where the implementation diverges. Specific annotations:

1. At the `review` engine section (line 73), add a note:
   > **Implementation note:** The shipped engine is kind `quick` (Animator-backed), not `clockwork`. It launches a reviewer session that assesses the diff against the spec. Mechanical checks (build/test) run synchronously before the session, but `uncommitted_changes` is not a separate pass/fail check — git status is included in the reviewer's prompt. The engine receives the full `WritDoc` via `givens.writ` and reads `DraftYields` from `context.upstream['draft']`. There is no `attempt` tracking.

2. At the `revise` engine section (line 94), add a note:
   > **Implementation note:** The shipped engine matches the design: kind `quick`, receives the writ and review findings. When the review passed, the prompt instructs the anima to confirm and exit without changes. The role is set via `givens.role` (configurable), not hardcoded to `artificer`.

3. At the Rig Pattern section (line 109), add a note:
   > **Implementation note:** The shipped pipeline is linear: `draft → implement → review → revise → seal`. There is no conditional branching — the revise engine always runs (it no-ops when the review passed). There is no escalation engine. The branching graph described above is the target design for a future phase.

4. At the Configuration section (line 274), add a note:
   > **Implementation note:** Configuration currently lives under `guild.json["spider"]` as part of `SpiderConfig`, not under a separate `"review"` key. Available fields: `buildCommand`, `testCommand`, `role`, `pollIntervalMs`. The `enabled` and `maxRetries` fields are not yet implemented.

5. At the Artifact Schema section (line 192), add a note:
   > **Implementation note:** The shipped review engine does not write filesystem artifacts. Review findings are stored as session output in the Stacks (via the Animator's sessions book). The artifact schema described here is a target design.

### Delete `_agent-context.md` (R7, D7)

Delete the file `docs/architecture/_agent-context.md`.

### Fix Broken Link in `index.md` (R8)

In `docs/architecture/index.md` line 293, the note reads:

```markdown
> **Note:** The list above is provisional. The standard guild configuration is still being finalized as individual apparatus are built out. Some entries listed as apparatus are not yet implemented as separate packages — see [What's Implemented vs. Aspirational](_agent-context.md#whats-implemented-vs-aspirational) for the current state. Treat this as a working inventory, not a commitment.
```

Remove the `see [What's Implemented vs. Aspirational](_agent-context.md#whats-implemented-vs-aspirational) for the current state` clause. The resulting note should read:

```markdown
> **Note:** The list above is provisional. The standard guild configuration is still being finalized as individual apparatus are built out. Some entries listed as apparatus are not yet implemented as separate packages. Treat this as a working inventory, not a commitment.
```

### Non-obvious Touchpoints

- `docs/architecture/index.md` line 293 — contains the only reference to `_agent-context.md` in the codebase. Must be updated when the file is deleted.

## Validation Checklist

- V1 [R1]: Every tool name in `packages/plugins/*/src/tools/*.ts` (excluding test files) appears as a command row in the CLI README's Standard Guild Commands section. Verify with: `grep -r "name: '" packages/plugins/*/src/tools/*.ts | grep -v test | wc -l` and count the implemented command rows in the README — the numbers must match.
- V2 [R2]: The CLI README contains a "Planned" subsection listing aspirational commands, and every entry in that subsection includes the text "*(Planned)*".
- V3 [R3]: Every Source cell in the implemented command tables contains one of: `clerk`, `animator`, `codexes`, `spider`, `tools`, `parlour`. No cell contains `nexus-stdlib`, `supportKit`, `cli (v1)`, or any npm-scoped package name.
- V4 [R4]: The CLI README contains no `## Migration Status` heading and no text referencing "v1" migration status.
- V5 [R5]: `review-loop.md` line 3 reads `Status: **Design**` (not `Status: **Design** (not yet implemented)`). An implementation-status note follows that mentions `draft → implement → review → revise → seal` and states that branching/escalation are not yet implemented.
- V6 [R6]: `review-loop.md` contains implementation notes at the review engine, revise engine, rig pattern, configuration, and artifact schema sections. The review engine note states the engine is kind `quick`, not `clockwork`.
- V7 [R7]: The file `docs/architecture/_agent-context.md` does not exist. Verify with: `test ! -f docs/architecture/_agent-context.md && echo OK`.
- V8 [R8]: `docs/architecture/index.md` contains no string `_agent-context`. Verify with: `grep -c '_agent-context' docs/architecture/index.md` returns 0.

## Test Cases

This commission modifies only documentation files (markdown). There are no automated tests to write. Verification is structural (V1-V8 above).

| Scenario | Expected |
|---|---|
| `grep -r 'nexus-stdlib' packages/framework/cli/README.md` | No matches |
| `grep -c '(Planned)' packages/framework/cli/README.md` | 11 (one per planned command) |
| `grep 'Migration Status' packages/framework/cli/README.md` | No matches |
| `grep 'commission post' packages/framework/cli/README.md` | Exactly one match in the Commissions and Writs table |
| `grep 'crawl one' packages/framework/cli/README.md` | Exactly one match in the Rigs table |
| `grep 'tools list' packages/framework/cli/README.md` | Exactly one match in the Introspection table |
| `grep 'clockwork' docs/architecture/apparatus/review-loop.md` at line 73-90 | An implementation note states the engine is actually kind `quick` |
| `test -f docs/architecture/_agent-context.md` | Exit code 1 (file does not exist) |
| `grep '_agent-context' docs/architecture/index.md` | No matches |
