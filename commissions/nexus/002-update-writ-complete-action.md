# Commission: Add `complete` (and `reopen-failed`) actions to `update-writ`

## Title

Add `complete` and `reopen-failed` actions to the `update-writ` admin tool

## Description

The `update-writ` tool currently supports `fail`, `cancel`, and `reopen` (active → ready). It has no way to administratively complete a writ, leaving the steward unable to resolve stuck writs — for example, a `pending` writ whose children were all cancelled (rollup never fires because no children completed).

Add two new actions:

**`complete`** — administratively completes a writ in `pending` or `active` state. Should fire `<type>.completed` and `writ.completed` events and trigger parent rollup, exactly as the normal completion path does. Use case: unsticking a `pending` writ whose children were cancelled rather than completed.

**`reopen-failed`** — transitions a `failed` writ back to `ready` and fires `<type>.ready` for re-dispatch. Use case: recovering from a failed writ without having to cancel and recreate it.

Update the tool's instructions to document all available actions including the two new ones.

## Acceptance Criteria

- [ ] `update-writ` accepts `action: 'complete'` for writs in `pending` or `active` state
- [ ] `complete` fires `<type>.completed` and `writ.completed` events and triggers rollup on the parent (same side effects as the normal completion path)
- [ ] `update-writ` accepts `action: 'reopen-failed'` for writs in `failed` state
- [ ] `reopen-failed` transitions the writ to `ready` and fires `<type>.ready` for re-dispatch
- [ ] Tool instructions updated to document all six actions
- [ ] Existing `fail`, `cancel`, `reopen` behaviour unchanged
- [ ] Tests cover both new actions

## Workshop

nexus
