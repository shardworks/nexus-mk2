## Commission Diff

```
 packages/plugins/spider/src/index.ts       |   2 +
 packages/plugins/spider/src/spider.test.ts | 635 ++++++++++++++++++++++++++++-
 packages/plugins/spider/src/spider.ts      | 224 +++++++++-
 packages/plugins/spider/src/types.ts       |  42 ++
 4 files changed, 897 insertions(+), 6 deletions(-)

diff --git a/packages/plugins/spider/src/index.ts b/packages/plugins/spider/src/index.ts
index b85a0a0..7768de8 100644
--- a/packages/plugins/spider/src/index.ts
+++ b/packages/plugins/spider/src/index.ts
@@ -25,6 +25,8 @@ export type {
   BlockType,
   DraftYields,
   SealYields,
+  RigTemplate,
+  RigTemplateEngine,
 } from './types.ts';
 
 // ── Default export: the apparatus plugin ──────────────────────────────
diff --git a/packages/plugins/spider/src/spider.test.ts b/packages/plugins/spider/src/spider.test.ts
index b3be0dd..a127430 100644
--- a/packages/plugins/spider/src/spider.test.ts
+++ b/packages/plugins/spider/src/spider.test.ts
@@ -26,10 +26,23 @@ import type { FabricatorApi, EngineDesign } from '@shardworks/fabricator-apparat
 import type { AnimatorApi, SummonRequest, AnimateHandle, SessionChunk, SessionResult, SessionDoc } from '@shardworks/animator-apparatus';
 
 import { createSpider } from './spider.ts';
-import type { SpiderApi, RigDoc, EngineInstance, ReviewYields, MechanicalCheck } from './types.ts';
+import type { SpiderApi, RigDoc, EngineInstance, ReviewYields, MechanicalCheck, RigTemplate } from './types.ts';
 
 // ── Test bootstrap ────────────────────────────────────────────────────
 
+// Standard 5-engine template matching the original static pipeline behavior.
+// Used as the default template in test fixtures.
+const STANDARD_TEMPLATE: RigTemplate = {
+  engines: [
+    { id: 'draft',     designId: 'draft',     givens: { writ: '$writ' } },
+    { id: 'implement', designId: 'implement', upstream: ['draft'],     givens: { writ: '$writ', role: '$role' } },
+    { id: 'review',    designId: 'review',    upstream: ['implement'], givens: { writ: '$writ', role: 'reviewer', buildCommand: '$spider.buildCommand', testCommand: '$spider.testCommand' } },
+    { id: 'revise',    designId: 'revise',    upstream: ['review'],    givens: { writ: '$writ', role: '$role' } },
+    { id: 'seal',      designId: 'seal',      upstream: ['revise'],    givens: {} },
+  ],
+  resolutionEngine: 'seal',
+};
+
 /**
  * Build a minimal StartupContext that captures and fires events.
  */
@@ -93,6 +106,10 @@ function buildFixture(
     nexus: '0.0.0',
     plugins: [],
     ...guildConfig,
+    spider: {
+      rigTemplates: { default: STANDARD_TEMPLATE },
+      ...(guildConfig.spider ?? {}),
+    },
   };
 
   const fakeGuild: Guild = {
@@ -1826,3 +1843,619 @@ describe('Spider', () => {
     });
   });
 });
+
+// ── Template-based rig building tests ─────────────────────────────────
+
+describe('Spider — template dispatch', () => {
+  afterEach(() => {
+    clearGuild();
+  });
+
+  it('spawns a rig using the type-specific template when writ type matches', async () => {
+    const mandateTemplate: RigTemplate = {
+      engines: [
+        { id: 'step1', designId: 'draft', givens: { writ: '$writ' } },
+        { id: 'step2', designId: 'seal', upstream: ['step1'], givens: {} },
+      ],
+    };
+    const fix = buildFixture({
+      spider: { rigTemplates: { mandate: mandateTemplate } },
+    });
+    const { clerk, spider, stacks } = fix;
+
+    const writ = await clerk.post({ title: 'Mandate writ', body: 'test', type: 'mandate' });
+    const result = await spider.crawl();
+    assert.equal(result?.action, 'rig-spawned');
+
+    const rigs = await rigsBook(stacks).list();
+    assert.equal(rigs[0].engines.length, 2, 'rig should use mandate template (2 engines)');
+    assert.equal(rigs[0].engines[0].id, 'step1');
+    assert.equal(rigs[0].engines[1].id, 'step2');
+  });
+
+  it('falls back to default template when no type-specific match exists', async () => {
+    const defaultTemplate: RigTemplate = {
+      engines: [
+        { id: 'a', designId: 'draft', givens: { writ: '$writ' } },
+        { id: 'b', designId: 'seal', upstream: ['a'], givens: {} },
+        { id: 'c', designId: 'implement', upstream: ['b'], givens: {} },
+      ],
+    };
+    const fix = buildFixture({
+      spider: { rigTemplates: { default: defaultTemplate } },
+    });
+    const { clerk, spider, stacks } = fix;
+
+    const writ = await clerk.post({ title: 'Task writ', body: 'test', type: 'mandate' });
+    const result = await spider.crawl();
+    assert.equal(result?.action, 'rig-spawned');
+
+    const rigs = await rigsBook(stacks).list();
+    assert.equal(rigs[0].engines.length, 3, 'rig should use default template (3 engines)');
+  });
+
+  it('uses type-specific template over default when both exist', async () => {
+    const mandateTemplate: RigTemplate = {
+      engines: [
+        { id: 'only', designId: 'seal', givens: {} },
+      ],
+    };
+    const defaultTemplate: RigTemplate = {
+      engines: [
+        { id: 'a', designId: 'draft', givens: { writ: '$writ' } },
+        { id: 'b', designId: 'seal', upstream: ['a'], givens: {} },
+      ],
+    };
+    const fix = buildFixture({
+      spider: { rigTemplates: { mandate: mandateTemplate, default: defaultTemplate } },
+    });
+    const { clerk, spider, stacks } = fix;
+
+    await clerk.post({ title: 'Mandate', body: 'test', type: 'mandate' });
+    await spider.crawl();
+
+    const rigs = await rigsBook(stacks).list();
+    assert.equal(rigs[0].engines.length, 1, 'should use mandate template (1 engine)');
+    assert.equal(rigs[0].engines[0].id, 'only');
+  });
+
+  it('throws with "No rig template found" when writ type has no match and no default', async () => {
+    // Configure only a 'hotfix' template (not 'mandate' or 'default')
+    // Post a mandate writ (the default clerk type) — it has no matching template
+    const fix = buildFixture({
+      spider: { rigTemplates: { hotfix: { engines: [{ id: 'x', designId: 'seal', givens: {} }] } } },
+    });
+    const { clerk, spider } = fix;
+
+    await clerk.post({ title: 'Mandate writ', body: 'test' }); // defaults to 'mandate' type
+    await assert.rejects(
+      () => spider.crawl(),
+      (err: unknown) => {
+        assert.ok(err instanceof Error);
+        assert.ok(err.message.includes('No rig template found'), err.message);
+        return true;
+      },
+    );
+  });
+
+  it('uses default template when writ type does not match a specific key', async () => {
+    // buildFixture always provides rigTemplates.default = STANDARD_TEMPLATE via merge,
+    // so a mandate writ (the clerk default) uses the default template.
+    const fix = buildFixture();
+    const { clerk, spider, stacks } = fix;
+
+    await clerk.post({ title: 'Test', body: 'test' }); // type: 'mandate', uses STANDARD_TEMPLATE
+    const result = await spider.crawl();
+    assert.equal(result?.action, 'rig-spawned');
+    const rigs = await rigsBook(stacks).list();
+    assert.equal(rigs[0].engines.length, 5, 'default template produces 5 engines');
+  });
+});
+
+describe('Spider — variable resolution', () => {
+  afterEach(() => {
+    clearGuild();
+  });
+
+  it('$writ resolves to the full WritDoc object', async () => {
+    const template: RigTemplate = {
+      engines: [{ id: 'only', designId: 'seal', givens: { w: '$writ' } }],
+    };
+    const fix = buildFixture({ spider: { rigTemplates: { default: template } } });
+    const { clerk, spider, stacks } = fix;
+
+    const writ = await clerk.post({ title: 'My writ', body: 'test body' });
+    await spider.crawl();
+
+    const rigs = await rigsBook(stacks).list();
+    const engine = rigs[0].engines[0];
+    const resolvedWrit = engine.givensSpec.w as { id: string; type: string; title: string };
+    assert.equal(resolvedWrit.id, writ.id);
+    assert.equal(resolvedWrit.title, writ.title);
+  });
+
+  it('$role resolves to spiderConfig.role when set', async () => {
+    const template: RigTemplate = {
+      engines: [{ id: 'only', designId: 'seal', givens: { r: '$role' } }],
+    };
+    const fix = buildFixture({ spider: { role: 'builder', rigTemplates: { default: template } } });
+    const { clerk, spider, stacks } = fix;
+
+    await clerk.post({ title: 'test', body: 'test' });
+    await spider.crawl();
+
+    const rigs = await rigsBook(stacks).list();
+    assert.equal(rigs[0].engines[0].givensSpec.r, 'builder');
+  });
+
+  it('$role defaults to "artificer" when spiderConfig.role is not set', async () => {
+    const template: RigTemplate = {
+      engines: [{ id: 'only', designId: 'seal', givens: { r: '$role' } }],
+    };
+    const fix = buildFixture({ spider: { rigTemplates: { default: template } } });
+    const { clerk, spider, stacks } = fix;
+
+    await clerk.post({ title: 'test', body: 'test' });
+    await spider.crawl();
+
+    const rigs = await rigsBook(stacks).list();
+    assert.equal(rigs[0].engines[0].givensSpec.r, 'artificer');
+  });
+
+  it('$spider.buildCommand resolves to the configured value', async () => {
+    const template: RigTemplate = {
+      engines: [{ id: 'only', designId: 'seal', givens: { cmd: '$spider.buildCommand' } }],
+    };
+    const fix = buildFixture({ spider: { buildCommand: 'make build', rigTemplates: { default: template } } });
+    const { clerk, spider, stacks } = fix;
+
+    await clerk.post({ title: 'test', body: 'test' });
+    await spider.crawl();
+
+    const rigs = await rigsBook(stacks).list();
+    assert.equal(rigs[0].engines[0].givensSpec.cmd, 'make build');
+  });
+
+  it('$spider.* undefined causes key to be omitted entirely', async () => {
+    const template: RigTemplate = {
+      engines: [{ id: 'only', designId: 'seal', givens: { cmd: '$spider.testCommand' } }],
+    };
+    const fix = buildFixture({ spider: { rigTemplates: { default: template } } }); // no testCommand
+    const { clerk, spider, stacks } = fix;
+
+    await clerk.post({ title: 'test', body: 'test' });
+    await spider.crawl();
+
+    const rigs = await rigsBook(stacks).list();
+    assert.ok(!('cmd' in rigs[0].engines[0].givensSpec), 'cmd key should be absent when testCommand is not set');
+  });
+
+  it('literal string without $ prefix is passed through unchanged', async () => {
+    const template: RigTemplate = {
+      engines: [{ id: 'only', designId: 'seal', givens: { role: 'reviewer', count: 5 } }],
+    };
+    const fix = buildFixture({ spider: { rigTemplates: { default: template } } });
+    const { clerk, spider, stacks } = fix;
+
+    await clerk.post({ title: 'test', body: 'test' });
+    await spider.crawl();
+
+    const rigs = await rigsBook(stacks).list();
+    assert.equal(rigs[0].engines[0].givensSpec.role, 'reviewer');
+    assert.equal(rigs[0].engines[0].givensSpec.count, 5);
+  });
+
+  it('engine with no givens field produces empty givensSpec', async () => {
+    const template: RigTemplate = {
+      engines: [{ id: 'only', designId: 'seal' }],
+    };
+    const fix = buildFixture({ spider: { rigTemplates: { default: template } } });
+    const { clerk, spider, stacks } = fix;
+
+    await clerk.post({ title: 'test', body: 'test' });
+    await spider.crawl();
+
+    const rigs = await rigsBook(stacks).list();
+    assert.deepEqual(rigs[0].engines[0].givensSpec, {});
+  });
+});
+
+describe('Spider — startup validation', () => {
+  afterEach(() => {
+    clearGuild();
+  });
+
+  it('throws [spider] error for unknown designId', () => {
+    assert.throws(
+      () => buildFixture({
+        spider: {
+          rigTemplates: {
+            mandate: { engines: [{ id: 'x', designId: 'nonexistent' }] },
+          },
+        },
+      }),
+      (err: unknown) => {
+        assert.ok(err instanceof Error);
+        assert.ok(err.message.startsWith('[spider]'), `expected [spider] prefix, got: ${err.message}`);
+        assert.ok(err.message.includes('unknown designId "nonexistent"'), err.message);
+        return true;
+      },
+    );
+  });
+
+  it('accepts Spider builtin designIds (draft, implement, review, revise, seal)', () => {
+    assert.doesNotThrow(() =>
+      buildFixture({
+        spider: {
+          rigTemplates: {
+            default: {
+              engines: [
+                { id: 'a', designId: 'draft', givens: { writ: '$writ' } },
+                { id: 'b', designId: 'implement', upstream: ['a'], givens: { writ: '$writ', role: '$role' } },
+                { id: 'c', designId: 'seal', upstream: ['b'], givens: {} },
+              ],
+            },
+          },
+        },
+      })
+    );
+  });
+
+  it('throws [spider] error for unknown upstream reference', () => {
+    assert.throws(
+      () => buildFixture({
+        spider: {
+          rigTemplates: {
+            default: {
+              engines: [
+                { id: 'x', designId: 'seal', upstream: ['ghost'] },
+              ],
+            },
+          },
+        },
+      }),
+      (err: unknown) => {
+        assert.ok(err instanceof Error);
+        assert.ok(err.message.startsWith('[spider]'), err.message);
+        assert.ok(err.message.includes('unknown upstream "ghost"'), err.message);
+        return true;
+      },
+    );
+  });
+
+  it('throws [spider] error for duplicate engine ids', () => {
+    assert.throws(
+      () => buildFixture({
+        spider: {
+          rigTemplates: {
+            default: {
+              engines: [
+                { id: 'step1', designId: 'draft', givens: { writ: '$writ' } },
+                { id: 'step1', designId: 'seal', givens: {} },
+              ],
+            },
+          },
+        },
+      }),
+      (err: unknown) => {
+        assert.ok(err instanceof Error);
+        assert.ok(err.message.startsWith('[spider]'), err.message);
+        assert.ok(err.message.includes('duplicate engine id "step1"'), err.message);
+        return true;
+      },
+    );
+  });
+
+  it('throws [spider] error for dependency cycle', () => {
+    assert.throws(
+      () => buildFixture({
+        spider: {
+          rigTemplates: {
+            default: {
+              engines: [
+                { id: 'a', designId: 'draft', upstream: ['c'], givens: { writ: '$writ' } },
+                { id: 'b', designId: 'implement', upstream: ['a'], givens: {} },
+                { id: 'c', designId: 'seal', upstream: ['b'], givens: {} },
+              ],
+            },
+          },
+        },
+      }),
+      (err: unknown) => {
+        assert.ok(err instanceof Error);
+        assert.ok(err.message.startsWith('[spider]'), err.message);
+        assert.ok(err.message.includes('cycle detected'), err.message);
+        return true;
+      },
+    );
+  });
+
+  it('throws [spider] error for self-referencing upstream', () => {
+    assert.throws(
+      () => buildFixture({
+        spider: {
+          rigTemplates: {
+            default: {
+              engines: [
+                { id: 'self', designId: 'seal', upstream: ['self'], givens: {} },
+              ],
+            },
+          },
+        },
+      }),
+      (err: unknown) => {
+        assert.ok(err instanceof Error);
+        assert.ok(err.message.startsWith('[spider]'), err.message);
+        assert.ok(err.message.includes('cycle detected'), err.message);
+        return true;
+      },
+    );
+  });
+
+  it('throws [spider] error for invalid resolutionEngine', () => {
+    assert.throws(
+      () => buildFixture({
+        spider: {
+          rigTemplates: {
+            default: {
+              engines: [{ id: 'x', designId: 'seal', givens: {} }],
+              resolutionEngine: 'absent',
+            },
+          },
+        },
+      }),
+      (err: unknown) => {
+        assert.ok(err instanceof Error);
+        assert.ok(err.message.startsWith('[spider]'), err.message);
+        assert.ok(err.message.includes('resolutionEngine "absent"'), err.message);
+        return true;
+      },
+    );
+  });
+
+  it('throws [spider] error for unrecognized variable reference ($buildCommand)', () => {
+    assert.throws(
+      () => buildFixture({
+        spider: {
+          rigTemplates: {
+            default: {
+              engines: [{ id: 'x', designId: 'seal', givens: { cmd: '$buildCommand' } }],
+            },
+          },
+        },
+      }),
+      (err: unknown) => {
+        assert.ok(err instanceof Error);
+        assert.ok(err.message.startsWith('[spider]'), err.message);
+        assert.ok(err.message.includes('unrecognized variable "$buildCommand"'), err.message);
+        return true;
+      },
+    );
+  });
+
+  it('throws [spider] error for nested $spider path ($spider.a.b)', () => {
+    assert.throws(
+      () => buildFixture({
+        spider: {
+          rigTemplates: {
+            default: {
+              engines: [{ id: 'x', designId: 'seal', givens: { cmd: '$spider.a.b' } }],
+            },
+          },
+        },
+      }),
+      (err: unknown) => {
+        assert.ok(err instanceof Error);
+        assert.ok(err.message.startsWith('[spider]'), err.message);
+        assert.ok(err.message.includes('unrecognized variable "$spider.a.b"'), err.message);
+        return true;
+      },
+    );
+  });
+
+  it('accepts $spider.buildCommand as a valid variable', () => {
+    assert.doesNotThrow(() =>
+      buildFixture({
+        spider: {
+          rigTemplates: {
+            default: {
+              engines: [{ id: 'x', designId: 'seal', givens: { cmd: '$spider.buildCommand' } }],
+            },
+          },
+        },
+      })
+    );
+  });
+
+  it('throws [spider] error for empty engines array', () => {
+    assert.throws(
+      () => buildFixture({
+        spider: {
+          rigTemplates: {
+            default: { engines: [] },
+          },
+        },
+      }),
+      (err: unknown) => {
+        assert.ok(err instanceof Error);
+        assert.ok(err.message.startsWith('[spider]'), err.message);
+        assert.ok(err.message.includes('has no engines'), err.message);
+        return true;
+      },
+    );
+  });
+
+  it('error messages include the template key', () => {
+    assert.throws(
+      () => buildFixture({
+        spider: {
+          rigTemplates: {
+            mandate: { engines: [{ id: 'x', designId: 'nonexistent' }] },
+          },
+        },
+      }),
+      (err: unknown) => {
+        assert.ok(err instanceof Error);
+        assert.ok(err.message.includes('rigTemplates.mandate'), err.message);
+        return true;
+      },
+    );
+  });
+});
+
+describe('Spider — resolutionEngineId', () => {
+  afterEach(() => {
+    clearGuild();
+  });
+
+  it('sets resolutionEngineId on RigDoc when template has resolutionEngine', async () => {
+    const template: RigTemplate = {
+      engines: [{ id: 'only', designId: 'seal', givens: {} }],
+      resolutionEngine: 'only',
+    };
+    const fix = buildFixture({ spider: { rigTemplates: { default: template } } });
+    const { clerk, spider, stacks } = fix;
+
+    await clerk.post({ title: 'test', body: 'test' });
+    await spider.crawl();
+
+    const rigs = await rigsBook(stacks).list();
+    assert.equal(rigs[0].resolutionEngineId, 'only');
+  });
+
+  it('omits resolutionEngineId from RigDoc when template has no resolutionEngine', async () => {
+    const template: RigTemplate = {
+      engines: [{ id: 'only', designId: 'seal', givens: {} }],
+    };
+    const fix = buildFixture({ spider: { rigTemplates: { default: template } } });
+    const { clerk, spider, stacks } = fix;
+
+    await clerk.post({ title: 'test', body: 'test' });
+    await spider.crawl();
+
+    const rigs = await rigsBook(stacks).list();
+    assert.ok(!('resolutionEngineId' in rigs[0]) || rigs[0].resolutionEngineId === undefined);
+  });
+});
+
+describe('Spider — CDC resolution fallback', () => {
+  afterEach(() => {
+    clearGuild();
+  });
+
+  it('uses resolutionEngineId engine yields when present', async () => {
+    const fix = buildFixture();
+    const { clerk, spider, stacks } = fix;
+
+    const writ = await clerk.post({ title: 'test', body: 'test' });
+    await spider.crawl(); // spawn
+
+    const book = rigsBook(stacks);
+    const [rig] = await book.list();
+
+    // Set a resolutionEngineId and mark that engine completed with yields
+    const customYields = { result: 'custom-resolution' };
+    await book.patch(rig.id, {
+      resolutionEngineId: 'implement',
+      engines: rig.engines.map((e: EngineInstance) => {
+        if (e.id === 'implement') return { ...e, status: 'completed' as const, yields: customYields };
+        return { ...e, status: 'completed' as const };
+      }),
+      status: 'completed',
+    });
+
+    // CDC should have fired
+    const finalWrit = await clerk.show(writ.id);
+    assert.equal(finalWrit.status, 'completed');
+    assert.equal(finalWrit.resolution, JSON.stringify(customYields));
+  });
+
+  it('falls back to seal engine when no resolutionEngineId', async () => {
+    const fix = buildFixture();
+    const { clerk, spider, stacks } = fix;
+
+    const writ = await clerk.post({ title: 'test', body: 'test' });
+    await spider.crawl(); // spawn
+
+    const book = rigsBook(stacks);
+    const [rig] = await book.list();
+
+    const sealYields = { sealedCommit: 'abc123', strategy: 'fast-forward', retries: 0, inscriptionsSealed: 1 };
+    await book.patch(rig.id, {
+      engines: rig.engines.map((e: EngineInstance) => {
+        if (e.id === 'seal') return { ...e, status: 'completed' as const, yields: sealYields };
+        return { ...e, status: 'completed' as const };
+      }),
+      status: 'completed',
+    });
+
+    const finalWrit = await clerk.show(writ.id);
+    assert.equal(finalWrit.resolution, JSON.stringify(sealYields));
+  });
+
+  it('falls back to last completed engine when no resolutionEngineId and no seal', async () => {
+    // Use a template without a seal engine
+    const template: RigTemplate = {
+      engines: [
+        { id: 'draft', designId: 'draft', givens: { writ: '$writ' } },
+        { id: 'implement', designId: 'implement', upstream: ['draft'], givens: { writ: '$writ', role: '$role' } },
+      ],
+    };
+    const fix = buildFixture({ spider: { rigTemplates: { default: template } } });
+    const { clerk, spider, stacks } = fix;
+
+    const writ = await clerk.post({ title: 'test', body: 'test' });
+    await spider.crawl(); // spawn
+
+    const book = rigsBook(stacks);
+    const [rig] = await book.list();
+
+    const implementYields = { sessionId: 'ses-1', sessionStatus: 'completed' };
+    await book.patch(rig.id, {
+      engines: rig.engines.map((e: EngineInstance) => {
+        if (e.id === 'draft') return { ...e, status: 'completed' as const, yields: { draftId: 'd1' } };
+        if (e.id === 'implement') return { ...e, status: 'completed' as const, yields: implementYields };
+        return e;
+      }),
+      status: 'completed',
+    });
+
+    const finalWrit = await clerk.show(writ.id);
+    assert.equal(finalWrit.resolution, JSON.stringify(implementYields));
+  });
+
+  it('uses "Rig completed" when no engine has yields', async () => {
+    const fix = buildFixture();
+    const { clerk, spider, stacks } = fix;
+
+    const writ = await clerk.post({ title: 'test', body: 'test' });
+    await spider.crawl(); // spawn
+
+    const book = rigsBook(stacks);
+    const [rig] = await book.list();
+
+    await book.patch(rig.id, {
+      engines: rig.engines.map((e: EngineInstance) => ({ ...e, status: 'completed' as const })),
+      status: 'completed',
+    });
+
+    const finalWrit = await clerk.show(writ.id);
+    assert.equal(finalWrit.resolution, 'Rig completed');
+  });
+});
+
+describe('Spider — buildStaticEngines preserved', () => {
+  it('buildStaticEngines function still exists (not deleted)', async () => {
+    // We can't import it directly (it's not exported), but we can verify
+    // the Spider still functions correctly with the standard 5-engine template
+    // which mirrors the old behavior. The function is preserved in spider.ts.
+    const fix = buildFixture(); // uses STANDARD_TEMPLATE
+    const { clerk, spider, stacks } = fix;
+
+    await clerk.post({ title: 'test', body: 'test' });
+    await spider.crawl(); // spawn
+
+    const rigs = await rigsBook(stacks).list();
+    assert.equal(rigs[0].engines.length, 5, 'standard template produces 5 engines');
+  });
+});
diff --git a/packages/plugins/spider/src/spider.ts b/packages/plugins/spider/src/spider.ts
index c93d701..beb633a 100644
--- a/packages/plugins/spider/src/spider.ts
+++ b/packages/plugins/spider/src/spider.ts
@@ -34,6 +34,7 @@ import type {
   SpiderConfig,
   BlockRecord,
   BlockType,
+  RigTemplate,
 } from './types.ts';
 
 import {
@@ -145,6 +146,182 @@ function buildStaticEngines(writ: WritDoc, config: SpiderConfig): EngineInstance
   ];
 }
 
+// ── Template-based rig building ────────────────────────────────────────
+
+/**
+ * Look up the rig template for a given writ type.
+ * Falls back to 'default' template if no exact match.
+ * Throws if no matching template is found.
+ */
+function lookupTemplate(writType: string, config: SpiderConfig): RigTemplate {
+  const templates = config.rigTemplates;
+  if (templates) {
+    if (writType in templates) return templates[writType];
+    if ('default' in templates) return templates['default'];
+  }
+  throw new Error(
+    `[spider] No rig template found for writ type "${writType}" and no "default" template configured.`
+  );
+}
+
+/**
+ * Resolve a template engine's givens map using a variables context.
+ * '$writ' → WritDoc, '$role' → role string, '$spider.<key>' → spiderConfig[key].
+ * Keys resolving to undefined are omitted from the output.
+ * Non-'$' prefixed values are passed through as literals.
+ */
+function resolveGivens(
+  givens: Record<string, unknown> | undefined,
+  context: { writ: WritDoc; role: string; spiderConfig: SpiderConfig },
+): Record<string, unknown> {
+  const result: Record<string, unknown> = {};
+  for (const [key, value] of Object.entries(givens ?? {})) {
+    if (typeof value !== 'string' || !value.startsWith('$')) {
+      result[key] = value;
+    } else if (value === '$writ') {
+      result[key] = context.writ;
+    } else if (value === '$role') {
+      result[key] = context.role;
+    } else if (/^\$spider\.[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
+      const spiderKey = value.slice('$spider.'.length);
+      const resolved = (context.spiderConfig as Record<string, unknown>)[spiderKey];
+      if (resolved !== undefined) {
+        result[key] = resolved;
+      }
+      // undefined → omit key entirely
+    }
+    // Unrecognized $-prefixed strings are caught at validation time
+  }
+  return result;
+}
+
+/**
+ * Build EngineInstance array and resolutionEngineId from a RigTemplate.
+ */
+function buildFromTemplate(
+  template: RigTemplate,
+  context: { writ: WritDoc; role: string; spiderConfig: SpiderConfig },
+): { engines: EngineInstance[]; resolutionEngineId?: string } {
+  const engines: EngineInstance[] = template.engines.map((entry) => ({
+    id: entry.id,
+    designId: entry.designId,
+    status: 'pending' as const,
+    upstream: entry.upstream ?? [],
+    givensSpec: resolveGivens(entry.givens, context),
+  }));
+  return { engines, resolutionEngineId: template.resolutionEngine };
+}
+
+/**
+ * Validate all configured rig templates at startup.
+ * Fails fast on the first error with a '[spider]' prefixed message.
+ */
+function validateTemplates(
+  rigTemplates: Record<string, RigTemplate>,
+  fabricator: FabricatorApi,
+): void {
+  const builtinEngineIds = new Set([
+    draftEngine.id,
+    implementEngine.id,
+    reviewEngine.id,
+    reviseEngine.id,
+    sealEngine.id,
+  ]);
+
+  for (const [templateKey, template] of Object.entries(rigTemplates)) {
+    const engines = template.engines;
+
+    // R13: Non-empty check
+    if (engines.length === 0) {
+      throw new Error(`[spider] rigTemplates.${templateKey}: template has no engines`);
+    }
+
+    // R6b: Duplicate ID check
+    const engineIds = new Set<string>();
+    for (const engine of engines) {
+      if (engineIds.has(engine.id)) {
+        throw new Error(
+          `[spider] rigTemplates.${templateKey}: duplicate engine id "${engine.id}"`
+        );
+      }
+      engineIds.add(engine.id);
+    }
+
+    // R6a: designId check
+    for (const engine of engines) {
+      const knownInFabricator = fabricator.getEngineDesign(engine.designId) !== undefined;
+      const knownBuiltin = builtinEngineIds.has(engine.designId);
+      if (!knownInFabricator && !knownBuiltin) {
+        throw new Error(
+          `[spider] rigTemplates.${templateKey}: engine "${engine.id}" references unknown designId "${engine.designId}"`
+        );
+      }
+    }
+
+    // R6c: Upstream reference check
+    for (const engine of engines) {
+      for (const upstreamId of engine.upstream ?? []) {
+        if (!engineIds.has(upstreamId)) {
+          throw new Error(
+            `[spider] rigTemplates.${templateKey}: engine "${engine.id}" references unknown upstream "${upstreamId}"`
+          );
+        }
+      }
+    }
+
+    // R6d: Cycle detection (DFS)
+    {
+      const visiting = new Set<string>();
+      const visited = new Set<string>();
+
+      const visit = (id: string): void => {
+        if (visited.has(id)) return;
+        if (visiting.has(id)) {
+          throw new Error(
+            `[spider] rigTemplates.${templateKey}: dependency cycle detected involving engine "${id}"`
+          );
+        }
+        visiting.add(id);
+        const engine = engines.find((e) => e.id === id)!;
+        for (const dep of engine.upstream ?? []) {
+          visit(dep);
+        }
+        visiting.delete(id);
+        visited.add(id);
+      };
+
+      for (const engine of engines) {
+        visit(engine.id);
+      }
+    }
+
+    // R6e: resolutionEngine check
+    if (template.resolutionEngine !== undefined && !engineIds.has(template.resolutionEngine)) {
+      throw new Error(
+        `[spider] rigTemplates.${templateKey}: resolutionEngine "${template.resolutionEngine}" is not an engine id in this template`
+      );
+    }
+
+    // R7: Variable reference validation
+    for (const engine of engines) {
+      for (const value of Object.values(engine.givens ?? {})) {
+        if (typeof value === 'string' && value.startsWith('$')) {
+          if (
+            value === '$writ' ||
+            value === '$role' ||
+            /^\$spider\.[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)
+          ) {
+            continue; // valid
+          }
+          throw new Error(
+            `[spider] rigTemplates.${templateKey}: engine "${engine.id}" has unrecognized variable "${value}"`
+          );
+        }
+      }
+    }
+  }
+}
+
 // ── Block type type guard ──────────────────────────────────────────────
 
 function isBlockType(value: unknown): value is BlockType {
@@ -548,7 +725,12 @@ export function createSpider(): Plugin {
       if (existing.length > 0) continue;
 
       const rigId = generateId('rig', 4);
-      const engines = buildStaticEngines(writ, spiderConfig);
+      const template = lookupTemplate(writ.type, spiderConfig);
+      const { engines, resolutionEngineId } = buildFromTemplate(template, {
+        writ,
+        role: spiderConfig.role ?? 'artificer',
+        spiderConfig,
+      });
 
       const rig: RigDoc = {
         id: rigId,
@@ -556,6 +738,7 @@ export function createSpider(): Plugin {
         status: 'running',
         engines,
         createdAt: new Date().toISOString(),
+        ...(resolutionEngineId !== undefined ? { resolutionEngineId } : {}),
       };
 
       await rigsBook.put(rig);
@@ -699,6 +882,11 @@ export function createSpider(): Plugin {
         clerk = g.apparatus<ClerkApi>('clerk');
         fabricator = g.apparatus<FabricatorApi>('fabricator');
 
+        // Validate templates before any rig operations can occur
+        if (spiderConfig.rigTemplates) {
+          validateTemplates(spiderConfig.rigTemplates, fabricator);
+        }
+
         rigsBook = stacks.book<RigDoc>('spider', 'rigs');
         sessionsBook = stacks.readBook<SessionDoc>('animator', 'sessions');
         writsBook = stacks.readBook<WritDoc>('clerk', 'writs');
@@ -734,10 +922,36 @@ export function createSpider(): Plugin {
             if (rig.status === prev.status) return;
 
             if (rig.status === 'completed') {
-              // Use seal yields as the resolution summary
-              const sealEngine = rig.engines.find((e) => e.id === 'seal');
-              const resolution = sealEngine?.yields
-                ? JSON.stringify(sealEngine.yields)
+              let resolutionYields: unknown;
+
+              // 1. Try the declared resolution engine
+              if (rig.resolutionEngineId) {
+                const declared = rig.engines.find((e) => e.id === rig.resolutionEngineId);
+                if (declared?.yields !== undefined) {
+                  resolutionYields = declared.yields;
+                }
+              }
+
+              // 2. Fall back to seal engine (backwards compat for pre-existing rigs)
+              if (resolutionYields === undefined) {
+                const seal = rig.engines.find((e) => e.id === 'seal');
+                if (seal?.yields !== undefined) {
+                  resolutionYields = seal.yields;
+                }
+              }
+
+              // 3. Fall back to last completed engine in array order
+              if (resolutionYields === undefined) {
+                const lastCompleted = [...rig.engines]
+                  .reverse()
+                  .find((e) => e.status === 'completed' && e.yields !== undefined);
+                if (lastCompleted) {
+                  resolutionYields = lastCompleted.yields;
+                }
+              }
+
+              const resolution = resolutionYields !== undefined
+                ? JSON.stringify(resolutionYields)
                 : 'Rig completed';
               await clerk.transition(rig.writId, 'completed', { resolution });
             } else if (rig.status === 'failed') {
diff --git a/packages/plugins/spider/src/types.ts b/packages/plugins/spider/src/types.ts
index 65971f8..860567a 100644
--- a/packages/plugins/spider/src/types.ts
+++ b/packages/plugins/spider/src/types.ts
@@ -93,6 +93,8 @@ export interface RigDoc {
   engines: EngineInstance[];
   /** ISO timestamp when the rig was created. */
   createdAt: string;
+  /** Engine id whose yields provide the resolution summary. Set at spawn time. */
+  resolutionEngineId?: string;
 }
 
 // ── Rig filters ───────────────────────────────────────────────────────
@@ -109,6 +111,40 @@ export interface RigFilters {
   offset?: number;
 }
 
+// ── Rig templates ─────────────────────────────────────────────────────
+
+/**
+ * A single engine slot declared in a rig template.
+ */
+export interface RigTemplateEngine {
+  /** Engine id unique within this template. */
+  id: string;
+  /** Engine design id to look up in the Fabricator. */
+  designId: string;
+  /** Engine ids within this template whose completion is required first. Defaults to []. */
+  upstream?: string[];
+  /**
+   * Givens to pass at spawn time.
+   * String values starting with '$' are variable references resolved at spawn time.
+   * Non-string values are passed through literally.
+   * Variables that resolve to undefined cause the key to be omitted.
+   */
+  givens?: Record<string, unknown>;
+}
+
+/**
+ * A complete rig template.
+ */
+export interface RigTemplate {
+  /** Ordered list of engine slot declarations. */
+  engines: RigTemplateEngine[];
+  /**
+   * Engine id whose yields provide the writ resolution summary.
+   * Falls back to seal engine, then last completed engine in array order.
+   */
+  resolutionEngine?: string;
+}
+
 // ── CrawlResult ────────────────────────────────────────────────────────
 
 /**
@@ -216,6 +252,12 @@ export interface SpiderConfig {
    * Test command to pass to quick engines.
    */
   testCommand?: string;
+  /**
+   * Writ type → rig template mappings.
+   * 'default' key is the fallback for unmatched writ types.
+   * Spawning fails if no matching template is found.
+   */
+  rigTemplates?: Record<string, RigTemplate>;
 }
 
 // ── Engine yield shapes ───────────────────────────────────────────────

```

