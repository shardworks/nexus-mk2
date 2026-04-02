import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveConfig } from './laboratory.ts';
import type { LaboratoryConfig } from './types.ts';

describe('resolveConfig', () => {
  it('defaults paths relative to sanctumHome', () => {
    const raw: LaboratoryConfig = { sanctumHome: '/workspace/nexus-mk2' };
    const config = resolveConfig(raw);

    assert.equal(config.sanctumHome, '/workspace/nexus-mk2');
    assert.equal(config.commissionsDataDir, '/workspace/nexus-mk2/experiments/data/commissions');
    assert.equal(config.commissionLogPath, '/workspace/nexus-mk2/experiments/data/commission-log.yaml');
  });

  it('resolves explicit relative paths against sanctumHome', () => {
    const raw: LaboratoryConfig = {
      sanctumHome: '/workspace/nexus-mk2',
      commissionsDataDir: 'custom/data',
      commissionLogPath: 'custom/log.yaml',
    };
    const config = resolveConfig(raw);

    assert.equal(config.commissionsDataDir, '/workspace/nexus-mk2/custom/data');
    assert.equal(config.commissionLogPath, '/workspace/nexus-mk2/custom/log.yaml');
  });

  it('preserves absolute explicit paths', () => {
    const raw: LaboratoryConfig = {
      sanctumHome: '/workspace/nexus-mk2',
      commissionsDataDir: '/absolute/data',
      commissionLogPath: '/absolute/log.yaml',
    };
    const config = resolveConfig(raw);

    assert.equal(config.commissionsDataDir, '/absolute/data');
    assert.equal(config.commissionLogPath, '/absolute/log.yaml');
  });
});
