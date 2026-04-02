## Commission Spec

# Normalize ID Formats Across Apparatus

Every apparatus currently rolls its own ID generation with inconsistent formats. Standardize on the `{prefix}-{base36_timestamp}{hex_random}` convention established by the Clerk.

## Current State

| Package | Function | Format | Sortable? |
|---------|----------|--------|-----------|
| **Clerk** | `generateWritId()` | `w-{base36_ts}{12_hex}` | Yes |
| **Codexes** | `generateDraftId()` | `{base36_ts}{8_hex}` (no prefix) | Yes |
| **Animator** | `generateSessionId()` | `ses-{8_hex}` (no timestamp) | No |
| **Parlour** | `generateId(prefix)` | `{prefix}-{8_hex}` (no timestamp) | No |

## Target Convention

```
{short_prefix}-{base36_timestamp}{hex_random}
```

- **Prefix**: Short, type-identifying (e.g. `w-`, `ses-`, `conv-`, `turn-`, `draft-`)
- **Timestamp**: `Date.now().toString(36)` — gives lexicographic sort by creation time
- **Random suffix**: `crypto.randomBytes(N).toString('hex')` — uniqueness without coordination

## Proposed Changes

| Package | Prefix | Notes |
|---------|--------|-------|
| Codexes / drafts | `draft-` | Add prefix, keep timestamp + random |
| Animator / sessions | `ses-` | Add timestamp before random suffix |
| Parlour / conversations | `conv-` | Add timestamp before random suffix |
| Parlour / participants | `part-` | Add timestamp before random suffix |
| Parlour / turns | `turn-` | Add timestamp before random suffix |

## Considerations

- Existing IDs in live guilds won't change — this only affects newly generated IDs. Code that reads IDs should not assume format (treat as opaque strings).
- Random suffix length can vary by type. High-volume types (turns) might want more bytes to reduce collision risk.
- Consider extracting a shared `generateId(prefix: string, randomBytes?: number)` utility into `nexus-core` to eliminate duplication.

## Referenced Files (from spec, pre-commission state)



## Commission Diff

```
```
 docs/architecture/apparatus/clerk.md        | 37 ++++++++++++++++----
 packages/framework/core/src/guild-config.ts |  7 ----
 packages/framework/core/src/index.ts        |  1 -
 packages/plugins/clerk/src/clerk.test.ts    | 52 ++++++++++++++---------------
 packages/plugins/clerk/src/clerk.ts         | 15 ++++++---
 packages/plugins/clerk/src/index.ts         |  2 ++
 packages/plugins/clerk/src/types.ts         | 32 +++++++++++++++++-
 7 files changed, 100 insertions(+), 46 deletions(-)

