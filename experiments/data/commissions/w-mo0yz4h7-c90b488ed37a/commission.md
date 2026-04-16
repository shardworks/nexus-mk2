# Ratchet Apparatus — Foundation Package

## Summary

Build the Ratchet apparatus plugin (`@shardworks/ratchet-apparatus`) — a click lifecycle manager that provides hierarchical task tracking with typed links, short-ID resolution, and MCP tool exposure. Ratchet follows the Clerk apparatus pattern but with an independent status machine, no cascading, and cross-substrate link support.

## Current State

No Ratchet code exists. The plugin will be created from scratch at `packages/plugins/ratchet/`. The reference implementation is the Clerk apparatus at `packages/plugins/clerk/`.

Key framework types used:

```typescript
// packages/framework/core/src/plugin.ts
export type Plugin =
  | { kit: Kit }
  | { apparatus: Apparatus }

export type Apparatus = {
  requires?:    string[]
  recommends?:  string[]
  provides?:    unknown
  start:        (ctx: StartupContext) => void | Promise<void>
  stop?:        () => void | Promise<void>
  supportKit?:  Kit
  consumes?:    string[]
}

export interface StartupContext {
  on(event: string, handler: (...args: unknown[]) => void | Promise<void>): void
  kits(type: string): KitEntry[]
}
```

```typescript
// packages/framework/core/src/id.ts
export function generateId(prefix: string, randomByteCount?: number): string
// generateId('c', 6) → "c-{base36_timestamp}-{hex_random}"
```

Stacks API (from `@shardworks/stacks-apparatus`):

```typescript
interface StacksApi {
  book<T extends BookEntry>(ownerId: string, name: string): Book<T>;
  transaction<R>(fn: (tx: TransactionContext) => Promise<R>): Promise<R>;
  watch<T>(ownerId: string, bookName: string, handler: (event: ChangeEvent<T>) => void | Promise<void>, options?: WatchOptions): void;
}

interface Book<T extends BookEntry> {
  get(id: string): Promise<T | null>;
  find(query: BookQuery): Promise<T[]>;
  list(options?: ListOptions): Promise<T[]>;
  count(where?: WhereClause | { or: WhereClause[] }): Promise<number>;
  put(entry: T): Promise<void>;
  patch(id: string, fields: Partial<Omit<T, 'id'>>): Promise<T>;
  delete(id: string): Promise<void>;
}
```

Tool definition (from `@shardworks/tools-apparatus`):

```typescript
import { tool } from '@shardworks/tools-apparatus';
// tool({ name, description, instructions, params, permission, handler })
```

## Requirements

