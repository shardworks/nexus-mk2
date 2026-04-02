## Commission Diff

```
```
 packages/plugins/animator/src/animator.test.ts | 70 +++++++++++++++++++++++++
 packages/plugins/dispatch/src/dispatch.test.ts | 61 ++++++++++++++++++++++
 packages/plugins/loom/src/loom.test.ts         | 71 ++++++++++++++++++++++++++
 3 files changed, 202 insertions(+)

diff --git a/packages/plugins/animator/src/animator.test.ts b/packages/plugins/animator/src/animator.test.ts
index 7218f5b..49575b8 100644
--- a/packages/plugins/animator/src/animator.test.ts
+++ b/packages/plugins/animator/src/animator.test.ts
@@ -336,6 +336,39 @@ describe('Animator', () => {
       assert.equal(captured!.cwd, '/tmp/workdir');
     });
 
+    it('passes context environment through to provider', async () => {
+      const { provider, getCapturedConfig } = createSpyProvider();
+      setup(provider);
+
+      await animator.animate({
+        context: { systemPrompt: 'Test', environment: { GIT_AUTHOR_NAME: 'Custom' } },
+        cwd: '/tmp/workdir',
+      }).result;
+
+      const captured = getCapturedConfig();
+      assert.ok(captured);
+      assert.deepStrictEqual(captured!.environment, { GIT_AUTHOR_NAME: 'Custom' });
+    });
+
+    it('merges request environment over context environment', async () => {
+      const { provider, getCapturedConfig } = createSpyProvider();
+      setup(provider);
+
+      await animator.animate({
+        context: {
+          systemPrompt: 'Test',
+          environment: { GIT_AUTHOR_NAME: 'FromContext', GIT_AUTHOR_EMAIL: 'context@nexus.local' },
+        },
+        environment: { GIT_AUTHOR_NAME: 'FromRequest' },
+        cwd: '/tmp/workdir',
+      }).result;
+
+      const captured = getCapturedConfig();
+      assert.ok(captured);
+      assert.equal(captured!.environment?.GIT_AUTHOR_NAME, 'FromRequest');
+      assert.equal(captured!.environment?.GIT_AUTHOR_EMAIL, 'context@nexus.local');
+    });
+
     it('records failed session when provider throws', async () => {
       const throwProvider = createThrowingProvider(new Error('Provider exploded'));
       setup(throwProvider);
@@ -776,5 +809,42 @@ describe('Animator', () => {
       const sessionResult = await result;
       assert.equal(sessionResult.status, 'completed');
     });
+
+    it('passes Loom environment to provider when no request environment', async () => {
+      const { provider, getCapturedConfig } = createSpyProvider();
+      setup(provider, 'fake-provider', { installLoom: true });
+
+      await animator.summon({
+        prompt: 'Build the thing',
+        role: 'artificer',
+        cwd: '/tmp/workdir',
+      }).result;
+
+      const captured = getCapturedConfig();
+      assert.ok(captured);
+      assert.deepStrictEqual(captured!.environment, {
+        GIT_AUTHOR_NAME: 'Artificer',
+        GIT_AUTHOR_EMAIL: 'artificer@nexus.local',
+        GIT_COMMITTER_NAME: 'Artificer',
+        GIT_COMMITTER_EMAIL: 'artificer@nexus.local',
+      });
+    });
+
+    it('merges request environment over Loom environment', async () => {
+      const { provider, getCapturedConfig } = createSpyProvider();
+      setup(provider, 'fake-provider', { installLoom: true });
+
+      await animator.summon({
+        prompt: 'Build the thing',
+        role: 'artificer',
+        cwd: '/tmp/workdir',
+        environment: { GIT_AUTHOR_EMAIL: 'override@nexus.local' },
+      }).result;
+
+      const captured = getCapturedConfig();
+      assert.ok(captured);
+      assert.equal(captured!.environment?.GIT_AUTHOR_NAME, 'Artificer');
+      assert.equal(captured!.environment?.GIT_AUTHOR_EMAIL, 'override@nexus.local');
+    });
   });
 });
