import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { implement } from './implement.ts';

describe('implement SDK', () => {
  it('creates a definition with description, params schema, and handler', () => {
    const def = implement({
      description: 'Test tool',
      params: {
        name: z.string().describe('A name'),
      },
      handler: ({ name }, _ctx) => ({ greeting: `hello ${name}` }),
    });

    assert.equal(def.description, 'Test tool');
    assert.ok(def.params);
    assert.ok(def.handler);
  });

  it('params schema validates input', () => {
    const def = implement({
      description: 'Typed tool',
      params: {
        count: z.number().describe('How many'),
        label: z.string().optional().describe('Optional label'),
      },
      handler: ({ count, label }, _ctx) => ({ count, label }),
    });

    // Valid input
    const parsed = def.params.parse({ count: 5 });
    assert.equal(parsed.count, 5);
    assert.equal(parsed.label, undefined);

    // Valid with optional
    const parsed2 = def.params.parse({ count: 3, label: 'test' });
    assert.equal(parsed2.label, 'test');

    // Invalid input
    assert.throws(() => def.params.parse({ count: 'not a number' }));
    assert.throws(() => def.params.parse({}));
  });

  it('handler receives validated params and context', async () => {
    const def = implement({
      description: 'Context test',
      params: {
        source: z.string(),
      },
      handler: ({ source }, { home }) => ({ source, home }),
    });

    const result = await def.handler({ source: '/path/to/tool' }, { home: '/nexus' });
    assert.deepEqual(result, { source: '/path/to/tool', home: '/nexus' });
  });

  it('supports async handlers', async () => {
    const def = implement({
      description: 'Async tool',
      params: {
        ms: z.number(),
      },
      handler: async ({ ms }) => {
        await new Promise((r) => setTimeout(r, ms));
        return { waited: ms };
      },
    });

    const result = await def.handler({ ms: 1 }, { home: '/tmp' });
    assert.deepEqual(result, { waited: 1 });
  });

  it('exposes param shape for MCP registration', () => {
    const def = implement({
      description: 'Shape test',
      params: {
        name: z.string().describe('Tool name'),
        slot: z.string().optional().describe('Version slot'),
      },
      handler: () => ({}),
    });

    // The MCP engine uses .params.shape to register tool input schemas
    const shape = def.params.shape;
    assert.ok(shape.name);
    assert.ok(shape.slot);
  });
});
