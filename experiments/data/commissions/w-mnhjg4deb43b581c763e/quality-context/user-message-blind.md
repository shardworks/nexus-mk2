## Commission Diff

```
```
 packages/framework/core/src/id.ts                | 19 +++++++++++++++++++
 packages/framework/core/src/index.ts             |  2 ++
 packages/plugins/animator/src/animator.ts        | 12 ++----------
 packages/plugins/codexes/src/scriptorium-core.ts | 18 ++++--------------
 packages/plugins/parlour/src/parlour.ts          | 16 ++++------------
 5 files changed, 31 insertions(+), 36 deletions(-)

diff --git a/packages/framework/core/src/id.ts b/packages/framework/core/src/id.ts
new file mode 100644
index 0000000..ea8d13f
--- /dev/null
+++ b/packages/framework/core/src/id.ts
@@ -0,0 +1,19 @@
+import crypto from 'node:crypto';
+
+/**
+ * Generate a sortable, prefixed ID.
+ *
+ * Format: `{prefix}-{base36_timestamp}{hex_random}`
+ *
+ * The timestamp component (Date.now() in base36) gives lexicographic sort
+ * order by creation time. The random suffix prevents collisions without
+ * coordination.
+ *
+ * @param prefix     Short, type-identifying string (e.g. `w`, `ses`, `turn`)
+ * @param randomByteCount  Number of random bytes; produces 2× hex digits (default 6 → 12 hex chars)
+ */
+export function generateId(prefix: string, randomByteCount: number = 6): string {
+  const ts = Date.now().toString(36);
+  const rand = crypto.randomBytes(randomByteCount).toString('hex');
+  return `${prefix}-${ts}${rand}`;
+}
diff --git a/packages/framework/core/src/index.ts b/packages/framework/core/src/index.ts
index d166f6f..5824ad8 100644
--- a/packages/framework/core/src/index.ts
+++ b/packages/framework/core/src/index.ts
@@ -57,3 +57,5 @@ export {
   type GuildSettings,
   guildConfigPath,
 } from './guild-config.ts';
+
+export { generateId } from './id.ts';
diff --git a/packages/plugins/animator/src/animator.ts b/packages/plugins/animator/src/animator.ts
index 5f65268..7811eb0 100644
--- a/packages/plugins/animator/src/animator.ts
+++ b/packages/plugins/animator/src/animator.ts
@@ -8,10 +8,8 @@
  * See: docs/specification.md (animator)
  */
 
-import crypto from 'node:crypto';
-
 import type { Plugin, StartupContext } from '@shardworks/nexus-core';
-import { guild } from '@shardworks/nexus-core';
+import { guild, generateId } from '@shardworks/nexus-core';
 import type { StacksApi, Book } from '@shardworks/stacks-apparatus';
 
 import type { LoomApi } from '@shardworks/loom-apparatus';
