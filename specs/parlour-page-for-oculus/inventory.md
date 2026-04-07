# Codebase Inventory — Parlour Page for Oculus

Slug: `parlour-page-for-oculus`

---

## Brief Summary

Add an Oculus page to the Parlour apparatus that provides a realtime chat UI for consult conversations with an anima. Includes: anima selector (role dropdown), session sidebar, streaming chat interface, and cost card.

---

## Affected Files

### Modified

| File | Why |
|---|---|
| `packages/plugins/parlour/src/parlour.ts` | Add `pages` and `routes` to `supportKit` |
| `packages/plugins/parlour/package.json` | Add static files to `files` array; possibly add `@shardworks/oculus-apparatus` as dep for types |
| `packages/plugins/parlour/src/index.ts` | May need re-export of new types if any are added |

### Created

| File | Why |
|---|---|
| `packages/plugins/parlour/src/static/parlour/index.html` | Page entry point |
| `packages/plugins/parlour/src/static/parlour/app.js` (or bundled equivalent) | Page frontend logic |
| `packages/plugins/parlour/src/routes.ts` (or `src/routes/index.ts`) | Custom Hono route handlers contributed via `supportKit.routes` |

### Test files that exist

| File | Pattern |
|---|---|
| `packages/plugins/parlour/src/parlour.test.ts` | node:test, in-memory Stacks (MemoryBackend), fake AnimatorSessionProvider, real Loom/Animator/Stacks apparatuses |
| `packages/plugins/oculus/src/oculus.test.ts` | node:test, real HTTP server (randomized ports), `wireGuild()` helper |

---

## Types Involved

### From `packages/plugins/parlour/src/types.ts` (current)

```typescript
interface ConversationDoc {
  id: string;
  status: 'active' | 'concluded' | 'abandoned';
  kind: 'consult' | 'convene';
  topic: string | null;
  turnLimit: number | null;
  createdAt: string;
  endedAt: string | null;
  eventId: string | null;
  participants: ParticipantRecord[];
  cwd: string;
  [key: string]: unknown;
}

interface ParticipantRecord {
  id: string;
  kind: 'anima' | 'human';
  name: string;
  animaId: string | null;
  providerSessionId: string | null;
}

interface TurnDoc {
  id: string;
  conversationId: string;
  turnNumber: number;
  participantId: string;
  participantName: string;
  participantKind: 'anima' | 'human';
  message: string | null;      // for human turns: the user's text; for anima turns: the prompt sent IN
  sessionId: string | null;    // null for human turns
  startedAt: string;
  endedAt: string | null;
  [key: string]: unknown;
}

interface TurnSummary {
  sessionId: string | null;
  turnNumber: number;
  participant: string;         // participantName
  message: string | null;      // the prompt, NOT the anima's response
  startedAt: string;
  endedAt: string | null;
  // NOTE: no 'output' field — anima response text is NOT exposed here
}

interface ConversationSummary {
  id: string;
  status: 'active' | 'concluded' | 'abandoned';
  kind: 'consult' | 'convene';
  topic: string | null;
  turnLimit: number | null;
  createdAt: string;
  endedAt: string | null;
  participants: Participant[];
  turnCount: number;
  totalCostUsd: number;
  // NOTE: no totalTokens field
}

interface ConversationDetail extends ConversationSummary {
  turns: TurnSummary[];
}

interface CreateConversationRequest {
  kind: 'consult' | 'convene';
  topic?: string;
  turnLimit?: number;
  participants: ParticipantDeclaration[];
  cwd: string;
  eventId?: string;
}

interface CreateConversationResult {
  conversationId: string;
  participants: Participant[];   // includes both human and anima with their generated ids
}

interface TakeTurnRequest {
  conversationId: string;
  participantId: string;
  message?: string;
}

type ConversationChunk =
  | SessionChunk
  | { type: 'turn_complete'; turnNumber: number; costUsd?: number };
```

### From `packages/plugins/animator/src/types.ts` (current)

