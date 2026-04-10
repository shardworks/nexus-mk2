---
description: Work with quest writs — Coco's session-continuity mechanism. Invoke when opening, updating, resuming, or concluding a line of inquiry that should outlive the current session.
disable-model-invocation: true
---

# Quests — Session-Continuity Workflow

> NOTE: The environment should have a properly defined `GUILD_ROOT` allowing the `nsg` command to be used without `--guild-root`. If this is not the case, the guild root (at `/workspace/vibers`) can be appended to commands as needed.

A **quest** is a writ type that tracks a live area of inquiry — a question Sean is working through, a design conversation worth keeping, an investigation with enough weight to warrant a durable home. Quests live in the guild's books (Clerk's `writs` table). Quests are never dispatched to a rig — they're kept for thinking, not for execution. They are Coco's primary mechanism for session continuity.

## File-canonical quest bodies

Quest writs use a **split-body model**. The Clerk's `writs` row holds a tiny stub (a warning comment plus the Goal). The **living body** — Status, Next Steps, Context, References, Notes — lives in a real markdown file at:

    /workspace/vibers/writs/quests/<writ-id>.md

This is a convention Coco maintains on top of the standard writ substrate. The framework is not modified. Coco edits the file directly with native Read/Edit/Write tools; git in the vibers guild provides history and conflict semantics.

**The path convention is the single source of truth.** Every live quest's file is at the path above, derived from the writ id. Nothing in the row body repeats the path — the path lives only in this skill file.

**Lifecycle in one line:** file exists while the quest is live (`new` / `ready` / `active` / `waiting`); on closure (`completed` / `cancelled` / `failed`), Coco snapshots the file contents into the row body, transitions the writ, and deletes the file. The row becomes the archived record.

**Why this split exists:** quest bodies are synthesized narrative, not static specs. Editing narrative through `nsg writ edit --body` is painful for anything longer than a paragraph. Files get editor affordances, git history, diff view, and conflict detection for free. Mandates and other obligation-shaped writs keep the mutable-row body model — the split is scoped to quests only because quests are *living documents*.

The design goal of a quest body is that anyone (future Coco, Sean, Astrolabe) can open it cold and answer five questions in seconds:

1. **What are we trying to figure out or do?** — the goal.
2. **Where does it stand right now?** — the status.
3. **What should happen next?** — the resume-here instructions.
4. **What have we learned so far?** — the accumulated context.
5. **What do I need to look at?** — references, file paths, related writs.

The body template below is structured around those questions.

## When to open a quest

Open a quest when a conversation or line of thought has enough substance to outlive the current session. Heuristics:

- Sean is exploring a design question across multiple turns
- You've tabled something with "let's come back to this"
- A decision is deferred pending more thought
- A line of inquiry has its own arc — opening question, accumulating notes, eventual conclusion

Don't open a quest for every exchange. One-off questions, quick clarifications, and routine operational work don't need one.

## Body templates