@@ -32,12 +30,6 @@ import type {
 
 import { sessionList, sessionShow, summon as summonTool } from './tools/index.ts';
 
-// ── ID generation ────────────────────────────────────────────────────
-
-function generateSessionId(): string {
-  return `ses-${crypto.randomBytes(4).toString('hex')}`;
-}
-
 // ── Core logic ───────────────────────────────────────────────────────
 
 /**
@@ -290,7 +282,7 @@ export function createAnimator(): Plugin {
       const providerConfig = buildProviderConfig(request, model);
 
       // Step 1: generate session id, capture startedAt
-      const id = generateSessionId();
+      const id = generateId('ses', 4);
       const startedAt = new Date().toISOString();
 
       // Single path — the provider returns { chunks, result } regardless
diff --git a/packages/plugins/codexes/src/scriptorium-core.ts b/packages/plugins/codexes/src/scriptorium-core.ts
index d94168b..2715966 100644
--- a/packages/plugins/codexes/src/scriptorium-core.ts
+++ b/packages/plugins/codexes/src/scriptorium-core.ts
@@ -14,9 +14,8 @@
 
 import fs from 'node:fs';
 import path from 'node:path';
-import crypto from 'node:crypto';
 
-import { guild } from '@shardworks/nexus-core';
+import { guild, generateId } from '@shardworks/nexus-core';
 
 import { git, resolveDefaultBranch, resolveRef, commitsAhead, GitError } from './git.ts';
 
@@ -45,15 +44,6 @@ interface CodexState {
   clonePromise?: Promise<void>
 }
 
-// ── ULID-like ID generation ─────────────────────────────────────────
-
-function generateDraftId(): string {
-  // Timestamp prefix (ms, base36) + random suffix for uniqueness.
-  const ts = Date.now().toString(36);
-  const rand = crypto.randomBytes(4).toString('hex');
-  return `${ts}${rand}`;
-}
-
 // ── Core class ──────────────────────────────────────────────────────
 
 export class ScriptoriumCore {
@@ -158,7 +148,7 @@ export class ScriptoriumCore {
         const key = `${codexName}/${branch}`;
         if (!this.drafts.has(key)) {
           this.drafts.set(key, {
-            id: generateDraftId(),
+            id: generateId('draft', 4),
             codexName,
             branch,
             path: draftPath,
@@ -385,7 +375,7 @@ export class ScriptoriumCore {
     // Fetch before branching for freshness
     await this.performFetch(state.name);
 
-    const branch = request.branch ?? `draft-${generateDraftId()}`;
+    const branch = request.branch ?? generateId('draft', 4);
     const key = `${request.codexName}/${branch}`;
 
     // Reject if draft already exists
@@ -413,7 +403,7 @@ export class ScriptoriumCore {
     );
 
     const draft: DraftRecord = {
-      id: generateDraftId(),
+      id: generateId('draft', 4),
       codexName: request.codexName,
       branch,
       path: worktreePath,
diff --git a/packages/plugins/parlour/src/parlour.ts b/packages/plugins/parlour/src/parlour.ts
index 8708e54..ffd2d75 100644
--- a/packages/plugins/parlour/src/parlour.ts
+++ b/packages/plugins/parlour/src/parlour.ts
@@ -13,10 +13,8 @@
  * See: docs/architecture/apparatus/parlour.md
  */
 
-import crypto from 'node:crypto';
-
 import type { Plugin, StartupContext } from '@shardworks/nexus-core';
-import { guild } from '@shardworks/nexus-core';
+import { guild, generateId } from '@shardworks/nexus-core';
 import type { StacksApi, Book, ReadOnlyBook, WhereCondition } from '@shardworks/stacks-apparatus';
 import type { AnimatorApi, SessionResult, SessionChunk, SessionDoc } from '@shardworks/animator-apparatus';
 import type { LoomApi } from '@shardworks/loom-apparatus';
@@ -40,12 +38,6 @@ import type {
 
 import { conversationList, conversationShow, conversationEnd } from './tools/index.ts';
 
-// ── ID generation ────────────────────────────────────────────────────
-
-function generateId(prefix: string): string {
-  return `${prefix}-${crypto.randomBytes(4).toString('hex')}`;
-}
-
 // ── Helpers ──────────────────────────────────────────────────────────
 
 /**
@@ -300,7 +292,7 @@ export function createParlour(): Plugin {
 
       if (participant.kind === 'human') {
         // Human turn — record the message, no session launched
-        const turnId = generateId('turn');
+        const turnId = generateId('turn', 6);
         await turns.put({
           id: turnId,
           conversationId: conv.id,
@@ -365,7 +357,7 @@ export function createParlour(): Plugin {
       await conversations.patch(conv.id, { participants: updatedParticipants });
 
       // Record the turn
-      const turnId = generateId('turn');
+      const turnId = generateId('turn', 6);
       await turns.put({
         id: turnId,
         conversationId: conv.id,
@@ -537,7 +529,7 @@ export function createParlour(): Plugin {
         await conversations.patch(conv.id, { participants: updatedParticipants });
 
         // Record turn
-        const turnId = generateId('turn');
+        const turnId = generateId('turn', 6);
         await turns.put({
           id: turnId,
           conversationId: conv.id,
```
```

## Full File Contents (for context)


=== FILE: packages/framework/core/src/id.ts ===
import crypto from 'node:crypto';

/**
 * Generate a sortable, prefixed ID.
 *
 * Format: `{prefix}-{base36_timestamp}{hex_random}`
 *
 * The timestamp component (Date.now() in base36) gives lexicographic sort
 * order by creation time. The random suffix prevents collisions without
 * coordination.
 *
 * @param prefix     Short, type-identifying string (e.g. `w`, `ses`, `turn`)
 * @param randomByteCount  Number of random bytes; produces 2× hex digits (default 6 → 12 hex chars)
 */
export function generateId(prefix: string, randomByteCount: number = 6): string {
  const ts = Date.now().toString(36);
  const rand = crypto.randomBytes(randomByteCount).toString('hex');
  return `${prefix}-${ts}${rand}`;
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

export { generateId } from './id.ts';

=== FILE: packages/plugins/animator/src/animator.ts ===
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

=== FILE: packages/plugins/codexes/src/scriptorium-core.ts ===
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

import fs from 'node:fs';
import path from 'node:path';

import { guild, generateId } from '@shardworks/nexus-core';

import { git, resolveDefaultBranch, resolveRef, commitsAhead, GitError } from './git.ts';

import type {
  CodexRecord,
  CodexDetail,
  DraftRecord,
  OpenDraftRequest,
  AbandonDraftRequest,
  SealRequest,
  SealResult,
  PushRequest,
  CodexesConfig,
  CodexConfigEntry,
  ScriptoriumApi,
} from './types.ts';

// ── Internal state ──────────────────────────────────────────────────

interface CodexState {
  name: string
  remoteUrl: string
  cloneStatus: 'ready' | 'cloning' | 'error'
  lastFetched: string | null
  /** Promise that resolves when the bare clone is ready (for background clones). */
  clonePromise?: Promise<void>
}

// ── Core class ──────────────────────────────────────────────────────

export class ScriptoriumCore {
  private codexes = new Map<string, CodexState>();
  private drafts = new Map<string, DraftRecord>(); // keyed by `${codexName}/${branch}`

  private maxMergeRetries: number = 3;
  private draftRoot: string = '.nexus/worktrees';

  // ── Paths ───────────────────────────────────────────────────────

  private get home(): string {
    return guild().home;
  }

  private codexesDir(): string {
    return path.join(this.home, '.nexus', 'codexes');
  }

  private bareClonePath(name: string): string {
    return path.join(this.codexesDir(), `${name}.git`);
  }

  private draftWorktreePath(codexName: string, branch: string): string {
    return path.join(this.home, this.draftRoot, codexName, branch);
  }

  // ── Startup ─────────────────────────────────────────────────────

  start(): void {
    const config = guild().config<CodexesConfig>('codexes');

    // Apply settings
    this.maxMergeRetries = config.settings?.maxMergeRetries ?? 3;
    this.draftRoot = config.settings?.draftRoot ?? '.nexus/worktrees';

    // Ensure infrastructure directories exist
    fs.mkdirSync(this.codexesDir(), { recursive: true });

    // Load registered codexes from config
    const registered = config.registered ?? {};
    for (const [name, entry] of Object.entries(registered)) {
      this.loadCodex(name, entry);
    }

    // Reconcile drafts from filesystem
    this.reconcileDrafts();
  }

  /**
   * Load a codex from config. Checks for existing bare clone;
   * initiates background clone if missing.
   */
  private loadCodex(name: string, entry: CodexConfigEntry): void {
    const clonePath = this.bareClonePath(name);
    const exists = fs.existsSync(clonePath);

    const state: CodexState = {
      name,
      remoteUrl: entry.remoteUrl,
      cloneStatus: exists ? 'ready' : 'cloning',
      lastFetched: null,
    };

    if (!exists) {
      // Background clone — doesn't block startup
      state.clonePromise = this.performClone(name, entry.remoteUrl)
        .then(() => { state.cloneStatus = 'ready'; })
        .catch((err) => {
          state.cloneStatus = 'error';
          console.warn(`[scriptorium] Background clone of "${name}" failed: ${err instanceof Error ? err.message : err}`);
        });
    }

    this.codexes.set(name, state);
  }

  /**
   * Reconcile in-memory draft tracking with filesystem state.
   * Scans the worktree directories and rebuilds the draft map.
   */
  private reconcileDrafts(): void {
    const worktreeRoot = path.join(this.home, this.draftRoot);
    if (!fs.existsSync(worktreeRoot)) return;

    for (const codexDir of fs.readdirSync(worktreeRoot, { withFileTypes: true })) {
      if (!codexDir.isDirectory()) continue;
      const codexName = codexDir.name;

      // Only reconcile drafts for known codexes
      if (!this.codexes.has(codexName)) continue;

      const codexWorktreeDir = path.join(worktreeRoot, codexName);
      for (const draftDir of fs.readdirSync(codexWorktreeDir, { withFileTypes: true })) {
        if (!draftDir.isDirectory()) continue;
        const branch = draftDir.name;
        const draftPath = path.join(codexWorktreeDir, branch);

        // Verify it's actually a git worktree (has .git file)
        if (!fs.existsSync(path.join(draftPath, '.git'))) continue;

        const key = `${codexName}/${branch}`;
        if (!this.drafts.has(key)) {
          this.drafts.set(key, {
            id: generateId('draft', 4),
            codexName,
            branch,
            path: draftPath,
            createdAt: new Date().toISOString(), // approximate — we don't know the real time
          });
        }
      }
    }
  }

  // ── Clone readiness ─────────────────────────────────────────────

  /**
   * Ensure a codex's bare clone is ready. Blocks if a background
   * clone is in progress. Throws if the codex is unknown or clone failed.
   */
  private async ensureReady(name: string): Promise<CodexState> {
    const state = this.codexes.get(name);
    if (!state) {
      throw new Error(`Codex "${name}" is not registered. Use codex-add to register it.`);
    }

    if (state.clonePromise) {
      await state.clonePromise;
      state.clonePromise = undefined;
    }

    if (state.cloneStatus === 'error') {
      throw new Error(
        `Codex "${name}" bare clone failed. Remove and re-add the codex, or check the remote URL.`,
      );
    }

    return state;
  }

  // ── Git operations ──────────────────────────────────────────────

  private async performClone(name: string, remoteUrl: string): Promise<void> {
    const clonePath = this.bareClonePath(name);
    fs.mkdirSync(path.dirname(clonePath), { recursive: true });
    await git(['clone', '--bare', remoteUrl, clonePath]);
  }

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
  private async advanceToRemote(codexName: string, branch: string): Promise<void> {
    const clonePath = this.bareClonePath(codexName);
    let remoteRef: string;
    try {
      remoteRef = await resolveRef(clonePath, `refs/remotes/origin/${branch}`);
    } catch {
      return; // No remote tracking ref (branch may not exist on remote yet)
    }
    const localRef = await resolveRef(clonePath, branch);
    if (remoteRef === localRef) return;

    const { stdout: mergeBase } = await git(
      ['merge-base', localRef, remoteRef],
      clonePath,
    );
    if (mergeBase === localRef) {
      // Local is an ancestor of remote → remote is ahead → advance local
      await git(['update-ref', `refs/heads/${branch}`, remoteRef], clonePath);
    }
    // If local is ahead of or diverged from remote: keep the local sealed binding
  }

  private async performFetch(name: string): Promise<void> {
    const clonePath = this.bareClonePath(name);
    // Explicit refspec is required: git clone --bare does not configure a
    // fetch refspec, so plain `git fetch origin` only updates FETCH_HEAD and
    // leaves refs/heads/* stale.
    //
    // We fetch into refs/remotes/origin/* rather than refs/heads/* for two
    // reasons:
    //   1. It avoids force-overwriting local draft branches (which live in
    //      refs/heads/* but do not exist on the remote).
    //   2. It separates the "remote position" (refs/remotes/origin/*) from
    //      the "local sealed binding" (refs/heads/*), letting seal() advance
    //      refs/heads/* only when the remote is strictly ahead.
    await git(['fetch', '--prune', 'origin', '+refs/heads/*:refs/remotes/origin/*'], clonePath);

    const state = this.codexes.get(name);
    if (state) {
      state.lastFetched = new Date().toISOString();
    }
  }

  // ── API Implementation ────────────────────────────────────────

  createApi(): ScriptoriumApi {
    return {
      add: (name, remoteUrl) => this.add(name, remoteUrl),
      list: () => this.list(),
      show: (name) => this.show(name),
      remove: (name) => this.remove(name),
      fetch: (name) => this.fetchCodex(name),
      push: (request) => this.push(request),
      openDraft: (request) => this.openDraft(request),
      listDrafts: (codexName?) => this.listDrafts(codexName),
      abandonDraft: (request) => this.abandonDraft(request),
      seal: (request) => this.seal(request),
    };
  }

  // ── Codex Registry ──────────────────────────────────────────────

  async add(name: string, remoteUrl: string): Promise<CodexRecord> {
    if (this.codexes.has(name)) {
      throw new Error(`Codex "${name}" is already registered.`);
    }

    // Clone bare repo (blocking)
    const state: CodexState = {
      name,
      remoteUrl,
      cloneStatus: 'cloning',
      lastFetched: null,
    };
    this.codexes.set(name, state);

    try {
      await this.performClone(name, remoteUrl);
      state.cloneStatus = 'ready';
    } catch (err) {
      state.cloneStatus = 'error';
      this.codexes.delete(name);
      throw new Error(
        `Failed to clone "${remoteUrl}" for codex "${name}": ${err instanceof Error ? err.message : err}`,
      );
    }

    // Persist to guild.json
    const config = guild().config<CodexesConfig>('codexes');
    const registered = config.registered ?? {};
    registered[name] = { remoteUrl };
    guild().writeConfig('codexes', { ...config, registered });

    return this.toCodexRecord(state);
  }

  async list(): Promise<CodexRecord[]> {
    const records: CodexRecord[] = [];
    for (const state of this.codexes.values()) {
      records.push(this.toCodexRecord(state));
    }
    return records;
  }

  async show(name: string): Promise<CodexDetail> {
    const state = await this.ensureReady(name);
    const clonePath = this.bareClonePath(name);
    const defaultBranch = await resolveDefaultBranch(clonePath);
    const drafts = this.draftsForCodex(name);

    return {
      name: state.name,
      remoteUrl: state.remoteUrl,
      cloneStatus: state.cloneStatus,
      activeDrafts: drafts.length,
      defaultBranch,
      lastFetched: state.lastFetched,
      drafts,
    };
  }

  async remove(name: string): Promise<void> {
    const state = this.codexes.get(name);
    if (!state) {
      throw new Error(`Codex "${name}" is not registered.`);
    }

    // Abandon all drafts for this codex
    const drafts = this.draftsForCodex(name);
    for (const draft of drafts) {
      await this.abandonDraft({ codexName: name, branch: draft.branch, force: true });
    }

    // Remove bare clone
    const clonePath = this.bareClonePath(name);
    if (fs.existsSync(clonePath)) {
      fs.rmSync(clonePath, { recursive: true, force: true });
    }

    // Remove from in-memory state
    this.codexes.delete(name);

    // Remove from guild.json
    const config = guild().config<CodexesConfig>('codexes');
    const registered = { ...(config.registered ?? {}) };
    delete registered[name];
    guild().writeConfig('codexes', { ...config, registered });
  }

  async fetchCodex(name: string): Promise<void> {
    await this.ensureReady(name);
    await this.performFetch(name);
  }

  async push(request: PushRequest): Promise<void> {
    const state = await this.ensureReady(request.codexName);
    const clonePath = this.bareClonePath(state.name);
    const branch = request.branch ?? await resolveDefaultBranch(clonePath);

    await git(['push', 'origin', branch], clonePath);
  }

  // ── Draft Binding Lifecycle ─────────────────────────────────────

  async openDraft(request: OpenDraftRequest): Promise<DraftRecord> {
    const state = await this.ensureReady(request.codexName);
    const clonePath = this.bareClonePath(state.name);

    // Fetch before branching for freshness
    await this.performFetch(state.name);

    const branch = request.branch ?? generateId('draft', 4);
    const key = `${request.codexName}/${branch}`;

    // Reject if draft already exists
    if (this.drafts.has(key)) {
      throw new Error(
        `Draft with branch "${branch}" already exists for codex "${request.codexName}". ` +
        `Choose a different branch name or abandon the existing draft.`,
      );
    }

    const defaultBranch = await resolveDefaultBranch(clonePath);
    const startPoint = request.startPoint ?? defaultBranch;

    // Advance the start-point branch to the remote position if the remote
    // has moved ahead. Ensures the draft branches from the latest state.
    await this.advanceToRemote(state.name, startPoint);

    const worktreePath = this.draftWorktreePath(request.codexName, branch);
    fs.mkdirSync(path.dirname(worktreePath), { recursive: true });

    // Create worktree with new branch from start point
    await git(
      ['worktree', 'add', worktreePath, '-b', branch, startPoint],
      clonePath,
    );

    const draft: DraftRecord = {
      id: generateId('draft', 4),
      codexName: request.codexName,
      branch,
      path: worktreePath,
      createdAt: new Date().toISOString(),
      associatedWith: request.associatedWith,
    };

    this.drafts.set(key, draft);
    return draft;
  }

  async listDrafts(codexName?: string): Promise<DraftRecord[]> {
    if (codexName) {
      return this.draftsForCodex(codexName);
    }
    return [...this.drafts.values()];
  }

  async abandonDraft(request: AbandonDraftRequest): Promise<void> {
    const key = `${request.codexName}/${request.branch}`;
    const draft = this.drafts.get(key);

    if (!draft) {
      throw new Error(
        `No active draft with branch "${request.branch}" for codex "${request.codexName}".`,
      );
    }

    // Check for unsealed inscriptions (commits ahead of the sealed binding)
    if (!request.force) {
      const state = await this.ensureReady(request.codexName);
      const clonePath = this.bareClonePath(state.name);

      try {
        const defaultBranch = await resolveDefaultBranch(clonePath);
        const ahead = await commitsAhead(clonePath, request.branch, defaultBranch);

        if (ahead > 0) {
          throw new Error(
            `Draft "${request.branch}" has ${ahead} unsealed inscription(s). ` +
            `Use force: true to abandon anyway, or seal the draft first.`,
          );
        }
      } catch (err) {
        // If the branch doesn't exist in the bare clone (already cleaned up),
        // that's fine — proceed with cleanup
        if (err instanceof GitError && err.stderr.includes('unknown revision')) {
          // Branch already gone — proceed with cleanup
        } else if (err instanceof Error && err.message.includes('unsealed inscription')) {
          throw err;
        }
        // Other git errors during the check are non-fatal — proceed with cleanup
      }
    }

    // Remove worktree
    const clonePath = this.bareClonePath(request.codexName);
    try {
      await git(['worktree', 'remove', '--force', draft.path], clonePath);
    } catch {
      // If worktree removal fails (e.g. already gone), try manual cleanup
      if (fs.existsSync(draft.path)) {
        fs.rmSync(draft.path, { recursive: true, force: true });
      }
      // Prune stale worktree references
      try {
        await git(['worktree', 'prune'], clonePath);
      } catch { /* best effort */ }
    }

    // Delete the branch from the bare clone
    try {
      await git(['branch', '-D', request.branch], clonePath);
    } catch {
      // Branch may already be gone — that's fine
    }

    // Remove from in-memory tracking
    this.drafts.delete(key);
  }

  async seal(request: SealRequest): Promise<SealResult> {
    const state = await this.ensureReady(request.codexName);
    const clonePath = this.bareClonePath(state.name);
    const maxRetries = request.maxRetries ?? this.maxMergeRetries;

    const defaultBranch = await resolveDefaultBranch(clonePath);
    const targetBranch = request.targetBranch ?? defaultBranch;

    let strategy: 'fast-forward' | 'rebase' = 'fast-forward';
    let retries = 0;

    // Fetch before sealing for freshness
    await this.performFetch(state.name);

    // Advance the local sealed binding to the remote position if the remote
    // has moved ahead (e.g. commits pushed outside the Scriptorium).
    // This ensures seal compares against the latest remote ref, not a
    // potentially stale local one — preventing push failures.
    await this.advanceToRemote(state.name, targetBranch);

    // Attempt ff-only merge, with rebase retry loop
    while (retries <= maxRetries) {
      try {
        // Try fast-forward merge: update the target branch ref to point at the source
        // In a bare repo, we use `git merge --ff-only` with the branch checked out,
        // but bare repos don't have a checkout. Instead, we verify ancestry and
        // update the ref directly.
        const targetRef = await resolveRef(clonePath, targetBranch);
        const sourceRef = await resolveRef(clonePath, request.sourceBranch);

        // Check if source is already at target (nothing to seal)
        if (targetRef === sourceRef) {
          // Clean up draft unless keepDraft
          if (!request.keepDraft) {
            await this.abandonDraft({
              codexName: request.codexName,
              branch: request.sourceBranch,
              force: true,
            });
          }
          return { success: true, strategy, retries, sealedCommit: targetRef, inscriptionsSealed: 0 };
        }

        // Check if target is an ancestor of source (ff is possible)
        const { stdout: mergeBase } = await git(
          ['merge-base', targetBranch, request.sourceBranch],
          clonePath,
        );

        if (mergeBase === targetRef) {
          // Fast-forward is possible — count and incorporate inscriptions
          const inscriptionsSealed = await commitsAhead(
            clonePath,
            request.sourceBranch,
            targetBranch,
          );

          await git(
            ['update-ref', `refs/heads/${targetBranch}`, sourceRef],
            clonePath,
          );

          // Clean up draft unless keepDraft
          if (!request.keepDraft) {
            await this.abandonDraft({
              codexName: request.codexName,
              branch: request.sourceBranch,
              force: true,
            });
          }

          return { success: true, strategy, retries, sealedCommit: sourceRef, inscriptionsSealed };
        }

        // FF not possible — rebase the source branch onto the target
        strategy = 'rebase';

        // Rebase needs a worktree (can't rebase in a bare repo).
        // Use the draft's existing worktree.
        const key = `${request.codexName}/${request.sourceBranch}`;
        const draft = this.drafts.get(key);
        if (!draft) {
          throw new Error(
            `Cannot rebase: no active draft for branch "${request.sourceBranch}". ` +
            `The draft worktree is needed for rebase operations.`,
          );
        }

        try {
          await git(['rebase', targetBranch], draft.path);
        } catch (err) {
          // Rebase conflict — abort and fail
          try {
            await git(['rebase', '--abort'], draft.path);
          } catch { /* best effort */ }

          throw new Error(
            `Sealing seized: rebase of "${request.sourceBranch}" onto "${targetBranch}" ` +
            `produced conflicts. Manual reconciliation is needed.`,
          );
        }

        // Rebase succeeded — re-fetch and retry the ff merge
        retries++;
        await this.performFetch(state.name);
        continue;
      } catch (err) {
        if (err instanceof Error && err.message.includes('Sealing seized')) {
          throw err;
        }
        if (err instanceof Error && err.message.includes('Cannot rebase')) {
          throw err;
        }
        // Unexpected error — don't retry
        throw err;
      }
    }

    throw new Error(
      `Sealing failed after ${maxRetries} retries. Codex "${request.codexName}", ` +
      `branch "${request.sourceBranch}" → "${targetBranch}".`,
    );
  }

  // ── Helpers ───────────────────────────────────────────────────────

  private draftsForCodex(codexName: string): DraftRecord[] {
    return [...this.drafts.values()].filter((d) => d.codexName === codexName);
  }

  private toCodexRecord(state: CodexState): CodexRecord {
    return {
      name: state.name,
      remoteUrl: state.remoteUrl,
      cloneStatus: state.cloneStatus,
      activeDrafts: this.draftsForCodex(state.name).length,
    };
  }
}

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
      const sessionIds = convTurns
        .map((t) => t.sessionId)
        .filter((id): id is string => id !== null);

      // Aggregate cost
      let totalCostUsd = 0;
      for (const sessionId of sessionIds) {
        const session = await sessions.get(sessionId);
        if (session?.costUsd) totalCostUsd += session.costUsd;
      }

      // Build turn summaries
      const turnSummaries: TurnSummary[] = convTurns.map((t) => ({
        sessionId: t.sessionId,
        turnNumber: t.turnNumber,
        participant: t.participantName,
        message: t.message,
        startedAt: t.startedAt,
        endedAt: t.endedAt,
      }));

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


## Convention Reference (sibling files not modified by this commission)


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

=== CONTEXT FILE: packages/plugins/animator/src/animator.test.ts ===
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

    it('ids follow ses-{hex} format', async () => {
      const result = await animator.animate({
        context: { systemPrompt: 'Test' },
        cwd: '/tmp',
      }).result;

      assert.match(result.id, /^ses-[a-f0-9]{8}$/);
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
  });
});

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

=== CONTEXT FILE: packages/plugins/codexes/src/scriptorium-core.test.ts ===
/**
 * Tests for the Scriptorium core logic.
 *
 * Creates real git repositories in temp directories to test the full
 * lifecycle: add → openDraft → commit → seal → push, and all the edge
 * cases (branch collisions, unsealed inscription guards, sealing with
 * rebase, startup reconciliation).
 *
 * Each test gets a fresh "remote" repo (the source of truth) and a
 * fresh guild directory. The Scriptorium operates against local file://
 * URLs, so no network access is needed.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import { setGuild, clearGuild } from '@shardworks/nexus-core';
import type { Guild } from '@shardworks/nexus-core';

import { ScriptoriumCore } from './scriptorium-core.ts';
import { git } from './git.ts';
import type { CodexesConfig } from './types.ts';

// ── Test infrastructure ─────────────────────────────────────────────

/** Dirs to clean up after each test. */
let tmpDirs: string[] = [];

function makeTmpDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `nsg-scriptorium-${prefix}-`));
  tmpDirs.push(dir);
  return dir;
}

