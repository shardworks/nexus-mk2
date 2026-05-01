/**
 * Tests for the trial manifest parser and validator.
 *
 * Covers:
 *   - YAML syntactic errors (helpful message; no zod tracebacks)
 *   - Empty / non-map manifests rejected
 *   - Schema rejections (missing required fields, slug shape,
 *     engineId required, dependsOn type)
 *   - Defaults (empty fixtures, empty probes, empty givens)
 *   - Cross-field: fixture DAG (cycles, unknown deps, dups)
 *   - Cross-field: probe id uniqueness
 *   - Round-trip: manifest → writ-post + trial config
 *   - Title default ("Trial: <slug>")
 *   - description → body, missing description → empty body
 *   - parentId / codex pass-through
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ManifestError, manifestToWritShape, parseManifest } from './manifest.ts';

const MINIMAL_VALID = `
slug: minimal
scenario:
  engineId: lab.commission-post-xguild
archive:
  engineId: lab.archive
`;

// ── Parsing ─────────────────────────────────────────────────────────

describe('parseManifest — YAML parse errors', () => {
  it('throws ManifestError on syntactically broken YAML', () => {
    assert.throws(
      () => parseManifest('::not\n  - valid: ['),
      (err: unknown) => err instanceof ManifestError && /YAML parse failed/.test((err as Error).message),
    );
  });

  it('throws ManifestError on empty input', () => {
    assert.throws(
      () => parseManifest(''),
      /manifest is empty/,
    );
  });

  it('throws ManifestError when top-level is an array, not a map', () => {
    assert.throws(
      () => parseManifest('- a\n- b\n'),
      /must be a YAML map/,
    );
  });

  it('throws ManifestError when top-level is a scalar, not a map', () => {
    assert.throws(
      () => parseManifest('"just a string"'),
      /must be a YAML map/,
    );
  });
});

// ── Schema validation ─────────────────────────────────────────────

describe('parseManifest — schema validation', () => {
  it('accepts the minimal valid manifest', () => {
    const m = parseManifest(MINIMAL_VALID);
    assert.equal(m.slug, 'minimal');
    assert.deepEqual(m.fixtures, []);
    assert.deepEqual(m.probes, []);
    assert.equal(m.scenario.engineId, 'lab.commission-post-xguild');
    assert.equal(m.archive.engineId, 'lab.archive');
  });

  it('rejects missing slug', () => {
    assert.throws(
      () =>
        parseManifest(`
scenario:
  engineId: lab.scenario
archive:
  engineId: lab.archive
`),
      /slug/,
    );
  });

  it('rejects malformed slug (uppercase)', () => {
    assert.throws(
      () =>
        parseManifest(`
slug: BadSlug
scenario:
  engineId: lab.scenario
archive:
  engineId: lab.archive
`),
      /lowercase kebab-case/,
    );
  });

  it('rejects slug starting with a digit', () => {
    assert.throws(
      () =>
        parseManifest(`
slug: 1-thing
scenario:
  engineId: lab.scenario
archive:
  engineId: lab.archive
`),
      /lowercase kebab-case/,
    );
  });

  it('rejects slug longer than 40 chars', () => {
    const tooLong = 'a'.repeat(41);
    assert.throws(
      () =>
        parseManifest(`
slug: ${tooLong}
scenario:
  engineId: lab.scenario
archive:
  engineId: lab.archive
`),
      /lowercase kebab-case/,
    );
  });

  it('rejects missing scenario', () => {
    assert.throws(
      () =>
        parseManifest(`
slug: ok
archive:
  engineId: lab.archive
`),
      /scenario/,
    );
  });

  it('rejects missing archive', () => {
    assert.throws(
      () =>
        parseManifest(`
slug: ok
scenario:
  engineId: lab.scenario
`),
      /archive/,
    );
  });

  it('rejects fixture without engineId', () => {
    assert.throws(
      () =>
        parseManifest(`
slug: ok
fixtures:
  - id: f1
scenario:
  engineId: lab.scenario
archive:
  engineId: lab.archive
`),
      /engineId/,
    );
  });

  it('rejects fixture with malformed id', () => {
    assert.throws(
      () =>
        parseManifest(`
slug: ok
fixtures:
  - id: BadId
    engineId: lab.thing
scenario:
  engineId: lab.scenario
archive:
  engineId: lab.archive
`),
      /fixture id must be kebab-case/,
    );
  });

  it('accepts a fixture with all optional fields populated', () => {
    const m = parseManifest(`
slug: ok
fixtures:
  - id: codex
    engineId: lab.codex-setup
    teardownEngineId: lab.codex-special-teardown
    givens:
      remote: foo/bar
    dependsOn: []
    scope: trial
    mutability: snapshotted
scenario:
  engineId: lab.scenario
archive:
  engineId: lab.archive
`);
    assert.equal(m.fixtures.length, 1);
    assert.equal(m.fixtures[0]!.teardownEngineId, 'lab.codex-special-teardown');
    assert.equal(m.fixtures[0]!.scope, 'trial');
    assert.equal(m.fixtures[0]!.mutability, 'snapshotted');
  });

  it('rejects fixture mutability outside the v2-reserved enum', () => {
    assert.throws(
      () =>
        parseManifest(`
slug: ok
fixtures:
  - id: codex
    engineId: lab.codex-setup
    mutability: bogus
scenario:
  engineId: lab.scenario
archive:
  engineId: lab.archive
`),
      /mutability/,
    );
  });

  it('defaults givens to empty object on fixture, scenario, probe, archive', () => {
    const m = parseManifest(`
slug: ok
fixtures:
  - id: f1
    engineId: lab.f1-setup
scenario:
  engineId: lab.scenario
probes:
  - id: p1
    engineId: lab.probe-thing
archive:
  engineId: lab.archive
`);
    assert.deepEqual(m.fixtures[0]!.givens, {});
    assert.deepEqual(m.scenario.givens, {});
    assert.deepEqual(m.probes[0]!.givens, {});
    assert.deepEqual(m.archive.givens, {});
  });
});

// ── Cross-field validation ────────────────────────────────────────

describe('parseManifest — fixture DAG cross-validation', () => {
  it('rejects a fixture cycle', () => {
    assert.throws(
      () =>
        parseManifest(`
slug: ok
fixtures:
  - id: a
    engineId: lab.a-setup
    dependsOn: [b]
  - id: b
    engineId: lab.b-setup
    dependsOn: [a]
scenario:
  engineId: lab.scenario
archive:
  engineId: lab.archive
`),
      /fixture DAG invalid.*cycle/i,
    );
  });

  it('rejects unknown dependsOn references', () => {
    assert.throws(
      () =>
        parseManifest(`
slug: ok
fixtures:
  - id: a
    engineId: lab.a-setup
    dependsOn: [ghost]
scenario:
  engineId: lab.scenario
archive:
  engineId: lab.archive
`),
      /unknown fixture "ghost"/,
    );
  });

  it('rejects duplicate fixture ids', () => {
    assert.throws(
      () =>
        parseManifest(`
slug: ok
fixtures:
  - id: a
    engineId: lab.a-setup
  - id: a
    engineId: lab.a-other
scenario:
  engineId: lab.scenario
archive:
  engineId: lab.archive
`),
      /duplicate fixture id/,
    );
  });
});

describe('parseManifest — stable pin enforcement', () => {
  it('accepts a manifest whose plugins[] all use stable pins', () => {
    const m = parseManifest(`
slug: ok
fixtures:
  - id: g
    engineId: lab.guild-setup
    givens:
      plugins:
        - { name: '@shardworks/tools-apparatus', version: '1.2.3' }
        - { name: '@shardworks/codexes-apparatus', version: 'git+https://github.com/foo/bar.git#a1b2c3d4e5f6' }
        - { name: '@shardworks/clerk-apparatus', version: 'shardworks/clerk#a1b2c3d4e5f6789012345678901234567890abcd' }
scenario:
  engineId: lab.scenario
archive:
  engineId: lab.archive
`);
    const fix = m.fixtures[0]!;
    const plugins = (fix.givens as { plugins: { version: string }[] }).plugins;
    assert.equal(plugins.length, 3);
  });

  it('rejects file: pins with a clear reason and the right path', () => {
    assert.throws(
      () =>
        parseManifest(`
slug: ok
fixtures:
  - id: g
    engineId: lab.guild-setup
    givens:
      plugins:
        - { name: '@shardworks/tools-apparatus', version: 'file:/workspace/nexus/packages/plugins/tools' }
scenario:
  engineId: lab.scenario
archive:
  engineId: lab.archive
`),
      (err: Error) => {
        assert.match(err.message, /unstable pin/);
        assert.match(err.message, /not reproducible/);
        assert.match(err.message, /fixtures\.0\.givens\.plugins\.0\.version/);
        return true;
      },
    );
  });

  it('rejects link: pins', () => {
    assert.throws(
      () =>
        parseManifest(`
slug: ok
fixtures:
  - id: g
    engineId: lab.guild-setup
    givens:
      plugins:
        - { name: x, version: 'link:../somewhere' }
scenario:
  engineId: lab.scenario
archive:
  engineId: lab.archive
`),
      /unstable pin.*pnpm-only/,
    );
  });

  it('rejects caret ranges', () => {
    assert.throws(
      () =>
        parseManifest(`
slug: ok
fixtures:
  - id: g
    engineId: lab.guild-setup
    givens:
      plugins:
        - { name: x, version: '^1.2.3' }
scenario:
  engineId: lab.scenario
archive:
  engineId: lab.archive
`),
      /version range/,
    );
  });

  it('rejects dist-tags', () => {
    assert.throws(
      () =>
        parseManifest(`
slug: ok
fixtures:
  - id: g
    engineId: lab.guild-setup
    givens:
      plugins:
        - { name: x, version: 'latest' }
scenario:
  engineId: lab.scenario
archive:
  engineId: lab.archive
`),
      /dist-tag/,
    );
  });

  it('rejects git URLs with a branch fragment', () => {
    assert.throws(
      () =>
        parseManifest(`
slug: ok
fixtures:
  - id: g
    engineId: lab.guild-setup
    givens:
      plugins:
        - { name: x, version: 'git+https://github.com/foo/bar.git#main' }
scenario:
  engineId: lab.scenario
archive:
  engineId: lab.archive
`),
      /SHA, not a branch or tag/,
    );
  });

  it('reports every unstable pin in the same parse (not just the first)', () => {
    assert.throws(
      () =>
        parseManifest(`
slug: ok
fixtures:
  - id: g
    engineId: lab.guild-setup
    givens:
      plugins:
        - { name: a, version: 'file:./a' }
        - { name: b, version: '1.2.3' }
        - { name: c, version: '^2.0.0' }
scenario:
  engineId: lab.scenario
archive:
  engineId: lab.archive
`),
      (err: Error) => {
        // Both pin failures should appear in the message.
        assert.match(err.message, /plugins\.0\.version/);
        assert.match(err.message, /plugins\.2\.version/);
        // The middle one passed.
        assert.doesNotMatch(err.message, /plugins\.1\.version/);
        return true;
      },
    );
  });

  it('skips pin validation for engines that do not declare plugin pins', () => {
    // lab.guild-setup is the only engine with a registered extractor.
    // A fixture whose engineId is something else and happens to have a
    // `plugins` field should NOT be validated — we don't know the
    // shape contract.
    const m = parseManifest(`
slug: ok
fixtures:
  - id: g
    engineId: lab.something-else
    givens:
      plugins:
        - { name: x, version: 'file:/this/would/normally/fail' }
scenario:
  engineId: lab.scenario
archive:
  engineId: lab.archive
`);
    assert.equal(m.fixtures.length, 1);
  });
});

describe('parseManifest — probe id uniqueness', () => {
  it('rejects duplicate probe ids', () => {
    assert.throws(
      () =>
        parseManifest(`
slug: ok
scenario:
  engineId: lab.scenario
probes:
  - id: p
    engineId: lab.probe-stacks-dump
  - id: p
    engineId: lab.probe-git-range
archive:
  engineId: lab.archive
`),
      /duplicate probe id/,
    );
  });
});

// ── manifestToWritShape ───────────────────────────────────────────

describe('manifestToWritShape', () => {
  it('defaults title to "Trial: <slug>" when title omitted', () => {
    const m = parseManifest(MINIMAL_VALID);
    const { title } = manifestToWritShape(m);
    assert.equal(title, 'Trial: minimal');
  });

  it('uses explicit title when provided', () => {
    const m = parseManifest(`
slug: ok
title: Custom title goes here
scenario:
  engineId: lab.scenario
archive:
  engineId: lab.archive
`);
    const { title } = manifestToWritShape(m);
    assert.equal(title, 'Custom title goes here');
  });

  it('description becomes body; missing description becomes empty body', () => {
    const m1 = parseManifest(MINIMAL_VALID);
    assert.equal(manifestToWritShape(m1).body, '');

    const m2 = parseManifest(`
slug: ok
description: |
  Multi-line
  description.
scenario:
  engineId: lab.scenario
archive:
  engineId: lab.archive
`);
    const body = manifestToWritShape(m2).body;
    assert.match(body, /Multi-line/);
    assert.match(body, /description\./);
  });

  it('passes parentId and codex through unchanged', () => {
    const m = parseManifest(`
slug: ok
parentId: w-abc-123
codex: nexus
scenario:
  engineId: lab.scenario
archive:
  engineId: lab.archive
`);
    const shape = manifestToWritShape(m);
    assert.equal(shape.parentId, 'w-abc-123');
    assert.equal(shape.codex, 'nexus');
  });

  it('packs fixtures, scenario, probes, archive into trialConfig', () => {
    const m = parseManifest(`
slug: real
fixtures:
  - id: codex
    engineId: lab.codex-setup
    givens: { repo: foo/bar }
scenario:
  engineId: lab.scenario
  givens: { brief: files/brief.md }
probes:
  - id: stacks
    engineId: lab.probe-stacks-dump
    givens: { out: stacks/ }
archive:
  engineId: lab.archive
  givens: { target: sanctum }
`);
    const { trialConfig } = manifestToWritShape(m);
    assert.equal(trialConfig.slug, 'real');
    assert.equal(trialConfig.fixtures.length, 1);
    assert.equal(trialConfig.fixtures[0]!.engineId, 'lab.codex-setup');
    assert.deepEqual(trialConfig.fixtures[0]!.givens, { repo: 'foo/bar' });
    assert.equal(trialConfig.scenario.engineId, 'lab.scenario');
    assert.deepEqual(trialConfig.scenario.givens, { brief: 'files/brief.md' });
    assert.equal(trialConfig.probes.length, 1);
    assert.equal(trialConfig.probes[0]!.id, 'stacks');
    assert.equal(trialConfig.archive.engineId, 'lab.archive');
  });

  it('does not include description, title, parentId, codex inside trialConfig', () => {
    const m = parseManifest(`
slug: ok
title: Some title
description: prose
parentId: w-abc
codex: nexus
scenario:
  engineId: lab.scenario
archive:
  engineId: lab.archive
`);
    const { trialConfig } = manifestToWritShape(m);
    assert.equal((trialConfig as Record<string, unknown>).description, undefined);
    assert.equal((trialConfig as Record<string, unknown>).title, undefined);
    assert.equal((trialConfig as Record<string, unknown>).parentId, undefined);
    assert.equal((trialConfig as Record<string, unknown>).codex, undefined);
  });
});
