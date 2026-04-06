/**
 * Dispatch Apparatus Removal Verification Tests
 *
 * Commission: w-mnjxdvcq-ee5e2e06df62 — "Remove Dispatch Apparatus"
 *
 * These tests assert that the @shardworks/dispatch-apparatus package and all
 * references to it have been completely removed from the framework (nexus),
 * live guild (vibers), and architecture documentation. No residual imports,
 * plugin registrations, doc references, or dead code paths should remain.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const NEXUS = '/workspace/nexus';
const VIBERS = '/workspace/vibers';
const APPARATUS_DOCS = `${NEXUS}/docs/architecture/apparatus`;

// ---------------------------------------------------------------------------
// R1: Package directory must be deleted
// ---------------------------------------------------------------------------

describe('R1 — dispatch package deleted', () => {
  it('packages/plugins/dispatch directory does not exist', () => {
    const dispatchDir = join(NEXUS, 'packages', 'plugins', 'dispatch');
    assert.equal(
      existsSync(dispatchDir),
      false,
      `Expected dispatch package directory to be deleted: ${dispatchDir}`,
    );
  });

  it('no dispatch entry in pnpm workspace packages', () => {
    const workspaceFile = join(NEXUS, 'pnpm-workspace.yaml');
    if (!existsSync(workspaceFile)) return; // file may not exist in all setups
    const content = readFileSync(workspaceFile, 'utf8');
    assert.equal(
      content.includes('plugins/dispatch'),
      false,
      'pnpm-workspace.yaml still references plugins/dispatch',
    );
  });

  it('no dispatch plugin package.json in plugins directory', () => {
    const pluginsDir = join(NEXUS, 'packages', 'plugins');
    if (!existsSync(pluginsDir)) return;
    const entries = readdirSync(pluginsDir);
    assert.equal(
      entries.includes('dispatch'),
      false,
      `"dispatch" directory still present in ${pluginsDir}: [${entries.join(', ')}]`,
    );
  });
});

// ---------------------------------------------------------------------------
// R2: "dispatch" removed from vibers guild.json plugins array
// ---------------------------------------------------------------------------

describe('R2 — dispatch removed from guild.json', () => {
  it('guild.json does not list "dispatch" in plugins array', () => {
    const guildJson = join(VIBERS, 'guild.json');
    assert.ok(existsSync(guildJson), `guild.json not found at ${guildJson}`);

    const guild = JSON.parse(readFileSync(guildJson, 'utf8')) as {
      plugins?: string[];
    };
    const plugins = guild.plugins ?? [];

    assert.equal(
      plugins.includes('dispatch'),
      false,
      `guild.json plugins still contains "dispatch": [${plugins.join(', ')}]`,
    );
  });

  it('guild.json raw text contains no dispatch-apparatus reference', () => {
    const guildJson = join(VIBERS, 'guild.json');
    const raw = readFileSync(guildJson, 'utf8');
    assert.equal(
      raw.includes('dispatch-apparatus'),
      false,
      'guild.json still references dispatch-apparatus',
    );
  });
});

// ---------------------------------------------------------------------------
// R3: @shardworks/dispatch-apparatus dependency removed from vibers package.json
// ---------------------------------------------------------------------------

describe('R3 — dispatch-apparatus removed from vibers package.json', () => {
  it('package.json has no @shardworks/dispatch-apparatus dependency', () => {
    const pkgJson = join(VIBERS, 'package.json');
    assert.ok(existsSync(pkgJson), `package.json not found at ${pkgJson}`);
    const pkg = JSON.parse(readFileSync(pkgJson, 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
    };

    const allDeps = {
      ...pkg.dependencies,
      ...pkg.devDependencies,
      ...pkg.peerDependencies,
    };

    assert.equal(
      '@shardworks/dispatch-apparatus' in allDeps,
      false,
      'package.json still declares @shardworks/dispatch-apparatus as a dependency',
    );
  });

  it('package.json raw text contains no dispatch-apparatus reference', () => {
    const pkgJson = join(VIBERS, 'package.json');
    const raw = readFileSync(pkgJson, 'utf8');
    assert.equal(
      raw.includes('dispatch-apparatus'),
      false,
      'package.json raw text still contains "dispatch-apparatus"',
    );
  });
});

// ---------------------------------------------------------------------------
// R4: docs/architecture/apparatus/dispatch.md must be deleted
// ---------------------------------------------------------------------------

describe('R4 — dispatch.md deleted', () => {
  it('dispatch.md does not exist in apparatus docs', () => {
    const dispatchMd = join(APPARATUS_DOCS, 'dispatch.md');
    assert.equal(
      existsSync(dispatchMd),
      false,
      `Expected apparatus dispatch.md to be deleted: ${dispatchMd}`,
    );
  });
});

// ---------------------------------------------------------------------------
// R5: "The Dispatch" apparatus references cleaned from docs
// ---------------------------------------------------------------------------

describe('R5 — apparatus docs no longer reference "The Dispatch"', () => {
  const docsToCheck: Array<{ file: string; label: string }> = [
    { file: 'clerk.md', label: 'clerk.md' },
    { file: 'spider.md', label: 'spider.md' },
    { file: 'animator.md', label: 'animator.md' },
    { file: 'scriptorium.md', label: 'scriptorium.md' },
  ];

  for (const { file, label } of docsToCheck) {
    it(`${label} contains no "The Dispatch" apparatus reference`, () => {
      const filePath = join(APPARATUS_DOCS, file);
      assert.ok(existsSync(filePath), `${label} not found at ${filePath}`);
      const content = readFileSync(filePath, 'utf8');
      assert.equal(
        content.includes('The Dispatch'),
        false,
        `${label} still contains "The Dispatch" apparatus reference`,
      );
    });

    it(`${label} contains no link to dispatch.md`, () => {
      const filePath = join(APPARATUS_DOCS, file);
      const content = readFileSync(filePath, 'utf8');
      assert.equal(
        content.includes('dispatch.md'),
        false,
        `${label} still links to the deleted dispatch.md`,
      );
    });

    it(`${label} contains no "[The Dispatch]" markdown link`, () => {
      const filePath = join(APPARATUS_DOCS, file);
      const content = readFileSync(filePath, 'utf8');
      assert.equal(
        content.includes('[The Dispatch]'),
        false,
        `${label} still contains "[The Dispatch]" markdown link`,
      );
    });
  }

  it('no apparatus doc contains "The Dispatch" apparatus reference', () => {
    if (!existsSync(APPARATUS_DOCS)) return;
    const files = readdirSync(APPARATUS_DOCS).filter((f) => f.endsWith('.md'));
    const violations: string[] = [];
    for (const file of files) {
      const content = readFileSync(join(APPARATUS_DOCS, file), 'utf8');
      // "The Dispatch" as a proper noun (apparatus name) — check for capitalised form
      // Note: lowercase "dispatch" in generic contexts (event dispatch, dispatch path) is OK
      if (content.includes('The Dispatch')) {
        violations.push(file);
      }
    }
    assert.deepEqual(
      violations,
      [],
      `Apparatus docs still contain "The Dispatch": ${violations.join(', ')}`,
    );
  });
});

// ---------------------------------------------------------------------------
// R5 (clerk.md-specific): Updated section headers and content
// ---------------------------------------------------------------------------

describe('R5 — clerk.md updated section header', () => {
  it('clerk.md section is renamed to "Execution Integration" (not "Dispatch Integration")', () => {
    const clerkMd = join(APPARATUS_DOCS, 'clerk.md');
    const content = readFileSync(clerkMd, 'utf8');
    assert.equal(
      content.includes('### Dispatch Integration'),
      false,
      'clerk.md still contains old "### Dispatch Integration" section header',
    );
  });

  it('clerk.md contains updated "Execution Integration" section', () => {
    const clerkMd = join(APPARATUS_DOCS, 'clerk.md');
    const content = readFileSync(clerkMd, 'utf8');
    assert.ok(
      content.includes('Execution Integration'),
      'clerk.md is missing the updated "Execution Integration" section',
    );
  });

  it('clerk.md references Spider instead of Dispatch for execution', () => {
    const clerkMd = join(APPARATUS_DOCS, 'clerk.md');
    const content = readFileSync(clerkMd, 'utf8');
    assert.ok(
      content.includes('Spider'),
      'clerk.md should reference the Spider as the execution layer',
    );
  });
});

// ---------------------------------------------------------------------------
// R6: "Interim Dispatch Pattern" section removed from scriptorium.md
// ---------------------------------------------------------------------------

describe('R6 — Interim Dispatch Pattern removed from scriptorium.md', () => {
  it('scriptorium.md has no "Interim Dispatch Pattern" section', () => {
    const scriptoriumMd = join(APPARATUS_DOCS, 'scriptorium.md');
    assert.ok(existsSync(scriptoriumMd), `scriptorium.md not found at ${scriptoriumMd}`);
    const content = readFileSync(scriptoriumMd, 'utf8');
    assert.equal(
      content.includes('Interim Dispatch Pattern'),
      false,
      'scriptorium.md still contains the "Interim Dispatch Pattern" section',
    );
  });

  it('scriptorium.md has no "## Interim" section header', () => {
    const scriptoriumMd = join(APPARATUS_DOCS, 'scriptorium.md');
    const content = readFileSync(scriptoriumMd, 'utf8');
    assert.equal(
      /^## Interim/m.test(content),
      false,
      'scriptorium.md still has a "## Interim ..." section header',
    );
  });
});

// ---------------------------------------------------------------------------
// R7: Dispatch-specific sections removed from review-loop.md
// ---------------------------------------------------------------------------

describe('R7 — Dispatch sections removed from review-loop.md', () => {
  it('review-loop.md exists and retains content', () => {
    const reviewLoopMd = join(APPARATUS_DOCS, 'review-loop.md');
    assert.ok(existsSync(reviewLoopMd), `review-loop.md not found at ${reviewLoopMd}`);
    const content = readFileSync(reviewLoopMd, 'utf8');
    assert.ok(content.length > 500, 'review-loop.md appears unexpectedly empty after edits');
  });

  it('review-loop.md has no "Option A" dispatch-level option', () => {
    const content = readFileSync(join(APPARATUS_DOCS, 'review-loop.md'), 'utf8');
    assert.equal(
      content.includes('Option A'),
      false,
      'review-loop.md still contains "Option A" (Dispatch-level wrapper MVP path)',
    );
  });

  it('review-loop.md has no "MVP: Dispatch-Level Review Loop" section', () => {
    const content = readFileSync(join(APPARATUS_DOCS, 'review-loop.md'), 'utf8');
    assert.equal(
      content.includes('MVP: Dispatch-Level Review Loop'),
      false,
      'review-loop.md still contains the "MVP: Dispatch-Level Review Loop" section',
    );
  });

  it('review-loop.md has no "MVP.*Dispatch" text', () => {
    const content = readFileSync(join(APPARATUS_DOCS, 'review-loop.md'), 'utf8');
    assert.equal(
      /MVP.*Dispatch/.test(content),
      false,
      'review-loop.md still contains MVP references to Dispatch',
    );
  });

  it('review-loop.md has no "Implementation Notes for MVP" section', () => {
    const content = readFileSync(join(APPARATUS_DOCS, 'review-loop.md'), 'utf8');
    assert.equal(
      content.includes('Implementation Notes for MVP'),
      false,
      'review-loop.md still contains "Implementation Notes for MVP" (dispatch apparatus changes)',
    );
  });

  it('review-loop.md has no "For the MVP (Dispatch-level)" paragraph', () => {
    const content = readFileSync(join(APPARATUS_DOCS, 'review-loop.md'), 'utf8');
    assert.equal(
      content.includes('For the MVP (Dispatch-level)'),
      false,
      'review-loop.md still contains a "For the MVP (Dispatch-level)" paragraph',
    );
  });

  it('review-loop.md Decision section does not adopt "both Option A (MVP) and Option B"', () => {
    const content = readFileSync(join(APPARATUS_DOCS, 'review-loop.md'), 'utf8');
    assert.equal(
      content.includes('Adopt both Option A'),
      false,
      'review-loop.md Decision still references adopting Option A (Dispatch-level MVP)',
    );
  });

  it('review-loop.md retains empirical motivation and review criteria content', () => {
    const content = readFileSync(join(APPARATUS_DOCS, 'review-loop.md'), 'utf8');
    // The non-Dispatch content must be preserved
    assert.ok(
      content.includes('review') || content.includes('Spider') || content.includes('rig'),
      'review-loop.md appears to have lost non-Dispatch content (review criteria / Spider design)',
    );
  });
});

// ---------------------------------------------------------------------------
// V7/V10: No TypeScript source files import from @shardworks/dispatch-apparatus
// ---------------------------------------------------------------------------

describe('V10 — no source code imports from @shardworks/dispatch-apparatus', () => {
  /**
   * Recursively walk a directory and return all .ts file paths (excluding
   * node_modules and dist directories).
   */
  function collectTsFiles(dir: string): string[] {
    if (!existsSync(dir)) return [];
    const results: string[] = [];
    const entries = readdirSync(dir);
    for (const entry of entries) {
      if (entry === 'node_modules' || entry === 'dist' || entry === '.git') continue;
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        results.push(...collectTsFiles(fullPath));
      } else if (entry.endsWith('.ts')) {
        results.push(fullPath);
      }
    }
    return results;
  }

  it('no .ts file in nexus/packages imports @shardworks/dispatch-apparatus', () => {
    const packagesDir = join(NEXUS, 'packages');
    const tsFiles = collectTsFiles(packagesDir);
    const violations = tsFiles.filter((f) =>
      readFileSync(f, 'utf8').includes('@shardworks/dispatch-apparatus'),
    );
    assert.deepEqual(
      violations,
      [],
      `TypeScript files still import from @shardworks/dispatch-apparatus:\n  ${violations.join('\n  ')}`,
    );
  });

  it('no package.json in nexus/packages/plugins declares dispatch-apparatus', () => {
    const pluginsDir = join(NEXUS, 'packages', 'plugins');
    if (!existsSync(pluginsDir)) return;
    const plugins = readdirSync(pluginsDir);
    const violations: string[] = [];
    for (const plugin of plugins) {
      const pkgJsonPath = join(pluginsDir, plugin, 'package.json');
      if (!existsSync(pkgJsonPath)) continue;
      const raw = readFileSync(pkgJsonPath, 'utf8');
      if (raw.includes('dispatch-apparatus')) {
        violations.push(pkgJsonPath);
      }
    }
    assert.deepEqual(
      violations,
      [],
      `Plugin package.json files still reference dispatch-apparatus:\n  ${violations.join('\n  ')}`,
    );
  });

  it('no plugin declares "dispatch" in its requires or recommends apparatus list', () => {
    const pluginsDir = join(NEXUS, 'packages', 'plugins');
    if (!existsSync(pluginsDir)) return;
    const plugins = readdirSync(pluginsDir);
    const violations: string[] = [];
    for (const plugin of plugins) {
      const srcDir = join(pluginsDir, plugin, 'src');
      const tsFiles = collectTsFiles(srcDir);
      for (const file of tsFiles) {
        const content = readFileSync(file, 'utf8');
        // Look for requires/recommends arrays containing 'dispatch' as apparatus name
        if (/requires\s*:\s*\[([^\]]*'dispatch'[^\]]*)\]/.test(content)) {
          violations.push(`${file} (requires dispatch)`);
        }
        if (/recommends\s*:\s*\[([^\]]*'dispatch'[^\]]*)\]/.test(content)) {
          violations.push(`${file} (recommends dispatch)`);
        }
      }
    }
    assert.deepEqual(
      violations,
      [],
      `Plugin source files still declare "dispatch" in apparatus requires/recommends:\n  ${violations.join('\n  ')}`,
    );
  });
});