/** Run git synchronously in a directory. */
function gitSync(args: string[], cwd: string): string {
  return execFileSync('git', args, { cwd, encoding: 'utf-8' }).trim();
}

/**
 * Create a "remote" bare repository with an initial commit on `main`.
 * Returns the file:// URL and the path.
 */
function createRemoteRepo(): { url: string; path: string } {
  // Create a non-bare repo first so we can make an initial commit
  const workDir = makeTmpDir('remote-work');
  gitSync(['init', '-b', 'main'], workDir);
  gitSync(['config', 'user.email', 'test@test.com'], workDir);
  gitSync(['config', 'user.name', 'Test'], workDir);
  fs.writeFileSync(path.join(workDir, 'README.md'), '# Test Repo\n');
  gitSync(['add', 'README.md'], workDir);
  gitSync(['commit', '-m', 'Initial commit'], workDir);

  // Clone to bare for use as "remote"
  const bareDir = makeTmpDir('remote-bare');
  // Remove the dir first since git clone won't clone into existing non-empty dir
  fs.rmSync(bareDir, { recursive: true });
  gitSync(['clone', '--bare', workDir, bareDir], os.tmpdir());

  return { url: `file://${bareDir}`, path: bareDir };
}

/** In-memory config store for the fake guild. */
interface FakeGuildState {
  home: string;
  configs: Record<string, unknown>;
}

