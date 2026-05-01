/**
 * Tests for the probe-extraction type-guard contract.
 *
 * The extraction-dispatch design (c-momkil4p) replaced a separate
 * probe registry with a structural subtype + type guard over the
 * Fabricator's existing engine registry. These tests pin the type
 * guard's behavior so the trial-extract tool's dispatch stays robust.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { EngineDesign } from '@shardworks/fabricator-apparatus';

import { isProbeEngineDesign } from './types.ts';

describe('isProbeEngineDesign', () => {
  it('returns false for a plain EngineDesign without extract()', () => {
    const design: EngineDesign = {
      id: 'plain',
      async run() {
        return { status: 'completed', yields: {} };
      },
    };
    assert.equal(isProbeEngineDesign(design), false);
  });

  it('returns true when extract() is present and is a function', () => {
    const design: EngineDesign = {
      id: 'with-extract',
      async run() {
        return { status: 'completed', yields: {} };
      },
      // Extra property — structurally a ProbeEngineDesign.
      extract: async () => ({ files: [] }),
    } as EngineDesign & { extract: () => Promise<{ files: [] }> };
    assert.equal(isProbeEngineDesign(design), true);
  });

  it('returns false when extract is present but not a function (defensive)', () => {
    const design: EngineDesign = {
      id: 'busted',
      async run() {
        return { status: 'completed', yields: {} };
      },
      extract: 'not a function',
    } as unknown as EngineDesign;
    assert.equal(isProbeEngineDesign(design), false);
  });
});
