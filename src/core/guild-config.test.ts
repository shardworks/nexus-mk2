import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialGuildConfig } from './guild-config.ts';
import type { GuildConfig } from './guild-config.ts';

describe('createInitialGuildConfig', () => {
  it('returns a valid config with the given version and model', () => {
    const config: GuildConfig = createInitialGuildConfig('0.1.0', 'claude-sonnet-4-20250514');
    assert.equal(config.nexus, '0.1.0');
    assert.equal(config.model, 'claude-sonnet-4-20250514');
  });

  it('has empty registries', () => {
    const config = createInitialGuildConfig('0.1.0', 'test-model');
    assert.deepEqual(config.workshops, []);
    assert.deepEqual(config.implements, {});
    assert.deepEqual(config.engines, {});
    assert.deepEqual(config.curricula, {});
    assert.deepEqual(config.temperaments, {});
  });
});
