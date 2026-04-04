import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  appendCommissionLogEntry,
  markRevisionRequired,
  writeCommissionMd,
  writeReviewTemplate,
  writeSessionRecord,
} from './yaml-writer.ts';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lab-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('appendCommissionLogEntry', () => {
  it('appends a skeleton entry to the log file', () => {
    const logPath = path.join(tmpDir, 'commission-log.yaml');
    fs.writeFileSync(logPath, 'commissions:\n');

    appendCommissionLogEntry(logPath, {
      id: 'w-abc123',
      title: 'Test Commission',
      codex: 'nexus',
    });

    const content = fs.readFileSync(logPath, 'utf-8');
    assert.ok(content.includes('id: w-abc123'));
    assert.ok(content.includes('title: "Test Commission"'));
    assert.ok(content.includes('codex: nexus'));
    assert.ok(content.includes('complexity: null'));
    assert.ok(content.includes('outcome: null'));
  });

  it('escapes double quotes in titles', () => {
    const logPath = path.join(tmpDir, 'commission-log.yaml');
    fs.writeFileSync(logPath, 'commissions:\n');

    appendCommissionLogEntry(logPath, {
      id: 'w-abc123',
      title: 'Fix "broken" thing',
    });

    const content = fs.readFileSync(logPath, 'utf-8');
    assert.ok(content.includes('title: "Fix \\"broken\\" thing"'));
  });

  it('writes codex: null when no codex provided', () => {
    const logPath = path.join(tmpDir, 'commission-log.yaml');
    fs.writeFileSync(logPath, 'commissions:\n');

    appendCommissionLogEntry(logPath, {
      id: 'w-abc123',
      title: 'No codex',
    });

    const content = fs.readFileSync(logPath, 'utf-8');
    assert.ok(content.includes('codex: null'));
  });

  it('preserves existing file content and comments', () => {
    const logPath = path.join(tmpDir, 'commission-log.yaml');
    const header = '# This is a comment\n\ncommissions:\n  - id: w-existing\n    title: "Old"\n';
    fs.writeFileSync(logPath, header);

    appendCommissionLogEntry(logPath, {
      id: 'w-new',
      title: 'New',
      codex: 'nexus',
    });

    const content = fs.readFileSync(logPath, 'utf-8');
    assert.ok(content.startsWith('# This is a comment'));
    assert.ok(content.includes('id: w-existing'));
    assert.ok(content.includes('id: w-new'));
  });
});

describe('markRevisionRequired', () => {
  it('sets revision_required from null to true', () => {
    const logPath = path.join(tmpDir, 'commission-log.yaml');
    fs.writeFileSync(logPath, [
      'commissions:',
      '  - id: w-abc123',
      '    title: "Test"',
      '    codex: nexus',
      '    complexity: 3',
      '    spec_quality_pre: strong',
      '    outcome: partial',
      '    revision_required: null',
      '    spec_quality_post: null',
      '',
    ].join('\n'));

    const result = markRevisionRequired(logPath, 'w-abc123');
    assert.equal(result, true);

    const content = fs.readFileSync(logPath, 'utf-8');
    assert.ok(content.includes('revision_required: true'));
    assert.ok(!content.includes('revision_required: null'));
  });

  it('sets revision_required from false to true', () => {
    const logPath = path.join(tmpDir, 'commission-log.yaml');
    fs.writeFileSync(logPath, [
      'commissions:',
      '  - id: w-abc123',
      '    title: "Test"',
      '    codex: nexus',
      '    revision_required: false',
      '',
    ].join('\n'));

    const result = markRevisionRequired(logPath, 'w-abc123');
    assert.equal(result, true);

    const content = fs.readFileSync(logPath, 'utf-8');
    assert.ok(content.includes('revision_required: true'));
  });

  it('returns false when entry not found', () => {
    const logPath = path.join(tmpDir, 'commission-log.yaml');
    fs.writeFileSync(logPath, [
      'commissions:',
      '  - id: w-other',
      '    title: "Other"',
      '    revision_required: null',
      '',
    ].join('\n'));

    const result = markRevisionRequired(logPath, 'w-nonexistent');
    assert.equal(result, false);
  });

  it('returns false when already true', () => {
    const logPath = path.join(tmpDir, 'commission-log.yaml');
    fs.writeFileSync(logPath, [
      'commissions:',
      '  - id: w-abc123',
      '    title: "Test"',
      '    revision_required: true',
      '',
    ].join('\n'));

    const result = markRevisionRequired(logPath, 'w-abc123');
    assert.equal(result, false);
  });

  it('only modifies the targeted entry', () => {
    const logPath = path.join(tmpDir, 'commission-log.yaml');
    fs.writeFileSync(logPath, [
      'commissions:',
      '  - id: w-first',
      '    title: "First"',
      '    revision_required: null',
      '',
      '  - id: w-second',
      '    title: "Second"',
      '    revision_required: null',
      '',
    ].join('\n'));

    markRevisionRequired(logPath, 'w-second');

    const content = fs.readFileSync(logPath, 'utf-8');
    // First entry still null
    const firstEntry = content.substring(0, content.indexOf('w-second'));
    assert.ok(firstEntry.includes('revision_required: null'));
    // Second entry updated
    const secondEntry = content.substring(content.indexOf('w-second'));
    assert.ok(secondEntry.includes('revision_required: true'));
  });

  it('returns false when log file does not exist', () => {
    const result = markRevisionRequired(path.join(tmpDir, 'nonexistent.yaml'), 'w-abc123');
    assert.equal(result, false);
  });
});

