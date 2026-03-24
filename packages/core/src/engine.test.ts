import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { engine, isClockworkEngine } from './engine.ts';

describe('engine SDK', () => {
  it('creates a definition with __clockwork brand and handler', () => {
    const def = engine({
      handler: async () => {},
    });

    assert.equal(def.__clockwork, true);
    assert.equal(typeof def.handler, 'function');
  });

  it('handler receives event and context', async () => {
    let receivedEvent: unknown;
    let receivedCtx: unknown;

    const def = engine({
      handler: async (event, ctx) => {
        receivedEvent = event;
        receivedCtx = ctx;
      },
    });

    const testEvent = {
      id: 1,
      name: 'test.event',
      payload: { key: 'value' },
      emitter: 'test',
      firedAt: '2026-03-24T00:00:00Z',
    };

    await def.handler(testEvent, { home: '/tmp/test' });
    assert.deepEqual(receivedEvent, testEvent);
    assert.deepEqual(receivedCtx, { home: '/tmp/test' });
  });

  it('handler accepts null event for direct invocation', async () => {
    let receivedEvent: unknown = 'sentinel';

    const def = engine({
      handler: async (event) => {
        receivedEvent = event;
      },
    });

    await def.handler(null, { home: '/tmp/test' });
    assert.equal(receivedEvent, null);
  });
});

describe('isClockworkEngine', () => {
  it('returns true for engine() output', () => {
    const def = engine({ handler: async () => {} });
    assert.equal(isClockworkEngine(def), true);
  });

  it('returns false for plain objects', () => {
    assert.equal(isClockworkEngine({}), false);
    assert.equal(isClockworkEngine({ handler: async () => {} }), false);
    assert.equal(isClockworkEngine(null), false);
    assert.equal(isClockworkEngine(undefined), false);
    assert.equal(isClockworkEngine('string'), false);
  });

  it('returns false for objects with wrong __clockwork value', () => {
    assert.equal(isClockworkEngine({ __clockwork: false, handler: async () => {} }), false);
  });
});