// ---------------------------------------------------------------------------
// V7: pnpm-lock.yaml does not reference dispatch package
// ---------------------------------------------------------------------------

describe('V7 — lockfiles do not reference dispatch package', () => {
  it('nexus pnpm-lock.yaml has no dispatch-apparatus entry', () => {
    const lockFile = join(NEXUS, 'pnpm-lock.yaml');
    if (!existsSync(lockFile)) return;
    const content = readFileSync(lockFile, 'utf8');
    assert.equal(
      content.includes('dispatch-apparatus'),
      false,
      'nexus pnpm-lock.yaml still contains a dispatch-apparatus entry',
    );
  });

  it('nexus pnpm-lock.yaml has no plugins/dispatch path reference', () => {
    const lockFile = join(NEXUS, 'pnpm-lock.yaml');
    if (!existsSync(lockFile)) return;
    const content = readFileSync(lockFile, 'utf8');
    assert.equal(
      content.includes('plugins/dispatch'),
      false,
      'nexus pnpm-lock.yaml still contains plugins/dispatch path reference',
    );
  });
});

// ---------------------------------------------------------------------------
// V8: vibers package-lock.json does not reference dispatch-apparatus
// ---------------------------------------------------------------------------

describe('V8 — vibers package-lock.json does not reference dispatch-apparatus', () => {
  it('package-lock.json has no dispatch-apparatus entry', () => {
    const lockFile = join(VIBERS, 'package-lock.json');
    if (!existsSync(lockFile)) return;
    const content = readFileSync(lockFile, 'utf8');
    assert.equal(
      content.includes('dispatch-apparatus'),
      false,
      'vibers package-lock.json still contains a dispatch-apparatus entry',
    );
  });
});
