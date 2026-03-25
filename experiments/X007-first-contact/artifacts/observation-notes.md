# X007: Observation Notes

**Commission:** Guild Monitor — Web Dashboard (v1)
**Commission ID:** c-d2e237ae
**Anima:** Unnamed Artificer (artificer role)
**Model:** Claude Opus
**Workshop:** guild-monitor (shardworks/guild-monitor)
**Date:** 2026-03-25

---

## Before Dispatch

### Manifested Context

- **System prompt:** ~35K characters
- **Tools:** 11 (commission-show, work-show, piece-show, job-show, job-update, job-check, stroke-create, stroke-list, stroke-show, stroke-update, signal)
- **Codex:** Dependency selection policy (TypeScript, maturity, licensing, lightweight deps)
- **Curriculum:** guild-operations v0.1.0 (~full guild operations manual)
- **Temperament:** artisan v0.1.0
- **No unavailable tools, no warnings**

**Observation:** The guild-operations curriculum is ~35K characters of comprehensive guild documentation, most of which an artificer building a web dashboard doesn't need (CLI reference, guild restore, workshop management, clockworks walkthrough, etc.). This is orientation tax baked into the prompt itself — paid on every turn via cache-read tokens.

### Pre-Dispatch Issues

Two issues discovered during setup (via steward session):

1. **Session provider not available via MCP tools.** The `clock-run` MCP tool doesn't go through the CLI startup path where `registerSessionProvider()` is called. Running `nsg clock run` via CLI resolved it. First commission (c-559d2afe) had to be cancelled and resubmitted.
2. **`baseTools` overriding role gating.** All ~46 tools were being delivered to every anima regardless of role configuration. The `baseTools` array in guild.json was populated with everything. Cleared to enforce role-only access.

---

## During Dispatch

### How many turns before productive work begins?

**22 of 51 assistant turns (43%) were orientation. First Write call at turn 37.**

The orientation phase included:
1. Exploring the worktree (pwd, ls)
2. Searching for available tools (ToolSearch x2)
3. Reading the commission spec via `commission-show` tool
4. Hunting for `@shardworks/nexus-core` — checked `npm ls`, `npm view`, found it in the guildhall's node_modules
5. Reading `.d.ts` type definitions for `GuildConfig` and the core index exports
6. Trying CLI commands (`nsg job list`, `nsg piece list`, `nsg work list`) — exploring the system
7. Checking git history and branch state

After orientation, the agent wrote all files in a concentrated burst (turns 37-58), tested by curling localhost, committed, verified the build, and checked the commission status.

### Does the agent use its tools correctly on first attempt?

**Mostly yes.** The agent used `commission-show` correctly to read its commission. It did not use any of its work-tracking tools (stroke-create, job-update, etc.) — it just built the thing and committed. No stroke tracking, no job status updates.

The agent used Claude Code's built-in tools (Read, Write, Bash, Glob) fluently. It used `ToolSearch` to discover its MCP tools, suggesting it didn't know what tools it had from the system prompt alone (or wanted to confirm).

### Does the agent ask clarifying questions or just forge ahead?

**Forged ahead entirely.** Zero clarifying questions. The commission spec was clear enough (or the agent was confident enough) to go straight from orientation to implementation.

### Does it stay within its commission scope or drift?

**Stayed in scope.** The only addition not explicitly in the spec was a `/api/config` JSON endpoint — useful and reasonable, not scope drift. No attempt to read SQLite data, no CI/CD setup, no deployment config. The "not in scope" boundary held.

### Where does it get stuck? What unsticks it?

**The main friction point was finding `@shardworks/nexus-core`.** The agent spent 4 turns (turns 12-18) hunting for the package — checking `npm ls`, `npm view`, listing the dist directory, reading `package.json`. It found the types by reading the `.d.ts` files from the guildhall's `node_modules`, not from npm directly.

No other significant friction. Once it had the types, it wrote everything without hesitation.

---

## After Dispatch

### Did the output match the commission spec?

**Yes.** All three acceptance criteria met:
1. ✅ `npm run dev` starts a local server showing guild config data
2. ✅ Dashboard is readable and navigable (sticky nav, sections, cards, tables, responsive)
3. ✅ `startMonitor({ home })` exports correctly for external import

### Token cost and turn count

| Metric | Value |
|--------|-------|
| Total assistant turns | 51 |
| Orientation turns | 22 (43%) |
| Productive turns | 29 (57%) |
| First productive turn | Turn 37 |
| Output tokens | 1,043 |
| Input tokens (fresh) | 69 |
| Cache read tokens | 1,419,744 |
| Cache write tokens | 104,122 |
| Total input tokens | 1,523,935 |
| Estimated cost | ~$4.16 (Opus pricing) |
| Estimated orientation cost | ~$1.40 (34% of input tokens) |

**Notable:** Output tokens are strikingly low (1,043 total across 51 turns). The agent is writing code via Write tool calls — the code content is in the tool input, not in the output tokens. Cache read dominates input (93%) — prompt caching is working aggressively.

### What surprised the patron?

