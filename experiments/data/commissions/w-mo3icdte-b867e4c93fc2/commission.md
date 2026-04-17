# Stop flickering and scroll-reset on the Spider engine detail page

## Intent

Make the Spider rig-detail view's 2-second refresh loop stop tearing down and rebuilding the engine detail panel, the engine pipeline row, and the SSE transcript stream on every tick. The user must be able to read the session-log textarea and any expanded `<details>` block without their scroll position or expansion state being yanked back every two seconds.

## Rationale

The current poll loop is correct in *what* it shows but wrong in *how* it shows it: each tick rewrites large DOM regions wholesale and reopens the transcript SSE, which causes visible flicker, collapses any open `<details>`, resets internal scroll on `<pre>` blocks, and slams the transcript textarea back to the bottom. Decoupling the poll-path updates from the click-path setup is what fixes both the flicker and the unreadable transcript in one stroke, and it brings Spider in line with how the Animator dashboard already separates list polling from detail SSE.

## Scope & Blast Radius

This change is confined to the Spider plugin's static client. The affected areas:

- **`packages/plugins/spider/src/static/spider.js`** — the entire fix lives here. The 2 s rig poll, `showEngineDetail`, `renderPipelineInto`, the SSE lifecycle (`sessionEventSource`, `stopSessionStream`), and the chunk/transcript/noStream handlers are all in this file.
- **`packages/plugins/spider/src/static/spider-ui.test.ts`** — regex-based source assertions that must be updated for the new structure and extended with new invariants.
- **`packages/plugins/spider/src/static/index.html`** — the `#engine-detail-body` markup may need stable-id containers added in the initial template, depending on whether the implementer renders skeleton markup once and then updates fields, or builds the skeleton in JS on first selection.

The server routes (`/api/spider/session-stream`, `/api/spider/session-transcript`, `/api/rig/show`, `/api/session/show`) are not at fault and must not be changed. The Spider page's static-asset registration in `spider.ts` is unaffected.

Concerns the implementer must verify by their own audit, not by trusting this brief:

- **The cancel button (`#cancel-engine-btn`) is rendered inside `#engine-detail-body`.** Any in-place update must not regenerate this button (or its click handler) on each poll while the engine is still cancellable. Verify the existing `spider-ui.test.ts` cancel-button invariants still pass.
- **The `<details class="collapsible">` blocks for Givens Spec and Yields contain `<pre>` blocks with internal scroll.** A correct fix preserves both the `<details>` open/closed state and the `<pre>` scroll position across polls.
- **Some module-scope state (notably `streamDone` and any per-stream flags) is currently scoped inside `showEngineDetail`.** When SSE lifecycle is decoupled from rendering, these flags must move to a scope that survives the function boundary correctly.

## Decisions

| # | Decision | Default | Rationale |
|---|----------|---------|-----------|
| D1 | How should the 2 s rig poll refresh the engine detail panel without tearing it down? | Split `showEngineDetail` into a click-path function (full DOM setup + open SSE) and a new `updateEngineDetail` for the poll path (targeted field updates, no SSE touch, no cost refetch). The poll calls the update variant. | Mirrors animator.js (list poll and detail SSE decoupled) and cleanly separates the two responsibilities. |
| D2 | How should individual fields in the engine detail panel be updated in place? | Give each field container a stable id (e.g. `#ed-status`, `#ed-elapsed`, `#ed-error`, `#ed-block-*`, `#ed-cost-*`) on initial render; the updater writes only the values that changed. | Vanilla-JS-consistent; granular updates avoid reflow for unchanged fields; `<details>` open state and `<pre>` scroll are preserved trivially because those nodes are never replaced. |
| D3 | How should the session-log textarea preserve scroll position when its content is replaced? | Apply the existing `atBottom` pattern uniformly to all three write paths — SSE chunk append, SSE transcript replace, and the noStream polling fallback. Auto-scroll only when the user was already pinned to the bottom. | Preserves `tail -f` behaviour for users who want it without yanking scroll for users who are reading. The pattern already exists in the codebase. |
| D4 | When should the SSE session stream be (re)opened? | Open / close based on the tracked `sessionId` changing. Selecting a different engine always changes the tracked sessionId; an engine that acquires a sessionId after becoming running also triggers a reopen. Do not reopen on rig-data polls. | Covers both the normal selection case and the edge case where a selected engine starts streaming after going from pending to running. |
| D5 | Should the engine pipeline row also refresh in place on each rig poll? | Change `renderPipelineInto` to do a keyed update by `engine.id`: reuse existing nodes, update only the status badge and selected class, add/remove nodes only when the engine set changes. The same helper continues to serve the template-tab one-shot preview. | Keyed updates in vanilla JS are straightforward and remove the second visible source of flicker without duplicating the helper. |
| D6 | Should the `/api/session/show?id=…` cost fetch continue to run on every poll? | Fetch when the engine transitions to `completed` status (the first poll where the new status is observed), then never again for that engine. | Handles the case where the user selects a still-running engine that later completes; cost fields appear once and are not re-requested. |
| D7 | How should the new behaviour be tested given the existing regex-based test convention? | Update existing regex tests as needed and add new regex assertions for the new structure: e.g. `updateEngineDetail` exists; the poll path does not call `showEngineDetail`; chunk/transcript handlers contain an `atBottom` check; the pipeline renderer has a keyed-update path. | Matches the existing convention in `spider-ui.test.ts`. Adding jsdom infrastructure for one bug is out of proportion. |

