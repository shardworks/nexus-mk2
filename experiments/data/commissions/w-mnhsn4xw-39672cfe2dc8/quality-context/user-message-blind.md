## Commission Diff

```
```
 docs/architecture/apparatus/dispatch.md        | 4 +---
 docs/architecture/apparatus/loom.md            | 6 +++---
 packages/plugins/animator/src/animator.test.ts | 2 --
 packages/plugins/dispatch/src/dispatch.test.ts | 2 --
 packages/plugins/dispatch/src/dispatch.ts      | 1 -
 packages/plugins/loom/README.md                | 2 --
 packages/plugins/loom/src/loom.test.ts         | 5 -----
 packages/plugins/loom/src/loom.ts              | 2 --
 8 files changed, 4 insertions(+), 20 deletions(-)

diff --git a/docs/architecture/apparatus/dispatch.md b/docs/architecture/apparatus/dispatch.md
index 9ceb9f9..96f45b3 100644
--- a/docs/architecture/apparatus/dispatch.md
+++ b/docs/architecture/apparatus/dispatch.md
@@ -132,7 +132,6 @@ dispatch.next({ role: 'artificer' })
 │       cwd: draftRecord.path (or guild home),
 │       environment: {
 │         GIT_AUTHOR_EMAIL: `${writ.id}@nexus.local`,
-│         GIT_COMMITTER_EMAIL: `${writ.id}@nexus.local`,
 │       },
 │       metadata: { writId: writ.id, trigger: 'dispatch' }
 │     })
@@ -181,11 +180,10 @@ The Dispatch sets per-writ git identity via the `environment` field on the summo
 ```typescript
 environment: {
   GIT_AUTHOR_EMAIL: `${writ.id}@nexus.local`,
-  GIT_COMMITTER_EMAIL: `${writ.id}@nexus.local`,
 }
 ```
 
-This produces commits attributed to `Artificer <w-{writId}@nexus.local>`, enabling commit-level tracing back to the originating commission. The Animator merges these overrides with the Loom's defaults (request overrides weave) and passes the result to the session provider.
+This produces commits authored by `Artificer <w-{writId}@nexus.local>`, enabling commit-level tracing back to the originating commission. The committer identity is left to the system default so that commit signatures remain verified on GitHub. The Animator merges these overrides with the Loom's defaults (request overrides weave) and passes the result to the session provider.
 
 ### Error Handling
 
diff --git a/docs/architecture/apparatus/loom.md b/docs/architecture/apparatus/loom.md
index efd61eb..91d34c8 100644
--- a/docs/architecture/apparatus/loom.md
+++ b/docs/architecture/apparatus/loom.md
@@ -61,8 +61,8 @@ interface AnimaWeave {
    * any per-request environment overrides (request overrides weave).
    *
    * Default: git identity derived from the role name.
-   *   GIT_AUTHOR_NAME / GIT_COMMITTER_NAME = capitalized role (e.g. "Artificer")
-   *   GIT_AUTHOR_EMAIL / GIT_COMMITTER_EMAIL = role@nexus.local
+   *   GIT_AUTHOR_NAME = capitalized role (e.g. "Artificer")
+   *   GIT_AUTHOR_EMAIL = role@nexus.local
    */
   environment?: Record<string, string>
 }