```typescript
type SessionChunk =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; tool: string }
  | { type: 'tool_result'; tool: string };

interface SessionDoc {
  id: string;
  status: 'running' | 'completed' | 'failed' | 'timeout';
  startedAt: string;
  endedAt?: string;
  durationMs?: number;
  provider: string;
  exitCode?: number;
  error?: string;
  conversationId?: string;
  providerSessionId?: string;
  tokenUsage?: TokenUsage;
  costUsd?: number;
  metadata?: Record<string, unknown>;
  output?: string;   // ← the final assistant text from the session
  [key: string]: unknown;
}

interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}
```

### From `packages/plugins/oculus/src/types.ts` (current)

```typescript
interface PageContribution {
  id: string;     // URL segment: /pages/{id}/
  title: string;  // shown in nav
  dir: string;    // path relative to contributing package's root in node_modules
}

interface RouteContribution {
  method: string;   // 'GET', 'POST', 'DELETE' etc.
  path: string;     // Hono path pattern, MUST start with /api/
  handler: (c: Context) => Response | Promise<Response>;
}

interface OculusKit {
  pages?: PageContribution[];
  routes?: RouteContribution[];
}
```

### From `packages/plugins/loom/src/loom.ts` (current)

```typescript
interface LoomConfig {
  roles?: Record<string, RoleDefinition>;
}

interface RoleDefinition {
  permissions: string[];
  strict?: boolean;
}

interface LoomApi {
  weave(request: WeaveRequest): Promise<AnimaWeave>;
  // NOTE: no listRoles() method — roles are not exposed via API
}
```

---

## ParlourApi (current, from `parlour.ts`)

```typescript
interface ParlourApi {
  create(request: CreateConversationRequest): Promise<CreateConversationResult>;
  takeTurn(request: TakeTurnRequest): Promise<TurnResult>;
  takeTurnStreaming(request: TakeTurnRequest): {
    chunks: AsyncIterable<ConversationChunk>;
    result: Promise<TurnResult>;
  };
  nextParticipant(conversationId: string): Promise<Participant | null>;
  end(conversationId: string, reason?: 'concluded' | 'abandoned'): Promise<void>;
  list(options?: ListConversationsOptions): Promise<ConversationSummary[]>;
  show(conversationId: string): Promise<ConversationDetail | null>;
}
```

---

## Oculus Page Serving Mechanism

Pages are contributed via `supportKit.pages` on any apparatus (or `kit.pages` on a standalone kit). The Oculus scans all apparatus and kits at startup:

```typescript
function resolveDirForPackage(packageName: string, dir: string): string {
  return path.join(g.home, 'node_modules', packageName, dir);
}
```

- `packageName` = `apparatus.packageName` (e.g. `@shardworks/parlour-apparatus`)
- `dir` = the `dir` field of `PageContribution`
- In a pnpm workspace, `node_modules/@shardworks/parlour-apparatus` is symlinked to `packages/plugins/parlour/`
- Therefore `dir: 'src/static/parlour'` resolves to `packages/plugins/parlour/src/static/parlour/` in development
- For published packages, `files: ["dist"]` means only `dist/` is published — `dir` would need to be `dist/static/parlour` or the `files` array must be extended

The page must contain an `index.html` at the root of the `dir`. Chrome (nav + oculus CSS) is injected into `index.html` automatically.

Custom routes are contributed via `supportKit.routes`. Each route must have a `path` starting with `/api/`. The Hono app registers them before tool routes, giving them priority.

---

## Existing REST API (via tool→route mapping in Oculus)

The following existing Parlour tools are automatically exposed as REST endpoints by the Oculus:

| Tool | Route | Method | Description |
|---|---|---|---|
| `conversation-list` | `GET /api/conversation/list` | GET | Lists conversations (status, kind, limit params) |
| `conversation-show` | `GET /api/conversation/show` | GET | Show conversation detail (id param) |
| `conversation-end` | `POST /api/conversation/end` | POST | End conversation (id, reason) |

These cover partial needs but NOT:
- Role listing (no loom tool or endpoint)
- Filtering conversations by participant/role name
- Creating a new consult conversation
- Streaming a turn (SSE)
- Fetching anima response text in conversation history

