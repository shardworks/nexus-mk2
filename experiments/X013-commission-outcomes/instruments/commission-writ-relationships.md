# Writ Relationships

Add typed directional relationships between writs to the data model and surface them through tooling and the guild-monitor.

## Motivation

The primary driver is tracking revision work: when a commission is dispatched to fix or redo a prior commission, that relationship should be recorded structurally rather than inferred from notes. This enables computing revision rate from the writ graph rather than from manual annotations in the commission log.

Secondary use: general dependency and blocking relationships between writs, which will be useful as the system matures.

## Scope

- Add a `relationships` field to the writ data model: a list of typed, directed edges from the source writ to a target writ
- Implement a `link-writ` tool: `link-writ <sourceId> <targetId> --type <type>`
- Relationship types: `revises`, `depends-on`. `revises` is the required type for X013
- Fire a `writ.linked` event when a relationship is created
- Show relationships in `show-writ` output
- Surface inbound `revises` relationships in guild-monitor writ detail view (i.e., "this writ has been revised by [writ X]")

## Key Decisions for the Artificer

- Relationships are directed: the source writ "revises" (or blocks, depends-on) the target writ. The inverse (target "is-revised-by" source) is a query, not a separate stored relationship.
- Relationships may be created after both writs exist, in any state.
- No constraint on relationship validity (don't enforce that only completed writs can be revised — the patron may link them at any point).
- A writ may have multiple relationships.

## Acceptance Criteria

- `link-writ <sourceId> <targetId> --type revises` creates a relationship and fires `writ.linked`
- `show-writ <id>` displays outbound relationships for that writ
- Guild-monitor writ detail shows inbound `revises` relationships (i.e., "revised by")
- The relationship persists across sessions and is readable by other tools/queries
