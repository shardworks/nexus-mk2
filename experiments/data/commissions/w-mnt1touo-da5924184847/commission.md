# `nsg writ list`: accept multiple `--status` values

## Problem

`nsg writ list --status ready --status active --status waiting` silently returns only the results for **one** status value (whichever wins based on how Commander currently parses the flag). It does not return the union. There is no error, no warning, and no indication that the earlier `--status` flags were discarded — the caller gets a confidently-wrong partial result.

This bit a Coco session: she used the multi-flag form from the quests skill to list open quests, got back 7 results, and reported those 7 to the patron as "all open quests." The actual open set was 38. Only when the patron pushed back did she re-query without the filter and discover the truncation.

## Current behavior

```
$ nsg writ list --type quest --status ready --status active --status waiting
# returns only waiting quests (the last --status flag wins)
```

The flag is currently declared as single-valued in the clerk plugin's CLI contribution (`packages/plugins/clerk/`), so Commander replaces the earlier value with each subsequent occurrence.

## Desired behavior

`--status` should be **repeatable**, and repeated values should OR together into a set filter. The query `--status ready --status active --status waiting` should return all writs whose status is in `{ready, active, waiting}`.

Single-value usage stays backward compatible: `--status ready` still works exactly as today.

## Scope

- `nsg writ list` in the clerk plugin.
- The `--status` flag only. Do not touch `--type`, `--parent-id`, `--limit`, or `--offset` in this mandate — those are separate concerns.
- Update the Commander option declaration to be repeatable (typically a `variadic` option or a collector function).
- Update the underlying clerk query to accept an array of statuses and generate an `IN (...)` / `status = ANY (...)` clause instead of `status = ?`.
- Update help text so `nsg writ list --help` documents that `--status` may be repeated.

## Out of scope

- Multi-value support for other flags (e.g. `--type` — worth doing eventually, but separate mandate).
- Result-truncation / pagination UX. A separate design brief is being prepared for that; do not mix the two.
- Any change to output format.

## Acceptance

1. `nsg writ list --type quest --status ready --status active --status waiting` returns the union of writs in any of the three states — verified on a guild with writs in all three.
2. `nsg writ list --type quest --status ready` continues to behave exactly as before.
3. `nsg writ list --help` (or equivalent) shows `--status` as repeatable.
4. New unit/integration test covering the multi-value case added to the clerk plugin test suite.
5. Existing writ-list tests continue to pass.

## Pointers

- Clerk plugin CLI contribution: `/workspace/nexus/packages/plugins/clerk/src/` — look for where `writ list` is registered with the CLI program.
- Framework CLI entrypoint: `/workspace/nexus/packages/framework/cli/src/cli.ts`.
- Existing test reference: `/workspace/nexus/packages/plugins/clerk/src/clerk.test.ts`.

## Notes for the implementer

The Commander idiom for a repeatable string option is typically:

```ts
.option('--status <value>', 'Filter by writ status (repeatable)', (value, prev: string[] = []) => [...prev, value], [])
```

— but match whatever style the rest of the clerk plugin's CLI options already use.