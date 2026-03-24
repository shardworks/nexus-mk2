# Commission Lifecycle via Clockworks

## Overview

The commission lifecycle is driven entirely by Clockworks standing orders. Posting a commission signals an event; standing orders handle the rest — worktree setup, anima summoning, post-session merge, cleanup. No bespoke orchestration code. The Clockworks *is* the orchestrator.

## Schema Change

New migration adds `status_reason` to the `commissions` table:

```sql
ALTER TABLE commissions ADD COLUMN status_reason TEXT;
```

Every status transition writes a reason: `"posted by patron"`, `"worktree ready on branch commission-42"`, `"summoned artificer Valdris"`, `"completed — merged to main"`, `"merge conflict in src/foo.ts"`.

## Rename: dispatch → commission

The verb is **commission**, not dispatch. The tool is `commission` (was `dispatch`). The CLI is `nsg commission`. The core function is `commission()`.

Rename list:
- `packages/tool-dispatch/` → `packages/tool-commission/`
- `packages/core/src/dispatch.ts` → `packages/core/src/commission.ts`
- `packages/cli/src/commands/dispatch.ts` → `packages/cli/src/commands/commission.ts`
- All exports, imports, references

The tool posts a commission and signals `commission.posted`. That's it. Everything downstream is Clockworks.

## Session Launcher (shared between consult and summon)

The session lifecycle currently lives inline in `consult.ts`. Factor it out into a shared `session.ts` module so both `consult` (interactive) and the `summon` verb (commissioned) use the same machinery.

```typescript
// packages/cli/src/session.ts

interface SessionOptions {
  /** Absolute path to the guild root (for tool/engine resolution). */
  home: string;
  /** Working directory for the claude process. */
  cwd: string;
  /** Manifest result from engine-manifest. */
  manifest: ManifestResult;
  /** Interactive = stdio inherit; print = commission spec as prompt. */
  mode: 'interactive' | { print: string };
  /** Display name for session tracking (--name). */
  name?: string;
}

interface SessionResult {
  /** Process exit code. */
  exitCode: number;
  // future: tokenUsage, cost, sessionId, duration, etc.
}

function launchSession(options: SessionOptions): SessionResult
```

Inside `launchSession`:
1. Create temp dir
2. Write system prompt, MCP server config, Claude MCP config (same `buildClaudeMcpConfig` logic)
3. Build claude args: `--bare`, `--setting-sources user`, `--dangerously-skip-permissions`, `--system-prompt-file`, `--mcp-config`
   - Interactive mode: `stdio: 'inherit'`, no `--print`
   - Print mode: add `--print`, pass commission spec as the prompt argument
4. `spawnSync('claude', args, { cwd: options.cwd })`
5. Clean up temp dir
6. Return `{ exitCode }`

`consult` calls: `launchSession({ home, cwd: home, manifest, mode: 'interactive' })`
`summon` calls: `launchSession({ home, cwd: worktreePath, manifest, mode: { print: commissionSpec } })`

When we later want token metrics, we add `--output-format json` parsing inside `launchSession` and both paths get it for free.

## Worktree Naming Convention

Branch and worktree paths are derived from the commission ID. No need to track them in the Ledger.

- **Branch:** `commission-{id}` (e.g. `commission-42`)
- **Worktree:** `.nexus/worktrees/{workshop}/commission-{id}/`

`engine-worktree-setup` already uses this convention. Nothing to change there.

## Event Flow

