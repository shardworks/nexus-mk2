import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { resolveInstrumentDir } from './resolve.ts';

const INSTRUMENTS_ROOT = join(
  import.meta.dirname,
  '../../../experiments/instruments',
);

describe('resolveInstrumentDir', () => {
  it('resolves explicit path', () => {
    const dir = join(INSTRUMENTS_ROOT, 'spec-blind-quality-scorer/v1');
    const result = resolveInstrumentDir({ instrument: dir });
    assert.equal(result, dir);
  });

  it('throws on explicit path without instrument.yaml', () => {
    assert.throws(
      () => resolveInstrumentDir({ instrument: '/tmp' }),
      /No instrument\.yaml found/,
    );
  });

  it('resolves name + version', () => {
    const result = resolveInstrumentDir({
      instrumentRoot: INSTRUMENTS_ROOT,
      instrumentName: 'spec-blind-quality-scorer',
      instrumentVersion: 'v1',
    });
    assert.equal(result, join(INSTRUMENTS_ROOT, 'spec-blind-quality-scorer/v1'));
  });

  it('auto-selects latest version when multiple exist', () => {
    const result = resolveInstrumentDir({
      instrumentRoot: INSTRUMENTS_ROOT,
      instrumentName: 'spec-blind-quality-scorer',
      // no version — should auto-select v2 (latest)
    });
    assert.equal(result, join(INSTRUMENTS_ROOT, 'spec-blind-quality-scorer/v2'));
  });

  it('throws on unknown instrument name', () => {
    assert.throws(
      () =>
        resolveInstrumentDir({
          instrumentRoot: INSTRUMENTS_ROOT,
          instrumentName: 'nonexistent',
        }),
      /not found/,
    );
  });

  it('throws on unknown version', () => {
    assert.throws(
      () =>
        resolveInstrumentDir({
          instrumentRoot: INSTRUMENTS_ROOT,
          instrumentName: 'spec-blind-quality-scorer',
          instrumentVersion: 'v99',
        }),
      /Version 'v99' not found/,
    );
  });

  it('throws when no name or path provided', () => {
    assert.throws(
      () => resolveInstrumentDir({}),
      /Either --instrument.*or --instrument-name.*is required/,
    );
  });
});
