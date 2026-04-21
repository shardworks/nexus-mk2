# `nsg writ edit --title` — extend edit to cover the other editable field

I want `nsg writ edit` to accept `--title` alongside the existing `--body`, with matching semantics. This is an extension of the command that already owns writ mutation, not a new surface and not a separate `rename` verb (#3, #26).

## Reader and decision

The reader is an author or operator who has a writ open in the books and realizes the title is wrong — typo, stale framing, or the understanding of the work evolved after the writ was posted. They need to correct it in place. Frequency: occasional, corrective. Not a workflow tool, a fix-it tool (#22).

The decision this surface informs is a small one — "update the title on this writ to the one I now think is right" — but the absence of the flag today forces the reader into a worse path (delete + recreate, or hand-edit the book, or tolerate the wrong title). That's the gap worth closing.

## Scope

**In:**
- `--title <string>` flag on `nsg writ edit <writ-id>`, same shape as `--body`.
- Both flags accepted together in a single invocation; applied atomically (#4) — one write, one event, one post-edit echo.
- Validation: title must be non-empty and non-whitespace. Reuse whatever length/character constraints the create path already enforces.
- Invocation with neither `--title` nor `--body` is an error with usage (#2). No silent no-op.
- Post-edit output matches the existing `--body` behavior (whatever that is — same echo, same exit code, same event emission).

**Out:**
- No `nsg writ rename` or sibling verb. The edit command is the extension point (#3).
- No change history / audit log / diff view. Derived-state tracking isn't the reader's question (#19, #23). If an audit trail matters, the clockworks event stream already records the edit — grep is fine for now, and if it isn't, that's a separate petition.
- No bulk retitle, no pattern-based rename, no interactive prompt. Second-consumer scaffolding (#18).
- No edits to other writ fields (`status`, `type`, `parentId`). Status has its own lifecycle commands; structural fields aren't user-editable via `edit`. I am *not* using this petition to open a general "writ field editor" — the set of editable free-text fields is `{title, body}`, and after this change it is complete (#36).
- No CLI-level validation beyond non-empty. If downstream consumers have stricter title rules, enforce them at the ontology/writ-write layer where the create path already does — don't duplicate the rule in the CLI (#31).

## How it works

Concretely: `nsg writ edit <id> --title "new title"` updates the title field on the writ and prints the updated writ, same way `--body` does today. `nsg writ edit <id> --title "new title" --body "new body"` updates both fields in one write. `nsg writ edit <id>` with no mutation flags exits non-zero with a usage message naming both flags (#2).

Error behaviors I want explicit:
- Empty string to `--title` → error, don't accept.
- Writ id not found → whatever `--body` does today; match it.
- Both flags present → apply both; one event, not two.

The implementation should hit the same code path `--body` uses — if there's a single writ-update function taking a partial, `--title` slots in as another optional field on that partial. If `--body` is currently hard-coded rather than going through a general update, fix that first and route both flags through the general path (#31). I don't want a `--title` branch that diverges from `--body` semantics because the underlying function wasn't built to accept partials.

## Assumptions I made

- `title` is a first-class field on the writ type, not derived from body frontmatter or synthesized on read. If it isn't, the petition changes shape and the Distiller should flag that.
- `--body` today echoes the updated writ on success and errors loudly on invalid input. `--title` should match; if `--body`'s current behavior is worse than that, fix `--body` in the same commit rather than cloning bad behavior.
- No downstream consumer identifies writs by title (all references are by id), so retitling is a display-layer change with no cascading updates needed.
- Title edits emit a writ-update event through the same clockworks channel body edits do; handlers that care already subscribe.

## Deferred questions

- Is there a max-length or character-set constraint on writ titles that create enforces? If yes, the edit path must match — confirm the validation lives in the write layer, not in create-only code.
- Does `--body` today support reading from stdin or `@file.md`? If yes, `--title` should *not* mirror that (titles are short); if no, nothing to match. Worth checking but not blocking.
- Are there writ *types* for which title is immutable by design (e.g., system-generated writs whose title encodes identity)? If so, edit should refuse on those types rather than silently succeeding.
