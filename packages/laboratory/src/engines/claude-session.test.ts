/**
 * Tests for lab.claude-session.
 *
 * The engine's run() depends on the Animator apparatus and a real claude
 * binary, so we don't smoke-test it end-to-end here. Coverage focuses on:
 *   - givens validation (the engine fails loud on bad config)
 *   - parseReviewOutput (the output-contract parser, used by collect())
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { claudeSessionEngine, parseReviewOutput } from './claude-session.ts';
import type { EngineRunContext } from '@shardworks/fabricator-apparatus';

const ctx: EngineRunContext = { engineId: 'implement', upstream: {} };
const writ = { id: 'w-test-abc' } as Parameters<typeof claudeSessionEngine.run>[0]['writ'];

describe('lab.claude-session — validation', () => {
  it('rejects missing rolePath', async () => {
    await assert.rejects(
      () => claudeSessionEngine.run({ briefPath: '/abs/brief.md', model: 'opus', cwd: '/abs/cwd', writ }, ctx),
      /rolePath must be an absolute path/,
    );
  });

  it('rejects relative rolePath', async () => {
    await assert.rejects(
      () => claudeSessionEngine.run({ rolePath: 'rel/role.md', briefPath: '/abs/b.md', model: 'opus', cwd: '/abs/cwd', writ }, ctx),
      /rolePath must be an absolute path/,
    );
  });

  it('rejects when both briefPath and promptTemplate are missing', async () => {
    await assert.rejects(
      () => claudeSessionEngine.run({ rolePath: '/abs/r.md', model: 'opus', cwd: '/abs/cwd', writ }, ctx),
      /one of givens.briefPath or givens.promptTemplate is required/,
    );
  });

  it('rejects relative briefPath', async () => {
    await assert.rejects(
      () => claudeSessionEngine.run({ rolePath: '/abs/r.md', briefPath: 'rel/b.md', model: 'opus', cwd: '/abs/cwd', writ }, ctx),
      /briefPath must be an absolute path when provided/,
    );
  });

  it('rejects non-string promptTemplate', async () => {
    await assert.rejects(
      () => claudeSessionEngine.run({ rolePath: '/abs/r.md', promptTemplate: 42, model: 'opus', cwd: '/abs/cwd', writ }, ctx),
      /promptTemplate must be a string when provided/,
    );
  });

  it('rejects missing model', async () => {
    await assert.rejects(
      () => claudeSessionEngine.run({ rolePath: '/abs/r.md', briefPath: '/abs/b.md', cwd: '/abs/cwd', writ }, ctx),
      /model must be a non-empty string/,
    );
  });

  it('rejects empty model', async () => {
    await assert.rejects(
      () => claudeSessionEngine.run({ rolePath: '/abs/r.md', briefPath: '/abs/b.md', model: '   ', cwd: '/abs/cwd', writ }, ctx),
      /model must be a non-empty string/,
    );
  });

  it('rejects relative cwd', async () => {
    await assert.rejects(
      () => claudeSessionEngine.run({ rolePath: '/abs/r.md', briefPath: '/abs/b.md', model: 'opus', cwd: 'rel/cwd', writ }, ctx),
      /cwd must be an absolute path/,
    );
  });

  it('rejects bad executionWrap', async () => {
    await assert.rejects(
      () => claudeSessionEngine.run({ rolePath: '/abs/r.md', briefPath: '/abs/b.md', model: 'opus', cwd: '/abs/cwd', executionWrap: 'fancy', writ }, ctx),
      /executionWrap must be 'production' or 'bare'/,
    );
  });

  it('rejects bad outputContract', async () => {
    await assert.rejects(
      () => claudeSessionEngine.run({ rolePath: '/abs/r.md', briefPath: '/abs/b.md', model: 'opus', cwd: '/abs/cwd', outputContract: 'made-up', writ }, ctx),
      /outputContract must be 'review-pass-concerns' or omitted/,
    );
  });

  it('rejects array environment', async () => {
    await assert.rejects(
      () => claudeSessionEngine.run({ rolePath: '/abs/r.md', briefPath: '/abs/b.md', model: 'opus', cwd: '/abs/cwd', environment: ['no'], writ }, ctx),
      /environment must be a plain object/,
    );
  });

  it('rejects missing writ', async () => {
    await assert.rejects(
      () => claudeSessionEngine.run({ rolePath: '/abs/r.md', briefPath: '/abs/b.md', model: 'opus', cwd: '/abs/cwd' }, ctx),
      /writ must be the trial WritDoc/,
    );
  });

  it('rejects writ without .id', async () => {
    await assert.rejects(
      () => claudeSessionEngine.run({ rolePath: '/abs/r.md', briefPath: '/abs/b.md', model: 'opus', cwd: '/abs/cwd', writ: { type: 'mandate' } }, ctx),
      /writ must be the trial WritDoc/,
    );
  });
});

describe('parseReviewOutput', () => {
  it('detects PASS at the start', () => {
    const r = parseReviewOutput('REVIEW: PASS\n\nLooks good.');
    assert.deepEqual(r, { passed: true, concerns: '' });
  });

  it('detects PASS case-insensitively', () => {
    const r = parseReviewOutput('review: pass');
    assert.equal(r.passed, true);
  });

  it('detects PASS with surrounding whitespace lines', () => {
    const r = parseReviewOutput('\n\n   \nREVIEW: PASS\n');
    assert.equal(r.passed, true);
  });

  it('detects CONCERNS and extracts body', () => {
    const r = parseReviewOutput('REVIEW: CONCERNS\n\n1. Issue A\n2. Issue B');
    assert.equal(r.passed, false);
    assert.match(r.concerns, /Issue A/);
    assert.match(r.concerns, /Issue B/);
  });

  it('CONCERNS body is trimmed', () => {
    const r = parseReviewOutput('REVIEW: CONCERNS\n\n   Body   \n\n');
    assert.equal(r.concerns, 'Body');
  });

  it('treats unparseable as concerns + full body', () => {
    const text = 'Just some text that does not match the contract.';
    const r = parseReviewOutput(text);
    assert.equal(r.passed, false);
    assert.equal(r.concerns, text);
  });

  it('treats empty as not-passed with empty concerns', () => {
    const r = parseReviewOutput('');
    assert.deepEqual(r, { passed: false, concerns: '' });
  });

  it('treats whitespace-only as not-passed with empty concerns', () => {
    const r = parseReviewOutput('   \n\n   \n');
    assert.deepEqual(r, { passed: false, concerns: '' });
  });

  it('does not match PASS in the middle of the output', () => {
    const r = parseReviewOutput('Some preamble.\nREVIEW: PASS');
    // First non-empty line is "Some preamble.", which doesn't match PASS,
    // so the output is treated as concerns.
    assert.equal(r.passed, false);
  });
});
