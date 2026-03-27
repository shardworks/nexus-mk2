# Commission: Replace writ.posted with writ.ready as the dispatch trigger

## Title

Remove writ.posted from CLI; make writ.ready the universal dispatch signal

## Description

`createWrit` already fires `<type>.ready` on every writ creation. The CLI additionally fires `writ.posted` as a separate signal, which the default standing order uses as the workshop-prepare trigger. This means:

- Patron writs dispatch correctly (via `writ.posted` → workshop-prepare)
- Child writs, interrupted writs, and rolled-up writs fire `writ.ready` but nothing handles it — they are never dispatched

`writ.posted` is a confusing redundancy. Remove it. Make `writ.ready` the universal "this writ needs work" signal, which it already is in practice.

### Changes

**1. Remove `writ.posted` from `nsg writ post` CLI**

Delete the `signalEvent(home, 'writ.posted', ...)` call. `createWrit` already fires `writ.ready` — that's sufficient.

**2. Replace `writ.posted` with `writ.ready` in the default standing order**

In `guild-starter-kit` default config (and the shardworks guild):

```json
{ "on": "writ.ready", "run": "workshop-prepare" }
```

**3. Make `workshop-prepare` idempotent**

`writ.ready` fires for interrupted writs and rolled-up writs that already have a workspace. `workshop-prepare` must detect this and skip the git setup, simply firing `writ.workspace-ready` to re-enter the dispatch pipeline. If no workspace exists and no workshop is set on the writ, fire `writ.workspace-ready` with a null worktree path (the summon-engine already handles workshopless sessions).

**4. Update curriculum and docs**

- `guild-operations` curriculum: replace `writ.posted` with `writ.ready` in the key framework events table and standing orders example
- Remove `writ.posted` from the framework events table entirely, or demote it to an internal/audit event with no standing order

## Acceptance Criteria

- [ ] `nsg writ post` no longer signals `writ.posted`
- [ ] Default standing order in `guild-starter-kit` uses `writ.ready`, not `writ.posted`
- [ ] `workshop-prepare` is idempotent: if the writ's workspace already exists, fires `writ.workspace-ready` without re-running git setup
- [ ] Child writs created by `create-writ` are dispatched (via `writ.ready` → workshop-prepare → `writ.workspace-ready` → summon)
- [ ] Interrupted writs are re-dispatched correctly via the same path
- [ ] Workshopless writs (`writ.ready` with no workshop) proceed directly to `writ.workspace-ready` (null worktree path) and get dispatched
- [ ] `guild.json` in shardworks updated to use `writ.ready`
- [ ] `guild-operations` curriculum updated — `writ.posted` removed or demoted
- [ ] Existing dispatch tests updated; new tests for child-writ and interrupted-writ dispatch paths

## Workshop

nexus