function createFakeGuild(state: FakeGuildState): Guild {
  return {
    home: state.home,
    apparatus: () => { throw new Error('not available in test'); },
    config<T>(pluginId: string): T {
      return (state.configs[pluginId] ?? {}) as T;
    },
    writeConfig<T>(pluginId: string, value: T): void {
      state.configs[pluginId] = value;
    },
    guildConfig: () => ({ name: 'test-guild', nexus: '0.0.0', plugins: [] }),
    kits: () => [],
    apparatuses: () => [],
  };
}

/** Create a ScriptoriumCore with a fake guild and start it. */
function createStartedCore(opts?: {
  config?: CodexesConfig;
  home?: string;
}): { core: ScriptoriumCore; guildState: FakeGuildState } {
  const home = opts?.home ?? makeTmpDir('guild');
  const guildState: FakeGuildState = {
    home,
    configs: opts?.config ? { codexes: opts.config } : {},
  };
  setGuild(createFakeGuild(guildState));

  const core = new ScriptoriumCore();
  core.start();

  return { core, guildState };
}

// ── Cleanup ─────────────────────────────────────────────────────────

afterEach(() => {
  clearGuild();
  for (const dir of tmpDirs) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
  }
  tmpDirs = [];
});

// ── Tests ───────────────────────────────────────────────────────────

