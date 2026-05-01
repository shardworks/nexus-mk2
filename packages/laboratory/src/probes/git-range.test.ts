/**
 * Tests for git-range probe pure helpers.
 *
 * The probe's run() exercises real git plumbing (rev-list, show
 * --shortstat, etc.) and is covered end-to-end by the codified smoke
 * test. Unit tests here pin the discovery + parsing helpers.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  discoverCodexFixtures,
  parseShortStat,
  patchFileName,
} from './git-range.ts';

describe('discoverCodexFixtures', () => {
  it('returns empty when upstream has no codex-shaped yields', () => {
    assert.deepEqual(discoverCodexFixtures({}), []);
  });

  it('finds a single fixture from a codex-fixture-shaped yield', () => {
    const upstream = {
      'fixture-codex-setup': {
        codexName: 'demo',
        bareLocalPath: '/tmp/foo.git',
        baseSha: 'a'.repeat(40),
      },
    };
    assert.deepEqual(discoverCodexFixtures(upstream), [
      { codexName: 'demo', bareLocalPath: '/tmp/foo.git', baseSha: 'a'.repeat(40) },
    ]);
  });

  it('finds multiple fixtures', () => {
    const upstream = {
      a: { codexName: 'one', bareLocalPath: '/tmp/a.git', baseSha: 'a'.repeat(40) },
      b: { codexName: 'two', bareLocalPath: '/tmp/b.git', baseSha: 'b'.repeat(40) },
    };
    assert.equal(discoverCodexFixtures(upstream).length, 2);
  });

  it('ignores yields missing any of the three required fields', () => {
    const upstream = {
      partial: { codexName: 'x', bareLocalPath: '/tmp/x.git' /* baseSha missing */ },
      partial2: { codexName: 'y', baseSha: 'a'.repeat(40) /* path missing */ },
      partial3: { bareLocalPath: '/tmp/z.git', baseSha: 'a'.repeat(40) /* name missing */ },
      good: { codexName: 'g', bareLocalPath: '/tmp/g.git', baseSha: 'a'.repeat(40) },
    };
    const result = discoverCodexFixtures(upstream);
    assert.equal(result.length, 1);
    assert.equal(result[0]!.codexName, 'g');
  });

  it('ignores arrays and primitive yields', () => {
    const upstream = {
      arr: [{ codexName: 'x', bareLocalPath: '/tmp/x.git', baseSha: 'a'.repeat(40) }],
      str: 'hello',
      num: 42,
    };
    assert.deepEqual(discoverCodexFixtures(upstream), []);
  });
});

describe('parseShortStat', () => {
  it('parses a typical line', () => {
    assert.deepEqual(
      parseShortStat(' 3 files changed, 12 insertions(+), 4 deletions(-)'),
      { filesChanged: 3, insertions: 12, deletions: 4 },
    );
  });

  it('handles singular (1 file changed, 1 insertion(+))', () => {
    assert.deepEqual(
      parseShortStat(' 1 file changed, 1 insertion(+)'),
      { filesChanged: 1, insertions: 1, deletions: 0 },
    );
  });

  it('handles deletions-only', () => {
    assert.deepEqual(
      parseShortStat(' 2 files changed, 5 deletions(-)'),
      { filesChanged: 2, insertions: 0, deletions: 5 },
    );
  });

  it('returns zero counts for an empty line', () => {
    assert.deepEqual(parseShortStat(''), {
      filesChanged: 0,
      insertions: 0,
      deletions: 0,
    });
  });
});

describe('patchFileName', () => {
  it('zero-pads the sequence to four digits', () => {
    assert.equal(patchFileName(0, 'a'.repeat(40)), '0000-aaaaaaaaaaaa.patch');
    assert.equal(patchFileName(7, 'b'.repeat(40)), '0007-bbbbbbbbbbbb.patch');
    assert.equal(patchFileName(123, 'c'.repeat(40)), '0123-cccccccccccc.patch');
  });

  it('truncates the sha to 12 chars', () => {
    const sha = '0123456789abcdef0123456789abcdef01234567';
    assert.equal(patchFileName(0, sha), '0000-0123456789ab.patch');
  });

  it('does not pad sequences already 4+ digits', () => {
    assert.equal(patchFileName(9999, 'a'.repeat(40)), '9999-aaaaaaaaaaaa.patch');
    assert.equal(patchFileName(12345, 'a'.repeat(40)), '12345-aaaaaaaaaaaa.patch');
  });
});
