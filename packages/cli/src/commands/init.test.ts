import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import Database from 'better-sqlite3';
import { initGuild, VERSION, BASE_IMPLEMENTS, BASE_ENGINES } from '@shardworks/nexus-core';

describe('initGuild', () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates the expected directory structure', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-init-'));
    const home = path.join(tmpDir, 'guild');
    initGuild(home, 'test-model');

    // Bare repo
    assert.ok(fs.existsSync(path.join(home, 'guildhall', 'HEAD')), 'guildhall bare repo missing');

    // Standing worktree
    const wt = path.join(home, 'worktrees', 'guildhall', 'main');
    assert.ok(fs.existsSync(path.join(wt, 'guild.json')), 'guild.json missing');
    assert.ok(fs.existsSync(path.join(wt, 'codex', 'all.md')), 'codex/all.md missing');
    assert.ok(fs.existsSync(path.join(wt, 'nexus', 'migrations', '001-initial-schema.sql')), 'migration missing');

    // Guild-managed directories
    assert.ok(fs.existsSync(path.join(wt, 'implements')), 'guild implements/ missing');
    assert.ok(fs.existsSync(path.join(wt, 'engines')), 'guild engines/ missing');

    // Training directories
    assert.ok(fs.existsSync(path.join(wt, 'training', 'curricula')), 'curricula/ missing');
    assert.ok(fs.existsSync(path.join(wt, 'training', 'temperaments')), 'temperaments/ missing');

    // Base implements — descriptor + instructions
    for (const tmpl of BASE_IMPLEMENTS) {
      const implDir = path.join(wt, 'nexus', 'implements', tmpl.name, VERSION);
      assert.ok(fs.existsSync(path.join(implDir, 'nexus-implement.json')), `${tmpl.name} descriptor missing`);
      assert.ok(fs.existsSync(path.join(implDir, 'instructions.md')), `${tmpl.name} instructions missing`);
    }

    // Base engines — descriptors
    for (const tmpl of BASE_ENGINES) {
      const engDir = path.join(wt, 'nexus', 'engines', tmpl.name, VERSION);
      assert.ok(fs.existsSync(path.join(engDir, 'nexus-engine.json')), `${tmpl.name} descriptor missing`);
    }

    // Ledger
    assert.ok(fs.existsSync(path.join(home, 'nexus.db')), 'Ledger missing');
  });

  it('guild.json has correct shape', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-init-'));
    const home = path.join(tmpDir, 'guild');
    initGuild(home, 'test-model');

    const wt = path.join(home, 'worktrees', 'guildhall', 'main');
    const config = JSON.parse(fs.readFileSync(path.join(wt, 'guild.json'), 'utf-8'));

    assert.equal(typeof config.nexus, 'string');
    assert.equal(config.model, 'test-model');
    assert.deepEqual(config.workshops, []);

    // Base implements registered
    for (const tmpl of BASE_IMPLEMENTS) {
      const entry = config.implements[tmpl.name];
      assert.ok(entry, `${tmpl.name} not registered`);
      assert.equal(entry.source, 'nexus');
      assert.equal(entry.slot, VERSION);
    }

    // Base engines registered
    for (const tmpl of BASE_ENGINES) {
      const entry = config.engines[tmpl.name];
      assert.ok(entry, `${tmpl.name} not registered`);
      assert.equal(entry.source, 'nexus');
      assert.equal(entry.slot, VERSION);
    }

    // Training registries still empty
    assert.deepEqual(config.curricula, {});
    assert.deepEqual(config.temperaments, {});
  });

  it('Ledger has expected tables', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-init-'));
    const home = path.join(tmpDir, 'guild');
    initGuild(home, 'test-model');

    const db = new Database(path.join(home, 'nexus.db'));
    try {
      const tables = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
      ).all() as { name: string }[];
      const names = tables.map(t => t.name);
      assert.ok(names.includes('animas'), 'animas table missing');
      assert.ok(names.includes('anima_compositions'), 'anima_compositions table missing');
      assert.ok(names.includes('commissions'), 'commissions table missing');
      assert.ok(names.includes('roster'), 'roster table missing');
      assert.ok(names.includes('audit_log'), 'audit_log table missing');
    } finally {
      db.close();
    }
  });

  it('guildhall has an initial commit', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-init-'));
    const home = path.join(tmpDir, 'guild');
    initGuild(home, 'test-model');

    const wt = path.join(home, 'worktrees', 'guildhall', 'main');
    const log = execFileSync('git', ['log', '--oneline'], { cwd: wt, encoding: 'utf-8' });
    assert.ok(log.includes('Initialize guild'), 'initial commit not found');
  });

  it('fails on non-empty directory', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-init-'));
    const home = path.join(tmpDir, 'guild');
    fs.mkdirSync(home);
    fs.writeFileSync(path.join(home, 'existing-file'), 'data');

    assert.throws(() => initGuild(home, 'test-model'), /not empty/);
  });

  it('succeeds on existing empty directory', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-init-'));
    const home = path.join(tmpDir, 'guild');
    fs.mkdirSync(home);

    initGuild(home, 'test-model');
    assert.ok(fs.existsSync(path.join(home, 'guildhall', 'HEAD')));
  });
});