```
patron posts commission (nsg commission / commission tool)
  → commission() writes Ledger row (status: posted, reason: "posted by patron")
  → signals commission.posted { commissionId, workshop }

standing order: on commission.posted → run workshop-prepare
  → workshop-prepare engine:
      1. reads commission from Ledger
      2. creates worktree from workshop bare repo via setupWorktree()
      3. updates commission status → in_progress, reason: "worktree ready on branch commission-{id}"
      4. signals commission.ready { commissionId, workshop, worktreePath }

standing order: on commission.ready → summon artificer
  → summon handler (in clockworks.ts):
      1. resolves role "artificer" to a specific anima (lowest-id active)
      2. reads commission content from Ledger
      3. manifests the anima (system prompt + MCP config via engine-manifest)
      4. writes commission_assignments record
      5. updates commission status reason: "summoned {animaName}"
      6. calls launchSession({ home, cwd: worktreePath, manifest, mode: { print: spec } })
      7. on session exit, signals commission.session.ended { commissionId, workshop, exitCode }

standing order: on commission.session.ended → run workshop-merge
  → workshop-merge engine:
      1. merges commission branch into main in the bare repo
      2. on success:
         - tears down worktree
         - updates commission status → completed, reason: "merged to main"
         - signals commission.completed { commissionId }
      3. on conflict:
         - tears down worktree
         - updates commission status → failed, reason: "merge conflict: {details}"
         - signals commission.failed { commissionId, error }
```

## The summon Verb as Session Wrapper

The `summon` verb in Clockworks is the session lifecycle owner. It does the same work as `nsg consult` but triggered by an event instead of a human typing a command:

1. **Resolve anima** — role lookup, same as `resolveAnimaByRole()` in consult
2. **Manifest** — `engine-manifest` produces system prompt + MCP config
3. **Launch session** — `launchSession()` handles all temp files, claude spawning, cleanup
4. **Signal** — `commission.session.ended` with exit code

This means `commission.session.ended` isn't a mystery — the `summon` handler *is* the process wrapper. It spawns, waits, signals. No fragile self-reporting from the anima.

The `brief` verb would work identically but frame the context differently in the system prompt (per the Clockworks architecture doc). For commissions, `summon` is the right verb — the anima is being called to do specific work.

## Standing Orders in Fresh Guilds

`initGuild()` includes commission lifecycle wiring in the default clockworks config:

```json
{
  "clockworks": {
    "events": {
      "craft.question": { ... },
      "craft.debt": { ... }
    },
    "standingOrders": [
      { "on": "commission.posted", "run": "workshop-prepare" },
      { "on": "commission.ready", "summon": "artificer" },
      { "on": "commission.session.ended", "run": "workshop-merge" }
    ]
  }
}
```

The `workshop-prepare` and `workshop-merge` engines ship with the starter kit bundle. Fresh guilds get the full commission lifecycle out of the box.

## Engines Needed

### workshop-prepare (clockwork engine)

Receives `commission.posted` event. Reads commission from Ledger, calls `setupWorktree()` from `engine-worktree-setup`, updates commission status, signals `commission.ready`.

Thin orchestration wrapper around the existing `setupWorktree()` function.

### workshop-merge (clockwork engine)

Receives `commission.session.ended` event. Merges the commission branch into main in the bare repo, handles success/conflict, tears down worktree, updates commission status, signals the outcome.

New engine. The merge logic is new — `engine-worktree-setup` only handles create/teardown, not merge.

## Open Questions

1. **Anima selection.** `summon: "artificer"` targets a role. If multiple animas hold the artificer role, which one gets the commission? Current approach (from `consult.ts`): lowest-id active anima. Good enough for now — selection policy can evolve later.

2. **Passing context to the summoned anima.** The artificer needs to know: what's the commission spec, where's the worktree, what branch am I on. The `commission.ready` payload carries `{ commissionId, workshop, worktreePath }`. The summon handler reads the commission content from the Ledger and feeds it as the prompt. The manifest engine sets up identity/tools. The worktree path becomes `cwd`. The anima discovers its branch via normal git commands.

3. **Push semantics.** The anima works in a worktree checked out from a bare clone. Commits stay local to the worktree; the branch ref lives in the bare repo. When workshop-merge runs, it merges the commission branch into main within the bare repo — no push needed, it's all local. Worth verifying.

4. **Non-zero exit codes.** If the claude process exits non-zero, should workshop-merge still attempt a merge? Probably yes — the anima may have committed useful partial work. The merge result (success/conflict) is the real signal, not the exit code. But worth considering whether to skip merge on certain exit codes.