- R1: The plugin package is named `@shardworks/ratchet-apparatus` and follows the Clerk package structure: `package.json`, `tsconfig.json`, `src/index.ts`, `src/ratchet.ts`, `src/types.ts`.
- R2: The `createRatchet()` factory returns a `Plugin` with `apparatus.requires: ['stacks']`, `apparatus.recommends: ['oculus']`, no `consumes` array, and no `pages` in `supportKit`.
- R3: The `clicks` book declares indexes: `['status', 'createdAt', 'parentId', ['status', 'createdAt'], ['parentId', 'status']]`.
- R4: The `click_links` book declares indexes: `['sourceId', 'targetId', 'linkType', ['sourceId', 'linkType'], ['targetId', 'linkType']]`.
- R5: `create()` accepts `{ goal, parentId?, createdSessionId? }` and returns a `ClickDoc` with status `'live'`, a generated `c-` prefixed ID, `createdAt` set to the current ISO timestamp, and all optional fields defaulting to `undefined`.
- R6: When `create()` receives a `parentId`, it validates inside a transaction that the parent click exists (throws if not found). It does not restrict by parent status.
- R7: The `goal` field is immutable after creation. No API method accepts `goal` as an update parameter.
- R8: `get(id)` returns the `ClickDoc` or throws if not found. Requires a full ID — no prefix resolution.
- R9: `list(filters?)` accepts optional `{ status?, parentId?, limit?, offset? }` and returns `ClickDoc[]` ordered by `createdAt` descending. `limit` defaults to 20.
- R10: `park(id)` transitions a click from `live` to `parked`. Throws if the current status does not allow the transition.
- R11: `resume(id)` transitions a click from `parked` to `live`. Throws if the current status does not allow the transition.
- R12: `conclude(id, { conclusion, resolvedSessionId? })` transitions a click from `live` or `parked` to `concluded`. Sets `conclusion`, `resolvedAt` (current ISO timestamp), and optionally `resolvedSessionId` atomically. Throws if the click is already in a terminal status.
- R13: `drop(id, { conclusion, resolvedSessionId? })` transitions a click from `live` or `parked` to `dropped`. Sets `conclusion`, `resolvedAt`, and optionally `resolvedSessionId` atomically. Throws if the click is already in a terminal status.
- R14: The `conclusion` field is write-once: it must be `undefined` before a terminal transition, and once set it cannot be changed. `conclude()` and `drop()` require a non-empty `conclusion` string.
- R15: Status transitions are governed by a central `ALLOWED_TRANSITIONS` table. Only these transitions are valid: `live → parked`, `parked → live`, `live → concluded`, `live → dropped`, `parked → concluded`, `parked → dropped`. No transitions from terminal states.
- R16: `reparent(id, { parentId })` moves a click to a new parent (or to root if `parentId` is `null`/`undefined`). When `parentId` is provided and non-null, it validates the new parent exists (throws if not found) but allows any parent status. Reparenting is allowed for clicks in any status.
- R17: `reparent()` detects circular parentage inside a Stacks transaction: walks the ancestor chain from the new parent upward; if the click being reparented is found in that chain, throws an error.
- R18: `extract(rootId, { format })` accepts `format: 'md' | 'json'`. For `'md'`, returns a `string` with markdown rendering: h1 for the root click, h2 for depth-1 children, h3 for depth-2, etc., capping at h6 and using `**bold text**` prefix for deeper levels. For `'json'`, returns a nested `ClickTree` object.
- R19: `link({ sourceId, targetId, linkType })` creates a link with composite ID `{sourceId}:{targetId}:{linkType}`. Only the four link types `'related'`, `'commissioned'`, `'supersedes'`, `'depends-on'` are accepted — throws on any other value. Self-links (sourceId === targetId) are rejected.
- R20: For same-substrate links (both IDs start with `c-`), `link()` validates both source and target clicks exist. For cross-substrate links, target IDs are stored as plain strings with no existence check.
- R21: `link()` is idempotent — if the link already exists, returns the existing `ClickLinkDoc`.
- R22: `unlink({ sourceId, targetId, linkType })` deletes the link with composite ID `{sourceId}:{targetId}:{linkType}`. Throws if the link does not exist.
- R23: `resolveId(prefix)` queries the clicks book using `find()` with `['id', 'LIKE', prefix + '%']`. Returns the single matching ID. Throws if zero matches ("No click found") or more than one match ("Ambiguous prefix").
- R24: `resolveId()` is standalone. `get()`, `park()`, `resume()`, `conclude()`, `drop()`, `reparent()`, `link()`, `unlink()`, and `extract()` all require full IDs.
- R25: Every MCP tool handler calls `resolveId(params.id)` before passing to the corresponding API method, so tools accept short ID prefixes.
- R26: The `click-show` tool enriches the response with: the click's links (outbound + inbound), parent context (`{ id, goal, status }` if parentId exists), and children summary (status counts + list of `{ id, goal, status }`).
- R27: Unit tests cover all API operations, status transitions (valid and invalid), goal immutability, conclusion write-once semantics, short-ID resolution (exact, ambiguous, not-found), tree operations (create with parent, reparent, circular detection, extract in both formats), and link operations (same-substrate validation, cross-substrate no-validation, restricted types, idempotent link, self-link rejection).

## Design

### Type Changes

All types are new. Define in `packages/plugins/ratchet/src/types.ts`:

