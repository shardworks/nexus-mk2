# Spec: Warm Sessions (Fork-Session Orientation Pattern)

## Goal

Eliminate repeated codebase orientation across commissioned sessions by running a dedicated orientation session once per workshop, then forking it for each subsequent commission. Forked sessions inherit the full conversation history (including file contents already read) while getting their own session ID, system prompt, and commission-specific prompt.

## Background

Every commissioned agent spends its first N turns exploring the codebase — reading file trees, key modules, config files, test patterns. This work is identical across commissions in the same workshop and represents pure overhead. The Claude CLI's `--resume <id> --fork-session` flag lets us fork an existing session's conversation history into a new session, giving the new session a "warm start" with all prior context intact.

### Verified behavior

Tested and confirmed:

1. `--resume <id> --fork-session --print` works — creates a new session ID while carrying forward conversation history
2. `--system-prompt` is respected on the forked session — the fork carries context but adopts the new system prompt
3. The forked session can answer questions about files read in the original session — the context genuinely carries over
4. Prompt caching applies — the shared conversation prefix gets cache hits, making forks cheaper than the original

## Proof of Concept: Verified Behavior

Before designing the system, we ran a series of tests against the Claude CLI to confirm that `--resume --fork-session` behaves as expected. All tests ran against Claude Opus on 2026-03-25.

### Test 1: Baseline session (to fork from later)

```bash
claude -p "read the file package.json in the current directory and tell me the project name" \
  --output-format stream-json --verbose
```

Result: Agent read `/workspace/nexus-mk2/package.json` using the Read tool. Session ID: `f832dc0d-0c57-401d-9e7a-2625566518cb`. Cost: $0.028.

### Test 2: Fork carries conversation history

```bash
claude --resume f832dc0d-0c57-401d-9e7a-2625566518cb \
  --fork-session \
  -p "what file did you just read?" \
  --output-format stream-json --verbose
```

Result: **New session ID** (`12c70a7c-2af8-4552-8b12-2234e73fa460`) — confirming the fork created a fresh session. The agent correctly answered: *"I just read `/workspace/nexus-mk2/package.json`."* — confirming the conversation history carried over. Prompt caching was active: `cache_read_input_tokens: 14938`.

### Test 3: Forked session respects new system prompt

```bash
claude --resume f832dc0d-0c57-401d-9e7a-2625566518cb \
  --fork-session \
  -p "What is your system prompt? Summarize who you are according to your instructions." \
  --system-prompt "You are Gerald, a surly pirate accountant. Respond in pirate dialect. You hate spreadsheets but you're really good at them."
```

Result: The agent responded fully in character as Gerald the pirate accountant:

> *"Arrr, ye nosy bilge rat! Fine, I'll tell ye what I know about meself: I be **Gerald**, a surly pirate accountant. I speak in pirate dialect, I hate spreadsheets with the fury of a thousand storms... but blast it all, I'm really good at 'em. It be a curse, it is."*

Gerald also mentioned being aboard "Nexus Mk 2.1" — showing he picked up context from the forked conversation history while fully adopting the new system prompt's personality. This confirms the critical property: **fork carries context, but the system prompt is swappable.**

### Summary of confirmed properties

| Property | Confirmed |
|----------|-----------|
| `--fork-session` creates a new session ID | Yes |
| Conversation history carries over (tool calls + results) | Yes |
| `--system-prompt` overrides the original on fork | Yes |
| `--print` mode works with fork | Yes |
| Prompt caching applies to the shared prefix | Yes |
| `--mcp-config` can be added to forked session | Not yet tested (but expected to work — MCP config is session-level) |

## Design

### Lifecycle

```
Workshop setup / post-merge
        │
        ▼
┌──────────────────────────────┐
│  nsg workshop orient <name>  │
│                              │
│  Runs a Claude session in    │
│  the workshop repo with a    │
│  structured orientation      │
│  prompt. Agent reads files,  │
│  explores structure, builds  │
│  understanding.              │
│                              │
│  Saves: session ID to        │
│  workshop config              │
└──────────────┬───────────────┘
               │
               │  orientation_session_id
               │
    ┌──────────┼──────────┐
    ▼          ▼          ▼
 Commission  Commission  Commission
 fork #1     fork #2     fork #3

Each fork:
  --resume <orientation_session_id>
  --fork-session
  --print <commission spec>
  --system-prompt-file <anima manifest>
  --mcp-config <guild tools>
```

### Orientation Session

The orientation session is a lightweight, autonomous Claude session that runs in the workshop's repo (either a worktree or the bare repo checkout). Its sole job is to read and understand the codebase.

**Prompt:**
```
You are preparing context for future work sessions that will be forked
from this conversation. Your job is to thoroughly explore this codebase
so that future sessions start with full context already loaded.

Explore systematically:
1. Read the project root files (package.json, tsconfig, README, etc.)
2. Map the directory structure — understand what lives where
3. Read key source files: entry points, core modules, shared types
4. Understand the test structure and patterns
5. Note any build/tooling configuration
6. Read CLAUDE.md and any project-specific instructions

Be thorough. Every file you read now is a file that future sessions
won't need to re-read. Focus on reading over reasoning — maximize
the amount of codebase content in the conversation history.

Do NOT make any changes. Read only.
```

