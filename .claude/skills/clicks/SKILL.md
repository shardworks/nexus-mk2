---
description: Work with clicks — Coco's session-continuity mechanism. Invoke when opening, updating, resuming, or concluding a line of inquiry that should outlive the current session.
---

# Clicks — Session-Continuity Workflow

> NOTE: The environment should have a properly defined `GUILD_ROOT` allowing the `nsg` command to be used without `--guild-root`. If this is not the case, the guild root (at `/workspace/vibers`) can be appended to commands as needed.

A **click** is an atomic decision-node managed by the Ratchet apparatus. Each click captures one question or inquiry; when resolved, it records the conclusion. Clicks are organized in a tree — children are sub-questions of their parent. Together, the click tree forms a structured record of the reasoning and decisions that guide the guild's work.

Clicks are Coco's primary mechanism for session continuity, replacing the earlier quest writ type. Key differences from quests:

- **Goal is immutable.** Set at creation, never changes. If the framing is wrong, drop and create a new one.
- **Conclusion is write-once.** Set by `conclude` or `drop`, then frozen.
- **No body files.** Click goals are short (one sentence). Long-form exploration lives in session transcripts, joinable via session ID.
- **The tree is the product.** Value lives in structure (hierarchy, decomposition), not prose. Children are the todo list.
- **Four statuses:** `live | parked | concluded | dropped`. Simple, designed for inquiry.

## When to open a click

Open a click when a conversation or line of thought has enough substance to outlive the current session. Heuristics:

- Sean is exploring a design question across multiple turns
- You've tabled something with "let's come back to this"
- A decision is deferred pending more thought
- A line of inquiry has its own arc — opening question, accumulating sub-questions, eventual conclusion

Don't open a click for every exchange. One-off questions, quick clarifications, and routine operational work don't need one.

## Creating a click

    nsg click create --goal "How should we handle X?" [--parent-id <id>]

- The `--goal` is the question or inquiry — frame it as a question when possible.
- Use `--parent-id` to nest under an existing click (sub-question decomposition).
- The click starts in `live` status.
- Record the returned ID in the chat transcript so Sean can reference it later.

### Vocabulary discovery habit

When opening any new click, scan `docs/future/guild-vocabulary.md` for related terms and consider creating cross-links. The vocabulary tome holds latent metaphor concepts that imply future features; the only mechanism that surfaces them at the right moment is this manual habit.

## Viewing clicks

Two commands do the orientation work. Reach for them in this order:

**1. Tree view** — board-level scan, the first thing you run at startup:

    nsg click tree [--root-id <id>] [--status live] [--depth N]

Renders the click forest with box-drawing connectors and status indicators:
```
● How should the quest system evolve?                    [live]
  ├── ○ Is the friction removable or structural?         [concluded]
  ├── ● What should we call these things?                [live]
  └── ◇ Do quests need an event-log layer?               [parked]
```
Status indicators: `●` live, `◇` parked, `○` concluded, `✕` dropped.

**2. Extract a subtree** — the primary narrative-loading command, used whenever the conversation turns toward a specific area:

    nsg click extract --id <id> [--format md|json]

One call loads the whole subtree — goals, statuses, and conclusions for any concluded/dropped clicks — as a structured document. This is how you orient on any line of inquiry.

**Don't do this:** don't walk a subtree by calling `show` on each child to reconstruct the narrative. That's what `extract` is for. If you find yourself running `show` three or more times in a row to understand the shape of an area, stop and run `extract` on the common ancestor instead.

**Show a single click** — use only for single-click inspection (checking one click's links, parent, status, or conclusion):

    nsg click show <id>

**List with filters:**

    nsg click list [--status live] [--status parked] [--limit 50]

## Status transitions

```
live ──> parked       (park — deliberately dormant, pick up later)
parked ──> live       (resume — back to active exploration)
live ──> concluded    (conclude — decision reached, conclusion required)
live ──> dropped      (drop — abandoned, reason required)
parked ──> concluded  (conclude directly from parked)
parked ──> dropped    (drop directly from parked)
```

Terminal states (concluded, dropped) are immutable — no further changes allowed.

**Park** a click (live -> parked):

    nsg click park --id <id>

**Resume** a parked click (parked -> live):

    nsg click resume --id <id>

**Conclude** a click with a decision:

    nsg click conclude --id <id> --conclusion "We decided to..."

**Drop** a click without a decision:

    nsg click drop --id <id> --conclusion "Moot because..."

## Sub-questions (children)

When a click spawns distinct sub-inquiries, create child clicks:

    nsg click create --goal "Sub-question A?" --parent-id <parent-id>

Children are the decomposition mechanism. Resolving a parent typically means resolving or dropping its children. But there's no automatic cascading — a parent can be concluded while children are still live (e.g., "we answered the main question; remaining sub-questions are moot").

## Links

Typed links connect clicks to each other or to writs (cross-substrate):

    nsg click link --source-id <click-id> --target-id <target-id> --link-type <type>

Link types:
- `related` — lateral cross-reference
- `commissioned` — this click's conclusion produced a commission (target is a writ ID)
- `supersedes` — this click replaces the target
- `depends-on` — this click can't be concluded until the target is resolved

**Commissioned links are automatic.** When a click's conclusion spawns a writ (brief posted, commission dispatched), create the `commissioned` link from the click to the writ id without asking. This preserves the click-to-artifact trail in the tree and is cheap to maintain. If multiple clicks contribute to one commission, link the narrowest conclusion-bearing click; add additional links from contributing parents only if the trail would be lossy otherwise.

Remove a link:

    nsg click unlink --source-id <id> --target-id <id> --link-type <type>

## Reparenting

Move a click to a new parent or to root:

    nsg click reparent --id <id> --parent-id <new-parent-id>
    nsg click reparent --id <id>                               # move to root

Circular parentage is detected and rejected.

## Short ID support

All ID parameters accept short prefixes (e.g., `c-mo1ee` instead of the full ID). The Ratchet resolves prefixes and errors on ambiguity.

## Clicks and session continuity

Clicks provide continuity across sessions. The flow is:

- **Startup** — scan the click tree with `nsg click tree --status live --status parked` to see what's in flight. When the conversation turns toward a specific area, use `nsg click extract --id <id>` to load the full subtree as narrative context. Reserve `nsg click show <id>` for single-click inspection. Don't eagerly read every click.
- **During the session** — open new clicks for substantial inquiries; create child clicks for sub-questions. Conclude or drop clicks as decisions are reached.
- **Wrap-up** — park any live clicks that won't be continued immediately. Conclude clicks where decisions were reached this session. The click tree itself is the session's durable record of what was explored and decided.

Because click goals are immutable and conclusions are write-once, there's no body to maintain or keep in sync. The session transcript (joinable via session ID) holds the full exploration context. Clicks are just the structural skeleton — questions asked and answers given.