diff --git a/docs/architecture/apparatus/clerk.md b/docs/architecture/apparatus/clerk.md
index 7e0de76..0db0547 100644
--- a/docs/architecture/apparatus/clerk.md
+++ b/docs/architecture/apparatus/clerk.md
@@ -189,7 +189,7 @@ interface ClerkApi {
 
 ```typescript
 interface WritDoc {
-  /** Unique writ id (ULID). */
+  /** Unique writ id (prefixed, sortable: `w-{base36_timestamp}{hex_random}`). */
   id: string
   /** Writ type — guild vocabulary. e.g. "mandate", "task", "bug". */
   type: string
@@ -247,21 +247,46 @@ interface WritFilters {
 
 ## Configuration
 
+All Clerk configuration lives under the `clerk` key in `guild.json`. The Clerk uses [module augmentation](../plugins.md#typed-config-via-module-augmentation-recommended) to extend `GuildConfig`, so config is accessed via `guild().guildConfig().clerk` with full type safety — no manual cast needed.
+
 ```json
 {
   "clerk": {
-    "writTypes": ["mandate", "task", "bug"],
+    "writTypes": [
+      { "name": "mandate" },
+      { "name": "task", "description": "A concrete unit of implementation work" },
+      { "name": "bug", "description": "A defect to investigate and fix" }
+    ],
     "defaultType": "mandate"
   }
 }
 ```
 
+```typescript
+interface ClerkConfig {
+  writTypes?: WritTypeEntry[]
+  defaultType?: string
+}
+
+interface WritTypeEntry {
+  name: string
+  description?: string
+}
+
+// Module augmentation — typed access via guild().guildConfig().clerk
+declare module '@shardworks/nexus-core' {
+  interface GuildConfig {
+    clerk?: ClerkConfig
+  }
+}
+```
+
 | Field | Type | Default | Description |
 |-------|------|---------|-------------|
-| `writTypes` | `string[]` | `["mandate"]` | Allowed writ type values. The guild defines its own vocabulary. |
+| `writTypes` | `WritTypeEntry[]` | `[]` | Additional writ type declarations. Each entry has a `name` and optional `description`. The built-in type `"mandate"` is always valid regardless of this list. |
 | `defaultType` | `string` | `"mandate"` | Default type when `commission-post` is called without a type. |
 
-Both fields are optional. A guild with no `clerk` config (or an empty one) gets `writTypes: ["mandate"]` and `defaultType: "mandate"` — enough to post commissions with no configuration.
+Both fields are optional. A guild with no `clerk` config (or an empty one) gets only the built-in `mandate` type with `defaultType: "mandate"` — enough to post commissions with no configuration.
 
 Writ types are the guild's vocabulary — not a framework-imposed hierarchy. A guild that does only implementation work might use only `mandate`. A guild with planning animas might add `task`, `step`, `bug`, `spike`. The Clerk validates that posted writs use a declared type but assigns no behavioral semantics to the type name — that meaning lives in role instructions and (when available) standing orders and engine designs.
 
@@ -460,7 +485,7 @@ decompose(parentId: string, children: CreateWritRequest[]): Promise<WritDoc[]>
 ## Implementation Notes
 
 - Standalone apparatus package at `packages/plugins/clerk/`. Requires only the Stacks.
-- `WritDoc.type` uses a guild-defined vocabulary, not a framework enum. The Clerk validates against `clerk.writTypes` in `guild.json` but the framework imposes no meaning on the type name.
-- ULID for writ ids (same as other Stacks documents) — sortable, unique, no coordination needed.
+- `WritDoc.type` uses a guild-defined vocabulary, not a framework enum. The Clerk validates against `clerk.writTypes` in the apparatus config section but the framework imposes no meaning on the type name.
+- Writ ids use the format `w-{base36_timestamp}{hex_random}` — sortable by creation time, unique without coordination. Not a formal ULID, but provides the same useful properties (temporal ordering, no coordination).
 - The `transition()` method is the single choke point for all status changes. All tools and future integrations go through it. This is where validation, timestamp setting, and (future) event emission and hierarchy rollup happen.
 - When the Clockworks is eventually added as a recommended dependency, resolve it at emit time via `guild().apparatus()`, not at startup — so the Clerk functions with or without it.
diff --git a/packages/framework/core/src/guild-config.ts b/packages/framework/core/src/guild-config.ts
index 3927211..435faee 100644
--- a/packages/framework/core/src/guild-config.ts
+++ b/packages/framework/core/src/guild-config.ts
@@ -9,11 +9,6 @@ export interface EventDeclaration {
   schema?: Record<string, string>;
 }
 
-/** A writ type declaration in guild.json. */
-export interface WritTypeDeclaration {
-  /** Human-readable description of this writ type. */
-  description: string;
-}
 
 /** A standing order — a registered response to an event. */
 export type StandingOrder =
@@ -61,8 +56,6 @@ export interface GuildConfig {
   plugins: string[];
   /** Clockworks configuration — events, standing orders. */
   clockworks?: ClockworksConfig;
-  /** Writ types declared by this guild. Built-in types (mandate, summon) are implicit. */
-  writTypes?: Record<string, WritTypeDeclaration>;
   /** Guild-level settings — operational flags and preferences. Includes default model. */
   settings?: GuildSettings;
 }
diff --git a/packages/framework/core/src/index.ts b/packages/framework/core/src/index.ts
index 44717e0..d166f6f 100644
--- a/packages/framework/core/src/index.ts
+++ b/packages/framework/core/src/index.ts
@@ -54,7 +54,6 @@ export {
   type EventDeclaration,
   type StandingOrder,
   type ClockworksConfig,
-  type WritTypeDeclaration,
   type GuildSettings,
   guildConfigPath,
 } from './guild-config.ts';
diff --git a/packages/plugins/clerk/src/clerk.test.ts b/packages/plugins/clerk/src/clerk.test.ts
index fe5fd60..5486b02 100644
--- a/packages/plugins/clerk/src/clerk.test.ts
+++ b/packages/plugins/clerk/src/clerk.test.ts
@@ -15,15 +15,14 @@ import { MemoryBackend } from '@shardworks/stacks-apparatus/testing';
 import type { StacksApi } from '@shardworks/stacks-apparatus';
 
 import { createClerk } from './clerk.ts';
-import type { ClerkApi } from './types.ts';
+import type { ClerkApi, ClerkConfig } from './types.ts';
 
 // ── Test harness ─────────────────────────────────────────────────────
 
 let clerk: ClerkApi;
 
 interface SetupOptions {
-  writTypes?: Record<string, { description: string }>;
-  clerkConfig?: { defaultType?: string };
+  clerkConfig?: ClerkConfig;
 }
 
 function setup(options: SetupOptions = {}) {
@@ -37,8 +36,8 @@ function setup(options: SetupOptions = {}) {
     name: 'test-guild',
     nexus: '0.0.0',
     plugins: [],
-    writTypes: options.writTypes,
     settings: { model: 'sonnet' },
+    clerk: options.clerkConfig,
   };
 
   const fakeGuild: Guild = {
@@ -48,10 +47,7 @@ function setup(options: SetupOptions = {}) {
       if (!api) throw new Error(`Apparatus "${name}" not installed`);
       return api as T;
     },
-    config<T>(pluginId: string): T {
-      if (pluginId === 'clerk') {
-        return (options.clerkConfig ?? {}) as T;
-      }
+    config<T>(_pluginId: string): T {
       return {} as T;
     },
     writeConfig() { /* noop */ },
@@ -94,7 +90,7 @@ describe('Clerk', () => {
     it('creates a writ with ready status and mandate type by default', async () => {
       const writ = await clerk.post({ title: 'Fix the bug', body: 'Details here' });
 
-      assert.ok(writ.id.startsWith('writ-'));
+      assert.ok(writ.id.startsWith('w-'));
       assert.equal(writ.type, 'mandate');
       assert.equal(writ.title, 'Fix the bug');
       assert.equal(writ.body, 'Details here');
@@ -147,14 +143,14 @@ describe('Clerk', () => {
       );
     });
 
-    it('accepts a type declared in guild writTypes config', async () => {
-      setup({ writTypes: { 'errand': { description: 'A small errand' } } });
+    it('accepts a type declared in clerk writTypes config', async () => {
+      setup({ clerkConfig: { writTypes: [{ name: 'errand', description: 'A small errand' }] } });
       const writ = await clerk.post({ title: 'Run errand', body: 'Do it', type: 'errand' });
       assert.equal(writ.type, 'errand');
     });
 
-    it('rejects a type that is not in guild writTypes', async () => {
-      setup({ writTypes: { 'errand': { description: 'A small errand' } } });
+    it('rejects a type that is not in clerk writTypes', async () => {
+      setup({ clerkConfig: { writTypes: [{ name: 'errand', description: 'A small errand' }] } });
       await assert.rejects(
         () => clerk.post({ title: 'Test', body: 'Body', type: 'quest' }),
         /Unknown writ type/,
@@ -180,7 +176,7 @@ describe('Clerk', () => {
 
     it('throws for a non-existent writ id', async () => {
       await assert.rejects(
-        () => clerk.show('writ-doesnotexist'),
+        () => clerk.show('w-doesnotexist'),
         /not found/,
       );
     });
@@ -199,7 +195,7 @@ describe('Clerk', () => {
 
   describe('list()', () => {
     beforeEach(() => {
-      setup({ writTypes: { 'errand': { description: 'A small errand' } } });
+      setup({ clerkConfig: { writTypes: [{ name: 'errand', description: 'A small errand' }] } });
     });
 
     it('returns all writs when no filters given', async () => {
@@ -289,7 +285,7 @@ describe('Clerk', () => {
     });
 
     it('filters by type', async () => {
-      setup({ writTypes: { 'errand': { description: 'A small errand' } } });
+      setup({ clerkConfig: { writTypes: [{ name: 'errand', description: 'A small errand' }] } });
       await clerk.post({ title: 'Mandate', body: 'Body', type: 'mandate' });
       await clerk.post({ title: 'Errand', body: 'Body', type: 'errand' });
 
@@ -322,7 +318,7 @@ describe('Clerk', () => {
 
     it('throws if writ does not exist', async () => {
       await assert.rejects(
-        () => clerk.transition('writ-ghost', 'active'),
+        () => clerk.transition('w-ghost', 'active'),
         /not found/,
       );
     });
@@ -560,7 +556,7 @@ describe('Clerk', () => {
       // Attempt to corrupt id, status, and timestamps via fields
       const done = await clerk.transition(writ.id, 'completed', {
         resolution: 'Legit resolution',
-        id: 'writ-evil',
+        id: 'w-evil',
         status: 'ready' as const,
         createdAt: '1999-01-01T00:00:00Z',
         updatedAt: '1999-01-01T00:00:00Z',
@@ -583,13 +579,13 @@ describe('Clerk', () => {
 
   describe('config: writTypes validation', () => {
     it('built-in type mandate is always valid regardless of writTypes config', async () => {
-      setup({ writTypes: {} }); // empty writTypes — built-in still works
+      setup({ clerkConfig: { writTypes: [] } }); // empty writTypes — built-in still works
       const w1 = await clerk.post({ title: 'Mandate', body: 'Body', type: 'mandate' });
       assert.equal(w1.type, 'mandate');
     });
 
     it('summon is not a built-in type (must be declared)', async () => {
-      setup({ writTypes: {} });
+      setup({ clerkConfig: { writTypes: [] } });
       await assert.rejects(
         () => clerk.post({ title: 'Summon', body: 'Body', type: 'summon' }),
         /Unknown writ type/,
@@ -598,9 +594,11 @@ describe('Clerk', () => {
 
     it('declared custom types are accepted', async () => {
       setup({
-        writTypes: {
-          'quest': { description: 'A significant task' },
-          'errand': { description: 'A small errand' },
+        clerkConfig: {
+          writTypes: [
+            { name: 'quest', description: 'A significant task' },
+            { name: 'errand', description: 'A small errand' },
+          ],
         },
       });
       const w = await clerk.post({ title: 'Go on a quest', body: 'Body', type: 'quest' });
@@ -608,7 +606,7 @@ describe('Clerk', () => {
     });
 
     it('undeclared types are rejected even when other custom types exist', async () => {
-      setup({ writTypes: { 'quest': { description: 'A quest' } } });
+      setup({ clerkConfig: { writTypes: [{ name: 'quest', description: 'A quest' }] } });
       await assert.rejects(
         () => clerk.post({ title: 'Test', body: 'Body', type: 'unknown' }),
         /Unknown writ type/,
@@ -617,8 +615,10 @@ describe('Clerk', () => {
 
     it('defaultType from clerk config is validated against declared types', async () => {
       setup({
-        writTypes: { 'errand': { description: 'A small errand' } },
-        clerkConfig: { defaultType: 'errand' },
+        clerkConfig: {
+          writTypes: [{ name: 'errand', description: 'A small errand' }],
+          defaultType: 'errand',
+        },
       });
       const w = await clerk.post({ title: 'Default errand', body: 'Body' });
       assert.equal(w.type, 'errand');
diff --git a/packages/plugins/clerk/src/clerk.ts b/packages/plugins/clerk/src/clerk.ts
index d8891a1..827f6ac 100644
--- a/packages/plugins/clerk/src/clerk.ts
+++ b/packages/plugins/clerk/src/clerk.ts
@@ -20,6 +20,7 @@ import type { StacksApi, Book, WhereClause } from '@shardworks/stacks-apparatus'
 
 import type {
   ClerkApi,
+  ClerkConfig,
   WritDoc,
   WritStatus,
   PostCommissionRequest,
@@ -45,7 +46,7 @@ const BUILTIN_TYPES = new Set(['mandate']);
 function generateWritId(): string {
   const ts = Date.now().toString(36);
   const rand = crypto.randomBytes(6).toString('hex');
-  return `writ-${ts}${rand}`;
+  return `w-${ts}${rand}`;
 }
 
 // ── Status machine ───────────────────────────────────────────────────
@@ -67,15 +68,19 @@ export function createClerk(): Plugin {
 
   // ── Helpers ──────────────────────────────────────────────────────
 
+  function resolveClerkConfig(): ClerkConfig {
+    return guild().guildConfig().clerk ?? {};
+  }
+
   function resolveWritTypes(): Set<string> {
-    const guildConfig = guild().guildConfig();
-    const declared = Object.keys(guildConfig.writTypes ?? {});
+    const config = resolveClerkConfig();
+    const declared = (config.writTypes ?? []).map((entry) => entry.name);
     return new Set([...BUILTIN_TYPES, ...declared]);
   }
 
   function resolveDefaultType(): string {
-    const config = guild().config<{ defaultType?: string }>('clerk');
-    return config?.defaultType ?? 'mandate';
+    const config = resolveClerkConfig();
+    return config.defaultType ?? 'mandate';
   }
 
   function buildWhereClause(filters?: WritFilters): WhereClause | undefined {
diff --git a/packages/plugins/clerk/src/index.ts b/packages/plugins/clerk/src/index.ts
index 50c72bc..34b02a5 100644
--- a/packages/plugins/clerk/src/index.ts
+++ b/packages/plugins/clerk/src/index.ts
@@ -14,6 +14,8 @@ import { createClerk } from './clerk.ts';
 
 export {
   type ClerkApi,
+  type ClerkConfig,
+  type WritTypeEntry,
   type WritDoc,
   type WritStatus,
   type PostCommissionRequest,
diff --git a/packages/plugins/clerk/src/types.ts b/packages/plugins/clerk/src/types.ts
index ac5b753..421c1d7 100644
--- a/packages/plugins/clerk/src/types.ts
+++ b/packages/plugins/clerk/src/types.ts
@@ -25,7 +25,7 @@ export type WritStatus = 'ready' | 'active' | 'completed' | 'failed' | 'cancelle
  * A writ document as stored in The Stacks.
  */
 export interface WritDoc {
-  /** Unique writ id (ULID-like, prefixed "writ-"). */
+  /** Unique writ id (`w-{base36_timestamp}{hex_random}`). Sortable by creation time. */
   id: string;
   /** Writ type — must be a type declared in guild config, or a built-in type. */
   type: string;
@@ -84,6 +84,36 @@ export interface WritFilters {
   offset?: number;
 }
 
+// ── Configuration ───────────────────────────────────────────────
+
+/**
+ * A writ type entry declared in clerk config.
+ */
+export interface WritTypeEntry {
+  /** The writ type name (e.g. "mandate", "task", "bug"). */
+  name: string;
+  /** Optional human-readable description of this writ type. */
+  description?: string;
+}
+
+/**
+ * Clerk apparatus configuration — lives under the `clerk` key in guild.json.
+ */
+export interface ClerkConfig {
+  /** Additional writ type declarations. The built-in type "mandate" is always valid. */
+  writTypes?: WritTypeEntry[];
+  /** Default writ type when commission-post is called without a type (default: "mandate"). */
+  defaultType?: string;
+}
+
+// Augment GuildConfig so `guild().guildConfig().clerk` is typed without
+// requiring a manual type parameter at the call site.
+declare module '@shardworks/nexus-core' {
+  interface GuildConfig {
+    clerk?: ClerkConfig;
+  }
+}
+
 // ── API ──────────────────────────────────────────────────────────────
 
 /**
```
```

## Full File Contents (for context)


=== FILE: docs/architecture/apparatus/clerk.md ===
# The Clerk — API Contract

Status: **Draft**

Package: `@shardworks/clerk-apparatus` · Plugin id: `clerk`

> **⚠️ MVP scope.** The first implementation covers flat mandate writs with patron-triggered dispatch. No writ hierarchy, no Clockworks integration. Future sections describe where this apparatus is headed once the Clockworks and rigging system exist.

---

## Purpose

The Clerk is the guild's obligation authority. It receives commissions from the patron, issues writs that formally record what is owed, manages the lifecycle of those writs through to completion or failure, and maintains the Ledger — the guild's book of work.

The Clerk owns the boundary between "what is asked for" and "how it gets done." A commission arrives; the Clerk creates a mandate writ. When work completes, the Clerk records the outcome. Connecting writs to sessions is the job of the dispatch layer — currently [The Dispatch](dispatch.md), eventually the full rigging system (Walker, Executor, Formulary). The Clerk tracks the obligation, not the execution.

The Clerk does **not** execute work. It does not launch sessions, manage rigs, or orchestrate engines. It tracks obligations: what has been commissioned, what state each obligation is in, and whether the guild has fulfilled its commitments. When the Clockworks and rigging system exist, the Clerk will integrate with them via lifecycle events and signals.

---

## Dependencies

```
requires: ['stacks']
```

- **The Stacks** (required) — persists writs in the `writs` book. All writ state lives here.

---

## Kit Interface

The Clerk does not consume kit contributions. No `consumes` declaration.

Kits that need to create or manage writs do so through the Clerk's tools or programmatic API, not through kit contribution fields. Writ creation is an operational act (with validation and lifecycle rules), not a declarative registration.

---

## Support Kit

```typescript
supportKit: {
  books: {
    writs: {
      indexes: ['status', 'type', 'createdAt', ['status', 'type'], ['status', 'createdAt']],
    },
  },
  tools: [
    commissionPost,
    writShow,
    writList,
    writAccept,
    writComplete,
    writFail,
    writCancel,
  ],
},
```

### `commission-post` tool

Post a new commission. Creates a mandate writ in `ready` status.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `title` | `string` | yes | Short description of the work |
| `body` | `string` | yes | Full spec — what to do, acceptance criteria, context |
| `codex` | `string` | no | Target codex name |
| `type` | `string` | no | Writ type (default: `"mandate"`) |

Returns the created `WritDoc`.

Permission: `clerk:write`

### `writ-show` tool

Read a writ by id. Returns the full `WritDoc` including status history.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | `string` | yes | Writ id |

Permission: `clerk:read`

### `writ-list` tool

List writs with optional filters. Returns writs ordered by `createdAt` descending.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `status` | `WritStatus` | no | Filter by status |
| `type` | `string` | no | Filter by writ type |
| `limit` | `number` | no | Max results (default: 20) |

Permission: `clerk:read`

### `writ-accept` tool

Claim a writ. Transitions `ready → active`. Sets `acceptedAt`.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | `string` | yes | Writ id |

Permission: `clerk:write`

### `writ-complete` tool

Mark a writ as successfully completed. Transitions `active → completed`.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | `string` | yes | Writ id |
| `resolution` | `string` | yes | What was done — summary of the work delivered |

Permission: `clerk:write`

### `writ-fail` tool

Mark a writ as failed. Transitions `active → failed`.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | `string` | yes | Writ id |
| `resolution` | `string` | yes | Why the work failed |

Permission: `clerk:write`

### `writ-cancel` tool

Cancel a writ. Transitions `ready|active → cancelled`.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | `string` | yes | Writ id |
| `resolution` | `string` | no | Why the writ was cancelled |

Permission: `clerk:write`

---

## `ClerkApi` Interface (`provides`)

```typescript
interface ClerkApi {
  // ── Commission Intake ─────────────────────────────────────────

  /**
   * Post a commission — create a mandate writ in ready status.
   *
   * This is the primary entry point for patron-originated work.
   * Creates a WritDoc and persists it to the writs book.
   */
  post(request: PostCommissionRequest): Promise<WritDoc>

  // ── Writ Queries ──────────────────────────────────────────────

  /** Read a single writ by id. Throws if not found. */
  show(id: string): Promise<WritDoc>

  /** List writs with optional filters. */
  list(filters?: WritFilters): Promise<WritDoc[]>

  /** Count writs matching filters. */
  count(filters?: WritFilters): Promise<number>

  // ── Writ Lifecycle ────────────────────────────────────────────

  /**
   * Transition a writ to a new status.
   *
   * Enforces the status machine — invalid transitions throw.
   * Updates the writ document and sets timestamp fields.
   *
   * Valid transitions:
   *   ready → active
   *   active → completed
   *   active → failed
   *   ready|active → cancelled
   *
   * The `fields` parameter allows setting additional fields
   * atomically with the transition (e.g. `resolution`).
   */
  transition(id: string, to: WritStatus, fields?: Partial<WritDoc>): Promise<WritDoc>
}
```

### Supporting Types

```typescript
interface WritDoc {
  /** Unique writ id (prefixed, sortable: `w-{base36_timestamp}{hex_random}`). */
  id: string
  /** Writ type — guild vocabulary. e.g. "mandate", "task", "bug". */
  type: string
  /** Current status. */
  status: WritStatus
  /** Short description. */
  title: string
  /** Full spec — what to do, acceptance criteria, context. */
  body: string
  /** Target codex name, if applicable. */
  codex?: string

  // ── Timestamps ──────────────────────────────────────────────

  /** When the writ was created. */
  createdAt: string
  /** When the writ was last modified. */
  updatedAt: string
  /** When status moved to active (accepted). */
  acceptedAt?: string
  /** When terminal status was reached. */
  resolvedAt?: string

  // ── Resolution ───────────────────────────────────────────────

  /** Summary of how the writ resolved. Set on any terminal transition.
   *  What was done (completed), why it failed (failed), or why it
   *  was cancelled (cancelled). The `status` field distinguishes which. */
  resolution?: string
}

type WritStatus =
  | "ready"       // Posted, awaiting acceptance or dispatch
  | "active"      // Claimed by an anima, work in progress
  | "completed"   // Work done successfully
  | "failed"      // Work failed
  | "cancelled"   // Cancelled by patron or system

interface PostCommissionRequest {
  title: string
  body: string
  codex?: string
  type?: string       // default: "mandate"
}

interface WritFilters {
  status?: WritStatus
  type?: string
  limit?: number
  offset?: number
}
```

---

## Configuration

All Clerk configuration lives under the `clerk` key in `guild.json`. The Clerk uses [module augmentation](../plugins.md#typed-config-via-module-augmentation-recommended) to extend `GuildConfig`, so config is accessed via `guild().guildConfig().clerk` with full type safety — no manual cast needed.

```json
{
  "clerk": {
    "writTypes": [
      { "name": "mandate" },
      { "name": "task", "description": "A concrete unit of implementation work" },
      { "name": "bug", "description": "A defect to investigate and fix" }
    ],
    "defaultType": "mandate"
  }
}
```

```typescript
interface ClerkConfig {
  writTypes?: WritTypeEntry[]
  defaultType?: string
}

interface WritTypeEntry {
  name: string
  description?: string
}

// Module augmentation — typed access via guild().guildConfig().clerk
declare module '@shardworks/nexus-core' {
  interface GuildConfig {
    clerk?: ClerkConfig
  }
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `writTypes` | `WritTypeEntry[]` | `[]` | Additional writ type declarations. Each entry has a `name` and optional `description`. The built-in type `"mandate"` is always valid regardless of this list. |
| `defaultType` | `string` | `"mandate"` | Default type when `commission-post` is called without a type. |

Both fields are optional. A guild with no `clerk` config (or an empty one) gets only the built-in `mandate` type with `defaultType: "mandate"` — enough to post commissions with no configuration.

Writ types are the guild's vocabulary — not a framework-imposed hierarchy. A guild that does only implementation work might use only `mandate`. A guild with planning animas might add `task`, `step`, `bug`, `spike`. The Clerk validates that posted writs use a declared type but assigns no behavioral semantics to the type name — that meaning lives in role instructions and (when available) standing orders and engine designs.

---

## Status Machine

The writ status machine governs all transitions. The Clerk enforces this — invalid transitions throw.

```
            ┌──────────────┐
            │    ready     │──────────┐
            └──────┬───────┘          │
                   │                  │
              accept               cancel
                   │                  │
                   ▼                  │
            ┌──────────────┐          │
            │    active    │──────┐   │
            └──┬───────┬───┘      │   │
               │       │          │   │
          complete    fail     cancel  │
               │       │          │   │
               ▼       ▼          │   │
        ┌───────────┐ ┌────────┐  │   │
        │ completed │ │ failed │  │   │
        └───────────┘ └────────┘  │   │
                                  │   │
              ┌───────────┐       │   │
              │ cancelled │◀──────┘   │
              │           │◀──────────┘
              └───────────┘
```

Terminal statuses: `completed`, `failed`, `cancelled`. No transitions out of terminal states.

### [Future] The `pending` status

When writ hierarchy is implemented, a parent writ transitions to `pending` when it has active children and is not directly actionable itself. `pending` is not a terminal state — when all children complete, the parent can transition to `completed`. If any child fails, the parent can transition to `failed`.

```
ready → pending    (when children are created via decompose())
pending → completed  (when all children complete — may be automatic)
pending → failed     (when a child fails — patron decides)
pending → cancelled
```

---

## Commission Intake Pipeline

Commission intake is a single synchronous step:

```
├─ 1. Patron calls commission-post (or ClerkApi.post())
├─ 2. Clerk validates input, generates ULID, creates WritDoc
├─ 3. Clerk writes WritDoc to writs book (status: ready)
└─ 4. Returns WritDoc to caller
```

One commission = one mandate writ. No planning, no decomposition. Dispatch is handled by [The Dispatch](dispatch.md) — a separate apparatus that reads ready writs and runs them through the guild's session machinery.

---

## Future: Clockworks Integration

When the Clockworks apparatus exists, the Clerk gains event emission and reactive dispatch.

### Dependency Change

```
requires:   ['stacks']
recommends: ['clockworks']
```

The Clockworks becomes a recommended (not required) dependency. The Clerk checks for the Clockworks at emit time — not at startup — so it functions standalone. When the Clockworks is absent, event emission is silently skipped.

### Lifecycle Events

The Clerk emits events into the Clockworks event stream at each status transition. Event names use the writ's `type` as the namespace, matching the framework event catalog.

| Transition | Event | Payload |
|-----------|-------|---------|
| Commission posted | `commission.posted` | `{ writId, title, type, codex }` |
| Writ signaled ready | `{type}.ready` | `{ writId, title, type, codex }` |
| `ready → active` | `{type}.active` | `{ writId }` |
| `active → completed` | `{type}.completed` | `{ writId, resolution }` |
| `active → failed` | `{type}.failed` | `{ writId, resolution }` |
| `* → cancelled` | `{type}.cancelled` | `{ writId, resolution }` |

These events are what standing orders bind to. The canonical dispatch pattern:

```json
{
  "clockworks": {
    "standingOrders": [
      { "on": "mandate.ready", "summon": "artificer", "prompt": "Read your writ with writ-show and fulfill the commission. Writ id: {{writ.id}}" }
    ]
  }
}
```

### `signal()` Method

A new method on `ClerkApi`:

```typescript
/**
 * Signal that a writ is ready for dispatch.
 *
 * Emits `{type}.ready` into the Clockworks event stream.
 * In the full design, called after intake processing (Sage
 * decomposition, validation) completes. This is the signal
 * the Walker (or summon relay) listens for to begin execution.
 */
signal(id: string): Promise<void>
```

### Dispatch Integration

The Clerk integrates with the dispatch layer at two points:

**Outbound: Ready Signal.** When a writ is signaled ready, the Clockworks event stream carries it to standing orders. The summon relay (or the Walker, for rig-based execution) picks it up and begins work. The Clerk does not know or care which dispatch path handles the writ — it signals readiness; the guild's configuration determines the response.

**Inbound: Completion Signal.** When work completes (session ends, rig strikes), the completing apparatus calls `clerk.transition(id, 'completed', { outcome })`. For rig-based execution, the Walker calls this when it strikes a completed rig. For direct-summon execution, the anima calls `writ-complete` (which wraps `clerk.transition()`). Both paths converge on the same Clerk API.

### Intake with Planning

When Sage animas and the Clockworks are available, the intake pipeline gains a planning step:

```
├─ 1. Patron calls commission-post
├─ 2. Clerk creates mandate writ (status: ready)
├─ 3. Clerk emits commission.posted
├─ 4. Standing order on commission.posted summons a Sage
├─ 5. Sage reads the mandate, decomposes into child writs via decompose()
├─ 6. Clerk creates child writs (status: ready), sets parent to pending
├─ 7. Clerk emits {childType}.ready for each child
├─ 8. Standing orders on {childType}.ready dispatch workers
├─ 9. As children complete, Clerk rolls up status to parent
└─ 10. When all children complete, parent mandate → completed
```

The patron's experience doesn't change — they still call `commission-post`. The planning step is internal to the guild.

---

## Future: Writ Hierarchy

Writs form a tree. A mandate writ may be decomposed into child writs (tasks, steps, etc.) by a planning anima. The hierarchy enables:

- **Decomposition** — a broad commission broken into concrete tasks
- **Completion rollup** — parent completes when all children complete
- **Failure propagation** — parent awareness of child failures
- **Scope tracking** — the patron sees one mandate; the guild sees the tree

### Hierarchy Rules

- A writ may have zero or one parent.
- A writ may have zero or many children.
- Depth is not limited (but deep hierarchies are a design smell).
- Children inherit the parent's `codex` unless explicitly overridden.
- The parent's `childCount` is denormalized and maintained by the Clerk.

### Completion Rollup

When a child writ reaches a terminal status, the Clerk checks siblings:
- All children `completed` → parent auto-transitions to `completed`
- Any child `failed` → the Clerk emits `{parentType}.child-failed` but does NOT auto-fail the parent. The patron (or a standing order) decides whether to fail, retry, or cancel.
- Child `cancelled` → no automatic parent transition.

### `decompose()` Method

```typescript
/**
 * Create child writs under a parent.
 *
 * Used by planning animas (Sages) to decompose a mandate into
 * concrete tasks. Children inherit the parent's codex unless
 * overridden. The parent transitions to `pending` when it has
 * active children and is not directly actionable.
 */
decompose(parentId: string, children: CreateWritRequest[]): Promise<WritDoc[]>
```

---

## Open Questions

- **Should `commission-post` be a permissionless tool?** It represents patron authority — commissions come from outside the guild. But Coco (running inside a session) needs to call it. Current thinking: gate it with `clerk:write` and grant that to the steward role.

- **Writ type validation — strict or advisory?** The Clerk validates against `clerk.writTypes` in config. But this means adding a new type requires a config change. Alternative: accept any string, use the config list only for documentation/tooling hints. Current thinking: strict validation — the guild should know its own vocabulary.

---

## Implementation Notes

- Standalone apparatus package at `packages/plugins/clerk/`. Requires only the Stacks.
- `WritDoc.type` uses a guild-defined vocabulary, not a framework enum. The Clerk validates against `clerk.writTypes` in the apparatus config section but the framework imposes no meaning on the type name.
- Writ ids use the format `w-{base36_timestamp}{hex_random}` — sortable by creation time, unique without coordination. Not a formal ULID, but provides the same useful properties (temporal ordering, no coordination).
- The `transition()` method is the single choke point for all status changes. All tools and future integrations go through it. This is where validation, timestamp setting, and (future) event emission and hierarchy rollup happen.
- When the Clockworks is eventually added as a recommended dependency, resolve it at emit time via `guild().apparatus()`, not at startup — so the Clerk functions with or without it.

=== FILE: packages/framework/core/src/guild-config.ts ===
import fs from 'node:fs';
import path from 'node:path';

/** A custom event declaration in guild.json clockworks.events. */
export interface EventDeclaration {
  /** Human-readable description of what this event means. */
  description?: string;
  /** Optional payload schema hint (not enforced in Phase 1). */
  schema?: Record<string, string>;
}


/** A standing order — a registered response to an event. */
export type StandingOrder =
  | { on: string; run: string }
  | { on: string; summon: string; prompt?: string }
  | { on: string; brief: string };

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
export function createInitialGuildConfig(name: string, nexusVersion: string, model: string): GuildConfig {
  return {
    name,
    nexus: nexusVersion,
    plugins: [],
    settings: { model },
  };
}

/** Read and parse guild.json from the guild root. */
export function readGuildConfig(home: string): GuildConfig {
  const configFile = guildConfigPath(home);
  return JSON.parse(fs.readFileSync(configFile, 'utf-8')) as GuildConfig;
}

/** Write guild.json to the guild root. */
export function writeGuildConfig(home: string, config: GuildConfig): void {
  const configFile = guildConfigPath(home);
  fs.writeFileSync(configFile, JSON.stringify(config, null, 2) + '\n');
}

/** Resolve the path to guild.json in the guild root. */
export function guildConfigPath(home: string): string {
  return path.join(home, 'guild.json');
}

=== FILE: packages/framework/core/src/index.ts ===
// @shardworks/nexus-core — public SDK surface

import { createRequire } from 'node:module';

const _require = createRequire(import.meta.url);
const _pkg = _require('../package.json');
export const VERSION: string = _pkg.version;

// ── Promoted modules — canonical source lives here at top-level ────────

export {
  // Plugin/Kit/Apparatus model
  type Kit,
  type Apparatus,
  type Plugin,
  type LoadedKit,
  type LoadedApparatus,
  type LoadedPlugin,
  type StartupContext,
  isKit,
  isApparatus,
  isLoadedKit,
  isLoadedApparatus,
} from './plugin.ts';

// Guild — the process-level singleton for accessing guild infrastructure.
export {
  type Guild,
  guild,
  setGuild,
  clearGuild,
} from './guild.ts';

export {
  findGuildRoot,
  nexusDir,
  worktreesPath,
  clockPidPath,
  clockLogPath,
} from './nexus-home.ts';

export {
  derivePluginId,
  readGuildPackageJson,
  resolvePackageNameForPluginId,
  resolveGuildPackageEntry,
} from './resolve-package.ts';

export {
  type GuildConfig,
  createInitialGuildConfig,
  readGuildConfig,
  writeGuildConfig,
  type EventDeclaration,
  type StandingOrder,
  type ClockworksConfig,
  type GuildSettings,
  guildConfigPath,
} from './guild-config.ts';

=== FILE: packages/plugins/clerk/src/clerk.test.ts ===
/**
 * Clerk apparatus tests.
 *
 * Uses in-memory Stacks and a minimal fake guild to test the full writ
 * lifecycle without any external dependencies.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { setGuild, clearGuild } from '@shardworks/nexus-core';
import type { Guild, GuildConfig } from '@shardworks/nexus-core';
import { createStacksApparatus } from '@shardworks/stacks-apparatus';
import { MemoryBackend } from '@shardworks/stacks-apparatus/testing';
import type { StacksApi } from '@shardworks/stacks-apparatus';

import { createClerk } from './clerk.ts';
import type { ClerkApi, ClerkConfig } from './types.ts';

// ── Test harness ─────────────────────────────────────────────────────

let clerk: ClerkApi;

interface SetupOptions {
  clerkConfig?: ClerkConfig;
}

function setup(options: SetupOptions = {}) {
  const memBackend = new MemoryBackend();
  const stacksPlugin = createStacksApparatus(memBackend);
  const clerkPlugin = createClerk();

  const apparatusMap = new Map<string, unknown>();

  const fakeGuildConfig: GuildConfig = {
    name: 'test-guild',
    nexus: '0.0.0',
    plugins: [],
    settings: { model: 'sonnet' },
    clerk: options.clerkConfig,
  };

  const fakeGuild: Guild = {
    home: '/tmp/fake-guild',
    apparatus<T>(name: string): T {
      const api = apparatusMap.get(name);
      if (!api) throw new Error(`Apparatus "${name}" not installed`);
      return api as T;
    },
    config<T>(_pluginId: string): T {
      return {} as T;
    },
    writeConfig() { /* noop */ },
    guildConfig() { return fakeGuildConfig; },
    kits: () => [],
    apparatuses: () => [],
  };

  setGuild(fakeGuild);

  // Start stacks
  const stacksApparatus = (stacksPlugin as { apparatus: { start: (ctx: unknown) => void; provides: unknown } }).apparatus;
  stacksApparatus.start({ on: () => {} });
  const stacks = stacksApparatus.provides as StacksApi;
  apparatusMap.set('stacks', stacks);

  // Ensure books exist
  memBackend.ensureBook({ ownerId: 'clerk', book: 'writs' }, {
    indexes: ['status', 'type', 'createdAt', ['status', 'type'], ['status', 'createdAt']],
  });

  // Start clerk
  const clerkApparatus = (clerkPlugin as { apparatus: { start: (ctx: unknown) => void; provides: unknown } }).apparatus;
  clerkApparatus.start({ on: () => {} });
  clerk = clerkApparatus.provides as ClerkApi;
}

