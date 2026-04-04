## Commission Spec

---
author: plan-writer
author_version: 2026-04-03
estimated_complexity: 3
---

# Enhance Crawl CLI Behavior

## Summary

Rename the Spider's two crawl tools to follow the codebase's hyphenated naming convention (`crawl-one`, `crawl-continual`) and change the continuous crawl loop to run indefinitely by default instead of stopping after 3 idle cycles.

## Current State

The Spider apparatus (`/workspace/nexus/packages/plugins/spider/`) provides two tools:

**`crawl`** — defined in `src/tools/crawl.ts`:
```typescript
export default tool({
  name: 'crawl',
  description: "Execute one step of the Spider's crawl loop",
  instructions:
    'Runs a single crawl() step: collect a pending session result, run the next ' +
    'ready engine, or spawn a rig for a ready writ — in that priority order. ' +
    'Returns the action taken, or null if there is nothing to do.',
  params: {},
  permission: 'spider:write',
  handler: async () => {
    const spider = guild().apparatus<SpiderApi>('spider');
    return spider.crawl();
  },
});
```

**`crawlContinual`** — defined in `src/tools/crawl-continual.ts`:
```typescript
export default tool({
  name: 'crawlContinual',
  description: "Run the Spider's crawl loop continuously until idle",
  instructions:
    'Polls crawl() in a loop, sleeping between steps when idle. ' +
    'Stops when the configured number of consecutive idle cycles is reached. ' +
    'Returns a summary of all actions taken.',
  params: {
    maxIdleCycles: z
      .number()
      .optional()
      .default(3)
      .describe(
        'Number of consecutive idle crawl() calls before stopping (default: 3)',
      ),
    pollIntervalMs: z
      .number()
      .optional()
      .describe(
        'Override the configured poll interval in milliseconds',
      ),
  },
  // ...
});
```

The loop logic in the handler:
```typescript
while (idleCount < maxIdle) {
  // ... crawl() call ...
  if (result === null) {
    idleCount++;
    if (idleCount < maxIdle) {
      await new Promise<void>((resolve) => setTimeout(resolve, intervalMs));
    }
  } else {
    idleCount = 0;
    actions.push(result);
  }
}
```

The barrel file `src/tools/index.ts` exports:
```typescript
export { default as crawlTool } from './crawl.ts';
export { default as crawlContinualTool } from './crawl-continual.ts';
```

`src/spider.ts` imports and registers both:
```typescript
import { crawlTool, crawlContinualTool } from './tools/index.ts';
// ...
tools: [crawlTool, crawlContinualTool],
```

The architecture doc `docs/architecture/apparatus/spider.md` has stale tool references: `walk` (line 63), `start-walking` (line 103), `nsg start-crawling` (line 108), `nsg crawl` (line 109), and a now-obsolete "Tool naming note" (line 69).

## Requirements

- R1: The single-step crawl tool must have `name: 'crawl-one'`.
- R2: The continuous crawl tool must have `name: 'crawl-continual'`.
- R3: When `crawl-continual` is invoked with no `maxIdleCycles` argument, the crawl loop must run indefinitely (never stop due to idle cycles).
- R4: When `crawl-continual` is invoked with a positive `maxIdleCycles` value, the crawl loop must stop after that many consecutive idle cycles (existing behavior).
- R5: The `maxIdleCycles` parameter must default to `0`, where `0` means "run indefinitely."
- R6: The `crawl-continual` tool description must read `"Run the Spider's crawl loop continuously"` (no "until idle" qualifier).
- R7: The `crawl-continual` instructions text must explain that the loop runs indefinitely by default and that passing a positive `maxIdleCycles` enables auto-stop.
- R8: The `maxIdleCycles` param description must read: `'Max consecutive idle cycles before stopping. Pass a positive number to enable auto-stop (default: runs indefinitely)'`.
- R9: The source file `src/tools/crawl.ts` must be renamed to `src/tools/crawl-one.ts`.
- R10: The barrel export in `src/tools/index.ts` must rename `crawlTool` to `crawlOneTool` and update its import path to `./crawl-one.ts`.
- R11: The `console.error` log tag in `crawl-continual.ts` must read `'[crawl-continual]'`.
- R12: JSDoc comment headers in both tool files must reference the new tool names.
- R13: `src/spider.ts` must update its import to use `crawlOneTool` from the barrel.
- R14: The "Kit contribution" section (lines 48–71) and "Operational model" subsection (lines 103–113) of `docs/architecture/apparatus/spider.md` must be rewritten to accurately reflect the implemented tool names (`crawl-one`, `crawl-continual`), the actual `supportKit.tools` shape (an array, not an object), and the default indefinite-run behavior. The stale "Tool naming note" paragraph must be removed.

## Design

### Behavioral Changes

**Loop condition (crawl-continual handler):**

When `maxIdle` is `0`, the loop runs forever. When `maxIdle` is a positive number, the loop stops after that many consecutive idle cycles.

```typescript
while (maxIdle === 0 || idleCount < maxIdle) {
```

**Sleep simplification:** Always sleep after an idle or error cycle. Remove the `if (idleCount < maxIdle)` guards around the sleep calls. The `while` condition handles termination; there is no need to micro-optimize the final sleep before exit.

```typescript
while (maxIdle === 0 || idleCount < maxIdle) {
  let result: Awaited<ReturnType<typeof spider.crawl>>;
  try {
    result = await spider.crawl();
  } catch (err) {
    console.error('[crawl-continual] crawl() error:', err instanceof Error ? err.message : String(err));
    idleCount++;
    await new Promise<void>((resolve) => setTimeout(resolve, intervalMs));
    continue;
  }
  if (result === null) {
    idleCount++;
    await new Promise<void>((resolve) => setTimeout(resolve, intervalMs));
  } else {
    idleCount = 0;
    actions.push(result);
  }
}
```

### Type Changes

No type additions or modifications. `SpiderApi`, `CrawlResult`, `SpiderConfig`, and all other types are unchanged. The `maxIdleCycles` parameter is a Zod schema on the tool definition, not a shared type.

### Complete Tool Definitions (after changes)

**`src/tools/crawl-one.ts`** (renamed from `crawl.ts`):
```typescript
/**
 * crawl-one tool — executes a single step of the crawl loop.
 *
 * Returns the CrawlResult or null (idle) from one crawl() call.
 * Useful for manual step-through or testing.
 */

import { guild } from '@shardworks/nexus-core';
import { tool } from '@shardworks/tools-apparatus';
import type { SpiderApi } from '../types.ts';

export default tool({
  name: 'crawl-one',
  description: "Execute one step of the Spider's crawl loop",
  instructions:
    'Runs a single crawl() step: collect a pending session result, run the next ' +
    'ready engine, or spawn a rig for a ready writ — in that priority order. ' +
    'Returns the action taken, or null if there is nothing to do.',
  params: {},
  permission: 'spider:write',
  handler: async () => {
    const spider = guild().apparatus<SpiderApi>('spider');
    return spider.crawl();
  },
});
```

**`src/tools/crawl-continual.ts`** (full replacement):
```typescript
/**
 * crawl-continual tool — runs the crawl loop continuously.
 *
 * Polls crawl() on a configurable interval. By default the loop runs
 * indefinitely; pass a positive maxIdleCycles to enable auto-stop after
 * that many consecutive idle cycles.
 */

import { z } from 'zod';
import { guild } from '@shardworks/nexus-core';
import { tool } from '@shardworks/tools-apparatus';
import type { SpiderApi, SpiderConfig } from '../types.ts';

export default tool({
  name: 'crawl-continual',
  description: "Run the Spider's crawl loop continuously",
  instructions:
    'Polls crawl() in a loop, sleeping between steps when idle. ' +
    'By default the loop runs indefinitely. Pass a positive maxIdleCycles ' +
    'to stop after that many consecutive idle cycles. ' +
    'Returns a summary of all actions taken.',
  params: {
    maxIdleCycles: z
      .number()
      .optional()
      .default(0)
      .describe(
        'Max consecutive idle cycles before stopping. Pass a positive number to enable auto-stop (default: runs indefinitely)',
      ),
    pollIntervalMs: z
      .number()
      .optional()
      .describe(
        'Override the configured poll interval in milliseconds',
      ),
  },
  permission: 'spider:write',
  handler: async (params) => {
    const g = guild();
    const spider = g.apparatus<SpiderApi>('spider');
    const config = g.guildConfig().spider ?? {} as SpiderConfig;
    const intervalMs = params.pollIntervalMs ?? config.pollIntervalMs ?? 5000;
    const maxIdle = params.maxIdleCycles;

    const actions: unknown[] = [];
    let idleCount = 0;

    while (maxIdle === 0 || idleCount < maxIdle) {
      let result: Awaited<ReturnType<typeof spider.crawl>>;
      try {
        result = await spider.crawl();
      } catch (err) {
        console.error('[crawl-continual] crawl() error:', err instanceof Error ? err.message : String(err));
        idleCount++;
        await new Promise<void>((resolve) => setTimeout(resolve, intervalMs));
        continue;
      }
      if (result === null) {
        idleCount++;
        await new Promise<void>((resolve) => setTimeout(resolve, intervalMs));
      } else {
        idleCount = 0;
        actions.push(result);
      }
    }

    return { actions, totalActions: actions.length };
  },
});
```

**`src/tools/index.ts`**:
```typescript
export { default as crawlOneTool } from './crawl-one.ts';
export { default as crawlContinualTool } from './crawl-continual.ts';
```

### Spider.ts Import Update

In `src/spider.ts`, the import (line 42) and usage (line 382) change:

```typescript
// Import
import { crawlOneTool, crawlContinualTool } from './tools/index.ts';

// Usage (unchanged shape)
tools: [crawlOneTool, crawlContinualTool],
```

### Documentation Update — spider.md

**Kit contribution section** (replace lines 48–71):

````markdown
### Kit contribution

The Spider contributes its five engine designs via its support kit:

```typescript
// In spider-apparatus plugin
supportKit: {
  engines: {
    draft:     draftEngine,
    implement: implementEngine,
    review:    reviewEngine,
    revise:    reviseEngine,
    seal:      sealEngine,
  },
  tools: [crawlOneTool, crawlContinualTool],
},
```

The Fabricator scans kit `engines` contributions at startup (same pattern as the Instrumentarium scanning tools). The Spider contributes its engines like any other kit — no special registration path.
````

**Operational model subsection** (replace lines 103–113):

````markdown
### Operational model

The Spider exports two tools:

```
nsg crawl-continual   # starts polling loop, crawls every ~5s, runs indefinitely
nsg crawl-one         # single step (useful for debugging/testing)
```

The `crawl-continual` loop: call `crawl()`, sleep `pollIntervalMs` (default 5000), repeat. When `crawl()` returns null, the loop doesn't stop — it keeps polling. New writs posted via `nsg commission-post` from a separate terminal are picked up on the next poll cycle. Pass `--maxIdleCycles N` to stop after N consecutive idle cycles.
````

### Non-obvious Touchpoints

- **`src/tools/index.ts`** — barrel re-exports must update both the import path (`./crawl-one.ts`) and the export name (`crawlOneTool`).
- **`src/spider.ts` line 42** — imports the barrel; must update the imported name from `crawlTool` to `crawlOneTool`.
- **`dist/` directory** — built artifacts. After the source changes, a rebuild will produce new filenames under `dist/tools/`. Old `dist/tools/crawl.js` (and `.d.ts`, `.map`) become orphaned. The implementing agent should run the build but does not need to manually clean `dist/` — the build tool handles it.

## Validation Checklist

- V1 [R1]: Run `grep "name: 'crawl-one'" packages/plugins/spider/src/tools/crawl-one.ts` — must match exactly one line.
- V2 [R2]: Run `grep "name: 'crawl-continual'" packages/plugins/spider/src/tools/crawl-continual.ts` — must match exactly one line.
- V3 [R5]: Run `grep "\.default(0)" packages/plugins/spider/src/tools/crawl-continual.ts` — must match the `maxIdleCycles` param.
- V4 [R3, R5]: Verify the loop condition reads `while (maxIdle === 0 || idleCount < maxIdle)` in `crawl-continual.ts`.
- V5 [R4]: Verify that when `maxIdle` is a positive number (e.g. `3`), the condition `idleCount < maxIdle` terminates the loop after 3 idle cycles. Confirm by reading the loop logic.
- V6 [R6]: Run `grep "description:" packages/plugins/spider/src/tools/crawl-continual.ts` — description must be `"Run the Spider's crawl loop continuously"` with no "until idle" qualifier.
- V7 [R7]: Confirm the `instructions` string in `crawl-continual.ts` contains "By default the loop runs indefinitely" and "Pass a positive maxIdleCycles".
- V8 [R8]: Confirm the `maxIdleCycles` `.describe()` string reads `'Max consecutive idle cycles before stopping. Pass a positive number to enable auto-stop (default: runs indefinitely)'`.
- V9 [R9]: Run `ls packages/plugins/spider/src/tools/crawl-one.ts` — file must exist. Run `ls packages/plugins/spider/src/tools/crawl.ts` — file must NOT exist.
- V10 [R10, R13]: Run `grep "crawlOneTool" packages/plugins/spider/src/tools/index.ts packages/plugins/spider/src/spider.ts` — must appear in both files. Run `grep "crawlTool" packages/plugins/spider/src/tools/index.ts packages/plugins/spider/src/spider.ts` — must match zero lines (the old name is gone).
- V11 [R11]: Run `grep "\[crawl-continual\]" packages/plugins/spider/src/tools/crawl-continual.ts` — must match. Run `grep "\[crawlContinual\]" packages/plugins/spider/src/tools/crawl-continual.ts` — must not match.
- V12 [R12]: Confirm the JSDoc header in `crawl-one.ts` contains `crawl-one tool` and the header in `crawl-continual.ts` contains `crawl-continual tool`.
- V13 [R14]: Confirm `docs/architecture/apparatus/spider.md` contains `nsg crawl-continual` and `nsg crawl-one`, does NOT contain `start-walking`, `start-crawling`, `walk:`, or `crawlContinual:` in the kit/tools sections, and does not contain the "Tool naming note" paragraph.
- V14 [R3, R4]: Run `pnpm build` from the spider package directory — build must succeed with no type errors.
- V15 [R1–R14]: Run `pnpm test` from the spider package directory — all existing tests must pass. (The tests call `spider.crawl()` on the API, not via tool handlers, so they are unaffected by the rename.)

## Test Cases

- **Happy path — crawl-one invocation:** Call the `crawl-one` tool handler with no params. When rigs/writs exist, it returns a `CrawlResult`. When idle, it returns `null`. (Existing `spider.crawl()` tests cover this logic; a tool-level test would verify the wrapper calls through.)
- **Happy path — crawl-continual indefinite default:** Call the `crawl-continual` handler with no arguments (`maxIdleCycles` defaults to `0`). Simulate alternating idle and active crawl results. Verify the loop does NOT terminate after any number of consecutive idle cycles. (Must be tested with a mock that eventually throws or is externally interrupted to avoid infinite loop in test.)
- **Positive maxIdleCycles — auto-stop:** Call the `crawl-continual` handler with `maxIdleCycles: 2`. Simulate 2 consecutive idle crawl results. Verify the loop terminates and returns `{ actions: [], totalActions: 0 }`.
- **Positive maxIdleCycles — idle counter resets on work:** Call with `maxIdleCycles: 3`. Simulate: idle, idle, work, idle, idle, idle. Verify the loop runs through all 6 cycles (counter resets after work) and terminates after the final 3 consecutive idles.
- **Error handling — crawl() throws:** Call with `maxIdleCycles: 2`. Simulate `spider.crawl()` throwing an error twice. Verify `console.error` is called with `[crawl-continual]` tag, idle counter increments, and loop terminates after 2 errors.
- **Edge case — maxIdleCycles: 1:** Verify loop terminates after a single idle cycle.
- **Edge case — maxIdleCycles: 0 with immediate work:** Simulate continuous non-null results. Verify loop never exits on its own (test with bounded iteration count).

## Commission Diff

```
 docs/architecture/apparatus/spider.md              | 17 +++++-------
 packages/plugins/spider/src/spider.ts              |  4 +--
 .../plugins/spider/src/tools/crawl-continual.ts    | 30 ++++++++++------------
 .../spider/src/tools/{crawl.ts => crawl-one.ts}    |  4 +--
 packages/plugins/spider/src/tools/index.ts         |  2 +-
 5 files changed, 25 insertions(+), 32 deletions(-)

diff --git a/docs/architecture/apparatus/spider.md b/docs/architecture/apparatus/spider.md
index cfc4906..e1024a9 100644
--- a/docs/architecture/apparatus/spider.md
+++ b/docs/architecture/apparatus/spider.md
@@ -59,15 +59,10 @@ supportKit: {
     revise:    reviseEngine,
     seal:      sealEngine,
   },
-  tools: {
-    walk:          crawlTool,           // single step — do one thing and return
-    crawlContinual: crawlContinualTool,  // polling loop — walk every ~5s until stopped
-  },
+  tools: [crawlOneTool, crawlContinualTool],
 },
 ```
 
-**Tool naming note:** Hyphenated tool names (e.g. `start-walking`) have known issues with CLI argument parsing and tool grouping in `nsg`. The names above use camelCase in code; the CLI surface (`nsg crawl`, `nsg crawl-continual`) needs to work cleanly with the Instrumentarium's tool registration. Final CLI naming TBD — may need to revisit how the Instrumentarium maps tool IDs to CLI commands.
-
 The Fabricator scans kit `engines` contributions at startup (same pattern as the Instrumentarium scanning tools). The Spider contributes its engines like any other kit — no special registration path.
 
 ---
@@ -100,16 +95,16 @@ Each `crawl()` call does exactly one thing. The priority ordering:
 
 If nothing qualifies at any level, return null (the guild is idle or all work is blocked on running quick engines).
 
-### Operational model: `start-walking`
+### Operational model
 
-The Spider exports a `start-walking` tool that runs the crawl loop:
+The Spider exports two tools:
 
 ```
-nsg start-crawling    # starts polling loop, walks every ~5s
-nsg crawl             # single step (useful for debugging/testing)
+nsg crawl-continual   # starts polling loop, crawls every ~5s, runs indefinitely
+nsg crawl-one         # single step (useful for debugging/testing)
 ```
 
-The loop: call `crawl()`, sleep `pollIntervalMs` (default 5000), repeat. When `crawl()` returns null, the loop doesn't stop — it keeps polling. New writs posted via `nsg commission-post` from a separate terminal are picked up on the next poll cycle.
+The `crawl-continual` loop: call `crawl()`, sleep `pollIntervalMs` (default 5000), repeat. When `crawl()` returns null, the loop doesn't stop — it keeps polling. New writs posted via `nsg commission-post` from a separate terminal are picked up on the next poll cycle. Pass `--maxIdleCycles N` to stop after N consecutive idle cycles.
 
 ---
 
diff --git a/packages/plugins/spider/src/spider.ts b/packages/plugins/spider/src/spider.ts
index 0554c1d..d3128a4 100644
--- a/packages/plugins/spider/src/spider.ts
+++ b/packages/plugins/spider/src/spider.ts
@@ -40,7 +40,7 @@ import {
   sealEngine,
 } from './engines/index.ts';
 
-import { crawlTool, crawlContinualTool, rigShowTool, rigListTool, rigForWritTool } from './tools/index.ts';
+import { crawlOneTool, crawlContinualTool, rigShowTool, rigListTool, rigForWritTool } from './tools/index.ts';
 
 // ── Helpers ────────────────────────────────────────────────────────────
 
@@ -408,7 +408,7 @@ export function createSpider(): Plugin {
           revise:    reviseEngine,
           seal:      sealEngine,
         },
-        tools: [crawlTool, crawlContinualTool, rigShowTool, rigListTool, rigForWritTool],
+        tools: [crawlOneTool, crawlContinualTool, rigShowTool, rigListTool, rigForWritTool],
       },
 
       provides: api,
diff --git a/packages/plugins/spider/src/tools/crawl-continual.ts b/packages/plugins/spider/src/tools/crawl-continual.ts
index 54b7605..8b2d1e7 100644
--- a/packages/plugins/spider/src/tools/crawl-continual.ts
+++ b/packages/plugins/spider/src/tools/crawl-continual.ts
@@ -1,8 +1,9 @@
 /**
- * crawlContinual tool — runs the crawl loop continuously.
+ * crawl-continual tool — runs the crawl loop continuously.
  *
- * Polls crawl() on a configurable interval until stopped or no remaining
- * work exists for the configured number of consecutive idle cycles.
+ * Polls crawl() on a configurable interval. By default the loop runs
+ * indefinitely; pass a positive maxIdleCycles to enable auto-stop after
+ * that many consecutive idle cycles.
  */
 
 import { z } from 'zod';
