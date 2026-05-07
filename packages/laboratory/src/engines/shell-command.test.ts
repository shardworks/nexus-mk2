/**
 * Tests for lab.shell-command.
 *
 * Validation tests run against a synthesized EngineRunContext shape.
 * Behavioural tests run real bash subprocesses against a tmp dir.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { shellCommandEngine } from './shell-command.ts';
import type { EngineRunContext } from '@shardworks/fabricator-apparatus';

const ctx: EngineRunContext = { engineId: 'lab.shell-command', upstream: {} };

describe('lab.shell-command', () => {
  describe('validation', () => {
    it('rejects missing command', async () => {
      await assert.rejects(
        () => shellCommandEngine.run({ cwd: '/tmp' }, ctx),
        /command must be a non-empty string/,
      );
    });

    it('rejects empty command', async () => {
      await assert.rejects(
        () => shellCommandEngine.run({ command: '   ', cwd: '/tmp' }, ctx),
        /command must be a non-empty string/,
      );
    });

    it('rejects non-string command', async () => {
      await assert.rejects(
        () => shellCommandEngine.run({ command: 42, cwd: '/tmp' }, ctx),
        /command must be a non-empty string/,
      );
    });

    it('rejects missing cwd', async () => {
      await assert.rejects(
        () => shellCommandEngine.run({ command: 'true' }, ctx),
        /cwd must be an absolute path/,
      );
    });

    it('rejects relative cwd', async () => {
      await assert.rejects(
        () => shellCommandEngine.run({ command: 'true', cwd: 'relative/dir' }, ctx),
        /cwd must be an absolute path/,
      );
    });

    it('rejects non-positive timeoutMs', async () => {
      await assert.rejects(
        () => shellCommandEngine.run({ command: 'true', cwd: '/tmp', timeoutMs: 0 }, ctx),
        /timeoutMs must be a positive finite number/,
      );
    });

    it('rejects negative timeoutMs', async () => {
      await assert.rejects(
        () => shellCommandEngine.run({ command: 'true', cwd: '/tmp', timeoutMs: -1 }, ctx),
        /timeoutMs must be a positive finite number/,
      );
    });
  });

  describe('execution', () => {
    it('captures exit 0 from a successful command', async () => {
      const dir = await mkdtemp(path.join(tmpdir(), 'lab-shell-'));
      try {
        const result = await shellCommandEngine.run(
          { command: 'echo hello', cwd: dir },
          ctx,
        );
        assert.equal(result.status, 'completed');
        const yields = (result as { yields: Record<string, unknown> }).yields;
        assert.equal(yields.exitCode, 0);
        assert.equal((yields.stdout as string).trim(), 'hello');
        assert.equal((yields.stderr as string).trim(), '');
        assert.equal(yields.timedOut, false);
        assert.ok(typeof yields.durationMs === 'number');
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });

    it('captures exit non-zero from a failing command', async () => {
      const dir = await mkdtemp(path.join(tmpdir(), 'lab-shell-'));
      try {
        const result = await shellCommandEngine.run(
          { command: 'echo to-stderr 1>&2; exit 7', cwd: dir },
          ctx,
        );
        const yields = (result as { yields: Record<string, unknown> }).yields;
        assert.equal(yields.exitCode, 7);
        assert.equal((yields.stderr as string).trim(), 'to-stderr');
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });

    it('runs in the supplied cwd', async () => {
      const dir = await mkdtemp(path.join(tmpdir(), 'lab-shell-'));
      try {
        const result = await shellCommandEngine.run(
          { command: 'pwd', cwd: dir },
          ctx,
        );
        const yields = (result as { yields: Record<string, unknown> }).yields;
        assert.equal((yields.stdout as string).trim(), dir);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });

    it('respects timeoutMs and reports timedOut=true', async () => {
      const dir = await mkdtemp(path.join(tmpdir(), 'lab-shell-'));
      try {
        const result = await shellCommandEngine.run(
          { command: 'sleep 5', cwd: dir, timeoutMs: 200 },
          ctx,
        );
        const yields = (result as { yields: Record<string, unknown> }).yields;
        assert.equal(yields.timedOut, true);
        // exit code is non-zero (signal-killed) — exact value is platform-dependent
        assert.notEqual(yields.exitCode, 0);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });
  });
});