```typescript
export type ClickStatus = 'live' | 'parked' | 'concluded' | 'dropped';

export type LinkType = 'related' | 'commissioned' | 'supersedes' | 'depends-on';

export interface ClickDoc {
  [key: string]: unknown;
  id: string;
  parentId?: string;
  goal: string;
  status: ClickStatus;
  conclusion?: string;
  createdSessionId?: string;
  resolvedSessionId?: string;
  createdAt: string;
  resolvedAt?: string;
}

export interface ClickLinkDoc {
  [key: string]: unknown;
  id: string;
  sourceId: string;
  targetId: string;
  linkType: LinkType;
  createdAt: string;
}

export interface ClickLinks {
  outbound: ClickLinkDoc[];
  inbound: ClickLinkDoc[];
}

export interface CreateClickRequest {
  goal: string;
  parentId?: string;
  createdSessionId?: string;
}

export interface ConcludeClickRequest {
  conclusion: string;
  resolvedSessionId?: string;
}

export interface DropClickRequest {
  conclusion: string;
  resolvedSessionId?: string;
}

export interface ReparentClickRequest {
  parentId?: string | null;
}

export interface LinkClickRequest {
  sourceId: string;
  targetId: string;
  linkType: LinkType;
}

export interface UnlinkClickRequest {
  sourceId: string;
  targetId: string;
  linkType: LinkType;
}

export interface ExtractClickRequest {
  format: 'md' | 'json';
}

export interface ClickFilters {
  status?: ClickStatus | ClickStatus[];
  parentId?: string;
  limit?: number;
  offset?: number;
}

export interface ClickTree {
  click: ClickDoc;
  children: ClickTree[];
}

export interface RatchetApi {
  create(params: CreateClickRequest): Promise<ClickDoc>;
  get(id: string): Promise<ClickDoc>;
  list(filters?: ClickFilters): Promise<ClickDoc[]>;
  park(id: string): Promise<ClickDoc>;
  resume(id: string): Promise<ClickDoc>;
  conclude(id: string, params: ConcludeClickRequest): Promise<ClickDoc>;
  drop(id: string, params: DropClickRequest): Promise<ClickDoc>;
  reparent(id: string, params: ReparentClickRequest): Promise<ClickDoc>;
  link(params: LinkClickRequest): Promise<ClickLinkDoc>;
  unlink(params: UnlinkClickRequest): Promise<void>;
  extract(rootId: string, params: ExtractClickRequest): Promise<string | ClickTree>;
  resolveId(prefix: string): Promise<string>;
  links(clickId: string): Promise<ClickLinks>;
}
```

### Behavior

#### Plugin scaffolding and registration

The `createRatchet()` factory follows Clerk's pattern exactly:

```typescript
export function createRatchet(): Plugin {
  let stacks: StacksApi;
  let clicks: Book<ClickDoc>;
  let clickLinks: Book<ClickLinkDoc>;

  const api: RatchetApi = { /* methods defined below */ };

  return {
    apparatus: {
      requires: ['stacks'],
      recommends: ['oculus'],
      supportKit: {
        books: {
          clicks: {
            indexes: ['status', 'createdAt', 'parentId', ['status', 'createdAt'], ['parentId', 'status']],
          },
          click_links: {
            indexes: ['sourceId', 'targetId', 'linkType', ['sourceId', 'linkType'], ['targetId', 'linkType']],
          },
        },
        tools: [ /* all tool imports */ ],
      },
      provides: api,
      async start(ctx: StartupContext): Promise<void> {
        const g = guild();
        stacks = g.apparatus<StacksApi>('stacks');
        clicks = stacks.book<ClickDoc>('ratchet', 'clicks');
        clickLinks = stacks.book<ClickLinkDoc>('ratchet', 'click_links');
      },
    },
  };
}
```

The `start()` method has no CDC watchers (Ratchet does not cascade), no kit consumption, and no migrations. It only resolves the Stacks dependency and initializes book references.

The `src/index.ts` barrel:

```typescript
import { createRatchet } from './ratchet.ts';

export {
  type RatchetApi,
  type ClickDoc,
  type ClickLinkDoc,
  type ClickLinks,
  type ClickStatus,
  type LinkType,
  type CreateClickRequest,
  type ConcludeClickRequest,
  type DropClickRequest,
  type ReparentClickRequest,
  type LinkClickRequest,
  type UnlinkClickRequest,
  type ExtractClickRequest,
  type ClickFilters,
  type ClickTree,
} from './types.ts';

export { createRatchet } from './ratchet.ts';

export default createRatchet();
```

#### Status machine

Define a central transition table and terminal status set:

```typescript
const ALLOWED_TRANSITIONS: Record<ClickStatus, ClickStatus[]> = {
  live:      ['parked', 'concluded', 'dropped'],
  parked:    ['live', 'concluded', 'dropped'],
  concluded: [],
  dropped:   [],
};

const TERMINAL_STATUSES = new Set<ClickStatus>(['concluded', 'dropped']);
```

When `park()` is called, look up `ALLOWED_TRANSITIONS['parked']` — no, rather: each method specifies its target status and the table validates the source. The pattern is: given current status and target status, check `ALLOWED_TRANSITIONS[currentStatus].includes(targetStatus)`. If not, throw `Cannot transition click "${id}" to "${target}": status is "${current}", expected one of: ${ALLOWED_TRANSITIONS[target].join(', ')}`.

