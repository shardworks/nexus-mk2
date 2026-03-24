import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import Database from 'better-sqlite3';
import { initGuild, bootstrapBaseTools, VERSION, BASE_IMPLEMENTS, BASE_ENGINES } from '@shardworks/nexus-core';
import { applyMigrations } from '@shardworks/engine-ledger-migrate';

const require = createRequire(import.meta.url);
function resolvePackage(name: string): string {
  const entry = require.resolve(name);
  let dir = path.dirname(entry);
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
    dir = path.dirname(dir);
  }
  throw new Error(`Could not find package root for ${name}`);
}

/** Run the full init sequence: skeleton → bootstrap → migrate. */
function fullInit(home: string, model: string): void {
  initGuild(home, model);
  bootstrapBaseTools(home, resolvePackage);
  applyMigrations(home);
}

describe('initGuild (skeleton only)', () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates the expected directory structure without tools or ledger', () => {
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

    // No base tools installed yet (just .gitkeep)
    const config = JSON.parse(fs.readFileSync(path.join(wt, 'guild.json'), 'utf-8'));
    assert.deepEqual(config.implements, {});
    assert.deepEqual(config.engines, {});

    // No ledger yet
    assert.ok(!fs.existsSync(path.join(home, 'nexus.db')), 'ledger should not exist yet');
  });

  it('has an initial commit', () => {
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

describe('bootstrapBaseTools', () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('installs all base implements and engines via installTool', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-init-'));
    const home = path.join(tmpDir, 'guild');
    initGuild(home, 'test-model');
    bootstrapBaseTools(home, resolvePackage);

    const wt = path.join(home, 'worktrees', 'guildhall', 'main');

    // Base implements installed to nexus/implements/
    for (const ref of BASE_IMPLEMENTS) {
      const implDir = path.join(wt, 'nexus', 'implements', ref.name, VERSION);
      assert.ok(fs.existsSync(path.join(implDir, 'nexus-implement.json')), `${ref.name} descriptor missing`);
      assert.ok(fs.existsSync(path.join(implDir, 'instructions.md')), `${ref.name} instructions missing`);
    }

    // Base engines installed to nexus/engines/
    for (const ref of BASE_ENGINES) {
      const engDir = path.join(wt, 'nexus', 'engines', ref.name, VERSION);
      assert.ok(fs.existsSync(path.join(engDir, 'nexus-engine.json')), `${ref.name} descriptor missing`);
    }

    // All registered in guild.json with source: 'nexus'
    const config = JSON.parse(fs.readFileSync(path.join(wt, 'guild.json'), 'utf-8'));
    for (const ref of BASE_IMPLEMENTS) {
      const entry = config.implements[ref.name];
      assert.ok(entry, `${ref.name} not registered`);
      assert.equal(entry.source, 'nexus');
      assert.equal(entry.slot, VERSION);
    }
    for (const ref of BASE_ENGINES) {
      const entry = config.engines[ref.name];
      assert.ok(entry, `${ref.name} not registered`);
      assert.equal(entry.source, 'nexus');
      assert.equal(entry.slot, VERSION);
    }
  });

  it('creates a single "Bootstrap base tools" commit', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-init-'));
    const home = path.join(tmpDir, 'guild');
    initGuild(home, 'test-model');
    bootstrapBaseTools(home, resolvePackage);

    const wt = path.join(home, 'worktrees', 'guildhall', 'main');
    const log = execFileSync('git', ['log', '--oneline'], { cwd: wt, encoding: 'utf-8' });
    const lines = log.trim().split('\n');
    assert.equal(lines.length, 2, 'should have exactly 2 commits');
    assert.ok(lines[0]!.includes('Bootstrap base tools'));
    assert.ok(lines[1]!.includes('Initialize guild'));
  });
});

describe('full init sequence', () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('guild.json has correct shape', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-init-'));
    const home = path.join(tmpDir, 'guild');
    fullInit(home, 'test-model');

    const wt = path.join(home, 'worktrees', 'guildhall', 'main');
    const config = JSON.parse(fs.readFileSync(path.join(wt, 'guild.json'), 'utf-8'));

    assert.equal(typeof config.nexus, 'string');
    assert.equal(config.model, 'test-model');
    assert.deepEqual(config.workshops, []);
    assert.deepEqual(config.curricula, {});
    assert.deepEqual(config.temperaments, {});

    // All base tools registered
    for (const ref of BASE_IMPLEMENTS) {
      assert.ok(config.implements[ref.name], `${ref.name} not registered`);
    }
    for (const ref of BASE_ENGINES) {
      assert.ok(config.engines[ref.name], `${ref.name} not registered`);
    }
  });

  it('Ledger has expected tables via migration engine', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-init-'));
    const home = path.join(tmpDir, 'guild');
    fullInit(home, 'test-model');

    const db = new Database(path.join(home, 'nexus.db'));
    try {
      const tables = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
      ).all() as { name: string }[];
      const names = tables.map(t => t.name);
      assert.ok(names.includes('_migrations'), '_migrations tracking table missing');
      assert.ok(names.includes('animas'), 'animas table missing');
      assert.ok(names.includes('anima_compositions'), 'anima_compositions table missing');
      assert.ok(names.includes('commissions'), 'commissions table missing');
      assert.ok(names.includes('roster'), 'roster table missing');
      assert.ok(names.includes('audit_log'), 'audit_log table missing');
    } finally {
      db.close();
    }
  });

  it('migration 001 is tracked in _migrations', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-init-'));
    const home = path.join(tmpDir, 'guild');
    fullInit(home, 'test-model');

    const db = new Database(path.join(home, 'nexus.db'));
    try {
      const rows = db.prepare('SELECT * FROM _migrations').all() as { sequence: number; filename: string }[];
      assert.equal(rows.length, 1);
      assert.equal(rows[0]!.sequence, 1);
      assert.equal(rows[0]!.filename, '001-initial-schema.sql');
    } finally {
      db.close();
    }
  });
});
