/**
 * Manifest Engine
 *
 * The core session-setup engine. When an anima needs to be brought into
 * presence for a session, the manifest engine:
 *
 * 1. Reads the anima's composition from the Ledger (roles, curricula, temperament)
 * 2. Resolves implements — starts with baseImplements, then unions in each
 *    role's implements (validated against guild.json role definitions)
 * 3. Runs precondition checks on each resolved implement
 * 4. Reads codex content, role instructions, curricula content, temperament
 *    content, and implement instructions from disk
 * 5. Assembles the composed system prompt
 * 6. Generates an MCP server config with the available implement set
 *
 * The manifest engine is deterministic infrastructure — no AI involvement.
 * It reconstitutes a working identity from institutional records.
 */

import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import {
  ledgerPath,
  readGuildConfig,
  readPreconditions,
  checkPreconditions,
} from '@shardworks/nexus-core';
import type { GuildConfig, ToolEntry } from '@shardworks/nexus-core';

// ── Types ──────────────────────────────────────────────────────────────

/** An anima's composition as stored in the Ledger. */
export interface AnimaRecord {
  id: number;
  name: string;
  status: string;
  roles: string[];
  curriculumSnapshot: string;
  temperamentSnapshot: string;
}

/** A resolved implement that the anima has access to. */
export interface ResolvedImplement {
  /** Tool name — how the anima sees it. */
  name: string;
  /** Absolute path to the implement's directory on disk. */
  path: string;
  /** Instructions content (if instructions.md exists). */
  instructions: string | null;
  /** npm package name for runtime resolution, or null for file-path resolution. */
  package: string | null;
}

/** An implement that was resolved by role but failed precondition checks. */
export interface UnavailableImplement {
  /** Tool name. */
  name: string;
  /** Human-readable reasons why the implement is unavailable. */
  reasons: string[];
}

/** The fully-resolved session configuration. */
export interface ManifestResult {
  /** The anima record from the Ledger. */
  anima: AnimaRecord;
  /** The composed system prompt for the anima. */
  systemPrompt: string;
  /** MCP server config — implements the anima has access to. */
  mcpConfig: McpServerConfig;
  /** Implements that matched the anima's roles but failed precondition checks. */
  unavailable: UnavailableImplement[];
  /** Warnings generated during manifest (e.g. undefined roles). */
  warnings: string[];
}

/** Configuration passed to the MCP server engine. */
export interface McpServerConfig {
  /** Absolute path to the guild root. */
  home: string;
  /** Implements to register as MCP tools. */
  implements: Array<{ name: string; modulePath: string }>;
  /** Environment variables for the MCP server process. */
  env?: Record<string, string>;
}

// ── Core Functions ─────────────────────────────────────────────────────

/**
 * Read an anima's full record from the Ledger, including roles and composition.
 */
export function readAnima(home: string, animaName: string): AnimaRecord {
  const db = new Database(ledgerPath(home));
  db.pragma('foreign_keys = ON');

  try {
    // Get anima
    const anima = db.prepare(
      `SELECT id, name, status FROM animas WHERE name = ?`,
    ).get(animaName) as { id: number; name: string; status: string } | undefined;

    if (!anima) {
      throw new Error(`Anima "${animaName}" not found in the Ledger.`);
    }

    // Get roles
    const roleRows = db.prepare(
      `SELECT role FROM roster WHERE anima_id = ? ORDER BY role`,
    ).all(anima.id) as { role: string }[];
    const roles = roleRows.map(r => r.role);

    // Get composition
    const composition = db.prepare(
      `SELECT curriculum_snapshot, temperament_snapshot FROM anima_compositions WHERE anima_id = ?`,
    ).get(anima.id) as { curriculum_snapshot: string; temperament_snapshot: string } | undefined;

    return {
      id: anima.id,
      name: anima.name,
      status: anima.status,
      roles,
      curriculumSnapshot: composition?.curriculum_snapshot ?? '',
      temperamentSnapshot: composition?.temperament_snapshot ?? '',
    };
  } finally {
    db.close();
  }
}

/**
 * Resolve the set of implements an anima has access to, based on role
 * definitions and precondition checks.
 *
 * 1. Start with baseImplements (available to all animas)
 * 2. For each anima role, look up the role in guild.json.roles
 *    - If defined: union in that role's implements
 *    - If undefined: warn and skip (no tools, no instructions from that role)
 * 3. Deduplicate implement names
 * 4. Resolve each implement from guild.json.implements catalog
 * 5. Run precondition checks — split into available and unavailable
 *
 * Returns available implements, unavailable implements, and any warnings.
 */
