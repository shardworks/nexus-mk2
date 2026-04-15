<!-- Live body for this quest is a file in the vibers guild. See .claude/skills/quests/SKILL.md. -->
<!-- Do not edit this row body while the quest is live. -->

## Goal

Give `nsg writ edit` (or a dedicated `nsg writ reparent` command) the ability to change a writ's parent, regardless of the writ's status or the new parent's status. Today re-parenting requires direct `sqlite3 json_set` on `books_clerk_writs` — a routine step in quest restructuring that bypasses the CLI entirely. `commission-post --parent-id` refuses stuck/completed parents at creation time, which is also too strict for quest work. Prereq for `w-mo0ffnhw-b2d0d3f7e3fc`.