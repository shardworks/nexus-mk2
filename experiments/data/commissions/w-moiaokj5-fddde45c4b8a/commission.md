`packages/plugins/spider/src/engines/draft.ts:22-26` throws `Writ "<id>" has no codex — cannot open a draft binding.` for the same reason `astrolabe.plan-init` does. After this commission ships, both throws become reachable only via writs created through paths that bypass `commission-post` (cartograph's createX, future programmatic callers). The two throws together represent ~2 lines of defensive duplication for the same precondition.

Follow-up actions to consider:

- Move the no-codex check into a shared validator (e.g. `assertWritHasCodex(writ)` in clerk-apparatus) and reuse from both engines so the message text and behavior stay in lockstep.
- Or: tighten `WritDoc.codex` from optional to required at write time (a much larger change with migration implications).