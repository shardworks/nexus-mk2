# Add `--title` support to `nsg writ edit`

I want `nsg writ edit` to accept a `--title` flag in addition to the existing `--body`, so a writ's title can be corrected from the CLI the same way its body can. This is a small parity fix — no new surface area, no new concepts, just filling in the missing half of an edit command that already exists.

## Reader and decision

The reader is a guild operator (me, or another patron/anima working at the CLI) who has just noticed that a writ's title is wrong — a typo, a stale phrasing, a renamed feature, or a title written before the scope settled. The decision is simple: "can I fix this in place, or do I have to cancel and repost?" Today the answer is the second, which is annoying enough that titles drift and stay drifted. I want the answer to be the first.

Expected frequency: low but persistent — a handful of times per week across the guild. It should feel boring and obvious when you reach for it.

## Scope

**In:**
- A `--title <string>` option on `nsg writ edit`, alongside the existing `--body`.
- Both flags optional; at least one must be provided (error cleanly if neither is).
- Both flags may be provided in a single invocation; both edits apply atomically.
- The edit is recorded in the writ's history the same way `--body` edits already are — same event type / audit trail, just a different field.
- Help text (`nsg writ edit --help`) updated so `--title` is documented alongside `--body`, with a one-line example.

**Out:**
- No `--title` support on other `writ` subcommands (`post`, `close`, etc.) as part of this commission — only `edit`.
- No interactive editor flow (`$EDITOR` popup) for titles. `--title` takes its value on the command line.
- No bulk edit, no regex/sed-style title rewriting, no templating.
- No changes to writ types beyond `mandate` — whatever set of writ types `edit` works on today is the set it works on after this change.
- No renaming or restructuring of the existing `--body` behavior.

## How it works

Invocation shape:

```
nsg writ edit <writ-id> [--title <string>] [--body <string>]
```

Behavior:

- If neither `--title` nor `--body` is passed, exit non-zero with a message along the lines of `error: nothing to edit; pass --title and/or --body`.
- If `--title` is passed with an empty string, reject it — titles are required on writs, so an edit shouldn't be able to blank one out. Message: `error: --title cannot be empty`.
- If `--title` is passed and identical to the current title, treat as a no-op for that field (don't write a spurious history entry). Same rule the `--body` path should already follow; if it doesn't, match whatever `--body` does today rather than diverging.
- On success, print the same confirmation line the current `edit` command prints, and include the new title in it if the title changed. One line, not a diff.
- Exit codes: 0 on success (including no-op), non-zero on validation failure or writ-not-found — same scheme as the rest of `nsg writ`.

Register: matter-of-fact CLI, consistent with the rest of `nsg writ`. No new jargon.

## Assumptions I made

- `nsg writ edit` today takes a positional writ id and a `--body` flag; the implementation is small enough that adding `--title` is a localized change in the command handler plus whatever writ-mutation function it calls. Planner should confirm the actual shape.
- Writs have a `title` field that is a plain string, required, and already mutable through whatever internal API `--body` uses. If the data model doesn't have an obvious `setTitle` equivalent, the planner should flag that — this commission assumes it's symmetric with body.
- Edit history / audit trail for `--body` already exists and is trivially extensible to cover title. If it isn't, I still want the edit to work; the history entry is nice-to-have, not a blocker.
- The command is used on `mandate` writs primarily but should work on any writ type `edit` currently supports.

## Deferred questions

- Should `--title` also accept `-` (stdin) or `@path/to/file` the way some CLIs do for long strings? My default is no — titles are short by definition — but flag it if `--body` already does this and you want symmetry.
- Is there a max title length enforced elsewhere (e.g., in the ontology or the Books writer)? If so, the CLI should surface that limit in the validation error rather than letting the write fail deeper in the stack.
- Do any running animas or scripts grep the output of `nsg writ edit` for a specific phrasing? If yes, keep the existing output format and only append the title line; don't reshape it.