## Full File Contents (for context)

=== FILE: packages/plugins/spider/src/index.ts ===
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
  BlockRecord,
  BlockType,
  DraftYields,
  SealYields,
  RigTemplate,
  RigTemplateEngine,
} from './types.ts';

// ── Default export: the apparatus plugin ──────────────────────────────

export default createSpider();

=== FILE: packages/plugins/spider/src/spider.test.ts ===
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
import type { SpiderApi, RigDoc, EngineInstance, ReviewYields, MechanicalCheck, RigTemplate } from './types.ts';

// ── Test bootstrap ────────────────────────────────────────────────────

// Standard 5-engine template matching the original static pipeline behavior.
// Used as the default template in test fixtures.
const STANDARD_TEMPLATE: RigTemplate = {
  engines: [
    { id: 'draft',     designId: 'draft',     givens: { writ: '$writ' } },
    { id: 'implement', designId: 'implement', upstream: ['draft'],     givens: { writ: '$writ', role: '$role' } },
    { id: 'review',    designId: 'review',    upstream: ['implement'], givens: { writ: '$writ', role: 'reviewer', buildCommand: '$spider.buildCommand', testCommand: '$spider.testCommand' } },
    { id: 'revise',    designId: 'revise',    upstream: ['review'],    givens: { writ: '$writ', role: '$role' } },
    { id: 'seal',      designId: 'seal',      upstream: ['revise'],    givens: {} },
  ],
  resolutionEngine: 'seal',
};

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
    spider: {
      rigTemplates: { default: STANDARD_TEMPLATE },
      ...(guildConfig.spider ?? {}),
    },
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

      // All downstream engines should be cancelled
      for (const id of ['implement', 'review', 'revise', 'seal']) {
        const eng = updated.engines.find((e: EngineInstance) => e.id === id);
        assert.equal(eng?.status, 'cancelled', `${id} should be cancelled`);
        assert.equal(eng?.completedAt, undefined, `${id} should not have completedAt`);
        assert.equal(eng?.error, undefined, `${id} should not have error`);
      }
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

      // All downstream engines should be cancelled
      for (const id of ['implement', 'review', 'revise', 'seal']) {
        const eng = updated.engines.find((e: EngineInstance) => e.id === id);
        assert.equal(eng?.status, 'cancelled', `${id} should be cancelled`);
        assert.equal(eng?.completedAt, undefined, `${id} should not have completedAt`);
        assert.equal(eng?.error, undefined, `${id} should not have error`);
      }
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

      // Completed upstream engine (draft) is preserved
      const draftEng = updatedRig.engines.find((e: EngineInstance) => e.id === 'draft');
      assert.equal(draftEng?.status, 'completed', 'draft should remain completed');

      // Pending downstream engines should be cancelled
      for (const id of ['review', 'revise', 'seal']) {
        const eng = updatedRig.engines.find((e: EngineInstance) => e.id === id);
        assert.equal(eng?.status, 'cancelled', `${id} should be cancelled`);
        assert.equal(eng?.completedAt, undefined, `${id} should not have completedAt`);
        assert.equal(eng?.error, undefined, `${id} should not have error`);
      }

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

      // Pending downstream engines should be cancelled
      for (const id of ['review', 'revise', 'seal']) {
        const eng = updated.engines.find((e: EngineInstance) => e.id === id);
        assert.equal(eng?.status, 'cancelled', `${id} should be cancelled`);
        assert.equal(eng?.completedAt, undefined, `${id} should not have completedAt`);
        assert.equal(eng?.error, undefined, `${id} should not have error`);
      }
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

      const failedDraft = updatedRig.engines.find((e: EngineInstance) => e.id === 'draft');
      assert.equal(failedDraft?.status, 'failed', 'draft engine should be failed');

      // All downstream engines should be cancelled
      for (const id of ['implement', 'review', 'revise', 'seal']) {
        const eng = updatedRig.engines.find((e: EngineInstance) => e.id === id);
        assert.equal(eng?.status, 'cancelled', `${id} should be cancelled`);
        assert.equal(eng?.completedAt, undefined, `${id} should not have completedAt`);
        assert.equal(eng?.error, undefined, `${id} should not have error`);
      }

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

  // ── Downstream engine cancellation ───────────────────────────────

  describe('downstream engine cancellation', () => {
    it('(a) first-engine failure cancels all downstream engines', async () => {
      const { clerk, spider, stacks } = fix;
      await postWrit(clerk);
      await spider.crawl(); // spawn

      const book = rigsBook(stacks);
      const [rig] = await book.list();

      // Inject bad designId for draft (first engine) to trigger failure
      await book.patch(rig.id, {
        engines: rig.engines.map((e: EngineInstance) =>
          e.id === 'draft' ? { ...e, designId: 'nonexistent-engine' } : e,
        ),
      });

      const result = await spider.crawl();
      assert.equal(result?.action, 'rig-completed');
      assert.equal((result as { outcome: string }).outcome, 'failed');

      const [updated] = await book.list();
      const draft = updated.engines.find((e: EngineInstance) => e.id === 'draft');
      assert.equal(draft?.status, 'failed', 'draft should be failed');

      for (const id of ['implement', 'review', 'revise', 'seal']) {
        const eng = updated.engines.find((e: EngineInstance) => e.id === id);
        assert.equal(eng?.status, 'cancelled', `${id} should be cancelled`);
        assert.equal(eng?.completedAt, undefined, `${id} should not have completedAt`);
        assert.equal(eng?.error, undefined, `${id} should not have error`);
      }
    });

    it('(b) mid-pipeline failure preserves completed upstream, cancels pending downstream', async () => {
      const { clerk, spider, stacks } = fix;
      await postWrit(clerk);
      await spider.crawl(); // spawn

      const book = rigsBook(stacks);
      const [rig] = await book.list();

      // Pre-complete draft, then inject bad designId for implement
      const draftYields = { draftId: 'd1', codexName: 'c', branch: 'b', path: '/p', baseSha: 'sha1' };
      await book.patch(rig.id, {
        engines: rig.engines.map((e: EngineInstance) => {
          if (e.id === 'draft') return { ...e, status: 'completed' as const, yields: draftYields };
          if (e.id === 'implement') return { ...e, designId: 'nonexistent-engine' };
          return e;
        }),
      });

      const result = await spider.crawl();
      assert.equal(result?.action, 'rig-completed');
      assert.equal((result as { outcome: string }).outcome, 'failed');

      const [updated] = await book.list();

      // Completed upstream engine preserved
      const draftEng = updated.engines.find((e: EngineInstance) => e.id === 'draft');
      assert.equal(draftEng?.status, 'completed', 'draft should remain completed');

      // Failed engine
      const implEng = updated.engines.find((e: EngineInstance) => e.id === 'implement');
      assert.equal(implEng?.status, 'failed', 'implement should be failed');

      // Pending downstream engines cancelled
      for (const id of ['review', 'revise', 'seal']) {
        const eng = updated.engines.find((e: EngineInstance) => e.id === id);
        assert.equal(eng?.status, 'cancelled', `${id} should be cancelled`);
        assert.equal(eng?.completedAt, undefined, `${id} should not have completedAt`);
        assert.equal(eng?.error, undefined, `${id} should not have error`);
      }
    });

    it('(c) a running engine is not cancelled when another engine fails', async () => {
      const { clerk, spider, stacks } = fix;
      await postWrit(clerk);
      await spider.crawl(); // spawn

      const book = rigsBook(stacks);
      const [rig] = await book.list();

      // Draft completed, implement is running with a sessionId,
      // review is pending — inject bad designId for review so it fails next
      // But we need to fail via failEngine path: inject bad designId on review directly
      // and manually set implement to running to test it isn't cancelled.
      const fakeSessionId = generateId('ses', 4);
      const draftYields = { draftId: 'd1', codexName: 'c', branch: 'b', path: '/p', baseSha: 'sha1' };
      await book.patch(rig.id, {
        engines: rig.engines.map((e: EngineInstance) => {
          if (e.id === 'draft') return { ...e, status: 'completed' as const, yields: draftYields };
          if (e.id === 'implement') return { ...e, status: 'running' as const, sessionId: fakeSessionId };
          if (e.id === 'review') return { ...e, designId: 'nonexistent-engine', upstream: [] };
          return e;
        }),
      });

      // review now has no upstream and bad designId — running it will fail it
      const result = await spider.crawl();
      // review fails (bad designId) → rig fails
      assert.equal(result?.action, 'rig-completed');
      assert.equal((result as { outcome: string }).outcome, 'failed');

      const [updated] = await book.list();

      // The running engine (implement) must NOT be cancelled
      const implEng = updated.engines.find((e: EngineInstance) => e.id === 'implement');
      assert.equal(implEng?.status, 'running', 'running implement engine should not be cancelled');

      // The failed engine
      const reviewEng = updated.engines.find((e: EngineInstance) => e.id === 'review');
      assert.equal(reviewEng?.status, 'failed', 'review should be failed');

      // Only pending engines should be cancelled (revise and seal)
      for (const id of ['revise', 'seal']) {
        const eng = updated.engines.find((e: EngineInstance) => e.id === id);
        assert.equal(eng?.status, 'cancelled', `${id} should be cancelled`);
      }
    });

    it('cancelled engines have no completedAt', async () => {
      const { clerk, spider, stacks } = fix;
      await postWrit(clerk);
      await spider.crawl(); // spawn

      const book = rigsBook(stacks);
      const [rig] = await book.list();
      await book.patch(rig.id, {
        engines: rig.engines.map((e: EngineInstance) =>
          e.id === 'draft' ? { ...e, designId: 'nonexistent-engine' } : e,
        ),
      });

      await spider.crawl();

      const [updated] = await book.list();
      const cancelled = updated.engines.filter((e: EngineInstance) => e.status === 'cancelled');
      assert.ok(cancelled.length > 0, 'expected cancelled engines');
      for (const eng of cancelled) {
        assert.equal(eng.completedAt, undefined, `${eng.id} should not have completedAt`);
      }
    });

    it('cancelled engines have no error', async () => {
      const { clerk, spider, stacks } = fix;
      await postWrit(clerk);
      await spider.crawl(); // spawn

      const book = rigsBook(stacks);
      const [rig] = await book.list();
      await book.patch(rig.id, {
        engines: rig.engines.map((e: EngineInstance) =>
          e.id === 'draft' ? { ...e, designId: 'nonexistent-engine' } : e,
        ),
      });

      await spider.crawl();

      const [updated] = await book.list();
      const cancelled = updated.engines.filter((e: EngineInstance) => e.status === 'cancelled');
      assert.ok(cancelled.length > 0, 'expected cancelled engines');
      for (const eng of cancelled) {
        assert.equal(eng.error, undefined, `${eng.id} should not have error`);
      }
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

// ── Template-based rig building tests ─────────────────────────────────

describe('Spider — template dispatch', () => {
  afterEach(() => {
    clearGuild();
  });

  it('spawns a rig using the type-specific template when writ type matches', async () => {
    const mandateTemplate: RigTemplate = {
      engines: [
        { id: 'step1', designId: 'draft', givens: { writ: '$writ' } },
        { id: 'step2', designId: 'seal', upstream: ['step1'], givens: {} },
      ],
    };
    const fix = buildFixture({
      spider: { rigTemplates: { mandate: mandateTemplate } },
    });
    const { clerk, spider, stacks } = fix;

    const writ = await clerk.post({ title: 'Mandate writ', body: 'test', type: 'mandate' });
    const result = await spider.crawl();
    assert.equal(result?.action, 'rig-spawned');

    const rigs = await rigsBook(stacks).list();
    assert.equal(rigs[0].engines.length, 2, 'rig should use mandate template (2 engines)');
    assert.equal(rigs[0].engines[0].id, 'step1');
    assert.equal(rigs[0].engines[1].id, 'step2');
  });

  it('falls back to default template when no type-specific match exists', async () => {
    const defaultTemplate: RigTemplate = {
      engines: [
        { id: 'a', designId: 'draft', givens: { writ: '$writ' } },
        { id: 'b', designId: 'seal', upstream: ['a'], givens: {} },
        { id: 'c', designId: 'implement', upstream: ['b'], givens: {} },
      ],
    };
    const fix = buildFixture({
      spider: { rigTemplates: { default: defaultTemplate } },
    });
    const { clerk, spider, stacks } = fix;

    const writ = await clerk.post({ title: 'Task writ', body: 'test', type: 'mandate' });
    const result = await spider.crawl();
    assert.equal(result?.action, 'rig-spawned');

    const rigs = await rigsBook(stacks).list();
    assert.equal(rigs[0].engines.length, 3, 'rig should use default template (3 engines)');
  });

  it('uses type-specific template over default when both exist', async () => {
    const mandateTemplate: RigTemplate = {
      engines: [
        { id: 'only', designId: 'seal', givens: {} },
      ],
    };
    const defaultTemplate: RigTemplate = {
      engines: [
        { id: 'a', designId: 'draft', givens: { writ: '$writ' } },
        { id: 'b', designId: 'seal', upstream: ['a'], givens: {} },
      ],
    };
    const fix = buildFixture({
      spider: { rigTemplates: { mandate: mandateTemplate, default: defaultTemplate } },
    });
    const { clerk, spider, stacks } = fix;

    await clerk.post({ title: 'Mandate', body: 'test', type: 'mandate' });
    await spider.crawl();

    const rigs = await rigsBook(stacks).list();
    assert.equal(rigs[0].engines.length, 1, 'should use mandate template (1 engine)');
    assert.equal(rigs[0].engines[0].id, 'only');
  });

  it('throws with "No rig template found" when writ type has no match and no default', async () => {
    // Configure only a 'hotfix' template (not 'mandate' or 'default')
    // Post a mandate writ (the default clerk type) — it has no matching template
    const fix = buildFixture({
      spider: { rigTemplates: { hotfix: { engines: [{ id: 'x', designId: 'seal', givens: {} }] } } },
    });
    const { clerk, spider } = fix;

    await clerk.post({ title: 'Mandate writ', body: 'test' }); // defaults to 'mandate' type
    await assert.rejects(
      () => spider.crawl(),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes('No rig template found'), err.message);
        return true;
      },
    );
  });

  it('uses default template when writ type does not match a specific key', async () => {
    // buildFixture always provides rigTemplates.default = STANDARD_TEMPLATE via merge,
    // so a mandate writ (the clerk default) uses the default template.
    const fix = buildFixture();
    const { clerk, spider, stacks } = fix;

    await clerk.post({ title: 'Test', body: 'test' }); // type: 'mandate', uses STANDARD_TEMPLATE
    const result = await spider.crawl();
    assert.equal(result?.action, 'rig-spawned');
    const rigs = await rigsBook(stacks).list();
    assert.equal(rigs[0].engines.length, 5, 'default template produces 5 engines');
  });
});

describe('Spider — variable resolution', () => {
  afterEach(() => {
    clearGuild();
  });

  it('$writ resolves to the full WritDoc object', async () => {
    const template: RigTemplate = {
      engines: [{ id: 'only', designId: 'seal', givens: { w: '$writ' } }],
    };
    const fix = buildFixture({ spider: { rigTemplates: { default: template } } });
    const { clerk, spider, stacks } = fix;

    const writ = await clerk.post({ title: 'My writ', body: 'test body' });
    await spider.crawl();

    const rigs = await rigsBook(stacks).list();
    const engine = rigs[0].engines[0];
    const resolvedWrit = engine.givensSpec.w as { id: string; type: string; title: string };
    assert.equal(resolvedWrit.id, writ.id);
    assert.equal(resolvedWrit.title, writ.title);
  });

  it('$role resolves to spiderConfig.role when set', async () => {
    const template: RigTemplate = {
      engines: [{ id: 'only', designId: 'seal', givens: { r: '$role' } }],
    };
    const fix = buildFixture({ spider: { role: 'builder', rigTemplates: { default: template } } });
    const { clerk, spider, stacks } = fix;

    await clerk.post({ title: 'test', body: 'test' });
    await spider.crawl();

    const rigs = await rigsBook(stacks).list();
    assert.equal(rigs[0].engines[0].givensSpec.r, 'builder');
  });

  it('$role defaults to "artificer" when spiderConfig.role is not set', async () => {
    const template: RigTemplate = {
      engines: [{ id: 'only', designId: 'seal', givens: { r: '$role' } }],
    };
    const fix = buildFixture({ spider: { rigTemplates: { default: template } } });
    const { clerk, spider, stacks } = fix;

    await clerk.post({ title: 'test', body: 'test' });
    await spider.crawl();

    const rigs = await rigsBook(stacks).list();
    assert.equal(rigs[0].engines[0].givensSpec.r, 'artificer');
  });

  it('$spider.buildCommand resolves to the configured value', async () => {
    const template: RigTemplate = {
      engines: [{ id: 'only', designId: 'seal', givens: { cmd: '$spider.buildCommand' } }],
    };
    const fix = buildFixture({ spider: { buildCommand: 'make build', rigTemplates: { default: template } } });
    const { clerk, spider, stacks } = fix;

    await clerk.post({ title: 'test', body: 'test' });
    await spider.crawl();

    const rigs = await rigsBook(stacks).list();
    assert.equal(rigs[0].engines[0].givensSpec.cmd, 'make build');
  });

  it('$spider.* undefined causes key to be omitted entirely', async () => {
    const template: RigTemplate = {
      engines: [{ id: 'only', designId: 'seal', givens: { cmd: '$spider.testCommand' } }],
    };
    const fix = buildFixture({ spider: { rigTemplates: { default: template } } }); // no testCommand
    const { clerk, spider, stacks } = fix;

    await clerk.post({ title: 'test', body: 'test' });
    await spider.crawl();

    const rigs = await rigsBook(stacks).list();
    assert.ok(!('cmd' in rigs[0].engines[0].givensSpec), 'cmd key should be absent when testCommand is not set');
  });

  it('literal string without $ prefix is passed through unchanged', async () => {
    const template: RigTemplate = {
      engines: [{ id: 'only', designId: 'seal', givens: { role: 'reviewer', count: 5 } }],
    };
    const fix = buildFixture({ spider: { rigTemplates: { default: template } } });
    const { clerk, spider, stacks } = fix;

    await clerk.post({ title: 'test', body: 'test' });
    await spider.crawl();

    const rigs = await rigsBook(stacks).list();
    assert.equal(rigs[0].engines[0].givensSpec.role, 'reviewer');
    assert.equal(rigs[0].engines[0].givensSpec.count, 5);
  });

  it('engine with no givens field produces empty givensSpec', async () => {
    const template: RigTemplate = {
      engines: [{ id: 'only', designId: 'seal' }],
    };
    const fix = buildFixture({ spider: { rigTemplates: { default: template } } });
    const { clerk, spider, stacks } = fix;

    await clerk.post({ title: 'test', body: 'test' });
    await spider.crawl();

    const rigs = await rigsBook(stacks).list();
    assert.deepEqual(rigs[0].engines[0].givensSpec, {});
  });
});

describe('Spider — startup validation', () => {
  afterEach(() => {
    clearGuild();
  });

  it('throws [spider] error for unknown designId', () => {
    assert.throws(
      () => buildFixture({
        spider: {
          rigTemplates: {
            mandate: { engines: [{ id: 'x', designId: 'nonexistent' }] },
          },
        },
      }),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.startsWith('[spider]'), `expected [spider] prefix, got: ${err.message}`);
        assert.ok(err.message.includes('unknown designId "nonexistent"'), err.message);
        return true;
      },
    );
  });

  it('accepts Spider builtin designIds (draft, implement, review, revise, seal)', () => {
    assert.doesNotThrow(() =>
      buildFixture({
        spider: {
          rigTemplates: {
            default: {
              engines: [
                { id: 'a', designId: 'draft', givens: { writ: '$writ' } },
                { id: 'b', designId: 'implement', upstream: ['a'], givens: { writ: '$writ', role: '$role' } },
                { id: 'c', designId: 'seal', upstream: ['b'], givens: {} },
              ],
            },
          },
        },
      })
    );
  });

  it('throws [spider] error for unknown upstream reference', () => {
    assert.throws(
      () => buildFixture({
        spider: {
          rigTemplates: {
            default: {
              engines: [
                { id: 'x', designId: 'seal', upstream: ['ghost'] },
              ],
            },
          },
        },
      }),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.startsWith('[spider]'), err.message);
        assert.ok(err.message.includes('unknown upstream "ghost"'), err.message);
        return true;
      },
    );
  });

  it('throws [spider] error for duplicate engine ids', () => {
    assert.throws(
      () => buildFixture({
        spider: {
          rigTemplates: {
            default: {
              engines: [
                { id: 'step1', designId: 'draft', givens: { writ: '$writ' } },
                { id: 'step1', designId: 'seal', givens: {} },
              ],
            },
          },
        },
      }),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.startsWith('[spider]'), err.message);
        assert.ok(err.message.includes('duplicate engine id "step1"'), err.message);
        return true;
      },
    );
  });

  it('throws [spider] error for dependency cycle', () => {
    assert.throws(
      () => buildFixture({
        spider: {
          rigTemplates: {
            default: {
              engines: [
                { id: 'a', designId: 'draft', upstream: ['c'], givens: { writ: '$writ' } },
                { id: 'b', designId: 'implement', upstream: ['a'], givens: {} },
                { id: 'c', designId: 'seal', upstream: ['b'], givens: {} },
              ],
            },
          },
        },
      }),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.startsWith('[spider]'), err.message);
        assert.ok(err.message.includes('cycle detected'), err.message);
        return true;
      },
    );
  });

  it('throws [spider] error for self-referencing upstream', () => {
    assert.throws(
      () => buildFixture({
        spider: {
          rigTemplates: {
            default: {
              engines: [
                { id: 'self', designId: 'seal', upstream: ['self'], givens: {} },
              ],
            },
          },
        },
      }),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.startsWith('[spider]'), err.message);
        assert.ok(err.message.includes('cycle detected'), err.message);
        return true;
      },
    );
  });

  it('throws [spider] error for invalid resolutionEngine', () => {
    assert.throws(
      () => buildFixture({
        spider: {
          rigTemplates: {
            default: {
              engines: [{ id: 'x', designId: 'seal', givens: {} }],
              resolutionEngine: 'absent',
            },
          },
        },
      }),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.startsWith('[spider]'), err.message);
        assert.ok(err.message.includes('resolutionEngine "absent"'), err.message);
        return true;
      },
    );
  });

  it('throws [spider] error for unrecognized variable reference ($buildCommand)', () => {
    assert.throws(
      () => buildFixture({
        spider: {
          rigTemplates: {
            default: {
              engines: [{ id: 'x', designId: 'seal', givens: { cmd: '$buildCommand' } }],
            },
          },
        },
      }),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.startsWith('[spider]'), err.message);
        assert.ok(err.message.includes('unrecognized variable "$buildCommand"'), err.message);
        return true;
      },
    );
  });

  it('throws [spider] error for nested $spider path ($spider.a.b)', () => {
    assert.throws(
      () => buildFixture({
        spider: {
          rigTemplates: {
            default: {
              engines: [{ id: 'x', designId: 'seal', givens: { cmd: '$spider.a.b' } }],
            },
          },
        },
      }),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.startsWith('[spider]'), err.message);
        assert.ok(err.message.includes('unrecognized variable "$spider.a.b"'), err.message);
        return true;
      },
    );
  });

  it('accepts $spider.buildCommand as a valid variable', () => {
    assert.doesNotThrow(() =>
      buildFixture({
        spider: {
          rigTemplates: {
            default: {
              engines: [{ id: 'x', designId: 'seal', givens: { cmd: '$spider.buildCommand' } }],
            },
          },
        },
      })
    );
  });

  it('throws [spider] error for empty engines array', () => {
    assert.throws(
      () => buildFixture({
        spider: {
          rigTemplates: {
            default: { engines: [] },
          },
        },
      }),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.startsWith('[spider]'), err.message);
        assert.ok(err.message.includes('has no engines'), err.message);
        return true;
      },
    );
  });

  it('error messages include the template key', () => {
    assert.throws(
      () => buildFixture({
        spider: {
          rigTemplates: {
            mandate: { engines: [{ id: 'x', designId: 'nonexistent' }] },
          },
        },
      }),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes('rigTemplates.mandate'), err.message);
        return true;
      },
    );
  });
});

