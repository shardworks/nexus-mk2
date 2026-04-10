## Goal

Decide whether Nexus needs additional work-tracking primitives beyond the current writ+quest substrate — specifically, whether some of the shapes GSD distinguishes (backlog items, seeds with trigger conditions, persistent context threads) warrant their own writ types, or whether they can be expressed as subtypes/status conventions on existing primitives. The outcome is (a) a taxonomy of the "parked work" shapes we actually need to distinguish, (b) a decision on which of those shapes get their own writ type vs. which are conventions on existing types, (c) for any new types, a sketch of the type-specific fields and the lifecycle, and (d) particularly for the "seeds" pattern — a concrete design for semantic trigger conditions that surface parked writs automatically when a matching event occurs.

## Status

parked — design question, not yet blocking anything

## Next Steps

Next session: (1) write a one-paragraph definition of each shape GSD distinguishes (backlog, seed, thread) and check whether Nexus already has something that plays the same role; (2) work through the current inventory — `docs/future/`, `.scratch/todo/`, quest writs, uncommitted ideas in agent chats — and ask "which shape does each of these actually want to be?"; (3) decide whether to introduce new writ types or stick with the current minimalism; (4) if seeds make the cut, design the trigger mechanism — Clockworks watches for events matching the trigger predicate and fires the seed writ to `ready` — and figure out where the predicate lives (JSON expression? a writ-scoped standing order? a new book?).

## Context

GSD distinguishes three "parked work" shapes that Nexus currently doesn't separate:

- **Backlog items** — inert ideas we might do. GSD numbers them `999.x` so they stay outside the active phase sequence. Reviewable and promotable when ready. Nexus analogue: `docs/future/`, random unimplemented ideas in agent chats, informal mental list.

- **Seeds** — forward-looking ideas with explicit **trigger conditions** that fire when a matching milestone or event arrives. Not just "we might do this later" but "we should do this when X happens." GSD stores them in `.planning/seeds/` and scans them whenever a new milestone starts. Nexus has nothing analogous; our backlog is inert.

- **Threads** — persistent context stores for cross-session work that doesn't fit the phase structure. Lightweight, append-only, lifecycle-free. Nexus analogue: **quests** (which we just built this session). The shapes are essentially the same — Goal, Status, Context, Next Steps, References, Notes.

So Nexus already has thread-equivalent (quests) and a loose backlog-equivalent (docs/future). We're missing seeds — the parked-with-trigger shape. The questions are:

1. Do we actually need the distinction? It's tempting to just use quest writs with a Status of "parked — revisit when X." But the manual "revisit" step is exactly what seeds automate.

2. What does a trigger predicate look like in our substrate? Options: a string field Clockworks scans for matching events; a standing order that fires when its condition is met and transitions the writ from `parked` to `ready`; a new predicate DSL that's more expressive than simple event matching. The simplest viable thing is probably a list of event names that the standing-orders system already understands.

3. Where does backlog-proper fit in? `docs/future/` is fine for human-browsable ideas, but it's outside the writ substrate. Should ideas graduate to writs the moment they become actionable? Or does a "backlog writ type" make sense — same lifecycle as mandate but with a convention that it's not picked up until promoted?

4. If we DO add new writ types, do we update the guild metaphor doc? Each new type needs a name that fits the register — "seed" might work as-is; "backlog" doesn't fit the medieval-guild vocabulary.

One tempting collapse: **quest + parked + trigger = seed**. A quest writ that's in `waiting` status with a `trigger` field is functionally a seed. That means we don't need a new type; we just need a trigger mechanism and a status convention. Worth exploring whether that collapse holds up.

## References

- GSD user guide § Backlog & Threads: `.scratch/gsd-research/USER-GUIDE.md:262-306`
- Nexus quest skill (the thread equivalent): `.claude/skills/quests/SKILL.md`
- Nexus backlog equivalent: `docs/future/`
- Clockworks standing orders (potential trigger mechanism): `/workspace/nexus/docs/architecture/apparatus/clerk.md` and the clockworks event stream
- Guild metaphor doc (for any new type naming): `/workspace/nexus/docs/guild-metaphor.md`

## Notes

- 2026-04-10: opened after GSD research pass. The seed concept (parked-with-trigger) is the one that most clearly fills a gap in our current model. Quest writs already do thread-equivalent work well.