describe('ScriptoriumCore', () => {

  // ── Startup ─────────────────────────────────────────────────────

  describe('start()', () => {
    it('creates .nexus/codexes/ directory', () => {
      const { core, guildState } = createStartedCore();
      const codexesDir = path.join(guildState.home, '.nexus', 'codexes');
      assert.ok(fs.existsSync(codexesDir));
    });

    it('reads settings from config', async () => {
      const remote = createRemoteRepo();
      const { core } = createStartedCore({
        config: {
          settings: { maxMergeRetries: 5 },
          registered: { test: { remoteUrl: remote.url } },
        },
      });
      // The settings are private, but we can verify the codex was loaded
      const list = await core.createApi().list();
      assert.equal(list.length, 1);
      assert.equal(list[0].name, 'test');
    });

    it('loads registered codexes from config and sets cloneStatus', async () => {
      const remote = createRemoteRepo();
      const { core } = createStartedCore({
        config: {
          registered: { mycodex: { remoteUrl: remote.url } },
        },
      });
      const api = core.createApi();
      const list = await api.list();
      assert.equal(list.length, 1);
      // Codex is cloning in background since bare clone doesn't exist yet
      assert.ok(
        list[0].cloneStatus === 'cloning' || list[0].cloneStatus === 'ready',
        `Expected 'cloning' or 'ready', got '${list[0].cloneStatus}'`,
      );
    });

    it('recognizes existing bare clones as ready', async () => {
      const remote = createRemoteRepo();
      const home = makeTmpDir('guild');
      // Pre-create the bare clone
      const codexesDir = path.join(home, '.nexus', 'codexes');
      fs.mkdirSync(codexesDir, { recursive: true });
      gitSync(['clone', '--bare', remote.url, path.join(codexesDir, 'mycodex.git')], home);

      const { core } = createStartedCore({
        home,
        config: {
          registered: { mycodex: { remoteUrl: remote.url } },
        },
      });

      const list = await core.createApi().list();
      assert.equal(list[0].cloneStatus, 'ready');
    });
  });

  // ── Codex Registry ──────────────────────────────────────────────

  describe('add()', () => {
    it('clones a bare repo and returns a ready CodexRecord', async () => {
      const remote = createRemoteRepo();
      const { core, guildState } = createStartedCore();
      const api = core.createApi();

      const record = await api.add('test-codex', remote.url);

      assert.equal(record.name, 'test-codex');
      assert.equal(record.remoteUrl, remote.url);
      assert.equal(record.cloneStatus, 'ready');
      assert.equal(record.activeDrafts, 0);

      // Verify bare clone exists on disk
      const clonePath = path.join(guildState.home, '.nexus', 'codexes', 'test-codex.git');
      assert.ok(fs.existsSync(clonePath));
      // Verify it's a bare repo
      const isBare = gitSync(['rev-parse', '--is-bare-repository'], clonePath);
      assert.equal(isBare, 'true');
    });

    it('persists codex entry to config', async () => {
      const remote = createRemoteRepo();
      const { core, guildState } = createStartedCore();
      const api = core.createApi();

      await api.add('test-codex', remote.url);

      const config = guildState.configs['codexes'] as CodexesConfig;
      assert.ok(config.registered?.['test-codex']);
      assert.equal(config.registered['test-codex'].remoteUrl, remote.url);
    });

    it('rejects duplicate codex names', async () => {
      const remote = createRemoteRepo();
      const { core } = createStartedCore();
      const api = core.createApi();

      await api.add('test-codex', remote.url);
      await assert.rejects(
        () => api.add('test-codex', remote.url),
        /already registered/,
      );
    });

    it('cleans up on clone failure', async () => {
      const { core, guildState } = createStartedCore();
      const api = core.createApi();

      await assert.rejects(
        () => api.add('bad-codex', 'file:///nonexistent/repo'),
        /Failed to clone/,
      );

      // Should not appear in the list
      const list = await api.list();
      assert.equal(list.length, 0);

      // Should not appear in config
      const config = guildState.configs['codexes'] as CodexesConfig | undefined;
      assert.ok(!config?.registered?.['bad-codex']);
    });
  });

  describe('list()', () => {
    it('returns empty array when no codexes registered', async () => {
      const { core } = createStartedCore();
      const list = await core.createApi().list();
      assert.deepEqual(list, []);
    });

    it('returns all registered codexes', async () => {
      const remote1 = createRemoteRepo();
      const remote2 = createRemoteRepo();
      const { core } = createStartedCore();
      const api = core.createApi();

      await api.add('first', remote1.url);
      await api.add('second', remote2.url);

      const list = await api.list();
      assert.equal(list.length, 2);
      const names = list.map((c) => c.name).sort();
      assert.deepEqual(names, ['first', 'second']);
    });
  });

  describe('show()', () => {
    it('returns codex details with default branch', async () => {
      const remote = createRemoteRepo();
      const { core } = createStartedCore();
      const api = core.createApi();

      await api.add('test-codex', remote.url);
      const detail = await api.show('test-codex');

      assert.equal(detail.name, 'test-codex');
      assert.equal(detail.defaultBranch, 'main');
      assert.equal(detail.activeDrafts, 0);
      assert.deepEqual(detail.drafts, []);
    });

    it('throws for unknown codex', async () => {
      const { core } = createStartedCore();
      await assert.rejects(
        () => core.createApi().show('nonexistent'),
        /not registered/,
      );
    });

    it('includes active drafts in detail', async () => {
      const remote = createRemoteRepo();
      const { core } = createStartedCore();
      const api = core.createApi();

      await api.add('test-codex', remote.url);
      await api.openDraft({ codexName: 'test-codex', branch: 'draft-1' });

      const detail = await api.show('test-codex');
      assert.equal(detail.activeDrafts, 1);
      assert.equal(detail.drafts.length, 1);
      assert.equal(detail.drafts[0].branch, 'draft-1');
    });
  });

  describe('remove()', () => {
    it('removes bare clone, config entry, and in-memory state', async () => {
      const remote = createRemoteRepo();
      const { core, guildState } = createStartedCore();
      const api = core.createApi();

      await api.add('test-codex', remote.url);
      await api.remove('test-codex');

      // Gone from list
      const list = await api.list();
      assert.equal(list.length, 0);

      // Gone from disk
      const clonePath = path.join(guildState.home, '.nexus', 'codexes', 'test-codex.git');
      assert.ok(!fs.existsSync(clonePath));

      // Gone from config
      const config = guildState.configs['codexes'] as CodexesConfig;
      assert.ok(!config.registered?.['test-codex']);
    });

    it('abandons active drafts before removing', async () => {
      const remote = createRemoteRepo();
      const { core } = createStartedCore();
      const api = core.createApi();

      await api.add('test-codex', remote.url);
      const draft = await api.openDraft({ codexName: 'test-codex', branch: 'my-draft' });

      // Draft worktree exists
      assert.ok(fs.existsSync(draft.path));

      await api.remove('test-codex');

      // Draft worktree cleaned up
      assert.ok(!fs.existsSync(draft.path));

      // No drafts remain
      const drafts = await api.listDrafts();
      assert.equal(drafts.length, 0);
    });

    it('throws for unknown codex', async () => {
      const { core } = createStartedCore();
      await assert.rejects(
        () => core.createApi().remove('nonexistent'),
        /not registered/,
      );
    });
  });

  describe('fetch()', () => {
    it('fetches latest refs and updates lastFetched', async () => {
      const remote = createRemoteRepo();
      const { core } = createStartedCore();
      const api = core.createApi();

      await api.add('test-codex', remote.url);

      // Show before fetch — lastFetched should be null (add doesn't set it)
      const before = await api.show('test-codex');
      assert.equal(before.lastFetched, null);

      await api.fetch('test-codex');

      const after = await api.show('test-codex');
      assert.ok(after.lastFetched !== null);
    });

    it('throws for unknown codex', async () => {
      const { core } = createStartedCore();
      await assert.rejects(
        () => core.createApi().fetch('nonexistent'),
        /not registered/,
      );
    });
  });

  // ── Draft Binding Lifecycle ─────────────────────────────────────

  describe('openDraft()', () => {
    it('creates a worktree and returns a DraftRecord', async () => {
      const remote = createRemoteRepo();
      const { core, guildState } = createStartedCore();
      const api = core.createApi();

      await api.add('test-codex', remote.url);
      const draft = await api.openDraft({
        codexName: 'test-codex',
        branch: 'my-feature',
      });

      assert.equal(draft.codexName, 'test-codex');
      assert.equal(draft.branch, 'my-feature');
      assert.ok(draft.id); // has an ID
      assert.ok(draft.createdAt); // has a timestamp
      assert.ok(draft.path.includes('my-feature'));

      // Worktree exists on disk
      assert.ok(fs.existsSync(draft.path));
      // Has .git file (worktree marker)
      assert.ok(fs.existsSync(path.join(draft.path, '.git')));
      // Contains the repo content
      assert.ok(fs.existsSync(path.join(draft.path, 'README.md')));
    });

    it('auto-generates branch name when omitted', async () => {
      const remote = createRemoteRepo();
      const { core } = createStartedCore();
      const api = core.createApi();

      await api.add('test-codex', remote.url);
      const draft = await api.openDraft({ codexName: 'test-codex' });

      assert.ok(draft.branch.startsWith('draft-'));
    });

    it('records associatedWith metadata', async () => {
      const remote = createRemoteRepo();
      const { core } = createStartedCore();
      const api = core.createApi();

      await api.add('test-codex', remote.url);
      const draft = await api.openDraft({
        codexName: 'test-codex',
        branch: 'writ-42',
        associatedWith: 'writ-42',
      });

      assert.equal(draft.associatedWith, 'writ-42');
    });

    it('rejects duplicate branch names', async () => {
      const remote = createRemoteRepo();
      const { core } = createStartedCore();
      const api = core.createApi();

      await api.add('test-codex', remote.url);
      await api.openDraft({ codexName: 'test-codex', branch: 'my-branch' });

      await assert.rejects(
        () => api.openDraft({ codexName: 'test-codex', branch: 'my-branch' }),
        /already exists/,
      );
    });

    it('allows same branch name on different codexes', async () => {
      const remote1 = createRemoteRepo();
      const remote2 = createRemoteRepo();
      const { core } = createStartedCore();
      const api = core.createApi();

      await api.add('codex-a', remote1.url);
      await api.add('codex-b', remote2.url);

      const draft1 = await api.openDraft({ codexName: 'codex-a', branch: 'feature' });
      const draft2 = await api.openDraft({ codexName: 'codex-b', branch: 'feature' });

      assert.notEqual(draft1.path, draft2.path);
    });

    it('throws for unknown codex', async () => {
      const { core } = createStartedCore();
      await assert.rejects(
        () => core.createApi().openDraft({ codexName: 'nonexistent' }),
        /not registered/,
      );
    });
  });

  describe('listDrafts()', () => {
    it('returns empty array when no drafts exist', async () => {
      const { core } = createStartedCore();
      const drafts = await core.createApi().listDrafts();
      assert.deepEqual(drafts, []);
    });

    it('returns all drafts', async () => {
      const remote = createRemoteRepo();
      const { core } = createStartedCore();
      const api = core.createApi();

      await api.add('test-codex', remote.url);
      await api.openDraft({ codexName: 'test-codex', branch: 'draft-1' });
      await api.openDraft({ codexName: 'test-codex', branch: 'draft-2' });

      const drafts = await api.listDrafts();
      assert.equal(drafts.length, 2);
    });

    it('filters by codex name', async () => {
      const remote1 = createRemoteRepo();
      const remote2 = createRemoteRepo();
      const { core } = createStartedCore();
      const api = core.createApi();

      await api.add('codex-a', remote1.url);
      await api.add('codex-b', remote2.url);
      await api.openDraft({ codexName: 'codex-a', branch: 'draft-a' });
      await api.openDraft({ codexName: 'codex-b', branch: 'draft-b' });

      const draftsA = await api.listDrafts('codex-a');
      assert.equal(draftsA.length, 1);
      assert.equal(draftsA[0].codexName, 'codex-a');

      const draftsB = await api.listDrafts('codex-b');
      assert.equal(draftsB.length, 1);
      assert.equal(draftsB[0].codexName, 'codex-b');
    });
  });

  describe('abandonDraft()', () => {
    it('removes the worktree and branch', async () => {
      const remote = createRemoteRepo();
      const { core } = createStartedCore();
      const api = core.createApi();

      await api.add('test-codex', remote.url);
      const draft = await api.openDraft({ codexName: 'test-codex', branch: 'my-draft' });

      assert.ok(fs.existsSync(draft.path));

      await api.abandonDraft({ codexName: 'test-codex', branch: 'my-draft', force: true });

      // Worktree gone
      assert.ok(!fs.existsSync(draft.path));
      // Removed from tracking
      const drafts = await api.listDrafts();
      assert.equal(drafts.length, 0);
    });

    it('rejects abandonment of draft with unsealed inscriptions without force', async () => {
      const remote = createRemoteRepo();
      const { core } = createStartedCore();
      const api = core.createApi();

      await api.add('test-codex', remote.url);
      const draft = await api.openDraft({ codexName: 'test-codex', branch: 'my-draft' });

      // Add a commit in the draft (an unsealed inscription)
      fs.writeFileSync(path.join(draft.path, 'new-file.txt'), 'hello\n');
      gitSync(['add', 'new-file.txt'], draft.path);
      gitSync(['config', 'user.email', 'test@test.com'], draft.path);
      gitSync(['config', 'user.name', 'Test'], draft.path);
      gitSync(['commit', '-m', 'An inscription'], draft.path);

      await assert.rejects(
        () => api.abandonDraft({ codexName: 'test-codex', branch: 'my-draft' }),
        /unsealed inscription/,
      );

      // Draft still exists
      assert.ok(fs.existsSync(draft.path));
    });

    it('allows forced abandonment of draft with unsealed inscriptions', async () => {
      const remote = createRemoteRepo();
      const { core } = createStartedCore();
      const api = core.createApi();

      await api.add('test-codex', remote.url);
      const draft = await api.openDraft({ codexName: 'test-codex', branch: 'my-draft' });

      // Add a commit in the draft
      fs.writeFileSync(path.join(draft.path, 'new-file.txt'), 'hello\n');
      gitSync(['add', 'new-file.txt'], draft.path);
      gitSync(['config', 'user.email', 'test@test.com'], draft.path);
      gitSync(['config', 'user.name', 'Test'], draft.path);
      gitSync(['commit', '-m', 'An inscription'], draft.path);

      // Force should work
      await api.abandonDraft({ codexName: 'test-codex', branch: 'my-draft', force: true });

      assert.ok(!fs.existsSync(draft.path));
    });

    it('throws for unknown draft', async () => {
      const remote = createRemoteRepo();
      const { core } = createStartedCore();
      const api = core.createApi();

      await api.add('test-codex', remote.url);

      await assert.rejects(
        () => api.abandonDraft({ codexName: 'test-codex', branch: 'nonexistent' }),
        /No active draft/,
      );
    });
  });

  // ── Sealing ───────────────────────────────────────────────────────

  describe('seal()', () => {
    it('fast-forwards when draft is ahead of sealed binding', async () => {
      const remote = createRemoteRepo();
      const { core } = createStartedCore();
      const api = core.createApi();

      await api.add('test-codex', remote.url);
      const draft = await api.openDraft({ codexName: 'test-codex', branch: 'my-draft' });

      // Make a commit in the draft
      fs.writeFileSync(path.join(draft.path, 'feature.txt'), 'new feature\n');
      gitSync(['add', 'feature.txt'], draft.path);
      gitSync(['config', 'user.email', 'test@test.com'], draft.path);
      gitSync(['config', 'user.name', 'Test'], draft.path);
      gitSync(['commit', '-m', 'Add feature'], draft.path);

      const result = await api.seal({
        codexName: 'test-codex',
        sourceBranch: 'my-draft',
      });

      assert.equal(result.success, true);
      assert.equal(result.strategy, 'fast-forward');
      assert.equal(result.retries, 0);
      assert.ok(result.sealedCommit);
    });

    it('abandons draft after successful seal by default', async () => {
      const remote = createRemoteRepo();
      const { core } = createStartedCore();
      const api = core.createApi();

      await api.add('test-codex', remote.url);
      const draft = await api.openDraft({ codexName: 'test-codex', branch: 'my-draft' });

      // Make a commit
      fs.writeFileSync(path.join(draft.path, 'feature.txt'), 'new feature\n');
      gitSync(['add', 'feature.txt'], draft.path);
      gitSync(['config', 'user.email', 'test@test.com'], draft.path);
      gitSync(['config', 'user.name', 'Test'], draft.path);
      gitSync(['commit', '-m', 'Add feature'], draft.path);

      await api.seal({ codexName: 'test-codex', sourceBranch: 'my-draft' });

      // Draft should be gone
      const drafts = await api.listDrafts();
      assert.equal(drafts.length, 0);
    });

    it('keeps draft when keepDraft is true', async () => {
      const remote = createRemoteRepo();
      const { core } = createStartedCore();
      const api = core.createApi();

      await api.add('test-codex', remote.url);
      const draft = await api.openDraft({ codexName: 'test-codex', branch: 'my-draft' });

      // Make a commit
      fs.writeFileSync(path.join(draft.path, 'feature.txt'), 'new feature\n');
      gitSync(['add', 'feature.txt'], draft.path);
      gitSync(['config', 'user.email', 'test@test.com'], draft.path);
      gitSync(['config', 'user.name', 'Test'], draft.path);
      gitSync(['commit', '-m', 'Add feature'], draft.path);

      await api.seal({
        codexName: 'test-codex',
        sourceBranch: 'my-draft',
        keepDraft: true,
      });

      // Draft should still exist
      const drafts = await api.listDrafts();
      assert.equal(drafts.length, 1);
    });

    it('seals when source and target are at the same commit', async () => {
      const remote = createRemoteRepo();
      const { core } = createStartedCore();
      const api = core.createApi();

      await api.add('test-codex', remote.url);
      await api.openDraft({ codexName: 'test-codex', branch: 'my-draft' });

      // No commits — draft is at the same point as main
      const result = await api.seal({
        codexName: 'test-codex',
        sourceBranch: 'my-draft',
      });

      assert.equal(result.success, true);
      assert.equal(result.retries, 0);
    });

    it('updates the sealed binding ref in the bare clone', async () => {
      const remote = createRemoteRepo();
      const { core, guildState } = createStartedCore();
      const api = core.createApi();

      await api.add('test-codex', remote.url);
      const draft = await api.openDraft({ codexName: 'test-codex', branch: 'my-draft' });

      // Get the main ref before
      const bareClone = path.join(guildState.home, '.nexus', 'codexes', 'test-codex.git');
      const mainBefore = gitSync(['rev-parse', 'main'], bareClone);

      // Make a commit in the draft
      fs.writeFileSync(path.join(draft.path, 'feature.txt'), 'new feature\n');
      gitSync(['add', 'feature.txt'], draft.path);
      gitSync(['config', 'user.email', 'test@test.com'], draft.path);
      gitSync(['config', 'user.name', 'Test'], draft.path);
      gitSync(['commit', '-m', 'Add feature'], draft.path);

      const result = await api.seal({
        codexName: 'test-codex',
        sourceBranch: 'my-draft',
      });

      // main should have advanced
      const mainAfter = gitSync(['rev-parse', 'main'], bareClone);
      assert.notEqual(mainBefore, mainAfter);
      assert.equal(mainAfter, result.sealedCommit);
    });

    it('inscriptionsSealed is 0 for no-op seal (draft has no new commits)', async () => {
      const remote = createRemoteRepo();
      const { core } = createStartedCore();
      const api = core.createApi();

      await api.add('test-codex', remote.url);
      await api.openDraft({ codexName: 'test-codex', branch: 'my-draft' });

      // No commits — draft is at the same point as main
      const result = await api.seal({
        codexName: 'test-codex',
        sourceBranch: 'my-draft',
      });

      assert.equal(result.inscriptionsSealed, 0);
    });

    it('inscriptionsSealed counts all draft inscriptions on fast-forward seal', async () => {
      const remote = createRemoteRepo();
      const { core } = createStartedCore();
      const api = core.createApi();

      await api.add('test-codex', remote.url);
      const draft = await api.openDraft({ codexName: 'test-codex', branch: 'my-draft' });

      gitSync(['config', 'user.email', 'test@test.com'], draft.path);
      gitSync(['config', 'user.name', 'Test'], draft.path);

      // Make 3 separate inscriptions
      for (let i = 1; i <= 3; i++) {
        fs.writeFileSync(path.join(draft.path, `inscription-${i}.txt`), `inscription ${i}\n`);
        gitSync(['add', `inscription-${i}.txt`], draft.path);
        gitSync(['commit', '-m', `Inscription ${i}`], draft.path);
      }

      const result = await api.seal({
        codexName: 'test-codex',
        sourceBranch: 'my-draft',
      });

      assert.equal(result.strategy, 'fast-forward');
      assert.equal(result.inscriptionsSealed, 3);
    });
  });

  // ── Seal: Rebase contention ──────────────────────────────────────

  describe('seal() rebase contention', () => {

    /**
     * Helper: set up a codex with two diverged drafts.
     *
     * Both draft-A and draft-B branch from the same initial commit on main.
     * Each writes to a different file so the rebase can succeed cleanly.
     *
     * Returns the api plus references to both drafts.
     */
    async function setupDivergedDrafts() {
      const remote = createRemoteRepo();
      const { core, guildState } = createStartedCore();
      const api = core.createApi();

      await api.add('test-codex', remote.url);

      const draftA = await api.openDraft({ codexName: 'test-codex', branch: 'draft-a' });
      const draftB = await api.openDraft({ codexName: 'test-codex', branch: 'draft-b' });

      // Configure git in both worktrees
      for (const d of [draftA, draftB]) {
        gitSync(['config', 'user.email', 'test@test.com'], d.path);
        gitSync(['config', 'user.name', 'Test'], d.path);
      }

      // Draft A commits to file-a.txt
      fs.writeFileSync(path.join(draftA.path, 'file-a.txt'), 'from draft A\n');
      gitSync(['add', 'file-a.txt'], draftA.path);
      gitSync(['commit', '-m', 'Draft A inscription'], draftA.path);

      // Draft B commits to file-b.txt (no conflict with A)
      fs.writeFileSync(path.join(draftB.path, 'file-b.txt'), 'from draft B\n');
      gitSync(['add', 'file-b.txt'], draftB.path);
      gitSync(['commit', '-m', 'Draft B inscription'], draftB.path);

      return { api, guildState, draftA, draftB, remote };
    }

    it('rebases and seals when another draft advanced the target', async () => {
      const { api, guildState, draftA, draftB } = await setupDivergedDrafts();

      // Seal draft A first — this advances main past the common ancestor
      const resultA = await api.seal({
        codexName: 'test-codex',
        sourceBranch: 'draft-a',
      });
      assert.equal(resultA.success, true);
      assert.equal(resultA.strategy, 'fast-forward');
      assert.equal(resultA.retries, 0);

      // Now seal draft B — main has moved, so ff won't work; must rebase
      const resultB = await api.seal({
        codexName: 'test-codex',
        sourceBranch: 'draft-b',
      });

      assert.equal(resultB.success, true);
      assert.equal(resultB.strategy, 'rebase');
      // At least 1 retry (the initial ff attempt fails, rebase, then ff succeeds)
      assert.ok(resultB.retries >= 1, `Expected retries >= 1, got ${resultB.retries}`);
      assert.ok(resultB.sealedCommit);

      // The sealed commit should contain both files
      const bareClone = path.join(guildState.home, '.nexus', 'codexes', 'test-codex.git');
      const mainRef = gitSync(['rev-parse', 'main'], bareClone);
      assert.equal(mainRef, resultB.sealedCommit);

      // Verify both inscriptions are present by checking the tree
      const tree = gitSync(['ls-tree', '--name-only', 'main'], bareClone);
      assert.ok(tree.includes('file-a.txt'), 'file-a.txt should be in tree after both seals');
      assert.ok(tree.includes('file-b.txt'), 'file-b.txt should be in tree after both seals');
    });

    it('reports rebase strategy and retry count accurately', async () => {
      const { api } = await setupDivergedDrafts();

      // Seal A (ff)
      await api.seal({ codexName: 'test-codex', sourceBranch: 'draft-a' });

      // Seal B (rebase required)
      const result = await api.seal({
        codexName: 'test-codex',
        sourceBranch: 'draft-b',
      });

      // Strategy should be 'rebase' because ff was attempted and failed
      assert.equal(result.strategy, 'rebase');
      // Retries tracks the number of rebase-then-retry loops
      assert.ok(result.retries >= 1);
    });

    it('fails with conflict error when rebase cannot resolve', async () => {
      const remote = createRemoteRepo();
      const { core } = createStartedCore();
      const api = core.createApi();

      await api.add('test-codex', remote.url);

      const draftA = await api.openDraft({ codexName: 'test-codex', branch: 'draft-a' });
      const draftB = await api.openDraft({ codexName: 'test-codex', branch: 'draft-b' });

      for (const d of [draftA, draftB]) {
        gitSync(['config', 'user.email', 'test@test.com'], d.path);
        gitSync(['config', 'user.name', 'Test'], d.path);
      }

      // Both drafts write conflicting content to the SAME file
      fs.writeFileSync(path.join(draftA.path, 'conflict.txt'), 'content from A\n');
      gitSync(['add', 'conflict.txt'], draftA.path);
      gitSync(['commit', '-m', 'Draft A writes conflict.txt'], draftA.path);

      fs.writeFileSync(path.join(draftB.path, 'conflict.txt'), 'content from B\n');
      gitSync(['add', 'conflict.txt'], draftB.path);
      gitSync(['commit', '-m', 'Draft B writes conflict.txt'], draftB.path);

      // Seal A — should succeed (ff)
      await api.seal({ codexName: 'test-codex', sourceBranch: 'draft-a' });

      // Seal B — rebase will conflict
      await assert.rejects(
        () => api.seal({ codexName: 'test-codex', sourceBranch: 'draft-b' }),
        /Sealing seized.*conflicts/,
      );

      // Draft B should still exist (not cleaned up on failure)
      const drafts = await api.listDrafts();
      assert.equal(drafts.length, 1);
      assert.equal(drafts[0].branch, 'draft-b');
    });

    it('respects maxRetries limit', async () => {
      const { api } = await setupDivergedDrafts();

      // Seal A first
      await api.seal({ codexName: 'test-codex', sourceBranch: 'draft-a' });

      // Seal B with maxRetries=0 — should fail since ff won't work
      // and we don't allow any retries after the initial attempt
      await assert.rejects(
        () => api.seal({
          codexName: 'test-codex',
          sourceBranch: 'draft-b',
          maxRetries: 0,
        }),
        /failed after 0 retries/,
      );
    });
  });

  // ── Seal: Diverged remote ─────────────────────────────────────────

  describe('seal() diverged remote', () => {

    /**
     * Helper: push a commit to the remote bare repo from an external clone,
     * simulating work done outside the Scriptorium.
     */
    function pushExternalCommit(remoteUrl: string, filename: string, content: string): void {
      const outsideClone = makeTmpDir('outside-clone');
      // git clone needs a non-existent or empty target dir
      fs.rmSync(outsideClone, { recursive: true });
      gitSync(['clone', remoteUrl, outsideClone], os.tmpdir());
      gitSync(['config', 'user.email', 'outside@test.com'], outsideClone);
      gitSync(['config', 'user.name', 'Outside'], outsideClone);
      fs.writeFileSync(path.join(outsideClone, filename), content);
      gitSync(['add', filename], outsideClone);
      gitSync(['commit', '-m', `External: ${filename}`], outsideClone);
      gitSync(['push', 'origin', 'main'], outsideClone);
    }

    it('seals successfully when remote advances between draft open and seal', async () => {
      const remote = createRemoteRepo();
      const { core, guildState } = createStartedCore();
      const api = core.createApi();

      await api.add('test-codex', remote.url);
      const draft = await api.openDraft({ codexName: 'test-codex', branch: 'my-draft' });

      gitSync(['config', 'user.email', 'test@test.com'], draft.path);
      gitSync(['config', 'user.name', 'Test'], draft.path);

      // Make an inscription in the draft
      fs.writeFileSync(path.join(draft.path, 'draft-feature.txt'), 'draft work\n');
      gitSync(['add', 'draft-feature.txt'], draft.path);
      gitSync(['commit', '-m', 'Draft inscription'], draft.path);

      // Simulate external push to the remote (outside the Scriptorium)
      pushExternalCommit(remote.url, 'external-change.txt', 'external work\n');

      // Confirm the bare clone's main is now behind the remote
      const bareClone = path.join(guildState.home, '.nexus', 'codexes', 'test-codex.git');
      const remoteHead = gitSync(['rev-parse', 'main'], remote.path);
      const bareMainBefore = gitSync(['rev-parse', 'main'], bareClone);
      assert.notEqual(remoteHead, bareMainBefore, 'Remote should have advanced past bare clone before seal');

      // Seal should succeed: fetch picks up remote advancement, rebase handles divergence
      const result = await api.seal({
        codexName: 'test-codex',
        sourceBranch: 'my-draft',
        keepDraft: true,
      });

      assert.equal(result.success, true);
      assert.equal(result.strategy, 'rebase');
      assert.ok(result.retries >= 1, `Expected retries >= 1, got ${result.retries}`);
      assert.equal(result.inscriptionsSealed, 1);

      // Sealed binding should include both the draft inscription and the external commit
      const bareMainAfter = gitSync(['rev-parse', 'main'], bareClone);
      assert.equal(bareMainAfter, result.sealedCommit);

      const tree = gitSync(['ls-tree', '--name-only', 'main'], bareClone);
      assert.ok(tree.includes('draft-feature.txt'), 'draft-feature.txt should be in sealed tree');
      assert.ok(tree.includes('external-change.txt'), 'external-change.txt should be in sealed tree');
    });

    it('push succeeds after sealing against a diverged remote', async () => {
      const remote = createRemoteRepo();
      const { core } = createStartedCore();
      const api = core.createApi();

      await api.add('test-codex', remote.url);
      const draft = await api.openDraft({ codexName: 'test-codex', branch: 'my-draft' });

      gitSync(['config', 'user.email', 'test@test.com'], draft.path);
      gitSync(['config', 'user.name', 'Test'], draft.path);

      fs.writeFileSync(path.join(draft.path, 'draft-work.txt'), 'draft\n');
      gitSync(['add', 'draft-work.txt'], draft.path);
      gitSync(['commit', '-m', 'Draft work'], draft.path);

      // External push advances remote
      pushExternalCommit(remote.url, 'external.txt', 'external\n');

      // Seal — must rebase onto the remote-advanced main
      const result = await api.seal({ codexName: 'test-codex', sourceBranch: 'my-draft' });
      assert.equal(result.strategy, 'rebase');

      // Push should fast-forward cleanly (the sealed binding is rebased on remote's latest)
      await assert.doesNotReject(
        () => api.push({ codexName: 'test-codex' }),
        'Push should succeed after sealing against diverged remote',
      );

      // Confirm remote has the sealed commit
      const remoteHead = gitSync(['rev-parse', 'main'], remote.path);
      assert.equal(remoteHead, result.sealedCommit);
    });
  });

  // ── Startup Reconciliation ────────────────────────────────────────

  describe('startup reconciliation', () => {
    it('reconciles drafts from existing worktrees on disk', async () => {
      const remote = createRemoteRepo();
      const home = makeTmpDir('guild');

      // First: create a core, add a codex, open a draft
      const guildState1: FakeGuildState = {
        home,
        configs: {},
      };
      setGuild(createFakeGuild(guildState1));

      const core1 = new ScriptoriumCore();
      core1.start();
      const api1 = core1.createApi();

      await api1.add('test-codex', remote.url);
      const draft = await api1.openDraft({ codexName: 'test-codex', branch: 'my-draft' });

      // Verify draft exists
      assert.ok(fs.existsSync(draft.path));

      // Now simulate a restart: create a new core with the same home
      clearGuild();
      const guildState2: FakeGuildState = {
        home,
        configs: guildState1.configs, // keep the config
      };
      setGuild(createFakeGuild(guildState2));

      const core2 = new ScriptoriumCore();
      core2.start();
      const api2 = core2.createApi();

      // The draft should be reconciled from disk
      const drafts = await api2.listDrafts();
      assert.equal(drafts.length, 1);
      assert.equal(drafts[0].codexName, 'test-codex');
      assert.equal(drafts[0].branch, 'my-draft');
      assert.equal(drafts[0].path, draft.path);
    });
  });

  // ── Push ─────────────────────────────────────────────────────────

  describe('push()', () => {
    it('pushes sealed commits to the remote', async () => {
      const remote = createRemoteRepo();
      const { core } = createStartedCore();
      const api = core.createApi();

      await api.add('test-codex', remote.url);
      const draft = await api.openDraft({ codexName: 'test-codex', branch: 'my-draft' });

      // Make a commit and seal
      fs.writeFileSync(path.join(draft.path, 'feature.txt'), 'pushed feature\n');
      gitSync(['add', 'feature.txt'], draft.path);
      gitSync(['config', 'user.email', 'test@test.com'], draft.path);
      gitSync(['config', 'user.name', 'Test'], draft.path);
      gitSync(['commit', '-m', 'Add pushed feature'], draft.path);

      const sealResult = await api.seal({ codexName: 'test-codex', sourceBranch: 'my-draft' });

      // Push to remote
      await api.push({ codexName: 'test-codex' });

      // Verify the remote has the commit
      const remoteHead = gitSync(['rev-parse', 'main'], remote.path);
      assert.equal(remoteHead, sealResult.sealedCommit);
    });

    it('throws for unknown codex', async () => {
      const { core } = createStartedCore();
      await assert.rejects(
        () => core.createApi().push({ codexName: 'nonexistent' }),
        /not registered/,
      );
    });
  });
});