// ── Tests ────────────────────────────────────────────────────────────

describe('Clerk', () => {
  afterEach(() => {
    clearGuild();
  });

  // ── post() ───────────────────────────────────────────────────────

  describe('post()', () => {
    beforeEach(() => { setup(); });

    it('creates a writ with ready status and mandate type by default', async () => {
      const writ = await clerk.post({ title: 'Fix the bug', body: 'Details here' });

      assert.ok(writ.id.startsWith('w-'));
      assert.equal(writ.type, 'mandate');
      assert.equal(writ.title, 'Fix the bug');
      assert.equal(writ.body, 'Details here');
      assert.equal(writ.status, 'ready');
      assert.ok(writ.createdAt);
      assert.ok(writ.updatedAt);
      assert.equal(writ.acceptedAt, undefined);
      assert.equal(writ.resolvedAt, undefined);
      assert.equal(writ.resolution, undefined);
      assert.equal(writ.codex, undefined);
    });

    it('requires body field', async () => {
      // TypeScript enforces this at compile time; at runtime the field is required
      const writ = await clerk.post({ title: 'Has body', body: 'Required content' });
      assert.equal(writ.body, 'Required content');
    });

    it('accepts explicit type when it is a built-in type', async () => {
      const writ = await clerk.post({ title: 'A mandate', body: 'Do it', type: 'mandate' });
      assert.equal(writ.type, 'mandate');
    });

    it('persists codex field', async () => {
      const writ = await clerk.post({
        title: 'Do the thing',
        body: 'Detailed instructions here',
        codex: 'artificer',
      });

      assert.equal(writ.codex, 'artificer');
    });

    it('omits codex when not provided', async () => {
      const writ = await clerk.post({ title: 'No codex', body: 'Details' });
      assert.equal(writ.codex, undefined);
    });

    it('uses guild defaultType from clerk config when provided', async () => {
      // mandate is a built-in, so it's always valid as a defaultType
      setup({ clerkConfig: { defaultType: 'mandate' } });
      const writ = await clerk.post({ title: 'Default mandate', body: 'Body' });
      assert.equal(writ.type, 'mandate');
    });

    it('rejects an unknown writ type', async () => {
      await assert.rejects(
        () => clerk.post({ title: 'Test', body: 'Body', type: 'unknown-type' }),
        /Unknown writ type/,
      );
    });

    it('accepts a type declared in clerk writTypes config', async () => {
      setup({ clerkConfig: { writTypes: [{ name: 'errand', description: 'A small errand' }] } });
      const writ = await clerk.post({ title: 'Run errand', body: 'Do it', type: 'errand' });
      assert.equal(writ.type, 'errand');
    });

    it('rejects a type that is not in clerk writTypes', async () => {
      setup({ clerkConfig: { writTypes: [{ name: 'errand', description: 'A small errand' }] } });
      await assert.rejects(
        () => clerk.post({ title: 'Test', body: 'Body', type: 'quest' }),
        /Unknown writ type/,
      );
    });

    it('generates unique ids for each writ', async () => {
      const w1 = await clerk.post({ title: 'Writ 1', body: 'Body' });
      const w2 = await clerk.post({ title: 'Writ 2', body: 'Body' });
      assert.notEqual(w1.id, w2.id);
    });

    it('sets createdAt and updatedAt to the same value on creation', async () => {
      const writ = await clerk.post({ title: 'Timestamps', body: 'Body' });
      assert.equal(writ.createdAt, writ.updatedAt);
    });
  });

  // ── show() ───────────────────────────────────────────────────────

  describe('show()', () => {
    beforeEach(() => { setup(); });

    it('throws for a non-existent writ id', async () => {
      await assert.rejects(
        () => clerk.show('w-doesnotexist'),
        /not found/,
      );
    });

    it('retrieves a writ that was just posted', async () => {
      const posted = await clerk.post({ title: 'Show me', body: 'Body' });
      const fetched = await clerk.show(posted.id);

      assert.equal(fetched.id, posted.id);
      assert.equal(fetched.title, 'Show me');
      assert.equal(fetched.status, 'ready');
    });
  });

  // ── list() ───────────────────────────────────────────────────────

  describe('list()', () => {
    beforeEach(() => {
      setup({ clerkConfig: { writTypes: [{ name: 'errand', description: 'A small errand' }] } });
    });

    it('returns all writs when no filters given', async () => {
      await clerk.post({ title: 'Writ A', body: 'Body' });
      await clerk.post({ title: 'Writ B', body: 'Body' });
      await clerk.post({ title: 'Writ C', body: 'Body' });

      const all = await clerk.list();
      assert.equal(all.length, 3);
    });

    it('filters by status', async () => {
      const w1 = await clerk.post({ title: 'Ready writ', body: 'Body' });
      const w2 = await clerk.post({ title: 'Active writ', body: 'Body' });
      await clerk.transition(w2.id, 'active');

      const ready = await clerk.list({ status: 'ready' });
      const active = await clerk.list({ status: 'active' });

      assert.equal(ready.length, 1);
      assert.equal(ready[0]!.id, w1.id);
      assert.equal(active.length, 1);
      assert.equal(active[0]!.id, w2.id);
    });

    it('filters by type', async () => {
      await clerk.post({ title: 'Mandate writ', body: 'Body', type: 'mandate' });
      await clerk.post({ title: 'Errand writ', body: 'Body', type: 'errand' });

      const mandates = await clerk.list({ type: 'mandate' });
      const errands = await clerk.list({ type: 'errand' });

      assert.equal(mandates.length, 1);
      assert.equal(mandates[0]!.type, 'mandate');
      assert.equal(errands.length, 1);
      assert.equal(errands[0]!.type, 'errand');
    });

    it('respects the limit parameter', async () => {
      for (let i = 0; i < 5; i++) {
        await clerk.post({ title: `Writ ${i}`, body: 'Body' });
      }

      const limited = await clerk.list({ limit: 3 });
      assert.equal(limited.length, 3);
    });

    it('respects the offset parameter', async () => {
      for (let i = 0; i < 5; i++) {
        await clerk.post({ title: `Writ ${i}`, body: 'Body' });
      }

      const all = await clerk.list();
      const offset = await clerk.list({ offset: 2 });
      assert.equal(offset.length, 3);
      assert.equal(offset[0]!.id, all[2]!.id);
    });

    it('returns an empty array when no writs match filters', async () => {
      await clerk.post({ title: 'One ready writ', body: 'Body' });
      const completed = await clerk.list({ status: 'completed' });
      assert.equal(completed.length, 0);
    });
  });

  // ── count() ──────────────────────────────────────────────────────

  describe('count()', () => {
    beforeEach(() => { setup(); });

    it('returns total count with no filters', async () => {
      await clerk.post({ title: 'Writ A', body: 'Body' });
      await clerk.post({ title: 'Writ B', body: 'Body' });
      assert.equal(await clerk.count(), 2);
    });

    it('returns 0 when no writs exist', async () => {
      assert.equal(await clerk.count(), 0);
    });

    it('filters by status', async () => {
      const w = await clerk.post({ title: 'Writ', body: 'Body' });
      await clerk.transition(w.id, 'active');

      assert.equal(await clerk.count({ status: 'active' }), 1);
      assert.equal(await clerk.count({ status: 'ready' }), 0);
    });

    it('filters by type', async () => {
      setup({ clerkConfig: { writTypes: [{ name: 'errand', description: 'A small errand' }] } });
      await clerk.post({ title: 'Mandate', body: 'Body', type: 'mandate' });
      await clerk.post({ title: 'Errand', body: 'Body', type: 'errand' });

      assert.equal(await clerk.count({ type: 'mandate' }), 1);
      assert.equal(await clerk.count({ type: 'errand' }), 1);
    });
  });

  // ── transition() — ready → active ───────────────────────────────

  describe('transition() to active', () => {
    beforeEach(() => { setup(); });

    it('transitions a ready writ to active', async () => {
      const writ = await clerk.post({ title: 'Accept me', body: 'Body' });
      const updated = await clerk.transition(writ.id, 'active');

      assert.equal(updated.status, 'active');
      assert.ok(updated.acceptedAt);
      assert.equal(updated.resolvedAt, undefined);
    });

    it('sets updatedAt on transition', async () => {
      const writ = await clerk.post({ title: 'Timestamps', body: 'Body' });
      // Ensure a tiny gap so updatedAt can differ
      await new Promise(r => setTimeout(r, 2));
      const updated = await clerk.transition(writ.id, 'active');
      assert.ok(updated.updatedAt >= writ.updatedAt);
    });

    it('throws if writ does not exist', async () => {
      await assert.rejects(
        () => clerk.transition('w-ghost', 'active'),
        /not found/,
      );
    });

    it('throws if writ is already active', async () => {
      const writ = await clerk.post({ title: 'Active writ', body: 'Body' });
      await clerk.transition(writ.id, 'active');

      await assert.rejects(
        () => clerk.transition(writ.id, 'active'),
        /Cannot transition/,
      );
    });

    it('throws if writ is in a terminal state', async () => {
      const writ = await clerk.post({ title: 'Completed writ', body: 'Body' });
      await clerk.transition(writ.id, 'active');
      await clerk.transition(writ.id, 'completed', { resolution: 'Done' });

      await assert.rejects(
        () => clerk.transition(writ.id, 'active'),
        /Cannot transition/,
      );
    });
  });

  // ── transition() — active → completed ───────────────────────────

  describe('transition() to completed', () => {
    beforeEach(() => { setup(); });

    it('transitions an active writ to completed', async () => {
      const writ = await clerk.post({ title: 'Complete me', body: 'Body' });
      await clerk.transition(writ.id, 'active');
      const completed = await clerk.transition(writ.id, 'completed', { resolution: 'All done' });

      assert.equal(completed.status, 'completed');
      assert.ok(completed.resolvedAt);
      assert.equal(completed.resolution, 'All done');
    });

    it('sets resolution on completed', async () => {
      const writ = await clerk.post({ title: 'With resolution', body: 'Body' });
      await clerk.transition(writ.id, 'active');
      const completed = await clerk.transition(writ.id, 'completed', { resolution: 'Task fulfilled' });
      assert.equal(completed.resolution, 'Task fulfilled');
    });

    it('throws when completing a ready writ (must accept first)', async () => {
      const writ = await clerk.post({ title: 'Not yet accepted', body: 'Body' });

      await assert.rejects(
        () => clerk.transition(writ.id, 'completed'),
        /Cannot transition/,
      );
    });

    it('throws when completing a cancelled writ', async () => {
      const writ = await clerk.post({ title: 'Cancelled', body: 'Body' });
      await clerk.transition(writ.id, 'cancelled');

      await assert.rejects(
        () => clerk.transition(writ.id, 'completed'),
        /Cannot transition/,
      );
    });
  });

  // ── transition() — active → failed ──────────────────────────────

  describe('transition() to failed', () => {
    beforeEach(() => { setup(); });

    it('transitions an active writ to failed', async () => {
      const writ = await clerk.post({ title: 'Fail me', body: 'Body' });
      await clerk.transition(writ.id, 'active');
      const failed = await clerk.transition(writ.id, 'failed', { resolution: 'Ran out of time' });

      assert.equal(failed.status, 'failed');
      assert.ok(failed.resolvedAt);
      assert.equal(failed.resolution, 'Ran out of time');
    });

    it('sets resolution on failed', async () => {
      const writ = await clerk.post({ title: 'Will fail', body: 'Body' });
      await clerk.transition(writ.id, 'active');
      const failed = await clerk.transition(writ.id, 'failed', { resolution: 'Something broke' });
      assert.equal(failed.resolution, 'Something broke');
    });

    it('throws when failing a ready writ', async () => {
      const writ = await clerk.post({ title: 'Not active', body: 'Body' });

      await assert.rejects(
        () => clerk.transition(writ.id, 'failed'),
        /Cannot transition/,
      );
    });

    it('throws when failing a completed writ', async () => {
      const writ = await clerk.post({ title: 'Already done', body: 'Body' });
      await clerk.transition(writ.id, 'active');
      await clerk.transition(writ.id, 'completed', { resolution: 'Done' });

      await assert.rejects(
        () => clerk.transition(writ.id, 'failed'),
        /Cannot transition/,
      );
    });
  });

  // ── transition() — ready|active → cancelled ──────────────────────

  describe('transition() to cancelled', () => {
    beforeEach(() => { setup(); });

    it('cancels a ready writ', async () => {
      const writ = await clerk.post({ title: 'Cancel me (ready)', body: 'Body' });
      const cancelled = await clerk.transition(writ.id, 'cancelled');

      assert.equal(cancelled.status, 'cancelled');
      assert.ok(cancelled.resolvedAt);
    });

    it('cancels an active writ', async () => {
      const writ = await clerk.post({ title: 'Cancel me (active)', body: 'Body' });
      await clerk.transition(writ.id, 'active');
      const cancelled = await clerk.transition(writ.id, 'cancelled');

      assert.equal(cancelled.status, 'cancelled');
      assert.ok(cancelled.resolvedAt);
    });

    it('sets resolution on cancelled when provided', async () => {
      const writ = await clerk.post({ title: 'Cancel with reason', body: 'Body' });
      const cancelled = await clerk.transition(writ.id, 'cancelled', { resolution: 'No longer needed' });
      assert.equal(cancelled.resolution, 'No longer needed');
    });

    it('throws when cancelling a completed writ', async () => {
      const writ = await clerk.post({ title: 'Done', body: 'Body' });
      await clerk.transition(writ.id, 'active');
      await clerk.transition(writ.id, 'completed', { resolution: 'Done' });

      await assert.rejects(
        () => clerk.transition(writ.id, 'cancelled'),
        /Cannot transition/,
      );
    });

    it('throws when cancelling a failed writ', async () => {
      const writ = await clerk.post({ title: 'Failed', body: 'Body' });
      await clerk.transition(writ.id, 'active');
      await clerk.transition(writ.id, 'failed', { resolution: 'Broke' });

      await assert.rejects(
        () => clerk.transition(writ.id, 'cancelled'),
        /Cannot transition/,
      );
    });

    it('throws when cancelling an already-cancelled writ', async () => {
      const writ = await clerk.post({ title: 'Cancelled twice', body: 'Body' });
      await clerk.transition(writ.id, 'cancelled');

      await assert.rejects(
        () => clerk.transition(writ.id, 'cancelled'),
        /Cannot transition/,
      );
    });
  });

  // ── Full lifecycle ───────────────────────────────────────────────

  describe('full lifecycle', () => {
    beforeEach(() => { setup(); });

    it('happy path: ready → active → completed', async () => {
      const writ = await clerk.post({ title: 'Full lifecycle', body: 'Do it all' });
      assert.equal(writ.status, 'ready');

      const active = await clerk.transition(writ.id, 'active');
      assert.equal(active.status, 'active');
      assert.ok(active.acceptedAt);
      assert.equal(active.resolvedAt, undefined);

      const done = await clerk.transition(writ.id, 'completed', { resolution: 'All finished' });
      assert.equal(done.status, 'completed');
      assert.ok(done.resolvedAt);
      assert.equal(done.resolution, 'All finished');

      // Verify persisted state via show()
      const persisted = await clerk.show(writ.id);
      assert.equal(persisted.status, 'completed');
    });

    it('failure path: ready → active → failed', async () => {
      const writ = await clerk.post({ title: 'Will fail', body: 'Body' });
      await clerk.transition(writ.id, 'active');
      const failed = await clerk.transition(writ.id, 'failed', { resolution: 'Something broke' });

      assert.equal(failed.status, 'failed');
      assert.equal(failed.resolution, 'Something broke');

      const persisted = await clerk.show(writ.id);
      assert.equal(persisted.status, 'failed');
    });

    it('cancellation path: ready → cancelled', async () => {
      const writ = await clerk.post({ title: 'Cancelled early', body: 'Body' });
      const cancelled = await clerk.transition(writ.id, 'cancelled');
      assert.equal(cancelled.status, 'cancelled');
    });

    it('updatedAt changes on each mutation', async () => {
      const writ = await clerk.post({ title: 'Track updates', body: 'Body' });
      const t0 = writ.updatedAt;

      await new Promise(r => setTimeout(r, 2));
      const active = await clerk.transition(writ.id, 'active');
      const t1 = active.updatedAt;

      await new Promise(r => setTimeout(r, 2));
      const done = await clerk.transition(writ.id, 'completed', { resolution: 'Done' });
      const t2 = done.updatedAt;

      assert.ok(t1 >= t0);
      assert.ok(t2 >= t1);
    });

    it('transition() strips managed fields from caller-supplied fields', async () => {
      const writ = await clerk.post({ title: 'Sanitize test', body: 'Body' });
      await clerk.transition(writ.id, 'active');

      // Attempt to corrupt id, status, and timestamps via fields
      const done = await clerk.transition(writ.id, 'completed', {
        resolution: 'Legit resolution',
        id: 'w-evil',
        status: 'ready' as const,
        createdAt: '1999-01-01T00:00:00Z',
        updatedAt: '1999-01-01T00:00:00Z',
        acceptedAt: '1999-01-01T00:00:00Z',
        resolvedAt: '1999-01-01T00:00:00Z',
      });

      // Managed fields should NOT be overridden
      assert.equal(done.id, writ.id);
      assert.equal(done.status, 'completed');
      assert.notEqual(done.createdAt, '1999-01-01T00:00:00Z');
      assert.notEqual(done.updatedAt, '1999-01-01T00:00:00Z');
      assert.notEqual(done.resolvedAt, '1999-01-01T00:00:00Z');
      // But resolution should pass through
      assert.equal(done.resolution, 'Legit resolution');
    });
  });

  // ── Config validation ────────────────────────────────────────────

  describe('config: writTypes validation', () => {
    it('built-in type mandate is always valid regardless of writTypes config', async () => {
      setup({ clerkConfig: { writTypes: [] } }); // empty writTypes — built-in still works
      const w1 = await clerk.post({ title: 'Mandate', body: 'Body', type: 'mandate' });
      assert.equal(w1.type, 'mandate');
    });

    it('summon is not a built-in type (must be declared)', async () => {
      setup({ clerkConfig: { writTypes: [] } });
      await assert.rejects(
        () => clerk.post({ title: 'Summon', body: 'Body', type: 'summon' }),
        /Unknown writ type/,
      );
    });

    it('declared custom types are accepted', async () => {
      setup({
        clerkConfig: {
          writTypes: [
            { name: 'quest', description: 'A significant task' },
            { name: 'errand', description: 'A small errand' },
          ],
        },
      });
      const w = await clerk.post({ title: 'Go on a quest', body: 'Body', type: 'quest' });
      assert.equal(w.type, 'quest');
    });

    it('undeclared types are rejected even when other custom types exist', async () => {
      setup({ clerkConfig: { writTypes: [{ name: 'quest', description: 'A quest' }] } });
      await assert.rejects(
        () => clerk.post({ title: 'Test', body: 'Body', type: 'unknown' }),
        /Unknown writ type/,
      );
    });

    it('defaultType from clerk config is validated against declared types', async () => {
      setup({
        clerkConfig: {
          writTypes: [{ name: 'errand', description: 'A small errand' }],
          defaultType: 'errand',
        },
      });
      const w = await clerk.post({ title: 'Default errand', body: 'Body' });
      assert.equal(w.type, 'errand');
    });
  });
});

