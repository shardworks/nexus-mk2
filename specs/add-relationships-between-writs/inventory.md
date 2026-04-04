# Inventory: Add Relationships Between Writs

## Brief

Add typed directional relationships (links) between writs. Example uses: one writ fixes another, one retries a failed writ, one supersedes a cancelled writ, etc.

## Prior Art / Existing Context

### X013 Commission Outcomes — Writ Relationships instrument

`/workspace/nexus-mk2/experiments/X013-commission-outcomes/instruments/commission-writ-relationships.md`

A prior design document exists. Key decisions already made there:
- Relationships are **directed**: source writ → target writ with a type label
- Inverse ("is-revised-by") is a query, not a separate stored relationship
- No constraint on writ state when linking — link at any point
- A writ may have multiple relationships
- Required types: `revises`, `depends-on`
- Tool: `link-writ <sourceId> <targetId> --type <type>`
- Fire `writ.linked` event when created
- Show relationships in `writ-show` output
- Surface inbound `revises` in guild-monitor writ detail

### Outdated Architecture Doc — Writs

`/workspace/nexus-mk2/docs/future/outdated-architecture/writs.md`

Mentions parent/child relationships (tree-structured writs) and relationship types as "Open Questions" item 1: "Other relationship types. Backlog: blocks/blocked-by, related-to. Not for v1."

The current implementation (Clerk) has **flat writs** — no parent/child, no relationships at all. The outdated doc describes a more complex writ system (pending status, completion rollup, parent writs) that has not been implemented. The current Clerk is a simpler v1.

### Ethnography Session Notes

`/workspace/nexus-mk2/experiments/ethnography/session-notes/reviewed/2026-03-27T200000.md`
- Mentions "writ relationships" as first-priority dispatch commission
- Design session drafted `commission-writ-relationships.md`

### Brief

`/workspace/nexus-mk2/specs/add-relationships-between-writs/brief.md` — the brief from the patron. Uses examples: "fixes the implementation of another", "another attempt", "superseded or duplicated".

Note: The brief's examples suggest relationship types like `fixes`, `retries`, `supersedes`, `duplicates` — somewhat different from the X013 instrument's `revises` and `depends-on`. The brief is more recent and should take precedence on scope.

---

## Affected Code

### Primary: Clerk Plugin

Package: `@shardworks/clerk-apparatus`
Path: `/workspace/nexus/packages/plugins/clerk/`

#### `src/types.ts` — WritDoc interface (MODIFY)

Current signature:
```typescript
export interface WritDoc {
  [key: string]: unknown;
  id: string;
  type: string;
  status: WritStatus;
  title: string;
  body: string;
  codex?: string;
  createdAt: string;
  updatedAt: string;
  acceptedAt?: string;
  resolvedAt?: string;
  resolution?: string;
}
```

No `relationships` field exists. The `[key: string]: unknown` index signature means arbitrary fields are technically allowed at runtime, but not typed.

#### `src/types.ts` — ClerkApi interface (MODIFY)

Current signature:
```typescript
export interface ClerkApi {
  post(request: PostCommissionRequest): Promise<WritDoc>;
  show(id: string): Promise<WritDoc>;
  list(filters?: WritFilters): Promise<WritDoc[]>;
  count(filters?: WritFilters): Promise<number>;
  transition(id: string, to: WritStatus, fields?: Partial<WritDoc>): Promise<WritDoc>;
}
```

Will need new methods for adding/querying relationships (e.g. `link()`, `relationships()`).

#### `src/types.ts` — WritFilters (possibly MODIFY)

Current:
```typescript
export interface WritFilters {
  status?: WritStatus;
  type?: string;
  limit?: number;
  offset?: number;
}
```

May not need modification if relationship queries are separate methods.

#### `src/clerk.ts` — createClerk() (MODIFY)

Contains the ClerkApi implementation. Key functions:
- `api.post()` — creates writ, would need to optionally accept initial relationships
- `api.show()` — returns WritDoc, relationships would be included automatically if embedded
- `api.transition()` — manages status changes, strips managed fields

New method(s) for linking writs needed here.

The book declaration:
```typescript
supportKit: {
  books: {
    writs: {
      indexes: ['status', 'type', 'createdAt', ['status', 'type'], ['status', 'createdAt']],
    },
  },
  ...
}
```