@@ -11,19 +12,20 @@ import { tool } from '@shardworks/tools-apparatus';
 import type { SpiderApi, SpiderConfig } from '../types.ts';
 
 export default tool({
-  name: 'crawlContinual',
-  description: "Run the Spider's crawl loop continuously until idle",
+  name: 'crawl-continual',
+  description: "Run the Spider's crawl loop continuously",
   instructions:
     'Polls crawl() in a loop, sleeping between steps when idle. ' +
-    'Stops when the configured number of consecutive idle cycles is reached. ' +
+    'By default the loop runs indefinitely. Pass a positive maxIdleCycles ' +
+    'to stop after that many consecutive idle cycles. ' +
     'Returns a summary of all actions taken.',
   params: {
     maxIdleCycles: z
       .number()
       .optional()
-      .default(3)
+      .default(0)
       .describe(
-        'Number of consecutive idle crawl() calls before stopping (default: 3)',
+        'Max consecutive idle cycles before stopping. Pass a positive number to enable auto-stop (default: runs indefinitely)',
       ),
     pollIntervalMs: z
       .number()
@@ -43,23 +45,19 @@ export default tool({
     const actions: unknown[] = [];
     let idleCount = 0;
 
-    while (idleCount < maxIdle) {
+    while (maxIdle === 0 || idleCount < maxIdle) {
       let result: Awaited<ReturnType<typeof spider.crawl>>;
       try {
         result = await spider.crawl();
       } catch (err) {
-        console.error('[crawlContinual] crawl() error:', err instanceof Error ? err.message : String(err));
+        console.error('[crawl-continual] crawl() error:', err instanceof Error ? err.message : String(err));
         idleCount++;
-        if (idleCount < maxIdle) {
-          await new Promise<void>((resolve) => setTimeout(resolve, intervalMs));
-        }
+        await new Promise<void>((resolve) => setTimeout(resolve, intervalMs));
         continue;
       }
       if (result === null) {
         idleCount++;
-        if (idleCount < maxIdle) {
-          await new Promise<void>((resolve) => setTimeout(resolve, intervalMs));
-        }
+        await new Promise<void>((resolve) => setTimeout(resolve, intervalMs));
       } else {
         idleCount = 0;
         actions.push(result);
diff --git a/packages/plugins/spider/src/tools/crawl.ts b/packages/plugins/spider/src/tools/crawl-one.ts
similarity index 90%
rename from packages/plugins/spider/src/tools/crawl.ts
rename to packages/plugins/spider/src/tools/crawl-one.ts
index 4354d8d..9461eea 100644
--- a/packages/plugins/spider/src/tools/crawl.ts
+++ b/packages/plugins/spider/src/tools/crawl-one.ts
@@ -1,5 +1,5 @@
 /**
- * crawl tool — executes a single step of the crawl loop.
+ * crawl-one tool — executes a single step of the crawl loop.
  *
  * Returns the CrawlResult or null (idle) from one crawl() call.
  * Useful for manual step-through or testing.
@@ -10,7 +10,7 @@ import { tool } from '@shardworks/tools-apparatus';
 import type { SpiderApi } from '../types.ts';
 
 export default tool({
-  name: 'crawl',
+  name: 'crawl-one',
   description: "Execute one step of the Spider's crawl loop",
   instructions:
     'Runs a single crawl() step: collect a pending session result, run the next ' +
diff --git a/packages/plugins/spider/src/tools/index.ts b/packages/plugins/spider/src/tools/index.ts
index 5324f0d..66a27bb 100644
--- a/packages/plugins/spider/src/tools/index.ts
+++ b/packages/plugins/spider/src/tools/index.ts
@@ -1,4 +1,4 @@
-export { default as crawlTool } from './crawl.ts';
+export { default as crawlOneTool } from './crawl-one.ts';
 export { default as crawlContinualTool } from './crawl-continual.ts';
 export { default as rigShowTool } from './rig-show.ts';
 export { default as rigListTool } from './rig-list.ts';

```

## Full File Contents (for context)

=== FILE: docs/architecture/apparatus/spider.md ===
# The Spider — API Contract

Status: **Ready — MVP**

Package: `@shardworks/spider-apparatus` · Plugin id: `spider`

> **⚠️ MVP scope.** This spec covers a static rig graph: every commission gets the same five-engine pipeline (`draft → implement → review → revise → seal`). No origination, no dynamic extension, no capability resolution. The Spider runs engines directly — the Executor earns its independence later. See [What This Spec Does NOT Cover](#what-this-spec-does-not-cover) for the full list.

---

## Purpose

The Spider is the spine of the guild's rigging system. It replaces the Dispatch apparatus, which ran one writ in one session with no review. The Spider runs a structured engine pipeline for each commission, advancing the rig one step at a time via a `crawl()` step function.

The Spider owns the rig's structural lifecycle — spawn, traverse, complete — and delegates everything else. Engine designs come from the Fabricator. Sessions come from the Animator. Draft bindings come from the Scriptorium. Writ transitions are handled by a CDC handler, not inline. The Spider itself is stateless between `crawl()` calls; all state lives in the Stacks.

---

## Dependencies

```
requires: ['fabricator', 'clerk', 'stacks']
```

- **The Fabricator** — resolves engine designs by `designId`.
- **The Clerk** — queries ready writs; receives writ transitions via CDC.
- **The Stacks** — persists rigs book, reads sessions book, hosts CDC handler on rigs book.

Engines pull their own apparatus dependencies (Scriptorium, Animator, Loom) via the `guild()` singleton — these are not Spider dependencies.

### Reference docs

- **The Rigging System** (`docs/architecture/rigging.md`) — full rigging architecture (Spider, Fabricator, Executor, Manifester). This spec implements a subset.
- **The Fabricator** (`docs/architecture/apparatus/fabricator.md`) — engine design registry and `EngineDesign` type definitions.
- **The Scriptorium** (`docs/architecture/apparatus/scriptorium.md`) — draft binding API (`openDraft`, `seal`, `abandonDraft`).
- **The Animator** (`docs/architecture/apparatus/animator.md`) — session API (`summon`, `animate`), `AnimateHandle`, `SessionResult`.
- **The Clerk** (`docs/architecture/apparatus/clerk.md`) — writ lifecycle API.
- **The Stacks** (`docs/architecture/apparatus/stacks.md`) — CDC phases, cascade vs notification, `watch()` API.

---

## The Engine Interface

Engines are the unit of work in a rig. Each engine implements a standard interface defined by the Fabricator apparatus (`@shardworks/fabricator-apparatus`). The `EngineDesign`, `EngineRunContext`, and `EngineRunResult` types are owned and exported by the Fabricator — see the Fabricator spec (`docs/architecture/apparatus/fabricator.md`) for full type definitions. Engines pull their own apparatus dependencies via `guild().apparatus(...)` — same pattern as tool handlers.

The Spider resolves engine designs by `designId` from the Fabricator at runtime: `fabricator.getEngineDesign(id)`.

### Kit contribution

The Spider contributes its five engine designs via its support kit:

```typescript
// In spider-apparatus plugin
supportKit: {
  engines: {
    draft:     draftEngine,
    implement: implementEngine,
    review:    reviewEngine,
    revise:    reviseEngine,
    seal:      sealEngine,
  },
  tools: [crawlOneTool, crawlContinualTool],
},
```

The Fabricator scans kit `engines` contributions at startup (same pattern as the Instrumentarium scanning tools). The Spider contributes its engines like any other kit — no special registration path.

---

## The Walk Function

The Spider's core is a single step function:

```typescript
interface SpiderApi {
  /**
   * Examine guild state and perform the single highest-priority action.
   * Returns a description of what was done, or null if there's nothing to do.
   */
  crawl(): Promise<CrawlResult | null>
}

type CrawlResult =
  | { action: 'engine-completed'; rigId: string; engineId: string }
  | { action: 'engine-started'; rigId: string; engineId: string }
  | { action: 'rig-spawned'; rigId: string; writId: string }
  | { action: 'rig-completed'; rigId: string; writId: string; outcome: 'completed' | 'failed' }
```

Each `crawl()` call does exactly one thing. The priority ordering:

1. **Collect a completed engine.** Scan all running rigs for an engine with `status === 'running'`. Read the session record from the sessions book by `engine.sessionId`. If the session has reached a terminal status (`completed` or `failed`), update the engine: set its status and populate its yields (or error). **Yield assembly:** look up the `EngineDesign` by `designId` from the Fabricator. If the design defines a `collect(sessionId, givens, context)` method, call it to assemble the yields — passing the same givens and context that were passed to `run()`. Otherwise, use the generic default: `{ sessionId, sessionStatus, output? }`. This keeps engine-specific yield logic (e.g. parsing review findings) in the engine, not the Spider. If the engine failed, mark the rig `failed` (same transaction). If the completed engine is the terminal engine (`seal`), mark the rig `completed` (same transaction). Rig status changes trigger the CDC handler (see below). Returns `rig-completed` if the rig transitioned, otherwise `engine-completed`. This is the first priority because it unblocks downstream engines.
2. **Run a ready engine.** An engine is ready when `status === 'pending'` and all engines in its `upstream` array have `status === 'completed'`. Look up the `EngineDesign` by `designId` from the Fabricator. Assemble givens (from givensSpec) and context (with upstream yields), then call `design.run(givens, context)`. For clockwork engines (`status: 'completed'` result): store the yields on the engine instance, mark it completed, and check for rig completion (same as step 1). Returns `engine-completed` (or `rig-completed` if this was the terminal engine). For quick engines (`status: 'launched'` result): store the `sessionId`, mark the engine `running`. Returns `engine-started`. Completion is collected on subsequent crawl calls via step 1.
3. **Spawn a rig.** If there's a ready writ with no rig, spawn the static graph. Returns `rig-spawned`.

If nothing qualifies at any level, return null (the guild is idle or all work is blocked on running quick engines).

### Operational model

The Spider exports two tools:

```
nsg crawl-continual   # starts polling loop, crawls every ~5s, runs indefinitely
nsg crawl-one         # single step (useful for debugging/testing)
```

The `crawl-continual` loop: call `crawl()`, sleep `pollIntervalMs` (default 5000), repeat. When `crawl()` returns null, the loop doesn't stop — it keeps polling. New writs posted via `nsg commission-post` from a separate terminal are picked up on the next poll cycle. Pass `--maxIdleCycles N` to stop after N consecutive idle cycles.

---

## Rig Data Model

### Rig

```typescript
interface Rig {
  id: string
  writId: string
  status: 'running' | 'completed' | 'failed'
  engines: EngineInstance[]
}
```

Stored in the Stacks `rigs` book. One rig per writ. The Spider reads and updates rigs via normal Stacks `put()`/`patch()` operations.

### Engine Instance

```typescript
interface EngineInstance {
  id: string               // unique within the rig, e.g. 'draft', 'implement', 'review', 'revise', 'seal'
  designId: string         // engine design id — resolved from the Fabricator
  status: 'pending' | 'running' | 'completed' | 'failed'
  upstream: string[]       // ids of engines that must complete first (empty = first engine)
  givensSpec: Record<string, unknown>  // givens specification — literal values now, templates later
  yields: unknown          // set on completion — the engine's yields (see Yield Types below)
  error?: string           // set on failure
  sessionId?: string       // set when run() returns 'launched' — Spider polls for completion
  startedAt?: string       // ISO-8601, set when engine begins running (enables future timeout detection)
  completedAt?: string     // ISO-8601, set when engine reaches terminal status
}
```

An engine is **ready** when: `status === 'pending'` and all engines in its `upstream` array have `status === 'completed'`.

### The Static Graph

Every spawned rig gets this engine list:

```typescript
function spawnStaticRig(writ: Writ, config: SpiderConfig): EngineInstance[] {
  return [
    { id: 'draft',     designId: 'draft',     status: 'pending', upstream: [],
      givensSpec: { writ }, yields: null },
    { id: 'implement', designId: 'implement', status: 'pending', upstream: ['draft'],
      givensSpec: { writ, role: config.role }, yields: null },
    { id: 'review',    designId: 'review',    status: 'pending', upstream: ['implement'],
      givensSpec: { writ, role: 'reviewer', buildCommand: config.buildCommand, testCommand: config.testCommand }, yields: null },
    { id: 'revise',    designId: 'revise',    status: 'pending', upstream: ['review'],
      givensSpec: { writ, role: config.role }, yields: null },
    { id: 'seal',      designId: 'seal',      status: 'pending', upstream: ['revise'],
      givensSpec: {}, yields: null },
  ]
}
```

The `givensSpec` is populated from the Spider's config at rig spawn time. The rig is self-contained after spawning — no runtime config lookups needed. The `writ` is passed as a given to engines that need it (most do; `seal` doesn't). All engines start with `yields: null` — yields are populated when the engine completes (see [Yield Types](#yield-types-and-data-flow)).

The rig is **completed** when the terminal engine (`seal`) has `status === 'completed'`. The rig is **failed** when any engine has `status === 'failed'`.

---

## Yield Types and Data Flow

Each engine produces typed yields that downstream engines consume. The yields are stored on the `EngineInstance.yields` field in the Stacks.

**Serialization constraint:** Because yields are persisted to the Stacks (JSON-backed), all yield values **must be JSON-serializable**. The Spider should validate this at storage time — if an engine returns a non-serializable value (function, circular reference, etc.), the engine fails with a clear error. This is important because engines are a plugin extension point — kit authors need a hard boundary, not a silent corruption.

When the Spider runs an engine, it assembles givens from the givensSpec only — upstream yields are **not** merged into givens. Engines that need upstream data access it via the `context.upstream` escape hatch:

```typescript
function assembleGivensAndContext(rig: Rig, engine: EngineInstance) {
  // Collect all completed engine yields for the context escape hatch.
  // All completed yields are included regardless of graph distance —
  // simpler than chain-walking and equivalent for the static graph.
  const upstream: Record<string, unknown> = {}
  for (const e of rig.engines) {
    if (e.status === 'completed' && e.yields !== undefined) {
      upstream[e.id] = e.yields
    }
  }

  // Givens = givensSpec only. Upstream data stays on context.
  const givens = { ...engine.givensSpec }

  const context: EngineRunContext = {
    engineId: engine.id,
    upstream,
  }

  return { givens, context }
}
```

Givens contain only what the givensSpec declares — static values set at rig spawn time (writ, role, buildCommand, etc.). Engines that need upstream data (worktree path, review findings, etc.) pull it from `context.upstream` by engine id. This keeps the givens contract clean: what you see in the givensSpec is exactly what the engine receives.

### `DraftYields`

```typescript
interface DraftYields {
  draftId: string         // the draft binding's unique id (from DraftRecord.id)
  codexName: string       // which codex this draft is on (from DraftRecord.codexName)
  branch: string          // git branch name for the draft (from DraftRecord.branch)
  path: string            // absolute path to the draft worktree (from DraftRecord.path)
  baseSha: string         // commit SHA at draft open — used to compute diffs later
}
```

**Produced by:** `draft` engine
**Consumed by:** all downstream engines. Establishes the physical workspace.

> **Note:** Field names mirror the Scriptorium's `DraftRecord` type (`codexName`, `branch`, `path`) rather than inventing Spider-specific aliases. `baseSha` is the only field the draft engine adds itself — by reading `HEAD` after opening the draft.

### `ImplementYields`

```typescript
interface ImplementYields {
  sessionId: string
  sessionStatus: 'completed' | 'failed'
}
```

**Produced by:** `implement` engine (set by Spider's collect step when session completes)
**Consumed by:** `review` (needs to know the session completed)

### `ReviewYields`

```typescript
interface ReviewYields {
  sessionId: string
  passed: boolean                      // reviewer's overall assessment
  findings: string                     // structured markdown: what passed, what's missing, what's wrong
  mechanicalChecks: MechanicalCheck[]  // build/test results run before the reviewer session
}

interface MechanicalCheck {
  name: 'build' | 'test'
  passed: boolean
  output: string    // stdout+stderr, truncated to 4KB
  durationMs: number
}
```

**Produced by:** `review` engine
**Consumed by:** `revise` (needs `passed` to decide whether to do work, needs `findings` as context)

The `mechanicalChecks` are run by the engine *before* launching the reviewer session — their results are included in the reviewer's prompt.

### `ReviseYields`

```typescript
interface ReviseYields {
  sessionId: string
  sessionStatus: 'completed' | 'failed'
}
```

**Produced by:** `revise` engine (set by Spider's collect step when session completes)
**Consumed by:** `seal` (no data dependency — seal just needs revise to be done)

### `SealYields`

```typescript
interface SealYields {
  sealedCommit: string                     // the commit SHA at head of target after sealing (from SealResult)
  strategy: 'fast-forward' | 'rebase'      // merge strategy used (from SealResult)
  retries: number                          // rebase retry attempts needed (from SealResult)
  inscriptionsSealed: number               // number of commits incorporated (from SealResult)
}
```

**Produced by:** `seal` engine
**Consumed by:** nothing (terminal). Used by the CDC handler for the writ transition resolution message.

> **Note:** Field names mirror the Scriptorium's `SealResult` type. Push is a separate Scriptorium operation — the seal engine seals but does not push.

---

## Engine Implementations

Each engine is an `EngineDesign` contributed by the Spider's support kit. The engine's `run()` method receives assembled givens and a thin context, and returns an `EngineRunResult`. Engines pull apparatus dependencies via `guild().apparatus(...)`.

### `draft` (clockwork)

Opens a draft binding on the commission's target codex.

```typescript
async run(givens: Record<string, unknown>, _context: EngineRunContext): Promise<EngineRunResult> {
  const scriptorium = guild().apparatus<ScriptoriumApi>('codexes')
  const writ = givens.writ as Writ
  const draft = await scriptorium.openDraft({ codexName: writ.codex, associatedWith: writ.id })
  const baseSha = await getHeadSha(draft.path)

  return {
    status: 'completed',
    yields: { draftId: draft.id, codexName: draft.codexName, branch: draft.branch, path: draft.path, baseSha } satisfies DraftYields,
  }
}
```

### `implement` (quick)

Summons an anima to do the commissioned work.

```typescript
async run(givens: Record<string, unknown>, context: EngineRunContext): Promise<EngineRunResult> {
  const animator = guild().apparatus<AnimatorApi>('animator')
  const writ = givens.writ as Writ
  const draft = context.upstream.draft as DraftYields

  const prompt = `${writ.body}\n\nCommit all changes before ending your session.`

  const handle = animator.summon({
    role: givens.role as string,
    prompt,
    cwd: draft.path,
    environment: { GIT_AUTHOR_EMAIL: `${writ.id}@nexus.local` },
    metadata: { engineId: context.engineId, writId: writ.id },
  })

  return { status: 'launched', sessionId: handle.sessionId }
}
```

The implement engine wraps the writ body with a commit instruction — each engine owns its own prompt contract rather than relying on `dispatch.sh` to append instructions to the writ body.

**Collect step:** The implement engine has no `collect` method — the Spider uses the generic default: `{ sessionId, sessionStatus, output? }`.

### `review` (quick)

Runs mechanical checks, then summons a reviewer anima to assess the implementation.

```typescript
async run(givens: Record<string, unknown>, context: EngineRunContext): Promise<EngineRunResult> {
  const animator = guild().apparatus<AnimatorApi>('animator')
  const writ = givens.writ as Writ
  const draft = context.upstream.draft as DraftYields

  // 1. Run mechanical checks synchronously
  const checks: MechanicalCheck[] = []
  if (givens.buildCommand) {
    checks.push(await runCheck('build', givens.buildCommand as string, draft.path))
  }
  if (givens.testCommand) {
    checks.push(await runCheck('test', givens.testCommand as string, draft.path))
  }

  // 2. Compute diff since draft opened
  const diff = await gitDiff(draft.path, draft.baseSha)
  const status = await gitStatus(draft.path)

  // 3. Assemble review prompt
  const prompt = assembleReviewPrompt(writ, diff, status, checks)

  // 4. Launch reviewer session
  const handle = animator.summon({
    role: givens.role as string,
    prompt,
    cwd: draft.path,
    metadata: {
      engineId: context.engineId,
      writId: writ.id,
      mechanicalChecks: checks,  // stash for collect step to retrieve
    },
  })

  return { status: 'launched', sessionId: handle.sessionId }
}
```

**Review prompt template:**

```markdown
# Code Review

You are reviewing work on a commission. Your job is to assess whether the
implementation satisfies the spec, identify any gaps or problems, and produce
a structured findings document.

## The Commission (Spec)

{writ.body}

## Implementation Diff

Changes since the draft was opened:

```diff
{git diff draft.baseSha..HEAD in worktree}
```

## Current Worktree State

```
{git status --porcelain}
```

## Mechanical Check Results

{for each check}
### {name}: {PASSED | FAILED}
```
{output, truncated to 4KB}
```
{end for}

## Instructions

Assess the implementation against the spec. Produce your findings in this format:

### Overall: PASS or FAIL

### Completeness
- Which spec requirements are addressed?
- Which are missing or partially addressed?

### Correctness
- Are there bugs, logic errors, or regressions?
- Do the tests pass? If not, what fails?

### Quality
- Code style consistent with the codebase?
- Appropriate test coverage for new code?
- Any concerns about the approach?

### Required Changes (if FAIL)
Numbered list of specific changes needed, in priority order.

Produce your findings as your final message in the format above.
```

**Collect step:** The review engine defines a `collect` method that the Spider calls when the session completes. The engine looks up the session record itself and parses the reviewer's structured findings. No file is written to the worktree (review artifacts don't belong in the codebase).

```typescript
async collect(sessionId: string, _givens: Record<string, unknown>, _context: EngineRunContext): Promise<ReviewYields> {
  const stacks = guild().apparatus<StacksApi>('stacks')
  const session = await stacks.readBook<SessionDoc>('animator', 'sessions').get(sessionId)
  const findings = session?.output ?? ''
  const passed = /^###\s*Overall:\s*PASS/mi.test(findings)
  const mechanicalChecks = (session?.metadata?.mechanicalChecks as MechanicalCheck[]) ?? []
  return { sessionId, passed, findings, mechanicalChecks }
}
```

**Dependency:** The Animator's `SessionResult.output` field (the final assistant message text) must be available for this to work. See the Animator spec (`docs/architecture/apparatus/animator.md`) — the `output` field is populated from the session provider's transcript at recording time.

### `revise` (quick)

Summons an anima to address review findings.

```typescript
async run(givens: Record<string, unknown>, context: EngineRunContext): Promise<EngineRunResult> {
  const animator = guild().apparatus<AnimatorApi>('animator')
  const writ = givens.writ as Writ
  const draft = context.upstream.draft as DraftYields
  const review = context.upstream.review as ReviewYields

  const status = await gitStatus(draft.path)
  const diff = await gitDiffUncommitted(draft.path)
  const prompt = assembleRevisionPrompt(writ, review, status, diff)

  const handle = animator.summon({
    role: givens.role as string,
    prompt,
    cwd: draft.path,
    environment: { GIT_AUTHOR_EMAIL: `${writ.id}@nexus.local` },
    metadata: { engineId: context.engineId, writId: writ.id },
  })

  return { status: 'launched', sessionId: handle.sessionId }
}
```

**Revision prompt template:**

```markdown
# Revision Pass

You are revising prior work on a commission based on review findings.

## The Commission (Spec)

{writ.body}

## Review Findings

{review.findings}

## Review Result: {PASS | FAIL}

{if review.passed}
The review passed. No changes are required. Confirm the work looks correct
and exit. Do not make unnecessary changes or spend unnecessary time reassessing.
{else}
The review identified issues that need to be addressed. See "Required Changes"
in the findings above. Address each item, then commit your changes.
{end if}

## Current State

```
{git status --porcelain}
```

```diff
{git diff HEAD, if any uncommitted changes}
```

Commit all changes before ending your session.
```

**Collect step:** The revise engine has no `collect` method — the Spider uses the generic default: `{ sessionId, sessionStatus, output? }`.

### `seal` (clockwork)

Seals the draft binding.

```typescript
async run(_givens: Record<string, unknown>, ctx: EngineRunContext): Promise<EngineRunResult> {
  const scriptorium = guild().apparatus<ScriptoriumApi>('codexes')
  const draft = ctx.upstream.draft as DraftYields

  const result = await scriptorium.seal({
    codexName: draft.codexName,
    sourceBranch: draft.branch,
  })

  return {
    status: 'completed',
    yields: {
      sealedCommit: result.sealedCommit,
      strategy: result.strategy,
      retries: result.retries,
      inscriptionsSealed: result.inscriptionsSealed,
    } satisfies SealYields,
  }
}
```

The seal engine does **not** transition the writ — that's handled by the CDC handler on the rigs book.

---

## CDC Handler

The Spider registers one CDC handler at startup:

### Rig terminal state → writ transition

**Book:** `rigs`
**Phase:** Phase 1 (cascade) — the writ transition joins the same transaction as the rig update
**Trigger:** rig status transitions to `completed` or `failed`

```typescript
stacks.watch('rigs', async (event) => {
  if (event.type !== 'update') return
  const rig = event.doc
  const prev = event.prev

  // Only fire on terminal transitions
  if (prev.status === rig.status) return
  if (rig.status !== 'completed' && rig.status !== 'failed') return

  if (rig.status === 'completed') {
    const sealYields = rig.engines.find(e => e.id === 'seal')?.yields as SealYields
    await clerk.transition(rig.writId, 'completed', {
      resolution: `Sealed at ${sealYields.sealedCommit} (${sealYields.strategy}, ${sealYields.inscriptionsSealed} inscriptions).`,
    })
  } else {
    const failedEngine = rig.engines.find(e => e.status === 'failed')
    await clerk.transition(rig.writId, 'failed', {
      resolution: `Engine '${failedEngine?.id}' failed: ${failedEngine?.error ?? 'unknown error'}`,
    })
  }
})
```

Because this is Phase 1 (cascade), the writ transition joins the same transaction as the rig status update. If the Clerk call throws, the rig update rolls back too.

---

## Engine Failure

When any engine fails (throws, or a quick engine's session has `status: 'failed'`):

1. The engine is marked `status: 'failed'` with the error (detected during "collect completed engines" for quick engines, or directly during execution for clockwork engines)
2. The rig is marked `status: 'failed'` (same transaction)
3. CDC fires on the rig status change → handler calls Clerk API to transition the writ to `failed`
4. The draft is **not** abandoned — preserved for patron inspection

No retry. No recovery. The patron inspects and decides what to do. This is appropriate for the static rig — see [Future Evolution](#future-evolution) for the retry/recovery direction.

Quick engine "failure" definition: if the Animator session completes with `status: 'failed'`, the engine fails. If the session completes with `status: 'completed'`, the engine succeeds — even if the anima's work is incomplete (that's the review engine's job to catch, not the Spider's).

---

## Dependency Map

```
Spider
  ├── Fabricator  (resolve engine designs by designId)
  ├── Clerk       (query ready writs, transition writ state via CDC)
  ├── Stacks      (persist rigs book, read sessions book, CDC handler on rigs book)
  │
  Engines (via guild() singleton, not Spider dependencies)
  ├── Scriptorium (draft, seal engines — open drafts, seal)
  ├── Animator    (implement, review, revise engines — summon animas)
  └── Loom        (via Animator's summon — context composition)
```

---

## Future Evolution

These are known directions the Spider and its data model will grow. None are in scope for the static rig MVP.

- **givensSpec templates.** The givensSpec currently holds literal values set at rig spawn time. It will grow to support template expressions (e.g. `${draft.worktreePath}`) that resolve specific values from upstream yields into typed givens, replacing the current reliance on the `context.upstream` escape hatch.
- **Engine needs declarations.** Engine designs will declare a `needs` specification that controls which upstream yields are included and how they're mapped — making the data flow between engines explicit and type-safe.
- **Typed engine contracts.** The `Record<string, unknown>` givens map with type assertions is scaffolding. The needs/planning system will introduce typed contracts between engines — defining what each engine requires and provides. This scaffolding gets replaced, not extended.
- **Dynamic rig extension.** Capability resolution (via the Fabricator) and rig growth at runtime. Engines can declare needs that the Fabricator resolves to additional engine chains, grafted onto the rig mid-execution.
- **Retry and recovery.** The static rig has no retry. Recovery logic arrives with dynamic extension — a failed engine can trigger a recovery chain rather than failing the whole rig.
- **Engine timeouts.** The `startedAt` field on engine instances is included in the data model for future use. During the collect step, the Spider checks `startedAt` against a configurable timeout. If an engine has been running longer than the threshold, the Spider marks it failed (and optionally terminates the session).
- **Unified capability catalog.** The Fabricator may absorb tool designs from the Instrumentarium, becoming the single answer to "what can this guild do?" regardless of whether the answer is an engine or a tool.

---

## What This Spec Does NOT Cover

- **Origination.** Commission → rig mapping is hardcoded (static graph).
- **The Executor as a separate apparatus.** The Spider runs engines directly — clockwork engines inline, quick engines via the Animator. The Executor earns its independence when substrate switching (Docker, remote VM) is needed. Key design constraint: the Spider currently `await`s `design.run()`, meaning a slow or misbehaving engine blocks the entire crawl loop. The Executor must not have this property — engine execution should be fully non-blocking, with yields persisted to a book so the orchestrator can poll for completion. This is essential for remote and Docker runners where the process that ran the engine is not the process polling for results.
- **Concurrent rigs.** The priority system supports multiple rigs in principle, but the polling loop + single-guild model means we process one commission at a time in practice. Concurrency comes naturally when the Spider processes multiple ready engines across rigs.
- **Reviewer role curriculum/temperament.** The `reviewer` role exists with a blank identity. The review engine assembles the prompt. Loom content for the reviewer is a separate concern.

---

## Configuration

```json
{
  "spider": {
    "role": "artificer",
    "pollIntervalMs": 5000,
    "buildCommand": "pnpm build",
    "testCommand": "pnpm test"
  }
}
```

All fields optional. `role` defaults to `"artificer"`. `pollIntervalMs` defaults to `5000`. `buildCommand` and `testCommand` are run by the review engine before launching the reviewer; omitted means those mechanical checks are skipped (reviewer anima still does spec-vs-diff assessment).

=== FILE: packages/plugins/spider/src/spider.ts ===
/**
 * The Spider — rig execution engine apparatus.
 *
 * The Spider drives writ-to-completion by managing rigs: ordered pipelines
 * of engine instances. Each crawl() call performs one unit of work:
 *
 *   collect > run > spawn   (priority order)
 *
 * collect — check running engines for terminal session results
 * run     — execute the next pending engine (clockwork inline, quick → launch)
 * spawn   — create a new rig for a ready writ with no existing rig
 *
 * CDC on the rigs book (Phase 1 cascade) transitions the associated writ
 * when a rig reaches a terminal state (completed or failed).
 *
 * See: docs/architecture/apparatus/spider.md
 */

import type { Plugin, StartupContext } from '@shardworks/nexus-core';
import { guild, generateId } from '@shardworks/nexus-core';
import type { StacksApi, Book, ReadOnlyBook, WhereClause } from '@shardworks/stacks-apparatus';
import type { ClerkApi, WritDoc } from '@shardworks/clerk-apparatus';
import type { FabricatorApi } from '@shardworks/fabricator-apparatus';
import type { SessionDoc } from '@shardworks/animator-apparatus';

import type {
  RigDoc,
  RigFilters,
  EngineInstance,
  SpiderApi,
  CrawlResult,
  SpiderConfig,
} from './types.ts';

import {
  draftEngine,
  implementEngine,
  reviewEngine,
  reviseEngine,
  sealEngine,
} from './engines/index.ts';

import { crawlOneTool, crawlContinualTool, rigShowTool, rigListTool, rigForWritTool } from './tools/index.ts';

// ── Helpers ────────────────────────────────────────────────────────────

/**
 * Check whether a value is JSON-serializable.
 * Non-serializable yields cause engine failure — the Stacks cannot store them.
 */
function isJsonSerializable(value: unknown): boolean {
  try {
    JSON.stringify(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Build the upstream yields map for a rig: all completed engine yields
 * keyed by engine id. Passed as context.upstream to the engine's run().
 */
function buildUpstreamMap(rig: RigDoc): Record<string, unknown> {
  const upstream: Record<string, unknown> = {};
  for (const engine of rig.engines) {
    if (engine.status === 'completed' && engine.yields !== undefined) {
      upstream[engine.id] = engine.yields;
    }
  }
  return upstream;
}

/**
 * Find the first pending engine whose entire upstream is completed.
 * Returns null if no runnable engine exists.
 */
function findRunnableEngine(rig: RigDoc): EngineInstance | null {
  for (const engine of rig.engines) {
    if (engine.status !== 'pending') continue;
    const allUpstreamDone = engine.upstream.every((upstreamId) => {
      const dep = rig.engines.find((e) => e.id === upstreamId);
      return dep?.status === 'completed';
    });
    if (allUpstreamDone) return engine;
  }
  return null;
}

/**
 * Produce the five-engine static pipeline for a writ.
 * Each engine receives only the givens it needs.
 * Upstream yields arrive via context.upstream at run time.
 */
function buildStaticEngines(writ: WritDoc, config: SpiderConfig): EngineInstance[] {
  const role = config.role ?? 'artificer';
  const reviewGivens: Record<string, unknown> = {
    writ,
    role: 'reviewer',
    ...(config.buildCommand !== undefined ? { buildCommand: config.buildCommand } : {}),
    ...(config.testCommand !== undefined ? { testCommand: config.testCommand } : {}),
  };

  return [
    { id: 'draft',     designId: 'draft',     status: 'pending', upstream: [],           givensSpec: { writ } },
    { id: 'implement', designId: 'implement', status: 'pending', upstream: ['draft'],     givensSpec: { writ, role } },
    { id: 'review',    designId: 'review',    status: 'pending', upstream: ['implement'], givensSpec: reviewGivens },
    { id: 'revise',    designId: 'revise',    status: 'pending', upstream: ['review'],    givensSpec: { writ, role } },
    { id: 'seal',      designId: 'seal',      status: 'pending', upstream: ['revise'],    givensSpec: {} },
  ];
}

// ── Apparatus factory ──────────────────────────────────────────────────

export function createSpider(): Plugin {
  let rigsBook: Book<RigDoc>;
  let sessionsBook: ReadOnlyBook<SessionDoc>;
  let writsBook: ReadOnlyBook<WritDoc>;
  let clerk: ClerkApi;
  let fabricator: FabricatorApi;
  let spiderConfig: SpiderConfig = {};

  // ── Internal crawl operations ─────────────────────────────────────

  /**
   * Mark an engine failed and propagate failure to the rig (same update).
   */
  async function failEngine(
    rig: RigDoc,
    engineId: string,
    errorMessage: string,
  ): Promise<void> {
    const now = new Date().toISOString();
    const updatedEngines = rig.engines.map((e) =>
      e.id === engineId
        ? { ...e, status: 'failed' as const, error: errorMessage, completedAt: now }
        : e,
    );
    await rigsBook.patch(rig.id, {
      engines: updatedEngines,
      status: 'failed',
    });
  }

  /**
   * Phase 1 — collect.
   *
   * Find the first running engine with a sessionId whose session has
   * reached a terminal state. Populate yields and advance the engine
   * (and possibly the rig) to completed or failed.
   */
  async function tryCollect(): Promise<CrawlResult | null> {
    const runningRigs = await rigsBook.find({ where: [['status', '=', 'running']] });
    for (const rig of runningRigs) {
      for (const engine of rig.engines) {
        if (engine.status !== 'running' || !engine.sessionId) continue;

        const session = await sessionsBook.get(engine.sessionId);
        if (!session || session.status === 'running') continue;

        // Terminal session found — collect.
        const now = new Date().toISOString();

        if (session.status === 'failed' || session.status === 'timeout') {
          await failEngine(rig, engine.id, session.error ?? `Session ${session.status}`);
          return { action: 'rig-completed', rigId: rig.id, writId: rig.writId, outcome: 'failed' };
        }

        // Completed session — assemble yields via engine's collect() or generic default.
        const design = fabricator.getEngineDesign(engine.designId);
        let yields: unknown;
        if (design?.collect) {
          const givens = { ...engine.givensSpec };
          const upstream = buildUpstreamMap(rig);
          const context = { engineId: engine.id, upstream };
          yields = await design.collect(engine.sessionId!, givens, context);
        } else {
          yields = {
            sessionId: session.id,
            sessionStatus: session.status,
            ...(session.output !== undefined ? { output: session.output } : {}),
          };
        }

        if (!isJsonSerializable(yields)) {
          await failEngine(rig, engine.id, 'Session yields are not JSON-serializable');
          return { action: 'rig-completed', rigId: rig.id, writId: rig.writId, outcome: 'failed' };
        }

        const updatedEngines = rig.engines.map((e) =>
          e.id === engine.id
            ? { ...e, status: 'completed' as const, yields, completedAt: now }
            : e,
        );

        const allCompleted = updatedEngines.every((e) => e.status === 'completed');
        await rigsBook.patch(rig.id, {
          engines: updatedEngines,
          status: allCompleted ? 'completed' : 'running',
        });

        if (allCompleted) {
          return { action: 'rig-completed', rigId: rig.id, writId: rig.writId, outcome: 'completed' };
        }
        return { action: 'engine-completed', rigId: rig.id, engineId: engine.id };
      }
    }
    return null;
  }

  /**
   * Phase 2 — run.
   *
   * Find the first pending engine in any running rig whose upstream is
   * all completed. Execute it:
   * - Clockwork ('completed') → store yields, mark engine completed,
   *   check for rig completion.
   * - Quick ('launched') → store sessionId, mark engine running.
   */
  async function tryRun(): Promise<CrawlResult | null> {
    const runningRigs = await rigsBook.find({ where: [['status', '=', 'running']] });
    for (const rig of runningRigs) {
      const pending = findRunnableEngine(rig);
      if (!pending) continue;

      const design = fabricator.getEngineDesign(pending.designId);
      if (!design) {
        await failEngine(rig, pending.id, `No engine design found for "${pending.designId}"`);
        return { action: 'rig-completed', rigId: rig.id, writId: rig.writId, outcome: 'failed' };
      }

      const now = new Date().toISOString();
      const upstream = buildUpstreamMap(rig);
      const givens = { ...pending.givensSpec };
      const context = { engineId: pending.id, upstream };

      let engineResult: Awaited<ReturnType<typeof design.run>>;
      try {
        // Mark engine as running before executing
        const startedEngines = rig.engines.map((e) =>
          e.id === pending.id ? { ...e, status: 'running' as const, startedAt: now } : e,
        );
        await rigsBook.patch(rig.id, { engines: startedEngines });

        // Re-fetch to get the up-to-date engines list (with startedAt set)
        const updatedRig = { ...rig, engines: startedEngines };

        engineResult = await design.run(givens, context);

        if (engineResult.status === 'launched') {
          // Quick engine — store sessionId, leave engine in 'running'
          const { sessionId } = engineResult;
          const launchedEngines = updatedRig.engines.map((e) =>
            e.id === pending.id
              ? { ...e, status: 'running' as const, sessionId }
              : e,
          );
          await rigsBook.patch(rig.id, { engines: launchedEngines });
          return { action: 'engine-started', rigId: rig.id, engineId: pending.id };
        }

        // Clockwork engine — validate and store yields
        const { yields } = engineResult;
        if (!isJsonSerializable(yields)) {
          await failEngine(updatedRig, pending.id, 'Engine yields are not JSON-serializable');
          return { action: 'rig-completed', rigId: rig.id, writId: rig.writId, outcome: 'failed' };
        }

        const completedAt = new Date().toISOString();
        const completedEngines = updatedRig.engines.map((e) =>
          e.id === pending.id
            ? { ...e, status: 'completed' as const, yields, completedAt }
            : e,
        );
        const allCompleted = completedEngines.every((e) => e.status === 'completed');
        await rigsBook.patch(rig.id, {
          engines: completedEngines,
          status: allCompleted ? 'completed' : 'running',
        });

        if (allCompleted) {
          return { action: 'rig-completed', rigId: rig.id, writId: rig.writId, outcome: 'completed' };
        }
        return { action: 'engine-completed', rigId: rig.id, engineId: pending.id };
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        await failEngine(rig, pending.id, errorMessage);
        return { action: 'rig-completed', rigId: rig.id, writId: rig.writId, outcome: 'failed' };
      }
    }
    return null;
  }

  /**
   * Phase 3 — spawn.
   *
   * Find the oldest ready writ with no existing rig. Create a rig and
   * transition the writ to active so the Clerk tracks it as in-progress.
   */
  async function trySpawn(): Promise<CrawlResult | null> {
    // Find ready writs ordered by creation time (oldest first)
    const readyWrits = await writsBook.find({
      where: [['status', '=', 'ready']],
      orderBy: ['createdAt', 'asc'],
      limit: 10,
    });

    for (const writ of readyWrits) {
      // Check for existing rig
      const existing = await rigsBook.find({
        where: [['writId', '=', writ.id]],
        limit: 1,
      });
      if (existing.length > 0) continue;

      const rigId = generateId('rig', 4);
      const engines = buildStaticEngines(writ, spiderConfig);

      const rig: RigDoc = {
        id: rigId,
        writId: writ.id,
        status: 'running',
        engines,
        createdAt: new Date().toISOString(),
      };

      await rigsBook.put(rig);

      // Transition writ to active so Clerk tracks it
      try {
        await clerk.transition(writ.id, 'active');
      } catch (err) {
        // Only swallow state-transition conflicts (writ already moved past 'ready')
        if (err instanceof Error && err.message.includes('transition')) {
          // Race condition — another spider got here first. The rig is already created,
          // so we continue. The writ is already active or beyond.
        } else {
          throw err;
        }
      }

      return { action: 'rig-spawned', rigId, writId: writ.id };
    }

    return null;
  }

  // ── SpiderApi ─────────────────────────────────────────────────────

  const api: SpiderApi = {
    async crawl(): Promise<CrawlResult | null> {
      const collected = await tryCollect();
      if (collected) return collected;

      const ran = await tryRun();
      if (ran) return ran;

      const spawned = await trySpawn();
      if (spawned) return spawned;

      return null;
    },

    async show(id: string): Promise<RigDoc> {
      const results = await rigsBook.find({ where: [['id', '=', id]], limit: 1 });
      if (results.length === 0) {
        throw new Error(`Rig "${id}" not found.`);
      }
      return results[0];
    },

    async list(filters?: RigFilters): Promise<RigDoc[]> {
      const where: WhereClause = [];
      if (filters?.status !== undefined) {
        where.push(['status', '=', filters.status]);
      }
      const limit = filters?.limit ?? 20;
      return rigsBook.find({
        where,
        orderBy: ['createdAt', 'desc'],
        limit,
        ...(filters?.offset !== undefined ? { offset: filters.offset } : {}),
      });
    },

    async forWrit(writId: string): Promise<RigDoc | null> {
      const results = await rigsBook.find({ where: [['writId', '=', writId]], limit: 1 });
      return results[0] ?? null;
    },
  };

  // ── Apparatus ─────────────────────────────────────────────────────

  return {
    apparatus: {
      requires: ['stacks', 'clerk', 'fabricator'],

      supportKit: {
        books: {
          rigs: {
            indexes: ['status', 'writId', ['status', 'writId'], 'createdAt'],
          },
        },
        engines: {
          draft:     draftEngine,
          implement: implementEngine,
          review:    reviewEngine,
          revise:    reviseEngine,
          seal:      sealEngine,
        },
        tools: [crawlOneTool, crawlContinualTool, rigShowTool, rigListTool, rigForWritTool],
      },

      provides: api,

      start(_ctx: StartupContext): void {
        const g = guild();
        spiderConfig = g.guildConfig().spider ?? {};

        const stacks = g.apparatus<StacksApi>('stacks');
        clerk = g.apparatus<ClerkApi>('clerk');
        fabricator = g.apparatus<FabricatorApi>('fabricator');

        rigsBook = stacks.book<RigDoc>('spider', 'rigs');
        sessionsBook = stacks.readBook<SessionDoc>('animator', 'sessions');
        writsBook = stacks.readBook<WritDoc>('clerk', 'writs');

        // CDC — Phase 1 cascade on rigs book.
        // When a rig reaches a terminal state, transition the associated writ.
        stacks.watch<RigDoc>(
          'spider',
          'rigs',
          async (event) => {
            if (event.type !== 'update') return;

            const rig = event.entry;
            const prev = event.prev;

            // Only act when status changes to a terminal state
            if (rig.status === prev.status) return;

            if (rig.status === 'completed') {
              // Use seal yields as the resolution summary
              const sealEngine = rig.engines.find((e) => e.id === 'seal');
              const resolution = sealEngine?.yields
                ? JSON.stringify(sealEngine.yields)
                : 'Rig completed';
              await clerk.transition(rig.writId, 'completed', { resolution });
            } else if (rig.status === 'failed') {
              const failedEngine = rig.engines.find((e) => e.status === 'failed');
              const resolution = failedEngine?.error ?? 'Engine failure';
              await clerk.transition(rig.writId, 'failed', { resolution });
            }
          },
          { failOnError: true },
        );
      },
    },
  };
}

=== FILE: packages/plugins/spider/src/tools/crawl-continual.ts ===
/**
 * crawl-continual tool — runs the crawl loop continuously.
 *
 * Polls crawl() on a configurable interval. By default the loop runs
 * indefinitely; pass a positive maxIdleCycles to enable auto-stop after
 * that many consecutive idle cycles.
 */

import { z } from 'zod';
import { guild } from '@shardworks/nexus-core';
import { tool } from '@shardworks/tools-apparatus';
import type { SpiderApi, SpiderConfig } from '../types.ts';

export default tool({
  name: 'crawl-continual',
  description: "Run the Spider's crawl loop continuously",
  instructions:
    'Polls crawl() in a loop, sleeping between steps when idle. ' +
    'By default the loop runs indefinitely. Pass a positive maxIdleCycles ' +
    'to stop after that many consecutive idle cycles. ' +
    'Returns a summary of all actions taken.',
  params: {
    maxIdleCycles: z
      .number()
      .optional()
      .default(0)
      .describe(
        'Max consecutive idle cycles before stopping. Pass a positive number to enable auto-stop (default: runs indefinitely)',
      ),
    pollIntervalMs: z
      .number()
      .optional()
      .describe(
        'Override the configured poll interval in milliseconds',
      ),
  },
  permission: 'spider:write',
  handler: async (params) => {
    const g = guild();
    const spider = g.apparatus<SpiderApi>('spider');
    const config = g.guildConfig().spider ?? {} as SpiderConfig;
    const intervalMs = params.pollIntervalMs ?? config.pollIntervalMs ?? 5000;
    const maxIdle = params.maxIdleCycles;

    const actions: unknown[] = [];
    let idleCount = 0;

    while (maxIdle === 0 || idleCount < maxIdle) {
      let result: Awaited<ReturnType<typeof spider.crawl>>;
      try {
        result = await spider.crawl();
      } catch (err) {
        console.error('[crawl-continual] crawl() error:', err instanceof Error ? err.message : String(err));
        idleCount++;
        await new Promise<void>((resolve) => setTimeout(resolve, intervalMs));
        continue;
      }
      if (result === null) {
        idleCount++;
        await new Promise<void>((resolve) => setTimeout(resolve, intervalMs));
      } else {
        idleCount = 0;
        actions.push(result);
      }
    }

    return { actions, totalActions: actions.length };
  },
});

=== FILE: packages/plugins/spider/src/tools/crawl-one.ts ===
/**
 * crawl-one tool — executes a single step of the crawl loop.
 *
 * Returns the CrawlResult or null (idle) from one crawl() call.
 * Useful for manual step-through or testing.
 */

import { guild } from '@shardworks/nexus-core';
import { tool } from '@shardworks/tools-apparatus';
import type { SpiderApi } from '../types.ts';

export default tool({
  name: 'crawl-one',
  description: "Execute one step of the Spider's crawl loop",
  instructions:
    'Runs a single crawl() step: collect a pending session result, run the next ' +
    'ready engine, or spawn a rig for a ready writ — in that priority order. ' +
    'Returns the action taken, or null if there is nothing to do.',
  params: {},
  permission: 'spider:write',
  handler: async () => {
    const spider = guild().apparatus<SpiderApi>('spider');
    return spider.crawl();
  },
});

=== FILE: packages/plugins/spider/src/tools/index.ts ===
export { default as crawlOneTool } from './crawl-one.ts';
export { default as crawlContinualTool } from './crawl-continual.ts';
export { default as rigShowTool } from './rig-show.ts';
export { default as rigListTool } from './rig-list.ts';
export { default as rigForWritTool } from './rig-for-writ.ts';



## Convention Reference (sibling files not modified by this commission)

=== CONTEXT FILE: docs/architecture/apparatus/animator.md ===
# The Animator — API Contract

Status: **Draft — MVP**

Package: `@shardworks/animator-apparatus` · Plugin id: `animator`

> **⚠️ MVP scope.** This spec covers session launch, structured telemetry recording, streaming output, error guarantees, and session inspection tools. There is no MCP tool server, no Instrumentarium dependency, no role awareness, and no event signalling. The Animator receives a woven context and a working directory, launches a session provider process, and records what happened. See the Future sections for the target design.

---

## Purpose

The Animator brings animas to life. It is the guild's session apparatus — the single entry point for making an anima do work. Two API levels serve different callers:

- **`summon()`** — the high-level "make an anima do a thing" call. Composes context via The Loom, launches a session, records the result. This is what the summon relay, the CLI, and most callers use.
- **`animate()`** — the low-level call for callers that compose their own `AnimaWeave` (e.g. The Parlour for multi-turn conversations).

Both methods return an `AnimateHandle` synchronously — a `{ sessionId, chunks, result }` triple. The `sessionId` is available immediately, before the session completes — callers that only need to know the session was launched can return without awaiting. The `result` promise resolves when the session completes. The `chunks` async iterable yields output when `streaming: true` is set; otherwise it completes immediately with no items. There is no separate streaming method — the `streaming` flag on the request controls the behavior, and the return shape is always the same.

The Animator does not assemble system prompts — that is The Loom's job. `summon()` delegates context composition to The Loom; `animate()` accepts a pre-composed `AnimaWeave` from any source. This separation means The Loom can evolve its composition model (adding role instructions, curricula, temperaments) without changing The Animator's interface.

---

## Dependencies

```
requires:   ['stacks']
recommends: ['loom']
```

- **The Stacks** (required) — records session results (the `sessions` book) and full transcripts (the `transcripts` book).
- **The Loom** (recommended) — composes session context for `summon()`. Not needed for `animate()`, which accepts a pre-composed context. Resolved at call time, not at startup — the Animator starts without the Loom, but `summon()` throws if it's not installed. Arbor emits a startup warning if the Loom is not installed.

---

## Kit Contribution

The Animator contributes two books and session tools via its supportKit:

```typescript
supportKit: {
  books: {
    sessions: {
      indexes: ['startedAt', 'status', 'conversationId', 'provider'],
    },
    transcripts: {
      indexes: ['sessionId'],
    },
  },
  tools: [sessionList, sessionShow, summon],
},
```

### `session-list` tool

List recent sessions with optional filters. Returns session summaries ordered by `startedAt` descending (newest first).

| Parameter | Type | Description |
|---|---|---|
| `status` | `'running' \| 'completed' \| 'failed' \| 'timeout'` | Filter by terminal status |
| `provider` | `string` | Filter by provider name |
| `conversationId` | `string` | Filter by conversation |
| `limit` | `number` | Maximum results (default: 20) |

Returns: `SessionResult[]` (summary projection — id, status, provider, startedAt, endedAt, durationMs, exitCode, costUsd).

Callers that need to filter by metadata fields (e.g. `metadata.writId`, `metadata.animaName`) use The Stacks' query API directly. The tool exposes filters for fields the Animator itself indexes.

### `session-show` tool

Show full detail for a single session by id.

| Parameter | Type | Description |
|---|---|---|
| `id` | `string` | Session id |

Returns: the complete session record from The Stacks, including `tokenUsage`, `metadata`, `output`, and all indexed fields.

### `summon` tool

Summon an anima from the CLI. Calls `animator.summon()` with the guild home as working directory. CLI-only (`callableBy: 'cli'`). Requires `animate` permission.

| Parameter | Type | Description |
|---|---|---|
| `prompt` | `string` (required) | The work prompt — what the anima should do |
| `role` | `string` (optional) | Role to summon (e.g. `'artificer'`, `'scribe'`) |

Returns: session summary (id, status, provider, durationMs, exitCode, costUsd, tokenUsage, error).

---

## `AnimatorApi` Interface (`provides`)

```typescript
interface AnimatorApi {
  /**
   * Summon an anima — compose context via The Loom and launch a session.
   *
   * This is the high-level entry point. Passes the role to The Loom for
   * identity composition, then animate() for session launch and recording.
   * The work prompt bypasses The Loom and goes directly to the provider.
   * Auto-populates session metadata with `trigger: 'summon'` and `role`.
   *
   * Returns synchronously — the async work lives inside `result` and `chunks`.
   * Requires The Loom apparatus to be installed. Throws if not available.
   */
  summon(request: SummonRequest): AnimateHandle

  /**
   * Animate a session — launch an AI process with the given context.
   *
   * This is the low-level entry point for callers that compose their own
   * AnimaWeave (e.g. The Parlour for multi-turn conversations).
   *
   * Returns synchronously — the async work lives inside `result` and `chunks`.
   * Records the session result to The Stacks before `result` resolves.
   *
   * Set `streaming: true` to receive output chunks as the session runs.
   * When streaming is disabled (default), `chunks` completes immediately.
   */
  animate(request: AnimateRequest): AnimateHandle
}

/** The return value from animate() and summon(). */
interface AnimateHandle {
  /** Session ID, available immediately after launch — before the session completes. */
  sessionId: string
  /** Output chunks. Empty iterable when not streaming. */
  chunks: AsyncIterable<SessionChunk>
  /** Resolves to the final SessionResult after recording. */
  result: Promise<SessionResult>
}

/** A chunk of output from a running session. */
type SessionChunk =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; tool: string }
  | { type: 'tool_result'; tool: string }

interface SummonRequest {
  /** The work prompt — sent directly to the provider, bypasses The Loom. */
  prompt: string
  /** The role to summon (e.g. 'artificer'). Passed to The Loom for composition. */
  role?: string
  /** Working directory for the session. */
  cwd: string
  /** Optional conversation id to resume a multi-turn conversation. */
  conversationId?: string
  /**
   * Additional metadata recorded alongside the session.
   * Merged with auto-generated metadata ({ trigger: 'summon', role }).
   * See § Caller Metadata.
   */
  metadata?: Record<string, unknown>
  /**
   * Environment variable overrides for the session process.
   * Merged with the AnimaWeave's environment (request overrides weave).
   * Use this for per-task identity — e.g. setting GIT_AUTHOR_EMAIL
   * to a writ ID for commit attribution.
   * See § Session Environment.
   */
  environment?: Record<string, string>
  /** Enable streaming output (default false). */
  streaming?: boolean
}

interface AnimateRequest {
  /** The anima weave — composed identity context from The Loom (or self-composed). */
  context: AnimaWeave
  /** The work prompt — sent directly to the provider as initialPrompt. */
  prompt?: string
  /**
   * Working directory for the session.
   * The session provider launches the AI process here.
   */
  cwd: string
  /**
   * Optional conversation id to resume a multi-turn conversation.
   * If provided, the session provider resumes the existing conversation
   * rather than starting a new one.
   */
  conversationId?: string
  /**
   * Caller-supplied metadata recorded alongside the session.
   * The Animator stores this as-is — it does not interpret the contents.
   * See § Caller Metadata.
   */
  metadata?: Record<string, unknown>
  /**
   * Environment variable overrides for the session process.
   * Merged with the AnimaWeave's environment (request overrides weave).
   * See § Session Environment.
   */
  environment?: Record<string, string>
  /** Enable streaming output (default false). */
  streaming?: boolean
}

interface SessionResult {
  /** Unique session id (generated by The Animator). */
  id: string
  /** Terminal status. */
  status: 'completed' | 'failed' | 'timeout'
  /** When the session started (ISO-8601). */
  startedAt: string
  /** When the session ended (ISO-8601). */
  endedAt: string
  /** Wall-clock duration in milliseconds. */
  durationMs: number
  /** Provider name (e.g. 'claude-code'). */
  provider: string
  /** Numeric exit code from the provider process. */
  exitCode: number
  /** Error message if failed. */
  error?: string
  /** Conversation id (for multi-turn resume). */
  conversationId?: string
  /** Session id from the provider (e.g. for --resume). */
  providerSessionId?: string
  /** Token usage from the provider, if available. */
  tokenUsage?: TokenUsage
  /** Cost in USD from the provider, if available. */
  costUsd?: number
  /** Caller-supplied metadata, recorded as-is. See § Caller Metadata. */
  metadata?: Record<string, unknown>
  /**
   * The final assistant text from the session.
   * Extracted from the last assistant message in the provider's transcript.
   * Useful for programmatic consumers that need the session's conclusion
   * without parsing the full transcript (e.g. the Spider's review collect step).
   */
  output?: string
}

interface TokenUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
}
```

---

## Session Lifecycle

### `summon()` — the high-level path

```
summon(request)
  │
  ├─ 1. Resolve The Loom (throws if not installed)
  ├─ 2. Compose identity: loom.weave({ role })
  │     (Loom produces systemPrompt from anima identity layers;
  │      MVP: systemPrompt is undefined — composition not yet implemented)
  ├─ 3. Build AnimateRequest with:
  │     - context (AnimaWeave from Loom — includes environment)
  │     - prompt (work prompt, bypasses Loom)
  │     - environment (per-request overrides, if any)
  │     - auto-metadata { trigger: 'summon', role }
  └─ 4. Delegate to animate() → full animate lifecycle below
```

### `animate()` — the low-level path

```
animate(request)  →  { chunks, result }  (returned synchronously)
  │
  ├─ 1. Generate session id, capture startedAt
  ├─ 2. Write initial session record to The Stacks (status: 'running')
  │
  ├─ 3. Call provider.launch(config):
  │     - System prompt, initial prompt, model, cwd, conversationId
  │     - environment (merged: weave defaults + request overrides)
  │     - streaming flag passed through for provider to honor
  │     → provider returns { chunks, result } immediately
  │
  ├─ 4. Wrap provider result promise with recording:
  │     - On resolve: capture endedAt, durationMs, extract output from
  │       provider transcript, record session to Stacks, record transcript
  │       to transcripts book
  │     - On reject: record failed result, re-throw
  │     (ALWAYS records — see § Error Handling Contract)
  │
  └─ 5. Return { chunks, result } to caller
        chunks: the provider's iterable (may be empty)
        result: wraps provider result with Animator recording
```

The Animator does not branch on streaming. It passes the `streaming` flag to the provider via `SessionProviderConfig` and returns whatever the provider gives back. Providers that support streaming yield chunks when the flag is set; providers that don't return empty chunks. Callers should not assume chunks will be emitted.

---

## Session Providers

The Animator delegates AI process management to a **session provider** — a pluggable apparatus that knows how to launch and communicate with a specific AI system. The provider is discovered at runtime via guild config:

```json
{
  "animator": {
    "sessionProvider": "claude-code"
  }
}
```

The `sessionProvider` field names the plugin id of an apparatus whose `provides` object implements `AnimatorSessionProvider`. The Animator looks it up via `guild().apparatus<AnimatorSessionProvider>(config.sessionProvider)` at animate-time. Defaults to `'claude-code'` if not specified.

```typescript
interface AnimatorSessionProvider {
  /** Human-readable name (e.g. 'claude-code'). */
  name: string

  /**
   * Launch a session. Returns { chunks, result } synchronously.
   *
   * The result promise resolves when the AI process exits.
   * The chunks async iterable yields output when config.streaming
   * is true and the provider supports streaming; otherwise it
   * completes immediately with no items.
   *
   * Providers that don't support streaming simply ignore the flag
   * and return empty chunks — no separate method needed.
   */
  launch(config: SessionProviderConfig): {
    chunks: AsyncIterable<SessionChunk>
    result: Promise<SessionProviderResult>
  }
}

interface SessionProviderConfig {
  /** System prompt from the AnimaWeave — may be undefined at MVP. */
  systemPrompt?: string
  /** Work prompt from AnimateRequest.prompt — what the anima should do. */
  initialPrompt?: string
  /** Model to use (from guild settings). */
  model: string
  /** Optional conversation id for resume. */
  conversationId?: string
  /** Working directory for the session. */
  cwd: string
  /** Enable streaming output. Providers may ignore this flag. */
  streaming?: boolean
  /**
   * Environment variables for the session process.
   * Merged by the Animator from the AnimaWeave's environment and any
   * per-request overrides (request overrides weave). The provider
   * spreads these into the spawned process environment.
   */
  environment?: Record<string, string>
}

interface SessionProviderResult {
  /** Exit status. */
  status: 'completed' | 'failed' | 'timeout'
  /** Numeric exit code from the process. */
  exitCode: number
  /** Error message if failed. */
  error?: string
  /** Provider's session id (e.g. for --resume). */
  providerSessionId?: string
  /** Token usage, if the provider can report it. */
  tokenUsage?: TokenUsage
  /** Cost in USD, if the provider can report it. */
  costUsd?: number
  /** Full session transcript — array of NDJSON message objects. */
  transcript?: TranscriptMessage[]
  /**
   * The final assistant text from the session.
   * Extracted from the last assistant message's text content blocks.
   */
  output?: string
}

/** A single message from the NDJSON stream. Shape varies by provider. */
type TranscriptMessage = Record<string, unknown>
```

The default provider is `@shardworks/claude-code-apparatus` (plugin id: `claude-code`), which launches a `claude` CLI process in autonomous mode with `--output-format stream-json`. Provider packages import the `AnimatorSessionProvider` type from `@shardworks/animator-apparatus` and export an apparatus whose `provides` satisfies the interface.

---

## Error Handling Contract

The Animator guarantees that **step 5 (recording) always executes**, even if the provider throws or the process crashes. The provider launch (steps 3–4) is wrapped in try/finally. If the provider fails:

- The session record is still updated in The Stacks with `status: 'failed'`, the captured `endedAt`, `durationMs`, and the error message.
- `exitCode` defaults to `1` if the provider didn't return one.
- `tokenUsage` and `costUsd` are omitted (the provider may not have reported them).

If the Stacks write itself fails (e.g. database locked), the error is logged but does not propagate — the Animator returns or re-throws the provider error, not a recording error. Session data loss is preferable to masking the original failure.

```
Provider succeeds  → record status 'completed', return result
Provider fails     → record status 'failed' + error, re-throw provider error
Provider times out → record status 'timeout', return result with error
Recording fails    → log warning, continue with return/re-throw
```

---

## Caller Metadata

The `metadata` field on `AnimateRequest` is an opaque pass-through. The Animator records it in the session's Stacks entry without interpreting it. This allows callers to attach contextual information that the Animator itself doesn't understand:

```typescript
// Example: the summon relay attaches dispatch context
const { result } = animator.animate({
  context: wovenContext,
  cwd: '/path/to/worktree',
  metadata: {
    trigger: 'summon',
    animaId: 'anm-3f7b2c1',
    animaName: 'scribe',
    writId: 'wrt-8a4c9e2',
    workshop: 'nexus-mk2',
    workspaceKind: 'workshop-temp',
  },
});
const session = await result;

// Example: nsg consult attaches interactive session context
const { chunks, result: consultResult } = animator.animate({
  context: wovenContext,
  cwd: guildHome,
  streaming: true,
  metadata: {
    trigger: 'consult',
    animaId: 'anm-b2e8f41',
    animaName: 'coco',
  },
});
for await (const chunk of chunks) { /* stream to terminal */ }
const consultSession = await consultResult;
```

The `metadata` field is indexed in The Stacks as a JSON blob. Callers that need to query by metadata fields (e.g. "all sessions for writ X") use The Stacks' JSON path queries against the stored metadata.

This design keeps the Animator focused: it launches sessions and records what happened. Identity, dispatch context, and writ binding are concerns of the caller.

---

## Session Environment

The Animator supports environment variable injection into the spawned session process. This is the mechanism for giving animas distinct identities (e.g. git author) without modifying global host configuration.

Environment variables come from two sources, merged at session launch time:

1. **AnimaWeave** (`context.environment`) — identity-layer defaults from The Loom. Set per-role. Example: `GIT_AUTHOR_NAME=Artificer`, `GIT_AUTHOR_EMAIL=artificer@nexus.local`.
2. **Request** (`request.environment`) — per-task overrides from the caller. Example: the Dispatch sets `GIT_AUTHOR_EMAIL=w-{writId}@nexus.local` for per-commission git attribution.

The merge is simple: `{ ...weave.environment, ...request.environment }`. Request values override weave values for the same key. The merged result is passed to the session provider as `SessionProviderConfig.environment`, which the provider spreads into the child process environment (`{ ...process.env, ...config.environment }`).

This keeps the Animator generic — it does not interpret environment variables or know about git. The Loom decides what identity defaults a role should have. Orchestrators decide what per-task overrides are needed. The Animator just merges and passes through.

---

## Invocation Paths

The Animator is called from three places:

1. **The summon relay** — when a standing order fires `summon: "role"`, the relay calls `animator.summon()`. This is the Clockworks-driven autonomous path.

2. **`nsg summon`** — the CLI command for direct dispatch. Calls `animator.summon()` to launch a session with a work prompt.

3. **`nsg consult`** — the CLI command for interactive multi-turn sessions. Uses The Parlour, which composes its own context and calls `animator.animate()` directly.

Paths 1 and 2 use `summon()` (high-level — The Loom composes the context). Path 3 uses `animate()` (low-level — The Parlour composes the context). The Animator doesn't know or care which path invoked it — the session lifecycle is identical.

### CLI streaming behavior

The `nsg summon` command invokes the `summon` tool through the generic CLI tool runner, which `await`s the handler and prints the return value. The tool contract (`ToolDefinition.handler`) returns a single value — there is no streaming return type. The CLI prints the structured session summary (id, status, cost, token usage) to stdout when the session completes.

However, **real-time session output is visible during execution via stderr**. The claude-code provider spawns `claude` with `--output-format stream-json` and parses NDJSON from the child process's stdout. As assistant text chunks arrive, the provider writes them to `process.stderr` as a side effect of parsing (in `parseStreamJsonMessage`). Because the CLI inherits the provider's stderr, users see streaming text output in the terminal while the session runs.

This is intentional: stderr carries progress output, stdout carries the structured result. The pattern is standard for CLI tools that produce both human-readable progress and machine-readable results. The streaming output is a provider-level concern — the Animator and the tool system are not involved.

---

## Open Questions

- ~~**Provider discovery.** How does The Animator find installed session providers?~~ **Resolved:** the `guild.json["animator"]["sessionProvider"]` config field names the plugin id of the provider apparatus. The Animator looks it up via `guild().apparatus()`. Defaults to `'claude-code'`.
- **Timeout.** How are session timeouts configured? MVP: no timeout (the session runs until the provider exits).
- **Concurrency.** Can multiple sessions run simultaneously? Current answer: yes, each `animate()` call is independent.

---

## Future: Event Signalling

When The Clockworks integration is updated, The Animator will signal lifecycle events:

- **`session.started`** — fired after step 2 (initial record written). Payload includes `sessionId`, `provider`, `startedAt`, and caller-supplied `metadata`.
- **`session.ended`** — fired after step 5 (result recorded). Payload includes `sessionId`, `status`, `exitCode`, `durationMs`, `costUsd`, `error`, and `metadata`.
- **`session.record-failed`** — fired if the Stacks write in step 5 fails. Payload includes `sessionId` and the recording error. This is a diagnostic event — it means session data was lost.

These events are essential for clockworks standing orders (e.g. retry-on-failure, cost alerting, session auditing). The Animator fires them best-effort — event signalling failures are logged but never mask session results.

Blocked on: Clockworks apparatus spec finalization.

---

## Future: Enriched Session Records

At MVP, the Animator records what it directly observes (provider telemetry) and what the caller passes via `metadata`. The session record in The Stacks looks like:

```typescript
// MVP session record (what The Animator writes)
{
  id: 'ses-a3f7b2c1',
  status: 'completed',
  startedAt: '2026-04-01T12:00:00Z',
  endedAt: '2026-04-01T12:05:30Z',
  durationMs: 330000,
  provider: 'claude-code',
  exitCode: 0,
  providerSessionId: 'claude-sess-xyz',
  tokenUsage: {
    inputTokens: 12500,
    outputTokens: 3200,
    cacheReadTokens: 8000,
    cacheWriteTokens: 1500,
  },
  costUsd: 0.42,
  conversationId: null,
  metadata: { trigger: 'summon', animaId: 'anm-3f7b2c1', writId: 'wrt-8a4c9e2' },
  output: '### Overall: PASS\n\n### Completeness\n...',  // final assistant message
}
```

When The Loom and The Roster are available, the session record can be enriched with anima provenance — a snapshot of the identity and composition at session time. This provenance is critical for experiment ethnography (understanding what an anima "was" when it produced a given output).

Enriched fields (contributed by the caller or a post-session enrichment step):

| Field | Source | Purpose |
|---|---|---|
| `animaId` | Roster / caller metadata | Which anima ran |
| `animaName` | Roster / caller metadata | Human-readable identity |
| `roles` | Roster | Roles the anima held at session time |
| `curriculumName` | Loom / manifest | Curriculum snapshot |
| `curriculumVersion` | Loom / manifest | Curriculum version for reproducibility |
| `temperamentName` | Loom / manifest | Temperament snapshot |
| `temperamentVersion` | Loom / manifest | Temperament version |
| `trigger` | Caller (clockworks / CLI) | What invoked the session |
| `workshop` | Caller (workspace resolver) | Workshop name |
| `workspaceKind` | Caller (workspace resolver) | guildhall / workshop-temp / workshop-managed |
| `writId` | Caller (clockworks) | Bound writ for traceability |
| `turnNumber` | Caller (conversation manager) | Position in a multi-turn conversation |

**Design question:** Should enrichment happen via (a) the caller passing structured metadata that The Animator promotes into indexed fields, or (b) a post-session enrichment step that reads the session record and augments it? Option (a) is simpler; option (b) keeps the Animator interface stable as the enrichment set grows. Both work with the current `metadata` bag — the difference is whether The Animator's Stacks schema gains named columns for these fields or whether they remain JSON-path-queried properties inside `metadata`.

---

## Transcripts

The Animator captures full session transcripts in a dedicated `transcripts` book, separate from the `sessions` book. This keeps the operational session records lean (small records, fast CDC) while making the full interaction history available for web UIs, operational logs, debugging, and research.

Each transcript record contains the complete NDJSON message stream from the session provider:

```typescript
interface TranscriptDoc {
  id: string                          // same as session id — 1:1 relationship
  messages: TranscriptMessage[]       // full NDJSON transcript
}

type TranscriptMessage = Record<string, unknown>
```

The transcript is written at session completion (step 4 in the animate lifecycle), alongside the session result. If the transcript write fails, the error is logged but does not propagate — same error handling contract as session recording.

The `output` field on the session record (the final assistant message text) is extracted from the transcript before storage. This gives programmatic consumers a fast path to the session's conclusion without parsing the full transcript.

### Data scale

Transcripts are typically 500KB–5MB per session. At ~60 sessions/day, this is ~30–300MB/day in the transcripts book. SQLite handles this comfortably — primary key lookups are microseconds regardless of row size. The transcripts book has no CDC handlers, so there is no amplification concern. Retention/archival is a future concern.

---

## Future: Tool-Equipped Sessions

When The Instrumentarium ships, The Animator gains the ability to launch sessions with an MCP tool server. Tool resolution is the Loom's responsibility — the Loom resolves role → permissions → tools and returns them on the `AnimaWeave`. The Animator receives the resolved tool set and handles MCP server lifecycle.

### Updated lifecycle

```
summon(request)
  │
  ├─ 1. Resolve The Loom
  ├─ 2. loom.weave({ role }) → AnimaWeave { systemPrompt, tools }
  │     (Loom resolves role → permissions, calls instrumentarium.resolve(),
  │      reads tool instructions, composes full system prompt)
  └─ 3. Delegate to animate()

animate(request)
  │
  ├─ 1. Generate session id
  ├─ 2. Write initial session record to The Stacks
  │
  ├─ 3. If context.tools is present, configure MCP server:
  │     - Register each tool from the resolved set
  │     - Each tool handler accesses guild infrastructure via guild() singleton
  │
  ├─ 4. Launch session provider (with MCP server attached)
  ├─ 5. Monitor process until exit
  ├─ 6. Record result to The Stacks
  └─ 7. Return SessionResult
```

The Animator does not call the Instrumentarium directly — it receives the tool set from the AnimaWeave. This keeps tool resolution and system prompt composition together in the Loom, where tool instructions can be woven into the prompt alongside the tools they describe.

### Updated `SessionProviderConfig`

```typescript
interface SessionProviderConfig {
  systemPrompt: string
  initialPrompt?: string
  /** Resolved tools to serve via MCP. */
  tools?: ToolDefinition[]
  model: string
  conversationId?: string
  cwd: string
  streaming?: boolean
  /** Environment variables for the session process. */
  environment?: Record<string, string>
}
```

The session provider interface gains an optional `tools` field. The provider configures the MCP server from the tool definitions. Providers that don't support MCP ignore it. The Animator handles MCP server lifecycle (start before launch, stop after exit).

---

## Future: Streaming Through the Tool Contract

The current CLI streaming path works via a stderr side-channel in the provider (see § CLI streaming behavior). This is pragmatic and works well for the `nsg summon` use case, but it has limitations:

- The CLI has no control over formatting or filtering of streamed output — it's raw provider text on stderr.
- MCP callers cannot receive streaming output at all — the tool contract returns a single value.
- Callers that want to interleave chunk types (text, tool_use, tool_result) with their own UI cannot — the stderr stream is unstructured text.

The Animator already supports structured streaming internally: `animate({ streaming: true })` returns an `AnimateHandle` whose `chunks` async iterable yields typed `SessionChunk` objects in real time. The gap is that the tool system has no way to expose this to callers.

### Design sketch

Extend `ToolDefinition.handler` to support an `AsyncIterable` return type:

```typescript
// Current
handler: (params: T) => unknown | Promise<unknown>

// Extended
handler: (params: T) => unknown | Promise<unknown> | AsyncIterable<unknown>
```

Each caller adapts the iterable to its transport:

- **CLI** — detects `AsyncIterable`, writes chunks to stdout as they arrive (e.g. text chunks as plain text, tool_use/tool_result as structured lines). Prints the final summary after iteration completes.
- **MCP** — maps the iterable to MCP's streaming response model (SSE or streaming content blocks, depending on MCP protocol version).
- **Engines** — consume the iterable directly for programmatic streaming.

The `summon` tool handler would change from:

```typescript
const { result } = animator.summon({ prompt, role, cwd });
const session = await result;
return { id: session.id, status: session.status, ... };
```

To:

```typescript
const { chunks, result } = animator.summon({ prompt, role, cwd, streaming: true });
yield* chunks;           // stream output to caller
const session = await result;
return { id: session.id, status: session.status, ... };
```

(Using an async generator handler, or a dedicated streaming return wrapper — exact syntax TBD.)

### What this enables

- CLI users see formatted, filterable streaming output on stdout instead of raw stderr.
- MCP clients (e.g. IDE extensions, web UIs) receive real-time session output through the standard tool response channel.
- The stderr side-channel in the provider becomes unnecessary — streaming is a first-class concern of the tool contract.

### Dependencies

- Tool contract change (`ToolDefinition` in tools-apparatus)
- CLI adapter for async iterable tool returns
- MCP server adapter for streaming tool responses
- Decision: should the streaming return include both chunks and a final summary, or just chunks (with the summary as the last chunk)?

Blocked on: tool contract design discussion, MCP streaming support.

=== CONTEXT FILE: docs/architecture/apparatus/scriptorium.md ===
# The Scriptorium — API Contract

Status: **Draft**

Package: `@shardworks/codexes-apparatus` · Plugin id: `codexes`

> **⚠️ MVP scope.** This spec covers codex registration, draft binding lifecycle, and sealing/push operations. Clockworks integration (events, standing orders) is future work — the Scriptorium will emit events when the Clockworks apparatus exists. The Surveyor's codex-awareness integration is also out of scope for now.

---

## Purpose

The Scriptorium manages the guild's codexes — the git repositories where the guild's inscriptions accumulate. It owns the registry of known codexes, maintains local bare clones for efficient access, opens and closes draft bindings (worktrees) for concurrent work, and handles the sealing lifecycle that incorporates drafts into the sealed binding.

The Scriptorium does **not** know what a codex contains or what work applies to it (that's the Surveyor's domain). It does **not** orchestrate which anima works in which draft (that's the caller's concern — rig engines, dispatch scripts, or direct human invocation). It is pure git infrastructure — repository lifecycle, draft isolation, and branch management.

### Vocabulary Mapping

The Scriptorium's tools use the [guild metaphor's binding vocabulary](../../guild-metaphor.md#binding-canonical). The mapping to git concepts:

| Metaphor | Git | Scriptorium API |
|----------|-----|-----------------|
| **Codex** | Repository | `add`, `list`, `show`, `remove`, `fetch` |
| **Draft binding** (draft) | Worktree + branch | `openDraft`, `listDrafts`, `abandonDraft` |
| **Sealed binding** | Default branch (e.g. `main`) | Target of `seal` |
| **Sealing** | Fast-forward merge (or rebase + ff) | `seal` |
| **Abandoning** | Remove worktree + branch | `abandonDraft` |
| **Inscription** | Commit | *(not managed by the Scriptorium — animas inscribe directly via git)* |

Use plain git terms (branch, commit, merge) in error messages and logs where precision matters; the binding vocabulary is for the tool-facing API and documentation.

---

## Dependencies

```
requires: ['stacks']
consumes: []
```

- **The Stacks** — persists the codex registry and draft tracking records. Configuration in `guild.json` is the source of truth for registered codexes; the Stacks tracks runtime state (active drafts, clone status).

---

## Kit Interface

The Scriptorium does not consume kit contributions. No `consumes` declaration.

---

## Support Kit

```typescript
supportKit: {
  tools: [
    codexAddTool,
    codexListTool,
    codexShowTool,
    codexRemoveTool,
    codexPushTool,
    draftOpenTool,
    draftListTool,
    draftAbandonTool,
    draftSealTool,
  ],
},
```

---

## `ScriptoriumApi` Interface (`provides`)

```typescript
interface ScriptoriumApi {
  // ── Codex Registry ──────────────────────────────────────────

  /**
   * Register an existing repository as a codex.
   * Clones a bare copy to `.nexus/codexes/<name>.git` and adds the
   * entry to the `codexes` config section in `guild.json`.
   * Blocks until the clone completes.
   */
  add(name: string, remoteUrl: string): Promise<CodexRecord>

  /**
   * List all registered codexes with their status.
   */
  list(): Promise<CodexRecord[]>

  /**
   * Show details for a single codex, including active drafts.
   */
  show(name: string): Promise<CodexDetail>

  /**
   * Remove a codex from the guild. Abandons all active drafts,
   * removes the bare clone from `.nexus/codexes/`, and removes the
   * entry from `guild.json`. Does NOT delete the remote repository.
   */
  remove(name: string): Promise<void>

  /**
   * Fetch latest refs from the remote for a codex's bare clone.
   * Called automatically before draft creation and sealing; can
   * also be invoked manually.
   */
  fetch(name: string): Promise<void>

  /**
   * Push a branch to the codex's remote.
   * Pushes the specified branch (default: codex's default branch)
   * to the bare clone's configured remote. Does not force-push.
   */
  push(request: PushRequest): Promise<void>

  // ── Draft Binding Lifecycle ─────────────────────────────────

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
  openDraft(request: OpenDraftRequest): Promise<DraftRecord>

  /**
   * List active drafts, optionally filtered by codex.
   */
  listDrafts(codexName?: string): Promise<DraftRecord[]>

  /**
   * Abandon a draft — remove the draft's worktree and git branch.
   * Fails if the draft has unsealed inscriptions unless `force: true`.
   * The inscriptions persist in the git reflog but the draft is no
   * longer active.
   */
  abandonDraft(request: AbandonDraftRequest): Promise<void>

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
  seal(request: SealRequest): Promise<SealResult>
}
```

### Supporting Types

```typescript
interface CodexRecord {
  /** Codex name — unique within the guild. */
  name: string
  /** Remote repository URL. */
  remoteUrl: string
  /** Whether the bare clone exists and is healthy. */
  cloneStatus: 'ready' | 'cloning' | 'error'
  /** Number of active drafts for this codex. */
  activeDrafts: number
}

interface CodexDetail extends CodexRecord {
  /** Default branch name on the remote (e.g. 'main'). */
  defaultBranch: string
  /** Timestamp of last fetch. */
  lastFetched: string | null
  /** Active drafts for this codex. */
  drafts: DraftRecord[]
}

interface DraftRecord {
  /** Unique draft id (ULID). */
  id: string
  /** Codex this draft belongs to. */
  codexName: string
  /** Git branch name for this draft. */
  branch: string
  /** Absolute filesystem path to the draft's working directory (git worktree). */
  path: string
  /** When the draft was opened. */
  createdAt: string
  /** Optional association — e.g. a writ id. */
  associatedWith?: string
}

interface OpenDraftRequest {
  /** Codex to open the draft for. */
  codexName: string
  /** Branch name for the draft. If omitted, generates `draft-<ulid>`. */
  branch?: string
  /**
   * Starting point — branch, tag, or commit to branch from.
   * Default: remote HEAD (the codex's default branch).
   */
  startPoint?: string
  /** Optional association metadata (e.g. writ id). */
  associatedWith?: string
}

interface AbandonDraftRequest {
  /** Codex name. */
  codexName: string
  /** Git branch name of the draft to abandon. */
  branch: string
  /** Force abandonment even if the draft has unsealed inscriptions. */
  force?: boolean
}

interface SealRequest {
  /** Codex name. */
  codexName: string
  /** Git branch to seal (the draft's branch). */
  sourceBranch: string
  /** Target branch (the sealed binding). Default: codex's default branch. */
  targetBranch?: string
  /** Max rebase retry attempts under contention. Default: from settings.maxMergeRetries (3). */
  maxRetries?: number
  /** Keep the draft after successful sealing. Default: false. */
  keepDraft?: boolean
}

interface SealResult {
  /** Whether sealing succeeded. */
  success: boolean
  /** Strategy used: 'fast-forward' or 'rebase'. */
  strategy: 'fast-forward' | 'rebase'
  /** Number of retry attempts needed (0 = first try). */
  retries: number
  /** The commit SHA at head of target after sealing. */
  sealedCommit: string
  /** Number of inscriptions (commits) incorporated from the draft. 0 means no-op seal. */
  inscriptionsSealed: number
}

interface PushRequest {
  /** Codex name. */
  codexName: string
  /**
   * Branch to push. Default: codex's default branch.
   */
  branch?: string
}
```

---

## Configuration

The `codexes` key in `guild.json` has two sections: `settings` (apparatus-level configuration) and `registered` (the codex registry). Both can be edited by hand or through tools.

```json
{
  "codexes": {
    "settings": {
      "maxMergeRetries": 3,
      "draftRoot": ".nexus/worktrees"
    },
    "registered": {
      "nexus": {
        "remoteUrl": "git@github.com:shardworks/nexus.git"
      },
      "my-app": {
        "remoteUrl": "git@github.com:patron/my-app.git"
      }
    }
  }
}
```

### Settings

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `maxMergeRetries` | `number` | `3` | Max rebase-retry attempts during sealing under contention. |
| `draftRoot` | `string` | `".nexus/worktrees"` | Directory where draft worktrees are created, relative to guild root. |

### Registered Codexes

Each key in `registered` is the codex name (unique within the guild). The value:

| Field | Type | Description |
|-------|------|-------------|
| `remoteUrl` | `string` | The remote URL of the codex's git repository. Used for cloning and fetching. |

The config is intentionally minimal — a human can add a codex by hand-editing `guild.json` and the Scriptorium will pick it up on next startup (cloning the bare repo if needed).

---

## Tool Definitions

### `codex-add`

Register an existing repository as a codex.

```typescript
tool({
  name: 'codex-add',
  description: 'Register an existing git repository as a guild codex',
  permission: 'write',
  params: {
    name: z.string().describe('Name for the codex (unique within the guild)'),
    remoteUrl: z.string().describe('Git remote URL of the repository'),
  },
  handler: async ({ name, remoteUrl }) => {
    const api = guild().apparatus<ScriptoriumApi>('codexes')
    return api.add(name, remoteUrl)
  },
})
```

### `codex-list`

List all registered codexes.

```typescript
tool({
  name: 'codex-list',
  description: 'List all codexes registered with the guild',
  permission: 'read',
  params: {},
  handler: async () => {
    const api = guild().apparatus<ScriptoriumApi>('codexes')
    return api.list()
  },
})
```

### `codex-show`

Show details of a specific codex including active drafts.

```typescript
tool({
  name: 'codex-show',
  description: 'Show details of a registered codex including active draft bindings',
  permission: 'read',
  params: {
    name: z.string().describe('Codex name'),
  },
  handler: async ({ name }) => {
    const api = guild().apparatus<ScriptoriumApi>('codexes')
    return api.show(name)
  },
})
```

### `codex-remove`

Remove a codex from the guild (does not delete the remote).

```typescript
tool({
  name: 'codex-remove',
  description: 'Remove a codex from the guild (does not affect the remote repository)',
  permission: 'delete',
  params: {
    name: z.string().describe('Codex name to remove'),
  },
  handler: async ({ name }) => {
    const api = guild().apparatus<ScriptoriumApi>('codexes')
    return api.remove(name)
  },
})
```

### `codex-push`

Push a branch to the codex's remote.

```typescript
tool({
  name: 'codex-push',
  description: 'Push a branch to the codex remote',
  permission: 'write',
  params: {
    codexName: z.string().describe('Codex name'),
    branch: z.string().optional().describe('Branch to push (default: codex default branch)'),
  },
  handler: async (params) => {
    const api = guild().apparatus<ScriptoriumApi>('codexes')
    return api.push(params)
  },
})
```

### `draft-open`

Open a draft binding — create an isolated worktree for a codex.

```typescript
tool({
  name: 'draft-open',
  description: 'Open a draft binding on a codex (creates an isolated git worktree)',
  permission: 'write',
  params: {
    codexName: z.string().describe('Codex to open the draft for'),
    branch: z.string().optional().describe('Branch name for the draft (default: auto-generated draft-<ulid>)'),
    startPoint: z.string().optional().describe('Branch/tag/commit to start from (default: remote HEAD)'),
    associatedWith: z.string().optional().describe('Optional association (e.g. writ id)'),
  },
  handler: async (params) => {
    const api = guild().apparatus<ScriptoriumApi>('codexes')
    return api.openDraft(params)
  },
})
```

### `draft-list`

List active draft bindings.

```typescript
tool({
  name: 'draft-list',
  description: 'List active draft bindings, optionally filtered by codex',
  permission: 'read',
  params: {
    codexName: z.string().optional().describe('Filter by codex name'),
  },
  handler: async ({ codexName }) => {
    const api = guild().apparatus<ScriptoriumApi>('codexes')
    return api.listDrafts(codexName)
  },
})
```

### `draft-abandon`

Abandon a draft binding.

```typescript
tool({
  name: 'draft-abandon',
  description: 'Abandon a draft binding (removes the git worktree and branch)',
  permission: 'delete',
  params: {
    codexName: z.string().describe('Codex name'),
    branch: z.string().describe('Branch of the draft to abandon'),
    force: z.boolean().optional().describe('Force abandonment even with unmerged changes'),
  },
  handler: async (params) => {
    const api = guild().apparatus<ScriptoriumApi>('codexes')
    return api.abandonDraft(params)
  },
})
```

### `draft-seal`

Seal a draft — merge its branch into the sealed binding.

```typescript
tool({
  name: 'draft-seal',
  description: 'Seal a draft binding into the codex (ff-only merge or rebase; no merge commits)',
  permission: 'write',
  params: {
    codexName: z.string().describe('Codex name'),
    sourceBranch: z.string().describe('Draft branch to seal'),
    targetBranch: z.string().optional().describe('Target branch (default: codex default branch)'),
    maxRetries: z.number().optional().describe('Max rebase retries under contention (default: 3)'),
    keepDraft: z.boolean().optional().describe('Keep draft after sealing (default: false)'),
  },
  handler: async (params) => {
    const api = guild().apparatus<ScriptoriumApi>('codexes')
    return api.seal(params)
  },
})
```

---

## Session Integration

The Scriptorium and the Animator are **intentionally decoupled**. The Scriptorium manages git infrastructure; the Animator manages sessions. Neither knows about the other. They compose through a simple handoff: the `DraftRecord.path` returned by `openDraft()` is the `cwd` passed to the Animator's `summon()` or `animate()`.

### Composition pattern

The binding between a session and a draft is the caller's responsibility. The typical flow:

```
  Orchestrator (dispatch script, rig engine, standing order)
    │
    ├─ 1. scriptorium.openDraft({ codexName, branch })
    │     → DraftRecord { path: '.nexus/worktrees/nexus/writ-42' }
    │
    ├─ 2. animator.summon({ role, prompt, cwd: draft.path })
    │     → session runs, anima inscribes in the draft
    │     → session exits
    │
    ├─ 3. scriptorium.seal({ codexName, sourceBranch })
    │     → draft sealed into codex
    │
    └─ 4. scriptorium.push({ codexName })
          → sealed binding pushed to remote
```

The anima never touches draft lifecycle — it is launched *inside* the draft's working directory and inscribes there naturally. Infrastructure steps (open, seal, push) happen outside the session, ensuring they execute even if the session crashes or times out.

### The `DraftRecord` as handoff object

The `DraftRecord` carries everything the Animator needs:

- **`path`** — the session's `cwd`
- **`codexName`** — for session metadata (which codex this session worked on)
- **`branch`** — for session metadata (which draft)
- **`associatedWith`** — the writ id, if any (passed through to session metadata)

The Animator stores these as opaque metadata on the session record. The Scriptorium doesn't read session records; the Animator doesn't read draft records. They share data through the orchestrator that calls both.

### Why not tighter integration?

Animas cannot reliably manage their own draft lifecycle. A session's working directory is set at launch — the anima cannot relocate itself to a draft it opens mid-session. Even if it could (via absolute paths and `cd`), the failure modes are poor: crashed sessions leave orphaned drafts, forgotten seal steps leave inscriptions stranded, and every anima reimplements the same boilerplate. External orchestration is simpler and more reliable.

---

## Interim Dispatch Pattern

Before rig engines and the Clockworks exist, a shell script orchestrates the open → session → seal → push lifecycle. This is the recommended interim pattern:

```bash
#!/usr/bin/env bash
# dispatch-commission.sh — open a draft, run a session, seal and push
set -euo pipefail

CODEX="${1:?codex name required}"
ROLE="${2:?role required}"
PROMPT="${3:?prompt required}"

# 1. Open a draft binding (branch auto-generated)
DRAFT=$(nsg codex draft-open --codexName "$CODEX")

DRAFT_PATH=$(echo "$DRAFT" | jq -r '.path')
DRAFT_BRANCH=$(echo "$DRAFT" | jq -r '.branch')

# 2. Run the session in the draft
nsg summon \
  --role "$ROLE" \
  --cwd "$DRAFT_PATH" \
  --prompt "$PROMPT" \
  --metadata "{\"codex\": \"$CODEX\", \"branch\": \"$DRAFT_BRANCH\"}"

# 3. Seal the draft into the codex
nsg codex draft-seal \
  --codexName "$CODEX" \
  --sourceBranch "$DRAFT_BRANCH"

# 4. Push the sealed binding to the remote
nsg codex codex-push \
  --codexName "$CODEX"

echo "Commission sealed and pushed for $CODEX ($DRAFT_BRANCH)"
```

This script is intentionally simple — no error recovery, no retry logic beyond what `draft-seal` provides internally. A failed seal leaves the draft in place for manual inspection. A failed push leaves the sealed binding local — re-running `codex-push` is safe. The auto-generated branch name flows through the `DraftRecord` — the orchestrator never needs to invent one.

---

## Bare Clone Architecture

The Scriptorium maintains **bare clones** of each codex under `.nexus/codexes/<name>.git`. This is the local git infrastructure that makes draft operations fast and network-efficient.

```
.nexus/
  codexes/
    nexus.git/          ← bare clone of git@github.com:shardworks/nexus.git
    my-app.git/         ← bare clone of git@github.com:patron/my-app.git
  worktrees/
    nexus/
      writ-42/          ← draft: nexus, branch writ-42
      writ-57/          ← draft: nexus, branch writ-57
    my-app/
      writ-63/          ← draft: my-app, branch writ-63
```

### Why bare clones?

- **Single clone, many drafts.** A bare clone has no working tree of its own — it's just the git object database. Multiple draft worktrees can be created from it simultaneously without duplicating the repository data.
- **Network efficiency.** After the initial clone, updates are `git fetch` operations — fast, incremental, no full re-clone.
- **Transparent to animas.** An anima inscribing in a draft sees a normal git checkout. It doesn't know or care that the underlying repo is a bare clone. `git commit`, `git log`, `git diff` all work normally.
- **Clean separation.** The bare clone in `.nexus/codexes/` is infrastructure; the draft worktrees in `.nexus/worktrees/` are workspaces. Neither pollutes the guild's versioned content.

### Lifecycle

```
codex-add
  ├─ 1. Write entry to guild.json config
  ├─ 2. git clone --bare <remoteUrl> .nexus/codexes/<name>.git
  └─ 3. Record clone status in Stacks

draft-open
  ├─ 1. git fetch (in bare clone) — ensure refs are current
  ├─ 2. git worktree add .nexus/worktrees/<codex>/<branch> -b <branch> <startPoint>
  └─ 3. Record draft in Stacks

draft-seal
  ├─ 1. Fetch remote refs (git fetch --prune origin +refs/heads/*:refs/remotes/origin/*)
  │     → populates refs/remotes/origin/* without touching local sealed binding or draft branches
  ├─ 2. Advance local sealed binding if remote is ahead
  │     → if refs/remotes/origin/<target> is ahead of refs/heads/<target>: advance refs/heads/<target>
  │     → if local is ahead (unpushed seals): keep local — preserves inter-draft contention ordering
  ├─ 3. Attempt fast-forward merge
  │     └─ If ff not possible: rebase source onto target
  │        └─ If rebase conflicts: FAIL (no auto-resolution)
  │        └─ If rebase succeeds: retry ff (up to maxRetries)
  ├─ 4. Update target branch ref in bare clone
  └─ 5. Abandon draft (unless keepDraft)

codex-push
  ├─ 1. git push origin <branch> (from bare clone)
  └─ 2. Never force-push

codex-remove
  ├─ 1. Abandon all drafts for codex
  ├─ 2. Remove bare clone directory
  ├─ 3. Remove entry from guild.json
  └─ 4. Clean up Stacks records
```

### Sealing Strategy Detail

Sealing enforces **linear history** on the sealed binding — no merge commits, no force pushes. If a draft's inscriptions contradict the sealed binding (i.e. the sealed binding has advanced since the draft was opened), the sealing engine attempts to reconcile via rebase. If reconciliation fails, sealing seizes — the tool fails rather than creating non-linear history or silently resolving conflicts.

Git mechanics:

```
Seal Attempt:
  ├─ Try: git merge --ff-only <draft-branch> into <sealed-branch>
  │   ├─ Success → draft sealed
  │   └─ Fail (sealed binding has advanced) →
  │       ├─ Fetch latest sealed binding from remote
  │       ├─ Try: git rebase <sealed-branch> <draft-branch>
  │       │   ├─ Conflict → FAIL (sealing seizes — manual reconciliation needed)
  │       │   └─ Clean rebase →
  │       │       └─ Retry ff-only merge (loop, up to maxRetries)
  │       └─ All retries exhausted → FAIL
  └─ Never: merge commits, force push, conflict auto-resolution
```

The retry loop handles **contention** — when multiple animas seal to the same codex in quick succession, each fetch-rebase-ff cycle picks up the other's sealed inscriptions. Three retries (configurable via `settings.maxMergeRetries`) is sufficient for typical guild concurrency; the limit prevents infinite loops in pathological cases.

---

## Clone Readiness and Fetch Policy

### Initial clone

The `add()` API **blocks until the bare clone completes**. The caller gets back a `CodexRecord` with `cloneStatus: 'ready'` — registration isn't done until the clone is usable. This keeps the contract simple: if `add()` returns successfully, the codex is operational.

At **startup**, the Scriptorium checks each configured codex for an existing bare clone. Missing clones are initiated in the background — the apparatus starts without waiting. However, any tool invocation that requires the bare clone (everything except `codex-list`) **blocks until that codex's clone is ready**. The tool doesn't fail or return stale data; it waits. If the clone fails, the tool fails with a clear error referencing the clone failure.

### Fetch before branch operations

Every operation that creates or modifies branches **fetches from the remote first**:

- **`openDraft`** — fetches before branching, ensuring the start point reflects the latest remote state.
- **`seal`** — fetches the target branch before attempting ff-only, and again on each retry iteration. The fetch uses an explicit refspec (`+refs/heads/*:refs/remotes/origin/*`) to populate remote-tracking refs — a plain `git fetch origin` in a bare clone (which has no default fetch refspec) only updates `FETCH_HEAD` and leaves both `refs/heads/*` and `refs/remotes/origin/*` stale. After fetching, if `refs/remotes/origin/<target>` is strictly ahead of `refs/heads/<target>` (i.e. commits were pushed outside the Scriptorium), the local sealed binding is advanced to the remote position before the seal attempt. This ensures the draft is rebased onto the actual remote state and the subsequent push fast-forwards cleanly.
- **`push`** — does **not** fetch first (it's pushing, not pulling).

`fetch` is also exposed as a standalone API for manual use, but callers generally don't need it — the branch operations handle freshness internally.

### Startup reconciliation

On `start()`, the Scriptorium:

1. Reads the `codexes` config from `guild.json`
2. For each configured codex, checks whether a bare clone exists at `.nexus/codexes/<name>.git`
3. Initiates background clones for any missing codexes
4. Reconciles Stacks records with filesystem state (cleans up records for drafts that no longer exist on disk)

This means a patron can hand-edit `guild.json` to add a codex, and the Scriptorium will clone it on next startup.

---

## Draft Branch Collisions

If a caller requests a draft with a branch name that already exists for that codex, `openDraft` **rejects with a clear error**. Branch naming is the caller's responsibility. Auto-suffixing would hide real problems (two writs accidentally opening drafts on the same branch). Git enforces this at the worktree level — a branch can only be checked out in one worktree at a time — and the Scriptorium surfaces the constraint rather than working around it.

---

## Draft Cleanup

The Scriptorium does **not** automatically reap stale drafts. It provides the `abandonDraft` API; when and why to call it is an external concern. A future reaper process, standing order, or manual cleanup can use `draft-list` and `draft-abandon` as needed. This keeps the Scriptorium ignorant of writ lifecycle and other domain concerns.

---

## Future: Clockworks Events

When the Clockworks apparatus exists, the Scriptorium should emit events for downstream consumers (particularly the Surveyor):

| Event | Payload | When |
|-------|---------|------|
| `codex.added` | `{ name, remoteUrl }` | A codex is registered |
| `codex.removed` | `{ name }` | A codex is deregistered |
| `codex.fetched` | `{ name }` | A codex's bare clone is fetched |
| `draft.opened` | `{ codexName, branch, path, associatedWith? }` | A draft is opened |
| `draft.abandoned` | `{ codexName, branch }` | A draft is abandoned |
| `draft.sealed` | `{ codexName, sourceBranch, targetBranch, strategy }` | A draft is sealed |
| `codex.pushed` | `{ codexName, branch }` | A branch is pushed to remote |

Until then, downstream consumers query the Scriptorium API directly.

---

## Implementation Notes

- **`guild().writeConfig()`** — the Scriptorium uses `guild().writeConfig('codexes', ...)` to persist codex registry changes to `guild.json`. This API was added to the `Guild` interface in `@shardworks/nexus-core` and implemented in Arbor. It updates both the in-memory config and the disk file atomically.
- **Git operations.** All git operations use `child_process.execFile` (not shell) via a lightweight `git.ts` helper that handles error parsing and provides typed results (`GitResult`, `GitError`).
- **Concurrency.** Multiple animas may open/seal drafts concurrently. The bare clone's git operations need appropriate locking — git's own ref locking handles most cases, but the fetch-rebase-seal cycle should be serialized per codex to avoid ref races.
- **No downstream coupling.** The Scriptorium has no dependency on the Surveyor, the Spider, or any other consumer of codex state. It is pure infrastructure. Downstream apparatus query or (future) subscribe to the Scriptorium's state independently.

---

## Future State

### Draft Persistence via Stacks

The current implementation tracks active drafts **in memory**, reconstructed from filesystem state at startup. This is sufficient for MVP — draft worktrees are durable on disk and the Scriptorium reconciles on restart. However, this means:

- Draft metadata (`associatedWith`, `createdAt`) is approximate after a restart — the original values are lost.
- There is no queryable history of past drafts (abandoned or sealed).
- Other apparatus cannot subscribe to draft state changes via CDC.

A future iteration should persist `DraftRecord` entries to a Stacks book (`codexes/drafts`), enabling:

- Durable metadata that survives restarts
- Historical draft records (with terminal status: `sealed`, `abandoned`)
- CDC-driven downstream reactions (e.g. the Surveyor updating its codex-awareness when a draft is sealed)

### Per-Codex Sealing Lock

The sealing retry loop (fetch → rebase → ff) is not currently serialized per codex. Under high concurrency (multiple animas sealing to the same codex simultaneously), ref races are possible. Git's own ref locking prevents corruption, but the retry loop may exhaust retries unnecessarily.

A per-codex async mutex around the seal operation would eliminate this. The lock should be held only during the seal attempt, not during the preceding fetch or the subsequent draft cleanup.

### Clockworks Event Emission

Documented in the **Future: Clockworks Events** section above. When the Clockworks apparatus exists, the Scriptorium should emit events for each lifecycle operation. This replaces the current pattern where downstream consumers poll the API directly.

=== CONTEXT FILE: docs/architecture/apparatus/review-loop.md ===
# The Review Loop — Design Spec

Status: **Design** (not yet implemented)

> **Not a traditional apparatus.** The review loop does not have a `start()`/`stop()` lifecycle or a persistent runtime API. It is a composition pattern — a pair of engine designs and a rig structure — that lives at the intersection of the Spider, the Executor, and the Dispatch apparatus. This document specifies the full design, including an MVP path that works before the Spider exists.

---

## Purpose

The review loop moves quality assurance inside the rig. Instead of dispatching a commission once and surfacing the result to the patron regardless of quality, the rig runs an implementation pass, evaluates the result against concrete criteria, and — if the criteria are not met — runs a revision pass. The patron receives work only after it has cleared at least one automated review gate, or after the loop has exhausted its retry budget.

This is not a general-purpose test harness. The review loop does one thing: catch the most common and cheapest-to-detect failure modes before they become patron problems.

**What the review loop is not:**
- A replacement for spec quality. A bad spec produces bad work; the review loop helps only when the anima had the information to succeed but failed in execution.
- A Clockworks-dependent system. The loop runs entirely within the dispatch pipeline using existing apparatus.
- A complete quality gate. The MVP catches mechanical failures; richer review criteria are future scope.

---

## Empirical Motivation

Commission log X013 (`experiments/data/commission-log.yaml`) through 2026-04-02 shows the following outcome distribution across patron-tracked commissions with known outcomes:

| Outcome | Count | Notes |
|---------|-------|-------|
| success | 7 | Includes 1 with revision_required=true (partial attribution issue) |
| partial | 2 | Required follow-up commissions |
| abandoned | 3 | Two were test/infra noise; one was execution_error |
| cancelled | 1 | Process failure, not work failure |

Of the real work failures, the two most common causes were:
1. **Uncommitted changes** — anima produced correct work but did not commit before session end. Mechanically detectable.
2. **Partial execution** — anima completed some of the spec but missed a subsystem (e.g. missed a test file, broke a build). Partially detectable via build/test runs.

Both are catchable with cheap, mechanical review criteria. Neither requires an LLM judge. This is the MVP's target.

---

## Design Decision: Where Does the Loop Live?

Three candidate locations were considered:

### Option A: Dispatch-level wrapper (MVP path)

The Dispatch apparatus (`dispatch-next`) runs the implementation session, then runs a review pass, then optionally a revision session — all within a single dispatch call. No new apparatus; no Spider dependency.

**Pros:** Implementable now. Works with existing infrastructure. Dispatch is already the single entry point for writ execution.

**Cons:** The Dispatch is temporary infrastructure, scheduled for retirement when the Spider is implemented. Any logic added to Dispatch must be migrated. Also, the dispatch-level wrapper can only retry the entire session; it cannot retry a subcomponent.

### Option B: Review engine in every rig (full design)

The Spider seeds every rig with an `implement → review → [revise → review]*N` chain by default. The review engine is a clockwork engine; the revise engine is a quick engine. Both are standard engine designs contributed by a kit.

**Pros:** Architecturally clean. Composes naturally with Spider's traversal. Reusable engine designs. No migration from Dispatch required — Dispatch simply dispatches, and the rig handles iteration.

**Cons:** Requires the Spider. Not implementable until the rigging system exists.

### Option C: Rig pattern via origination engine

The origination engine seeds rigs with review chains by default. Superficially similar to Option B, but the decision of whether to include a review loop is made at origination time, not by a default rig structure.

**Pros:** Gives origination agency over review strategy (some work may not need review; some may need richer review).

**Cons:** Complicates origination. Review is almost always appropriate; making it opt-in inverts the sensible default.

### Decision

**Adopt both Option A (MVP) and Option B (full design).**

The Dispatch-level wrapper is the MVP: implementable now, catches the known failure modes, produces data on review loop effectiveness. When the Spider is implemented, the review logic migrates to engine designs (Option B), and the Dispatch drops its review wrapping entirely. The rig pattern (Option C) governs per-commission review configuration as a future enhancement.

The two designs share the same review criteria and artifact schemas — the MVP is a direct precursor to the full design, not a throwaway.

---

## MVP: Dispatch-Level Review Loop

The Dispatch `next()` method gains an optional `review` configuration. When enabled, after the implementation session completes, the Dispatch runs a review pass and conditionally launches a revision session.

### Data Flow

```
dispatch.next({ role: 'artificer', review: { enabled: true, maxRetries: 2 } })
│
├─ 1. Claim oldest ready writ (existing Dispatch logic)
├─ 2. Open draft binding (existing)
├─ 3. Launch implementation session (existing)
├─ 4. Await session completion
│
├─ [loop: up to maxRetries times]
│   ├─ 5. Run review pass against worktree
│   │      → ReviewResult { passed: boolean, failures: ReviewFailure[] }
│   │
│   ├─ [if passed] → break loop, proceed to seal
│   │
│   └─ [if failed]
│       ├─ 6. Write review artifact to commission data dir
│       ├─ 7. Launch revision session
│       │      context: original writ + review failures + git status/diff
│       └─ 8. Await revision session completion
│
├─ [if loop exhausted without passing]
│   ├─ 9. Write escalation artifact
│   ├─ 10. Abandon draft
│   └─ 11. Fail writ with resolution: "Review loop exhausted after N retries. See review artifacts."
│
└─ [if passed] → seal, push, complete writ (existing logic)
```

### Review Pass

The review pass is a synchronous, in-process check — not an anima session. It runs directly against the worktree. For MVP, three checks:

**Check 1: Uncommitted changes** (always enabled)

```
git -C <worktree> status --porcelain
```

Fails if output is non-empty. This catches the most common failure mode: the anima did the work but did not commit. Cheap, fast, definitive.

**Check 2: Build** (enabled if `guild.json` declares `review.buildCommand`)

```
<buildCommand> run in worktree
```

Fails if exit code is non-zero. Catches regressions introduced during implementation.

**Check 3: Tests** (enabled if `guild.json` declares `review.testCommand`)

```
<testCommand> run in worktree
```

Fails if exit code is non-zero. Captures stdout/stderr for inclusion in revision context.

Each check produces a `ReviewFailure`:

```typescript
interface ReviewFailure {
  check: 'uncommitted_changes' | 'build' | 'test'
  message: string        // human-readable summary
  detail?: string        // command output (truncated to 4KB)
}

interface ReviewResult {
  passed: boolean
  attempt: number        // 1-based: which attempt produced this result
  checks: ReviewCheck[]  // all checks run (pass or fail)
  failures: ReviewFailure[]
}

interface ReviewCheck {
  check: 'uncommitted_changes' | 'build' | 'test'
  passed: boolean
  durationMs: number
}
```

### Revision Context

When review fails, the revising anima receives a prompt assembled from:

1. **Original writ** — the full writ title and body (same as initial dispatch)
2. **Review failure report** — structured description of what checks failed and why
3. **Worktree state** — output of `git status` and `git diff HEAD` (if there are staged/unstaged changes)

The prompt template:

```
You have been dispatched to revise prior work on a commission.

## Assignment

**Title:** {writ.title}

**Writ ID:** {writ.id}

{writ.body}

---

## Review Findings (Attempt {attempt})

The previous implementation attempt did not pass automated review.
The following checks failed:

{for each failure}
### {check name}
{message}

{detail (if present)}
{end for}

---

## Current Worktree State

### git status
{git status output}

### git diff HEAD
{git diff HEAD output, truncated to 8KB}

---

Revise the work to address the review findings. Commit all changes before your session ends.
```

The revision session runs in the same worktree as the original implementation. It can see the prior work and build on it, not start from scratch.

### Iteration Cap

`maxRetries` defaults to 2. This means at most 3 sessions per writ: 1 implementation + 2 revisions. The cap is hard — the Dispatch does not exceed it regardless of review outcome.

Rationale: a third failed attempt almost always indicates a spec problem, an environment problem, or a complexity overrun — none of which another revision pass will fix. Escalating to the patron is the right call.

### Escalation

When the loop exhausts its retry budget without passing review:

1. The draft is abandoned (preserving the inscriptions for patron inspection)
2. The writ is transitioned to `failed`
3. The writ resolution is set to: `"Review loop exhausted after {N} retries. See review artifacts in commission data directory."`
4. All review artifacts are preserved (see Artifact Schema below)

The patron can inspect the artifacts, diagnose the failure mode, and either rewrite the spec or manually review the worktree before re-dispatching.

---

## Full Design: Review Engines in the Rig

When the Spider is implemented, the review loop migrates from Dispatch into the rig as two engine designs. The Dispatch drops all review logic.

### Engine Designs

#### `review` engine (clockwork)

**Design:**
```typescript
{
  id: 'review',
  kind: 'clockwork',
  inputs: ['writId', 'worktreePath', 'attempt'],
  outputs: ['reviewResult'],
  config: {
    checks: ['uncommitted_changes', 'build', 'test'],
    buildCommand: string | undefined,
    testCommand: string | undefined,
  }
}
```

The review engine runs the same three checks as the MVP. It writes a `ReviewResult` to its yield. It does not branch — it always completes, passing the result downstream.

The downstream engine (either a `seal` engine or a `revise` engine) reads `reviewResult.passed` to decide what to do. The Spider sees a completed engine regardless of outcome; the branching logic lives in the rig structure (see Rig Pattern below).

#### `revise` engine (quick)

**Design:**
```typescript
{
  id: 'revise',
  kind: 'quick',
  inputs: ['writId', 'worktreePath', 'reviewResult', 'attempt'],
  outputs: ['sessionResult'],
  role: 'artificer',
}
```

The revise engine assembles the revision prompt (same template as MVP) and launches an anima session. The session runs in the existing worktree — it does not open a new draft.

### Rig Pattern

The default rig for a commission with review enabled:

```
                ┌──────────────┐
                │  implement   │  (quick engine: artificer)
                │    engine    │
                └──────┬───────┘
                       │ yield: sessionResult
                       ▼
                ┌──────────────┐
                │    review    │  (clockwork engine)
                │   engine 1  │
                └──────┬───────┘
                       │ yield: reviewResult
          ┌────────────┴────────────┐
          │ passed                  │ failed (attempt < maxRetries)
          ▼                         ▼
   ┌─────────────┐         ┌──────────────────┐
   │    seal     │         │     revise       │  (quick engine: artificer)
   │   engine    │         │     engine 1     │
   └─────────────┘         └────────┬─────────┘
                                    │ yield: sessionResult
                                    ▼
                           ┌──────────────────┐
                           │     review       │  (clockwork engine)
                           │    engine 2      │
                           └────────┬─────────┘
                                    │ yield: reviewResult
                       ┌────────────┴────────────┐
                       │ passed                  │ failed
                       ▼                         ▼
                ┌─────────────┐         ┌──────────────────┐
                │    seal     │         │    escalate      │  (clockwork engine)
                │   engine    │         │    engine        │
                └─────────────┘         └──────────────────┘
```

The Spider traverses this graph naturally. Each engine completes and propagates its yield; downstream engines activate when their upstream is complete. The conditional branching (pass → seal, fail → revise) is expressed in the rig structure, not in Spider logic — the Spider just runs whatever is ready.

**Seeding the rig:** The origination engine produces this graph when it seeds the rig. For `maxRetries=2`, the origination engine seeds a fixed graph (not dynamically extended). If the guild wants `maxRetries=0` (no review loop), origination seeds the simple `implement → seal` graph.

**Dynamic extension (future):** A more sophisticated design would have the review engine declare a `need: 'revision'` when it fails, and the Fabricator would resolve and graft the next revise+review pair. This avoids pre-seeding the full graph and enables arbitrary retry depths. This is Future scope — the fixed graph is sufficient for MVP and avoids Spider complexity in the initial rigging implementation.

### Spider Integration

The Spider needs no changes to support the review loop. It already:
- Traverses all engines whose upstream is complete
- Dispatches ready engines to the Executor
- Handles both clockwork and quick engine kinds

The review loop is just a graph shape that Spider happens to traverse. The `escalate` clockwork engine signals the Clerk with a `failed` transition; the `seal` clockwork engine signals completion. The Spider itself is agnostic.

---

## Review Criteria Reference

### MVP Criteria (Mechanical)

| Check | Description | Detection Method | Cost |
|-------|-------------|-----------------|------|
| `uncommitted_changes` | All work is committed | `git status --porcelain` | < 100ms |
| `build` | Build command exits cleanly | Run configured build command | Varies |
| `test` | Test suite passes | Run configured test command | Varies |

The `uncommitted_changes` check is always enabled. Build and test checks are opt-in via guild configuration.

### Future Criteria (Judgment-Required)

These are not in scope for MVP but are the natural next layer:

| Check | Description | Detection Method | Cost |
|-------|-------------|-----------------|------|
| `spec_coverage` | Diff addresses spec requirements | LLM-as-judge pass on (spec, diff) | Medium |
| `no_regressions` | No tests were deleted or disabled | Diff analysis | Low |
| `type_check` | TypeScript compilation passes | `tsc --noEmit` | Varies |
| `lint` | Linter passes | Run configured lint command | Varies |

The LLM-as-judge `spec_coverage` check is the most valuable future criterion — it catches the "anima only addressed part of the spec" failure mode that mechanical checks miss. It requires a separate quick engine with access to the writ body and the diff, and a structured prompt asking whether the diff achieves the spec's stated goals.

---

## Artifact Schema

Every review pass writes an artifact. Artifacts live in the commission data directory alongside the existing artifacts written by the Laboratory.

### Location

```
experiments/data/commissions/<writ-id>/
  commission.md          (existing — writ body)
  review.md              (existing template — patron review slot)
  review-loop/
    attempt-1/
      review.md          (ReviewResult as structured markdown)
      git-status.txt     (git status output)
      git-diff.txt       (git diff HEAD output)
    attempt-2/
      review.md
      git-status.txt
      git-diff.txt
    escalation.md        (if loop exhausted; patron-facing summary)
```

For the MVP (Dispatch-level), the Dispatch writes these artifacts directly. For the full design (Spider-level), the review engine writes them via the Stacks or directly to the commission data directory.

### `review.md` Schema

```markdown
# Review — Attempt {N}

**Writ:** {writId}
**Timestamp:** {ISO 8601}
**Result:** PASSED | FAILED

## Checks

| Check | Result | Duration |
|-------|--------|----------|
| uncommitted_changes | ✓ PASS / ✗ FAIL | {ms}ms |
| build | ✓ PASS / ✗ FAIL | {ms}ms |
| test | ✓ PASS / ✗ FAIL | {ms}ms |

## Failures

{for each failure}
### {check}
{message}

```
{detail}
```
{end for}
```

### `escalation.md` Schema

```markdown
# Review Loop Escalated

**Writ:** {writId}
**Title:** {writ.title}
**Attempts:** {N}
**Timestamp:** {ISO 8601}

The review loop exhausted its retry budget ({maxRetries} retries) without
achieving a passing review. The draft has been abandoned.

## Summary of Failures

{for each attempt}
### Attempt {N}
{list of failed checks with messages}
{end for}

## Recommended Actions

- Inspect the worktree state preserved in the draft artifacts
- Review the git-diff.txt files in each attempt directory
- Revise the spec to address the observed failure mode before re-dispatching
```

---

## Configuration

For the MVP (Dispatch-level), review configuration lives in `guild.json`:

```json
{
  "review": {
    "enabled": true,
    "maxRetries": 2,
    "buildCommand": "pnpm build",
    "testCommand": "pnpm test"
  }
}
```

All fields are optional. `enabled` defaults to `false` for the MVP (opt-in). The intent is to make it default-on once the loop has been validated in practice.

For the full design (Spider-level), the same configuration is consumed by the origination engine to decide whether to seed the review graph and what configuration to pass to the review engine.

---

## Observability

The review loop is itself experiment data. Every iteration produces artifacts that the Laboratory can capture and analyze:

1. **Review artifacts** (`review-loop/attempt-N/`) — structured pass/fail evidence for each check. Enables quantitative analysis: which checks catch what failure modes? How often does the second attempt pass where the first failed?

2. **Session records** — revision sessions are recorded in the Animator's `sessions` book with `metadata.trigger: 'review-revision'` and `metadata.attempt: N`. Enables cost accounting: how much does the review loop add per commission?

3. **Writ resolution field** — when the loop escalates, the writ resolution includes the retry count. The commission log's `failure_mode` can be set to `review_exhausted` to distinguish review-loop failures from first-try failures.

4. **Commission log** — the `revision_required` field will more accurately reflect anima-driven revisions vs. patron-driven revisions once the review loop is active. The distinction becomes: `revision_required: true, revision_source: patron | review_loop`.

---

## Open Questions

These questions could not be resolved without patron input or empirical data from MVP deployment. Flag for patron review before implementation.

**Q1: Default-on or opt-in?**

The spec recommends opt-in for MVP (`enabled: false` default) to avoid surprises during initial deployment. However, opting-in per guild means the review loop doesn't run in experiments where it would produce the most useful data. Consider making it default-on from the start, with `enabled: false` as the escape hatch for commissions where review is inappropriate (e.g. spec-writing commissions like this one, where there's no build/test to run).

**Q2: Should revision sessions open new drafts or continue in the existing worktree?**

The current design continues in the existing worktree. This means revision builds on what the first attempt produced — which is usually correct (fix what's broken, don't start over). But it also means the revision session can see a messy worktree with uncommitted changes from the first attempt. Does the first attempt's work contaminate the revision? Or is seeing it in context (via `git diff`) actually helpful? No empirical evidence yet.

**Q3: What is the revision session's role?**

Should the revising anima be the same role as the implementing anima (e.g. `artificer`)? Or should the review loop summon a different role with explicit "you are reviewing and fixing prior work" instructions? The current spec defaults to the same role with a modified prompt. A distinct `revisor` role with specialized temperament could perform better. Needs a/b testing once the loop is running.

**Q4: Should the review pass happen before sealing, or is it implicitly "before sealing"?**

The current design places the review pass between the implementation session and the seal step. This means the draft is open during review. If the review pass runs the test suite, the test suite runs inside the worktree before sealing — which is correct. But it also means the worktree is mutable during review (in theory another process could write to it). Is this a problem in practice? Probably not for single-dispatch guilds, but worth noting.

**Q5: LLM-as-judge: when and how?**

The spec defers LLM-as-judge review to future scope, but it's the most valuable future criterion. Key unresolved questions: which model? What's the prompt structure? What's the acceptance threshold (0-10 score? binary pass/fail from the judge)? Who pays for the judge session — is it accounted separately from the commission cost? These need design work before the feature is useful.

**Q6: Should the review loop apply to spec-writing commissions?**

This commission is itself a spec-writing commission. There's no build command to run, no test suite to pass. The only mechanical check that applies is `uncommitted_changes`. Is that sufficient to warrant running the loop? Or should spec-writing commissions (like this one, with no target codex build) opt out of the loop by default? Consider: a charge type hint (`spec` vs. `implementation`) could guide the origination engine to include or exclude the review loop in the initial rig.

---

## Future Evolution

### Phase 1 (MVP — Dispatch-level)
- `uncommitted_changes` check always enabled
- `build` and `test` checks opt-in via `guild.json`
- `maxRetries: 2` hard cap
- Artifacts written to commission data directory
- Opt-in via `review.enabled: true` in `guild.json`

### Phase 2 (Spider-level engine designs)
- `review` clockwork engine contributed by a kit
- `revise` quick engine contributed by the same kit
- Origination engine seeds review graph by default
- Review configuration passed per-rig, not just per-guild

### Phase 3 (Richer review criteria)
- LLM-as-judge `spec_coverage` check
- `type_check` and `lint` checks
- Per-commission review configuration (charge type → review strategy)
- Distinct `revisor` role with specialized temperament

### Phase 4 (Dynamic extension)
- Review engine declares `need: 'revision'` on failure
- Fabricator resolves revision chain dynamically
- Arbitrary retry depth (or patron-configured per-commission)
- Review loop data feeds Surveyor codex profiles (this codex has a 60% first-try rate → seed richer review graph by default)

---

## Implementation Notes for MVP

The MVP requires changes to the Dispatch apparatus only:

1. **Add `ReviewConfig` to `DispatchRequest`** — optional field, all checks disabled by default
2. **Add `runReviewPass(worktreePath, config)` function** — pure function, no apparatus dependencies, runs git/build/test checks, returns `ReviewResult`
3. **Add `assembleRevisionPrompt(writ, reviewResult, worktreeState)` function** — pure function, returns string
4. **Extend `dispatch.next()` loop** — after implementation session, call `runReviewPass`; if failed and retries remain, launch revision session via `animator.summon()` with the revision prompt
5. **Write artifacts** — write `review-loop/attempt-N/review.md` and supporting files after each review pass. The commission data directory path is owned by the Laboratory; the Dispatch needs to know where it is, or the Laboratory's CDC hook writes these based on session metadata.

> **Artifact writing ownership:** The Laboratory currently auto-writes commission artifacts via CDC on session completion. It does not know about individual review passes within a dispatch. Two options: (a) Dispatch writes review artifacts directly to the commission data directory (requires Dispatch to know the Laboratory's path convention), or (b) review pass results are stored in the Stacks (a `review-passes` book) and the Laboratory's CDC picks them up. Option (b) is architecturally cleaner — the Stacks is the record of everything, and the Laboratory writes files from it. This is a detail for the implementing session to resolve.

The implementing session should also update the `DispatchResult` type to include `reviewAttempts?: number` and surface this in the dispatch summary.

=== CONTEXT FILE: packages/plugins/spider/src/spider.test.ts ===
/**
 * Spider — unit tests.
 *
 * Tests rig lifecycle, walk priority ordering, engine execution (clockwork
 * and quick), failure propagation, and CDC-driven writ transitions.
 *
 * Uses in-memory Stacks backend and mock Guild singleton.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { setGuild, clearGuild, generateId } from '@shardworks/nexus-core';
import type { Guild, GuildConfig, LoadedKit, LoadedApparatus, StartupContext } from '@shardworks/nexus-core';

import { createStacksApparatus } from '@shardworks/stacks-apparatus';
import { MemoryBackend } from '@shardworks/stacks-apparatus/testing';
import type { StacksApi } from '@shardworks/stacks-apparatus';

import { createClerk } from '@shardworks/clerk-apparatus';
import type { ClerkApi, WritDoc } from '@shardworks/clerk-apparatus';

import { createFabricator } from '@shardworks/fabricator-apparatus';
import type { FabricatorApi, EngineDesign } from '@shardworks/fabricator-apparatus';

import type { AnimatorApi, SummonRequest, AnimateHandle, SessionChunk, SessionResult, SessionDoc } from '@shardworks/animator-apparatus';

import { createSpider } from './spider.ts';
import type { SpiderApi, RigDoc, EngineInstance, ReviewYields, MechanicalCheck } from './types.ts';

// ── Test bootstrap ────────────────────────────────────────────────────

/**
 * Build a minimal StartupContext that captures and fires events.
 */
function buildCtx(): {
  ctx: StartupContext;
  fire: (event: string, ...args: unknown[]) => Promise<void>;
} {
  const handlers = new Map<string, Array<(...args: unknown[]) => void | Promise<void>>>();
  const ctx: StartupContext = {
    on(event, handler) {
      const list = handlers.get(event) ?? [];
      list.push(handler);
      handlers.set(event, list);
    },
  };
  async function fire(event: string, ...args: unknown[]): Promise<void> {
    for (const h of handlers.get(event) ?? []) {
      await h(...args);
    }
  }
  return { ctx, fire };
}

/**
 * Full integration fixture: starts Stacks (memory), Clerk, Fabricator,
 * and Spider. Returns handles to each API plus mock animator controls.
 */
function buildFixture(
  guildConfig: Partial<GuildConfig> = {},
  initialSessionOutcome: { status: 'completed' | 'failed'; error?: string; output?: string } = { status: 'completed' },
): {
  stacks: StacksApi;
  clerk: ClerkApi;
  fabricator: FabricatorApi;
  spider: SpiderApi;
  memBackend: InstanceType<typeof MemoryBackend>;
  fire: (event: string, ...args: unknown[]) => Promise<void>;
  summonCalls: SummonRequest[];
  setSessionOutcome: (outcome: { status: 'completed' | 'failed'; error?: string; output?: string }) => void;
} {
  const memBackend = new MemoryBackend();
  const stacksPlugin = createStacksApparatus(memBackend);
  const clerkPlugin = createClerk();
  const fabricatorPlugin = createFabricator();
  const spiderPlugin = createSpider();

  if (!('apparatus' in stacksPlugin)) throw new Error('stacks must be apparatus');
  if (!('apparatus' in clerkPlugin)) throw new Error('clerk must be apparatus');
  if (!('apparatus' in fabricatorPlugin)) throw new Error('fabricator must be apparatus');
  if (!('apparatus' in spiderPlugin)) throw new Error('spider must be apparatus');

  const stacksApparatus = stacksPlugin.apparatus;
  const clerkApparatus = clerkPlugin.apparatus;
  const fabricatorApparatus = fabricatorPlugin.apparatus;
  const spiderApparatus = spiderPlugin.apparatus;

  const apparatusMap = new Map<string, unknown>();

  const fakeGuildConfig: GuildConfig = {
    name: 'test-guild',
    nexus: '0.0.0',
    plugins: [],
    ...guildConfig,
  };

  const fakeGuild: Guild = {
    home: '/tmp/test-guild',
    apparatus<T>(name: string): T {
      const api = apparatusMap.get(name);
      if (!api) throw new Error(`Apparatus "${name}" not found`);
      return api as T;
    },
    config<T>(_pluginId: string): T { return {} as T; },
    writeConfig() {},
    guildConfig() { return fakeGuildConfig; },
    kits(): LoadedKit[] { return []; },
    apparatuses(): LoadedApparatus[] { return []; },
  };

  setGuild(fakeGuild);

  // Start stacks with memory backend
  const noopCtx = { on: () => {} };
  stacksApparatus.start(noopCtx);
  const stacks = stacksApparatus.provides as StacksApi;
  apparatusMap.set('stacks', stacks);

  // Manually ensure all books the Spider and Clerk need
  memBackend.ensureBook({ ownerId: 'clerk', book: 'writs' }, {
    indexes: ['status', 'type', 'createdAt', ['status', 'type'], ['status', 'createdAt']],
  });
  memBackend.ensureBook({ ownerId: 'spider', book: 'rigs' }, {
    indexes: ['status', 'writId', ['status', 'writId'], 'createdAt'],
  });
  memBackend.ensureBook({ ownerId: 'animator', book: 'sessions' }, {
    indexes: ['startedAt', 'status'],
  });

  // Mock animator — captures summon() calls and writes session docs to Stacks.
  // The session record is written eagerly (synchronous put, fire-and-forget)
  // so the Spider's collect step finds it on the next crawl() call. Engines
  // no longer await handle.result — they return immediately with handle.sessionId.
  let currentSessionOutcome = initialSessionOutcome;
  const summonCalls: SummonRequest[] = [];
  const mockAnimatorApi: AnimatorApi = {
    summon(request: SummonRequest): AnimateHandle {
      summonCalls.push(request);
      const sessionId = generateId('ses', 4);
      const startedAt = new Date().toISOString();
      const outcome = currentSessionOutcome;

      const sessBook = stacks.book<SessionDoc>('animator', 'sessions');
      const endedAt = new Date().toISOString();
      const doc: SessionDoc = {
        id: sessionId,
        status: outcome.status,
        startedAt,
        endedAt,
        durationMs: 0,
        provider: 'mock',
        exitCode: outcome.status === 'completed' ? 0 : 1,
        ...(outcome.error ? { error: outcome.error } : {}),
        ...(outcome.output !== undefined ? { output: outcome.output } : {}),
        metadata: request.metadata,
      };
      // Write eagerly — fire and forget. The in-memory backend is sync.
      void sessBook.put(doc);

      const result = Promise.resolve({
        id: sessionId,
        status: outcome.status,
        startedAt,
        endedAt,
        durationMs: 0,
        provider: 'mock',
        exitCode: outcome.status === 'completed' ? 0 : 1,
        ...(outcome.error ? { error: outcome.error } : {}),
        ...(outcome.output !== undefined ? { output: outcome.output } : {}),
        metadata: request.metadata,
      } as SessionResult);

      async function* emptyChunks(): AsyncIterable<SessionChunk> {}
      return { sessionId, chunks: emptyChunks(), result };
    },
    animate(): AnimateHandle {
      throw new Error('animate() not used in Spider tests');
    },
  };
  apparatusMap.set('animator', mockAnimatorApi);

  // Start clerk
  clerkApparatus.start(noopCtx);
  const clerk = clerkApparatus.provides as ClerkApi;
  apparatusMap.set('clerk', clerk);

  // Start fabricator with its own ctx so we can fire events
  const { ctx: fabricatorCtx, fire } = buildCtx();
  fabricatorApparatus.start(fabricatorCtx);
  const fabricator = fabricatorApparatus.provides as FabricatorApi;
  apparatusMap.set('fabricator', fabricator);

  // Start spider
  spiderApparatus.start(noopCtx);
  const spider = spiderApparatus.provides as SpiderApi;
  apparatusMap.set('spider', spider);

  // Simulate plugin:initialized for the Spider so the Fabricator scans
  // its supportKit and picks up the five engine designs.
  const spiderLoaded: LoadedApparatus = {
    packageName: '@shardworks/spider-apparatus',
    id: 'spider',
    version: '0.0.0',
    apparatus: spiderApparatus,
  };
  // Fire synchronously — fabricator's handler is sync
  void fire('plugin:initialized', spiderLoaded);

  return {
    stacks, clerk, fabricator, spider, memBackend, fire,
    summonCalls,
    setSessionOutcome(outcome: { status: 'completed' | 'failed'; error?: string; output?: string }) {
      currentSessionOutcome = outcome;
    },
  };
}

/** Get the rigs book. */
function rigsBook(stacks: StacksApi) {
  return stacks.book<RigDoc>('spider', 'rigs');
}

/** Post a writ. */
async function postWrit(clerk: ClerkApi, title = 'Test writ', codex?: string): Promise<WritDoc> {
  return clerk.post({ title, body: 'Test body', codex });
}

// ── Tests ─────────────────────────────────────────────────────────────

describe('Spider', () => {
  let fix: ReturnType<typeof buildFixture>;

  beforeEach(() => {
    fix = buildFixture();
  });

  afterEach(() => {
    clearGuild();
  });

  // ── Fabricator integration ─────────────────────────────────────────

  describe('Fabricator — Spider engine registration', () => {
    it('registers all five engine designs in the Fabricator', () => {
      const { fabricator } = fix;
      assert.ok(fabricator.getEngineDesign('draft'), 'draft engine registered');
      assert.ok(fabricator.getEngineDesign('implement'), 'implement engine registered');
      assert.ok(fabricator.getEngineDesign('review'), 'review engine registered');
      assert.ok(fabricator.getEngineDesign('revise'), 'revise engine registered');
      assert.ok(fabricator.getEngineDesign('seal'), 'seal engine registered');
    });

    it('returns undefined for an unknown engine ID', () => {
      assert.equal(fix.fabricator.getEngineDesign('nonexistent'), undefined);
    });
  });

  // ── walk() idle ────────────────────────────────────────────────────

  describe('walk() — idle', () => {
    it('returns null when there is no work', async () => {
      const result = await fix.spider.crawl();
      assert.equal(result, null);
    });
  });

  // ── Spawn ──────────────────────────────────────────────────────────

  describe('walk() — spawn', () => {
    it('spawns a rig for a ready writ and transitions writ to active', async () => {
      const { clerk, spider, stacks } = fix;
      const writ = await postWrit(clerk);
      assert.equal(writ.status, 'ready');

      const result = await spider.crawl();
      assert.ok(result !== null, 'expected a walk result');
      assert.equal(result.action, 'rig-spawned');
      assert.equal((result as { writId: string }).writId, writ.id);

      const rigs = await rigsBook(stacks).list();
      assert.equal(rigs.length, 1);
      assert.equal(rigs[0].writId, writ.id);
      assert.equal(rigs[0].status, 'running');
      assert.equal(rigs[0].engines.length, 5);

      // Writ should now be active
      const updatedWrit = await clerk.show(writ.id);
      assert.equal(updatedWrit.status, 'active');
    });

    it('does not spawn a second rig for a writ that already has one', async () => {
      const { clerk, spider, stacks } = fix;
      await postWrit(clerk);

      await spider.crawl(); // spawns rig

      const rigs = await rigsBook(stacks).list();
      assert.equal(rigs.length, 1, 'only one rig should exist');
    });

    it('spawns rigs for the oldest ready writ first (FIFO)', async () => {
      const { clerk, spider } = fix;

      // Small delay to ensure different createdAt timestamps
      const w1 = await postWrit(clerk, 'First writ');
      await new Promise((r) => setTimeout(r, 2));
      const w2 = await postWrit(clerk, 'Second writ');

      const r1 = await spider.crawl();
      assert.equal(r1?.action, 'rig-spawned');
      assert.equal((r1 as { writId: string }).writId, w1.id);

      // Mark rig1 as failed so w2 can spawn
      const rigs = await rigsBook(fix.stacks).list();
      await rigsBook(fix.stacks).patch(rigs[0].id, { status: 'failed' });

      const r2 = await spider.crawl();
      assert.equal(r2?.action, 'rig-spawned');
      assert.equal((r2 as { writId: string }).writId, w2.id);
    });
  });

  // ── Priority ordering ──────────────────────────────────────────────

  describe('walk() — priority ordering: collect > run > spawn', () => {
    it('runs before spawning when a rig already exists', async () => {
      const { clerk, spider, stacks } = fix;
      await postWrit(clerk);

      // Spawn the rig
      const r1 = await spider.crawl();
      assert.equal(r1?.action, 'rig-spawned');

      // Second walk should run (not spawn another rig)
      // The draft engine will fail (no codexes), resulting in 'rig-completed'
      const r2 = await spider.crawl();
      assert.notEqual(r2?.action, 'rig-spawned');
      // Only one rig created
      const rigs = await rigsBook(stacks).list();
      assert.equal(rigs.length, 1);
    });

    it('collects before running when a running engine has a terminal session', async () => {
      const { clerk, spider, stacks } = fix;
      await postWrit(clerk);
      await spider.crawl(); // spawn

      const book = rigsBook(stacks);
      const [rig] = await book.list();
      const fakeSessionId = generateId('ses', 4);

      // Set draft to running with a session
      const enginesWithSession = rig.engines.map((e: EngineInstance) =>
        e.id === 'draft'
          ? { ...e, status: 'running' as const, sessionId: fakeSessionId }
          : e,
      );
      await book.patch(rig.id, { engines: enginesWithSession });

      // Insert terminal session
      const sessBook = stacks.book<{ id: string; status: string; startedAt: string; provider: string; [key: string]: unknown }>('animator', 'sessions');
      await sessBook.put({ id: fakeSessionId, status: 'completed', startedAt: new Date().toISOString(), provider: 'test' });

      // Walk should collect (not run implement which has no completed upstream)
      const r = await spider.crawl();
      assert.equal(r?.action, 'engine-completed');
      assert.equal((r as { engineId: string }).engineId, 'draft');
    });
  });

  // ── Engine readiness ───────────────────────────────────────────────

  describe('engine readiness — upstream must complete first', () => {
    it('only the first engine (no upstream) is runnable initially', async () => {
      const { clerk, spider, stacks } = fix;
      await postWrit(clerk);
      await spider.crawl(); // spawn

      const [rig] = await rigsBook(stacks).list();

      // All engines except draft should have upstream
      const draft = rig.engines.find((e: EngineInstance) => e.id === 'draft');
      const implement = rig.engines.find((e: EngineInstance) => e.id === 'implement');
      assert.deepEqual(draft?.upstream, []);
      assert.deepEqual(implement?.upstream, ['draft']);
    });

    it('implement only launches after draft is completed', async () => {
      const { clerk, spider, stacks } = fix;
      await postWrit(clerk);
      await spider.crawl(); // spawn

      const book = rigsBook(stacks);
      const [rig] = await book.list();

      // Mark draft as completed
      const updatedEngines = rig.engines.map((e: EngineInstance) =>
        e.id === 'draft'
          ? { ...e, status: 'completed' as const, yields: { draftId: 'd1', codexName: 'c', branch: 'b', path: '/p' } }
          : e,
      );
      await book.patch(rig.id, { engines: updatedEngines });

      // Now walk should launch implement (quick engine → 'engine-started', not 'engine-completed')
      const result = await spider.crawl();
      assert.equal(result?.action, 'engine-started');
      assert.equal((result as { engineId: string }).engineId, 'implement');
    });
  });

  // ── Quick engine execution (implement) ────────────────────────────

  describe('implement engine execution', () => {
    it('launches session on first walk, then collects yields on second walk', async () => {
      const { clerk, spider, stacks } = fix;
      await postWrit(clerk);
      await spider.crawl(); // spawn

      const book = rigsBook(stacks);
      const [rig0] = await book.list();

      // Pre-complete draft so implement can run
      const updatedEngines = rig0.engines.map((e: EngineInstance) =>
        e.id === 'draft'
          ? { ...e, status: 'completed' as const, yields: { draftId: 'd1', codexName: 'c', branch: 'b', path: '/p' } }
          : e,
      );
      await book.patch(rig0.id, { engines: updatedEngines });

      // Walk: implement launches an Animator session (quick engine → 'engine-started')
      const result = await spider.crawl();
      assert.equal(result?.action, 'engine-started');
      assert.equal((result as { engineId: string }).engineId, 'implement');

      const [rig1] = await book.list();
      const impl1 = rig1.engines.find((e: EngineInstance) => e.id === 'implement');
      assert.equal(impl1?.status, 'running', 'engine should be running after launch');
      assert.ok(impl1?.sessionId !== undefined, 'sessionId should be stored');

      // Walk: collect step finds the terminal session and stores yields
      const result2 = await spider.crawl();
      assert.equal(result2?.action, 'engine-completed');
      assert.equal((result2 as { engineId: string }).engineId, 'implement');

      const [rig2] = await book.list();
      const impl2 = rig2.engines.find((e: EngineInstance) => e.id === 'implement');
      assert.equal(impl2?.status, 'completed');
      assert.ok(impl2?.yields !== undefined, 'yields should be stored');
      assert.doesNotThrow(() => JSON.stringify(impl2?.yields));
    });

    it('marks engine and rig failed when engine design is not found', async () => {
      const { clerk, spider, stacks } = fix;
      await postWrit(clerk);
      await spider.crawl(); // spawn

      const book = rigsBook(stacks);
      const [rig] = await book.list();

      // Inject a bad designId for draft
      const brokenEngines = rig.engines.map((e: EngineInstance) =>
        e.id === 'draft' ? { ...e, designId: 'nonexistent-engine' } : e,
      );
      await book.patch(rig.id, { engines: brokenEngines });

      const result = await spider.crawl();
      assert.equal(result?.action, 'rig-completed');
      assert.equal((result as { outcome: string }).outcome, 'failed');

      const [updated] = await book.list();
      assert.equal(updated.status, 'failed');
      const draft = updated.engines.find((e: EngineInstance) => e.id === 'draft');
      assert.equal(draft?.status, 'failed');
      assert.ok(draft?.error?.includes('nonexistent-engine'));
    });
  });

  // ── Yield serialization failure ────────────────────────────────────

  describe('yield serialization failure', () => {
    it('non-serializable engine yields cause engine and rig failure', async () => {
      const { clerk, spider, stacks, fire } = fix;

      // Register an engine design that returns non-JSON-serializable yields
      const badEngine: EngineDesign = {
        id: 'bad-engine',
        async run() {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return { status: 'completed' as const, yields: { fn: (() => {}) as any } };
        },
      };
      const fakePlugin: LoadedApparatus = {
        packageName: '@test/bad-engine',
        id: 'test-bad',
        version: '0.0.0',
        apparatus: {
          requires: [],
          supportKit: { engines: { 'bad-engine': badEngine } },
          provides: {},
          start() {},
        },
      };
      void fire('plugin:initialized', fakePlugin);

      await postWrit(clerk);
      await spider.crawl(); // spawn

      const book = rigsBook(stacks);
      const [rig] = await book.list();

      // Patch draft to use the bad engine design
      await book.patch(rig.id, {
        engines: rig.engines.map((e: EngineInstance) =>
          e.id === 'draft' ? { ...e, designId: 'bad-engine' } : e,
        ),
      });

      const result = await spider.crawl();
      assert.ok(result !== null);
      assert.equal(result.action, 'rig-completed');
      assert.equal((result as { outcome: string }).outcome, 'failed');

      const [updated] = await book.list();
      assert.equal(updated.status, 'failed');
      const draft = updated.engines.find((e: EngineInstance) => e.id === 'draft');
      assert.equal(draft?.status, 'failed');
      assert.ok(draft?.error !== undefined && draft.error.length > 0, `expected engine to have an error, got: ${draft?.error}`);
    });
  });

  // ── Implement engine — summon args and prompt wrapping ────────────

  describe('implement engine — Animator integration', () => {
    it('calls animator.summon() with role, prompt, cwd, environment, and metadata', async () => {
      const { clerk, spider, stacks, summonCalls } = fix;
      const writ = await postWrit(clerk, 'My commission', 'my-codex');
      await spider.crawl(); // spawn

      const book = rigsBook(stacks);
      const [rig] = await book.list();
      await book.patch(rig.id, {
        engines: rig.engines.map((e: EngineInstance) =>
          e.id === 'draft'
            ? { ...e, status: 'completed' as const, yields: { draftId: 'd1', codexName: 'c', branch: 'b', path: '/the/worktree' } }
            : e,
        ),
      });

      const launchResult = await spider.crawl(); // launch implement
      assert.equal(launchResult?.action, 'engine-started');

      assert.equal(summonCalls.length, 1, 'summon should be called once');
      const call = summonCalls[0];
      assert.equal(call.role, 'artificer', 'role defaults to artificer');
      assert.equal(call.cwd, '/the/worktree', 'cwd is draft worktree path');
      assert.deepEqual(call.environment, { GIT_AUTHOR_EMAIL: `${writ.id}@nexus.local` });
      assert.deepEqual(call.metadata, { engineId: 'implement', writId: writ.id });
    });

    it('wraps the writ body with a commit instruction', async () => {
      const { clerk, spider, stacks, summonCalls } = fix;
      await clerk.post({ title: 'My writ', body: 'Build the feature.' });
      await spider.crawl(); // spawn

      const book = rigsBook(stacks);
      const [rig] = await book.list();
      await book.patch(rig.id, {
        engines: rig.engines.map((e: EngineInstance) =>
          e.id === 'draft'
            ? { ...e, status: 'completed' as const, yields: { draftId: 'd1', codexName: 'c', branch: 'b', path: '/wt' } }
            : e,
        ),
      });

      const launchResult2 = await spider.crawl(); // launch implement
      assert.equal(launchResult2?.action, 'engine-started');

      assert.equal(summonCalls.length, 1);
      const expectedPrompt = 'Build the feature.\n\nCommit all changes before ending your session.';
      assert.equal(summonCalls[0].prompt, expectedPrompt);
    });

    it('session failure propagates: engine fails → rig fails → writ transitions to failed', async () => {
      const { clerk, spider, stacks, setSessionOutcome } = fix;
      setSessionOutcome({ status: 'failed', error: 'Process exited with code 1' });

      const writ = await postWrit(clerk, 'Failing writ');
      await spider.crawl(); // spawn

      const book = rigsBook(stacks);
      const [rig] = await book.list();
      await book.patch(rig.id, {
        engines: rig.engines.map((e: EngineInstance) =>
          e.id === 'draft'
            ? { ...e, status: 'completed' as const, yields: { draftId: 'd1', codexName: 'c', branch: 'b', path: '/wt' } }
            : e,
        ),
      });

      await spider.crawl(); // launch implement (session already terminal in Stacks)
      await spider.crawl(); // collect: session failed → engine fails → rig fails

      const [updatedRig] = await book.list();
      assert.equal(updatedRig.status, 'failed', 'rig should be failed');
      const impl = updatedRig.engines.find((e: EngineInstance) => e.id === 'implement');
      assert.equal(impl?.status, 'failed', 'implement engine should be failed');

      const failedWrit = await clerk.show(writ.id);
      assert.equal(failedWrit.status, 'failed', 'writ should transition to failed via CDC');
    });

    it('ImplementYields contain sessionId and sessionStatus from the session record', async () => {
      const { clerk, spider, stacks } = fix;
      await postWrit(clerk, 'Yields test');
      await spider.crawl(); // spawn

      const book = rigsBook(stacks);
      const [rig] = await book.list();
      await book.patch(rig.id, {
        engines: rig.engines.map((e: EngineInstance) =>
          e.id === 'draft'
            ? { ...e, status: 'completed' as const, yields: { draftId: 'd1', codexName: 'c', branch: 'b', path: '/wt' } }
            : e,
        ),
      });

      await spider.crawl(); // launch
      await spider.crawl(); // collect

      const [updated] = await book.list();
      const impl = updated.engines.find((e: EngineInstance) => e.id === 'implement');
      assert.equal(impl?.status, 'completed');
      const yields = impl?.yields as Record<string, unknown>;
      assert.ok(typeof yields.sessionId === 'string', 'sessionId should be a string');
      assert.equal(yields.sessionStatus, 'completed');
    });
  });

  // ── Quick engine collect ───────────────────────────────────────────

  describe('quick engine — collect', () => {
    it('collects yields from a terminal session in the sessions book', async () => {
      const { clerk, spider, stacks } = fix;
      await postWrit(clerk);
      await spider.crawl(); // spawn

      const book = rigsBook(stacks);
      const [rig] = await book.list();
      const fakeSessionId = generateId('ses', 4);

      // Simulate: draft completed, implement launched a session
      const enginesWithSession = rig.engines.map((e: EngineInstance) => {
        if (e.id === 'draft') {
          return { ...e, status: 'completed' as const, yields: { draftId: 'x', codexName: 'c', branch: 'b', path: '/p' } };
        }
        if (e.id === 'implement') {
          return { ...e, status: 'running' as const, sessionId: fakeSessionId };
        }
        return e;
      });
      await book.patch(rig.id, { engines: enginesWithSession });

      // Insert terminal session record
      const sessBook = stacks.book<{
        id: string; status: string; startedAt: string; provider: string;
        output?: string; [key: string]: unknown;
      }>('animator', 'sessions');
      await sessBook.put({
        id: fakeSessionId,
        status: 'completed',
        startedAt: new Date().toISOString(),
        provider: 'test',
        output: 'Session completed successfully',
      });

      // Walk: collect step should find the terminal session
      const result = await spider.crawl();
      assert.equal(result?.action, 'engine-completed');
      assert.equal((result as { engineId: string }).engineId, 'implement');

      const [updated] = await book.list();
      const impl = updated.engines.find((e: EngineInstance) => e.id === 'implement');
      assert.equal(impl?.status, 'completed');
      assert.ok(impl?.yields !== undefined);
      const yields = impl?.yields as Record<string, unknown>;
      assert.equal(yields.sessionId, fakeSessionId);
      assert.equal(yields.sessionStatus, 'completed');
    });

    it('marks engine and rig failed when session failed', async () => {
      const { clerk, spider, stacks } = fix;
      await postWrit(clerk);
      await spider.crawl(); // spawn

      const book = rigsBook(stacks);
      const [rig] = await book.list();
      const fakeSessionId = generateId('ses', 4);

      const enginesWithSession = rig.engines.map((e: EngineInstance) => {
        if (e.id === 'draft') {
          return { ...e, status: 'completed' as const, yields: { draftId: 'x' } };
        }
        if (e.id === 'implement') {
          return { ...e, status: 'running' as const, sessionId: fakeSessionId };
        }
        return e;
      });
      await book.patch(rig.id, { engines: enginesWithSession });

      const sessBook = stacks.book<{
        id: string; status: string; startedAt: string; provider: string;
        error?: string; [key: string]: unknown;
      }>('animator', 'sessions');
      await sessBook.put({
        id: fakeSessionId,
        status: 'failed',
        startedAt: new Date().toISOString(),
        provider: 'test',
        error: 'Process exited with code 1',
      });

      const result = await spider.crawl();
      assert.equal(result?.action, 'rig-completed');
      assert.equal((result as { outcome: string }).outcome, 'failed');

      const [updated] = await book.list();
      assert.equal(updated.status, 'failed');
      const impl = updated.engines.find((e: EngineInstance) => e.id === 'implement');
      assert.equal(impl?.status, 'failed');
    });

    it('does not collect a still-running session', async () => {
      const { clerk, spider, stacks } = fix;
      await postWrit(clerk);
      await spider.crawl(); // spawn

      const book = rigsBook(stacks);
      const [rig] = await book.list();
      const fakeSessionId = generateId('ses', 4);

      const enginesWithSession = rig.engines.map((e: EngineInstance) => {
        if (e.id === 'draft') {
          return { ...e, status: 'completed' as const, yields: { draftId: 'x' } };
        }
        if (e.id === 'implement') {
          return { ...e, status: 'running' as const, sessionId: fakeSessionId };
        }
        return e;
      });
      await book.patch(rig.id, { engines: enginesWithSession });

      // Session is still running
      const sessBook = stacks.book<{
        id: string; status: string; startedAt: string; provider: string; [key: string]: unknown;
      }>('animator', 'sessions');
      await sessBook.put({
        id: fakeSessionId,
        status: 'running',
        startedAt: new Date().toISOString(),
        provider: 'test',
      });

      // Nothing to collect, implement is running (no pending with completed upstream),
      // spawn skips (rig exists) → null
      const result = await spider.crawl();
      assert.equal(result, null);
    });
  });

  // ── Failure propagation ────────────────────────────────────────────

  describe('failure propagation', () => {
    it('engine failure → rig failed → writ transitions to failed via CDC', async () => {
      const { clerk, spider, stacks } = fix;
      const writ = await postWrit(clerk);

      await spider.crawl(); // spawn (writ → active)
      const activeWrit = await clerk.show(writ.id);
      assert.equal(activeWrit.status, 'active');

      // Inject bad design to trigger failure
      const book = rigsBook(stacks);
      const [rig] = await book.list();
      const brokenEngines = rig.engines.map((e: EngineInstance) =>
        e.id === 'draft' ? { ...e, designId: 'broken' } : e,
      );
      await book.patch(rig.id, { engines: brokenEngines });

      // Walk: engine fails → rig fails → CDC → writ fails
      await spider.crawl();

      const [updatedRig] = await book.list();
      assert.equal(updatedRig.status, 'failed');

      const failedWrit = await clerk.show(writ.id);
      assert.equal(failedWrit.status, 'failed');
    });
  });

  // ── Givens/context assembly ────────────────────────────────────────

  describe('givens and context assembly', () => {
    it('each engine receives only the givens it needs', async () => {
      const { clerk, spider, stacks } = fix;
      const writ = await postWrit(clerk, 'My writ');
      await spider.crawl(); // spawn

      const [rig] = await rigsBook(stacks).list();
      const eng = (id: string) => rig.engines.find((e: EngineInstance) => e.id === id)!;

      // draft: { writ } — no role
      assert.ok('writ' in eng('draft').givensSpec, 'draft should have writ');
      assert.ok(!('role' in eng('draft').givensSpec), 'draft should not have role');
      assert.equal((eng('draft').givensSpec.writ as WritDoc).id, writ.id);

      // implement: { writ, role }
      assert.ok('writ' in eng('implement').givensSpec, 'implement should have writ');
      assert.ok('role' in eng('implement').givensSpec, 'implement should have role');
      assert.equal((eng('implement').givensSpec.writ as WritDoc).id, writ.id);

      // review: { writ, role: 'reviewer' }
      assert.ok('writ' in eng('review').givensSpec, 'review should have writ');
      assert.equal(eng('review').givensSpec.role, 'reviewer', 'review role should be hardcoded reviewer');

      // revise: { writ, role }
      assert.ok('writ' in eng('revise').givensSpec, 'revise should have writ');
      assert.ok('role' in eng('revise').givensSpec, 'revise should have role');

      // seal: {}
      assert.deepEqual(eng('seal').givensSpec, {}, 'seal should get empty givensSpec');
    });

    it('role defaults to "artificer" when not configured', async () => {
      const { clerk, spider, stacks } = fix;
      await postWrit(clerk);
      await spider.crawl(); // spawn

      const [rig] = await rigsBook(stacks).list();
      const implementEngine = rig.engines.find((e: EngineInstance) => e.id === 'implement');
      assert.equal(implementEngine?.givensSpec.role, 'artificer');
    });

    it('upstream map is built from completed engine yields', async () => {
      const { clerk, spider, stacks } = fix;
      await postWrit(clerk);
      await spider.crawl(); // spawn

      const book = rigsBook(stacks);
      const [rig] = await book.list();

      // Mark draft + implement as completed
      const draftYields = { draftId: 'd1', codexName: 'c', branch: 'b', path: '/p', baseSha: 'sha1' };
      const implYields = { sessionId: 'stub', sessionStatus: 'completed' };
      const updatedEngines = rig.engines.map((e: EngineInstance) => {
        if (e.id === 'draft') return { ...e, status: 'completed' as const, yields: draftYields };
        if (e.id === 'implement') return { ...e, status: 'completed' as const, yields: implYields };
        return e;
      });
      await book.patch(rig.id, { engines: updatedEngines });

      // Walk: review launches a session (quick engine → 'engine-started')
      const result = await spider.crawl();
      assert.equal(result?.action, 'engine-started');
      assert.equal((result as { engineId: string }).engineId, 'review');

      // Walk: collect step picks up the completed review session
      const result2 = await spider.crawl();
      assert.equal(result2?.action, 'engine-completed');
      assert.equal((result2 as { engineId: string }).engineId, 'review');
    });
  });

  // ── Draft engine — baseSha population ──────────────────────────────

  describe('draft engine — baseSha', () => {
    it('includes baseSha in DraftYields when draft is completed', async () => {
      // The draft engine calls execSync('git rev-parse HEAD') which we can't
      // run in test (no real Scriptorium). Verify that baseSha flows through
      // the rig correctly when pre-completed with yields.
      const { clerk, spider, stacks } = fix;
      await postWrit(clerk);
      await spider.crawl(); // spawn

      const book = rigsBook(stacks);
      const [rig] = await book.list();
      const draftYields = { draftId: 'd1', codexName: 'c', branch: 'b', path: '/p', baseSha: 'abc123def' };
      await book.patch(rig.id, {
        engines: rig.engines.map((e: EngineInstance) =>
          e.id === 'draft' ? { ...e, status: 'completed' as const, yields: draftYields } : e,
        ),
      });

      // Verify baseSha is present in the stored yields
      const [updated] = await book.list();
      const draft = updated.engines.find((e: EngineInstance) => e.id === 'draft');
      assert.equal(draft?.status, 'completed');
      const yields = draft?.yields as Record<string, unknown>;
      assert.equal(yields.baseSha, 'abc123def', 'baseSha should be populated in DraftYields');
    });
  });

  // ── Full pipeline ─────────────────────────────────────────────────

  describe('full pipeline', () => {
    it('walks through implement → review → revise → rig completion → writ completed', async () => {
      const { clerk, spider, stacks } = fix;
      const writ = await postWrit(clerk, 'Full pipeline test');

      await spider.crawl(); // spawn (writ → active)

      const book = rigsBook(stacks);
      const [rig0] = await book.list();

      // Pre-complete draft (real impl would need codexes)
      const draftYields = { draftId: 'd1', codexName: 'c', branch: 'b', path: '/p', baseSha: 'sha1' };
      await book.patch(rig0.id, {
        engines: rig0.engines.map((e: EngineInstance) =>
          e.id === 'draft' ? { ...e, status: 'completed' as const, yields: draftYields } : e,
        ),
      });

      // Walk: implement launches an Animator session (quick engine)
      const r1 = await spider.crawl();
      assert.equal(r1?.action, 'engine-started');
      assert.equal((r1 as { engineId: string }).engineId, 'implement');

      // Walk: collect step picks up the completed implement session
      const r1c = await spider.crawl();
      assert.equal(r1c?.action, 'engine-completed');
      assert.equal((r1c as { engineId: string }).engineId, 'implement');

      // Walk: review launches a session (quick engine)
      const r2 = await spider.crawl();
      assert.equal(r2?.action, 'engine-started');
      assert.equal((r2 as { engineId: string }).engineId, 'review');

      // Walk: collect review session
      const r2c = await spider.crawl();
      assert.equal(r2c?.action, 'engine-completed');
      assert.equal((r2c as { engineId: string }).engineId, 'review');

      // Walk: revise launches a session (quick engine)
      const r3 = await spider.crawl();
      assert.equal(r3?.action, 'engine-started');
      assert.equal((r3 as { engineId: string }).engineId, 'revise');

      // Walk: collect revise session
      const r3c = await spider.crawl();
      assert.equal(r3c?.action, 'engine-completed');
      assert.equal((r3c as { engineId: string }).engineId, 'revise');

      // Pre-complete seal (real impl would need codexes)
      const [rig3] = await book.list();
      const sealYields = { sealedCommit: 'abc123', strategy: 'fast-forward', retries: 0, inscriptionsSealed: 5 };
      await book.patch(rig3.id, {
        engines: rig3.engines.map((e: EngineInstance) =>
          e.id === 'seal' ? { ...e, status: 'completed' as const, yields: sealYields } : e,
        ),
        status: 'completed',
      });

      // CDC should have fired — writ should now be completed
      const finalWrit = await clerk.show(writ.id);
      assert.equal(finalWrit.status, 'completed');

      const [finalRig] = await book.list();
      assert.equal(finalRig.status, 'completed');
    });

    it('walks all 5 engines to rig completion without manual seal patching', async () => {
      const { clerk, spider, stacks, fire } = fix;

      // Register a stub seal engine that doesn't require Scriptorium
      const stubSealEngine: EngineDesign = {
        id: 'seal',
        async run() {
          return {
            status: 'completed' as const,
            yields: { sealedCommit: 'abc', strategy: 'fast-forward' as const, retries: 0, inscriptionsSealed: 1 },
          };
        },
      };
      const fakePlugin: LoadedApparatus = {
        packageName: '@test/stub-seal',
        id: 'test-seal',
        version: '0.0.0',
        apparatus: {
          requires: [],
          supportKit: { engines: { seal: stubSealEngine } },
          provides: {},
          start() {},
        },
      };
      void fire('plugin:initialized', fakePlugin);

      const writ = await postWrit(clerk, 'Full pipeline stub seal');
      await spider.crawl(); // spawn (writ → active)

      const book = rigsBook(stacks);
      const [rig0] = await book.list();

      // Pre-complete draft (requires Scriptorium — not available in tests)
      const draftYields = { draftId: 'd1', codexName: 'c', branch: 'b', path: '/p', baseSha: 'sha1' };
      await book.patch(rig0.id, {
        engines: rig0.engines.map((e: EngineInstance) =>
          e.id === 'draft' ? { ...e, status: 'completed' as const, yields: draftYields } : e,
        ),
      });

      // implement launches
      const r1 = await spider.crawl();
      assert.equal(r1?.action, 'engine-started');
      assert.equal((r1 as { engineId: string }).engineId, 'implement');

      // collect implement
      const r1c = await spider.crawl();
      assert.equal(r1c?.action, 'engine-completed');
      assert.equal((r1c as { engineId: string }).engineId, 'implement');

      // review launches (quick engine)
      const r2 = await spider.crawl();
      assert.equal(r2?.action, 'engine-started');
      assert.equal((r2 as { engineId: string }).engineId, 'review');

      // collect review
      const r2c = await spider.crawl();
      assert.equal(r2c?.action, 'engine-completed');
      assert.equal((r2c as { engineId: string }).engineId, 'review');

      // revise launches (quick engine)
      const r3 = await spider.crawl();
      assert.equal(r3?.action, 'engine-started');
      assert.equal((r3 as { engineId: string }).engineId, 'revise');

      // collect revise
      const r3c = await spider.crawl();
      assert.equal(r3c?.action, 'engine-completed');
      assert.equal((r3c as { engineId: string }).engineId, 'revise');

      // seal runs (stub) — last engine → rig completes
      const r4 = await spider.crawl();
      assert.equal(r4?.action, 'rig-completed');
      assert.equal((r4 as { outcome: string }).outcome, 'completed');

      // CDC should have fired — writ should now be completed
      const finalWrit = await clerk.show(writ.id);
      assert.equal(finalWrit.status, 'completed', 'writ should transition to completed via CDC');

      const [finalRig] = await book.list();
      assert.equal(finalRig.status, 'completed');
    });
  });

  // ── Review engine — Animator integration ─────────────────────────

  describe('review engine — Animator integration', () => {
    it('calls animator.summon() with reviewer role, draft cwd, and prompt containing spec', async () => {
      const { clerk, spider, stacks, summonCalls } = fix;
      const writ = await postWrit(clerk, 'Review integration test');
      await spider.crawl(); // spawn

      const book = rigsBook(stacks);
      const [rig] = await book.list();
      const draftYields = { draftId: 'd1', codexName: 'c', branch: 'b', path: '/p', baseSha: 'sha1' };
      await book.patch(rig.id, {
        engines: rig.engines.map((e: EngineInstance) => {
          if (e.id === 'draft') return { ...e, status: 'completed' as const, yields: draftYields };
          if (e.id === 'implement') return { ...e, status: 'completed' as const, yields: { sessionId: 's1', sessionStatus: 'completed' } };
          return e;
        }),
      });

      const result = await spider.crawl(); // launch review
      assert.equal(result?.action, 'engine-started');
      assert.equal((result as { engineId: string }).engineId, 'review');

      assert.equal(summonCalls.length, 1, 'summon should be called once for review');
      const call = summonCalls[0];
      assert.equal(call.role, 'reviewer', 'review engine uses reviewer role');
      assert.equal(call.cwd, '/p', 'cwd is the draft worktree path');
      assert.ok(call.prompt.includes('# Code Review'), 'prompt includes review header');
      assert.ok(call.prompt.includes(writ.body), 'prompt includes writ body (spec)');
      assert.ok(call.prompt.includes('## Instructions'), 'prompt includes instructions section');
      assert.ok(call.prompt.includes('### Overall: PASS or FAIL'), 'prompt includes findings format');
      assert.deepEqual(call.metadata?.mechanicalChecks, [], 'no mechanical checks when not configured');
    });

    it('collects ReviewYields: parses PASS from session.output', async () => {
      const { clerk, spider, stacks } = fix;
      await postWrit(clerk);
      await spider.crawl(); // spawn

      const book = rigsBook(stacks);
      const [rig] = await book.list();
      const fakeSessionId = generateId('ses', 4);
      const findings = '### Overall: PASS\n\n### Completeness\nAll requirements met.';
      await book.patch(rig.id, {
        engines: rig.engines.map((e: EngineInstance) => {
          if (e.id === 'draft') return { ...e, status: 'completed' as const, yields: { draftId: 'd1', codexName: 'c', branch: 'b', path: '/p', baseSha: 'sha1' } };
          if (e.id === 'implement') return { ...e, status: 'completed' as const, yields: { sessionId: 's1', sessionStatus: 'completed' } };
          if (e.id === 'review') return { ...e, status: 'running' as const, sessionId: fakeSessionId };
          return e;
        }),
      });

      const sessBook = stacks.book<SessionDoc>('animator', 'sessions');
      await sessBook.put({
        id: fakeSessionId,
        status: 'completed',
        startedAt: new Date().toISOString(),
        provider: 'test',
        output: findings,
        metadata: { mechanicalChecks: [] },
      });

      const result = await spider.crawl(); // collect review
      assert.equal(result?.action, 'engine-completed');
      assert.equal((result as { engineId: string }).engineId, 'review');

      const [updated] = await book.list();
      const reviewEngine = updated.engines.find((e: EngineInstance) => e.id === 'review');
      const yields = reviewEngine?.yields as ReviewYields;
      assert.equal(yields.sessionId, fakeSessionId);
      assert.equal(yields.passed, true, 'passed should be true when output contains PASS');
      assert.equal(yields.findings, findings);
      assert.deepEqual(yields.mechanicalChecks, []);
    });

    it('collects ReviewYields: passed is false when output contains FAIL', async () => {
      const { clerk, spider, stacks } = fix;
      await postWrit(clerk);
      await spider.crawl(); // spawn

      const book = rigsBook(stacks);
      const [rig] = await book.list();
      const fakeSessionId = generateId('ses', 4);
      await book.patch(rig.id, {
        engines: rig.engines.map((e: EngineInstance) => {
          if (e.id === 'draft') return { ...e, status: 'completed' as const, yields: { draftId: 'd1', codexName: 'c', branch: 'b', path: '/p', baseSha: 'sha1' } };
          if (e.id === 'implement') return { ...e, status: 'completed' as const, yields: { sessionId: 's1', sessionStatus: 'completed' } };
          if (e.id === 'review') return { ...e, status: 'running' as const, sessionId: fakeSessionId };
          return e;
        }),
      });

      const sessBook = stacks.book<SessionDoc>('animator', 'sessions');
      await sessBook.put({
        id: fakeSessionId,
        status: 'completed',
        startedAt: new Date().toISOString(),
        provider: 'test',
        output: '### Overall: FAIL\n\n### Required Changes\n1. Fix the bug.',
        metadata: { mechanicalChecks: [] },
      });

      await spider.crawl(); // collect review
      const [updated] = await book.list();
      const reviewEngine = updated.engines.find((e: EngineInstance) => e.id === 'review');
      const yields = reviewEngine?.yields as ReviewYields;
      assert.equal(yields.passed, false, 'passed should be false when output contains FAIL');
    });

    it('collects ReviewYields: mechanicalChecks retrieved from session.metadata', async () => {
      const { clerk, spider, stacks } = fix;
      await postWrit(clerk);
      await spider.crawl(); // spawn

      const book = rigsBook(stacks);
      const [rig] = await book.list();
      const fakeSessionId = generateId('ses', 4);
      const checks: MechanicalCheck[] = [
        { name: 'build', passed: true, output: 'Build succeeded', durationMs: 1200 },
        { name: 'test', passed: false, output: '3 tests failed', durationMs: 4500 },
      ];
      await book.patch(rig.id, {
        engines: rig.engines.map((e: EngineInstance) => {
          if (e.id === 'draft') return { ...e, status: 'completed' as const, yields: { draftId: 'd1', codexName: 'c', branch: 'b', path: '/p', baseSha: 'sha1' } };
          if (e.id === 'implement') return { ...e, status: 'completed' as const, yields: { sessionId: 's1', sessionStatus: 'completed' } };
          if (e.id === 'review') return { ...e, status: 'running' as const, sessionId: fakeSessionId };
          return e;
        }),
      });

      const sessBook = stacks.book<SessionDoc>('animator', 'sessions');
      await sessBook.put({
        id: fakeSessionId,
        status: 'completed',
        startedAt: new Date().toISOString(),
        provider: 'test',
        output: '### Overall: FAIL',
        metadata: { mechanicalChecks: checks },
      });

      await spider.crawl(); // collect review
      const [updated] = await book.list();
      const reviewEngine = updated.engines.find((e: EngineInstance) => e.id === 'review');
      const yields = reviewEngine?.yields as ReviewYields;
      assert.equal(yields.mechanicalChecks.length, 2);
      assert.equal(yields.mechanicalChecks[0].name, 'build');
      assert.equal(yields.mechanicalChecks[0].passed, true);
      assert.equal(yields.mechanicalChecks[1].name, 'test');
      assert.equal(yields.mechanicalChecks[1].passed, false);
    });
  });

  // ── Review engine — mechanical checks ────────────────────────────

  describe('review engine — mechanical checks', () => {
    let mechFix: ReturnType<typeof buildFixture>;

    beforeEach(() => {
      mechFix = buildFixture({
        spider: {
          buildCommand: 'echo "build output"',
          testCommand: 'exit 1',
        },
      });
    });

    afterEach(() => {
      clearGuild();
    });

    it('executes build and test commands; captures pass/fail from exit code', async () => {
      const { clerk, spider, stacks, summonCalls } = mechFix;
      await postWrit(clerk);
      await spider.crawl(); // spawn

      const book = rigsBook(stacks);
      const [rig] = await book.list();
      await book.patch(rig.id, {
        engines: rig.engines.map((e: EngineInstance) => {
          if (e.id === 'draft') return { ...e, status: 'completed' as const, yields: { draftId: 'd1', codexName: 'c', branch: 'b', path: '/tmp', baseSha: 'sha1' } };
          if (e.id === 'implement') return { ...e, status: 'completed' as const, yields: { sessionId: 's1', sessionStatus: 'completed' } };
          return e;
        }),
      });

      const result = await spider.crawl(); // launch review (runs checks first)
      assert.equal(result?.action, 'engine-started');

      assert.equal(summonCalls.length, 1);
      const checks = summonCalls[0].metadata?.mechanicalChecks as MechanicalCheck[];
      assert.equal(checks.length, 2, 'both build and test checks should run');

      const buildCheck = checks.find((c) => c.name === 'build');
      assert.ok(buildCheck, 'build check should be present');
      assert.equal(buildCheck!.passed, true, 'echo exits 0 → passed');
      assert.ok(buildCheck!.output.includes('build output'), 'output captured from stdout');
      assert.ok(typeof buildCheck!.durationMs === 'number', 'durationMs recorded');

      const testCheck = checks.find((c) => c.name === 'test');
      assert.ok(testCheck, 'test check should be present');
      assert.equal(testCheck!.passed, false, 'exit 1 → failed');
    });

    it('skips checks gracefully when no buildCommand or testCommand configured', async () => {
      const noCmdFix = buildFixture({ spider: {} }); // no buildCommand/testCommand
      const { clerk, spider: w, stacks: s, summonCalls: sc } = noCmdFix;
      await postWrit(clerk);
      await w.crawl(); // spawn

      const book = rigsBook(s);
      const [rig] = await book.list();
      await book.patch(rig.id, {
        engines: rig.engines.map((e: EngineInstance) => {
          if (e.id === 'draft') return { ...e, status: 'completed' as const, yields: { draftId: 'd1', codexName: 'c', branch: 'b', path: '/p', baseSha: 'sha1' } };
          if (e.id === 'implement') return { ...e, status: 'completed' as const, yields: { sessionId: 's1', sessionStatus: 'completed' } };
          return e;
        }),
      });

      await w.crawl(); // launch review
      assert.deepEqual(sc[0].metadata?.mechanicalChecks, [], 'no checks when commands not configured');
      clearGuild();
    });

    it('truncates check output to 4KB', async () => {
      const bigFix = buildFixture({
        spider: { buildCommand: 'python3 -c "print(\'x\' * 8192)"' },
      });
      const { clerk, spider: w, stacks: s, summonCalls: sc } = bigFix;
      await postWrit(clerk);
      await w.crawl(); // spawn

      const book = rigsBook(s);
      const [rig] = await book.list();
      await book.patch(rig.id, {
        engines: rig.engines.map((e: EngineInstance) => {
          if (e.id === 'draft') return { ...e, status: 'completed' as const, yields: { draftId: 'd1', codexName: 'c', branch: 'b', path: '/tmp', baseSha: 'sha1' } };
          if (e.id === 'implement') return { ...e, status: 'completed' as const, yields: { sessionId: 's1', sessionStatus: 'completed' } };
          return e;
        }),
      });

      await w.crawl(); // launch review (runs check with big output)
      const checks = sc[0].metadata?.mechanicalChecks as MechanicalCheck[];
      assert.ok(checks[0].output.length <= 4096, `output should be truncated to 4KB, got ${checks[0].output.length} chars`);
      clearGuild();
    });
  });

  // ── Revise engine — Animator integration ─────────────────────────

  describe('revise engine — Animator integration', () => {
    it('calls animator.summon() with role from givens, draft cwd, and writ env', async () => {
      const { clerk, spider, stacks, summonCalls } = fix;
      const writ = await postWrit(clerk, 'Revise integration test');
      await spider.crawl(); // spawn

      const book = rigsBook(stacks);
      const [rig] = await book.list();
      const reviewYields: ReviewYields = { sessionId: 'rev-1', passed: true, findings: '### Overall: PASS\nAll good.', mechanicalChecks: [] };
      await book.patch(rig.id, {
        engines: rig.engines.map((e: EngineInstance) => {
          if (e.id === 'draft') return { ...e, status: 'completed' as const, yields: { draftId: 'd1', codexName: 'c', branch: 'b', path: '/p', baseSha: 'sha1' } };
          if (e.id === 'implement') return { ...e, status: 'completed' as const, yields: { sessionId: 's1', sessionStatus: 'completed' } };
          if (e.id === 'review') return { ...e, status: 'completed' as const, yields: reviewYields };
          return e;
        }),
      });

      const result = await spider.crawl(); // launch revise
      assert.equal(result?.action, 'engine-started');
      assert.equal((result as { engineId: string }).engineId, 'revise');

      assert.equal(summonCalls.length, 1, 'summon called once for revise');
      const call = summonCalls[0];
      assert.equal(call.role, 'artificer', 'revise uses role from givens (default artificer)');
      assert.equal(call.cwd, '/p', 'cwd is draft worktree path');
      assert.deepEqual(call.environment, { GIT_AUTHOR_EMAIL: `${writ.id}@nexus.local` });
    });

    it('revision prompt includes pass branch when review passed', async () => {
      const { clerk, spider, stacks, summonCalls } = fix;
      await postWrit(clerk, 'Pass branch test');
      await spider.crawl(); // spawn

      const book = rigsBook(stacks);
      const [rig] = await book.list();
      const reviewYields: ReviewYields = {
        sessionId: 'rev-1',
        passed: true,
        findings: '### Overall: PASS\nAll requirements met.',
        mechanicalChecks: [],
      };
      await book.patch(rig.id, {
        engines: rig.engines.map((e: EngineInstance) => {
          if (e.id === 'draft') return { ...e, status: 'completed' as const, yields: { draftId: 'd1', codexName: 'c', branch: 'b', path: '/p', baseSha: 'sha1' } };
          if (e.id === 'implement') return { ...e, status: 'completed' as const, yields: { sessionId: 's1', sessionStatus: 'completed' } };
          if (e.id === 'review') return { ...e, status: 'completed' as const, yields: reviewYields };
          return e;
        }),
      });

      await spider.crawl(); // launch revise
      const prompt = summonCalls[0].prompt;
      assert.ok(prompt.includes('## Review Result: PASS'), 'prompt includes PASS result');
      assert.ok(prompt.includes('The review passed'), 'prompt includes pass branch instruction');
      assert.ok(prompt.includes(reviewYields.findings), 'prompt includes review findings');
    });

    it('revision prompt includes fail branch when review failed', async () => {
      const { clerk, spider, stacks, summonCalls } = fix;
      await postWrit(clerk, 'Fail branch test');
      await spider.crawl(); // spawn

      const book = rigsBook(stacks);
      const [rig] = await book.list();
      const reviewYields: ReviewYields = {
        sessionId: 'rev-1',
        passed: false,
        findings: '### Overall: FAIL\n\n### Required Changes\n1. Fix the bug.',
        mechanicalChecks: [],
      };
      await book.patch(rig.id, {
        engines: rig.engines.map((e: EngineInstance) => {
          if (e.id === 'draft') return { ...e, status: 'completed' as const, yields: { draftId: 'd1', codexName: 'c', branch: 'b', path: '/p', baseSha: 'sha1' } };
          if (e.id === 'implement') return { ...e, status: 'completed' as const, yields: { sessionId: 's1', sessionStatus: 'completed' } };
          if (e.id === 'review') return { ...e, status: 'completed' as const, yields: reviewYields };
          return e;
        }),
      });

      await spider.crawl(); // launch revise
      const prompt = summonCalls[0].prompt;
      assert.ok(prompt.includes('## Review Result: FAIL'), 'prompt includes FAIL result');
      assert.ok(
        prompt.includes('The review identified issues that need to be addressed'),
        'prompt includes fail branch instruction',
      );
      assert.ok(prompt.includes(reviewYields.findings), 'prompt includes review findings');
    });

    it('ReviseYields: sessionId and sessionStatus collected from session record', async () => {
      const { clerk, spider, stacks } = fix;
      await postWrit(clerk);
      await spider.crawl(); // spawn

      const book = rigsBook(stacks);
      const [rig] = await book.list();
      const fakeSessionId = generateId('ses', 4);
      const reviewYields: ReviewYields = { sessionId: 'rev-1', passed: true, findings: '### Overall: PASS', mechanicalChecks: [] };
      await book.patch(rig.id, {
        engines: rig.engines.map((e: EngineInstance) => {
          if (e.id === 'draft') return { ...e, status: 'completed' as const, yields: { draftId: 'd1', codexName: 'c', branch: 'b', path: '/p', baseSha: 'sha1' } };
          if (e.id === 'implement') return { ...e, status: 'completed' as const, yields: { sessionId: 's1', sessionStatus: 'completed' } };
          if (e.id === 'review') return { ...e, status: 'completed' as const, yields: reviewYields };
          if (e.id === 'revise') return { ...e, status: 'running' as const, sessionId: fakeSessionId };
          return e;
        }),
      });

      const sessBook = stacks.book<SessionDoc>('animator', 'sessions');
      await sessBook.put({
        id: fakeSessionId,
        status: 'completed',
        startedAt: new Date().toISOString(),
        provider: 'test',
      });

      const result = await spider.crawl(); // collect revise
      assert.equal(result?.action, 'engine-completed');
      assert.equal((result as { engineId: string }).engineId, 'revise');

      const [updated] = await book.list();
      const reviseEngine = updated.engines.find((e: EngineInstance) => e.id === 'revise');
      const yields = reviseEngine?.yields as { sessionId: string; sessionStatus: string };
      assert.equal(yields.sessionId, fakeSessionId);
      assert.equal(yields.sessionStatus, 'completed');
    });
  });

  // ── show / list / forWrit ─────────────────────────────────────────

  describe('show()', () => {
    it('returns the full RigDoc for a valid rig id', async () => {
      const { clerk, spider } = fix;
      const writ = await postWrit(clerk);
      await spider.crawl(); // spawn

      const rigs = await spider.list();
      assert.equal(rigs.length, 1);
      const rigId = rigs[0].id;

      const rig = await spider.show(rigId);
      assert.equal(rig.id, rigId);
      assert.equal(rig.writId, writ.id);
      assert.equal(rig.status, 'running');
      assert.equal(rig.engines.length, 5);
      assert.equal(typeof rig.createdAt, 'string');
    });

    it('throws with "not found" message for an unknown rig id', async () => {
      const { spider } = fix;
      await assert.rejects(
        () => spider.show('rig-nonexistent'),
        (err: unknown) => {
          assert.ok(err instanceof Error);
          assert.equal(err.message, 'Rig "rig-nonexistent" not found.');
          return true;
        },
      );
    });
  });

  describe('list()', () => {
    it('returns empty array when no rigs exist', async () => {
      const { spider } = fix;
      const rigs = await spider.list();
      assert.deepEqual(rigs, []);
    });

    it('returns rigs ordered by createdAt descending', async () => {
      const { stacks, spider } = fix;
      const book = rigsBook(stacks);
      const older = new Date(Date.now() - 100).toISOString();
      const newer = new Date().toISOString();
      await book.put({ id: 'rig-old', writId: 'w-1', status: 'running', engines: [], createdAt: older });
      await book.put({ id: 'rig-new', writId: 'w-2', status: 'running', engines: [], createdAt: newer });

      const rigs = await spider.list();
      assert.equal(rigs.length, 2);
      // Newest first
      assert.ok(rigs[0].createdAt >= rigs[1].createdAt);
    });

    it('filters by status', async () => {
      const { clerk, spider } = fix;
      await postWrit(clerk);
      await spider.crawl(); // spawn (status: running)

      const running = await spider.list({ status: 'running' });
      assert.equal(running.length, 1);
      assert.equal(running[0].status, 'running');

      const completed = await spider.list({ status: 'completed' });
      assert.equal(completed.length, 0);
    });

    it('respects limit', async () => {
      const { stacks, spider } = fix;
      const book = rigsBook(stacks);
      for (let i = 0; i < 3; i++) {
        await book.put({ id: `rig-limit-${i}`, writId: `w-${i}`, status: 'running', engines: [], createdAt: new Date().toISOString() });
      }

      const limited = await spider.list({ limit: 2 });
      assert.equal(limited.length, 2);
    });

    it('respects offset', async () => {
      const { stacks, spider } = fix;
      const book = rigsBook(stacks);
      for (let i = 0; i < 3; i++) {
        await book.put({ id: `rig-offset-${i}`, writId: `w-${i}`, status: 'running', engines: [], createdAt: new Date().toISOString() });
      }

      const all = await spider.list();
      assert.equal(all.length, 3);

      const page = await spider.list({ limit: 2, offset: 2 });
      assert.equal(page.length, 1);
    });
  });

  describe('forWrit()', () => {
    it('returns the rig for a writ that has been spawned', async () => {
      const { clerk, spider } = fix;
      const writ = await postWrit(clerk);
      await spider.crawl(); // spawn

      const rig = await spider.forWrit(writ.id);
      assert.ok(rig !== null);
      assert.equal(rig.writId, writ.id);
    });

    it('returns null when no rig exists for a writ', async () => {
      const { clerk, spider } = fix;
      const writ = await postWrit(clerk);
      // Do not crawl — no rig spawned yet

      const rig = await spider.forWrit(writ.id);
      assert.equal(rig, null);
    });

    it('returns null for a non-existent writ id', async () => {
      const { spider } = fix;
      const rig = await spider.forWrit('w-nonexistent');
      assert.equal(rig, null);
    });
  });

  describe('createdAt', () => {
    it('is set to a valid ISO timestamp when a rig is spawned', async () => {
      const { clerk, spider } = fix;
      const before = new Date().toISOString();
      await postWrit(clerk);
      await spider.crawl(); // spawn
      const after = new Date().toISOString();

      const rigs = await spider.list();
      assert.equal(rigs.length, 1);
      const { createdAt } = rigs[0];
      assert.equal(typeof createdAt, 'string');
      assert.ok(!isNaN(new Date(createdAt).getTime()), 'createdAt must be a valid date');
      assert.ok(createdAt >= before, 'createdAt must not be before spawn');
      assert.ok(createdAt <= after, 'createdAt must not be after spawn');
    });
  });

  // ── Walk returns null ──────────────────────────────────────────────

  describe('walk() returns null', () => {
    it('returns null when no rigs exist and no ready writs', async () => {
      const result = await fix.spider.crawl();
      assert.equal(result, null);
    });

    it('returns null when the rig has a running engine with no terminal session', async () => {
      const { clerk, spider, stacks } = fix;
      await postWrit(clerk);
      await spider.crawl(); // spawn

      const book = rigsBook(stacks);
      const [rig] = await book.list();
      const fakeSessionId = generateId('ses', 4);

      // Put draft in 'running' with a live session
      await book.patch(rig.id, {
        engines: rig.engines.map((e: EngineInstance) =>
          e.id === 'draft'
            ? { ...e, status: 'running' as const, sessionId: fakeSessionId }
            : e,
        ),
      });

      const sessBook = stacks.book<{
        id: string; status: string; startedAt: string; provider: string; [key: string]: unknown;
      }>('animator', 'sessions');
      await sessBook.put({
        id: fakeSessionId,
        status: 'running',
        startedAt: new Date().toISOString(),
        provider: 'test',
      });

      const result = await spider.crawl();
      assert.equal(result, null);
    });
  });
});

=== CONTEXT FILE: packages/plugins/spider/src/types.ts ===
/**
 * The Spider — public types.
 *
 * Rig and engine data model, CrawlResult, SpiderApi, and configuration.
 * Engine yield shapes (DraftYields, SealYields) live here too so downstream
 * packages can import them without depending on the engine implementation files.
 */

// ── Engine instance status ────────────────────────────────────────────

export type EngineStatus = 'pending' | 'running' | 'completed' | 'failed';

// ── Engine instance ───────────────────────────────────────────────────

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
}

// ── Rig ──────────────────────────────────────────────────────────────

export type RigStatus = 'running' | 'completed' | 'failed';

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
}

// ── Rig filters ───────────────────────────────────────────────────────

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

// ── CrawlResult ────────────────────────────────────────────────────────

/**
 * The result of a single crawl() call.
 *
 * Four variants, ordered by priority:
 * - 'engine-completed' — an engine finished (collected or ran inline); rig still running
 * - 'engine-started'   — launched a quick engine's session
 * - 'rig-spawned'      — created a new rig for a ready writ
 * - 'rig-completed'    — the crawl step caused a rig to reach a terminal state
 *
 * null means no work was available.
 */
export type CrawlResult =
  | { action: 'engine-completed'; rigId: string; engineId: string }
  | { action: 'engine-started'; rigId: string; engineId: string }
  | { action: 'rig-spawned'; rigId: string; writId: string }
  | { action: 'rig-completed'; rigId: string; writId: string; outcome: 'completed' | 'failed' };

// ── SpiderApi ─────────────────────────────────────────────────────────

/**
 * The Spider's public API — retrieved via guild().apparatus<SpiderApi>('spider').
 */
export interface SpiderApi {
  /**
   * Execute one step of the crawl loop.
   *
   * Priority ordering: collect > run > spawn.
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
}

// ── Configuration ─────────────────────────────────────────────────────

/**
 * Spider apparatus configuration — lives under the `spider` key in guild.json.
 */
export interface SpiderConfig {
  /**
   * Role to summon for quick engine sessions.
   * Default: 'artificer'.
   */
  role?: string;
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
}

// ── Engine yield shapes ───────────────────────────────────────────────

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

// Augment GuildConfig so `guild().guildConfig().spider` is typed.
declare module '@shardworks/nexus-core' {
  interface GuildConfig {
    spider?: SpiderConfig;
  }
}

=== CONTEXT FILE: packages/plugins/spider/src/index.ts ===
/**
 * @shardworks/spider-apparatus — The Spider.
 *
 * Rig execution engine: spawns rigs for ready writs, drives engine pipelines
 * to completion, and transitions writs via the Clerk on rig completion/failure.
 *
 * Public types (RigDoc, EngineInstance, CrawlResult, SpiderApi, etc.) are
 * re-exported for consumers that inspect walk results or rig state.
 */

import { createSpider } from './spider.ts';

// ── Public types ──────────────────────────────────────────────────────

export type {
  EngineStatus,
  EngineInstance,
  RigStatus,
  RigDoc,
  RigFilters,
  CrawlResult,
  SpiderApi,
  SpiderConfig,
  DraftYields,
  SealYields,
} from './types.ts';

// ── Default export: the apparatus plugin ──────────────────────────────

export default createSpider();

=== CONTEXT FILE: packages/plugins/spider/src/tools/rig-list.ts ===
/**
 * rig-list tool — list rigs with optional filters.
 */

import { z } from 'zod';
import { guild } from '@shardworks/nexus-core';
import { tool } from '@shardworks/tools-apparatus';
import type { SpiderApi, RigStatus } from '../types.ts';

export default tool({
  name: 'rig-list',
  description: 'List rigs with optional filters',
  instructions:
    'Returns rigs ordered by createdAt descending (newest first). ' +
    'Optionally filter by status and control pagination with limit and offset.',
  params: {
    status: z
      .enum(['running', 'completed', 'failed'])
      .optional()
      .describe('Filter by rig status.'),
    limit: z
      .number()
      .optional()
      .describe('Maximum number of results (default: 20).'),
    offset: z
      .number()
      .optional()
      .describe('Number of results to skip.'),
  },
  permission: 'read',
  handler: async (params) => {
    const spider = guild().apparatus<SpiderApi>('spider');
    return spider.list({
      status: params.status as RigStatus | undefined,
      limit: params.limit,
      offset: params.offset,
    });
  },
});

=== CONTEXT FILE: packages/plugins/spider/src/tools/rig-for-writ.ts ===
/**
 * rig-for-writ tool — find the rig for a given writ.
 */

import { z } from 'zod';
import { guild } from '@shardworks/nexus-core';
import { tool } from '@shardworks/tools-apparatus';
import type { SpiderApi } from '../types.ts';

export default tool({
  name: 'rig-for-writ',
  description: 'Find the rig for a given writ',
  instructions:
    'Returns the RigDoc for the given writ id, or null if no rig has been spawned yet.',
  params: {
    writId: z.string().describe('The writ id to look up.'),
  },
  permission: 'read',
  handler: async (params) => {
    const spider = guild().apparatus<SpiderApi>('spider');
    return spider.forWrit(params.writId);
  },
});

=== CONTEXT FILE: packages/plugins/spider/src/tools/rig-show.ts ===
/**
 * rig-show tool — retrieve a rig by id.
 */

import { z } from 'zod';
import { guild } from '@shardworks/nexus-core';
import { tool } from '@shardworks/tools-apparatus';
import type { SpiderApi } from '../types.ts';

export default tool({
  name: 'rig-show',
  description: 'Retrieve a rig by id',
  instructions: 'Returns the full RigDoc for the given rig id. Throws if the rig does not exist.',
  params: {
    id: z.string().describe('The rig id to look up.'),
  },
  permission: 'read',
  handler: async (params) => {
    const spider = guild().apparatus<SpiderApi>('spider');
    return spider.show(params.id);
  },
});



## Codebase Structure (surrounding directories)

```
=== TREE: docs/architecture/apparatus/ ===
_template.md
animator.md
claude-code.md
clerk.md
dispatch.md
fabricator.md
instrumentarium.md
loom.md
parlour.md
review-loop.md
scriptorium.md
spider.md
stacks.md

=== TREE: packages/plugins/spider/src/ ===
engines
index.ts
spider.test.ts
spider.ts
tools
types.ts

=== TREE: packages/plugins/spider/src/tools/ ===
crawl-continual.ts
crawl-one.ts
index.ts
rig-for-writ.ts
rig-list.ts
rig-show.ts


```

## Codebase API Surface (declarations available before this commission)

Scope: all 15 workspace projects
Lockfile is up to date, resolution step is skipped
Progress: resolved 1, reused 0, downloaded 0, added 0
Packages: +132
++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
Progress: resolved 132, reused 132, downloaded 0, added 132, done

devDependencies:
+ @tsconfig/node24 24.0.4
+ typescript 5.9.3

Done in 501ms using pnpm v10.32.1
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
import type { StartupContext, LoadedKit, LoadedApparatus } from '@shardworks/nexus-core';
export type EventHandlerMap = Map<string, Array<(...args: unknown[]) => void | Promise<void>>>;
/**
 * Validate all `requires` declarations and detect circular dependencies.
 * Throws with a descriptive error on the first problem found.
 *
 * Checks:
 * - Apparatus requires: every named dependency must exist (kit or apparatus).
 * - Kit requires: every named dependency must be an apparatus (kits can't
 *   depend on kits).
 * - Cycle detection: no circular dependency chains among apparatuses.
 */
export declare function validateRequires(kits: LoadedKit[], apparatuses: LoadedApparatus[]): void;
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
 * Tools are filtered to those with 'cli' in callableBy (or no callableBy
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
import type { LoadedKit, LoadedApparatus } from './plugin.ts';
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
export { type Kit, type Apparatus, type Plugin, type LoadedKit, type LoadedApparatus, type LoadedPlugin, type StartupContext, isKit, isApparatus, isLoadedKit, isLoadedApparatus, } from './plugin.ts';
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
 *
 * See: docs/architecture/apparatus/clerk.md
 */
import type { Plugin } from '@shardworks/nexus-core';
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
export { type ClerkApi, type ClerkConfig, type WritTypeEntry, type WritDoc, type WritStatus, type PostCommissionRequest, type WritFilters, } from './types.ts';
export { createClerk } from './clerk.ts';
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
=== packages/plugins/dispatch/dist/dispatch.d.ts ===
/**
 * The Dispatch — interim work runner.
 *
 * Bridges the Clerk (which tracks obligations) and the session machinery
 * (which runs animas). Finds the oldest ready writ and executes it:
 * opens a draft binding, composes context, launches a session, and handles
 * the aftermath (seal the draft, transition the writ).
 *
 * This apparatus is temporary rigging — designed to be retired when the
 * full rigging system (Spider, Fabricator, Executor) is implemented.
 *
 * See: docs/architecture/apparatus/dispatch.md
 */
import type { Plugin } from '@shardworks/nexus-core';
/**
 * Create the Dispatch apparatus plugin.
 *
 * Returns a Plugin with:
 * - `requires: ['clerk', 'codexes', 'animator']`
 * - `recommends: ['loom']` — used indirectly via Animator.summon()
 * - `provides: DispatchApi` — the dispatch API
 * - `supportKit` — contributes the `dispatch-next` tool
 */
export declare function createDispatch(): Plugin;
//# sourceMappingURL=dispatch.d.ts.map
=== packages/plugins/dispatch/dist/index.d.ts ===
/**
 * @shardworks/dispatch-apparatus — The Dispatch.
 *
 * Interim work runner: finds the oldest ready writ and executes it through
 * the guild's session machinery. Opens a draft binding on the target codex,
 * summons an anima via The Animator, and handles the aftermath (seal the
 * draft, transition the writ). Disposable — retired when the full rigging
 * system (Spider, Fabricator, Executor) is implemented.
 *
 * See: docs/architecture/apparatus/dispatch.md
 */
export { type DispatchApi, type DispatchRequest, type DispatchResult, } from './types.ts';
export { createDispatch } from './dispatch.ts';
declare const _default: import("@shardworks/nexus-core").Plugin;
export default _default;
//# sourceMappingURL=index.d.ts.map
=== packages/plugins/dispatch/dist/tools/dispatch-next.d.ts ===
/**
 * dispatch-next tool — find the oldest ready writ and dispatch it.
 *
 * The primary entry point for running guild work. Picks the oldest ready
 * writ (FIFO order), opens a draft on its codex (if any), summons an anima
 * to fulfill it, and transitions the writ to completed or failed based on
 * the session outcome.
 *
 * Usage:
 *   nsg dispatch-next
 *   nsg dispatch-next --role scribe
 *   nsg dispatch-next --dry-run
 *
 * See: docs/architecture/apparatus/dispatch.md
 */
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    role: z.ZodOptional<z.ZodString>;
    dryRun: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
}>;
export default _default;
//# sourceMappingURL=dispatch-next.d.ts.map
=== packages/plugins/dispatch/dist/tools/index.d.ts ===
/**
 * Dispatch tool re-exports.
 */
export { default as dispatchNext } from './dispatch-next.ts';
//# sourceMappingURL=index.d.ts.map
=== packages/plugins/dispatch/dist/types.d.ts ===
/**
 * The Dispatch — public types.
 *
 * These types form the contract between The Dispatch apparatus and all
 * callers (CLI, clockworks). No implementation details.
 *
 * See: docs/architecture/apparatus/dispatch.md
 */
export interface DispatchApi {
    /**
     * Find the oldest ready writ and execute it.
     *
     * The full dispatch lifecycle:
     *   1. Query the Clerk for the oldest ready writ
     *   2. Transition the writ to active
     *   3. Open a draft binding on the writ's codex (if specified)
     *   4. Summon an anima session with the writ context as prompt
     *   5. Wait for session completion
     *   6. On success: seal the draft, push, transition writ to completed
     *   7. On failure: abandon the draft, transition writ to failed
     *
     * Returns null if no ready writs exist.
     *
     * If the writ has no codex, steps 3/6/7 (draft lifecycle) are
     * skipped — the session runs in the guild home directory with
     * no codex binding.
     */
    next(request?: DispatchRequest): Promise<DispatchResult | null>;
}
export interface DispatchRequest {
    /** Role to summon. Default: 'artificer'. */
    role?: string;
    /** If true, find and report the writ but don't dispatch. */
    dryRun?: boolean;
}
export interface DispatchResult {
    /** The writ that was dispatched. */
    writId: string;
    /** The session id (from the Animator). Absent if dryRun. */
    sessionId?: string;
    /** Terminal writ status after dispatch. Absent if dryRun. */
    outcome?: 'completed' | 'failed';
    /** Resolution text set on the writ. Absent if dryRun. */
    resolution?: string;
    /** Whether this was a dry run. */
    dryRun: boolean;
}
//# sourceMappingURL=types.d.ts.map
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
    /** Simple string identity for this engine instance (e.g. 'draft', 'implement'). */
    engineId: string;
    /** All upstream yields, keyed by engine id. Escape hatch for engines that need to inspect the full upstream chain. */
    upstream: Record<string, unknown>;
}
/**
 * The result of an engine run.
 *
 * 'completed' — synchronous work done inline, yields are available immediately.
 * 'launched'  — async work launched in a session; the Spider polls for completion.
 */
export type EngineRunResult = {
    status: 'completed';
    yields: unknown;
} | {
    status: 'launched';
    sessionId: string;
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
/** The Fabricator's public API, exposed via `provides`. */
export interface FabricatorApi {
    /**
     * Look up an engine design by ID.
     * Returns the design if registered, undefined otherwise.
     */
    getEngineDesign(id: string): EngineDesign | undefined;
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
export type { EngineDesign, EngineRunContext, EngineRunResult, } from './fabricator.ts';
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
export { type LoomApi, type WeaveRequest, type AnimaWeave, type LoomConfig, type RoleDefinition, createLoom, } from './loom.ts';
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
/**
 * Create the Loom apparatus plugin.
 *
 * Returns a Plugin with:
 * - `requires: ['tools']` — needs the Instrumentarium for tool resolution
 * - `provides: LoomApi` — the context composition API
 */
export declare function createLoom(): Plugin;
//# sourceMappingURL=loom.d.ts.map
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
export type { EngineStatus, EngineInstance, RigStatus, RigDoc, RigFilters, CrawlResult, SpiderApi, SpiderConfig, DraftYields, SealYields, } from './types.ts';
declare const _default: import("@shardworks/nexus-core").Plugin;
export default _default;
//# sourceMappingURL=index.d.ts.map
=== packages/plugins/spider/dist/spider.d.ts ===
/**
 * The Spider — rig execution engine apparatus.
 *
 * The Spider drives writ-to-completion by managing rigs: ordered pipelines
 * of engine instances. Each crawl() call performs one unit of work:
 *
 *   collect > run > spawn   (priority order)
 *
 * collect — check running engines for terminal session results
 * run     — execute the next pending engine (clockwork inline, quick → launch)
 * spawn   — create a new rig for a ready writ with no existing rig
 *
 * CDC on the rigs book (Phase 1 cascade) transitions the associated writ
 * when a rig reaches a terminal state (completed or failed).
 *
 * See: docs/architecture/apparatus/spider.md
 */
import type { Plugin } from '@shardworks/nexus-core';
export declare function createSpider(): Plugin;
//# sourceMappingURL=spider.d.ts.map
=== packages/plugins/spider/dist/tools/crawl-continual.d.ts ===
/**
 * crawlContinual tool — runs the crawl loop continuously.
 *
 * Polls crawl() on a configurable interval until stopped or no remaining
 * work exists for the configured number of consecutive idle cycles.
 */
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    maxIdleCycles: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    pollIntervalMs: z.ZodOptional<z.ZodNumber>;
}>;
export default _default;
//# sourceMappingURL=crawl-continual.d.ts.map
=== packages/plugins/spider/dist/tools/crawl.d.ts ===
/**
 * crawl tool — executes a single step of the crawl loop.
 *
 * Returns the CrawlResult or null (idle) from one crawl() call.
 * Useful for manual step-through or testing.
 */
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{}>;
export default _default;
//# sourceMappingURL=crawl.d.ts.map
=== packages/plugins/spider/dist/tools/index.d.ts ===
export { default as crawlTool } from './crawl.ts';
export { default as crawlContinualTool } from './crawl-continual.ts';
export { default as rigShowTool } from './rig-show.ts';
export { default as rigListTool } from './rig-list.ts';
export { default as rigForWritTool } from './rig-for-writ.ts';
//# sourceMappingURL=index.d.ts.map
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
        running: "running";
    }>>;
    limit: z.ZodOptional<z.ZodNumber>;
    offset: z.ZodOptional<z.ZodNumber>;
}>;
export default _default;
//# sourceMappingURL=rig-list.d.ts.map
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
export type EngineStatus = 'pending' | 'running' | 'completed' | 'failed';
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
}
export type RigStatus = 'running' | 'completed' | 'failed';
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
 * The result of a single crawl() call.
 *
 * Four variants, ordered by priority:
 * - 'engine-completed' — an engine finished (collected or ran inline); rig still running
 * - 'engine-started'   — launched a quick engine's session
 * - 'rig-spawned'      — created a new rig for a ready writ
 * - 'rig-completed'    — the crawl step caused a rig to reach a terminal state
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
    action: 'rig-spawned';
    rigId: string;
    writId: string;
} | {
    action: 'rig-completed';
    rigId: string;
    writId: string;
    outcome: 'completed' | 'failed';
};
/**
 * The Spider's public API — retrieved via guild().apparatus<SpiderApi>('spider').
 */
export interface SpiderApi {
    /**
     * Execute one step of the crawl loop.
     *
     * Priority ordering: collect > run > spawn.
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
}
/**
 * Spider apparatus configuration — lives under the `spider` key in guild.json.
 */
export interface SpiderConfig {
    /**
     * Role to summon for quick engine sessions.
     * Default: 'artificer'.
     */
    role?: string;
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
 * - `'cli'` — accessible via `nsg` commands (human-facing)
 * - `'anima'` — accessible via MCP server (anima-facing, in sessions)
 * - `'library'` — accessible programmatically via direct import
 *
 * Defaults to all caller types if `callableBy` is unspecified.
 */
export type ToolCaller = 'cli' | 'anima' | 'library';
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
        cli: "cli";
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