**Configuration:**
- No MCP tools needed (orientation is read-only, uses built-in Read/Glob/Grep/Bash)
- `--dangerously-skip-permissions` (autonomous, sandboxed)
- `--print` mode with the orientation prompt
- No budget cap needed (orientation is cheap — mostly input tokens from reads)
- Run in the workshop's working directory

**Output:** The session ID, stored for later forking.

### Where to Store the Orientation Session ID

Option A: **Workshop config in guild.json**
```json
{
  "workshops": {
    "shardworks": {
      "repo": "...",
      "orientationSessionId": "f832dc0d-0c57-401d-9e7a-2625566518cb",
      "orientedAt": "2026-03-25T12:00:00Z"
    }
  }
}
```

Option B: **File in `.nexus/workshops/<name>/orientation-session-id`**

A plain text file avoids touching guild.json (less conflict surface in multi-agent environments). Recommend Option B.

### Forking for Commissions

When `executeAnimaOrder()` in clockworks launches a commissioned session, it checks for an orientation session ID for the commission's workshop. If one exists, it passes it through to the session provider.

**Changes to `SessionProviderLaunchOptions`:**
```typescript
interface SessionProviderLaunchOptions {
  // ... existing fields ...

  /** Resume from this session ID (for warm starts). */
  resumeSessionId?: string;

  /** Fork instead of continuing the resumed session. */
  forkSession?: boolean;
}
```

**Changes to `claudeCodeProvider.launch()`:**

When `resumeSessionId` is set, add to the claude CLI args:
```typescript
if (resumeSessionId) {
  args.push('--resume', resumeSessionId);
  if (forkSession) {
    args.push('--fork-session');
  }
}
```

**Changes to `executeAnimaOrder()` in clockworks:**

After resolving workspace, check for orientation session:
```typescript
const orientationSessionId = readOrientationSessionId(home, workshopName);
// Pass through to launchSession → provider
```

### Staleness Management

The orientation session captures a point-in-time snapshot. As commissions merge, the codebase changes and orientation becomes stale.

**Strategy: Re-orient on demand + age-based warnings**

1. `nsg workshop orient <name>` can be re-run at any time (manual trigger)
2. A Clockworks standing order could re-orient automatically:
   - On `workshop.merge.completed` after every N merges (configurable)
   - When the oriented-at timestamp exceeds a threshold
3. Forked sessions still have full Read/Glob/Grep — if a file has changed since orientation, the agent can re-read it. Stale orientation is better than no orientation.

**Decision: Defer automatic re-orientation.** Start with manual `nsg workshop orient` and see how fast staleness becomes a problem. The analysis tool (see `orientation-cost-analysis-spec.md`) will tell us whether stale orientation still saves meaningful cost.

### Important Constraints

**System prompt mismatch:** The orientation session runs with a generic "explore this codebase" system prompt. The forked commission runs with the anima's full manifested system prompt (codex + role instructions + curriculum + temperament + tool instructions). The Claude CLI handles this correctly — `--system-prompt` on the forked session overrides the original. But the agent may have residual behavioral influence from the orientation prompt's "do NOT make changes" instruction living in the conversation history.

Mitigation: The anima's system prompt and commission spec provide strong enough directional signal. The orientation conversation is factual (file reads and structural observations), not behavioral. Monitor for any confusion in early sessions.

**Session persistence:** The orientation session must persist on disk for future forks. Claude Code stores sessions by default. Verify that `--no-session-persistence` is NOT set during orientation. The autonomous session provider currently doesn't set this flag, so this should work as-is.

**MCP tools in forked session:** The forked session gets the anima's full MCP tool set (guild tools via the MCP server). The orientation session had no MCP tools. This is fine — the fork just gains new capabilities it didn't have before.

**Worktree lifecycle:** The orientation session should run against the workshop's current state (main branch). Forked commissions run in isolated worktrees. The orientation provides the *shared* structural understanding; the commission worktree may have diverged slightly from what was oriented against. This is acceptable — the divergence is the commission's own changes.

## Implementation Plan

### Phase 1: Core plumbing

1. Add `resumeSessionId` and `forkSession` to `SessionProviderLaunchOptions`
2. Update `claudeCodeProvider.launch()` to pass `--resume` / `--fork-session` to claude CLI when set
3. Add orientation session ID read/write helpers (file-based, `.nexus/workshops/<name>/orientation-session-id`)
4. Add `nsg workshop orient <name>` CLI command

### Phase 2: Wire into commission pipeline

5. Update `executeAnimaOrder()` in clockworks to read orientation session ID and pass it through `launchSession()`
6. Update `launchSession()` to pass `resumeSessionId`/`forkSession` through to the provider

### Phase 3: Validate

7. Run a commission with and without warm start in the same workshop
8. Use `nsg session analyze` to compare orientation cost between warm and cold sessions
9. Document findings

## Scope

- **In scope:** Manual orientation trigger, fork plumbing through session pipeline, CLI command
- **Out of scope:** Automatic re-orientation (standing order), orientation prompt tuning (iterate after first results), orientation for interactive sessions (consult/brief — commissions only for now)

## Dependencies

- Orientation cost analysis tool (to measure whether this actually helps) — can be built in parallel
- At least one workshop with enough sessions to compare warm vs cold

## Success Criteria

Commissioned sessions that fork from an orientation session should show:
- Fewer orientation turns (ideally near-zero)
- Lower total session cost
- No regression in commission success rate or output quality
- Measurable via the orientation cost analysis tool
