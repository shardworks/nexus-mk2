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
