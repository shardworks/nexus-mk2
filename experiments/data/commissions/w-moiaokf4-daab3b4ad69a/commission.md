`packages/plugins/clerk/src/tools/step-add.ts:59` posts a step writ with `parentId: resolvedMandateId` and no explicit codex, relying on `clerk.post()`'s parent-codex inheritance branch (`packages/plugins/clerk/src/clerk.ts:642-644`). If the parent mandate itself has no codex (which the present commission specifically prevents on the *post* side, but cannot retroactively repair), the step writ will land with `codex: undefined` and Spider's `astrolabe.plan-init` / draft engines will throw on dispatch — the same bug class this commission addresses, just one parent-link removed.

Follow-up actions to consider:

- Fail-loud at `step-add` when the resolved parent has no codex (mirror commission-post's zero/multi-codex throw).
- Or: make `clerk.post()` fail-loud when the resolved codex (after inheritance) is still undefined.
- Audit other tools that post writs through parent inheritance (`packages/plugins/cartograph/src/tools/charge-create.ts`, `piece-create.ts`) and apply the same fail-loud rule.

Not in scope for the current commission per the brief's 'What NOT to do' on `clerk.post`'s API surface, but the same operator confusion (writ in queue, fails downstream, requires DB patch) recurs unless this is closed.