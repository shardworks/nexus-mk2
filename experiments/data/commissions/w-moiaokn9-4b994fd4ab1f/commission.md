The brief's narrative mentions 'six draft sweep writs to fail dispatch in a single session before the issue was diagnosed, requiring a DB patch to repair them.' The current commission prevents *new* writs from entering the queue with `codex: undefined`, but does nothing to repair pre-existing writs that already failed plan-init.

Repair shape:

- Find every writ with `codex IN (NULL, '')` that is in `new` or `open` phase, and either set their codex to the guild default (single-codex case) or leave a stuck-cause note prompting an operator to re-tag and republish.
- The clerk's startup migration block (`packages/plugins/clerk/src/clerk.ts:1299-1357`) is the natural precedent for a one-shot data fix-up.

Follow-up actions:

- Add a one-shot migration to clerk's start() that reports (and optionally repairs) writs with empty codex.
- Or: a CLI tool `nsg writ repair-codex` that the operator can run on demand.