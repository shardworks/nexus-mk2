## Goal

Build a small CLI that wraps `nsg` with a quest-shaped interface for Coco (and other LLM agents working on quests). The wrapper encodes the file-canonical quest conventions as commands, so individual rituals (create, open for edit, close, migrate) can't drift or be executed out of order. This is a sanctum-side convenience layer, not a framework feature — it exists because the file-canonical quest model (parent quest w-mnt0jin1) is a convention layered on top of `nsg`, and discipline alone may not be enough to keep the convention consistent over time.

## Status

deferred — captured as the future escape hatch while we ship the file-canonical quest convention without any CLI scaffolding. Revisit only if the convention proves too easy to get wrong in practice.

## Next Steps

Wait for the parent quest (w-mnt0jin1) to ship and land. Then watch for drift: Coco forgetting to snapshot on closure, row bodies getting overwritten by accident, migration scripts needing re-runs, files appearing in the wrong directory, stale files left behind after closure. If any of those become recurring pain, open this quest and scope the wrapper.

When the time comes, the likely command shape is:

- `quest new --title ... --goal ... [--parent <id>]` — creates the writ row with just the Goal + pointer warning, writes the initial file at `/workspace/vibers/writs/quests/<id>.md` with the full template, prints the file path.
- `quest path <id>` — prints the canonical file path for a quest. Useful for scripts and editor integration.
- `quest close <id> [--complete|--cancel|--fail]` — reads the file, snapshots it into the row body via `nsg writ edit`, transitions status via `nsg writ complete|cancel|fail`, unlinks the file. Atomic-ish from the caller's view.
- `quest migrate` — idempotent one-shot that reconciles row bodies and files for any drift. Safe to re-run.
- `quest list` — thin wrapper around `nsg writ list --type quest` with friendlier output (title + status + one-line Goal preview).

Implementation language: probably a bash script or a small Node script that shells out to `nsg`. No framework changes. Lives in the sanctum (`/workspace/nexus-mk2/bin/quest.sh` or similar).

## Context

Parent quest w-mnt0jin1 (File-canonical quest bodies) resolves by shipping a pure-convention layer: the writ row holds just the Goal plus a pointer warning comment; the living body lives in a real file at `/workspace/vibers/writs/quests/<id>.md`; git in the vibers guild provides history and conflict semantics; closure is a manual Coco ritual (snapshot file into row → complete writ → rm file).

That model deliberately has no framework support — no new `nsg` subcommands, no schema changes, no CLI hydration. It is \"us-specific, not framework-proven\" (Sean's framing, 2026-04-10). The tradeoff is that Coco has to remember the ritual every time, and if a future session (or script, or other agent) calls `nsg writ edit --body` on a live quest without reading the visible warning in the row body, data can drift: the file and the row get out of sync, and on closure the wrong version wins.

This wrapper is the escape hatch for that risk. We're deferring it until the pain shows up — the alternative (building it now) violates the us-specific framing and locks in a CLI shape before we've learned what ergonomics actually matter.

Watch items during the parent quest's initial life:

- Does Coco reliably follow the close ritual end-to-end?
- Does the row-body warning comment actually prevent accidental edits?
- Do migration re-runs surface drift, or is drift rare enough to not matter?
- Does any other agent (Astrolabe, ethnographer, future animas) try to touch quest writs in a way that conflicts with the convention?

If the answers are \"yes, yes, no, no,\" the wrapper stays deferred forever. If any of them flip, open this quest and build the thing.

## References

- Parent: File-canonical quest bodies — w-mnt0jin1-960d83b73712
- Source conversation: 2026-04-10 session with Sean resolving M1–M4 on the file-canonical design

## Notes

- 2026-04-10: opened as the deferred M4 escape hatch during the file-canonical quest design conversation. Captured now so the idea doesn't evaporate.