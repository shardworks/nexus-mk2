import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { initGuild } from '../cli/commands/init.ts';
import { installTool } from './install-tool.ts';
import { removeTool } from './remove-tool.ts';

describe('installTool', () => {
  let tmpDir: string;
  let home: string;
  let wt: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-tool-'));
    home = path.join(tmpDir, 'guild');
    initGuild(home, 'test-model');
    wt = path.join(home, 'worktrees', 'guildhall', 'main');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  /** Create a minimal tool directory with descriptor and entry point. */
  function makeToolDir(descriptor: string, files: Record<string, string>): string {
    const dir = path.join(tmpDir, `tool-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    fs.mkdirSync(dir, { recursive: true });
    for (const [name, content] of Object.entries(files)) {
      const filePath = path.join(dir, name);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, content);
    }
    return dir;
  }

  it('installs a local implement', () => {
    const toolDir = makeToolDir('nexus-implement.json', {
      'nexus-implement.json': JSON.stringify({ entry: 'run.sh', kind: 'executable', version: '0.1.0' }),
      'run.sh': '#!/usr/bin/env bash\necho hello',
      'instructions.md': '# My Tool\nUse it.',
    });

    const result = installTool({ home, source: toolDir, name: 'my-tool' });

    assert.equal(result.category, 'implements');
    assert.equal(result.name, 'my-tool');
    assert.equal(result.slot, '0.1.0');

    // Files exist on disk
    const installed = path.join(wt, 'implements', 'my-tool', '0.1.0');
    assert.ok(fs.existsSync(path.join(installed, 'nexus-implement.json')));
    assert.ok(fs.existsSync(path.join(installed, 'run.sh')));
    assert.ok(fs.existsSync(path.join(installed, 'instructions.md')));

    // Registered in guild.json
    const config = JSON.parse(fs.readFileSync(path.join(wt, 'guild.json'), 'utf-8'));
    assert.equal(config.implements['my-tool'].source, 'guild');
    assert.equal(config.implements['my-tool'].slot, '0.1.0');
    assert.equal(config.implements['my-tool'].upstream, null);
  });

  it('installs a local engine', () => {
    const toolDir = makeToolDir('nexus-engine.json', {
      'nexus-engine.json': JSON.stringify({ entry: 'run.sh', kind: 'executable', version: '1.0.0' }),
      'run.sh': '#!/usr/bin/env bash\necho engine',
    });

    const result = installTool({ home, source: toolDir, name: 'my-engine' });

    assert.equal(result.category, 'engines');
    assert.equal(result.name, 'my-engine');
    assert.equal(result.slot, '1.0.0');

    const installed = path.join(wt, 'engines', 'my-engine', '1.0.0');
    assert.ok(fs.existsSync(path.join(installed, 'nexus-engine.json')));

    const config = JSON.parse(fs.readFileSync(path.join(wt, 'guild.json'), 'utf-8'));
    assert.equal(config.engines['my-engine'].slot, '1.0.0');
  });

  it('installs a curriculum', () => {
    const toolDir = makeToolDir('nexus-curriculum.json', {
      'nexus-curriculum.json': JSON.stringify({ content: 'curriculum.md', version: '2.0.0' }),
      'curriculum.md': '# Artificer Craft\nBuild things well.',
    });

    const result = installTool({ home, source: toolDir, name: 'artificer-craft' });

    assert.equal(result.category, 'curricula');
    assert.equal(result.slot, '2.0.0');

    const installed = path.join(wt, 'training', 'curricula', 'artificer-craft', '2.0.0');
    assert.ok(fs.existsSync(path.join(installed, 'curriculum.md')));

    const config = JSON.parse(fs.readFileSync(path.join(wt, 'guild.json'), 'utf-8'));
    assert.equal(config.curricula['artificer-craft'].slot, '2.0.0');
    assert.equal(config.curricula['artificer-craft'].upstream, null);
  });

  it('installs a temperament', () => {
    const toolDir = makeToolDir('nexus-temperament.json', {
      'nexus-temperament.json': JSON.stringify({ content: 'temperament.md', version: '1.0.0' }),
      'temperament.md': '# Stoic\nCalm and measured.',
    });

    const result = installTool({ home, source: toolDir, name: 'stoic' });

    assert.equal(result.category, 'temperaments');
    const installed = path.join(wt, 'training', 'temperaments', 'stoic', '1.0.0');
    assert.ok(fs.existsSync(path.join(installed, 'temperament.md')));
  });

  it('uses --slot to override version', () => {
    const toolDir = makeToolDir('nexus-implement.json', {
      'nexus-implement.json': JSON.stringify({ entry: 'run.sh', kind: 'executable', version: '1.0.0' }),
      'run.sh': '#!/bin/sh\n:',
      'instructions.md': 'Use it.',
    });

    const result = installTool({ home, source: toolDir, name: 'my-tool', slot: 'custom-slot' });

    assert.equal(result.slot, 'custom-slot');
    assert.ok(fs.existsSync(path.join(wt, 'implements', 'my-tool', 'custom-slot', 'run.sh')));
  });

  it('falls back to package.json version', () => {
    const toolDir = makeToolDir('nexus-implement.json', {
      'nexus-implement.json': JSON.stringify({ entry: 'run.sh', kind: 'executable' }),
      'package.json': JSON.stringify({ name: 'my-tool', version: '3.2.1' }),
      'run.sh': '#!/bin/sh\n:',
      'instructions.md': 'Use it.',
    });

    const result = installTool({ home, source: toolDir, name: 'my-tool' });
    assert.equal(result.slot, '3.2.1');
  });

  it('errors when no version and no --slot', () => {
    const toolDir = makeToolDir('nexus-implement.json', {
      'nexus-implement.json': JSON.stringify({ entry: 'run.sh', kind: 'executable' }),
      'run.sh': '#!/bin/sh\n:',
      'instructions.md': 'Use it.',
    });

    assert.throws(
      () => installTool({ home, source: toolDir, name: 'versionless' }),
      /No version found.*--slot/,
    );
  });

  it('errors when no descriptor found', () => {
    const toolDir = makeToolDir('none', {
      'run.sh': '#!/bin/sh\necho hi',
    });

    assert.throws(
      () => installTool({ home, source: toolDir, name: 'bad-tool', slot: '1.0.0' }),
      /No descriptor found/,
    );
  });

  it('stores roles on implements', () => {
    const toolDir = makeToolDir('nexus-implement.json', {
      'nexus-implement.json': JSON.stringify({ entry: 'run.sh', kind: 'executable', version: '1.0.0' }),
      'run.sh': '#!/bin/sh\n:',
      'instructions.md': 'Use it.',
    });

    installTool({ home, source: toolDir, name: 'gated-tool', roles: ['artificer', 'sage'] });

    const config = JSON.parse(fs.readFileSync(path.join(wt, 'guild.json'), 'utf-8'));
    assert.deepEqual(config.implements['gated-tool'].roles, ['artificer', 'sage']);
  });

  it('creates a git commit', () => {
    const toolDir = makeToolDir('nexus-implement.json', {
      'nexus-implement.json': JSON.stringify({ entry: 'run.sh', kind: 'executable', version: '1.0.0' }),
      'run.sh': '#!/bin/sh\n:',
      'instructions.md': 'Use it.',
    });

    installTool({ home, source: toolDir, name: 'committed-tool' });

    const log = execFileSync('git', ['log', '--oneline', '-1'], { cwd: wt, encoding: 'utf-8' });
    assert.ok(log.includes('Install implement committed-tool@1.0.0'));
  });

  it('defaults name to source directory basename', () => {
    const toolDir = path.join(tmpDir, 'fancy-tool');
    fs.mkdirSync(toolDir);
    fs.writeFileSync(path.join(toolDir, 'nexus-implement.json'),
      JSON.stringify({ entry: 'run.sh', kind: 'executable', version: '0.5.0' }));
    fs.writeFileSync(path.join(toolDir, 'run.sh'), '#!/bin/sh\n:');
    fs.writeFileSync(path.join(toolDir, 'instructions.md'), 'Use it.');

    const result = installTool({ home, source: toolDir });

    assert.equal(result.name, 'fancy-tool');
    assert.ok(fs.existsSync(path.join(wt, 'implements', 'fancy-tool', '0.5.0')));
  });
});

describe('removeTool', () => {
  let tmpDir: string;
  let home: string;
  let wt: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-tool-'));
    home = path.join(tmpDir, 'guild');
    initGuild(home, 'test-model');
    wt = path.join(home, 'worktrees', 'guildhall', 'main');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function installTestTool(name: string, category: string = 'nexus-implement.json'): void {
    const toolDir = path.join(tmpDir, `tool-${name}`);
    fs.mkdirSync(toolDir);
    fs.writeFileSync(path.join(toolDir, category),
      JSON.stringify({ entry: 'run.sh', kind: 'executable', version: '1.0.0' }));
    fs.writeFileSync(path.join(toolDir, 'run.sh'), '#!/bin/sh\n:');
    if (category === 'nexus-implement.json') {
      fs.writeFileSync(path.join(toolDir, 'instructions.md'), 'Use it.');
    }
    installTool({ home, source: toolDir, name });
  }

  it('removes an installed implement', () => {
    installTestTool('doomed-tool');

    const result = removeTool({ home, name: 'doomed-tool' });

    assert.equal(result.category, 'implements');
    assert.equal(result.name, 'doomed-tool');

    // Gone from disk
    assert.ok(!fs.existsSync(path.join(wt, 'implements', 'doomed-tool')));

    // Gone from guild.json
    const config = JSON.parse(fs.readFileSync(path.join(wt, 'guild.json'), 'utf-8'));
    assert.equal(config.implements['doomed-tool'], undefined);
  });

  it('removes an installed engine', () => {
    installTestTool('doomed-engine', 'nexus-engine.json');

    const result = removeTool({ home, name: 'doomed-engine' });
    assert.equal(result.category, 'engines');
    assert.ok(!fs.existsSync(path.join(wt, 'engines', 'doomed-engine')));
  });

  it('errors on unknown tool', () => {
    assert.throws(
      () => removeTool({ home, name: 'nonexistent' }),
      /not found in guild\.json/,
    );
  });

  it('prevents removal of framework tools', () => {
    // Manually register a nexus-source tool in guild.json
    const configPath = path.join(wt, 'guild.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    config.implements['dispatch'] = {
      source: 'nexus',
      slot: '1.0.0',
      upstream: null,
      installedAt: new Date().toISOString(),
    };
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');

    assert.throws(
      () => removeTool({ home, name: 'dispatch' }),
      /framework tool.*nexus repair/,
    );
  });

  it('creates a git commit', () => {
    installTestTool('bye-tool');
    removeTool({ home, name: 'bye-tool' });

    const log = execFileSync('git', ['log', '--oneline', '-1'], { cwd: wt, encoding: 'utf-8' });
    assert.ok(log.includes('Remove implement bye-tool'));
  });
});