Wait — to match Clerk's approach more precisely: define the table as "what statuses can transition TO this status". Use:

```typescript
const ALLOWED_FROM: Record<ClickStatus, ClickStatus[]> = {
  live:      ['parked'],
  parked:    ['live'],
  concluded: ['live', 'parked'],
  dropped:   ['live', 'parked'],
};
```

Each method validates: `ALLOWED_FROM[targetStatus].includes(click.status)`. This is the Clerk pattern.

#### create()

- When `parentId` is provided: wrap in `stacks.transaction()`, get parent from transactional book, throw if parent not found. No status restriction on parent.
- Generate ID: `generateId('c', 6)`.
- Build `ClickDoc`: `{ id, goal, status: 'live', parentId, createdSessionId, createdAt: new Date().toISOString() }`. Omit undefined optional fields.
- Call `clicks.put(doc)`.
- Return the doc.

#### get()

- Call `clicks.get(id)`. If `null`, throw `Click "${id}" not found.`

#### list()

- Build `where` clauses from filters: status (single value or `{ or: [...] }` for array), parentId.
- Pass `limit` (default 20), `offset`, and order by `createdAt` descending.
- Call `clicks.find(query)`.

#### park() / resume()

- Fetch click via `get(id)` (throws if not found).
- Validate transition using `ALLOWED_FROM`.
- Call `clicks.patch(id, { status: targetStatus })`.
- Return the patched doc.

#### conclude() / drop()

- Fetch click via `get(id)`.
- Validate transition using `ALLOWED_FROM`.
- Validate `conclusion` is a non-empty string (throw if empty/missing).
- Validate click's existing `conclusion` is `undefined` (write-once enforcement).
- Build patch: `{ status, conclusion, resolvedAt: new Date().toISOString(), ...(resolvedSessionId ? { resolvedSessionId } : {}) }`.
- Call `clicks.patch(id, patch)`.
- Return the patched doc.

#### reparent()

- When `parentId` is `null` or `undefined`: patch the click's `parentId` to `undefined` (move to root). No further validation needed.
- When `parentId` is a non-null string: wrap everything in `stacks.transaction()`:
  1. Fetch the click being reparented from the transactional book. Throw if not found.
  2. Fetch the new parent from the transactional book. Throw if not found: `Click "${parentId}" not found.`
  3. Walk the ancestor chain starting from the new parent: repeatedly fetch `current.parentId` until reaching root (`undefined`). If the click being reparented is found in the chain, throw: `Cannot reparent click "${id}" under "${parentId}": circular parentage detected.`
  4. Patch the click's `parentId` to the new value.
  5. Return the patched doc.
- Reparenting is allowed for clicks in any status — no status check on the click being moved.

#### extract() — markdown format

1. Fetch the root click via `get(rootId)`.
2. Recursively fetch children using `clicks.find({ where: [['parentId', '=', currentId]] })`.
3. For each click at depth `d`, render:
   - Heading: `#` repeated `min(d + 1, 6)` times for depths 0–5. For depth ≥ 6, use `**{goal}**` (bold) instead of a heading.
   - After the heading/bold line: the goal as a blockquote (`> {goal}`).
   - Status line: `Status: {status}`.
   - If `conclusion` is set: `Conclusion: {conclusion}`.
   - If `createdSessionId`: `Created by: {createdSessionId}`.
   - If `resolvedSessionId`: `Resolved by: {resolvedSessionId}`.
   - Timestamps: `Created: {createdAt}`. If `resolvedAt`: `Resolved: {resolvedAt}`.
4. Separate each click section with a blank line.
5. Children are rendered after their parent, in `createdAt` order.

Correction on heading content: the heading line uses the click ID as the heading text (since `goal` goes in the blockquote). Format: `## c-abc123 [status]` followed by `> goal text`. This mirrors how Clerk's extract might render writs by ID + title. The exact heading text should be: `{heading-prefix} {click.id} [{click.status}]`.

#### extract() — JSON format

1. Fetch the root click via `get(rootId)`.
2. Recursively build a `ClickTree`: `{ click: ClickDoc, children: ClickTree[] }`.
3. Children are fetched via `clicks.find({ where: [['parentId', '=', currentId]] })` and recursively expanded.
4. Return the nested `ClickTree` object.

#### link()