export function resolveImplements(
  home: string,
  config: GuildConfig,
  animaRoles: string[],
): { available: ResolvedImplement[]; unavailable: UnavailableImplement[]; warnings: string[] } {
  const warnings: string[] = [];

  // Collect implement names: start with base, union in role-specific
  const implementNames = new Set<string>(config.baseImplements ?? []);

  for (const role of animaRoles) {
    const roleDef = config.roles[role];
    if (!roleDef) {
      warnings.push(
        `Role "${role}" is assigned to this anima but not defined in guild.json. ` +
        `No tools or instructions from this role will be available.`,
      );
      continue;
    }
    for (const implName of roleDef.implements) {
      implementNames.add(implName);
    }
  }

  // Resolve each implement from the catalog
  const available: ResolvedImplement[] = [];
  const unavailable: UnavailableImplement[] = [];

  for (const name of implementNames) {
    const entry = config.implements[name] as ToolEntry | undefined;
    if (!entry) {
      warnings.push(
        `Implement "${name}" is referenced by a role or baseImplements but not found in guild.json.implements. Skipping.`,
      );
      continue;
    }

    // Resolve on-disk path
    const implPath = path.join(home, 'implements', name);
    const descriptorPath = path.join(implPath, 'nexus-implement.json');

    // Check preconditions before including in the available set
    const preconditions = readPreconditions(descriptorPath);
    if (preconditions.length > 0) {
      const results = checkPreconditions(preconditions);
      const failures = results.filter(r => !r.passed).map(r => r.message!);
      if (failures.length > 0) {
        unavailable.push({ name, reasons: failures });
        continue;
      }
    }

    // Read instructions if they exist
    let instructions: string | null = null;
    if (fs.existsSync(descriptorPath)) {
      try {
        const descriptor = JSON.parse(fs.readFileSync(descriptorPath, 'utf-8'));
        if (descriptor.instructions) {
          const instructionsPath = path.join(implPath, descriptor.instructions);
          if (fs.existsSync(instructionsPath)) {
            instructions = fs.readFileSync(instructionsPath, 'utf-8');
          }
        }
      } catch {
        // If descriptor is unreadable, skip instructions
      }
    }

    available.push({
      name,
      path: implPath,
      instructions,
      package: entry.package ?? null,
    });
  }

  return { available, unavailable, warnings };
}

/**
 * Read codex documents from the guildhall — guild-wide policy for all animas.
 *
 * Reads all .md files in the codex/ directory (non-recursive top level).
 * Role-specific content is no longer in codex/roles/ — it's owned by
 * role definitions in guild.json.
 */
export function readCodex(home: string): string {
  const codexDir = path.join(home, 'codex');

  if (!fs.existsSync(codexDir)) return '';

  const sections: string[] = [];

  // Read top-level .md files (included for all animas)
  for (const entry of fs.readdirSync(codexDir, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.md')) {
      const content = fs.readFileSync(path.join(codexDir, entry.name), 'utf-8').trim();
      if (content) sections.push(content);
    }
  }

  return sections.join('\n\n---\n\n');
}

/**
 * Read role-specific instructions for an anima's roles.
 *
 * For each role the anima holds, reads the instructions file pointed to by
 * the role definition in guild.json. Skips undefined roles (warning already
 * emitted by resolveImplements). Skips roles without instructions.
 *
 * Returns the composed text of all role instructions, or empty string.
 */
export function readRoleInstructions(
  home: string,
  config: GuildConfig,
  animaRoles: string[],
): string {
  const sections: string[] = [];

  for (const role of animaRoles) {
    const roleDef = config.roles[role];
    if (!roleDef || !roleDef.instructions) continue;

    const instructionsPath = path.join(home, roleDef.instructions);
    if (!fs.existsSync(instructionsPath)) continue;

    try {
      const content = fs.readFileSync(instructionsPath, 'utf-8').trim();
      if (content) {
        sections.push(content);
      }
    } catch {
      // If unreadable, skip
    }
  }

  return sections.join('\n\n---\n\n');
}

/**
 * Assemble the composed system prompt for an anima session.
 *
 * Sections are included in order: codex → role instructions → curricula →
 * temperament → implement instructions → unavailable implements notice.
 * Empty sections are omitted.
 */
