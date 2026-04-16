## Intent

Design a first-class attachment primitive in the stacks-db substrate that lets clicks (and potentially other records) carry rich content beyond their lean core schema — specifically the material that doesn't fit `goal + conclusion` on a click: design sketches, open-question enumerations, evidence snippets, extended rationale, and reference material.

Design-only commission. The output is a spec document that an implementation commission can pick up. No code changes in this commission.

## Motivation

The click model is intentionally atomic: one question, one answer, minimal metadata. This keeps clicks queryable and composable as a decision graph. But real design work generates rich surrounding material (YAML sketches, validated-against examples, discarded-idea detail, cross-links to prior sessions) that doesn't fit an atom.

Currently this material lives either on the filesystem (`.scratch/`, `docs/design-notes/`) where it drifts and isn't queryable, or in archived writ bodies (`docs/archive/quests/`) where it's orphaned from the click graph that replaced it. Neither home is durable.

The attachment primitive's job is to give this content a stacks-resident home so it inherits the same substrate properties as clicks and writs: versioning, CDC propagation, queryability, and concrete entity identity.

## Key questions the design must answer

- **Lifecycle.** Immutable once created? Editable in place? Versioned with history? How does lifecycle interact with the record they're attached to (what happens to attachments when a click concludes or a writ closes)?
- **Identity and addressing.** Standalone-addressable (own ID), or only reachable via parent record?
- **Linking model.** One-to-one (attachment belongs to one record), many-to-many (attachment referenced by multiple), or typed relationships? What link types make sense?
- **Host records.** Which record types can have attachments? Clicks and writs at minimum — design should accommodate extension to sessions, commissions, others.
- **Content format.** Markdown? Opaque blob with content-type? Structured sections with known fields? The tradeoff is rendering/search complexity vs. flexibility.
- **Size bounds.** Stacks-db is not a filesystem. A design implying multi-megabyte blobs needs to justify that; a design capping at e.g. 64KB needs to say what falls out of scope.
- **Query surface.** What queries must be fast? Candidates: "all attachments for a click," "recently updated," "containing text X," "by author/session." Does search require a dedicated index?
- **CDC propagation.** When an attachment is created/updated/deleted, what events fire? Does it propagate to Oculus the same way click/writ changes do?
- **Migration path.** Several archived quest bodies contain exactly the kind of content attachments would serve (e.g., `docs/archive/quests/w-mo0v636y-41c8aeff857f.json`). How would historical content land in the attachment model? Implementation is out of scope, but the design should identify what migration would entail.

## Constraints

- Must not bloat the core click/writ schema. Attachments are a **sibling** concept, not an extension of existing records.
- Must reuse existing CDC and Oculus infrastructure. No parallel event streams.
- Must be implementable by an autonomous commission without further design-level decisions. Tier 4 decisions (value-laden) can surface for ratification; Tier 1-3 decisions should be made with stated defaults.

## Out of scope

- Implementing the design. Follow-on implementation commission will be dispatched after review.
- Migrating archived quest bodies. The design describes the path; execution is separate work.
- Attachments on session records, ethnography artifacts, or other substrates — mention as extension points but focus on clicks and writs.

## Acceptance signal

- A design document that answers each key question above with a concrete proposal and rationale.
- A worked example: the archived quest body `docs/archive/quests/w-mo0v636y-41c8aeff857f.json` expressed as one or more attachments under click `c-mo1mq93f-a8d85ce47baf`, showing what migration would look like.
- An acceptance-test outline: what scenarios exercise the attachment lifecycle end-to-end.

## Context & references

- Tracking click: `c-mo1uudrr-31227f89d49c`
- Related click (backfill case study that motivated this work): `c-mo1uucfo-85bb90ad6357`
- Current ClickDoc schema: `/workspace/nexus/packages/plugins/ratchet/src/types.ts`
- Example of residual content that motivates this work: `/workspace/nexus-mk2/docs/archive/quests/w-mo0v636y-41c8aeff857f.json`