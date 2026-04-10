_Imported from `.scratch/todo/multi-rig-architectural-exploration.md` § "The Brief→Mandate Collapse" (2026-04-10)._

## Opened With

The current Astrolabe flow is `brief → Astrolabe rig → mandate (via refines link) → execution rig`. Two writs, two rigs, linked. This fragmentation is a **1:1 artifact** — it exists because one writ can only host one rig, so refining an underspecified ask into a concrete spec requires a separate writ to host the planning rig.

Under multi-rig, the brief and mandate shouldn't be separate writs — they're the same obligation at two levels of refinement. The correct shape:

```
mandate (one writ)
  ├── rig_1: astrolabe (planning)    → produces PlanDoc
  └── rig_2: execution               → reads PlanDoc + writ.body
```

The PlanDoc is a work artifact of the planning rig, living in the workspace layer. The `writ.body` stays as the patron's original ask. The execution rig reads both.

**Planning rig outcomes** (three-way branch):

1. **Refined** — PlanDoc attached; same writ continues to an execution rig.
2. **Decomposed** — Child writs created; parent becomes a container; wait for child rollup.
3. **Rejected** — Planning determined the ask can't be fulfilled; writ enters `stuck` for patron revision.

The Fabricator reads planning rig yields to decide what rig to spawn next.

**The `brief` writ type probably goes away.** It was doing two jobs: signalling "needs planning" and serving as a pre-commitment artifact. Both are handled under the new model by `new` status + Fabricator-driven rig selection.

**Deeper insight:** the 1:1 model isn't just limiting recovery — it's actively **distorting the shape of planning itself**. The `brief → mandate` split exists because 1:1 forced it, not because the underlying obligations are actually two things. Multi-rig restores the natural 1:1 between "what the patron asked for" and "the writ that tracks it."

## Summary

Parked pending multi-rig. But this quest matters *now* because Astrolabe is in active design — decisions about the PlanDoc shape, the spec-writer output, task decomposition, and the implementation-rig contract will either survive the transition cleanly or create migration pain.

**Favored approach:** finish Astrolabe on 1:1 with the PlanDoc designed to survive the transition; swap the output mechanism (new writ vs attached doc) when multi-rig lands. The PlanDoc shape is the hardest part and doesn't change between models. The writ-topology delta (two writs → one) is a smaller change than the schema delta would be.

**Open:**
- What specifically in the Astrolabe design today will carry over cleanly, and what will need to change? Worth enumerating before committing code.
- Does the existing `refines` link type survive under multi-rig, or does it disappear along with the `brief` type?
- How does this interact with the task decomposition proposal (see the Astrolabe task-decomposition quest)? Tasks are generated *by* the planning rig; if the planning rig is now a phase of the mandate rather than its own writ, does the task schema live on the mandate writ or on the PlanDoc?
- Migration path for in-flight briefs when multi-rig ships — do they stay as briefs forever, get absorbed into their refined mandates, or need a conversion pass?

## Notes

- **Cross-link:** this quest is the tightest interleaving of T2 and T3 (Astrolabe). The decisions made in the Astrolabe task-decomposition proposal should be read with this quest's observation in mind: *don't design for the brief/mandate split as if it's permanent; design for the collapse.*
- The three-way planning rig outcome (refined / decomposed / rejected) maps cleanly onto the existing Astrolabe plan-writer decision points. Worth preserving that structure in the planning rig's yield schema.