## Acceptance Signal

- `pnpm -w test` passes, including the updated and new assertions in `packages/plugins/spider/src/static/spider-ui.test.ts`.
- `pnpm -w typecheck` passes.
- On a running rig with the engine detail panel open: the panel's fields visibly update across polls without flicker; an open `<details>` for Givens Spec or Yields stays open across polls; scrolling within a `<pre>` block is preserved across polls.
- On a completed engine: opening the engine in the rig detail view shows the transcript; scrolling up in the textarea and waiting through several poll cycles does not yank the scroll back to the bottom; scrolling to the bottom and waiting still keeps the view pinned to the bottom as new content arrives.
- Network inspection shows `/api/spider/session-stream` is opened at most once per engine selection (and once more if `sessionId` changes), not every two seconds.
- Network inspection shows `/api/session/show?id=…` is requested at most once per engine after it reaches `completed`, not every two seconds.
- Selecting a different engine in the pipeline still works: detail panel switches, SSE stream opens for the new sessionId, cancel button (if applicable) remains functional.
- Cancel button click on a running engine still triggers cancellation (existing `spider-ui.test.ts` cancel-button assertion still passes).

## Existing Patterns

- **`packages/plugins/animator/src/static/animator.js`** is the positive comparison: its 12 s list poll (`fetchList`) refreshes only the list view, and the detail SSE (`showDetail`) opens once per detail navigation and is not re-opened by list polls. Spider should adopt the same separation. Note that animator.js itself still has the unconditional-scroll bug in its chunk/transcript handlers and noStream fallback (lines ~297, ~309, ~329) — that is a separate fix and must not be addressed in this commission.
- **The `noStream` polling fallback in `spider.js`** (around lines 696–729) already implements the `atBottom` capture-mutate-restore pattern. It is the model for the chunk and transcript handlers.
- **`renderPipelineInto`** is shared by the live rig view and the Config tab's template preview. The keyed-update behaviour must work for both — the template preview is effectively a degenerate keyed update on first call.

## What NOT To Do

- Do not change the server routes (`/api/spider/session-stream`, `/api/spider/session-transcript`, `/api/rig/show`, `/api/session/show`) or the SSE event shape. The bug is purely client-side.
- Do not introduce a virtual-DOM library, framework, or build step. The file is a vanilla-JS IIFE served as a static asset; keep it that way.
- Do not split `spider.js` into multiple modules. The 1000-line size is acknowledged in the analyst observations as an eventual cleanup, but it is out of scope for this commission.
- Do not fix the analogous Animator bugs (the noStream scroll bug, the transcript-replace scroll bug). They were observed but are a separate commission.
- Do not add jsdom-based DOM tests. Stay within the existing regex-source-assertion convention in `spider-ui.test.ts`.
- Do not rebuild `buildWritLookup` more cleverly or touch the list-view poll. The bug is localised to the rig-detail view.
- Do not change the 2 s `RIG_POLL_INTERVAL` cadence — the fix is to make each tick cheaper, not less frequent.

