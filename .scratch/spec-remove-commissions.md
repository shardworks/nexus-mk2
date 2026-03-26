# Spec: Remove Commissions, Enrich Writs

## Summary

Remove the `commissions` table and all associated machinery. Writs become the sole work primitive. Add `workshop`, `sourceType`, and `sourceId` fields to writs. Add `nsg writ` CLI. Update engines to operate on writs directly.

## Background

Commissions were the original patron-facing work unit. The writ system was added later as a more structured primitive, and commissions became a thin wrapper around a `mandate` writ. The two records must be kept in sync via bridge functions (`completeMandateCommission`, `failMandateCommission`, `updateCommissionStatus` cascade), and every bug we've hit has involved that sync breaking.

The `mandate` writ type was introduced purely to bridge the two systems. It carries no semantic meaning of its own.

## What Changes

### 1. Schema — new migration

Add to `writs` table:
- `workshop TEXT` — nullable. Present on workspace-bound writs; null for knowledge/planning writs.
- `source_type TEXT NOT NULL DEFAULT 'engine'` — one of `patron | anima | engine`
- `source_id TEXT` — nullable. Anima ID (for `anima` source), engine name (for `engine` source), null for `patron`.

Drop tables:
- `commissions`
- `commission_assignments`
- `commission_sessions`

Migration note: existing commission/mandate writ data need not be preserved. Active guilds should be treated as starting fresh.

### 2. Core — `writ.ts`

Update `WritRecord`:
```typescript
workshop: string | null;
sourceType: 'patron' | 'anima' | 'engine';
sourceId: string | null;
```

Update `CreateWritOptions`:
```typescript
workshop?: string;          // required at top level; inherited from parent if omitted
sourceType?: 'patron' | 'anima' | 'engine';  // defaults to 'engine' if omitted
sourceId?: string;
```

`createWrit` behaviour:
- If `workshop` is omitted and `parentId` is provided, look up parent's workshop and copy it.
- If `workshop` is omitted and no `parentId`, store null.
- `sourceType` defaults to `'engine'` if not provided.

Remove:
- `BUILTIN_WRIT_TYPES` constant (or remove `'mandate'` from it — `'summon'` can stay for now)
- `completeMandateCommission` / `failMandateCommission` internal helpers
- All commission cascade logic

### 3. Core — remove `commission.ts`

Delete `packages/core/src/commission.ts` entirely.

Remove all commission exports from `packages/core/src/index.ts`.

### 4. Core — event flow

`createWrit` currently fires `<type>.ready`. This remains unchanged.

A new framework event `writ.posted` fires when a patron posts a writ via `nsg writ post`. This is the trigger for workspace setup. Payload: `{ writId, workshop }` (workshop may be null).

Event pipeline for **workspace-bound writs** (workshop present):
```
writ.posted { writId, workshop }
  → workshop-prepare: sets up worktree, fires writ.workspace-ready { writId, workshop, worktreePath }
  → summon-engine: launches session with workspace
```

Event pipeline for **knowledge/planning writs** (workshop null):
```
writ.posted { writId, workshop: null }
  → summon-engine: launches session, restricted tool set
```

Note: `writ.ready` (fired by `createWrit`) remains for anima-created child writs. Standing orders for anima-dispatched work bind on `<type>.ready` or `writ.ready` as appropriate per guild config. The `writ.posted` event is specific to patron-initiated work.

### 5. Engines — `workshop-prepare`

- Bind on `writ.posted` instead of `commission.posted`
- Read workshop from writ record (via `readWrit`), not from payload
- Update commission status calls → removed entirely
- Fire `writ.workspace-ready { writId, workshop, worktreePath }` instead of `commission.ready`
- Branch name: `writ-{writId}` instead of `commission-{commissionId}`

### 6. Engines — `workshop-merge`

- Bind on `writ.completed` (where writ has a workshop) instead of `commission.session.ended`
- Read workshop from writ record
- Remove all commission status update calls
- Branch name: `writ-{writId}`
- On success/fail: fire `writ.merged` or `writ.merge-failed` (guild-monitor may listen for these)

### 7. Engines — `summon-engine`

- Remove mandate-specific handling
- After resolving writ, check `writ.workshop`:
  - **null** → strip destructive tools from manifest before launching session. Destructive tools: bash execution, file write, file edit, workshop operations. Anima retains: read tools, writ tools (`create-writ`, `complete-session`, `fail-writ`, `signal`), session tools.
  - **present** → full tool set, workspace passed to session as before
- Synthesized `summon` writs (no existing writId in payload): pass `workshop` from standing order params if provided, otherwise null.

Define "destructive tools" explicitly — needs a list or a tag on tool definitions.

### 8. CLI — new `writ.ts` command

New file: `packages/cli/src/commands/writ.ts`

Subcommands:

```
nsg writ post <spec> --workshop <name>   # workspace-bound work (common case)
nsg writ post <spec> --no-workshop       # knowledge/planning work (explicit opt-out)
# omitting both → error

nsg writ list [--type <type>] [--status <status>] [--parent <id>] [--workshop <name>]
nsg writ show <id>                       # shows status, workshop, source, children, sessions
nsg writ update <id> --action <fail|cancel|reopen>
```

`nsg writ post`:
- Creates writ with `sourceType: 'patron'`, `sourceId: null`
- Fires `writ.posted` event
- Prints writ ID and workshop (or "no workspace")

Register in `packages/cli/src/main.ts`.

### 9. CLI — remove/deprecate `commission.ts`

Remove `nsg commission` command and deregister from `packages/cli/src/main.ts`.

### 10. MCP tools — commission tools

Remove from stdlib bundle:
- `commission.ts` tool
- `commission-list.ts` tool
- `commission-show.ts` tool
- `commission-update.ts` tool
- `commission-check.ts` tool

### 11. MCP tools — `create-writ`

Add `workshop` param (optional string). If omitted, inherits from parent at `createWrit` level.

Set `sourceType: 'anima'` on all writs created via this tool. `sourceId` should be the calling anima's ID — look up via active session for `NEXUS_WRIT_ID` env var. If lookup fails, set `sourceId: null` (non-fatal).

### 12. `init-guild.ts` — default standing orders

Update default standing orders to reflect new event names:
- `commission.posted` → `writ.posted`
- `commission.ready` / `mandate.ready` → `writ.workspace-ready`
- `commission.session.ended` → `writ.completed` (with workshop filter)

Remove references to `mandate` writ type in default curricula/instructions.

### 13. Guild starter kit

Update `instructions/` and curricula to remove commission vocabulary. Agents should use `create-writ`, `complete-session`, `fail-writ` — same as today.

## Out of Scope

- Multi-workshop writ decomposition / planning anima
- Writ supervision / pull-based session dispatch (the deep session model rethink)
- `sourceType` enforcement (preventing animas from calling `nsg writ post` equivalent)
- Tool tagging system for destructive/non-destructive categorisation (can hardcode list in summon-engine for now)

## Open Questions

1. **Destructive tool list** — needs an explicit enumeration. Propose: any tool involving `bash`, `computer`, file writes (`write_file`, `edit_file`, etc.), and workshop operations. Read tools (`read_file`, `list_files`, search) are fine for no-workshop sessions.

2. **`summon` builtin type** — keep or remove? Synthesized writs still use it. Probably keep for now, revisit with the session model rework.

3. **Existing active guilds** — the shardworks guild has live writs and commissions. Needs manual recovery after migration (fail/cancel stale writs, drop old tables). Not automated.