=== FILE: packages/plugins/clerk/src/clerk.ts ===
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

import crypto from 'node:crypto';

import type { Plugin, StartupContext } from '@shardworks/nexus-core';
import { guild } from '@shardworks/nexus-core';
import type { StacksApi, Book, WhereClause } from '@shardworks/stacks-apparatus';

import type {
  ClerkApi,
  ClerkConfig,
  WritDoc,
  WritStatus,
  PostCommissionRequest,
  WritFilters,
} from './types.ts';

import {
  commissionPost,
  writShow,
  writList,
  writAccept,
  writComplete,
  writFail,
  writCancel,
} from './tools/index.ts';

// ── Built-in writ types ──────────────────────────────────────────────

const BUILTIN_TYPES = new Set(['mandate']);

// ── ID generation (ULID-like) ────────────────────────────────────────

function generateWritId(): string {
  const ts = Date.now().toString(36);
  const rand = crypto.randomBytes(6).toString('hex');
  return `w-${ts}${rand}`;
}

// ── Status machine ───────────────────────────────────────────────────

const ALLOWED_FROM: Record<WritStatus, WritStatus[]> = {
  active: ['ready'],
  completed: ['active'],
  failed: ['active'],
  cancelled: ['ready', 'active'],
  ready: [],
};

const TERMINAL_STATUSES = new Set<WritStatus>(['completed', 'failed', 'cancelled']);

