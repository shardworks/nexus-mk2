# Add Oculus Page for the Animator

## Summary

Add an Oculus dashboard page to the Animator apparatus for viewing and managing sessions, and fix the broken real-time SSE streaming on the Spider's engine detail page. The page shows a filterable list of sessions with status, role, writ title, and cost (with token breakdown tooltip), supports cancellation of running sessions, and provides a detail view with transcript display that streams in real-time for active sessions.

## Current State

The Animator apparatus (`packages/plugins/animator/`) provides session launch and telemetry recording. It has:

- **Types** (`src/types.ts`): `SessionDoc`, `TokenUsage`, `TranscriptDoc`, `AnimatorApi`, `SessionChunk`, etc.
- **Tools** (`src/tools/`): `session-list`, `session-show`, `session-cancel`, `summon` — auto-mapped by Oculus to REST routes at `/api/session/*`.
- **Broadcaster** (`src/animator.ts`): In-memory `SessionBroadcaster` for streaming session chunks. `AnimatorApi.subscribeToSession(sessionId)` returns `AsyncIterable<SessionChunk> | null`.
- **Plugin registration** (`src/animator.ts` line 620-649): `supportKit` has `books` and `tools` but no `pages` or `routes`.
- **No Oculus page** — no `src/static/` directory, no page contribution, no custom routes.
- **No hono dependency** — `package.json` has no hono listed.

The Spider apparatus (`packages/plugins/spider/`) has an existing Oculus page and SSE streaming implementation:

- **SSE routes** (`src/oculus-routes.ts`): `GET /api/spider/session-stream` (SSE), `GET /api/spider/session-transcript` (REST).
- **Static page** (`src/static/spider.js` lines 460-558): EventSource-based session log streaming on the engine detail view.
- **Bug**: The brief reports session log real-time streaming is "currently broken on the engine detail page."

Session metadata shape (set by `packages/plugins/spider/src/engines/anima-session.ts` line 42 combined with `summon()` auto-fields):
```json
{ "trigger": "summon", "role": "<role>", "engineId": "<id>", "writId": "<writ-id>" }
```

The `session-list` tool returns a slim projection (id, status, provider, startedAt, endedAt, durationMs, exitCode, costUsd) that omits `metadata` and `tokenUsage`.

## Requirements

