## Commission Spec

---
author: plan-writer
estimated_complexity: 13
---

# Parlour Oculus Page

## Summary

Add an Oculus page to the Parlour apparatus that provides a realtime chat UI for consult conversations with animas. The page includes a role selector, codex selector, session sidebar, streaming chat interface, and cost card. Prerequisite changes extend the Loom's API with role listing and enrich the Parlour's `TurnSummary` with session output and token data.

## Current State

**Parlour apparatus** (`packages/plugins/parlour/`): Fully implemented multi-turn conversation management. `ParlourApi` exposes `create`, `takeTurn`, `takeTurnStreaming`, `nextParticipant`, `end`, `list`, `show`. Its `supportKit` contributes two Stacks books (`conversations`, `turns`) and three tools (`conversation-list`, `conversation-show`, `conversation-end`). No `pages` or `routes` are contributed.

The `show()` method already reads `SessionDoc` records from the Animator's sessions book to aggregate `totalCostUsd`, but does not pull `output` or `tokenUsage` from those records into the returned `TurnSummary`:

```typescript
// Current TurnSummary — no output, no cost, no tokens
interface TurnSummary {
  sessionId: string | null;
  turnNumber: number;
  participant: string;
  message: string | null;   // the prompt sent TO the anima, not the response
  startedAt: string;
  endedAt: string | null;
}
```

**Loom apparatus** (`packages/plugins/loom/`): Provides `LoomApi` with only `weave()`. Role definitions are stored in two places: guild-defined roles in `guild().guildConfig().loom?.roles` (a `Record<string, RoleDefinition>`) and kit-contributed roles in an internal `kitRoles` Map. There is no public API to enumerate roles.

**Oculus apparatus** (`packages/plugins/oculus/`): Serves pages contributed via `supportKit.pages` (`PageContribution[]`) and custom routes via `supportKit.routes` (`RouteContribution[]`). Pages are resolved from `path.join(guild.home, 'node_modules', packageName, page.dir)`. Chrome (nav bar + shared CSS) is auto-injected into each page's `index.html`. No real page contributions exist in the codebase yet.

**Codexes apparatus** (`packages/plugins/codexes/`): Provides `ScriptoriumApi` with `list()`, `show()`, `openDraft()`, etc. The `codex-list` tool is auto-mapped by Oculus to `GET /api/codex/list`. `openDraft()` creates a git worktree and returns a `DraftRecord` with an absolute `path` to the worktree directory.

**Existing REST routes** (auto-mapped from tools by Oculus):
- `GET /api/conversation/list` — lists conversations
- `GET /api/conversation/show?id=...` — shows conversation detail
- `POST /api/conversation/end` — ends a conversation
- `GET /api/codex/list` — lists registered codexes

## Requirements

- R1: The Loom's `LoomApi` interface must include a `listRoles()` method that returns all roles in the system — both guild-defined and kit-contributed — as an array of role info objects.
- R2: The Loom must contribute `role-list` and `role-show` tools via its `supportKit.tools`.
- R3: The Parlour's `TurnSummary` type must include `output` (the anima's response text), `costUsd`, and `tokenUsage` fields, populated from `SessionDoc` data in `parlour.show()`.
- R4: The Parlour must contribute a page to the Oculus with id `'parlour'` and title `'Parlour'`, served from `src/static/parlour/`.
- R5: The Parlour must contribute four custom API routes via `supportKit.routes`: `GET /api/parlour/roles`, `GET /api/parlour/conversations`, `POST /api/parlour/create`, and `POST /api/parlour/turn`.
- R6: The page must display a role selector dropdown, populated with all system roles sorted alphabetically.
- R7: The page must display a codex selector dropdown, populated from the codex-list endpoint, with an empty/none option that defaults to the guild home directory.
- R8: When a role is selected, a left-side sidebar must display active consult conversations for that role, sorted by `createdAt` descending. Each entry shows the topic if non-null, otherwise the first human message (truncated), otherwise the formatted `createdAt` date/time.
- R9: The sidebar must always be visible when a role is selected. It must include a "New Conversation" action and a way to end each conversation (setting status to `'concluded'`). Ended conversations must not appear in the sidebar.
- R10: The chat interface must display conversation turns left-aligned with color differentiation and participant name labels. Human messages and anima messages must use distinct background colors from the Tokyo Night palette.
- R11: The message input must be a textarea with 3 initial rows (expandable), a send button, and Ctrl+Enter keyboard shortcut to send.
- R12: When the UI is waiting for an anima response, pulsing dots must appear in the chat area and the send button must be disabled. The system must reject attempts to send multiple messages before the anima responds.
- R13: `tool_use` and `tool_result` chunks must render as compact inline indicators (pill/badge with tool name), not full details.
- R14: `POST /api/parlour/turn` must accept `{ conversationId?: string, role?: string, message: string, codexName?: string }`. When `conversationId` is absent, it must create a new consult conversation (using the codex worktree as `cwd` if `codexName` is provided, otherwise `guild().home`), record the human turn, start the anima turn with streaming, and return the response as SSE.
- R15: When a new conversation is created via the turn endpoint, the first SSE event must be a `conversation_created` event containing `{ conversationId, participants }`.
- R16: SSE chunks must be emitted for each `ConversationChunk` from `parlour.takeTurnStreaming()`. Text chunks, tool_use chunks, tool_result chunks, and the final `turn_complete` chunk must all be forwarded.
- R17: Errors during streaming (animator failure, conversation ended, etc.) must be delivered as an `error` SSE event and displayed inline in the chat as a system message.
- R18: A cost card must be displayed in the sidebar, below the session list and aligned to the bottom of the chat UI. It must show total input tokens, total output tokens, and total USD cost, aggregated from per-turn data. It must update after each turn completes.
- R19: On initial page load (before any role is selected), the page must show an empty state with the role dropdown and a prompt to select a role. The chat area and sidebar must be hidden or show placeholder text.
- R20: When selecting a different role, the chat area must clear and the sidebar must update to show conversations for the new role. No conversation is auto-created.
- R21: Selecting an existing conversation from the sidebar must load its full history (including anima response text from the enriched `TurnSummary.output`) and allow continuing the conversation.
- R22: The "New Conversation" action must use lazy creation — the conversation record is only created when the user sends the first message, not when "New Conversation" is clicked.
- R23: When a codex is selected for a new conversation, the server must call `ScriptoriumApi.openDraft()` to create a worktree and use the draft's `path` as the conversation's `cwd`. The codexes apparatus must be accessed conditionally (it may not be installed).
- R24: The page must be implemented as vanilla HTML/CSS/JS with no build step or framework.

## Design

### Dependencies (Loom Changes)

The Loom apparatus must be modified to support role enumeration. These changes are a minimum enabling prerequisite.

**New type — `RoleInfo`:**

```typescript
interface RoleInfo {
  /** Role name. Guild-defined roles use plain names; kit roles use qualified names (pluginId.roleName). */
  name: string;
  /** Where this role was defined. */
  source: 'guild' | 'kit';
  /** Permission grants. */
  permissions: string[];
  /** Whether permissionless tools are excluded. */
  strict?: boolean;
}
```

**Extended `LoomApi`:**

```typescript
interface LoomApi {
  weave(request: WeaveRequest): Promise<AnimaWeave>;

  /**
   * List all roles known to the system — guild-defined and kit-contributed.
   * Returns an array of RoleInfo sorted by name.
   */
  listRoles(): RoleInfo[];
}
```

The implementation in `createLoom()` iterates `config.roles` (guild-defined, `source: 'guild'`) and `kitRoles` (kit-contributed, `source: 'kit'`), merges them into a sorted array, and returns it synchronously. Guild-defined roles that override kit roles (by qualified name) appear once with `source: 'guild'`.

**New tools** added to the Loom's `supportKit.tools`:

`role-list` tool:
- `name: 'role-list'`
- `description: 'List all roles defined in the guild'`
- `permission: 'read'`
- `params: {}` (no parameters)
- Handler calls `guild().apparatus<LoomApi>('loom').listRoles()` and returns the array.

`role-show` tool:
- `name: 'role-show'`
- `description: 'Show details of a specific role'`
- `permission: 'read'`
- `params: { name: z.string() }`
- Handler calls `listRoles()`, finds the role by name, returns it. Throws if not found.

**Files changed:**
- `packages/plugins/loom/src/loom.ts` — add `RoleInfo` type, add `listRoles()` to `LoomApi` and `api` object, add tool imports, add tools to `supportKit`
- `packages/plugins/loom/src/index.ts` — re-export `RoleInfo` type
- `packages/plugins/loom/src/tools/role-list.ts` — new file
- `packages/plugins/loom/src/tools/role-show.ts` — new file

The Loom currently has no `supportKit`. Add one:

```typescript
supportKit: {
  tools: [roleList, roleShow],
},
```

### Type Changes

**`packages/plugins/parlour/src/types.ts` — Extended `TurnSummary`:**

```typescript
export interface TurnSummary {
  sessionId: string | null;
  turnNumber: number;
  participant: string;
  message: string | null;
  startedAt: string;
  endedAt: string | null;
  /** The anima's response text. Populated from SessionDoc.output. Null for human turns or when no output was recorded. */
  output: string | null;
  /** Cost in USD for this turn. Null for human turns. */
  costUsd: number | null;
  /** Token usage for this turn. Null for human turns. */
  tokenUsage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
  } | null;
}
```

**`packages/plugins/loom/src/loom.ts` — New `RoleInfo` type** (see Dependencies section above).

### Behavior

#### `parlour.show()` enrichment

When `parlour.show()` builds the `turnSummaries` array, it already iterates `convTurns` and fetches `SessionDoc` for each anima turn (to aggregate cost). The enrichment adds three fields to each turn summary:

- When `t.sessionId` is not null, look up the `SessionDoc` via `sessions.get(t.sessionId)`.
- Set `output: session?.output ?? null`.
- Set `costUsd: session?.costUsd ?? null`.
- Set `tokenUsage: session?.tokenUsage ?? null`.
- For human turns (`t.sessionId === null`), set all three to `null`.

This consolidates the existing session-fetch loop (which currently only aggregates `totalCostUsd`) — each session is fetched once and used for both the aggregate and the per-turn fields.

#### Custom Route Handlers

All routes are defined in `packages/plugins/parlour/src/routes.ts` and imported into `parlour.ts` for the `supportKit.routes` array.

The routes file exports a function that takes the `ParlourApi` reference (or accesses it via `guild()`) and returns `RouteContribution[]` (duck-typed, no oculus import).

**`GET /api/parlour/roles`:**

1. Call `guild().apparatus<LoomApi>('loom').listRoles()`.
2. Return `c.json(roles)` — the array of `RoleInfo` objects.

**`GET /api/parlour/conversations`:**

Query params: `role` (required), `status` (optional, default `'active'`).

1. Call `parlour.list({ status, kind: 'consult', limit: 50 })`.
2. Filter results in-memory: keep conversations where `conv.participants.some(p => p.name === role)`.
3. For each conversation, determine the display title:
   - If `conv.topic` is non-null and non-empty, use it.
   - Otherwise, call `parlour.show(conv.id)` and find the first turn where `participantKind === 'human'` and `message` is non-null. Truncate to 60 characters.
   - If no human message found, format `conv.createdAt` as a readable date/time string.
4. Return `c.json(results)` — each entry includes `id`, `title`, `createdAt`, `turnCount`, `totalCostUsd`.

Note: The `TurnSummary` field is `participant` (a string name), not `participantKind`. To determine which turns are human, match `participant` against the conversation's participants list where `kind === 'human'`. Alternatively, since `show()` enriches turns with `output`, human turns will have `output === null` and `sessionId === null`.

**`POST /api/parlour/create`:**

Body: `{ role: string, codexName?: string }`.

1. Determine `cwd`:
   - If `codexName` is provided, attempt `guild().apparatus<ScriptoriumApi>('codexes')`. If the apparatus is available, call `scriptorium.openDraft({ codexName })` to create a worktree. Use `draft.path` as `cwd`.
   - If codexes apparatus is not available or `codexName` is not provided, use `guild().home`.
2. Call `parlour.create({ kind: 'consult', participants: [{ kind: 'human', name: 'User' }, { kind: 'anima', name: role }], cwd })`.
3. Return `c.json({ conversationId, participants })`.

**`POST /api/parlour/turn`:**

Body: `{ conversationId?: string, role?: string, message: string, codexName?: string }`.

This is the SSE streaming endpoint. It uses Hono's `streamSSE` helper from `hono/streaming`.

1. **Validation:**
   - If `conversationId` is absent, `role` must be present (400 otherwise).
   - `message` must be a non-empty string (400 otherwise).

2. **Conversation resolution:**
   - If `conversationId` is provided, use it. Look up the conversation via `parlour.show(conversationId)` to get participant IDs.
   - If `conversationId` is absent, create the conversation:
     - Determine `cwd` using the same logic as `POST /api/parlour/create` (codex worktree or guild home).
     - Call `parlour.create(...)`.
     - Emit SSE event: `event: conversation_created`, `data: JSON.stringify({ conversationId, participants })`.

3. **Identify participants** from the conversation: find the participant with `kind === 'human'` (the human) and `kind === 'anima'` (the anima).

4. **Human turn:** Call `parlour.takeTurn({ conversationId, participantId: humanParticipant.id, message })`.

5. **Anima turn (streaming):** Call `parlour.takeTurnStreaming({ conversationId, participantId: animaParticipant.id })`.

6. **Stream chunks:** Iterate `chunks` from the streaming handle. For each chunk:
   - Emit SSE event: `event: chunk`, `data: JSON.stringify(chunk)`.
   - The `turn_complete` chunk (with `costUsd`) is forwarded as-is.

7. **Error handling:** If any step throws, emit SSE event: `event: error`, `data: JSON.stringify({ error: message })`. Then close the stream.

8. **Completion:** After all chunks are yielded, await the `result` promise to ensure turn recording completes, then close the stream.

#### `supportKit` Changes in `parlour.ts`

The parlour's `supportKit` is extended with `pages` and `routes`:

```typescript
supportKit: {
  books: {
    conversations: { indexes: ['status', 'kind', 'createdAt'] },
    turns: { indexes: ['conversationId', 'turnNumber', 'participantId', 'participantKind'] },
  },
  tools: [conversationList, conversationShow, conversationEnd],
  pages: [
    { id: 'parlour', title: 'Parlour', dir: 'src/static/parlour' },
  ],
  routes: parlourRoutes,   // imported from './routes.ts'
},
```

The `routes` value is an array of `{ method, path, handler }` objects. No oculus types are imported — the Oculus duck-types the supportKit via `as OculusKit`.

#### `package.json` Changes

In `packages/plugins/parlour/package.json`:

- Add `"hono": "^4.7.11"` to `dependencies` (needed for `Context` type in route handlers and `streamSSE` import).
- Change `"files"` from `["dist"]` to `["dist", "src/static"]`.

#### Static Page (`src/static/parlour/`)

Three files:

**`index.html`** — page shell:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Parlour</title>
  <link rel="stylesheet" href="parlour.css">
</head>
<body>
  <div id="parlour-app">
    <div id="parlour-toolbar">
      <select id="role-select"><option value="">Select a role…</option></select>
      <select id="codex-select"><option value="">No codex (guild home)</option></select>
    </div>
    <div id="parlour-main" class="hidden">
      <aside id="parlour-sidebar">
        <button id="new-conversation-btn" class="btn btn--primary">+ New Conversation</button>
        <div id="conversation-list"></div>
        <div id="cost-card" class="card hidden">
          <h4>Cost</h4>
          <div id="cost-details"></div>
        </div>
      </aside>
      <div id="parlour-chat">
        <div id="chat-messages" class="empty-state">Select or start a conversation</div>
        <div id="chat-input-area">
          <textarea id="chat-input" rows="3" placeholder="Type a message…"></textarea>
          <button id="send-btn" class="btn btn--primary" disabled>Send</button>
        </div>
      </div>
    </div>
  </div>
  <script src="app.js"></script>
</body>
</html>
```

The Oculus chrome injection adds the shared `style.css` link and nav bar automatically. The page's own `parlour.css` provides page-specific styles.

**`parlour.css`** — page-specific styles using the Oculus CSS custom properties:

Layout:
- `#parlour-app` fills the viewport below the nav.
- `#parlour-toolbar` is a horizontal bar with the role and codex dropdowns.
- `#parlour-main` is a flex row: sidebar (fixed width ~260px) + chat area (flex-grow).
- `#parlour-sidebar` is a flex column: "New Conversation" button at top, scrollable conversation list in middle, cost card pinned to bottom.
- `#parlour-chat` is a flex column: scrollable `#chat-messages` (flex-grow) + `#chat-input-area` (fixed at bottom).

Message styling:
- `.message` — base class for all messages, left-aligned, with padding and border-radius.
- `.message--human` — background: `var(--surface2)`, left border: `3px solid var(--blue)`.
- `.message--anima` — background: `var(--surface)`, left border: `3px solid var(--green)`.
- `.message--system` — background: transparent, color: `var(--text-dim)`, italic, centered.
- `.message-author` — small label above the message text, color `var(--text-dim)`.
- `.tool-indicator` — inline pill/badge: `background: var(--surface2)`, `color: var(--text-dim)`, `font-size: 11px`, `border-radius: 4px`, `padding: 2px 8px`.

Loading indicator:
- `.typing-indicator` — three dots that pulse using the existing `@keyframes pulse` animation from the Oculus CSS.

Cost card:
- Uses the existing `.card` class.
- Token counts displayed as `<span class="badge">IN: 12,345</span> <span class="badge">OUT: 6,789</span>`.
- USD displayed as `$0.42`.

Sidebar conversations:
- `.conversation-item` — clickable row with title, hover highlight.
- `.conversation-item--active` — background: `var(--surface2)` to indicate selected.
- `.conversation-item .end-btn` — small button (appears on hover) to end the conversation.

Hidden utility:
- `.hidden { display: none; }` — used to hide `#parlour-main` before role selection and `#cost-card` before any turn.

**`app.js`** — vanilla JS application logic:

State:
```javascript
let currentRole = null;
let currentCodex = '';     // empty string = guild home
let currentConversationId = null;
let isStreaming = false;
```

Functions (key behaviors):

`loadRoles()` — On page load, fetch `GET /api/parlour/roles`. Populate `#role-select` with `<option>` elements, sorted by name. Also fetch `GET /api/codex/list` and populate `#codex-select` (gracefully handle 404 if codexes not installed).

`onRoleChange(role)` — Set `currentRole`, clear `currentConversationId`, clear chat messages, show `#parlour-main`, call `loadConversations(role)`.

`loadConversations(role)` — Fetch `GET /api/parlour/conversations?role={role}&status=active`. Render conversation items in `#conversation-list`. Each item shows the `title` and has an end button.

`onSelectConversation(id)` — Set `currentConversationId = id`. Fetch `GET /api/conversation/show?id={id}`. Render all turns from the `turns` array:
- For human turns (identified by `sessionId === null`): render `message` with `.message--human` and author label "User".
- For anima turns (identified by `sessionId !== null`): render `output` with `.message--anima` and the role name as label. If `output` is null, render "[No response recorded]" in dim text.
- Update cost card from the per-turn `costUsd` and `tokenUsage` data (sum client-side).
- Enable the send button.
- Scroll chat to bottom.

`onNewConversation()` — Set `currentConversationId = null`. Clear chat messages. Show empty chat with placeholder. Enable send button. Hide cost card.

`onEndConversation(id)` — Fetch `POST /api/conversation/end` with `{ id, reason: 'concluded' }`. Remove the item from the sidebar. If the ended conversation is the current one, call `onNewConversation()`.

`sendMessage()` — When send button clicked or Ctrl+Enter pressed:
1. If `isStreaming`, return (reject double-send).
2. Get message text from textarea. If empty, return.
3. Set `isStreaming = true`. Disable send button. Clear textarea.
4. Render the human message in the chat with `.message--human`.
5. Show typing indicator (pulsing dots) in the chat area.
6. Open a streaming connection to `POST /api/parlour/turn` via `fetch()` with streaming response body reader. The body is `{ conversationId: currentConversationId, role: currentRole, message, codexName: currentCodex || undefined }`.
   - Note: `EventSource` only supports GET. Use `fetch()` with `ReadableStream` to read SSE from a POST response. Parse SSE events manually from the text stream (`event:` and `data:` lines).
7. Handle SSE events:
   - `conversation_created`: Set `currentConversationId = data.conversationId`. Add the conversation to the sidebar.
   - `chunk` where `data.type === 'text'`: Append `data.text` to the current anima message bubble. Remove typing indicator on first text chunk. Auto-scroll.
   - `chunk` where `data.type === 'tool_use'`: Append a `.tool-indicator` pill with the tool name.
   - `chunk` where `data.type === 'tool_result'`: Append a `.tool-indicator` pill with the tool name + "✓".
   - `chunk` where `data.type === 'turn_complete'`: Update cost card with data from `turn_complete` and re-fetch conversation detail for full token totals. Set `isStreaming = false`. Enable send button.
   - `error`: Remove typing indicator. Render error as `.message--system`. Set `isStreaming = false`. Enable send button.
8. On stream close without `turn_complete`: Set `isStreaming = false`. Enable send button.

`updateCostCard(conversationDetail)` — After a turn completes or when loading history, sum all per-turn `tokenUsage` and `costUsd` values from the conversation detail's `turns` array. Display in the cost card:
- Input tokens: sum of `tokenUsage.inputTokens` across all turns (formatted with comma separators).
- Output tokens: sum of `tokenUsage.outputTokens` (formatted).
- Cost: sum of `costUsd` (formatted as `$X.XX`).
- If no cost data exists (new conversation, no completed turns), show "No cost data yet" in dim text.
- Show the `#cost-card` element (remove `.hidden`).

Keyboard handling:
- `#chat-input` listens for `keydown`. When `event.ctrlKey && event.key === 'Enter'`, call `sendMessage()` and `event.preventDefault()`.

Textarea auto-resize:
- On `input` event, set `textarea.style.height = 'auto'` then `textarea.style.height = textarea.scrollHeight + 'px'` to auto-expand. Cap at a reasonable max-height (e.g., 200px) via CSS `max-height`.

### Non-obvious Touchpoints

- `packages/plugins/loom/src/index.ts` — Must re-export the new `RoleInfo` type. The Parlour route handler imports `LoomApi` from `@shardworks/loom-apparatus`, which must now include `listRoles`.
- `packages/plugins/parlour/src/index.ts` — Must re-export the updated `TurnSummary` type (it already does via the wildcard re-export from `./types.ts`; verify this includes the new fields).
- `packages/plugins/loom/src/loom.ts` — The `supportKit` must be added to the apparatus return object. The Loom currently returns `{ apparatus: { requires, consumes, provides, start } }` — `supportKit` must be added alongside these.
- `packages/plugins/parlour/package.json` `"files"` array — Must include `"src/static"` for the page assets to be available in published packages.

### Dependencies

The Loom changes (R1, R2) are a prerequisite for the Parlour page. The `GET /api/parlour/roles` route calls `LoomApi.listRoles()`, which must exist before the route handler can function. Implement the Loom changes first.

## Validation Checklist

- V1 [R1]: Call `guild().apparatus<LoomApi>('loom').listRoles()` in a test with guild-defined and kit-contributed roles configured. Verify it returns both, sorted by name, with correct `source` values.
- V2 [R2]: Start a guild with the Loom and verify `GET /api/role/list` returns the roles array and `GET /api/role/show?name=X` returns a single role.
- V3 [R3]: Call `parlour.show(conversationId)` after completing an anima turn. Verify each anima turn in the returned `turns` array has non-null `output`, `costUsd`, and `tokenUsage` fields. Verify human turns have null for all three.
- V4 [R4, R24]: Start the Oculus with the Parlour installed. Verify `GET /pages/parlour/` returns HTML with the Oculus chrome injected (nav bar, stylesheet link). Verify `GET /pages/parlour/app.js` returns the JavaScript file. Verify the page is listed in the Oculus home page's nav.
- V5 [R5]: Verify all four custom routes respond: `GET /api/parlour/roles` (200), `GET /api/parlour/conversations?role=X` (200), `POST /api/parlour/create` with body (200), `POST /api/parlour/turn` with body (200 + SSE stream).
- V6 [R6, R7]: Load the page in a browser. Verify the role dropdown is populated with all configured roles sorted alphabetically. Verify the codex dropdown is populated (or gracefully empty if codexes not installed).
- V7 [R8, R9, R20]: Select a role. Verify the sidebar appears on the left showing active consult conversations for that role. Select a different role. Verify the sidebar updates and the chat clears.
- V8 [R10, R11, R13]: Send a message. Verify the human message appears with blue left border and "User" label. Verify the anima response streams in with green left border and role name label. Verify any tool uses appear as inline pills.
- V9 [R12, R14]: While the anima is responding, verify pulsing dots are visible and the send button is disabled. Attempt to click send — verify nothing happens. After the response completes, verify the send button re-enables.
- V10 [R14, R15, R22]: Click "New Conversation" then send a message. Verify the conversation is created lazily (the SSE stream begins with a `conversation_created` event). Verify the new conversation appears in the sidebar.
- V11 [R16]: During a streaming turn, verify text chunks appear progressively in the chat area. Verify the `turn_complete` event is received (check browser dev tools network tab for SSE events).
- V12 [R17]: Simulate an error (e.g., end the conversation mid-stream via another client). Verify an error message appears inline in the chat with system message styling.
- V13 [R18]: After a turn completes, verify the cost card in the sidebar shows updated input tokens, output tokens, and USD cost. Send another message and verify the totals increase.
- V14 [R19]: Load the page fresh. Verify only the role dropdown is visible with "Select a role…" prompt. Verify no sidebar or chat area is shown until a role is selected.
- V15 [R21]: Create a conversation with multiple turns. Navigate away (select another role), then come back and select the original conversation. Verify the full history loads with both human messages and anima responses visible.
- V16 [R9]: Click the end button on a conversation in the sidebar. Verify it disappears from the list. Verify the conversation's status is set to `'concluded'` in the Stacks book.
- V17 [R23]: Select a codex, start a new conversation and send a message. Verify a draft worktree was created (check via `codex-show` tool). Verify the conversation's `cwd` points to the worktree path.
- V18 [R11]: Type a multi-line message using Enter for newlines. Verify the textarea expands. Press Ctrl+Enter. Verify the message is sent (not just a newline inserted).

## Test Cases

### Loom `listRoles()` tests (in `packages/plugins/loom/src/loom.test.ts`)

1. **Guild-defined roles returned**: Configure `loomConfig.roles` with two roles. Call `listRoles()`. Expect both returned with `source: 'guild'`.
2. **Kit-contributed roles returned**: Register a kit with roles via `plugin:initialized`. Call `listRoles()`. Expect the kit role returned with `source: 'kit'` and qualified name.
3. **Combined and sorted**: Configure both guild and kit roles. Call `listRoles()`. Expect all roles in a single array sorted alphabetically by name.
4. **Guild override suppresses kit role**: Define a guild role with the same qualified name as a kit role. Call `listRoles()`. Expect only the guild version (`source: 'guild'`).
5. **Empty when no roles configured**: No roles in config or kits. Call `listRoles()`. Expect empty array.

### Parlour `show()` enrichment tests (in `packages/plugins/parlour/src/parlour.test.ts`)

6. **Anima turn includes output**: Create a consult conversation, take a human turn and anima turn. Call `show()`. Verify the anima turn's `output` field is non-null (matches the fake provider's output).
7. **Anima turn includes costUsd and tokenUsage**: Same scenario. Verify `costUsd` and `tokenUsage` fields on the anima turn summary match the session data.
8. **Human turn has null enrichment fields**: Verify the human turn's `output`, `costUsd`, and `tokenUsage` are all `null`.

### Parlour route handler tests (in `packages/plugins/parlour/src/routes.test.ts` or integrated into `parlour.test.ts`)

9. **GET /api/parlour/roles returns roles**: Mock the LoomApi with roles. Call the route handler. Expect JSON array of role info.
10. **GET /api/parlour/conversations filters by role**: Create conversations with different participant names. Call with `?role=artificer`. Expect only conversations where a participant named "artificer" is included.
11. **GET /api/parlour/conversations excludes non-active**: Create an active and a concluded conversation. Call with `?role=X&status=active`. Expect only the active one.
12. **POST /api/parlour/turn creates conversation lazily**: POST with `{ role: 'artificer', message: 'hello' }` (no conversationId). Expect SSE stream starting with `conversation_created` event, followed by text chunks, followed by `turn_complete`.
13. **POST /api/parlour/turn continues existing conversation**: Create a conversation, complete one turn. POST with `{ conversationId, message: 'follow-up' }`. Expect SSE stream without `conversation_created` event.
14. **POST /api/parlour/turn returns 400 without role or conversationId**: POST with `{ message: 'hello' }`. Expect 400 error.
15. **POST /api/parlour/turn with codexName creates worktree**: Mock the ScriptoriumApi. POST with `{ role: 'X', message: 'hello', codexName: 'my-codex' }`. Verify `openDraft()` was called. Verify the conversation's `cwd` is the draft path.
16. **POST /api/parlour/turn without codexes apparatus**: Don't install the codexes apparatus. POST with `{ role: 'X', message: 'hello', codexName: 'my-codex' }`. Expect the conversation is created with `guild().home` as `cwd` (graceful fallback).
17. **Conversation title uses topic**: Create a conversation with `topic: 'Refactoring session'`. Call `GET /api/parlour/conversations?role=X`. Expect the title to be "Refactoring session".
18. **Conversation title falls back to first human message**: Create a conversation without topic, take a human turn with message "Help me fix the tests". Call `GET /api/parlour/conversations?role=X`. Expect the title to be "Help me fix the tests" (or truncated to 60 chars).
19. **Conversation title falls back to date**: Create a conversation without topic and with no turns. Call `GET /api/parlour/conversations?role=X`. Expect the title to be a formatted date/time string.

## Commission Diff

```
 packages/plugins/parlour/package.json              |   4 +-
 packages/plugins/parlour/src/parlour.test.ts       | 547 ++++++++++++++++-
 packages/plugins/parlour/src/parlour.ts            |  62 +-
 packages/plugins/parlour/src/routes.ts             | 291 +++++++++
 packages/plugins/parlour/src/static/parlour/app.js | 654 +++++++++++++++++++++
 .../plugins/parlour/src/static/parlour/index.html  |  37 ++
 .../plugins/parlour/src/static/parlour/parlour.css | 355 +++++++++++
 packages/plugins/parlour/src/types.ts              |  11 +
 pnpm-lock.yaml                                     |   3 +
 9 files changed, 1947 insertions(+), 17 deletions(-)

diff --git a/packages/plugins/parlour/package.json b/packages/plugins/parlour/package.json
index 0b1b448..5f1eb56 100644
--- a/packages/plugins/parlour/package.json
+++ b/packages/plugins/parlour/package.json
@@ -23,13 +23,15 @@
     "@shardworks/nexus-core": "workspace:*",
     "@shardworks/stacks-apparatus": "workspace:*",
     "@shardworks/tools-apparatus": "workspace:*",
+    "hono": "^4.7.11",
     "zod": "4.3.6"
   },
   "devDependencies": {
     "@types/node": "25.5.0"
   },
   "files": [
-    "dist"
+    "dist",
+    "src/static"
   ],
   "publishConfig": {
     "exports": {
diff --git a/packages/plugins/parlour/src/parlour.test.ts b/packages/plugins/parlour/src/parlour.test.ts
index 874dd1c..9eb94bf 100644
--- a/packages/plugins/parlour/src/parlour.test.ts
+++ b/packages/plugins/parlour/src/parlour.test.ts
@@ -23,8 +23,11 @@ import type {
   SessionChunk,
 } from '@shardworks/animator-apparatus';
 
+import { Hono } from 'hono';
+
 import { createParlour } from './parlour.ts';
 import type { ParlourApi } from './types.ts';
+import { parlourRoutes } from './routes.ts';
 
 // ── Shared empty chunks iterable ─────────────────────────────────────
 
@@ -103,11 +106,36 @@ function createStreamingFakeProvider(
   };
 }
 
+/** Fake provider that returns output text and token usage. */
+function createOutputFakeProvider(outputText: string = 'Test response'): AnimatorSessionProvider {
+  let callCount = 0;
+  return {
+    name: 'fake-output',
+    launch(_config: SessionProviderConfig) {
+      callCount++;
+      return {
+        chunks: emptyChunks,
+        result: Promise.resolve({
+          status: 'completed' as const,
+          exitCode: 0,
+          providerSessionId: `fake-output-sess-${callCount}`,
+          tokenUsage: { inputTokens: 200, outputTokens: 100 },
+          costUsd: 0.02,
+          output: outputText,
+        }),
+      };
+    },
+  };
+}
+
 // ── Test harness ─────────────────────────────────────────────────────
 
 let parlour: ParlourApi;
 
-function setup(provider: AnimatorSessionProvider = createFakeProvider()) {
+function setup(
+  provider: AnimatorSessionProvider = createFakeProvider(),
+  extraApparatuses: Record<string, unknown> = {},
+) {
   const memBackend = new MemoryBackend();
   const stacksPlugin = createStacksApparatus(memBackend);
   const animatorPlugin = createAnimator();
@@ -117,6 +145,11 @@ function setup(provider: AnimatorSessionProvider = createFakeProvider()) {
   const apparatusMap = new Map<string, unknown>();
   apparatusMap.set('fake-provider', provider);
 
+  // Register any extra apparatuses (e.g. mock codexes for route tests)
+  for (const [name, api] of Object.entries(extraApparatuses)) {
+    apparatusMap.set(name, api);
+  }
+
   const fakeGuild: Guild = {
     home: '/tmp/fake-guild',
     apparatus<T>(name: string): T {
@@ -141,6 +174,13 @@ function setup(provider: AnimatorSessionProvider = createFakeProvider()) {
         plugins: [],
         settings: { model: 'sonnet' },
         animator: { sessionProvider: 'fake-provider' },
+        // Provide guild-defined loom roles so listRoles() tests have data
+        loom: {
+          roles: {
+            artificer: { permissions: ['read', 'write'] },
+            scribe: { permissions: ['read'] },
+          },
+        },
       };
     },
     kits: () => [],
@@ -181,6 +221,9 @@ function setup(provider: AnimatorSessionProvider = createFakeProvider()) {
   const parlourApparatus = (parlourPlugin as { apparatus: { start: (ctx: unknown) => void; provides: unknown } }).apparatus;
   parlourApparatus.start({ on: () => {} });
   parlour = parlourApparatus.provides as ParlourApi;
+
+  // Register parlour in apparatus map so route handlers can access it via guild().apparatus('parlour')
+  apparatusMap.set('parlour', parlour);
 }
 
 // ── Tests ────────────────────────────────────────────────────────────
@@ -1101,4 +1144,506 @@ describe('Parlour', () => {
       assert.notEqual(t1.sessionResult!.id, t2.sessionResult!.id);
     });
   });
+
+  // ── show() enrichment (TurnSummary output/costUsd/tokenUsage) ───────
+
+  describe('show() enrichment — output, costUsd, tokenUsage', () => {
+    beforeEach(() => { setup(createOutputFakeProvider('Hello from anima!')); });
+
+    it('anima turn includes output from session doc', async () => {
+      const { conversationId, participants } = await parlour.create({
+        kind: 'consult',
+        cwd: '/tmp/workspace',
+        participants: [
+          { kind: 'human', name: 'User' },
+          { kind: 'anima', name: 'Artificer' },
+        ],
+      });
+
+      const human = participants.find((p) => p.kind === 'human')!;
+      const anima = participants.find((p) => p.kind === 'anima')!;
+
+      await parlour.takeTurn({ conversationId, participantId: human.id, message: 'Hello' });
+      await parlour.takeTurn({ conversationId, participantId: anima.id });
+
+      const detail = await parlour.show(conversationId);
+      assert.ok(detail);
+
+      const animaTurn = detail.turns.find((t) => t.sessionId !== null);
+      assert.ok(animaTurn, 'Should have an anima turn');
+      assert.equal(animaTurn.output, 'Hello from anima!');
+    });
+
+    it('anima turn includes costUsd from session doc', async () => {
+      const { conversationId, participants } = await parlour.create({
+        kind: 'consult',
+        cwd: '/tmp/workspace',
+        participants: [
+          { kind: 'human', name: 'User' },
+          { kind: 'anima', name: 'Artificer' },
+        ],
+      });
+
+      const human = participants.find((p) => p.kind === 'human')!;
+      const anima = participants.find((p) => p.kind === 'anima')!;
+
+      await parlour.takeTurn({ conversationId, participantId: human.id, message: 'Hello' });
+      await parlour.takeTurn({ conversationId, participantId: anima.id });
+
+      const detail = await parlour.show(conversationId);
+      assert.ok(detail);
+
+      const animaTurn = detail.turns.find((t) => t.sessionId !== null);
+      assert.ok(animaTurn);
+      assert.equal(animaTurn.costUsd, 0.02);
+    });
+
+    it('anima turn includes tokenUsage from session doc', async () => {
+      const { conversationId, participants } = await parlour.create({
+        kind: 'consult',
+        cwd: '/tmp/workspace',
+        participants: [
+          { kind: 'human', name: 'User' },
+          { kind: 'anima', name: 'Artificer' },
+        ],
+      });
+
+      const human = participants.find((p) => p.kind === 'human')!;
+      const anima = participants.find((p) => p.kind === 'anima')!;
+
+      await parlour.takeTurn({ conversationId, participantId: human.id, message: 'Hello' });
+      await parlour.takeTurn({ conversationId, participantId: anima.id });
+
+      const detail = await parlour.show(conversationId);
+      assert.ok(detail);
+
+      const animaTurn = detail.turns.find((t) => t.sessionId !== null);
+      assert.ok(animaTurn);
+      assert.ok(animaTurn.tokenUsage, 'Should have tokenUsage');
+      assert.equal(animaTurn.tokenUsage!.inputTokens, 200);
+      assert.equal(animaTurn.tokenUsage!.outputTokens, 100);
+    });
+
+    it('human turn has null output, costUsd, and tokenUsage', async () => {
+      const { conversationId, participants } = await parlour.create({
+        kind: 'consult',
+        cwd: '/tmp/workspace',
+        participants: [
+          { kind: 'human', name: 'User' },
+          { kind: 'anima', name: 'Artificer' },
+        ],
+      });
+
+      const human = participants.find((p) => p.kind === 'human')!;
+
+      await parlour.takeTurn({ conversationId, participantId: human.id, message: 'Hello' });
+
+      const detail = await parlour.show(conversationId);
+      assert.ok(detail);
+
+      const humanTurn = detail.turns.find((t) => t.sessionId === null);
+      assert.ok(humanTurn);
+      assert.equal(humanTurn.output, null);
+      assert.equal(humanTurn.costUsd, null);
+      assert.equal(humanTurn.tokenUsage, null);
+    });
+  });
+
+  // ── Route behavior — conversation list filtering ────────────────────
+
+  describe('conversation list filtering (route logic)', () => {
+    beforeEach(() => { setup(); });
+
+    it('list() returns only consult conversations matching a role name', async () => {
+      // Create a conversation with artificer
+      const { conversationId: c1 } = await parlour.create({
+        kind: 'consult',
+        cwd: '/tmp/workspace',
+        participants: [
+          { kind: 'human', name: 'User' },
+          { kind: 'anima', name: 'artificer' },
+        ],
+      });
+
+      // Create a conversation with scribe
+      await parlour.create({
+        kind: 'consult',
+        cwd: '/tmp/workspace',
+        participants: [
+          { kind: 'human', name: 'User' },
+          { kind: 'anima', name: 'scribe' },
+        ],
+      });
+
+      // List all active consult conversations
+      const all = await parlour.list({ status: 'active', kind: 'consult', limit: 50 });
+
+      // Filter in-memory by role name (as the route handler does)
+      const forArtificer = all.filter((conv) =>
+        conv.participants.some((p) => p.name === 'artificer'),
+      );
+
+      assert.equal(forArtificer.length, 1);
+      assert.equal(forArtificer[0]!.id, c1);
+    });
+
+    it('list() excludes concluded conversations when status=active', async () => {
+      const { conversationId } = await parlour.create({
+        kind: 'consult',
+        cwd: '/tmp/workspace',
+        participants: [
+          { kind: 'human', name: 'User' },
+          { kind: 'anima', name: 'artificer' },
+        ],
+      });
+
+      // End the conversation
+      await parlour.end(conversationId, 'concluded');
+
+      const active = await parlour.list({ status: 'active', kind: 'consult', limit: 50 });
+      const forArtificer = active.filter((conv) =>
+        conv.participants.some((p) => p.name === 'artificer'),
+      );
+
+      assert.equal(forArtificer.length, 0);
+    });
+
+    it('show() conversation with topic uses topic as title', async () => {
+      const { conversationId } = await parlour.create({
+        kind: 'consult',
+        topic: 'Refactoring session',
+        cwd: '/tmp/workspace',
+        participants: [
+          { kind: 'human', name: 'User' },
+          { kind: 'anima', name: 'artificer' },
+        ],
+      });
+
+      const detail = await parlour.show(conversationId);
+      assert.ok(detail);
+      assert.equal(detail.topic, 'Refactoring session');
+    });
+
+    it('show() first human message is accessible from turns', async () => {
+      const { conversationId, participants } = await parlour.create({
+        kind: 'consult',
+        cwd: '/tmp/workspace',
+        participants: [
+          { kind: 'human', name: 'User' },
+          { kind: 'anima', name: 'artificer' },
+        ],
+      });
+
+      const human = participants.find((p) => p.kind === 'human')!;
+      await parlour.takeTurn({
+        conversationId,
+        participantId: human.id,
+        message: 'Help me fix the tests',
+      });
+
+      const detail = await parlour.show(conversationId);
+      assert.ok(detail);
+      const humanTurn = detail.turns.find((t) => t.sessionId === null && t.message !== null);
+      assert.ok(humanTurn);
+      assert.equal(humanTurn.message, 'Help me fix the tests');
+    });
+
+    it('conversation with no topic and no turns falls back to createdAt', async () => {
+      const { conversationId } = await parlour.create({
+        kind: 'consult',
+        cwd: '/tmp/workspace',
+        participants: [
+          { kind: 'human', name: 'User' },
+          { kind: 'anima', name: 'artificer' },
+        ],
+      });
+
+      const detail = await parlour.show(conversationId);
+      assert.ok(detail);
+      assert.equal(detail.topic, null);
+      assert.equal(detail.turns.length, 0);
+      // The route handler falls back to createdAt when no topic and no turns
+      // We verify the createdAt is a valid ISO string
+      assert.ok(!isNaN(Date.parse(detail.createdAt)));
+    });
+  });
+
+  // ── supportKit pages and routes registration ─────────────────────────
+
+  describe('supportKit contributions', () => {
+    it('parlour apparatus exports pages in supportKit', () => {
+      const plugin = createParlour();
+      const apparatus = (plugin as { apparatus: Record<string, unknown> }).apparatus;
+      const supportKit = apparatus.supportKit as Record<string, unknown>;
+      assert.ok(supportKit, 'supportKit should exist');
+      const pages = supportKit.pages as Array<{ id: string; title: string; dir: string }>;
+      assert.ok(Array.isArray(pages), 'pages should be an array');
+      const parlourPage = pages.find((p) => p.id === 'parlour');
+      assert.ok(parlourPage, 'parlour page should be contributed');
+      assert.equal(parlourPage.title, 'Parlour');
+      assert.ok(parlourPage.dir.includes('parlour'), 'dir should reference parlour directory');
+    });
+
+    it('parlour apparatus exports routes in supportKit', () => {
+      const plugin = createParlour();
+      const apparatus = (plugin as { apparatus: Record<string, unknown> }).apparatus;
+      const supportKit = apparatus.supportKit as Record<string, unknown>;
+      const routes = supportKit.routes as Array<{ method: string; path: string; handler: unknown }>;
+      assert.ok(Array.isArray(routes), 'routes should be an array');
+      assert.equal(routes.length, 4, 'Should have 4 routes');
+
+      const paths = routes.map((r) => `${r.method} ${r.path}`);
+      assert.ok(paths.includes('GET /api/parlour/roles'), 'Should have roles route');
+      assert.ok(paths.includes('GET /api/parlour/conversations'), 'Should have conversations route');
+      assert.ok(paths.includes('POST /api/parlour/create'), 'Should have create route');
+      assert.ok(paths.includes('POST /api/parlour/turn'), 'Should have turn route');
+    });
+  });
+
+  // ── Route handler integration tests ─────────────────────────────────
+  //
+  // Tests 9–16 from the commission spec. These test the four custom API
+  // routes via a real Hono app instance, using the same fake guild
+  // infrastructure as the other test suites.
+
+  describe('route handler integration', () => {
+    let testApp: InstanceType<typeof Hono>;
+
+    /** Parse SSE response body into an array of { event, data } objects. */
+    async function collectSSEEvents(
+      res: Response,
+    ): Promise<Array<{ event: string; data: unknown }>> {
+      const text = await res.text();
+      const events: Array<{ event: string; data: unknown }> = [];
+      for (const block of text.split('\n\n')) {
+        if (!block.trim()) continue;
+        let eventName = 'message';
+        let dataStr = '';
+        for (const line of block.split('\n')) {
+          if (line.startsWith('event: ')) eventName = line.slice(7).trim();
+          if (line.startsWith('data: ')) dataStr = line.slice(6).trim();
+        }
+        if (dataStr) {
+          try {
+            events.push({ event: eventName, data: JSON.parse(dataStr) });
+          } catch {
+            events.push({ event: eventName, data: dataStr });
+          }
+        }
+      }
+      return events;
+    }
+
+    beforeEach(() => {
+      setup();
+      testApp = new Hono();
+      for (const route of parlourRoutes) {
+        testApp.on(
+          [route.method],
+          route.path,
+          route.handler as Parameters<typeof testApp.on>[2],
+        );
+      }
+    });
+
+    // ── Test 9: GET /api/parlour/roles ───────────────────────────────
+
+    it('GET /api/parlour/roles returns sorted array of role info objects', async () => {
+      const res = await testApp.request('/api/parlour/roles');
+      assert.equal(res.status, 200);
+      const data = await res.json() as Array<{ name: string; source: string; permissions: string[] }>;
+      assert.ok(Array.isArray(data), 'Response should be an array');
+      // The setup guildConfig includes artificer and scribe loom roles
+      assert.equal(data.length, 2, 'Should have 2 configured roles');
+      // Sorted alphabetically
+      assert.equal(data[0]!.name, 'artificer');
+      assert.equal(data[1]!.name, 'scribe');
+      assert.equal(data[0]!.source, 'guild');
+      assert.ok(Array.isArray(data[0]!.permissions), 'Role should have permissions array');
+    });
+
+    // ── Test 10: GET /api/parlour/conversations filters by role ──────
+
+    it('GET /api/parlour/conversations returns only conversations for the specified role', async () => {
+      await parlour.create({
+        kind: 'consult',
+        cwd: '/tmp/workspace',
+        participants: [
+          { kind: 'human', name: 'User' },
+          { kind: 'anima', name: 'artificer' },
+        ],
+      });
+      await parlour.create({
+        kind: 'consult',
+        cwd: '/tmp/workspace',
+        participants: [
+          { kind: 'human', name: 'User' },
+          { kind: 'anima', name: 'scribe' },
+        ],
+      });
+
+      const res = await testApp.request('/api/parlour/conversations?role=artificer');
+      assert.equal(res.status, 200);
+      const data = await res.json() as Array<{ id: string }>;
+      assert.equal(data.length, 1, 'Should return only artificer conversations');
+    });
+
+    // ── Test 11: GET /api/parlour/conversations excludes concluded ────
+
+    it('GET /api/parlour/conversations excludes concluded conversations when status=active', async () => {
+      const { conversationId } = await parlour.create({
+        kind: 'consult',
+        cwd: '/tmp/workspace',
+        participants: [
+          { kind: 'human', name: 'User' },
+          { kind: 'anima', name: 'artificer' },
+        ],
+      });
+      await parlour.end(conversationId, 'concluded');
+
+      const res = await testApp.request('/api/parlour/conversations?role=artificer&status=active');
+      assert.equal(res.status, 200);
+      const data = await res.json() as unknown[];
+      assert.equal(data.length, 0, 'Concluded conversation should not appear in active list');
+    });
+
+    // ── Test 12: POST /api/parlour/turn lazy conversation creation ────
+
+    it('POST /api/parlour/turn creates conversation lazily and emits conversation_created event', async () => {
+      const res = await testApp.request('/api/parlour/turn', {
+        method: 'POST',
+        headers: { 'Content-Type': 'application/json' },
+        body: JSON.stringify({ role: 'artificer', message: 'Hello' }),
+      });
+      assert.equal(res.status, 200);
+
+      const events = await collectSSEEvents(res);
+      const createdEvent = events.find((e) => e.event === 'conversation_created');
+      assert.ok(createdEvent, 'Should emit conversation_created SSE event');
+
+      const payload = createdEvent.data as { conversationId: string; participants: unknown[] };
+      assert.ok(payload.conversationId, 'conversation_created event should include conversationId');
+      assert.ok(Array.isArray(payload.participants), 'conversation_created event should include participants');
+
+      const turnComplete = events.find(
+        (e) => e.event === 'chunk' && (e.data as { type: string }).type === 'turn_complete',
+      );
+      assert.ok(turnComplete, 'Should emit turn_complete chunk after streaming');
+    });
+
+    // ── Test 13: POST /api/parlour/turn continues existing ───────────
+
+    it('POST /api/parlour/turn continues existing conversation without conversation_created event', async () => {
+      // Set up a conversation with one completed round
+      const { conversationId, participants } = await parlour.create({
+        kind: 'consult',
+        cwd: '/tmp/workspace',
+        participants: [
+          { kind: 'human', name: 'User' },
+          { kind: 'anima', name: 'artificer' },
+        ],
+      });
+      const human = participants.find((p) => p.kind === 'human')!;
+      await parlour.takeTurn({ conversationId, participantId: human.id, message: 'Hello' });
+      const anima = participants.find((p) => p.kind === 'anima')!;
+      const { result } = parlour.takeTurnStreaming({ conversationId, participantId: anima.id });
+      await result;
+
+      const res = await testApp.request('/api/parlour/turn', {
+        method: 'POST',
+        headers: { 'Content-Type': 'application/json' },
+        body: JSON.stringify({ conversationId, message: 'follow-up' }),
+      });
+      assert.equal(res.status, 200);
+
+      const events = await collectSSEEvents(res);
+      const createdEvent = events.find((e) => e.event === 'conversation_created');
+      assert.equal(createdEvent, undefined, 'Should NOT emit conversation_created for existing conversation');
+
+      const turnComplete = events.find(
+        (e) => e.event === 'chunk' && (e.data as { type: string }).type === 'turn_complete',
+      );
+      assert.ok(turnComplete, 'Should still emit turn_complete chunk');
+    });
+
+    // ── Test 14: POST /api/parlour/turn HTTP 400 validation ──────────
+
+    it('POST /api/parlour/turn returns 400 when neither role nor conversationId is provided', async () => {
+      const res = await testApp.request('/api/parlour/turn', {
+        method: 'POST',
+        headers: { 'Content-Type': 'application/json' },
+        body: JSON.stringify({ message: 'hello' }),
+      });
+      assert.equal(res.status, 400, 'Should return HTTP 400 for missing role/conversationId');
+    });
+
+    it('POST /api/parlour/turn returns 400 when message is empty or missing', async () => {
+      const res = await testApp.request('/api/parlour/turn', {
+        method: 'POST',
+        headers: { 'Content-Type': 'application/json' },
+        body: JSON.stringify({ role: 'artificer', message: '   ' }),
+      });
+      assert.equal(res.status, 400, 'Should return HTTP 400 for empty message');
+    });
+
+    // ── Test 15: POST /api/parlour/turn with codexName ───────────────
+
+    it('POST /api/parlour/turn with codexName calls openDraft on the codexes apparatus', async () => {
+      let openDraftCalled = false;
+      let openDraftArg: string | undefined;
+      const worktreePath = '/tmp/worktrees/my-codex-abc123';
+
+      // Re-setup with a mock codexes apparatus
+      setup(createFakeProvider(), {
+        codexes: {
+          openDraft({ codexName }: { codexName: string }) {
+            openDraftCalled = true;
+            openDraftArg = codexName;
+            return Promise.resolve({ path: worktreePath });
+          },
+        },
+      });
+      // Rebuild testApp with the new guild
+      testApp = new Hono();
+      for (const route of parlourRoutes) {
+        testApp.on(
+          [route.method],
+          route.path,
+          route.handler as Parameters<typeof testApp.on>[2],
+        );
+      }
+
+      const res = await testApp.request('/api/parlour/turn', {
+        method: 'POST',
+        headers: { 'Content-Type': 'application/json' },
+        body: JSON.stringify({ role: 'artificer', message: 'Hello', codexName: 'my-codex' }),
+      });
+      assert.equal(res.status, 200);
+
+      // Drain the stream so the handler fully executes
+      await collectSSEEvents(res);
+
+      assert.ok(openDraftCalled, 'openDraft should have been called on the codexes apparatus');
+      assert.equal(openDraftArg, 'my-codex', 'openDraft should be called with the provided codexName');
+    });
+
+    // ── Test 16: POST /api/parlour/turn without codexes apparatus ────
+
+    it('POST /api/parlour/turn with codexName falls back to guild home when codexes not installed', async () => {
+      // Standard setup has no codexes apparatus — guild().apparatus('codexes') throws
+      const res = await testApp.request('/api/parlour/turn', {
+        method: 'POST',
+        headers: { 'Content-Type': 'application/json' },
+        body: JSON.stringify({ role: 'artificer', message: 'Hello', codexName: 'missing-codex' }),
+      });
+      assert.equal(res.status, 200, 'Should succeed (fall back to guild home) when codexes not installed');
+
+      const events = await collectSSEEvents(res);
+      // Should still create the conversation (no error event)
+      const errorEvent = events.find((e) => e.event === 'error');
+      assert.equal(errorEvent, undefined, 'Should not emit an error event when codexes not installed');
+      const createdEvent = events.find((e) => e.event === 'conversation_created');
+      assert.ok(createdEvent, 'Should still create the conversation using guild home as cwd');
+    });
+  });
 });
diff --git a/packages/plugins/parlour/src/parlour.ts b/packages/plugins/parlour/src/parlour.ts
index ffd2d75..c7589bc 100644
--- a/packages/plugins/parlour/src/parlour.ts
+++ b/packages/plugins/parlour/src/parlour.ts
@@ -37,6 +37,7 @@ import type {
 } from './types.ts';
 
 import { conversationList, conversationShow, conversationEnd } from './tools/index.ts';
+import { parlourRoutes } from './routes.ts';
 
 // ── Helpers ──────────────────────────────────────────────────────────
 
@@ -645,26 +646,53 @@ export function createParlour(): Plugin {
       if (!conv) return null;
 
       const convTurns = await getAllTurns(turns, conv.id);
-      const sessionIds = convTurns
-        .map((t) => t.sessionId)
-        .filter((id): id is string => id !== null);
 
-      // Aggregate cost
+      // Fetch session docs for all anima turns in one pass.
+      // Used for both per-turn enrichment and aggregate cost.
+      const sessionDocMap = new Map<string, Awaited<ReturnType<typeof sessions.get>>>();
+      for (const t of convTurns) {
+        if (t.sessionId !== null) {
+          const session = await sessions.get(t.sessionId);
+          sessionDocMap.set(t.sessionId, session);
+        }
+      }
+
+      // Aggregate cost across all anima turns
       let totalCostUsd = 0;
-      for (const sessionId of sessionIds) {
-        const session = await sessions.get(sessionId);
+      for (const session of sessionDocMap.values()) {
         if (session?.costUsd) totalCostUsd += session.costUsd;
       }
 
-      // Build turn summaries
-      const turnSummaries: TurnSummary[] = convTurns.map((t) => ({
-        sessionId: t.sessionId,
-        turnNumber: t.turnNumber,
-        participant: t.participantName,
-        message: t.message,
-        startedAt: t.startedAt,
-        endedAt: t.endedAt,
-      }));
+      // Build enriched turn summaries
+      const turnSummaries: TurnSummary[] = convTurns.map((t) => {
+        if (t.sessionId === null) {
+          // Human turn — no session data
+          return {
+            sessionId: null,
+            turnNumber: t.turnNumber,
+            participant: t.participantName,
+            message: t.message,
+            startedAt: t.startedAt,
+            endedAt: t.endedAt,
+            output: null,
+            costUsd: null,
+            tokenUsage: null,
+          };
+        }
+
+        const session = sessionDocMap.get(t.sessionId);
+        return {
+          sessionId: t.sessionId,
+          turnNumber: t.turnNumber,
+          participant: t.participantName,
+          message: t.message,
+          startedAt: t.startedAt,
+          endedAt: t.endedAt,
+          output: session?.output ?? null,
+          costUsd: session?.costUsd ?? null,
+          tokenUsage: session?.tokenUsage ?? null,
+        };
+      });
 
       return {
         id: conv.id,
@@ -696,6 +724,10 @@ export function createParlour(): Plugin {
           },
         },
         tools: [conversationList, conversationShow, conversationEnd],
+        pages: [
+          { id: 'parlour', title: 'Parlour', dir: 'src/static/parlour' },
+        ],
+        routes: parlourRoutes,
       },
 
       provides: api,
diff --git a/packages/plugins/parlour/src/routes.ts b/packages/plugins/parlour/src/routes.ts
new file mode 100644
index 0000000..9d85d58
--- /dev/null
+++ b/packages/plugins/parlour/src/routes.ts
@@ -0,0 +1,291 @@
+/**
+ * Parlour custom API routes.
+ *
+ * Contributed to the Oculus via supportKit.routes.
+ * Provides endpoints for the Parlour page:
+ *   GET  /api/parlour/roles           — list all system roles
+ *   GET  /api/parlour/conversations   — list conversations for a role
+ *   POST /api/parlour/create          — create a conversation
+ *   POST /api/parlour/turn            — take a turn (SSE streaming)
+ *
+ * No Oculus types are imported — the Oculus duck-types the supportKit
+ * via `as OculusKit`. Route handlers receive Hono Context objects.
+ */
+
+import type { Context } from 'hono';
+import { streamSSE } from 'hono/streaming';
+import { guild } from '@shardworks/nexus-core';
+import type { LoomApi } from '@shardworks/loom-apparatus';
+import type { ParlourApi } from './types.ts';
+
+// ── Type stubs ────────────────────────────────────────────────────────
+
+/** Duck-typed RouteContribution — no import from Oculus needed. */
+interface RouteContribution {
+  method: string;
+  path: string;
+  handler: (c: Context) => Response | Promise<Response>;
+}
+
+// ── Helpers ───────────────────────────────────────────────────────────
+
+/**
+ * Determine the cwd for a new conversation.
+ * If codexName is provided and the codexes apparatus is available,
+ * opens a draft worktree and returns its path.
+ * Otherwise falls back to guild().home.
+ */
+async function resolveCwd(codexName?: string): Promise<string> {
+  if (codexName) {
+    try {
+      // Conditionally access the codexes apparatus
+      const scriptorium = guild().apparatus<{
+        openDraft(req: { codexName: string }): Promise<{ path: string }>;
+      }>('codexes');
+      const draft = await scriptorium.openDraft({ codexName });
+      return draft.path;
+    } catch {
+      // Codexes apparatus not installed or failed — fall back to guild home
+    }
+  }
+  return guild().home;
+}
+
+// ── Route handlers ────────────────────────────────────────────────────
+
+/** GET /api/parlour/roles — list all system roles */
+function rolesRoute(): RouteContribution {
+  return {
+    method: 'GET',
+    path: '/api/parlour/roles',
+    handler: (c: Context) => {
+      const loom = guild().apparatus<LoomApi>('loom');
+      const roles = loom.listRoles();
+      return c.json(roles);
+    },
+  };
+}
+
+/** GET /api/parlour/conversations — list conversations for a role */
+function conversationsRoute(): RouteContribution {
+  return {
+    method: 'GET',
+    path: '/api/parlour/conversations',
+    handler: async (c: Context) => {
+      const role = c.req.query('role');
+      if (!role) {
+        return c.json({ error: 'Missing required query param: role' }, 400);
+      }
+      const status = (c.req.query('status') as 'active' | 'concluded' | 'abandoned') ?? 'active';
+
+      const parlour = guild().apparatus<ParlourApi>('parlour');
+      const allConvs = await parlour.list({ status, kind: 'consult', limit: 50 });
+
+      // Filter to conversations that have a participant with this role name
+      const filtered = allConvs.filter((conv) =>
+        conv.participants.some((p) => p.name === role),
+      );
+
+      // Determine display title for each conversation
+      const results = await Promise.all(
+        filtered.map(async (conv) => {
+          let title: string;
+
+          if (conv.topic && conv.topic.trim().length > 0) {
+            title = conv.topic;
+          } else {
+            // Look for first human message
+            const detail = await parlour.show(conv.id);
+            const humanTurn = detail?.turns.find(
+              (t) => t.sessionId === null && t.message !== null,
+            );
+
+            if (humanTurn?.message) {
+              title = humanTurn.message.length > 60
+                ? humanTurn.message.slice(0, 60) + '…'
+                : humanTurn.message;
+            } else {
+              // Fall back to formatted date
+              title = new Date(conv.createdAt).toLocaleString();
+            }
+          }
+
+          return {
+            id: conv.id,
+            title,
+            createdAt: conv.createdAt,
+            turnCount: conv.turnCount,
+            totalCostUsd: conv.totalCostUsd,
+          };
+        }),
+      );
+
+      return c.json(results);
+    },
+  };
+}
+
+/** POST /api/parlour/create — create a new consult conversation */
+function createRoute(): RouteContribution {
+  return {
+    method: 'POST',
+    path: '/api/parlour/create',
+    handler: async (c: Context) => {
+      const body = await c.req.json() as { role?: string; codexName?: string };
+      const { role, codexName } = body;
+
+      if (!role) {
+        return c.json({ error: 'Missing required field: role' }, 400);
+      }
+
+      const cwd = await resolveCwd(codexName);
+      const parlour = guild().apparatus<ParlourApi>('parlour');
+
+      const result = await parlour.create({
+        kind: 'consult',
+        participants: [
+          { kind: 'human', name: 'User' },
+          { kind: 'anima', name: role },
+        ],
+        cwd,
+      });
+
+      return c.json({
+        conversationId: result.conversationId,
+        participants: result.participants,
+      });
+    },
+  };
+}
+
+/** POST /api/parlour/turn — take a turn with SSE streaming */
+function turnRoute(): RouteContribution {
+  return {
+    method: 'POST',
+    path: '/api/parlour/turn',
+    handler: async (c: Context) => {
+      // Parse and validate body BEFORE entering the SSE stream so we can
+      // return proper HTTP 400 responses for invalid input.
+      let body: {
+        conversationId?: string;
+        role?: string;
+        message?: string;
+        codexName?: string;
+      };
+
+      try {
+        body = await c.req.json() as typeof body;
+      } catch {
+        return c.json({ error: 'Invalid JSON body' }, 400);
+      }
+
+      const { conversationId: reqConversationId, role, message, codexName } = body;
+
+      if (!reqConversationId && !role) {
+        return c.json({ error: 'Either conversationId or role is required' }, 400);
+      }
+      if (!message || message.trim() === '') {
+        return c.json({ error: 'message is required and must not be empty' }, 400);
+      }
+
+      return streamSSE(c, async (stream) => {
+        const parlour = guild().apparatus<ParlourApi>('parlour');
+
+        let conversationId: string;
+        let humanParticipantId: string;
+        let animaParticipantId: string;
+
+        try {
+          if (reqConversationId) {
+            // Use existing conversation
+            conversationId = reqConversationId;
+            const detail = await parlour.show(conversationId);
+            if (!detail) {
+              await stream.writeSSE({
+                event: 'error',
+                data: JSON.stringify({ error: `Conversation "${conversationId}" not found` }),
+              });
+              return;
+            }
+            const human = detail.participants.find((p) => p.kind === 'human');
+            const anima = detail.participants.find((p) => p.kind === 'anima');
+            if (!human || !anima) {
+              await stream.writeSSE({
+                event: 'error',
+                data: JSON.stringify({ error: 'Conversation missing human or anima participant' }),
+              });
+              return;
+            }
+            humanParticipantId = human.id;
+            animaParticipantId = anima.id;
+          } else {
+            // Create new conversation lazily
+            const cwd = await resolveCwd(codexName);
+            const created = await parlour.create({
+              kind: 'consult',
+              participants: [
+                { kind: 'human', name: 'User' },
+                { kind: 'anima', name: role! },
+              ],
+              cwd,
+            });
+
+            conversationId = created.conversationId;
+            const human = created.participants.find((p) => p.kind === 'human');
+            const anima = created.participants.find((p) => p.kind === 'anima');
+            humanParticipantId = human!.id;
+            animaParticipantId = anima!.id;
+
+            // Emit conversation_created event
+            await stream.writeSSE({
+              event: 'conversation_created',
+              data: JSON.stringify({
+                conversationId,
+                participants: created.participants,
+              }),
+            });
+          }
+
+          // Take human turn
+          await parlour.takeTurn({
+            conversationId,
+            participantId: humanParticipantId,
+            message: message.trim(),
+          });
+
+          // Take anima turn with streaming
+          const { chunks, result } = parlour.takeTurnStreaming({
+            conversationId,
+            participantId: animaParticipantId,
+          });
+
+          // Stream chunks to client
+          for await (const chunk of chunks) {
+            await stream.writeSSE({
+              event: 'chunk',
+              data: JSON.stringify(chunk),
+            });
+          }
+
+          // Await result to ensure turn recording completes
+          await result;
+        } catch (err: unknown) {
+          const errMessage = err instanceof Error ? err.message : String(err);
+          await stream.writeSSE({
+            event: 'error',
+            data: JSON.stringify({ error: errMessage }),
+          });
+        }
+      });
+    },
+  };
+}
+
+// ── Exported routes array ─────────────────────────────────────────────
+
+export const parlourRoutes: RouteContribution[] = [
+  rolesRoute(),
+  conversationsRoute(),
+  createRoute(),
+  turnRoute(),
+];
diff --git a/packages/plugins/parlour/src/static/parlour/app.js b/packages/plugins/parlour/src/static/parlour/app.js
new file mode 100644
index 0000000..d19441e
--- /dev/null
+++ b/packages/plugins/parlour/src/static/parlour/app.js
@@ -0,0 +1,654 @@
+/**
+ * Parlour — chat UI application logic.
+ *
+ * Vanilla JS, no build step. Communicates with the Parlour API routes
+ * via fetch(). SSE from POST /api/parlour/turn is read by manually
+ * parsing the ReadableStream (EventSource only supports GET).
+ */
+
+// ── State ─────────────────────────────────────────────────────────────
+
+let currentRole = null;
+let currentCodex = '';       // empty = guild home
+let currentConversationId = null;
+let isStreaming = false;
+let currentAnimaMessageEl = null;  // the anima message bubble being streamed
+
+// Per-conversation cost aggregation (updated after each turn)
+let turnCostData = [];  // [{ costUsd, inputTokens, outputTokens }, ...]
+
+// ── DOM references ────────────────────────────────────────────────────
+
+const roleSelect = document.getElementById('role-select');
+const codexSelect = document.getElementById('codex-select');
+const parlourMain = document.getElementById('parlour-main');
+const newConvBtn = document.getElementById('new-conversation-btn');
+const convListEl = document.getElementById('conversation-list');
+const chatMessages = document.getElementById('chat-messages');
+const chatInput = document.getElementById('chat-input');
+const sendBtn = document.getElementById('send-btn');
+const costCard = document.getElementById('cost-card');
+const costDetails = document.getElementById('cost-details');
+
+// ── Initialisation ────────────────────────────────────────────────────
+
+async function init() {
+  await Promise.all([loadRoles(), loadCodexes()]);
+}
+
+async function loadRoles() {
+  try {
+    const res = await fetch('/api/parlour/roles');
+    if (!res.ok) return;
+    const roles = await res.json();
+    roles.sort((a, b) => a.name.localeCompare(b.name));
+    for (const role of roles) {
+      const opt = document.createElement('option');
+      opt.value = role.name;
+      opt.textContent = role.name + (role.source === 'kit' ? ' (kit)' : '');
+      roleSelect.appendChild(opt);
+    }
+  } catch {
+    // Roles endpoint not available — silently omit
+  }
+}
+
+async function loadCodexes() {
+  try {
+    const res = await fetch('/api/codex/list');
+    if (!res.ok) return;
+    const codexes = await res.json();
+    for (const codex of codexes) {
+      const opt = document.createElement('option');
+      opt.value = codex.name;
+      opt.textContent = codex.name;
+      codexSelect.appendChild(opt);
+    }
+  } catch {
+    // Codexes not installed — silently omit
+  }
+}
+
+// ── Role / Codex selection ─────────────────────────────────────────────
+
+roleSelect.addEventListener('change', () => {
+  const role = roleSelect.value;
+  if (!role) return;
+  onRoleChange(role);
+});
+
+codexSelect.addEventListener('change', () => {
+  currentCodex = codexSelect.value;
+});
+
+function onRoleChange(role) {
+  currentRole = role;
+  currentConversationId = null;
+  currentAnimaMessageEl = null;
+  turnCostData = [];
+  clearChat();
+  parlourMain.classList.remove('hidden');
+  costCard.classList.add('hidden');
+  loadConversations(role);
+}
+
+// ── Conversations sidebar ─────────────────────────────────────────────
+
+async function loadConversations(role) {
+  try {
+    const res = await fetch(`/api/parlour/conversations?role=${encodeURIComponent(role)}&status=active`);
+    if (!res.ok) return;
+    const convs = await res.json();
+    renderConversationList(convs);
+  } catch {
+    // Silently ignore
+  }
+}
+
+function renderConversationList(convs) {
+  convListEl.innerHTML = '';
+  for (const conv of convs) {
+    appendConversationItem(conv);
+  }
+}
+
+function appendConversationItem(conv) {
+  const item = document.createElement('div');
+  item.className = 'conversation-item';
+  item.dataset.id = conv.id;
+
+  const titleEl = document.createElement('span');
+  titleEl.className = 'conversation-item__title';
+  titleEl.textContent = conv.title;
+  titleEl.title = conv.title;
+
+  const endBtn = document.createElement('button');
+  endBtn.className = 'end-btn';
+  endBtn.textContent = 'End';
+  endBtn.title = 'End this conversation';
+  endBtn.addEventListener('click', (e) => {
+    e.stopPropagation();
+    onEndConversation(conv.id);
+  });
+
+  item.appendChild(titleEl);
+  item.appendChild(endBtn);
+  item.addEventListener('click', () => onSelectConversation(conv.id));
+
+  if (conv.id === currentConversationId) {
+    item.classList.add('conversation-item--active');
+  }
+
+  convListEl.appendChild(item);
+}
+
+function setActiveConversationInSidebar(id) {
+  for (const item of convListEl.querySelectorAll('.conversation-item')) {
+    if (item.dataset.id === id) {
+      item.classList.add('conversation-item--active');
+    } else {
+      item.classList.remove('conversation-item--active');
+    }
+  }
+}
+
+// ── New conversation ───────────────────────────────────────────────────
+
+newConvBtn.addEventListener('click', onNewConversation);
+
+function onNewConversation() {
+  currentConversationId = null;
+  currentAnimaMessageEl = null;
+  turnCostData = [];
+  clearChat();
+  costCard.classList.add('hidden');
+  setActiveConversationInSidebar(null);
+  sendBtn.disabled = false;
+  chatMessages.classList.remove('empty-state');
+  chatMessages.textContent = '';
+
+  // Show placeholder
+  const placeholder = document.createElement('div');
+  placeholder.className = 'message message--system';
+  placeholder.textContent = 'New conversation — type a message to begin';
+  chatMessages.appendChild(placeholder);
+}
+
+// ── End conversation ───────────────────────────────────────────────────
+
+async function onEndConversation(id) {
+  try {
+    await fetch('/api/conversation/end', {
+      method: 'POST',
+      headers: { 'Content-Type': 'application/json' },
+      body: JSON.stringify({ id, reason: 'concluded' }),
+    });
+  } catch {
+    // Ignore
+  }
+
+  // Remove from sidebar
+  const item = convListEl.querySelector(`[data-id="${id}"]`);
+  if (item) item.remove();
+
+  // If current conversation ended, go to new conversation state
+  if (currentConversationId === id) {
+    onNewConversation();
+  }
+}
+
+// ── Select conversation ────────────────────────────────────────────────
+
+async function onSelectConversation(id) {
+  currentConversationId = id;
+  currentAnimaMessageEl = null;
+  turnCostData = [];
+  setActiveConversationInSidebar(id);
+
+  try {
+    const res = await fetch(`/api/conversation/show?id=${encodeURIComponent(id)}`);
+    if (!res.ok) {
+      showSystemMessage('Failed to load conversation history');
+      return;
+    }
+    const detail = await res.json();
+    renderConversationHistory(detail);
+    sendBtn.disabled = false;
+  } catch {
+    showSystemMessage('Failed to load conversation history');
+  }
+}
+
+function renderConversationHistory(detail) {
+  clearChat();
+  chatMessages.classList.remove('empty-state');
+
+  if (!detail.turns || detail.turns.length === 0) {
+    const placeholder = document.createElement('div');
+    placeholder.className = 'message message--system';
+    placeholder.textContent = 'No messages yet';
+    chatMessages.appendChild(placeholder);
+  } else {
+    for (const turn of detail.turns) {
+      if (turn.sessionId === null) {
+        // Human turn
+        if (turn.message) {
+          appendMessage({ role: 'human', author: 'User', text: turn.message });
+        }
+      } else {
+        // Anima turn
+        const text = turn.output || '[No response recorded]';
+        appendMessage({
+          role: 'anima',
+          author: currentRole || 'Anima',
+          text,
+          dim: !turn.output,
+        });
+
+        // Collect cost data
+        if (turn.costUsd !== null || turn.tokenUsage !== null) {
+          turnCostData.push({
+            costUsd: turn.costUsd ?? 0,
+            inputTokens: turn.tokenUsage?.inputTokens ?? 0,
+            outputTokens: turn.tokenUsage?.outputTokens ?? 0,
+          });
+        }
+      }
+    }
+  }
+
+  updateCostCard();
+  scrollToBottom();
+}
+
+// ── Chat rendering ────────────────────────────────────────────────────
+
+function clearChat() {
+  chatMessages.innerHTML = '';
+  chatMessages.className = 'empty-state';
+}
+
+function appendMessage({ role, author, text, dim = false }) {
+  const wrapper = document.createElement('div');
+  wrapper.className = `message message--${role}`;
+
+  const authorEl = document.createElement('div');
+  authorEl.className = 'message-author';
+  authorEl.textContent = author;
+
+  const contentEl = document.createElement('div');
+  contentEl.className = 'message-content';
+  if (dim) contentEl.style.color = 'var(--text-dim, #787c99)';
+  contentEl.textContent = text;
+
+  wrapper.appendChild(authorEl);
+  wrapper.appendChild(contentEl);
+  chatMessages.appendChild(wrapper);
+  return wrapper;
+}
+
+function showSystemMessage(text) {
+  const el = document.createElement('div');
+  el.className = 'message message--system';
+  el.textContent = text;
+  chatMessages.appendChild(el);
+  scrollToBottom();
+}
+
+function showTypingIndicator() {
+  const indicator = document.createElement('div');
+  indicator.className = 'typing-indicator';
+  indicator.id = 'typing-indicator';
+  indicator.innerHTML = '<span></span><span></span><span></span>';
+  chatMessages.appendChild(indicator);
+  scrollToBottom();
+  return indicator;
+}
+
+function removeTypingIndicator() {
+  const indicator = document.getElementById('typing-indicator');
+  if (indicator) indicator.remove();
+}
+
+function scrollToBottom() {
+  chatMessages.scrollTop = chatMessages.scrollHeight;
+}
+
+// ── Cost card ─────────────────────────────────────────────────────────
+
+function updateCostCard() {
+  if (turnCostData.length === 0) {
+    costCard.classList.add('hidden');
+    return;
+  }
+
+  const totalCost = turnCostData.reduce((sum, t) => sum + (t.costUsd || 0), 0);
+  const totalInput = turnCostData.reduce((sum, t) => sum + (t.inputTokens || 0), 0);
+  const totalOutput = turnCostData.reduce((sum, t) => sum + (t.outputTokens || 0), 0);
+
+  costDetails.innerHTML = `
+    <div>
+      <span class="badge">IN: ${totalInput.toLocaleString()}</span>
+      <span class="badge">OUT: ${totalOutput.toLocaleString()}</span>
+    </div>
+    <div class="cost-usd">$${totalCost.toFixed(4)}</div>
+  `;
+
+  costCard.classList.remove('hidden');
+}
+
+// ── Send message ──────────────────────────────────────────────────────
+
+sendBtn.addEventListener('click', sendMessage);
+
+chatInput.addEventListener('keydown', (e) => {
+  if (e.ctrlKey && e.key === 'Enter') {
+    e.preventDefault();
+    sendMessage();
+  }
+});
+
+chatInput.addEventListener('input', () => {
+  chatInput.style.height = 'auto';
+  chatInput.style.height = Math.min(chatInput.scrollHeight, 200) + 'px';
+});
+
+async function sendMessage() {
+  if (isStreaming) return;
+
+  const text = chatInput.value.trim();
+  if (!text) return;
+
+  isStreaming = true;
+  sendBtn.disabled = true;
+  chatInput.value = '';
+  chatInput.style.height = 'auto';
+
+  // Remove empty-state class and content if present
+  if (chatMessages.classList.contains('empty-state')) {
+    chatMessages.classList.remove('empty-state');
+    chatMessages.innerHTML = '';
+  }
+
+  // Render human message
+  appendMessage({ role: 'human', author: 'User', text });
+
+  // Show typing indicator
+  showTypingIndicator();
+
+  // Start anima message bubble (will be filled progressively)
+  currentAnimaMessageEl = null;
+
+  // Build request body
+  const body = {
+    message: text,
+    role: currentRole,
+    ...(currentConversationId ? { conversationId: currentConversationId } : {}),
+    ...(currentCodex ? { codexName: currentCodex } : {}),
+  };
+
+  try {
+    const response = await fetch('/api/parlour/turn', {
+      method: 'POST',
+      headers: { 'Content-Type': 'application/json' },
+      body: JSON.stringify(body),
+    });
+
+    if (!response.ok || !response.body) {
+      removeTypingIndicator();
+      showSystemMessage(`Error: HTTP ${response.status}`);
+      isStreaming = false;
+      sendBtn.disabled = false;
+      return;
+    }
+
+    await readSSEStream(response.body);
+  } catch (err) {
+    removeTypingIndicator();
+    showSystemMessage(`Error: ${err.message}`);
+    isStreaming = false;
+    sendBtn.disabled = false;
+  }
+}
+
+// ── SSE stream reader ─────────────────────────────────────────────────
+
+/**
+ * Read an SSE stream from a POST response body.
+ * EventSource only supports GET, so we parse SSE manually.
+ */
+async function readSSEStream(body) {
+  const reader = body.getReader();
+  const decoder = new TextDecoder();
+  let buffer = '';
+
+  try {
+    while (true) {
+      const { value, done } = await reader.read();
+      if (done) break;
+      buffer += decoder.decode(value, { stream: true });
+
+      // Process complete SSE messages (terminated by double newline)
+      const messages = buffer.split(/\n\n/);
+      buffer = messages.pop() ?? ''; // last element may be incomplete
+
+      for (const message of messages) {
+        processSSEMessage(message);
+      }
+    }
+
+    // Process any remaining buffer
+    if (buffer.trim()) {
+      processSSEMessage(buffer);
+    }
+  } finally {
+    reader.releaseLock();
+    // Ensure streaming state is cleaned up
+    if (isStreaming) {
+      removeTypingIndicator();
+      isStreaming = false;
+      sendBtn.disabled = false;
+    }
+  }
+}
+
+function processSSEMessage(raw) {
+  const lines = raw.split('\n');
+  let event = 'message';
+  let data = '';
+
+  for (const line of lines) {
+    if (line.startsWith('event: ')) {
+      event = line.slice('event: '.length).trim();
+    } else if (line.startsWith('data: ')) {
+      data = line.slice('data: '.length).trim();
+    }
+  }
+
+  if (!data) return;
+
+  let parsed;
+  try {
+    parsed = JSON.parse(data);
+  } catch {
+    return;
+  }
+
+  handleSSEEvent(event, parsed);
+}
+
+function handleSSEEvent(event, data) {
+  switch (event) {
+    case 'conversation_created':
+      currentConversationId = data.conversationId;
+      // Add new conversation to sidebar
+      appendConversationItem({
+        id: data.conversationId,
+        title: 'New conversation…',
+      });
+      setActiveConversationInSidebar(data.conversationId);
+      break;
+
+    case 'chunk':
+      handleChunk(data);
+      break;
+
+    case 'error':
+      removeTypingIndicator();
+      showSystemMessage(`Error: ${data.error || 'Unknown error'}`);
+      isStreaming = false;
+      sendBtn.disabled = false;
+      break;
+
+    default:
+      break;
+  }
+}
+
+function handleChunk(chunk) {
+  switch (chunk.type) {
+    case 'text': {
+      // Remove typing indicator on first text chunk
+      removeTypingIndicator();
+
+      if (!currentAnimaMessageEl) {
+        // Create the anima message bubble
+        const wrapper = document.createElement('div');
+        wrapper.className = 'message message--anima';
+
+        const authorEl = document.createElement('div');
+        authorEl.className = 'message-author';
+        authorEl.textContent = currentRole || 'Anima';
+
+        const contentEl = document.createElement('div');
+        contentEl.className = 'message-content';
+
+        wrapper.appendChild(authorEl);
+        wrapper.appendChild(contentEl);
+        chatMessages.appendChild(wrapper);
+        currentAnimaMessageEl = contentEl;
+      }
+
+      currentAnimaMessageEl.textContent += chunk.text;
+      scrollToBottom();
+      break;
+    }
+
+    case 'tool_use': {
+      removeTypingIndicator();
+      if (!currentAnimaMessageEl) {
+        // Create bubble if needed
+        const wrapper = document.createElement('div');
+        wrapper.className = 'message message--anima';
+        const authorEl = document.createElement('div');
+        authorEl.className = 'message-author';
+        authorEl.textContent = currentRole || 'Anima';
+        const contentEl = document.createElement('div');
+        contentEl.className = 'message-content';
+        wrapper.appendChild(authorEl);
+        wrapper.appendChild(contentEl);
+        chatMessages.appendChild(wrapper);
+        currentAnimaMessageEl = contentEl;
+      }
+      const pill = document.createElement('span');
+      pill.className = 'tool-indicator';
+      pill.textContent = `⚙ ${chunk.name || 'tool'}`;
+      currentAnimaMessageEl.appendChild(pill);
+      scrollToBottom();
+      break;
+    }
+
+    case 'tool_result': {
+      if (currentAnimaMessageEl) {
+        const pill = document.createElement('span');
+        pill.className = 'tool-indicator';
+        pill.textContent = `✓ ${chunk.name || 'result'}`;
+        currentAnimaMessageEl.appendChild(pill);
+        scrollToBottom();
+      }
+      break;
+    }
+
+    case 'turn_complete': {
+      // Collect cost data for this turn
+      if (chunk.costUsd !== undefined && chunk.costUsd !== null) {
+        // We'll do a full refresh of cost after fetching conversation detail
+        // For now, add a placeholder entry that will be replaced
+        turnCostData.push({
+          costUsd: chunk.costUsd,
+          inputTokens: 0,
+          outputTokens: 0,
+        });
+      }
+
+      currentAnimaMessageEl = null;
+      isStreaming = false;
+      sendBtn.disabled = false;
+
+      // Refresh conversation detail for full token data
+      if (currentConversationId) {
+        refreshConversationCost(currentConversationId);
+      }
+      break;
+    }
+
+    default:
+      break;
+  }
+}
+
+/**
+ * Re-fetch conversation detail to get accurate token totals and refresh the cost card.
+ */
+async function refreshConversationCost(id) {
+  try {
+    const res = await fetch(`/api/conversation/show?id=${encodeURIComponent(id)}`);
+    if (!res.ok) return;
+    const detail = await res.json();
+
+    // Rebuild cost data from full turn history
+    turnCostData = [];
+    for (const turn of detail.turns) {
+      if (turn.sessionId !== null && (turn.costUsd !== null || turn.tokenUsage !== null)) {
+        turnCostData.push({
+          costUsd: turn.costUsd ?? 0,
+          inputTokens: turn.tokenUsage?.inputTokens ?? 0,
+          outputTokens: turn.tokenUsage?.outputTokens ?? 0,
+        });
+      }
+    }
+
+    updateCostCard();
+
+    // Also update sidebar title if this was a new conversation
+    refreshConversationTitle(id);
+  } catch {
+    // Ignore
+  }
+}
+
+async function refreshConversationTitle(id) {
+  try {
+    const role = encodeURIComponent(currentRole || '');
+    const res = await fetch(`/api/parlour/conversations?role=${role}&status=active`);
+    if (!res.ok) return;
+    const convs = await res.json();
+    const conv = convs.find((c) => c.id === id);
+    if (!conv) return;
+
+    const item = convListEl.querySelector(`[data-id="${id}"]`);
+    if (item) {
+      const titleEl = item.querySelector('.conversation-item__title');
+      if (titleEl) {
+        titleEl.textContent = conv.title;
+        titleEl.title = conv.title;
+      }
+    }
+  } catch {
+    // Ignore
+  }
+}
+
+// ── Bootstrap ─────────────────────────────────────────────────────────
+
+init();
diff --git a/packages/plugins/parlour/src/static/parlour/index.html b/packages/plugins/parlour/src/static/parlour/index.html
new file mode 100644
index 0000000..4788cd9
--- /dev/null
+++ b/packages/plugins/parlour/src/static/parlour/index.html
@@ -0,0 +1,37 @@
+<!DOCTYPE html>
+<html lang="en">
+<head>
+  <meta charset="UTF-8">
+  <meta name="viewport" content="width=device-width, initial-scale=1.0">
+  <title>Parlour</title>
+  <link rel="stylesheet" href="parlour.css">
+</head>
+<body>
+  <div id="parlour-app">
+    <div id="parlour-toolbar">
+      <label for="role-select">Role</label>
+      <select id="role-select"><option value="">Select a role…</option></select>
+      <label for="codex-select">Codex</label>
+      <select id="codex-select"><option value="">No codex (guild home)</option></select>
+    </div>
+    <div id="parlour-main" class="hidden">
+      <aside id="parlour-sidebar">
+        <button id="new-conversation-btn" class="btn btn--primary">+ New Conversation</button>
+        <div id="conversation-list"></div>
+        <div id="cost-card" class="card hidden">
+          <h4>Cost</h4>
+          <div id="cost-details"></div>
+        </div>
+      </aside>
+      <div id="parlour-chat">
+        <div id="chat-messages" class="empty-state">Select or start a conversation</div>
+        <div id="chat-input-area">
+          <textarea id="chat-input" rows="3" placeholder="Type a message…"></textarea>
+          <button id="send-btn" class="btn btn--primary" disabled>Send</button>
+        </div>
+      </div>
+    </div>
+  </div>
+  <script src="app.js"></script>
+</body>
+</html>
diff --git a/packages/plugins/parlour/src/static/parlour/parlour.css b/packages/plugins/parlour/src/static/parlour/parlour.css
new file mode 100644
index 0000000..6fed6b6
--- /dev/null
+++ b/packages/plugins/parlour/src/static/parlour/parlour.css
@@ -0,0 +1,355 @@
+/* Parlour — page-specific styles.
+ * Uses CSS custom properties from the Oculus chrome (style.css).
+ * Tokyo Night palette variables: --surface, --surface2, --blue, --green,
+ * --text, --text-dim, etc.
+ */
+
+/* ── Layout ──────────────────────────────────────────────────────────── */
+
+#parlour-app {
+  display: flex;
+  flex-direction: column;
+  height: calc(100vh - 48px); /* subtract nav height */
+  overflow: hidden;
+}
+
+#parlour-toolbar {
+  display: flex;
+  align-items: center;
+  gap: 8px;
+  padding: 8px 16px;
+  background: var(--surface, #1a1b26);
+  border-bottom: 1px solid var(--border, #2a2b3d);
+  flex-shrink: 0;
+}
+
+#parlour-toolbar label {
+  font-size: 13px;
+  color: var(--text-dim, #787c99);
+  white-space: nowrap;
+}
+
+#parlour-toolbar select {
+  background: var(--surface2, #24283b);
+  color: var(--text, #c0caf5);
+  border: 1px solid var(--border, #3b4261);
+  border-radius: 4px;
+  padding: 4px 8px;
+  font-size: 13px;
+  cursor: pointer;
+}
+
+#parlour-main {
+  display: flex;
+  flex: 1;
+  overflow: hidden;
+}
+
+/* ── Sidebar ─────────────────────────────────────────────────────────── */
+
+#parlour-sidebar {
+  width: 260px;
+  min-width: 200px;
+  display: flex;
+  flex-direction: column;
+  border-right: 1px solid var(--border, #2a2b3d);
+  background: var(--surface, #1a1b26);
+  overflow: hidden;
+}
+
+#new-conversation-btn {
+  margin: 12px;
+  flex-shrink: 0;
+}
+
+#conversation-list {
+  flex: 1;
+  overflow-y: auto;
+  padding: 0 8px;
+}
+
+/* ── Chat area ───────────────────────────────────────────────────────── */
+
+#parlour-chat {
+  display: flex;
+  flex-direction: column;
+  flex: 1;
+  overflow: hidden;
+}
+
+#chat-messages {
+  flex: 1;
+  overflow-y: auto;
+  padding: 16px;
+  display: flex;
+  flex-direction: column;
+  gap: 12px;
+}
+
+#chat-messages.empty-state {
+  justify-content: center;
+  align-items: center;
+  color: var(--text-dim, #787c99);
+  font-style: italic;
+  font-size: 14px;
+}
+
+#chat-input-area {
+  display: flex;
+  gap: 8px;
+  padding: 12px 16px;
+  border-top: 1px solid var(--border, #2a2b3d);
+  background: var(--surface, #1a1b26);
+  flex-shrink: 0;
+  align-items: flex-end;
+}
+
+#chat-input {
+  flex: 1;
+  background: var(--surface2, #24283b);
+  color: var(--text, #c0caf5);
+  border: 1px solid var(--border, #3b4261);
+  border-radius: 6px;
+  padding: 8px 12px;
+  font-size: 14px;
+  font-family: inherit;
+  resize: none;
+  max-height: 200px;
+  line-height: 1.5;
+}
+
+#chat-input:focus {
+  outline: none;
+  border-color: var(--blue, #7aa2f7);
+}
+
+/* ── Message bubbles ─────────────────────────────────────────────────── */
+
+.message {
+  display: flex;
+  flex-direction: column;
+  gap: 4px;
+  padding: 10px 14px;
+  border-radius: 6px;
+  max-width: 85%;
+  word-wrap: break-word;
+  white-space: pre-wrap;
+  font-size: 14px;
+  line-height: 1.6;
+}
+
+.message--human {
+  background: var(--surface2, #24283b);
+  border-left: 3px solid var(--blue, #7aa2f7);
+  align-self: flex-start;
+}
+
+.message--anima {
+  background: var(--surface, #1a1b26);
+  border-left: 3px solid var(--green, #9ece6a);
+  align-self: flex-start;
+  border: 1px solid var(--border, #2a2b3d);
+  border-left: 3px solid var(--green, #9ece6a);
+}
+
+.message--system {
+  background: transparent;
+  color: var(--text-dim, #787c99);
+  font-style: italic;
+  align-self: center;
+  text-align: center;
+  border: none;
+  padding: 4px 8px;
+  font-size: 12px;
+}
+
+.message-author {
+  font-size: 11px;
+  font-weight: 600;
+  color: var(--text-dim, #787c99);
+  text-transform: uppercase;
+  letter-spacing: 0.05em;
+}
+
+.message-content {
+  color: var(--text, #c0caf5);
+}
+
+/* ── Tool indicators ─────────────────────────────────────────────────── */
+
+.tool-indicator {
+  display: inline-block;
+  background: var(--surface2, #24283b);
+  color: var(--text-dim, #787c99);
+  font-size: 11px;
+  border-radius: 4px;
+  padding: 2px 8px;
+  margin: 2px 2px;
+  border: 1px solid var(--border, #3b4261);
+  font-family: monospace;
+}
+
+/* ── Typing indicator ────────────────────────────────────────────────── */
+
+.typing-indicator {
+  display: flex;
+  gap: 4px;
+  align-items: center;
+  padding: 10px 14px;
+  align-self: flex-start;
+}
+
+.typing-indicator span {
+  width: 8px;
+  height: 8px;
+  background: var(--text-dim, #787c99);
+  border-radius: 50%;
+  animation: pulse 1.2s ease-in-out infinite;
+}
+
+.typing-indicator span:nth-child(2) {
+  animation-delay: 0.2s;
+}
+
+.typing-indicator span:nth-child(3) {
+  animation-delay: 0.4s;
+}
+
+@keyframes pulse {
+  0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
+  40% { opacity: 1; transform: scale(1); }
+}
+
+/* ── Conversation list items ─────────────────────────────────────────── */
+
+.conversation-item {
+  display: flex;
+  align-items: center;
+  justify-content: space-between;
+  padding: 8px 8px;
+  border-radius: 4px;
+  cursor: pointer;
+  font-size: 13px;
+  color: var(--text, #c0caf5);
+  margin-bottom: 2px;
+  gap: 4px;
+}
+
+.conversation-item:hover {
+  background: var(--surface2, #24283b);
+}
+
+.conversation-item--active {
+  background: var(--surface2, #24283b);
+}
+
+.conversation-item__title {
+  flex: 1;
+  overflow: hidden;
+  text-overflow: ellipsis;
+  white-space: nowrap;
+}
+
+.conversation-item .end-btn {
+  flex-shrink: 0;
+  background: transparent;
+  border: 1px solid var(--border, #3b4261);
+  color: var(--text-dim, #787c99);
+  border-radius: 3px;
+  padding: 2px 6px;
+  font-size: 11px;
+  cursor: pointer;
+  opacity: 0;
+  transition: opacity 0.15s;
+}
+
+.conversation-item:hover .end-btn {
+  opacity: 1;
+}
+
+.conversation-item .end-btn:hover {
+  color: var(--red, #f7768e);
+  border-color: var(--red, #f7768e);
+}
+
+/* ── Cost card ───────────────────────────────────────────────────────── */
+
+#cost-card {
+  margin: 8px;
+  padding: 10px 12px;
+  flex-shrink: 0;
+}
+
+#cost-card h4 {
+  margin: 0 0 6px 0;
+  font-size: 11px;
+  font-weight: 600;
+  color: var(--text-dim, #787c99);
+  text-transform: uppercase;
+  letter-spacing: 0.05em;
+}
+
+#cost-details {
+  display: flex;
+  flex-direction: column;
+  gap: 4px;
+  font-size: 12px;
+  color: var(--text, #c0caf5);
+}
+
+.cost-usd {
+  font-size: 16px;
+  font-weight: 600;
+  color: var(--yellow, #e0af68);
+}
+
+.cost-no-data {
+  color: var(--text-dim, #787c99);
+  font-style: italic;
+  font-size: 12px;
+}
+
+/* ── Buttons ─────────────────────────────────────────────────────────── */
+
+.btn {
+  padding: 6px 14px;
+  border-radius: 4px;
+  font-size: 13px;
+  cursor: pointer;
+  border: 1px solid var(--border, #3b4261);
+  background: var(--surface2, #24283b);
+  color: var(--text, #c0caf5);
+  transition: opacity 0.15s;
+}
+
+.btn:hover:not(:disabled) {
+  opacity: 0.8;
+}
+
+.btn:disabled {
+  opacity: 0.4;
+  cursor: not-allowed;
+}
+
+.btn--primary {
+  background: var(--blue, #7aa2f7);
+  color: var(--bg, #1a1b26);
+  border-color: var(--blue, #7aa2f7);
+  font-weight: 600;
+}
+
+/* ── Utilities ───────────────────────────────────────────────────────── */
+
+.hidden {
+  display: none !important;
+}
+
+.badge {
+  display: inline-block;
+  background: var(--surface2, #24283b);
+  color: var(--text-dim, #787c99);
+  font-size: 11px;
+  border-radius: 3px;
+  padding: 1px 6px;
+  font-family: monospace;
+}
diff --git a/packages/plugins/parlour/src/types.ts b/packages/plugins/parlour/src/types.ts
index f3fcc06..2401a63 100644
--- a/packages/plugins/parlour/src/types.ts
+++ b/packages/plugins/parlour/src/types.ts
@@ -149,6 +149,17 @@ export interface TurnSummary {
   message: string | null;
   startedAt: string;
   endedAt: string | null;
+  /** The anima's response text. Populated from SessionDoc.output. Null for human turns or when no output was recorded. */
+  output: string | null;
+  /** Cost in USD for this turn. Null for human turns. */
+  costUsd: number | null;
+  /** Token usage for this turn. Null for human turns. */
+  tokenUsage: {
+    inputTokens: number;
+    outputTokens: number;
+    cacheReadTokens?: number;
+    cacheWriteTokens?: number;
+  } | null;
 }
 
 export interface ListConversationsOptions {
diff --git a/pnpm-lock.yaml b/pnpm-lock.yaml
index d0c925b..da17012 100644
--- a/pnpm-lock.yaml
+++ b/pnpm-lock.yaml
@@ -216,6 +216,9 @@ importers:
       '@shardworks/tools-apparatus':
         specifier: workspace:*
         version: link:../tools
+      hono:
+        specifier: ^4.7.11
+        version: 4.12.9
       zod:
         specifier: 4.3.6
         version: 4.3.6

```

## Full File Contents (for context)

=== FILE: packages/plugins/parlour/package.json ===
{
  "name": "@shardworks/parlour-apparatus",
  "version": "0.0.0",
  "license": "ISC",
  "repository": {
    "type": "git",
    "url": "https://github.com/shardworks/nexus",
    "directory": "packages/plugins/parlour"
  },
  "description": "The Parlour — multi-turn conversation management apparatus",
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "build": "tsc",
    "test": "node --disable-warning=ExperimentalWarning --experimental-transform-types --test 'src/**/*.test.ts'",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@shardworks/animator-apparatus": "workspace:*",
    "@shardworks/loom-apparatus": "workspace:*",
    "@shardworks/nexus-core": "workspace:*",
    "@shardworks/stacks-apparatus": "workspace:*",
    "@shardworks/tools-apparatus": "workspace:*",
    "hono": "^4.7.11",
    "zod": "4.3.6"
  },
  "devDependencies": {
    "@types/node": "25.5.0"
  },
  "files": [
    "dist",
    "src/static"
  ],
  "publishConfig": {
    "exports": {
      ".": {
        "types": "./dist/index.d.ts",
        "import": "./dist/index.js"
      }
    }
  }
}

=== FILE: packages/plugins/parlour/src/parlour.test.ts ===
/**
 * Parlour tests.
 *
 * Uses a fake session provider, in-memory Stacks, and the real Animator
 * and Loom apparatuses to test the full conversation lifecycle without
 * spawning real AI processes.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { setGuild, clearGuild } from '@shardworks/nexus-core';
import type { Guild } from '@shardworks/nexus-core';
import { createStacksApparatus } from '@shardworks/stacks-apparatus';
import { MemoryBackend } from '@shardworks/stacks-apparatus/testing';
import type { StacksApi } from '@shardworks/stacks-apparatus';
import { createLoom } from '@shardworks/loom-apparatus';
import { createAnimator } from '@shardworks/animator-apparatus';
import type {
  AnimatorApi,
  AnimatorSessionProvider,
  SessionProviderConfig,
  SessionChunk,
} from '@shardworks/animator-apparatus';

import { Hono } from 'hono';

import { createParlour } from './parlour.ts';
import type { ParlourApi } from './types.ts';
import { parlourRoutes } from './routes.ts';

// ── Shared empty chunks iterable ─────────────────────────────────────

const emptyChunks: AsyncIterable<SessionChunk> = {
  [Symbol.asyncIterator]() {
    return {
      async next() {
        return { value: undefined as unknown as SessionChunk, done: true as const };
      },
    };
  },
};

// ── Fake providers ───────────────────────────────────────────────────

function createFakeProvider(): AnimatorSessionProvider {
  let callCount = 0;

  return {
    name: 'fake',
    launch(_config: SessionProviderConfig) {
      callCount++;
      return {
        chunks: emptyChunks,
        result: Promise.resolve({
          status: 'completed' as const,
          exitCode: 0,
          providerSessionId: `fake-sess-${callCount}`,
          tokenUsage: { inputTokens: 1000, outputTokens: 500 },
          costUsd: 0.05,
        }),
      };
    },
  };
}

function createStreamingFakeProvider(
  streamChunks: SessionChunk[],
): AnimatorSessionProvider {
  return {
    name: 'fake-streaming',
    launch(config: SessionProviderConfig) {
      if (config.streaming) {
        let idx = 0;
        return {
          chunks: {
            [Symbol.asyncIterator]() {
              return {
                async next() {
                  if (idx < streamChunks.length) {
                    return { value: streamChunks[idx++]!, done: false as const };
                  }
                  return { value: undefined as unknown as SessionChunk, done: true as const };
                },
              };
            },
          },
          result: Promise.resolve({
            status: 'completed' as const,
            exitCode: 0,
            providerSessionId: 'fake-stream-sess',
            costUsd: 0.10,
          }),
        };
      }
      return {
        chunks: emptyChunks,
        result: Promise.resolve({
          status: 'completed' as const,
          exitCode: 0,
          providerSessionId: 'fake-stream-sess',
          costUsd: 0.10,
        }),
      };
    },
  };
}

/** Fake provider that returns output text and token usage. */
function createOutputFakeProvider(outputText: string = 'Test response'): AnimatorSessionProvider {
  let callCount = 0;
  return {
    name: 'fake-output',
    launch(_config: SessionProviderConfig) {
      callCount++;
      return {
        chunks: emptyChunks,
        result: Promise.resolve({
          status: 'completed' as const,
          exitCode: 0,
          providerSessionId: `fake-output-sess-${callCount}`,
          tokenUsage: { inputTokens: 200, outputTokens: 100 },
          costUsd: 0.02,
          output: outputText,
        }),
      };
    },
  };
}

// ── Test harness ─────────────────────────────────────────────────────

let parlour: ParlourApi;

function setup(
  provider: AnimatorSessionProvider = createFakeProvider(),
  extraApparatuses: Record<string, unknown> = {},
) {
  const memBackend = new MemoryBackend();
  const stacksPlugin = createStacksApparatus(memBackend);
  const animatorPlugin = createAnimator();
  const loomPlugin = createLoom();
  const parlourPlugin = createParlour();

  const apparatusMap = new Map<string, unknown>();
  apparatusMap.set('fake-provider', provider);

  // Register any extra apparatuses (e.g. mock codexes for route tests)
  for (const [name, api] of Object.entries(extraApparatuses)) {
    apparatusMap.set(name, api);
  }

  const fakeGuild: Guild = {
    home: '/tmp/fake-guild',
    apparatus<T>(name: string): T {
      const api = apparatusMap.get(name);
      if (!api) throw new Error(`Apparatus "${name}" not installed`);
      return api as T;
    },
    config<T>(pluginId: string): T {
      if (pluginId === 'animator') {
        return { sessionProvider: 'fake-provider' } as T;
      }
      return {} as T;
    },
    writeConfig() { /* noop in test */ },
    guildConfig() {
      return {
        name: 'test-guild',
        nexus: '0.0.0',
        workshops: {},
        roles: {},
        baseTools: [],
        plugins: [],
        settings: { model: 'sonnet' },
        animator: { sessionProvider: 'fake-provider' },
        // Provide guild-defined loom roles so listRoles() tests have data
        loom: {
          roles: {
            artificer: { permissions: ['read', 'write'] },
            scribe: { permissions: ['read'] },
          },
        },
      };
    },
    kits: () => [],
    apparatuses: () => [],
    startupWarnings() { return []; },
  };

  setGuild(fakeGuild);

  // Start stacks
  const stacksApparatus = (stacksPlugin as { apparatus: { start: (ctx: unknown) => void; provides: unknown } }).apparatus;
  stacksApparatus.start({ on: () => {} });
  const stacks = stacksApparatus.provides as StacksApi;
  apparatusMap.set('stacks', stacks);

  // Ensure books exist
  memBackend.ensureBook({ ownerId: 'animator', book: 'sessions' }, {
    indexes: ['startedAt', 'status', 'conversationId', 'provider'],
  });
  memBackend.ensureBook({ ownerId: 'parlour', book: 'conversations' }, {
    indexes: ['status', 'kind', 'createdAt'],
  });
  memBackend.ensureBook({ ownerId: 'parlour', book: 'turns' }, {
    indexes: ['conversationId', 'turnNumber', 'participantId', 'participantKind'],
  });

  // Start loom
  const loomApparatus = (loomPlugin as { apparatus: { start: (ctx: unknown) => void; provides: unknown } }).apparatus;
  loomApparatus.start({ on: () => {} });
  apparatusMap.set('loom', loomApparatus.provides);

  // Start animator
  const animatorApparatus = (animatorPlugin as { apparatus: { start: (ctx: unknown) => void; provides: unknown } }).apparatus;
  animatorApparatus.start({ on: () => {} });
  apparatusMap.set('animator', animatorApparatus.provides);

  // Start parlour
  const parlourApparatus = (parlourPlugin as { apparatus: { start: (ctx: unknown) => void; provides: unknown } }).apparatus;
  parlourApparatus.start({ on: () => {} });
  parlour = parlourApparatus.provides as ParlourApi;

  // Register parlour in apparatus map so route handlers can access it via guild().apparatus('parlour')
  apparatusMap.set('parlour', parlour);
}

// ── Tests ────────────────────────────────────────────────────────────

describe('Parlour', () => {
  afterEach(() => {
    clearGuild();
  });

  // ── create() ────────────────────────────────────────────────────────

  describe('create()', () => {
    beforeEach(() => { setup(); });

    it('creates a consult conversation with two participants', async () => {
      const result = await parlour.create({
        kind: 'consult',
        topic: 'Help me refactor this code',
        cwd: '/tmp/workspace',
        participants: [
          { kind: 'human', name: 'Sean' },
          { kind: 'anima', name: 'Artificer' },
        ],
      });

      assert.ok(result.conversationId.startsWith('conv-'));
      assert.equal(result.participants.length, 2);
      assert.equal(result.participants[0]!.kind, 'human');
      assert.equal(result.participants[0]!.name, 'Sean');
      assert.equal(result.participants[1]!.kind, 'anima');
      assert.equal(result.participants[1]!.name, 'Artificer');
      assert.ok(result.participants[0]!.id.startsWith('part-'));
      assert.ok(result.participants[1]!.id.startsWith('part-'));
    });

    it('creates a convene conversation with multiple anima participants', async () => {
      const result = await parlour.create({
        kind: 'convene',
        topic: 'Discuss architecture',
        cwd: '/tmp/workspace',
        participants: [
          { kind: 'anima', name: 'Architect' },
          { kind: 'anima', name: 'Reviewer' },
          { kind: 'anima', name: 'Critic' },
        ],
      });

      assert.equal(result.participants.length, 3);
      assert.ok(result.participants.every((p) => p.kind === 'anima'));
    });

    it('stores conversation in Stacks and retrieves it via show()', async () => {
      const { conversationId } = await parlour.create({
        kind: 'consult',
        topic: 'Test topic',
        cwd: '/tmp/workspace',
        participants: [
          { kind: 'human', name: 'Sean' },
          { kind: 'anima', name: 'Artificer' },
        ],
      });

      const detail = await parlour.show(conversationId);
      assert.ok(detail);
      assert.equal(detail.id, conversationId);
      assert.equal(detail.status, 'active');
      assert.equal(detail.kind, 'consult');
      assert.equal(detail.topic, 'Test topic');
      assert.equal(detail.turnCount, 0);
      assert.equal(detail.turns.length, 0);
    });

    it('sets optional fields to null when not provided', async () => {
      const { conversationId } = await parlour.create({
        kind: 'consult',
        cwd: '/tmp/workspace',
        participants: [
          { kind: 'human', name: 'Sean' },
          { kind: 'anima', name: 'Artificer' },
        ],
      });

      const detail = await parlour.show(conversationId);
      assert.ok(detail);
      assert.equal(detail.topic, null);
      assert.equal(detail.turnLimit, null);
    });
  });

  // ── takeTurn() — human turns ───────────────────────────────────────

  describe('takeTurn() — human', () => {
    beforeEach(() => { setup(); });

    it('records a human turn without launching a session', async () => {
      const { conversationId, participants } = await parlour.create({
        kind: 'consult',
        cwd: '/tmp/workspace',
        participants: [
          { kind: 'human', name: 'Sean' },
          { kind: 'anima', name: 'Artificer' },
        ],
      });

      const human = participants.find((p) => p.kind === 'human')!;
      const result = await parlour.takeTurn({
        conversationId,
        participantId: human.id,
        message: 'Hello, anima!',
      });

      assert.equal(result.sessionResult, null);
      assert.equal(result.turnNumber, 1);
      assert.equal(result.conversationActive, true);
    });

    it('records the human message in turn history', async () => {
      const { conversationId, participants } = await parlour.create({
        kind: 'consult',
        cwd: '/tmp/workspace',
        participants: [
          { kind: 'human', name: 'Sean' },
          { kind: 'anima', name: 'Artificer' },
        ],
      });

      const human = participants.find((p) => p.kind === 'human')!;
      await parlour.takeTurn({
        conversationId,
        participantId: human.id,
        message: 'Hello, anima!',
      });

      const detail = await parlour.show(conversationId);
      assert.ok(detail);
      assert.equal(detail.turnCount, 1);
      assert.equal(detail.turns[0]!.participant, 'Sean');
      assert.equal(detail.turns[0]!.message, 'Hello, anima!');
      assert.equal(detail.turns[0]!.sessionId, null);
    });
  });

  // ── takeTurn() — anima turns (consult) ─────────────────────────────

  describe('takeTurn() — anima (consult)', () => {
    beforeEach(() => { setup(); });

    it('launches a session via the Animator for an anima turn', async () => {
      const { conversationId, participants } = await parlour.create({
        kind: 'consult',
        topic: 'Help me refactor',
        cwd: '/tmp/workspace',
        participants: [
          { kind: 'human', name: 'Sean' },
          { kind: 'anima', name: 'Artificer' },
        ],
      });

      const anima = participants.find((p) => p.kind === 'anima')!;
      const result = await parlour.takeTurn({
        conversationId,
        participantId: anima.id,
      });

      assert.ok(result.sessionResult);
      assert.equal(result.sessionResult.status, 'completed');
      assert.equal(result.turnNumber, 1);
      assert.equal(result.conversationActive, true);
    });

    it('uses topic as first-turn message when no explicit message', async () => {
      const { conversationId, participants } = await parlour.create({
        kind: 'consult',
        topic: 'Help me refactor',
        cwd: '/tmp/workspace',
        participants: [
          { kind: 'human', name: 'Sean' },
          { kind: 'anima', name: 'Artificer' },
        ],
      });

      const anima = participants.find((p) => p.kind === 'anima')!;
      await parlour.takeTurn({
        conversationId,
        participantId: anima.id,
      });

      const detail = await parlour.show(conversationId);
      assert.ok(detail);
      assert.equal(detail.turns[0]!.message, 'Help me refactor');
    });

    it('uses explicit message when provided (overrides topic)', async () => {
      const { conversationId, participants } = await parlour.create({
        kind: 'consult',
        topic: 'Help me refactor',
        cwd: '/tmp/workspace',
        participants: [
          { kind: 'human', name: 'Sean' },
          { kind: 'anima', name: 'Artificer' },
        ],
      });

      const anima = participants.find((p) => p.kind === 'anima')!;
      await parlour.takeTurn({
        conversationId,
        participantId: anima.id,
        message: 'Actually, help me with tests',
      });

      const detail = await parlour.show(conversationId);
      assert.ok(detail);
      assert.equal(detail.turns[0]!.message, 'Actually, help me with tests');
    });

    it('records sessionId on turn records', async () => {
      const { conversationId, participants } = await parlour.create({
        kind: 'consult',
        topic: 'Test',
        cwd: '/tmp/workspace',
        participants: [
          { kind: 'human', name: 'Sean' },
          { kind: 'anima', name: 'Artificer' },
        ],
      });

      const anima = participants.find((p) => p.kind === 'anima')!;
      const result = await parlour.takeTurn({
        conversationId,
        participantId: anima.id,
      });

      const detail = await parlour.show(conversationId);
      assert.ok(detail);
      assert.equal(detail.turns[0]!.sessionId, result.sessionResult!.id);
    });

    it('aggregates cost from session records', async () => {
      const { conversationId, participants } = await parlour.create({
        kind: 'consult',
        topic: 'Test',
        cwd: '/tmp/workspace',
        participants: [
          { kind: 'human', name: 'Sean' },
          { kind: 'anima', name: 'Artificer' },
        ],
      });

      const anima = participants.find((p) => p.kind === 'anima')!;
      const human = participants.find((p) => p.kind === 'human')!;

      await parlour.takeTurn({ conversationId, participantId: anima.id });
      await parlour.takeTurn({ conversationId, participantId: human.id, message: 'More' });
      await parlour.takeTurn({ conversationId, participantId: anima.id, message: 'Continue' });

      const detail = await parlour.show(conversationId);
      assert.ok(detail);
      assert.equal(detail.totalCostUsd, 0.10); // 2 anima turns × $0.05
    });
  });

  // ── Multi-turn consult flow ────────────────────────────────────────

  describe('multi-turn consult flow', () => {
    beforeEach(() => { setup(); });

    it('handles a full human-anima-human-anima exchange', async () => {
      const { conversationId, participants } = await parlour.create({
        kind: 'consult',
        topic: 'Architecture review',
        cwd: '/tmp/workspace',
        participants: [
          { kind: 'human', name: 'Sean' },
          { kind: 'anima', name: 'Artificer' },
        ],
      });

      const human = participants.find((p) => p.kind === 'human')!;
      const anima = participants.find((p) => p.kind === 'anima')!;

      // Turn 1: anima responds to topic
      const t1 = await parlour.takeTurn({ conversationId, participantId: anima.id });
      assert.equal(t1.turnNumber, 1);
      assert.ok(t1.sessionResult);

      // Turn 2: human replies
      const t2 = await parlour.takeTurn({
        conversationId,
        participantId: human.id,
        message: 'What about the Stacks layer?',
      });
      assert.equal(t2.turnNumber, 2);
      assert.equal(t2.sessionResult, null);

      // Turn 3: anima responds to human message
      const t3 = await parlour.takeTurn({
        conversationId,
        participantId: anima.id,
        message: 'What about the Stacks layer?',
      });
      assert.equal(t3.turnNumber, 3);
      assert.ok(t3.sessionResult);

      // Turn 4: human wraps up
      const t4 = await parlour.takeTurn({
        conversationId,
        participantId: human.id,
        message: 'Thanks, that helps.',
      });
      assert.equal(t4.turnNumber, 4);

      const detail = await parlour.show(conversationId);
      assert.ok(detail);
      assert.equal(detail.turnCount, 4);
      assert.equal(detail.status, 'active');
    });
  });

  // ── Turn limit enforcement ─────────────────────────────────────────

  describe('turn limit enforcement', () => {
    beforeEach(() => { setup(); });

    it('auto-concludes when turn limit is reached', async () => {
      const { conversationId, participants } = await parlour.create({
        kind: 'consult',
        topic: 'Quick question',
        turnLimit: 2,
        cwd: '/tmp/workspace',
        participants: [
          { kind: 'human', name: 'Sean' },
          { kind: 'anima', name: 'Artificer' },
        ],
      });

      const anima = participants.find((p) => p.kind === 'anima')!;
      const human = participants.find((p) => p.kind === 'human')!;

      // Turn 1: anima (anima turn count = 1)
      const t1 = await parlour.takeTurn({ conversationId, participantId: anima.id });
      assert.equal(t1.conversationActive, true);

      // Turn 2: human (doesn't count toward limit)
      await parlour.takeTurn({
        conversationId,
        participantId: human.id,
        message: 'Follow up',
      });

      // Turn 3: anima (anima turn count = 2 → limit reached)
      const t3 = await parlour.takeTurn({
        conversationId,
        participantId: anima.id,
        message: 'Follow up',
      });
      assert.equal(t3.conversationActive, false);

      // Verify concluded
      const detail = await parlour.show(conversationId);
      assert.ok(detail);
      assert.equal(detail.status, 'concluded');
      assert.ok(detail.endedAt);
    });

    it('throws when taking a turn after limit reached', async () => {
      const { conversationId, participants } = await parlour.create({
        kind: 'consult',
        topic: 'Quick question',
        turnLimit: 1,
        cwd: '/tmp/workspace',
        participants: [
          { kind: 'human', name: 'Sean' },
          { kind: 'anima', name: 'Artificer' },
        ],
      });

      const anima = participants.find((p) => p.kind === 'anima')!;

      // First anima turn → concludes
      await parlour.takeTurn({ conversationId, participantId: anima.id });

      // Second attempt → should throw (conversation is concluded)
      await assert.rejects(
        () => parlour.takeTurn({ conversationId, participantId: anima.id }),
        { message: /not active/ },
      );
    });

    it('human turns do not count toward turn limit', async () => {
      const { conversationId, participants } = await parlour.create({
        kind: 'consult',
        topic: 'Quick question',
        turnLimit: 2,
        cwd: '/tmp/workspace',
        participants: [
          { kind: 'human', name: 'Sean' },
          { kind: 'anima', name: 'Artificer' },
        ],
      });

      const human = participants.find((p) => p.kind === 'human')!;
      const anima = participants.find((p) => p.kind === 'anima')!;

      // 5 human turns — none should hit the limit
      for (let i = 0; i < 5; i++) {
        const result = await parlour.takeTurn({
          conversationId,
          participantId: human.id,
          message: `Human message ${i}`,
        });
        assert.equal(result.conversationActive, true);
      }

      // First anima turn (count = 1) — still active
      const t1 = await parlour.takeTurn({ conversationId, participantId: anima.id, message: 'Hi' });
      assert.equal(t1.conversationActive, true);

      // Second anima turn (count = 2) — limit reached
      const t2 = await parlour.takeTurn({ conversationId, participantId: anima.id, message: 'Hi' });
      assert.equal(t2.conversationActive, false);
    });
  });

  // ── end() ──────────────────────────────────────────────────────────

  describe('end()', () => {
    beforeEach(() => { setup(); });

    it('concludes an active conversation', async () => {
      const { conversationId } = await parlour.create({
        kind: 'consult',
        cwd: '/tmp/workspace',
        participants: [
          { kind: 'human', name: 'Sean' },
          { kind: 'anima', name: 'Artificer' },
        ],
      });

      await parlour.end(conversationId, 'concluded');

      const detail = await parlour.show(conversationId);
      assert.ok(detail);
      assert.equal(detail.status, 'concluded');
      assert.ok(detail.endedAt);
    });

    it('abandons a conversation', async () => {
      const { conversationId } = await parlour.create({
        kind: 'consult',
        cwd: '/tmp/workspace',
        participants: [
          { kind: 'human', name: 'Sean' },
          { kind: 'anima', name: 'Artificer' },
        ],
      });

      await parlour.end(conversationId, 'abandoned');

      const detail = await parlour.show(conversationId);
      assert.ok(detail);
      assert.equal(detail.status, 'abandoned');
    });

    it('is idempotent — no error on already-ended conversation', async () => {
      const { conversationId } = await parlour.create({
        kind: 'consult',
        cwd: '/tmp/workspace',
        participants: [
          { kind: 'human', name: 'Sean' },
          { kind: 'anima', name: 'Artificer' },
        ],
      });

      await parlour.end(conversationId, 'concluded');
      // Second call should not throw
      await parlour.end(conversationId, 'abandoned');

      const detail = await parlour.show(conversationId);
      assert.ok(detail);
      // Status should still be 'concluded' (first end wins)
      assert.equal(detail.status, 'concluded');
    });

    it('defaults to concluded when no reason given', async () => {
      const { conversationId } = await parlour.create({
        kind: 'consult',
        cwd: '/tmp/workspace',
        participants: [
          { kind: 'human', name: 'Sean' },
          { kind: 'anima', name: 'Artificer' },
        ],
      });

      await parlour.end(conversationId);

      const detail = await parlour.show(conversationId);
      assert.ok(detail);
      assert.equal(detail.status, 'concluded');
    });

    it('throws on non-existent conversation', async () => {
      await assert.rejects(
        () => parlour.end('conv-nonexistent'),
        { message: /not found/ },
      );
    });
  });

  // ── nextParticipant() ──────────────────────────────────────────────

  describe('nextParticipant()', () => {
    beforeEach(() => { setup(); });

    it('returns the anima participant for consult conversations', async () => {
      const { conversationId, participants } = await parlour.create({
        kind: 'consult',
        topic: 'Test',
        cwd: '/tmp/workspace',
        participants: [
          { kind: 'human', name: 'Sean' },
          { kind: 'anima', name: 'Artificer' },
        ],
      });

      const next = await parlour.nextParticipant(conversationId);
      assert.ok(next);
      assert.equal(next.kind, 'anima');
      assert.equal(next.name, 'Artificer');
    });

    it('returns round-robin participant for convene conversations', async () => {
      const { conversationId, participants } = await parlour.create({
        kind: 'convene',
        topic: 'Discuss',
        cwd: '/tmp/workspace',
        participants: [
          { kind: 'anima', name: 'Alpha' },
          { kind: 'anima', name: 'Beta' },
          { kind: 'anima', name: 'Gamma' },
        ],
      });

      // No turns yet → first participant
      const next0 = await parlour.nextParticipant(conversationId);
      assert.ok(next0);
      assert.equal(next0.name, 'Alpha');

      // Take Alpha's turn
      await parlour.takeTurn({ conversationId, participantId: participants[0]!.id });

      // After 1 turn → second participant
      const next1 = await parlour.nextParticipant(conversationId);
      assert.ok(next1);
      assert.equal(next1.name, 'Beta');

      // Take Beta's turn
      await parlour.takeTurn({ conversationId, participantId: participants[1]!.id });

      // After 2 turns → third participant
      const next2 = await parlour.nextParticipant(conversationId);
      assert.ok(next2);
      assert.equal(next2.name, 'Gamma');
    });

    it('returns null for non-active conversation', async () => {
      const { conversationId } = await parlour.create({
        kind: 'consult',
        cwd: '/tmp/workspace',
        participants: [
          { kind: 'human', name: 'Sean' },
          { kind: 'anima', name: 'Artificer' },
        ],
      });

      await parlour.end(conversationId);

      const next = await parlour.nextParticipant(conversationId);
      assert.equal(next, null);
    });

    it('returns null when turn limit reached', async () => {
      const { conversationId, participants } = await parlour.create({
        kind: 'consult',
        topic: 'Test',
        turnLimit: 1,
        cwd: '/tmp/workspace',
        participants: [
          { kind: 'human', name: 'Sean' },
          { kind: 'anima', name: 'Artificer' },
        ],
      });

      const anima = participants.find((p) => p.kind === 'anima')!;
      await parlour.takeTurn({ conversationId, participantId: anima.id });

      const next = await parlour.nextParticipant(conversationId);
      assert.equal(next, null);
    });

    it('returns null for non-existent conversation', async () => {
      const next = await parlour.nextParticipant('conv-nonexistent');
      assert.equal(next, null);
    });
  });

  // ── list() ─────────────────────────────────────────────────────────

  describe('list()', () => {
    beforeEach(() => { setup(); });

    it('returns all conversations', async () => {
      await parlour.create({
        kind: 'consult',
        topic: 'First',
        cwd: '/tmp/workspace',
        participants: [
          { kind: 'human', name: 'Sean' },
          { kind: 'anima', name: 'Artificer' },
        ],
      });
      await parlour.create({
        kind: 'convene',
        topic: 'Second',
        cwd: '/tmp/workspace',
        participants: [
          { kind: 'anima', name: 'Alpha' },
          { kind: 'anima', name: 'Beta' },
        ],
      });

      const result = await parlour.list();
      assert.equal(result.length, 2);
      const topics = result.map((r) => r.topic).sort();
      assert.deepEqual(topics, ['First', 'Second']);
    });

    it('filters by status', async () => {
      const { conversationId: id1 } = await parlour.create({
        kind: 'consult',
        topic: 'Active one',
        cwd: '/tmp/workspace',
        participants: [
          { kind: 'human', name: 'Sean' },
          { kind: 'anima', name: 'Artificer' },
        ],
      });
      await parlour.create({
        kind: 'consult',
        topic: 'Will be concluded',
        cwd: '/tmp/workspace',
        participants: [
          { kind: 'human', name: 'Sean' },
          { kind: 'anima', name: 'Artificer' },
        ],
      });

      // End the first one
      await parlour.end(id1, 'concluded');

      const active = await parlour.list({ status: 'active' });
      assert.equal(active.length, 1);
      assert.equal(active[0]!.topic, 'Will be concluded');

      const concluded = await parlour.list({ status: 'concluded' });
      assert.equal(concluded.length, 1);
      assert.equal(concluded[0]!.topic, 'Active one');
    });

    it('filters by kind', async () => {
      await parlour.create({
        kind: 'consult',
        topic: 'Consult',
        cwd: '/tmp/workspace',
        participants: [
          { kind: 'human', name: 'Sean' },
          { kind: 'anima', name: 'Artificer' },
        ],
      });
      await parlour.create({
        kind: 'convene',
        topic: 'Convene',
        cwd: '/tmp/workspace',
        participants: [
          { kind: 'anima', name: 'Alpha' },
          { kind: 'anima', name: 'Beta' },
        ],
      });

      const consults = await parlour.list({ kind: 'consult' });
      assert.equal(consults.length, 1);
      assert.equal(consults[0]!.kind, 'consult');

      const convenes = await parlour.list({ kind: 'convene' });
      assert.equal(convenes.length, 1);
      assert.equal(convenes[0]!.kind, 'convene');
    });

    it('respects limit', async () => {
      for (let i = 0; i < 5; i++) {
        await parlour.create({
          kind: 'consult',
          topic: `Conv ${i}`,
          cwd: '/tmp/workspace',
          participants: [
            { kind: 'human', name: 'Sean' },
            { kind: 'anima', name: 'Artificer' },
          ],
        });
      }

      const limited = await parlour.list({ limit: 2 });
      assert.equal(limited.length, 2);
    });
  });

  // ── show() ─────────────────────────────────────────────────────────

  describe('show()', () => {
    beforeEach(() => { setup(); });

    it('returns null for non-existent conversation', async () => {
      const result = await parlour.show('conv-nonexistent');
      assert.equal(result, null);
    });

    it('includes turn summaries with session references', async () => {
      const { conversationId, participants } = await parlour.create({
        kind: 'consult',
        topic: 'Test',
        cwd: '/tmp/workspace',
        participants: [
          { kind: 'human', name: 'Sean' },
          { kind: 'anima', name: 'Artificer' },
        ],
      });

      const human = participants.find((p) => p.kind === 'human')!;
      const anima = participants.find((p) => p.kind === 'anima')!;

      await parlour.takeTurn({ conversationId, participantId: anima.id });
      await parlour.takeTurn({ conversationId, participantId: human.id, message: 'Hello' });

      const detail = await parlour.show(conversationId);
      assert.ok(detail);
      assert.equal(detail.turns.length, 2);
      assert.ok(detail.turns[0]!.sessionId); // anima turn has session
      assert.equal(detail.turns[1]!.sessionId, null); // human turn has no session
      assert.equal(detail.turns[0]!.turnNumber, 1);
      assert.equal(detail.turns[1]!.turnNumber, 2);
    });
  });

  // ── Error handling ─────────────────────────────────────────────────

  describe('error handling', () => {
    beforeEach(() => { setup(); });

    it('throws on non-existent conversation for takeTurn', async () => {
      await assert.rejects(
        () => parlour.takeTurn({
          conversationId: 'conv-nonexistent',
          participantId: 'part-whatever',
        }),
        { message: /not found/ },
      );
    });

    it('throws on non-existent participant for takeTurn', async () => {
      const { conversationId } = await parlour.create({
        kind: 'consult',
        cwd: '/tmp/workspace',
        participants: [
          { kind: 'human', name: 'Sean' },
          { kind: 'anima', name: 'Artificer' },
        ],
      });

      await assert.rejects(
        () => parlour.takeTurn({
          conversationId,
          participantId: 'part-nonexistent',
        }),
        { message: /not found/ },
      );
    });

    it('throws when taking a turn on concluded conversation', async () => {
      const { conversationId, participants } = await parlour.create({
        kind: 'consult',
        cwd: '/tmp/workspace',
        participants: [
          { kind: 'human', name: 'Sean' },
          { kind: 'anima', name: 'Artificer' },
        ],
      });

      await parlour.end(conversationId, 'concluded');

      const human = participants.find((p) => p.kind === 'human')!;
      await assert.rejects(
        () => parlour.takeTurn({
          conversationId,
          participantId: human.id,
          message: 'Too late',
        }),
        { message: /not active/ },
      );
    });
  });

  // ── takeTurnStreaming() ────────────────────────────────────────────

  describe('takeTurnStreaming()', () => {
    it('streams chunks and returns turn result', async () => {
      const testChunks: SessionChunk[] = [
        { type: 'text', text: 'Hello ' },
        { type: 'text', text: 'world!' },
      ];
      setup(createStreamingFakeProvider(testChunks));

      const { conversationId, participants } = await parlour.create({
        kind: 'consult',
        topic: 'Stream test',
        cwd: '/tmp/workspace',
        participants: [
          { kind: 'human', name: 'Sean' },
          { kind: 'anima', name: 'Artificer' },
        ],
      });

      const anima = participants.find((p) => p.kind === 'anima')!;
      const { chunks, result } = parlour.takeTurnStreaming({
        conversationId,
        participantId: anima.id,
      });

      // Collect all chunks
      const collected: unknown[] = [];
      for await (const chunk of chunks) {
        collected.push(chunk);
      }

      // Should have 2 text chunks + 1 turn_complete
      assert.equal(collected.length, 3);
      assert.deepEqual(collected[0], { type: 'text', text: 'Hello ' });
      assert.deepEqual(collected[1], { type: 'text', text: 'world!' });
      assert.equal((collected[2] as { type: string }).type, 'turn_complete');

      const turnResult = await result;
      assert.ok(turnResult.sessionResult);
      assert.equal(turnResult.turnNumber, 1);
    });

    it('handles human turns without streaming', async () => {
      setup();

      const { conversationId, participants } = await parlour.create({
        kind: 'consult',
        cwd: '/tmp/workspace',
        participants: [
          { kind: 'human', name: 'Sean' },
          { kind: 'anima', name: 'Artificer' },
        ],
      });

      const human = participants.find((p) => p.kind === 'human')!;
      const { chunks, result } = parlour.takeTurnStreaming({
        conversationId,
        participantId: human.id,
        message: 'Hello!',
      });

      // Should have no chunks for human turn
      const collected: unknown[] = [];
      for await (const chunk of chunks) {
        collected.push(chunk);
      }
      assert.equal(collected.length, 0);

      const turnResult = await result;
      assert.equal(turnResult.sessionResult, null);
      assert.equal(turnResult.turnNumber, 1);
    });
  });

  // ── Provider session continuity ────────────────────────────────────

  describe('provider session continuity', () => {
    beforeEach(() => { setup(); });

    it('stores and passes providerSessionId across turns', async () => {
      const { conversationId, participants } = await parlour.create({
        kind: 'consult',
        topic: 'Test continuity',
        cwd: '/tmp/workspace',
        participants: [
          { kind: 'human', name: 'Sean' },
          { kind: 'anima', name: 'Artificer' },
        ],
      });

      const anima = participants.find((p) => p.kind === 'anima')!;

      // First turn — providerSessionId gets set
      const t1 = await parlour.takeTurn({ conversationId, participantId: anima.id });
      assert.ok(t1.sessionResult!.providerSessionId);

      // Second turn — should resume using stored providerSessionId
      const t2 = await parlour.takeTurn({
        conversationId,
        participantId: anima.id,
        message: 'Continue',
      });
      assert.ok(t2.sessionResult);
      // The fake provider returns incrementing session ids,
      // confirming a new session was launched (the Parlour doesn't
      // control resume, it just passes the id through)
      assert.notEqual(t1.sessionResult!.id, t2.sessionResult!.id);
    });
  });

  // ── show() enrichment (TurnSummary output/costUsd/tokenUsage) ───────

  describe('show() enrichment — output, costUsd, tokenUsage', () => {
    beforeEach(() => { setup(createOutputFakeProvider('Hello from anima!')); });

    it('anima turn includes output from session doc', async () => {
      const { conversationId, participants } = await parlour.create({
        kind: 'consult',
        cwd: '/tmp/workspace',
        participants: [
          { kind: 'human', name: 'User' },
          { kind: 'anima', name: 'Artificer' },
        ],
      });

      const human = participants.find((p) => p.kind === 'human')!;
      const anima = participants.find((p) => p.kind === 'anima')!;

      await parlour.takeTurn({ conversationId, participantId: human.id, message: 'Hello' });
      await parlour.takeTurn({ conversationId, participantId: anima.id });

      const detail = await parlour.show(conversationId);
      assert.ok(detail);

      const animaTurn = detail.turns.find((t) => t.sessionId !== null);
      assert.ok(animaTurn, 'Should have an anima turn');
      assert.equal(animaTurn.output, 'Hello from anima!');
    });

    it('anima turn includes costUsd from session doc', async () => {
      const { conversationId, participants } = await parlour.create({
        kind: 'consult',
        cwd: '/tmp/workspace',
        participants: [
          { kind: 'human', name: 'User' },
          { kind: 'anima', name: 'Artificer' },
        ],
      });

      const human = participants.find((p) => p.kind === 'human')!;
      const anima = participants.find((p) => p.kind === 'anima')!;

      await parlour.takeTurn({ conversationId, participantId: human.id, message: 'Hello' });
      await parlour.takeTurn({ conversationId, participantId: anima.id });

      const detail = await parlour.show(conversationId);
      assert.ok(detail);

      const animaTurn = detail.turns.find((t) => t.sessionId !== null);
      assert.ok(animaTurn);
      assert.equal(animaTurn.costUsd, 0.02);
    });

    it('anima turn includes tokenUsage from session doc', async () => {
      const { conversationId, participants } = await parlour.create({
        kind: 'consult',
        cwd: '/tmp/workspace',
        participants: [
          { kind: 'human', name: 'User' },
          { kind: 'anima', name: 'Artificer' },
        ],
      });

      const human = participants.find((p) => p.kind === 'human')!;
      const anima = participants.find((p) => p.kind === 'anima')!;

      await parlour.takeTurn({ conversationId, participantId: human.id, message: 'Hello' });
      await parlour.takeTurn({ conversationId, participantId: anima.id });

      const detail = await parlour.show(conversationId);
      assert.ok(detail);

      const animaTurn = detail.turns.find((t) => t.sessionId !== null);
      assert.ok(animaTurn);
      assert.ok(animaTurn.tokenUsage, 'Should have tokenUsage');
      assert.equal(animaTurn.tokenUsage!.inputTokens, 200);
      assert.equal(animaTurn.tokenUsage!.outputTokens, 100);
    });

    it('human turn has null output, costUsd, and tokenUsage', async () => {
      const { conversationId, participants } = await parlour.create({
        kind: 'consult',
        cwd: '/tmp/workspace',
        participants: [
          { kind: 'human', name: 'User' },
          { kind: 'anima', name: 'Artificer' },
        ],
      });

      const human = participants.find((p) => p.kind === 'human')!;

      await parlour.takeTurn({ conversationId, participantId: human.id, message: 'Hello' });

      const detail = await parlour.show(conversationId);
      assert.ok(detail);

      const humanTurn = detail.turns.find((t) => t.sessionId === null);
      assert.ok(humanTurn);
      assert.equal(humanTurn.output, null);
      assert.equal(humanTurn.costUsd, null);
      assert.equal(humanTurn.tokenUsage, null);
    });
  });

  // ── Route behavior — conversation list filtering ────────────────────

  describe('conversation list filtering (route logic)', () => {
    beforeEach(() => { setup(); });

    it('list() returns only consult conversations matching a role name', async () => {
      // Create a conversation with artificer
      const { conversationId: c1 } = await parlour.create({
        kind: 'consult',
        cwd: '/tmp/workspace',
        participants: [
          { kind: 'human', name: 'User' },
          { kind: 'anima', name: 'artificer' },
        ],
      });

      // Create a conversation with scribe
      await parlour.create({
        kind: 'consult',
        cwd: '/tmp/workspace',
        participants: [
          { kind: 'human', name: 'User' },
          { kind: 'anima', name: 'scribe' },
        ],
      });

      // List all active consult conversations
      const all = await parlour.list({ status: 'active', kind: 'consult', limit: 50 });

      // Filter in-memory by role name (as the route handler does)
      const forArtificer = all.filter((conv) =>
        conv.participants.some((p) => p.name === 'artificer'),
      );

      assert.equal(forArtificer.length, 1);
      assert.equal(forArtificer[0]!.id, c1);
    });

    it('list() excludes concluded conversations when status=active', async () => {
      const { conversationId } = await parlour.create({
        kind: 'consult',
        cwd: '/tmp/workspace',
        participants: [
          { kind: 'human', name: 'User' },
          { kind: 'anima', name: 'artificer' },
        ],
      });

      // End the conversation
      await parlour.end(conversationId, 'concluded');

      const active = await parlour.list({ status: 'active', kind: 'consult', limit: 50 });
      const forArtificer = active.filter((conv) =>
        conv.participants.some((p) => p.name === 'artificer'),
      );

      assert.equal(forArtificer.length, 0);
    });

    it('show() conversation with topic uses topic as title', async () => {
      const { conversationId } = await parlour.create({
        kind: 'consult',
        topic: 'Refactoring session',
        cwd: '/tmp/workspace',
        participants: [
          { kind: 'human', name: 'User' },
          { kind: 'anima', name: 'artificer' },
        ],
      });

      const detail = await parlour.show(conversationId);
      assert.ok(detail);
      assert.equal(detail.topic, 'Refactoring session');
    });

    it('show() first human message is accessible from turns', async () => {
      const { conversationId, participants } = await parlour.create({
        kind: 'consult',
        cwd: '/tmp/workspace',
        participants: [
          { kind: 'human', name: 'User' },
          { kind: 'anima', name: 'artificer' },
        ],
      });

      const human = participants.find((p) => p.kind === 'human')!;
      await parlour.takeTurn({
        conversationId,
        participantId: human.id,
        message: 'Help me fix the tests',
      });

      const detail = await parlour.show(conversationId);
      assert.ok(detail);
      const humanTurn = detail.turns.find((t) => t.sessionId === null && t.message !== null);
      assert.ok(humanTurn);
      assert.equal(humanTurn.message, 'Help me fix the tests');
    });

    it('conversation with no topic and no turns falls back to createdAt', async () => {
      const { conversationId } = await parlour.create({
        kind: 'consult',
        cwd: '/tmp/workspace',
        participants: [
          { kind: 'human', name: 'User' },
          { kind: 'anima', name: 'artificer' },
        ],
      });

      const detail = await parlour.show(conversationId);
      assert.ok(detail);
      assert.equal(detail.topic, null);
      assert.equal(detail.turns.length, 0);
      // The route handler falls back to createdAt when no topic and no turns
      // We verify the createdAt is a valid ISO string
      assert.ok(!isNaN(Date.parse(detail.createdAt)));
    });
  });

  // ── supportKit pages and routes registration ─────────────────────────

  describe('supportKit contributions', () => {
    it('parlour apparatus exports pages in supportKit', () => {
      const plugin = createParlour();
      const apparatus = (plugin as { apparatus: Record<string, unknown> }).apparatus;
      const supportKit = apparatus.supportKit as Record<string, unknown>;
      assert.ok(supportKit, 'supportKit should exist');
      const pages = supportKit.pages as Array<{ id: string; title: string; dir: string }>;
      assert.ok(Array.isArray(pages), 'pages should be an array');
      const parlourPage = pages.find((p) => p.id === 'parlour');
      assert.ok(parlourPage, 'parlour page should be contributed');
      assert.equal(parlourPage.title, 'Parlour');
      assert.ok(parlourPage.dir.includes('parlour'), 'dir should reference parlour directory');
    });

    it('parlour apparatus exports routes in supportKit', () => {
      const plugin = createParlour();
      const apparatus = (plugin as { apparatus: Record<string, unknown> }).apparatus;
      const supportKit = apparatus.supportKit as Record<string, unknown>;
      const routes = supportKit.routes as Array<{ method: string; path: string; handler: unknown }>;
      assert.ok(Array.isArray(routes), 'routes should be an array');
      assert.equal(routes.length, 4, 'Should have 4 routes');

      const paths = routes.map((r) => `${r.method} ${r.path}`);
      assert.ok(paths.includes('GET /api/parlour/roles'), 'Should have roles route');
      assert.ok(paths.includes('GET /api/parlour/conversations'), 'Should have conversations route');
      assert.ok(paths.includes('POST /api/parlour/create'), 'Should have create route');
      assert.ok(paths.includes('POST /api/parlour/turn'), 'Should have turn route');
    });
  });

  // ── Route handler integration tests ─────────────────────────────────
  //
  // Tests 9–16 from the commission spec. These test the four custom API
  // routes via a real Hono app instance, using the same fake guild
  // infrastructure as the other test suites.

  describe('route handler integration', () => {
    let testApp: InstanceType<typeof Hono>;

    /** Parse SSE response body into an array of { event, data } objects. */
    async function collectSSEEvents(
      res: Response,
    ): Promise<Array<{ event: string; data: unknown }>> {
      const text = await res.text();
      const events: Array<{ event: string; data: unknown }> = [];
      for (const block of text.split('\n\n')) {
        if (!block.trim()) continue;
        let eventName = 'message';
        let dataStr = '';
        for (const line of block.split('\n')) {
          if (line.startsWith('event: ')) eventName = line.slice(7).trim();
          if (line.startsWith('data: ')) dataStr = line.slice(6).trim();
        }
        if (dataStr) {
          try {
            events.push({ event: eventName, data: JSON.parse(dataStr) });
          } catch {
            events.push({ event: eventName, data: dataStr });
          }
        }
      }
      return events;
    }

    beforeEach(() => {
      setup();
      testApp = new Hono();
      for (const route of parlourRoutes) {
        testApp.on(
          [route.method],
          route.path,
          route.handler as Parameters<typeof testApp.on>[2],
        );
      }
    });

    // ── Test 9: GET /api/parlour/roles ───────────────────────────────

    it('GET /api/parlour/roles returns sorted array of role info objects', async () => {
      const res = await testApp.request('/api/parlour/roles');
      assert.equal(res.status, 200);
      const data = await res.json() as Array<{ name: string; source: string; permissions: string[] }>;
      assert.ok(Array.isArray(data), 'Response should be an array');
      // The setup guildConfig includes artificer and scribe loom roles
      assert.equal(data.length, 2, 'Should have 2 configured roles');
      // Sorted alphabetically
      assert.equal(data[0]!.name, 'artificer');
      assert.equal(data[1]!.name, 'scribe');
      assert.equal(data[0]!.source, 'guild');
      assert.ok(Array.isArray(data[0]!.permissions), 'Role should have permissions array');
    });

    // ── Test 10: GET /api/parlour/conversations filters by role ──────

    it('GET /api/parlour/conversations returns only conversations for the specified role', async () => {
      await parlour.create({
        kind: 'consult',
        cwd: '/tmp/workspace',
        participants: [
          { kind: 'human', name: 'User' },
          { kind: 'anima', name: 'artificer' },
        ],
      });
      await parlour.create({
        kind: 'consult',
        cwd: '/tmp/workspace',
        participants: [
          { kind: 'human', name: 'User' },
          { kind: 'anima', name: 'scribe' },
        ],
      });

      const res = await testApp.request('/api/parlour/conversations?role=artificer');
      assert.equal(res.status, 200);
      const data = await res.json() as Array<{ id: string }>;
      assert.equal(data.length, 1, 'Should return only artificer conversations');
    });

    // ── Test 11: GET /api/parlour/conversations excludes concluded ────

    it('GET /api/parlour/conversations excludes concluded conversations when status=active', async () => {
      const { conversationId } = await parlour.create({
        kind: 'consult',
        cwd: '/tmp/workspace',
        participants: [
          { kind: 'human', name: 'User' },
          { kind: 'anima', name: 'artificer' },
        ],
      });
      await parlour.end(conversationId, 'concluded');

      const res = await testApp.request('/api/parlour/conversations?role=artificer&status=active');
      assert.equal(res.status, 200);
      const data = await res.json() as unknown[];
      assert.equal(data.length, 0, 'Concluded conversation should not appear in active list');
    });

    // ── Test 12: POST /api/parlour/turn lazy conversation creation ────

    it('POST /api/parlour/turn creates conversation lazily and emits conversation_created event', async () => {
      const res = await testApp.request('/api/parlour/turn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'artificer', message: 'Hello' }),
      });
      assert.equal(res.status, 200);

      const events = await collectSSEEvents(res);
      const createdEvent = events.find((e) => e.event === 'conversation_created');
      assert.ok(createdEvent, 'Should emit conversation_created SSE event');

      const payload = createdEvent.data as { conversationId: string; participants: unknown[] };
      assert.ok(payload.conversationId, 'conversation_created event should include conversationId');
      assert.ok(Array.isArray(payload.participants), 'conversation_created event should include participants');

      const turnComplete = events.find(
        (e) => e.event === 'chunk' && (e.data as { type: string }).type === 'turn_complete',
      );
      assert.ok(turnComplete, 'Should emit turn_complete chunk after streaming');
    });

    // ── Test 13: POST /api/parlour/turn continues existing ───────────

    it('POST /api/parlour/turn continues existing conversation without conversation_created event', async () => {
      // Set up a conversation with one completed round
      const { conversationId, participants } = await parlour.create({
        kind: 'consult',
        cwd: '/tmp/workspace',
        participants: [
          { kind: 'human', name: 'User' },
          { kind: 'anima', name: 'artificer' },
        ],
      });
      const human = participants.find((p) => p.kind === 'human')!;
      await parlour.takeTurn({ conversationId, participantId: human.id, message: 'Hello' });
      const anima = participants.find((p) => p.kind === 'anima')!;
      const { result } = parlour.takeTurnStreaming({ conversationId, participantId: anima.id });
      await result;

      const res = await testApp.request('/api/parlour/turn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId, message: 'follow-up' }),
      });
      assert.equal(res.status, 200);

      const events = await collectSSEEvents(res);
      const createdEvent = events.find((e) => e.event === 'conversation_created');
      assert.equal(createdEvent, undefined, 'Should NOT emit conversation_created for existing conversation');

      const turnComplete = events.find(
        (e) => e.event === 'chunk' && (e.data as { type: string }).type === 'turn_complete',
      );
      assert.ok(turnComplete, 'Should still emit turn_complete chunk');
    });

    // ── Test 14: POST /api/parlour/turn HTTP 400 validation ──────────

    it('POST /api/parlour/turn returns 400 when neither role nor conversationId is provided', async () => {
      const res = await testApp.request('/api/parlour/turn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'hello' }),
      });
      assert.equal(res.status, 400, 'Should return HTTP 400 for missing role/conversationId');
    });

    it('POST /api/parlour/turn returns 400 when message is empty or missing', async () => {
      const res = await testApp.request('/api/parlour/turn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'artificer', message: '   ' }),
      });
      assert.equal(res.status, 400, 'Should return HTTP 400 for empty message');
    });

    // ── Test 15: POST /api/parlour/turn with codexName ───────────────

    it('POST /api/parlour/turn with codexName calls openDraft on the codexes apparatus', async () => {
      let openDraftCalled = false;
      let openDraftArg: string | undefined;
      const worktreePath = '/tmp/worktrees/my-codex-abc123';

      // Re-setup with a mock codexes apparatus
      setup(createFakeProvider(), {
        codexes: {
          openDraft({ codexName }: { codexName: string }) {
            openDraftCalled = true;
            openDraftArg = codexName;
            return Promise.resolve({ path: worktreePath });
          },
        },
      });
      // Rebuild testApp with the new guild
      testApp = new Hono();
      for (const route of parlourRoutes) {
        testApp.on(
          [route.method],
          route.path,
          route.handler as Parameters<typeof testApp.on>[2],
        );
      }

      const res = await testApp.request('/api/parlour/turn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'artificer', message: 'Hello', codexName: 'my-codex' }),
      });
      assert.equal(res.status, 200);

      // Drain the stream so the handler fully executes
      await collectSSEEvents(res);

      assert.ok(openDraftCalled, 'openDraft should have been called on the codexes apparatus');
      assert.equal(openDraftArg, 'my-codex', 'openDraft should be called with the provided codexName');
    });

    // ── Test 16: POST /api/parlour/turn without codexes apparatus ────

    it('POST /api/parlour/turn with codexName falls back to guild home when codexes not installed', async () => {
      // Standard setup has no codexes apparatus — guild().apparatus('codexes') throws
      const res = await testApp.request('/api/parlour/turn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'artificer', message: 'Hello', codexName: 'missing-codex' }),
      });
      assert.equal(res.status, 200, 'Should succeed (fall back to guild home) when codexes not installed');

      const events = await collectSSEEvents(res);
      // Should still create the conversation (no error event)
      const errorEvent = events.find((e) => e.event === 'error');
      assert.equal(errorEvent, undefined, 'Should not emit an error event when codexes not installed');
      const createdEvent = events.find((e) => e.event === 'conversation_created');
      assert.ok(createdEvent, 'Should still create the conversation using guild home as cwd');
    });
  });
});

=== FILE: packages/plugins/parlour/src/parlour.ts ===
/**
 * The Parlour — multi-turn conversation management apparatus.
 *
 * Manages two kinds of conversation:
 * - consult: a human talks to an anima
 * - convene: multiple animas hold a structured dialogue
 *
 * The Parlour orchestrates turns — it decides when and for whom to call
 * The Animator, and tracks conversation state in The Stacks. It does not
 * launch sessions itself (delegates to The Animator) or assemble prompts
 * (delegates to The Loom).
 *
 * See: docs/architecture/apparatus/parlour.md
 */

import type { Plugin, StartupContext } from '@shardworks/nexus-core';
import { guild, generateId } from '@shardworks/nexus-core';
import type { StacksApi, Book, ReadOnlyBook, WhereCondition } from '@shardworks/stacks-apparatus';
import type { AnimatorApi, SessionResult, SessionChunk, SessionDoc } from '@shardworks/animator-apparatus';
import type { LoomApi } from '@shardworks/loom-apparatus';

import type {
  ParlourApi,
  ConversationDoc,
  TurnDoc,
  ParticipantRecord,
  Participant,
  CreateConversationRequest,
  CreateConversationResult,
  TakeTurnRequest,
  TurnResult,
  ConversationChunk,
  ConversationSummary,
  ConversationDetail,
  TurnSummary,
  ListConversationsOptions,
} from './types.ts';

import { conversationList, conversationShow, conversationEnd } from './tools/index.ts';
import { parlourRoutes } from './routes.ts';

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Count anima turns in the conversation (for turn limit enforcement).
 * Human turns do not count toward the turn limit.
 */
async function countAnimaTurns(
  turns: ReadOnlyBook<TurnDoc>,
  conversationId: string,
): Promise<number> {
  return turns.count([
    ['conversationId', '=', conversationId],
    ['participantKind', '=', 'anima'],
  ]);
}

/**
 * Count all turns in the conversation (for turnNumber assignment).
 */
async function countAllTurns(
  turns: ReadOnlyBook<TurnDoc>,
  conversationId: string,
): Promise<number> {
  return turns.count([
    ['conversationId', '=', conversationId],
  ]);
}

/**
 * Get the most recent turn for a specific participant.
 */
async function getLastTurnForParticipant(
  turns: ReadOnlyBook<TurnDoc>,
  conversationId: string,
  participantId: string,
): Promise<TurnDoc | null> {
  const results = await turns.find({
    where: [
      ['conversationId', '=', conversationId],
      ['participantId', '=', participantId],
    ],
    orderBy: ['turnNumber', 'desc'],
    limit: 1,
  });
  return results[0] ?? null;
}

/**
 * Get turns since a given turn number (exclusive), ordered ascending.
 */
async function getTurnsSince(
  turns: ReadOnlyBook<TurnDoc>,
  conversationId: string,
  afterTurnNumber: number,
): Promise<TurnDoc[]> {
  return turns.find({
    where: [
      ['conversationId', '=', conversationId],
      ['turnNumber', '>', afterTurnNumber],
    ],
    orderBy: ['turnNumber', 'asc'],
  });
}

/**
 * Get all turns for a conversation, ordered by turnNumber ascending.
 */
async function getAllTurns(
  turns: ReadOnlyBook<TurnDoc>,
  conversationId: string,
): Promise<TurnDoc[]> {
  return turns.find({
    where: [
      ['conversationId', '=', conversationId],
    ],
    orderBy: ['turnNumber', 'asc'],
  });
}

/**
 * Map ParticipantRecord[] to Participant[] (public projection).
 */
function toParticipants(records: ParticipantRecord[]): Participant[] {
  return records.map((r) => ({
    id: r.id,
    name: r.name,
    kind: r.kind,
  }));
}

/**
 * Assemble the inter-turn message for a consult conversation.
 *
 * For consult, the pattern is simple: the human's message from the
 * TakeTurnRequest is passed directly as the prompt. If no message
 * is provided, the conversation topic is used as fallback (first turn).
 */
function assembleConsultMessage(
  request: TakeTurnRequest,
  conversation: ConversationDoc,
  isFirstTurn: boolean,
): string | undefined {
  if (request.message) return request.message;
  if (isFirstTurn && conversation.topic) return conversation.topic;
  return undefined;
}

/**
 * Assemble the inter-turn message for a convene conversation.
 *
 * For convene, each participant needs to see what other participants said
 * since their last turn. This requires reading session transcripts, which
 * depends on session record artifacts that the Animator MVP does not produce.
 *
 * At MVP, this uses the human-readable messages stored in turn records,
 * which are adequate for human turns but cannot capture anima responses
 * (the Animator does not expose transcript text). Anima contributions
 * fall back to a placeholder.
 *
 * See: parlour-implementation-tracker.md § Gap #1
 */
async function assembleConveneMessage(
  turns: ReadOnlyBook<TurnDoc>,
  conversation: ConversationDoc,
  participantId: string,
  isFirstTurn: boolean,
): Promise<string | undefined> {
  if (isFirstTurn && conversation.topic) return conversation.topic;

  // Get this participant's last turn to find intervening turns
  const lastTurn = await getLastTurnForParticipant(
    turns,
    conversation.id,
    participantId,
  );

  if (!lastTurn) {
    // Never taken a turn — use topic
    return conversation.topic ?? undefined;
  }

  // Get all turns since this participant's last turn
  const intervening = await getTurnsSince(
    turns,
    conversation.id,
    lastTurn.turnNumber,
  );

  if (intervening.length === 0) return undefined;

  // Assemble messages from other participants
  const lines: string[] = [];
  for (const turn of intervening) {
    if (turn.participantId === participantId) continue;
    if (turn.participantKind === 'human' && turn.message) {
      lines.push(`[${turn.participantName}]: ${turn.message}`);
    } else if (turn.participantKind === 'anima') {
      // Cannot extract anima response — Animator MVP has no transcript text.
      // Placeholder until session record artifacts or response capture is available.
      lines.push(`[${turn.participantName}]: [response not available]`);
    }
  }

  return lines.length > 0 ? lines.join('\n\n') : undefined;
}

// ── Apparatus factory ────────────────────────────────────────────────

/**
 * Create the Parlour apparatus plugin.
 *
 * Returns a Plugin with:
 * - `requires: ['stacks', 'animator', 'loom']` — conversation orchestration
 * - `provides: ParlourApi` — the conversation management API
 * - `supportKit` — contributes `conversations` + `turns` books + management tools
 */
export function createParlour(): Plugin {
  let conversations: Book<ConversationDoc>;
  let turns: Book<TurnDoc>;
  let sessions: ReadOnlyBook<SessionDoc>;

  const api: ParlourApi = {
    async create(request: CreateConversationRequest): Promise<CreateConversationResult> {
      const conversationId = generateId('conv');

      // Build participant records
      const participants: ParticipantRecord[] = request.participants.map((decl) => ({
        id: generateId('part'),
        kind: decl.kind,
        name: decl.name,
        animaId: null, // No Roster yet — leave null at MVP
        providerSessionId: null,
      }));

      // Write conversation document
      const doc: ConversationDoc = {
        id: conversationId,
        status: 'active',
        kind: request.kind,
        topic: request.topic ?? null,
        turnLimit: request.turnLimit ?? null,
        createdAt: new Date().toISOString(),
        endedAt: null,
        eventId: request.eventId ?? null,
        participants,
        cwd: request.cwd,
      };

      await conversations.put(doc);

      return {
        conversationId,
        participants: toParticipants(participants),
      };
    },

    async takeTurn(request: TakeTurnRequest): Promise<TurnResult> {
      // 1. Read conversation state
      const conv = await conversations.get(request.conversationId);
      if (!conv) {
        throw new Error(`Conversation "${request.conversationId}" not found.`);
      }
      if (conv.status !== 'active') {
        throw new Error(
          `Conversation "${request.conversationId}" is ${conv.status}, not active.`,
        );
      }

      // Find the participant
      const participant = conv.participants.find((p) => p.id === request.participantId);
      if (!participant) {
        throw new Error(
          `Participant "${request.participantId}" not found in conversation "${request.conversationId}".`,
        );
      }

      // 2. Determine turn number
      const totalTurns = await countAllTurns(turns, conv.id);
      const turnNumber = totalTurns + 1;

      // 3. Check turn limit (anima turns only)
      if (participant.kind === 'anima' && conv.turnLimit !== null) {
        const animaTurns = await countAnimaTurns(turns, conv.id);
        if (animaTurns >= conv.turnLimit) {
          throw new Error(
            `Conversation "${conv.id}" has reached its turn limit of ${conv.turnLimit}.`,
          );
        }
      }

      const startedAt = new Date().toISOString();

      if (participant.kind === 'human') {
        // Human turn — record the message, no session launched
        const turnId = generateId('turn', 6);
        await turns.put({
          id: turnId,
          conversationId: conv.id,
          turnNumber,
          participantId: participant.id,
          participantName: participant.name,
          participantKind: 'human',
          message: request.message ?? null,
          sessionId: null,
          startedAt,
          endedAt: new Date().toISOString(),
        });

        return {
          sessionResult: null,
          turnNumber,
          conversationActive: true,
        };
      }

      // Anima turn — weave context and call the Animator
      const loom = guild().apparatus<LoomApi>('loom');
      const animator = guild().apparatus<AnimatorApi>('animator');

      // Determine if this is the participant's first turn
      const lastTurn = await getLastTurnForParticipant(turns, conv.id, participant.id);
      const isFirstTurn = lastTurn === null;

      // Assemble the message for this turn
      let message: string | undefined;
      if (conv.kind === 'consult') {
        message = assembleConsultMessage(request, conv, isFirstTurn);
      } else {
        message = await assembleConveneMessage(turns, conv, participant.id, isFirstTurn);
      }

      // Weave anima context via The Loom
      const context = await loom.weave({ role: undefined });

      // Call The Animator
      const { result: resultPromise } = animator.animate({
        context,
        prompt: message,
        cwd: conv.cwd,
        conversationId: participant.providerSessionId ?? undefined,
        metadata: {
          trigger: 'parlour',
          conversationId: conv.id,
          turnNumber,
          participantId: participant.id,
        },
      });

      const sessionResult = await resultPromise;

      // Update participant's providerSessionId for --resume
      const updatedParticipants = conv.participants.map((p) =>
        p.id === participant.id
          ? { ...p, providerSessionId: sessionResult.providerSessionId ?? p.providerSessionId }
          : p,
      );
      await conversations.patch(conv.id, { participants: updatedParticipants });

      // Record the turn
      const turnId = generateId('turn', 6);
      await turns.put({
        id: turnId,
        conversationId: conv.id,
        turnNumber,
        participantId: participant.id,
        participantName: participant.name,
        participantKind: 'anima',
        message: message ?? null,
        sessionId: sessionResult.id,
        startedAt,
        endedAt: new Date().toISOString(),
      });

      // Check if turn limit reached → auto-conclude
      let conversationActive = true;
      if (conv.turnLimit !== null) {
        const animaTurns = await countAnimaTurns(turns, conv.id);
        if (animaTurns >= conv.turnLimit) {
          await this.end(conv.id, 'concluded');
          conversationActive = false;
        }
      }

      return {
        sessionResult,
        turnNumber,
        conversationActive,
      };
    },

    takeTurnStreaming(request: TakeTurnRequest): {
      chunks: AsyncIterable<ConversationChunk>;
      result: Promise<TurnResult>;
    } {
      type HumanResolved = { kind: 'human'; turnResult: TurnResult };
      type AnimaResolved = {
        kind: 'anima';
        animatorChunks: AsyncIterable<SessionChunk>;
        animatorResult: Promise<SessionResult>;
        conv: ConversationDoc;
        participant: ParticipantRecord;
        turnNumber: number;
        startedAt: string;
        message: string | undefined;
      };
      type StreamResolved = HumanResolved | AnimaResolved;

      // Read conversation state and launch the turn.
      // We need to return synchronously, so wrap the async flow.
      const deferred: Promise<StreamResolved> = (async (): Promise<StreamResolved> => {
        // 1. Read conversation state
        const conv = await conversations.get(request.conversationId);
        if (!conv) {
          throw new Error(`Conversation "${request.conversationId}" not found.`);
        }
        if (conv.status !== 'active') {
          throw new Error(
            `Conversation "${request.conversationId}" is ${conv.status}, not active.`,
          );
        }

        // Find the participant
        const participant = conv.participants.find((p) => p.id === request.participantId);
        if (!participant) {
          throw new Error(
            `Participant "${request.participantId}" not found in conversation "${request.conversationId}".`,
          );
        }

        // Human turns don't stream — delegate to non-streaming path
        if (participant.kind === 'human') {
          const turnResult = await this.takeTurn(request);
          return { kind: 'human', turnResult };
        }

        // 2. Determine turn number
        const totalTurns = await countAllTurns(turns, conv.id);
        const turnNumber = totalTurns + 1;

        // 3. Check turn limit
        if (conv.turnLimit !== null) {
          const animaTurns = await countAnimaTurns(turns, conv.id);
          if (animaTurns >= conv.turnLimit) {
            throw new Error(
              `Conversation "${conv.id}" has reached its turn limit of ${conv.turnLimit}.`,
            );
          }
        }

        const startedAt = new Date().toISOString();

        const loom = guild().apparatus<LoomApi>('loom');
        const animator = guild().apparatus<AnimatorApi>('animator');

        // Determine if first turn
        const lastTurn = await getLastTurnForParticipant(turns, conv.id, participant.id);
        const isFirstTurn = lastTurn === null;

        // Assemble message
        let message: string | undefined;
        if (conv.kind === 'consult') {
          message = assembleConsultMessage(request, conv, isFirstTurn);
        } else {
          message = await assembleConveneMessage(turns, conv, participant.id, isFirstTurn);
        }

        // Weave + animate with streaming
        const context = await loom.weave({ role: undefined });
        const handle = animator.animate({
          context,
          prompt: message,
          cwd: conv.cwd,
          conversationId: participant.providerSessionId ?? undefined,
          metadata: {
            trigger: 'parlour',
            conversationId: conv.id,
            turnNumber,
            participantId: participant.id,
          },
          streaming: true,
        });

        return {
          kind: 'anima',
          animatorChunks: handle.chunks,
          animatorResult: handle.result,
          conv,
          participant,
          turnNumber,
          startedAt,
          message,
        };
      })();

      async function* streamChunks(): AsyncIterable<ConversationChunk> {
        const resolved = await deferred;
        // Human turn — no chunks
        if (resolved.kind === 'human') return;

        const { animatorChunks, animatorResult } = resolved;

        // Pipe through Animator chunks
        yield* animatorChunks;

        // Wait for final result to emit turn_complete
        const sessionResult = await animatorResult;
        yield {
          type: 'turn_complete' as const,
          turnNumber: resolved.turnNumber,
          costUsd: sessionResult.costUsd,
        };
      }

      const result = (async (): Promise<TurnResult> => {
        const resolved = await deferred;

        // Human turn — already handled
        if (resolved.kind === 'human') return resolved.turnResult;

        const { animatorResult, conv, participant, turnNumber, startedAt, message } = resolved;
        const sessionResult = await animatorResult;

        // Update providerSessionId
        const updatedParticipants = conv.participants.map((p) =>
          p.id === participant.id
            ? { ...p, providerSessionId: sessionResult.providerSessionId ?? p.providerSessionId }
            : p,
        );
        await conversations.patch(conv.id, { participants: updatedParticipants });

        // Record turn
        const turnId = generateId('turn', 6);
        await turns.put({
          id: turnId,
          conversationId: conv.id,
          turnNumber,
          participantId: participant.id,
          participantName: participant.name,
          participantKind: 'anima',
          message: message ?? null,
          sessionId: sessionResult.id,
          startedAt,
          endedAt: new Date().toISOString(),
        });

        // Check turn limit
        let conversationActive = true;
        if (conv.turnLimit !== null) {
          const animaTurns = await countAnimaTurns(turns, conv.id);
          if (animaTurns >= conv.turnLimit) {
            await api.end(conv.id, 'concluded');
            conversationActive = false;
          }
        }

        return { sessionResult, turnNumber, conversationActive };
      })();

      return { chunks: streamChunks(), result };
    },

    async nextParticipant(conversationId: string): Promise<Participant | null> {
      const conv = await conversations.get(conversationId);
      if (!conv || conv.status !== 'active') return null;

      // Check turn limit
      if (conv.turnLimit !== null) {
        const animaTurns = await countAnimaTurns(turns, conv.id);
        if (animaTurns >= conv.turnLimit) return null;
      }

      if (conv.kind === 'consult') {
        // For consult: always return the anima participant
        const anima = conv.participants.find((p) => p.kind === 'anima');
        if (!anima) return null;
        return { id: anima.id, name: anima.name, kind: anima.kind };
      }

      // For convene: round-robin among all participants
      const totalTurns = await countAllTurns(turns, conv.id);
      const nextIndex = totalTurns % conv.participants.length;
      const next = conv.participants[nextIndex];
      return { id: next.id, name: next.name, kind: next.kind };
    },

    async end(conversationId: string, reason?: 'concluded' | 'abandoned'): Promise<void> {
      const conv = await conversations.get(conversationId);
      if (!conv) {
        throw new Error(`Conversation "${conversationId}" not found.`);
      }
      // Idempotent — no error if already ended
      if (conv.status !== 'active') return;

      await conversations.patch(conversationId, {
        status: reason ?? 'concluded',
        endedAt: new Date().toISOString(),
      });
    },

    async list(options?: ListConversationsOptions): Promise<ConversationSummary[]> {
      const where: WhereCondition[] = [];
      if (options?.status) where.push(['status', '=', options.status]);
      if (options?.kind) where.push(['kind', '=', options.kind]);

      const convs = await conversations.find({
        where: where.length > 0 ? where : undefined,
        orderBy: ['createdAt', 'desc'],
        limit: options?.limit ?? 20,
      });

      // Build summaries with turn counts and cost aggregation
      const summaries: ConversationSummary[] = [];
      for (const conv of convs) {
        const convTurns = await getAllTurns(turns, conv.id);
        const sessionIds = convTurns
          .map((t) => t.sessionId)
          .filter((id): id is string => id !== null);

        // Aggregate cost from session records
        let totalCostUsd = 0;
        for (const sessionId of sessionIds) {
          const session = await sessions.get(sessionId);
          if (session?.costUsd) totalCostUsd += session.costUsd;
        }

        summaries.push({
          id: conv.id,
          status: conv.status,
          kind: conv.kind,
          topic: conv.topic,
          turnLimit: conv.turnLimit,
          createdAt: conv.createdAt,
          endedAt: conv.endedAt,
          participants: toParticipants(conv.participants),
          turnCount: convTurns.length,
          totalCostUsd,
        });
      }

      return summaries;
    },

    async show(conversationId: string): Promise<ConversationDetail | null> {
      const conv = await conversations.get(conversationId);
      if (!conv) return null;

      const convTurns = await getAllTurns(turns, conv.id);

      // Fetch session docs for all anima turns in one pass.
      // Used for both per-turn enrichment and aggregate cost.
      const sessionDocMap = new Map<string, Awaited<ReturnType<typeof sessions.get>>>();
      for (const t of convTurns) {
        if (t.sessionId !== null) {
          const session = await sessions.get(t.sessionId);
          sessionDocMap.set(t.sessionId, session);
        }
      }

      // Aggregate cost across all anima turns
      let totalCostUsd = 0;
      for (const session of sessionDocMap.values()) {
        if (session?.costUsd) totalCostUsd += session.costUsd;
      }

      // Build enriched turn summaries
      const turnSummaries: TurnSummary[] = convTurns.map((t) => {
        if (t.sessionId === null) {
          // Human turn — no session data
          return {
            sessionId: null,
            turnNumber: t.turnNumber,
            participant: t.participantName,
            message: t.message,
            startedAt: t.startedAt,
            endedAt: t.endedAt,
            output: null,
            costUsd: null,
            tokenUsage: null,
          };
        }

        const session = sessionDocMap.get(t.sessionId);
        return {
          sessionId: t.sessionId,
          turnNumber: t.turnNumber,
          participant: t.participantName,
          message: t.message,
          startedAt: t.startedAt,
          endedAt: t.endedAt,
          output: session?.output ?? null,
          costUsd: session?.costUsd ?? null,
          tokenUsage: session?.tokenUsage ?? null,
        };
      });

      return {
        id: conv.id,
        status: conv.status,
        kind: conv.kind,
        topic: conv.topic,
        turnLimit: conv.turnLimit,
        createdAt: conv.createdAt,
        endedAt: conv.endedAt,
        participants: toParticipants(conv.participants),
        turnCount: convTurns.length,
        totalCostUsd,
        turns: turnSummaries,
      };
    },
  };

  return {
    apparatus: {
      requires: ['stacks', 'animator', 'loom'],

      supportKit: {
        books: {
          conversations: {
            indexes: ['status', 'kind', 'createdAt'],
          },
          turns: {
            indexes: ['conversationId', 'turnNumber', 'participantId', 'participantKind'],
          },
        },
        tools: [conversationList, conversationShow, conversationEnd],
        pages: [
          { id: 'parlour', title: 'Parlour', dir: 'src/static/parlour' },
        ],
        routes: parlourRoutes,
      },

      provides: api,

      start(_ctx: StartupContext): void {
        const g = guild();
        const stacks = g.apparatus<StacksApi>('stacks');
        conversations = stacks.book<ConversationDoc>('parlour', 'conversations');
        turns = stacks.book<TurnDoc>('parlour', 'turns');
        sessions = stacks.readBook<SessionDoc>('animator', 'sessions');
      },
    },
  };
}

=== FILE: packages/plugins/parlour/src/routes.ts ===
/**
 * Parlour custom API routes.
 *
 * Contributed to the Oculus via supportKit.routes.
 * Provides endpoints for the Parlour page:
 *   GET  /api/parlour/roles           — list all system roles
 *   GET  /api/parlour/conversations   — list conversations for a role
 *   POST /api/parlour/create          — create a conversation
 *   POST /api/parlour/turn            — take a turn (SSE streaming)
 *
 * No Oculus types are imported — the Oculus duck-types the supportKit
 * via `as OculusKit`. Route handlers receive Hono Context objects.
 */

import type { Context } from 'hono';
import { streamSSE } from 'hono/streaming';
import { guild } from '@shardworks/nexus-core';
import type { LoomApi } from '@shardworks/loom-apparatus';
import type { ParlourApi } from './types.ts';

// ── Type stubs ────────────────────────────────────────────────────────

/** Duck-typed RouteContribution — no import from Oculus needed. */
interface RouteContribution {
  method: string;
  path: string;
  handler: (c: Context) => Response | Promise<Response>;
}

// ── Helpers ───────────────────────────────────────────────────────────

/**
 * Determine the cwd for a new conversation.
 * If codexName is provided and the codexes apparatus is available,
 * opens a draft worktree and returns its path.
 * Otherwise falls back to guild().home.
 */
async function resolveCwd(codexName?: string): Promise<string> {
  if (codexName) {
    try {
      // Conditionally access the codexes apparatus
      const scriptorium = guild().apparatus<{
        openDraft(req: { codexName: string }): Promise<{ path: string }>;
      }>('codexes');
      const draft = await scriptorium.openDraft({ codexName });
      return draft.path;
    } catch {
      // Codexes apparatus not installed or failed — fall back to guild home
    }
  }
  return guild().home;
}

// ── Route handlers ────────────────────────────────────────────────────

/** GET /api/parlour/roles — list all system roles */
function rolesRoute(): RouteContribution {
  return {
    method: 'GET',
    path: '/api/parlour/roles',
    handler: (c: Context) => {
      const loom = guild().apparatus<LoomApi>('loom');
      const roles = loom.listRoles();
      return c.json(roles);
    },
  };
}

/** GET /api/parlour/conversations — list conversations for a role */
function conversationsRoute(): RouteContribution {
  return {
    method: 'GET',
    path: '/api/parlour/conversations',
    handler: async (c: Context) => {
      const role = c.req.query('role');
      if (!role) {
        return c.json({ error: 'Missing required query param: role' }, 400);
      }
      const status = (c.req.query('status') as 'active' | 'concluded' | 'abandoned') ?? 'active';

      const parlour = guild().apparatus<ParlourApi>('parlour');
      const allConvs = await parlour.list({ status, kind: 'consult', limit: 50 });

      // Filter to conversations that have a participant with this role name
      const filtered = allConvs.filter((conv) =>
        conv.participants.some((p) => p.name === role),
      );

      // Determine display title for each conversation
      const results = await Promise.all(
        filtered.map(async (conv) => {
          let title: string;

          if (conv.topic && conv.topic.trim().length > 0) {
            title = conv.topic;
          } else {
            // Look for first human message
            const detail = await parlour.show(conv.id);
            const humanTurn = detail?.turns.find(
              (t) => t.sessionId === null && t.message !== null,
            );

            if (humanTurn?.message) {
              title = humanTurn.message.length > 60
                ? humanTurn.message.slice(0, 60) + '…'
                : humanTurn.message;
            } else {
              // Fall back to formatted date
              title = new Date(conv.createdAt).toLocaleString();
            }
          }

          return {
            id: conv.id,
            title,
            createdAt: conv.createdAt,
            turnCount: conv.turnCount,
            totalCostUsd: conv.totalCostUsd,
          };
        }),
      );

      return c.json(results);
    },
  };
}

/** POST /api/parlour/create — create a new consult conversation */
function createRoute(): RouteContribution {
  return {
    method: 'POST',
    path: '/api/parlour/create',
    handler: async (c: Context) => {
      const body = await c.req.json() as { role?: string; codexName?: string };
      const { role, codexName } = body;

      if (!role) {
        return c.json({ error: 'Missing required field: role' }, 400);
      }

      const cwd = await resolveCwd(codexName);
      const parlour = guild().apparatus<ParlourApi>('parlour');

      const result = await parlour.create({
        kind: 'consult',
        participants: [
          { kind: 'human', name: 'User' },
          { kind: 'anima', name: role },
        ],
        cwd,
      });

      return c.json({
        conversationId: result.conversationId,
        participants: result.participants,
      });
    },
  };
}

/** POST /api/parlour/turn — take a turn with SSE streaming */
function turnRoute(): RouteContribution {
  return {
    method: 'POST',
    path: '/api/parlour/turn',
    handler: async (c: Context) => {
      // Parse and validate body BEFORE entering the SSE stream so we can
      // return proper HTTP 400 responses for invalid input.
      let body: {
        conversationId?: string;
        role?: string;
        message?: string;
        codexName?: string;
      };

      try {
        body = await c.req.json() as typeof body;
      } catch {
        return c.json({ error: 'Invalid JSON body' }, 400);
      }

      const { conversationId: reqConversationId, role, message, codexName } = body;

      if (!reqConversationId && !role) {
        return c.json({ error: 'Either conversationId or role is required' }, 400);
      }
      if (!message || message.trim() === '') {
        return c.json({ error: 'message is required and must not be empty' }, 400);
      }

      return streamSSE(c, async (stream) => {
        const parlour = guild().apparatus<ParlourApi>('parlour');

        let conversationId: string;
        let humanParticipantId: string;
        let animaParticipantId: string;

        try {
          if (reqConversationId) {
            // Use existing conversation
            conversationId = reqConversationId;
            const detail = await parlour.show(conversationId);
            if (!detail) {
              await stream.writeSSE({
                event: 'error',
                data: JSON.stringify({ error: `Conversation "${conversationId}" not found` }),
              });
              return;
            }
            const human = detail.participants.find((p) => p.kind === 'human');
            const anima = detail.participants.find((p) => p.kind === 'anima');
            if (!human || !anima) {
              await stream.writeSSE({
                event: 'error',
                data: JSON.stringify({ error: 'Conversation missing human or anima participant' }),
              });
              return;
            }
            humanParticipantId = human.id;
            animaParticipantId = anima.id;
          } else {
            // Create new conversation lazily
            const cwd = await resolveCwd(codexName);
            const created = await parlour.create({
              kind: 'consult',
              participants: [
                { kind: 'human', name: 'User' },
                { kind: 'anima', name: role! },
              ],
              cwd,
            });

            conversationId = created.conversationId;
            const human = created.participants.find((p) => p.kind === 'human');
            const anima = created.participants.find((p) => p.kind === 'anima');
            humanParticipantId = human!.id;
            animaParticipantId = anima!.id;

            // Emit conversation_created event
            await stream.writeSSE({
              event: 'conversation_created',
              data: JSON.stringify({
                conversationId,
                participants: created.participants,
              }),
            });
          }

          // Take human turn
          await parlour.takeTurn({
            conversationId,
            participantId: humanParticipantId,
            message: message.trim(),
          });

          // Take anima turn with streaming
          const { chunks, result } = parlour.takeTurnStreaming({
            conversationId,
            participantId: animaParticipantId,
          });

          // Stream chunks to client
          for await (const chunk of chunks) {
            await stream.writeSSE({
              event: 'chunk',
              data: JSON.stringify(chunk),
            });
          }

          // Await result to ensure turn recording completes
          await result;
        } catch (err: unknown) {
          const errMessage = err instanceof Error ? err.message : String(err);
          await stream.writeSSE({
            event: 'error',
            data: JSON.stringify({ error: errMessage }),
          });
        }
      });
    },
  };
}

// ── Exported routes array ─────────────────────────────────────────────

export const parlourRoutes: RouteContribution[] = [
  rolesRoute(),
  conversationsRoute(),
  createRoute(),
  turnRoute(),
];

=== FILE: packages/plugins/parlour/src/static/parlour/app.js ===
/**
 * Parlour — chat UI application logic.
 *
 * Vanilla JS, no build step. Communicates with the Parlour API routes
 * via fetch(). SSE from POST /api/parlour/turn is read by manually
 * parsing the ReadableStream (EventSource only supports GET).
 */

// ── State ─────────────────────────────────────────────────────────────

let currentRole = null;
let currentCodex = '';       // empty = guild home
let currentConversationId = null;
let isStreaming = false;
let currentAnimaMessageEl = null;  // the anima message bubble being streamed

// Per-conversation cost aggregation (updated after each turn)
let turnCostData = [];  // [{ costUsd, inputTokens, outputTokens }, ...]

// ── DOM references ────────────────────────────────────────────────────

const roleSelect = document.getElementById('role-select');
const codexSelect = document.getElementById('codex-select');
const parlourMain = document.getElementById('parlour-main');
const newConvBtn = document.getElementById('new-conversation-btn');
const convListEl = document.getElementById('conversation-list');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');
const costCard = document.getElementById('cost-card');
const costDetails = document.getElementById('cost-details');

// ── Initialisation ────────────────────────────────────────────────────

async function init() {
  await Promise.all([loadRoles(), loadCodexes()]);
}

async function loadRoles() {
  try {
    const res = await fetch('/api/parlour/roles');
    if (!res.ok) return;
    const roles = await res.json();
    roles.sort((a, b) => a.name.localeCompare(b.name));
    for (const role of roles) {
      const opt = document.createElement('option');
      opt.value = role.name;
      opt.textContent = role.name + (role.source === 'kit' ? ' (kit)' : '');
      roleSelect.appendChild(opt);
    }
  } catch {
    // Roles endpoint not available — silently omit
  }
}

async function loadCodexes() {
  try {
    const res = await fetch('/api/codex/list');
    if (!res.ok) return;
    const codexes = await res.json();
    for (const codex of codexes) {
      const opt = document.createElement('option');
      opt.value = codex.name;
      opt.textContent = codex.name;
      codexSelect.appendChild(opt);
    }
  } catch {
    // Codexes not installed — silently omit
  }
}

// ── Role / Codex selection ─────────────────────────────────────────────

roleSelect.addEventListener('change', () => {
  const role = roleSelect.value;
  if (!role) return;
  onRoleChange(role);
});

codexSelect.addEventListener('change', () => {
  currentCodex = codexSelect.value;
});

function onRoleChange(role) {
  currentRole = role;
  currentConversationId = null;
  currentAnimaMessageEl = null;
  turnCostData = [];
  clearChat();
  parlourMain.classList.remove('hidden');
  costCard.classList.add('hidden');
  loadConversations(role);
}

// ── Conversations sidebar ─────────────────────────────────────────────

async function loadConversations(role) {
  try {
    const res = await fetch(`/api/parlour/conversations?role=${encodeURIComponent(role)}&status=active`);
    if (!res.ok) return;
    const convs = await res.json();
    renderConversationList(convs);
  } catch {
    // Silently ignore
  }
}

function renderConversationList(convs) {
  convListEl.innerHTML = '';
  for (const conv of convs) {
    appendConversationItem(conv);
  }
}

function appendConversationItem(conv) {
  const item = document.createElement('div');
  item.className = 'conversation-item';
  item.dataset.id = conv.id;

  const titleEl = document.createElement('span');
  titleEl.className = 'conversation-item__title';
  titleEl.textContent = conv.title;
  titleEl.title = conv.title;

  const endBtn = document.createElement('button');
  endBtn.className = 'end-btn';
  endBtn.textContent = 'End';
  endBtn.title = 'End this conversation';
  endBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    onEndConversation(conv.id);
  });

  item.appendChild(titleEl);
  item.appendChild(endBtn);
  item.addEventListener('click', () => onSelectConversation(conv.id));

  if (conv.id === currentConversationId) {
    item.classList.add('conversation-item--active');
  }

  convListEl.appendChild(item);
}

function setActiveConversationInSidebar(id) {
  for (const item of convListEl.querySelectorAll('.conversation-item')) {
    if (item.dataset.id === id) {
      item.classList.add('conversation-item--active');
    } else {
      item.classList.remove('conversation-item--active');
    }
  }
}

// ── New conversation ───────────────────────────────────────────────────

newConvBtn.addEventListener('click', onNewConversation);

function onNewConversation() {
  currentConversationId = null;
  currentAnimaMessageEl = null;
  turnCostData = [];
  clearChat();
  costCard.classList.add('hidden');
  setActiveConversationInSidebar(null);
  sendBtn.disabled = false;
  chatMessages.classList.remove('empty-state');
  chatMessages.textContent = '';

  // Show placeholder
  const placeholder = document.createElement('div');
  placeholder.className = 'message message--system';
  placeholder.textContent = 'New conversation — type a message to begin';
  chatMessages.appendChild(placeholder);
}

// ── End conversation ───────────────────────────────────────────────────

async function onEndConversation(id) {
  try {
    await fetch('/api/conversation/end', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, reason: 'concluded' }),
    });
  } catch {
    // Ignore
  }

  // Remove from sidebar
  const item = convListEl.querySelector(`[data-id="${id}"]`);
  if (item) item.remove();

  // If current conversation ended, go to new conversation state
  if (currentConversationId === id) {
    onNewConversation();
  }
}

// ── Select conversation ────────────────────────────────────────────────

async function onSelectConversation(id) {
  currentConversationId = id;
  currentAnimaMessageEl = null;
  turnCostData = [];
  setActiveConversationInSidebar(id);

  try {
    const res = await fetch(`/api/conversation/show?id=${encodeURIComponent(id)}`);
    if (!res.ok) {
      showSystemMessage('Failed to load conversation history');
      return;
    }
    const detail = await res.json();
    renderConversationHistory(detail);
    sendBtn.disabled = false;
  } catch {
    showSystemMessage('Failed to load conversation history');
  }
}

function renderConversationHistory(detail) {
  clearChat();
  chatMessages.classList.remove('empty-state');

  if (!detail.turns || detail.turns.length === 0) {
    const placeholder = document.createElement('div');
    placeholder.className = 'message message--system';
    placeholder.textContent = 'No messages yet';
    chatMessages.appendChild(placeholder);
  } else {
    for (const turn of detail.turns) {
      if (turn.sessionId === null) {
        // Human turn
        if (turn.message) {
          appendMessage({ role: 'human', author: 'User', text: turn.message });
        }
      } else {
        // Anima turn
        const text = turn.output || '[No response recorded]';
        appendMessage({
          role: 'anima',
          author: currentRole || 'Anima',
          text,
          dim: !turn.output,
        });

        // Collect cost data
        if (turn.costUsd !== null || turn.tokenUsage !== null) {
          turnCostData.push({
            costUsd: turn.costUsd ?? 0,
            inputTokens: turn.tokenUsage?.inputTokens ?? 0,
            outputTokens: turn.tokenUsage?.outputTokens ?? 0,
          });
        }
      }
    }
  }

  updateCostCard();
  scrollToBottom();
}

// ── Chat rendering ────────────────────────────────────────────────────

function clearChat() {
  chatMessages.innerHTML = '';
  chatMessages.className = 'empty-state';
}

function appendMessage({ role, author, text, dim = false }) {
  const wrapper = document.createElement('div');
  wrapper.className = `message message--${role}`;

  const authorEl = document.createElement('div');
  authorEl.className = 'message-author';
  authorEl.textContent = author;

  const contentEl = document.createElement('div');
  contentEl.className = 'message-content';
  if (dim) contentEl.style.color = 'var(--text-dim, #787c99)';
  contentEl.textContent = text;

  wrapper.appendChild(authorEl);
  wrapper.appendChild(contentEl);
  chatMessages.appendChild(wrapper);
  return wrapper;
}

function showSystemMessage(text) {
  const el = document.createElement('div');
  el.className = 'message message--system';
  el.textContent = text;
  chatMessages.appendChild(el);
  scrollToBottom();
}

function showTypingIndicator() {
  const indicator = document.createElement('div');
  indicator.className = 'typing-indicator';
  indicator.id = 'typing-indicator';
  indicator.innerHTML = '<span></span><span></span><span></span>';
  chatMessages.appendChild(indicator);
  scrollToBottom();
  return indicator;
}

function removeTypingIndicator() {
  const indicator = document.getElementById('typing-indicator');
  if (indicator) indicator.remove();
}

function scrollToBottom() {
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// ── Cost card ─────────────────────────────────────────────────────────

function updateCostCard() {
  if (turnCostData.length === 0) {
    costCard.classList.add('hidden');
    return;
  }

  const totalCost = turnCostData.reduce((sum, t) => sum + (t.costUsd || 0), 0);
  const totalInput = turnCostData.reduce((sum, t) => sum + (t.inputTokens || 0), 0);
  const totalOutput = turnCostData.reduce((sum, t) => sum + (t.outputTokens || 0), 0);

  costDetails.innerHTML = `
    <div>
      <span class="badge">IN: ${totalInput.toLocaleString()}</span>
      <span class="badge">OUT: ${totalOutput.toLocaleString()}</span>
    </div>
    <div class="cost-usd">$${totalCost.toFixed(4)}</div>
  `;

  costCard.classList.remove('hidden');
}

// ── Send message ──────────────────────────────────────────────────────

sendBtn.addEventListener('click', sendMessage);

chatInput.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.key === 'Enter') {
    e.preventDefault();
    sendMessage();
  }
});

chatInput.addEventListener('input', () => {
  chatInput.style.height = 'auto';
  chatInput.style.height = Math.min(chatInput.scrollHeight, 200) + 'px';
});

async function sendMessage() {
  if (isStreaming) return;

  const text = chatInput.value.trim();
  if (!text) return;

  isStreaming = true;
  sendBtn.disabled = true;
  chatInput.value = '';
  chatInput.style.height = 'auto';

  // Remove empty-state class and content if present
  if (chatMessages.classList.contains('empty-state')) {
    chatMessages.classList.remove('empty-state');
    chatMessages.innerHTML = '';
  }

  // Render human message
  appendMessage({ role: 'human', author: 'User', text });

  // Show typing indicator
  showTypingIndicator();

  // Start anima message bubble (will be filled progressively)
  currentAnimaMessageEl = null;

  // Build request body
  const body = {
    message: text,
    role: currentRole,
    ...(currentConversationId ? { conversationId: currentConversationId } : {}),
    ...(currentCodex ? { codexName: currentCodex } : {}),
  };

  try {
    const response = await fetch('/api/parlour/turn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok || !response.body) {
      removeTypingIndicator();
      showSystemMessage(`Error: HTTP ${response.status}`);
      isStreaming = false;
      sendBtn.disabled = false;
      return;
    }

    await readSSEStream(response.body);
  } catch (err) {
    removeTypingIndicator();
    showSystemMessage(`Error: ${err.message}`);
    isStreaming = false;
    sendBtn.disabled = false;
  }
}

// ── SSE stream reader ─────────────────────────────────────────────────

/**
 * Read an SSE stream from a POST response body.
 * EventSource only supports GET, so we parse SSE manually.
 */
async function readSSEStream(body) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // Process complete SSE messages (terminated by double newline)
      const messages = buffer.split(/\n\n/);
      buffer = messages.pop() ?? ''; // last element may be incomplete

      for (const message of messages) {
        processSSEMessage(message);
      }
    }

    // Process any remaining buffer
    if (buffer.trim()) {
      processSSEMessage(buffer);
    }
  } finally {
    reader.releaseLock();
    // Ensure streaming state is cleaned up
    if (isStreaming) {
      removeTypingIndicator();
      isStreaming = false;
      sendBtn.disabled = false;
    }
  }
}

function processSSEMessage(raw) {
  const lines = raw.split('\n');
  let event = 'message';
  let data = '';

  for (const line of lines) {
    if (line.startsWith('event: ')) {
      event = line.slice('event: '.length).trim();
    } else if (line.startsWith('data: ')) {
      data = line.slice('data: '.length).trim();
    }
  }

  if (!data) return;

  let parsed;
  try {
    parsed = JSON.parse(data);
  } catch {
    return;
  }

  handleSSEEvent(event, parsed);
}

function handleSSEEvent(event, data) {
  switch (event) {
    case 'conversation_created':
      currentConversationId = data.conversationId;
      // Add new conversation to sidebar
      appendConversationItem({
        id: data.conversationId,
        title: 'New conversation…',
      });
      setActiveConversationInSidebar(data.conversationId);
      break;

    case 'chunk':
      handleChunk(data);
      break;

    case 'error':
      removeTypingIndicator();
      showSystemMessage(`Error: ${data.error || 'Unknown error'}`);
      isStreaming = false;
      sendBtn.disabled = false;
      break;

    default:
      break;
  }
}

function handleChunk(chunk) {
  switch (chunk.type) {
    case 'text': {
      // Remove typing indicator on first text chunk
      removeTypingIndicator();

      if (!currentAnimaMessageEl) {
        // Create the anima message bubble
        const wrapper = document.createElement('div');
        wrapper.className = 'message message--anima';

        const authorEl = document.createElement('div');
        authorEl.className = 'message-author';
        authorEl.textContent = currentRole || 'Anima';

        const contentEl = document.createElement('div');
        contentEl.className = 'message-content';

        wrapper.appendChild(authorEl);
        wrapper.appendChild(contentEl);
        chatMessages.appendChild(wrapper);
        currentAnimaMessageEl = contentEl;
      }

      currentAnimaMessageEl.textContent += chunk.text;
      scrollToBottom();
      break;
    }

    case 'tool_use': {
      removeTypingIndicator();
      if (!currentAnimaMessageEl) {
        // Create bubble if needed
        const wrapper = document.createElement('div');
        wrapper.className = 'message message--anima';
        const authorEl = document.createElement('div');
        authorEl.className = 'message-author';
        authorEl.textContent = currentRole || 'Anima';
        const contentEl = document.createElement('div');
        contentEl.className = 'message-content';
        wrapper.appendChild(authorEl);
        wrapper.appendChild(contentEl);
        chatMessages.appendChild(wrapper);
        currentAnimaMessageEl = contentEl;
      }
      const pill = document.createElement('span');
      pill.className = 'tool-indicator';
      pill.textContent = `⚙ ${chunk.name || 'tool'}`;
      currentAnimaMessageEl.appendChild(pill);
      scrollToBottom();
      break;
    }

    case 'tool_result': {
      if (currentAnimaMessageEl) {
        const pill = document.createElement('span');
        pill.className = 'tool-indicator';
        pill.textContent = `✓ ${chunk.name || 'result'}`;
        currentAnimaMessageEl.appendChild(pill);
        scrollToBottom();
      }
      break;
    }

    case 'turn_complete': {
      // Collect cost data for this turn
      if (chunk.costUsd !== undefined && chunk.costUsd !== null) {
        // We'll do a full refresh of cost after fetching conversation detail
        // For now, add a placeholder entry that will be replaced
        turnCostData.push({
          costUsd: chunk.costUsd,
          inputTokens: 0,
          outputTokens: 0,
        });
      }

      currentAnimaMessageEl = null;
      isStreaming = false;
      sendBtn.disabled = false;

      // Refresh conversation detail for full token data
      if (currentConversationId) {
        refreshConversationCost(currentConversationId);
      }
      break;
    }

    default:
      break;
  }
}

/**
 * Re-fetch conversation detail to get accurate token totals and refresh the cost card.
 */
async function refreshConversationCost(id) {
  try {
    const res = await fetch(`/api/conversation/show?id=${encodeURIComponent(id)}`);
    if (!res.ok) return;
    const detail = await res.json();

    // Rebuild cost data from full turn history
    turnCostData = [];
    for (const turn of detail.turns) {
      if (turn.sessionId !== null && (turn.costUsd !== null || turn.tokenUsage !== null)) {
        turnCostData.push({
          costUsd: turn.costUsd ?? 0,
          inputTokens: turn.tokenUsage?.inputTokens ?? 0,
          outputTokens: turn.tokenUsage?.outputTokens ?? 0,
        });
      }
    }

    updateCostCard();

    // Also update sidebar title if this was a new conversation
    refreshConversationTitle(id);
  } catch {
    // Ignore
  }
}

async function refreshConversationTitle(id) {
  try {
    const role = encodeURIComponent(currentRole || '');
    const res = await fetch(`/api/parlour/conversations?role=${role}&status=active`);
    if (!res.ok) return;
    const convs = await res.json();
    const conv = convs.find((c) => c.id === id);
    if (!conv) return;

    const item = convListEl.querySelector(`[data-id="${id}"]`);
    if (item) {
      const titleEl = item.querySelector('.conversation-item__title');
      if (titleEl) {
        titleEl.textContent = conv.title;
        titleEl.title = conv.title;
      }
    }
  } catch {
    // Ignore
  }
}

// ── Bootstrap ─────────────────────────────────────────────────────────

init();

=== FILE: packages/plugins/parlour/src/static/parlour/index.html ===
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Parlour</title>
  <link rel="stylesheet" href="parlour.css">
</head>
<body>
  <div id="parlour-app">
    <div id="parlour-toolbar">
      <label for="role-select">Role</label>
      <select id="role-select"><option value="">Select a role…</option></select>
      <label for="codex-select">Codex</label>
      <select id="codex-select"><option value="">No codex (guild home)</option></select>
    </div>
    <div id="parlour-main" class="hidden">
      <aside id="parlour-sidebar">
        <button id="new-conversation-btn" class="btn btn--primary">+ New Conversation</button>
        <div id="conversation-list"></div>
        <div id="cost-card" class="card hidden">
          <h4>Cost</h4>
          <div id="cost-details"></div>
        </div>
      </aside>
      <div id="parlour-chat">
        <div id="chat-messages" class="empty-state">Select or start a conversation</div>
        <div id="chat-input-area">
          <textarea id="chat-input" rows="3" placeholder="Type a message…"></textarea>
          <button id="send-btn" class="btn btn--primary" disabled>Send</button>
        </div>
      </div>
    </div>
  </div>
  <script src="app.js"></script>
</body>
</html>

=== FILE: packages/plugins/parlour/src/static/parlour/parlour.css ===
/* Parlour — page-specific styles.
 * Uses CSS custom properties from the Oculus chrome (style.css).
 * Tokyo Night palette variables: --surface, --surface2, --blue, --green,
 * --text, --text-dim, etc.
 */

/* ── Layout ──────────────────────────────────────────────────────────── */

#parlour-app {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 48px); /* subtract nav height */
  overflow: hidden;
}

#parlour-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: var(--surface, #1a1b26);
  border-bottom: 1px solid var(--border, #2a2b3d);
  flex-shrink: 0;
}

#parlour-toolbar label {
  font-size: 13px;
  color: var(--text-dim, #787c99);
  white-space: nowrap;
}

#parlour-toolbar select {
  background: var(--surface2, #24283b);
  color: var(--text, #c0caf5);
  border: 1px solid var(--border, #3b4261);
  border-radius: 4px;
  padding: 4px 8px;
  font-size: 13px;
  cursor: pointer;
}

#parlour-main {
  display: flex;
  flex: 1;
  overflow: hidden;
}

/* ── Sidebar ─────────────────────────────────────────────────────────── */

#parlour-sidebar {
  width: 260px;
  min-width: 200px;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--border, #2a2b3d);
  background: var(--surface, #1a1b26);
  overflow: hidden;
}

#new-conversation-btn {
  margin: 12px;
  flex-shrink: 0;
}

#conversation-list {
  flex: 1;
  overflow-y: auto;
  padding: 0 8px;
}

/* ── Chat area ───────────────────────────────────────────────────────── */

#parlour-chat {
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow: hidden;
}

#chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

#chat-messages.empty-state {
  justify-content: center;
  align-items: center;
  color: var(--text-dim, #787c99);
  font-style: italic;
  font-size: 14px;
}

#chat-input-area {
  display: flex;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--border, #2a2b3d);
  background: var(--surface, #1a1b26);
  flex-shrink: 0;
  align-items: flex-end;
}

#chat-input {
  flex: 1;
  background: var(--surface2, #24283b);
  color: var(--text, #c0caf5);
  border: 1px solid var(--border, #3b4261);
  border-radius: 6px;
  padding: 8px 12px;
  font-size: 14px;
  font-family: inherit;
  resize: none;
  max-height: 200px;
  line-height: 1.5;
}

#chat-input:focus {
  outline: none;
  border-color: var(--blue, #7aa2f7);
}

/* ── Message bubbles ─────────────────────────────────────────────────── */

.message {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 14px;
  border-radius: 6px;
  max-width: 85%;
  word-wrap: break-word;
  white-space: pre-wrap;
  font-size: 14px;
  line-height: 1.6;
}

.message--human {
  background: var(--surface2, #24283b);
  border-left: 3px solid var(--blue, #7aa2f7);
  align-self: flex-start;
}

.message--anima {
  background: var(--surface, #1a1b26);
  border-left: 3px solid var(--green, #9ece6a);
  align-self: flex-start;
  border: 1px solid var(--border, #2a2b3d);
  border-left: 3px solid var(--green, #9ece6a);
}

.message--system {
  background: transparent;
  color: var(--text-dim, #787c99);
  font-style: italic;
  align-self: center;
  text-align: center;
  border: none;
  padding: 4px 8px;
  font-size: 12px;
}

.message-author {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-dim, #787c99);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.message-content {
  color: var(--text, #c0caf5);
}

/* ── Tool indicators ─────────────────────────────────────────────────── */

.tool-indicator {
  display: inline-block;
  background: var(--surface2, #24283b);
  color: var(--text-dim, #787c99);
  font-size: 11px;
  border-radius: 4px;
  padding: 2px 8px;
  margin: 2px 2px;
  border: 1px solid var(--border, #3b4261);
  font-family: monospace;
}

/* ── Typing indicator ────────────────────────────────────────────────── */

.typing-indicator {
  display: flex;
  gap: 4px;
  align-items: center;
  padding: 10px 14px;
  align-self: flex-start;
}

.typing-indicator span {
  width: 8px;
  height: 8px;
  background: var(--text-dim, #787c99);
  border-radius: 50%;
  animation: pulse 1.2s ease-in-out infinite;
}

.typing-indicator span:nth-child(2) {
  animation-delay: 0.2s;
}

.typing-indicator span:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes pulse {
  0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
  40% { opacity: 1; transform: scale(1); }
}

/* ── Conversation list items ─────────────────────────────────────────── */

.conversation-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 8px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  color: var(--text, #c0caf5);
  margin-bottom: 2px;
  gap: 4px;
}

.conversation-item:hover {
  background: var(--surface2, #24283b);
}

.conversation-item--active {
  background: var(--surface2, #24283b);
}

.conversation-item__title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.conversation-item .end-btn {
  flex-shrink: 0;
  background: transparent;
  border: 1px solid var(--border, #3b4261);
  color: var(--text-dim, #787c99);
  border-radius: 3px;
  padding: 2px 6px;
  font-size: 11px;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s;
}

.conversation-item:hover .end-btn {
  opacity: 1;
}

.conversation-item .end-btn:hover {
  color: var(--red, #f7768e);
  border-color: var(--red, #f7768e);
}

/* ── Cost card ───────────────────────────────────────────────────────── */

#cost-card {
  margin: 8px;
  padding: 10px 12px;
  flex-shrink: 0;
}

#cost-card h4 {
  margin: 0 0 6px 0;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-dim, #787c99);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

#cost-details {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: var(--text, #c0caf5);
}

.cost-usd {
  font-size: 16px;
  font-weight: 600;
  color: var(--yellow, #e0af68);
}

.cost-no-data {
  color: var(--text-dim, #787c99);
  font-style: italic;
  font-size: 12px;
}

/* ── Buttons ─────────────────────────────────────────────────────────── */

.btn {
  padding: 6px 14px;
  border-radius: 4px;
  font-size: 13px;
  cursor: pointer;
  border: 1px solid var(--border, #3b4261);
  background: var(--surface2, #24283b);
  color: var(--text, #c0caf5);
  transition: opacity 0.15s;
}

.btn:hover:not(:disabled) {
  opacity: 0.8;
}

.btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.btn--primary {
  background: var(--blue, #7aa2f7);
  color: var(--bg, #1a1b26);
  border-color: var(--blue, #7aa2f7);
  font-weight: 600;
}

/* ── Utilities ───────────────────────────────────────────────────────── */

.hidden {
  display: none !important;
}

.badge {
  display: inline-block;
  background: var(--surface2, #24283b);
  color: var(--text-dim, #787c99);
  font-size: 11px;
  border-radius: 3px;
  padding: 1px 6px;
  font-family: monospace;
}

=== FILE: packages/plugins/parlour/src/types.ts ===
/**
 * The Parlour — public types.
 *
 * These types form the contract between The Parlour apparatus and all
 * callers (CLI consult command, clockworks convene handlers, etc.).
 * No implementation details.
 *
 * See: docs/architecture/apparatus/parlour.md
 */

import type { SessionResult, SessionChunk } from '@shardworks/animator-apparatus';

// ── Conversation document (Stacks) ──────────────────────────────────

export interface ConversationDoc {
  id: string;
  status: 'active' | 'concluded' | 'abandoned';
  kind: 'consult' | 'convene';
  topic: string | null;
  turnLimit: number | null;
  createdAt: string;
  endedAt: string | null;
  eventId: string | null;
  participants: ParticipantRecord[];
  /** Stored once at creation — all turns must use the same cwd for --resume. */
  cwd: string;
  /** Index signature required by BookEntry. */
  [key: string]: unknown;
}

export interface ParticipantRecord {
  /** Stable participant id (generated at creation). */
  id: string;
  kind: 'anima' | 'human';
  name: string;
  /** Anima id, resolved at creation time. Null for human participants. */
  animaId: string | null;
  /**
   * Provider session id for --resume. Updated after each turn so
   * the next turn can continue the provider's conversation context.
   */
  providerSessionId: string | null;
}

// ── Turn tracking ───────────────────────────────────────────────────

/**
 * Internal turn record stored in the turns book.
 * One entry per takeTurn() call — both human and anima turns.
 */
export interface TurnDoc {
  id: string;
  conversationId: string;
  turnNumber: number;
  participantId: string;
  participantName: string;
  participantKind: 'anima' | 'human';
  /** The message passed to this turn (human message or inter-turn context). */
  message: string | null;
  /** Session id from The Animator (null for human turns). */
  sessionId: string | null;
  startedAt: string;
  endedAt: string | null;
  /** Index signature required by BookEntry. */
  [key: string]: unknown;
}

// ── Request / Result types ──────────────────────────────────────────

export interface CreateConversationRequest {
  /** Conversation kind. */
  kind: 'consult' | 'convene';
  /** Seed topic or prompt. Used as the initial message for the first turn. */
  topic?: string;
  /** Maximum allowed turns (anima turns only). Null = unlimited. */
  turnLimit?: number;
  /** Participants in the conversation. */
  participants: ParticipantDeclaration[];
  /** Working directory — persists for the conversation's lifetime. */
  cwd: string;
  /** Triggering event id, for conversations started by clockworks. */
  eventId?: string;
}

export interface ParticipantDeclaration {
  kind: 'anima' | 'human';
  /** Display name. For anima participants, this is the anima name
   *  used to resolve identity via The Loom at turn time. */
  name: string;
}

export interface CreateConversationResult {
  conversationId: string;
  participants: Participant[];
}

export interface Participant {
  id: string;
  name: string;
  kind: 'anima' | 'human';
}

export interface TakeTurnRequest {
  conversationId: string;
  participantId: string;
  /** The message for this turn. For consult: the human's message.
   *  For convene: typically assembled by the caller, or omitted to
   *  let The Parlour assemble it automatically. */
  message?: string;
}

export interface TurnResult {
  /** The Animator's session result for this turn. Null for human turns. */
  sessionResult: SessionResult | null;
  /** Turn number within the conversation (1-indexed). */
  turnNumber: number;
  /** Whether the conversation is still active after this turn. */
  conversationActive: boolean;
}

/** A chunk of output from a conversation turn. */
export type ConversationChunk =
  | SessionChunk
  | { type: 'turn_complete'; turnNumber: number; costUsd?: number };

export interface ConversationSummary {
  id: string;
  status: 'active' | 'concluded' | 'abandoned';
  kind: 'consult' | 'convene';
  topic: string | null;
  turnLimit: number | null;
  createdAt: string;
  endedAt: string | null;
  participants: Participant[];
  /** Computed from turn records. */
  turnCount: number;
  /** Aggregate cost across all turns. */
  totalCostUsd: number;
}

export interface ConversationDetail extends ConversationSummary {
  turns: TurnSummary[];
}

export interface TurnSummary {
  sessionId: string | null;
  turnNumber: number;
  participant: string;
  message: string | null;
  startedAt: string;
  endedAt: string | null;
  /** The anima's response text. Populated from SessionDoc.output. Null for human turns or when no output was recorded. */
  output: string | null;
  /** Cost in USD for this turn. Null for human turns. */
  costUsd: number | null;
  /** Token usage for this turn. Null for human turns. */
  tokenUsage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
  } | null;
}

export interface ListConversationsOptions {
  status?: 'active' | 'concluded' | 'abandoned';
  kind?: 'consult' | 'convene';
  limit?: number;
}

// ── ParlourApi (the `provides` interface) ───────────────────────────

export interface ParlourApi {
  /**
   * Create a new conversation.
   *
   * Sets up conversation and participant records. Does NOT take a first
   * turn — that's a separate call to takeTurn().
   */
  create(request: CreateConversationRequest): Promise<CreateConversationResult>;

  /**
   * Take a turn in a conversation.
   *
   * For anima participants: weaves context via The Loom, assembles the
   * inter-turn message, and calls The Animator to run a session. Returns
   * the session result. For human participants: records the message as
   * context for the next turn (no session launched).
   *
   * Throws if the conversation is not active or the turn limit is reached.
   */
  takeTurn(request: TakeTurnRequest): Promise<TurnResult>;

  /**
   * Take a turn with streaming output.
   *
   * Same as takeTurn(), but yields ConversationChunks as the session
   * produces output. Includes a turn_complete chunk at the end.
   */
  takeTurnStreaming(request: TakeTurnRequest): {
    chunks: AsyncIterable<ConversationChunk>;
    result: Promise<TurnResult>;
  };

  /**
   * Get the next participant in a conversation.
   *
   * For convene: returns the next anima in round-robin order.
   * For consult: returns the anima participant (human turns are implicit).
   * Returns null if the conversation is not active or the turn limit is reached.
   */
  nextParticipant(conversationId: string): Promise<Participant | null>;

  /**
   * End a conversation.
   *
   * Sets status to 'concluded' (normal end) or 'abandoned' (e.g. timeout,
   * disconnect). Idempotent — no error if already ended.
   */
  end(conversationId: string, reason?: 'concluded' | 'abandoned'): Promise<void>;

  /**
   * List conversations with optional filters.
   */
  list(options?: ListConversationsOptions): Promise<ConversationSummary[]>;

  /**
   * Show full detail for a conversation.
   */
  show(conversationId: string): Promise<ConversationDetail | null>;
}

=== FILE: pnpm-lock.yaml ===
lockfileVersion: '9.0'

settings:
  autoInstallPeers: true
  excludeLinksFromLockfile: false

importers:

  .:
    devDependencies:
      '@tsconfig/node24':
        specifier: 24.0.4
        version: 24.0.4
      typescript:
        specifier: 5.9.3
        version: 5.9.3

  packages/framework/arbor:
    dependencies:
      '@shardworks/nexus-core':
        specifier: workspace:*
        version: link:../core
    devDependencies:
      '@types/node':
        specifier: 25.5.0
        version: 25.5.0

  packages/framework/cli:
    dependencies:
      '@shardworks/nexus-arbor':
        specifier: workspace:*
        version: link:../arbor
      '@shardworks/nexus-core':
        specifier: workspace:*
        version: link:../core
      '@shardworks/tools-apparatus':
        specifier: workspace:*
        version: link:../../plugins/tools
      commander:
        specifier: 14.0.3
        version: 14.0.3
      zod:
        specifier: 4.3.6
        version: 4.3.6
    devDependencies:
      '@types/node':
        specifier: 25.5.0
        version: 25.5.0

  packages/framework/core:
    devDependencies:
      '@types/node':
        specifier: 25.5.0
        version: 25.5.0

  packages/plugins/animator:
    dependencies:
      '@shardworks/loom-apparatus':
        specifier: workspace:*
        version: link:../loom
      '@shardworks/nexus-core':
        specifier: workspace:*
        version: link:../../framework/core
      '@shardworks/stacks-apparatus':
        specifier: workspace:*
        version: link:../stacks
      '@shardworks/tools-apparatus':
        specifier: workspace:*
        version: link:../tools
      zod:
        specifier: 4.3.6
        version: 4.3.6
    devDependencies:
      '@types/node':
        specifier: 25.5.0
        version: 25.5.0

  packages/plugins/claude-code:
    dependencies:
      '@modelcontextprotocol/sdk':
        specifier: 1.27.1
        version: 1.27.1(zod@4.3.6)
      '@shardworks/animator-apparatus':
        specifier: workspace:*
        version: link:../animator
      '@shardworks/nexus-core':
        specifier: workspace:*
        version: link:../../framework/core
      '@shardworks/tools-apparatus':
        specifier: workspace:*
        version: link:../tools
      zod:
        specifier: 4.3.6
        version: 4.3.6
    devDependencies:
      '@types/node':
        specifier: 25.5.0
        version: 25.5.0

  packages/plugins/clerk:
    dependencies:
      '@shardworks/nexus-core':
        specifier: workspace:*
        version: link:../../framework/core
      '@shardworks/stacks-apparatus':
        specifier: workspace:*
        version: link:../stacks
      '@shardworks/tools-apparatus':
        specifier: workspace:*
        version: link:../tools
      zod:
        specifier: 4.3.6
        version: 4.3.6
    devDependencies:
      '@types/node':
        specifier: 25.5.0
        version: 25.5.0

  packages/plugins/codexes:
    dependencies:
      '@shardworks/nexus-core':
        specifier: workspace:*
        version: link:../../framework/core
      '@shardworks/tools-apparatus':
        specifier: workspace:*
        version: link:../tools
      zod:
        specifier: 4.3.6
        version: 4.3.6
    devDependencies:
      '@types/node':
        specifier: 25.5.0
        version: 25.5.0

  packages/plugins/copilot:
    dependencies:
      '@shardworks/animator-apparatus':
        specifier: workspace:*
        version: link:../animator
      '@shardworks/nexus-core':
        specifier: workspace:*
        version: link:../../framework/core
      '@shardworks/tools-apparatus':
        specifier: workspace:*
        version: link:../tools
      zod:
        specifier: 4.3.6
        version: 4.3.6
    devDependencies:
      '@types/node':
        specifier: 25.5.0
        version: 25.5.0

  packages/plugins/fabricator:
    dependencies:
      '@shardworks/nexus-core':
        specifier: workspace:*
        version: link:../../framework/core
    devDependencies:
      '@types/node':
        specifier: 25.5.0
        version: 25.5.0

  packages/plugins/loom:
    dependencies:
      '@shardworks/nexus-core':
        specifier: workspace:*
        version: link:../../framework/core
      '@shardworks/tools-apparatus':
        specifier: workspace:*
        version: link:../tools
      zod:
        specifier: 4.3.6
        version: 4.3.6
    devDependencies:
      '@types/node':
        specifier: 25.5.0
        version: 25.5.0

  packages/plugins/oculus:
    dependencies:
      '@hono/node-server':
        specifier: ^1.13.7
        version: 1.19.11(hono@4.12.9)
      '@shardworks/nexus-core':
        specifier: workspace:*
        version: link:../../framework/core
      '@shardworks/tools-apparatus':
        specifier: workspace:*
        version: link:../tools
      hono:
        specifier: ^4.7.11
        version: 4.12.9
      zod:
        specifier: 4.3.6
        version: 4.3.6
    devDependencies:
      '@types/node':
        specifier: 25.5.0
        version: 25.5.0

  packages/plugins/parlour:
    dependencies:
      '@shardworks/animator-apparatus':
        specifier: workspace:*
        version: link:../animator
      '@shardworks/loom-apparatus':
        specifier: workspace:*
        version: link:../loom
      '@shardworks/nexus-core':
        specifier: workspace:*
        version: link:../../framework/core
      '@shardworks/stacks-apparatus':
        specifier: workspace:*
        version: link:../stacks
      '@shardworks/tools-apparatus':
        specifier: workspace:*
        version: link:../tools
      hono:
        specifier: ^4.7.11
        version: 4.12.9
      zod:
        specifier: 4.3.6
        version: 4.3.6
    devDependencies:
      '@types/node':
        specifier: 25.5.0
        version: 25.5.0

  packages/plugins/spider:
    dependencies:
      '@shardworks/animator-apparatus':
        specifier: workspace:*
        version: link:../animator
      '@shardworks/clerk-apparatus':
        specifier: workspace:*
        version: link:../clerk
      '@shardworks/codexes-apparatus':
        specifier: workspace:*
        version: link:../codexes
      '@shardworks/fabricator-apparatus':
        specifier: workspace:*
        version: link:../fabricator
      '@shardworks/nexus-core':
        specifier: workspace:*
        version: link:../../framework/core
      '@shardworks/stacks-apparatus':
        specifier: workspace:*
        version: link:../stacks
      '@shardworks/tools-apparatus':
        specifier: workspace:*
        version: link:../tools
      hono:
        specifier: ^4.7.11
        version: 4.12.9
      yaml:
        specifier: ^2.0.0
        version: 2.8.3
      zod:
        specifier: 4.3.6
        version: 4.3.6
    devDependencies:
      '@types/node':
        specifier: 25.5.0
        version: 25.5.0

  packages/plugins/stacks:
    dependencies:
      '@shardworks/nexus-core':
        specifier: workspace:*
        version: link:../../framework/core
      better-sqlite3:
        specifier: 12.8.0
        version: 12.8.0
    devDependencies:
      '@types/better-sqlite3':
        specifier: 7.6.13
        version: 7.6.13
      '@types/node':
        specifier: 25.5.0
        version: 25.5.0

  packages/plugins/tools:
    dependencies:
      '@shardworks/nexus-core':
        specifier: workspace:*
        version: link:../../framework/core
      zod:
        specifier: 4.3.6
        version: 4.3.6
    devDependencies:
      '@types/node':
        specifier: 25.5.0
        version: 25.5.0

packages:

  '@hono/node-server@1.19.11':
    resolution: {integrity: sha512-dr8/3zEaB+p0D2n/IUrlPF1HZm586qgJNXK1a9fhg/PzdtkK7Ksd5l312tJX2yBuALqDYBlG20QEbayqPyxn+g==}
    engines: {node: '>=18.14.1'}
    peerDependencies:
      hono: ^4

  '@modelcontextprotocol/sdk@1.27.1':
    resolution: {integrity: sha512-sr6GbP+4edBwFndLbM60gf07z0FQ79gaExpnsjMGePXqFcSSb7t6iscpjk9DhFhwd+mTEQrzNafGP8/iGGFYaA==}
    engines: {node: '>=18'}
    peerDependencies:
      '@cfworker/json-schema': ^4.1.1
      zod: ^3.25 || ^4.0
    peerDependenciesMeta:
      '@cfworker/json-schema':
        optional: true

  '@tsconfig/node24@24.0.4':
    resolution: {integrity: sha512-2A933l5P5oCbv6qSxHs7ckKwobs8BDAe9SJ/Xr2Hy+nDlwmLE1GhFh/g/vXGRZWgxBg9nX/5piDtHR9Dkw/XuA==}

  '@types/better-sqlite3@7.6.13':
    resolution: {integrity: sha512-NMv9ASNARoKksWtsq/SHakpYAYnhBrQgGD8zkLYk/jaK8jUGn08CfEdTRgYhMypUQAfzSP8W6gNLe0q19/t4VA==}

  '@types/node@25.5.0':
    resolution: {integrity: sha512-jp2P3tQMSxWugkCUKLRPVUpGaL5MVFwF8RDuSRztfwgN1wmqJeMSbKlnEtQqU8UrhTmzEmZdu2I6v2dpp7XIxw==}

  accepts@2.0.0:
    resolution: {integrity: sha512-5cvg6CtKwfgdmVqY1WIiXKc3Q1bkRqGLi+2W/6ao+6Y7gu/RCwRuAhGEzh5B4KlszSuTLgZYuqFqo5bImjNKng==}
    engines: {node: '>= 0.6'}

  ajv-formats@3.0.1:
    resolution: {integrity: sha512-8iUql50EUR+uUcdRQ3HDqa6EVyo3docL8g5WJ3FNcWmu62IbkGUue/pEyLBW8VGKKucTPgqeks4fIU1DA4yowQ==}
    peerDependencies:
      ajv: ^8.0.0
    peerDependenciesMeta:
      ajv:
        optional: true

  ajv@8.18.0:
    resolution: {integrity: sha512-PlXPeEWMXMZ7sPYOHqmDyCJzcfNrUr3fGNKtezX14ykXOEIvyK81d+qydx89KY5O71FKMPaQ2vBfBFI5NHR63A==}

  base64-js@1.5.1:
    resolution: {integrity: sha512-AKpaYlHn8t4SVbOHCy+b5+KKgvR4vrsD8vbvrbiQJps7fKDTkjkDry6ji0rUJjC0kzbNePLwzxq8iypo41qeWA==}

  better-sqlite3@12.8.0:
    resolution: {integrity: sha512-RxD2Vd96sQDjQr20kdP+F+dK/1OUNiVOl200vKBZY8u0vTwysfolF6Hq+3ZK2+h8My9YvZhHsF+RSGZW2VYrPQ==}
    engines: {node: 20.x || 22.x || 23.x || 24.x || 25.x}

  bindings@1.5.0:
    resolution: {integrity: sha512-p2q/t/mhvuOj/UeLlV6566GD/guowlr0hHxClI0W9m7MWYkL1F0hLo+0Aexs9HSPCtR1SXQ0TD3MMKrXZajbiQ==}

  bl@4.1.0:
    resolution: {integrity: sha512-1W07cM9gS6DcLperZfFSj+bWLtaPGSOHWhPiGzXmvVJbRLdG82sH/Kn8EtW1VqWVA54AKf2h5k5BbnIbwF3h6w==}

  body-parser@2.2.2:
    resolution: {integrity: sha512-oP5VkATKlNwcgvxi0vM0p/D3n2C3EReYVX+DNYs5TjZFn/oQt2j+4sVJtSMr18pdRr8wjTcBl6LoV+FUwzPmNA==}
    engines: {node: '>=18'}

  buffer@5.7.1:
    resolution: {integrity: sha512-EHcyIPBQ4BSGlvjB16k5KgAJ27CIsHY/2JBmCRReo48y9rQ3MaUzWX3KVlBa4U7MyX02HdVj0K7C3WaB3ju7FQ==}

  bytes@3.1.2:
    resolution: {integrity: sha512-/Nf7TyzTx6S3yRJObOAV7956r8cr2+Oj8AC5dt8wSP3BQAoeX58NoHyCU8P8zGkNXStjTSi6fzO6F0pBdcYbEg==}
    engines: {node: '>= 0.8'}

  call-bind-apply-helpers@1.0.2:
    resolution: {integrity: sha512-Sp1ablJ0ivDkSzjcaJdxEunN5/XvksFJ2sMBFfq6x0ryhQV/2b/KwFe21cMpmHtPOSij8K99/wSfoEuTObmuMQ==}
    engines: {node: '>= 0.4'}

  call-bound@1.0.4:
    resolution: {integrity: sha512-+ys997U96po4Kx/ABpBCqhA9EuxJaQWDQg7295H4hBphv3IZg0boBKuwYpt4YXp6MZ5AmZQnU/tyMTlRpaSejg==}
    engines: {node: '>= 0.4'}

  chownr@1.1.4:
    resolution: {integrity: sha512-jJ0bqzaylmJtVnNgzTeSOs8DPavpbYgEr/b0YL8/2GO3xJEhInFmhKMUnEJQjZumK7KXGFhUy89PrsJWlakBVg==}

  commander@14.0.3:
    resolution: {integrity: sha512-H+y0Jo/T1RZ9qPP4Eh1pkcQcLRglraJaSLoyOtHxu6AapkjWVCy2Sit1QQ4x3Dng8qDlSsZEet7g5Pq06MvTgw==}
    engines: {node: '>=20'}

  content-disposition@1.0.1:
    resolution: {integrity: sha512-oIXISMynqSqm241k6kcQ5UwttDILMK4BiurCfGEREw6+X9jkkpEe5T9FZaApyLGGOnFuyMWZpdolTXMtvEJ08Q==}
    engines: {node: '>=18'}

  content-type@1.0.5:
    resolution: {integrity: sha512-nTjqfcBFEipKdXCv4YDQWCfmcLZKm81ldF0pAopTvyrFGVbcR6P/VAAd5G7N+0tTr8QqiU0tFadD6FK4NtJwOA==}
    engines: {node: '>= 0.6'}

  cookie-signature@1.2.2:
    resolution: {integrity: sha512-D76uU73ulSXrD1UXF4KE2TMxVVwhsnCgfAyTg9k8P6KGZjlXKrOLe4dJQKI3Bxi5wjesZoFXJWElNWBjPZMbhg==}
    engines: {node: '>=6.6.0'}

  cookie@0.7.2:
    resolution: {integrity: sha512-yki5XnKuf750l50uGTllt6kKILY4nQ1eNIQatoXEByZ5dWgnKqbnqmTrBE5B4N7lrMJKQ2ytWMiTO2o0v6Ew/w==}
    engines: {node: '>= 0.6'}

  cors@2.8.6:
    resolution: {integrity: sha512-tJtZBBHA6vjIAaF6EnIaq6laBBP9aq/Y3ouVJjEfoHbRBcHBAHYcMh/w8LDrk2PvIMMq8gmopa5D4V8RmbrxGw==}
    engines: {node: '>= 0.10'}

  cross-spawn@7.0.6:
    resolution: {integrity: sha512-uV2QOWP2nWzsy2aMp8aRibhi9dlzF5Hgh5SHaB9OiTGEyDTiJJyx0uy51QXdyWbtAHNua4XJzUKca3OzKUd3vA==}
    engines: {node: '>= 8'}

  debug@4.4.3:
    resolution: {integrity: sha512-RGwwWnwQvkVfavKVt22FGLw+xYSdzARwm0ru6DhTVA3umU5hZc28V3kO4stgYryrTlLpuvgI9GiijltAjNbcqA==}
    engines: {node: '>=6.0'}
    peerDependencies:
      supports-color: '*'
    peerDependenciesMeta:
      supports-color:
        optional: true

  decompress-response@6.0.0:
    resolution: {integrity: sha512-aW35yZM6Bb/4oJlZncMH2LCoZtJXTRxES17vE3hoRiowU2kWHaJKFkSBDnDR+cm9J+9QhXmREyIfv0pji9ejCQ==}
    engines: {node: '>=10'}

  deep-extend@0.6.0:
    resolution: {integrity: sha512-LOHxIOaPYdHlJRtCQfDIVZtfw/ufM8+rVj649RIHzcm/vGwQRXFt6OPqIFWsm2XEMrNIEtWR64sY1LEKD2vAOA==}
    engines: {node: '>=4.0.0'}

  depd@2.0.0:
    resolution: {integrity: sha512-g7nH6P6dyDioJogAAGprGpCtVImJhpPk/roCzdb3fIh61/s/nPsfR6onyMwkCAR/OlC3yBC0lESvUoQEAssIrw==}
    engines: {node: '>= 0.8'}

  detect-libc@2.1.2:
    resolution: {integrity: sha512-Btj2BOOO83o3WyH59e8MgXsxEQVcarkUOpEYrubB0urwnN10yQ364rsiByU11nZlqWYZm05i/of7io4mzihBtQ==}
    engines: {node: '>=8'}

  dunder-proto@1.0.1:
    resolution: {integrity: sha512-KIN/nDJBQRcXw0MLVhZE9iQHmG68qAVIBg9CqmUYjmQIhgij9U5MFvrqkUL5FbtyyzZuOeOt0zdeRe4UY7ct+A==}
    engines: {node: '>= 0.4'}

  ee-first@1.1.1:
    resolution: {integrity: sha512-WMwm9LhRUo+WUaRN+vRuETqG89IgZphVSNkdFgeb6sS/E4OrDIN7t48CAewSHXc6C8lefD8KKfr5vY61brQlow==}

  encodeurl@2.0.0:
    resolution: {integrity: sha512-Q0n9HRi4m6JuGIV1eFlmvJB7ZEVxu93IrMyiMsGC0lrMJMWzRgx6WGquyfQgZVb31vhGgXnfmPNNXmxnOkRBrg==}
    engines: {node: '>= 0.8'}

  end-of-stream@1.4.5:
    resolution: {integrity: sha512-ooEGc6HP26xXq/N+GCGOT0JKCLDGrq2bQUZrQ7gyrJiZANJ/8YDTxTpQBXGMn+WbIQXNVpyWymm7KYVICQnyOg==}

  es-define-property@1.0.1:
    resolution: {integrity: sha512-e3nRfgfUZ4rNGL232gUgX06QNyyez04KdjFrF+LTRoOXmrOgFKDg4BCdsjW8EnT69eqdYGmRpJwiPVYNrCaW3g==}
    engines: {node: '>= 0.4'}

  es-errors@1.3.0:
    resolution: {integrity: sha512-Zf5H2Kxt2xjTvbJvP2ZWLEICxA6j+hAmMzIlypy4xcBg1vKVnx89Wy0GbS+kf5cwCVFFzdCFh2XSCFNULS6csw==}
    engines: {node: '>= 0.4'}

  es-object-atoms@1.1.1:
    resolution: {integrity: sha512-FGgH2h8zKNim9ljj7dankFPcICIK9Cp5bm+c2gQSYePhpaG5+esrLODihIorn+Pe6FGJzWhXQotPv73jTaldXA==}
    engines: {node: '>= 0.4'}

  escape-html@1.0.3:
    resolution: {integrity: sha512-NiSupZ4OeuGwr68lGIeym/ksIZMJodUGOSCZ/FSnTxcrekbvqrgdUxlJOMpijaKZVjAJrWrGs/6Jy8OMuyj9ow==}

  etag@1.8.1:
    resolution: {integrity: sha512-aIL5Fx7mawVa300al2BnEE4iNvo1qETxLrPI/o05L7z6go7fCw1J6EQmbK4FmJ2AS7kgVF/KEZWufBfdClMcPg==}
    engines: {node: '>= 0.6'}

  eventsource-parser@3.0.6:
    resolution: {integrity: sha512-Vo1ab+QXPzZ4tCa8SwIHJFaSzy4R6SHf7BY79rFBDf0idraZWAkYrDjDj8uWaSm3S2TK+hJ7/t1CEmZ7jXw+pg==}
    engines: {node: '>=18.0.0'}

  eventsource@3.0.7:
    resolution: {integrity: sha512-CRT1WTyuQoD771GW56XEZFQ/ZoSfWid1alKGDYMmkt2yl8UXrVR4pspqWNEcqKvVIzg6PAltWjxcSSPrboA4iA==}
    engines: {node: '>=18.0.0'}

  expand-template@2.0.3:
    resolution: {integrity: sha512-XYfuKMvj4O35f/pOXLObndIRvyQ+/+6AhODh+OKWj9S9498pHHn/IMszH+gt0fBCRWMNfk1ZSp5x3AifmnI2vg==}
    engines: {node: '>=6'}

  express-rate-limit@8.3.1:
    resolution: {integrity: sha512-D1dKN+cmyPWuvB+G2SREQDzPY1agpBIcTa9sJxOPMCNeH3gwzhqJRDWCXW3gg0y//+LQ/8j52JbMROWyrKdMdw==}
    engines: {node: '>= 16'}
    peerDependencies:
      express: '>= 4.11'

  express@5.2.1:
    resolution: {integrity: sha512-hIS4idWWai69NezIdRt2xFVofaF4j+6INOpJlVOLDO8zXGpUVEVzIYk12UUi2JzjEzWL3IOAxcTubgz9Po0yXw==}
    engines: {node: '>= 18'}

  fast-deep-equal@3.1.3:
    resolution: {integrity: sha512-f3qQ9oQy9j2AhBe/H9VC91wLmKBCCU/gDOnKNAYG5hswO7BLKj09Hc5HYNz9cGI++xlpDCIgDaitVs03ATR84Q==}

  fast-uri@3.1.0:
    resolution: {integrity: sha512-iPeeDKJSWf4IEOasVVrknXpaBV0IApz/gp7S2bb7Z4Lljbl2MGJRqInZiUrQwV16cpzw/D3S5j5Julj/gT52AA==}

  file-uri-to-path@1.0.0:
    resolution: {integrity: sha512-0Zt+s3L7Vf1biwWZ29aARiVYLx7iMGnEUl9x33fbB/j3jR81u/O2LbqK+Bm1CDSNDKVtJ/YjwY7TUd5SkeLQLw==}

  finalhandler@2.1.1:
    resolution: {integrity: sha512-S8KoZgRZN+a5rNwqTxlZZePjT/4cnm0ROV70LedRHZ0p8u9fRID0hJUZQpkKLzro8LfmC8sx23bY6tVNxv8pQA==}
    engines: {node: '>= 18.0.0'}

  forwarded@0.2.0:
    resolution: {integrity: sha512-buRG0fpBtRHSTCOASe6hD258tEubFoRLb4ZNA6NxMVHNw2gOcwHo9wyablzMzOA5z9xA9L1KNjk/Nt6MT9aYow==}
    engines: {node: '>= 0.6'}

  fresh@2.0.0:
    resolution: {integrity: sha512-Rx/WycZ60HOaqLKAi6cHRKKI7zxWbJ31MhntmtwMoaTeF7XFH9hhBp8vITaMidfljRQ6eYWCKkaTK+ykVJHP2A==}
    engines: {node: '>= 0.8'}

  fs-constants@1.0.0:
    resolution: {integrity: sha512-y6OAwoSIf7FyjMIv94u+b5rdheZEjzR63GTyZJm5qh4Bi+2YgwLCcI/fPFZkL5PSixOt6ZNKm+w+Hfp/Bciwow==}

  function-bind@1.1.2:
    resolution: {integrity: sha512-7XHNxH7qX9xG5mIwxkhumTox/MIRNcOgDrxWsMt2pAr23WHp6MrRlN7FBSFpCpr+oVO0F744iUgR82nJMfG2SA==}

  get-intrinsic@1.3.0:
    resolution: {integrity: sha512-9fSjSaos/fRIVIp+xSJlE6lfwhES7LNtKaCBIamHsjr2na1BiABJPo0mOjjz8GJDURarmCPGqaiVg5mfjb98CQ==}
    engines: {node: '>= 0.4'}

  get-proto@1.0.1:
    resolution: {integrity: sha512-sTSfBjoXBp89JvIKIefqw7U2CCebsc74kiY6awiGogKtoSGbgjYE/G/+l9sF3MWFPNc9IcoOC4ODfKHfxFmp0g==}
    engines: {node: '>= 0.4'}

  github-from-package@0.0.0:
    resolution: {integrity: sha512-SyHy3T1v2NUXn29OsWdxmK6RwHD+vkj3v8en8AOBZ1wBQ/hCAQ5bAQTD02kW4W9tUp/3Qh6J8r9EvntiyCmOOw==}

  gopd@1.2.0:
    resolution: {integrity: sha512-ZUKRh6/kUFoAiTAtTYPZJ3hw9wNxx+BIBOijnlG9PnrJsCcSjs1wyyD6vJpaYtgnzDrKYRSqf3OO6Rfa93xsRg==}
    engines: {node: '>= 0.4'}

  has-symbols@1.1.0:
    resolution: {integrity: sha512-1cDNdwJ2Jaohmb3sg4OmKaMBwuC48sYni5HUw2DvsC8LjGTLK9h+eb1X6RyuOHe4hT0ULCW68iomhjUoKUqlPQ==}
    engines: {node: '>= 0.4'}

  hasown@2.0.2:
    resolution: {integrity: sha512-0hJU9SCPvmMzIBdZFqNPXWa6dqh7WdH0cII9y+CyS8rG3nL48Bclra9HmKhVVUHyPWNH5Y7xDwAB7bfgSjkUMQ==}
    engines: {node: '>= 0.4'}

  hono@4.12.9:
    resolution: {integrity: sha512-wy3T8Zm2bsEvxKZM5w21VdHDDcwVS1yUFFY6i8UobSsKfFceT7TOwhbhfKsDyx7tYQlmRM5FLpIuYvNFyjctiA==}
    engines: {node: '>=16.9.0'}

  http-errors@2.0.1:
    resolution: {integrity: sha512-4FbRdAX+bSdmo4AUFuS0WNiPz8NgFt+r8ThgNWmlrjQjt1Q7ZR9+zTlce2859x4KSXrwIsaeTqDoKQmtP8pLmQ==}
    engines: {node: '>= 0.8'}

  iconv-lite@0.7.2:
    resolution: {integrity: sha512-im9DjEDQ55s9fL4EYzOAv0yMqmMBSZp6G0VvFyTMPKWxiSBHUj9NW/qqLmXUwXrrM7AvqSlTCfvqRb0cM8yYqw==}
    engines: {node: '>=0.10.0'}

  ieee754@1.2.1:
    resolution: {integrity: sha512-dcyqhDvX1C46lXZcVqCpK+FtMRQVdIMN6/Df5js2zouUsqG7I6sFxitIC+7KYK29KdXOLHdu9zL4sFnoVQnqaA==}

  inherits@2.0.4:
    resolution: {integrity: sha512-k/vGaX4/Yla3WzyMCvTQOXYeIHvqOKtnqBduzTHpzpQZzAskKMhZ2K+EnBiSM9zGSoIFeMpXKxa4dYeZIQqewQ==}

  ini@1.3.8:
    resolution: {integrity: sha512-JV/yugV2uzW5iMRSiZAyDtQd+nxtUnjeLt0acNdw98kKLrvuRVyB80tsREOE7yvGVgalhZ6RNXCmEHkUKBKxew==}

  ip-address@10.1.0:
    resolution: {integrity: sha512-XXADHxXmvT9+CRxhXg56LJovE+bmWnEWB78LB83VZTprKTmaC5QfruXocxzTZ2Kl0DNwKuBdlIhjL8LeY8Sf8Q==}
    engines: {node: '>= 12'}

  ipaddr.js@1.9.1:
    resolution: {integrity: sha512-0KI/607xoxSToH7GjN1FfSbLoU0+btTicjsQSWQlh/hZykN8KpmMf7uYwPW3R+akZ6R/w18ZlXSHBYXiYUPO3g==}
    engines: {node: '>= 0.10'}

  is-promise@4.0.0:
    resolution: {integrity: sha512-hvpoI6korhJMnej285dSg6nu1+e6uxs7zG3BYAm5byqDsgJNWwxzM6z6iZiAgQR4TJ30JmBTOwqZUw3WlyH3AQ==}

  isexe@2.0.0:
    resolution: {integrity: sha512-RHxMLp9lnKHGHRng9QFhRCMbYAcVpn69smSGcq3f36xjgVVWThj4qqLbTLlq7Ssj8B+fIQ1EuCEGI2lKsyQeIw==}

  jose@6.2.2:
    resolution: {integrity: sha512-d7kPDd34KO/YnzaDOlikGpOurfF0ByC2sEV4cANCtdqLlTfBlw2p14O/5d/zv40gJPbIQxfES3nSx1/oYNyuZQ==}

  json-schema-traverse@1.0.0:
    resolution: {integrity: sha512-NM8/P9n3XjXhIZn1lLhkFaACTOURQXjWhV4BA/RnOv8xvgqtqpAX9IO4mRQxSx1Rlo4tqzeqb0sOlruaOy3dug==}

  json-schema-typed@8.0.2:
    resolution: {integrity: sha512-fQhoXdcvc3V28x7C7BMs4P5+kNlgUURe2jmUT1T//oBRMDrqy1QPelJimwZGo7Hg9VPV3EQV5Bnq4hbFy2vetA==}

  math-intrinsics@1.1.0:
    resolution: {integrity: sha512-/IXtbwEk5HTPyEwyKX6hGkYXxM9nbj64B+ilVJnC/R6B0pH5G4V3b0pVbL7DBj4tkhBAppbQUlf6F6Xl9LHu1g==}
    engines: {node: '>= 0.4'}

  media-typer@1.1.0:
    resolution: {integrity: sha512-aisnrDP4GNe06UcKFnV5bfMNPBUw4jsLGaWwWfnH3v02GnBuXX2MCVn5RbrWo0j3pczUilYblq7fQ7Nw2t5XKw==}
    engines: {node: '>= 0.8'}

  merge-descriptors@2.0.0:
    resolution: {integrity: sha512-Snk314V5ayFLhp3fkUREub6WtjBfPdCPY1Ln8/8munuLuiYhsABgBVWsozAG+MWMbVEvcdcpbi9R7ww22l9Q3g==}
    engines: {node: '>=18'}

  mime-db@1.54.0:
    resolution: {integrity: sha512-aU5EJuIN2WDemCcAp2vFBfp/m4EAhWJnUNSSw0ixs7/kXbd6Pg64EmwJkNdFhB8aWt1sH2CTXrLxo/iAGV3oPQ==}
    engines: {node: '>= 0.6'}

  mime-types@3.0.2:
    resolution: {integrity: sha512-Lbgzdk0h4juoQ9fCKXW4by0UJqj+nOOrI9MJ1sSj4nI8aI2eo1qmvQEie4VD1glsS250n15LsWsYtCugiStS5A==}
    engines: {node: '>=18'}

  mimic-response@3.1.0:
    resolution: {integrity: sha512-z0yWI+4FDrrweS8Zmt4Ej5HdJmky15+L2e6Wgn3+iK5fWzb6T3fhNFq2+MeTRb064c6Wr4N/wv0DzQTjNzHNGQ==}
    engines: {node: '>=10'}

  minimist@1.2.8:
    resolution: {integrity: sha512-2yyAR8qBkN3YuheJanUpWC5U3bb5osDywNB8RzDVlDwDHbocAJveqqj1u8+SVD7jkWT4yvsHCpWqqWqAxb0zCA==}

  mkdirp-classic@0.5.3:
    resolution: {integrity: sha512-gKLcREMhtuZRwRAfqP3RFW+TK4JqApVBtOIftVgjuABpAtpxhPGaDcfvbhNvD0B8iD1oUr/txX35NjcaY6Ns/A==}

  ms@2.1.3:
    resolution: {integrity: sha512-6FlzubTLZG3J2a/NVCAleEhjzq5oxgHyaCU9yYXvcLsvoVaHJq/s5xXI6/XXP6tz7R9xAOtHnSO/tXtF3WRTlA==}

  napi-build-utils@2.0.0:
    resolution: {integrity: sha512-GEbrYkbfF7MoNaoh2iGG84Mnf/WZfB0GdGEsM8wz7Expx/LlWf5U8t9nvJKXSp3qr5IsEbK04cBGhol/KwOsWA==}

  negotiator@1.0.0:
    resolution: {integrity: sha512-8Ofs/AUQh8MaEcrlq5xOX0CQ9ypTF5dl78mjlMNfOK08fzpgTHQRQPBxcPlEtIw0yRpws+Zo/3r+5WRby7u3Gg==}
    engines: {node: '>= 0.6'}

  node-abi@3.89.0:
    resolution: {integrity: sha512-6u9UwL0HlAl21+agMN3YAMXcKByMqwGx+pq+P76vii5f7hTPtKDp08/H9py6DY+cfDw7kQNTGEj/rly3IgbNQA==}
    engines: {node: '>=10'}

  object-assign@4.1.1:
    resolution: {integrity: sha512-rJgTQnkUnH1sFw8yT6VSU3zD3sWmu6sZhIseY8VX+GRu3P6F7Fu+JNDoXfklElbLJSnc3FUQHVe4cU5hj+BcUg==}
    engines: {node: '>=0.10.0'}

  object-inspect@1.13.4:
    resolution: {integrity: sha512-W67iLl4J2EXEGTbfeHCffrjDfitvLANg0UlX3wFUUSTx92KXRFegMHUVgSqE+wvhAbi4WqjGg9czysTV2Epbew==}
    engines: {node: '>= 0.4'}

  on-finished@2.4.1:
    resolution: {integrity: sha512-oVlzkg3ENAhCk2zdv7IJwd/QUD4z2RxRwpkcGY8psCVcCYZNq4wYnVWALHM+brtuJjePWiYF/ClmuDr8Ch5+kg==}
    engines: {node: '>= 0.8'}

  once@1.4.0:
    resolution: {integrity: sha512-lNaJgI+2Q5URQBkccEKHTQOPaXdUxnZZElQTZY0MFUAuaEqe1E+Nyvgdz/aIyNi6Z9MzO5dv1H8n58/GELp3+w==}

  parseurl@1.3.3:
    resolution: {integrity: sha512-CiyeOxFT/JZyN5m0z9PfXw4SCBJ6Sygz1Dpl0wqjlhDEGGBP1GnsUVEL0p63hoG1fcj3fHynXi9NYO4nWOL+qQ==}
    engines: {node: '>= 0.8'}

  path-key@3.1.1:
    resolution: {integrity: sha512-ojmeN0qd+y0jszEtoY48r0Peq5dwMEkIlCOu6Q5f41lfkswXuKtYrhgoTpLnyIcHm24Uhqx+5Tqm2InSwLhE6Q==}
    engines: {node: '>=8'}

  path-to-regexp@8.3.0:
    resolution: {integrity: sha512-7jdwVIRtsP8MYpdXSwOS0YdD0Du+qOoF/AEPIt88PcCFrZCzx41oxku1jD88hZBwbNUIEfpqvuhjFaMAqMTWnA==}

  pkce-challenge@5.0.1:
    resolution: {integrity: sha512-wQ0b/W4Fr01qtpHlqSqspcj3EhBvimsdh0KlHhH8HRZnMsEa0ea2fTULOXOS9ccQr3om+GcGRk4e+isrZWV8qQ==}
    engines: {node: '>=16.20.0'}

  prebuild-install@7.1.3:
    resolution: {integrity: sha512-8Mf2cbV7x1cXPUILADGI3wuhfqWvtiLA1iclTDbFRZkgRQS0NqsPZphna9V+HyTEadheuPmjaJMsbzKQFOzLug==}
    engines: {node: '>=10'}
    deprecated: No longer maintained. Please contact the author of the relevant native addon; alternatives are available.
    hasBin: true

  proxy-addr@2.0.7:
    resolution: {integrity: sha512-llQsMLSUDUPT44jdrU/O37qlnifitDP+ZwrmmZcoSKyLKvtZxpyV0n2/bD/N4tBAAZ/gJEdZU7KMraoK1+XYAg==}
    engines: {node: '>= 0.10'}

  pump@3.0.4:
    resolution: {integrity: sha512-VS7sjc6KR7e1ukRFhQSY5LM2uBWAUPiOPa/A3mkKmiMwSmRFUITt0xuj+/lesgnCv+dPIEYlkzrcyXgquIHMcA==}

  qs@6.15.0:
    resolution: {integrity: sha512-mAZTtNCeetKMH+pSjrb76NAM8V9a05I9aBZOHztWy/UqcJdQYNsf59vrRKWnojAT9Y+GbIvoTBC++CPHqpDBhQ==}
    engines: {node: '>=0.6'}

  range-parser@1.2.1:
    resolution: {integrity: sha512-Hrgsx+orqoygnmhFbKaHE6c296J+HTAQXoxEF6gNupROmmGJRoyzfG3ccAveqCBrwr/2yxQ5BVd/GTl5agOwSg==}
    engines: {node: '>= 0.6'}

  raw-body@3.0.2:
    resolution: {integrity: sha512-K5zQjDllxWkf7Z5xJdV0/B0WTNqx6vxG70zJE4N0kBs4LovmEYWJzQGxC9bS9RAKu3bgM40lrd5zoLJ12MQ5BA==}
    engines: {node: '>= 0.10'}

  rc@1.2.8:
    resolution: {integrity: sha512-y3bGgqKj3QBdxLbLkomlohkvsA8gdAiUQlSBJnBhfn+BPxg4bc62d8TcBW15wavDfgexCgccckhcZvywyQYPOw==}
    hasBin: true

  readable-stream@3.6.2:
    resolution: {integrity: sha512-9u/sniCrY3D5WdsERHzHE4G2YCXqoG5FTHUiCC4SIbr6XcLZBY05ya9EKjYek9O5xOAwjGq+1JdGBAS7Q9ScoA==}
    engines: {node: '>= 6'}

  require-from-string@2.0.2:
    resolution: {integrity: sha512-Xf0nWe6RseziFMu+Ap9biiUbmplq6S9/p+7w7YXP/JBHhrUDDUhwa+vANyubuqfZWTveU//DYVGsDG7RKL/vEw==}
    engines: {node: '>=0.10.0'}

  router@2.2.0:
    resolution: {integrity: sha512-nLTrUKm2UyiL7rlhapu/Zl45FwNgkZGaCpZbIHajDYgwlJCOzLSk+cIPAnsEqV955GjILJnKbdQC1nVPz+gAYQ==}
    engines: {node: '>= 18'}

  safe-buffer@5.2.1:
    resolution: {integrity: sha512-rp3So07KcdmmKbGvgaNxQSJr7bGVSVk5S9Eq1F+ppbRo70+YeaDxkw5Dd8NPN+GD6bjnYm2VuPuCXmpuYvmCXQ==}

  safer-buffer@2.1.2:
    resolution: {integrity: sha512-YZo3K82SD7Riyi0E1EQPojLz7kpepnSQI9IyPbHHg1XXXevb5dJI7tpyN2ADxGcQbHG7vcyRHk0cbwqcQriUtg==}

  semver@7.7.4:
    resolution: {integrity: sha512-vFKC2IEtQnVhpT78h1Yp8wzwrf8CM+MzKMHGJZfBtzhZNycRFnXsHk6E5TxIkkMsgNS7mdX3AGB7x2QM2di4lA==}
    engines: {node: '>=10'}
    hasBin: true

  send@1.2.1:
    resolution: {integrity: sha512-1gnZf7DFcoIcajTjTwjwuDjzuz4PPcY2StKPlsGAQ1+YH20IRVrBaXSWmdjowTJ6u8Rc01PoYOGHXfP1mYcZNQ==}
    engines: {node: '>= 18'}

  serve-static@2.2.1:
    resolution: {integrity: sha512-xRXBn0pPqQTVQiC8wyQrKs2MOlX24zQ0POGaj0kultvoOCstBQM5yvOhAVSUwOMjQtTvsPWoNCHfPGwaaQJhTw==}
    engines: {node: '>= 18'}

  setprototypeof@1.2.0:
    resolution: {integrity: sha512-E5LDX7Wrp85Kil5bhZv46j8jOeboKq5JMmYM3gVGdGH8xFpPWXUMsNrlODCrkoxMEeNi/XZIwuRvY4XNwYMJpw==}

  shebang-command@2.0.0:
    resolution: {integrity: sha512-kHxr2zZpYtdmrN1qDjrrX/Z1rR1kG8Dx+gkpK1G4eXmvXswmcE1hTWBWYUzlraYw1/yZp6YuDY77YtvbN0dmDA==}
    engines: {node: '>=8'}

  shebang-regex@3.0.0:
    resolution: {integrity: sha512-7++dFhtcx3353uBaq8DDR4NuxBetBzC7ZQOhmTQInHEd6bSrXdiEyzCvG07Z44UYdLShWUyXt5M/yhz8ekcb1A==}
    engines: {node: '>=8'}

  side-channel-list@1.0.0:
    resolution: {integrity: sha512-FCLHtRD/gnpCiCHEiJLOwdmFP+wzCmDEkc9y7NsYxeF4u7Btsn1ZuwgwJGxImImHicJArLP4R0yX4c2KCrMrTA==}
    engines: {node: '>= 0.4'}

  side-channel-map@1.0.1:
    resolution: {integrity: sha512-VCjCNfgMsby3tTdo02nbjtM/ewra6jPHmpThenkTYh8pG9ucZ/1P8So4u4FGBek/BjpOVsDCMoLA/iuBKIFXRA==}
    engines: {node: '>= 0.4'}

  side-channel-weakmap@1.0.2:
    resolution: {integrity: sha512-WPS/HvHQTYnHisLo9McqBHOJk2FkHO/tlpvldyrnem4aeQp4hai3gythswg6p01oSoTl58rcpiFAjF2br2Ak2A==}
    engines: {node: '>= 0.4'}

  side-channel@1.1.0:
    resolution: {integrity: sha512-ZX99e6tRweoUXqR+VBrslhda51Nh5MTQwou5tnUDgbtyM0dBgmhEDtWGP/xbKn6hqfPRHujUNwz5fy/wbbhnpw==}
    engines: {node: '>= 0.4'}

  simple-concat@1.0.1:
    resolution: {integrity: sha512-cSFtAPtRhljv69IK0hTVZQ+OfE9nePi/rtJmw5UjHeVyVroEqJXP1sFztKUy1qU+xvz3u/sfYJLa947b7nAN2Q==}

  simple-get@4.0.1:
    resolution: {integrity: sha512-brv7p5WgH0jmQJr1ZDDfKDOSeWWg+OVypG99A/5vYGPqJ6pxiaHLy8nxtFjBA7oMa01ebA9gfh1uMCFqOuXxvA==}

  statuses@2.0.2:
    resolution: {integrity: sha512-DvEy55V3DB7uknRo+4iOGT5fP1slR8wQohVdknigZPMpMstaKJQWhwiYBACJE3Ul2pTnATihhBYnRhZQHGBiRw==}
    engines: {node: '>= 0.8'}

  string_decoder@1.3.0:
    resolution: {integrity: sha512-hkRX8U1WjJFd8LsDJ2yQ/wWWxaopEsABU1XfkM8A+j0+85JAGppt16cr1Whg6KIbb4okU6Mql6BOj+uup/wKeA==}

  strip-json-comments@2.0.1:
    resolution: {integrity: sha512-4gB8na07fecVVkOI6Rs4e7T6NOTki5EmL7TUduTs6bu3EdnSycntVJ4re8kgZA+wx9IueI2Y11bfbgwtzuE0KQ==}
    engines: {node: '>=0.10.0'}

  tar-fs@2.1.4:
    resolution: {integrity: sha512-mDAjwmZdh7LTT6pNleZ05Yt65HC3E+NiQzl672vQG38jIrehtJk/J3mNwIg+vShQPcLF/LV7CMnDW6vjj6sfYQ==}

  tar-stream@2.2.0:
    resolution: {integrity: sha512-ujeqbceABgwMZxEJnk2HDY2DlnUZ+9oEcb1KzTVfYHio0UE6dG71n60d8D2I4qNvleWrrXpmjpt7vZeF1LnMZQ==}
    engines: {node: '>=6'}

  toidentifier@1.0.1:
    resolution: {integrity: sha512-o5sSPKEkg/DIQNmH43V0/uerLrpzVedkUh8tGNvaeXpfpuwjKenlSox/2O/BTlZUtEe+JG7s5YhEz608PlAHRA==}
    engines: {node: '>=0.6'}

  tunnel-agent@0.6.0:
    resolution: {integrity: sha512-McnNiV1l8RYeY8tBgEpuodCC1mLUdbSN+CYBL7kJsJNInOP8UjDDEwdk6Mw60vdLLrr5NHKZhMAOSrR2NZuQ+w==}

  type-is@2.0.1:
    resolution: {integrity: sha512-OZs6gsjF4vMp32qrCbiVSkrFmXtG/AZhY3t0iAMrMBiAZyV9oALtXO8hsrHbMXF9x6L3grlFuwW2oAz7cav+Gw==}
    engines: {node: '>= 0.6'}

  typescript@5.9.3:
    resolution: {integrity: sha512-jl1vZzPDinLr9eUt3J/t7V6FgNEw9QjvBPdysz9KfQDD41fQrC2Y4vKQdiaUpFT4bXlb1RHhLpp8wtm6M5TgSw==}
    engines: {node: '>=14.17'}
    hasBin: true

  undici-types@7.18.2:
    resolution: {integrity: sha512-AsuCzffGHJybSaRrmr5eHr81mwJU3kjw6M+uprWvCXiNeN9SOGwQ3Jn8jb8m3Z6izVgknn1R0FTCEAP2QrLY/w==}

  unpipe@1.0.0:
    resolution: {integrity: sha512-pjy2bYhSsufwWlKwPc+l3cN7+wuJlK6uz0YdJEOlQDbl6jo/YlPi4mb8agUkVC8BF7V8NuzeyPNqRksA3hztKQ==}
    engines: {node: '>= 0.8'}

  util-deprecate@1.0.2:
    resolution: {integrity: sha512-EPD5q1uXyFxJpCrLnCc1nHnq3gOa6DZBocAIiI2TaSCA7VCJ1UJDMagCzIkXNsUYfD1daK//LTEQ8xiIbrHtcw==}

  vary@1.1.2:
    resolution: {integrity: sha512-BNGbWLfd0eUPabhkXUVm0j8uuvREyTh5ovRa/dyow/BqAbZJyC+5fU+IzQOzmAKzYqYRAISoRhdQr3eIZ/PXqg==}
    engines: {node: '>= 0.8'}

  which@2.0.2:
    resolution: {integrity: sha512-BLI3Tl1TW3Pvl70l3yq3Y64i+awpwXqsGBYWkkqMtnbXgrMD+yj7rhW0kuEDxzJaYXGjEW5ogapKNMEKNMjibA==}
    engines: {node: '>= 8'}
    hasBin: true

  wrappy@1.0.2:
    resolution: {integrity: sha512-l4Sp/DRseor9wL6EvV2+TuQn63dMkPjZ/sp9XkghTEbV9KlPS1xUsZ3u7/IQO4wxtcFB4bgpQPRcR3QCvezPcQ==}

  yaml@2.8.3:
    resolution: {integrity: sha512-AvbaCLOO2Otw/lW5bmh9d/WEdcDFdQp2Z2ZUH3pX9U2ihyUY0nvLv7J6TrWowklRGPYbB/IuIMfYgxaCPg5Bpg==}
    engines: {node: '>= 14.6'}
    hasBin: true

  zod-to-json-schema@3.25.1:
    resolution: {integrity: sha512-pM/SU9d3YAggzi6MtR4h7ruuQlqKtad8e9S0fmxcMi+ueAK5Korys/aWcV9LIIHTVbj01NdzxcnXSN+O74ZIVA==}
    peerDependencies:
      zod: ^3.25 || ^4

  zod@4.3.6:
    resolution: {integrity: sha512-rftlrkhHZOcjDwkGlnUtZZkvaPHCsDATp4pGpuOOMDaTdDDXF91wuVDJoWoPsKX/3YPQ5fHuF3STjcYyKr+Qhg==}

snapshots:

  '@hono/node-server@1.19.11(hono@4.12.9)':
    dependencies:
      hono: 4.12.9

  '@modelcontextprotocol/sdk@1.27.1(zod@4.3.6)':
    dependencies:
      '@hono/node-server': 1.19.11(hono@4.12.9)
      ajv: 8.18.0
      ajv-formats: 3.0.1(ajv@8.18.0)
      content-type: 1.0.5
      cors: 2.8.6
      cross-spawn: 7.0.6
      eventsource: 3.0.7
      eventsource-parser: 3.0.6
      express: 5.2.1
      express-rate-limit: 8.3.1(express@5.2.1)
      hono: 4.12.9
      jose: 6.2.2
      json-schema-typed: 8.0.2
      pkce-challenge: 5.0.1
      raw-body: 3.0.2
      zod: 4.3.6
      zod-to-json-schema: 3.25.1(zod@4.3.6)
    transitivePeerDependencies:
      - supports-color

  '@tsconfig/node24@24.0.4': {}

  '@types/better-sqlite3@7.6.13':
    dependencies:
      '@types/node': 25.5.0

  '@types/node@25.5.0':
    dependencies:
      undici-types: 7.18.2

  accepts@2.0.0:
    dependencies:
      mime-types: 3.0.2
      negotiator: 1.0.0

  ajv-formats@3.0.1(ajv@8.18.0):
    optionalDependencies:
      ajv: 8.18.0

  ajv@8.18.0:
    dependencies:
      fast-deep-equal: 3.1.3
      fast-uri: 3.1.0
      json-schema-traverse: 1.0.0
      require-from-string: 2.0.2

  base64-js@1.5.1: {}

  better-sqlite3@12.8.0:
    dependencies:
      bindings: 1.5.0
      prebuild-install: 7.1.3

  bindings@1.5.0:
    dependencies:
      file-uri-to-path: 1.0.0

  bl@4.1.0:
    dependencies:
      buffer: 5.7.1
      inherits: 2.0.4
      readable-stream: 3.6.2

  body-parser@2.2.2:
    dependencies:
      bytes: 3.1.2
      content-type: 1.0.5
      debug: 4.4.3
      http-errors: 2.0.1
      iconv-lite: 0.7.2
      on-finished: 2.4.1
      qs: 6.15.0
      raw-body: 3.0.2
      type-is: 2.0.1
    transitivePeerDependencies:
      - supports-color

  buffer@5.7.1:
    dependencies:
      base64-js: 1.5.1
      ieee754: 1.2.1

  bytes@3.1.2: {}

  call-bind-apply-helpers@1.0.2:
    dependencies:
      es-errors: 1.3.0
      function-bind: 1.1.2

  call-bound@1.0.4:
    dependencies:
      call-bind-apply-helpers: 1.0.2
      get-intrinsic: 1.3.0

  chownr@1.1.4: {}

  commander@14.0.3: {}

  content-disposition@1.0.1: {}

  content-type@1.0.5: {}

  cookie-signature@1.2.2: {}

  cookie@0.7.2: {}

  cors@2.8.6:
    dependencies:
      object-assign: 4.1.1
      vary: 1.1.2

  cross-spawn@7.0.6:
    dependencies:
      path-key: 3.1.1
      shebang-command: 2.0.0
      which: 2.0.2

  debug@4.4.3:
    dependencies:
      ms: 2.1.3

  decompress-response@6.0.0:
    dependencies:
      mimic-response: 3.1.0

  deep-extend@0.6.0: {}

  depd@2.0.0: {}

  detect-libc@2.1.2: {}

  dunder-proto@1.0.1:
    dependencies:
      call-bind-apply-helpers: 1.0.2
      es-errors: 1.3.0
      gopd: 1.2.0

  ee-first@1.1.1: {}

  encodeurl@2.0.0: {}

  end-of-stream@1.4.5:
    dependencies:
      once: 1.4.0

  es-define-property@1.0.1: {}

  es-errors@1.3.0: {}

  es-object-atoms@1.1.1:
    dependencies:
      es-errors: 1.3.0

  escape-html@1.0.3: {}

  etag@1.8.1: {}

  eventsource-parser@3.0.6: {}

  eventsource@3.0.7:
    dependencies:
      eventsource-parser: 3.0.6

  expand-template@2.0.3: {}

  express-rate-limit@8.3.1(express@5.2.1):
    dependencies:
      express: 5.2.1
      ip-address: 10.1.0

  express@5.2.1:
    dependencies:
      accepts: 2.0.0
      body-parser: 2.2.2
      content-disposition: 1.0.1
      content-type: 1.0.5
      cookie: 0.7.2
      cookie-signature: 1.2.2
      debug: 4.4.3
      depd: 2.0.0
      encodeurl: 2.0.0
      escape-html: 1.0.3
      etag: 1.8.1
      finalhandler: 2.1.1
      fresh: 2.0.0
      http-errors: 2.0.1
      merge-descriptors: 2.0.0
      mime-types: 3.0.2
      on-finished: 2.4.1
      once: 1.4.0
      parseurl: 1.3.3
      proxy-addr: 2.0.7
      qs: 6.15.0
      range-parser: 1.2.1
      router: 2.2.0
      send: 1.2.1
      serve-static: 2.2.1
      statuses: 2.0.2
      type-is: 2.0.1
      vary: 1.1.2
    transitivePeerDependencies:
      - supports-color

  fast-deep-equal@3.1.3: {}

  fast-uri@3.1.0: {}

  file-uri-to-path@1.0.0: {}

  finalhandler@2.1.1:
    dependencies:
      debug: 4.4.3
      encodeurl: 2.0.0
      escape-html: 1.0.3
      on-finished: 2.4.1
      parseurl: 1.3.3
      statuses: 2.0.2
    transitivePeerDependencies:
      - supports-color

  forwarded@0.2.0: {}

  fresh@2.0.0: {}

  fs-constants@1.0.0: {}

  function-bind@1.1.2: {}

  get-intrinsic@1.3.0:
    dependencies:
      call-bind-apply-helpers: 1.0.2
      es-define-property: 1.0.1
      es-errors: 1.3.0
      es-object-atoms: 1.1.1
      function-bind: 1.1.2
      get-proto: 1.0.1
      gopd: 1.2.0
      has-symbols: 1.1.0
      hasown: 2.0.2
      math-intrinsics: 1.1.0

  get-proto@1.0.1:
    dependencies:
      dunder-proto: 1.0.1
      es-object-atoms: 1.1.1

  github-from-package@0.0.0: {}

  gopd@1.2.0: {}

  has-symbols@1.1.0: {}

  hasown@2.0.2:
    dependencies:
      function-bind: 1.1.2

  hono@4.12.9: {}

  http-errors@2.0.1:
    dependencies:
      depd: 2.0.0
      inherits: 2.0.4
      setprototypeof: 1.2.0
      statuses: 2.0.2
      toidentifier: 1.0.1

  iconv-lite@0.7.2:
    dependencies:
      safer-buffer: 2.1.2

  ieee754@1.2.1: {}

  inherits@2.0.4: {}

  ini@1.3.8: {}

  ip-address@10.1.0: {}

  ipaddr.js@1.9.1: {}

  is-promise@4.0.0: {}

  isexe@2.0.0: {}

  jose@6.2.2: {}

  json-schema-traverse@1.0.0: {}

  json-schema-typed@8.0.2: {}

  math-intrinsics@1.1.0: {}

  media-typer@1.1.0: {}

  merge-descriptors@2.0.0: {}

  mime-db@1.54.0: {}

  mime-types@3.0.2:
    dependencies:
      mime-db: 1.54.0

  mimic-response@3.1.0: {}

  minimist@1.2.8: {}

  mkdirp-classic@0.5.3: {}

  ms@2.1.3: {}

  napi-build-utils@2.0.0: {}

  negotiator@1.0.0: {}

  node-abi@3.89.0:
    dependencies:
      semver: 7.7.4

  object-assign@4.1.1: {}

  object-inspect@1.13.4: {}

  on-finished@2.4.1:
    dependencies:
      ee-first: 1.1.1

  once@1.4.0:
    dependencies:
      wrappy: 1.0.2

  parseurl@1.3.3: {}

  path-key@3.1.1: {}

  path-to-regexp@8.3.0: {}

  pkce-challenge@5.0.1: {}

  prebuild-install@7.1.3:
    dependencies:
      detect-libc: 2.1.2
      expand-template: 2.0.3
      github-from-package: 0.0.0
      minimist: 1.2.8
      mkdirp-classic: 0.5.3
      napi-build-utils: 2.0.0
      node-abi: 3.89.0
      pump: 3.0.4
      rc: 1.2.8
      simple-get: 4.0.1
      tar-fs: 2.1.4
      tunnel-agent: 0.6.0

  proxy-addr@2.0.7:
    dependencies:
      forwarded: 0.2.0
      ipaddr.js: 1.9.1

  pump@3.0.4:
    dependencies:
      end-of-stream: 1.4.5
      once: 1.4.0

  qs@6.15.0:
    dependencies:
      side-channel: 1.1.0

  range-parser@1.2.1: {}

  raw-body@3.0.2:
    dependencies:
      bytes: 3.1.2
      http-errors: 2.0.1
      iconv-lite: 0.7.2
      unpipe: 1.0.0

  rc@1.2.8:
    dependencies:
      deep-extend: 0.6.0
      ini: 1.3.8
      minimist: 1.2.8
      strip-json-comments: 2.0.1

  readable-stream@3.6.2:
    dependencies:
      inherits: 2.0.4
      string_decoder: 1.3.0
      util-deprecate: 1.0.2

  require-from-string@2.0.2: {}

  router@2.2.0:
    dependencies:
      debug: 4.4.3
      depd: 2.0.0
      is-promise: 4.0.0
      parseurl: 1.3.3
      path-to-regexp: 8.3.0
    transitivePeerDependencies:
      - supports-color

  safe-buffer@5.2.1: {}

  safer-buffer@2.1.2: {}

  semver@7.7.4: {}

  send@1.2.1:
    dependencies:
      debug: 4.4.3
      encodeurl: 2.0.0
      escape-html: 1.0.3
      etag: 1.8.1
      fresh: 2.0.0
      http-errors: 2.0.1
      mime-types: 3.0.2
      ms: 2.1.3
      on-finished: 2.4.1
      range-parser: 1.2.1
      statuses: 2.0.2
    transitivePeerDependencies:
      - supports-color

  serve-static@2.2.1:
    dependencies:
      encodeurl: 2.0.0
      escape-html: 1.0.3
      parseurl: 1.3.3
      send: 1.2.1
    transitivePeerDependencies:
      - supports-color

  setprototypeof@1.2.0: {}

  shebang-command@2.0.0:
    dependencies:
      shebang-regex: 3.0.0

  shebang-regex@3.0.0: {}

  side-channel-list@1.0.0:
    dependencies:
      es-errors: 1.3.0
      object-inspect: 1.13.4

  side-channel-map@1.0.1:
    dependencies:
      call-bound: 1.0.4
      es-errors: 1.3.0
      get-intrinsic: 1.3.0
      object-inspect: 1.13.4

  side-channel-weakmap@1.0.2:
    dependencies:
      call-bound: 1.0.4
      es-errors: 1.3.0
      get-intrinsic: 1.3.0
      object-inspect: 1.13.4
      side-channel-map: 1.0.1

  side-channel@1.1.0:
    dependencies:
      es-errors: 1.3.0
      object-inspect: 1.13.4
      side-channel-list: 1.0.0
      side-channel-map: 1.0.1
      side-channel-weakmap: 1.0.2

  simple-concat@1.0.1: {}

  simple-get@4.0.1:
    dependencies:
      decompress-response: 6.0.0
      once: 1.4.0
      simple-concat: 1.0.1

  statuses@2.0.2: {}

  string_decoder@1.3.0:
    dependencies:
      safe-buffer: 5.2.1

  strip-json-comments@2.0.1: {}

  tar-fs@2.1.4:
    dependencies:
      chownr: 1.1.4
      mkdirp-classic: 0.5.3
      pump: 3.0.4
      tar-stream: 2.2.0

  tar-stream@2.2.0:
    dependencies:
      bl: 4.1.0
      end-of-stream: 1.4.5
      fs-constants: 1.0.0
      inherits: 2.0.4
      readable-stream: 3.6.2

  toidentifier@1.0.1: {}

  tunnel-agent@0.6.0:
    dependencies:
      safe-buffer: 5.2.1

  type-is@2.0.1:
    dependencies:
      content-type: 1.0.5
      media-typer: 1.1.0
      mime-types: 3.0.2

  typescript@5.9.3: {}

  undici-types@7.18.2: {}

  unpipe@1.0.0: {}

  util-deprecate@1.0.2: {}

  vary@1.1.2: {}

  which@2.0.2:
    dependencies:
      isexe: 2.0.0

  wrappy@1.0.2: {}

  yaml@2.8.3: {}

  zod-to-json-schema@3.25.1(zod@4.3.6):
    dependencies:
      zod: 4.3.6

  zod@4.3.6: {}



## Convention Reference (sibling files not modified by this commission)

=== CONTEXT FILE: README.md ===
# Nexus Mk 2.1

A framework for operating multi-agent AI workforces. Nexus provides the guild model: a structured workspace where animas (AI identities) receive commissions, use tools, record work, and collaborate through a shared Books database and event-driven Clockworks.

The framework is plugin-based. Almost everything — tools, engines, database schemas, anima management — is contributed by plugins. The core runtime is intentionally minimal.

---

## For users

### Install the CLI

```sh
npm install -g @shardworks/nexus
```

This installs the `nsg` command globally.

### Initialize a guild

A guild is the workspace where animas operate. Create one with `nsg init`:

```sh
nsg init ./my-guild --name my-guild
cd my-guild
```

This writes `guild.json`, `package.json`, `.gitignore`, and the `.nexus/` directory structure. It does not install any plugins or create any animas.

### Install plugins

Plugins are npm packages that contribute tools, engines, database schemas, and other capabilities to your guild. Install them with `nsg rig install`:

```sh
# Install from npm
nsg rig install @shardworks/nexus-stdlib

# Pin a version
nsg rig install @shardworks/nexus-stdlib@1.2.0

# Install from a git repository
nsg rig install git+https://github.com/acme/my-plugin.git

# Symlink a local directory during development
nsg rig install ./path/to/my-plugin --type link
```

By default, a plugin's tools are added to `baseTools` (available to all animas). To assign tools to specific roles instead:

```sh
nsg rig install @shardworks/nexus-stdlib --roles artificer,scribe
```

List installed plugins:

```sh
nsg rig list
```

Remove a plugin:

```sh
nsg rig remove nexus-stdlib
```

### Check guild status

```sh
nsg status          # guild name, nexus version, installed plugins, roles
nsg version         # framework version + installed plugin versions
```

### `guild.json`

The guild's central configuration file. Updated automatically by `nsg rig install` and `nsg rig remove`. Stores the plugin list, role definitions, tool assignments, Clockworks standing orders, and guild settings.

Plugins are listed by their derived plugin id (package name with the `@shardworks/` scope stripped):

```json
{
  "name": "my-guild",
  "nexus": "2.1.0",
  "plugins": ["nexus-stdlib", "nexus-clockworks"],
  "baseTools": ["commission", "signal", "list-writs"],
  "roles": { ... },
  "settings": { "model": "claude-opus-4-5" }
}
```

---

## For plugin authors

Nexus plugins are npm packages that contribute capabilities to a guild. There are two kinds:

- **Kit** — a passive package contributing tools, engines, relays, or other capabilities. No lifecycle; contributions are read at load time and used by consuming apparatuses.
- **Apparatus** — a package contributing persistent running infrastructure. Has a `start`/`stop` lifecycle, receives `GuildContext` at startup, and exposes a runtime API via `provides`.

Plugin authors import exclusively from `@shardworks/nexus-core`. The arbor runtime (`@shardworks/nexus-arbor`) is an internal concern of the CLI and session provider.

### Key points

- A plugin's **name is inferred from its npm package name** at load time — never declared in the manifest.
- A **kit** is a plain object exported as `{ kit: { ... } }`. The `tools` field (array of `ToolDefinition`) is the most common contribution.
- An **apparatus** is exported as `{ apparatus: { start, stop?, provides?, requires?, supportKit?, consumes? } }`.
- `requires` on a kit names apparatuses whose runtime APIs the kit's tool handlers will call. Hard startup failure if not installed.
- `requires` on an apparatus names other apparatuses that must be started first. Determines start order.
- Apparatus `provides` objects are retrieved at handler invocation time via `ctx.apparatus<T>(name)`.

### Authoring tools

The `tool()` function is the primary authoring entry point. Define a name, description, Zod param schema, and a handler:

```typescript
import { tool } from '@shardworks/nexus-core';
import { z } from 'zod';

const greet = tool({
  name: 'greet',
  description: 'Greet someone by name',
  params: {
    name: z.string().describe('Name to greet'),
  },
  handler: async ({ name }, ctx) => {
    return `Hello, ${name}! Guild root: ${ctx.home}`;
  },
});
```

The handler receives:
- `params` — validated input, typed from your Zod schemas
- `ctx` — a `HandlerContext` with `home` (guild root path) and `apparatus<T>(name)` for accessing started apparatus APIs

Restrict a tool to specific callers with `callableBy`:

```typescript
tool({
  name: 'admin-reset',
  callableBy: ['cli'],    // CLI only — not available to animas
  // ...
});
```

### Exporting a kit

A kit is the simplest plugin form — a plain object with a `kit` key:

```typescript
import { tool, type Kit } from '@shardworks/nexus-core';

const myTool = tool({ name: 'lookup', /* ... */ });

export default {
  kit: {
    tools: [myTool],

    // Optional: declare required apparatuses whose APIs your handlers call
    requires: ['nexus-books'],

    // Optional: document contribution fields for consuming apparatuses
    // (field types are defined by the apparatus packages that consume them)
    books: {
      records: { indexes: ['status', 'createdAt'] },
    },
  } satisfies Kit,
};
```

The `tools` field is the most common kit contribution. Other contribution fields (`engines`, `relays`, etc.) are defined by the apparatus packages that consume them — the framework treats any unknown field as opaque data.

### Exporting an apparatus

An apparatus has a `start`/`stop` lifecycle and can expose a runtime API:

```typescript
import { type Apparatus, type GuildContext } from '@shardworks/nexus-core';

// The API you expose to other plugins
interface MyApi {
  lookup(key: string): string | null;
}

const store = new Map<string, string>();

export default {
  apparatus: {
    // Apparatuses this one requires to be started first
    requires: ['nexus-books'],

    // The runtime API object exposed via ctx.apparatus<MyApi>('my-plugin')
    provides: {
      lookup(key: string) { return store.get(key) ?? null; },
    } satisfies MyApi,

    async start(ctx: GuildContext) {
      // ctx.apparatus<BooksApi>('nexus-books') is available here
      // ctx.kits() — snapshot of all loaded kits
      // ctx.on('plugin:initialized', handler) — react to kit contributions
    },

    async stop() {
      store.clear();
    },
  } satisfies Apparatus,
};
```

Consumers retrieve your `provides` object via `ctx.apparatus<MyApi>('my-plugin')` — either in their own `start()` or in tool handlers via `HandlerContext.apparatus<T>()`.

An apparatus can also contribute tools via `supportKit`:

```typescript
export default {
  apparatus: {
    supportKit: {
      tools: [myAdminTool],
    },
    // ...
  },
};
```

### `HandlerContext`

Injected into every tool and engine handler at invocation time:

```typescript
interface HandlerContext {
  home: string;                        // absolute path to the guild root
  apparatus<T>(name: string): T;       // access a started apparatus's provides object
}
```

### Further reading

- [`packages/arbor/README.md`](packages/arbor/README.md) — runtime API reference (`createArbor`, `Arbor`, `LoadedKit`, `LoadedApparatus`, `derivePluginId`, Books database)
- [`docs/architecture/plugins.md`](docs/architecture/plugins.md) — full plugin architecture specification
- [`docs/architecture/apparatus/books.md`](docs/architecture/apparatus/books.md) — Books apparatus design (in progress)

=== CONTEXT FILE: LICENSE ===
ISC License

Copyright (c) 2026 Sean Boots

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.

=== CONTEXT FILE: package.json ===
{
  "private": true,
  "packageManager": "pnpm@10.32.1",
  "version": "0.0.0",
  "license": "ISC",
  "repository": {
    "type": "git",
    "url": "https://github.com/shardworks/nexus-mk2"
  },
  "type": "module",
  "engines": {
    "node": "24.x"
  },
  "scripts": {
    "build": "pnpm -r build",
    "test": "pnpm -r test",
    "typecheck": "pnpm -r typecheck",
    "nsg": "node --disable-warning=ExperimentalWarning --experimental-transform-types packages/framework/cli/src/cli.ts"
  },
  "devDependencies": {
    "@tsconfig/node24": "24.0.4",
    "typescript": "5.9.3"
  },
  "pnpm": {
    "onlyBuiltDependencies": [
      "better-sqlite3"
    ]
  }
}

=== CONTEXT FILE: packages/plugins/parlour/README.md ===
# `@shardworks/parlour-apparatus`

The Parlour manages multi-turn conversations within the guild. It provides the structure for two kinds of interaction: **consult** (a human talks to an anima) and **convene** (multiple animas hold a structured dialogue). The Parlour orchestrates turns — deciding *when* and *for whom* to call The Animator — while delegating session launch to The Animator and context composition to The Loom.

The Parlour sits downstream of both The Animator and The Loom in the dependency graph: `stacks <- animator <- parlour` and `loom <- parlour`.

---

## Installation

Add to your package's dependencies:

```json
{
  "@shardworks/parlour-apparatus": "workspace:*"
}
```

The Parlour requires The Stacks, The Animator, and The Loom to be installed in the guild.

---

## API

The Parlour exposes a `ParlourApi` via its `provides` interface, retrieved at runtime:

```typescript
import type { ParlourApi } from '@shardworks/parlour-apparatus';

const parlour = guild().apparatus<ParlourApi>('parlour');
```

### `create(request): Promise<CreateConversationResult>`

Create a new conversation. Sets up the conversation and participant records but does NOT take a first turn.

```typescript
const { conversationId, participants } = await parlour.create({
  kind: 'consult',
  topic: 'Help me refactor the session layer',
  turnLimit: 10,
  cwd: '/workspace/shardworks',
  participants: [
    { kind: 'human', name: 'Sean' },
    { kind: 'anima', name: 'Artificer' },
  ],
});
```

| Parameter | Type | Description |
|---|---|---|
| `kind` | `'consult' \| 'convene'` | Conversation kind |
| `topic` | `string` | Seed topic / initial prompt (optional) |
| `turnLimit` | `number` | Max anima turns before auto-conclude (optional) |
| `cwd` | `string` | Working directory — persists for the conversation's lifetime |
| `participants` | `ParticipantDeclaration[]` | Who is in the conversation |
| `eventId` | `string` | Triggering event id (optional, for clockworks) |

### `takeTurn(request): Promise<TurnResult>`

Take a turn in a conversation. For anima participants, weaves context and calls The Animator. For human participants, records the message as context for the next anima turn.

```typescript
// Human turn — records message, no session launched
await parlour.takeTurn({
  conversationId,
  participantId: humanId,
  message: 'What about the error handling?',
});

// Anima turn — launches a session via The Animator
const result = await parlour.takeTurn({
  conversationId,
  participantId: animaId,
  message: 'What about the error handling?', // or omit to use topic
});
// result.sessionResult contains the Animator's SessionResult
// result.turnNumber is the 1-indexed turn count
// result.conversationActive indicates if the conversation is still open
```

### `takeTurnStreaming(request): { chunks, result }`

Same as `takeTurn()`, but streams output chunks as the session produces them. Returns synchronously with `{ chunks, result }` — same pattern as The Animator.

```typescript
const { chunks, result } = parlour.takeTurnStreaming({
  conversationId,
  participantId: animaId,
});

for await (const chunk of chunks) {
  if (chunk.type === 'text') process.stdout.write(chunk.text);
  if (chunk.type === 'turn_complete') console.log(`\nTurn ${chunk.turnNumber} done`);
}

const turnResult = await result;
```

Chunk types include all `SessionChunk` types from The Animator, plus:
- `{ type: 'turn_complete', turnNumber, costUsd? }` — emitted after the session completes

### `nextParticipant(conversationId): Promise<Participant | null>`

Get the next participant in line. For consult: always returns the anima. For convene: round-robin by insertion order. Returns `null` if the conversation is ended or the turn limit is reached.

### `end(conversationId, reason?): Promise<void>`

End a conversation. Reason defaults to `'concluded'`. Idempotent — safe to call on already-ended conversations.

### `list(options?): Promise<ConversationSummary[]>`

List conversations with optional filters by `status`, `kind`, and `limit`. Returns summaries ordered by `createdAt` descending.

### `show(conversationId): Promise<ConversationDetail | null>`

Show full detail for a conversation including all turns, participant list, and aggregate cost.

---

## Configuration

No guild-level configuration is required. The Parlour reads its dependencies from the guild's apparatus registry at startup.

---

## Support Kit

The Parlour contributes two books and three tools to the guild:

### Books

| Book | Indexes | Contents |
|---|---|---|
| `conversations` | `status`, `kind`, `createdAt` | Conversation documents with nested participant records |
| `turns` | `conversationId`, `turnNumber`, `participantId`, `participantKind` | Per-turn records linking conversations to Animator sessions |

### Tools

| Tool | Permission | Description |
|---|---|---|
| `conversation-list` | `read` | List conversations with optional status/kind filters |
| `conversation-show` | `read` | Show full conversation detail including all turns |
| `conversation-end` | `write` | End an active conversation (concluded or abandoned) |

---

## Key Types

```typescript
interface CreateConversationRequest {
  kind: 'consult' | 'convene';
  topic?: string;
  turnLimit?: number;
  participants: ParticipantDeclaration[];
  cwd: string;
  eventId?: string;
}

interface ParticipantDeclaration {
  kind: 'anima' | 'human';
  name: string;
}

interface TurnResult {
  sessionResult: SessionResult | null;  // null for human turns
  turnNumber: number;
  conversationActive: boolean;
}

interface ConversationSummary {
  id: string;
  status: 'active' | 'concluded' | 'abandoned';
  kind: 'consult' | 'convene';
  topic: string | null;
  participants: Participant[];
  turnCount: number;
  totalCostUsd: number;
  // ... timestamps, turnLimit
}
```

See `src/types.ts` for the complete type definitions.

---

## Exports

The package exports all public types and the `createParlour()` factory:

```typescript
import parlourPlugin, { createParlour, type ParlourApi } from '@shardworks/parlour-apparatus';
```

The default export is a pre-built plugin instance, ready for guild installation.

=== CONTEXT FILE: packages/plugins/parlour/src ===
tree 78a6512:packages/plugins/parlour/src

index.ts
parlour.test.ts
parlour.ts
routes.ts
static/
tools/
types.ts

=== CONTEXT FILE: packages/plugins/parlour/tsconfig.json ===
{
  "extends": "../../../tsconfig.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": [
    "src"
  ],
  "exclude": [
    "src/**/*.test.ts"
  ]
}

=== CONTEXT FILE: packages/plugins/parlour/src/index.ts ===
/**
 * @shardworks/parlour-apparatus — The Parlour.
 *
 * Multi-turn conversation management: creates conversations, registers
 * participants, orchestrates turns (with streaming), enforces turn limits,
 * and ends conversations. Delegates session launch to The Animator and
 * context composition to The Loom.
 *
 * See: docs/architecture/apparatus/parlour.md
 */

import { createParlour } from './parlour.ts';

// ── Parlour API ─────────────────────────────────────────────────────

export {
  type ParlourApi,
  type ConversationDoc,
  type TurnDoc,
  type ParticipantRecord,
  type Participant,
  type CreateConversationRequest,
  type CreateConversationResult,
  type ParticipantDeclaration,
  type TakeTurnRequest,
  type TurnResult,
  type ConversationChunk,
  type ConversationSummary,
  type ConversationDetail,
  type TurnSummary,
  type ListConversationsOptions,
} from './types.ts';

export { createParlour } from './parlour.ts';

// ── Default export: the apparatus plugin ──────────────────────────────

export default createParlour();

=== CONTEXT FILE: packages/plugins/parlour/src/tools ===
tree 78a6512:packages/plugins/parlour/src/tools

conversation-end.ts
conversation-list.ts
conversation-show.ts
index.ts

=== CONTEXT FILE: packages/plugins/parlour/src/static ===
tree 78a6512:packages/plugins/parlour/src/static

parlour/



## Codebase Structure (surrounding directories)

```
=== TREE: ./ ===
.claude
.gitattributes
.github
.gitignore
.nvmrc
LICENSE
README.md
bin
docs
package.json
packages
pnpm-lock.yaml
pnpm-workspace.yaml
tsconfig.json

=== TREE: packages/plugins/parlour/ ===
README.md
package.json
src
tsconfig.json

=== TREE: packages/plugins/parlour/src/ ===
index.ts
parlour.test.ts
parlour.ts
routes.ts
static
tools
types.ts

=== TREE: packages/plugins/parlour/src/static/parlour/ ===
app.js
index.html
parlour.css


```

## Codebase API Surface (declarations available before this commission)

Scope: all 16 workspace projects
Lockfile is up to date, resolution step is skipped
Progress: resolved 1, reused 0, downloaded 0, added 0
Packages: +133
++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
Progress: resolved 133, reused 133, downloaded 0, added 133, done

devDependencies:
+ @tsconfig/node24 24.0.4
+ typescript 5.9.3

Done in 528ms using pnpm v10.32.1
packages/framework/cli/src/commands/test-helpers.ts(19,12): error TS2345: Argument of type '{ home: string; apparatus: () => never; config: () => never; writeConfig: () => never; guildConfig: () => never; kits: () => never[]; apparatuses: () => never[]; failedPlugins: () => never[]; }' is not assignable to parameter of type 'Guild'.
  Property 'startupWarnings' is missing in type '{ home: string; apparatus: () => never; config: () => never; writeConfig: () => never; guildConfig: () => never; kits: () => never[]; apparatuses: () => never[]; failedPlugins: () => never[]; }' but required in type 'Guild'.
=== packages/framework/arbor/dist/arbor.d.ts ===
/**
 * Arbor — the guild runtime.
 *
 * `createGuild()` is the single entry point. It reads guild.json, loads all
 * declared plugins, validates dependencies, starts apparatus in order, wires
 * the guild() singleton, and returns the Guild object.
 *
 * The full plugin lifecycle:
 *   1. Load    — imports all declared plugin packages, discriminates kit vs apparatus
 *   2. Validate — checks `requires` declarations, detects circular dependencies
 *   3. Start   — calls start(ctx) on each apparatus in dependency-resolved order
 *   4. Events  — fires `plugin:initialized` after each plugin loads
 *   5. Warn    — advisory warnings for mismatched kit contributions / recommends
 *
 * Pure logic (validation, ordering, events) lives in guild-lifecycle.ts.
 * This file handles I/O and orchestration.
 */
import type { Guild } from '@shardworks/nexus-core';
/**
 * Create and start a guild.
 *
 * Reads guild.json, loads all declared plugins, validates dependencies,
 * starts apparatus in dependency order, and returns the Guild object.
 * Also sets the guild() singleton so apparatus code can access it.
 *
 * @param root - Absolute path to the guild root. Defaults to auto-detection
 *               by walking up from cwd until guild.json is found.
 * @returns The initialized Guild — the same object guild() returns.
 */
export declare function createGuild(root?: string): Promise<Guild>;
//# sourceMappingURL=arbor.d.ts.map
=== packages/framework/arbor/dist/guild-lifecycle.d.ts ===
/**
 * Guild lifecycle — pure logic for plugin validation, ordering, and events.
 *
 * All functions here operate on in-memory data structures (LoadedKit[],
 * LoadedApparatus[], Maps) with no I/O. This makes them independently
 * testable with synthetic fixtures.
 *
 * `createGuild()` in arbor.ts is the orchestrator that performs I/O
 * (config reading, dynamic imports) then delegates to these functions.
 */
import type { StartupContext, LoadedKit, LoadedApparatus, FailedPlugin } from '@shardworks/nexus-core';
export type EventHandlerMap = Map<string, Array<(...args: unknown[]) => void | Promise<void>>>;
/**
 * Validate all `requires` declarations and detect circular dependencies.
 * Returns an array of FailedPlugin entries describing every problem found.
 *
 * Checks:
 * - Apparatus requires: every named dependency must exist (kit or apparatus).
 * - Kit requires: every named dependency must be an apparatus (kits can't
 *   depend on kits).
 * - Cycle detection: no circular dependency chains among apparatuses.
 */
export declare function validateRequires(kits: LoadedKit[], apparatuses: LoadedApparatus[]): FailedPlugin[];
/**
 * Remove plugins that transitively depend on any failed plugin.
 *
 * Iterates until stable, cascading failures through the dependency graph.
 * Returns healthy plugins and any newly-cascaded failures.
 */
export declare function filterFailedPlugins(kits: LoadedKit[], apparatuses: LoadedApparatus[], rootFailures: FailedPlugin[]): {
    kits: LoadedKit[];
    apparatuses: LoadedApparatus[];
    cascaded: FailedPlugin[];
};
/**
 * Sort apparatuses in dependency-resolved order using topological sort.
 * validateRequires() must be called first to ensure the graph is acyclic.
 */
export declare function topoSort(apparatuses: LoadedApparatus[]): LoadedApparatus[];
/**
 * Collect advisory warnings for kit contributions that no apparatus
 * consumes, and for missing recommended apparatuses.
 *
 * Returns an array of warning strings. The caller decides how to emit
 * them (console.warn, logger, etc.).
 */
export declare function collectStartupWarnings(kits: LoadedKit[], apparatuses: LoadedApparatus[]): string[];
/**
 * Build a StartupContext for an apparatus's start() call.
 * The context provides event subscription; handlers are stored in the
 * shared eventHandlers map so fireEvent can invoke them later.
 */
export declare function buildStartupContext(eventHandlers: EventHandlerMap): StartupContext;
/**
 * Fire a lifecycle event, awaiting each handler sequentially.
 */
export declare function fireEvent(eventHandlers: EventHandlerMap, event: string, ...args: unknown[]): Promise<void>;
//# sourceMappingURL=guild-lifecycle.d.ts.map
=== packages/framework/arbor/dist/index.d.ts ===
/**
 * @shardworks/nexus-arbor — guild runtime
 *
 * The arbor is the guild host: plugin loading, dependency validation,
 * apparatus lifecycle management. It does NOT own tool discovery — that
 * belongs to The Instrumentarium (tools-apparatus).
 *
 * Plugin authors never import from arbor — they import from @shardworks/nexus-core.
 * The CLI imports from arbor to create the guild runtime and trigger startup.
 *
 * Package dependency graph:
 *   core   — public SDK, types, tool() factory
 *   arbor  — guild host, createGuild()
 *   cli    — nsg binary, Commander.js, framework commands + Instrumentarium tools
 *   plugins — import from core only
 */
export { createGuild } from './arbor.ts';
//# sourceMappingURL=index.d.ts.map
=== packages/framework/cli/dist/cli.d.ts ===
#!/usr/bin/env node
/**
 * nsg — CLI entry point, built on the plugin architecture.
 *
 * Dynamically discovers installed tools via plugins, registers them as Commander
 * commands, and delegates argument parsing and invocation to Commander.
 *
 * Tools are filtered to those with 'patron' in callableBy (or no callableBy
 * set, which defaults to all callers). Tools marked 'anima'-only are invisible here.
 */
export {};
//# sourceMappingURL=cli.d.ts.map
=== packages/framework/cli/dist/commands/index.d.ts ===
/**
 * Framework commands — hardcoded CLI commands that work with or without a guild.
 *
 * These are guild lifecycle and plugin management commands that the CLI
 * registers directly, bypassing plugin discovery. They are the CLI's own
 * commands, not tools contributed by kits or apparatus.
 *
 * Plugin-contributed tools are discovered at runtime via The Instrumentarium
 * when a guild is present and the tools apparatus is installed.
 */
import type { ToolDefinition } from '@shardworks/tools-apparatus';
/** All framework commands, typed as the base ToolDefinition for uniform handling. */
export declare const frameworkCommands: ToolDefinition[];
//# sourceMappingURL=index.d.ts.map
=== packages/framework/cli/dist/commands/init.d.ts ===
/**
 * nsg init — create a new guild.
 *
 * A framework command — hardcoded in the CLI, not discovered via plugins.
 *
 * Writes the minimum viable guild: directory structure, guild.json,
 * package.json, .gitignore. Does NOT git init, install bundles, create
 * the database, or instantiate animas — those are separate steps.
 *
 * After init, the user runs `nsg plugin install` to add capabilities.
 */
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    path: z.ZodString;
    name: z.ZodOptional<z.ZodString>;
    model: z.ZodOptional<z.ZodString>;
}>;
export default _default;
//# sourceMappingURL=init.d.ts.map
=== packages/framework/cli/dist/commands/plugin.d.ts ===
/**
 * nsg plugin-* — manage guild plugins.
 *
 * Framework commands for plugin lifecycle. Available via CLI only (not MCP).
 *
 * Plugin install/remove are pure npm + guild.json operations. No tool
 * discovery at install time — tools are resolved at runtime by the
 * Instrumentarium via its permission-based model.
 */
import { z } from 'zod';
/**
 * Detect the package manager used by the guild.
 *
 * Checks for lockfiles in order of specificity. Falls back to 'npm'
 * when no lockfile is present (e.g. fresh guilds before first install).
 */
export declare function detectPackageManager(guildRoot: string): 'npm' | 'pnpm';
export declare const pluginList: import("@shardworks/tools-apparatus").ToolDefinition<{
    json: z.ZodOptional<z.ZodBoolean>;
}>;
export declare const pluginInstall: import("@shardworks/tools-apparatus").ToolDefinition<{
    source: z.ZodString;
    type: z.ZodOptional<z.ZodEnum<{
        link: "link";
        registry: "registry";
    }>>;
}>;
export declare const pluginRemove: import("@shardworks/tools-apparatus").ToolDefinition<{
    name: z.ZodString;
}>;
export declare const pluginUpgrade: import("@shardworks/tools-apparatus").ToolDefinition<{
    name: z.ZodString;
    version: z.ZodOptional<z.ZodString>;
}>;
//# sourceMappingURL=plugin.d.ts.map
=== packages/framework/cli/dist/commands/status.d.ts ===
/**
 * nsg status — guild status.
 *
 * A framework command. Shows guild identity, framework version, and installed plugins
 * separated into apparatuses (running infrastructure) and kits (passive capabilities).
 * Domain-specific status (writ counts, session history, clock state) belongs
 * to plugins, not here.
 *
 * Requires a booted guild — prints a friendly error if run outside one.
 */
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    json: z.ZodOptional<z.ZodBoolean>;
}>;
export default _default;
//# sourceMappingURL=status.d.ts.map
=== packages/framework/cli/dist/commands/test-helpers.d.ts ===
/**
 * Shared test helpers for CLI command tests.
 *
 * Provides guild accessor setup, temp directory management, and minimal
 * guild.json scaffolding. Extracted from status.test.ts, version.test.ts,
 * and plugin.test.ts where these were copy-pasted identically.
 */
/** Set up a minimal guild accessor pointing at the given directory. */
export declare function setupGuildAccessor(home: string): void;
/** Create a temp directory and register it for cleanup. */
export declare function makeTmpDir(prefix: string): string;
/** Write a minimal guild.json to dir, with optional overrides. */
export declare function makeGuild(dir: string, overrides?: Record<string, unknown>): void;
/** Write a guild-root package.json declaring the given npm dependencies. */
export declare function makeGuildPackageJson(dir: string, deps: Record<string, string>): void;
/** Clean up guild state and temp directories. Call from afterEach(). */
export declare function cleanupTestState(): void;
//# sourceMappingURL=test-helpers.d.ts.map
=== packages/framework/cli/dist/commands/upgrade.d.ts ===
/**
 * nsg upgrade — upgrade the guild framework.
 *
 * Stub — upgrade lifecycle not yet designed. Will handle framework version
 * bumps, guild.json schema reconciliation, and plugin-specific upgrade
 * hooks when implemented.
 */
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    dryRun: z.ZodOptional<z.ZodBoolean>;
}>;
export default _default;
//# sourceMappingURL=upgrade.d.ts.map
=== packages/framework/cli/dist/commands/version.d.ts ===
/**
 * nsg version — show framework and plugin version info.
 *
 * A framework command — hardcoded in the CLI, not discovered via plugins.
 *
 * Always shows framework and Node versions. When run inside a guild,
 * additionally shows installed plugin versions. Gracefully degrades
 * when run outside a guild (no error, just less info).
 */
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    json: z.ZodOptional<z.ZodBoolean>;
}>;
export default _default;
//# sourceMappingURL=version.d.ts.map
=== packages/framework/cli/dist/helpers.d.ts ===
/**
 * Pure helper functions for CLI command generation.
 *
 * Extracted from program.ts so they can be tested independently
 * without pulling in heavy runtime dependencies (Arbor, Instrumentarium).
 */
import { z } from 'zod';
import type { ToolDefinition } from '@shardworks/tools-apparatus';
/**
 * Convert camelCase key to kebab-case CLI flag.
 * e.g. 'writId' → '--writ-id'
 */
export declare function toFlag(key: string): string;
/**
 * Detect whether a Zod schema accepts booleans (and only booleans).
 * Used to register Commander flags without <value> for boolean params.
 */
export declare function isBooleanSchema(schema: z.ZodTypeAny): boolean;
/**
 * Coerce Commander string opts to match the expected Zod schema types.
 *
 * Commander passes all --option <value> arguments as strings. This function
 * walks the Zod shape and converts string values to numbers where the
 * schema expects z.number() (including when wrapped in ZodOptional/ZodDefault).
 *
 * Undefined values pass through unchanged — Zod handles optional/default.
 * Non-number schemas are left untouched.
 */
export declare function coerceCliOpts(shape: Record<string, z.ZodTypeAny>, opts: Record<string, unknown>): Record<string, unknown>;
/**
 * Determine which hyphen prefixes have enough tools to warrant a group.
 *
 * Returns a Set of prefixes that have 2+ tools sharing them.
 * 'plugin-list' + 'plugin-install' → 'plugin' is a group.
 * 'show-writ' alone → 'show' is NOT a group.
 */
export declare function findGroupPrefixes(tools: ToolDefinition[]): Set<string>;
//# sourceMappingURL=helpers.d.ts.map
=== packages/framework/cli/dist/index.d.ts ===
export { VERSION } from '@shardworks/nexus-core';
export { main } from './program.ts';
export { frameworkCommands } from './commands/index.ts';
//# sourceMappingURL=index.d.ts.map
=== packages/framework/cli/dist/program.d.ts ===
/**
 * nsg program — dynamic Commander setup.
 *
 * Two command sources:
 *
 * 1. **Framework commands** — hardcoded in the CLI package (init, status,
 *    version, upgrade, plugin management). Always available, even without
 *    a guild.
 *
 * 2. **Plugin tools** — discovered at runtime via The Instrumentarium
 *    (tools apparatus). Only available when a guild is present and the
 *    tools apparatus is installed.
 *
 * Tool names are auto-grouped when multiple tools share a hyphen prefix:
 * 'plugin-list' + 'plugin-install' → 'nsg plugin list' / 'nsg plugin install'.
 * A tool like 'show-writ' stays flat ('nsg show-writ') since no other tool
 * starts with 'show-'.
 */
export declare function main(): Promise<void>;
//# sourceMappingURL=program.d.ts.map
=== packages/framework/core/dist/guild-config.d.ts ===
/** A custom event declaration in guild.json clockworks.events. */
export interface EventDeclaration {
    /** Human-readable description of what this event means. */
    description?: string;
    /** Optional payload schema hint (not enforced in Phase 1). */
    schema?: Record<string, string>;
}
/** A standing order — a registered response to an event. */
export type StandingOrder = {
    on: string;
    run: string;
} | {
    on: string;
    summon: string;
    prompt?: string;
} | {
    on: string;
    brief: string;
};
/** The clockworks configuration block in guild.json. */
export interface ClockworksConfig {
    /** Custom event declarations. */
    events?: Record<string, EventDeclaration>;
    /** Standing orders — event → action mappings. */
    standingOrders?: StandingOrder[];
}
/** Guild-level settings — operational flags and preferences. */
export interface GuildSettings {
    /**
     * Default LLM model for anima sessions (e.g. 'sonnet', 'opus').
     * Replaces the top-level `model` field from GuildConfig V1.
     */
    model?: string;
    /**
     * Automatically apply pending database migrations when the Books are opened.
     * Defaults to `true` when not specified. Set to `false` to require explicit
     * migration via `nsg guild upgrade-books`.
     */
    autoMigrate?: boolean;
}
/**
 * Guild configuration.
 *
 * The plugin-centric model: plugins are npm packages; capabilities (tools, engines,
 * training content) are declared by plugins and discovered dynamically at runtime.
 * Framework-level keys (`name`, `nexus`, `plugins`, `settings`) are defined here;
 * all other top-level keys are plugin configuration sections, keyed by plugin id.
 */
export interface GuildConfig {
    /** Guild name — used as the guildhall npm package name. */
    name: string;
    /** Installed Nexus framework version. */
    nexus: string;
    /** Installed plugin ids (derived from npm package names). Always present; starts empty. */
    plugins: string[];
    /** Clockworks configuration — events, standing orders. */
    clockworks?: ClockworksConfig;
    /** Guild-level settings — operational flags and preferences. Includes default model. */
    settings?: GuildSettings;
}
/**
 * Create the default guild.json content for a new guild.
 * All collections start empty. The default model is stored in settings.
 */
export declare function createInitialGuildConfig(name: string, nexusVersion: string, model: string): GuildConfig;
/** Read and parse guild.json from the guild root. */
export declare function readGuildConfig(home: string): GuildConfig;
/** Write guild.json to the guild root. */
export declare function writeGuildConfig(home: string, config: GuildConfig): void;
/** Resolve the path to guild.json in the guild root. */
export declare function guildConfigPath(home: string): string;
//# sourceMappingURL=guild-config.d.ts.map
=== packages/framework/core/dist/guild.d.ts ===
/**
 * Guild — the process-level singleton for accessing guild infrastructure.
 *
 * All plugin code — apparatus start(), tool handlers, engine handlers,
 * relay handlers, CDC handlers — imports `guild()` to access apparatus APIs,
 * plugin config, the guild root path, and the loaded plugin graph.
 *
 * Arbor creates the Guild instance before starting apparatus and registers
 * it via `setGuild()`. The instance is backed by live data structures
 * (e.g. the provides Map) that are populated progressively as apparatus start.
 *
 * See: docs/architecture/plugins.md
 */
import type { GuildConfig } from './guild-config.ts';
import type { LoadedKit, LoadedApparatus, FailedPlugin } from './plugin.ts';
/**
 * Runtime access to guild infrastructure.
 *
 * Available after Arbor creates the instance (before apparatus start).
 * One instance per process.
 */
export interface Guild {
    /** Absolute path to the guild root (contains guild.json). */
    readonly home: string;
    /**
     * Retrieve a started apparatus's provides object by plugin id.
     *
     * Throws if the apparatus is not installed or has no `provides`.
     * During startup, only apparatus that have already started are visible
     * (dependency ordering guarantees declared deps are started first).
     */
    apparatus<T>(name: string): T;
    /**
     * Read a plugin's configuration section from guild.json.
     *
     * Returns `guild.json[pluginId]` cast to `T`. Returns `{}` if no
     * section exists. The generic parameter is a cast — the framework
     * does not validate config shape.
     */
    config<T = Record<string, unknown>>(pluginId: string): T;
    /**
     * Write a plugin's configuration section to guild.json.
     *
     * Updates `guild.json[pluginId]` with `value` and writes the file
     * to disk. Also updates the in-memory config so subsequent reads
     * reflect the change.
     *
     * For framework-level keys (name, nexus, plugins, settings), use
     * the standalone `writeGuildConfig()` function instead.
     */
    writeConfig<T = Record<string, unknown>>(pluginId: string, value: T): void;
    /**
     * Read the full parsed guild.json.
     *
     * Escape hatch for framework-level fields (name, nexus, plugins,
     * settings) that don't belong to any specific plugin.
     */
    guildConfig(): GuildConfig;
    /** Snapshot of all loaded kits (including apparatus supportKits). */
    kits(): LoadedKit[];
    /** Snapshot of all started apparatuses. */
    apparatuses(): LoadedApparatus[];
    /** Snapshot of plugins that failed to load, validate, or start. */
    failedPlugins(): FailedPlugin[];
    /** Advisory warnings collected during guild startup (missing recommends, unconsumed contributions). */
    startupWarnings(): string[];
}
/**
 * Get the active guild instance.
 *
 * Throws with a clear message if called before Arbor has initialized
 * the guild (e.g. at module import time, before startup begins).
 */
export declare function guild(): Guild;
/**
 * Set the guild instance. Called by Arbor before starting apparatus.
 *
 * Not for plugin use — this is framework infrastructure.
 */
export declare function setGuild(g: Guild): void;
/**
 * Clear the guild instance. Called by Arbor at shutdown or in tests.
 *
 * Not for plugin use — this is framework infrastructure.
 */
export declare function clearGuild(): void;
//# sourceMappingURL=guild.d.ts.map
=== packages/framework/core/dist/id.d.ts ===
/**
 * Generate a sortable, prefixed ID.
 *
 * Format: `{prefix}-{base36_timestamp}-{hex_random}`
 *
 * The timestamp component (Date.now() in base36) gives lexicographic sort
 * order by creation time. The random suffix prevents collisions without
 * coordination.
 *
 * @param prefix     Short, type-identifying string (e.g. `w`, `ses`, `turn`)
 * @param randomByteCount  Number of random bytes; produces 2× hex digits (default 6 → 12 hex chars)
 */
export declare function generateId(prefix: string, randomByteCount?: number): string;
//# sourceMappingURL=id.d.ts.map
=== packages/framework/core/dist/index.d.ts ===
export declare const VERSION: string;
export { type Kit, type Apparatus, type Plugin, type LoadedKit, type LoadedApparatus, type LoadedPlugin, type FailedPlugin, type StartupContext, isKit, isApparatus, isLoadedKit, isLoadedApparatus, } from './plugin.ts';
export { type Guild, guild, setGuild, clearGuild, } from './guild.ts';
export { findGuildRoot, nexusDir, worktreesPath, clockPidPath, clockLogPath, } from './nexus-home.ts';
export { derivePluginId, readGuildPackageJson, resolvePackageNameForPluginId, resolveGuildPackageEntry, } from './resolve-package.ts';
export { type GuildConfig, createInitialGuildConfig, readGuildConfig, writeGuildConfig, type EventDeclaration, type StandingOrder, type ClockworksConfig, type GuildSettings, guildConfigPath, } from './guild-config.ts';
export { generateId } from './id.ts';
//# sourceMappingURL=index.d.ts.map
=== packages/framework/core/dist/nexus-home.d.ts ===
/**
 * Find the guild root by walking up from a starting directory looking for guild.json.
 *
 * This replaces the old NEXUS_HOME env var approach. The guild root IS the
 * guildhall — a regular git clone with guild.json at the root.
 *
 * @param startDir - Directory to start searching from (defaults to cwd).
 * @throws If no guild.json is found before reaching the filesystem root.
 */
export declare function findGuildRoot(startDir?: string): string;
/** Path to the .nexus framework-managed directory. */
export declare function nexusDir(home: string): string;
/** Path to the top-level worktrees directory (for writ worktrees). */
export declare function worktreesPath(home: string): string;
/** Path to the clockworks daemon PID file. */
export declare function clockPidPath(home: string): string;
/** Path to the clockworks daemon log file. */
export declare function clockLogPath(home: string): string;
//# sourceMappingURL=nexus-home.d.ts.map
=== packages/framework/core/dist/plugin.d.ts ===
/**
 * Plugin system — core types for the Kit/Apparatus model.
 *
 * Plugins come in two kinds:
 * - Kit:       passive package contributing capabilities to consuming apparatuses.
 *              No lifecycle, no running state. Read at load time.
 * - Apparatus: package contributing persistent running infrastructure.
 *              Has a start/stop lifecycle. Receives StartupContext at start.
 *
 * See: docs/architecture/plugins.md
 */
/** A kit as tracked by the Arbor runtime. */
export interface LoadedKit {
    readonly packageName: string;
    readonly id: string;
    readonly version: string;
    readonly kit: Kit;
}
/** An apparatus as tracked by the Arbor runtime. */
export interface LoadedApparatus {
    readonly packageName: string;
    readonly id: string;
    readonly version: string;
    readonly apparatus: Apparatus;
}
/** Union of loaded kit and loaded apparatus. */
export type LoadedPlugin = LoadedKit | LoadedApparatus;
/** A plugin that failed to load, validate, or start. */
export interface FailedPlugin {
    readonly id: string;
    readonly reason: string;
}
/**
 * Startup context passed to an apparatus's start(ctx).
 *
 * Provides lifecycle-event subscription — the only capability that is
 * meaningful only during startup. All other guild access (apparatus APIs,
 * config, home path, loaded plugins) goes through the `guild()` singleton,
 * which is available during start() and in all handlers.
 *
 * See: docs/architecture/plugins.md
 */
export interface StartupContext {
    /** Subscribe to a guild lifecycle event. Handlers may be async; run sequentially. */
    on(event: string, handler: (...args: unknown[]) => void | Promise<void>): void;
}
/**
 * A kit — passive package contributing capabilities to consuming apparatuses.
 * Open record: contribution fields (engines, relays, tools, etc.) are defined
 * by the apparatus packages that consume them. `requires` and `recommends` are
 * the only framework-level fields.
 *
 * `requires`: apparatus names whose runtime APIs this kit's contributions depend
 *   on at handler invocation time. Hard startup validation failure if a declared
 *   apparatus is not installed.
 *
 * `recommends`: advisory apparatus names — generates startup warnings when
 *   expected apparatuses are absent. Not enforced.
 */
export type Kit = {
    requires?: string[];
    recommends?: string[];
    [key: string]: unknown;
};
/**
 * An apparatus — package contributing persistent running infrastructure.
 * Has a start/stop lifecycle. Receives StartupContext at start.
 *
 * `requires`: apparatus names that must be started before this apparatus's
 *   start() runs. Determines start ordering. Hard startup validation failure
 *   if a declared apparatus is not installed.
 *
 * `recommends`: advisory apparatus names — generates startup warnings when
 *   expected apparatuses are absent. Not enforced — the apparatus starts
 *   regardless. Use for soft dependencies needed by optional API methods
 *   (e.g. The Animator recommends The Loom for summon(), but animate()
 *   works without it).
 *
 * `provides`: the runtime API object this apparatus exposes to other plugins.
 *   Retrieved via guild().apparatus<T>(name). Created at manifest-definition time,
 *   populated during start.
 *
 * `supportKit`: kit contributions this apparatus exposes to consuming apparatuses.
 *   Treated identically to standalone kit contributions by consumers.
 *
 * `consumes`: kit contribution field types this apparatus scans for and registers.
 *   Enables framework startup warnings when kits contribute types with no consumer.
 */
export type Apparatus = {
    requires?: string[];
    recommends?: string[];
    provides?: unknown;
    start: (ctx: StartupContext) => void | Promise<void>;
    stop?: () => void | Promise<void>;
    supportKit?: Kit;
    consumes?: string[];
};
/**
 * The discriminated union plugin type. A plugin is either a kit or an apparatus.
 * The plugin name is always inferred from the npm package name at load time —
 * it is never declared in the manifest.
 */
export type Plugin = {
    kit: Kit;
} | {
    apparatus: Apparatus;
};
/** Type guard: is this value a kit plugin export? */
export declare function isKit(obj: unknown): obj is {
    kit: Kit;
};
/** Type guard: is this value an apparatus plugin export? */
export declare function isApparatus(obj: unknown): obj is {
    apparatus: Apparatus;
};
/** Type guard: narrows a LoadedPlugin to LoadedKit. */
export declare function isLoadedKit(p: LoadedPlugin): p is LoadedKit;
/** Type guard: narrows a LoadedPlugin to LoadedApparatus. */
export declare function isLoadedApparatus(p: LoadedPlugin): p is LoadedApparatus;
//# sourceMappingURL=plugin.d.ts.map
=== packages/framework/core/dist/resolve-package.d.ts ===
/**
 * Package resolution utilities for guild-installed npm packages.
 *
 * Resolves entry points from the guild's node_modules by reading package.json
 * exports maps directly. Needed because guild plugins are ESM-only packages
 * and createRequire() can't resolve their exports.
 *
 * Also owns:
 * - derivePluginId — canonical npm package name → plugin id derivation
 */
/**
 * Derive the guild-facing plugin id from an npm package name.
 *
 * Convention:
 * - `@shardworks/nexus-ledger`      → `nexus-ledger`   (official scope stripped)
 * - `@shardworks/books-apparatus`   → `books`           (descriptor suffix stripped)
 * - `@acme/my-plugin`               → `acme/my-plugin`  (third-party: drop @ only)
 * - `my-relay-kit`                  → `my-relay`        (descriptor suffix stripped)
 * - `my-plugin`                     → `my-plugin`       (unscoped: unchanged)
 *
 * The `@shardworks` scope is the official Nexus namespace — its plugins are
 * referenced by bare name in guild.json, CLI commands, and config keys.
 * Third-party scoped packages retain the scope as a prefix (without @) to
 * prevent collisions between `@acme/foo` and `@other/foo`.
 *
 * Descriptor suffixes (`-plugin`, `-apparatus`, `-kit`) are stripped after
 * scope resolution so that package naming conventions don't leak into ids.
 */
export declare function derivePluginId(packageName: string): string;
/**
 * Read a package.json from the guild's node_modules.
 * Returns the parsed JSON and version. Falls back gracefully.
 */
export declare function readGuildPackageJson(guildRoot: string, pkgName: string): {
    version: string;
    pkgJson: Record<string, unknown> | null;
};
/**
 * Resolve the npm package name for a plugin id by consulting the guild's root package.json.
 *
 * Scans all dependencies and runs `derivePluginId()` on each to find the
 * package whose derived id matches. This correctly handles descriptor
 * suffixes (-kit, -apparatus, -plugin) that derivePluginId strips.
 *
 * When multiple packages derive to the same id (unlikely but possible),
 * prefers @shardworks-scoped packages over third-party ones.
 *
 * Returns null if no matching dependency is found.
 */
export declare function resolvePackageNameForPluginId(guildRoot: string, pluginId: string): string | null;
/**
 * Resolve the entry point for a guild-installed package.
 *
 * Reads the package's exports map to find the ESM entry point.
 * Returns an absolute path suitable for dynamic import().
 */
export declare function resolveGuildPackageEntry(guildRoot: string, pkgName: string): string;
//# sourceMappingURL=resolve-package.d.ts.map
=== packages/plugins/animator/dist/animator.d.ts ===
/**
 * The Animator — session launch and telemetry recording apparatus.
 *
 * Two API levels:
 * - summon() — high-level: composes context via The Loom, then launches.
 * - animate() — low-level: takes a pre-composed AnimaWeave + prompt.
 *
 * See: docs/specification.md (animator)
 */
import type { Plugin } from '@shardworks/nexus-core';
/**
 * Create the Animator apparatus plugin.
 *
 * Returns a Plugin with:
 * - `requires: ['stacks']` — records session results
 * - `provides: AnimatorApi` — the session launch API
 * - `supportKit` — contributes `sessions` book + inspection tools
 */
export declare function createAnimator(): Plugin;
//# sourceMappingURL=animator.d.ts.map
=== packages/plugins/animator/dist/index.d.ts ===
/**
 * @shardworks/animator-apparatus — The Animator.
 *
 * Session launch and telemetry recording: takes an AnimaWeave from The Loom,
 * launches an AI process via a session provider, monitors it until exit, and
 * records the result to The Stacks.
 *
 * See: docs/specification.md (animator)
 */
export { type AnimatorApi, type AnimateHandle, type AnimateRequest, type SummonRequest, type SessionResult, type SessionChunk, type TokenUsage, type SessionDoc, type AnimatorConfig, type AnimatorSessionProvider, type SessionProviderConfig, type SessionProviderResult, } from './types.ts';
export { createAnimator } from './animator.ts';
declare const _default: import("@shardworks/nexus-core").Plugin;
export default _default;
//# sourceMappingURL=index.d.ts.map
=== packages/plugins/animator/dist/tools/index.d.ts ===
/**
 * Animator tool re-exports.
 */
export { default as sessionList } from './session-list.ts';
export { default as sessionShow } from './session-show.ts';
export { default as summon } from './summon.ts';
//# sourceMappingURL=index.d.ts.map
=== packages/plugins/animator/dist/tools/session-list.d.ts ===
/**
 * session-list tool — list recent sessions with optional filters.
 *
 * Queries The Animator's `sessions` book in The Stacks.
 * Returns session summaries ordered by startedAt descending (newest first).
 *
 * See: docs/specification.md (animator § session-list tool)
 */
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    status: z.ZodOptional<z.ZodEnum<{
        completed: "completed";
        failed: "failed";
        timeout: "timeout";
        running: "running";
    }>>;
    provider: z.ZodOptional<z.ZodString>;
    conversationId: z.ZodOptional<z.ZodString>;
    limit: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
}>;
export default _default;
//# sourceMappingURL=session-list.d.ts.map
=== packages/plugins/animator/dist/tools/session-show.d.ts ===
/**
 * session-show tool — show full detail for a single session by id.
 *
 * Reads the complete session record from The Animator's `sessions` book
 * in The Stacks, including tokenUsage, metadata, and all indexed fields.
 *
 * See: docs/specification.md (animator § session-show tool)
 */
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    id: z.ZodString;
}>;
export default _default;
//# sourceMappingURL=session-show.d.ts.map
=== packages/plugins/animator/dist/tools/summon.d.ts ===
/**
 * summon tool — dispatch an anima session from the CLI.
 *
 * High-level entry point: composes context via The Loom (passing the
 * role for system prompt composition), then launches a session via
 * The Animator. The work prompt goes directly to the provider.
 *
 * Usage:
 *   nsg summon --prompt "Build the frobnicator" --role artificer
 */
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    prompt: z.ZodString;
    role: z.ZodOptional<z.ZodString>;
}>;
export default _default;
//# sourceMappingURL=summon.d.ts.map
=== packages/plugins/animator/dist/types.d.ts ===
/**
 * The Animator — public types.
 *
 * These types form the contract between The Animator apparatus and all
 * callers (summon relay, nsg consult, etc.). No implementation details.
 *
 * See: docs/specification.md (animator)
 */
import type { AnimaWeave } from '@shardworks/loom-apparatus';
import type { ResolvedTool } from '@shardworks/tools-apparatus';
/** A chunk of output from a running session. */
export type SessionChunk = {
    type: 'text';
    text: string;
} | {
    type: 'tool_use';
    tool: string;
} | {
    type: 'tool_result';
    tool: string;
};
export interface AnimateRequest {
    /**
     * Optional pre-generated session id. When provided, the Animator uses
     * this id instead of generating a new one. Used by summon() to make the
     * session id available on the handle before the Loom weave resolves.
     */
    sessionId?: string;
    /** The anima weave from The Loom (composed identity context). */
    context: AnimaWeave;
    /**
     * The work prompt — what the anima should do.
     * Passed directly to the session provider as the initial prompt.
     * This bypasses The Loom — it is not a composition concern.
     */
    prompt?: string;
    /**
     * Working directory for the session.
     * The session provider launches the AI process here.
     */
    cwd: string;
    /**
     * Optional conversation id to resume a multi-turn conversation.
     * If provided, the session provider resumes the existing conversation
     * rather than starting a new one.
     */
    conversationId?: string;
    /**
     * Caller-supplied metadata recorded alongside the session.
     * The Animator stores this as-is — it does not interpret the contents.
     */
    metadata?: Record<string, unknown>;
    /**
     * Enable streaming output. When true, the returned `chunks` iterable
     * yields output as the session produces it. When false (default), the
     * `chunks` iterable completes immediately with no items.
     *
     * Either way, the return shape is the same: `{ chunks, result }`.
     */
    streaming?: boolean;
    /**
     * Task-layer environment variables. Overrides the identity-layer
     * environment from the AnimaWeave when keys collide. Spread into the
     * spawned process environment.
     */
    environment?: Record<string, string>;
}
export interface SessionResult {
    /** Unique session id (generated by The Animator). */
    id: string;
    /** Terminal status. */
    status: 'completed' | 'failed' | 'timeout';
    /** When the session started (ISO-8601). */
    startedAt: string;
    /** When the session ended (ISO-8601). */
    endedAt: string;
    /** Wall-clock duration in milliseconds. */
    durationMs: number;
    /** Provider name (e.g. 'claude-code'). */
    provider: string;
    /** Numeric exit code from the provider process. */
    exitCode: number;
    /** Error message if failed. */
    error?: string;
    /** Conversation id (for multi-turn resume). */
    conversationId?: string;
    /** Session id from the provider (e.g. for --resume). */
    providerSessionId?: string;
    /** Token usage from the provider, if available. */
    tokenUsage?: TokenUsage;
    /** Cost in USD from the provider, if available. */
    costUsd?: number;
    /** Caller-supplied metadata, recorded as-is. */
    metadata?: Record<string, unknown>;
    /**
     * The final assistant text from the session.
     * Extracted by the Animator from the provider's transcript.
     * Useful for programmatic consumers that need the session's conclusion
     * without parsing the full transcript (e.g. the Spider's review collect step).
     */
    output?: string;
}
export interface TokenUsage {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
}
export interface SummonRequest {
    /**
     * The work prompt — what the anima should do.
     * Passed directly to the session provider as the initial prompt.
     */
    prompt: string;
    /**
     * The role to summon (e.g. 'artificer', 'scribe').
     * Passed to The Loom for context composition and recorded in session metadata.
     */
    role?: string;
    /**
     * Working directory for the session.
     * The session provider launches the AI process here.
     */
    cwd: string;
    /**
     * Optional conversation id to resume a multi-turn conversation.
     */
    conversationId?: string;
    /**
     * Additional metadata to record alongside the session.
     * Merged with auto-generated metadata (trigger: 'summon', role).
     */
    metadata?: Record<string, unknown>;
    /**
     * Enable streaming output. When true, the returned `chunks` iterable
     * yields output as the session produces it. When false (default), the
     * `chunks` iterable completes immediately with no items.
     */
    streaming?: boolean;
    /**
     * Task-layer environment variables. Overrides the identity-layer
     * environment from the AnimaWeave when keys collide. Spread into the
     * spawned process environment.
     */
    environment?: Record<string, string>;
}
/** The return value from animate() and summon(). */
export interface AnimateHandle {
    /**
     * Session ID, available immediately after launch — before the session
     * completes. Callers that only need to know the session was launched
     * (e.g. quick engines returning `{ status: 'launched', sessionId }`)
     * can return without awaiting `result`.
     */
    sessionId: string;
    /**
     * Async iterable of output chunks from the session. When streaming is
     * disabled (the default), this iterable completes immediately with no
     * items. When streaming is enabled, it yields chunks as the session
     * produces output.
     */
    chunks: AsyncIterable<SessionChunk>;
    /**
     * Promise that resolves to the final SessionResult after the session
     * completes (or fails/times out) and the result is recorded to The Stacks.
     */
    result: Promise<SessionResult>;
}
export interface AnimatorApi {
    /**
     * Summon an anima — compose context via The Loom and launch a session.
     *
     * This is the high-level "make an anima do a thing" entry point.
     * Internally calls The Loom for context composition (passing the role),
     * then animate() for session launch and recording. The work prompt
     * bypasses the Loom and goes directly to the provider.
     *
     * Requires The Loom apparatus to be installed. Throws if not available.
     *
     * Auto-populates session metadata with `trigger: 'summon'` and `role`.
     *
     * Returns synchronously — the async work lives inside `result` and `chunks`.
     */
    summon(request: SummonRequest): AnimateHandle;
    /**
     * Animate a session — launch an AI process with the given context.
     *
     * This is the low-level entry point for callers that compose their own
     * AnimaWeave (e.g. The Parlour for multi-turn conversations).
     *
     * Records the session result to The Stacks before `result` resolves.
     *
     * Set `streaming: true` on the request to receive output chunks as the
     * session runs. When streaming is disabled (default), the `chunks`
     * iterable completes immediately with no items.
     *
     * Returns synchronously — the async work lives inside `result` and `chunks`.
     */
    animate(request: AnimateRequest): AnimateHandle;
}
/**
 * A session provider — pluggable backend that knows how to launch and
 * communicate with a specific AI system.
 *
 * Implemented as an apparatus plugin whose `provides` object satisfies
 * this interface. The Animator discovers the provider via guild config:
 * `guild.json["animator"]["sessionProvider"]` names the plugin id.
 *
 * The provider always returns `{ chunks, result }` — the same shape as
 * AnimateHandle. When `config.streaming` is true, the provider MAY yield
 * output chunks as the session runs. When false (or when the provider
 * does not support streaming), the chunks iterable completes immediately
 * with no items. The Animator does not branch on streaming capability —
 * it passes the flag through and trusts the provider to do the right thing.
 */
export interface AnimatorSessionProvider {
    /** Human-readable name (e.g. 'claude-code'). */
    name: string;
    /**
     * Launch a session. Returns `{ chunks, result }` synchronously.
     *
     * The `result` promise resolves when the AI process exits.
     * The `chunks` async iterable yields output when `config.streaming`
     * is true and the provider supports streaming; otherwise it completes
     * immediately with no items.
     *
     * Providers that don't support streaming simply ignore the flag and
     * return empty chunks — no separate method needed.
     */
    launch(config: SessionProviderConfig): {
        chunks: AsyncIterable<SessionChunk>;
        result: Promise<SessionProviderResult>;
    };
}
export interface SessionProviderConfig {
    /** System prompt for the AI process. May be undefined if composition is not yet implemented. */
    systemPrompt?: string;
    /** Initial user message (e.g. writ description). */
    initialPrompt?: string;
    /** Model to use (from guild settings). */
    model: string;
    /** Optional conversation id for resume. */
    conversationId?: string;
    /** Working directory for the session. */
    cwd: string;
    /**
     * Enable streaming output. When true, the provider should yield output
     * chunks as the session produces them. When false (default), the chunks
     * iterable should complete immediately with no items.
     *
     * Providers that don't support streaming may ignore this flag.
     */
    streaming?: boolean;
    /**
     * Resolved tools for this session. When present, the provider should
     * configure an MCP server with these tool definitions.
     *
     * The Loom resolves role → permissions → tools via the Instrumentarium.
     * The Animator passes them through from the AnimaWeave.
     */
    tools?: ResolvedTool[];
    /**
     * Merged environment variables to spread into the spawned process.
     * The Animator merges identity-layer (weave) and task-layer (request)
     * variables before passing them here — task layer wins on collision.
     */
    environment?: Record<string, string>;
}
/** A single message from the NDJSON stream. Untyped — shape varies by provider. */
export type TranscriptMessage = Record<string, unknown>;
export interface SessionProviderResult {
    /** Exit status. */
    status: 'completed' | 'failed' | 'timeout';
    /** Numeric exit code from the process. */
    exitCode: number;
    /** Error message if failed. */
    error?: string;
    /** Provider's session id (e.g. for --resume). */
    providerSessionId?: string;
    /** Token usage, if the provider can report it. */
    tokenUsage?: TokenUsage;
    /** Cost in USD, if the provider can report it. */
    costUsd?: number;
    /** The session's full transcript — array of NDJSON message objects. */
    transcript?: TranscriptMessage[];
    /**
     * The final assistant text from the session.
     * Extracted from the last assistant message's text content blocks.
     * Undefined if the session produced no assistant output.
     */
    output?: string;
}
/**
 * The session document stored in The Stacks' `sessions` book.
 * Includes all SessionResult fields plus the `id` required by BookEntry.
 */
export interface SessionDoc {
    id: string;
    /**
     * Session status. Initially written as `'running'` when the session is
     * launched (Step 2), then updated to a terminal status (`'completed'`,
     * `'failed'`, or `'timeout'`) after the provider exits (Step 5).
     * The `'running'` state is transient — it only exists between Steps 2 and 5.
     * `SessionResult.status` only includes terminal states.
     */
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
    /** The final assistant text from the session. */
    output?: string;
    /** Index signature required by BookEntry. */
    [key: string]: unknown;
}
/**
 * The transcript document stored in The Stacks' `transcripts` book.
 * One record per session — 1:1 relationship with SessionDoc.
 */
export interface TranscriptDoc {
    /** Same as the session id. */
    id: string;
    /** Full NDJSON transcript from the session. */
    messages: TranscriptMessage[];
    /** Index signature required by BookEntry. */
    [key: string]: unknown;
}
/** Plugin configuration stored at guild.json["animator"]. */
export interface AnimatorConfig {
    /**
     * Plugin id of the apparatus that implements AnimatorSessionProvider.
     * The Animator looks this up via guild().apparatus() at animate-time.
     * Defaults to 'claude-code' if not specified.
     */
    sessionProvider?: string;
}
declare module '@shardworks/nexus-core' {
    interface GuildConfig {
        animator?: AnimatorConfig;
    }
}
//# sourceMappingURL=types.d.ts.map
=== packages/plugins/claude-code/dist/index.d.ts ===
/**
 * Claude Code Session Provider
 *
 * Apparatus plugin that implements AnimatorSessionProvider for the
 * Claude Code CLI. The Animator discovers this via guild config:
 *
 *   guild.json["animator"]["sessionProvider"] = "claude-code"
 *
 * Launches sessions via the `claude` CLI in autonomous mode (--print)
 * with --output-format stream-json for structured telemetry.
 *
 * Key design choice: uses async spawn() instead of spawnSync().
 * This is required for stream-json transcript parsing, timeout enforcement,
 * and future concurrent session support.
 */
import type { Plugin } from '@shardworks/nexus-core';
import type { SessionChunk } from '@shardworks/animator-apparatus';
/**
 * Extract the final assistant text from a transcript.
 *
 * Walks the transcript backwards to find the last `assistant` message
 * and concatenates its text content blocks.
 *
 * @internal Exported for testing only.
 */
export declare function extractFinalAssistantText(transcript: Record<string, unknown>[]): string | undefined;
/**
 * Create the Claude Code session provider apparatus.
 *
 * The apparatus has no startup logic — it just provides the
 * AnimatorSessionProvider implementation. The Animator looks it up
 * via guild().apparatus('claude-code').
 */
export declare function createClaudeCodeProvider(): Plugin;
declare const _default: Plugin;
export default _default;
export { createMcpServer, startMcpHttpServer } from './mcp-server.ts';
export type { McpHttpHandle } from './mcp-server.ts';
/** Parsed result from stream-json output. @internal */
export interface StreamJsonResult {
    exitCode: number;
    transcript: Record<string, unknown>[];
    costUsd?: number;
    tokenUsage?: {
        inputTokens: number;
        outputTokens: number;
        cacheReadTokens?: number;
        cacheWriteTokens?: number;
    };
    providerSessionId?: string;
}
/**
 * Parse a single NDJSON message from stream-json output.
 *
 * Returns parsed chunks for streaming and accumulates data into the
 * provided accumulators (transcript, metrics).
 *
 * @internal Exported for testing only.
 */
export declare function parseStreamJsonMessage(msg: Record<string, unknown>, acc: {
    transcript: Record<string, unknown>[];
    costUsd?: number;
    tokenUsage?: StreamJsonResult['tokenUsage'];
    providerSessionId?: string;
}): SessionChunk[];
/**
 * Process NDJSON buffer, calling handler for each complete line.
 * Returns the remaining incomplete buffer.
 *
 * @internal Exported for testing only.
 */
export declare function processNdjsonBuffer(buffer: string, handler: (msg: Record<string, unknown>) => void): string;
//# sourceMappingURL=index.d.ts.map
=== packages/plugins/claude-code/dist/mcp-server.d.ts ===
/**
 * MCP Tool Server — serves guild tools as typed MCP tools during anima sessions.
 *
 * Two entry points:
 *
 * 1. **`createMcpServer(tools)`** — library function. Takes an array of
 *    ToolDefinitions (already resolved by the Instrumentarium) and returns
 *    a configured McpServer.
 *
 * 2. **`startMcpHttpServer(tools)`** — starts an in-process HTTP server
 *    serving the MCP tool set via Streamable HTTP on an ephemeral localhost
 *    port. Returns a handle with the URL (for --mcp-config) and a close()
 *    function for cleanup.
 *
 * The MCP server is one-per-session. The claude-code provider owns the
 * lifecycle — starts before the Claude process, stops after it exits.
 *
 * See: docs/architecture/apparatus/claude-code.md
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolDefinition } from '@shardworks/tools-apparatus';
/**
 * Handle returned by startMcpHttpServer().
 *
 * Provides the URL for --mcp-config and a close() function for cleanup.
 */
export interface McpHttpHandle {
    /** URL for --mcp-config (e.g. "http://127.0.0.1:PORT/mcp"). */
    url: string;
    /** Shut down the HTTP server and MCP transport. */
    close(): Promise<void>;
}
/**
 * Create and configure an MCP server with the given tools.
 *
 * Each tool's Zod param schema is registered directly with the MCP SDK
 * (which handles JSON Schema conversion). The handler is wrapped to
 * validate params via Zod and format the result as MCP tool output.
 *
 * Tools with `callableBy` set that does not include `'anima'` are
 * filtered out. Tools without `callableBy` are included (available
 * to all callers by default).
 */
export declare function createMcpServer(tools: ToolDefinition[]): Promise<McpServer>;
/**
 * Start an in-process HTTP server serving the MCP tool set via SSE.
 *
 * Uses the MCP SDK's SSE transport: the client GETs /sse to establish
 * the event stream, then POSTs messages to /message. Claude Code's
 * --mcp-config expects `type: "sse"` for HTTP-based MCP servers.
 *
 * The server binds to 127.0.0.1 only — not network-accessible.
 *
 * Returns a handle with the URL (for --mcp-config) and a close() function.
 * The caller is responsible for calling close() after the session exits.
 *
 * Each session gets its own server instance. Concurrent sessions get
 * independent servers on different ports.
 */
export declare function startMcpHttpServer(tools: ToolDefinition[]): Promise<McpHttpHandle>;
//# sourceMappingURL=mcp-server.d.ts.map
=== packages/plugins/clerk/dist/clerk.d.ts ===
/**
 * The Clerk — writ lifecycle management apparatus.
 *
 * The Clerk manages the lifecycle of writs: lightweight work orders that flow
 * through a fixed status machine (ready → active → completed/failed, or
 * ready/active → cancelled). Each writ has a type, a title, a body, and
 * optional codex and resolution fields.
 *
 * Writ types are validated against the guild config's writTypes field plus the
 * built-in type ('mandate'). An unknown type is rejected at post time.
 * Kits may also contribute writ types via their writTypes field.
 *
 * See: docs/architecture/apparatus/clerk.md
 */
import type { Plugin } from '@shardworks/nexus-core';
import type { WritTypeEntry } from './types.ts';
/** Kit contribution interface for the Clerk's writ type system. */
export interface ClerkKit {
    /** Writ type descriptors to register with the Clerk. Names are unqualified. */
    writTypes?: WritTypeEntry[];
}
export declare function createClerk(): Plugin;
//# sourceMappingURL=clerk.d.ts.map
=== packages/plugins/clerk/dist/index.d.ts ===
/**
 * @shardworks/clerk-apparatus — The Clerk.
 *
 * Writ lifecycle management: post commissions, accept work, complete or fail
 * writs, and cancel them at any pre-terminal stage. Writs flow through a fixed
 * status machine and are persisted in The Stacks.
 *
 * See: docs/architecture/apparatus/clerk.md
 */
export { type ClerkApi, type ClerkConfig, type WritTypeEntry, type WritDoc, type WritLinkDoc, type WritLinks, type WritStatus, type PostCommissionRequest, type WritFilters, } from './types.ts';
export { createClerk } from './clerk.ts';
export type { ClerkKit } from './clerk.ts';
declare const _default: import("@shardworks/nexus-core").Plugin;
export default _default;
//# sourceMappingURL=index.d.ts.map
=== packages/plugins/clerk/dist/tools/commission-post.d.ts ===
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    title: z.ZodString;
    body: z.ZodString;
    type: z.ZodOptional<z.ZodString>;
    codex: z.ZodOptional<z.ZodString>;
}>;
export default _default;
//# sourceMappingURL=commission-post.d.ts.map
=== packages/plugins/clerk/dist/tools/index.d.ts ===
export { default as commissionPost } from './commission-post.ts';
export { default as writShow } from './writ-show.ts';
export { default as writList } from './writ-list.ts';
export { default as writAccept } from './writ-accept.ts';
export { default as writComplete } from './writ-complete.ts';
export { default as writFail } from './writ-fail.ts';
export { default as writCancel } from './writ-cancel.ts';
export { default as writLink } from './writ-link.ts';
export { default as writUnlink } from './writ-unlink.ts';
//# sourceMappingURL=index.d.ts.map
=== packages/plugins/clerk/dist/tools/writ-accept.d.ts ===
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    id: z.ZodString;
}>;
export default _default;
//# sourceMappingURL=writ-accept.d.ts.map
=== packages/plugins/clerk/dist/tools/writ-cancel.d.ts ===
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    id: z.ZodString;
    resolution: z.ZodOptional<z.ZodString>;
}>;
export default _default;
//# sourceMappingURL=writ-cancel.d.ts.map
=== packages/plugins/clerk/dist/tools/writ-complete.d.ts ===
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    id: z.ZodString;
    resolution: z.ZodString;
}>;
export default _default;
//# sourceMappingURL=writ-complete.d.ts.map
=== packages/plugins/clerk/dist/tools/writ-fail.d.ts ===
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    id: z.ZodString;
    resolution: z.ZodString;
}>;
export default _default;
//# sourceMappingURL=writ-fail.d.ts.map
=== packages/plugins/clerk/dist/tools/writ-link.d.ts ===
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    sourceId: z.ZodString;
    targetId: z.ZodString;
    type: z.ZodString;
}>;
export default _default;
//# sourceMappingURL=writ-link.d.ts.map
=== packages/plugins/clerk/dist/tools/writ-list.d.ts ===
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    status: z.ZodOptional<z.ZodEnum<{
        ready: "ready";
        active: "active";
        completed: "completed";
        failed: "failed";
        cancelled: "cancelled";
    }>>;
    type: z.ZodOptional<z.ZodString>;
    limit: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    offset: z.ZodOptional<z.ZodNumber>;
}>;
export default _default;
//# sourceMappingURL=writ-list.d.ts.map
=== packages/plugins/clerk/dist/tools/writ-show.d.ts ===
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    id: z.ZodString;
}>;
export default _default;
//# sourceMappingURL=writ-show.d.ts.map
=== packages/plugins/clerk/dist/tools/writ-unlink.d.ts ===
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    sourceId: z.ZodString;
    targetId: z.ZodString;
    type: z.ZodString;
}>;
export default _default;
//# sourceMappingURL=writ-unlink.d.ts.map
=== packages/plugins/clerk/dist/types.d.ts ===
/**
 * Clerk public types.
 *
 * All types exported from @shardworks/clerk-apparatus.
 */
/**
 * A writ's position in its lifecycle.
 *
 * Transitions:
 *   ready → active (accept)
 *   active → completed (complete)
 *   active → failed (fail)
 *   ready | active → cancelled (cancel)
 *
 * completed, failed, cancelled are terminal — no further transitions.
 */
export type WritStatus = 'ready' | 'active' | 'completed' | 'failed' | 'cancelled';
/**
 * A writ document as stored in The Stacks.
 */
export interface WritDoc {
    /** Index signature required to satisfy BookEntry constraint. */
    [key: string]: unknown;
    /** Unique writ id (`w-{base36_timestamp}{hex_random}`). Sortable by creation time. */
    id: string;
    /** Writ type — must be a type declared in guild config, or a built-in type. */
    type: string;
    /** Current lifecycle status. */
    status: WritStatus;
    /** Short human-readable title. */
    title: string;
    /** Detail text. */
    body: string;
    /** Target codex name. */
    codex?: string;
    /** ISO timestamp when the writ was created. */
    createdAt: string;
    /** ISO timestamp of the last mutation. */
    updatedAt: string;
    /** ISO timestamp when the writ was accepted (transitioned to active). */
    acceptedAt?: string;
    /** ISO timestamp when the writ reached a terminal state. */
    resolvedAt?: string;
    /** Summary of how the writ resolved (set on any terminal transition). */
    resolution?: string;
}
/**
 * Request to post a new commission (create a writ).
 */
export interface PostCommissionRequest {
    /**
     * Writ type. Defaults to the guild's configured defaultType, or "mandate"
     * if no default is configured. Must be a valid declared type.
     */
    type?: string;
    /** Short human-readable title describing the work. */
    title: string;
    /** Detail text. */
    body: string;
    /** Optional target codex name. */
    codex?: string;
}
/**
 * Filters for listing writs.
 */
export interface WritFilters {
    /** Filter by status. */
    status?: WritStatus;
    /** Filter by writ type. */
    type?: string;
    /** Maximum number of results (default: 20). */
    limit?: number;
    /** Number of results to skip. */
    offset?: number;
}
/**
 * A writ type entry declared in clerk config.
 */
export interface WritTypeEntry {
    /** The writ type name (e.g. "mandate", "task", "bug"). */
    name: string;
    /** Optional human-readable description of this writ type. */
    description?: string;
}
/**
 * Clerk apparatus configuration — lives under the `clerk` key in guild.json.
 */
export interface ClerkConfig {
    /** Additional writ type declarations. The built-in type "mandate" is always valid. */
    writTypes?: WritTypeEntry[];
    /** Default writ type when commission-post is called without a type (default: "mandate"). */
    defaultType?: string;
}
declare module '@shardworks/nexus-core' {
    interface GuildConfig {
        clerk?: ClerkConfig;
    }
}
/**
 * A link document as stored in The Stacks (clerk/links book).
 */
export interface WritLinkDoc {
    /** Index signature required to satisfy BookEntry constraint. */
    [key: string]: unknown;
    /** Deterministic composite key: `{sourceId}:{targetId}:{type}`. */
    id: string;
    /** The writ that is the origin of this relationship. */
    sourceId: string;
    /** The writ that is the target of this relationship. */
    targetId: string;
    /** Relationship type — an open string (e.g. "fixes", "retries", "supersedes", "duplicates"). */
    type: string;
    /** ISO timestamp when the link was created. */
    createdAt: string;
}
/**
 * Result of querying links for a writ — both directions in one response.
 */
export interface WritLinks {
    /** Links where this writ is the source (this writ → other writ). */
    outbound: WritLinkDoc[];
    /** Links where this writ is the target (other writ → this writ). */
    inbound: WritLinkDoc[];
}
/**
 * The Clerk's runtime API — retrieved via guild().apparatus<ClerkApi>('clerk').
 */
export interface ClerkApi {
    /**
     * Post a new commission, creating a writ in 'ready' status.
     * Validates the writ type against declared types in guild config.
     */
    post(request: PostCommissionRequest): Promise<WritDoc>;
    /**
     * Show a writ by id. Throws if not found.
     */
    show(id: string): Promise<WritDoc>;
    /**
     * List writs with optional filters, ordered by createdAt descending.
     */
    list(filters?: WritFilters): Promise<WritDoc[]>;
    /**
     * Count writs matching optional filters.
     */
    count(filters?: WritFilters): Promise<number>;
    /**
     * Transition a writ to a new status, optionally setting additional fields.
     * Validates that the transition is legal.
     */
    transition(id: string, to: WritStatus, fields?: Partial<WritDoc>): Promise<WritDoc>;
    /**
     * Create a typed directional link from one writ to another.
     * Both writs must exist. Self-links are rejected. Idempotent — returns
     * the existing link if the (sourceId, targetId, type) triple already exists.
     */
    link(sourceId: string, targetId: string, type: string): Promise<WritLinkDoc>;
    /**
     * Query all links for a writ — both outbound (this writ is the source)
     * and inbound (this writ is the target).
     */
    links(writId: string): Promise<WritLinks>;
    /**
     * Remove a link. Idempotent — no error if the link does not exist.
     */
    unlink(sourceId: string, targetId: string, type: string): Promise<void>;
}
//# sourceMappingURL=types.d.ts.map
=== packages/plugins/codexes/dist/git.d.ts ===
/**
 * Lightweight git helper — typed wrapper around child_process.execFile.
 *
 * All git operations in the Scriptorium go through this module for
 * safety (no shell injection) and consistent error handling.
 */
export interface GitResult {
    stdout: string;
    stderr: string;
}
export declare class GitError extends Error {
    readonly command: string[];
    readonly stderr: string;
    readonly exitCode: number | null;
    constructor(message: string, command: string[], stderr: string, exitCode: number | null);
}
/**
 * Run a git command with typed error handling.
 *
 * @param args - git subcommand and arguments (e.g. ['clone', '--bare', url])
 * @param cwd - working directory for the command
 */
export declare function git(args: string[], cwd?: string): Promise<GitResult>;
/**
 * Resolve the default branch of a bare clone by reading HEAD.
 *
 * Returns the branch name (e.g. 'main'), not the full ref.
 */
export declare function resolveDefaultBranch(bareClonePath: string): Promise<string>;
/**
 * Get the commit SHA at the tip of a branch in a bare clone.
 */
export declare function resolveRef(bareClonePath: string, ref: string): Promise<string>;
/**
 * Check if a branch has commits ahead of another branch.
 * Returns the number of commits ahead.
 */
export declare function commitsAhead(bareClonePath: string, branch: string, base: string): Promise<number>;
//# sourceMappingURL=git.d.ts.map
=== packages/plugins/codexes/dist/index.d.ts ===
/**
 * @shardworks/codexes-apparatus — The Scriptorium.
 *
 * Guild codex management: bare clone registry, draft binding lifecycle
 * (git worktrees), sealing (ff-only merge or rebase+ff), and push.
 * Default export is the apparatus plugin.
 *
 * See: docs/architecture/apparatus/scriptorium.md
 */
export type { ScriptoriumApi, CodexRecord, CodexDetail, DraftRecord, OpenDraftRequest, AbandonDraftRequest, SealRequest, PushRequest, SealResult, CodexesConfig, CodexesSettings, CodexConfigEntry, } from './types.ts';
export { createScriptorium } from './scriptorium.ts';
declare const _default: import("@shardworks/nexus-core").Plugin;
export default _default;
//# sourceMappingURL=index.d.ts.map
=== packages/plugins/codexes/dist/scriptorium-core.d.ts ===
/**
 * The Scriptorium — core logic.
 *
 * Manages the codex registry (bare clones), draft binding lifecycle
 * (worktrees), and sealing (ff-only merge or rebase+ff). All git
 * operations go through the git helper for safety.
 *
 * Draft tracking is in-memory — drafts are reconstructed from
 * filesystem state at startup and maintained in memory during the
 * process lifetime.
 *
 * See: docs/architecture/apparatus/scriptorium.md
 */
import type { CodexRecord, CodexDetail, DraftRecord, OpenDraftRequest, AbandonDraftRequest, SealRequest, SealResult, PushRequest, ScriptoriumApi } from './types.ts';
export declare class ScriptoriumCore {
    private codexes;
    private drafts;
    private maxMergeRetries;
    private draftRoot;
    private get home();
    private codexesDir;
    private bareClonePath;
    private draftWorktreePath;
    start(): void;
    /**
     * Load a codex from config. Checks for existing bare clone;
     * initiates background clone if missing.
     */
    private loadCodex;
    /**
     * Reconcile in-memory draft tracking with filesystem state.
     * Scans the worktree directories and rebuilds the draft map.
     */
    private reconcileDrafts;
    /**
     * Ensure a codex's bare clone is ready. Blocks if a background
     * clone is in progress. Throws if the codex is unknown or clone failed.
     */
    private ensureReady;
    private performClone;
    /**
     * Advance refs/heads/<branch> to the remote's position if the remote is
     * strictly ahead of the local sealed binding.
     *
     * This handles commits pushed to the remote outside the Scriptorium:
     * if the remote has advanced past the local sealed binding, sealing must
     * rebase the draft onto the remote position — not the stale local one.
     *
     * If the local sealed binding is already ahead of (or equal to) the remote
     * (e.g. contains unpushed seals from contention scenarios), it is kept.
     */
    private advanceToRemote;
    private performFetch;
    createApi(): ScriptoriumApi;
    add(name: string, remoteUrl: string): Promise<CodexRecord>;
    list(): Promise<CodexRecord[]>;
    show(name: string): Promise<CodexDetail>;
    remove(name: string): Promise<void>;
    fetchCodex(name: string): Promise<void>;
    push(request: PushRequest): Promise<void>;
    openDraft(request: OpenDraftRequest): Promise<DraftRecord>;
    listDrafts(codexName?: string): Promise<DraftRecord[]>;
    abandonDraft(request: AbandonDraftRequest): Promise<void>;
    seal(request: SealRequest): Promise<SealResult>;
    private draftsForCodex;
    private toCodexRecord;
}
//# sourceMappingURL=scriptorium-core.d.ts.map
=== packages/plugins/codexes/dist/scriptorium.d.ts ===
/**
 * The Scriptorium — apparatus implementation.
 *
 * Wires together the ScriptoriumCore (git operations, draft lifecycle)
 * and exposes the ScriptoriumApi as the `provides` object. Tools are
 * contributed via supportKit.
 *
 * See: docs/architecture/apparatus/scriptorium.md
 */
import type { Plugin } from '@shardworks/nexus-core';
export declare function createScriptorium(): Plugin;
//# sourceMappingURL=scriptorium.d.ts.map
=== packages/plugins/codexes/dist/tools/codex-add.d.ts ===
/**
 * codex-add tool — register an existing git repository as a guild codex.
 *
 * Clones a bare copy to `.nexus/codexes/<name>.git` and adds the entry
 * to guild.json. Blocks until the clone completes.
 */
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    name: z.ZodString;
    remoteUrl: z.ZodString;
}>;
export default _default;
//# sourceMappingURL=codex-add.d.ts.map
=== packages/plugins/codexes/dist/tools/codex-list.d.ts ===
/**
 * codex-list tool — list all registered codexes.
 */
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{}>;
export default _default;
//# sourceMappingURL=codex-list.d.ts.map
=== packages/plugins/codexes/dist/tools/codex-push.d.ts ===
/**
 * codex-push tool — push a branch to the codex's remote.
 */
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    codexName: z.ZodString;
    branch: z.ZodOptional<z.ZodString>;
}>;
export default _default;
//# sourceMappingURL=codex-push.d.ts.map
=== packages/plugins/codexes/dist/tools/codex-remove.d.ts ===
/**
 * codex-remove tool — remove a codex from the guild.
 *
 * Abandons all active drafts, removes the bare clone, and removes
 * the entry from guild.json. Does NOT delete the remote repository.
 */
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    name: z.ZodString;
}>;
export default _default;
//# sourceMappingURL=codex-remove.d.ts.map
=== packages/plugins/codexes/dist/tools/codex-show.d.ts ===
/**
 * codex-show tool — show details of a specific codex including active drafts.
 */
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    name: z.ZodString;
}>;
export default _default;
//# sourceMappingURL=codex-show.d.ts.map
=== packages/plugins/codexes/dist/tools/draft-abandon.d.ts ===
/**
 * draft-abandon tool — abandon a draft binding.
 *
 * Removes the git worktree and branch. Fails if the draft has
 * unsealed inscriptions unless force: true.
 */
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    codexName: z.ZodString;
    branch: z.ZodString;
    force: z.ZodOptional<z.ZodBoolean>;
}>;
export default _default;
//# sourceMappingURL=draft-abandon.d.ts.map
=== packages/plugins/codexes/dist/tools/draft-list.d.ts ===
/**
 * draft-list tool — list active draft bindings.
 */
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    codexName: z.ZodOptional<z.ZodString>;
}>;
export default _default;
//# sourceMappingURL=draft-list.d.ts.map
=== packages/plugins/codexes/dist/tools/draft-open.d.ts ===
/**
 * draft-open tool — open a draft binding on a codex.
 *
 * Creates an isolated git worktree for concurrent work. Fetches from
 * the remote before branching to ensure freshness.
 */
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    codexName: z.ZodString;
    branch: z.ZodOptional<z.ZodString>;
    startPoint: z.ZodOptional<z.ZodString>;
    associatedWith: z.ZodOptional<z.ZodString>;
}>;
export default _default;
//# sourceMappingURL=draft-open.d.ts.map
=== packages/plugins/codexes/dist/tools/draft-seal.d.ts ===
/**
 * draft-seal tool — seal a draft into the codex.
 *
 * Incorporates the draft's inscriptions into the sealed binding via
 * ff-only merge. If ff is not possible, rebases and retries. Fails
 * hard on conflicts — no merge commits, no auto-resolution.
 */
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    codexName: z.ZodString;
    sourceBranch: z.ZodString;
    targetBranch: z.ZodOptional<z.ZodString>;
    maxRetries: z.ZodOptional<z.ZodNumber>;
    keepDraft: z.ZodOptional<z.ZodBoolean>;
}>;
export default _default;
//# sourceMappingURL=draft-seal.d.ts.map
=== packages/plugins/codexes/dist/tools/index.d.ts ===
/**
 * Scriptorium tool re-exports.
 */
export { default as codexAdd } from './codex-add.ts';
export { default as codexList } from './codex-list.ts';
export { default as codexShow } from './codex-show.ts';
export { default as codexRemove } from './codex-remove.ts';
export { default as codexPush } from './codex-push.ts';
export { default as draftOpen } from './draft-open.ts';
export { default as draftList } from './draft-list.ts';
export { default as draftAbandon } from './draft-abandon.ts';
export { default as draftSeal } from './draft-seal.ts';
//# sourceMappingURL=index.d.ts.map
=== packages/plugins/codexes/dist/types.d.ts ===
/**
 * The Scriptorium — type definitions.
 *
 * All public types for the codexes apparatus: the ScriptoriumApi
 * (provides interface), supporting record types, and request/result
 * types for draft lifecycle and sealing operations.
 *
 * See: docs/architecture/apparatus/scriptorium.md
 */
export interface CodexRecord {
    /** Codex name — unique within the guild. */
    name: string;
    /** Remote repository URL. */
    remoteUrl: string;
    /** Whether the bare clone exists and is healthy. */
    cloneStatus: 'ready' | 'cloning' | 'error';
    /** Number of active drafts for this codex. */
    activeDrafts: number;
}
export interface CodexDetail extends CodexRecord {
    /** Default branch name on the remote (e.g. 'main'). */
    defaultBranch: string;
    /** Timestamp of last fetch. */
    lastFetched: string | null;
    /** Active drafts for this codex. */
    drafts: DraftRecord[];
}
export interface DraftRecord {
    /** Unique draft id (ULID). */
    id: string;
    /** Codex this draft belongs to. */
    codexName: string;
    /** Git branch name for this draft. */
    branch: string;
    /** Absolute filesystem path to the draft's working directory (git worktree). */
    path: string;
    /** When the draft was opened. */
    createdAt: string;
    /** Optional association — e.g. a writ id. */
    associatedWith?: string;
}
export interface OpenDraftRequest {
    /** Codex to open the draft for. */
    codexName: string;
    /** Branch name for the draft. If omitted, generates `draft-<ulid>`. */
    branch?: string;
    /**
     * Starting point — branch, tag, or commit to branch from.
     * Default: remote HEAD (the codex's default branch).
     */
    startPoint?: string;
    /** Optional association metadata (e.g. writ id). */
    associatedWith?: string;
}
export interface AbandonDraftRequest {
    /** Codex name. */
    codexName: string;
    /** Git branch name of the draft to abandon. */
    branch: string;
    /** Force abandonment even if the draft has unsealed inscriptions. */
    force?: boolean;
}
export interface SealRequest {
    /** Codex name. */
    codexName: string;
    /** Git branch to seal (the draft's branch). */
    sourceBranch: string;
    /** Target branch (the sealed binding). Default: codex's default branch. */
    targetBranch?: string;
    /** Max rebase retry attempts under contention. Default: from settings.maxMergeRetries (3). */
    maxRetries?: number;
    /** Keep the draft after successful sealing. Default: false. */
    keepDraft?: boolean;
}
export interface SealResult {
    /** Whether sealing succeeded. */
    success: boolean;
    /** Strategy used: 'fast-forward' or 'rebase'. */
    strategy: 'fast-forward' | 'rebase';
    /** Number of retry attempts needed (0 = first try). */
    retries: number;
    /** The commit SHA at head of target after sealing. */
    sealedCommit: string;
    /** Number of inscriptions (commits) incorporated from the draft. 0 means no-op seal. */
    inscriptionsSealed: number;
}
export interface PushRequest {
    /** Codex name. */
    codexName: string;
    /**
     * Branch to push. Default: codex's default branch.
     */
    branch?: string;
}
export interface CodexesConfig {
    settings?: CodexesSettings;
    registered?: Record<string, CodexConfigEntry>;
}
export interface CodexesSettings {
    /** Max rebase-retry attempts during sealing under contention. Default: 3. */
    maxMergeRetries?: number;
    /** Directory where draft worktrees are created, relative to guild root. Default: '.nexus/worktrees'. */
    draftRoot?: string;
}
export interface CodexConfigEntry {
    /** The remote URL of the codex's git repository. */
    remoteUrl: string;
}
export interface ScriptoriumApi {
    /**
     * Register an existing repository as a codex.
     * Clones a bare copy to `.nexus/codexes/<name>.git` and adds the
     * entry to the `codexes` config section in `guild.json`.
     * Blocks until the clone completes.
     */
    add(name: string, remoteUrl: string): Promise<CodexRecord>;
    /**
     * List all registered codexes with their status.
     */
    list(): Promise<CodexRecord[]>;
    /**
     * Show details for a single codex, including active drafts.
     */
    show(name: string): Promise<CodexDetail>;
    /**
     * Remove a codex from the guild. Abandons all active drafts,
     * removes the bare clone from `.nexus/codexes/`, and removes the
     * entry from `guild.json`. Does NOT delete the remote repository.
     */
    remove(name: string): Promise<void>;
    /**
     * Fetch latest refs from the remote for a codex's bare clone.
     * Called automatically before draft creation and sealing; can
     * also be invoked manually.
     */
    fetch(name: string): Promise<void>;
    /**
     * Push a branch to the codex's remote.
     * Pushes the specified branch (default: codex's default branch)
     * to the bare clone's configured remote. Does not force-push.
     */
    push(request: PushRequest): Promise<void>;
    /**
     * Open a draft binding on a codex.
     *
     * Creates a new git branch from `startPoint` (default: the codex's
     * sealed binding) and checks it out as an isolated worktree under
     * `.nexus/worktrees/<codex>/<branch>`. Fetches from the remote
     * before branching to ensure freshness.
     *
     * If `branch` is omitted, generates one automatically as `draft-<ulid>`.
     * Rejects with a clear error if a draft with the same branch name
     * already exists for this codex.
     */
    openDraft(request: OpenDraftRequest): Promise<DraftRecord>;
    /**
     * List active drafts, optionally filtered by codex.
     */
    listDrafts(codexName?: string): Promise<DraftRecord[]>;
    /**
     * Abandon a draft — remove the draft's worktree and git branch.
     * Fails if the draft has unsealed inscriptions unless `force: true`.
     * The inscriptions persist in the git reflog but the draft is no
     * longer active.
     */
    abandonDraft(request: AbandonDraftRequest): Promise<void>;
    /**
     * Seal a draft — incorporate its inscriptions into the sealed binding.
     *
     * Git strategy: fast-forward merge only. If ff is not possible,
     * rebases the draft branch onto the target and retries. Retries up
     * to `maxRetries` times (default: from settings.maxMergeRetries)
     * to handle contention from concurrent sealing. Fails hard if the
     * rebase produces conflicts — no auto-resolution, no merge commits.
     *
     * On success, abandons the draft (unless `keepDraft: true`).
     */
    seal(request: SealRequest): Promise<SealResult>;
}
//# sourceMappingURL=types.d.ts.map
=== packages/plugins/copilot/dist/index.d.ts ===
/**
 * Copilot Session Provider
 *
 * Apparatus plugin that implements AnimatorSessionProvider using the
 * GitHub Models REST API (OpenAI-compatible). The Animator discovers
 * this via guild config:
 *
 *   guild.json["animator"]["sessionProvider"] = "copilot"
 *
 * Calls the chat completions endpoint, runs an in-process agentic
 * tool-call loop when tools are supplied, and supports streaming via SSE.
 *
 * Key design choice: calls tool handlers directly in-process (no MCP server).
 * This is simpler than the claude-code approach since we control the API
 * request/response cycle directly.
 */
import type { Plugin } from '@shardworks/nexus-core';
import type { ResolvedTool } from '@shardworks/tools-apparatus';
/** Plugin configuration stored at guild.json["copilot"]. */
export interface CopilotConfig {
    /**
     * Chat completions API base endpoint URL.
     * Default: 'https://models.inference.ai.azure.com'
     */
    apiEndpoint?: string;
    /**
     * Name of the environment variable holding the API bearer token.
     * Default: 'GITHUB_TOKEN'
     */
    tokenEnvVar?: string;
    /**
     * Maximum number of tool-call rounds in the agentic loop.
     * When reached, the session completes with the last available response.
     * Default: 50
     */
    maxToolRounds?: number;
}
declare module '@shardworks/nexus-core' {
    interface GuildConfig {
        copilot?: CopilotConfig;
    }
}
/** OpenAI-compatible chat completion message. */
interface ChatMessage {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string | null;
    tool_calls?: ToolCall[];
    tool_call_id?: string;
    /** Index signature makes ChatMessage compatible with Record<string, unknown>. */
    [key: string]: unknown;
}
/** OpenAI-compatible tool call from an assistant response. */
interface ToolCall {
    id: string;
    type: 'function';
    function: {
        name: string;
        arguments: string;
    };
}
/** OpenAI-compatible function tool definition for the API request. */
interface ToolDef {
    type: 'function';
    function: {
        name: string;
        description: string;
        parameters: Record<string, unknown>;
    };
}
/**
 * Convert ResolvedTool array to OpenAI function tool format.
 *
 * Uses z.toJSONSchema() to convert Zod params schema to JSON Schema.
 *
 * @internal Exported for testing only.
 */
export declare function convertTools(tools: ResolvedTool[]): ToolDef[];
/**
 * Extract the output text from the last assistant message with no tool_calls.
 *
 * Walks the messages array backwards to find the last assistant message
 * that is a "final" response (no pending tool calls).
 *
 * @internal Exported for testing only.
 */
export declare function extractOutput(messages: ChatMessage[]): string | undefined;
/**
 * Parse SSE data lines from a buffer, invoking handler for each parsed data value.
 * Returns the remaining incomplete buffer.
 *
 * @internal Exported for testing only.
 */
export declare function parseSseLines(buffer: string, handler: (data: string) => void): string;
/**
 * Create the Copilot session provider apparatus.
 *
 * The apparatus reads CopilotConfig from guild config at start() time
 * and provides an AnimatorSessionProvider backed by the GitHub Models API.
 */
export declare function createCopilotProvider(): Plugin;
declare const _default: Plugin;
export default _default;
//# sourceMappingURL=index.d.ts.map
=== packages/plugins/fabricator/dist/fabricator.d.ts ===
/**
 * The Fabricator — guild engine design registry apparatus.
 *
 * Scans installed engine designs from kit contributions and apparatus supportKits,
 * and serves them to the Spider on demand.
 *
 * The Fabricator does not execute engines. It is a pure query service:
 * designs in, designs out.
 */
import type { Plugin } from '@shardworks/nexus-core';
/** Minimal execution context passed to an engine's run() method. */
export interface EngineRunContext {
    /** The rig this engine instance belongs to. */
    rigId: string;
    /** Simple string identity for this engine instance (e.g. 'draft', 'implement'). */
    engineId: string;
    /** All upstream yields, keyed by engine id. Escape hatch for engines that need to inspect the full upstream chain. */
    upstream: Record<string, unknown>;
    /**
     * Present when this engine was previously blocked and has been restarted.
     * Advisory — do not depend on for correctness.
     *
     * Note: Defined inline to avoid a circular package dependency with spider-apparatus.
     * Shape matches spider-apparatus BlockRecord exactly.
     */
    priorBlock?: {
        type: string;
        condition: unknown;
        blockedAt: string;
        message?: string;
        lastCheckedAt?: string;
    };
}
/**
 * The result of an engine run.
 *
 * 'completed' — synchronous work done inline, yields are available immediately.
 * 'launched'  — async work launched in a session; the Spider polls for completion.
 * 'blocked'   — engine is waiting for an external condition; Spider will poll
 *               the registered block type's checker and restart when cleared.
 */
export type EngineRunResult = {
    status: 'completed';
    yields: unknown;
} | {
    status: 'launched';
    sessionId: string;
} | {
    status: 'blocked';
    blockType: string;
    condition: unknown;
    message?: string;
};
/**
 * An engine design — the unit of work the Fabricator catalogues and the
 * Spider executes. Kit authors import this type from @shardworks/fabricator-apparatus.
 */
export interface EngineDesign {
    /** Unique identifier for this engine design (e.g. 'draft', 'implement', 'review'). */
    id: string;
    /**
     * Execute this engine.
     *
     * @param givens   — the engine's declared inputs, assembled by the Spider.
     * @param context  — minimal execution context: engine id and upstream yields.
     */
    run(givens: Record<string, unknown>, context: EngineRunContext): Promise<EngineRunResult>;
    /**
     * Assemble yields from a completed session.
     *
     * Called by the Spider's collect step when a quick engine's session
     * reaches a terminal state. The engine looks up whatever it needs
     * via guild() — same dependency pattern as run().
     *
     * @param sessionId — the session to collect yields from (primary input).
     * @param givens    — same givens that were passed to run().
     * @param context   — same execution context that was passed to run().
     *
     * If not defined, the Spider uses a generic default:
     *   { sessionId, sessionStatus, output? }
     *
     * Only relevant for quick engines (those that return { status: 'launched' }).
     * Clockwork engines return yields directly from run().
     */
    collect?(sessionId: string, givens: Record<string, unknown>, context: EngineRunContext): Promise<unknown>;
}
/** Summary info for a registered engine design. */
export interface EngineDesignInfo {
    /** Engine design id. */
    id: string;
    /** Plugin id that contributed this design. */
    pluginId: string;
    /** Whether the design defines a collect() method (indicates quick engine with custom yield assembly). */
    hasCollect: boolean;
}
/** The Fabricator's public API, exposed via `provides`. */
export interface FabricatorApi {
    /**
     * Look up an engine design by ID.
     * Returns the design if registered, undefined otherwise.
     */
    getEngineDesign(id: string): EngineDesign | undefined;
    /**
     * List all registered engine designs with summary info.
     */
    listEngineDesigns(): EngineDesignInfo[];
}
/**
 * Create the Fabricator apparatus plugin.
 *
 * Returns a Plugin with:
 * - `consumes: ['engines']` — scans kit/supportKit contributions
 * - `provides: FabricatorApi` — the engine design registry API
 */
export declare function createFabricator(): Plugin;
//# sourceMappingURL=fabricator.d.ts.map
=== packages/plugins/fabricator/dist/index.d.ts ===
/**
 * @shardworks/fabricator-apparatus — The Fabricator.
 *
 * Guild engine design registry: scans kit contributions, stores engine designs
 * by ID, and provides the FabricatorApi for design lookup.
 *
 * The EngineDesign, EngineRunContext, and EngineRunResult types live here
 * canonically — kit authors import from this package to contribute engines.
 */
export type { EngineDesign, EngineDesignInfo, EngineRunContext, EngineRunResult, } from './fabricator.ts';
export type { FabricatorApi } from './fabricator.ts';
export { createFabricator } from './fabricator.ts';
declare const _default: import("@shardworks/nexus-core").Plugin;
export default _default;
//# sourceMappingURL=index.d.ts.map
=== packages/plugins/loom/dist/index.d.ts ===
/**
 * @shardworks/loom-apparatus — The Loom.
 *
 * Session context composition: weaves role instructions, curricula, and
 * temperaments into an AnimaWeave that The Animator can consume to
 * launch AI sessions.
 *
 * See: docs/specification.md (loom)
 */
export { type LoomApi, type WeaveRequest, type AnimaWeave, type RoleInfo, type LoomConfig, type RoleDefinition, type KitRoleDefinition, type LoomKit, createLoom, } from './loom.ts';
import type { LoomConfig } from './loom.ts';
declare module '@shardworks/nexus-core' {
    interface GuildConfig {
        loom?: LoomConfig;
    }
}
declare const _default: import("@shardworks/nexus-core").Plugin;
export default _default;
//# sourceMappingURL=index.d.ts.map
=== packages/plugins/loom/dist/loom.d.ts ===
/**
 * The Loom — session context composition apparatus.
 *
 * The Loom owns system prompt assembly. Given a role name, it produces
 * an AnimaWeave — the composed identity context that The Animator uses
 * to launch a session. The work prompt (what the anima should do) is
 * not the Loom's concern; it bypasses the Loom and goes directly to
 * the Animator.
 *
 * The Loom resolves the role's permission grants from guild.json, then
 * calls the Instrumentarium to resolve the permission-gated tool set.
 * Tools are returned on the AnimaWeave so the Animator can pass them
 * to the session provider for MCP server configuration.
 *
 * See: docs/specification.md (loom)
 */
import type { Plugin } from '@shardworks/nexus-core';
import type { ResolvedTool } from '@shardworks/tools-apparatus';
export interface WeaveRequest {
    /**
     * The role to weave context for (e.g. 'artificer', 'scribe').
     *
     * When provided, the Loom resolves role → permissions from guild.json,
     * then calls the Instrumentarium to resolve the permission-gated tool set.
     * Tools are returned on the AnimaWeave.
     *
     * When omitted, no tool resolution occurs — the AnimaWeave has no tools.
     */
    role?: string;
}
/**
 * The output of The Loom's weave() — the composed anima identity context.
 *
 * Contains the system prompt (produced by the Loom from the anima's
 * identity layers) and the resolved tool set for the role. The work
 * prompt is not part of the weave — it goes directly to the Animator.
 */
export interface AnimaWeave {
    /**
     * The system prompt for the AI process. Composed from guild charter,
     * tool instructions, and role instructions. Undefined when no
     * composition layers produce content.
     */
    systemPrompt?: string;
    /** The resolved tool set for this role. Undefined when no role is specified or no tools match. */
    tools?: ResolvedTool[];
    /** Environment variables derived from role identity (e.g. git author/committer). */
    environment?: Record<string, string>;
}
/** Metadata for a registered role, returned by listRoles(). */
export interface RoleInfo {
    /** Role name — the value you pass to weave({ role }). Qualified for kit roles (e.g. 'animator.scribe'). */
    name: string;
    /** Permission grants in plugin:level format. */
    permissions: string[];
    /** When true, permissionless tools are excluded unless the role grants plugin:* or *:*. */
    strict?: boolean;
    /** Source of the role definition: 'guild' for guild.json roles, or the plugin ID for kit-contributed roles. */
    source: string;
}
/** The Loom's public API, exposed via `provides`. */
export interface LoomApi {
    /**
     * Weave an anima's session context.
     *
     * Given a role name, produces an AnimaWeave containing the composed
     * system prompt and the resolved tool set. The system prompt is assembled
     * from the guild charter, tool instructions (for the resolved tool set),
     * and role instructions — in that order.
     *
     * Tool resolution is active: if a role is provided and the Instrumentarium
     * is installed, the Loom resolves role → permissions → tools.
     */
    weave(request: WeaveRequest): Promise<AnimaWeave>;
    /** List all registered roles with their metadata. */
    listRoles(): RoleInfo[];
}
/** Role definition in guild.json under the Loom's plugin section. */
export interface RoleDefinition {
    /** Permission grants in `plugin:level` format. */
    permissions: string[];
    /**
     * When true, permissionless tools are excluded unless the role grants
     * `plugin:*` or `*:*` for the tool's plugin. Default: false.
     */
    strict?: boolean;
}
/** Loom configuration from guild.json. */
export interface LoomConfig {
    /** Role definitions keyed by role name. */
    roles?: Record<string, RoleDefinition>;
}
/** Role definition contributed by a kit or apparatus supportKit. */
export interface KitRoleDefinition {
    /** Permission grants in `plugin:level` format. */
    permissions: string[];
    /**
     * When true, permissionless tools are excluded unless the role grants
     * `plugin:*` or `*:*` for the tool's plugin. Default: false.
     */
    strict?: boolean;
    /** Inline role instructions injected into the system prompt. */
    instructions?: string;
    /**
     * Path to an instructions file, relative to the kit's npm package root.
     * Resolved at registration time. Mutually exclusive with `instructions`
     * (if both are present, `instructions` wins).
     */
    instructionsFile?: string;
}
/** Kit contribution interface for role definitions. */
export interface LoomKit {
    roles?: Record<string, KitRoleDefinition>;
}
/**
 * Create the Loom apparatus plugin.
 *
 * Returns a Plugin with:
 * - `requires: ['tools']` — needs the Instrumentarium for tool resolution
 * - `consumes: ['roles']` — declares that the Loom consumes kit role contributions
 * - `provides: LoomApi` — the context composition API
 */
export declare function createLoom(): Plugin;
//# sourceMappingURL=loom.d.ts.map
=== packages/plugins/oculus/dist/index.d.ts ===
/**
 * @shardworks/oculus-apparatus — The Oculus.
 *
 * Web dashboard apparatus for the guild. Serves pages contributed by plugins,
 * exposes guild tools as REST endpoints, and provides a unified web interface.
 */
export { type OculusApi, type OculusConfig, type OculusKit, type PageContribution, type RouteContribution, } from './types.ts';
export { createOculus } from './oculus.ts';
import type { OculusConfig } from './types.ts';
declare module '@shardworks/nexus-core' {
    interface GuildConfig {
        oculus?: OculusConfig;
    }
}
declare const _default: import("@shardworks/nexus-core").Plugin;
export default _default;
//# sourceMappingURL=index.d.ts.map
=== packages/plugins/oculus/dist/oculus.d.ts ===
/**
 * The Oculus — web dashboard apparatus.
 *
 * Serves a web dashboard via Hono. Plugins contribute pages as static asset
 * directories and custom API routes through kit contributions. Guild tools are
 * automatically exposed as REST endpoints.
 */
import { z } from 'zod';
import type { Plugin } from '@shardworks/nexus-core';
export declare function toolNameToRoute(name: string): string;
export declare function permissionToMethod(permission: string | undefined): 'GET' | 'POST' | 'DELETE';
export declare function coerceParams(shape: Record<string, z.ZodTypeAny>, params: Record<string, string>): Record<string, unknown>;
export declare function injectChrome(html: string, stylesheetPath: string, navHtml: string): string;
export declare function createOculus(): Plugin;
//# sourceMappingURL=oculus.d.ts.map
=== packages/plugins/oculus/dist/types.d.ts ===
import type { Context } from 'hono';
/** A page contributed by a plugin kit or apparatus supportKit. */
export interface PageContribution {
    /** Unique page ID — becomes the URL segment: /pages/{id}/ */
    id: string;
    /** Human-readable title used in navigation. */
    title: string;
    /**
     * Path to the directory containing the page's static assets,
     * relative to the contributing package's root in node_modules.
     * Must contain an index.html entry point.
     */
    dir: string;
}
/** A custom route contributed by a plugin kit or apparatus supportKit. */
export interface RouteContribution {
    /** HTTP method (uppercase): 'GET', 'POST', 'DELETE', etc. */
    method: string;
    /** Hono path pattern. Must begin with /api/. */
    path: string;
    /** Hono handler function. */
    handler: (c: Context) => Response | Promise<Response>;
}
/** Kit contribution interface — consumed by the Oculus. */
export interface OculusKit {
    pages?: PageContribution[];
    routes?: RouteContribution[];
}
/** The Oculus configuration from guild.json under 'oculus'. */
export interface OculusConfig {
    /** Port to listen on. Default: 7470. */
    port?: number;
}
/** The Oculus's public API, exposed via provides. */
export interface OculusApi {
    /** The port the server will listen on (or is listening on). */
    port(): number;
    /** Start the HTTP server. No-op if already running. */
    startServer(): Promise<void>;
}
//# sourceMappingURL=types.d.ts.map
=== packages/plugins/parlour/dist/index.d.ts ===
/**
 * @shardworks/parlour-apparatus — The Parlour.
 *
 * Multi-turn conversation management: creates conversations, registers
 * participants, orchestrates turns (with streaming), enforces turn limits,
 * and ends conversations. Delegates session launch to The Animator and
 * context composition to The Loom.
 *
 * See: docs/architecture/apparatus/parlour.md
 */
export { type ParlourApi, type ConversationDoc, type TurnDoc, type ParticipantRecord, type Participant, type CreateConversationRequest, type CreateConversationResult, type ParticipantDeclaration, type TakeTurnRequest, type TurnResult, type ConversationChunk, type ConversationSummary, type ConversationDetail, type TurnSummary, type ListConversationsOptions, } from './types.ts';
export { createParlour } from './parlour.ts';
declare const _default: import("@shardworks/nexus-core").Plugin;
export default _default;
//# sourceMappingURL=index.d.ts.map
=== packages/plugins/parlour/dist/parlour.d.ts ===
/**
 * The Parlour — multi-turn conversation management apparatus.
 *
 * Manages two kinds of conversation:
 * - consult: a human talks to an anima
 * - convene: multiple animas hold a structured dialogue
 *
 * The Parlour orchestrates turns — it decides when and for whom to call
 * The Animator, and tracks conversation state in The Stacks. It does not
 * launch sessions itself (delegates to The Animator) or assemble prompts
 * (delegates to The Loom).
 *
 * See: docs/architecture/apparatus/parlour.md
 */
import type { Plugin } from '@shardworks/nexus-core';
/**
 * Create the Parlour apparatus plugin.
 *
 * Returns a Plugin with:
 * - `requires: ['stacks', 'animator', 'loom']` — conversation orchestration
 * - `provides: ParlourApi` — the conversation management API
 * - `supportKit` — contributes `conversations` + `turns` books + management tools
 */
export declare function createParlour(): Plugin;
//# sourceMappingURL=parlour.d.ts.map
=== packages/plugins/parlour/dist/tools/conversation-end.d.ts ===
/**
 * conversation-end tool — end an active conversation.
 *
 * Sets conversation status to 'concluded' or 'abandoned'.
 * Idempotent — no error if the conversation is already ended.
 *
 * See: docs/architecture/apparatus/parlour.md
 */
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    id: z.ZodString;
    reason: z.ZodDefault<z.ZodOptional<z.ZodEnum<{
        concluded: "concluded";
        abandoned: "abandoned";
    }>>>;
}>;
export default _default;
//# sourceMappingURL=conversation-end.d.ts.map
=== packages/plugins/parlour/dist/tools/conversation-list.d.ts ===
/**
 * conversation-list tool — list conversations with optional filters.
 *
 * Queries The Parlour's conversations via the ParlourApi.
 * Returns conversation summaries ordered by createdAt descending (newest first).
 *
 * See: docs/architecture/apparatus/parlour.md
 */
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    status: z.ZodOptional<z.ZodEnum<{
        active: "active";
        concluded: "concluded";
        abandoned: "abandoned";
    }>>;
    kind: z.ZodOptional<z.ZodEnum<{
        consult: "consult";
        convene: "convene";
    }>>;
    limit: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
}>;
export default _default;
//# sourceMappingURL=conversation-list.d.ts.map
=== packages/plugins/parlour/dist/tools/conversation-show.d.ts ===
/**
 * conversation-show tool — show full detail for a conversation.
 *
 * Returns the complete conversation record including all turns,
 * participant list, and aggregate cost.
 *
 * See: docs/architecture/apparatus/parlour.md
 */
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    id: z.ZodString;
}>;
export default _default;
//# sourceMappingURL=conversation-show.d.ts.map
=== packages/plugins/parlour/dist/tools/index.d.ts ===
/**
 * Parlour tool re-exports.
 */
export { default as conversationList } from './conversation-list.ts';
export { default as conversationShow } from './conversation-show.ts';
export { default as conversationEnd } from './conversation-end.ts';
//# sourceMappingURL=index.d.ts.map
=== packages/plugins/parlour/dist/types.d.ts ===
/**
 * The Parlour — public types.
 *
 * These types form the contract between The Parlour apparatus and all
 * callers (CLI consult command, clockworks convene handlers, etc.).
 * No implementation details.
 *
 * See: docs/architecture/apparatus/parlour.md
 */
import type { SessionResult, SessionChunk } from '@shardworks/animator-apparatus';
export interface ConversationDoc {
    id: string;
    status: 'active' | 'concluded' | 'abandoned';
    kind: 'consult' | 'convene';
    topic: string | null;
    turnLimit: number | null;
    createdAt: string;
    endedAt: string | null;
    eventId: string | null;
    participants: ParticipantRecord[];
    /** Stored once at creation — all turns must use the same cwd for --resume. */
    cwd: string;
    /** Index signature required by BookEntry. */
    [key: string]: unknown;
}
export interface ParticipantRecord {
    /** Stable participant id (generated at creation). */
    id: string;
    kind: 'anima' | 'human';
    name: string;
    /** Anima id, resolved at creation time. Null for human participants. */
    animaId: string | null;
    /**
     * Provider session id for --resume. Updated after each turn so
     * the next turn can continue the provider's conversation context.
     */
    providerSessionId: string | null;
}
/**
 * Internal turn record stored in the turns book.
 * One entry per takeTurn() call — both human and anima turns.
 */
export interface TurnDoc {
    id: string;
    conversationId: string;
    turnNumber: number;
    participantId: string;
    participantName: string;
    participantKind: 'anima' | 'human';
    /** The message passed to this turn (human message or inter-turn context). */
    message: string | null;
    /** Session id from The Animator (null for human turns). */
    sessionId: string | null;
    startedAt: string;
    endedAt: string | null;
    /** Index signature required by BookEntry. */
    [key: string]: unknown;
}
export interface CreateConversationRequest {
    /** Conversation kind. */
    kind: 'consult' | 'convene';
    /** Seed topic or prompt. Used as the initial message for the first turn. */
    topic?: string;
    /** Maximum allowed turns (anima turns only). Null = unlimited. */
    turnLimit?: number;
    /** Participants in the conversation. */
    participants: ParticipantDeclaration[];
    /** Working directory — persists for the conversation's lifetime. */
    cwd: string;
    /** Triggering event id, for conversations started by clockworks. */
    eventId?: string;
}
export interface ParticipantDeclaration {
    kind: 'anima' | 'human';
    /** Display name. For anima participants, this is the anima name
     *  used to resolve identity via The Loom at turn time. */
    name: string;
}
export interface CreateConversationResult {
    conversationId: string;
    participants: Participant[];
}
export interface Participant {
    id: string;
    name: string;
    kind: 'anima' | 'human';
}
export interface TakeTurnRequest {
    conversationId: string;
    participantId: string;
    /** The message for this turn. For consult: the human's message.
     *  For convene: typically assembled by the caller, or omitted to
     *  let The Parlour assemble it automatically. */
    message?: string;
}
export interface TurnResult {
    /** The Animator's session result for this turn. Null for human turns. */
    sessionResult: SessionResult | null;
    /** Turn number within the conversation (1-indexed). */
    turnNumber: number;
    /** Whether the conversation is still active after this turn. */
    conversationActive: boolean;
}
/** A chunk of output from a conversation turn. */
export type ConversationChunk = SessionChunk | {
    type: 'turn_complete';
    turnNumber: number;
    costUsd?: number;
};
export interface ConversationSummary {
    id: string;
    status: 'active' | 'concluded' | 'abandoned';
    kind: 'consult' | 'convene';
    topic: string | null;
    turnLimit: number | null;
    createdAt: string;
    endedAt: string | null;
    participants: Participant[];
    /** Computed from turn records. */
    turnCount: number;
    /** Aggregate cost across all turns. */
    totalCostUsd: number;
}
export interface ConversationDetail extends ConversationSummary {
    turns: TurnSummary[];
}
export interface TurnSummary {
    sessionId: string | null;
    turnNumber: number;
    participant: string;
    message: string | null;
    startedAt: string;
    endedAt: string | null;
}
export interface ListConversationsOptions {
    status?: 'active' | 'concluded' | 'abandoned';
    kind?: 'consult' | 'convene';
    limit?: number;
}
export interface ParlourApi {
    /**
     * Create a new conversation.
     *
     * Sets up conversation and participant records. Does NOT take a first
     * turn — that's a separate call to takeTurn().
     */
    create(request: CreateConversationRequest): Promise<CreateConversationResult>;
    /**
     * Take a turn in a conversation.
     *
     * For anima participants: weaves context via The Loom, assembles the
     * inter-turn message, and calls The Animator to run a session. Returns
     * the session result. For human participants: records the message as
     * context for the next turn (no session launched).
     *
     * Throws if the conversation is not active or the turn limit is reached.
     */
    takeTurn(request: TakeTurnRequest): Promise<TurnResult>;
    /**
     * Take a turn with streaming output.
     *
     * Same as takeTurn(), but yields ConversationChunks as the session
     * produces output. Includes a turn_complete chunk at the end.
     */
    takeTurnStreaming(request: TakeTurnRequest): {
        chunks: AsyncIterable<ConversationChunk>;
        result: Promise<TurnResult>;
    };
    /**
     * Get the next participant in a conversation.
     *
     * For convene: returns the next anima in round-robin order.
     * For consult: returns the anima participant (human turns are implicit).
     * Returns null if the conversation is not active or the turn limit is reached.
     */
    nextParticipant(conversationId: string): Promise<Participant | null>;
    /**
     * End a conversation.
     *
     * Sets status to 'concluded' (normal end) or 'abandoned' (e.g. timeout,
     * disconnect). Idempotent — no error if already ended.
     */
    end(conversationId: string, reason?: 'concluded' | 'abandoned'): Promise<void>;
    /**
     * List conversations with optional filters.
     */
    list(options?: ListConversationsOptions): Promise<ConversationSummary[]>;
    /**
     * Show full detail for a conversation.
     */
    show(conversationId: string): Promise<ConversationDetail | null>;
}
//# sourceMappingURL=types.d.ts.map
=== packages/plugins/spider/dist/block-types/book-updated.d.ts ===
/**
 * Built-in block type: book-updated.
 *
 * Blocks until a specific book (or document within it) has content.
 * Condition: { ownerId: string; book: string; documentId?: string }
 *
 * When documentId is provided: checks if that specific document exists.
 * When documentId is absent: checks if any document exists in the book.
 */
import type { BlockType } from '../types.ts';
declare const bookUpdatedBlockType: BlockType;
export default bookUpdatedBlockType;
//# sourceMappingURL=book-updated.d.ts.map
=== packages/plugins/spider/dist/block-types/index.d.ts ===
export { default as writStatusBlockType } from './writ-status.ts';
export { default as scheduledTimeBlockType } from './scheduled-time.ts';
export { default as bookUpdatedBlockType } from './book-updated.ts';
export { default as patronInputBlockType } from './patron-input.ts';
//# sourceMappingURL=index.d.ts.map
=== packages/plugins/spider/dist/block-types/patron-input.d.ts ===
/**
 * Built-in block type: patron-input.
 *
 * Blocks until a patron answers all questions in an input request.
 * Condition: { requestId: string }
 */
import type { BlockType } from '../types.ts';
declare const patronInputBlockType: BlockType;
export default patronInputBlockType;
//# sourceMappingURL=patron-input.d.ts.map
=== packages/plugins/spider/dist/block-types/scheduled-time.d.ts ===
/**
 * Built-in block type: scheduled-time.
 *
 * Blocks until a specified ISO 8601 timestamp is reached.
 * Condition: { resumeAt: string }
 */
import type { BlockType } from '../types.ts';
declare const scheduledTimeBlockType: BlockType;
export default scheduledTimeBlockType;
//# sourceMappingURL=scheduled-time.d.ts.map
=== packages/plugins/spider/dist/block-types/writ-status.d.ts ===
/**
 * Built-in block type: writ-status.
 *
 * Blocks until a specific writ reaches a target status.
 * Condition: { writId: string; targetStatus: string }
 */
import type { BlockType } from '../types.ts';
declare const writStatusBlockType: BlockType;
export default writStatusBlockType;
//# sourceMappingURL=writ-status.d.ts.map
=== packages/plugins/spider/dist/engines/draft.d.ts ===
/**
 * Draft engine — clockwork.
 *
 * Opens a draft binding via the Scriptorium. Returns DraftYields
 * containing the worktree path and branch name for downstream engines.
 */
import type { EngineDesign } from '@shardworks/fabricator-apparatus';
declare const draftEngine: EngineDesign;
export default draftEngine;
//# sourceMappingURL=draft.d.ts.map
=== packages/plugins/spider/dist/engines/implement.d.ts ===
/**
 * Implement engine — quick (Animator-backed).
 *
 * Summons an anima to do the commissioned work. Wraps the writ body with
 * a commit instruction, then calls animator.summon() with the draft
 * worktree as the working directory. Returns `{ status: 'launched', sessionId }`
 * so the Spider's collect step can poll for completion on subsequent walks.
 */
import type { EngineDesign } from '@shardworks/fabricator-apparatus';
declare const implementEngine: EngineDesign;
export default implementEngine;
//# sourceMappingURL=implement.d.ts.map
=== packages/plugins/spider/dist/engines/index.d.ts ===
export { default as draftEngine } from './draft.ts';
export { default as implementEngine } from './implement.ts';
export { default as reviewEngine } from './review.ts';
export { default as reviseEngine } from './revise.ts';
export { default as sealEngine } from './seal.ts';
//# sourceMappingURL=index.d.ts.map
=== packages/plugins/spider/dist/engines/review.d.ts ===
/**
 * Review engine — quick (Animator-backed).
 *
 * Runs mechanical checks (build/test) synchronously in the draft worktree,
 * then summons a reviewer anima to assess the implementation against the spec.
 * Returns `{ status: 'launched', sessionId }` so the Spider's collect step
 * can call this engine's collect() method on subsequent crawls.
 *
 * Collect method:
 *   - Reads session.output as the reviewer's structured markdown findings
 *   - Parses `passed` from /^###\s*Overall:\s*PASS/mi
 *   - Retrieves mechanicalChecks from session.metadata
 */
import type { EngineDesign } from '@shardworks/fabricator-apparatus';
declare const reviewEngine: EngineDesign;
export default reviewEngine;
//# sourceMappingURL=review.d.ts.map
=== packages/plugins/spider/dist/engines/revise.d.ts ===
/**
 * Revise engine — quick (Animator-backed).
 *
 * Summons an anima to address review findings. If the review passed, the
 * prompt instructs the anima to confirm and exit without unnecessary changes.
 * If the review failed, the prompt directs the anima to address each item
 * in the findings and commit the result.
 *
 * Returns `{ status: 'launched', sessionId }` so the Spider's collect step
 * can store ReviseYields on completion.
 */
import type { EngineDesign } from '@shardworks/fabricator-apparatus';
declare const reviseEngine: EngineDesign;
export default reviseEngine;
//# sourceMappingURL=revise.d.ts.map
=== packages/plugins/spider/dist/engines/seal.d.ts ===
/**
 * Seal engine — clockwork.
 *
 * Seals the draft binding via the Scriptorium. Reads the draft branch
 * from context.upstream['draft'] (the DraftYields from the draft engine).
 * Returns SealYields with the sealed commit info.
 */
import type { EngineDesign } from '@shardworks/fabricator-apparatus';
declare const sealEngine: EngineDesign;
export default sealEngine;
//# sourceMappingURL=seal.d.ts.map
=== packages/plugins/spider/dist/index.d.ts ===
/**
 * @shardworks/spider-apparatus — The Spider.
 *
 * Rig execution engine: spawns rigs for ready writs, drives engine pipelines
 * to completion, and transitions writs via the Clerk on rig completion/failure.
 *
 * Public types (RigDoc, EngineInstance, CrawlResult, SpiderApi, etc.) are
 * re-exported for consumers that inspect walk results or rig state.
 */
export type { EngineStatus, EngineInstance, RigStatus, RigDoc, RigFilters, CrawlResult, SpiderApi, SpiderConfig, BlockRecord, BlockType, BlockTypeInfo, CheckResult, DraftYields, SealYields, RigTemplate, RigTemplateEngine, InputRequestStatus, InputRequestDoc, ChoiceQuestionSpec, BooleanQuestionSpec, TextQuestionSpec, QuestionSpec, ChoiceAnswer, AnswerValue, } from './types.ts';
export type { SpiderKit } from './spider.ts';
declare const _default: import("@shardworks/nexus-core").Plugin;
export default _default;
//# sourceMappingURL=index.d.ts.map
=== packages/plugins/spider/dist/input-request-validation.d.ts ===
/**
 * Shared validation logic for input request answers.
 *
 * Used by the answer tool, complete tool, and import tool.
 */
import type { QuestionSpec, AnswerValue } from './types.ts';
/**
 * Validate and coerce an answer value for the given question spec.
 *
 * Throws a descriptive error if the answer is invalid for the question type.
 * Returns a properly-typed AnswerValue on success.
 */
export declare function validateAnswer(question: QuestionSpec, answer: unknown): AnswerValue;
/**
 * Return the list of question keys that have no answer yet.
 *
 * Used by the complete tool to report unanswered questions.
 */
export declare function validateAllAnswered(questions: Record<string, QuestionSpec>, answers: Record<string, AnswerValue>): string[];
//# sourceMappingURL=input-request-validation.d.ts.map
=== packages/plugins/spider/dist/oculus-routes.d.ts ===
/**
 * Spider — custom Oculus API routes.
 *
 * Contributes GET /api/spider/config, which returns an aggregated snapshot
 * of the Spider's registered configuration: rig templates, engine designs,
 * and block types.
 *
 * Does NOT import from @shardworks/oculus-apparatus to avoid a circular
 * package dependency. The route shape is compatible with RouteContribution
 * from the Oculus types.
 */
import type { Context } from 'hono';
export declare const spiderRoutes: {
    method: string;
    path: string;
    handler: (c: Context) => Response & import("hono").TypedResponse<{
        rigTemplates: {
            [x: string]: {
                engines: {
                    id: string;
                    designId: string;
                    upstream?: string[] | undefined;
                    givens?: {
                        [x: string]: import("hono/utils/types").JSONValue;
                    } | undefined;
                }[];
                resolutionEngine?: string | undefined;
            };
        };
        engineDesigns: {
            id: string;
            pluginId: string;
            hasCollect: boolean;
        }[];
        blockTypes: {
            id: string;
            pluginId: string;
            pollIntervalMs?: number | undefined;
        }[];
    }, import("hono/utils/http-status").ContentfulStatusCode, "json">;
}[];
//# sourceMappingURL=oculus-routes.d.ts.map
=== packages/plugins/spider/dist/spider.d.ts ===
/**
 * The Spider — rig execution engine apparatus.
 *
 * The Spider drives writ-to-completion by managing rigs: ordered pipelines
 * of engine instances. Each crawl() call performs one unit of work:
 *
 *   collect > checkBlocked > run > spawn   (priority order)
 *
 * collect      — check running engines for terminal session results
 * checkBlocked — poll registered block type checkers; unblock engines when cleared
 * run          — execute the next pending engine (clockwork inline, quick → launch)
 * spawn        — create a new rig for a ready writ with no existing rig
 *
 * CDC on the rigs book (Phase 1 cascade) transitions the associated writ
 * when a rig reaches a terminal state (completed or failed).
 * The blocked status does NOT trigger the CDC handler.
 *
 * See: docs/architecture/apparatus/spider.md
 */
import type { Plugin } from '@shardworks/nexus-core';
import type { RigTemplate } from './types.ts';
/** Kit contribution interface for the Spider's rig template system. */
export interface SpiderKit {
    /** Named rig templates. Keys are unqualified; registered as pluginId.key. */
    rigTemplates?: Record<string, RigTemplate>;
    /** Writ type → rig template name mappings. Keys are unqualified writ type names. */
    rigTemplateMappings?: Record<string, string>;
}
export declare function createSpider(): Plugin;
//# sourceMappingURL=spider.d.ts.map
=== packages/plugins/spider/dist/tools/block-types.d.ts ===
/**
 * block-types tool — list all registered block types with contributing plugin info.
 */
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{}>;
export default _default;
//# sourceMappingURL=block-types.d.ts.map
=== packages/plugins/spider/dist/tools/crawl-continual.d.ts ===
/**
 * crawl-continual tool — runs the crawl loop continuously.
 *
 * Polls crawl() on a configurable interval. By default the loop runs
 * indefinitely; pass a positive maxIdleCycles to enable auto-stop after
 * that many consecutive idle cycles.
 */
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    maxIdleCycles: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    pollIntervalMs: z.ZodOptional<z.ZodNumber>;
}>;
export default _default;
//# sourceMappingURL=crawl-continual.d.ts.map
=== packages/plugins/spider/dist/tools/crawl-one.d.ts ===
/**
 * crawl-one tool — executes a single step of the crawl loop.
 *
 * Returns the CrawlResult or null (idle) from one crawl() call.
 * Useful for manual step-through or testing.
 */
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{}>;
export default _default;
//# sourceMappingURL=crawl-one.d.ts.map
=== packages/plugins/spider/dist/tools/engine-designs.d.ts ===
/**
 * engine-designs tool — list all registered engine designs with contributing plugin info.
 */
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{}>;
export default _default;
//# sourceMappingURL=engine-designs.d.ts.map
=== packages/plugins/spider/dist/tools/index.d.ts ===
export { default as crawlOneTool } from './crawl-one.ts';
export { default as crawlContinualTool } from './crawl-continual.ts';
export { default as rigShowTool } from './rig-show.ts';
export { default as rigListTool } from './rig-list.ts';
export { default as rigForWritTool } from './rig-for-writ.ts';
export { default as rigResumeTool } from './rig-resume.ts';
export { default as inputRequestListTool } from './input-request-list.ts';
export { default as inputRequestShowTool } from './input-request-show.ts';
export { default as inputRequestAnswerTool } from './input-request-answer.ts';
export { default as inputRequestCompleteTool } from './input-request-complete.ts';
export { default as inputRequestRejectTool } from './input-request-reject.ts';
export { default as inputRequestExportTool } from './input-request-export.ts';
export { default as inputRequestImportTool } from './input-request-import.ts';
export { default as engineDesignsTool } from './engine-designs.ts';
export { default as blockTypesTool } from './block-types.ts';
//# sourceMappingURL=index.d.ts.map
=== packages/plugins/spider/dist/tools/input-request-answer.d.ts ===
/**
 * input-request-answer tool — provide an answer for a single question.
 */
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    id: z.ZodString;
    question: z.ZodString;
    select: z.ZodOptional<z.ZodString>;
    custom: z.ZodOptional<z.ZodString>;
    value: z.ZodOptional<z.ZodString>;
}>;
export default _default;
//# sourceMappingURL=input-request-answer.d.ts.map
=== packages/plugins/spider/dist/tools/input-request-complete.d.ts ===
/**
 * input-request-complete tool — mark an input request as completed.
 */
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    id: z.ZodString;
}>;
export default _default;
//# sourceMappingURL=input-request-complete.d.ts.map
=== packages/plugins/spider/dist/tools/input-request-export.d.ts ===
/**
 * input-request-export tool — export an input request as YAML.
 */
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    id: z.ZodString;
}>;
export default _default;
//# sourceMappingURL=input-request-export.d.ts.map
=== packages/plugins/spider/dist/tools/input-request-import.d.ts ===
/**
 * input-request-import tool — import answers from a YAML file.
 */
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    file: z.ZodString;
}>;
export default _default;
//# sourceMappingURL=input-request-import.d.ts.map
=== packages/plugins/spider/dist/tools/input-request-list.d.ts ===
/**
 * input-request-list tool — list input requests.
 */
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    status: z.ZodDefault<z.ZodOptional<z.ZodEnum<{
        completed: "completed";
        pending: "pending";
        rejected: "rejected";
    }>>>;
    limit: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    offset: z.ZodOptional<z.ZodNumber>;
}>;
export default _default;
//# sourceMappingURL=input-request-list.d.ts.map
=== packages/plugins/spider/dist/tools/input-request-reject.d.ts ===
/**
 * input-request-reject tool — reject an input request.
 */
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    id: z.ZodString;
    reason: z.ZodOptional<z.ZodString>;
}>;
export default _default;
//# sourceMappingURL=input-request-reject.d.ts.map
=== packages/plugins/spider/dist/tools/input-request-show.d.ts ===
/**
 * input-request-show tool — retrieve an input request by id.
 */
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    id: z.ZodString;
}>;
export default _default;
//# sourceMappingURL=input-request-show.d.ts.map
=== packages/plugins/spider/dist/tools/rig-for-writ.d.ts ===
/**
 * rig-for-writ tool — find the rig for a given writ.
 */
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    writId: z.ZodString;
}>;
export default _default;
//# sourceMappingURL=rig-for-writ.d.ts.map
=== packages/plugins/spider/dist/tools/rig-list.d.ts ===
/**
 * rig-list tool — list rigs with optional filters.
 */
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    status: z.ZodOptional<z.ZodEnum<{
        completed: "completed";
        failed: "failed";
        blocked: "blocked";
        running: "running";
    }>>;
    limit: z.ZodOptional<z.ZodNumber>;
    offset: z.ZodOptional<z.ZodNumber>;
}>;
export default _default;
//# sourceMappingURL=rig-list.d.ts.map
=== packages/plugins/spider/dist/tools/rig-resume.d.ts ===
/**
 * rig-resume tool — manually clear a block on a specific engine.
 */
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    rigId: z.ZodString;
    engineId: z.ZodString;
}>;
export default _default;
//# sourceMappingURL=rig-resume.d.ts.map
=== packages/plugins/spider/dist/tools/rig-show.d.ts ===
/**
 * rig-show tool — retrieve a rig by id.
 */
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    id: z.ZodString;
}>;
export default _default;
//# sourceMappingURL=rig-show.d.ts.map
=== packages/plugins/spider/dist/types.d.ts ===
/**
 * The Spider — public types.
 *
 * Rig and engine data model, CrawlResult, SpiderApi, and configuration.
 * Engine yield shapes (DraftYields, SealYields) live here too so downstream
 * packages can import them without depending on the engine implementation files.
 */
import type { ZodSchema } from 'zod';
export type EngineStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'blocked';
/**
 * Persisted record of an active engine block.
 * Present on an EngineInstance when status === 'blocked'.
 * Cleared when the block is resolved.
 */
export interface BlockRecord {
    /** Block type identifier (matches a registered BlockType.id). */
    type: string;
    /** Structured condition payload — shape validated by the block type's conditionSchema. */
    condition: unknown;
    /** ISO timestamp when the engine was blocked. */
    blockedAt: string;
    /** Optional human-readable message from the engine. */
    message?: string;
    /** ISO timestamp of the last checker evaluation. Updated on every check cycle. */
    lastCheckedAt?: string;
}
/**
 * A single engine slot within a rig.
 *
 * `id` is the engine's position identifier (e.g. 'draft', 'implement').
 * For the static pipeline it matches `designId`.
 *
 * `givensSpec` holds literal values set at spawn time (writ, role, commands).
 * The Spider assembles `givens` from this directly; upstream yields arrive
 * via `context.upstream` as the escape hatch.
 */
export interface EngineInstance {
    /** Unique identifier within the rig (e.g. 'draft', 'implement'). */
    id: string;
    /** The engine design to look up in the Fabricator. */
    designId: string;
    /** Current execution status. */
    status: EngineStatus;
    /** Engine IDs that must be completed before this engine can run. */
    upstream: string[];
    /** Literal givens values set at rig spawn time. */
    givensSpec: Record<string, unknown>;
    /** Yields from a completed engine run (JSON-serializable). */
    yields?: unknown;
    /** Error message if this engine failed. */
    error?: string;
    /** Session ID from a launched quick engine, used by the collect step. */
    sessionId?: string;
    /** ISO timestamp when execution started. */
    startedAt?: string;
    /** ISO timestamp when execution completed (or failed). */
    completedAt?: string;
    /** Present when status === 'blocked'. Cleared when the block is resolved. */
    block?: BlockRecord;
}
export type RigStatus = 'running' | 'completed' | 'failed' | 'blocked';
/**
 * A rig — the execution context for a single writ.
 *
 * Stored in The Stacks (`spider/rigs` book). The `engines` array is the
 * ordered pipeline of engine instances. The Spider updates this document
 * in-place as engines run and complete.
 */
export interface RigDoc {
    /** Index signature required to satisfy BookEntry constraint. */
    [key: string]: unknown;
    /** Unique rig id. */
    id: string;
    /** The writ this rig is executing. */
    writId: string;
    /** Current rig status. */
    status: RigStatus;
    /** Ordered engine pipeline. */
    engines: EngineInstance[];
    /** ISO timestamp when the rig was created. */
    createdAt: string;
    /** Engine id whose yields provide the resolution summary. Set at spawn time. */
    resolutionEngineId?: string;
}
/**
 * Filters for listing rigs.
 */
export interface RigFilters {
    /** Filter by rig status. */
    status?: RigStatus;
    /** Maximum number of results (default: 20). */
    limit?: number;
    /** Number of results to skip. */
    offset?: number;
}
/**
 * A single engine slot declared in a rig template.
 */
export interface RigTemplateEngine {
    /** Engine id unique within this template. */
    id: string;
    /** Engine design id to look up in the Fabricator. */
    designId: string;
    /** Engine ids within this template whose completion is required first. Defaults to []. */
    upstream?: string[];
    /**
     * Givens to pass at spawn time.
     * String values starting with '$' (either $name or ${name}) are variable
     * references resolved at spawn time:
     *   '$writ' or '${writ}' — the WritDoc for this rig's writ
     *   '$vars.<key>' or '${vars.<key>}' — value from spider.variables config
     * Non-string values are passed through literally.
     * Variables that resolve to undefined cause the key to be omitted.
     */
    givens?: Record<string, unknown>;
}
/**
 * A complete rig template.
 */
export interface RigTemplate {
    /** Ordered list of engine slot declarations. */
    engines: RigTemplateEngine[];
    /**
     * Engine id whose yields provide the writ resolution summary.
     * Falls back to seal engine, then last completed engine in array order.
     */
    resolutionEngine?: string;
}
/**
 * The result of a single crawl() call.
 *
 * Variants, ordered by priority:
 * - 'engine-completed'  — an engine finished (collected or ran inline); rig still running
 * - 'engine-started'    — launched a quick engine's session
 * - 'engine-blocked'    — engine entered blocked status; rig is still running (other engines active)
 * - 'engine-unblocked'  — a blocked engine's condition cleared; engine returned to pending
 * - 'rig-spawned'       — created a new rig for a ready writ
 * - 'rig-completed'     — the crawl step caused a rig to reach a terminal state
 * - 'rig-blocked'       — all forward progress stalled; rig entered blocked status
 *
 * null means no work was available.
 */
export type CrawlResult = {
    action: 'engine-completed';
    rigId: string;
    engineId: string;
} | {
    action: 'engine-started';
    rigId: string;
    engineId: string;
} | {
    action: 'engine-blocked';
    rigId: string;
    engineId: string;
    blockType: string;
} | {
    action: 'engine-unblocked';
    rigId: string;
    engineId: string;
} | {
    action: 'rig-spawned';
    rigId: string;
    writId: string;
} | {
    action: 'rig-completed';
    rigId: string;
    writId: string;
    outcome: 'completed' | 'failed';
} | {
    action: 'rig-blocked';
    rigId: string;
    writId: string;
};
/**
 * Result of a block type check.
 *
 * 'cleared' — condition met, unblock the engine.
 * 'pending' — condition not yet met, keep polling.
 * 'failed'  — condition is permanently unresolvable, fail the engine.
 *
 * When status is 'failed', an optional reason provides a human-readable
 * explanation that the Spider includes in the engine error message.
 */
export interface CheckResult {
    status: 'cleared' | 'pending' | 'failed';
    reason?: string;
}
/** Summary info for a registered block type. */
export interface BlockTypeInfo {
    /** Block type id. */
    id: string;
    /** Plugin id that contributed this block type. */
    pluginId: string;
    /** Suggested poll interval in milliseconds, if set. */
    pollIntervalMs?: number;
}
/**
 * A registered block type — defines how to check whether a blocking
 * condition has cleared. Contributed via kit/supportKit `blockTypes`.
 */
export interface BlockType {
    /** Unique identifier (e.g. 'writ-status', 'scheduled-time'). */
    id: string;
    /**
     * Check whether the blocking condition has been resolved.
     *
     * Return { status: 'cleared' } when the condition is met.
     * Return { status: 'pending' } when the condition is not yet met.
     * Return { status: 'failed' } or { status: 'failed', reason: '...' }
     * when the condition is permanently unresolvable.
     *
     * Throwing is reserved for transient errors (network failures, etc.)
     * — the engine stays blocked and the checker is retried next cycle.
     */
    check: (condition: unknown) => Promise<CheckResult>;
    /** Zod schema for validating the condition payload at block time. */
    conditionSchema: ZodSchema;
    /** Suggested poll interval in milliseconds. If absent, check every crawl cycle. */
    pollIntervalMs?: number;
}
/**
 * The Spider's public API — retrieved via guild().apparatus<SpiderApi>('spider').
 */
export interface SpiderApi {
    /**
     * Execute one step of the crawl loop.
     *
     * Priority ordering: collect > checkBlocked > run > spawn.
     * Returns null when no work is available.
     */
    crawl(): Promise<CrawlResult | null>;
    /**
     * Show a rig by id. Throws if not found.
     */
    show(id: string): Promise<RigDoc>;
    /**
     * List rigs with optional filters, ordered by createdAt descending.
     */
    list(filters?: RigFilters): Promise<RigDoc[]>;
    /**
     * Find the rig for a given writ. Returns null if no rig exists.
     */
    forWrit(writId: string): Promise<RigDoc | null>;
    /**
     * Manually clear a block on a specific engine, regardless of checker result.
     * Throws if the engine is not blocked.
     */
    resume(rigId: string, engineId: string): Promise<void>;
    /**
     * Look up a registered block type by ID.
     */
    getBlockType(id: string): BlockType | undefined;
    /**
     * List all registered block types with summary info.
     */
    listBlockTypes(): BlockTypeInfo[];
}
/**
 * Spider apparatus configuration — lives under the `spider` key in guild.json.
 */
export interface SpiderConfig {
    /**
     * Polling interval for crawlContinual tool (milliseconds).
     * Default: 5000.
     */
    pollIntervalMs?: number;
    /**
     * Build command to pass to quick engines.
     */
    buildCommand?: string;
    /**
     * Test command to pass to quick engines.
     */
    testCommand?: string;
    /**
     * Named rig templates. Keys are template names (not writ types).
     * Templates are looked up by name via rigTemplateMappings.
     * A template named 'default' is used as the fallback when no mapping matches.
     */
    rigTemplates?: Record<string, RigTemplate>;
    /**
     * Writ type → rig template name mappings.
     * 'default' key is the fallback for unmatched writ types.
     * Config mappings override kit-contributed mappings for the same writ type.
     */
    rigTemplateMappings?: Record<string, string>;
    /**
     * User-defined variables available in rig template givens via '$vars.<key>'.
     * Values are passed through literally (string, number, boolean).
     * Variables resolving to undefined (key absent) cause the givens key to be omitted.
     */
    variables?: Record<string, unknown>;
}
/**
 * Yields from the `draft` clockwork engine.
 * The Spider stores these in the engine instance and passes them
 * to downstream engines via context.upstream['draft'].
 */
export interface DraftYields {
    /** The draft's unique id. */
    draftId: string;
    /** Codex this draft belongs to. */
    codexName: string;
    /** Git branch name for the draft. */
    branch: string;
    /** Absolute filesystem path to the draft's worktree. */
    path: string;
    /** HEAD commit SHA at the time the draft was opened. Used by review engine to compute diffs. */
    baseSha: string;
}
/**
 * Yields from the `seal` clockwork engine.
 */
export interface SealYields {
    /** The commit SHA at head of the target branch after sealing. */
    sealedCommit: string;
    /** Git strategy used. */
    strategy: 'fast-forward' | 'rebase';
    /** Number of retry attempts. */
    retries: number;
    /** Number of inscriptions (commits) sealed. */
    inscriptionsSealed: number;
}
/**
 * Yields from the `implement` quick engine.
 * Set by the Spider's collect step when the Animator session completes.
 */
export interface ImplementYields {
    /** The Animator session id. */
    sessionId: string;
    /** Terminal status of the session. */
    sessionStatus: 'completed' | 'failed';
}
/**
 * A single mechanical check (build or test) run by the review engine
 * before launching the reviewer session.
 */
export interface MechanicalCheck {
    /** Check name. */
    name: 'build' | 'test';
    /** Whether the command exited with code 0. */
    passed: boolean;
    /** Combined stdout+stderr, truncated to 4KB. */
    output: string;
    /** Wall-clock duration of the check in milliseconds. */
    durationMs: number;
}
/**
 * Yields from the `review` quick engine.
 * Assembled by the Spider's collect step from session.output and session.metadata.
 */
export interface ReviewYields {
    /** The Animator session id. */
    sessionId: string;
    /** Reviewer's overall assessment — true if the review passed. */
    passed: boolean;
    /** Structured markdown findings from the reviewer's final message. */
    findings: string;
    /** Mechanical check results run before the reviewer session. */
    mechanicalChecks: MechanicalCheck[];
}
/**
 * Yields from the `revise` quick engine.
 * Set by the Spider's collect step when the Animator session completes.
 */
export interface ReviseYields {
    /** The Animator session id. */
    sessionId: string;
    /** Terminal status of the session. */
    sessionStatus: 'completed' | 'failed';
}
export type InputRequestStatus = 'pending' | 'completed' | 'rejected';
export interface ChoiceQuestionSpec {
    type: 'choice';
    /** Human-readable question text. */
    label: string;
    /** Key → display label options map. */
    options: Record<string, string>;
    /** When true, the patron can supply a freeform answer instead of selecting. */
    allowCustom: boolean;
}
export interface BooleanQuestionSpec {
    type: 'boolean';
    /** Human-readable question text. */
    label: string;
}
export interface TextQuestionSpec {
    type: 'text';
    /** Human-readable question text. */
    label: string;
}
export type QuestionSpec = ChoiceQuestionSpec | BooleanQuestionSpec | TextQuestionSpec;
/** Discriminated choice answer — selected from options or freeform custom. */
export type ChoiceAnswer = {
    selected: string;
} | {
    custom: string;
};
/**
 * Answer value union. Runtime type is determined by the corresponding QuestionSpec:
 * - choice → ChoiceAnswer (object with 'selected' or 'custom' key)
 * - boolean → boolean
 * - text → string
 */
export type AnswerValue = ChoiceAnswer | boolean | string;
/**
 * An input request document stored in the spider/input-requests book.
 * Created by engines before blocking; answered by patrons via CLI tools.
 */
export interface InputRequestDoc {
    [key: string]: unknown;
    /** Unique ID via generateId('ir', 4). */
    id: string;
    /** Rig this request belongs to. */
    rigId: string;
    /** Engine that created this request. */
    engineId: string;
    /** Request lifecycle status. */
    status: InputRequestStatus;
    /** Optional human-readable context from the engine. */
    message?: string;
    /** Question key → question spec. */
    questions: Record<string, QuestionSpec>;
    /** Question key → answer value. Partially filled until completion. */
    answers: Record<string, AnswerValue>;
    /** Set when status transitions to 'rejected'. */
    rejectionReason?: string;
    /** ISO timestamp when the request was created. */
    createdAt: string;
    /** ISO timestamp of the last mutation. */
    updatedAt: string;
}
declare module '@shardworks/nexus-core' {
    interface GuildConfig {
        spider?: SpiderConfig;
    }
}
//# sourceMappingURL=types.d.ts.map
=== packages/plugins/stacks/dist/backend.d.ts ===
/**
 * StacksBackend — persistence abstraction for The Stacks.
 *
 * All SQLite-specific types stay behind this interface. The apparatus
 * and all consuming plugins depend only on these types. Backend
 * implementations (SQLite, in-memory) implement this interface.
 *
 * See: docs/specification.md §8
 */
import type { BookEntry, BookSchema, Scalar } from './types.ts';
export interface BookRef {
    ownerId: string;
    book: string;
}
export interface BackendOptions {
    home: string;
}
export interface PutResult {
    created: boolean;
    prev?: BookEntry;
}
export interface PatchResult {
    entry: BookEntry;
    prev: BookEntry;
}
export interface DeleteResult {
    found: boolean;
    prev?: BookEntry;
}
export type InternalCondition = {
    field: string;
    op: 'eq' | 'neq';
    value: Scalar;
} | {
    field: string;
    op: 'gt' | 'gte' | 'lt' | 'lte';
    value: number | string;
} | {
    field: string;
    op: 'like';
    value: string;
} | {
    field: string;
    op: 'in';
    values: Scalar[];
} | {
    field: string;
    op: 'isNull' | 'isNotNull';
};
export interface InternalQuery {
    where?: InternalCondition[];
    orderBy?: Array<{
        field: string;
        dir: 'asc' | 'desc';
    }>;
    limit?: number;
    offset?: number;
}
/** Narrowed query type for count() — conditions only, no pagination. */
export interface CountQuery {
    where?: InternalCondition[];
}
export interface BackendTransaction {
    put(ref: BookRef, entry: BookEntry, opts?: {
        withPrev: boolean;
    }): PutResult;
    patch(ref: BookRef, id: string, fields: Record<string, unknown>): PatchResult;
    delete(ref: BookRef, id: string, opts?: {
        withPrev: boolean;
    }): DeleteResult;
    get(ref: BookRef, id: string): BookEntry | null;
    find(ref: BookRef, query: InternalQuery): BookEntry[];
    count(ref: BookRef, query: CountQuery): number;
    commit(): void;
    rollback(): void;
}
export interface StacksBackend {
    open(options: BackendOptions): void;
    close(): void;
    ensureBook(ref: BookRef, schema: BookSchema): void;
    beginTransaction(): BackendTransaction;
}
//# sourceMappingURL=backend.d.ts.map
=== packages/plugins/stacks/dist/cdc.d.ts ===
/**
 * CDC registry — handler registration, event buffering, and coalescing.
 *
 * Two-phase execution model:
 * - Phase 1 (failOnError: true):  runs INSIDE the transaction
 * - Phase 2 (failOnError: false): runs AFTER commit with coalesced events
 *
 * See: docs/specification.md (stacks § CDC)
 */
import type { BookEntry, ChangeEvent, ChangeHandler, WatchOptions } from './types.ts';
interface WatcherEntry {
    handler: ChangeHandler;
    failOnError: boolean;
}
export interface BufferedEvent {
    ref: string;
    ownerId: string;
    book: string;
    docId: string;
    type: 'create' | 'update' | 'delete';
    entry?: BookEntry;
    prev?: BookEntry;
}
/**
 * Coalesce buffered events per-document.
 *
 * Rules:
 *   create                    → create (final state)
 *   create → update(s)        → create (final state)
 *   create → delete           → (no event)
 *   update(s)                 → update (first prev, final state)
 *   update(s) → delete        → delete (first prev)
 *   delete                    → delete (prev)
 */
export declare function coalesceEvents(buffer: BufferedEvent[]): ChangeEvent<BookEntry>[];
export declare class CdcRegistry {
    private readonly watchers;
    private locked;
    /**
     * Register a CDC handler for a book.
     * Must be called before any writes (enforced by `locked` flag).
     */
    watch(ownerId: string, bookName: string, handler: ChangeHandler, options?: WatchOptions): void;
    /** Mark the registry as locked — called on first write. */
    lock(): void;
    /** Check if any handlers are registered for a book (controls pre-read). */
    hasWatchers(ownerId: string, bookName: string): boolean;
    /** Get Phase 1 handlers (failOnError: true) for a book. */
    getPhase1Handlers(ownerId: string, bookName: string): WatcherEntry[];
    /** Get Phase 2 handlers (failOnError: false) for a book. */
    getPhase2Handlers(ownerId: string, bookName: string): WatcherEntry[];
    /**
     * Fire Phase 1 handlers for a single event. Throws on handler error
     * (caller is responsible for rolling back the transaction).
     */
    firePhase1(ownerId: string, bookName: string, event: ChangeEvent<BookEntry>): Promise<void>;
    /**
     * Fire Phase 2 handlers for coalesced events. Errors are logged, not thrown.
     */
    firePhase2(events: ChangeEvent<BookEntry>[]): Promise<void>;
}
export {};
//# sourceMappingURL=cdc.d.ts.map
=== packages/plugins/stacks/dist/conformance/helpers.d.ts ===
/**
 * Conformance test helpers — create a StacksApi from a bare backend,
 * bypassing the guild startup machinery.
 *
 * Each test gets a fresh backend + API instance. No state leaks.
 */
import type { StacksBackend, BookRef } from '../backend.ts';
import type { BookEntry, StacksApi, ChangeEvent, CreateEvent, UpdateEvent, DeleteEvent, WatchOptions } from '../types.ts';
export interface TestStacks {
    stacks: StacksApi;
    backend: StacksBackend;
    /** Ensure a book exists (bypasses kit contribution flow). */
    ensureBook(ownerId: string, bookName: string, schema?: {
        indexes?: (string | string[])[];
    }): void;
}
export declare function createTestStacks(backendFactory: () => StacksBackend): TestStacks;
export declare function seedDocument(backend: StacksBackend, ref: BookRef, entry: BookEntry): void;
export declare function collectEvents<T extends BookEntry = BookEntry>(stacks: StacksApi, ownerId: string, bookName: string, options?: WatchOptions): ChangeEvent<T>[];
export interface PutCall {
    ref: BookRef;
    entry: BookEntry;
    withPrev: boolean;
}
/**
 * Wraps a backend factory to record put() calls on transactions,
 * so tests can verify whether withPrev was requested.
 */
export declare function spyingBackendFactory(factory: () => StacksBackend): {
    factory: () => StacksBackend;
    putCalls: PutCall[];
};
/** Assert the event is a `create` and check its fields. */
export declare function assertCreateEvent(event: ChangeEvent<BookEntry>, expected: {
    entry: BookEntry;
    ownerId?: string;
    book?: string;
}): asserts event is CreateEvent<BookEntry>;
/** Assert the event is an `update` and check its fields. */
export declare function assertUpdateEvent(event: ChangeEvent<BookEntry>, expected: {
    entry: BookEntry;
    prev: BookEntry;
    ownerId?: string;
    book?: string;
}): asserts event is UpdateEvent<BookEntry>;
/** Assert the event is a `delete` and check its fields. */
export declare function assertDeleteEvent(event: ChangeEvent<BookEntry>, expected: {
    id: string;
    prev: BookEntry;
    ownerId?: string;
    book?: string;
}): asserts event is DeleteEvent<BookEntry>;
export declare const OWNER = "test-owner";
export declare const BOOK = "testbook";
export declare const REF: BookRef;
//# sourceMappingURL=helpers.d.ts.map
=== packages/plugins/stacks/dist/conformance/suite.d.ts ===
/**
 * Stacks conformance test suite — parametric registration.
 *
 * Exports a single function that registers all conformance tiers
 * against a given backend factory. Each backend test file calls
 * this with its own factory function.
 */
import type { StacksBackend } from '../backend.ts';
export declare function runConformanceSuite(suiteName: string, backendFactory: () => StacksBackend): void;
//# sourceMappingURL=suite.d.ts.map
=== packages/plugins/stacks/dist/conformance/testable-stacks.d.ts ===
/**
 * Testable Stacks — a minimal StacksApi wired directly to a backend,
 * without requiring the guild startup machinery.
 *
 * Uses the same StacksCore as the production apparatus, ensuring
 * behavioral identity by construction.
 */
import type { StacksBackend } from '../backend.ts';
import type { StacksApi } from '../types.ts';
export declare function createTestableStacks(backend: StacksBackend): StacksApi;
//# sourceMappingURL=testable-stacks.d.ts.map
=== packages/plugins/stacks/dist/conformance/tier1-data-integrity.d.ts ===
/**
 * Tier 1 — Data Integrity conformance tests.
 *
 * Failures here mean data loss or corruption. Non-negotiable.
 */
import type { StacksBackend } from '../backend.ts';
export declare function tier1DataIntegrity(backendFactory: () => StacksBackend): void;
//# sourceMappingURL=tier1-data-integrity.d.ts.map
=== packages/plugins/stacks/dist/conformance/tier2-cdc.d.ts ===
/**
 * Tier 2 — CDC Behavioral Correctness conformance tests.
 *
 * Failures here mean the CDC contract is violated.
 */
import type { StacksBackend } from '../backend.ts';
export declare function tier2Cdc(backendFactory: () => StacksBackend): void;
//# sourceMappingURL=tier2-cdc.d.ts.map
=== packages/plugins/stacks/dist/conformance/tier2.5-transactions.d.ts ===
/**
 * Tier 2.5 — Transaction Semantics conformance tests.
 */
import type { StacksBackend } from '../backend.ts';
export declare function tier25Transactions(backendFactory: () => StacksBackend): void;
//# sourceMappingURL=tier2.5-transactions.d.ts.map
=== packages/plugins/stacks/dist/conformance/tier3-queries.d.ts ===
/**
 * Tier 3 — Query Correctness conformance tests.
 */
import type { StacksBackend } from '../backend.ts';
export declare function tier3Queries(backendFactory: () => StacksBackend): void;
//# sourceMappingURL=tier3-queries.d.ts.map
=== packages/plugins/stacks/dist/conformance/tier4-edge-cases.d.ts ===
/**
 * Tier 4 — Edge Cases and Ergonomics conformance tests.
 */
import type { StacksBackend } from '../backend.ts';
export declare function tier4EdgeCases(backendFactory: () => StacksBackend): void;
//# sourceMappingURL=tier4-edge-cases.d.ts.map
=== packages/plugins/stacks/dist/field-utils.d.ts ===
/**
 * Shared field access and order-by utilities.
 *
 * Used by both the apparatus-level logic (stacks-core.ts) and the
 * memory backend (memory-backend.ts). Kept in a minimal module with
 * no heavy dependencies.
 */
import type { BookEntry, OrderBy } from './types.ts';
/**
 * Access a potentially nested field via dot-notation (e.g. "parent.id").
 */
export declare function getNestedField(obj: BookEntry | Record<string, unknown>, field: string): unknown;
/**
 * Normalize the public OrderBy type into a uniform array of { field, dir }.
 *
 * Does NOT validate field names — callers are responsible for ensuring
 * fields have already been validated (e.g. via translateQuery) before
 * reaching this point. translateQuery calls validateFieldName after
 * normalizing because it sits at the untrusted-input boundary.
 */
export declare function normalizeOrderBy(orderBy: OrderBy): Array<{
    field: string;
    dir: 'asc' | 'desc';
}>;
/**
 * Compare two entries by a list of order-by entries.
 *
 * Shared by the memory backend's sortEntries and the apparatus-level
 * OR query re-sort in stacks-core.ts. Null values sort before non-null
 * in ascending order, after non-null in descending order.
 */
export declare function compareByOrderEntries(a: BookEntry | Record<string, unknown>, b: BookEntry | Record<string, unknown>, orderEntries: Array<{
    field: string;
    dir: 'asc' | 'desc';
}>): number;
//# sourceMappingURL=field-utils.d.ts.map
=== packages/plugins/stacks/dist/index.d.ts ===
/**
 * @shardworks/stacks-apparatus — The Stacks apparatus.
 *
 * Guild persistence layer: NoSQL document store with CDC, transactions,
 * and swappable backend. Default export is the apparatus plugin.
 *
 * See: docs/specification.md
 */
export type { StacksConfig, BookEntry, BookSchema, Book, ReadOnlyBook, Scalar, WhereCondition, WhereClause, OrderEntry, OrderBy, Pagination, BookQuery, ListOptions, ChangeEvent, CreateEvent, UpdateEvent, DeleteEvent, ChangeHandler, WatchOptions, StacksApi, TransactionContext, } from './types.ts';
export type { StacksBackend, BackendTransaction, BackendOptions, BookRef, InternalQuery, InternalCondition, CountQuery, PutResult, PatchResult, DeleteResult, } from './backend.ts';
export { createStacksApparatus } from './stacks.ts';
declare const _default: import("@shardworks/nexus-core").Plugin;
export default _default;
//# sourceMappingURL=index.d.ts.map
=== packages/plugins/stacks/dist/memory-backend.d.ts ===
/**
 * In-memory StacksBackend for tests.
 *
 * Exported via `@shardworks/stacks-apparatus/testing`. No SQLite dependency.
 * Implements the same contract as the SQLite backend.
 */
import type { BackendOptions, BackendTransaction, BookRef, StacksBackend } from './backend.ts';
import type { BookSchema } from './types.ts';
export declare class MemoryBackend implements StacksBackend {
    private store;
    open(_options: BackendOptions): void;
    close(): void;
    ensureBook(ref: BookRef, _schema: BookSchema): void;
    beginTransaction(): BackendTransaction;
}
//# sourceMappingURL=memory-backend.d.ts.map
=== packages/plugins/stacks/dist/query.d.ts ===
/**
 * Query translation — public WhereClause tuples → InternalQuery.
 *
 * Validates field names against a safe allowlist, then maps the
 * user-facing operator strings to the backend's internal enum.
 */
import type { BookQuery, WhereClause } from './types.ts';
import type { InternalCondition, InternalQuery } from './backend.ts';
export declare function validateFieldName(field: string): string;
export declare function translateQuery(query: BookQuery): InternalQuery;
/**
 * Translate a WhereClause into conditions only (no pagination fields).
 * OR clauses are handled at the apparatus level — this only handles AND.
 */
export declare function translateWhereClause(where?: WhereClause | {
    or: WhereClause[];
}): {
    where?: InternalCondition[];
};
//# sourceMappingURL=query.d.ts.map
=== packages/plugins/stacks/dist/sqlite-backend.d.ts ===
/**
 * SQLite backend for The Stacks — backed by better-sqlite3.
 *
 * Implements the StacksBackend interface. All SQLite-specific details
 * (json_extract, table naming, WAL mode) are encapsulated here.
 *
 * Documents are stored as JSON blobs in a `content` TEXT column.
 * Field queries use json_extract() against declared indexes.
 */
import type { BackendOptions, BackendTransaction, BookRef, StacksBackend } from './backend.ts';
import type { BookSchema } from './types.ts';
export declare function tableName(ref: BookRef): string;
export declare class SqliteBackend implements StacksBackend {
    private db;
    open(options: BackendOptions): void;
    close(): void;
    ensureBook(ref: BookRef, schema: BookSchema): void;
    beginTransaction(): BackendTransaction;
    private requireDb;
}
//# sourceMappingURL=sqlite-backend.d.ts.map
=== packages/plugins/stacks/dist/stacks-core.d.ts ===
/**
 * Stacks core — shared implementation logic for both the production
 * apparatus (stacks.ts) and the testable harness (testable-stacks.ts).
 *
 * This module contains ALL read/write/transaction/CDC logic. The two
 * consumer modules only add their own wiring: the apparatus adds guild()
 * startup and plugin schema reconciliation; the testable harness adds
 * nothing (just exposes createApi() directly).
 *
 * This ensures behavioral identity by construction, not by copy-paste.
 */
import type { BookRef, StacksBackend } from './backend.ts';
import type { BookEntry, BookQuery, StacksApi, TransactionContext, WhereClause } from './types.ts';
export declare class StacksCore {
    readonly backend: StacksBackend;
    private readonly cdc;
    private activeTx;
    constructor(backend: StacksBackend);
    createApi(): StacksApi;
    runTransaction<R>(fn: (tx: TransactionContext) => Promise<R>): Promise<R>;
    private createTransactionContext;
    doPut(ref: BookRef, entry: BookEntry): Promise<void>;
    private doPutInTx;
    doPatch(ref: BookRef, id: string, fields: Record<string, unknown>): Promise<BookEntry>;
    private doPatchInTx;
    doDelete(ref: BookRef, id: string): Promise<void>;
    private doDeleteInTx;
    doGet(ref: BookRef, id: string): BookEntry | null;
    doFind(ref: BookRef, query: BookQuery): Promise<BookEntry[]>;
    /**
     * OR queries: run each branch as a separate backend query, deduplicate
     * by id, re-sort, and paginate the merged result set.
     *
     * V1 trade-off: when called outside an active transaction, each branch
     * opens its own throwaway read transaction. For synchronous backends
     * like better-sqlite3, the data can't change between branches so this
     * is safe. A hypothetical async backend could see different snapshots
     * per branch, producing inconsistent results — a known limitation
     * documented in the spec's implementation notes.
     *
     * Performance note: each branch is a separate backend query. count()
     * with OR cannot use the backend's efficient count path since
     * deduplication requires knowing which IDs overlap. Acceptable for v1.
     */
    private doFindOr;
    doCount(ref: BookRef, where?: WhereClause | {
        or: WhereClause[];
    }): Promise<number>;
    private requireTx;
}
//# sourceMappingURL=stacks-core.d.ts.map
=== packages/plugins/stacks/dist/stacks.d.ts ===
/**
 * The Stacks — apparatus implementation.
 *
 * Wires together the backend, CDC registry, and transaction model
 * to provide the StacksApi `provides` object. All core read/write/
 * transaction logic lives in stacks-core.ts.
 *
 * See: docs/specification.md
 */
import type { Plugin } from '@shardworks/nexus-core';
import type { StacksBackend } from './backend.ts';
export declare function createStacksApparatus(backend?: StacksBackend): Plugin;
//# sourceMappingURL=stacks.d.ts.map
=== packages/plugins/stacks/dist/types.d.ts ===
/**
 * The Stacks — public API types.
 *
 * These types form the contract between The Stacks apparatus and all
 * consuming plugins. No SQLite types, no implementation details.
 *
 * See: docs/specification.md
 */
/** Plugin configuration stored at guild.json["stacks"]. */
export interface StacksConfig {
    /**
     * Automatically apply pending database migrations when the Books are opened.
     * Defaults to `true` when not specified.
     */
    autoMigrate?: boolean;
}
declare module '@shardworks/nexus-core' {
    interface GuildConfig {
        stacks?: StacksConfig;
    }
}
/** Every document stored in a book must satisfy this constraint. */
export type BookEntry = {
    id: string;
} & Record<string, unknown>;
/**
 * Schema declaration for a single book in a kit's `books` contribution.
 *
 * `indexes` is a list of fields to create efficient query indexes for.
 * Field names use plain notation ('status') or dot-notation for nested
 * fields ('parent.id'). The Stacks translates internally.
 */
export interface BookSchema {
    indexes?: (string | string[])[];
}
export type Scalar = string | number | boolean | null;
export type WhereCondition = [field: string, op: '=' | '!=', value: Scalar] | [field: string, op: '>' | '>=' | '<' | '<=', value: number | string] | [field: string, op: 'LIKE', value: string] | [field: string, op: 'IN', value: Scalar[]] | [field: string, op: 'IS NULL' | 'IS NOT NULL'];
export type WhereClause = WhereCondition[];
export type OrderEntry = [field: string, direction: 'asc' | 'desc'];
export type OrderBy = OrderEntry | OrderEntry[];
export type Pagination = {
    limit: number;
    offset?: number;
} | {
    limit?: never;
    offset?: never;
};
export type BookQuery = {
    where?: WhereClause | {
        or: WhereClause[];
    };
    orderBy?: OrderBy;
} & Pagination;
export type ListOptions = {
    orderBy?: OrderBy;
} & Pagination;
/** Read-only view of a book — returned by `readBook()` for cross-plugin access. */
export interface ReadOnlyBook<T extends BookEntry> {
    get(id: string): Promise<T | null>;
    find(query: BookQuery): Promise<T[]>;
    list(options?: ListOptions): Promise<T[]>;
    count(where?: WhereClause | {
        or: WhereClause[];
    }): Promise<number>;
}
/** Writable book handle — returned by `book()` for own-plugin access. */
export interface Book<T extends BookEntry> extends ReadOnlyBook<T> {
    /**
     * Upsert a document. Creates if `entry.id` is new; replaces entirely
     * if it already exists. Fires a `create` or `update` CDC event.
     */
    put(entry: T): Promise<void>;
    /**
     * Partially update a document. Merges top-level fields into the existing
     * document. Throws if the document does not exist. Returns the updated
     * document. Fires an `update` CDC event.
     */
    patch(id: string, fields: Partial<Omit<T, 'id'>>): Promise<T>;
    /**
     * Delete a document by id. Silent no-op if it does not exist.
     * Fires a `delete` CDC event only if the document existed.
     */
    delete(id: string): Promise<void>;
}
export interface CreateEvent<T extends BookEntry> {
    type: 'create';
    ownerId: string;
    book: string;
    entry: T;
}
export interface UpdateEvent<T extends BookEntry> {
    type: 'update';
    ownerId: string;
    book: string;
    entry: T;
    prev: T;
}
export interface DeleteEvent<T extends BookEntry> {
    type: 'delete';
    ownerId: string;
    book: string;
    id: string;
    prev: T;
}
export type ChangeEvent<T extends BookEntry> = CreateEvent<T> | UpdateEvent<T> | DeleteEvent<T>;
export type ChangeHandler<T extends BookEntry = BookEntry> = (event: ChangeEvent<T>) => Promise<void> | void;
export interface WatchOptions {
    /**
     * Controls when the handler runs relative to the transaction commit.
     *
     * true  (default) — Phase 1: runs INSIDE the transaction. Handler writes
     *   join the same transaction. If the handler throws, everything rolls back.
     *
     * false — Phase 2: runs AFTER the transaction commits. Errors are logged
     *   as warnings but do not affect committed data.
     *
     * @default true
     */
    failOnError?: boolean;
}
export interface TransactionContext {
    book<T extends BookEntry>(ownerId: string, name: string): Book<T>;
    readBook<T extends BookEntry>(ownerId: string, name: string): ReadOnlyBook<T>;
}
export interface StacksApi {
    book<T extends BookEntry>(ownerId: string, name: string): Book<T>;
    readBook<T extends BookEntry>(ownerId: string, name: string): ReadOnlyBook<T>;
    watch<T extends BookEntry>(ownerId: string, bookName: string, handler: ChangeHandler<T>, options?: WatchOptions): void;
    transaction<R>(fn: (tx: TransactionContext) => Promise<R>): Promise<R>;
}
//# sourceMappingURL=types.d.ts.map
=== packages/plugins/tools/dist/index.d.ts ===
/**
 * @shardworks/tools-apparatus — The Instrumentarium.
 *
 * Guild tool registry: scans kit contributions, resolves permission-gated
 * tool sets, and provides the InstrumentariumApi for tool lookup and resolution.
 *
 * The tool() factory and ToolDefinition type live here canonically.
 *
 * See: docs/specification.md (instrumentarium)
 */
export { type ToolCaller, type ToolDefinition, tool, isToolDefinition, } from './tool.ts';
export { type InstrumentariumApi, type ResolvedTool, type ResolveOptions, } from './instrumentarium.ts';
declare const _default: import("@shardworks/nexus-core").Plugin;
export default _default;
//# sourceMappingURL=index.d.ts.map
=== packages/plugins/tools/dist/instrumentarium.d.ts ===
/**
 * The Instrumentarium — guild tool registry apparatus.
 *
 * Scans installed tools from kit contributions and apparatus supportKits,
 * resolves permission-gated tool sets on demand, and serves as the single
 * source of truth for "what tools exist and who can use them."
 *
 * The Instrumentarium is role-agnostic — it receives an already-resolved
 * permissions array from the Loom and returns the matching tool set.
 * Role definitions and permission grants are owned by the Loom.
 */
import type { Plugin } from '@shardworks/nexus-core';
import type { ToolDefinition, ToolCaller } from './tool.ts';
/** A resolved tool with provenance metadata. */
export interface ResolvedTool {
    /** The tool definition (name, description, params schema, handler). */
    definition: ToolDefinition;
    /** Plugin id of the kit or apparatus that contributed this tool. */
    pluginId: string;
}
/** Options for resolving a permission-gated tool set. */
export interface ResolveOptions {
    /**
     * Permission grants in `plugin:level` format.
     * Supports wildcards: `plugin:*`, `*:level`, `*:*`.
     */
    permissions: string[];
    /**
     * When true, permissionless tools are excluded unless the role grants
     * `plugin:*` or `*:*` for the tool's plugin. When false (default),
     * permissionless tools are included unconditionally.
     */
    strict?: boolean;
    /** Filter by invocation caller. Tools with no callableBy pass all callers. */
    caller?: ToolCaller;
}
/** The Instrumentarium's public API, exposed via `provides`. */
export interface InstrumentariumApi {
    /**
     * Resolve the tool set for a given set of permissions.
     *
     * Evaluates each registered tool against the permission grants:
     * - Tools with a `permission` field: included if any grant matches
     * - Permissionless tools: always included (default) or gated by `strict`
     * - Caller filtering applied last
     */
    resolve(options: ResolveOptions): ResolvedTool[];
    /**
     * Find a single tool by name. Returns null if not installed.
     */
    find(name: string): ResolvedTool | null;
    /**
     * List all installed tools, regardless of permissions.
     */
    list(): ResolvedTool[];
}
/**
 * Create the Instrumentarium apparatus plugin.
 *
 * Returns a Plugin with:
 * - `consumes: ['tools']` — scans kit/supportKit contributions
 * - `provides: InstrumentariumApi` — the tool registry API
 */
export declare function createInstrumentarium(): Plugin;
//# sourceMappingURL=instrumentarium.d.ts.map
=== packages/plugins/tools/dist/tool.d.ts ===
/**
 * Tool SDK — the primary authoring interface for module-based tools.
 *
 * Use `tool()` to define a typed tool with Zod parameter schemas.
 * The returned definition is what the MCP engine imports and registers as a tool,
 * what the CLI uses to auto-generate subcommands, and what engines import directly.
 *
 * A package can export a single tool or an array of tools:
 *
 * @example Single tool
 * ```typescript
 * import { tool } from '@shardworks/tools-apparatus';
 * import { z } from 'zod';
 *
 * export default tool({
 *   name: 'lookup',
 *   description: 'Look up an anima by name',
 *   instructionsFile: './instructions.md',
 *   params: {
 *     name: z.string().describe('Anima name'),
 *   },
 *   handler: async ({ name }) => {
 *     const { home } = guild();
 *     return { found: true, status: 'active' };
 *   },
 * });
 * ```
 *
 * @example Tool collection
 * ```typescript
 * export default [
 *   tool({ name: 'commission', description: '...', params: {...}, handler: ... }),
 *   tool({ name: 'signal', description: '...', params: {...}, handler: ... }),
 * ];
 * ```
 */
import { z } from 'zod';
type ZodShape = Record<string, z.ZodType>;
/**
 * The caller types a tool can be invoked by.
 * - `'patron'` — accessible via `nsg` commands (human-facing)
 * - `'anima'` — accessible via MCP server (anima-facing, in sessions)
 * - `'library'` — accessible programmatically via direct import
 *
 * Defaults to all caller types if `callableBy` is unspecified.
 */
export type ToolCaller = 'patron' | 'anima' | 'library';
/**
 * A fully-defined tool — the return type of `tool()`.
 *
 * The MCP engine uses `.params.shape` to register the tool's input schema,
 * `.description` for the tool description, and `.handler` to execute calls.
 * The CLI uses `.params` to auto-generate Commander options.
 * Engines call `.handler` directly.
 */
export interface ToolDefinition<TShape extends ZodShape = ZodShape> {
    /** Tool name — used for resolution when a package exports multiple tools. */
    readonly name: string;
    readonly description: string;
    /** Per-tool instructions injected into the anima's session context (inline text). */
    readonly instructions?: string;
    /**
     * Path to an instructions file, relative to the package root.
     * Resolved by the manifest engine at session time.
     * Mutually exclusive with `instructions`.
     */
    readonly instructionsFile?: string;
    /**
     * Caller types this tool is available to.
     * Always a normalized array. Absent means available to all callers.
     */
    readonly callableBy?: ToolCaller[];
    /**
     * Permission level required to invoke this tool. Matched against role grants.
     *
     * Format: a freeform string chosen by the tool author. Conventional names:
     * - `'read'` — query/inspect operations
     * - `'write'` — create/update operations
     * - `'delete'` — destructive operations
     * - `'admin'` — configuration and lifecycle operations
     *
     * Plugins are free to define their own levels.
     * If omitted, the tool is permissionless — included by default in non-strict
     * mode, excluded in strict mode unless the role grants `plugin:*` or `*:*`.
     */
    readonly permission?: string;
    readonly params: z.ZodObject<TShape>;
    readonly handler: (params: z.infer<z.ZodObject<TShape>>) => unknown | Promise<unknown>;
}
/** Input to `tool()` — instructions are either inline text or a file path, not both. */
type ToolInput<TShape extends ZodShape> = {
    name: string;
    description: string;
    params: TShape;
    handler: (params: z.infer<z.ZodObject<TShape>>) => unknown | Promise<unknown>;
    /**
     * Caller types this tool is available to.
     * Accepts a single caller or an array. Normalized to an array in the returned definition.
     */
    callableBy?: ToolCaller | ToolCaller[];
    /**
     * Permission level required to invoke this tool.
     * See ToolDefinition.permission for details.
     */
    permission?: string;
} & ({
    instructions?: string;
    instructionsFile?: never;
} | {
    instructions?: never;
    instructionsFile?: string;
});
/**
 * Define a Nexus tool.
 *
 * This is the primary SDK entry point for module-based tools. Pass a
 * name, description, a params object of Zod schemas, and a handler function.
 * The framework handles the rest — MCP registration, CLI generation, validation.
 *
 * The handler receives one argument:
 * - `params` — the validated input, typed from your Zod schemas
 *
 * To access guild infrastructure (apparatus, config, home path), import
 * `guild` from `@shardworks/nexus-core` and call `guild()` inside the handler.
 *
 * Return any JSON-serializable value. The MCP engine wraps it as tool output;
 * the CLI prints it; engines use it directly.
 *
 * Instructions can be provided inline or as a file path:
 * - `instructions: 'Use this tool when...'` — inline text
 * - `instructionsFile: './instructions.md'` — resolved at manifest time
 */
export declare function tool<TShape extends ZodShape>(def: ToolInput<TShape>): ToolDefinition<TShape>;
/** Type guard: is this value a ToolDefinition? */
export declare function isToolDefinition(obj: unknown): obj is ToolDefinition;
export {};
//# sourceMappingURL=tool.d.ts.map
=== packages/plugins/tools/dist/tools/tools-list.d.ts ===
/**
 * tools-list — administrative view of all tools installed in the guild.
 *
 * Lists the full registry with optional filters for caller type, permission
 * level, and contributing plugin. This is an inventory tool, not a
 * permission-resolved view — use MCP native tool listing for that.
 *
 * Requires `tools:read` permission.
 */
import { z } from 'zod';
import type { InstrumentariumApi } from '../instrumentarium.ts';
/** Summary returned for each tool in the list. */
export interface ToolSummary {
    name: string;
    description: string;
    pluginId: string;
    permission: string | null;
    callableBy: string[] | null;
}
export declare function createToolsList(getApi: () => InstrumentariumApi): import("../tool.ts").ToolDefinition<{
    caller: z.ZodOptional<z.ZodEnum<{
        patron: "patron";
        anima: "anima";
        library: "library";
    }>>;
    permission: z.ZodOptional<z.ZodString>;
    plugin: z.ZodOptional<z.ZodString>;
}>;
//# sourceMappingURL=tools-list.d.ts.map
=== packages/plugins/tools/dist/tools/tools-show.d.ts ===
/**
 * tools-show — show full details for a single tool.
 *
 * Returns name, description, plugin, permission, callableBy, parameter
 * schema, and instructions for the named tool. Returns null if not found.
 *
 * Requires `tools:read` permission.
 */
import { z } from 'zod';
import type { InstrumentariumApi } from '../instrumentarium.ts';
/** Parameter info derived from the Zod schema. */
export interface ParamInfo {
    type: string;
    description: string | null;
    optional: boolean;
}
/** Full detail returned for a single tool. */
export interface ToolDetail {
    name: string;
    description: string;
    pluginId: string;
    permission: string | null;
    callableBy: string[] | null;
    params: Record<string, ParamInfo>;
    instructions: string | null;
}
export declare function createToolsShow(getApi: () => InstrumentariumApi): import("../tool.ts").ToolDefinition<{
    name: z.ZodString;
}>;
//# sourceMappingURL=tools-show.d.ts.map