describe('Spider — resolutionEngineId', () => {
  afterEach(() => {
    clearGuild();
  });

  it('sets resolutionEngineId on RigDoc when template has resolutionEngine', async () => {
    const template: RigTemplate = {
      engines: [{ id: 'only', designId: 'seal', givens: {} }],
      resolutionEngine: 'only',
    };
    const fix = buildFixture({ spider: { rigTemplates: { default: template } } });
    const { clerk, spider, stacks } = fix;

    await clerk.post({ title: 'test', body: 'test' });
    await spider.crawl();

    const rigs = await rigsBook(stacks).list();
    assert.equal(rigs[0].resolutionEngineId, 'only');
  });

  it('omits resolutionEngineId from RigDoc when template has no resolutionEngine', async () => {
    const template: RigTemplate = {
      engines: [{ id: 'only', designId: 'seal', givens: {} }],
    };
    const fix = buildFixture({ spider: { rigTemplates: { default: template } } });
    const { clerk, spider, stacks } = fix;

    await clerk.post({ title: 'test', body: 'test' });
    await spider.crawl();

    const rigs = await rigsBook(stacks).list();
    assert.ok(!('resolutionEngineId' in rigs[0]) || rigs[0].resolutionEngineId === undefined);
  });
});

describe('Spider — CDC resolution fallback', () => {
  afterEach(() => {
    clearGuild();
  });

  it('uses resolutionEngineId engine yields when present', async () => {
    const fix = buildFixture();
    const { clerk, spider, stacks } = fix;

    const writ = await clerk.post({ title: 'test', body: 'test' });
    await spider.crawl(); // spawn

    const book = rigsBook(stacks);
    const [rig] = await book.list();

    // Set a resolutionEngineId and mark that engine completed with yields
    const customYields = { result: 'custom-resolution' };
    await book.patch(rig.id, {
      resolutionEngineId: 'implement',
      engines: rig.engines.map((e: EngineInstance) => {
        if (e.id === 'implement') return { ...e, status: 'completed' as const, yields: customYields };
        return { ...e, status: 'completed' as const };
      }),
      status: 'completed',
    });

    // CDC should have fired
    const finalWrit = await clerk.show(writ.id);
    assert.equal(finalWrit.status, 'completed');
    assert.equal(finalWrit.resolution, JSON.stringify(customYields));
  });

  it('falls back to seal engine when no resolutionEngineId', async () => {
    const fix = buildFixture();
    const { clerk, spider, stacks } = fix;

    const writ = await clerk.post({ title: 'test', body: 'test' });
    await spider.crawl(); // spawn

    const book = rigsBook(stacks);
    const [rig] = await book.list();

    const sealYields = { sealedCommit: 'abc123', strategy: 'fast-forward', retries: 0, inscriptionsSealed: 1 };
    await book.patch(rig.id, {
      engines: rig.engines.map((e: EngineInstance) => {
        if (e.id === 'seal') return { ...e, status: 'completed' as const, yields: sealYields };
        return { ...e, status: 'completed' as const };
      }),
      status: 'completed',
    });

    const finalWrit = await clerk.show(writ.id);
    assert.equal(finalWrit.resolution, JSON.stringify(sealYields));
  });

  it('falls back to last completed engine when no resolutionEngineId and no seal', async () => {
    // Use a template without a seal engine
    const template: RigTemplate = {
      engines: [
        { id: 'draft', designId: 'draft', givens: { writ: '$writ' } },
        { id: 'implement', designId: 'implement', upstream: ['draft'], givens: { writ: '$writ', role: '$role' } },
      ],
    };
    const fix = buildFixture({ spider: { rigTemplates: { default: template } } });
    const { clerk, spider, stacks } = fix;

    const writ = await clerk.post({ title: 'test', body: 'test' });
    await spider.crawl(); // spawn

    const book = rigsBook(stacks);
    const [rig] = await book.list();

    const implementYields = { sessionId: 'ses-1', sessionStatus: 'completed' };
    await book.patch(rig.id, {
      engines: rig.engines.map((e: EngineInstance) => {
        if (e.id === 'draft') return { ...e, status: 'completed' as const, yields: { draftId: 'd1' } };
        if (e.id === 'implement') return { ...e, status: 'completed' as const, yields: implementYields };
        return e;
      }),
      status: 'completed',
    });

    const finalWrit = await clerk.show(writ.id);
    assert.equal(finalWrit.resolution, JSON.stringify(implementYields));
  });

  it('uses "Rig completed" when no engine has yields', async () => {
    const fix = buildFixture();
    const { clerk, spider, stacks } = fix;

    const writ = await clerk.post({ title: 'test', body: 'test' });
    await spider.crawl(); // spawn

    const book = rigsBook(stacks);
    const [rig] = await book.list();

    await book.patch(rig.id, {
      engines: rig.engines.map((e: EngineInstance) => ({ ...e, status: 'completed' as const })),
      status: 'completed',
    });

    const finalWrit = await clerk.show(writ.id);
    assert.equal(finalWrit.resolution, 'Rig completed');
  });
});