=== CONTEXT FILE: packages/plugins/codexes/src/types.ts ===
/**
 * The Scriptorium — type definitions.
 *
 * All public types for the codexes apparatus: the ScriptoriumApi
 * (provides interface), supporting record types, and request/result
 * types for draft lifecycle and sealing operations.
 *
 * See: docs/architecture/apparatus/scriptorium.md
 */

// ── Codex Registry ──────────────────────────────────────────────────

export interface CodexRecord {
  /** Codex name — unique within the guild. */
  name: string
  /** Remote repository URL. */
  remoteUrl: string
  /** Whether the bare clone exists and is healthy. */
  cloneStatus: 'ready' | 'cloning' | 'error'
  /** Number of active drafts for this codex. */
  activeDrafts: number
}

export interface CodexDetail extends CodexRecord {
  /** Default branch name on the remote (e.g. 'main'). */
  defaultBranch: string
  /** Timestamp of last fetch. */
  lastFetched: string | null
  /** Active drafts for this codex. */
  drafts: DraftRecord[]
}

// ── Draft Bindings ──────────────────────────────────────────────────

export interface DraftRecord {
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

// ── Request / Result Types ──────────────────────────────────────────

export interface OpenDraftRequest {
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

export interface AbandonDraftRequest {
  /** Codex name. */
  codexName: string
  /** Git branch name of the draft to abandon. */
  branch: string
  /** Force abandonment even if the draft has unsealed inscriptions. */
  force?: boolean
}

export interface SealRequest {
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

export interface SealResult {
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

export interface PushRequest {
  /** Codex name. */
  codexName: string
  /**
   * Branch to push. Default: codex's default branch.
   */
  branch?: string
}

// ── Configuration ───────────────────────────────────────────────────

export interface CodexesConfig {
  settings?: CodexesSettings
  registered?: Record<string, CodexConfigEntry>
}

export interface CodexesSettings {
  /** Max rebase-retry attempts during sealing under contention. Default: 3. */
  maxMergeRetries?: number
  /** Directory where draft worktrees are created, relative to guild root. Default: '.nexus/worktrees'. */
  draftRoot?: string
}

export interface CodexConfigEntry {
  /** The remote URL of the codex's git repository. */
  remoteUrl: string
}

// ── API ─────────────────────────────────────────────────────────────

export interface ScriptoriumApi {
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

=== CONTEXT FILE: packages/plugins/codexes/src/git.test.ts ===
/**
 * Tests for the git helper module.
 */

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import { git, resolveDefaultBranch, resolveRef, commitsAhead, GitError } from './git.ts';

// ── Test infrastructure ─────────────────────────────────────────────

let tmpDirs: string[] = [];

function makeTmpDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `nsg-git-test-${prefix}-`));
  tmpDirs.push(dir);
  return dir;
}

function gitSync(args: string[], cwd: string): string {
  return execFileSync('git', args, { cwd, encoding: 'utf-8' }).trim();
}

function createTestRepo(): string {
  const dir = makeTmpDir('repo');
  gitSync(['init', '-b', 'main'], dir);
  gitSync(['config', 'user.email', 'test@test.com'], dir);
  gitSync(['config', 'user.name', 'Test'], dir);
  fs.writeFileSync(path.join(dir, 'README.md'), '# Test\n');
  gitSync(['add', 'README.md'], dir);
  gitSync(['commit', '-m', 'Initial commit'], dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* */ }
  }
  tmpDirs = [];
});

