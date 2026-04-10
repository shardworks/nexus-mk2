## Goal

Restructure quest-writ storage so the narrative body lives in a real file in the **guild**, not as a mutable column in the Clerk's `writs` row. The writ row keeps structural metadata (id, type, title, status, parent, links). The file is *canonical* for the body; the row is an index/cache hydrated from the file. Applies **only to quest writs** — other writ types keep their current mutable-row body, which suits write-once-mostly-read workflows.

## Status

parked — design proposal with three constraints fixed by Sean (file canonical, quests only, files in the guild). Three open design questions remain unresolved (location/naming, status-driven lifecycle, slug/rename handling). Surfaced 2026-04-10 from a meta review of editing friction that revealed the current mutable-row model is the wrong shape for synthesized narrative.

## Next Steps

Resolve the three open design questions below, then scope the migration. Suggested sequencing: settle file location and partitioning → settle status-driven lifecycle → design the Clerk hydration layer → write a migration script for existing quest writs → ship.

### Fixed constraints (Sean, 2026-04-10)

1. **Files are canonical, DB is cache.** The body column on the writ row is hydrated from the file on read; it is never directly written by edit operations on a live quest. This is a real philosophical shift away from "everything in the substrate" — confirmed and intentional.
2. **Quest writs only.** Mandates and other obligation-shaped writ types keep their current mutable-row body. The split is structural: it tracks whether the body is a *living document* (quest) or a *static spec* (mandate). Future writ types should be assessed against the same axis when introduced.
3. **Files live in the guild, not the sanctum.** Quest files belong alongside the writs DB (in the guild), not alongside experiments and ethnography (in the sanctum). Concretely: somewhere under the active guild root (`/workspace/vibers/` for the current guild). Coco edits them via path resolution through `nsg`, not by direct sanctum-side file access.

### Open design questions

**Q1 — File location and partitioning.** Files live under the guild root. Candidate layouts:

- *Flat* — `<guild-root>/writs/<id>.md`. Simple. Loses any visual grouping.
- *By type* — `<guild-root>/writs/quests/<id>.md`. Future-proof if other writ types ever join.
- *By type + status* — `<guild-root>/writs/quests/<status>/<id>-<slug>.md`. Free "what's live" view via `ls`. Means files move on every status transition — extra ops, but maybe worth it.
- *Hierarchical by parent* — nested directories mirroring the writ tree. Visual structure for deep hierarchies. Loses flat enumeration.

Tentative lean: type + status directories, with id-prefixed filenames. But Q2 dominates this.

**Q2 — Status-driven file lifecycle.** Sean's framing: file on disk while live, snapshot into DB body column on completion, delete from disk. This naturally splits the substrate into "live working surface" vs "archived synthesis." Implications:

- Need a clean snapshot step on `complete` / `cancel` / `fail`: copy file → DB row → unlink file. Atomic — both writes succeed or neither.
- `nsg writ show` on a completed quest reads the body from the row (archived).
- Reopening a completed quest (if we support that) re-extracts the body from the DB to a fresh file.
- File is the editing surface; DB is the archive.
- `waiting` / `blocked` quests stay on disk — they're paused, not finished. Confirm with Sean.
- `new` / `ready` / `active` / `waiting` → live (file on disk).
- `completed` / `cancelled` / `failed` → archived (DB only, file deleted).

This pattern is appealing because it makes "what's live" a filesystem question, garbage-collects old quest files automatically, and matches the natural arc of a quest. Also forces the synthesis discipline: once a quest is closed, the body is frozen and can't be casually edited.

**Q3 — Slug derivation and rename handling.** If the filename includes a slug from the title, what happens when the title is edited?

- *Regenerate slug, rename file* — file ops on every title edit. Tracks current title.
- *Fix slug at creation* — slug becomes stale if title changes, but file path is stable.
- *Omit slug entirely* — id-only filenames (`w-mnt0...md`). Less human-readable, no rename problem.

Tentative lean: id-only with the title in the body's first line as a backup. Simplest.

### Other open questions (smaller)

- **CLI surface change.** What does `nsg writ show` look like? Probably: read the row for metadata, read the file for body, merge, return. What does `nsg writ edit --body ...` do for quests? Probably: rejected with "use the file directly at `<path>`." Or: writes to the file, not the row.
- **Cross-guild visibility.** Quest files in one guild aren't visible to agents in other guilds. Probably fine — quests are guild-scoped already.
- **CDC implications.** Body changes won't flow through CDC if they happen on disk. The Laboratory currently only cares about lifecycle events (created, status changed), so probably fine. Confirm by reading laboratory ingest code before shipping.
- **Concurrency.** Two sessions editing the same file → mtime check at hydration boundary, or filesystem-level locking, or rely on git if the directory is git-tracked. Q2 affects this: if files live under the guild root and the guild root is git-tracked, we get git's conflict semantics for free.
- **Migration.** Existing quest writs (currently 8 in the books) need their bodies extracted to files. Small one-off script.
- **Interaction with the event-log layer (T1.9).** The event log probably lives in the DB regardless; only the body migrates to disk.

## Context

The current model collapses three structurally different layers into one mutable row:

- **Structural metadata** (id, type, status, parent, links) — wants DB indexes and CDC.
- **Synthesized narrative** (Goal, Context, Next Steps, References) — wants editor affordances, targeted edits, version history.
- **Timeline of events** (status changes, decisions) — wants append-only logs.

Earlier proposals during today's session (`--body-from <file>`, `nsg writ checkout` / `commit`) were trying to bridge a DB-resident body to a file workflow. The simpler answer is to *just put the body in a file in the first place*. That's what this quest formalizes.

This shift dissolves several parked sub-questions at once:

- **T1.6 (editing ergonomics)** — solved by construction. Native Read/Edit/Write tools work directly on the file. The checkout/commit shape from T1.6's earlier framing is dissolved.
- **T1.7 (body edit history)** — `git log -p` on the file while live. After archival, the DB body column is an immutable snapshot.
- **T1.3 (concurrent writes)** — git's existing conflict semantics if the guild root is git-tracked, or mtime checks at the hydration layer otherwise.
- **T1.4 (decisions & ratification)** — partially, via the event-log layer (T1.9).

The constraint that this applies *only to quest writs* is important. Mandates and other obligation-shaped writs are write-once-mostly-read; their bodies are short and stable; files are overkill there. The split is structural, not arbitrary — it tracks whether the body is a living document or a static spec.

The constraint that files live in the **guild** (not the sanctum) is also load-bearing. Quest files belong alongside the writs DB so they participate in the same lifecycle and visibility scope. The sanctum holds patron-side artifacts (experiments, ethnography, research); the guild holds the operational substrate animas work against. Quest bodies are operational substrate.

## References

- Parent: T1 writ substrate & quest type — w-mnswvmj7-2112b86f710a
- Supersedes (the design within): T1.6 quest body editing ergonomics — w-mnszjvrr-87e44398b1e9
- Likely closes: T1.7 body edit history — w-mnszkcd5-1f3e2acb4f4a
- Likely closes: T1.3 concurrent session writes — w-mnswwgah-7dca55bc359e
- Downstream sibling: T1.9 event-log layer for quest writs — w-mnt0i31e-1a1d46cb59a7
- Source conversation: 2026-04-10 session with Sean on editing friction and structural mismatch
- Project philosophy note: this is an instance of *interface friction as a diagnostic signal for structural mismatch* — worth a note for the published work

## Notes

- 2026-04-10: opened from meta-review conversation with Sean. Three constraints fixed: file canonical (not DB cache); quests only (not other writ types); files in the guild (not the sanctum). Three design questions remain open.