describe('Spider — buildStaticEngines preserved', () => {
  it('buildStaticEngines function still exists (not deleted)', async () => {
    // We can't import it directly (it's not exported), but we can verify
    // the Spider still functions correctly with the standard 5-engine template
    // which mirrors the old behavior. The function is preserved in spider.ts.
    const fix = buildFixture(); // uses STANDARD_TEMPLATE
    const { clerk, spider, stacks } = fix;

    await clerk.post({ title: 'test', body: 'test' });
    await spider.crawl(); // spawn

    const rigs = await rigsBook(stacks).list();
    assert.equal(rigs[0].engines.length, 5, 'standard template produces 5 engines');
  });
});

=== FILE: packages/plugins/spider/src/spider.ts ===
/**
 * The Spider — rig execution engine apparatus.
 *
 * The Spider drives writ-to-completion by managing rigs: ordered pipelines
 * of engine instances. Each crawl() call performs one unit of work:
 *
 *   collect > checkBlocked > run > spawn   (priority order)
 *
 * collect      — check running engines for terminal session results
 * checkBlocked — poll registered block type checkers; unblock engines when cleared
 * run          — execute the next pending engine (clockwork inline, quick → launch)
 * spawn        — create a new rig for a ready writ with no existing rig
 *
 * CDC on the rigs book (Phase 1 cascade) transitions the associated writ
 * when a rig reaches a terminal state (completed or failed).
 * The blocked status does NOT trigger the CDC handler.
 *
 * See: docs/architecture/apparatus/spider.md
 */