// ── Tests ───────────────────────────────────────────────────────────

describe('git()', () => {
  it('runs a git command and returns stdout', async () => {
    const repo = createTestRepo();
    const result = await git(['rev-parse', 'HEAD'], repo);
    assert.ok(result.stdout.length === 40); // SHA-1 hash
  });

  it('throws GitError on failure', async () => {
    const repo = createTestRepo();
    try {
      await git(['rev-parse', 'nonexistent-ref'], repo);
      assert.fail('Expected GitError');
    } catch (err) {
      assert.ok(err instanceof GitError);
      assert.ok(err.message.includes('rev-parse failed'));
      assert.deepEqual(err.command[0], 'git');
    }
  });
});

describe('resolveDefaultBranch()', () => {
  it('returns the default branch name', async () => {
    const repo = createTestRepo();
    const branch = await resolveDefaultBranch(repo);
    assert.equal(branch, 'main');
  });
});

describe('resolveRef()', () => {
  it('returns the commit SHA for a branch', async () => {
    const repo = createTestRepo();
    const sha = await resolveRef(repo, 'main');
    assert.ok(sha.length === 40);

    // Should match what git rev-parse gives us directly
    const expected = gitSync(['rev-parse', 'main'], repo);
    assert.equal(sha, expected);
  });
});

