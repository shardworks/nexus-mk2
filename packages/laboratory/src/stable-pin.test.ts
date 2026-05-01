/**
 * Tests for `isStablePin`.
 *
 * Pinning the reproducibility contract: every form a manifest can
 * declare a plugin or CLI version in must be classified consistently.
 * Whitelist accepts; blacklist + catch-all rejects with reasons.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { isStablePin } from './stable-pin.ts';

describe('isStablePin — accepted forms', () => {
  it('accepts an exact semver', () => {
    assert.deepEqual(isStablePin('1.2.3'), { ok: true });
    assert.deepEqual(isStablePin('0.0.0'), { ok: true });
    assert.deepEqual(isStablePin('100.200.300'), { ok: true });
  });

  it('accepts semver with pre-release suffix', () => {
    assert.deepEqual(isStablePin('1.2.3-alpha.0'), { ok: true });
    assert.deepEqual(isStablePin('1.0.0-beta.1'), { ok: true });
    assert.deepEqual(isStablePin('2.0.0-rc.5'), { ok: true });
    assert.deepEqual(isStablePin('1.2.3-pre.0+build.5'), { ok: true });
  });

  it('accepts semver with build metadata', () => {
    assert.deepEqual(isStablePin('1.2.3+build.5'), { ok: true });
    assert.deepEqual(isStablePin('1.0.0+sha.a1b2c3d'), { ok: true });
  });

  it('accepts git+https URLs with a 40-char SHA', () => {
    assert.deepEqual(
      isStablePin('git+https://github.com/foo/bar.git#a1b2c3d4e5f6789012345678901234567890abcd'),
      { ok: true },
    );
  });

  it('accepts git+ssh URLs with a SHA', () => {
    assert.deepEqual(
      isStablePin('git+ssh://git@github.com/foo/bar.git#a1b2c3d4e5f6'),
      { ok: true },
    );
  });

  it('accepts git+file URLs with a SHA (the dev-iteration form)', () => {
    assert.deepEqual(
      isStablePin('git+file:///workspace/nexus-mk2#a1b2c3d4e5f6789012345678901234567890abcd'),
      { ok: true },
    );
  });

  it('accepts git URLs with a 7-char SHA (GitHub short form)', () => {
    assert.deepEqual(
      isStablePin('git+https://github.com/foo/bar.git#a1b2c3d'),
      { ok: true },
    );
  });

  it('accepts GitHub shorthand with a SHA', () => {
    assert.deepEqual(isStablePin('foo/bar#a1b2c3d'), { ok: true });
    assert.deepEqual(
      isStablePin('shardworks/nexus#a1b2c3d4e5f6789012345678901234567890abcd'),
      { ok: true },
    );
  });

  it('accepts github: prefix shorthand with a SHA', () => {
    assert.deepEqual(isStablePin('github:foo/bar#a1b2c3d'), { ok: true });
  });

  it('accepts a registry tarball URL', () => {
    assert.deepEqual(
      isStablePin('https://registry.npmjs.org/foo/-/foo-1.2.3.tgz'),
      { ok: true },
    );
  });

  it('accepts http (not just https) tarball URLs', () => {
    assert.deepEqual(
      isStablePin('http://internal.npm/foo/-/foo-1.0.0.tgz'),
      { ok: true },
    );
  });
});

describe('isStablePin — rejected forms', () => {
  it('rejects empty / non-string input', () => {
    const empty = isStablePin('');
    assert.equal(empty.ok, false);
    assert.match((empty as { reason: string }).reason, /non-empty string/);
  });

  it('rejects file: paths with a clear reason', () => {
    const r = isStablePin('file:/workspace/nexus/packages/plugins/clerk');
    assert.equal(r.ok, false);
    assert.match((r as { reason: string }).reason, /not reproducible/);
  });

  it('rejects link: paths', () => {
    const r = isStablePin('link:../some/path');
    assert.equal(r.ok, false);
    assert.match((r as { reason: string }).reason, /pnpm-only/);
  });

  it('rejects workspace: refs', () => {
    const r = isStablePin('workspace:*');
    assert.equal(r.ok, false);
    assert.match((r as { reason: string }).reason, /monorepo-local/);
  });

  it('rejects caret ranges', () => {
    const r = isStablePin('^1.2.3');
    assert.equal(r.ok, false);
    assert.match((r as { reason: string }).reason, /version range/);
  });

  it('rejects tilde ranges', () => {
    const r = isStablePin('~1.2.3');
    assert.equal(r.ok, false);
    assert.match((r as { reason: string }).reason, /version range/);
  });

  it('rejects asterisk wildcard', () => {
    assert.equal(isStablePin('*').ok, false);
  });

  it('rejects comparator ranges', () => {
    assert.equal(isStablePin('>=1.2.3').ok, false);
    assert.equal(isStablePin('>1.0.0').ok, false);
  });

  it('rejects dist-tags', () => {
    for (const tag of ['latest', 'next', 'beta', 'alpha', 'canary', 'rc']) {
      const r = isStablePin(tag);
      assert.equal(r.ok, false, `expected "${tag}" to be rejected`);
      assert.match((r as { reason: string }).reason, /dist-tag/);
    }
  });

  it('rejects git URLs with a branch name fragment', () => {
    const r = isStablePin('git+https://github.com/foo/bar.git#main');
    assert.equal(r.ok, false);
    assert.match((r as { reason: string }).reason, /SHA, not a branch or tag/);
  });

  it('rejects git URLs with a tag-shaped fragment', () => {
    const r = isStablePin('git+https://github.com/foo/bar.git#v1.0.0');
    assert.equal(r.ok, false);
    assert.match((r as { reason: string }).reason, /SHA/);
  });

  it('rejects GitHub shorthand with a branch fragment', () => {
    const r = isStablePin('foo/bar#main');
    assert.equal(r.ok, false);
    assert.match((r as { reason: string }).reason, /SHA/);
  });

  it('rejects partial semver (e.g. "1" or "1.2")', () => {
    assert.equal(isStablePin('1').ok, false);
    assert.equal(isStablePin('1.2').ok, false);
  });

  it('rejects fully-unrecognized strings', () => {
    const r = isStablePin('not-a-version-at-all');
    assert.equal(r.ok, false);
    assert.match((r as { reason: string }).reason, /cannot recognize/);
  });

  it('rejects a SHA-shaped fragment shorter than 7 chars', () => {
    // Catch-all path — the GitHub shorthand pattern needs the slash.
    // A bare 6-char hex string falls through to "cannot recognize".
    assert.equal(isStablePin('abc12').ok, false);
  });
});