// ── Factory ──────────────────────────────────────────────────────────

export function createClerk(): Plugin {
  let writs: Book<WritDoc>;

  // ── Helpers ──────────────────────────────────────────────────────

  function resolveClerkConfig(): ClerkConfig {
    return guild().guildConfig().clerk ?? {};
  }

  function resolveWritTypes(): Set<string> {
    const config = resolveClerkConfig();
    const declared = (config.writTypes ?? []).map((entry) => entry.name);
    return new Set([...BUILTIN_TYPES, ...declared]);
  }

  function resolveDefaultType(): string {
    const config = resolveClerkConfig();
    return config.defaultType ?? 'mandate';
  }

  function buildWhereClause(filters?: WritFilters): WhereClause | undefined {
    const conditions: WhereClause = [];
    if (filters?.status) {
      conditions.push(['status', '=', filters.status]);
    }
    if (filters?.type) {
      conditions.push(['type', '=', filters.type]);
    }
    return conditions.length > 0 ? conditions : undefined;
  }

  // ── API ──────────────────────────────────────────────────────────

  const api: ClerkApi = {
    async post(request: PostCommissionRequest): Promise<WritDoc> {
      const type = request.type ?? resolveDefaultType();
      const validTypes = resolveWritTypes();

      if (!validTypes.has(type)) {
        throw new Error(
          `Unknown writ type "${type}". Declared types: ${[...validTypes].join(', ')}.`,
        );
      }

      const now = new Date().toISOString();
      const writ: WritDoc = {
        id: generateWritId(),
        type,
        status: 'ready',
        title: request.title,
        body: request.body,
        ...(request.codex !== undefined ? { codex: request.codex } : {}),
        createdAt: now,
        updatedAt: now,
      };

      await writs.put(writ);
      return writ;
    },

    async show(id: string): Promise<WritDoc> {
      const writ = await writs.get(id);
      if (!writ) {
        throw new Error(`Writ "${id}" not found.`);
      }
      return writ;
    },

    async list(filters?: WritFilters): Promise<WritDoc[]> {
      const where = buildWhereClause(filters);
      const limit = filters?.limit ?? 20;
      const offset = filters?.offset;

      return writs.find({
        where,
        orderBy: ['createdAt', 'desc'],
        limit,
        ...(offset !== undefined ? { offset } : {}),
      });
    },

    async count(filters?: WritFilters): Promise<number> {
      const where = buildWhereClause(filters);
      return writs.count(where);
    },

    async transition(id: string, to: WritStatus, fields?: Partial<WritDoc>): Promise<WritDoc> {
      const writ = await writs.get(id);
      if (!writ) {
        throw new Error(`Writ "${id}" not found.`);
      }

      const allowedFrom = ALLOWED_FROM[to];
      if (!allowedFrom.includes(writ.status)) {
        throw new Error(
          `Cannot transition writ "${id}" to "${to}": status is "${writ.status}", expected one of: ${allowedFrom.join(', ')}.`,
        );
      }

      const now = new Date().toISOString();
      const isTerminal = TERMINAL_STATUSES.has(to);

      // Strip managed fields — callers cannot override id, status, or timestamps
      // controlled by the status machine.
      const { id: _id, status: _status, createdAt: _c, updatedAt: _u,
        acceptedAt: _a, resolvedAt: _r, ...safeFields } = (fields ?? {}) as WritDoc;

      const patch: Partial<Omit<WritDoc, 'id'>> = {
        status: to,
        updatedAt: now,
        ...(to === 'active' ? { acceptedAt: now } : {}),
        ...(isTerminal ? { resolvedAt: now } : {}),
        ...safeFields,
      };

      return writs.patch(id, patch);
    },
  };

  // ── Apparatus ────────────────────────────────────────────────────

  return {
    apparatus: {
      requires: ['stacks'],

      supportKit: {
        books: {
          writs: {
            indexes: ['status', 'type', 'createdAt', ['status', 'type'], ['status', 'createdAt']],
          },
        },
        tools: [
          commissionPost,
          writShow,
          writList,
          writAccept,
          writComplete,
          writFail,
          writCancel,
        ],
      },

      provides: api,

      start(_ctx: StartupContext): void {
        const stacks = guild().apparatus<StacksApi>('stacks');
        writs = stacks.book<WritDoc>('clerk', 'writs');
      },
    },
  };
}

