/**
 * Manifest Engine
 *
 * The core session-setup engine. When an anima needs to be brought into
 * presence for a session, the manifest engine:
 *
 * 1. Reads the anima's composition from the Ledger (roles, curricula, temperament)
 * 2. Resolves implements — computes the union of implements across all the
 *    anima's roles (via guild.json role gating)
 * 3. Reads codex content, curricula content, temperament content, and
 *    implement instructions from disk
 * 4. Assembles the composed system prompt
 * 5. Generates an MCP server config with the resolved implement set
 *
 * The manifest engine is deterministic infrastructure — no AI involvement.
 * It reconstitutes a working identity from institutional records.
 */

import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import {
  ledgerPath,
  guildhallWorktreePath,
  readGuildConfig,
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
  /** Source: 'nexus' or 'guild'. */
  source: 'nexus' | 'guild';
  /** Version slot. */
  slot: string;
  /** Absolute path to the implement's slot directory on disk. */
  path: string;
  /** Instructions content (if instructions.md exists). */
  instructions: string | null;
}

/** The fully-resolved session configuration. */
export interface ManifestResult {
  /** The anima record from the Ledger. */
  anima: AnimaRecord;
  /** The composed system prompt for the anima. */
  systemPrompt: string;
  /** MCP server config — implements the anima has access to. */
  mcpConfig: McpServerConfig;
}

/** Configuration passed to the MCP server engine. */
export interface McpServerConfig {
  /** Absolute path to NEXUS_HOME. */
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
 * Resolve the set of implements an anima has access to, based on role gating.
 *
 * For each implement in guild.json, checks if any of the anima's roles match
 * the implement's `roles` array (or if the implement uses `["*"]` wildcard).
 * Returns the union across all roles.
 */
export function resolveImplements(
  home: string,
  config: GuildConfig,
  animaRoles: string[],
): ResolvedImplement[] {
  const worktree = guildhallWorktreePath(home);
  const resolved: ResolvedImplement[] = [];

  for (const [name, entry] of Object.entries(config.implements)) {
    const toolEntry = entry as ToolEntry;
    const entryRoles = toolEntry.roles ?? [];

    // Check role match: wildcard or intersection
    const hasAccess = entryRoles.includes('*') ||
      animaRoles.some(role => entryRoles.includes(role));

    if (!hasAccess) continue;

    // Resolve on-disk path
    const parentDir = toolEntry.source === 'nexus' ? 'nexus/implements' : 'implements';
    const implPath = path.join(worktree, parentDir, name, toolEntry.slot);

    // Read instructions if they exist
    let instructions: string | null = null;
    const descriptorPath = path.join(implPath, 'nexus-implement.json');
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

    resolved.push({
      name,
      source: toolEntry.source,
      slot: toolEntry.slot,
      path: implPath,
      instructions,
    });
  }

  return resolved;
}

/**
 * Read codex documents from the guildhall, filtered by anima roles.
 *
 * Codex layout:
 *   codex/all.md              → included for all animas
 *   codex/roles/artificer.md  → included only for animas with the 'artificer' role
 *   codex/roles/sage.md       → included only for animas with the 'sage' role
 *   codex/*.md                → any other top-level .md files included for all animas
 *
 * Role-specific codex files in codex/roles/ are only included if the anima
 * holds the matching role. The filename (minus .md) is the role name.
 */
export function readCodex(home: string, animaRoles: string[]): string {
  const worktree = guildhallWorktreePath(home);
  const codexDir = path.join(worktree, 'codex');

  if (!fs.existsSync(codexDir)) return '';

  const sections: string[] = [];

  // Read top-level .md files (included for all animas)
  for (const entry of fs.readdirSync(codexDir, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.md')) {
      const content = fs.readFileSync(path.join(codexDir, entry.name), 'utf-8').trim();
      if (content) sections.push(content);
    }
  }

  // Read role-specific files — only for roles the anima holds
  const rolesDir = path.join(codexDir, 'roles');
  if (fs.existsSync(rolesDir)) {
    for (const entry of fs.readdirSync(rolesDir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
      const roleName = entry.name.replace(/\.md$/, '');
      if (!animaRoles.includes(roleName)) continue;

      const content = fs.readFileSync(path.join(rolesDir, entry.name), 'utf-8').trim();
      if (content) sections.push(content);
    }
  }

  return sections.join('\n\n---\n\n');
}

/**
 * Assemble the composed system prompt for an anima session.
 *
 * Sections are included in order: codex → curricula → temperament → implement instructions.
 * Empty sections are omitted.
 */
export function assembleSystemPrompt(
  codex: string,
  anima: AnimaRecord,
  implements_: ResolvedImplement[],
): string {
  const sections: string[] = [];

  // Codex — guild-wide policies and procedures
  if (codex.trim()) {
    sections.push(`# Codex\n\n${codex}`);
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

  return sections.join('\n\n---\n\n');
}

/**
 * Generate the MCP server config for the resolved implement set.
 *
 * For module-kind implements, the modulePath is the package name (for framework
 * implements) or an absolute path to the handler (for guild implements).
 * For script-kind implements, the MCP engine wraps them as shell-out calls.
 */
export function generateMcpConfig(
  home: string,
  implements_: ResolvedImplement[],
): McpServerConfig {
  const mcpImplements: Array<{ name: string; modulePath: string }> = [];

  for (const impl of implements_) {
    // Read descriptor to determine kind and entry point
    const descriptorPath = path.join(impl.path, 'nexus-implement.json');
    if (!fs.existsSync(descriptorPath)) continue;

    const descriptor = JSON.parse(fs.readFileSync(descriptorPath, 'utf-8'));
    const entry = descriptor.entry as string;

    // If the descriptor has a `package` field, use that as the module path
    // (this is how framework implements reference their workspace packages).
    // Otherwise, use the absolute path to the entry point.
    const modulePath = descriptor.package
      ? descriptor.package as string
      : path.join(impl.path, entry);

    mcpImplements.push({ name: impl.name, modulePath });
  }

  // Set NODE_PATH so the MCP server process can resolve npm-installed guild
  // tools from the guildhall's node_modules, regardless of where the MCP
  // engine code itself lives on disk.
  const nodePath = path.join(guildhallWorktreePath(home), 'node_modules');
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

  // Resolve implements based on role gating
  const implements_ = resolveImplements(home, config, anima.roles);

  // Read codex (filtered by anima's roles)
  const codex = readCodex(home, anima.roles);

  // Assemble system prompt
  const systemPrompt = assembleSystemPrompt(codex, anima, implements_);

  // Generate MCP config
  const mcpConfig = generateMcpConfig(home, implements_);

  return { anima, systemPrompt, mcpConfig };
}
