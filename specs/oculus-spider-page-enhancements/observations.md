# Observations — oculus-spider-page-enhancements

## Architectural Gaps

### 1. No real-time transcript streaming for running sessions

The brief requests "new messages should be displayed in real time as they are received" for running quick engine sessions. However, the Animator only writes transcript data to the Stacks `animator/transcripts` book after the session completes (in `recordSession()`, called after `providerResultPromise` resolves). During execution, transcript data lives only in-memory in the claude-code provider process.

True real-time streaming would require one of:
- An in-memory session chunk store exposed via SSE
- Incremental transcript writes during session execution
- A streaming API from the Animator

**Recommendation for a future commission**: Add an SSE endpoint to the Animator that relays `SessionChunk` events from the provider's async iterable. This would enable real-time session log display across the dashboard. The current commission can only show a spinner during execution and display the full transcript after completion.

### 2. No transcript retrieval API

There is no existing tool or route that reads from the `animator/transcripts` Stacks book. The `session-show` tool only reads the `sessions` book. This means the only way to access transcript messages is via direct Stacks `readBook()` calls. The current commission adds a spider-specific route for this, but a general-purpose `transcript-show` tool contributed by the Animator apparatus would be more reusable.

**Recommendation**: Add a `transcript-show` tool to the Animator's supportKit tools. This would make transcripts available across all consumers (dashboard, CLI, other plugins) rather than requiring each consumer to add its own route.

## Suboptimal Conventions Followed

### 3. Config route reads only guild.json templates

The `GET /api/spider/config` route handler reads `guildConfig().spider.rigTemplates` — the raw guild.json configuration. This misses kit-contributed templates entirely. The current commission adds `SpiderApi.listTemplates()` to fix this, but the original config route was designed when only config templates existed. This is a case where the code evolved (kit template support was added) but the API route wasn't updated to match.

### 4. Vanilla JS IIFE pattern limits testability

The spider.js file is an IIFE with no exports. Functions like `formatDate()`, `engineSummary()`, `topoSort()`, `badgeClass()` are pure functions that would benefit from unit tests, but the IIFE pattern makes them inaccessible to a test harness. Extracting utility functions into a shared module would improve testability. Not addressed in this commission to keep scope narrow.

## Doc/Code Discrepancies

### 5. SpiderApi mock in tools.test.ts is missing listBlockTypes

In `packages/plugins/spider/src/tools/tools.test.ts`, the `makeGuild` helper creates a mock `SpiderApi` that does not include `listBlockTypes()`. This was likely added to the interface after the test file was written. The mock would fail if any tested tool handler called `listBlockTypes()`. Currently none do, so this is a latent issue.

### 6. spider.md spec describes a static 5-engine pipeline

The Spider architecture doc (`docs/architecture/apparatus/spider.md`) describes the MVP with a fixed five-engine pipeline. The actual code now supports configurable rig templates with arbitrary engine graphs, kit-contributed templates, and template mappings. The doc has not been updated to reflect these features.

## Refactoring Opportunities

### 7. renderPipeline and showEngineDetail could accept a generic engine shape

Currently `renderPipeline(rig)` depends on `rig.engines` being `EngineInstance[]`. With S1 (template graphical view) reusing this function by mapping `RigTemplateEngine[]` to synthetic instances, a future refactor could make the pipeline renderer accept a generic `{ id, upstream, status?, designId? }[]` shape directly, reducing the impedance mismatch.

### 8. Writ list endpoint returns full WritDoc including body

The `GET /api/writ/list` tool returns full `WritDoc[]` including body text for every writ. For the rig list lookup map (D9), only `id` and `title` are needed. A lightweight writ-summary endpoint or query projection would reduce payload size. Not critical at current scale.
