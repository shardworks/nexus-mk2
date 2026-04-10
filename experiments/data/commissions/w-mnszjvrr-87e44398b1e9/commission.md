## Goal

Close the gap between "edit a markdown file in `$EDITOR`" and the current `nsg writ edit --body "<heredoc>"` flow. Small status / next-steps tweaks are fine today, but restructuring a long quest body (reordering Context paragraphs, rewriting References) is heavy enough that it discourages the kind of synthesis the body template asks for.

## Status

parked — friction is real but no incidents. Surfaced 2026-04-10 during a meta review of the quest substrate after one day of use.

## Next Steps

Pick one of the options below to prototype, or decide the friction is tolerable and close this quest:

1. `nsg writ edit --editor` — shell out to `$EDITOR` with the current body in a temp file, write back on save. Mirrors `git commit` behavior; cheapest UX win.
2. `nsg writ edit --body-from <file>` — explicit temp-file round-trip the caller manages. Less magic, more steps.
3. Coco-side helper — wrap the round-trip in a shell function so Coco's invocation stays one call but the editing happens in a real editor.

Option 1 is the obvious default if the Clerk endpoint can accept a body via stdin or file path.

## Context

Today's flow for a substantial body edit:

1. `nsg writ show <id>` to retrieve current body
2. Reconstruct it inside a heredoc in a Bash tool call
3. Hand-edit inside the heredoc (no editor affordances, no syntax highlighting, easy to mis-escape)
4. `nsg writ edit --id <id> --body "$(cat <<'EOF' ... EOF)"`

Contrast with the pre-quest workflow: open `.scratch/foo.md` in an editor, edit, save. The quest substrate wins on cross-references, lifecycle, and visibility-to-agents — but loses on the raw editing loop. T1.6 is about recovering that loop without sacrificing the substrate wins.

This is independent of T1.7 (edit history) but related: both are about treating a quest body as something richer than a mutable string column.

## References

- Parent: T1 writ substrate & quest type — `w-mnswvmj7-2112b86f710a`
- Sibling: T1.7 quest body edit history (to be spawned alongside this one)
- `.claude/skills/quests/SKILL.md` — current update workflow

## Notes

- 2026-04-10: opened from meta review of quest substrate (one-day retrospective).