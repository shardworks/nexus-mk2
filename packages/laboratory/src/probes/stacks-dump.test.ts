/**
 * Tests for stacks-dump probe pure helpers.
 *
 * The probe's run() and extract() are end-to-end-shaped (open the
 * test guild's SQLite DB, write to the lab guild's stacks). Those
 * paths are exercised by the codified smoke test and live trials;
 * unit tests here lock down the parsing/naming helpers that don't
 * need a running guild.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeOwnerId,
  resolveSourceBook,
  safeFileStem,
} from './stacks-dump.ts';

describe('normalizeOwnerId', () => {
  it('passes simple plugin ids through', () => {
    assert.equal(normalizeOwnerId('clerk'), 'clerk');
    assert.equal(normalizeOwnerId('animator'), 'animator');
  });

  it('replaces hyphens with underscores', () => {
    assert.equal(
      normalizeOwnerId('clockworks-stacks-signals'),
      'clockworks_stacks_signals',
    );
  });

  it('replaces forward slashes with double underscores', () => {
    assert.equal(normalizeOwnerId('shardworks/clerk'), 'shardworks__clerk');
  });
});

describe('resolveSourceBook', () => {
  it('returns null for non-books_ tables', () => {
    assert.equal(resolveSourceBook('sqlite_master', ['clerk']), null);
  });

  it('resolves a clean owner/book split when the owner matches a known plugin', () => {
    assert.equal(
      resolveSourceBook('books_clerk_writs', ['clerk', 'spider']),
      'clerk/writs',
    );
  });

  it('preserves hyphens in book names (book hyphens are not normalized)', () => {
    assert.equal(
      resolveSourceBook('books_laboratory_lab-trial-archives', ['laboratory']),
      'laboratory/lab-trial-archives',
    );
  });

  it('returns null when no plugin id is a prefix of the table name', () => {
    assert.equal(
      resolveSourceBook('books_unknownplugin_writs', ['clerk', 'spider']),
      null,
    );
  });

  it('prefers the longest matching prefix when ids are nested', () => {
    // 'clockworks' is a prefix of 'clockworks-stacks-signals' once both
    // are normalized — the longer match should win.
    assert.equal(
      resolveSourceBook('books_clockworks_stacks_signals_signals', [
        'clockworks',
        'clockworks-stacks-signals',
      ]),
      'clockworks-stacks-signals/signals',
    );
  });

  it('returns null when the prefix matches but no book name remains', () => {
    // `books_clerk_` has no book — nonsense table.
    assert.equal(resolveSourceBook('books_clerk_', ['clerk']), null);
  });
});

describe('safeFileStem', () => {
  it('replaces forward slashes with hyphens', () => {
    assert.equal(safeFileStem('clerk/writs'), 'clerk-writs');
  });

  it('preserves dots, hyphens, underscores, alphanumeric', () => {
    assert.equal(safeFileStem('foo.bar_baz-qux'), 'foo.bar_baz-qux');
  });

  it('replaces every other character with underscore', () => {
    assert.equal(safeFileStem('weird:name@with*chars'), 'weird_name_with_chars');
  });
});