1. Validate `linkType` is one of `'related' | 'commissioned' | 'supersedes' | 'depends-on'`. Throw if not: `Invalid link type "${linkType}". Must be one of: related, commissioned, supersedes, depends-on.`
2. Reject self-links: if `sourceId === targetId`, throw `Cannot link a click to itself: "${sourceId}".`
3. For same-substrate links (both IDs start with `c-`): validate both source and target clicks exist via `clicks.get()`. Throw if either is not found.
4. For cross-substrate links (at least one ID does not start with `c-`): if the sourceId starts with `c-`, validate the source click exists. No validation on the non-click ID.
5. Build composite ID: `${sourceId}:${targetId}:${linkType}`.
6. Check if link already exists via `clickLinks.get(id)`. If so, return existing (idempotent).
7. Create `ClickLinkDoc`: `{ id, sourceId, targetId, linkType, createdAt: new Date().toISOString() }`.
8. Call `clickLinks.put(doc)`. Return the doc.

#### unlink()

1. Build composite ID: `${sourceId}:${targetId}:${linkType}`.
2. Check if link exists via `clickLinks.get(id)`. Throw if not found: `Link "${id}" not found.`
3. Call `clickLinks.delete(id)`.

#### links()

- Query outbound: `clickLinks.find({ where: [['sourceId', '=', clickId]] })`.
- Query inbound: `clickLinks.find({ where: [['targetId', '=', clickId]] })`.
- Return `{ outbound, inbound }`.

#### resolveId()

1. Query: `clicks.find({ where: [['id', 'LIKE', prefix + '%']] })`.
2. If 0 results: throw `No click found matching prefix "${prefix}".`
3. If >1 results: throw `Ambiguous prefix "${prefix}": matches ${results.length} clicks.`
4. Return `results[0].id`.

### MCP Tool Definitions

All tools are in `packages/plugins/ratchet/src/tools/`. Each follows the Clerk tool pattern: `export default tool({ ... })`.

Every tool that accepts an `id` parameter calls `resolveId(params.id)` first, then passes the resolved full ID to the API method. The `resolveId` call is done via `guild().apparatus<RatchetApi>('ratchet').resolveId(params.id)`.

**click-create** (`permission: 'write'`):
- Params: `{ goal: z.string(), parentId: z.string().optional(), createdSessionId: z.string().optional() }`
- Handler: calls `ratchet.create(params)`.

**click-show** (`permission: 'read'`):
- Params: `{ id: z.string() }`
- Handler: resolves ID, then fetches click + links in parallel, enriches with parent context `{ id, goal, status }` and children summary `{ summary: Record<ClickStatus, number>, items: Array<{ id, goal, status }> }`. Uses `ratchet.list({ parentId: click.id, limit: 1000 })` for children.

**click-list** (`permission: 'read'`):
- Params: `{ status: z.union([z.enum([...]), z.array(z.enum([...]))]).optional(), parentId: z.string().optional(), limit: z.number().optional().default(20), offset: z.number().optional() }`
- Handler: calls `ratchet.list(params)`.

**click-park** (`permission: 'write'`):
- Params: `{ id: z.string() }`
- Handler: resolves ID, calls `ratchet.park(resolvedId)`.

**click-resume** (`permission: 'write'`):
- Params: `{ id: z.string() }`
- Handler: resolves ID, calls `ratchet.resume(resolvedId)`.

**click-conclude** (`permission: 'write'`):
- Params: `{ id: z.string(), conclusion: z.string(), resolvedSessionId: z.string().optional() }`
- Handler: resolves ID, calls `ratchet.conclude(resolvedId, { conclusion, resolvedSessionId })`.

**click-drop** (`permission: 'write'`):
- Params: `{ id: z.string(), conclusion: z.string(), resolvedSessionId: z.string().optional() }`
- Handler: resolves ID, calls `ratchet.drop(resolvedId, { conclusion, resolvedSessionId })`.

**click-reparent** (`permission: 'write'`):
- Params: `{ id: z.string(), parentId: z.string().optional() }`
- Handler: resolves the click ID. If `parentId` is provided, also resolves it. Calls `ratchet.reparent(resolvedId, { parentId: resolvedParentId })`.

**click-link** (`permission: 'write'`):
- Params: `{ sourceId: z.string(), targetId: z.string(), linkType: z.enum(['related', 'commissioned', 'supersedes', 'depends-on']) }`
- Handler: resolves sourceId if it starts with `c-`. Resolves targetId if it starts with `c-`. Calls `ratchet.link({ sourceId, targetId, linkType })`.

