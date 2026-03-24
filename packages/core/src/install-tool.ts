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

/** Map descriptor file -> artifact category in guild.json */
const CATEGORY_MAP: Record<DescriptorFile, 'implements' | 'engines' | 'curricula' | 'temperaments'> = {
  'nexus-implement.json': 'implements',
  'nexus-engine.json': 'engines',
  'nexus-curriculum.json': 'curricula',
  'nexus-temperament.json': 'temperaments',
};

/** Map category -> on-disk parent directory (relative to guildhall worktree). */
const DIR_MAP: Record<string, string> = {
  implements: 'implements',
  engines: 'engines',
  curricula: 'training/curricula',
  temperaments: 'training/temperaments',
};

/**
 * How the source was classified for installation.
 *
 * - `npm-local`    — local directory with package.json; npm install (copy) or symlink
 * - `npm-registry` — npm package specifier (e.g. `foo@1.0`, `@scope/tool`)
 * - `npm-tarball`  — local .tgz/.tar.gz file
 * - `bare-local`   — local directory without package.json; plain file copy
 */
export type SourceKind = 'npm-local' | 'npm-registry' | 'npm-tarball' | 'bare-local';

export interface InstallToolOptions {
  /** Absolute path to the NEXUS_HOME directory. */
  home: string;
  /**
   * Source — local directory path, npm package specifier, or tarball path.
   *
   * - Local directory with `package.json`: installed via npm (copy) or symlink (`link: true`)
   * - Local directory without `package.json`: copied as bare files (no dep resolution)
   * - `.tgz` / `.tar.gz` file: installed via npm
   * - Anything else: treated as an npm registry specifier
   */
  source: string;
  /** Override the tool name (defaults to package name or directory basename). */
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
  /**
   * Symlink a local directory instead of copying (dev mode).
   * Only valid for local directories with `package.json`.
   * Changes to the source are reflected immediately at runtime.
   */
  link?: boolean;
}

export interface InstallResult {
  category: 'implements' | 'engines' | 'curricula' | 'temperaments';
  name: string;
  slot: string;
  installedTo: string;
  sourceKind: SourceKind;
}

function git(args: string[], cwd: string): void {
  execFileSync('git', args, { cwd, stdio: 'pipe' });
}

