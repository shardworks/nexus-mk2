import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { initGuild, installBundle, instantiate, VERSION } from '@shardworks/nexus-core';
import { applyMigrations } from '@shardworks/engine-ledger-migrate';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Root of the monorepo packages directory. */
const PACKAGES_DIR = path.resolve(__dirname, '../../../../packages');

/** Path to the guild-starter-kit package in the workspace. */
const STARTER_KIT_DIR = path.join(PACKAGES_DIR, 'guild-starter-kit');

/**
 * Create a workspace-local copy of the starter kit bundle that resolves
 * package specifiers to local workspace paths instead of npm registry.
 * This lets the test run without depending on npm-published versions.
 */
function makeLocalBundle(tmpDir: string): string {
  const bundleDir = path.join(tmpDir, 'local-starter-kit');
  fs.cpSync(STARTER_KIT_DIR, bundleDir, { recursive: true });

  // Rewrite the manifest to point at local workspace packages
  const manifest = JSON.parse(fs.readFileSync(path.join(bundleDir, 'nexus-bundle.json'), 'utf-8'));

  for (const entry of manifest.tools ?? []) {
    // "@shardworks/tool-dispatch@0.x" → local path
    const name = entry.package.replace(/@0\.x$/, '').replace('@shardworks/', '');
    entry.package = path.join(PACKAGES_DIR, name);
  }
  for (const entry of manifest.engines ?? []) {
    const name = entry.package.replace(/@0\.x$/, '').replace('@shardworks/', '');
    entry.package = path.join(PACKAGES_DIR, name);
  }

  fs.writeFileSync(
    path.join(bundleDir, 'nexus-bundle.json'),
    JSON.stringify(manifest, null, 2),
  );
  return bundleDir;
}

/** Run the full init sequence: skeleton → bundle install → migrate → animas. */
function fullInit(home: string, model: string, bundleDir: string): void {
  initGuild(home, 'test-guild', model);
  installBundle({ home, bundleDir, commit: false });
  applyMigrations(home);
  instantiate({ home, name: 'Advisor', roles: ['advisor'], curriculum: 'guild-operations', temperament: 'guide' });
  instantiate({ home, name: 'Unnamed Artificer', roles: ['artificer'], curriculum: 'guild-operations', temperament: 'artisan' });
  execFileSync('git', ['add', '-A'], { cwd: home, stdio: 'pipe' });
  execFileSync('git', ['commit', '-m', 'Install starter kit'], { cwd: home, stdio: 'pipe' });
}

describe('initGuild (skeleton only)', () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates the expected directory structure without tools or ledger', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-init-'));
    const home = path.join(tmpDir, 'guild');
    initGuild(home, 'test-guild', 'test-model');

    // Git repo at guild root
    assert.ok(fs.existsSync(path.join(home, '.git')), '.git directory missing');

    // Guild files at root
    assert.ok(fs.existsSync(path.join(home, 'guild.json')), 'guild.json missing');
    assert.ok(fs.existsSync(path.join(home, 'codex', 'all.md')), 'codex/all.md missing');

    // Migrations directory (empty, bundle delivers content)
    assert.ok(fs.existsSync(path.join(home, 'nexus', 'migrations')), 'nexus/migrations/ missing');

    // Artifact directories
    assert.ok(fs.existsSync(path.join(home, 'tools')), 'tools/ missing');
    assert.ok(fs.existsSync(path.join(home, 'engines')), 'engines/ missing');

    // Training directories
    assert.ok(fs.existsSync(path.join(home, 'training', 'curricula')), 'curricula/ missing');
    assert.ok(fs.existsSync(path.join(home, 'training', 'temperaments')), 'temperaments/ missing');

    // .nexus infrastructure
    assert.ok(fs.existsSync(path.join(home, '.nexus', 'workshops')), '.nexus/workshops/ missing');
    assert.ok(fs.existsSync(path.join(home, '.nexus', 'worktrees')), '.nexus/worktrees/ missing');

    // No tools, training, or migration content yet
    const config = JSON.parse(fs.readFileSync(path.join(home, 'guild.json'), 'utf-8'));
    assert.deepEqual(config.tools, {});
    assert.deepEqual(config.engines, {});
    assert.deepEqual(config.curricula, {});
    assert.deepEqual(config.temperaments, {});

    // No ledger yet
    assert.ok(!fs.existsSync(path.join(home, '.nexus', 'nexus.db')), 'ledger should not exist yet');
  });

  it('has an initial commit', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-init-'));
    const home = path.join(tmpDir, 'guild');
    initGuild(home, 'test-guild', 'test-model');

    const log = execFileSync('git', ['log', '--oneline'], { cwd: home, encoding: 'utf-8' });
    assert.ok(log.includes('Initialize guild'), 'initial commit not found');
  });

  it('does not write migration file (bundle delivers it)', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-init-'));
    const home = path.join(tmpDir, 'guild');
    initGuild(home, 'test-guild', 'test-model');

    const migrationsDir = path.join(home, 'nexus', 'migrations');
    const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql'));
    assert.equal(files.length, 0, 'no migration files should exist in skeleton');
  });

  it('fails on non-empty directory', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-init-'));
    const home = path.join(tmpDir, 'guild');
    fs.mkdirSync(home);
    fs.writeFileSync(path.join(home, 'existing-file'), 'data');
    assert.throws(() => initGuild(home, 'test-guild', 'test-model'), /not empty/);
  });

  it('succeeds on existing empty directory', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-init-'));
    const home = path.join(tmpDir, 'guild');
    fs.mkdirSync(home);
    initGuild(home, 'test-guild', 'test-model');
    assert.ok(fs.existsSync(path.join(home, '.git')));
  });
});