describe('commitsAhead()', () => {
  it('returns 0 when branches are at the same commit', async () => {
    const repo = createTestRepo();
    gitSync(['branch', 'feature'], repo);
    const ahead = await commitsAhead(repo, 'feature', 'main');
    assert.equal(ahead, 0);
  });

  it('returns the number of commits ahead', async () => {
    const repo = createTestRepo();
    gitSync(['checkout', '-b', 'feature'], repo);
    fs.writeFileSync(path.join(repo, 'a.txt'), 'a\n');
    gitSync(['add', 'a.txt'], repo);
    gitSync(['commit', '-m', 'first'], repo);
    fs.writeFileSync(path.join(repo, 'b.txt'), 'b\n');
    gitSync(['add', 'b.txt'], repo);
    gitSync(['commit', '-m', 'second'], repo);

    const ahead = await commitsAhead(repo, 'feature', 'main');
    assert.equal(ahead, 2);
  });
});

=== CONTEXT FILE: packages/plugins/parlour/src/parlour.test.ts ===
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

import { createParlour } from './parlour.ts';
import type { ParlourApi } from './types.ts';

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

// ── Test harness ─────────────────────────────────────────────────────

let parlour: ParlourApi;

function setup(provider: AnimatorSessionProvider = createFakeProvider()) {
  const memBackend = new MemoryBackend();
  const stacksPlugin = createStacksApparatus(memBackend);
  const animatorPlugin = createAnimator();
  const loomPlugin = createLoom();
  const parlourPlugin = createParlour();

  const apparatusMap = new Map<string, unknown>();
  apparatusMap.set('fake-provider', provider);

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
      };
    },
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
});

=== CONTEXT FILE: packages/plugins/parlour/src/types.ts ===
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


## Codebase Structure (surrounding directories)

```
```

=== TREE: packages/framework/core/src/ ===
guild-config.ts
guild.ts
id.ts
index.ts
nexus-home.ts
plugin.ts
resolve-package.test.ts
resolve-package.ts

=== TREE: packages/plugins/animator/src/ ===
animator.test.ts
animator.ts
index.ts
tools
types.ts

=== TREE: packages/plugins/codexes/src/ ===
git.test.ts
git.ts
index.ts
scriptorium-core.test.ts
scriptorium-core.ts
scriptorium.ts
tools
types.ts

=== TREE: packages/plugins/parlour/src/ ===
index.ts
parlour.test.ts
parlour.ts
tools
types.ts

```
```