There are two templates: the **row body stub** (lives in the Clerk's `writs` table) and the **file body** (lives at `/workspace/vibers/writs/quests/<writ-id>.md`).

### Row body stub

Identical for every live quest. The HTML comments are load-bearing — they signal to any future reader (Coco, Sean, Astrolabe, other agents) that the row body is not the editing surface. The stub is **path-free** by design: the skill file is the single source of truth for where the live body lives, so the row body never drifts if the convention changes.

```markdown
<!-- Live body for this quest is a file in the vibers guild. See .claude/skills/quests/SKILL.md. -->
<!-- Do not edit this row body while the quest is live. -->

## Goal

<One paragraph. What we're trying to figure out, decide, or build.
Frame the outcome, not the question that started the inquiry.
This paragraph is duplicated in the file body and kept in sync.
Goal is stable — set at creation, rarely changes.>
```

### File body

The file at `/workspace/vibers/writs/quests/<writ-id>.md` uses the full six-section template with an h1 title on line 1:

```markdown
# <title>

## Goal

<Same paragraph as the row body stub. Kept in sync with the row.>

## Status

<One line. Pick a shape:
  - active — currently being worked on
  - parked — tabled, waiting for priority or bandwidth
  - blocked on <thing> — can't progress until something else happens
  - waiting on <person/decision> — needs input
  - mostly shipped, sub-questions remain — partially resolved at birth
Date-stamp if staleness is a risk.>

## Next Steps

<Specific enough to act on. "Read X, decide Y, then draft Z."
This is the "resume here" section — if a future session reads
only one thing, it reads this. Update it every time you touch
the quest.>

## Context

<Rolling synthesis of what's been learned, approaches tried, key
insights, dead ends, current thinking. The "catch me up" section.
Mutable — rewrite as understanding evolves. This is where Notes
content graduates to once it's been processed.>

## References

<Bulleted. File paths, commits, related writs (w-ids), external
links, commands to run. Scannable, not prose. Include inline
annotations where the reference needs context.>

## Notes

<Append-only chronological scratchpad. Observations, partial ideas,
quotes from Sean, dead ends, raw snippets. Drained into Context on
session wrap-up. Can stay empty.>
```

### Section discipline

- **Goal** is durable. Set it at creation; only change it if the inquiry genuinely pivots.
- **Status** is a one-liner, not a paragraph. If it needs more than a line, the extra content belongs in Context.
- **Next Steps** should always be actionable. If you genuinely don't know what's next, write "Next session: decide whether to pursue this or cancel" — that's actionable. An empty Next Steps is a red flag.
- **Context** grows over time but should be *synthesized*, not appended-to. When you update it, you're rewriting the current picture, not logging new events.
- **References** is pointer-flavored, not narrative. Bulleted file paths, w-ids, URLs, commands.
- **Notes** is the intake buffer. Raw thoughts, quotes, observations that haven't earned a place in Context yet. On wrap-up, drain the useful bits into Context (rewording if needed) and leave the rest or clear them.

## Opening a quest

Four steps. Only one touches `nsg`; the rest are native file operations.

**1. Post the commission with the generic stub body.** Every live quest uses the exact same row body — no id substitution, no per-quest content in the row beyond the Goal paragraph itself. Spider will not dispatch the writ because `quest` isn't mapped to a rig template.

    nsg commission-post \
      --type quest \
      --title "<short, descriptive title>" \
      --body "$(cat <<'EOF'
    <!-- Live body for this quest is a file in the vibers guild. See .claude/skills/quests/SKILL.md. -->
    <!-- Do not edit this row body while the quest is live. -->

    ## Goal

    <the stable outcome paragraph>
    EOF
    )"

For a sub-quest, add `--parent-id <parent-quest-id>`.

**2. Capture the returned writ id.** You'll use it to name the file.

**3. Write the full file body** to `/workspace/vibers/writs/quests/<writ-id>.md` using the file template above. The Goal in the file must match the Goal in the row body. Status on a fresh quest is usually `active — just opened` or `ready — captured for later`.

**4. Commit the new file in the vibers guild repo** with Coco's identity:

    cd /workspace/vibers && \
      GIT_AUTHOR_NAME=Coco GIT_AUTHOR_EMAIL=coco@nexus.local \
      GIT_COMMITTER_NAME=Coco GIT_COMMITTER_EMAIL=coco@nexus.local \
      git add writs/quests/<writ-id>.md && \
      git commit -m "open quest <writ-id>: <title>"

Capture the returned writ id in the chat transcript so Sean can refer to the quest later.

## Sub-quests

When a quest spawns a distinct sub-inquiry worth tracking on its own, open a child quest with `--parent-id <quest-id>`. Keep sub-quests for genuinely separable threads; don't fragment a single line of thought.

## Updating a quest

**Never run `nsg writ edit --body` on a live quest.** The row body is frozen at creation. All updates happen in the file at `/workspace/vibers/writs/quests/<writ-id>.md`.

To update a quest during a session:

1. Open the file with Read, Edit, or Write as appropriate.
2. Refresh each section:
   - **Status** reflects the current state (one line).
   - **Next Steps** is refreshed — never leave a stale "do X" when X has already been done.
   - **Context** absorbs anything new that's been learned.
   - **References** grows with any new pointers.
   - **Notes** gets drained (useful bits → Context; rest cleared or left).
3. Commit the change in the vibers guild repo:

       cd /workspace/vibers && \
         GIT_AUTHOR_NAME=Coco GIT_AUTHOR_EMAIL=coco@nexus.local \
         GIT_COMMITTER_NAME=Coco GIT_COMMITTER_EMAIL=coco@nexus.local \
         git add writs/quests/<writ-id>.md && \
         git commit -m "quest <writ-id>: <short description of change>"

**Goal** should rarely change. If the goal has genuinely shifted, consider whether this is still the same quest or a new one. If it is genuinely the same quest with an evolved goal, update **both** the file body Goal section **and** the row body Goal section (via `nsg writ edit --body` this one time) so they stay in sync. This is the only sanctioned use of `nsg writ edit --body` on a live quest.

## Resuming a quest

When Sean references a topic or you recognize the conversation is continuing prior work:

    nsg writ show --id <writ-id>              # row: metadata + Goal stub
    Read /workspace/vibers/writs/quests/<writ-id>.md   # file: full living body
    nsg writ list --parent-id <writ-id>       # sub-quests