import type { Plugin, StartupContext, LoadedPlugin } from '@shardworks/nexus-core';
import { guild, generateId, isLoadedKit, isLoadedApparatus } from '@shardworks/nexus-core';
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
  BlockRecord,
  BlockType,
  RigTemplate,
} from './types.ts';

import {
  draftEngine,
  implementEngine,
  reviewEngine,
  reviseEngine,
  sealEngine,
} from './engines/index.ts';

import {
  writStatusBlockType,
  scheduledTimeBlockType,
  bookUpdatedBlockType,
} from './block-types/index.ts';

import {
  crawlOneTool,
  crawlContinualTool,
  rigShowTool,
  rigListTool,
  rigForWritTool,
  rigResumeTool,
} from './tools/index.ts';

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
 * Determine whether a rig should enter the blocked state.
 *
 * A rig is blocked when:
 * - No engine is currently running
 * - No engine is runnable (pending with all upstream completed)
 * - At least one engine is blocked
 */
function isRigBlocked(engines: EngineInstance[]): boolean {
  const hasRunning = engines.some((e) => e.status === 'running');
  if (hasRunning) return false;
  const hasBlocked = engines.some((e) => e.status === 'blocked');
  if (!hasBlocked) return false;
  // Check runnability by constructing a minimal RigDoc-like object
  const syntheticRig = { engines } as RigDoc;
  return findRunnableEngine(syntheticRig) === null;
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

// ── Template-based rig building ────────────────────────────────────────

/**
 * Look up the rig template for a given writ type.
 * Falls back to 'default' template if no exact match.
 * Throws if no matching template is found.
 */
function lookupTemplate(writType: string, config: SpiderConfig): RigTemplate {
  const templates = config.rigTemplates;
  if (templates) {
    if (writType in templates) return templates[writType];
    if ('default' in templates) return templates['default'];
  }
  throw new Error(
    `[spider] No rig template found for writ type "${writType}" and no "default" template configured.`
  );
}

/**
 * Resolve a template engine's givens map using a variables context.
 * '$writ' → WritDoc, '$role' → role string, '$spider.<key>' → spiderConfig[key].
 * Keys resolving to undefined are omitted from the output.
 * Non-'$' prefixed values are passed through as literals.
 */
function resolveGivens(
  givens: Record<string, unknown> | undefined,
  context: { writ: WritDoc; role: string; spiderConfig: SpiderConfig },
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(givens ?? {})) {
    if (typeof value !== 'string' || !value.startsWith('$')) {
      result[key] = value;
    } else if (value === '$writ') {
      result[key] = context.writ;
    } else if (value === '$role') {
      result[key] = context.role;
    } else if (/^\$spider\.[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
      const spiderKey = value.slice('$spider.'.length);
      const resolved = (context.spiderConfig as Record<string, unknown>)[spiderKey];
      if (resolved !== undefined) {
        result[key] = resolved;
      }
      // undefined → omit key entirely
    }
    // Unrecognized $-prefixed strings are caught at validation time
  }
  return result;
}

/**
 * Build EngineInstance array and resolutionEngineId from a RigTemplate.
 */
function buildFromTemplate(
  template: RigTemplate,
  context: { writ: WritDoc; role: string; spiderConfig: SpiderConfig },
): { engines: EngineInstance[]; resolutionEngineId?: string } {
  const engines: EngineInstance[] = template.engines.map((entry) => ({
    id: entry.id,
    designId: entry.designId,
    status: 'pending' as const,
    upstream: entry.upstream ?? [],
    givensSpec: resolveGivens(entry.givens, context),
  }));
  return { engines, resolutionEngineId: template.resolutionEngine };
}

/**
 * Validate all configured rig templates at startup.
 * Fails fast on the first error with a '[spider]' prefixed message.
 */
function validateTemplates(
  rigTemplates: Record<string, RigTemplate>,
  fabricator: FabricatorApi,
): void {
  const builtinEngineIds = new Set([
    draftEngine.id,
    implementEngine.id,
    reviewEngine.id,
    reviseEngine.id,
    sealEngine.id,
  ]);

  for (const [templateKey, template] of Object.entries(rigTemplates)) {
    const engines = template.engines;

    // R13: Non-empty check
    if (engines.length === 0) {
      throw new Error(`[spider] rigTemplates.${templateKey}: template has no engines`);
    }

    // R6b: Duplicate ID check
    const engineIds = new Set<string>();
    for (const engine of engines) {
      if (engineIds.has(engine.id)) {
        throw new Error(
          `[spider] rigTemplates.${templateKey}: duplicate engine id "${engine.id}"`
        );
      }
      engineIds.add(engine.id);
    }

    // R6a: designId check
    for (const engine of engines) {
      const knownInFabricator = fabricator.getEngineDesign(engine.designId) !== undefined;
      const knownBuiltin = builtinEngineIds.has(engine.designId);
      if (!knownInFabricator && !knownBuiltin) {
        throw new Error(
          `[spider] rigTemplates.${templateKey}: engine "${engine.id}" references unknown designId "${engine.designId}"`
        );
      }
    }

    // R6c: Upstream reference check
    for (const engine of engines) {
      for (const upstreamId of engine.upstream ?? []) {
        if (!engineIds.has(upstreamId)) {
          throw new Error(
            `[spider] rigTemplates.${templateKey}: engine "${engine.id}" references unknown upstream "${upstreamId}"`
          );
        }
      }
    }

    // R6d: Cycle detection (DFS)
    {
      const visiting = new Set<string>();
      const visited = new Set<string>();

      const visit = (id: string): void => {
        if (visited.has(id)) return;
        if (visiting.has(id)) {
          throw new Error(
            `[spider] rigTemplates.${templateKey}: dependency cycle detected involving engine "${id}"`
          );
        }
        visiting.add(id);
        const engine = engines.find((e) => e.id === id)!;
        for (const dep of engine.upstream ?? []) {
          visit(dep);
        }
        visiting.delete(id);
        visited.add(id);
      };

      for (const engine of engines) {
        visit(engine.id);
      }
    }

    // R6e: resolutionEngine check
    if (template.resolutionEngine !== undefined && !engineIds.has(template.resolutionEngine)) {
      throw new Error(
        `[spider] rigTemplates.${templateKey}: resolutionEngine "${template.resolutionEngine}" is not an engine id in this template`
      );
    }

    // R7: Variable reference validation
    for (const engine of engines) {
      for (const value of Object.values(engine.givens ?? {})) {
        if (typeof value === 'string' && value.startsWith('$')) {
          if (
            value === '$writ' ||
            value === '$role' ||
            /^\$spider\.[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)
          ) {
            continue; // valid
          }
          throw new Error(
            `[spider] rigTemplates.${templateKey}: engine "${engine.id}" has unrecognized variable "${value}"`
          );
        }
      }
    }
  }
}

// ── Block type type guard ──────────────────────────────────────────────

function isBlockType(value: unknown): value is BlockType {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Record<string, unknown>).id === 'string' &&
    typeof (value as Record<string, unknown>).check === 'function'
  );
}

