# `nsg writ edit` — add `--title` alongside `--body`

I want `nsg writ edit` to accept `--title` as a peer to the existing `--body` flag. Title and body are the two human-authored content fields on a writ; shipping edit for one without the other is an incoherent half-surface (#36). This is a completion, not a feature addition.

## Reader and decision

The reader is an **author/operator who just posted a commission** (or is looking at one in the books) and wants to correct or refine what they wrote. Typical moment: they dispatched a mandate with a typo in the title, or the title undersells the obligation, and they don't want to cancel-and-repost. Frequency is low-per-writ but recurring across the stream of commissions — anyone driving the system from the CLI will reach for this within their first few dozen commissions. Naming the reader because the brief didn't (#22).

## Scope

**In:**
- `nsg writ edit <id> --title "<new title>"` updates the writ's title in-place.
- `--title` and `--body` are independently optional; either, both, or neither may be passed.
- If *neither* is passed, the command errors (#2) — "nothing to edit" is a loud failure, not a silent no-op.
- Behavior mirrors `--body` exactly: same id resolution, same permission model (whatever it is today), same persistence path, same log/book write on success.

**Out:**
- No editing of lifecycle state (`status`), parent linkage, assignee, or type. Those are separate operations; conflating them into `writ edit` would widen scope past the thinnest slice (#23).
- No bulk edit, no interactive editor fallback, no `--from-file`. `--body` doesn't have those either, and I'm not earning them from a speculative second consumer (#18).
- No "amend history" / audit-trail view surface in this petition. If the books already record edits, fine; if not, that's a separate concern.

## How it works

Extend the existing `nsg writ edit` command — this is an extension of a live surface, not a new one (#26). The flag already has precedent on the same command (#13), so the shape is fixed by `--body`:

- `--title <string>`: a single string argument; the full new title. Replaces the previous title outright — no append/prepend mode, no templating.
- Validation: if the writ type in question does not have a title field, throw a clear error naming the writ type (#2). Do not silently skip the update.
- Success output: identical format to a successful `--body` edit. Log line should read naturally — e.g., `writ <id> title updated` (#32). If both flags are supplied, a single line per field updated is fine; don't invent a combined form.
- Under the hood: the underlying writ-mutation API should already expose title as a writable field (writs have titles today in the books). If the framework-side update method is `--body`-specific, generalize it to take a partial patch object rather than adding a parallel title-specific method (#3, #5). One mutator, two flags routing into it.

The CLI flag is the extension point here — the surface the author uses (#14). The patch-shape on the internal API is the natural neighborhood for the new field (#3, #17).

## Assumptions I made

- `nsg writ edit` already takes a writ id as a positional argument and resolves it the same way other writ commands do. The planner should confirm the id-resolution path and reuse it.
- Writs have a `title` field on the persisted record today, writable by the same code path that writes `body`. If title is currently derived or immutable-by-convention, that changes the shape of this work and the planner should flag it back to me.
- No authorization gate beyond whatever `--body` already enforces. Title isn't more sensitive than body.
- The books record the edit the same way body edits are recorded. If body edits aren't currently journaled, that's a pre-existing gap — not mine to fix in this petition.

## Deferred questions

- **Are there writ types without titles?** If every writ has a title, the "throw on unsupported type" branch is dead code and can be omitted. Planner should check the ontology.
- **Does `--body` currently no-op or error when the new body equals the old?** Whatever it does, `--title` should match. I don't have a strong preference, but the two flags must behave consistently (#13).
- **Is there a second edit-shaped command I'm missing?** If `nsg writ retitle` or similar exists, say so — I'd rather consolidate than add a parallel path (#38). I don't expect there is, but worth a grep before implementation.