---

## Key Gaps and Design Challenges

### 1. Anima Response Text Not in ConversationDetail

The `TurnSummary` returned by `parlour.show()` has a `message` field which is the *prompt sent to the anima*, NOT the anima's response. The actual response is in `SessionDoc.output` (stored by the Animator), linked via `TurnDoc.sessionId`.

To display a proper conversation history, the page needs anima response text. This requires either:
- **Option A**: Modify `parlour.show()` to look up `SessionDoc.output` for each anima turn and include it in `TurnSummary`
- **Option B**: Add a new custom route that fetches conversation turns and enriches them with session output
- **Option C**: Accept that history is only available for the streaming turns (accumulated client-side during the session), and don't load history for pre-existing conversations

### 2. Role Listing

The `LoomApi` has no `listRoles()`. Roles are stored in:
1. `guild().guildConfig().loom?.roles` — guild-defined roles (accessible)
2. Loom's internal `kitRoles` Map — kit-contributed roles (not accessible without extending LoomApi)

For the dropdown: reading `guild().guildConfig().loom?.roles` gives guild-defined roles. Kit roles would require extending `LoomApi` with a `listRoles()` method (separate commission) or reading from loom apparatus config.

### 3. Conversations Filtered by Role

`parlour.list()` filters by status/kind/limit but not by participant name/role. To show "conversations with role X", the custom route must either:
- Fetch all active conversations and filter in JS (acceptable at small scale)
- Add a `participantName` filter parameter to `parlour.list()` (would require changes to parlour API and underlying query)

### 4. Streaming Transport

`parlour.takeTurnStreaming()` returns `AsyncIterable<ConversationChunk>`. The web frontend needs this over HTTP. Options:
- **SSE (Server-Sent Events)**: Hono 4.x has `streamSSE` from `hono/streaming`. Fits well for server→client push.
- **WebSocket**: More complex, bidirectional, overkill for this use case.
- **Polling**: Unacceptable for realtime UX.

Hono 4.7.x is installed. `streamSSE` is the natural fit. `@hono/node-server` 1.13.x supports streaming responses.

### 5. Token Count for Cost Card

`ConversationSummary.totalCostUsd` is available. Token totals are NOT in `ConversationDetail` — they'd need to be aggregated from `SessionDoc.tokenUsage` for each session. This would require modifications to `parlour.show()` or an additional route.

### 6. `cwd` for New Conversations

When the page creates a new consult conversation, it must supply a `cwd`. The most sensible value is `guild().home` (the guild root directory), since there's no worktree management in the web UI.

---

## Role of `parlour.ts` `supportKit` (current)

```typescript
supportKit: {
  books: {
    conversations: { indexes: ['status', 'kind', 'createdAt'] },
    turns: { indexes: ['conversationId', 'turnNumber', 'participantId', 'participantKind'] },
  },
  tools: [conversationList, conversationShow, conversationEnd],
},
```

The `supportKit` is cast to `OculusKit` by the Oculus. Adding `pages` and `routes` alongside the existing `books` and `tools` keys is the correct contribution pattern. The Oculus and other apparatus consumers each look for their own keys and ignore the rest.

---

## Adjacent Patterns

### No Existing Oculus Pages

As of now, there are no apparatus/kit page contributions in the codebase (no `pages:` contributions in any plugin). The Oculus tests create fake ones. The Parlour page would be the **first real page contribution**. The oculus test infrastructure (`mockKit`, page-serving integration tests) provides the reference pattern.

### Oculus CSS Variables (Tokyo Night palette)

The oculus injects `/static/style.css` into every page's `<head>`. The stylesheet defines CSS custom properties:
- `--bg: #1a1b26`, `--surface: #24283b`, `--surface2: #2f3549`, `--border: #3b4261`
- `--text: #c0caf5`, `--text-dim: #565f89`, `--text-bright: #e0e6ff`
- `--green`, `--red`, `--yellow`, `--cyan`, `--magenta`, `--blue`
- `--font-mono`
- Utility classes: `.card`, `.badge`, `.badge--success/error/warning/info/active`, `.btn`, `.btn--primary/success/danger`, `.toolbar`, `.empty-state`, `.data-table`
- Pre-defined pulse animation via `.badge--active`

