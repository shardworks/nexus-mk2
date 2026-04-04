# Observations

## RigDoc lacks createdAt field

`RigDoc` has no `createdAt` timestamp, unlike `WritDoc`. The `id` field is timestamp-sortable (via `generateId`), so ordering works for now, but this means there's no way to query "rigs created after X" or display a human-readable creation time. Adding `createdAt` to `RigDoc` is a one-line addition at spawn time but changes the data model — better as a separate, deliberate change.

**Location:** `/workspace/nexus/packages/plugins/spider/src/types.ts` (RigDoc interface), `/workspace/nexus/packages/plugins/spider/src/spider.ts` (trySpawn, ~line 318)

## Spider spec doc drift

The Spider spec (`/workspace/nexus/docs/architecture/apparatus/spider.md`) has several discrepancies with the code:

1. Uses `walk` as the tool name; code uses `crawl`.
2. Uses object syntax for `supportKit.tools`; code uses array syntax.
3. Lists `requires` in a different order than code.

None are functional issues but the spec should be updated to match the code.

**Location:** `/workspace/nexus/docs/architecture/apparatus/spider.md`

## crawlContinual naming is inconsistent with Clerk tools

The Clerk's tools all use kebab-case names (`writ-list`, `writ-show`, `writ-accept`, etc.). The Spider's `crawlContinual` tool uses camelCase. This will look inconsistent alongside the new `rig-list` and `rig-show` tools. A future rename to `crawl-continual` would align the Spider's full tool set with the Clerk convention.

**Location:** `/workspace/nexus/packages/plugins/spider/src/tools/crawl-continual.ts` (the `name` field in the tool definition)

## SpiderApi has no count() method

The Clerk exposes `count(filters?)` alongside `list()` and `show()`. The Spider doesn't have this — and it's not needed for the current brief. But if dashboard or monitoring tools need "how many rigs are running?" without fetching full documents, a `count()` method would be the natural addition.

## Existing tests access rigs book directly

`spider.test.ts` reads rigs by calling `stacks.book<RigDoc>('spider', 'rigs').find(...)` rather than going through an API method. Once `list()` and `show()` exist, existing test assertions could be simplified — but refactoring existing tests is out of scope for this commission.

**Location:** `/workspace/nexus/packages/plugins/spider/src/spider.test.ts`
