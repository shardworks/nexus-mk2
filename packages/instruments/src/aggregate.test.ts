import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { aggregate } from './aggregate.ts';
import type { ParsedRun, DimensionDef } from './types.ts';

const dims: DimensionDef[] = [
  { name: 'test_quality', type: 'integer', range: [1, 3] },
  { name: 'code_structure', type: 'integer', range: [1, 3] },
];

function makeRun(tq: number, cs: number): ParsedRun {
  const composite = (tq + cs) / 2;
  return {
    dimensions: { test_quality: tq, code_structure: cs },
    qualitative: { notes: '' },
    composite,
  };
}

describe('aggregate', () => {
  it('computes mean and sd for identical runs', () => {
    const runs = [makeRun(2, 3), makeRun(2, 3), makeRun(2, 3)];
    const result = aggregate(runs, dims);

    assert.equal(result.dimensions.test_quality.mean, 2);
    assert.equal(result.dimensions.test_quality.sd, 0);
    assert.equal(result.dimensions.code_structure.mean, 3);
    assert.equal(result.composite, 2.5);
    assert.equal(result.composite_sd, 0);
    assert.equal(result.n, 3);
  });

  it('computes correct sd for varying runs', () => {
    const runs = [makeRun(1, 3), makeRun(2, 3), makeRun(3, 3)];
    const result = aggregate(runs, dims);

    assert.equal(result.dimensions.test_quality.mean, 2);
    assert.equal(result.dimensions.test_quality.sd, 0.82); // population SD
    assert.equal(result.dimensions.code_structure.mean, 3);
    assert.equal(result.dimensions.code_structure.sd, 0);
  });

  it('flags high variance dimensions', () => {
    const runs = [makeRun(1, 3), makeRun(3, 3)];
    const result = aggregate(runs, dims);

    assert.ok(result.high_variance.includes('test_quality'));
    assert.ok(!result.high_variance.includes('code_structure'));
  });

  it('throws on zero runs', () => {
    assert.throws(() => aggregate([], dims), /Cannot aggregate zero runs/);
  });

  it('handles single run', () => {
    const runs = [makeRun(2, 3)];
    const result = aggregate(runs, dims);

    assert.equal(result.dimensions.test_quality.mean, 2);
    assert.equal(result.dimensions.test_quality.sd, 0);
    assert.equal(result.n, 1);
  });
});