diff --git a/packages/plugins/dispatch/src/dispatch.test.ts b/packages/plugins/dispatch/src/dispatch.test.ts
index fa11aef..038e56e 100644
--- a/packages/plugins/dispatch/src/dispatch.test.ts
+++ b/packages/plugins/dispatch/src/dispatch.test.ts
@@ -111,6 +111,32 @@ function createFakeScriptorium(options: FakeScriptoriumOptions = {}): Scriptoriu
   };
 }
 
+// ── Spy fake provider (captures SessionProviderConfig) ───────────────
+
+function createSpyFakeProvider(): {
+  provider: AnimatorSessionProvider;
+  getCapturedConfig: () => SessionProviderConfig | null;
+} {
+  let capturedConfig: SessionProviderConfig | null = null;
+  return {
+    provider: {
+      name: 'fake-spy',
+      launch(config: SessionProviderConfig) {
+        capturedConfig = config;
+        return {
+          chunks: emptyChunks,
+          result: Promise.resolve({
+            status: 'completed' as const,
+            exitCode: 0,
+            providerSessionId: 'fake-spy-sess',
+          }),
+        };
+      },
+    },
+    getCapturedConfig: () => capturedConfig,
+  };
+}
+
 // ── Test harness ──────────────────────────────────────────────────────
 
 interface SetupOptions {
@@ -544,4 +570,39 @@ describe('Dispatch', () => {
       assert.equal(result.writId, ready.id);
     });
   });
+
+  // ── Git identity environment ──────────────────────────────────────
+
+  describe('next() — git identity environment', () => {
+    it('passes writ-scoped GIT_*_EMAIL to the session provider', async () => {
+      const { provider, getCapturedConfig } = createSpyFakeProvider();
+      const { dispatch, clerk } = setup({ provider });
+
+      const writ = await clerk.post({ title: 'Git identity test', body: '' });
+
+      await dispatch.next();
+
+      const captured = getCapturedConfig();
+      assert.ok(captured);
+      assert.ok(captured!.environment, 'environment should be present');
+      assert.equal(captured!.environment?.GIT_AUTHOR_EMAIL, `${writ.id}@nexus.local`);
+      assert.equal(captured!.environment?.GIT_COMMITTER_EMAIL, `${writ.id}@nexus.local`);
+      assert.ok(captured!.environment?.GIT_AUTHOR_NAME, 'GIT_AUTHOR_NAME should be present');
+      assert.ok(captured!.environment?.GIT_COMMITTER_NAME, 'GIT_COMMITTER_NAME should be present');
+    });
+
+    it('preserves Loom role name in GIT_*_NAME while overriding email', async () => {
+      const { provider, getCapturedConfig } = createSpyFakeProvider();
+      const { dispatch, clerk } = setup({ provider });
+
+      const writ = await clerk.post({ title: 'Name/email split test', body: '' });
+
+      await dispatch.next();
+
+      const captured = getCapturedConfig();
+      assert.ok(captured);
+      assert.equal(captured!.environment?.GIT_AUTHOR_NAME, 'Artificer');
+      assert.equal(captured!.environment?.GIT_AUTHOR_EMAIL, `${writ.id}@nexus.local`);
+    });
+  });
 });
diff --git a/packages/plugins/loom/src/loom.test.ts b/packages/plugins/loom/src/loom.test.ts
index 418d9d3..d108305 100644
--- a/packages/plugins/loom/src/loom.test.ts
+++ b/packages/plugins/loom/src/loom.test.ts
@@ -137,6 +137,13 @@ describe('The Loom', () => {
       const weave = await api.weave({ role: 'artificer' });
       assert.ok(!('initialPrompt' in weave), 'AnimaWeave should not have initialPrompt');
     });
