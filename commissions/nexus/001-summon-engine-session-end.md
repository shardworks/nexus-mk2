# Commission Draft: summon-engine session-end and protocol improvements

## Title

Fix summon-engine: children-aware interruption and dynamic writ ID in session protocol

## Description

Two related improvements to `summon.ts`, both touching the session-end and protocol logic.

### Fix 1: Don't re-dispatch when incomplete children exist

When a summoned session ends without calling `complete-session` or `fail-writ`, the summon-engine currently always calls `interruptWrit` — which puts the writ back to `ready` and fires `<type>.ready` for re-dispatch. This is correct when no children exist (genuine interruption, context window ran out mid-work). But it is wrong when the writ has incomplete children: a new parent session would run concurrently with child sessions that are already doing the work, risking duplication or conflict.

In `summon-engine` step 9 (post-session writ lifecycle), check for incomplete children before deciding what to do:

```
if writ.status === 'active':
  children = getWritChildren(writId)
  hasIncomplete = children.some(c => not completed/cancelled)
  if hasIncomplete:
    completeWrit(writId)   // → pending, children proceed, rollup handles the rest
  else:
    interruptWrit(writId)  // → ready, re-dispatch
```

### Fix 2: Inject actual writ ID into session protocol; remove env var reference

`WRIT_SESSION_PROTOCOL` is currently a static string constant — it cannot include the writ ID. Convert it to a function `writSessionProtocol(writId: string): string` so the actual writ ID can be embedded directly. The anima should know their writ ID as a plain fact in their system prompt, not as a reference to an environment variable (`NEXUS_WRIT_ID` is an implementation detail the anima has no business knowing).

The protocol should include something like:
```
You are working on writ `<actual-id>`.
```

And remove all references to `NEXUS_WRIT_ID` from the protocol text. With the writ ID in the system prompt, the anima can also use `show-writ` on their own writ without the prompt template needing to include `{{writ.id}}`.

## Acceptance Criteria

- [ ] When a session ends with `writ.status === 'active'` and the writ has incomplete children, `completeWrit` is called (writ → `pending`), not `interruptWrit`
- [ ] When a session ends with `writ.status === 'active'` and no incomplete children exist, `interruptWrit` is called as before
- [ ] `WRIT_SESSION_PROTOCOL` converted from a static string to a function of `writId`; actual writ ID embedded in the injected protocol text
- [ ] No reference to `NEXUS_WRIT_ID` in the protocol text
- [ ] Protocol text updated to describe the correct branching behavior for the interrupted-with-children case
- [ ] Existing tests still pass
- [ ] New test: session ends without `complete-session`, writ has a child in `ready` state → writ transitions to `pending`, not `ready`

## Workshop

nexus