export function assembleSystemPrompt(
  codex: string,
  roleInstructions: string,
  anima: AnimaRecord,
  implements_: ResolvedImplement[],
  unavailable: UnavailableImplement[] = [],
): string {
  const sections: string[] = [];

  // Codex — guild-wide policies and procedures
  if (codex.trim()) {
    sections.push(`# Codex\n\n${codex}`);
  }

  // Role instructions — role-specific operational guidance
  if (roleInstructions.trim()) {
    sections.push(`# Role Instructions\n\n${roleInstructions}`);
  }

  // Curricula — the anima's training content
  if (anima.curriculumSnapshot.trim()) {
    sections.push(`# Training\n\n${anima.curriculumSnapshot}`);
  }

  // Temperament — the anima's personality
  if (anima.temperamentSnapshot.trim()) {
    sections.push(`# Temperament\n\n${anima.temperamentSnapshot}`);
  }

  // Implement instructions — guidance for each tool the anima has access to
  const toolInstructions = implements_
    .filter(impl => impl.instructions)
    .map(impl => impl.instructions!);

  if (toolInstructions.length > 0) {
    sections.push(`# Tool Instructions\n\n${toolInstructions.join('\n\n---\n\n')}`);
  }

  // Unavailable implements notice — tell the anima what's broken and why
  if (unavailable.length > 0) {
    const notices = unavailable.map(u => {
      const reasons = u.reasons.map(r => `  - ${r}`).join('\n');
      return `**${u.name}** — unavailable:\n${reasons}`;
    });
    sections.push(
      `# Unavailable Implements\n\n` +
      `The following implements are registered for your roles but are currently ` +
      `unavailable due to unmet environment requirements. Do not attempt to use them. ` +
      `If a patron or operator asks you to perform work that requires these tools, ` +
      `explain what is needed to make them available.\n\n` +
      notices.join('\n\n'),
    );
  }

  return sections.join('\n\n---\n\n');
}

/**
 * Generate the MCP server config for the resolved implement set.
 *
 * For implements with a `package` field in guild.json, the modulePath is the
 * npm package name (resolved via NODE_PATH at runtime). For implements without
 * a package field, the modulePath is an absolute path to the entry point.
 */
export function generateMcpConfig(
  home: string,
  implements_: ResolvedImplement[],
): McpServerConfig {
  const mcpImplements: Array<{ name: string; modulePath: string }> = [];

  for (const impl of implements_) {
    // If guild.json has a `package` field, resolve by npm package name
    // (the MCP server process uses NODE_PATH to find it in node_modules).
    // Otherwise, read the entry point from the descriptor and use the absolute file path.
    if (impl.package) {
      mcpImplements.push({ name: impl.name, modulePath: impl.package });
    } else {
      const descriptorPath = path.join(impl.path, 'nexus-implement.json');
      if (!fs.existsSync(descriptorPath)) continue;

      const descriptor = JSON.parse(fs.readFileSync(descriptorPath, 'utf-8'));
      const entry = descriptor.entry as string;
      mcpImplements.push({ name: impl.name, modulePath: path.join(impl.path, entry) });
    }
  }

  // Set NODE_PATH so the MCP server process can resolve npm-installed guild
  // tools from the guildhall's node_modules, regardless of where the MCP
  // engine code itself lives on disk.
  const nodePath = path.join(home, 'node_modules');
  return { home, implements: mcpImplements, env: { NODE_PATH: nodePath } };
}

/**
 * Manifest an anima for a session.
 *
 * This is the main entry point. Reads the anima's composition, resolves
 * implements by role, assembles the system prompt, and returns the full
 * session configuration.
 */
export async function manifest(home: string, animaName: string): Promise<ManifestResult> {
  const config = readGuildConfig(home);
  const anima = readAnima(home, animaName);

  if (anima.status !== 'active') {
    throw new Error(
      `Anima "${animaName}" is not active (status: ${anima.status}). Cannot manifest.`,
    );
  }

  // Resolve implements based on role definitions + precondition checks
  const { available, unavailable, warnings } = resolveImplements(home, config, anima.roles);

  // Read codex (guild-wide, no role filtering)
  const codex = readCodex(home);

  // Read role-specific instructions
  const roleInstructions = readRoleInstructions(home, config, anima.roles);

  // Assemble system prompt (includes role instructions and unavailability notices)
  const systemPrompt = assembleSystemPrompt(codex, roleInstructions, anima, available, unavailable);

  // Generate MCP config (only available implements)
  const mcpConfig = generateMcpConfig(home, available);

  return { anima, systemPrompt, mcpConfig, unavailable, warnings };
}