<task-manifest>
  <task id="t1">
    <name>Render engine detail with stable field containers</name>
    <files>packages/plugins/spider/src/static/spider.js; possibly packages/plugins/spider/src/static/index.html if a skeleton template lives there</files>
    <action>Refactor the engine-detail rendering so every value-bearing field (status, designId, upstream, timestamps, elapsed, error, sessionId, block fields, cost rows, cancel button) sits inside a container with a stable id. The first-time render establishes this skeleton; subsequent updates write only the value text into the existing containers. Replace the current `<span id="cost-placeholder">` `insertAdjacentHTML` trick with explicit cost-row containers in the skeleton. Preserve the `<details class="collapsible">` blocks for Givens Spec and Yields as stable nodes whose open/closed state and `<pre>` scroll position survive across updates. Do not yet wire up the poll path — this task only sets up the markup contract that the new updater will use. The cancel button must keep its existing markup and click-handler wiring so the cancel-button regex test still passes.</action>
    <verify>pnpm --filter @nexus/plugin-spider test -- spider-ui</verify>
    <done>Engine detail panel renders with stable field ids on first selection. The existing cancel-button test still passes. No behaviour change to polling yet.</done>
  </task>

  <task id="t2">
    <name>Split showEngineDetail into click-path and poll-path functions</name>
    <files>packages/plugins/spider/src/static/spider.js</files>
    <action>Introduce a new `updateEngineDetail(engine)` that performs only targeted writes into the stable field containers from t1 — no `innerHTML` rewrite of `#engine-detail-body`, no SSE touch, no cost refetch. Keep `showEngineDetail(engine)` as the click-path entry: it sets up the skeleton (via t1), opens the SSE stream, and triggers the first cost fetch if applicable. Update `fetchCurrentRigQuiet` to call `updateEngineDetail` instead of `showEngineDetail` when the selected engine is unchanged. The `selectedEngineId`-preserved-across-polls invariant in the existing regex test must still hold.</action>
    <verify>pnpm --filter @nexus/plugin-spider test -- spider-ui</verify>
    <done>Engine detail fields update across polls without `innerHTML` rewrite. `<details>` open state and `<pre>` scroll within Givens/Yields are preserved across polls during manual verification.</done>
  </task>

  <task id="t3">
    <name>Decouple SSE stream lifecycle from rig polling</name>
    <files>packages/plugins/spider/src/static/spider.js</files>
    <action>Hoist the SSE lifecycle out of the per-render path. Track the currently-streamed `sessionId` in module scope. Open the stream when an engine with a sessionId is selected, and reopen only when the tracked sessionId actually changes (covering both engine switches and a previously-no-session engine acquiring one). Do not touch the stream on rig polls. Move any per-stream flags such as `streamDone` to a scope that survives the function boundary so they correctly track the current `sessionEventSource`. Ensure deselecting an engine, navigating away from the rig, or receiving `done`/error still closes the stream cleanly.</action>
    <verify>pnpm --filter @nexus/plugin-spider test -- spider-ui</verify>
    <done>Manual verification: opening the engine detail view shows at most one `/api/spider/session-stream` connection per sessionId in the network panel; switching engines opens a new stream; rig polls do not reopen the stream.</done>
  </task>

  <task id="t4">
    <name>Apply atBottom scroll-preservation to all transcript write paths</name>
    <files>packages/plugins/spider/src/static/spider.js</files>
    <action>Generalise the existing noStream fallback's `atBottom` capture-mutate-restore pattern to the SSE chunk handler and the SSE transcript-replace handler. Capture whether the textarea is pinned to the bottom *before* mutating its value, then re-pin to the bottom after mutation only if it was pinned before. The noStream fallback already does this; the chunk and transcript handlers currently force `scrollTop = scrollHeight` unconditionally and must be brought into line.</action>
    <verify>pnpm --filter @nexus/plugin-spider test -- spider-ui</verify>
    <done>Manual verification: scrolling up in the transcript textarea and waiting several poll cycles does not yank scroll to the bottom; scrolling at the bottom and waiting still keeps the view pinned as new chunks arrive.</done>
  </task>

  <task id="t5">
    <name>Convert pipeline renderer to keyed in-place update</name>
    <files>packages/plugins/spider/src/static/spider.js</files>
    <action>Change `renderPipelineInto` from `innerHTML = ''` plus rebuild to a keyed-update strategy indexed by `engine.id`. On each call, reuse existing node DOM, patch only the status badge text and the selected-class on existing nodes, add new nodes for engines not yet present, and remove nodes for engines no longer in the list. The template-tab preview path must still work with this helper — it remains a degenerate first-call case. If the existing markup makes class-based targeting of the status badge fragile, add a class hook (e.g. `.pipeline-node-status`) to make the patch unambiguous.</action>
    <verify>pnpm --filter @nexus/plugin-spider test -- spider-ui</verify>
    <done>Manual verification: the pipeline row no longer flickers across rig polls; selecting an engine and the live status-badge updates still work; the Config tab's template-pipeline preview still renders correctly.</done>
  </task>

  <task id="t6">
    <name>Fetch session cost only on transition to completed</name>
    <files>packages/plugins/spider/src/static/spider.js</files>
    <action>Move the `/api/session/show?id=…` cost fetch out of the per-render path. In the poll updater, observe the engine's status across ticks; when an engine transitions into `completed` (and has a sessionId), trigger the cost fetch exactly once and write the resulting cost values into the stable cost-row containers from t1. In the click path, if the engine is already `completed` at selection time, fetch once on selection. Never refetch for an engine whose status has not transitioned.</action>
    <verify>pnpm --filter @nexus/plugin-spider test -- spider-ui</verify>
    <done>Manual verification via network panel: `/api/session/show?id=…` is requested once per completed engine, not on every 2 s poll.</done>
  </task>

  <task id="t7">
    <name>Update and extend regex-based UI tests</name>
    <files>packages/plugins/spider/src/static/spider-ui.test.ts</files>
    <action>Update any existing regex assertions broken by the refactor (notably anything that asserted on `showEngineDetail`'s monolithic body). Add new regex assertions that lock in the new structure: an `updateEngineDetail` function exists; `fetchCurrentRigQuiet` does not call `showEngineDetail` directly when the selected engine is unchanged; the chunk and transcript handlers contain an `atBottom` capture; the pipeline renderer contains a keyed-update path indexed by engine id; the cost fetch is gated on a status transition rather than fired unconditionally. Keep the existing cancel-button and `selectedEngineId`-preservation invariants intact.</action>
    <verify>pnpm -w test &amp;&amp; pnpm -w typecheck</verify>
    <done>The full workspace test and typecheck both pass; new regex assertions guard the structural invariants of the fix against regression.</done>
  </task>
</task-manifest>
