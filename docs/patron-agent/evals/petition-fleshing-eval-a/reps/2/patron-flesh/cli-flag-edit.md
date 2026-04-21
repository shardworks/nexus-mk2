# `nsg writ edit --title` — complete the metadata-edit surface

I want `nsg writ edit` to accept `--title` alongside `--body`. The brief's ask is straightforward; what I'm fleshing is the shape of the pair — validation, error behavior, and what "complete" means for this edit surface — so the planner isn't left picking those off-brief (#36).

## Reader and decision

**Reader:** an anima or human author who just created — or just received — a writ whose title is wrong, stale, or drifted off-scope. Most often me, posting a commission and realizing the title reads badly in the log line. Occasionally Coco or another interactive anima fixing up a mandate they authored.

**Decision:** "change this writ's title to match what it's really about." Author-side metadata correction, nothing more.

**Frequency:** low. A handful of times per week. Not a hot path — it doesn't need to be fast, but it needs to be obvious and safe (#2).

## Scope

**In:**
- `--title <string>` on `nsg writ edit <writ-id>`, as a peer to the existing `--body`.
- Both flags usable together in one invocation — `--title X --body Y` applies both in a single edit.
- At least one of `--title` / `--body` required. Omitting both is an error, not a no-op (#2).
- `--title` value rejected if empty or whitespace-only after trim. A writ without a title is broken; don't let the CLI produce one (#2).
- Output: a short confirmation that names the writ id and which fields changed. Title shows `"old" → "new"` (it's short enough to fit on a line). Body shows `updated` without the diff.

**Out:**
- `--status` / `--type` / `--parent` edits. Status has its own lifecycle commands; type and parent aren't author-editable on a live writ. Not this command's job (#9).
- Interactive `$EDITOR`-based editing. Flag-form is the thin complete slice (#23); editor mode is a separate petition if it ever earns a second consumer (#18).
- Bulk edit across multiple writs. One writ per invocation.
- An edit-history viewer. If writ edits are already journaled through the books, we inherit that; if not, it's a separate concern and I don't want it coupled to this.

## How it works

Invocation:

```
nsg writ edit <writ-id> [--title <string>] [--body <string>]
```

Validation order, fail-loud at each step (#2):

1. Resolve `<writ-id>` against the books. Unknown id → `writ <id> not found`, non-zero exit.
2. Require at least one of `--title` / `--body`. Neither → `nothing to edit — pass --title and/or --body`.
3. If `--title` is present, trim and reject empty → `title cannot be empty`.
4. Apply through the same book-writing path the existing `--body` edit uses. Don't route around the Scriptorium's edit contract (#9, #15); `--title` rides the same rails.

Output on success, one invocation, both fields changed:

```
Updated mandate-abc123
  title: "cli flag edit" → "writ edit --title support"
  body: updated
```

Only the line for the changed field appears. All error messages single-line, non-zero exit, no silent fallback (#2).

## Assumptions I made

- Writs have a `title` field distinct from `body`. The brief implies it; I'm trusting that.
- The existing `--body` edit already writes structurally through the books (edit is journaled, not logged) (#20). `--title` inherits that path without new plumbing.
- `title` and `body` are the full set of author-editable freeform fields on a writ today. If there's a `tags` / `labels` / similar, the completion-of-set argument (#36) drags those into this petition too — see deferred.
- Whatever permission rule `--body` applies to sealed/completed writs (allow? block?), `--title` matches it. I don't want divergent edit rules across peer fields.

## Deferred questions

- **Other editable fields.** Does the writ schema have author-editable metadata beyond title and body — tags, labels, anything of that shape? If yes, #36 says ship them in this petition rather than add `--title` now and come back ad-hoc for the next one. Planner should inspect the schema and propose the full flag set before implementation; I'll make the call on what's in.
- **Sealed-writ edit policy.** What does `nsg writ edit --body` do on a completed or sealed writ today? Confirm the behavior; `--title` should match, not re-decide. This is a verification task, not a design question.
- **Edit provenance.** If writ edits aren't already recorded structurally in the books, flag it — but keep it out of this commission. Separate petition (#23).