The page should use these variables and classes for visual consistency.

### Tool Route Pattern

The oculus automatically maps tools to routes. The parlour's three existing tools already produce routes at `/api/conversation/list`, `/api/conversation/show`, `/api/conversation/end`. Custom routes in `supportKit.routes` take priority over tool routes when there's a path collision.

### Hono Context in Route Handlers

Custom route handlers receive a Hono `Context` (`c`) object. `c.req.query()`, `c.req.json()`, `c.json()`, `c.html()`, `c.text()` are the standard APIs. For SSE streaming, `streamSSE` is imported from `hono/streaming`.

---

## Oculus `packageName` for Parlour

In `arbor.ts` (the guild orchestrator), when loading plugins, `packageName` comes from the npm package name. For the parlour apparatus, `apparatus.packageName` = `@shardworks/parlour-apparatus`. The oculus uses this to resolve the page directory:

```typescript
path.join(g.home, 'node_modules', '@shardworks/parlour-apparatus', page.dir)
```

In pnpm workspace: symlink → `packages/plugins/parlour/`. So `dir: 'src/static/parlour'` works in dev.

---

## Doc/Code Discrepancies

1. **`TurnSummary` in doc vs code**: The parlour.md spec has `TurnSummary` with `prompt`, `exitCode`, `costUsd`, `durationMs` fields. The actual `TurnSummary` in `types.ts` has `message` (not `prompt`) and lacks `exitCode`, `costUsd`, `durationMs`. The implementation's turns book stores the message/prompt and sessionId, but cost/duration data lives in the Animator's sessions book and is NOT ported into `TurnSummary`.

2. **"Stacks Book" for conversations**: The brief mentions "setting their status in the appropriate Stacks Book." Confirmed: `status` is in `ConversationDoc` in the `parlour/conversations` Stacks book. `conversation-end` tool already calls `parlour.end()` to do this.

3. **`animaId` on ParticipantRecord**: Set to `null` at MVP ("No Roster yet"). Won't affect the page.

---

## Questions for the Analyst

1. Should `parlour.show()` be extended to include anima response text (`output`) in `TurnSummary`? Or should a separate custom route handle this enrichment?
2. Should `LoomApi` be extended with `listRoles()`? Or is reading from `guildConfig().loom?.roles` in the route handler sufficient?
3. Should kit-contributed roles (loom's `kitRoles`) be included in the dropdown? If so, LoomApi must be extended.
4. For filtering conversations by role, should a `participantName` filter be added to `parlour.list()`, or should the route handler filter in-memory?
5. Should the cost card include token counts? If yes, `ConversationDetail` must be extended with aggregated token data.
6. Should the page be pure vanilla JS/HTML (no bundler), or is a bundler expected?

---

## Scratch Notes / Lookup Table

- Parlour plugin id: `parlour`
- Parlour package name: `@shardworks/parlour-apparatus`
- Oculus plugin id: `oculus`
- Oculus package name: `@shardworks/oculus-apparatus`
- Loom plugin id: `loom`
- Hono version: `^4.7.11`
- `@hono/node-server` version: `^1.13.7`
- Test runner: `node:test` (not vitest/jest)
- Module system: ESM (`"type": "module"`)
- TypeScript: `5.9.3`, extends `@tsconfig/node24`, uses `--experimental-transform-types`
- pnpm workspace, `workspace:*` for internal deps
- `SessionDoc.output` — final assistant text, set by Animator — IS the anima's reply
- `TurnDoc.message` for anima turns — the prompt SENT to the anima (not the response)
- `TurnDoc.participantKind: 'human'` turns store the user's message in `message`
- `ConversationSummary.topic` — usable as short title in sidebar; null if not set → use createdAt
- `parlour.list()` default sort: `createdAt desc`; brief says "sorted by createdAt" — already correct
- Brief says "end conversation" removes it from sidebar — this means filter by `status: 'active'` in sidebar