=== FILE: packages/plugins/clerk/src/index.ts ===
/**
 * @shardworks/clerk-apparatus — The Clerk.
 *
 * Writ lifecycle management: post commissions, accept work, complete or fail
 * writs, and cancel them at any pre-terminal stage. Writs flow through a fixed
 * status machine and are persisted in The Stacks.
 *
 * See: docs/architecture/apparatus/clerk.md
 */

import { createClerk } from './clerk.ts';

// ── Clerk API ─────────────────────────────────────────────────────────

export {
  type ClerkApi,
  type ClerkConfig,
  type WritTypeEntry,
  type WritDoc,
  type WritStatus,
  type PostCommissionRequest,
  type WritFilters,
} from './types.ts';

export { createClerk } from './clerk.ts';

// ── Default export: the apparatus plugin ──────────────────────────────

export default createClerk();

=== FILE: packages/plugins/clerk/src/types.ts ===
/**
 * Clerk public types.
 *
 * All types exported from @shardworks/clerk-apparatus.
 */

// ── Writ status ──────────────────────────────────────────────────────

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

// ── Documents ────────────────────────────────────────────────────────

/**
 * A writ document as stored in The Stacks.
 */
export interface WritDoc {
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

// ── Requests ─────────────────────────────────────────────────────────

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

// ── Filters ──────────────────────────────────────────────────────────

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

// ── Configuration ───────────────────────────────────────────────

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

// Augment GuildConfig so `guild().guildConfig().clerk` is typed without
// requiring a manual type parameter at the call site.
declare module '@shardworks/nexus-core' {
  interface GuildConfig {
    clerk?: ClerkConfig;
  }
}

// ── API ──────────────────────────────────────────────────────────────

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


## Convention Reference (sibling files not modified by this commission)


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
- **No downstream coupling.** The Scriptorium has no dependency on the Surveyor, the Walker, or any other consumer of codex state. It is pure infrastructure. Downstream apparatus query or (future) subscribe to the Scriptorium's state independently.

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

Both methods return an `AnimateHandle` synchronously — a `{ chunks, result }` pair. The `result` promise resolves when the session completes. The `chunks` async iterable yields output when `streaming: true` is set; otherwise it completes immediately with no items. There is no separate streaming method — the `streaming` flag on the request controls the behavior, and the return shape is always the same.

The Animator does not assemble system prompts — that is The Loom's job. `summon()` delegates context composition to The Loom; `animate()` accepts a pre-composed `AnimaWeave` from any source. This separation means The Loom can evolve its composition model (adding role instructions, curricula, temperaments) without changing The Animator's interface.

---

## Dependencies

```
requires:   ['stacks']
recommends: ['loom']
```

- **The Stacks** (required) — records session results (the `sessions` book).
- **The Loom** (recommended) — composes session context for `summon()`. Not needed for `animate()`, which accepts a pre-composed context. Resolved at call time, not at startup — the Animator starts without the Loom, but `summon()` throws if it's not installed. Arbor emits a startup warning if the Loom is not installed.

---

## Kit Contribution

The Animator contributes a `sessions` book and session tools via its supportKit:

```typescript
supportKit: {
  books: {
    sessions: {
      indexes: ['startedAt', 'status', 'conversationId', 'provider'],
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

Returns: the complete session record from The Stacks, including `tokenUsage`, `metadata`, and all indexed fields.

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
  │     - context (AnimaWeave from Loom)
  │     - prompt (work prompt, bypasses Loom)
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
  │     - streaming flag passed through for provider to honor
  │     → provider returns { chunks, result } immediately
  │
  ├─ 4. Wrap provider result promise with recording:
  │     - On resolve: capture endedAt, durationMs, record to Stacks
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
}
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

## Future: Session Record Artifacts

The legacy session system writes a full **session record artifact** to disk (`.nexus/sessions/{uuid}.json`) containing the assembled system prompt, tool list, raw transcript, and full anima composition provenance. This artifact serves as a complete snapshot for debugging and ethnographic analysis.

The Animator MVP does not write artifacts to disk — it records structured data to The Stacks only. When session record artifacts are needed, the design options are:

1. **Animator writes artifacts** — the provider returns transcript data, and The Animator persists it alongside the Stacks record. Adds a `recordPath` field to the session entry.
2. **Separate apparatus** — a "Session Archive" apparatus subscribes to `session.ended` events and writes artifacts asynchronously. Decouples recording from the session hot path.

Blocked on: Event signalling (for option 2), transcript format standardization across providers.

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

=== CONTEXT FILE: docs/architecture/apparatus/parlour.md ===
# The Parlour — API Contract

Status: **Draft — MVP**

Package: `@shardworks/parlour` · Plugin id: `parlour`

> **⚠️ MVP scope.** This spec covers the core conversation lifecycle: creating conversations, registering participants, taking turns (with streaming), enforcing turn limits, and ending conversations. Inter-turn context assembly (`formatConveneMessage`) is included for convene conversations. There is no event signalling, no conversation-level cost budgets, and no pluggable turn-order strategies. See the Future sections for the target design.

---

## Purpose

The Parlour manages multi-turn conversations within the guild. It provides the structure for two kinds of interaction: **consult** (a human talks to an anima) and **convene** (multiple animas hold a structured dialogue). The Parlour tracks who is participating, whose turn it is, what has been said, and when the conversation ends.

The Parlour does not launch sessions itself — it delegates each turn to **The Animator**. The Parlour does not assemble prompts — it delegates that to **The Loom**. The Parlour orchestrates: it decides *when* and *for whom* to call the Animator, and assembles the inter-turn context that keeps each participant coherent across turns.

---

## Dependencies

```
requires: ['stacks', 'animator', 'loom']
```

- **The Stacks** — persists conversations (with nested participants) and turn records.
- **The Animator** — launches individual session turns (via `animate()` / `animateStreaming()`).
- **The Loom** — weaves the session context for each participant's turn.

---

## Support Kit

The Parlour contributes a `conversations` book and conversation management tools via its supportKit:

```typescript
supportKit: {
  books: {
    conversations: {
      indexes: ['status', 'kind', 'createdAt'],
    },
  },
  tools: [conversationList, conversationShow, conversationEnd],
},
```

### Document Shape

Participants are nested directly in the conversation document rather than stored in a separate book. This avoids N+1 queries on `list()` and `show()` operations — since Books has no join support, a separate participants book would require a per-conversation query to resolve participants. Conversations have a small, bounded number of participants (typically 2–5), so the nested document stays compact.

```typescript
interface ConversationDoc {
  id: string
  status: 'active' | 'concluded' | 'abandoned'
  kind: 'consult' | 'convene'
  topic: string | null
  turnLimit: number | null
  createdAt: string
  endedAt: string | null
  eventId: string | null
  participants: ParticipantRecord[]
}

interface ParticipantRecord {
  /** Stable participant id (generated at creation). */
  id: string
  kind: 'anima' | 'human'
  name: string
  /** Anima id, resolved at creation time. Null for human participants. */
  animaId: string | null
  /**
   * Provider session id for --resume. Updated after each turn so
   * the next turn can continue the provider's conversation context.
   */
  providerSessionId: string | null
}
```

The trade-off: updating a participant's `providerSessionId` after each turn requires a read-modify-write of the full conversation document. This is acceptable — the document is small and the write happens once per turn, not in a hot loop.

The one query this makes harder is "find all conversations involving anima X" — this requires a JSON path query on `participants[*].animaId` rather than a direct index lookup. This is a dashboard/analytics query, not an operational hot path, and The Stacks' JSON path queries handle it adequately.

### `conversation-list` tool

List conversations with optional filters. Returns conversation summaries ordered by `createdAt` descending (newest first).

| Parameter | Type | Description |
|---|---|---|
| `status` | `'active' \| 'concluded' \| 'abandoned'` | Filter by lifecycle status |
| `kind` | `'consult' \| 'convene'` | Filter by conversation kind |
| `limit` | `number` | Maximum results (default: 20) |

Returns: `ConversationSummary[]` — id, status, kind, topic, participants, turnCount, totalCostUsd.

### `conversation-show` tool

Show full detail for a conversation including all turns.

| Parameter | Type | Description |
|---|---|---|
| `id` | `string` | Conversation id |

Returns: `ConversationDetail` — full conversation record with participant list, per-turn session references, prompts, costs, and durations.

### `conversation-end` tool

End an active conversation.

| Parameter | Type | Description |
|---|---|---|
| `id` | `string` | Conversation id |
| `reason` | `'concluded' \| 'abandoned'` | Why the conversation ended (default: `'concluded'`) |

Idempotent — no error if the conversation is already ended.

---

## `ParlourApi` Interface (`provides`)

```typescript
interface ParlourApi {
  /**
   * Create a new conversation.
   *
   * Sets up conversation and participant records. Does NOT take a first
   * turn — that's a separate call to takeTurn().
   */
  create(request: CreateConversationRequest): Promise<CreateConversationResult>

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
  takeTurn(request: TakeTurnRequest): Promise<TurnResult>