describe('installBundle with starter kit', () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('installs all implements, engines, training, and migrations', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-init-'));
    const home = path.join(tmpDir, 'guild');
    initGuild(home, 'test-guild', 'test-model');

    const bundleDir = makeLocalBundle(tmpDir);
    const result = installBundle({ home, bundleDir, commit: false });

    const config = JSON.parse(fs.readFileSync(path.join(home, 'guild.json'), 'utf-8'));

    // Implements registered
    const expectedImplements = ['install-tool', 'remove-tool', 'dispatch', 'instantiate', 'nexus-version'];
    for (const name of expectedImplements) {
      assert.ok(config.tools[name], `${name} not registered`);
      assert.ok(config.tools[name].package, `${name} missing package field`);
      const implDir = path.join(home, 'tools', name);
      assert.ok(fs.existsSync(path.join(implDir, 'nexus-tool.json')), `${name} descriptor missing`);
    }

    // Engines registered
    const expectedEngines = ['manifest', 'mcp-server', 'worktree-setup', 'ledger-migrate'];
    for (const name of expectedEngines) {
      assert.ok(config.engines[name], `${name} not registered`);
      const engDir = path.join(home, 'engines', name);
      assert.ok(fs.existsSync(path.join(engDir, 'nexus-engine.json')), `${name} descriptor missing`);
    }

    // Training installed
    assert.ok(config.curricula['guild-operations'], 'guild-operations curriculum not registered');
    assert.ok(config.temperaments['guide'], 'guide temperament not registered');
    assert.ok(
      fs.existsSync(path.join(home, 'training', 'curricula', 'guild-operations', 'content.md')),
      'curriculum content missing',
    );
    assert.ok(
      fs.existsSync(path.join(home, 'training', 'temperaments', 'guide', 'content.md')),
      'temperament content missing',
    );

    // Migration delivered
    assert.ok(result.artifacts.migrations.length > 0, 'no migrations installed');
    assert.ok(
      fs.existsSync(path.join(home, 'nexus', 'migrations', result.artifacts.migrations[0]!)),
      'migration file missing on disk',
    );

    // Bundle provenance recorded
    assert.ok(config.tools['dispatch'].bundle, 'bundle provenance missing');
  });

  it('creates a single commit when commit=true', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-init-'));
    const home = path.join(tmpDir, 'guild');
    initGuild(home, 'test-guild', 'test-model');

    const bundleDir = makeLocalBundle(tmpDir);
    installBundle({ home, bundleDir });

    const log = execFileSync('git', ['log', '--oneline'], { cwd: home, encoding: 'utf-8' });
    const lines = log.trim().split('\n');
    assert.equal(lines.length, 2, 'should have exactly 2 commits');
    assert.ok(lines[0]!.includes('Install bundle'), 'bundle commit not found');
    assert.ok(lines[1]!.includes('Initialize guild'), 'init commit not found');
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
    const bundleDir = makeLocalBundle(tmpDir);
    fullInit(home, 'test-model', bundleDir);

    const config = JSON.parse(fs.readFileSync(path.join(home, 'guild.json'), 'utf-8'));

    assert.equal(typeof config.nexus, 'string');
    assert.equal(config.model, 'test-model');
    assert.deepEqual(config.workshops, {});

    // Tools registered
    assert.ok(config.tools['dispatch'], 'dispatch not registered');
    assert.ok(config.engines['manifest'], 'manifest not registered');

    // Training registered
    assert.ok(config.curricula['guild-operations'], 'curriculum not registered');
    assert.ok(config.temperaments['guide'], 'temperament not registered');
  });

  it('Ledger has expected tables via migration engine', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-init-'));
    const home = path.join(tmpDir, 'guild');
    const bundleDir = makeLocalBundle(tmpDir);
    fullInit(home, 'test-model', bundleDir);

    const db = new Database(path.join(home, '.nexus', 'nexus.db'));
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
    const bundleDir = makeLocalBundle(tmpDir);
    fullInit(home, 'test-model', bundleDir);

    const db = new Database(path.join(home, '.nexus', 'nexus.db'));
    try {
      const rows = db.prepare('SELECT * FROM _migrations').all() as { sequence: number; filename: string }[];
      assert.equal(rows.length, 1);
      assert.equal(rows[0]!.sequence, 1);
      assert.equal(rows[0]!.filename, '001-initial-schema.sql');
    } finally {
      db.close();
    }
  });

  it('advisor anima is instantiated with correct composition', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-init-'));
    const home = path.join(tmpDir, 'guild');
    const bundleDir = makeLocalBundle(tmpDir);
    fullInit(home, 'test-model', bundleDir);

    const db = new Database(path.join(home, '.nexus', 'nexus.db'));
    try {
      // Advisor exists and is active
      const anima = db.prepare(
        "SELECT * FROM animas WHERE name = 'Advisor'"
      ).get() as { id: number; status: string } | undefined;
      assert.ok(anima, 'advisor anima not found in ledger');
      assert.equal(anima.status, 'active');

      // Has advisor role
      const role = db.prepare(
        'SELECT role FROM roster WHERE anima_id = ?'
      ).get(anima.id) as { role: string } | undefined;
      assert.ok(role, 'advisor role not found in roster');
      assert.equal(role.role, 'advisor');

      // Composition has curriculum and temperament snapshots
      const comp = db.prepare(
        'SELECT * FROM anima_compositions WHERE anima_id = ?'
      ).get(anima.id) as { curriculum_name: string; temperament_name: string; curriculum_snapshot: string; temperament_snapshot: string } | undefined;
      assert.ok(comp, 'advisor composition not found');
      assert.equal(comp.curriculum_name, 'guild-operations');
      assert.equal(comp.temperament_name, 'guide');
      assert.ok(comp.curriculum_snapshot.includes('Guild Operations Curriculum'), 'curriculum snapshot missing content');
      assert.ok(comp.temperament_snapshot.includes('Guide Temperament'), 'temperament snapshot missing content');
    } finally {
      db.close();
    }
  });

  it('artificer anima is instantiated with correct composition', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-init-'));
    const home = path.join(tmpDir, 'guild');
    const bundleDir = makeLocalBundle(tmpDir);
    fullInit(home, 'test-model', bundleDir);

    const db = new Database(path.join(home, '.nexus', 'nexus.db'));
    try {
      // Artificer exists and is active
      const anima = db.prepare(
        "SELECT * FROM animas WHERE name = 'Unnamed Artificer'"
      ).get() as { id: number; status: string } | undefined;
      assert.ok(anima, 'artificer anima not found in ledger');
      assert.equal(anima.status, 'active');

      // Has artificer role
      const role = db.prepare(
        'SELECT role FROM roster WHERE anima_id = ?'
      ).get(anima.id) as { role: string } | undefined;
      assert.ok(role, 'artificer role not found in roster');
      assert.equal(role.role, 'artificer');

      // Composition has curriculum and artisan temperament
      const comp = db.prepare(
        'SELECT * FROM anima_compositions WHERE anima_id = ?'
      ).get(anima.id) as { curriculum_name: string; temperament_name: string; curriculum_snapshot: string; temperament_snapshot: string } | undefined;
      assert.ok(comp, 'artificer composition not found');
      assert.equal(comp.curriculum_name, 'guild-operations');
      assert.equal(comp.temperament_name, 'artisan');
      assert.ok(comp.curriculum_snapshot.includes('Guild Operations Curriculum'), 'curriculum snapshot missing content');
      assert.ok(comp.temperament_snapshot.includes('Artisan Temperament'), 'temperament snapshot missing content');
    } finally {
      db.close();
    }
  });

  it('guild.json has clockworks events for craft.question and craft.debt', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-init-'));
    const home = path.join(tmpDir, 'guild');
    const bundleDir = makeLocalBundle(tmpDir);
    fullInit(home, 'test-model', bundleDir);

    const config = JSON.parse(fs.readFileSync(path.join(home, 'guild.json'), 'utf-8'));
    assert.ok(config.clockworks, 'clockworks config missing');
    assert.ok(config.clockworks.events['craft.question'], 'craft.question event missing');
    assert.ok(config.clockworks.events['craft.debt'], 'craft.debt event missing');
    assert.ok(config.clockworks.events['craft.question'].schema.workshop, 'craft.question missing workshop in schema');
    assert.ok(config.clockworks.events['craft.debt'].schema.workshop, 'craft.debt missing workshop in schema');
    assert.deepEqual(config.clockworks.standingOrders, [], 'standing orders should be empty');
  });
});
