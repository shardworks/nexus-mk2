# `nsg writ edit`: add `--title` flag

I want `nsg writ edit` to accept `--title` alongside the existing `--body`, so I can rename a writ from the CLI without dropping into the REPL or hand-editing the books. Small feature, but it's been biting me often enough that I want it done.

## Reader and decision

The reader is **me, or another anima operating a guild via the CLI** — typically mid-session, with a writ already open. The decision it informs is immediate: "this writ's title is wrong or stale; fix it and move on." I'd expect to hit this maybe 2–5 times per working session when I'm the one driving, and agents using `nsg writ edit` to correct titles they generated earlier will hit it more often than that.

The bar is: no context switch. I should be able to type one line and get back to whatever I was doing.

## Scope

**In:**
- A new `--title <string>` flag on `nsg writ edit`.
- `--title` and `--body` can be passed together in a single invocation (one edit, both fields updated atomically).
- Either flag alone is valid; passing neither is an error ("nothing to edit — pass --title or --body").
- Title validation: non-empty after trimming, max length matches whatever the existing writ-creation path enforces (planner to verify the number).
- The edit produces the same kind of books entry / audit trail as a `--body` edit does today — one record, noting which fields changed.

**Out:**
- No interactive editor fallback (no `$EDITOR` popup for title). One-shot flag only.
- No batch/multi-writ edit.
- No changes to other writ fields (status, type, parent, tags, etc.) — that's a separate commission if we want it.
- No new subcommand; this is a flag addition to an existing command, not `nsg writ rename`.
- No changes to `nsg writ create` — it already takes `--title`.

## How it works

Invocation shape:

```
nsg writ edit <writ-id> --title "New title here"
nsg writ edit <writ-id> --title "..." --body "..."
nsg writ edit <writ-id> --body "..."                  # still works, unchanged
nsg writ edit <writ-id>                               # error: nothing to edit
```

Behavior:
- On success, print the same confirmation line `--body` prints today, but reflecting whichever field(s) were updated. Something like `edited writ abc123 (title, body)` — planner can match the existing format.
- On validation failure (empty title, too long), exit non-zero with a clear message naming the field. Don't partially apply — if title is invalid, body doesn't get written either.
- If the writ doesn't exist or is in a lifecycle state that disallows edits (whatever the current `--body` rule is), same error as today. Title edits inherit the exact same preconditions as body edits; I don't want a second policy.
- Help text (`nsg writ edit --help`) gets updated so `--title` is listed with a one-line description and an example.

## Assumptions I made

- There is already a writ-update code path that handles `--body`; adding `--title` is extending that path, not a new code path. Planner: verify and reuse.
- Titles already have a max-length constraint enforced at creation. Same constraint applies here.
- The books/audit record for an edit already supports recording multiple changed fields (or can trivially be extended to). If it can't, the planner should flag that before building — it changes the shape.
- No shell autocomplete file needs regeneration, or if it does, it's part of the normal build.

## Deferred questions

- Should `--title ""` (explicit empty string) be treated as "clear the title" or as a validation error? My call: **validation error**, titles are required. Confirm before building.
- If a user passes `--title` equal to the current title (no-op), do we still write an edit record? My call: **no, skip the write and exit 0 silently** — matches how most tools behave. But check what `--body` does today and match it rather than diverging.
- Is there anywhere else in the CLI surface (e.g., `nsg mandate edit`, `nsg click edit`) that has the same `--body`-only gap? Not in scope for this commission, but worth a one-line note if you spot it — I may commission a follow-up.