**click-unlink** (`permission: 'write'`):
- Params: `{ sourceId: z.string(), targetId: z.string(), linkType: z.enum(['related', 'commissioned', 'supersedes', 'depends-on']) }`
- Handler: same resolution logic as click-link. Calls `ratchet.unlink({ sourceId, targetId, linkType })`.

**click-extract** (`permission: 'read'`):
- Params: `{ id: z.string(), format: z.enum(['md', 'json']).default('md') }`
- Handler: resolves ID, calls `ratchet.extract(resolvedId, { format })`.

### Non-obvious Touchpoints

- `packages/plugins/ratchet/src/tools/index.ts` — barrel re-export of all tool defaults. Must export each tool as a named import for the `supportKit.tools` array in `ratchet.ts`.
- The `package.json` `files` field should include `["dist"]` only (no `pages` directory — D26).
- `tsconfig.json` should extend the root config with `outDir: "dist"`, `rootDir: "src"`, matching Clerk's config.
- The `[key: string]: unknown` index signature on `ClickDoc` and `ClickLinkDoc` is required by the `BookEntry` constraint in Stacks.

### Dependencies

`package.json` dependencies follow Clerk exactly:

```json
{
  "name": "@shardworks/ratchet-apparatus",
  "version": "0.0.0",
  "license": "ISC",
  "repository": {
    "type": "git",
    "url": "https://github.com/shardworks/nexus",
    "directory": "packages/plugins/ratchet"
  },
  "description": "The Ratchet — click lifecycle management apparatus",
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "build": "tsc",
    "test": "node --disable-warning=ExperimentalWarning --experimental-transform-types --test 'src/**/*.test.ts'",
    "typecheck": "tsc --noEmit"
  },
  "peerDependencies": {
    "@shardworks/nexus-core": "0.x"
  },
  "dependencies": {
    "@shardworks/stacks-apparatus": "workspace:*",
    "@shardworks/tools-apparatus": "workspace:*",
    "zod": "4.3.6"
  },
  "devDependencies": {
    "@shardworks/nexus-core": "workspace:*",
    "@types/node": "25.5.0"
  },
  "files": ["dist"],
  "publishConfig": {
    "exports": {
      ".": {
        "types": "./dist/index.d.ts",
        "import": "./dist/index.js"
      }
    }
  }
}
```

## Validation Checklist

