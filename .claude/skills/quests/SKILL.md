---
description: Work with quest writs — Coco's session-continuity mechanism. Invoke when opening, updating, resuming, or concluding a line of inquiry that should outlive the current session.
disable-model-invocation: true
---

# Quests — Session-Continuity Workflow

> NOTE: The environment should have a properly defined `GUILD_ROOT` allowing the `nsg` command to be used without `--guild-root`. If this is not the case, the guild root (at `/workspace/vibers`) can be appended to commands as needed.

A **quest** is a writ type that tracks a live area of inquiry — a question Sean is working through, a design conversation worth keeping, an investigation with enough weight to warrant a durable home. Quests live in the guild's books (Clerk's `writs` table). Quests are never dispatched to a rig — they're kept for thinking, not for execution. They are Coco's primary mechanism for session continuity.

## When to open a quest

Open a quest when a conversation or line of thought has enough substance to outlive the current session. Heuristics:

- Sean is exploring a design question across multiple turns
- You've tabled something with "let's come back to this"
- A decision is deferred pending more thought
- A line of inquiry has its own arc — opening question, accumulating notes, eventual conclusion

Don't open a quest for every exchange. One-off questions, quick clarifications, and routine operational work don't need one.

## Body template

Quest writs use a structured markdown body:

```markdown
## Opened With

<The question, framing, or prompt that started this quest. Preserved verbatim — don't edit once set.>

## Summary

<A rolling synthesis of where the inquiry stands. Update this as thinking evolves. This is the "resume here" section — if a future session only reads one thing, it reads this.>

## Notes

<Chronological log of observations, partial ideas, links to other writs, quotes from Sean, dead ends. Append-only.>
```

## Opening a quest

Use the standard commission path; Spider will not dispatch it because `quest` isn't mapped to a rig template:

    nsg commission-post \
      --type quest \
      --title "<short, descriptive title>" \
      --body "$(cat <<'EOF'
    ## Opened With

    <the framing>

    ## Summary

    <initial shape of the inquiry>

    ## Notes

    - <date>: opened
    EOF
    )"

Capture the returned writ ID — you'll use it to update or link the quest later.

## Sub-questions

When a quest spawns a distinct sub-inquiry worth tracking on its own, open a child quest with `--parent-id <quest-id>`. Keep sub-questions for genuinely separable threads; don't fragment a single line of thought.

## Updating a quest

As the conversation evolves, keep the quest current:

    nsg writ edit <quest-id> --body "<updated body>"

The Clerk allows body edits in any status. Update the **Summary** section to reflect current thinking, and append to **Notes** rather than rewriting history. Don't touch **Opened With** — it's the anchor.

## Resuming a quest

When Sean references a topic or you recognize the conversation is continuing prior work:

    nsg writ show <quest-id>          # full body
    nsg writ list --parent-id <id>    # sub-quests
    nsg writ link --list <quest-id>   # related writs (if supported) — otherwise inspect writ show output

Read the **Summary** first. Fall back to **Notes** only if you need chronology.

## Concluding a quest

When the inquiry is resolved, concluded, or superseded:

    nsg writ complete <quest-id>      # resolved
    nsg writ cancel <quest-id>        # abandoned / no longer relevant
    nsg writ fail <quest-id>          # dead end with lessons worth preserving

Before closing, update the **Summary** one last time with the resolution — future readers (including Astrolabe and other planning agents) should be able to understand the arc from the quest body alone. If a follow-up quest supersedes this one, use `nsg writ link --type supersedes` to connect them.

## Quests and session continuity

Quests provide continuity across sessions. The flow is:

- **Startup** — scan open quest titles with `nsg writ-list --type quest --status ready,active,waiting`; load bodies on demand.
- **During the session** — open new quests for substantial inquiries; update existing ones as thinking evolves.
- **Wrap-up** — ensure the **Summary** of any quest you touched this session reflects its current state, so the next session can resume without reading the transcript.

Quests are visible to other agents via the Clerk — notably Astrolabe, which may eventually use them as planning inputs. Write quest bodies assuming an autonomous planning agent may read them.