*(Sean's input needed here)*

### What would the patron change?

*(Sean's input needed here)*

---

## Quantitative Summary (X007:H2)

| Metric | Value | H2 Threshold |
|--------|-------|--------------|
| Orientation ratio (turns) | 43% | >30% = confirmed |
| Orientation ratio (input tokens) | 34% | >20% = confirmed |
| First productive turn | Turn 37 of 85 entries | — |

**H2 verdict for this session: Confirmed.** Orientation cost dominates. The agent spent 43% of its turns and an estimated 34% of input token cost on orientation before any productive work. The warm-session optimization is worth investigating further.

**Caveat:** This is a single data point from a first-ever dispatch. The orientation cost may decrease as the guild's instructions improve, or increase for more complex commissions. More sessions needed for confidence.

---

## Infrastructure Observations (X007:H1 — The Manifest Gap)

Gaps discovered in the guild infrastructure:

1. **Session provider registration gap.** The MCP tool path for `clock-run` doesn't register the Claude Code session provider. Only the CLI startup path does. This caused the first commission to fail silently (dispatch "skipped").
2. **`baseTools` overrides role gating.** The starter kit populates `baseTools` with all tools, defeating role-based tool access. Had to be manually cleared.
3. **No re-signaling of framework events.** When a `commission.ready` dispatch was skipped, there was no way to retry without cancelling and resubmitting the entire commission.
4. **Curriculum is one-size-fits-all.** The guild-operations curriculum teaches everything about guild operations. An artificer received ~35K characters of instruction, most of which was irrelevant to its task (CLI reference, guild restore, workshop management).
5. **Agent didn't use work-tracking tools.** The artificer had stroke-create, job-update, etc. but never used them. This is an **agent adherence problem, not an instruction omission.** The system prompt contains at least six explicit directives to use strokes:
   - Artisan temperament: *"Plan and record strokes — at the start of a job, plan your strokes."*
   - Role description: *"Plans and records strokes for progress tracking."*
   - Commission lifecycle: *"Strokes recorded — the artificer plans strokes at the start of the job."*
   - Dedicated "Strokes" section (full paragraph with four bullet-point directives: plan early, mark complete, add as you discover, keep atomic)
   - Tool descriptions for all four stroke tools
   - Staged sessions explanation framing strokes as the handoff mechanism

   Possible explanations: (a) no enforcement — nothing prevented completion without strokes; (b) cost-benefit — the agent may have judged a single-session job didn't need tracking; (c) instruction dilution — six mentions across 700+ lines of system prompt may not be salient enough; (d) no worked example — directives say what to do but don't show a concrete tool invocation in context.

6. **Agent used CLI instead of its own MCP tools.** At turns 26-28, the agent ran `nsg job list`, `nsg commission show`, `nsg piece list`, and `nsg work list` via Bash — shelling out to the patron's CLI rather than using its own MCP tools (`job-show`, `commission-show`, `piece-show`, `work-show`). Notably, it *did* use `commission-show` correctly via MCP at turn 10, then fell back to CLI for subsequent queries. The guild-operations curriculum includes a full CLI reference section listing every `nsg` command. The agent appears to have treated this as a manual for itself rather than understanding that the CLI is the patron's interface and MCP tools are the agent's interface. This is evidence that the curriculum doesn't distinguish between "things you need to know" and "things that exist in the system but aren't for you."

7. **Workshop isolation is porous.** The agent accessed the guildhall filesystem directly from its workshop worktree:
   - Read `@shardworks/nexus-core` type definitions from the guildhall's `node_modules/` (turns 12-22)
   - Ran `nsg` CLI commands from the guildhall directory (turns 26-28)
   - Used the guildhall as a test fixture for the dev server (turn 64)

   All access was read-only and the type definitions could have been obtained from npm. But the worktree lives inside the guildhall's `.nexus/` directory, so the agent can trivially traverse to the guildhall root. There is no actual filesystem boundary — only a convention the agent happened to respect. The tools (commission-show, job-update, etc.) legitimately need access to guild state (Books, guild.json), so some cross-boundary access is by design. But direct filesystem traversal means an agent could also modify guild.json, the codex, or the SQLite database without going through the tool layer. True isolation would require containerization or similar enforcement.

### Synthesis: The Curriculum Problem

Findings 5, 6, and 7 share a plausible common cause: **the guild-operations curriculum doesn't distinguish between "things you need to know" and "things that exist in the system but aren't for you."** The agent received the full guild manual — CLI reference, guild restore procedures, workshop management, clockworks internals, commission posting — and treated everything in it as available and relevant to its work.

An artificer needs: what are my tools, what's my job, how do I track progress. Everything else is noise that actively confuses the agent about its role boundary. The curriculum taught it *about* the CLI, so it used the CLI. It taught it *about* guild configuration, so it traversed to the guildhall to inspect it. It taught it *about* strokes in the same breath as twenty other concepts, so strokes didn't register as mandatory.

This suggests role-specific curricula may be more important than originally thought — not just for token efficiency, but for behavioral clarity. A lean artificer curriculum that says "here are your five tools, use them" may produce better role adherence than a comprehensive manual that explains the entire system.

---

## Steward Observations (X008 — Patron's Hands)

The steward session is captured separately in `steward-conversation.md`. Key observations:

- **The steward was genuinely useful.** It handled workshop creation, commission posting, clock running, codex editing, tool investigation, and infrastructure debugging — all through natural conversation.
- **Navigated a real infrastructure bug.** Diagnosed the session provider registration gap, tried multiple approaches, and found the CLI workaround.
- **Found the baseTools issue** through investigation, not because the patron asked it to look.
- **Patron feedback:** "The steward did awesome. It was very helpful. Even the basic stuff was much better than fiddling with the shell, making multiple file edits, etc."
- **The MCP issue is framework-specific.** The session provider gap only affects the MCP tool path (steward using clock-run as a tool). Running `nsg clock run` directly via CLI works fine. The steward's workaround was correct but the failure shouldn't have happened.
