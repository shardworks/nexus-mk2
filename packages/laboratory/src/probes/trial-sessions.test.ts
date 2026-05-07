/**
 * Tests for lab.probe-trial-sessions.
 *
 * The probe's run() and extract() depend on the Stacks apparatus being
 * available via guild(); we don't run the full guild bootstrap here.
 * Coverage focuses on:
 *   - givens validation (the probe fails loud on missing trialId)
 *   - the design carries an extract() handler (probe contract)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { trialSessionsEngine } from './trial-sessions.ts';
import { isProbeEngineDesign } from './types.ts';
import type { EngineRunContext } from '@shardworks/fabricator-apparatus';

const ctx: EngineRunContext = { engineId: 'probe-sessions', upstream: {} };

describe('lab.probe-trial-sessions', () => {
  it('exposes the canonical engine id', () => {
    assert.equal(trialSessionsEngine.id, 'lab.probe-trial-sessions');
  });

  it('satisfies the ProbeEngineDesign contract (has extract())', () => {
    assert.equal(isProbeEngineDesign(trialSessionsEngine), true);
  });

  it('rejects when no trialId is given and no _trial is injected', async () => {
    await assert.rejects(
      () => trialSessionsEngine.run({}, ctx),
      /trialId is required/,
    );
  });

  it('rejects when _trial is injected without writId', async () => {
    await assert.rejects(
      () => trialSessionsEngine.run({ _trial: {} }, ctx),
      /trialId is required/,
    );
  });

  it('rejects when trialId is non-string', async () => {
    await assert.rejects(
      () => trialSessionsEngine.run({ trialId: 42 }, ctx),
      /trialId is required/,
    );
  });
});