- V1 [R1]: Verify `packages/plugins/ratchet/package.json` exists with name `@shardworks/ratchet-apparatus`, and `src/index.ts`, `src/ratchet.ts`, `src/types.ts` all exist and compile: `cd packages/plugins/ratchet && npx tsc --noEmit`.
- V2 [R2]: Verify `createRatchet()` returns `{ apparatus: { requires: ['stacks'], recommends: ['oculus'] } }` and that `apparatus.consumes` is absent and `apparatus.supportKit.pages` is absent. Inspect the returned object in a test: `const plugin = createRatchet(); assert.deepStrictEqual(plugin.apparatus.requires, ['stacks']); assert.deepStrictEqual(plugin.apparatus.recommends, ['oculus']); assert.strictEqual(plugin.apparatus.consumes, undefined);`.
- V3 [R3, R4]: Verify the `supportKit.books` declaration contains the correct index arrays for `clicks` and `click_links`. Inspect `plugin.apparatus.supportKit.books` in a test assertion.
- V4 [R5, R6]: Create a click with `{ goal: 'test' }` — verify returned doc has `status: 'live'`, `id` starting with `c-`, and `createdAt` set. Create a click with `{ goal: 'child', parentId: parentClick.id }` — verify it succeeds. Create a click with `{ goal: 'orphan', parentId: 'c-nonexistent' }` — verify it throws.
- V5 [R7]: After creating a click, verify no API method accepts `goal` as a parameter. Grep all API method signatures in `ratchet.ts` for `goal` — it should only appear in `create()`.
- V6 [R8]: Call `get()` with a valid ID — verify it returns the doc. Call `get()` with a non-existent ID — verify it throws `Click "..." not found.`.
- V7 [R9]: Create multiple clicks with different statuses. Call `list({ status: 'live' })` — verify only live clicks returned. Call `list({ parentId: parent.id })` — verify only children returned. Verify default limit is 20.
- V8 [R10, R11, R15]: Call `park()` on a `live` click — verify status becomes `parked`. Call `resume()` on a `parked` click — verify status becomes `live`. Call `park()` on a `concluded` click — verify it throws.
- V9 [R12, R14]: Call `conclude()` with `{ conclusion: 'done' }` on a `live` click — verify status is `concluded`, `conclusion` is `'done'`, and `resolvedAt` is set. Call `conclude()` on the same click again — verify it throws (terminal status).
- V10 [R13, R14]: Call `drop()` with `{ conclusion: 'abandoned' }` on a `live` click — verify status is `dropped`. Call `conclude()` or `drop()` with an empty conclusion string — verify it throws.
- V11 [R15]: Attempt all invalid transitions: `concluded → live`, `concluded → parked`, `dropped → live`, `dropped → parked`, `concluded → dropped`, `dropped → concluded`. All must throw.
- V12 [R16, R17]: Create clicks A → B → C (parent chain). Reparent C to be a child of A — verify it succeeds. Attempt to reparent A under C — verify it throws with circular parentage error. Reparent A to `null` — verify A becomes a root click. Reparent a `concluded` click — verify it succeeds.
- V13 [R18]: Create a tree with root + 2 children. Call `extract(rootId, { format: 'md' })` — verify the output is a string containing `#` heading for root, `##` headings for children, and blockquoted goals. Call `extract(rootId, { format: 'json' })` — verify the output is a `ClickTree` with `.click` and `.children` array of length 2.
- V14 [R19, R20, R21]: Create two clicks. Call `link({ sourceId: a.id, targetId: b.id, linkType: 'related' })` — verify it returns a `ClickLinkDoc`. Call the same link again — verify idempotent (returns same doc). Call `link()` with `linkType: 'invalid'` — verify it throws. Call `link()` with `sourceId === targetId` — verify it throws.
- V15 [R20]: Call `link()` with a cross-substrate target (e.g., `targetId: 'w-abc123'`) — verify it succeeds without validating the writ exists. Call `link()` with a non-existent `c-` sourceId — verify it throws.
- V16 [R22]: Create a link, then call `unlink()` with the same params — verify it succeeds. Call `unlink()` again — verify it throws (link not found).
- V17 [R23, R24]: Create a click. Call `resolveId()` with the first 8 characters of its ID — verify it returns the full ID. Create two clicks with similar prefixes, call `resolveId()` with a prefix matching both — verify it throws "Ambiguous". Call `resolveId()` with a non-matching prefix — verify it throws "No click found". Call `get()` with a short prefix — verify it throws (not found), confirming `get()` does not resolve.
- V18 [R25, R26]: In the test harness, verify tool handlers resolve short IDs. For `click-show`, call with a prefix ID and verify the enriched response includes `links`, `parent`, and `children` fields.
- V19 [R27]: Run the full test suite: `cd packages/plugins/ratchet && node --disable-warning=ExperimentalWarning --experimental-transform-types --test 'src/**/*.test.ts'`. All tests pass.

## Test Cases

### Lifecycle basics
- **Create minimal click**: `create({ goal: 'Ship v2' })` → returns `ClickDoc` with `status: 'live'`, `id` matching `/^c-/`, `goal: 'Ship v2'`, `createdAt` as valid ISO string, `conclusion: undefined`, `resolvedAt: undefined`.
- **Create with session**: `create({ goal: 'Fix bug', createdSessionId: 'sess-1' })` → returned doc has `createdSessionId: 'sess-1'`.
- **Create with parent**: Create parent, then `create({ goal: 'Subtask', parentId: parent.id })` → returned doc has `parentId: parent.id`.
- **Create with non-existent parent**: `create({ goal: 'Orphan', parentId: 'c-nonexistent' })` → throws.

### Status transitions
- **park a live click**: `park(id)` → `status: 'parked'`.
- **resume a parked click**: `resume(id)` → `status: 'live'`.
- **conclude from live**: `conclude(id, { conclusion: 'Done' })` → `status: 'concluded'`, `conclusion: 'Done'`, `resolvedAt` set.
- **conclude from parked**: park then conclude → succeeds.
- **drop from live**: `drop(id, { conclusion: 'Not needed' })` → `status: 'dropped'`.
- **drop from parked**: park then drop → succeeds.
- **conclude with session**: `conclude(id, { conclusion: 'Done', resolvedSessionId: 'sess-2' })` → `resolvedSessionId: 'sess-2'`.
- **park a parked click**: `park(id)` on parked → throws.
- **resume a live click**: `resume(id)` on live → throws.
- **conclude a concluded click**: → throws.
- **drop a dropped click**: → throws.
- **conclude a dropped click**: → throws.
- **park a concluded click**: → throws.
- **resume a concluded click**: → throws.