If relationships are stored in a separate book, a new book declaration is needed.

#### `src/tools/writ-show.ts` (MODIFY)

Currently returns `clerk.show(params.id)` — may need to include relationship data in output.

#### `src/tools/index.ts` (MODIFY)

Exports all tools. Will need to export the new `writ-link` tool.

#### New file: `src/tools/writ-link.ts` (CREATE)

New tool for linking writs.

#### `src/index.ts` (MODIFY)

Exports types. Will need to export new relationship types.

#### `src/clerk.test.ts` (MODIFY)

628 lines of tests using node:test + assert. Test harness pattern:
- `setup()` function creates in-memory Stacks + fake Guild + Clerk
- `MemoryBackend` from `@shardworks/stacks-apparatus/testing`
- `beforeEach(() => setup())` per describe block
- `afterEach(() => clearGuild())`

Will need new test sections for relationship creation, querying, validation, and display.

### Secondary: Downstream Consumers of WritDoc

#### `/workspace/nexus/packages/plugins/dispatch/src/dispatch.ts`

Uses `WritDoc` from clerk — accesses `writ.title`, `writ.body`, `writ.id`, `writ.codex`, `writ.status`. Assembles prompt from writ fields. Does **not** need modification unless relationships should be surfaced in dispatch prompts.

#### `/workspace/nexus/packages/plugins/spider/src/tools/rig-for-writ.ts`

Uses writ ID to find associated rig. Not affected.

#### `/workspace/nexus/packages/plugins/dispatch/src/tools/dispatch-next.ts`

CLI tool wrapping dispatch. Not affected.

### Storage Layer: The Stacks

#### How Stacks stores data

Documents are JSON blobs in a `content` TEXT column (SQLite backend). Field queries use `json_extract()`. The `patch()` operation does **top-level field merge only** (`{ ...prev, ...fields, id }`). Nested objects/arrays are stored and preserved through put/get round-trips (confirmed by tier1 conformance test 1.4), but `patch()` replaces top-level fields wholesale — it does not deep-merge.

**Implication for relationship storage:**
- **Option A: Embed in WritDoc** as `relationships: WritRelationship[]`. Adding a relationship requires read-modify-write of the whole array. Queryable via dot-notation (`relationships.type`) in Stacks — but querying "find all writs that link TO writ X" requires scanning all writs (no reverse index).
- **Option B: Separate book** (`writ-relationships`). Each relationship is its own document with `{id, sourceId, targetId, type, createdAt}`. Indexed on sourceId, targetId, type. Clean querying in both directions. Requires a second book declaration.

#### Stacks Book API (relevant methods)

```typescript
interface Book<T extends BookEntry> {
  put(entry: T): Promise<void>;           // upsert
  patch(id: string, fields: Partial<Omit<T, 'id'>>): Promise<T>;  // top-level merge
  get(id: string): Promise<T | null>;
  find(query: BookQuery): Promise<T[]>;
  list(options?: ListOptions): Promise<T[]>;
  count(where?: WhereClause | { or: WhereClause[] }): Promise<number>;
  delete(id: string): Promise<void>;
}
```

WhereClause supports: `=`, `!=`, `>`, `>=`, `<`, `<=`, `LIKE`, `IN`, `IS NULL`, `IS NOT NULL`.

BookSchema supports indexes on fields (string or string[]). Dot-notation for nested fields is supported.

#### CDC (Change Data Capture)

Stacks fires CDC events on put/patch/delete. A `writ.linked` event would need to be either:
- A CDC update event on the writ (if embedded)
- A CDC create event on a separate relationships book
- A custom event fired explicitly by the Clerk (not via Stacks CDC)

### Clockworks / Events

Events are fired via the clockworks apparatus. The Clerk currently does **not** fire any events — it just mutates data. A `writ.linked` event would be new territory for the Clerk.

Checking: there is no existing event infrastructure in the Clerk. Events are mentioned in the outdated writs architecture doc but not implemented in the current Clerk. The Clockworks config in guild-config.ts supports custom event declarations.

---

## Adjacent Patterns

### How tools are authored