function npm(args: string[], cwd: string): string {
  return execFileSync('npm', args, { cwd, stdio: 'pipe', encoding: 'utf-8' });
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

/** Read a JSON file. */
function readJson(filePath: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

/** Write a JSON file. */
function writeJson(filePath: string, data: Record<string, unknown>): void {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
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
 * Copy only the metadata files (descriptor + instructions) from a source
 * directory into the guildhall slot. This is used for npm-installed tools
 * where the runtime code lives in node_modules but the metadata needs to
 * be git-tracked in the guildhall.
 */
function copyMetadata(sourceDir: string, targetDir: string, descriptorFile: string, descriptor: Record<string, unknown>): void {
  fs.mkdirSync(targetDir, { recursive: true });

  // Always copy the descriptor
  fs.copyFileSync(path.join(sourceDir, descriptorFile), path.join(targetDir, descriptorFile));

  // Copy instructions if referenced
  const instructionsFile = descriptor['instructions'] as string | undefined;
  if (instructionsFile) {
    const instrPath = path.join(sourceDir, instructionsFile);
    if (fs.existsSync(instrPath)) {
      fs.copyFileSync(instrPath, path.join(targetDir, instructionsFile));
    }
  }
}

/**
 * Classify a source string to determine the installation method.
 */
export function classifySource(source: string): SourceKind {
  // Tarball detection
  if (source.endsWith('.tgz') || source.endsWith('.tar.gz')) {
    return 'npm-tarball';
  }

  // Local path detection: starts with /, ./, ../, or is an absolute path on the system
  const isPath = source.startsWith('/') || source.startsWith('./') || source.startsWith('../');
  if (isPath || path.isAbsolute(source)) {
    const resolved = path.resolve(source);
    if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
      // Check for package.json to distinguish npm-local from bare-local
      if (fs.existsSync(path.join(resolved, 'package.json'))) {
        return 'npm-local';
      }
      return 'bare-local';
    }
    // Path-like but not a directory — could be a nonexistent path (error later)
    // or a relative tarball handled above. Treat as bare-local for error messaging.
    return 'bare-local';
  }

  // Everything else is an npm registry specifier
  return 'npm-registry';
}

/**
 * Resolve the installed package directory in node_modules after npm install.
 * Reads the package name from the source (or node_modules) and returns the path.
 */
function resolveInstalledPackage(worktree: string, packageName: string): string {
  const pkgDir = path.join(worktree, 'node_modules', packageName);
  if (!fs.existsSync(pkgDir)) {
    // Handle scoped packages — npm might nest them
    throw new Error(`Could not find installed package at ${pkgDir}`);
  }
  return pkgDir;
}

/**
 * Read the package name from a package.json file.
 */
function readPackageName(dir: string): string {
  const pkgPath = path.join(dir, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    throw new Error(`No package.json found in ${dir}`);
  }
  const pkg = readJson(pkgPath);
  const name = pkg['name'] as string | undefined;
  if (!name) {
    throw new Error(`No "name" field in ${pkgPath}`);
  }
  return name;
}

// ── Install paths ───────────────────────────────────────────────────────

/**
 * Install via npm (covers local dirs with package.json, registry specifiers, and tarballs).
 * Runs `npm install --save <source>` in the guildhall worktree, then copies
 * metadata (descriptor + instructions) to the guildhall slot for git tracking.
 */
function installViaNpm(
  worktree: string,
  source: string,
  sourceKind: SourceKind,
): { packageName: string; packageDir: string; descriptorFile: DescriptorFile; descriptor: Record<string, unknown>; pkg: Record<string, unknown> } {
  // For local dirs, resolve to absolute path so npm gets a valid reference
  const npmSource = sourceKind === 'npm-local'
    ? path.resolve(source)
    : source;

  npm(['install', '--save', npmSource], worktree);

  // Determine the package name
  let packageName: string;
  if (sourceKind === 'npm-local') {
    packageName = readPackageName(path.resolve(source));
  } else if (sourceKind === 'npm-tarball') {
    // For tarballs, read the name from the installed package
    // npm outputs the package name during install, but parsing the
    // guildhall package.json dependencies is more reliable
    const guildhallPkg = readJson(path.join(worktree, 'package.json'));
    const deps = guildhallPkg['dependencies'] as Record<string, string> | undefined ?? {};
    // The most recently added dependency is our package
    const depNames = Object.keys(deps);
    packageName = depNames[depNames.length - 1];
    if (!packageName) {
      throw new Error('Could not determine package name after npm install');
    }
  } else {
    // Registry specifier — strip version suffix to get the package name
    // e.g. "foo@1.0" -> "foo", "@scope/foo@1.0" -> "@scope/foo"
    packageName = source.replace(/@[^/]*$/, '');
    // Handle bare names without version
    if (packageName === source && source.includes('@') && !source.startsWith('@')) {
      packageName = source.split('@')[0];
    }
    // Scoped packages: @scope/name@version
    if (source.startsWith('@') && source.lastIndexOf('@') > 0) {
      packageName = source.substring(0, source.lastIndexOf('@'));
    }
  }

  const packageDir = resolveInstalledPackage(worktree, packageName);
  const descriptorFile = findDescriptor(packageDir);
  const descriptor = readJson(path.join(packageDir, descriptorFile));
  const pkg = readJson(path.join(packageDir, 'package.json'));

  return { packageName, packageDir, descriptorFile, descriptor, pkg };
}

/**
 * Install via symlink (dev mode for local dirs with package.json).
 * Creates a symlink in guildhall/node_modules pointing to the source directory.
 */
function installViaLink(
  worktree: string,
  source: string,
): { packageName: string; packageDir: string; descriptorFile: DescriptorFile; descriptor: Record<string, unknown>; pkg: Record<string, unknown> } {
  const sourceDir = path.resolve(source);
  const packageName = readPackageName(sourceDir);

  // Ensure node_modules exists
  const nodeModulesDir = path.join(worktree, 'node_modules');
  fs.mkdirSync(nodeModulesDir, { recursive: true });

  // Handle scoped packages: @scope/name needs @scope/ directory
  const linkTarget = path.join(nodeModulesDir, packageName);
  fs.mkdirSync(path.dirname(linkTarget), { recursive: true });

  // Remove existing link/directory if present
  if (fs.existsSync(linkTarget)) {
    fs.rmSync(linkTarget, { recursive: true });
  }

  fs.symlinkSync(sourceDir, linkTarget, 'dir');

  const descriptorFile = findDescriptor(sourceDir);
  const descriptor = readJson(path.join(sourceDir, descriptorFile));
  const pkg = readJson(path.join(sourceDir, 'package.json'));

  return { packageName, packageDir: sourceDir, descriptorFile, descriptor, pkg };
}

// ── Main ────────────────────────────────────────────────────────────────

/**
 * Install a tool (implement, engine, curriculum, or temperament) into the guild.
 *
 * Supports multiple source types:
 * - Local directory with package.json: installed via npm (or symlinked with `link: true`)
 * - Local directory without package.json: copied as bare files
 * - npm registry specifier: installed via npm
 * - Tarball (.tgz): installed via npm
 *
 * For npm-installed tools, the runtime code lives in the guildhall's node_modules.
 * Metadata (descriptor + instructions) is copied to the guildhall slot for git tracking.
 * The descriptor's `package` field is set so the manifest engine resolves by package name.
 */
export function installTool(opts: InstallToolOptions): InstallResult {
  const { home, source, roles, framework = false, commit = true, link = false } = opts;
  const worktree = guildhallWorktreePath(home);
  const sourceKind = classifySource(source);

  // Validate link option
  if (link && sourceKind !== 'npm-local') {
    throw new Error('The --link option is only valid for local directories with a package.json.');
  }

  let descriptorFile: DescriptorFile;
  let descriptor: Record<string, unknown>;
  let pkg: Record<string, unknown>;
  let packageName: string | null = null;
  let isNpmInstalled = false;

  if (sourceKind === 'bare-local' || framework) {
    // ── Bare local or framework: copy files directly ──────────────────
    // Framework tools always use copyDir — they resolve by package name
    // at runtime (via the `package` field in their descriptors) and don't
    // need npm installation in the guildhall.
    const sourceDir = path.resolve(source);
    if (!fs.existsSync(sourceDir) || !fs.statSync(sourceDir).isDirectory()) {
      throw new Error(`Source is not a directory: ${sourceDir}`);
    }

    descriptorFile = findDescriptor(sourceDir);
    descriptor = readJson(path.join(sourceDir, descriptorFile));
    const pkgJsonPath = path.join(sourceDir, 'package.json');
    pkg = fs.existsSync(pkgJsonPath) ? readJson(pkgJsonPath) : {};
  } else if (link) {
    // ── Link mode: symlink local dir ──────────────────────────────────
    const result = installViaLink(worktree, source);
    descriptorFile = result.descriptorFile;
    descriptor = result.descriptor;
    pkg = result.pkg;
    packageName = result.packageName;
    isNpmInstalled = true;
  } else {
    // ── npm install: local dir, registry, or tarball ──────────────────
    const result = installViaNpm(worktree, source, sourceKind);
    descriptorFile = result.descriptorFile;
    descriptor = result.descriptor;
    pkg = result.pkg;
    packageName = result.packageName;
    isNpmInstalled = true;
  }

  const category = CATEGORY_MAP[descriptorFile];

  // Resolve name: --name flag > package name > directory basename
  const name = opts.name
    || (packageName ? packageName.replace(/^@[^/]+\//, '') : null)
    || path.basename(path.resolve(source));
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

  // Determine target directory for metadata/files in the guildhall.
  // Framework tools go under nexus/{implements,engines}/.
  // Guild tools go under {implements,engines}/ (or training/ for curricula/temperaments).
  const parentDir = DIR_MAP[category]!;
  const prefix = framework && (category === 'implements' || category === 'engines')
    ? path.join('nexus', parentDir)
    : parentDir;
  const targetDir = path.join(worktree, prefix, name, slot);

  if (isNpmInstalled) {
    // npm-installed: copy only metadata to the guildhall slot, set package field
    const pkgSourceDir = link
      ? path.resolve(source)
      : resolveInstalledPackage(worktree, packageName!);

    if (fs.existsSync(targetDir)) {
      fs.rmSync(targetDir, { recursive: true });
    }
    copyMetadata(pkgSourceDir, targetDir, descriptorFile, descriptor);

    // Write package field into the slot's descriptor so the manifest engine
    // resolves by package name at runtime (from guildhall's node_modules).
    const slotDescriptor = readJson(path.join(targetDir, descriptorFile));
    slotDescriptor['package'] = packageName;
    writeJson(path.join(targetDir, descriptorFile), slotDescriptor);
  } else {
    // Bare local or framework: copy entire source directory
    if (fs.existsSync(targetDir)) {
      fs.rmSync(targetDir, { recursive: true });
    }
    copyDir(path.resolve(source), targetDir);

    // For sources with a package.json, write the package name into the slot
    // descriptor so the manifest engine resolves by package name at runtime.
    // This covers framework tools (which always have package.json) and any
    // bare-local tools that happen to be proper npm packages.
    const sourcePkgPath = path.join(path.resolve(source), 'package.json');
    if (fs.existsSync(sourcePkgPath)) {
      const sourcePkg = readJson(sourcePkgPath);
      const sourcePkgName = sourcePkg['name'] as string | undefined;
      if (sourcePkgName) {
        const slotDescriptor = readJson(path.join(targetDir, descriptorFile));
        slotDescriptor['package'] = sourcePkgName;
        writeJson(path.join(targetDir, descriptorFile), slotDescriptor);
      }
    }
  }

  // Register in guild.json
  const config = readGuildConfig(home);
  const now = new Date().toISOString();

  if (category === 'implements' || category === 'engines') {
    const entry: ToolEntry = {
      source: framework ? 'nexus' : 'guild',
      slot,
      upstream: isNpmInstalled ? `${packageName}@${slot}` : null,
      installedAt: now,
    };
    if (category === 'implements' && roles && roles.length > 0) {
      entry.roles = roles;
    }
    config[category][name] = entry;
  } else {
    const entry: TrainingEntry = {
      slot,
      upstream: isNpmInstalled ? `${packageName}@${slot}` : null,
      installedAt: now,
    };
    config[category][name] = entry;
  }

  writeGuildConfig(home, config);

  // Commit (unless suppressed -- e.g. during bootstrap)
  if (commit) {
    git(['add', '-A'], worktree);
    git(['commit', '-m', `Install ${category.slice(0, -1)} ${name}@${slot}`], worktree);
  }

  return { category, name, slot, installedTo: targetDir, sourceKind };
}
