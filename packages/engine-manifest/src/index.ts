/**
 * Manifest Engine
 *
 * The core session-setup engine. When an anima needs to be brought into
 * presence for a session, the manifest engine:
 *
 * 1. Reads the anima's composition from the Ledger (roles, curricula, temperament)
 * 2. Resolves tools — starts with baseTools, then unions in each
 *    role's tools (validated against guild.json role definitions)
 * 3. Runs precondition checks on each resolved tool
 * 4. Reads codex content, role instructions, curricula content, temperament
 *    content, and tool instructions from disk
 * 5. Assembles the composed system prompt
 * 6. Generates an MCP server config with the available tool set
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
  resolveToolFromExport,
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

/** A resolved tool that the anima has access to. */
export interface ResolvedTool {
  /** Tool name — how the anima sees it. */
  name: string;
  /** Absolute path to the tool's directory on disk. */
  path: string;
  /** Instructions content (if instructions.md exists). */
  instructions: string | null;
  /** npm package name for runtime resolution, or null for file-path resolution. */
  package: string | null;
}

/** A tool that was resolved by role but failed precondition checks. */
export interface UnavailableTool {
  /** Tool name. */
  name: string;
  /** Human-readable reasons why the tool is unavailable. */
  reasons: string[];
}

/** The fully-resolved session configuration. */
export interface ManifestResult {
  /** The anima record from the Ledger. */
  anima: AnimaRecord;
  /** The composed system prompt for the anima. */
  systemPrompt: string;
  /** MCP server config — tools the anima has access to. */
  mcpConfig: McpServerConfig;
  /** Tools that matched the anima's roles but failed precondition checks. */
  unavailable: UnavailableTool[];
  /** Warnings generated during manifest (e.g. undefined roles). */
  warnings: string[];
}

