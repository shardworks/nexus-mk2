## Opened With

"Quest" was the working name when the writ-substrate design shipped, and it's been rubbing wrong since. The word carries heroic-journey connotations — epic, long, destiny-laden — that overshoot what the thing actually is. What we have is closer to a **parked thought** or a **working note**: a place to put a line of inquiry down so it doesn't get lost between sessions. Most entries are mundane. Calling them "quests" makes every stray thought sound like it's going on an odyssey.

The guild metaphor has room for a better word. The candidates Sean is leaning toward all share a lightweight, provisional flavor:

- **Sketch** — a draft-quality capture. Evokes the artist's notebook: quick lines, unfinished, meant to be worked up later. Pairs naturally with "finished" artifacts elsewhere in the system.
- **Jotting** — a brief, informal written note. Emphasizes the *act* of jotting something down before it escapes.
- **Scribble** — the most casual of the three. Slightly self-deprecating, honest about the provisional quality. Might undersell the ones that do grow into substantial inquiries.

The criteria for a good name:

- Matches the lightweight, "working note" feel of most entries.
- Doesn't overpromise on structure or seriousness.
- Fits the guild vocabulary (horological / craftwork / scholarly register).
- Works as a verb: "let me sketch this out", "jot that down", "scribble a note".
- Survives pluralization and composition: `sketches` directory, `nsg sketch list`, "the decisions sketch".

## Summary

Newly opened. Exploring `sketch`, `jotting`, `scribble` as the top candidates; the decision will ripple through:

- The writ type name (`quest` → chosen word)
- `.claude/skills/quests/` → renamed skill directory
- Coco's startup/wrap-up agent instructions
- The guild metaphor doc (if it mentions the concept)
- Any quest-related CLI help text in `nsg`

Rename cost is non-trivial but bounded — it's a fresh mechanism with no external dependencies. Better to pick the right word now than live with the wrong one.

**Open:**
- Which of `sketch` / `jotting` / `scribble` fits best? Or is there a better fourth option?
- How does the chosen word feel as a verb vs. a noun? (Coco will use both in instructions: "I'll sketch that" / "the sketch on decisions".)
- Does any candidate collide with existing vocabulary in the framework or guild metaphor docs?
- Is there a "workbook / atelier" flavored alternative worth considering? (Leaf, marginalia, notation, musing, inkling…)

## Notes

- Coco's informal lean on first read: **sketch**. Closest to the "draft-quality, meant to be developed" semantics; works cleanly as noun and verb; pairs with the guild's craft register (sketches in the workshop, worked up into something more).
- **Jotting** is a near-second — punchier, more casual, more accurate for the 80% of entries that never grow beyond a paragraph. Slightly awkward as a verb in instructions ("I'll jot this" feels fine, "jotting-list" feels less so).
- **Scribble** is most honest about provisionality but risks self-deprecating the mechanism into irrelevance. Might read as dismissive when an autonomous planning agent consumes them.
- Worth checking: does the framework or the metaphor doc already use any of these words in a different sense?