All clerk tools follow the same pattern:
```typescript
import { tool } from '@shardworks/tools-apparatus';
import { z } from 'zod';

export default tool({
  name: 'tool-name',
  description: 'Short description',
  instructions: 'Longer instructions for anima',
  params: {
    field: z.string().describe('Field description'),
  },
  permission: 'clerk:write',  // or 'clerk:read'
  handler: async (params) => { ... },
});
```

Permission convention: `clerk:read` for queries, `clerk:write` for mutations.

### How the Clerk validates and strips fields

In `transition()`, the Clerk destructures and strips managed fields:
```typescript
const { id: _id, status: _status, createdAt: _c, updatedAt: _u,
  acceptedAt: _a, resolvedAt: _r, ...safeFields } = (fields ?? {}) as WritDoc;
```

Any new managed fields (like relationships if embedded) would need similar treatment.

### How IDs are generated

```typescript
generateId('w', 6)  // produces "w-{base36_timestamp}{hex_random}"
```

A relationship ID could use a different prefix (e.g. `wl-` for writ-link).

### Comparable: No sibling features exist

There are no other relationship/linking features in the codebase. This is novel. The closest analogy is:
- The Spider's `forWrit()` which links a rig to a writ — but that's a simple foreign key lookup, not a typed relationship graph
- The Codexes' `associatedWith` field on DraftRecord — links a draft to a writ ID, again a simple FK

---

## Test Patterns

### Clerk test structure (`clerk.test.ts`)

- Uses `node:test` (describe/it/beforeEach/afterEach)
- `assert` from `node:assert/strict`
- `MemoryBackend` from `@shardworks/stacks-apparatus/testing`
- Fake guild setup via `setGuild()` / `clearGuild()`
- Tests are grouped by API method (post, show, list, count, transition)
- Each group has its own `beforeEach(() => setup())`
- Tests cover: happy path, validation errors, state machine constraints, field sanitization
- ~627 lines total

New tests would follow the same pattern: a new `describe('link()')` (or similar) block.

---

## Doc/Code Discrepancies

1. **Outdated writs doc vs. current implementation**: The doc at `docs/future/outdated-architecture/writs.md` describes parent/child writ trees, pending status, completion rollup, and session binding. None of this exists in the current Clerk implementation, which is flat writs with a simple status machine (ready → active → completed/failed/cancelled). The doc is explicitly in `outdated-architecture/`.

2. **X013 instrument mentions guild-monitor**: The writ-relationships instrument calls for surfacing relationships in the "guild-monitor writ detail view." The guild-monitor exists only as a dashboard upgrade script (`/workspace/nexus/bin/upgrade-dashboard.sh`) — it's not clear if there's a substantial monitor implementation. This acceptance criterion may need to be scoped out or deferred.

3. **Event firing**: The X013 instrument specifies firing a `writ.linked` event. The current Clerk fires **no events** — it only mutates data in Stacks. Adding event firing would be new capability for the Clerk and may require the Clockworks apparatus as a dependency.

4. **Relationship type vocabulary**: The brief mentions `fixes`, `retries`, `supersedes`, `duplicates`. The X013 instrument mentions `revises`, `depends-on`. These are different vocabularies for similar concepts. The brief is the authoritative source.

---

## Files Summary

### Will likely be modified
- `/workspace/nexus/packages/plugins/clerk/src/types.ts` — WritDoc, ClerkApi, new relationship types
- `/workspace/nexus/packages/plugins/clerk/src/clerk.ts` — new API methods, possibly new book
- `/workspace/nexus/packages/plugins/clerk/src/tools/writ-show.ts` — include relationships in output
- `/workspace/nexus/packages/plugins/clerk/src/tools/index.ts` — export new tool
- `/workspace/nexus/packages/plugins/clerk/src/index.ts` — export new types
- `/workspace/nexus/packages/plugins/clerk/src/clerk.test.ts` — new test sections

### Will likely be created
- `/workspace/nexus/packages/plugins/clerk/src/tools/writ-link.ts` — new tool for creating relationships

### Possibly modified (if relationships surfaced in prompts)
- `/workspace/nexus/packages/plugins/dispatch/src/dispatch.ts` — assemblePrompt could include relationship context

### Not modified (confirmed)
- Stacks core — no changes needed, existing Book API is sufficient
- Spider, Animator, Codexes — not affected
- Guild config types — no new config needed (relationship types can be open strings or an enum in the Clerk)
