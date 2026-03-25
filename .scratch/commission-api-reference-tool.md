# Commission: Build `api-reference` Tool

## Brief

Build an MCP tool called `api-reference` that lets animas look up Nexus framework API documentation on demand. The tool reads from the reference docs in `docs/reference/` and `docs/guides/` and returns relevant sections.

## Context

The guild's API documentation lives in five files totaling ~2,100 lines:

- `docs/reference/core-api.md` — function-by-function reference, organized by domain (Authoring, Events, Register, Ledger, Daybook, Clockworks, Guild Config, Infrastructure)
- `docs/reference/event-catalog.md` — framework events, custom event rules, standing order wiring, cookbook
- `docs/reference/schema.md` — DB schema, status lifecycles, entity relationships, ID conventions
- `docs/guides/building-tools.md` — practical tool authoring guide
- `docs/guides/building-engines.md` — practical engine authoring guide

This is too much to inject into every anima's system prompt. Animas need a way to look up specific sections when they need them.

## Requirements

### The tool

Build a tool using the `tool()` factory from `@shardworks/nexus-core`. The tool should support two modes of lookup:

1. **Section lookup** — return a named section from a specific doc. Sections are defined by markdown headings. Examples:
   - `section: "Ledger"` from `core-api` → returns the full Ledger section (commissions, works, pieces, jobs, strokes)
   - `section: "Status Lifecycles"` from `schema` → returns the status lifecycle diagrams
   - `section: "Standing Order Wiring"` from `event-catalog` → returns the wiring docs

2. **Keyword search** — search across all docs for lines matching a keyword or function name, returning the surrounding context. Examples:
   - `search: "completeJobIfReady"` → returns the function's entry from core-api.md with surrounding context
   - `search: "piece.completed"` → returns matches from event-catalog.md and core-api.md

### Parameters

```
api-reference
  --mode       "section" | "search" (required)
  --query      The section name or search keyword (required)
  --doc        Restrict to a specific doc: "core-api", "event-catalog", "schema",
               "building-tools", "building-engines" (optional, defaults to all)
```

### Behavior

- **Section mode:** Find the heading that best matches `query` (case-insensitive substring match on heading text). Return the full content under that heading, up to the next heading of equal or higher level. If no match, return available section names.
- **Search mode:** Find all lines containing `query` (case-insensitive). Return each match with 5 lines of context above and below. Group results by document. If no matches, say so.
- The tool reads files from `docs/reference/` and `docs/guides/` relative to `context.home` (the guild root). Files are read fresh on each call — no caching.
- Return plain text content, not JSON-wrapped markdown. The anima will read it directly.

### Package structure

```
packages/tool-api-reference/
  package.json
  nexus-tool.json
  instructions.md
  src/
    handler.ts
```

Standard tool package. See `docs/guides/building-tools.md` for the pattern.

### Instructions file

Write `instructions.md` for animas. It should explain:
- When to use the tool (looking up API signatures, understanding event payloads, checking schema details)
- The two modes and when to use each
- That `section` mode is better when you know what domain you need (e.g. "Ledger", "Events")
- That `search` mode is better when you're looking for a specific function or type name

### Installation

- Add to `nexus-bundle.json` so new guilds get it
- Assign to the `steward` and `artificer` roles in `init-guild.ts`

### Tests

Write tests using Node.js built-in test runner. Cover:
- Section lookup returns correct content
- Section lookup with no match returns available sections
- Search finds matches across multiple docs
- Search with no matches returns empty result
- Doc filter restricts results to the specified document

## What's already done

- All five doc files exist and are stable
- The `tool()` SDK, `nexus-tool.json` descriptor format, and installation pipeline are all documented in `docs/guides/building-tools.md`
- Role assignment infrastructure exists in `init-guild.ts`

## Out of scope

- No indexing, vector search, or embeddings — plain text search is sufficient for ~2,100 lines
- No caching — files are small enough to read on every call
- No write operations — this is strictly read-only