+
+    it('returns undefined environment when no role is provided', async () => {
+      setupGuild({});
+      const api = startLoom();
+      const weave = await api.weave({});
+      assert.strictEqual(weave.environment, undefined);
+    });
   });
 
   describe('weave() — role with tool resolution', () => {
@@ -256,5 +263,69 @@ describe('The Loom', () => {
 
       assert.equal(calls[0]!.caller, 'anima');
     });
+
+    it('derives git identity environment from role name', async () => {
+      const { api: instrumentarium } = mockInstrumentarium([]);
+
+      setupGuild({
+        loomConfig: {
+          roles: {
+            artificer: { permissions: ['*:*'] },
+          },
+        },
+        apparatuses: { tools: instrumentarium },
+      });
+
+      const api = startLoom();
+      const weave = await api.weave({ role: 'artificer' });
+
+      assert.deepStrictEqual(weave.environment, {
+        GIT_AUTHOR_NAME: 'Artificer',
+        GIT_AUTHOR_EMAIL: 'artificer@nexus.local',
+        GIT_COMMITTER_NAME: 'Artificer',
+        GIT_COMMITTER_EMAIL: 'artificer@nexus.local',
+      });
+    });
+
+    it('capitalizes first letter of role name for display name', async () => {
+      const { api: instrumentarium } = mockInstrumentarium([]);
+
+      setupGuild({
+        loomConfig: {
+          roles: {
+            scribe: { permissions: ['stacks:read'] },
+          },
+        },
+        apparatuses: { tools: instrumentarium },
+      });
+
+      const api = startLoom();
+      const weave = await api.weave({ role: 'scribe' });
+
+      assert.equal(weave.environment?.GIT_AUTHOR_NAME, 'Scribe');
+      assert.equal(weave.environment?.GIT_COMMITTER_NAME, 'Scribe');
+    });
+
+    it('derives environment even for unknown roles', async () => {
+      const { api: instrumentarium } = mockInstrumentarium([]);
+
+      setupGuild({
+        loomConfig: {
+          roles: {
+            artificer: { permissions: ['*:*'] },
+          },
+        },
+        apparatuses: { tools: instrumentarium },
+      });
+
+      const api = startLoom();
+      const weave = await api.weave({ role: 'unknown-role' });
+
+      assert.ok(weave.environment, 'environment should be defined for any role string');
+      assert.equal(weave.environment?.GIT_AUTHOR_NAME, 'Unknown-role');
+      assert.equal(weave.environment?.GIT_AUTHOR_EMAIL, 'unknown-role@nexus.local');
+      assert.equal(weave.environment?.GIT_COMMITTER_NAME, 'Unknown-role');
+      assert.equal(weave.environment?.GIT_COMMITTER_EMAIL, 'unknown-role@nexus.local');
+    });
   });
 });
```
```

## Full File Contents (for context)


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
        GIT_COMMITTER_NAME: 'Artificer',
        GIT_COMMITTER_EMAIL: 'artificer@nexus.local',
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
      assert.equal(captured!.environment?.GIT_COMMITTER_EMAIL, `${writ.id}@nexus.local`);
      assert.ok(captured!.environment?.GIT_AUTHOR_NAME, 'GIT_AUTHOR_NAME should be present');
      assert.ok(captured!.environment?.GIT_COMMITTER_NAME, 'GIT_COMMITTER_NAME should be present');
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
        GIT_COMMITTER_NAME: 'Artificer',
        GIT_COMMITTER_EMAIL: 'artificer@nexus.local',
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
      assert.equal(weave.environment?.GIT_COMMITTER_NAME, 'Scribe');
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
      assert.equal(weave.environment?.GIT_COMMITTER_NAME, 'Unknown-role');
      assert.equal(weave.environment?.GIT_COMMITTER_EMAIL, 'unknown-role@nexus.local');
    });
  });
});


## Convention Reference (sibling files not modified by this commission)


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

=== CONTEXT FILE: packages/plugins/dispatch/src/dispatch.ts ===
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
          GIT_COMMITTER_EMAIL: `${writ.id}@nexus.local`,
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

=== CONTEXT FILE: packages/plugins/loom/src/loom.ts ===
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
          GIT_COMMITTER_NAME: displayName,
          GIT_COMMITTER_EMAIL: `${request.role}@nexus.local`,
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

=== TREE: packages/plugins/loom/src/ ===
index.ts
loom.test.ts
loom.ts

```
```