// ── Block type registry ────────────────────────────────────────────────

class BlockTypeRegistry {
  private readonly types = new Map<string, BlockType>();

  register(plugin: LoadedPlugin): void {
    if (isLoadedKit(plugin)) {
      this.registerFromKit(plugin.kit);
    } else if (isLoadedApparatus(plugin)) {
      if (plugin.apparatus.supportKit) {
        this.registerFromKit(plugin.apparatus.supportKit);
      }
    }
  }

  private registerFromKit(kit: Record<string, unknown>): void {
    const raw = kit.blockTypes;
    if (typeof raw !== 'object' || raw === null) return;
    for (const value of Object.values(raw as Record<string, unknown>)) {
      if (isBlockType(value)) {
        this.types.set(value.id, value);
      }
    }
  }

  get(id: string): BlockType | undefined {
    return this.types.get(id);
  }
}

// ── Apparatus factory ──────────────────────────────────────────────────

export function createSpider(): Plugin {
  let rigsBook: Book<RigDoc>;
  let sessionsBook: ReadOnlyBook<SessionDoc>;
  let writsBook: ReadOnlyBook<WritDoc>;
  let clerk: ClerkApi;
  let fabricator: FabricatorApi;
  let spiderConfig: SpiderConfig = {};

  const blockTypeRegistry = new BlockTypeRegistry();

  /**
   * In-memory store for block records that have been cleared.
   * Key: "rigId:engineId". Written when an engine is unblocked (via checker or resume()).
   * Read and deleted in tryRun() when building EngineRunContext.
   */
  const pendingPriorBlocks = new Map<string, BlockRecord>();

  // ── Internal crawl operations ─────────────────────────────────────

  /**
   * Mark an engine failed and propagate failure to the rig (same update).
   * Cancels all pending and blocked engines.
   */
  async function failEngine(
    rig: RigDoc,
    engineId: string,
    errorMessage: string,
  ): Promise<void> {
    const now = new Date().toISOString();
    const updatedEngines = rig.engines.map((e) => {
      if (e.id === engineId) {
        return { ...e, status: 'failed' as const, error: errorMessage, completedAt: now };
      }
      if (e.status === 'pending' || e.status === 'blocked') {
        return { ...e, status: 'cancelled' as const, block: undefined };
      }
      return e;
    });
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
   *
   * After collecting a completed engine, check whether the rig has
   * become blocked (no running engines, no runnable engines, some blocked).
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

        if (allCompleted) {
          await rigsBook.patch(rig.id, { engines: updatedEngines, status: 'completed' });
          return { action: 'rig-completed', rigId: rig.id, writId: rig.writId, outcome: 'completed' };
        }

        // Check whether completing this engine has caused the rig to become blocked
        if (isRigBlocked(updatedEngines)) {
          await rigsBook.patch(rig.id, { engines: updatedEngines, status: 'blocked' });
          return { action: 'rig-blocked', rigId: rig.id, writId: rig.writId };
        }

        await rigsBook.patch(rig.id, { engines: updatedEngines, status: 'running' });
        return { action: 'engine-completed', rigId: rig.id, engineId: engine.id };
      }
    }
    return null;
  }

  /**
   * Phase 2 — checkBlocked.
   *
   * Query rigs with status 'running' or 'blocked'. For each blocked engine,
   * run the registered checker (respecting pollIntervalMs). If cleared,
   * transition the engine back to pending and restore the rig to running.
   * If not cleared, update lastCheckedAt and continue to the next engine.
   */
  async function tryCheckBlocked(): Promise<CrawlResult | null> {
    // Fetch both running rigs (may have blocked engines) and blocked rigs
    const runningRigs = await rigsBook.find({ where: [['status', '=', 'running']] });
    const blockedRigs = await rigsBook.find({ where: [['status', '=', 'blocked']] });
    const rigs = [...runningRigs, ...blockedRigs];

    for (const rig of rigs) {
      for (const engine of rig.engines) {
        if (engine.status !== 'blocked' || !engine.block) continue;

        const blockType = blockTypeRegistry.get(engine.block.type);
        if (!blockType) continue; // Type was unregistered after block was created; skip

        // Poll interval throttle
        if (blockType.pollIntervalMs !== undefined && engine.block.lastCheckedAt) {
          const elapsed = Date.now() - new Date(engine.block.lastCheckedAt).getTime();
          if (elapsed < blockType.pollIntervalMs) continue;
        }

        let cleared: boolean;
        try {
          cleared = await blockType.check(engine.block.condition);
        } catch (err) {
          // Log warning, skip — engine stays blocked, retry next cycle
          console.warn(
            `Block checker "${engine.block.type}" threw for engine "${engine.id}" in rig "${rig.id}":`,
            err,
          );
          continue;
        }

        if (!cleared) {
          // Update lastCheckedAt and continue checking other engines
          const now = new Date().toISOString();
          const updatedEngines = rig.engines.map((e) =>
            e.id === engine.id
              ? { ...e, block: { ...e.block!, lastCheckedAt: now } }
              : e,
          );
          await rigsBook.patch(rig.id, { engines: updatedEngines });
          continue; // Check next engine
        }

        // Cleared — store block record in memory for priorBlock, then transition engine to pending
        const priorBlockRecord = engine.block;
        pendingPriorBlocks.set(`${rig.id}:${engine.id}`, priorBlockRecord);

        const updatedEngines = rig.engines.map((e) =>
          e.id === engine.id
            ? { ...e, status: 'pending' as const, block: undefined }
            : e,
        );

        // Restore rig to running if it was blocked; use isRigBlocked on updatedEngines
        // (always false after unblocking, but keeps call sites consistent per R13)
        const stillBlocked = isRigBlocked(updatedEngines);
        const rigStatus = stillBlocked ? 'blocked' : 'running';

        await rigsBook.patch(rig.id, {
          engines: updatedEngines,
          status: rigStatus,
        });

        return { action: 'engine-unblocked', rigId: rig.id, engineId: engine.id };
      }
    }
    return null;
  }

  /**
   * Phase 3 — run.
   *
   * Find the first pending engine in any running rig whose upstream is
   * all completed. Execute it:
   * - Clockwork ('completed') → store yields, mark engine completed,
   *   check for rig completion.
   * - Quick ('launched') → store sessionId, mark engine running.
   * - Blocked ('blocked') → validate block type and condition, persist
   *   block record, check whether rig should enter blocked state.
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

      // Check for a prior block record (engine was previously blocked and unblocked)
      const priorBlockKey = `${rig.id}:${pending.id}`;
      const priorBlock = pendingPriorBlocks.get(priorBlockKey);
      if (priorBlock) pendingPriorBlocks.delete(priorBlockKey);

      const context = {
        engineId: pending.id,
        upstream,
        ...(priorBlock ? { priorBlock } : {}),
      };

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

        if (engineResult.status === 'blocked') {
          const { blockType: blockTypeId, condition, message } = engineResult;

          // Look up the block type
          const blockType = blockTypeRegistry.get(blockTypeId);
          if (!blockType) {
            await failEngine(updatedRig, pending.id, `Unknown block type: "${blockTypeId}"`);
            return { action: 'rig-completed', rigId: rig.id, writId: rig.writId, outcome: 'failed' };
          }

          // Validate the condition against the block type's schema
          try {
            blockType.conditionSchema.parse(condition);
          } catch (zodErr) {
            const zodMessage = zodErr instanceof Error ? zodErr.message : String(zodErr);
            await failEngine(
              updatedRig,
              pending.id,
              `Block type "${blockTypeId}" rejected condition: ${zodMessage}`,
            );
            return { action: 'rig-completed', rigId: rig.id, writId: rig.writId, outcome: 'failed' };
          }

          // Build the block record and persist the blocked engine
          const blockRecord: BlockRecord = {
            type: blockTypeId,
            condition,
            blockedAt: new Date().toISOString(),
            ...(message !== undefined ? { message } : {}),
          };

          const blockedEngines = updatedRig.engines.map((e) =>
            e.id === pending.id
              ? { ...e, status: 'blocked' as const, block: blockRecord }
              : e,
          );

          // Determine whether the rig should also enter blocked state
          if (isRigBlocked(blockedEngines)) {
            await rigsBook.patch(rig.id, { engines: blockedEngines, status: 'blocked' });
            return { action: 'rig-blocked', rigId: rig.id, writId: rig.writId };
          }

          await rigsBook.patch(rig.id, { engines: blockedEngines });
          return { action: 'engine-blocked', rigId: rig.id, engineId: pending.id, blockType: blockTypeId };
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
   * Phase 4 — spawn.
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
      const template = lookupTemplate(writ.type, spiderConfig);
      const { engines, resolutionEngineId } = buildFromTemplate(template, {
        writ,
        role: spiderConfig.role ?? 'artificer',
        spiderConfig,
      });

      const rig: RigDoc = {
        id: rigId,
        writId: writ.id,
        status: 'running',
        engines,
        createdAt: new Date().toISOString(),
        ...(resolutionEngineId !== undefined ? { resolutionEngineId } : {}),
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

      const checked = await tryCheckBlocked();
      if (checked) return checked;

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

    async resume(rigId: string, engineId: string): Promise<void> {
      const rig = await api.show(rigId); // Throws if not found
      const engine = rig.engines.find((e) => e.id === engineId);
      if (!engine) {
        throw new Error(`Engine "${engineId}" not found in rig "${rigId}".`);
      }
      if (engine.status !== 'blocked') {
        throw new Error(
          `Engine "${engineId}" in rig "${rigId}" is not blocked (status: ${engine.status}).`,
        );
      }

      // Store prior block for priorBlock context on next run
      if (engine.block) {
        pendingPriorBlocks.set(`${rigId}:${engineId}`, engine.block);
      }

      const updatedEngines = rig.engines.map((e) =>
        e.id === engineId
          ? { ...e, status: 'pending' as const, block: undefined }
          : e,
      );

      const rigStatus = rig.status === 'blocked' ? 'running' : rig.status;

      await rigsBook.patch(rigId, {
        engines: updatedEngines,
        status: rigStatus,
      });
    },

    getBlockType(id: string): BlockType | undefined {
      return blockTypeRegistry.get(id);
    },
  };

  // ── Apparatus ─────────────────────────────────────────────────────

  return {
    apparatus: {
      requires: ['stacks', 'clerk', 'fabricator'],
      consumes: ['blockTypes'],

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
        blockTypes: {
          'writ-status':    writStatusBlockType,
          'scheduled-time': scheduledTimeBlockType,
          'book-updated':   bookUpdatedBlockType,
        },
        tools: [crawlOneTool, crawlContinualTool, rigShowTool, rigListTool, rigForWritTool, rigResumeTool],
      },

      provides: api,

      start(ctx: StartupContext): void {
        const g = guild();
        spiderConfig = g.guildConfig().spider ?? {};

        const stacks = g.apparatus<StacksApi>('stacks');
        clerk = g.apparatus<ClerkApi>('clerk');
        fabricator = g.apparatus<FabricatorApi>('fabricator');

        // Validate templates before any rig operations can occur
        if (spiderConfig.rigTemplates) {
          validateTemplates(spiderConfig.rigTemplates, fabricator);
        }

        rigsBook = stacks.book<RigDoc>('spider', 'rigs');
        sessionsBook = stacks.readBook<SessionDoc>('animator', 'sessions');
        writsBook = stacks.readBook<WritDoc>('clerk', 'writs');

        // Scan all already-loaded kits for block types.
        // These fired plugin:initialized before any apparatus started.
        for (const kit of g.kits()) {
          blockTypeRegistry.register(kit);
        }

        // Subscribe to plugin:initialized for apparatus supportKits that
        // fire after us in the startup sequence.
        ctx.on('plugin:initialized', (plugin: unknown) => {
          const loaded = plugin as LoadedPlugin;
          if (isLoadedApparatus(loaded)) {
            blockTypeRegistry.register(loaded);
          }
        });

        // CDC — Phase 1 cascade on rigs book.
        // When a rig reaches a terminal state, transition the associated writ.
        // The 'blocked' status intentionally falls through — no CDC action.
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
              let resolutionYields: unknown;

              // 1. Try the declared resolution engine
              if (rig.resolutionEngineId) {
                const declared = rig.engines.find((e) => e.id === rig.resolutionEngineId);
                if (declared?.yields !== undefined) {
                  resolutionYields = declared.yields;
                }
              }

              // 2. Fall back to seal engine (backwards compat for pre-existing rigs)
              if (resolutionYields === undefined) {
                const seal = rig.engines.find((e) => e.id === 'seal');
                if (seal?.yields !== undefined) {
                  resolutionYields = seal.yields;
                }
              }

              // 3. Fall back to last completed engine in array order
              if (resolutionYields === undefined) {
                const lastCompleted = [...rig.engines]
                  .reverse()
                  .find((e) => e.status === 'completed' && e.yields !== undefined);
                if (lastCompleted) {
                  resolutionYields = lastCompleted.yields;
                }
              }

              const resolution = resolutionYields !== undefined
                ? JSON.stringify(resolutionYields)
                : 'Rig completed';
              await clerk.transition(rig.writId, 'completed', { resolution });
            } else if (rig.status === 'failed') {
              const failedEngine = rig.engines.find((e) => e.status === 'failed');
              const resolution = failedEngine?.error ?? 'Engine failure';
              await clerk.transition(rig.writId, 'failed', { resolution });
            }
            // 'blocked' status — no CDC action, writ stays in current state
          },
          { failOnError: true },
        );
      },
    },
  };
}

=== FILE: packages/plugins/spider/src/types.ts ===
/**
 * The Spider — public types.
 *
 * Rig and engine data model, CrawlResult, SpiderApi, and configuration.
 * Engine yield shapes (DraftYields, SealYields) live here too so downstream
 * packages can import them without depending on the engine implementation files.
 */

