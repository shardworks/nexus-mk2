/**
 * instantiate — core logic for creating new animas.
 *
 * Creates an anima record in the Ledger with its full composition: roles,
 * curricula, and temperament. Reads and snapshots the training content at
 * instantiation time so the anima's composition is frozen to specific versions.
 */
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { ledgerPath, guildhallWorktreePath } from './nexus-home.ts';
import { readGuildConfig } from './guild-config.ts';

export interface InstantiateOptions {
  /** Absolute path to NEXUS_HOME. */
  home: string;
  /** Name for the new anima. Must be unique within the guild. */
  name: string;
  /** Roles the anima will hold (determines implement access via role gating). */
  roles: string[];
  /** Curricula to assign (by name, must be registered in guild.json). */
  curricula?: string[];
  /** Temperament to assign (by name, must be registered in guild.json). */
  temperament?: string;
}

export interface InstantiateResult {
  animaId: number;
  name: string;
  roles: string[];
  curricula: string[];
  temperament: string | null;
}

/**
 * Read training content from disk given its guild.json entry.
 *
 * @param worktree - Path to the guildhall worktree.
 * @param category - 'curricula' or 'temperaments'.
 * @param name - The training content name.
 * @param slot - The version slot.
 * @returns Object with version, content path, and the actual content text.
 */
function readTrainingContent(
  worktree: string,
  category: 'curricula' | 'temperaments',
  name: string,
  slot: string,
): { version: string; content: string } {
  const dir = path.join(worktree, 'training', category, name, slot);
  const descriptorFile = category === 'curricula'
    ? 'nexus-curriculum.json'
    : 'nexus-temperament.json';
  const descriptorPath = path.join(dir, descriptorFile);

  if (!fs.existsSync(descriptorPath)) {
    throw new Error(
      `${category.slice(0, -1)} "${name}" slot "${slot}" not found on disk at ${dir}`,
    );
  }

  const descriptor = JSON.parse(fs.readFileSync(descriptorPath, 'utf-8'));
  const contentFile = descriptor.content as string;
  const contentPath = path.join(dir, contentFile);

  if (!fs.existsSync(contentPath)) {
    throw new Error(
      `Content file "${contentFile}" not found for ${category.slice(0, -1)} "${name}" at ${contentPath}`,
    );
  }

  return {
    version: slot,
    content: fs.readFileSync(contentPath, 'utf-8'),
  };
}

/**
 * Instantiate a new anima in the guild.
 *
 * Creates the anima record, assigns roles in the roster, and snapshots the
 * composition (curricula + temperament content at current versions). All
 * operations happen in a single transaction.
 */
export function instantiate(opts: InstantiateOptions): InstantiateResult {
  const { home, name, roles, curricula = [], temperament } = opts;
  const worktree = guildhallWorktreePath(home);

  if (roles.length === 0) {
    throw new Error('At least one role is required.');
  }

  // Validate curricula and temperament exist in guild.json
  const config = readGuildConfig(home);

  for (const c of curricula) {
    if (!config.curricula[c]) {
      throw new Error(
        `Curriculum "${c}" not found in guild.json. Available: ${Object.keys(config.curricula).join(', ') || '(none)'}`,
      );
    }
  }

  if (temperament && !config.temperaments[temperament]) {
    throw new Error(
      `Temperament "${temperament}" not found in guild.json. Available: ${Object.keys(config.temperaments).join(', ') || '(none)'}`,
    );
  }

  // Read and snapshot training content
  const curriculaSnapshots = curricula.map(c => {
    const entry = config.curricula[c]!;
    const { version, content } = readTrainingContent(worktree, 'curricula', c, entry.slot);
    return { name: c, version, content };
  });

  let temperamentSnapshot: { name: string; version: string; content: string } | null = null;
  if (temperament) {
    const entry = config.temperaments[temperament]!;
    const { version, content } = readTrainingContent(worktree, 'temperaments', temperament, entry.slot);
    temperamentSnapshot = { name: temperament, version, content };
  }

  const db = new Database(ledgerPath(home));
  db.pragma('foreign_keys = ON');

  try {
    const result = db.transaction(() => {
      // Check name uniqueness
      const existing = db.prepare(
        `SELECT id FROM animas WHERE name = ?`,
      ).get(name) as { id: number } | undefined;

      if (existing) {
        throw new Error(`Anima "${name}" already exists in the Ledger.`);
      }

      // Create anima
      const insertAnima = db.prepare(
        `INSERT INTO animas (name, status) VALUES (?, 'active')`,
      );
      const animaResult = insertAnima.run(name);
      const animaId = Number(animaResult.lastInsertRowid);

      // Assign roles in roster
      const insertRole = db.prepare(
        `INSERT INTO roster (anima_id, role) VALUES (?, ?)`,
      );
      for (const role of roles) {
        insertRole.run(animaId, role);
      }

      // Record composition snapshot
      // The schema has single curriculum/temperament fields — for multiple curricula,
      // we concatenate names and content. This is a design ambiguity; see .scratch doc.
      const curriculumName = curriculaSnapshots.map(c => c.name).join(', ') || '';
      const curriculumVersion = curriculaSnapshots.map(c => c.version).join(', ') || '';
      const curriculumSnapshot = curriculaSnapshots.map(c => c.content).join('\n\n---\n\n') || '';

      db.prepare(
        `INSERT INTO anima_compositions (anima_id, curriculum_name, curriculum_version, curriculum_snapshot, temperament_name, temperament_version, temperament_snapshot)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        animaId,
        curriculumName,
        curriculumVersion,
        curriculumSnapshot,
        temperamentSnapshot?.name ?? '',
        temperamentSnapshot?.version ?? '',
        temperamentSnapshot?.content ?? '',
      );

      // Audit log
      db.prepare(
        `INSERT INTO audit_log (actor, action, target_type, target_id, detail) VALUES (?, ?, ?, ?, ?)`,
      ).run(
        'instantiate',
        'anima_instantiated',
        'anima',
        animaId,
        JSON.stringify({ roles, curricula, temperament: temperament ?? null }),
      );

      return animaId;
    })();

    return {
      animaId: result as number,
      name,
      roles,
      curricula,
      temperament: temperament ?? null,
    };
  } finally {
    db.close();
  }
}
