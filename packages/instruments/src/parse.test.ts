import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseRun } from './parse.ts';
import type { OutputSchema } from './types.ts';

const blindSchema: OutputSchema = {
  format: 'yaml',
  dimensions: [
    { name: 'test_quality', type: 'integer', range: [1, 3] },
    { name: 'code_structure', type: 'integer', range: [1, 3] },
    { name: 'error_handling', type: 'integer', range: [1, 3] },
    { name: 'codebase_consistency', type: 'integer', range: [1, 3] },
  ],
  qualitative: [{ name: 'notes', type: 'block_scalar' }],
  composite: { method: 'mean', dimensions: 'all' },
};

describe('parseRun', () => {
  it('parses a valid YAML response with code fence', () => {
    const response = `\`\`\`yaml
dimensions:
  test_quality: 2
  code_structure: 3
  error_handling: 2
  codebase_consistency: 3
composite: 2.5
notes: |
  Good structure, adequate tests.
\`\`\``;

    const result = parseRun(response, blindSchema);
    assert.ok(result);
    assert.equal(result.dimensions.test_quality, 2);
    assert.equal(result.dimensions.code_structure, 3);
    assert.equal(result.dimensions.error_handling, 2);
    assert.equal(result.dimensions.codebase_consistency, 3);
    assert.equal(result.composite, 2.5);
    assert.ok(result.qualitative.notes.includes('Good structure'));
  });

  it('parses raw YAML without code fence', () => {
    const response = `dimensions:
  test_quality: 1
  code_structure: 2
  error_handling: 2
  codebase_consistency: 2
notes: |
  Missing tests.`;

    const result = parseRun(response, blindSchema);
    assert.ok(result);
    assert.equal(result.dimensions.test_quality, 1);
    assert.equal(result.composite, 1.75);
  });

  it('returns null for out-of-range values', () => {
    const response = `dimensions:
  test_quality: 5
  code_structure: 2
  error_handling: 2
  codebase_consistency: 2`;

    const result = parseRun(response, blindSchema);
    assert.equal(result, null);
  });

  it('returns null for missing dimensions', () => {
    const response = `dimensions:
  test_quality: 2
  code_structure: 3`;

    const result = parseRun(response, blindSchema);
    assert.equal(result, null);
  });

  it('returns null for unparseable response', () => {
    const result = parseRun('This is not YAML at all', blindSchema);
    assert.equal(result, null);
  });

  it('returns null for non-integer values', () => {
    const response = `dimensions:
  test_quality: 2.5
  code_structure: 3
  error_handling: 2
  codebase_consistency: 3`;

    const result = parseRun(response, blindSchema);
    assert.equal(result, null);
  });

  it('works with 5-point scale', () => {
    const fivePointSchema: OutputSchema = {
      ...blindSchema,
      dimensions: blindSchema.dimensions.map((d) => ({ ...d, range: [1, 5] as [number, number] })),
    };

    const response = `dimensions:
  test_quality: 4
  code_structure: 5
  error_handling: 3
  codebase_consistency: 4
notes: Strong work.`;

    const result = parseRun(response, fivePointSchema);
    assert.ok(result);
    assert.equal(result.dimensions.test_quality, 4);
    assert.equal(result.composite, 4);
  });
});