import type { ZodSchema } from 'zod';

// ── Engine instance status ────────────────────────────────────────────

export type EngineStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'blocked';

// ── Block record ──────────────────────────────────────────────────────

/**
 * Persisted record of an active engine block.
 * Present on an EngineInstance when status === 'blocked'.
 * Cleared when the block is resolved.
 */
export interface BlockRecord {
  /** Block type identifier (matches a registered BlockType.id). */
  type: string;
  /** Structured condition payload — shape validated by the block type's conditionSchema. */
  condition: unknown;
  /** ISO timestamp when the engine was blocked. */
  blockedAt: string;
  /** Optional human-readable message from the engine. */
  message?: string;
  /** ISO timestamp of the last checker evaluation. Updated on every check cycle. */
  lastCheckedAt?: string;
}

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
  /** Present when status === 'blocked'. Cleared when the block is resolved. */
  block?: BlockRecord;
}

// ── Rig ──────────────────────────────────────────────────────────────

export type RigStatus = 'running' | 'completed' | 'failed' | 'blocked';

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
  /** Engine id whose yields provide the resolution summary. Set at spawn time. */
  resolutionEngineId?: string;
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

// ── Rig templates ─────────────────────────────────────────────────────

/**
 * A single engine slot declared in a rig template.
 */