@@ -70,7 +70,7 @@ interface AnimaWeave {
 
 The MVP Loom is a stub for system prompt composition — the value is in the seam, not the logic. The contract is stable: as composition is built out, `systemPrompt` gains a value but the shape doesn't change.
 
-The `environment` field is active at MVP: the Loom derives git identity from the role name and populates `GIT_AUTHOR_NAME`, `GIT_AUTHOR_EMAIL`, `GIT_COMMITTER_NAME`, and `GIT_COMMITTER_EMAIL`. The Animator merges these into the spawned process environment, giving each role a distinct git identity. Orchestrators (e.g. the Dispatch) can override specific variables per-request — for example, setting the email to a writ ID for per-commission attribution.
+The `environment` field is active at MVP: the Loom derives git identity from the role name and populates `GIT_AUTHOR_NAME` and `GIT_AUTHOR_EMAIL`. The committer identity is intentionally left to the system default so that commit signatures remain verified on GitHub. The Animator merges these into the spawned process environment, giving each role a distinct author identity. Orchestrators (e.g. the Dispatch) can override specific variables per-request — for example, setting the email to a writ ID for per-commission attribution.
 
 ---
 
diff --git a/packages/plugins/animator/src/animator.test.ts b/packages/plugins/animator/src/animator.test.ts
index 49575b8..185370f 100644
--- a/packages/plugins/animator/src/animator.test.ts
+++ b/packages/plugins/animator/src/animator.test.ts
@@ -825,8 +825,6 @@ describe('Animator', () => {
       assert.deepStrictEqual(captured!.environment, {
         GIT_AUTHOR_NAME: 'Artificer',
         GIT_AUTHOR_EMAIL: 'artificer@nexus.local',
-        GIT_COMMITTER_NAME: 'Artificer',
-        GIT_COMMITTER_EMAIL: 'artificer@nexus.local',
       });
     });
 
diff --git a/packages/plugins/dispatch/src/dispatch.test.ts b/packages/plugins/dispatch/src/dispatch.test.ts
index 038e56e..3bf68da 100644
--- a/packages/plugins/dispatch/src/dispatch.test.ts
+++ b/packages/plugins/dispatch/src/dispatch.test.ts
@@ -586,9 +586,7 @@ describe('Dispatch', () => {
       assert.ok(captured);
       assert.ok(captured!.environment, 'environment should be present');
       assert.equal(captured!.environment?.GIT_AUTHOR_EMAIL, `${writ.id}@nexus.local`);
-      assert.equal(captured!.environment?.GIT_COMMITTER_EMAIL, `${writ.id}@nexus.local`);
       assert.ok(captured!.environment?.GIT_AUTHOR_NAME, 'GIT_AUTHOR_NAME should be present');
-      assert.ok(captured!.environment?.GIT_COMMITTER_NAME, 'GIT_COMMITTER_NAME should be present');
     });
 
     it('preserves Loom role name in GIT_*_NAME while overriding email', async () => {
diff --git a/packages/plugins/dispatch/src/dispatch.ts b/packages/plugins/dispatch/src/dispatch.ts
index bf09302..922789b 100644
--- a/packages/plugins/dispatch/src/dispatch.ts
+++ b/packages/plugins/dispatch/src/dispatch.ts
@@ -101,7 +101,6 @@ export function createDispatch(): Plugin {
         cwd,
         environment: {
           GIT_AUTHOR_EMAIL: `${writ.id}@nexus.local`,
-          GIT_COMMITTER_EMAIL: `${writ.id}@nexus.local`,
         },
         metadata: { writId: writ.id, trigger: 'dispatch' },
       });
diff --git a/packages/plugins/loom/README.md b/packages/plugins/loom/README.md
index 6de4f18..2f65ac2 100644
--- a/packages/plugins/loom/README.md
+++ b/packages/plugins/loom/README.md
@@ -92,8 +92,6 @@ const weave = await loom.weave({ role: 'artificer' });
 //     environment: {
 //       GIT_AUTHOR_NAME: 'Artificer',
 //       GIT_AUTHOR_EMAIL: 'artificer@nexus.local',
-//       GIT_COMMITTER_NAME: 'Artificer',
-//       GIT_COMMITTER_EMAIL: 'artificer@nexus.local',
 //     }
 //   }
 ```
diff --git a/packages/plugins/loom/src/loom.test.ts b/packages/plugins/loom/src/loom.test.ts
index d108305..1f4c27a 100644
--- a/packages/plugins/loom/src/loom.test.ts
+++ b/packages/plugins/loom/src/loom.test.ts
@@ -282,8 +282,6 @@ describe('The Loom', () => {
       assert.deepStrictEqual(weave.environment, {
         GIT_AUTHOR_NAME: 'Artificer',
         GIT_AUTHOR_EMAIL: 'artificer@nexus.local',
-        GIT_COMMITTER_NAME: 'Artificer',
-        GIT_COMMITTER_EMAIL: 'artificer@nexus.local',
       });
     });
 
@@ -303,7 +301,6 @@ describe('The Loom', () => {
       const weave = await api.weave({ role: 'scribe' });
 
       assert.equal(weave.environment?.GIT_AUTHOR_NAME, 'Scribe');
-      assert.equal(weave.environment?.GIT_COMMITTER_NAME, 'Scribe');
     });
 
     it('derives environment even for unknown roles', async () => {
@@ -324,8 +321,6 @@ describe('The Loom', () => {
       assert.ok(weave.environment, 'environment should be defined for any role string');
       assert.equal(weave.environment?.GIT_AUTHOR_NAME, 'Unknown-role');
       assert.equal(weave.environment?.GIT_AUTHOR_EMAIL, 'unknown-role@nexus.local');
-      assert.equal(weave.environment?.GIT_COMMITTER_NAME, 'Unknown-role');
-      assert.equal(weave.environment?.GIT_COMMITTER_EMAIL, 'unknown-role@nexus.local');
     });
   });
 });
diff --git a/packages/plugins/loom/src/loom.ts b/packages/plugins/loom/src/loom.ts
index dbc70a2..f653ad2 100644
--- a/packages/plugins/loom/src/loom.ts
+++ b/packages/plugins/loom/src/loom.ts
@@ -126,8 +126,6 @@ export function createLoom(): Plugin {
         weave.environment = {
           GIT_AUTHOR_NAME: displayName,
           GIT_AUTHOR_EMAIL: `${request.role}@nexus.local`,
-          GIT_COMMITTER_NAME: displayName,
-          GIT_COMMITTER_EMAIL: `${request.role}@nexus.local`,
         };
       }
 
```
```

## Full File Contents (for context)


=== FILE: docs/architecture/apparatus/dispatch.md ===
# The Dispatch — API Contract

Status: **Draft**

Package: `@shardworks/dispatch-apparatus` · Plugin id: `dispatch`

> **⚠️ Temporary rigging.** This apparatus is a stand-in for the full rigging system (Walker, Formulary, Executor). It provides a single dispatch tool that takes the oldest ready writ and runs it through the guild's existing machinery. When the full rigging system exists, this apparatus is retired and its responsibilities absorbed by the Walker and summon relay. Designed to be disposable.

---

## Purpose

The Dispatch is the guild's interim work runner. It bridges the gap between the Clerk (which tracks obligations) and the session machinery (which runs animas) — without the full rigging system.

It does one thing: find a ready writ and execute it. "Execute" means open a draft binding on the target codex, compose context for an anima via the Loom, launch a session via the Animator, and handle the aftermath (seal the draft, transition the writ). This is the minimum viable loop that turns a commission into delivered work.

The Dispatch does **not** decompose writs, manage engine chains, or run multiple steps. One writ, one session. If the session completes, the draft is sealed and the writ is completed. If it fails, the writ is failed. That's the whole lifecycle.

---

## Dependencies

```
requires: ['stacks', 'clerk', 'codexes', 'animator']
recommends: ['loom']
```

- **The Stacks** (required) — reads writs via the Clerk's book.
- **The Clerk** (required) — queries ready writs and transitions their status.
- **The Scriptorium** (required) — opens and seals draft bindings on the target codex.
- **The Animator** (required) — launches anima sessions. Uses `summon()` (high-level, Loom-composed) when the Loom is available, `animate()` (low-level) otherwise.
- **The Loom** (recommended) — composes session context (system prompt, tools, role instructions). Resolved at dispatch time via the Animator's `summon()`. Not a direct dependency of the Dispatch — it's the Animator that calls the Loom.

---

## Kit Interface

The Dispatch does not consume kit contributions. No `consumes` declaration.

---

## Support Kit

```typescript
supportKit: {
  tools: [dispatchNext],
},
```

### `dispatch-next` tool

Find the oldest ready writ and dispatch it. This is the primary entry point — callable from the CLI via `nsg dispatch-next` or programmatically.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `role` | `string` | no | Role to summon (default: `"artificer"`) |
| `dryRun` | `boolean` | no | If true, find and report the writ but don't dispatch |

Returns a dispatch summary: writ id, session id, outcome.

Permission: `dispatch:write`

Callable by: `cli` (patron-side operation, not an anima tool)

---

## `DispatchApi` Interface (`provides`)

```typescript
interface DispatchApi {
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
  next(request?: DispatchRequest): Promise<DispatchResult | null>
}

interface DispatchRequest {
  /** Role to summon. Default: 'artificer'. */
  role?: string
  /** If true, find and report the writ but don't dispatch. */
  dryRun?: boolean
}

interface DispatchResult {
  /** The writ that was dispatched. */
  writId: string
  /** The session id (from the Animator). Absent if dryRun. */
  sessionId?: string
  /** Terminal writ status after dispatch. Absent if dryRun. */
  outcome?: 'completed' | 'failed'
  /** Resolution text set on the writ. Absent if dryRun. */
  resolution?: string
  /** Whether this was a dry run. */
  dryRun: boolean
}
```

---

## Dispatch Lifecycle

```
dispatch.next({ role: 'artificer' })
│
├─ 1. Query Clerk: oldest writ where status = 'ready', ordered by createdAt asc
│     → if none found, return null
│
├─ 2. Clerk: transition writ ready → active
│
├─ 3. [if writ.codex] Scriptorium: openDraft({ codex: writ.codex })
│     → draftRecord (worktree path = session cwd)
│     → if no codex on writ, cwd = guild home
│
├─ 4. Animator: summon({
│       role,
│       prompt: <assembled from writ title + body>,
│       cwd: draftRecord.path (or guild home),
│       environment: {
│         GIT_AUTHOR_EMAIL: `${writ.id}@nexus.local`,
│       },
│       metadata: { writId: writ.id, trigger: 'dispatch' }
│     })
│     → { chunks, result }
│
├─ 5. Await result
│
├─ 6a. [success] Session completed normally
│      ├─ [if codex] Scriptorium: seal({ codex, branch: draft.branch })
│      ├─ [if codex] Scriptorium: push({ codex })
│      ├─ Clerk: transition writ active → completed
│      │    resolution = session result summary
│      └─ return DispatchResult { outcome: 'completed' }
│
└─ 6b. [failure] Session failed or errored
       ├─ [if codex] Scriptorium: abandonDraft({ codex, branch: draft.branch, force: true })
       ├─ Clerk: transition writ active → failed
       │    resolution = failure reason from session
       └─ return DispatchResult { outcome: 'failed' }
```

### Prompt Assembly

The dispatch prompt is assembled from the writ's fields. The anima receives enough context to understand its assignment and use the `writ-show` tool for full details:

```
You have been dispatched to fulfill a commission.

## Assignment

**Title:** {writ.title}

**Writ ID:** {writ.id}

{writ.body}
```

The prompt is intentionally minimal — the anima's curriculum and role instructions carry the craft knowledge. The Dispatch just delivers the assignment.

The Dispatch owns the writ transition — the anima does not call `writ-complete` or `writ-fail`. The Dispatch observes the session outcome and transitions the writ accordingly. This keeps writ lifecycle management out of the anima's instructions, which simplifies the prompt and avoids relying on animas to self-report correctly.

### Git Identity

The Dispatch sets per-writ git identity via the `environment` field on the summon request. The Loom provides role-level defaults (e.g. `GIT_AUTHOR_NAME=Artificer`, `GIT_AUTHOR_EMAIL=artificer@nexus.local`). The Dispatch overrides the email with the writ ID for per-commission attribution:

```typescript
environment: {
  GIT_AUTHOR_EMAIL: `${writ.id}@nexus.local`,
}
```

This produces commits authored by `Artificer <w-{writId}@nexus.local>`, enabling commit-level tracing back to the originating commission. The committer identity is left to the system default so that commit signatures remain verified on GitHub. The Animator merges these overrides with the Loom's defaults (request overrides weave) and passes the result to the session provider.

### Error Handling

- **No ready writs:** `next()` returns null. Not an error.
- **Draft open fails:** Writ transitions to `failed` with resolution describing the Scriptorium error. No session launched.
- **Session fails:** Draft abandoned, writ failed. The Animator already records the session result to the Stacks.
- **Seal fails (contention):** Writ transitions to `failed`. The draft is NOT abandoned — the inscriptions are preserved for manual recovery or re-dispatch. Resolution describes the seal failure.
- **Push fails:** Same as seal failure — writ failed, draft preserved.

---

## Configuration

No configuration. The Dispatch reads writs from the Clerk and uses default behaviors for all apparatus calls. The role is specified per dispatch via the tool parameter.

---

## Open Questions

- **Should dispatch-next accept a specific writ id?** The current design always picks the oldest ready writ. An `id` parameter would let the patron dispatch a specific commission. Probably useful — but adds complexity (what if the writ isn't ready? what if it doesn't exist?). Could add later.

---

## Future: Retirement

When the full rigging system (Walker, Formulary, Executor) is implemented, the Dispatch apparatus is retired:

- The Walker takes over rig spawning and engine traversal
- The summon relay handles anima dispatch from standing orders
- The Formulary resolves engine chains (draft-open → session → seal is just one possible chain)
- `dispatch-next` is replaced by the Clockworks processing `mandate.ready` events

The Dispatch is designed to be removable with zero impact on the Clerk, Scriptorium, Animator, or Loom. It is a consumer of their APIs, not a provider of anything they depend on.

---

## Implementation Notes

- Small apparatus — types, core dispatch logic, one tool, barrel. ~5 source files.
- The `next()` method is the entire API surface. No books, no state, no CDC. Pure orchestration.
- The Dispatch queries the Clerk's writs book via `clerk.list({ status: 'ready' })` with a limit of 1 and ordered by `createdAt` asc. The `['status', 'createdAt']` compound index on the writs book makes this efficient.
- Session `cwd` is the draft worktree path when a codex is specified, or the guild home directory otherwise.
- The prompt template is hardcoded in the apparatus, not configurable. This is disposable infrastructure — configurability is wasted investment.

=== FILE: docs/architecture/apparatus/loom.md ===
# The Loom — API Contract

Status: **Draft — MVP**

Package: `@shardworks/loom-apparatus` · Plugin id: `loom`

> **⚠️ MVP scope.** This spec covers the seam only — the Loom accepts a role name and returns an `AnimaWeave`, but does not yet compose a system prompt. Role resolution, tool instructions, anima identity, curricula, temperaments, and charter composition are all future work. See [Future: Full Composition](#future-full-composition) for the target design.

---

## Purpose

The Loom weaves anima identity into session contexts. Given a role name, it produces an `AnimaWeave` — the composed identity context that The Animator uses to launch a session. The work prompt (what the anima should do) is not the Loom's concern — it bypasses the Loom and goes directly from the caller to the session provider.

MVP: system prompt composition is not yet implemented — `weave()` returns an empty `AnimaWeave` (systemPrompt undefined). The role is accepted on the API surface but not yet used. The seam exists so The Animator never assembles prompts itself; as composition is built out, The Loom's internals change but its output shape stays the same.

---

## Dependencies

```
requires: []    — MVP has no apparatus dependencies
```

---

## `LoomApi` Interface (`provides`)

```typescript
interface LoomApi {
  /**
   * Weave an anima's session context.
   *
   * Given a role name, produces an AnimaWeave containing the composed
   * system prompt. MVP: returns undefined for systemPrompt.
   */
  weave(request: WeaveRequest): Promise<AnimaWeave>
}

interface WeaveRequest {
  /**
   * The role to weave context for (e.g. 'artificer', 'scribe').
   * MVP: accepted but not used. Future: resolves role instructions,
   * curriculum, temperament, and composes the system prompt.
   */
  role?: string
}

/**
 * The output of The Loom's weave() — the composed anima identity context.
 * Contains the system prompt produced from the anima's identity layers,
 * and environment variables for the session process.
 * The work prompt is not part of the weave.
 */
interface AnimaWeave {
  /** The system prompt for the AI process. Undefined until composition is implemented. */
  systemPrompt?: string
  /**
   * Environment variables for the session process.
   * Derived from role configuration. The Animator merges these with
   * any per-request environment overrides (request overrides weave).
   *
   * Default: git identity derived from the role name.
   *   GIT_AUTHOR_NAME = capitalized role (e.g. "Artificer")
   *   GIT_AUTHOR_EMAIL = role@nexus.local
   */
  environment?: Record<string, string>
}
```

The MVP Loom is a stub for system prompt composition — the value is in the seam, not the logic. The contract is stable: as composition is built out, `systemPrompt` gains a value but the shape doesn't change.

The `environment` field is active at MVP: the Loom derives git identity from the role name and populates `GIT_AUTHOR_NAME` and `GIT_AUTHOR_EMAIL`. The committer identity is intentionally left to the system default so that commit signatures remain verified on GitHub. The Animator merges these into the spawned process environment, giving each role a distinct author identity. Orchestrators (e.g. the Dispatch) can override specific variables per-request — for example, setting the email to a writ ID for per-commission attribution.

---

## What The Loom does NOT do (MVP)

- **Compose system prompts** — the role is accepted but not used; systemPrompt is undefined.
- **Resolve roles or tools** — no role instructions, no tool instructions, no charter.
- **Read files from disk** — no file I/O at all.
- **Look up anima identity** — no identity records exist in MVP.
- **Handle work prompts** — the work prompt bypasses the Loom entirely.
- **Launch sessions** — that's The Animator's job.

---

## Future: Full Composition

When the session infrastructure matures, The Loom becomes the system's composition engine. The API shape (`weave(request) → AnimaWeave`) remains stable; the request may gain fields and the internals gain logic.

### Future `WeaveRequest`

```typescript
interface WeaveRequest {
  /** The role to compose for. Determines tool set and role instructions. */
  role: string
  /** Optional anima id. Resolves identity → curriculum → temperament. */
  animaId?: string
  /** Optional writ id. The Loom reads writ context from The Stacks. */
  writId?: string
}
```

### Future `AnimaWeave`

```typescript
interface AnimaWeave {
  systemPrompt: string
  /** The resolved tool set for this role. */
  tools: ResolvedTool[]
  /** Environment variables for the session process. */
  environment?: Record<string, string>
  /** The role this context was woven for. */
  role: string
}
```

### Future composition order

The system prompt is woven by combining, in order:

1. **Guild charter** — institutional policy, applies to all animas
2. **Curriculum** — what the anima knows (versioned, immutable per version)
3. **Temperament** — who the anima is (versioned, immutable per version)
4. **Role instructions** — read from the path in `guild.json` roles config
5. **Tool instructions** — per-tool `instructions.md` for the resolved tool set
6. **Writ context** — the specific work being done

### Future: System Prompt Appendix

The legacy session system supports a `systemPromptAppendix` — additional content appended to the system prompt after manifest assembly. This is used by clockworks to inject session protocol (e.g. writ completion requirements) without modifying the manifest itself.

**Open question:** Does this belong in The Loom or in the caller? Two options:

1. **Loom owns it** — `WeaveRequest` gains an `appendix?: string` field. The Loom appends it after composing the system prompt. Clean: all prompt assembly happens in one place.
2. **Caller owns it** — the caller (summon relay) concatenates the appendix to `AnimaWeave.systemPrompt` before passing to The Animator. Simple: no Loom changes needed.

The answer depends on whether the appendix is a *composition concern* (part of building the prompt) or a *dispatch concern* (context that only the caller knows). Writ protocol feels like dispatch — the Loom shouldn't need to know about writ lifecycle. But if other appendix use cases emerge (e.g. guild-wide policies injected per-session), it may belong in the Loom.

No decision required for MVP — the appendix feature is not needed until clockworks-driven sessions exist.

### Role Ownership and Permission Grants

The Loom is the owner of role definitions. Roles map to permission grants that the Instrumentarium uses to resolve tool sets. Role configuration lives in `guild.json` under the Loom's plugin id:

```json
{
  "loom": {
    "roles": {
      "artificer": {
        "permissions": ["stdlib:read", "stdlib:write", "stacks:read", "stacks:write"],
        "strict": false
      },
      "scribe": {
        "permissions": ["stdlib:read", "animator:read"],
        "strict": true
      },
      "admin": {
        "permissions": ["*:*"]
      }
    }
  }
}
```

Each role definition contains:

- **`permissions`** — an array of `plugin:level` grant strings. The Instrumentarium uses these to resolve which tools are available. See [The Instrumentarium § Permission Model](./instrumentarium.md#permission-model) for grant format and matching rules.
- **`strict`** (optional, default `false`) — when true, permissionless tools are excluded unless the role has `plugin:*` or `*:*` for that tool's plugin. Useful for locked-down roles that should only see explicitly granted tools.

The Loom resolves an anima's assigned roles into a flat permissions array (union across all roles), then passes it to `instrumentarium.resolve()` with `caller: 'anima'` — since the Loom only weaves anima sessions, this is a constant, not a parameter. The Instrumentarium is role-agnostic — it never sees role names, only permissions.

The resolved tool set is returned on the `AnimaWeave` so the Animator can pass it to the session provider for MCP server configuration. The Loom also reads each resolved tool's `instructions.md` and weaves them into the system prompt (see [Future composition order](#future-composition-order)).

### Future dependencies

```
requires: ['stacks', 'tools']
```

- **The Stacks** — reads anima identity records, writ context
- **The Instrumentarium** — resolves the permission-gated tool set and reads tool instructions

=== FILE: packages/plugins/animator/src/animator.test.ts ===
/**
 * Animator tests.
 *
 * Uses a fake session provider apparatus and in-memory Stacks backend to
 * test the full animate() lifecycle without spawning real processes.
 *
 * The fake provider is registered as an apparatus in the guild mock,
 * matching how real providers work (the Animator discovers them via
 * guild().apparatus(config.sessionProvider)).
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { setGuild, clearGuild } from '@shardworks/nexus-core';
import type { Guild } from '@shardworks/nexus-core';
import { createStacksApparatus } from '@shardworks/stacks-apparatus';
import { MemoryBackend } from '@shardworks/stacks-apparatus/testing';
import type { StacksApi } from '@shardworks/stacks-apparatus';

import { createLoom } from '@shardworks/loom-apparatus';
import type { LoomApi } from '@shardworks/loom-apparatus';

import { createAnimator } from './animator.ts';
import type {
  AnimatorApi,
  AnimatorSessionProvider,
  SessionProviderConfig,
  SessionProviderResult,
  SessionChunk,
  SessionDoc,
} from './types.ts';

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

function createFakeProvider(
  overrides: Partial<SessionProviderResult> = {},
): AnimatorSessionProvider {
  return {
    name: 'fake',
    launch(_config: SessionProviderConfig) {
      return {
        chunks: emptyChunks,
        result: Promise.resolve({
          status: 'completed' as const,
          exitCode: 0,
          providerSessionId: 'fake-sess-123',
          tokenUsage: {
            inputTokens: 1000,
            outputTokens: 500,
          },
          costUsd: 0.05,
          ...overrides,
        }),
      };
    },
  };
}

function createStreamingFakeProvider(
  streamChunks: SessionChunk[],
  overrides: Partial<SessionProviderResult> = {},
): AnimatorSessionProvider {
  return {
    name: 'fake-streaming',
    launch(config: SessionProviderConfig) {
      if (config.streaming) {
        let idx = 0;
        const asyncChunks: AsyncIterable<SessionChunk> = {
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
        };

        return {
          chunks: asyncChunks,
          result: Promise.resolve({
            status: 'completed' as const,
            exitCode: 0,
            providerSessionId: 'fake-stream-sess',
            ...overrides,
          }),
        };
      }

      // Non-streaming: return empty chunks
      return {
        chunks: emptyChunks,
        result: Promise.resolve({
          status: 'completed' as const,
          exitCode: 0,
          providerSessionId: 'fake-stream-sess',
          ...overrides,
        }),
      };
    },
  };
}

function createThrowingProvider(error: Error): AnimatorSessionProvider {
  return {
    name: 'fake-throwing',
    launch() {
      return {
        chunks: emptyChunks,
        result: Promise.reject(error),
      };
    },
  };
}

// ── Spy provider (captures the config passed to launch) ──────────────

function createSpyProvider(): {
  provider: AnimatorSessionProvider;
  getCapturedConfig: () => SessionProviderConfig | null;
} {
  let capturedConfig: SessionProviderConfig | null = null;

  return {
    provider: {
      name: 'fake-spy',
      launch(config: SessionProviderConfig) {
        capturedConfig = config;
        return {
          chunks: emptyChunks,
          result: Promise.resolve({ status: 'completed' as const, exitCode: 0 }),
        };
      },
    },
    getCapturedConfig: () => capturedConfig,
  };
}

// ── Test harness ─────────────────────────────────────────────────────

let stacks: StacksApi;
let animator: AnimatorApi;

/**
 * Set up the test environment with a guild mock, in-memory Stacks,
 * and the Animator apparatus. The provider is registered as an apparatus
 * that the Animator discovers via guild().apparatus('fake-provider').
 *
 * @param opts.installLoom — if true, installs The Loom apparatus (needed for summon() tests)
 */
function setup(
  provider: AnimatorSessionProvider = createFakeProvider(),
  sessionProviderPluginId = 'fake-provider',
  opts: { installLoom?: boolean } = {},
) {
  const memBackend = new MemoryBackend();
  const stacksPlugin = createStacksApparatus(memBackend);
  const animatorPlugin = createAnimator();

  // Apparatus registry for the guild mock
  const apparatusMap = new Map<string, unknown>();

  // Register the provider as an apparatus (same as a real guild would)
  apparatusMap.set(sessionProviderPluginId, provider);

  const fakeGuild: Guild = {
    home: '/tmp/fake-guild',
    apparatus<T>(name: string): T {
      const api = apparatusMap.get(name);
      if (!api) throw new Error(`Apparatus "${name}" not installed`);
      return api as T;
    },
    config<T>(pluginId: string): T {
      if (pluginId === 'animator') {
        return { sessionProvider: sessionProviderPluginId } as T;
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
        animator: { sessionProvider: sessionProviderPluginId },
      };
    },
    kits: () => [],
    apparatuses: () => [],
  };

  // Must set guild before starting apparatus that call guild() in start()
  setGuild(fakeGuild);

  // Optionally install The Loom (needed for summon() tests)
  if (opts.installLoom) {
    const loomPlugin = createLoom();
    const loomApparatus = (loomPlugin as { apparatus: { start: (ctx: unknown) => void; provides: unknown } }).apparatus;
    loomApparatus.start({ on: () => {} });
    apparatusMap.set('loom', loomApparatus.provides);
  }

  // Start stacks
  const stacksApparatus = (stacksPlugin as { apparatus: { start: (ctx: unknown) => void; provides: unknown } }).apparatus;
  stacksApparatus.start({ on: () => {} });
  stacks = stacksApparatus.provides as StacksApi;
  apparatusMap.set('stacks', stacks);

  // Ensure the animator's book is created
  memBackend.ensureBook({ ownerId: 'animator', book: 'sessions' }, {
    indexes: ['startedAt', 'status', 'conversationId', 'provider'],
  });

  // Start animator
  const animatorApparatus = (animatorPlugin as { apparatus: { start: (ctx: unknown) => void; provides: unknown } }).apparatus;
  animatorApparatus.start({ on: () => {} });
  animator = animatorApparatus.provides as AnimatorApi;
}

// ── Tests ────────────────────────────────────────────────────────────

describe('Animator', () => {
  afterEach(() => {
    clearGuild();
  });

  describe('animate()', () => {
    beforeEach(() => {
      setup();
    });

    it('returns an AnimateHandle with chunks and result', () => {
      const handle = animator.animate({
        context: { systemPrompt: 'Test' },
        cwd: '/tmp/workdir',
      });

      assert.ok(handle.chunks, 'should have chunks');
      assert.ok(handle.result instanceof Promise, 'result should be a Promise');
    });

    it('completes a session and records to Stacks', async () => {
      const result = await animator.animate({
        context: { systemPrompt: 'You are a test agent.' },
        cwd: '/tmp/workdir',
      }).result;

      assert.equal(result.status, 'completed');
      assert.equal(result.exitCode, 0);
      assert.equal(result.provider, 'fake');
      assert.ok(result.id.startsWith('ses-'));
      assert.ok(result.startedAt);
      assert.ok(result.endedAt);
      assert.equal(typeof result.durationMs, 'number');
      assert.equal(result.providerSessionId, 'fake-sess-123');
      assert.deepEqual(result.tokenUsage, { inputTokens: 1000, outputTokens: 500 });
      assert.equal(result.costUsd, 0.05);

      // Verify recorded in Stacks
      const sessions = stacks.readBook<SessionDoc>('animator', 'sessions');
      const doc = await sessions.get(result.id);
      assert.ok(doc);
      assert.equal(doc.status, 'completed');
      assert.equal(doc.provider, 'fake');
      assert.equal(doc.exitCode, 0);
    });

    it('records metadata as-is', async () => {
      const metadata = {
        trigger: 'summon',
        animaName: 'scribe',
        writId: 'wrt-abc123',
      };

      const result = await animator.animate({
        context: { systemPrompt: 'Test' },
        cwd: '/tmp/workdir',
        metadata,
      }).result;

      assert.deepEqual(result.metadata, metadata);

      const sessions = stacks.readBook<SessionDoc>('animator', 'sessions');
      const doc = await sessions.get(result.id);
      assert.deepEqual(doc?.metadata, metadata);
    });

    it('passes conversationId through', async () => {
      const result = await animator.animate({
        context: { systemPrompt: 'Test' },
        cwd: '/tmp/workdir',
        conversationId: 'conv-xyz',
      }).result;

      assert.equal(result.conversationId, 'conv-xyz');

      const sessions = stacks.readBook<SessionDoc>('animator', 'sessions');
      const doc = await sessions.get(result.id);
      assert.equal(doc?.conversationId, 'conv-xyz');
    });

    it('passes prompt and systemPrompt to provider', async () => {
      const { provider, getCapturedConfig } = createSpyProvider();
      setup(provider);

      await animator.animate({
        context: { systemPrompt: 'System prompt here' },
        prompt: 'Do the thing',
        cwd: '/tmp/workdir',
      }).result;

      const captured = getCapturedConfig();
      assert.ok(captured);
      assert.equal(captured!.systemPrompt, 'System prompt here');
      assert.equal(captured!.initialPrompt, 'Do the thing');
      assert.equal(captured!.model, 'sonnet');
      assert.equal(captured!.cwd, '/tmp/workdir');
    });

    it('passes context environment through to provider', async () => {
      const { provider, getCapturedConfig } = createSpyProvider();
      setup(provider);

      await animator.animate({
        context: { systemPrompt: 'Test', environment: { GIT_AUTHOR_NAME: 'Custom' } },
        cwd: '/tmp/workdir',
      }).result;

      const captured = getCapturedConfig();
      assert.ok(captured);
      assert.deepStrictEqual(captured!.environment, { GIT_AUTHOR_NAME: 'Custom' });
    });

    it('merges request environment over context environment', async () => {
      const { provider, getCapturedConfig } = createSpyProvider();
      setup(provider);

      await animator.animate({
        context: {
          systemPrompt: 'Test',
          environment: { GIT_AUTHOR_NAME: 'FromContext', GIT_AUTHOR_EMAIL: 'context@nexus.local' },
        },
        environment: { GIT_AUTHOR_NAME: 'FromRequest' },
        cwd: '/tmp/workdir',
      }).result;

      const captured = getCapturedConfig();
      assert.ok(captured);
      assert.equal(captured!.environment?.GIT_AUTHOR_NAME, 'FromRequest');
      assert.equal(captured!.environment?.GIT_AUTHOR_EMAIL, 'context@nexus.local');
    });

    it('records failed session when provider throws', async () => {
      const throwProvider = createThrowingProvider(new Error('Provider exploded'));
      setup(throwProvider);

      await assert.rejects(
        () => animator.animate({
          context: { systemPrompt: 'Test' },
          cwd: '/tmp/workdir',
        }).result,
        { message: 'Provider exploded' },
      );

      // Should still be recorded in Stacks
      const sessions = stacks.readBook<SessionDoc>('animator', 'sessions');
      const allDocs = await sessions.list();
      const failedDocs = allDocs.filter((d) => d.status === 'failed');
      assert.equal(failedDocs.length, 1);
      assert.equal(failedDocs[0]!.error, 'Provider exploded');
      assert.equal(failedDocs[0]!.exitCode, 1);
    });

    it('records provider-reported failure (not throw)', async () => {
      const failProvider = createFakeProvider({
        status: 'failed',
        exitCode: 2,
        error: 'Process crashed',
      });
      setup(failProvider);

      const result = await animator.animate({
        context: { systemPrompt: 'Test' },
        cwd: '/tmp/workdir',
      }).result;

      assert.equal(result.status, 'failed');
      assert.equal(result.exitCode, 2);
      assert.equal(result.error, 'Process crashed');
    });

    it('records timeout status', async () => {
      const timeoutProvider = createFakeProvider({
        status: 'timeout',
        exitCode: 124,
        error: 'Session timed out after 300s',
      });
      setup(timeoutProvider);

      const result = await animator.animate({
        context: { systemPrompt: 'Test' },
        cwd: '/tmp/workdir',
      }).result;

      assert.equal(result.status, 'timeout');
      assert.equal(result.exitCode, 124);
    });

    it('throws when session provider apparatus not installed', () => {
      // Set up with a bad provider plugin id
      setup(createFakeProvider(), 'nonexistent');
      // The provider IS registered at 'nonexistent', so the lookup will work.
      // Instead, set up a guild that has no apparatus at the configured id.
      clearGuild();

      const memBackend = new MemoryBackend();
      const stacksPlugin = createStacksApparatus(memBackend);
      const animatorPlugin = createAnimator();

      const apparatusMap = new Map<string, unknown>();

      setGuild({
        home: '/tmp/fake-guild',
        apparatus<T>(name: string): T {
          const api = apparatusMap.get(name);
          if (!api) throw new Error(`Apparatus "${name}" not installed`);
          return api as T;
        },
        config<T>(pluginId: string): T {
          if (pluginId === 'animator') {
            return { sessionProvider: 'missing-provider' } as T;
          }
          return {} as T;
        },
        writeConfig() { /* noop in test */ },
        guildConfig: () => ({
          name: 'test', nexus: '0.0.0', workshops: {}, roles: {},
          baseTools: [], plugins: [], settings: { model: 'sonnet' },
          animator: { sessionProvider: 'missing-provider' },
        }),
        kits: () => [],
        apparatuses: () => [],
      });

      const sa = (stacksPlugin as { apparatus: { start: (ctx: unknown) => void; provides: unknown } }).apparatus;
      sa.start({ on: () => {} });
      apparatusMap.set('stacks', sa.provides);
      memBackend.ensureBook({ ownerId: 'animator', book: 'sessions' }, { indexes: [] });

      const aa = (animatorPlugin as { apparatus: { start: (ctx: unknown) => void; provides: unknown } }).apparatus;
      aa.start({ on: () => {} });
      const a = aa.provides as AnimatorApi;

      // animate() resolves the provider synchronously — throws before
      // returning the AnimateHandle.
      assert.throws(
        () => a.animate({
          context: { systemPrompt: 'Test' },
          cwd: '/tmp/workdir',
        }),
        /missing-provider/,
      );
    });

    it('returns empty chunks when streaming is not requested', async () => {
      const { chunks, result } = animator.animate({
        context: { systemPrompt: 'Test' },
        cwd: '/tmp/workdir',
      });

      const collected: SessionChunk[] = [];
      for await (const chunk of chunks) {
        collected.push(chunk);
      }
      assert.equal(collected.length, 0);

      const sessionResult = await result;
      assert.equal(sessionResult.status, 'completed');
    });
  });

  describe('animate({ streaming: true })', () => {
    it('streams chunks and returns result', async () => {
      const testChunks: SessionChunk[] = [
        { type: 'text', text: 'Hello ' },
        { type: 'tool_use', tool: 'bash' },
        { type: 'tool_result', tool: 'bash' },
        { type: 'text', text: 'Done.' },
      ];

      setup(createStreamingFakeProvider(testChunks));

      const { chunks, result } = animator.animate({
        context: { systemPrompt: 'Test' },
        cwd: '/tmp/workdir',
        streaming: true,
      });

      const collected: SessionChunk[] = [];
      for await (const chunk of chunks) {
        collected.push(chunk);
      }

      assert.equal(collected.length, 4);
      assert.deepEqual(collected[0], { type: 'text', text: 'Hello ' });
      assert.deepEqual(collected[1], { type: 'tool_use', tool: 'bash' });

      const sessionResult = await result;
      assert.equal(sessionResult.status, 'completed');
      assert.ok(sessionResult.id.startsWith('ses-'));

      const sessions = stacks.readBook<SessionDoc>('animator', 'sessions');
      const doc = await sessions.get(sessionResult.id);
      assert.ok(doc);
      assert.equal(doc.status, 'completed');
    });

    it('returns empty chunks when provider ignores streaming flag', async () => {
      // createFakeProvider always returns empty chunks regardless of streaming
      setup(createFakeProvider());

      const { chunks, result } = animator.animate({
        context: { systemPrompt: 'Test' },
        cwd: '/tmp/workdir',
        streaming: true,
      });

      const collected: SessionChunk[] = [];
      for await (const chunk of chunks) {
        collected.push(chunk);
      }
      assert.equal(collected.length, 0);

      const sessionResult = await result;
      assert.equal(sessionResult.status, 'completed');
      assert.equal(sessionResult.provider, 'fake');
    });

    it('records failed streaming session', async () => {
      const failChunks: SessionChunk[] = [
        { type: 'text', text: 'Starting...' },
      ];

      setup(createStreamingFakeProvider(failChunks, {
        status: 'failed',
        exitCode: 1,
        error: 'Stream failed',
      }));

      const { result } = animator.animate({
        context: { systemPrompt: 'Test' },
        cwd: '/tmp/workdir',
        streaming: true,
      });

      const sessionResult = await result;
      assert.equal(sessionResult.status, 'failed');

      const sessions = stacks.readBook<SessionDoc>('animator', 'sessions');
      const doc = await sessions.get(sessionResult.id);
      assert.ok(doc);
      assert.equal(doc.status, 'failed');
    });
  });

  describe('session id generation', () => {
    beforeEach(() => {
      setup();
    });

    it('generates unique ids', async () => {
      const results = await Promise.all([
        animator.animate({ context: { systemPrompt: 'Test' }, cwd: '/tmp' }).result,
        animator.animate({ context: { systemPrompt: 'Test' }, cwd: '/tmp' }).result,
        animator.animate({ context: { systemPrompt: 'Test' }, cwd: '/tmp' }).result,
      ]);

      const ids = new Set(results.map((r) => r.id));
      assert.equal(ids.size, 3, 'All session ids should be unique');
    });

    it('ids follow ses-{base36_timestamp}-{hex_random} format', async () => {
      const result = await animator.animate({
        context: { systemPrompt: 'Test' },
        cwd: '/tmp',
      }).result;

      assert.match(result.id, /^ses-[a-z0-9]+-[a-f0-9]{8}$/);
    });
  });

  describe('summon()', () => {
    it('returns an AnimateHandle with chunks and result', () => {
      setup(createFakeProvider(), 'fake-provider', { installLoom: true });

      const handle = animator.summon({
        prompt: 'Build the frobnicator',
        cwd: '/tmp/workdir',
      });

      assert.ok(handle.chunks, 'should have chunks');
      assert.ok(handle.result instanceof Promise, 'result should be a Promise');
    });

    it('composes context via The Loom and launches a session', async () => {
      const { provider, getCapturedConfig } = createSpyProvider();
      setup(provider, 'fake-provider', { installLoom: true });

      const result = await animator.summon({
        prompt: 'Build the frobnicator',
        cwd: '/tmp/workdir',
      }).result;

      assert.equal(result.status, 'completed');
      assert.ok(result.id.startsWith('ses-'));

      // Verify the provider received the prompt as initialPrompt
      const captured = getCapturedConfig();
      assert.ok(captured);
      assert.equal(captured!.initialPrompt, 'Build the frobnicator');
      assert.equal(captured!.cwd, '/tmp/workdir');
      assert.equal(captured!.model, 'sonnet');
    });

    it('auto-populates trigger: summon in metadata', async () => {
      setup(createFakeProvider(), 'fake-provider', { installLoom: true });

      const result = await animator.summon({
        prompt: 'Do the thing',
        cwd: '/tmp/workdir',
      }).result;

      assert.equal(result.metadata?.trigger, 'summon');

      // Verify in Stacks too
      const sessions = stacks.readBook<SessionDoc>('animator', 'sessions');
      const doc = await sessions.get(result.id);
      assert.equal(doc?.metadata?.trigger, 'summon');
    });

    it('merges caller metadata with auto-generated metadata', async () => {
      setup(createFakeProvider(), 'fake-provider', { installLoom: true });

      const result = await animator.summon({
        prompt: 'Build it',
        cwd: '/tmp/workdir',
        metadata: {
          role: 'artificer',
          writId: 'wrt-abc123',
        },
      }).result;

      assert.equal(result.metadata?.trigger, 'summon');
      assert.equal(result.metadata?.role, 'artificer');
      assert.equal(result.metadata?.writId, 'wrt-abc123');
    });

    it('passes conversationId through for resume', async () => {
      const { provider, getCapturedConfig } = createSpyProvider();
      setup(provider, 'fake-provider', { installLoom: true });

      const result = await animator.summon({
        prompt: 'Continue working',
        cwd: '/tmp/workdir',
        conversationId: 'conv-resume-123',
      }).result;

      assert.equal(result.conversationId, 'conv-resume-123');

      const captured = getCapturedConfig();
      assert.equal(captured!.conversationId, 'conv-resume-123');
    });

    it('records session to Stacks', async () => {
      setup(createFakeProvider(), 'fake-provider', { installLoom: true });

      const result = await animator.summon({
        prompt: 'Build it',
        cwd: '/tmp/workdir',
      }).result;

      const sessions = stacks.readBook<SessionDoc>('animator', 'sessions');
      const doc = await sessions.get(result.id);
      assert.ok(doc);
      assert.equal(doc.status, 'completed');
      assert.equal(doc.metadata?.trigger, 'summon');
    });

    it('throws with clear error when Loom is not installed', async () => {
      // Setup WITHOUT the Loom
      setup(createFakeProvider());

      assert.throws(
        () => animator.summon({
          prompt: 'Build it',
          cwd: '/tmp/workdir',
        }),
        /Loom apparatus/,
      );
    });

    it('records failed session when provider throws', async () => {
      const throwProvider = createThrowingProvider(new Error('Session crashed'));
      setup(throwProvider, 'fake-provider', { installLoom: true });

      await assert.rejects(
        () => animator.summon({
          prompt: 'Build it',
          cwd: '/tmp/workdir',
        }).result,
        { message: 'Session crashed' },
      );

      // Failed session should still be recorded
      const sessions = stacks.readBook<SessionDoc>('animator', 'sessions');
      const allDocs = await sessions.list();
      const failedDocs = allDocs.filter((d) => d.status === 'failed');
      assert.equal(failedDocs.length, 1);
      assert.equal(failedDocs[0]!.metadata?.trigger, 'summon');
    });

    it('Loom produces undefined systemPrompt at MVP', async () => {
      const { provider, getCapturedConfig } = createSpyProvider();
      setup(provider, 'fake-provider', { installLoom: true });

      await animator.summon({
        prompt: 'Build the thing',
        cwd: '/tmp/workdir',
      }).result;

      const captured = getCapturedConfig();
      assert.equal(captured!.systemPrompt, undefined);
    });

    it('records role in metadata when provided', async () => {
      setup(createFakeProvider(), 'fake-provider', { installLoom: true });

      const result = await animator.summon({
        prompt: 'Build it',
        role: 'artificer',
        cwd: '/tmp/workdir',
      }).result;

      assert.equal(result.metadata?.trigger, 'summon');
      assert.equal(result.metadata?.role, 'artificer');
    });

    it('omits role from metadata when not provided', async () => {
      setup(createFakeProvider(), 'fake-provider', { installLoom: true });

      const result = await animator.summon({
        prompt: 'Build it',
        cwd: '/tmp/workdir',
      }).result;

      assert.equal(result.metadata?.trigger, 'summon');
      assert.ok(!('role' in (result.metadata ?? {})));
    });

    it('prompt bypasses the Loom and goes directly to provider', async () => {
      const { provider, getCapturedConfig } = createSpyProvider();
      setup(provider, 'fake-provider', { installLoom: true });

      await animator.summon({
        prompt: 'Build the frobnicator',
        role: 'artificer',
        cwd: '/tmp/workdir',
      }).result;

      const captured = getCapturedConfig();
      assert.ok(captured);
      assert.equal(captured!.initialPrompt, 'Build the frobnicator');
      assert.equal(captured!.systemPrompt, undefined);
    });

    it('returns empty chunks when streaming is not requested', async () => {
      setup(createFakeProvider(), 'fake-provider', { installLoom: true });

      const { chunks, result } = animator.summon({
        prompt: 'Build it',
        cwd: '/tmp/workdir',
      });

      const collected: SessionChunk[] = [];
      for await (const chunk of chunks) {
        collected.push(chunk);
      }
      assert.equal(collected.length, 0);

      const sessionResult = await result;
      assert.equal(sessionResult.status, 'completed');
    });

    it('passes Loom environment to provider when no request environment', async () => {
      const { provider, getCapturedConfig } = createSpyProvider();
      setup(provider, 'fake-provider', { installLoom: true });

      await animator.summon({
        prompt: 'Build the thing',
        role: 'artificer',
        cwd: '/tmp/workdir',
      }).result;

      const captured = getCapturedConfig();
      assert.ok(captured);
      assert.deepStrictEqual(captured!.environment, {
        GIT_AUTHOR_NAME: 'Artificer',
        GIT_AUTHOR_EMAIL: 'artificer@nexus.local',
      });
    });

    it('merges request environment over Loom environment', async () => {
      const { provider, getCapturedConfig } = createSpyProvider();
      setup(provider, 'fake-provider', { installLoom: true });

      await animator.summon({
        prompt: 'Build the thing',
        role: 'artificer',
        cwd: '/tmp/workdir',
        environment: { GIT_AUTHOR_EMAIL: 'override@nexus.local' },
      }).result;

      const captured = getCapturedConfig();
      assert.ok(captured);
      assert.equal(captured!.environment?.GIT_AUTHOR_NAME, 'Artificer');
      assert.equal(captured!.environment?.GIT_AUTHOR_EMAIL, 'override@nexus.local');
    });
  });
});

=== FILE: packages/plugins/dispatch/src/dispatch.test.ts ===
/**
 * Dispatch apparatus tests.
 *
 * Uses a fake session provider, in-memory Stacks, real Clerk, real Animator,
 * real Loom, and a fake Scriptorium to test the full dispatch lifecycle
 * without spawning real AI processes or touching git.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { setGuild, clearGuild } from '@shardworks/nexus-core';
import type { Guild, GuildConfig } from '@shardworks/nexus-core';
import { createStacksApparatus } from '@shardworks/stacks-apparatus';
import { MemoryBackend } from '@shardworks/stacks-apparatus/testing';
import type { StacksApi } from '@shardworks/stacks-apparatus';
import { createLoom } from '@shardworks/loom-apparatus';
import { createAnimator } from '@shardworks/animator-apparatus';
import type {
  AnimatorSessionProvider,
  SessionProviderConfig,
  SessionChunk,
} from '@shardworks/animator-apparatus';
import { createClerk } from '@shardworks/clerk-apparatus';
import type { ClerkApi } from '@shardworks/clerk-apparatus';
import type { ScriptoriumApi, DraftRecord, SealResult } from '@shardworks/codexes-apparatus';

import { createDispatch } from './dispatch.ts';
import type { DispatchApi } from './types.ts';

// ── Shared empty chunks ───────────────────────────────────────────────

const emptyChunks: AsyncIterable<SessionChunk> = {
  [Symbol.asyncIterator]() {
    return {
      async next() {
        return { value: undefined as unknown as SessionChunk, done: true as const };
      },
    };
  },
};

// ── Fake session provider ─────────────────────────────────────────────

interface FakeProviderOptions {
  status?: 'completed' | 'failed' | 'timeout';
  error?: string;
}

function createFakeProvider(options: FakeProviderOptions = {}): AnimatorSessionProvider {
  let callCount = 0;

  return {
    name: 'fake',
    launch(_config: SessionProviderConfig) {
      callCount++;
      const status = options.status ?? 'completed';
      return {
        chunks: emptyChunks,
        result: Promise.resolve({
          status,
          exitCode: status === 'completed' ? 0 : 1,
          providerSessionId: `fake-sess-${callCount}`,
          error: options.error,
        }),
      };
    },
  };
}

// ── Fake Scriptorium ──────────────────────────────────────────────────

interface FakeScriptoriumOptions {
  openDraftFails?: boolean;
  sealFails?: boolean;
  pushFails?: boolean;
}

function createFakeScriptorium(options: FakeScriptoriumOptions = {}): ScriptoriumApi {
  let draftCounter = 0;

  return {
    async openDraft({ codexName, associatedWith }): Promise<DraftRecord> {
      if (options.openDraftFails) throw new Error('openDraft: bare clone not ready');
      draftCounter++;
      return {
        id: `draft-${draftCounter}`,
        codexName,
        branch: `draft-test-${draftCounter}`,
        path: `/tmp/worktrees/${codexName}/draft-${draftCounter}`,
        createdAt: new Date().toISOString(),
        associatedWith,
      };
    },
    async seal(): Promise<SealResult> {
      if (options.sealFails) throw new Error('seal: merge conflict');
      return { success: true, strategy: 'fast-forward', retries: 0, sealedCommit: 'abc123def' };
    },
    async push(): Promise<void> {
      if (options.pushFails) throw new Error('push: remote rejected');
    },
    async abandonDraft(): Promise<void> {
      // no-op
    },
    async add() { throw new Error('not implemented'); },
    async list() { return []; },
    async show() { throw new Error('not implemented'); },
    async remove() {},
    async fetch() {},
    async listDrafts() { return []; },
  };
}

// ── Spy fake provider (captures SessionProviderConfig) ───────────────

function createSpyFakeProvider(): {
  provider: AnimatorSessionProvider;
  getCapturedConfig: () => SessionProviderConfig | null;
} {
  let capturedConfig: SessionProviderConfig | null = null;
  return {
    provider: {
      name: 'fake-spy',
      launch(config: SessionProviderConfig) {
        capturedConfig = config;
        return {
          chunks: emptyChunks,
          result: Promise.resolve({
            status: 'completed' as const,
            exitCode: 0,
            providerSessionId: 'fake-spy-sess',
          }),
        };
      },
    },
    getCapturedConfig: () => capturedConfig,
  };
}

// ── Test harness ──────────────────────────────────────────────────────

interface SetupOptions {
  provider?: AnimatorSessionProvider;
  scriptorium?: ScriptoriumApi;
}

interface TestContext {
  dispatch: DispatchApi;
  clerk: ClerkApi;
  scriptorium: ScriptoriumApi;
}

function setup(options: SetupOptions = {}): TestContext {
  const memBackend = new MemoryBackend();
  const stacksPlugin = createStacksApparatus(memBackend);
  const loomPlugin = createLoom();
  const animatorPlugin = createAnimator();
  const clerkPlugin = createClerk();
  const dispatchPlugin = createDispatch();

  const provider = options.provider ?? createFakeProvider();
  const scriptorium = options.scriptorium ?? createFakeScriptorium();

  const apparatusMap = new Map<string, unknown>();
  apparatusMap.set('fake-provider', provider);
  apparatusMap.set('codexes', scriptorium);

  const fakeGuildConfig: GuildConfig = {
    name: 'test-guild',
    nexus: '0.0.0',
    plugins: [],
    settings: { model: 'sonnet' },
    animator: { sessionProvider: 'fake-provider' },
  };

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
    writeConfig() {},
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

  // Ensure books
  memBackend.ensureBook({ ownerId: 'clerk', book: 'writs' }, {
    indexes: ['status', 'type', 'createdAt'],
  });
  memBackend.ensureBook({ ownerId: 'animator', book: 'sessions' }, {
    indexes: ['startedAt', 'status', 'conversationId', 'provider'],
  });

  // Start loom
  const loomApparatus = (loomPlugin as { apparatus: { start: (ctx: unknown) => void; provides: unknown } }).apparatus;
  loomApparatus.start({ on: () => {} });
  apparatusMap.set('loom', loomApparatus.provides);

  // Start animator
  const animatorApparatus = (animatorPlugin as { apparatus: { start: (ctx: unknown) => void; provides: unknown } }).apparatus;
  animatorApparatus.start({ on: () => {} });
  apparatusMap.set('animator', animatorApparatus.provides);

  // Start clerk
  const clerkApparatus = (clerkPlugin as { apparatus: { start: (ctx: unknown) => void; provides: unknown } }).apparatus;
  clerkApparatus.start({ on: () => {} });
  const clerk = clerkApparatus.provides as ClerkApi;
  apparatusMap.set('clerk', clerk);

  // Start dispatch
  const dispatchApparatus = (dispatchPlugin as { apparatus: { start: (ctx: unknown) => void; provides: unknown } }).apparatus;
  dispatchApparatus.start({ on: () => {} });
  const dispatch = dispatchApparatus.provides as DispatchApi;
  apparatusMap.set('dispatch', dispatch);

  return { dispatch, clerk, scriptorium };
}

// ── Tests ─────────────────────────────────────────────────────────────

describe('Dispatch', () => {
  afterEach(() => {
    clearGuild();
  });

  // ── No ready writs ────────────────────────────────────────────────

  describe('next() — empty queue', () => {
    it('returns null when there are no ready writs', async () => {
      const { dispatch } = setup();
      const result = await dispatch.next();
      assert.equal(result, null);
    });

    it('returns null when all writs are in terminal states', async () => {
      const { dispatch, clerk } = setup();
      const writ = await clerk.post({ title: 'Already done', body: '' });
      await clerk.transition(writ.id, 'active');
      await clerk.transition(writ.id, 'completed');

      const result = await dispatch.next();
      assert.equal(result, null);
    });
  });

  // ── Dry run ───────────────────────────────────────────────────────

  describe('next({ dryRun: true })', () => {
    it('returns the writ id without dispatching', async () => {
      const { dispatch, clerk } = setup();
      const writ = await clerk.post({ title: 'Dry run target', body: '' });

      const result = await dispatch.next({ dryRun: true });

      assert.ok(result);
      assert.equal(result.writId, writ.id);
      assert.equal(result.dryRun, true);
      assert.equal(result.sessionId, undefined);
      assert.equal(result.outcome, undefined);
    });

    it('does not transition the writ on dry run', async () => {
      const { dispatch, clerk } = setup();
      const writ = await clerk.post({ title: 'Stay ready', body: '' });

      await dispatch.next({ dryRun: true });

      const after = await clerk.show(writ.id);
      assert.equal(after?.status, 'ready');
    });

    it('returns null on dry run when no ready writs exist', async () => {
      const { dispatch } = setup();
      const result = await dispatch.next({ dryRun: true });
      assert.equal(result, null);
    });
  });

  // ── Success path — no codex ───────────────────────────────────────

  describe('next() — successful session, no codex', () => {
    it('transitions writ ready → active → completed', async () => {
      const { dispatch, clerk } = setup();
      const writ = await clerk.post({ title: 'No codex work', body: '' });

      const result = await dispatch.next();

      assert.ok(result);
      assert.equal(result.writId, writ.id);
      assert.equal(result.outcome, 'completed');
      assert.equal(result.dryRun, false);
      assert.ok(result.sessionId);
      assert.ok(result.resolution);

      const after = await clerk.show(writ.id);
      assert.equal(after?.status, 'completed');
    });

    it('uses the default role "artificer" when none specified', async () => {
      // Verifies no error from omitting role
      const { dispatch, clerk } = setup();
      await clerk.post({ title: 'Default role test', body: '' });

      const result = await dispatch.next();
      assert.ok(result);
      assert.equal(result.outcome, 'completed');
    });

    it('accepts an explicit role', async () => {
      const { dispatch, clerk } = setup();
      await clerk.post({ title: 'Scribe work', body: '' });

      const result = await dispatch.next({ role: 'scribe' });
      assert.ok(result);
      assert.equal(result.outcome, 'completed');
    });
  });

  // ── Success path — with codex ─────────────────────────────────────

  describe('next() — successful session, with codex', () => {
    it('opens draft, seals, pushes, and completes the writ', async () => {
      const openCalls: string[] = [];
      const sealCalls: string[] = [];
      const pushCalls: string[] = [];

      const scriptorium = createFakeScriptorium();
      // Wrap to track calls
      const trackingScriptorium: ScriptoriumApi = {
        ...scriptorium,
        async openDraft(req) {
          openCalls.push(req.codexName);
          return scriptorium.openDraft(req);
        },
        async seal(req) {
          sealCalls.push(req.codexName);
          return scriptorium.seal(req);
        },
        async push(req) {
          pushCalls.push(req.codexName);
          return scriptorium.push(req);
        },
      };

      const { dispatch, clerk } = setup({ scriptorium: trackingScriptorium });

      // Post a writ with a codex field (via index signature)
      const writ = await clerk.post({ title: 'Codex work', body: '' });
      // Patch the codex field onto the writ — WritDoc allows arbitrary fields
      // The Clerk doesn't expose codex patching, so we rely on the index signature
      // and test the no-codex path for Clerk-created writs.
      // For codex-bound writs, we test the Dispatch internals directly.
      // (A real commission-post would include codex; the Clerk API accepts it via [key: string]: unknown)

      // Dispatch the writ without codex (standard path)
      const result = await dispatch.next();
      assert.ok(result);
      assert.equal(result.outcome, 'completed');

      // No codex on the writ, so no draft ops expected
      assert.equal(openCalls.length, 0);
      assert.equal(sealCalls.length, 0);
      assert.equal(pushCalls.length, 0);

      const after = await clerk.show(writ.id);
      assert.equal(after?.status, 'completed');
    });
  });

  // ── Failure path — session fails ──────────────────────────────────

  describe('next() — session fails', () => {
    it('transitions writ to failed when session fails', async () => {
      const { dispatch, clerk } = setup({
        provider: createFakeProvider({ status: 'failed', error: 'Claude exited with code 1' }),
      });

      const writ = await clerk.post({ title: 'Doomed commission', body: '' });

      const result = await dispatch.next();

      assert.ok(result);
      assert.equal(result.writId, writ.id);
      assert.equal(result.outcome, 'failed');
      assert.ok(result.resolution);
      assert.equal(result.dryRun, false);

      const after = await clerk.show(writ.id);
      assert.equal(after?.status, 'failed');
    });

    it('records the session error as the failure resolution', async () => {
      const { dispatch, clerk } = setup({
        provider: createFakeProvider({ status: 'failed', error: 'Out of tokens' }),
      });

      await clerk.post({ title: 'Token fail', body: '' });

      const result = await dispatch.next();
      assert.ok(result);
      assert.equal(result.resolution, 'Out of tokens');
    });

    it('uses session status as resolution when no error message', async () => {
      const { dispatch, clerk } = setup({
        provider: createFakeProvider({ status: 'timeout' }),
      });

      await clerk.post({ title: 'Timeout commission', body: '' });

      const result = await dispatch.next();
      assert.ok(result);
      assert.equal(result.resolution, 'Session timeout');
    });
  });

  // ── FIFO ordering ─────────────────────────────────────────────────

  describe('next() — FIFO dispatch ordering', () => {
    it('dispatches the oldest ready writ first', async () => {
      const { dispatch, clerk } = setup();

      // Create writs with small delays to ensure different createdAt timestamps
      const w1 = await clerk.post({ title: 'First posted', body: '' });
      await new Promise((r) => setTimeout(r, 5));
      const w2 = await clerk.post({ title: 'Second posted', body: '' });
      await new Promise((r) => setTimeout(r, 5));
      const w3 = await clerk.post({ title: 'Third posted', body: '' });

      // First dispatch should take w1 (oldest)
      const r1 = await dispatch.next();
      assert.ok(r1);
      assert.equal(r1.writId, w1.id);

      // Second dispatch should take w2
      const r2 = await dispatch.next();
      assert.ok(r2);
      assert.equal(r2.writId, w2.id);

      // Third dispatch should take w3
      const r3 = await dispatch.next();
      assert.ok(r3);
      assert.equal(r3.writId, w3.id);

      // No more ready writs
      const r4 = await dispatch.next();
      assert.equal(r4, null);
    });
  });

  // ── Draft open failure ────────────────────────────────────────────

  describe('next() — draft open fails', () => {
    it('fails the writ and returns without launching a session', async () => {
      // We need a writ with a codex field to trigger draft opening.
      // Since the Clerk API doesn't expose codex, we test a representative
      // scenario: if a future commission-post includes a codex field, it would
      // be stored via the index signature and read by the Dispatch.
      // For now, verify the no-codex path (draft open is skipped entirely).
      // The openDraftFails option is exercised via integration if codex is set.

      // This test verifies the fail path when scriptorium.openDraft throws.
      // To trigger this path we need a writ with writ.codex set.
      // Since WritDoc has [key: string]: unknown, we test by confirming the
      // Dispatch gracefully handles the no-codex case (draft not attempted).

      const { dispatch, clerk } = setup({
        scriptorium: createFakeScriptorium({ openDraftFails: true }),
      });

      const writ = await clerk.post({ title: 'No codex — draft skip', body: '' });

      // Without a codex on the writ, openDraft is never called even if it would fail
      const result = await dispatch.next();
      assert.ok(result);
      assert.equal(result.outcome, 'completed'); // no codex → no draft → proceeds to session

      const after = await clerk.show(writ.id);
      assert.equal(after?.status, 'completed');
    });
  });

  // ── Seal / push failure ───────────────────────────────────────────

  describe('next() — seal fails', () => {
    it('fails the writ without abandoning the draft when seal fails', async () => {
      // Seal failure only occurs when a codex is present. Without a codex field
      // on the writ, the seal path is skipped. This test verifies that the
      // no-codex successful path still completes correctly even with a
      // sealFails scriptorium (seal is never called).
      const abandonCalls: string[] = [];
      const scriptorium = createFakeScriptorium({ sealFails: true });
      const trackingScriptorium: ScriptoriumApi = {
        ...scriptorium,
        async abandonDraft(req) {
          abandonCalls.push(req.branch);
        },
      };

      const { dispatch, clerk } = setup({ scriptorium: trackingScriptorium });
      await clerk.post({ title: 'Seal test — no codex', body: '' });

      const result = await dispatch.next();
      assert.ok(result);
      assert.equal(result.outcome, 'completed'); // no codex — seal never attempted

      // abandonDraft was not called (no codex)
      assert.equal(abandonCalls.length, 0);
    });
  });

  // ── Writ not taken during dry run ─────────────────────────────────

  describe('next() — idempotency', () => {
    it('same writ is returned by two consecutive dry runs', async () => {
      const { dispatch, clerk } = setup();
      const writ = await clerk.post({ title: 'Idempotent check', body: '' });

      const r1 = await dispatch.next({ dryRun: true });
      const r2 = await dispatch.next({ dryRun: true });

      assert.ok(r1);
      assert.ok(r2);
      assert.equal(r1.writId, writ.id);
      assert.equal(r2.writId, writ.id);

      // Still ready after two dry runs
      const after = await clerk.show(writ.id);
      assert.equal(after?.status, 'ready');
    });
  });

  // ── Active writ skipped ───────────────────────────────────────────

  describe('next() — skips non-ready writs', () => {
    it('skips active and terminal writs, finds only ready ones', async () => {
      const { dispatch, clerk } = setup();

      // Create a writ and put it in active state
      const active = await clerk.post({ title: 'Already active', body: '' });
      await clerk.transition(active.id, 'active');

      // Create a completed writ
      const completed = await clerk.post({ title: 'Already completed', body: '' });
      await clerk.transition(completed.id, 'active');
      await clerk.transition(completed.id, 'completed');

      // The only ready writ
      const ready = await clerk.post({ title: 'The ready one', body: '' });

      const result = await dispatch.next();
      assert.ok(result);
      assert.equal(result.writId, ready.id);
    });
  });

  // ── Git identity environment ──────────────────────────────────────

  describe('next() — git identity environment', () => {
    it('passes writ-scoped GIT_*_EMAIL to the session provider', async () => {
      const { provider, getCapturedConfig } = createSpyFakeProvider();
      const { dispatch, clerk } = setup({ provider });

      const writ = await clerk.post({ title: 'Git identity test', body: '' });

      await dispatch.next();

      const captured = getCapturedConfig();
      assert.ok(captured);
      assert.ok(captured!.environment, 'environment should be present');
      assert.equal(captured!.environment?.GIT_AUTHOR_EMAIL, `${writ.id}@nexus.local`);
      assert.ok(captured!.environment?.GIT_AUTHOR_NAME, 'GIT_AUTHOR_NAME should be present');
    });

    it('preserves Loom role name in GIT_*_NAME while overriding email', async () => {
      const { provider, getCapturedConfig } = createSpyFakeProvider();
      const { dispatch, clerk } = setup({ provider });

      const writ = await clerk.post({ title: 'Name/email split test', body: '' });

      await dispatch.next();

      const captured = getCapturedConfig();
      assert.ok(captured);
      assert.equal(captured!.environment?.GIT_AUTHOR_NAME, 'Artificer');
      assert.equal(captured!.environment?.GIT_AUTHOR_EMAIL, `${writ.id}@nexus.local`);
    });
  });
});

=== FILE: packages/plugins/dispatch/src/dispatch.ts ===
/**
 * The Dispatch — interim work runner.
 *
 * Bridges the Clerk (which tracks obligations) and the session machinery
 * (which runs animas). Finds the oldest ready writ and executes it:
 * opens a draft binding, composes context, launches a session, and handles
 * the aftermath (seal the draft, transition the writ).
 *
 * This apparatus is temporary rigging — designed to be retired when the
 * full rigging system (Walker, Formulary, Executor) is implemented.
 *
 * See: docs/architecture/apparatus/dispatch.md
 */

import type { Plugin } from '@shardworks/nexus-core';
import { guild } from '@shardworks/nexus-core';
import type { ClerkApi, WritDoc } from '@shardworks/clerk-apparatus';
import type { ScriptoriumApi, DraftRecord } from '@shardworks/codexes-apparatus';
import type { AnimatorApi, SessionResult } from '@shardworks/animator-apparatus';

import type { DispatchApi, DispatchRequest, DispatchResult } from './types.ts';
import { dispatchNext } from './tools/index.ts';

// ── Prompt assembly ──────────────────────────────────────────────────

function assemblePrompt(writ: WritDoc): string {
  const lines = [
    'You have been dispatched to fulfill a commission.',
    '',
    '## Assignment',
    '',
    `**Title:** ${writ.title}`,
    '',
    `**Writ ID:** ${writ.id}`,
  ];

  if (writ.body) {
    lines.push('', writ.body);
  }

  return lines.join('\n');
}

// ── Apparatus factory ────────────────────────────────────────────────

/**
 * Create the Dispatch apparatus plugin.
 *
 * Returns a Plugin with:
 * - `requires: ['clerk', 'codexes', 'animator']`
 * - `recommends: ['loom']` — used indirectly via Animator.summon()
 * - `provides: DispatchApi` — the dispatch API
 * - `supportKit` — contributes the `dispatch-next` tool
 */
export function createDispatch(): Plugin {
  const api: DispatchApi = {
    async next(request?: DispatchRequest): Promise<DispatchResult | null> {
      const role = request?.role ?? 'artificer';
      const dryRun = request?.dryRun ?? false;

      const clerk = guild().apparatus<ClerkApi>('clerk');

      // 1. Find oldest ready writ (FIFO — list returns desc by createdAt, take last)
      const readyWrits = await clerk.list({ status: 'ready' });
      const writ = readyWrits[readyWrits.length - 1] ?? null;

      if (!writ) return null;

      if (dryRun) {
        return { writId: writ.id, dryRun: true };
      }

      const scriptorium = guild().apparatus<ScriptoriumApi>('codexes');
      const animator = guild().apparatus<AnimatorApi>('animator');

      // 2. Transition writ ready → active
      await clerk.transition(writ.id, 'active');

      // 3. Open draft if writ has a codex
      const codexName = typeof writ.codex === 'string' ? writ.codex : undefined;
      let draft: DraftRecord | undefined;

      if (codexName) {
        try {
          draft = await scriptorium.openDraft({ codexName, associatedWith: writ.id });
        } catch (err) {
          const reason = `Draft open failed: ${String(err)}`;
          await clerk.transition(writ.id, 'failed', { resolution: reason });
          return { writId: writ.id, outcome: 'failed', resolution: reason, dryRun: false };
        }
      }

      // Session cwd: draft worktree path if codex, otherwise guild home
      const cwd = draft?.path ?? guild().home;

      // 4. Assemble prompt and summon anima
      const prompt = assemblePrompt(writ);
      const handle = animator.summon({
        role,
        prompt,
        cwd,
        environment: {
          GIT_AUTHOR_EMAIL: `${writ.id}@nexus.local`,
        },
        metadata: { writId: writ.id, trigger: 'dispatch' },
      });

      // 5. Await session result
      let session: SessionResult;
      try {
        session = await handle.result;
      } catch (err) {
        // Unexpected rejection (summon normally resolves with a failed status)
        const reason = `Session error: ${String(err)}`;
        if (codexName && draft) {
          await scriptorium.abandonDraft({ codexName, branch: draft.branch, force: true });
        }
        await clerk.transition(writ.id, 'failed', { resolution: reason });
        return { writId: writ.id, outcome: 'failed', resolution: reason, dryRun: false };
      }

      // 6a. Success path
      if (session.status === 'completed') {
        if (codexName && draft) {
          // Seal the draft — fail writ if seal fails but preserve draft for recovery
          try {
            await scriptorium.seal({ codexName, sourceBranch: draft.branch });
          } catch (err) {
            const reason = `Seal failed: ${String(err)}`;
            await clerk.transition(writ.id, 'failed', { resolution: reason });
            return { writId: writ.id, sessionId: session.id, outcome: 'failed', resolution: reason, dryRun: false };
          }

          // Push — same treatment as seal failure
          try {
            await scriptorium.push({ codexName });
          } catch (err) {
            const reason = `Push failed: ${String(err)}`;
            await clerk.transition(writ.id, 'failed', { resolution: reason });
            return { writId: writ.id, sessionId: session.id, outcome: 'failed', resolution: reason, dryRun: false };
          }
        }

        const resolution = `Session ${session.id} completed`;
        await clerk.transition(writ.id, 'completed', { resolution });
        return { writId: writ.id, sessionId: session.id, outcome: 'completed', resolution, dryRun: false };
      }

      // 6b. Failure path (status: 'failed' | 'timeout')
      if (codexName && draft) {
        await scriptorium.abandonDraft({ codexName, branch: draft.branch, force: true });
      }
      const reason = session.error ?? `Session ${session.status}`;
      await clerk.transition(writ.id, 'failed', { resolution: reason });
      return { writId: writ.id, sessionId: session.id, outcome: 'failed', resolution: reason, dryRun: false };
    },
  };

  return {
    apparatus: {
      requires: ['clerk', 'codexes', 'animator'],
      recommends: ['loom'],

      supportKit: {
        tools: [dispatchNext],
      },

      provides: api,

      start(): void {
        // No initialization needed — clerk is resolved at call time in next().
      },
    },
  };
}

=== FILE: packages/plugins/loom/README.md ===
# `@shardworks/loom-apparatus`

The Loom — the guild's session context composer. This apparatus owns system prompt assembly: given a role name, it weaves charter, curricula, temperament, and role instructions into an `AnimaWeave` that The Animator consumes to launch AI sessions. The work prompt (what the anima should do) bypasses The Loom — it is not a composition concern.

MVP: system prompt composition is not yet implemented — `weave()` returns an empty `AnimaWeave` (systemPrompt undefined). The role is accepted but not yet used. The seam exists now so the contract is stable as composition logic is built out.

```
caller (Animator.summon)         → weave({ role })
@shardworks/loom-apparatus       → AnimaWeave { systemPrompt? }
The Animator                     → launches session with weave + work prompt
```

---

## Installation

```json
{
  "dependencies": {
    "@shardworks/loom-apparatus": "workspace:*"
  }
}
```

Plugin id: `loom`

---

## API

The Loom exposes `LoomApi` via `provides`, accessed by other plugins as:

```typescript
import { guild } from '@shardworks/nexus-core';
import type { LoomApi } from '@shardworks/loom-apparatus';

const loom = guild().apparatus<LoomApi>('loom');
```

### `LoomApi`

```typescript
interface LoomApi {
  /**
   * Weave an anima's session context.
   *
   * Given a role name, produces an AnimaWeave containing the composed
   * system prompt. MVP: returns undefined for systemPrompt.
   */
  weave(request: WeaveRequest): Promise<AnimaWeave>;
}
```

### `WeaveRequest`

```typescript
interface WeaveRequest {
  /**
   * The role to weave context for (e.g. 'artificer', 'scribe').
   * MVP: accepted but not used. Future: resolves role instructions,
   * curriculum, temperament, and composes the system prompt.
   */
  role?: string;
}
```

### `AnimaWeave`

```typescript
interface AnimaWeave {
  /** The system prompt for the AI process. Undefined until composition is implemented. */
  systemPrompt?: string;
  /**
   * Environment variables for the session process.
   * Default: git identity derived from role name.
   * The Animator merges these with any per-request overrides.
   */
  environment?: Record<string, string>;
}
```

### Usage Examples

**Weave a context for a role:**

```typescript
const loom = guild().apparatus<LoomApi>('loom');

const weave = await loom.weave({ role: 'artificer' });
// → {
//     systemPrompt: undefined,  // MVP — composition not yet implemented
//     environment: {
//       GIT_AUTHOR_NAME: 'Artificer',
//       GIT_AUTHOR_EMAIL: 'artificer@nexus.local',
//     }
//   }
```

**Via The Animator (typical path):**

```typescript
const animator = guild().apparatus<AnimatorApi>('animator');

// summon() calls loom.weave() internally — you don't need to call it directly
const result = await animator.summon({
  role: 'artificer',
  prompt: 'Build the frobnicator module with tests',
  cwd: '/path/to/workdir',
});
```

---

## Configuration

The Loom reads role definitions from `guild.json["loom"]["roles"]`. See the [architecture spec](../../docs/architecture/apparatus/loom.md) for role configuration format.

MVP: role configuration is used for tool resolution (permissions) and environment variables (git identity). System prompt composition is not yet implemented — future versions will also read anima identity records, charter content, and curricula from guild config and The Stacks.

---

## Exports

```typescript
// Loom API types
import {
  type LoomApi,
  type WeaveRequest,
  type AnimaWeave,
  createLoom,
} from '@shardworks/loom-apparatus';
```

The default export is the apparatus plugin instance, ready for use in `guild.json`:

```typescript
import loom from '@shardworks/loom-apparatus';
// → Plugin with apparatus.provides = LoomApi
```

=== FILE: packages/plugins/loom/src/loom.test.ts ===
/**
 * The Loom — unit tests.
 *
 * Tests weave() with role → permissions → tool resolution via a mock
 * Instrumentarium, and the basic structural contract.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';

import { setGuild, clearGuild } from '@shardworks/nexus-core';
import { tool, type InstrumentariumApi, type ResolvedTool, type ResolveOptions } from '@shardworks/tools-apparatus';

import { createLoom, type LoomApi, type LoomConfig } from './loom.ts';
import loomDefault from './index.ts';

// ── Test fixtures ───────────────────────────────────────────────────

/** A minimal tool for testing. */
function testTool(name: string, permission?: string) {
  return tool({
    name,
    description: `Test tool: ${name}`,
    params: {},
    handler: async () => ({ ok: true }),
    ...(permission !== undefined ? { permission } : {}),
  });
}

/** A mock Instrumentarium that records calls and returns configured tools. */
function mockInstrumentarium(resolvedTools: ResolvedTool[] = []) {
  const calls: ResolveOptions[] = [];
  const api: InstrumentariumApi = {
    resolve(options: ResolveOptions): ResolvedTool[] {
      calls.push(options);
      return resolvedTools;
    },
    find: () => null,
    list: () => resolvedTools,
  };
  return { api, calls };
}

/** Set up a fake guild with the given loom config and apparatus map. */
function setupGuild(opts: {
  loomConfig?: LoomConfig;
  apparatuses?: Record<string, unknown>;
}) {
  const apparatuses = opts.apparatuses ?? {};
  setGuild({
    home: '/tmp/test-guild',
    apparatus: <T>(id: string): T => {
      const a = apparatuses[id];
      if (!a) throw new Error(`Apparatus '${id}' not installed`);
      return a as T;
    },
    guildConfig: () => ({
      name: 'test-guild',
      nexus: '0.0.0',
      workshops: {},
      plugins: [],
      loom: opts.loomConfig,
    }),
    kits: () => [],
    apparatuses: () => [],
  } as never);
}

/** Create a started Loom and return its API. */
function startLoom(): LoomApi {
  const plugin = createLoom();
  const apparatus = (plugin as { apparatus: { start: (ctx: unknown) => void; provides: unknown } }).apparatus;
  apparatus.start({ on: () => {} });
  return apparatus.provides as LoomApi;
}

// ── Tests ────────────────────────────────────────────────────────────

describe('The Loom', () => {
  afterEach(() => {
    clearGuild();
  });

  describe('createLoom()', () => {
    it('returns a plugin with apparatus shape', () => {
      const plugin = createLoom();
      assert.ok('apparatus' in plugin, 'should have apparatus key');

      const { apparatus } = plugin as { apparatus: Record<string, unknown> };
      assert.deepStrictEqual(apparatus.requires, ['tools']);
      assert.ok(apparatus.provides, 'should have provides');
      assert.ok(typeof apparatus.start === 'function', 'should have start()');
    });

    it('provides a LoomApi with weave()', () => {
      const plugin = createLoom();
      const api = (plugin as { apparatus: { provides: LoomApi } }).apparatus.provides;
      assert.ok(typeof api.weave === 'function');
    });
  });

  describe('default export', () => {
    it('is a plugin with apparatus shape', () => {
      assert.ok('apparatus' in loomDefault, 'default export should have apparatus key');
      const { apparatus } = loomDefault as { apparatus: Record<string, unknown> };
      assert.ok(apparatus.provides, 'should have provides');
      assert.ok(typeof (apparatus.provides as LoomApi).weave === 'function', 'provides should have weave()');
    });
  });

  describe('weave() — no role', () => {
    it('returns undefined systemPrompt', async () => {
      setupGuild({});
      const api = startLoom();
      const weave = await api.weave({});
      assert.strictEqual(weave.systemPrompt, undefined);
    });

    it('returns undefined tools when no role is provided', async () => {
      setupGuild({});
      const api = startLoom();
      const weave = await api.weave({});
      assert.strictEqual(weave.tools, undefined);
    });

    it('returns a promise', () => {
      setupGuild({});
      const api = startLoom();
      const result = api.weave({});
      assert.ok(result instanceof Promise, 'weave() should return a Promise');
    });

    it('returns an object without initialPrompt', async () => {
      setupGuild({});
      const api = startLoom();
      const weave = await api.weave({ role: 'artificer' });
      assert.ok(!('initialPrompt' in weave), 'AnimaWeave should not have initialPrompt');
    });

    it('returns undefined environment when no role is provided', async () => {
      setupGuild({});
      const api = startLoom();
      const weave = await api.weave({});
      assert.strictEqual(weave.environment, undefined);
    });
  });

  describe('weave() — role with tool resolution', () => {
    it('resolves tools for a configured role', async () => {
      const readTool = testTool('stack-query', 'read');
      const resolved: ResolvedTool[] = [
        { definition: readTool, pluginId: 'stacks' },
      ];
      const { api: instrumentarium, calls } = mockInstrumentarium(resolved);

      setupGuild({
        loomConfig: {
          roles: {
            scribe: {
              permissions: ['stacks:read'],
            },
          },
        },
        apparatuses: { tools: instrumentarium },
      });

      const api = startLoom();
      const weave = await api.weave({ role: 'scribe' });

      assert.equal(weave.tools?.length, 1);
      assert.equal(weave.tools![0]!.definition.name, 'stack-query');

      // Verify the Instrumentarium was called with correct args
      assert.equal(calls.length, 1);
      assert.deepStrictEqual(calls[0]!.permissions, ['stacks:read']);
      assert.equal(calls[0]!.caller, 'anima');
    });

    it('passes strict flag from role definition', async () => {
      const { api: instrumentarium, calls } = mockInstrumentarium([]);

      setupGuild({
        loomConfig: {
          roles: {
            scribe: {
              permissions: ['stacks:read'],
              strict: true,
            },
          },
        },
        apparatuses: { tools: instrumentarium },
      });

      const api = startLoom();
      await api.weave({ role: 'scribe' });

      assert.equal(calls[0]!.strict, true);
    });

    it('returns undefined tools for an unknown role', async () => {
      const { api: instrumentarium, calls } = mockInstrumentarium([]);

      setupGuild({
        loomConfig: {
          roles: {
            artificer: { permissions: ['*:*'] },
          },
        },
        apparatuses: { tools: instrumentarium },
      });

      const api = startLoom();
      const weave = await api.weave({ role: 'unknown-role' });

      assert.strictEqual(weave.tools, undefined);
      assert.equal(calls.length, 0, 'should not call instrumentarium for unknown role');
    });

    it('returns undefined tools when no roles configured', async () => {
      const { api: instrumentarium, calls } = mockInstrumentarium([]);

      setupGuild({
        loomConfig: {},
        apparatuses: { tools: instrumentarium },
      });

      const api = startLoom();
      const weave = await api.weave({ role: 'artificer' });

      assert.strictEqual(weave.tools, undefined);
      assert.equal(calls.length, 0);
    });

    it('returns undefined tools when loom config is absent', async () => {
      const { api: instrumentarium, calls } = mockInstrumentarium([]);

      setupGuild({
        apparatuses: { tools: instrumentarium },
      });

      const api = startLoom();
      const weave = await api.weave({ role: 'artificer' });

      assert.strictEqual(weave.tools, undefined);
      assert.equal(calls.length, 0);
    });

    it('always passes caller: anima to the Instrumentarium', async () => {
      const { api: instrumentarium, calls } = mockInstrumentarium([]);

      setupGuild({
        loomConfig: {
          roles: {
            admin: { permissions: ['*:*'] },
          },
        },
        apparatuses: { tools: instrumentarium },
      });

      const api = startLoom();
      await api.weave({ role: 'admin' });

      assert.equal(calls[0]!.caller, 'anima');
    });

    it('derives git identity environment from role name', async () => {
      const { api: instrumentarium } = mockInstrumentarium([]);

      setupGuild({
        loomConfig: {
          roles: {
            artificer: { permissions: ['*:*'] },
          },
        },
        apparatuses: { tools: instrumentarium },
      });

      const api = startLoom();
      const weave = await api.weave({ role: 'artificer' });

      assert.deepStrictEqual(weave.environment, {
        GIT_AUTHOR_NAME: 'Artificer',
        GIT_AUTHOR_EMAIL: 'artificer@nexus.local',
      });
    });

    it('capitalizes first letter of role name for display name', async () => {
      const { api: instrumentarium } = mockInstrumentarium([]);

      setupGuild({
        loomConfig: {
          roles: {
            scribe: { permissions: ['stacks:read'] },
          },
        },
        apparatuses: { tools: instrumentarium },
      });

      const api = startLoom();
      const weave = await api.weave({ role: 'scribe' });

      assert.equal(weave.environment?.GIT_AUTHOR_NAME, 'Scribe');
    });

    it('derives environment even for unknown roles', async () => {
      const { api: instrumentarium } = mockInstrumentarium([]);

      setupGuild({
        loomConfig: {
          roles: {
            artificer: { permissions: ['*:*'] },
          },
        },
        apparatuses: { tools: instrumentarium },
      });

      const api = startLoom();
      const weave = await api.weave({ role: 'unknown-role' });

      assert.ok(weave.environment, 'environment should be defined for any role string');
      assert.equal(weave.environment?.GIT_AUTHOR_NAME, 'Unknown-role');
      assert.equal(weave.environment?.GIT_AUTHOR_EMAIL, 'unknown-role@nexus.local');
    });
  });
});

=== FILE: packages/plugins/loom/src/loom.ts ===
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

import type { Plugin, StartupContext } from '@shardworks/nexus-core';
import { guild } from '@shardworks/nexus-core';
import type { InstrumentariumApi, ResolvedTool } from '@shardworks/tools-apparatus';

// ── Public types ──────────────────────────────────────────────────────

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
  /** The system prompt for the AI process. Undefined until composition is implemented. */
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
   * system prompt and the resolved tool set. System prompt composition
   * (charter, curricula, temperament, role instructions) is future work —
   * systemPrompt remains undefined until then.
   *
   * Tool resolution is active: if a role is provided and the Instrumentarium
   * is installed, the Loom resolves role → permissions → tools.
   */
  weave(request: WeaveRequest): Promise<AnimaWeave>;
}

// ── Config types ─────────────────────────────────────────────────────

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

// ── Apparatus factory ─────────────────────────────────────────────────

/**
 * Create the Loom apparatus plugin.
 *
 * Returns a Plugin with:
 * - `requires: ['tools']` — needs the Instrumentarium for tool resolution
 * - `provides: LoomApi` — the context composition API
 */
export function createLoom(): Plugin {
  let config: LoomConfig = {};

  const api: LoomApi = {
    async weave(request: WeaveRequest): Promise<AnimaWeave> {
      const weave: AnimaWeave = {};

      // Resolve tools if a role is provided and has a definition.
      if (request.role && config.roles) {
        const roleDef = config.roles[request.role];
        if (roleDef) {
          try {
            const instrumentarium = guild().apparatus<InstrumentariumApi>('tools');
            weave.tools = instrumentarium.resolve({
              permissions: roleDef.permissions,
              strict: roleDef.strict,
              caller: 'anima',
            });
          } catch {
            // Instrumentarium not installed — no tools.
            // This shouldn't happen since we require 'tools', but
            // fail gracefully rather than crash the session.
          }
        }
      }

      // Derive git identity from role name.
      if (request.role) {
        const displayName = request.role.charAt(0).toUpperCase() + request.role.slice(1);
        weave.environment = {
          GIT_AUTHOR_NAME: displayName,
          GIT_AUTHOR_EMAIL: `${request.role}@nexus.local`,
        };
      }

      // Future: compose system prompt from charter + curriculum +
      // temperament + role instructions + tool instructions.
      return weave;
    },
  };

  return {
    apparatus: {
      requires: ['tools'],
      provides: api,

      start(_ctx: StartupContext): void {
        const g = guild();
        config = g.guildConfig().loom ?? {};
      },
    },
  };
}


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

=== CONTEXT FILE: docs/architecture/apparatus/review-loop.md ===
# The Review Loop — Design Spec

Status: **Design** (not yet implemented)

> **Not a traditional apparatus.** The review loop does not have a `start()`/`stop()` lifecycle or a persistent runtime API. It is a composition pattern — a pair of engine designs and a rig structure — that lives at the intersection of the Walker, the Executor, and the Dispatch apparatus. This document specifies the full design, including an MVP path that works before the Walker exists.

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

The Dispatch apparatus (`dispatch-next`) runs the implementation session, then runs a review pass, then optionally a revision session — all within a single dispatch call. No new apparatus; no Walker dependency.

**Pros:** Implementable now. Works with existing infrastructure. Dispatch is already the single entry point for writ execution.

**Cons:** The Dispatch is temporary infrastructure, scheduled for retirement when the Walker is implemented. Any logic added to Dispatch must be migrated. Also, the dispatch-level wrapper can only retry the entire session; it cannot retry a subcomponent.

### Option B: Review engine in every rig (full design)

The Walker seeds every rig with an `implement → review → [revise → review]*N` chain by default. The review engine is a clockwork engine; the revise engine is a quick engine. Both are standard engine designs contributed by a kit.

**Pros:** Architecturally clean. Composes naturally with Walker's traversal. Reusable engine designs. No migration from Dispatch required — Dispatch simply dispatches, and the rig handles iteration.

**Cons:** Requires the Walker. Not implementable until the rigging system exists.

### Option C: Rig pattern via origination engine

The origination engine seeds rigs with review chains by default. Superficially similar to Option B, but the decision of whether to include a review loop is made at origination time, not by a default rig structure.

**Pros:** Gives origination agency over review strategy (some work may not need review; some may need richer review).

**Cons:** Complicates origination. Review is almost always appropriate; making it opt-in inverts the sensible default.

### Decision

**Adopt both Option A (MVP) and Option B (full design).**

The Dispatch-level wrapper is the MVP: implementable now, catches the known failure modes, produces data on review loop effectiveness. When the Walker is implemented, the review logic migrates to engine designs (Option B), and the Dispatch drops its review wrapping entirely. The rig pattern (Option C) governs per-commission review configuration as a future enhancement.

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

When the Walker is implemented, the review loop migrates from Dispatch into the rig as two engine designs. The Dispatch drops all review logic.

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

The downstream engine (either a `seal` engine or a `revise` engine) reads `reviewResult.passed` to decide what to do. The Walker sees a completed engine regardless of outcome; the branching logic lives in the rig structure (see Rig Pattern below).

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

The Walker traverses this graph naturally. Each engine completes and propagates its yield; downstream engines activate when their upstream is complete. The conditional branching (pass → seal, fail → revise) is expressed in the rig structure, not in Walker logic — the Walker just runs whatever is ready.

**Seeding the rig:** The origination engine produces this graph when it seeds the rig. For `maxRetries=2`, the origination engine seeds a fixed graph (not dynamically extended). If the guild wants `maxRetries=0` (no review loop), origination seeds the simple `implement → seal` graph.

**Dynamic extension (future):** A more sophisticated design would have the review engine declare a `need: 'revision'` when it fails, and the Formulary would resolve and graft the next revise+review pair. This avoids pre-seeding the full graph and enables arbitrary retry depths. This is Future scope — the fixed graph is sufficient for MVP and avoids Walker complexity in the initial rigging implementation.

### Walker Integration

The Walker needs no changes to support the review loop. It already:
- Traverses all engines whose upstream is complete
- Dispatches ready engines to the Executor
- Handles both clockwork and quick engine kinds

The review loop is just a graph shape that Walker happens to traverse. The `escalate` clockwork engine signals the Clerk with a `failed` transition; the `seal` clockwork engine signals completion. The Walker itself is agnostic.

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

For the MVP (Dispatch-level), the Dispatch writes these artifacts directly. For the full design (Walker-level), the review engine writes them via the Stacks or directly to the commission data directory.

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

For the full design (Walker-level), the same configuration is consumed by the origination engine to decide whether to seed the review graph and what configuration to pass to the review engine.

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

### Phase 2 (Walker-level engine designs)
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
- Formulary resolves revision chain dynamically
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

=== CONTEXT FILE: packages/plugins/animator/src/types.ts ===
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

// ── Session chunks (streaming output) ────────────────────────────────

/** A chunk of output from a running session. */
export type SessionChunk =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; tool: string }
  | { type: 'tool_result'; tool: string };

// ── Request / Result ─────────────────────────────────────────────────

export interface AnimateRequest {
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
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}

// ── Summon request ──────────────────────────────────────────────────

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

// ── Animator API (the `provides` interface) ──────────────────────────

/** The return value from animate() and summon(). */
export interface AnimateHandle {
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

// ── Session provider interface ───────────────────────────────────────

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
}

// ── Stacks document type ─────────────────────────────────────────────

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
  /** Index signature required by BookEntry. */
  [key: string]: unknown;
}

// ── Animator config ──────────────────────────────────────────────────

/** Plugin configuration stored at guild.json["animator"]. */
export interface AnimatorConfig {
  /**
   * Plugin id of the apparatus that implements AnimatorSessionProvider.
   * The Animator looks this up via guild().apparatus() at animate-time.
   * Defaults to 'claude-code' if not specified.
   */
  sessionProvider?: string;
}

// Augment GuildConfig so `guild().guildConfig().animator` is typed without
// requiring a manual type parameter at the call site.
declare module '@shardworks/nexus-core' {
  interface GuildConfig {
    animator?: AnimatorConfig;
  }
}

=== CONTEXT FILE: packages/plugins/animator/src/animator.ts ===
/**
 * The Animator — session launch and telemetry recording apparatus.
 *
 * Two API levels:
 * - summon() — high-level: composes context via The Loom, then launches.
 * - animate() — low-level: takes a pre-composed AnimaWeave + prompt.
 *
 * See: docs/specification.md (animator)
 */

import type { Plugin, StartupContext } from '@shardworks/nexus-core';
import { guild, generateId } from '@shardworks/nexus-core';
import type { StacksApi, Book } from '@shardworks/stacks-apparatus';

import type { LoomApi } from '@shardworks/loom-apparatus';

import type {
  AnimatorApi,
  AnimateHandle,
  AnimatorConfig,
  AnimateRequest,
  SummonRequest,
  SessionResult,
  SessionChunk,
  SessionDoc,
  AnimatorSessionProvider,
  SessionProviderConfig,
  SessionProviderResult,
} from './types.ts';

import { sessionList, sessionShow, summon as summonTool } from './tools/index.ts';

// ── Core logic ───────────────────────────────────────────────────────

/**
 * Resolve the session provider apparatus.
 *
 * Looks up the provider by plugin id from guild config. The provider is
 * an apparatus whose `provides` implements AnimatorSessionProvider.
 * Arbor throws immediately if the plugin isn't loaded or has no provides.
 */
function resolveProvider(config: AnimatorConfig): AnimatorSessionProvider {
  const pluginId = config.sessionProvider ?? 'claude-code';
  return guild().apparatus<AnimatorSessionProvider>(pluginId);
}

/**
 * Resolve the model from guild settings.
 */
function resolveModel(): string {
  const g = guild();
  const guildConfig = g.guildConfig();
  return guildConfig.settings?.model ?? 'sonnet';
}

/**
 * Build the provider config from an AnimateRequest.
 *
 * The system prompt comes from the AnimaWeave (composed by The Loom).
 * The work prompt comes from the request directly (bypasses The Loom).
 * The streaming flag is passed through for the provider to honor (or ignore).
 */
function buildProviderConfig(
  request: AnimateRequest,
  model: string,
): SessionProviderConfig {
  return {
    systemPrompt: request.context.systemPrompt,
    initialPrompt: request.prompt,
    model,
    conversationId: request.conversationId,
    cwd: request.cwd,
    streaming: request.streaming,
    tools: request.context.tools,
    environment: { ...request.context.environment, ...request.environment },
  };
}

/**
 * Build a SessionResult from provider output and session metadata.
 */
function buildSessionResult(
  id: string,
  startedAt: string,
  providerName: string,
  providerResult: SessionProviderResult,
  request: AnimateRequest,
): SessionResult {
  const endedAt = new Date().toISOString();
  const durationMs = new Date(endedAt).getTime() - new Date(startedAt).getTime();

  return {
    id,
    status: providerResult.status,
    startedAt,
    endedAt,
    durationMs,
    provider: providerName,
    exitCode: providerResult.exitCode,
    error: providerResult.error,
    conversationId: request.conversationId,
    providerSessionId: providerResult.providerSessionId,
    tokenUsage: providerResult.tokenUsage,
    costUsd: providerResult.costUsd,
    metadata: request.metadata,
  };
}

/**
 * Build a failed SessionResult when the provider throws.
 */
function buildFailedResult(
  id: string,
  startedAt: string,
  providerName: string,
  error: unknown,
  request: AnimateRequest,
): SessionResult {
  const endedAt = new Date().toISOString();
  const durationMs = new Date(endedAt).getTime() - new Date(startedAt).getTime();
  const errorMessage = error instanceof Error ? error.message : String(error);

  return {
    id,
    status: 'failed',
    startedAt,
    endedAt,
    durationMs,
    provider: providerName,
    exitCode: 1,
    error: errorMessage,
    conversationId: request.conversationId,
    metadata: request.metadata,
  };
}

/**
 * Convert a SessionResult to a SessionDoc for Stacks storage.
 */
function toSessionDoc(result: SessionResult): SessionDoc {
  return {
    id: result.id,
    status: result.status,
    startedAt: result.startedAt,
    endedAt: result.endedAt,
    durationMs: result.durationMs,
    provider: result.provider,
    exitCode: result.exitCode,
    error: result.error,
    conversationId: result.conversationId,
    providerSessionId: result.providerSessionId,
    tokenUsage: result.tokenUsage,
    costUsd: result.costUsd,
    metadata: result.metadata,
  };
}

/**
 * Record a session result to The Stacks.
 *
 * Errors are logged but never propagated — session data loss is
 * preferable to masking the original failure. See § Error Handling Contract.
 */
async function recordSession(
  sessions: Book<SessionDoc>,
  result: SessionResult,
): Promise<void> {
  try {
    await sessions.put(toSessionDoc(result));
  } catch (err) {
    console.warn(
      `[animator] Failed to record session ${result.id}: ${err instanceof Error ? err.message : err}`,
    );
  }
}

/**
 * Write the initial 'running' session record to The Stacks.
 */
async function recordRunning(
  sessions: Book<SessionDoc>,
  id: string,
  startedAt: string,
  providerName: string,
  request: AnimateRequest,
): Promise<void> {
  try {
    await sessions.put({
      id,
      status: 'running',
      startedAt,
      provider: providerName,
      conversationId: request.conversationId,
      metadata: request.metadata,
    });
  } catch (err) {
    console.warn(
      `[animator] Failed to write initial session record ${id}: ${err instanceof Error ? err.message : err}`,
    );
  }
}

// ── Apparatus factory ────────────────────────────────────────────────

/**
 * Create the Animator apparatus plugin.
 *
 * Returns a Plugin with:
 * - `requires: ['stacks']` — records session results
 * - `provides: AnimatorApi` — the session launch API
 * - `supportKit` — contributes `sessions` book + inspection tools
 */
export function createAnimator(): Plugin {
  let config: AnimatorConfig = {};
  let sessions: Book<SessionDoc>;

  const api: AnimatorApi = {
    summon(request: SummonRequest): AnimateHandle {
      // Resolve The Loom at call time — not a startup dependency.
      // This allows the Animator to start without the Loom installed;
      // only summon() requires it.
      let loom: LoomApi;
      try {
        loom = guild().apparatus<LoomApi>('loom');
      } catch {
        throw new Error(
          'summon() requires The Loom apparatus to be installed. ' +
          'Use animate() directly if you want to provide a pre-composed AnimaWeave.',
        );
      }

      // We need to weave context before we can animate, but summon()
      // must return synchronously. Wrap the async Loom call and the
      // animate delegation into a single deferred flow.
      const deferred = (async () => {
        // Compose identity context via The Loom.
        // The Loom owns system prompt composition — it produces the system
        // prompt from the anima's identity layers (role instructions,
        // curriculum, temperament, charter). MVP: returns empty (no
        // systemPrompt); the session runs without one until the Loom
        // gains composition logic. The work prompt bypasses the Loom.
        const context = await loom.weave({
          role: request.role,
        });

        // Merge caller metadata with auto-generated summon metadata
        const metadata: Record<string, unknown> = {
          trigger: 'summon',
          ...(request.role ? { role: request.role } : {}),
          ...request.metadata,
        };

        // Delegate to the standard animate path.
        // The work prompt goes directly on the request — it is not
        // a composition concern.
        return this.animate({
          context,
          prompt: request.prompt,
          cwd: request.cwd,
          conversationId: request.conversationId,
          metadata,
          streaming: request.streaming,
          environment: request.environment,
        });
      })();

      // Pipe chunks through — can't get them until the Loom weave resolves.
      // Works for both streaming and non-streaming: non-streaming providers
      // return empty chunks, so the generator yields nothing and completes.
      async function* pipeChunks(): AsyncIterable<SessionChunk> {
        const handle = await deferred;
        yield* handle.chunks;
      }

      return {
        chunks: pipeChunks(),
        result: deferred.then((handle) => handle.result),
      };
    },

    animate(request: AnimateRequest): AnimateHandle {
      const provider = resolveProvider(config);
      const model = resolveModel();
      const providerConfig = buildProviderConfig(request, model);

      // Step 1: generate session id, capture startedAt
      const id = generateId('ses', 4);
      const startedAt = new Date().toISOString();

      // Single path — the provider returns { chunks, result } regardless
      // of whether streaming is enabled. Providers that don't support
      // streaming return empty chunks; the Animator doesn't branch.
      const { chunks, result: providerResultPromise } = provider.launch(providerConfig);

      // Write initial record (fire and forget — don't block streaming)
      const initPromise = recordRunning(sessions, id, startedAt, provider.name, request);

      const result = (async () => {
        await initPromise;

        let sessionResult: SessionResult;
        try {
          const providerResult = await providerResultPromise;
          sessionResult = buildSessionResult(id, startedAt, provider.name, providerResult, request);
        } catch (err) {
          sessionResult = buildFailedResult(id, startedAt, provider.name, err, request);
          await recordSession(sessions, sessionResult);
          throw err;
        }

        await recordSession(sessions, sessionResult);
        return sessionResult;
      })();

      return { chunks, result };
    },
  };

  return {
    apparatus: {
      requires: ['stacks'],
      recommends: ['loom'],

      supportKit: {
        books: {
          sessions: {
            indexes: ['startedAt', 'status', 'conversationId', 'provider'],
          },
        },
        tools: [sessionList, sessionShow, summonTool],
      },

      provides: api,

      start(_ctx: StartupContext): void {
        const g = guild();
        config = g.guildConfig().animator ?? {};

        const stacks = g.apparatus<StacksApi>('stacks');
        sessions = stacks.book<SessionDoc>('animator', 'sessions');
      },
    },
  };
}

=== CONTEXT FILE: packages/plugins/animator/src/index.ts ===
/**
 * @shardworks/animator-apparatus — The Animator.
 *
 * Session launch and telemetry recording: takes an AnimaWeave from The Loom,
 * launches an AI process via a session provider, monitors it until exit, and
 * records the result to The Stacks.
 *
 * See: docs/specification.md (animator)
 */

import { createAnimator } from './animator.ts';

// ── Animator API ─────────────────────────────────────────────────────

export {
  type AnimatorApi,
  type AnimateHandle,
  type AnimateRequest,
  type SummonRequest,
  type SessionResult,
  type SessionChunk,
  type TokenUsage,
  type SessionDoc,
  type AnimatorConfig,
  // Provider types (for implementors)
  type AnimatorSessionProvider,
  type SessionProviderConfig,
  type SessionProviderResult,
} from './types.ts';

export { createAnimator } from './animator.ts';

// ── Default export: the apparatus plugin ──────────────────────────────

export default createAnimator();

=== CONTEXT FILE: packages/plugins/dispatch/src/types.ts ===
/**
 * The Dispatch — public types.
 *
 * These types form the contract between The Dispatch apparatus and all
 * callers (CLI, clockworks). No implementation details.
 *
 * See: docs/architecture/apparatus/dispatch.md
 */

// ── DispatchApi (the `provides` interface) ───────────────────────────

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

// ── Request / Result ─────────────────────────────────────────────────

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

=== CONTEXT FILE: packages/plugins/dispatch/src/index.ts ===
/**
 * @shardworks/dispatch-apparatus — The Dispatch.
 *
 * Interim work runner: finds the oldest ready writ and executes it through
 * the guild's session machinery. Opens a draft binding on the target codex,
 * summons an anima via The Animator, and handles the aftermath (seal the
 * draft, transition the writ). Disposable — retired when the full rigging
 * system (Walker, Formulary, Executor) is implemented.
 *
 * See: docs/architecture/apparatus/dispatch.md
 */

import { createDispatch } from './dispatch.ts';

// ── Dispatch API ──────────────────────────────────────────────────────

export {
  type DispatchApi,
  type DispatchRequest,
  type DispatchResult,
} from './types.ts';

export { createDispatch } from './dispatch.ts';

// ── Default export: the apparatus plugin ──────────────────────────────

export default createDispatch();

=== CONTEXT FILE: packages/plugins/dispatch/src/tools ===
tree e02992daf0e809591e534a089972a01481d714b0:packages/plugins/dispatch/src/tools

dispatch-next.ts
index.ts

=== CONTEXT FILE: packages/plugins/loom/package.json ===
{
  "name": "@shardworks/loom-apparatus",
  "version": "0.0.0",
  "license": "ISC",
  "repository": {
    "type": "git",
    "url": "https://github.com/shardworks/nexus",
    "directory": "packages/plugins/loom"
  },
  "description": "The Loom — session context composition apparatus",
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
    "@shardworks/nexus-core": "workspace:*",
    "@shardworks/tools-apparatus": "workspace:*",
    "zod": "4.3.6"
  },
  "devDependencies": {
    "@types/node": "25.5.0"
  },
  "files": [
    "dist"
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

=== CONTEXT FILE: packages/plugins/loom/tsconfig.json ===
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

=== CONTEXT FILE: packages/plugins/loom/src ===
tree e02992daf0e809591e534a089972a01481d714b0:packages/plugins/loom/src

index.ts
loom.test.ts
loom.ts

=== CONTEXT FILE: packages/plugins/loom/src/index.ts ===
/**
 * @shardworks/loom-apparatus — The Loom.
 *
 * Session context composition: weaves role instructions, curricula, and
 * temperaments into an AnimaWeave that The Animator can consume to
 * launch AI sessions.
 *
 * See: docs/specification.md (loom)
 */

import { createLoom } from './loom.ts';

// ── Loom API ─────────────────────────────────────────────────────────

export {
  type LoomApi,
  type WeaveRequest,
  type AnimaWeave,
  type LoomConfig,
  type RoleDefinition,
  createLoom,
} from './loom.ts';

// ── GuildConfig augmentation ────────────────────────────────────────

// Augment GuildConfig so `guild().guildConfig().loom` is typed without
// requiring a manual type parameter at the call site.
import type { LoomConfig } from './loom.ts';
declare module '@shardworks/nexus-core' {
  interface GuildConfig {
    loom?: LoomConfig;
  }
}

// ── Default export: the apparatus plugin ──────────────────────────────

export default createLoom();


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
review-loop.md
scriptorium.md
stacks.md

=== TREE: packages/plugins/animator/src/ ===
animator.test.ts
animator.ts
index.ts
tools
types.ts

=== TREE: packages/plugins/dispatch/src/ ===
dispatch.test.ts
dispatch.ts
index.ts
tools
types.ts

=== TREE: packages/plugins/loom/ ===
README.md
package.json
src
tsconfig.json

=== TREE: packages/plugins/loom/src/ ===
index.ts
loom.test.ts
loom.ts

```
```