describe('writeCommissionMd', () => {
  it('writes the writ body as commission.md', () => {
    fs.mkdirSync(path.join(tmpDir, 'w-abc123'), { recursive: true });

    writeCommissionMd(tmpDir, {
      id: 'w-abc123',
      title: 'Test Commission',
      body: '# Test Commission\n\nDo the thing.\n',
    });

    const content = fs.readFileSync(path.join(tmpDir, 'w-abc123', 'commission.md'), 'utf-8');
    assert.equal(content, '# Test Commission\n\nDo the thing.\n');
  });

  it('does not overwrite existing commission.md', () => {
    fs.mkdirSync(path.join(tmpDir, 'w-abc123'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'w-abc123', 'commission.md'), 'patron edited this');

    writeCommissionMd(tmpDir, {
      id: 'w-abc123',
      title: 'Test',
      body: 'new body that should not overwrite',
    });

    const content = fs.readFileSync(path.join(tmpDir, 'w-abc123', 'commission.md'), 'utf-8');
    assert.equal(content, 'patron edited this');
  });
});

describe('writeReviewTemplate', () => {
  it('writes a review template with writ metadata', () => {
    fs.mkdirSync(path.join(tmpDir, 'w-abc123'), { recursive: true });

    writeReviewTemplate(tmpDir, { id: 'w-abc123', title: 'Test Commission' });

    const content = fs.readFileSync(path.join(tmpDir, 'w-abc123', 'review.md'), 'utf-8');
    assert.ok(content.includes('# Review: w-abc123'));
    assert.ok(content.includes('## Test Commission'));
    assert.ok(content.includes('**Outcome:**'));
  });

  it('does not overwrite existing review.md', () => {
    fs.mkdirSync(path.join(tmpDir, 'w-abc123'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'w-abc123', 'review.md'), 'patron review in progress');

    writeReviewTemplate(tmpDir, { id: 'w-abc123', title: 'Test' });

    const content = fs.readFileSync(path.join(tmpDir, 'w-abc123', 'review.md'), 'utf-8');
    assert.equal(content, 'patron review in progress');
  });
});

describe('writeSessionRecord', () => {
  it('creates sessions directory and writes session YAML', () => {
    fs.mkdirSync(path.join(tmpDir, 'w-abc123'), { recursive: true });

    writeSessionRecord(tmpDir, 'w-abc123', {
      id: 'ses-xyz789',
      startedAt: '2026-04-02T12:00:00Z',
      endedAt: '2026-04-02T12:02:00Z',
      durationMs: 120000,
      status: 'completed',
      provider: 'claude-code',
      exitCode: 0,
      costUsd: 0.47,
      tokenUsage: {
        inputTokens: 100,
        outputTokens: 5000,
        cacheReadTokens: 90000,
        cacheWriteTokens: 3000,
      },
    });

    const filePath = path.join(tmpDir, 'w-abc123', 'sessions', 'ses-xyz789.yaml');
    assert.ok(fs.existsSync(filePath));

    const content = fs.readFileSync(filePath, 'utf-8');
    assert.ok(content.includes('id: ses-xyz789'));
    assert.ok(content.includes('writ_id: w-abc123'));
    assert.ok(content.includes('status: completed'));
    assert.ok(content.includes('duration_ms: 120000'));
    assert.ok(content.includes('cost_usd: 0.47'));
    assert.ok(content.includes('input_tokens: 100'));
    assert.ok(content.includes('cache_read_tokens: 90000'));
  });

  it('writes minimal session record (no optional fields)', () => {
    fs.mkdirSync(path.join(tmpDir, 'w-abc123'), { recursive: true });

    writeSessionRecord(tmpDir, 'w-abc123', {
      id: 'ses-xyz789',
      startedAt: '2026-04-02T12:00:00Z',
      status: 'running',
      provider: 'claude-code',
    });

    const content = fs.readFileSync(
      path.join(tmpDir, 'w-abc123', 'sessions', 'ses-xyz789.yaml'),
      'utf-8',
    );
    assert.ok(content.includes('status: running'));
    assert.ok(!content.includes('ended_at'));
    assert.ok(!content.includes('duration_ms'));
    assert.ok(!content.includes('token_usage'));
  });

  it('overwrites existing session record', () => {
    fs.mkdirSync(path.join(tmpDir, 'w-abc123'), { recursive: true });

    // Write initial (running)
    writeSessionRecord(tmpDir, 'w-abc123', {
      id: 'ses-xyz789',
      startedAt: '2026-04-02T12:00:00Z',
      status: 'running',
      provider: 'claude-code',
    });

    // Overwrite with final (completed)
    writeSessionRecord(tmpDir, 'w-abc123', {
      id: 'ses-xyz789',
      startedAt: '2026-04-02T12:00:00Z',
      endedAt: '2026-04-02T12:02:00Z',
      durationMs: 120000,
      status: 'completed',
      provider: 'claude-code',
      exitCode: 0,
    });

    const content = fs.readFileSync(
      path.join(tmpDir, 'w-abc123', 'sessions', 'ses-xyz789.yaml'),
      'utf-8',
    );
    assert.ok(content.includes('status: completed'));
    assert.ok(!content.includes('status: running'));
    assert.ok(content.includes('duration_ms: 120000'));
  });
});
