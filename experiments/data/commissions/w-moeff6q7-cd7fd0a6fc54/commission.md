# animator-paused BlockType — accept a missing condition for legacy holds

## Intent

The `animator-paused` BlockType validates its condition with a Zod object schema and rejects `undefined`. Engines held under the pre-`attempts[]` engine schema (writs straddling the engine-level retry refactor, ace0ee3) carry `holdReason: 'animator-paused'` with no `holdCondition`. Each dispatch tick passes the missing condition into the schema, throws a ZodError, and emits a stack-trace warning to `daemon.err`.

Make the schema tolerant of a missing condition. The condition is purely informational — the checker reads authoritative state from the Animator's status book, not from the condition itself, as the BlockType's own header comment documents. Accepting `undefined` preserves behavior on properly-shaped data while letting legacy holds resolve quietly.

## Motivation

`daemon.err` accumulated 50+ ZodError stack traces during the upgrade window for the engine-level retry refactor. The surrounding `catch` in the dispatch predicate keeps the engine held and throttles re-checks via `lastCheckedAt`, so no rig outcome was harmed — but the log noise is loud, recurring, and disguises real failures sharing the same file. The affected rigs are currently completed, but any future code path or migration that lands a `holdReason: 'animator-paused'` without an accompanying `holdCondition` will reproduce the noise immediately.

This is the fourth read site in the broader engine-schema-fallout pattern named by the parent click — alongside Oculus, `tryCollect`, and `buildUpstreamMap`. The remaining three are out of scope here; this brief is the surgical fix for the BlockType-checker call site.

## Non-negotiable decisions

- **Schema accepts `undefined` or an object.** The existing object-shaped schema becomes optional at the top level. No new fields, no shape changes inside the object.
- **Behavior on a normally-shaped condition is unchanged.** The parsed value is still unused — the checker continues to consult the Animator's status book exclusively. The schema parse stays, purely as a guard against future shape additions.
- **No DB migration, no rig rewrite.** Schema tolerance is the entire fix; legacy hold metadata is left as-is on completed rigs.

## Behavioural cases the design depends on

- An engine with `holdReason: 'animator-paused'` and `holdCondition: undefined` resolves through the BlockType's `check()` without throwing; the result is whatever the Animator's current status implies (`cleared` if running, `pending` otherwise).
- An engine with `holdReason: 'animator-paused'` and `holdCondition: { sessionId: 'ses-…' }` continues to resolve identically to today.
- An engine with `holdReason: 'animator-paused'` and a malformed condition (e.g. an object with a non-string `sessionId`) still rejects with the same ZodError shape — the tolerance is for missing, not for malformed.

## Out of scope

- The broader read-time fallback across Oculus, `tryCollect`, `buildUpstreamMap`, and rig-view. Those remain open under the parent click; this commission addresses only the BlockType-checker site.
- The one-shot migration that rewrites pre-`attempts[]` engine docs into the new shape. Not required for this fix; the schema tolerance handles legacy data without migration.

## References

- Parent: `c-modf4fih` — read-time fallback for engines stored in the pre-`attempts[]` scalar schema. This brief adds the BlockType-checker as a fourth consumer beyond the three originally named.
- Grandparent: `c-modfdrxc` — fallout from the engine-level retry refactor (ace0ee3).