- R1: The Animator apparatus must contribute an Oculus page with id `animator` and title `Animator`.
- R2: The page must display a list of sessions showing: status (as a badge), role (from `metadata.role`), writ title (resolved from `metadata.writId`), cost in USD, duration, and start time.
- R3: When a session has `costUsd`, the cost cell must display the USD amount and show a CSS-only hover tooltip with the token breakdown: input tokens, output tokens, cache read tokens, cache write tokens.
- R4: The session list must support filtering by status (dropdown) and date range (from/to date inputs).
- R5: The session list must auto-refresh on a polling interval (10–15 seconds) to keep running session statuses current.
- R6: When a session has status `running`, a cancel button must appear. Clicking it must immediately call `POST /api/session/cancel` with `{ id: <sessionId> }` and refresh the list on success.
- R7: Clicking a session row must navigate to a detail view (hiding the list, showing a back button) that displays full session metadata and the session transcript.
- R8: The detail view must fetch session metadata and transcript in parallel: metadata via `GET /api/session/show?id=<id>` (auto-mapped tool route) and transcript via `GET /api/animator/session-transcript?sessionId=<id>` (custom route).
- R9: For running sessions in the detail view, the page must open an SSE connection to `GET /api/animator/session-stream?sessionId=<id>` and display chunks in real-time in a textarea, updating as chunks arrive.
- R10: The Animator must contribute three custom Oculus routes under the `/api/animator/` namespace: `GET /api/animator/sessions` (enriched list), `GET /api/animator/session-transcript` (REST transcript), and `GET /api/animator/session-stream` (SSE stream).
- R11: The `GET /api/animator/sessions` route must return an enriched projection including `metadata.role` as `role`, `metadata.writId` resolved to a `writTitle` string (by reading the Clerk's writs book), and `tokenUsage`.
- R12: The `GET /api/animator/session-stream` SSE route must handle three cases: completed sessions (emit `transcript` then `done`), running sessions with an active broadcaster (stream `chunk` events then `transcript` and `done`), and running sessions without a broadcaster (emit `done` with `noStream: true`).
- R13: The `GET /api/animator/session-transcript` route must return `{ messages, sessionStatus }` — the transcript array and the session's current status.
- R14: The broken real-time SSE streaming on the Spider's engine detail page (`packages/plugins/spider/src/static/spider.js`) must be investigated and fixed.
- R15: The Animator's `package.json` must add `hono` as a dependency.
- R16: All static page files must be placed in `packages/plugins/animator/src/static/`.
- R17: The `"files"` array in the Animator's `package.json` must include `"src/static"` so static assets are published.

## Design

### Type Changes

No new TypeScript interfaces are needed. The custom routes use existing types:

- `SessionDoc` and `TranscriptDoc` from `@shardworks/animator-apparatus`
- `WritDoc` from `@shardworks/clerk-apparatus` (for writ title resolution)
- `AnimatorApi` from `@shardworks/animator-apparatus` (for `subscribeToSession`)
- `StacksApi` from `@shardworks/stacks-apparatus` (for book access)
- `Context` from `hono` (for route handler signatures)

The custom sessions list route returns this JSON shape (not a formal type — it's a REST projection):

```typescript
// GET /api/animator/sessions response shape
interface SessionListEntry {
  id: string;
  status: string;
  provider: string;
  startedAt: string;
  endedAt?: string;
  durationMs?: number;
  exitCode?: number;
  costUsd?: number;
  role?: string;          // from metadata.role
  writId?: string;        // from metadata.writId
  writTitle?: string;     // resolved from Clerk's writs book
  tokenUsage?: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
  };
}
```

### Behavior

#### Custom routes (`packages/plugins/animator/src/oculus-routes.ts`)

**GET /api/animator/sessions**

- Accepts optional query params: `status` (string), `from` (ISO date string), `to` (ISO date string), `limit` (number, default 50).
- Queries the Animator's `sessions` book via `stacks.readBook<SessionDoc>('animator', 'sessions')`.
- Builds a `where` clause from params: `status` filters on the indexed `status` field; `from`/`to` filter on `startedAt` using `>=` and `<=`.
- Orders by `startedAt` descending.
- For each session, extracts `metadata.role` as `role` and `metadata.writId` as `writId`.
- Batch-resolves writ titles: collects all unique `writId` values, reads each from `stacks.readBook('clerk', 'writs')` via `get()`, and maps `writId → writ.title`. Sessions without a `writId` or whose writ is not found get `writTitle: undefined`.
- Returns the enriched projection array as JSON.

**GET /api/animator/session-transcript**

- Requires query param `sessionId`. Returns 400 if missing.
- Reads `SessionDoc` from the sessions book. Returns 404 if not found.
- When `session.status === 'running'`, returns `{ messages: [], sessionStatus: 'running' }`.
- Otherwise reads the transcript from the transcripts book and returns `{ messages: transcript?.messages ?? [], sessionStatus: session.status }`.
- This mirrors the Spider's `/api/spider/session-transcript` route exactly.

**GET /api/animator/session-stream**

- Requires query param `sessionId`. Returns 400 if missing.
- Reads `SessionDoc` from sessions book. Returns 404 if not found.
- When session is not running: reads transcript, sends SSE event `transcript` with `{ messages }`, then event `done` with `{ status }`.
- When session is running and `animator.subscribeToSession(sessionId)` returns a stream: iterates chunks sending SSE event `chunk` for each, then after the stream completes sends `transcript` with final messages and `done` with final status.
- When session is running but `subscribeToSession` returns null (no broadcaster): sends SSE event `done` with `{ status: 'running', noStream: true }`.
- On error during streaming: sends SSE event `error` with `{ error: message }`.
- Uses `streamSSE` from `hono/streaming`.
- This mirrors the Spider's `/api/spider/session-stream` route exactly in structure.

The routes module does NOT import from `@shardworks/oculus-apparatus` to avoid circular package dependencies (same convention as the Spider's `oculus-routes.ts`).

#### Plugin registration changes (`packages/plugins/animator/src/animator.ts`)

- Import the routes array from `./oculus-routes.ts`.
- Add to `supportKit`:
  ```typescript
  pages: [
    { id: 'animator', title: 'Animator', dir: 'src/static' },
  ],
  routes: animatorRoutes,
  ```
- Add `'oculus'` to the `recommends` array: `recommends: ['loom', 'oculus']`.

#### Static page (`packages/plugins/animator/src/static/`)

Three files: `index.html`, `animator.js`, `animator.css`.

**index.html** — follows the Spider's pattern:
- `<link rel="stylesheet" href="animator.css">` in `<head>`.
- `<script src="animator.js">` at bottom of `<body>`.
- Contains a list view with: toolbar (status dropdown, from/to date inputs, refresh button), data table with columns (Status, Role, Writ, Cost, Duration, Started, Actions), empty state div.
- Contains a detail view (initially hidden) with: back button, session metadata table, session log section with spinner badge and textarea, and a transcript section.
- The Oculus injects the shared nav bar and stylesheet automatically via chrome injection.

**animator.js** — vanilla JS IIFE (no framework, no modules), following `spider.js` patterns:
- State variables: `sessions`, `currentSession`, `pollTimer`, `sessionEventSource`.
- Fetch list from `GET /api/animator/sessions` with filter params.
- Render table rows with status badges (using `badgeClass` mapping matching Spider's), role text, writ title as text, cost cell with tooltip, duration formatted, start time formatted, and a cancel button for running sessions.
- Cancel button: `POST /api/session/cancel` with `{ id }` body, refresh list on success.
- Auto-refresh: `setInterval(fetchList, 12000)` (12 seconds, matching the Feedback page's polling interval).
- Click row → show detail view, fetch session via `GET /api/session/show?id=X` and open SSE stream.
- SSE setup for detail view: identical pattern to Spider's — EventSource to `/api/animator/session-stream?sessionId=X`, listeners for `chunk`, `transcript`, `done`, `error`, plus `onerror`.
- `renderTranscript(messages)` function: identical logic to Spider's (extract text from assistant content blocks, tool_use, tool_result).
- `stopSessionStream()` function: close EventSource, null reference.
- Cost tooltip: the cost cell contains a `<span>` with the USD amount and a nested `<span class="cost-tooltip">` that is shown on hover via CSS.

**animator.css** — page-specific styles using Oculus CSS custom properties (`var(--bg)`, `var(--surface)`, etc.):
- Toolbar styles (matching Spider's toolbar pattern).
- Cost tooltip: `.cost-cell { position: relative; }`, `.cost-tooltip { display: none; position: absolute; ... }`, `.cost-cell:hover .cost-tooltip { display: block; }`. Tokyo Night themed (dark surface background, border, proper text colors).
- Session log textarea (matching Spider's `.session-log-textarea` style).
- Any additional page-specific styles needed.

#### Spider SSE fix (`packages/plugins/spider/src/static/spider.js`)

The implementer must:
1. Run the Oculus and Spider pages with a running session to reproduce the broken streaming behavior.
2. Investigate the root cause — likely candidates based on static analysis:
   - Browser EventSource auto-reconnection: if the SSE connection closes after the `done` event is sent, the browser may auto-reconnect before `stopSessionStream()` runs, creating an infinite reconnect loop where each reconnect sees a completed session and immediately closes again.
   - Timing between the `onerror` handler (which calls `stopSessionStream()` and shows "disconnected") and the `done` event handler (which also calls `stopSessionStream()`).
   - Hono `streamSSE` may not close the connection in a way that prevents EventSource reconnection.
3. Fix the identified issue. Ensure the EventSource is properly closed and does not reconnect after the stream completes.

### Non-obvious Touchpoints

- **`packages/plugins/animator/package.json`**: Must add `"hono": "^4.7.11"` to `dependencies` (matching Spider's version). Must add `"src/static"` to the `"files"` array so static assets are included in published packages.
- **`packages/plugins/animator/package.json`**: Must add `"@shardworks/clerk-apparatus": "workspace:*"` to `dependencies` for the `WritDoc` type import used in the writ title resolution.
- **`packages/plugins/spider/src/static/spider.js`**: The SSE fix must not change the route structure or event names — only the client-side EventSource lifecycle management.

### Dependencies

The Animator's custom routes read from the Clerk's writs book via `stacks.readBook('clerk', 'writs')`. This is a read-only cross-book access — architecturally supported by the Stacks API. The Clerk apparatus must be installed for writ title resolution to work. If the Clerk is not installed, the route should gracefully return `writTitle: undefined` for all sessions rather than failing.

## Validation Checklist

- V1 [R1, R16]: The Animator's `supportKit` includes a `pages` entry with `{ id: 'animator', title: 'Animator', dir: 'src/static' }`. The directory `packages/plugins/animator/src/static/` exists and contains `index.html`, `animator.js`, and `animator.css`.
- V2 [R10, R15, R17]: The Animator's `package.json` lists `hono` in dependencies and includes `"src/static"` in the `"files"` array. A route array is exported from `packages/plugins/animator/src/oculus-routes.ts` and wired into `supportKit.routes`.
- V3 [R2, R11]: `GET /api/animator/sessions` returns JSON entries with fields `id`, `status`, `role`, `writTitle`, `costUsd`, `tokenUsage`, `startedAt`, `durationMs`. Verify by calling the route with test data that includes sessions with and without `metadata.writId`.
- V4 [R3]: A session with `costUsd: 0.15` and `tokenUsage: { inputTokens: 50000, outputTokens: 2000 }` renders a cost cell showing "$0.15" with a hover tooltip displaying the token breakdown. Verify by inspecting the rendered HTML for the tooltip element and the CSS rules that show it on hover.
- V5 [R4]: The session list toolbar includes a status dropdown and date range inputs. Setting `status=running` and refreshing shows only running sessions. Setting a date range filters by `startedAt`.
- V6 [R5]: With the page open, a new session appearing in the sessions book becomes visible in the list within 15 seconds without manual refresh.
- V7 [R6]: A running session shows a cancel button. Clicking it sends `POST /api/session/cancel` with the correct session ID, and the list refreshes showing the session as `cancelled`.
- V8 [R7, R8]: Clicking a session row hides the list view and shows a detail view with a back button, session metadata, and transcript content. The detail view fetches from both `/api/session/show` and `/api/animator/session-transcript` in parallel.
- V9 [R9, R12]: For a running session, the detail view opens an EventSource to `/api/animator/session-stream?sessionId=X`. When chunks arrive, they appear in the textarea in real-time. When the session completes, the full transcript replaces the streaming content and the EventSource is closed.
- V10 [R12, R13]: `GET /api/animator/session-transcript?sessionId=X` returns `{ messages: [...], sessionStatus: 'completed' }` for a completed session with transcript data. `GET /api/animator/session-stream?sessionId=X` for a completed session emits SSE events `transcript` then `done`.
- V11 [R14]: The Spider's engine detail page SSE streaming works correctly: opening an engine detail with a running session shows real-time chunks in the textarea, and the stream closes cleanly when the session completes without reconnection loops or "disconnected" badges appearing spuriously.
- V12 [R2, R11]: Sessions without `metadata.role` show an empty cell (or dash) in the Role column. Sessions without `metadata.writId` show an empty cell in the Writ column.

## Test Cases

### `packages/plugins/animator/src/oculus-routes.test.ts`

**GET /api/animator/sessions:**
- Returns 200 with an array of session entries including `role`, `writTitle`, and `tokenUsage` fields.
- Sessions with `metadata.writId` pointing to an existing writ have `writTitle` populated with the writ's title.
- Sessions without `metadata.writId` have `writTitle: undefined`.
- Sessions with `metadata.writId` pointing to a non-existent writ have `writTitle: undefined` (graceful degradation).
- `status` query param filters to sessions matching that status.
- `from` and `to` query params filter sessions by `startedAt` range.
- `limit` query param limits the number of results.
- Results are ordered by `startedAt` descending (newest first).

**GET /api/animator/session-transcript:**
- Returns 400 when `sessionId` is missing.
- Returns 404 when session is not found.
- Returns `{ messages: [], sessionStatus: 'running' }` for a running session.
- Returns `{ messages: [...], sessionStatus: 'completed' }` for a completed session with transcript.
- Returns `{ messages: [], sessionStatus: 'completed' }` for a completed session without transcript.

**GET /api/animator/session-stream:**
- Returns 400 when `sessionId` is missing.
- Returns 404 when session is not found.
- For a completed session: calls `streamSSE` (does not return a JSON error response).
- For a running session with active broadcaster: calls `streamSSE` (does not return a JSON error response).
- For a running session without broadcaster (null subscription): calls `streamSSE` (does not return a JSON error response).

### Spider SSE fix verification
- After applying the fix, open the Spider engine detail page for a running session. Chunks appear in real time. When the session completes, the textarea shows the full transcript, the spinner badge disappears, and no "disconnected" error badge appears. No infinite reconnection attempts in the browser's network tab.
