import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { guildhallWorktreePath } from './nexus-home.ts';
import { readGuildConfig, writeGuildConfig } from './guild-config.ts';
import type { ToolEntry, TrainingEntry } from './guild-config.ts';

/** Descriptor file names in priority order for detection. */
const DESCRIPTOR_FILES = [
  'nexus-implement.json',
  'nexus-engine.json',
  'nexus-curriculum.json',
  'nexus-temperament.json',
] as const;

type DescriptorFile = typeof DESCRIPTOR_FILES[number];

/** Map descriptor file → artifact category in guild.json */
const CATEGORY_MAP: Record<DescriptorFile, 'implements' | 'engines' | 'curricula' | 'temperaments'> = {
  'nexus-implement.json': 'implements',
  'nexus-engine.json': 'engines',
  'nexus-curriculum.json': 'curricula',
  'nexus-temperament.json': 'temperaments',
};

/** Map category → on-disk parent directory (relative to guildhall worktree). */
const DIR_MAP: Record<string, string> = {
  implements: 'implements',
  engines: 'engines',
  curricula: 'training/curricula',
  temperaments: 'training/temperaments',
};

export interface InstallToolOptions {
  /** Absolute path to the NEXUS_HOME directory. */
  home: string;
  /** Source — currently only local directory paths. */
  source: string;
  /** Override the tool name (defaults to source directory name). */
  name?: string;
  /** Override the version slot. */
  slot?: string;
  /** Roles for implements (comma-separated or array). */
  roles?: string[];
  /**
   * Install as a framework tool (`source: 'nexus'`).
   * Installs to `nexus/implements/` or `nexus/engines/` instead of
   * guild-managed directories. Framework tools cannot be removed via remove-tool.
   */
  framework?: boolean;
  /** Whether to create a git commit after installing. Defaults to true. */
  commit?: boolean;
}

export interface InstallResult {
  category: 'implements' | 'engines' | 'curricula' | 'temperaments';
  name: string;
  slot: string;
  installedTo: string;
}

function git(args: string[], cwd: string): void {
  execFileSync('git', args, { cwd, stdio: 'pipe' });
}

/** Detect the descriptor file in a directory. Returns the filename or throws. */
function findDescriptor(dir: string): DescriptorFile {
  for (const f of DESCRIPTOR_FILES) {
    if (fs.existsSync(path.join(dir, f))) return f;
  }
  throw new Error(
    `No descriptor found in ${dir}. Expected one of: ${DESCRIPTOR_FILES.join(', ')}`,
  );
}

/** Read a JSON file, returning an empty object on missing fields. */
function readJson(filePath: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

/** Directories to skip when copying tool sources. */
const SKIP_DIRS = new Set(['node_modules', '.git']);

/** Recursively copy a directory, skipping node_modules and .git. */
function copyDir(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) {
        copyDir(srcPath, destPath);
      }
    } else if (entry.isSymbolicLink()) {
      // Resolve symlink and copy the target
      const realPath = fs.realpathSync(srcPath);
      if (fs.statSync(realPath).isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) {
          copyDir(realPath, destPath);
        }
      } else {
        fs.copyFileSync(realPath, destPath);
      }
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Install a tool (implement, engine, curriculum, or temperament) into the guild.
 *
 * Currently supports local directory sources only. Detects the descriptor type,
 * copies the directory to the correct slot, and registers in guild.json.
 */
export function installTool(opts: InstallToolOptions): InstallResult {
  const { home, source, roles, framework = false, commit = true } = opts;
  const worktree = guildhallWorktreePath(home);

  // Resolve source to absolute path
  const sourceDir = path.resolve(source);
  if (!fs.existsSync(sourceDir) || !fs.statSync(sourceDir).isDirectory()) {
    throw new Error(`Source is not a directory: ${sourceDir}`);
  }

  // Detect descriptor
  const descriptorFile = findDescriptor(sourceDir);
  const category = CATEGORY_MAP[descriptorFile];
  const descriptor = readJson(path.join(sourceDir, descriptorFile));

  // Read optional package.json for fallbacks
  const pkgJsonPath = path.join(sourceDir, 'package.json');
  const pkg = fs.existsSync(pkgJsonPath) ? readJson(pkgJsonPath) : {};

  // Resolve name: --name flag > directory basename
  const name = opts.name || path.basename(sourceDir);
  if (!name || name === '.' || name === '..') {
    throw new Error('Could not determine tool name. Use --name to specify one.');
  }

  // Resolve slot: --slot flag > descriptor version > package.json version > error
  const version = (descriptor['version'] as string | undefined)
    || (pkg['version'] as string | undefined);
  const slot = opts.slot || version;
  if (!slot) {
    throw new Error(
      'No version found in descriptor or package.json. Use --slot to specify a version slot.',
    );
  }

  // Determine target directory.
  // Framework tools go under nexus/{implements,engines}/.
  // Guild tools go under {implements,engines}/ (or training/ for curricula/temperaments).
  const parentDir = DIR_MAP[category]!;
  const prefix = framework && (category === 'implements' || category === 'engines')
    ? path.join('nexus', parentDir)
    : parentDir;
  const targetDir = path.join(worktree, prefix, name, slot);

  // Copy source to target
  if (fs.existsSync(targetDir)) {
    fs.rmSync(targetDir, { recursive: true });
  }
  copyDir(sourceDir, targetDir);

  // Register in guild.json
  const config = readGuildConfig(home);
  const now = new Date().toISOString();

  if (category === 'implements' || category === 'engines') {
    const entry: ToolEntry = {
      source: framework ? 'nexus' : 'guild',
      slot,
      upstream: null,
      installedAt: now,
    };
    if (category === 'implements' && roles && roles.length > 0) {
      entry.roles = roles;
    }
    config[category][name] = entry;
  } else {
    const entry: TrainingEntry = {
      slot,
      upstream: null,
      installedAt: now,
    };
    config[category][name] = entry;
  }

  writeGuildConfig(home, config);

  // Commit (unless suppressed — e.g. during bootstrap)
  if (commit) {
    git(['add', '-A'], worktree);
    git(['commit', '-m', `Install ${category.slice(0, -1)} ${name}@${slot}`], worktree);
  }

  return { category, name, slot, installedTo: targetDir };
}
