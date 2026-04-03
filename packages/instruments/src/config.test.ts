import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { loadConfig, validateParams } from './config.ts';

// Use the actual spec-blind-quality-scorer instrument definition as a test fixture
const BLIND_V1_DIR = join(
  import.meta.dirname,
  '../../../experiments/instruments/spec-blind-quality-scorer/v1',
);

describe('loadConfig', () => {
  it('loads and validates spec-blind-quality-scorer/v1 instrument.yaml', () => {
    const config = loadConfig(BLIND_V1_DIR);

    assert.equal(config.name, 'spec-blind-quality-scorer');
    assert.equal(config.version, 'v1');
    assert.equal(config.execution.model, 'claude-opus-4-6');
    assert.equal(config.execution.runs, 3);
    assert.equal(config.execution.min_successful_runs, 2);
    assert.equal(config.parameters.commission.required, true);
    assert.equal(config.parameters.repo.required, true);
    assert.equal(config.parameters.base_commit.required, false);
    assert.equal(config.setup, 'extractors/resolve-commits.sh');
    assert.equal(Object.keys(config.inputs).length, 4);
    assert.equal(config.inputs.DIFF.extractor, 'extractors/diff.sh');
    assert.equal(config.output.dimensions.length, 4);
    assert.equal(config.output.dimensions[0].name, 'test_quality');
    assert.deepEqual(config.output.dimensions[0].range, [1, 3]);
    assert.equal(config.output.composite.method, 'mean');
    assert.equal(config.output.composite.dimensions, 'all');
  });

  it('throws on missing config file', () => {
    assert.throws(() => loadConfig('/nonexistent/path'), /Cannot read instrument config/);
  });
});

describe('validateParams', () => {
  it('passes with all required params', () => {
    const config = loadConfig(BLIND_V1_DIR);
    // Should not throw
    validateParams(config, { commission: 'w-test', repo: '/tmp' });
  });

  it('throws on missing required param', () => {
    const config = loadConfig(BLIND_V1_DIR);
    assert.throws(() => validateParams(config, { commission: 'w-test' }), /Missing required parameter 'repo'/);
  });

  it('allows missing optional params', () => {
    const config = loadConfig(BLIND_V1_DIR);
    // base_commit and commit are optional — should not throw
    validateParams(config, { commission: 'w-test', repo: '/tmp' });
  });
});
