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