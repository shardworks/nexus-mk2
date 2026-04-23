# Astrolabe structured observations and draft-writ emission

## Intent

Promote Astrolabe's `PlanDoc.observations` from free-form prose to a structured array, and teach the planning rig to emit one draft writ per observation. Each generated writ is a regular, commissionable writ in `new` status, parented under the brief the observations came from, and ready to be promoted to `open` by downstream curators (patron or overseer — see `c-moaz1q9b`).

This turns the sage's "things we noticed but didn't action" output from an inert note buried in a plandoc into a proper commissionable draft, visible in the same writ surfaces as any other draft brief.

## Motivation

Today the `observations` field on a `PlanDoc` is a `string` blob of prose. The sage records real, specific signal there — refactoring opportunities, doc drift, latent bugs, follow-up commissions — but nothing downstream consumes it. A scan of recent plandocs showed observations are already written at mini-brief quality: they name specific files and symbols, identify the work, and note preconditions. What's missing is a mechanism to turn each observation into a commissionable draft without the patron re-authoring them by hand.

Making observations into `new`-status writs gives them a standard lifecycle: patron/overseer promotes to `open`, cancels with reason, or leaves in `new` indefinitely. No new substrate is required — the writ lifecycle already expresses all of this.

Design decisions informing this work trace to `c-moaz1pdw` (this commission's design click) and `c-moaj06ty` (overseer pattern parent).

## Non-negotiable decisions

### PlanDoc observations become a structured array

`PlanDoc.observations` changes from a prose string to an array of observation records. Each record carries at minimum a plandoc-local id, a title, and a body.

Shape sketch:

    observations: [
      { id: "obs-1", title: "...", body: "..." },
      { id: "obs-2", title: "...", body: "..." }
    ]

Ids are stable within a plandoc. Cross-plandoc uniqueness is not required.

No status field. No addressedBy. The plandoc is the authoring artifact; the generated writ carries lifecycle.

### Sage-writer update: title per observation, body stays as-is

The sage role responsible for emitting `PlanDoc.observations` gets its role instructions updated to emit the structured shape. Each observation becomes one record with a short title and a body.

Body content does not require a register change. Today's observations already name specific files, line numbers, symbols, and preconditions — that tactical level of detail is preserved verbatim in the body. The instruction change is: split what's currently one prose blob into one-record-per-concern, and give each a one-line title.

What counts as "one observation" is the sage's judgment — the atomicity guidance stays the same as current practice (one concern per bullet). The structural change is packaging, not substance.

### Post-planning step creates one writ per observation

After the spec-writer completes and the plandoc reaches its final state, a new post-planning step walks `plandoc.observations` and creates one writ per observation.

- **Writ type**: `brief`. Matches the current combined planning+implementation rig mapping. Parallel click `c-moaz1sot` may later collapse `brief` into `mandate`; when that lands, this commission's generated writs get migrated alongside everything else as part of that work — not this one.
- **Writ status**: `new`. Not dispatched; awaiting promotion.
- **Writ title**: `observation.title`.
- **Writ body**: `observation.body` verbatim.
- **Parent**: the brief writ the plandoc was planning. The generated writ is a child of that writ in the Clerk's tree.

No special link types, no new writ types, no cross-substrate bookkeeping. The generated writ is a regular draft writ that happens to have been authored by a sage rather than a patron.

### No dependency on any other plugin

This work touches only Astrolabe. Clerk is already a hard dependency. No Ratchet interaction, no new link types, no new kit contributions.

## Out of scope

- **Observation dedup of any kind.** No dedup key generation, no sibling/tree scan, no consultation of cancelled writs for prior-decline signal. Duplicates will accumulate; they are acceptable at MVP and will be measured post-hoc from existing data. Do not invent a dedup layer in this commission.
- **Brief-register rewriting of observation bodies.** The sage does not reshape observation content into a formal brief structure. Today's body style is preserved. The only content change is "one record per concern" and the title.
- **Observation lifecycle tracking beyond standard writ lifecycle.** Whether a generated writ is promoted, cancelled, or ignored is visible through its own status. No separate observation-status field anywhere.
- **The overseer consumer.** Designed and shipped separately under `c-moaz1q9b`. This commission delivers the *input* the overseer will consume; it does not deliver the overseer. Patron can also promote drafts by hand; overseer is a convenience, not a prerequisite.
- **Schema evolution for existing plandocs.** If any existing plandocs carry the old string shape, they're left alone — the structured shape applies to new plandocs only. No migration pass.
- **Post-planning step as a general extension point.** This is a specific step for observation-lifting. Whether Astrolabe should have a general post-planning plugin-hook surface is a separate design concern and not in scope.
- **The `brief`/`mandate` consolidation question.** Tracked under `c-moaz1sot` and handled there. This commission hardcodes `brief` for the generated writ type.

## Behavioral cases the design depends on

- A plandoc with three observations produces three writs after the post-planning step, each in `new` status, each parented under the original brief writ, each carrying its observation's title and body.
- A plandoc with zero observations (empty array or missing field) produces no writs and no errors.
- The generated writ's type is `brief`. Post-`c-moaz1sot`, this value updates in lockstep with the rest of the codebase.
- A plandoc with the old string-shaped `observations` field is not processed by the new step (no lift, no error). The step only recognizes the structured array shape.
- Promoting one of the generated writs through the normal `new → open` transition triggers Spider dispatch via the same machinery that handles any other draft writ.
- Cancelling one of the generated writs terminates it with no side effects on the source plandoc — the observation record in the plandoc remains unchanged.

## References

- `c-moaz1pdw` — this commission's design click
- `c-moaj06ty` — overseer pattern design parent
- `c-moaz1q9b` — sibling commission: MVP Overseer (consumer)
- `c-moaz1r58` — sibling click: post-hoc duplication measurement methodology
- `c-moaz1sot` — adjacent click: `brief` writ type removal. This commission hardcodes `brief`; the removal commission updates it in lockstep.
- `c-moa42fn6` — Stage 3 umbrella: Self-commissioning