  /**
   * Take a turn with streaming output.
   *
   * Same as takeTurn(), but yields ConversationChunks as the session
   * produces output. Includes a turn_complete chunk at the end.
   */
  takeTurnStreaming(request: TakeTurnRequest): {
    chunks: AsyncIterable<ConversationChunk>
    result: Promise<TurnResult>
  }

  /**
   * Get the next participant in a conversation.
   *
   * For convene: returns the next anima in round-robin order.
   * For consult: returns the anima participant (human turns are implicit).
   * Returns null if the conversation is not active or the turn limit is reached.
   */
  nextParticipant(conversationId: string): Promise<Participant | null>

  /**
   * End a conversation.
   *
   * Sets status to 'concluded' (normal end) or 'abandoned' (e.g. timeout,
   * disconnect). Idempotent — no error if already ended.
   */
  end(conversationId: string, reason?: 'concluded' | 'abandoned'): Promise<void>

  /**
   * List conversations with optional filters.
   */
  list(options?: ListConversationsOptions): Promise<ConversationSummary[]>

  /**
   * Show full detail for a conversation.
   */
  show(conversationId: string): Promise<ConversationDetail | null>
}
```

### Supporting Types

```typescript
interface CreateConversationRequest {
  /** Conversation kind. */
  kind: 'consult' | 'convene'
  /** Seed topic or prompt. Used as the initial message for the first turn. */
  topic?: string
  /** Maximum allowed turns. Null = unlimited. */
  turnLimit?: number
  /** Participants in the conversation. */
  participants: ParticipantDeclaration[]
  /** Triggering event id, for conversations started by clockworks. */
  eventId?: string
}

interface ParticipantDeclaration {
  kind: 'anima' | 'human'
  /** Display name. For anima participants, this is the anima name
   *  used to resolve identity via The Loom at turn time. */
  name: string
}

interface CreateConversationResult {
  conversationId: string
  participants: Participant[]
}

interface Participant {
  id: string
  name: string
  kind: 'anima' | 'human'
}

interface TakeTurnRequest {
  conversationId: string
  participantId: string
  /** The message for this turn. For consult: the human's message.
   *  For convene: typically assembled by the caller via formatMessage(),
   *  or omitted to let The Parlour assemble it automatically. */
  message?: string
}

interface TurnResult {
  /** The Animator's session result for this turn. Null for human turns. */
  sessionResult: SessionResult | null
  /** Turn number within the conversation (1-indexed). */
  turnNumber: number
  /** Whether the conversation is still active after this turn. */
  conversationActive: boolean
}

/** A chunk of output from a conversation turn. */
type ConversationChunk =
  | SessionChunk
  | { type: 'turn_complete'; turnNumber: number; costUsd?: number }

interface ConversationSummary {
  id: string
  status: 'active' | 'concluded' | 'abandoned'
  kind: 'consult' | 'convene'
  topic: string | null
  turnLimit: number | null
  createdAt: string
  endedAt: string | null
  participants: Participant[]
  /** Computed from session records. */
  turnCount: number
  /** Aggregate cost across all turns. */
  totalCostUsd: number
}

interface ConversationDetail extends ConversationSummary {
  turns: TurnSummary[]
}

interface TurnSummary {
  sessionId: string
  turnNumber: number
  participant: string
  prompt: string | null
  exitCode: number | null
  costUsd: number | null
  durationMs: number | null
  startedAt: string
  endedAt: string | null
}

interface ListConversationsOptions {
  status?: 'active' | 'concluded' | 'abandoned'
  kind?: 'consult' | 'convene'
  limit?: number
}
```

---

## Conversation Lifecycle

### Create

```
create(request)
  │
  ├─ 1. Generate conversation id
  ├─ 2. For each participant declaration:
  │     ├─ Generate participant id
  │     └─ Resolve animaId (for anima participants)
  ├─ 3. Write conversation document to The Stacks
  │     (status: 'active', participants nested inline)
  └─ 4. Return conversationId + participants
```

No session is launched at creation time. The first turn is a separate call.

### Take Turn (anima participant)

```
takeTurn(request)
  │
  ├─ 1. Read conversation state from The Stacks
  │     ├─ Verify status is 'active'
  │     └─ Verify turn limit not reached
  │
  ├─ 2. Determine turn number (count existing turns + 1)
  │
  ├─ 3. Assemble inter-turn message:
  │     ├─ First turn for this participant → use conversation topic
  │     └─ Subsequent turns → assemble messages from other participants
  │       since this participant's last turn (see § Inter-Turn Context)
  │
  ├─ 4. Weave context via The Loom (participant's anima name)
  │
  ├─ 5. Call The Animator:
  │     ├─ animate() or animateStreaming()
  │     ├─ conversationId for --resume
  │     └─ metadata: { trigger, conversationId, turnNumber, participantId }
  │
  ├─ 6. Update participant's providerSessionId in conversation doc
  │     (read-modify-write; enables --resume on next turn)
  │
  ├─ 7. If turn limit reached → auto-conclude conversation
  │
  └─ 8. Return TurnResult
```

### Take Turn (human participant)

Human turns do not launch sessions. The human's message is passed as context to the next anima turn via the inter-turn context assembly. The Parlour records that a human turn occurred (for turn counting and turn limit enforcement) but no Animator call is made.

### End

```
end(conversationId, reason)
  │
  ├─ 1. Read conversation from The Stacks
  ├─ 2. If already ended → no-op (idempotent)
  └─ 3. Update status to reason, set endedAt
```

---

## Inter-Turn Context

For convene conversations, each anima participant maintains their own session context via `--resume` (the provider's `conversationId`). Their session already contains their own prior messages and responses. When it's their turn again, The Parlour assembles only what happened *since their last turn* — the contributions of other participants.

```
Participant A's turn 3:
  - Read all turns since A's last turn (turn 1)
  - For each intervening turn (B's turn 2):
    - Read the session record artifact (if available)
    - Extract the assistant's text response from the transcript
  - Format as: "[B]: {response text}"
  - Pass as the message to A's session
```

On a participant's first turn, the conversation topic is used as the initial message.

For consult conversations, the pattern is simpler: the human's message is passed directly as the prompt to the anima's next turn.

**Dependency note:** Extracting responses from session transcripts requires access to session record artifacts (the JSON files written by The Animator). At MVP, this depends on The Animator writing artifacts to disk — see [Animator: Future: Session Record Artifacts](animator.md#future-session-record-artifacts). If artifacts are not available, the inter-turn message falls back to a placeholder (`[participant]: [response not available]`).

---

## Provider Session Continuity

Each anima participant in a conversation maintains session continuity across turns via the provider's `--resume` mechanism. The Parlour:

1. Passes `conversationId` to The Animator on each turn
2. Captures `providerSessionId` from the Animator's `SessionResult`
3. Stores it in the participant's `providerSessionId` field (in the conversation document)
4. Passes it back to The Animator on the participant's next turn

This allows the underlying AI process to maintain its full context window across turns without re-sending the entire conversation history.

### Workspace Persistence Constraint

The `--resume` mechanism depends on provider-specific session data stored on the local filesystem (e.g. Claude Code's `.claude/` directory). This creates a hard constraint: **all turns in a conversation must run in the same working directory**, or the session data needed for `--resume` will not be present.

This means:
- **Fresh temp worktrees per turn will not work.** The session data from turn 1 would be gone by turn 2.
- **A persistent workspace is required** — either the guildhall itself or a long-lived worktree that survives across turns.
- If a persistent workspace is not available, the fallback is to abandon `--resume` and re-send the full conversation context each turn. This works but costs more tokens and loses the provider's internal state (tool use history, reasoning context, etc.).

The Parlour must pass the same `cwd` to The Animator for every turn in a given conversation. The caller that creates the conversation is responsible for providing a workspace that will persist for the conversation's lifetime.

---

## Open Questions

- **Turn counting for human turns.** Do human turns count toward the turn limit? The legacy system counts only anima turns (sessions). For convene conversations this is clear (all turns are anima turns). For consult, should a turn limit of 10 mean 10 anima responses or 10 total exchanges (5 human + 5 anima)?
- **Conversation-level workspace.** Provider session continuity requires a persistent workspace across turns (see § Workspace Persistence Constraint). Should the `cwd` be set once at conversation creation and stored in the conversation document? Or is it the caller's responsibility to pass a consistent `cwd` on each `takeTurn()` call? Storing it on the conversation is safer (can't accidentally use different directories) but means the Parlour owns workspace lifecycle awareness.
- **Participant ordering.** The legacy uses insertion order for round-robin. Should The Parlour support explicit ordering or custom turn-order strategies?

---

## Future: Event Signalling

When Clockworks integration is available, The Parlour will signal conversation lifecycle events:

- **`conversation.started`** — fired after create(). Payload includes `conversationId`, `kind`, `topic`, participant names.
- **`conversation.turn-taken`** — fired after each turn. Payload includes `conversationId`, `turnNumber`, `participantName`, `sessionId`, `costUsd`.
- **`conversation.ended`** — fired after end() or auto-conclude. Payload includes `conversationId`, `reason`, `turnCount`, `totalCostUsd`.

These events enable clockworks standing orders to react to conversation activity (e.g. auto-summarize on conclusion, alert on high cost).

Blocked on: Clockworks apparatus spec finalization, Animator event signalling.

---

## Future: Conversation Cost Budgets

A `maxBudgetUsd` field on `CreateConversationRequest` that caps aggregate cost across all turns. The Parlour checks cumulative cost before each turn and auto-concludes if the budget would be exceeded.

---

## Future: Pluggable Turn-Order Strategies

The MVP uses round-robin for convene and simple alternation for consult. Future strategies might include:

- **Priority-based** — participants with higher priority speak more frequently
- **Facilitator-directed** — a designated facilitator anima decides who speaks next
- **Reactive** — participants speak when they have something to say (event-driven rather than scheduled)

This would require a `TurnOrderStrategy` interface and a configuration field on `CreateConversationRequest`.

---

## Implementation Notes

- **Cross-book queries.** The Parlour reads from both its own `conversations` book and The Animator's `sessions` book (for turn counts, cost aggregation, transcript extraction). This cross-apparatus read is via The Stacks' query API — no direct DB access.
- **Single-document access pattern.** With participants nested in the conversation document, most operations are single-document reads or read-modify-writes. The `takeTurn()` hot path reads one conversation doc, calls The Animator, then writes back the updated `providerSessionId`. No multi-book coordination needed.
- **No in-memory state.** All conversation state is persisted in The Stacks. The Parlour reads state fresh on each `takeTurn()` call. This makes it safe for concurrent callers and process restarts between turns.
- **Legacy migration.** The legacy `nexus-sessions` package combines session and conversation management in a single rig with separate `conversations` and `participants` books. The new architecture splits sessions (Animator) from conversations (Parlour) and nests participants inline. The Parlour's `conversations` book supersedes both legacy books.

=== CONTEXT FILE: packages/framework/core/src/plugin.ts ===
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

// ── Loaded plugin descriptors ──────────────────────────────────────────

/** A kit as tracked by the Arbor runtime. */
export interface LoadedKit {
  readonly packageName: string
  readonly id:          string
  readonly version:     string
  readonly kit:         Kit
}

/** An apparatus as tracked by the Arbor runtime. */
export interface LoadedApparatus {
  readonly packageName: string
  readonly id:          string
  readonly version:     string
  readonly apparatus:   Apparatus
}

/** Union of loaded kit and loaded apparatus. */
export type LoadedPlugin = LoadedKit | LoadedApparatus

// ── Context types ──────────────────────────────────────────────────────

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
  on(event: string, handler: (...args: unknown[]) => void | Promise<void>): void
}

// ── Kit ────────────────────────────────────────────────────────────────

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
  requires?:   string[]
  recommends?: string[]
  [key: string]: unknown
}

// ── Apparatus ─────────────────────────────────────────────────────────

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
  requires?:    string[]
  recommends?:  string[]
  provides?:    unknown
  start:        (ctx: StartupContext) => void | Promise<void>
  stop?:        () => void | Promise<void>
  supportKit?:  Kit
  consumes?:    string[]
}

// ── Plugin ─────────────────────────────────────────────────────────────

/**
 * The discriminated union plugin type. A plugin is either a kit or an apparatus.
 * The plugin name is always inferred from the npm package name at load time —
 * it is never declared in the manifest.
 */
export type Plugin =
  | { kit:       Kit }
  | { apparatus: Apparatus }

// ── Type guards ────────────────────────────────────────────────────────

/** Type guard: is this value a kit plugin export? */
export function isKit(obj: unknown): obj is { kit: Kit } {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'kit' in obj &&
    typeof (obj as { kit: unknown }).kit === 'object' &&
    (obj as { kit: unknown }).kit !== null &&
    !Array.isArray((obj as { kit: unknown }).kit)
  )
}

/** Type guard: is this value an apparatus plugin export? */
export function isApparatus(obj: unknown): obj is { apparatus: Apparatus } {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'apparatus' in obj &&
    typeof (obj as { apparatus: unknown }).apparatus === 'object' &&
    (obj as { apparatus: unknown }).apparatus !== null &&
    typeof (
      (obj as { apparatus: Record<string, unknown> }).apparatus.start
    ) === 'function'
  )
}

/** Type guard: narrows a LoadedPlugin to LoadedKit. */
export function isLoadedKit(p: LoadedPlugin): p is LoadedKit {
  return 'kit' in p
}

/** Type guard: narrows a LoadedPlugin to LoadedApparatus. */
export function isLoadedApparatus(p: LoadedPlugin): p is LoadedApparatus {
  return 'apparatus' in p
}

=== CONTEXT FILE: packages/framework/core/src/resolve-package.test.ts ===
import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { derivePluginId, resolvePackageNameForPluginId } from './resolve-package.ts';

describe('derivePluginId', () => {
  it('strips @shardworks scope', () => {
    assert.equal(derivePluginId('@shardworks/nexus-stdlib'), 'nexus-stdlib');
    assert.equal(derivePluginId('@shardworks/nexus-ledger'), 'nexus-ledger');
  });

  it('drops @ only for third-party scopes', () => {
    assert.equal(derivePluginId('@acme/my-tool'), 'acme/my-tool');
    assert.equal(derivePluginId('@other/foo'), 'other/foo');
  });

  it('passes through unscoped names', () => {
    assert.equal(derivePluginId('my-tool'), 'my-tool');
    assert.equal(derivePluginId('nexus-stdlib'), 'nexus-stdlib');
  });

  it('strips -kit suffix', () => {
    assert.equal(derivePluginId('my-relay-kit'), 'my-relay');
    assert.equal(derivePluginId('@shardworks/nexus-relay-kit'), 'nexus-relay');
  });

  it('strips -apparatus suffix', () => {
    assert.equal(derivePluginId('books-apparatus'), 'books');
    assert.equal(derivePluginId('@shardworks/books-apparatus'), 'books');
    assert.equal(derivePluginId('@acme/cache-apparatus'), 'acme/cache');
  });

  it('strips -plugin suffix', () => {
    assert.equal(derivePluginId('my-thing-plugin'), 'my-thing');
    assert.equal(derivePluginId('@shardworks/nexus-thing-plugin'), 'nexus-thing');
  });

  it('does not strip suffix-like substrings in the middle', () => {
    assert.equal(derivePluginId('my-kit-tools'), 'my-kit-tools');
    assert.equal(derivePluginId('apparatus-runner'), 'apparatus-runner');
  });
});

// ── resolvePackageNameForPluginId ────────────────────────────────────

describe('resolvePackageNameForPluginId', () => {
  let tmpDirs: string[] = [];

  function makeTmpDir(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'resolve-pkg-test-'));
    tmpDirs.push(dir);
    return dir;
  }

  function writePackageJson(dir: string, deps: Record<string, string>): void {
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({ name: 'test-guild', version: '1.0.0', dependencies: deps }),
    );
  }

  afterEach(() => {
    for (const dir of tmpDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    tmpDirs = [];
  });

  it('resolves @shardworks-scoped package without suffix', () => {
    const tmp = makeTmpDir();
    writePackageJson(tmp, { '@shardworks/nexus-stdlib': '^1.0.0' });
    assert.equal(resolvePackageNameForPluginId(tmp, 'nexus-stdlib'), '@shardworks/nexus-stdlib');
  });

  it('resolves @shardworks-scoped package with -apparatus suffix', () => {
    const tmp = makeTmpDir();
    writePackageJson(tmp, { '@shardworks/tools-apparatus': '^2.0.0' });
    assert.equal(resolvePackageNameForPluginId(tmp, 'tools'), '@shardworks/tools-apparatus');
  });

  it('resolves @shardworks-scoped package with -kit suffix', () => {
    const tmp = makeTmpDir();
    writePackageJson(tmp, { '@shardworks/nexus-relay-kit': '^1.0.0' });
    assert.equal(resolvePackageNameForPluginId(tmp, 'nexus-relay'), '@shardworks/nexus-relay-kit');
  });

  it('resolves @shardworks-scoped package with -plugin suffix', () => {
    const tmp = makeTmpDir();
    writePackageJson(tmp, { '@shardworks/nexus-thing-plugin': '^1.0.0' });
    assert.equal(resolvePackageNameForPluginId(tmp, 'nexus-thing'), '@shardworks/nexus-thing-plugin');
  });

  it('resolves unscoped package name', () => {
    const tmp = makeTmpDir();
    writePackageJson(tmp, { 'my-tool': '^1.0.0' });
    assert.equal(resolvePackageNameForPluginId(tmp, 'my-tool'), 'my-tool');
  });

  it('resolves unscoped package with -kit suffix', () => {
    const tmp = makeTmpDir();
    writePackageJson(tmp, { 'my-relay-kit': '^1.0.0' });
    assert.equal(resolvePackageNameForPluginId(tmp, 'my-relay'), 'my-relay-kit');
  });

  it('resolves third-party scoped package', () => {
    const tmp = makeTmpDir();
    writePackageJson(tmp, { '@acme/my-tool': '^1.0.0' });
    assert.equal(resolvePackageNameForPluginId(tmp, 'acme/my-tool'), '@acme/my-tool');
  });

  it('prefers @shardworks-scoped package when ambiguous', () => {
    const tmp = makeTmpDir();
    writePackageJson(tmp, {
      'nexus-stdlib': '^1.0.0',
      '@shardworks/nexus-stdlib': '^2.0.0',
    });
    assert.equal(resolvePackageNameForPluginId(tmp, 'nexus-stdlib'), '@shardworks/nexus-stdlib');
  });

  it('returns null when no matching dependency exists', () => {
    const tmp = makeTmpDir();
    writePackageJson(tmp, { 'other-package': '^1.0.0' });
    assert.equal(resolvePackageNameForPluginId(tmp, 'nonexistent'), null);
  });

  it('returns null when package.json is missing', () => {
    const tmp = makeTmpDir();
    assert.equal(resolvePackageNameForPluginId(tmp, 'anything'), null);
  });

  it('returns null when dependencies is empty', () => {
    const tmp = makeTmpDir();
    writePackageJson(tmp, {});
    assert.equal(resolvePackageNameForPluginId(tmp, 'anything'), null);
  });
});

=== CONTEXT FILE: packages/framework/core/src/resolve-package.ts ===
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

import fs from 'node:fs';
import path from 'node:path';

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
export function derivePluginId(packageName: string): string {
  // Step 1: strip scope
  let name: string;
  if (packageName.startsWith('@shardworks/')) {
    name = packageName.slice('@shardworks/'.length);
  } else if (packageName.startsWith('@')) {
    name = packageName.slice(1); // @acme/foo → acme/foo
  } else {
    name = packageName;
  }
  // Step 2: strip descriptor suffix
  return name.replace(/-(plugin|apparatus|kit)$/, '');
}

/**
 * Read a package.json from the guild's node_modules.
 * Returns the parsed JSON and version. Falls back gracefully.
 */
export function readGuildPackageJson(
  guildRoot: string,
  pkgName: string,
): { version: string; pkgJson: Record<string, unknown> | null } {
  const pkgJsonPath = path.join(guildRoot, 'node_modules', pkgName, 'package.json');
  try {
    const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8')) as Record<string, unknown>;
    return { version: (pkgJson.version as string) ?? 'unknown', pkgJson };
  } catch {
    return { version: 'unknown', pkgJson: null };
  }
}

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
export function resolvePackageNameForPluginId(guildRoot: string, pluginId: string): string | null {
  const pkgPath = path.join(guildRoot, 'package.json');
  let deps: string[] = [];
  try {
    const pkgJson = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as Record<string, unknown>;
    deps = Object.keys((pkgJson.dependencies as Record<string, string> | undefined) ?? {});
  } catch {
    return null;
  }

  let match: string | null = null;
  for (const dep of deps) {
    if (derivePluginId(dep) === pluginId) {
      // Prefer @shardworks-scoped packages (official namespace)
      if (dep.startsWith('@shardworks/')) return dep;
      // Keep the first match as fallback
      if (!match) match = dep;
    }
  }
  return match;
}

/**
 * Resolve the entry point for a guild-installed package.
 *
 * Reads the package's exports map to find the ESM entry point.
 * Returns an absolute path suitable for dynamic import().
 */
export function resolveGuildPackageEntry(guildRoot: string, pkgName: string): string {
  const pkgDir = path.join(guildRoot, 'node_modules', pkgName);
  const { pkgJson } = readGuildPackageJson(guildRoot, pkgName);

  if (pkgJson) {
    const exports = pkgJson.exports as Record<string, unknown> | string | undefined;
    if (exports) {
      if (typeof exports === 'string') return path.join(pkgDir, exports);
      const main = (exports as Record<string, unknown>)['.'];
      if (typeof main === 'string') return path.join(pkgDir, main);
      if (main && typeof main === 'object') {
        const importPath = (main as Record<string, string>).import;
        if (importPath) return path.join(pkgDir, importPath);
      }
    }
    if (pkgJson.main) return path.join(pkgDir, pkgJson.main as string);
  }

  return path.join(pkgDir, 'index.js');
}

=== CONTEXT FILE: packages/plugins/clerk/src/tools ===
tree f535cec8caf849b9e7c80815c30343012cf23102:packages/plugins/clerk/src/tools

commission-post.ts
index.ts
writ-accept.ts
writ-cancel.ts
writ-complete.ts
writ-fail.ts
writ-list.ts
writ-show.ts


## Codebase Structure (surrounding directories)

```
```

=== TREE: docs/architecture/apparatus/ ===
_template.md
animator.md
claude-code.md
clerk.md
dispatch.md
instrumentarium.md
loom.md
parlour.md
scriptorium.md
stacks.md

=== TREE: packages/framework/core/src/ ===
guild-config.ts
guild.ts
index.ts
nexus-home.ts
plugin.ts
resolve-package.test.ts
resolve-package.ts

=== TREE: packages/plugins/clerk/src/ ===
clerk.test.ts
clerk.ts
index.ts
tools
types.ts

```
```
