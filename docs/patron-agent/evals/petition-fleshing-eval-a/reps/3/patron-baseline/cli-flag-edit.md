# Add `--title` to `nsg writ edit`

I want `nsg writ edit` to accept a `--title` flag so I can rename a writ in place from the CLI, the same way I can already rewrite its body with `--body`. Today the only way to fix a wrong or outdated title is to cancel and repost, or to reach into the books directly, and both are annoying enough that I end up living with bad titles.

## Reader and decision

The reader is me (and, by extension, any patron or steward-style anima with write access to the books) sitting at a terminal mid-session. The decision is small and frequent: "this writ's title no longer reflects what it's actually about — rename it now, without losing the writ's id, history, or children." Expected frequency: a handful of times per working session, usually right after a writ's scope drifts or right after I realize I posted with a typo.

## Scope

**In:**
- A new `--title <string>` option on `nsg writ edit <writ-id>`.
- Accepting `--title` alone, `--body` alone, or both in the same invocation. If both are passed, both are applied as a single edit.
- Validation: title must be non-empty after trim, and must fit whatever length ceiling `nsg writ post` already enforces. Reuse that validator — don't invent a new one.
- A single audit entry on the writ recording the edit (old title → new title), consistent with how `--body` edits are already recorded.
- Updating `nsg writ edit --help` and the command's man-style description so `--title` is documented next to `--body`.
- One or two integration tests: edit title only; edit title and body together.

**Out:**
- Editing any other writ field (status, type, parent, assignee, dispatch target, etc.). Those have their own commands or lifecycle transitions and I don't want this flag to become a general-purpose mutator.
- Interactive `$EDITOR` support for the title. `--body` may open an editor when the flag is bare; `--title` should require a value inline. Titles are one line — an editor is overkill.
- Bulk rename across multiple writs.
- Any UI surface outside the CLI.

## How it works

Invocation shape:

```
nsg writ edit <writ-id> --title "New title here"
nsg writ edit <writ-id> --title "New title" --body "New body"
nsg writ edit <writ-id> --title ""          # rejected: empty title
nsg writ edit <writ-id>                     # rejected: no-op, as today
```

On success, print the same confirmation line the command prints today for a body edit, but reflecting which fields changed — e.g. `edited writ <id>: title, body`. Exit 0.

On validation failure (empty title, too long, writ not found, writ in a terminal state that disallows edits), exit non-zero with a clear single-line error. Do not partially apply — if title is valid but body is not, reject the whole call.

The underlying writ-edit operation in the books should take an optional `title` alongside the existing optional `body`, and the audit entry should list whichever fields actually changed. If the new title is byte-identical to the old one, treat that field as unchanged (don't log a no-op rename).

Tab completion, if the CLI has it, should surface `--title` next to `--body`.

## Assumptions I made

- `nsg writ edit` today is a thin CLI wrapper over a books-level edit operation, and that operation already has a natural place to accept a new field. If title is hardcoded as immutable deeper in the stack, the planner should flag that — it changes the size of the job.
- The writ lifecycle already permits edits in `new`, `open`, and `stuck` states but not in terminal states (`completed`, `failed`, `cancelled`). `--title` should follow the same rule `--body` follows; I'm assuming that rule exists and is consistent.
- There is an existing title validator used by `nsg writ post`. If there isn't, use a reasonable default (non-empty after trim, ≤ 200 chars) and note it in the PR.
- Audit/history on writs is already structured enough to record a field-level diff. If it only records "edited" without field names, just extend it minimally — don't redesign the audit format for this.

## Deferred questions

- Should `--title -` (or bare `--title` with no value) drop into `$EDITOR` the way `--body` apparently does? My default is no, but confirm how `--body` behaves today so the two flags feel consistent.
- Does renaming a writ need to propagate anywhere — e.g. a denormalized title on child writs, a cached title in the clockworks index, or anything the Clerk displays? If yes, the planner should list those surfaces before dispatch.
- Is there a permission model on edits (who can rename whose writ)? If so, `--title` inherits it unchanged; confirm there's nothing title-specific to think about.
