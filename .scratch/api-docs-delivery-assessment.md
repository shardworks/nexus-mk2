# Phase 4: API Documentation Delivery Assessment

## Document Inventory

| Document | Lines | Purpose | Primary Audience |
|----------|-------|---------|------------------|
| `docs/reference/core-api.md` | 753 | Function-by-function API reference | Toolsmiths, engine builders, dashboard builders |
| `docs/reference/event-catalog.md` | 278 | Events, standing orders, wiring patterns | Engine builders, stewards |
| `docs/reference/schema.md` | 427 | DB schema, status lifecycles, ER diagram | Dashboard builders, toolsmiths |
| `docs/guides/building-engines.md` | 366 | Practical engine authoring guide | Engine builders |
| `docs/guides/building-tools.md` | 306 | Practical tool authoring guide | Toolsmiths |
| **Total** | **2,130** | | |

## Analysis

### Size Assessment

2,130 lines is too large to inject wholesale into any anima's system prompt. Even the smallest single doc (event catalog at 278 lines) is substantial. The full reference suite would consume a significant portion of any model's context window before the anima even starts working.

However, the docs are strongly **segmented by use case**:

- A **dashboard builder** needs: core-api (Daybook + Ledger sections), schema reference. ~600 lines.
- An **engine builder** needs: building-engines guide, event catalog, core-api (Events + Ledger sections). ~800 lines.
- A **toolsmith** needs: building-tools guide, core-api (Authoring + Infrastructure sections). ~500 lines.
- A **steward** doing oversight needs: event catalog, core-api (Daybook section). ~400 lines.

No single anima needs all 2,130 lines.

### Delivery Options Evaluated

#### 1. Role Instructions

**Mechanism:** Add the relevant subset of docs to a role's `instructions` markdown file. Delivered at manifest time, injected into the system prompt.

**Pros:** Always available, no tool calls needed, works from any workspace.
**Cons:** 400-800 lines of reference material in the system prompt is heavy. Role instructions should be operational guidance ("here's how to do your job"), not encyclopedic reference. Mixing the two dilutes both.

**Verdict:** Suitable for a *concise summary* (50-100 lines pointing to key functions), not the full reference.

#### 2. Curriculum

**Mechanism:** Package the reference as training content, delivered at instantiation time and frozen into the anima's composition snapshot.

**Pros:** Always available, frozen to a known version.
**Cons:** One curriculum per anima (current limitation). The API docs would compete with domain-specific training. Curricula are for *training* (how things work conceptually), not *reference* (exact signatures). Also, docs are still evolving — freezing them at instantiation time means stale snapshots.

**Verdict:** Not a good fit. Curricula serve a different purpose.

#### 3. Tool Instructions

**Mechanism:** Attach relevant doc sections to specific MCP tools. E.g., the `job-check` tool ships with the hierarchy rollup docs.

**Pros:** Scoped — docs arrive only when the tool is available. Doesn't bloat the base system prompt.
**Cons:** Fragmented — an anima building a dashboard needs a coherent view of the API, not tool-specific snippets. Hard to maintain — changes to the reference docs would need to be mirrored across multiple tool instruction files.

**Verdict:** Good for tool-specific operational guidance (which already exists), but not for delivering the API reference.

#### 4. Reference Tool

**Mechanism:** An MCP tool that queries docs on demand: `api-reference lookup "listSessions"` or `api-reference section "Ledger"`.

**Pros:** Docs stay out of context until needed. Always reads from the latest version on disk. Scales — can serve any anima regardless of role. Minimal system prompt overhead (just the tool's own instruction explaining how to use it).
**Cons:** Requires building a tool. Anima must know to query it (requires instruction). Adds latency — tool call round-trip for each lookup.

**Verdict:** Best standalone option for the full reference. The docs live in the guildhall and are always current.

#### 5. Hybrid: Concise Role Instructions + Reference Tool

**Mechanism:** Role instructions include a brief "API cheat sheet" (key functions, import patterns, "for full details use the api-reference tool"). The reference tool provides deep dives on demand.

**Pros:** Animas have enough context to start working immediately (the cheat sheet), with full reference available when they need exact signatures or edge cases. Keeps the system prompt lean. Docs evolve independently from role instructions.
**Cons:** Two things to maintain (cheat sheet + full docs). But the cheat sheet is stable (function names don't change often) while the full docs can evolve freely.

**Verdict:** This is the recommended approach.

## Recommendation

**Hybrid: concise role instructions + reference tool.**

### Implementation Steps

1. **Build `api-reference` tool** — a simple lookup tool that reads from `docs/reference/` and `docs/guides/`. Supports section-level and keyword lookup. Registered for roles that need it (steward, artificer, and any future toolsmith/sage roles).

2. **Add API cheat sheets to role instructions** — for each role, a ~50 line section listing the key functions they'll use most, import examples, and the instruction "use the `api-reference` tool for full signatures and details."

3. **No curriculum or tool-instruction changes needed** — existing tool instructions continue to serve their purpose (operational guidance for specific tools). The API reference serves a different need.

### Estimated Scope

| Step | Complexity | Notes |
|------|-----------|-------|
| `api-reference` tool | Low-medium | Read files from disk, basic search/section extraction. No DB access needed. |
| Role instruction updates | Low | ~50 lines per role, 2-3 roles. |

This could be a single commission for an artificer.

### Why Not Just Role Instructions?

The API reference is 2,130 lines and growing. Even segmented by role, that's 400-800 lines of reference material per anima session. This is reference material — not operational guidance. It needs to be available on demand, not consuming context space for the entire session.

The hybrid approach gives animas the "80% case" knowledge in their system prompt (the cheat sheet) and the "20% deep dive" via the reference tool. This matches how human developers work: you memorize the common patterns and look up the details when you need them.
