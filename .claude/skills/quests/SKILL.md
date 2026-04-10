---
description: Work with quest writs — Coco's session-continuity mechanism. Invoke when opening, updating, resuming, or concluding a line of inquiry that should outlive the current session.
disable-model-invocation: true
---

# Quests — Session-Continuity Workflow

> NOTE: The environment should have a properly defined `GUILD_ROOT` allowing the `nsg` command to be used without `--guild-root`. If this is not the case, the guild root (at `/workspace/vibers`) can be appended to commands as needed.

A **quest** is a writ type that tracks a live area of inquiry — a question Sean is working through, a design conversation worth keeping, an investigation with enough weight to warrant a durable home. Quests live in the guild's books (Clerk's `writs` table). Quests are never dispatched to a rig — they're kept for thinking, not for execution. They are Coco's primary mechanism for session continuity.

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

## Body template

Quest writs use a structured markdown body with six sections:

```markdown
## Goal

<One paragraph. What we're trying to figure out, decide, or build.
Frame the outcome, not the question that started the inquiry.
If the original framing matters, include it as "Originally asked as: ..."
but the primary content should be the desired outcome.>

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

Use the standard commission path; Spider will not dispatch it because `quest` isn't mapped to a rig template:

    nsg commission-post \
      --type quest \
      --title "<short, descriptive title>" \
      --body "$(cat <<'EOF'
    ## Goal

    <the outcome we want>

    ## Status

    active — just opened

    ## Next Steps

    <what the next session should do>

    ## Context

    <what we already know going in, if anything>

    ## References

    - <file paths, related writs, links>

    ## Notes

    - <date>: opened
    EOF
    )"

Capture the returned writ ID — you'll use it to update or link the quest later.

## Sub-quests

When a quest spawns a distinct sub-inquiry worth tracking on its own, open a child quest with `--parent-id <quest-id>`. Keep sub-quests for genuinely separable threads; don't fragment a single line of thought.

## Updating a quest

As the conversation evolves, keep the quest current:

    nsg writ edit --id <quest-id> --body "<updated body>"

The Clerk allows body edits in any status. On every update:

1. **Status** reflects the current state (one line).
2. **Next Steps** is refreshed — never leave a stale "do X" when X has already been done.
3. **Context** absorbs anything new that's been learned.
4. **References** grows with any new pointers.
5. **Notes** gets drained (useful bits → Context; rest cleared or left).

**Goal** should rarely change. If the goal has genuinely shifted, consider whether this is still the same quest or a new one.

## Resuming a quest

When Sean references a topic or you recognize the conversation is continuing prior work:

    nsg writ show <quest-id>          # full body
    nsg writ list --parent-id <id>    # sub-quests
    nsg writ link --list <quest-id>   # related writs (if supported) — otherwise inspect writ show output

Read in order: **Goal → Status → Next Steps**. That's the three-section operational triple and should orient you in under 10 seconds. Drop into **Context** only if you need the fuller picture; **References** and **Notes** are for when you're actively working the quest.

## Concluding a quest

When the inquiry is resolved, concluded, or superseded:

    nsg writ complete <quest-id>      # resolved
    nsg writ cancel <quest-id>        # abandoned / no longer relevant
    nsg writ fail <quest-id>          # dead end with lessons worth preserving

Before closing, update **Status** to reflect the resolution and rewrite **Context** to capture the final picture. Set **Next Steps** to `Concluded — <resolution>` so the closing state is visible at a glance. Future readers (including Astrolabe and other planning agents) should be able to understand the arc from the quest body alone.

If a follow-up quest supersedes this one, use `nsg writ link --type supersedes` to connect them.

## Quests and session continuity

Quests provide continuity across sessions. The flow is:

- **Startup** — scan open quest titles with `nsg writ list --type quest --status ready,active,waiting`; load bodies on demand.
- **During the session** — open new quests for substantial inquiries; update existing ones as thinking evolves. Keep Notes as a running scratchpad.
- **Wrap-up** — for any quest touched this session: drain Notes into Context, refresh Status, refresh Next Steps. The next session should be able to resume cold by reading Goal / Status / Next Steps without needing the transcript.

Quests are visible to other agents via the Clerk — notably Astrolabe, which may eventually use them as planning inputs. Write quest bodies assuming an autonomous planning agent may read them.
