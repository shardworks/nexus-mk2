/**
 * Tests for the tolerant JSON parsing in xguild-shell.
 *
 * The cross-guild block-checkers (`lab.xguild-writ-terminal`,
 * `lab.xguild-rig-terminal`) call into `fetchWritState` / `fetchRigForWrit`
 * which shell out to the test guild's local `nsg`. Real-world stdout can
 * include trailing content after a valid JSON document (e.g. a follow-on
 * emitter inside the test guild's CLI process flushing a log line). The
 * previous behaviour rejected the whole response with a `ZodError`-shaped
 * throw that the Spider dispatch predicate's catch treated as a permanent
 * `hold-gate-pending` stall — keeping the engine alive against the
 * concurrency cap without making progress.
 *
 * The fix (`parseJsonTolerant` in `xguild-shell.ts`) parses the valid
 * JSON prefix when V8's parser reports trailing content, logs a single
 * warning to stderr so the underlying pollution is still diagnosable,
 * and returns the prefix's parsed value. This test exercises the
 * recovery path directly without spinning up an actual cross-guild
 * shellout.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { fetchWritState, fetchRigForWrit, fetchRigState } from './xguild-shell.ts';

describe('xguild-shell — tolerant JSON parsing', () => {
  let testGuildPath: string;
  let originalWarn: typeof console.warn;
  let captured: string[];

  before(() => {
    // Stand up a fake "test guild" with a stub `node_modules/.bin/nsg`
    // that emits whatever stdout the test wants.
    testGuildPath = mkdtempSync(path.join(tmpdir(), 'xguild-shell-test-'));
    mkdirSync(path.join(testGuildPath, 'node_modules', '.bin'), { recursive: true });
  });

  after(() => {
    rmSync(testGuildPath, { recursive: true, force: true });
  });

  function writeStubNsg(stdoutBody: string): void {
    const stub = path.join(testGuildPath, 'node_modules', '.bin', 'nsg');
    // Single-quote the body so embedded double quotes from JSON survive.
    const escaped = stdoutBody.replace(/'/g, "'\\''");
    writeFileSync(stub, `#!/bin/sh\nprintf '%s' '${escaped}'\n`);
    chmodSync(stub, 0o755);
  }

  function captureWarnings(): void {
    captured = [];
    originalWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      captured.push(args.map((a) => String(a)).join(' '));
    };
  }

  function restoreWarnings(): void {
    console.warn = originalWarn;
  }

  it('fetchWritState — clean single-JSON stdout parses without warning', async () => {
    writeStubNsg('{"id":"w-test","classification":"terminal","phase":"completed"}');
    captureWarnings();
    try {
      const result = await fetchWritState({
        testGuildPath,
        writId: 'w-test',
        caller: 'test-clean',
      });
      assert.equal(result.classification, 'terminal');
      assert.equal(result.phase, 'completed');
    } finally {
      restoreWarnings();
    }
    assert.equal(captured.length, 0, 'no warnings on clean parse');
  });

  it('fetchWritState — stdout with trailing garbage after JSON is tolerated', async () => {
    // Valid JSON followed by a second JSON object on a new line — the
    // exact failure pattern observed in production. The parser must
    // recover the prefix and emit a single warning.
    writeStubNsg(
      '{"id":"w-test","classification":"terminal","phase":"completed"}\n{"trailing":"garbage"}',
    );
    captureWarnings();
    try {
      const result = await fetchWritState({
        testGuildPath,
        writId: 'w-test',
        caller: 'test-tolerant',
      });
      assert.equal(result.classification, 'terminal');
    } finally {
      restoreWarnings();
    }
    const recoveryWarnings = captured.filter((line) =>
      line.includes('tolerated trailing content after JSON'),
    );
    assert.equal(recoveryWarnings.length, 1, 'exactly one recovery warning');
  });

  it('fetchWritState — stdout with arbitrary trailing log line is tolerated', async () => {
    // Trailing log noise from a follow-on emitter inside the guild's CLI process.
    writeStubNsg(
      '{"id":"w-test","phase":"open"}\n[some-plugin] background work completed\n',
    );
    captureWarnings();
    try {
      const result = await fetchWritState({
        testGuildPath,
        writId: 'w-test',
        caller: 'test-trailing-log',
      });
      assert.equal(result.phase, 'open');
    } finally {
      restoreWarnings();
    }
    const recoveryWarnings = captured.filter((line) =>
      line.includes('tolerated trailing content after JSON'),
    );
    assert.equal(recoveryWarnings.length, 1);
  });

  it('fetchRigForWrit — clean rig JSON parses without warning', async () => {
    writeStubNsg('{"id":"rig-test","writId":"w-test","status":"running"}');
    captureWarnings();
    try {
      const result = await fetchRigForWrit({
        testGuildPath,
        writId: 'w-test',
        caller: 'test-rig-clean',
      });
      assert.equal(result, 'rig-test');
    } finally {
      restoreWarnings();
    }
    assert.equal(captured.length, 0);
  });

  it('fetchRigForWrit — "null" sentinel returns null cleanly', async () => {
    writeStubNsg('null');
    captureWarnings();
    try {
      const result = await fetchRigForWrit({
        testGuildPath,
        writId: 'w-test',
        caller: 'test-rig-null',
      });
      assert.equal(result, null);
    } finally {
      restoreWarnings();
    }
    assert.equal(captured.length, 0);
  });

  it('fetchRigForWrit — trailing content after rig JSON is tolerated', async () => {
    writeStubNsg(
      '{"id":"rig-test","writId":"w-test","status":"running"}\n[daemon] crawl tick\n',
    );
    captureWarnings();
    try {
      const result = await fetchRigForWrit({
        testGuildPath,
        writId: 'w-test',
        caller: 'test-rig-tolerant',
      });
      assert.equal(result, 'rig-test');
    } finally {
      restoreWarnings();
    }
    const recoveryWarnings = captured.filter((line) =>
      line.includes('tolerated trailing content after JSON'),
    );
    assert.equal(recoveryWarnings.length, 1);
  });

  it('fetchRigState — trailing content after rig JSON is tolerated', async () => {
    writeStubNsg(
      '{"id":"rig-test","status":"running","engines":[]}\n{"unexpected":"second-doc"}',
    );
    captureWarnings();
    try {
      const result = await fetchRigState({
        testGuildPath,
        rigId: 'rig-test',
        caller: 'test-rig-state-tolerant',
      });
      assert.equal(result.status, 'running');
    } finally {
      restoreWarnings();
    }
    const recoveryWarnings = captured.filter((line) =>
      line.includes('tolerated trailing content after JSON'),
    );
    assert.equal(recoveryWarnings.length, 1);
  });

  it('fetchWritState — irrecoverably-malformed JSON still throws (no false recovery)', async () => {
    // Output that is not valid JSON at any prefix length: a closing brace
    // mid-document with no matching open. The tolerant parser must surface
    // this as an error rather than silently succeed.
    writeStubNsg('not-json-at-all');
    await assert.rejects(
      fetchWritState({
        testGuildPath,
        writId: 'w-test',
        caller: 'test-irrecoverable',
      }),
      (err: unknown) => err instanceof Error && /JSON parse failed/.test(err.message),
    );
  });
});