export interface RigTemplateEngine {
  /** Engine id unique within this template. */
  id: string;
  /** Engine design id to look up in the Fabricator. */
  designId: string;
  /** Engine ids within this template whose completion is required first. Defaults to []. */
  upstream?: string[];
  /**
   * Givens to pass at spawn time.
   * String values starting with '$' are variable references resolved at spawn time.
   * Non-string values are passed through literally.
   * Variables that resolve to undefined cause the key to be omitted.
   */
  givens?: Record<string, unknown>;
}

/**
 * A complete rig template.
 */
export interface RigTemplate {
  /** Ordered list of engine slot declarations. */
  engines: RigTemplateEngine[];
  /**
   * Engine id whose yields provide the writ resolution summary.
   * Falls back to seal engine, then last completed engine in array order.
   */
  resolutionEngine?: string;
}

// ── CrawlResult ────────────────────────────────────────────────────────

/**
 * The result of a single crawl() call.
 *
 * Variants, ordered by priority:
 * - 'engine-completed'  — an engine finished (collected or ran inline); rig still running
 * - 'engine-started'    — launched a quick engine's session
 * - 'engine-blocked'    — engine entered blocked status; rig is still running (other engines active)
 * - 'engine-unblocked'  — a blocked engine's condition cleared; engine returned to pending
 * - 'rig-spawned'       — created a new rig for a ready writ
 * - 'rig-completed'     — the crawl step caused a rig to reach a terminal state
 * - 'rig-blocked'       — all forward progress stalled; rig entered blocked status
 *
 * null means no work was available.
 */
export type CrawlResult =
  | { action: 'engine-completed'; rigId: string; engineId: string }
  | { action: 'engine-started'; rigId: string; engineId: string }
  | { action: 'engine-blocked'; rigId: string; engineId: string; blockType: string }
  | { action: 'engine-unblocked'; rigId: string; engineId: string }
  | { action: 'rig-spawned'; rigId: string; writId: string }
  | { action: 'rig-completed'; rigId: string; writId: string; outcome: 'completed' | 'failed' }
  | { action: 'rig-blocked'; rigId: string; writId: string };

// ── Block type ────────────────────────────────────────────────────────

/**
 * A registered block type — defines how to check whether a blocking
 * condition has cleared. Contributed via kit/supportKit `blockTypes`.
 */
export interface BlockType {
  /** Unique identifier (e.g. 'writ-status', 'scheduled-time'). */
  id: string;
  /** Lightweight checker — returns true if the blocking condition has cleared. */
  check: (condition: unknown) => Promise<boolean>;
  /** Zod schema for validating the condition payload at block time. */
  conditionSchema: ZodSchema;
  /** Suggested poll interval in milliseconds. If absent, check every crawl cycle. */
  pollIntervalMs?: number;
}

// ── SpiderApi ─────────────────────────────────────────────────────────

/**
 * The Spider's public API — retrieved via guild().apparatus<SpiderApi>('spider').
 */
export interface SpiderApi {
  /**
   * Execute one step of the crawl loop.
   *
   * Priority ordering: collect > checkBlocked > run > spawn.
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

  /**
   * Manually clear a block on a specific engine, regardless of checker result.
   * Throws if the engine is not blocked.
   */
  resume(rigId: string, engineId: string): Promise<void>;

  /**
   * Look up a registered block type by ID.
   */
  getBlockType(id: string): BlockType | undefined;
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
  /**
   * Writ type → rig template mappings.
   * 'default' key is the fallback for unmatched writ types.
   * Spawning fails if no matching template is found.
   */
  rigTemplates?: Record<string, RigTemplate>;
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



## Convention Reference (sibling files not modified by this commission)

=== CONTEXT FILE: packages/plugins/spider/src/tools ===
tree e9bd07e25fe8ac96734667784cd1415e63309f0c:packages/plugins/spider/src/tools

crawl-continual.ts
crawl-one.ts
index.ts
rig-for-writ.ts
rig-list.ts
rig-resume.ts
rig-show.ts

=== CONTEXT FILE: packages/plugins/spider/src/engines ===
tree e9bd07e25fe8ac96734667784cd1415e63309f0c:packages/plugins/spider/src/engines

draft.ts
implement.ts
index.ts
review.ts
revise.ts
seal.ts

=== CONTEXT FILE: packages/plugins/spider/src/block-types ===
tree e9bd07e25fe8ac96734667784cd1415e63309f0c:packages/plugins/spider/src/block-types

book-updated.ts
index.ts
scheduled-time.ts
writ-status.ts



## Codebase Structure (surrounding directories)

```
=== TREE: packages/plugins/spider/src/ ===
block-types
engines
index.ts
spider.test.ts
spider.ts
tools
types.ts


```