/** Configuration passed to the MCP server engine. */
export interface McpServerConfig {
  /** Absolute path to the guild root. */
  home: string;
  /** Tools to register as MCP tools. */
  tools: Array<{ name: string; modulePath: string }>;
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
 * Resolve the set of tools an anima has access to, based on role
 * definitions and precondition checks.
 *
 * 1. Start with baseTools (available to all animas)
 * 2. For each anima role, look up the role in guild.json.roles
 *    - If defined: union in that role's tools
 *    - If undefined: warn and skip (no tools, no instructions from that role)
 * 3. Deduplicate tool names
 * 4. Resolve each tool from guild.json.tools catalog
 * 5. Run precondition checks — split into available and unavailable
 *
 * Returns available tools, unavailable tools, and any warnings.
 */
export async function resolveTools(
  home: string,
  config: GuildConfig,
  animaRoles: string[],
): Promise<{ available: ResolvedTool[]; unavailable: UnavailableTool[]; warnings: string[] }> {
  const warnings: string[] = [];

  // Collect tool names: start with base, union in role-specific
  const toolNames = new Set<string>(config.baseTools ?? []);

  for (const role of animaRoles) {
    const roleDef = config.roles[role];
    if (!roleDef) {
      warnings.push(
        `Role "${role}" is assigned to this anima but not defined in guild.json. ` +
        `No tools or instructions from this role will be available.`,
      );
      continue;
    }
    for (const toolName of roleDef.tools) {
      toolNames.add(toolName);
    }
  }

  // Resolve each tool from the catalog
  const available: ResolvedTool[] = [];
  const unavailable: UnavailableTool[] = [];

  for (const name of toolNames) {
    const entry = config.tools[name] as ToolEntry | undefined;
    if (!entry) {
      warnings.push(
        `Tool "${name}" is referenced by a role or baseTools but not found in guild.json.tools. Skipping.`,
      );
      continue;
    }

    // Resolve on-disk path
    const toolPath = path.join(home, 'tools', name);
    const descriptorPath = path.join(toolPath, 'nexus-tool.json');

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

    // Read instructions from multiple sources, in priority order:
    // 1. Descriptor file on disk (nexus-tool.json → instructions field)
    // 2. Tool definition (import module → instructions or instructionsFile)
    let instructions: string | null = null;

    // Source 1: descriptor file on disk
    if (fs.existsSync(descriptorPath)) {
      try {
        const descriptor = JSON.parse(fs.readFileSync(descriptorPath, 'utf-8'));
        if (descriptor.instructions) {
          const instructionsPath = path.join(toolPath, descriptor.instructions);
          if (fs.existsSync(instructionsPath)) {
            instructions = fs.readFileSync(instructionsPath, 'utf-8');
          }
        }
      } catch {
        // If descriptor is unreadable, skip instructions from descriptor
      }
    }

    // Source 2: tool definition (for collection packages or tools with
    // inline instructions / instructionsFile in the tool() definition)
    if (!instructions && entry.package) {
      try {
        const mod = await import(entry.package);
        const toolDef = resolveToolFromExport(mod.default, name);
        if (toolDef) {
          if (toolDef.instructions) {
            // Inline instructions text
            instructions = toolDef.instructions;
          } else if (toolDef.instructionsFile) {
            // File path relative to the package root in node_modules
            const instrPath = path.join(
              home, 'node_modules', entry.package, toolDef.instructionsFile,
            );
            if (fs.existsSync(instrPath)) {
              instructions = fs.readFileSync(instrPath, 'utf-8');
            }
          }
        }
      } catch {
        // If import fails, skip — instructions are optional
      }
    }

    available.push({
      name,
      path: toolPath,
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
 * emitted by resolveTools). Skips roles without instructions.
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
 * temperament → tool instructions → unavailable tools notice.
 * Empty sections are omitted.
 */
export function assembleSystemPrompt(
  codex: string,
  roleInstructions: string,
  anima: AnimaRecord,
  tools: ResolvedTool[],
  unavailable: UnavailableTool[] = [],
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

  // Tool instructions — guidance for each tool the anima has access to
  const toolInstructions = tools
    .filter(t => t.instructions)
    .map(t => t.instructions!);

  if (toolInstructions.length > 0) {
    sections.push(`# Tool Instructions\n\n${toolInstructions.join('\n\n---\n\n')}`);
  }

  // Unavailable tools notice — tell the anima what's broken and why
  if (unavailable.length > 0) {
    const notices = unavailable.map(u => {
      const reasons = u.reasons.map(r => `  - ${r}`).join('\n');
      return `**${u.name}** — unavailable:\n${reasons}`;
    });
    sections.push(
      `# Unavailable Tools\n\n` +
      `The following tools are registered for your roles but are currently ` +
      `unavailable due to unmet environment requirements. Do not attempt to use them. ` +
      `If a patron or operator asks you to perform work that requires these tools, ` +
      `explain what is needed to make them available.\n\n` +
      notices.join('\n\n'),
    );
  }

  return sections.join('\n\n---\n\n');
}

/**
 * Generate the MCP server config for the resolved tool set.
 *
 * For tools with a `package` field in guild.json, the modulePath is the
 * npm package name (resolved via NODE_PATH at runtime). For tools without
 * a package field, the modulePath is an absolute path to the entry point.
 */
export function generateMcpConfig(
  home: string,
  tools: ResolvedTool[],
): McpServerConfig {
  const mcpTools: Array<{ name: string; modulePath: string }> = [];

  for (const t of tools) {
    // If guild.json has a `package` field, resolve by npm package name
    // (the MCP server process uses NODE_PATH to find it in node_modules).
    // Otherwise, read the entry point from the descriptor and use the absolute file path.
    if (t.package) {
      mcpTools.push({ name: t.name, modulePath: t.package });
    } else {
      const descriptorPath = path.join(t.path, 'nexus-tool.json');
      if (!fs.existsSync(descriptorPath)) continue;

      const descriptor = JSON.parse(fs.readFileSync(descriptorPath, 'utf-8'));
      const entry = descriptor.entry as string;
      mcpTools.push({ name: t.name, modulePath: path.join(t.path, entry) });
    }
  }

  // Set NODE_PATH so the MCP server process can resolve npm-installed guild
  // tools from the guildhall's node_modules, regardless of where the MCP
  // engine code itself lives on disk.
  const nodePath = path.join(home, 'node_modules');
  return { home, tools: mcpTools, env: { NODE_PATH: nodePath } };
}

/**
 * Manifest an anima for a session.
 *
 * This is the main entry point. Reads the anima's composition, resolves
 * tools by role, assembles the system prompt, and returns the full
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

  // Resolve tools based on role definitions + precondition checks
  const { available, unavailable, warnings } = await resolveTools(home, config, anima.roles);

  // Read codex (guild-wide, no role filtering)
  const codex = readCodex(home);

  // Read role-specific instructions
  const roleInstructions = readRoleInstructions(home, config, anima.roles);

  // Assemble system prompt (includes role instructions and unavailability notices)
  const systemPrompt = assembleSystemPrompt(codex, roleInstructions, anima, available, unavailable);

  // Generate MCP config (only available tools)
  const mcpConfig = generateMcpConfig(home, available);

  return { anima, systemPrompt, mcpConfig, unavailable, warnings };
}
