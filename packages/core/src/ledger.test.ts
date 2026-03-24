import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { createLedger } from './ledger.ts';

describe('createLedger', () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates a database with all expected tables', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-ledger-'));
    const dbPath = path.join(tmpDir, 'nexus.db');
    createLedger(dbPath);

    const db = new Database(dbPath);
    try {
      const tables = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
      ).all() as { name: string }[];

      const names = tables.map(t => t.name);
      assert.deepEqual(names, [
        'anima_compositions',
        'animas',
        'audit_log',
        'commission_assignments',
        'commissions',
        'roster',
      ]);
    } finally {
      db.close();
    }
  });

  it('enables WAL journal mode', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-ledger-'));
    const dbPath = path.join(tmpDir, 'nexus.db');
    createLedger(dbPath);

    const db = new Database(dbPath);
    try {
      const result = db.pragma('journal_mode') as { journal_mode: string }[];
      assert.equal(result[0]!.journal_mode, 'wal');
    } finally {
      db.close();
    }
  });

  it('enforces foreign keys', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-ledger-'));
    const dbPath = path.join(tmpDir, 'nexus.db');
    createLedger(dbPath);

    const db = new Database(dbPath);
    try {
      const result = db.pragma('foreign_keys') as { foreign_keys: number }[];
      assert.equal(result[0]!.foreign_keys, 1);
    } finally {
      db.close();
    }
  });
});