Read in order: **Goal → Status → Next Steps**. The Goal comes from either the row or the file (they're in sync); Status and Next Steps come from the file. That's the three-section operational triple and should orient you in under 10 seconds. Drop into **Context** only if you need the fuller picture; **References** and **Notes** are for when you're actively working the quest.

If the file is missing for a quest that's in a live status, something has gone wrong — either the migration hasn't run yet, or the file was deleted without a closure ritual. Check `git log --all -- writs/quests/<writ-id>.md` in the vibers repo to recover.

## Concluding a quest

Closing a quest snapshots the file contents into the row body, transitions the writ, and deletes the file. After closure, the row is the immutable archived record; the file no longer exists.

**1. Finalize the file.** Update **Status** to reflect the resolution. Rewrite **Context** to capture the final picture. Set **Next Steps** to `Concluded — <resolution>` so the closing state is visible at a glance. Future readers (including Astrolabe and other planning agents) should understand the arc from the archived body alone.

**2. Snapshot the file into the row body.** Read the full file contents and write them into the row via one `nsg writ edit --body` call. This is the second and final sanctioned use of `nsg writ edit --body` on a live quest (the first being a Goal-change update).

    nsg writ edit --id <writ-id> --body "$(cat /workspace/vibers/writs/quests/<writ-id>.md)"

**3. Transition the writ.**

    nsg writ complete --id <writ-id>      # resolved
    nsg writ cancel   --id <writ-id>      # abandoned / no longer relevant
    nsg writ fail     --id <writ-id>      # dead end with lessons worth preserving

**4. Delete the file and commit the deletion** in the vibers guild repo:

    cd /workspace/vibers && \
      rm writs/quests/<writ-id>.md && \
      GIT_AUTHOR_NAME=Coco GIT_AUTHOR_EMAIL=coco@nexus.local \
      GIT_COMMITTER_NAME=Coco GIT_COMMITTER_EMAIL=coco@nexus.local \
      git add -A writs/quests/<writ-id>.md && \
      git commit -m "close quest <writ-id>: <resolution>"

The file is gone; the row holds the full snapshot; git holds the history. `nsg writ show --id <writ-id>` on a closed quest returns the complete archived body as usual.

If a follow-up quest supersedes this one, use `nsg writ link --type supersedes` to connect them before closing.

### Reopening a closed quest (rare)

If you need to reopen a closed quest, extract the row body back into a fresh file at `/workspace/vibers/writs/quests/<writ-id>.md`, then replace the row body with the generic live-quest stub (warning comments + Goal section only). Reset the status via the appropriate `nsg writ` transition. Commit the resurrected file in the vibers repo.

## Quests and session continuity

Quests provide continuity across sessions. The flow is:

- **Startup** — scan open quest titles with `nsg writ list --type quest --status ready --status active --status waiting --limit 100`; load bodies on demand by reading `/workspace/vibers/writs/quests/<writ-id>.md` for the quest Sean references. The `--limit 100` is load-bearing: the CLI's default limit is 20, and a silently-truncated list will give you a wrong picture of the board. Raise the limit further if 100 stops being enough.
- **During the session** — open new quests for substantial inquiries; update existing ones as thinking evolves. Keep Notes as a running scratchpad.
- **Wrap-up** — for any quest touched this session: drain Notes into Context, refresh Status, refresh Next Steps. The next session should be able to resume cold by reading Goal / Status / Next Steps without needing the transcript.

Quests are visible to other agents via the Clerk — notably Astrolabe, which may eventually use them as planning inputs. While a quest is live, an agent reading the row sees only the Goal stub and the warning comments pointing at the skill; to read the full living body, the agent must open the file at `/workspace/vibers/writs/quests/<writ-id>.md`. After closure, the full snapshot is in the row. Write quest bodies assuming an autonomous planning agent may read them.

## The row-body-edit trap

The most likely way this convention fails is: a future session (Coco or another agent) calls `nsg writ edit --body` on a live quest without reading the warning comments first, silently overwriting the row body. The file still holds the real content, so the visible damage is limited — until closure, when the Coco ritual snapshots the file into the row and the interim row-edit is lost anyway. The trap is mostly benign because the file is the source of truth.

The non-benign case: a quest whose row body gets edited, then closed *without* running the snapshot step. Then the stale row-edit becomes the archived record. Mitigation: always follow the four-step closure ritual above, in order. If in doubt, re-read the file contents into the row before transitioning.

If this trap starts biting in practice, the deferred quest-helper CLI (see quest `w-mnt106rv-94bed1e0ace3`) is the escape hatch — it wraps the rituals as atomic commands.