### Conclusion write-once
- **Empty conclusion string**: `conclude(id, { conclusion: '' })` → throws.
- **Conclusion on non-terminal**: verify `conclusion` is `undefined` before any terminal transition.

### Goal immutability
- **No goal in patch**: verify that no method path passes `goal` to `clicks.patch()`. This is structural — confirmed by code inspection, not a runtime test. Optionally: create a click, verify after `park`/`resume` cycles that `goal` is unchanged.

### List and filters
- **List all**: `list()` → returns clicks ordered by `createdAt` descending, default limit 20.
- **Filter by status**: `list({ status: 'live' })` → only live clicks.
- **Filter by status array**: `list({ status: ['live', 'parked'] })` → live and parked clicks.
- **Filter by parentId**: `list({ parentId: parent.id })` → only direct children.
- **Limit and offset**: create 5 clicks, `list({ limit: 2, offset: 1 })` → 2 results, skipping the newest.

### Tree operations
- **Reparent to new parent**: create A and B, `reparent(B.id, { parentId: A.id })` → B.parentId is A.id.
- **Reparent to root**: `reparent(B.id, { parentId: null })` → B.parentId is `undefined`.
- **Reparent non-existent parent**: `reparent(B.id, { parentId: 'c-ghost' })` → throws.
- **Circular detection (direct)**: A is child of B, `reparent(B, { parentId: A.id })` → throws.
- **Circular detection (indirect)**: A → B → C chain, `reparent(A, { parentId: C.id })` → throws.
- **Reparent concluded click**: conclude A, `reparent(A.id, { parentId: B.id })` → succeeds.
- **Reparent to concluded parent**: conclude B, `reparent(A.id, { parentId: B.id })` → succeeds.

### Extract
- **Markdown single click**: `extract(id, { format: 'md' })` → string starting with `# `.
- **Markdown with children**: root + 2 children → output contains `#` and two `##` headings.
- **Markdown deep tree**: 7 levels → depths 0–5 use `#`–`######`, depth 6 uses bold.
- **JSON single click**: `extract(id, { format: 'json' })` → `{ click: {...}, children: [] }`.
- **JSON with children**: root + children → `children` array is populated with nested `ClickTree` objects.

### Links
- **Create same-substrate link**: two clicks, `link({ sourceId: a.id, targetId: b.id, linkType: 'related' })` → returns `ClickLinkDoc` with composite ID.
- **Idempotent link**: call `link()` twice with same params → same doc returned, no error.
- **Invalid link type**: `link({ ..., linkType: 'blocks' })` → throws.
- **Self-link**: `link({ sourceId: a.id, targetId: a.id, linkType: 'related' })` → throws.
- **Cross-substrate link**: `link({ sourceId: click.id, targetId: 'w-abc123', linkType: 'commissioned' })` → succeeds without writ validation.
- **Same-substrate missing target**: `link({ sourceId: a.id, targetId: 'c-nonexistent', linkType: 'related' })` → throws.
- **Same-substrate missing source**: `link({ sourceId: 'c-nonexistent', targetId: a.id, linkType: 'related' })` → throws.
- **Unlink existing**: create link, `unlink()` with same params → succeeds.
- **Unlink non-existent**: `unlink()` with params that have no matching link → throws.
- **Query links**: create outbound and inbound links, call `links(clickId)` → verify `outbound` and `inbound` arrays populated correctly.

### Short-ID resolution
- **Unique prefix**: `resolveId('c-abc')` where only one click matches → returns full ID.
- **Ambiguous prefix**: two clicks both starting with `c-abc`, `resolveId('c-abc')` → throws "Ambiguous".
- **No match**: `resolveId('c-zzz')` → throws "No click found".
- **Full ID as prefix**: `resolveId(fullId)` → returns the same full ID (exact match is a valid prefix).

### Tool integration
- **click-show enrichment**: call click-show tool handler with a click that has a parent, children, and links → response includes `parent: { id, goal, status }`, `children: { summary, items }`, and `links: { outbound, inbound }`.
- **Tool ID resolution**: call click-park tool handler with a short prefix → verify it resolves and parks the correct click.
- **click-list passthrough**: call click-list tool handler with status filter → verify filtered results.
