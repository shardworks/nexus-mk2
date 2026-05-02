/**
 * generate-surface-map.ts
 *
 * Produce a package surface map for a Nexus monorepo at a given git SHA.
 *
 * The surface map lists every package, its source files, and each file's
 * exported symbols (names + kinds only — no signatures, no JSDoc). It is
 * intended for injection into the reader-analyst role prompt to short-
 * circuit orientation tool-calls (X018).
 *
 * Usage (run directly with node from this `scripts/` dir — the pnpm-script
 * wrapper mishandles `--` arg passing, so direct invocation is the
 * canonical interface):
 *
 *   cd experiments/X018-package-surface-map-injection/scripts
 *   node --experimental-transform-types generate-surface-map.ts
 *     [--monorepo /workspace/nexus]   default: /workspace/nexus
 *     [--sha <git-ref>]               default: HEAD of monorepo (no worktree)
 *     [--out <path>]                  default: ../artifacts/<date>-surface-map-<short-sha>.json
 *
 * The `pnpm run generate` script entry exists for the no-args case
 * (regenerate against live HEAD into the default artifact path) only.
 *
 * When --sha is provided, the script materializes the SHA via `git worktree
 * add` to a temp directory, walks it, and removes the worktree on exit.
 * The live monorepo working tree is never disturbed.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, globSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { Project, Node, SyntaxKind } from 'ts-morph';
import type { SourceFile, ExportDeclaration, ExportSpecifier } from 'ts-morph';

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

interface ExportEntry {
  name: string;
  kind: ExportKind;
  /** Module specifier for re-exports (e.g. './types'). */
  from?: string;
}

type ExportKind =
  | 'interface'
  | 'type'
  | 'class'
  | 'function'
  | 'enum'
  | 'namespace'
  | 'variable'
  | 're-export'
  | 'default';

interface FileEntry {
  path: string;
  isEntry?: true;
  exports: ExportEntry[];
}

interface PackageEntry {
  name: string;
  fileCount: number;
  files: FileEntry[];
  testFiles: string[];
}

interface SurfaceMap {
  generatedFromSha: string;
  generatedAt: string;
  monorepoRoot: string;
  packages: PackageEntry[];
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const HERE = dirname(fileURLToPath(import.meta.url));
const EXPERIMENT_ROOT = resolve(HERE, '..');

const args = parseArgs({
  options: {
    monorepo: { type: 'string', default: '/workspace/nexus' },
    sha: { type: 'string' },
    out: { type: 'string' },
    help: { type: 'boolean', short: 'h', default: false },
  },
  allowPositionals: false,
});

if (args.values.help) {
  console.log(
    [
      'generate-surface-map.ts — emit a package surface map for a Nexus monorepo SHA.',
      '',
      'Options:',
      '  --monorepo <path>   default /workspace/nexus',
      '  --sha <git-ref>     materialize via git worktree; default: live monorepo HEAD',
      '  --out <path>        default artifacts/<date>-surface-map-<short-sha>.json',
    ].join('\n'),
  );
  process.exit(0);
}

const monorepoArg = resolve(args.values.monorepo as string);

// ---------------------------------------------------------------------------
// Worktree management
// ---------------------------------------------------------------------------

/**
 * Resolve a git ref to its full SHA in the given repository.
 */
function resolveSha(repo: string, ref: string): string {
  return execFileSync('git', ['-C', repo, 'rev-parse', ref], { encoding: 'utf8' }).trim();
}

/**
 * Materialize a worktree for the given SHA, run `fn`, and clean up.
 */
function withWorktree<T>(monorepo: string, sha: string, fn: (worktreePath: string) => T): T {
  const shortSha = sha.slice(0, 12);
  const worktreePath = `/tmp/x018-surface-map-${shortSha}`;

  // If a stale worktree exists from a prior failed run, force-remove it first.
  if (existsSync(worktreePath)) {
    try {
      execFileSync('git', ['-C', monorepo, 'worktree', 'remove', '--force', worktreePath], {
        stdio: 'pipe',
      });
    } catch {
      // The dir may not be a registered worktree anymore — ignore.
    }
  }

  execFileSync('git', ['-C', monorepo, 'worktree', 'add', '--detach', worktreePath, sha], {
    stdio: 'pipe',
  });

  try {
    return fn(worktreePath);
  } finally {
    try {
      execFileSync('git', ['-C', monorepo, 'worktree', 'remove', '--force', worktreePath], {
        stdio: 'pipe',
      });
    } catch (err) {
      console.warn(`warn: failed to clean up worktree ${worktreePath}: ${(err as Error).message}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Package discovery
// ---------------------------------------------------------------------------

interface DiscoveredPackage {
  /** package.json `name` field. */
  name: string;
  /** Absolute path to the package directory. */
  dir: string;
  /** Set of source paths (relative to package dir) that are entry points per package.json `exports`/`main`. */
  entryPaths: Set<string>;
}

function discoverPackages(monorepoRoot: string): DiscoveredPackage[] {
  const manifests = globSync('packages/**/package.json', {
    cwd: monorepoRoot,
    exclude: (path: string) => path.includes('node_modules'),
  });

  const out: DiscoveredPackage[] = [];
  for (const rel of manifests) {
    const abs = join(monorepoRoot, rel);
    let pkg: { name?: string; main?: string; exports?: unknown };
    try {
      pkg = JSON.parse(readFileSync(abs, 'utf8'));
    } catch {
      continue;
    }
    if (!pkg.name) continue;

    const entryPaths = new Set<string>();
    if (typeof pkg.main === 'string') {
      entryPaths.add(normalizeEntryPath(pkg.main));
    }
    collectExportPaths(pkg.exports, entryPaths);

    out.push({
      name: pkg.name,
      dir: dirname(abs),
      entryPaths,
    });
  }

  // Deterministic order.
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

function normalizeEntryPath(p: string): string {
  // "./src/index.ts" → "src/index.ts"
  return p.replace(/^\.\//, '');
}

function collectExportPaths(exportsField: unknown, into: Set<string>): void {
  if (typeof exportsField === 'string') {
    into.add(normalizeEntryPath(exportsField));
    return;
  }
  if (exportsField && typeof exportsField === 'object') {
    for (const value of Object.values(exportsField as Record<string, unknown>)) {
      collectExportPaths(value, into);
    }
  }
}

// ---------------------------------------------------------------------------
// Source file walking
// ---------------------------------------------------------------------------

const TEST_FILE_RE = /\.test\.tsx?$/;
const DTS_RE = /\.d\.ts$/;

function listSourceFiles(packageDir: string): { sources: string[]; tests: string[] } {
  const all = globSync('src/**/*.{ts,tsx}', {
    cwd: packageDir,
    exclude: (path: string) =>
      path.includes('node_modules') ||
      path.includes('dist/') ||
      path.includes('coverage/') ||
      DTS_RE.test(path),
  });

  const sources: string[] = [];
  const tests: string[] = [];
  for (const p of all) {
    if (TEST_FILE_RE.test(p)) {
      tests.push(p);
    } else {
      sources.push(p);
    }
  }
  sources.sort();
  tests.sort();
  return { sources, tests };
}

// ---------------------------------------------------------------------------
// Export extraction
// ---------------------------------------------------------------------------

function extractExports(sourceFile: SourceFile): ExportEntry[] {
  const out: ExportEntry[] = [];

  for (const stmt of sourceFile.getStatements()) {
    // export { X } from './y'   |  export * from './y'  |  export { X }
    if (Node.isExportDeclaration(stmt)) {
      const decl = stmt as ExportDeclaration;
      const moduleSpec = decl.getModuleSpecifierValue();

      // export * from './y'
      if (decl.isNamespaceExport()) {
        out.push({ name: '*', kind: 're-export', ...(moduleSpec ? { from: moduleSpec } : {}) });
        continue;
      }

      const named = decl.getNamedExports();
      for (const spec of named as ExportSpecifier[]) {
        const exportedName = spec.getAliasNode()?.getText() ?? spec.getNameNode().getText();
        if (moduleSpec) {
          out.push({ name: exportedName, kind: 're-export', from: moduleSpec });
        } else {
          // export { X } — local re-export of an existing binding; treat as variable
          // (we don't chase the original kind to keep this single-pass and cheap).
          out.push({ name: exportedName, kind: 'variable' });
        }
      }
      continue;
    }

    // export default ...
    if (Node.isExportAssignment(stmt)) {
      out.push({ name: 'default', kind: 'default' });
      continue;
    }

    // Declarations with `export` modifier.
    if (!hasExportModifier(stmt)) continue;

    if (Node.isInterfaceDeclaration(stmt)) {
      out.push({ name: stmt.getName(), kind: 'interface' });
    } else if (Node.isTypeAliasDeclaration(stmt)) {
      out.push({ name: stmt.getName(), kind: 'type' });
    } else if (Node.isClassDeclaration(stmt)) {
      const name = stmt.getName();
      if (name) out.push({ name, kind: 'class' });
      else if (hasDefaultModifier(stmt)) out.push({ name: 'default', kind: 'default' });
    } else if (Node.isFunctionDeclaration(stmt)) {
      const name = stmt.getName();
      if (name) out.push({ name, kind: 'function' });
      else if (hasDefaultModifier(stmt)) out.push({ name: 'default', kind: 'default' });
    } else if (Node.isEnumDeclaration(stmt)) {
      out.push({ name: stmt.getName(), kind: 'enum' });
    } else if (Node.isModuleDeclaration(stmt)) {
      out.push({ name: stmt.getName(), kind: 'namespace' });
    } else if (Node.isVariableStatement(stmt)) {
      for (const d of stmt.getDeclarations()) {
        out.push({ name: d.getName(), kind: 'variable' });
      }
    }
  }

  // Stable sort: name, then kind.
  out.sort((a, b) => a.name.localeCompare(b.name) || a.kind.localeCompare(b.kind));
  return out;
}

function hasExportModifier(node: Node): boolean {
  // ts-morph exposes modifier kinds through getCombinedModifierFlags or hasModifier.
  // Use the AST kind check directly: any node with an `export` keyword has SyntaxKind.ExportKeyword in its modifiers.
  const modifiers = (node as unknown as { getModifiers?: () => Node[] }).getModifiers?.();
  if (!modifiers) return false;
  return modifiers.some((m) => m.getKind() === SyntaxKind.ExportKeyword);
}

function hasDefaultModifier(node: Node): boolean {
  const modifiers = (node as unknown as { getModifiers?: () => Node[] }).getModifiers?.();
  if (!modifiers) return false;
  return modifiers.some((m) => m.getKind() === SyntaxKind.DefaultKeyword);
}

// ---------------------------------------------------------------------------
// Map assembly
// ---------------------------------------------------------------------------

function buildPackageEntry(pkg: DiscoveredPackage): PackageEntry {
  const { sources, tests } = listSourceFiles(pkg.dir);

  // One ts-morph Project per package keeps memory bounded.
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    skipFileDependencyResolution: true,
    skipLoadingLibFiles: true,
    useInMemoryFileSystem: false,
    compilerOptions: {
      allowJs: false,
      noResolve: true,
    },
  });

  const files: FileEntry[] = [];
  for (const relPath of sources) {
    const absPath = join(pkg.dir, relPath);
    const sf = project.addSourceFileAtPath(absPath);
    const exports = extractExports(sf);
    const entry: FileEntry = { path: relPath, exports };
    if (pkg.entryPaths.has(relPath)) entry.isEntry = true;
    files.push(entry);
    // Free the source file from memory once analyzed.
    project.removeSourceFile(sf);
  }

  return {
    name: pkg.name,
    fileCount: sources.length,
    files,
    testFiles: tests,
  };
}

function buildSurfaceMap(monorepoRoot: string, sha: string): SurfaceMap {
  const packages = discoverPackages(monorepoRoot).map(buildPackageEntry);
  return {
    generatedFromSha: sha,
    generatedAt: new Date().toISOString(),
    monorepoRoot,
    packages,
  };
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

function defaultOutPath(sha: string): string {
  const date = new Date().toISOString().slice(0, 10);
  const shortSha = sha.slice(0, 12);
  return resolve(EXPERIMENT_ROOT, 'artifacts', `${date}-surface-map-${shortSha}.json`);
}

function writeOut(map: SurfaceMap, outPath: string): void {
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(map, null, 2) + '\n', 'utf8');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  const t0 = Date.now();
  const sha = resolveSha(monorepoArg, args.values.sha ?? 'HEAD');
  const outPath = args.values.out
    ? isAbsolute(args.values.out)
      ? args.values.out
      : resolve(process.cwd(), args.values.out)
    : defaultOutPath(sha);

  console.error(`monorepo: ${monorepoArg}`);
  console.error(`sha:      ${sha}`);
  console.error(`out:      ${outPath}`);

  const buildAndWrite = (root: string) => {
    const map = buildSurfaceMap(root, sha);
    writeOut(map, outPath);

    const bytes = JSON.stringify(map).length;
    const pkgCount = map.packages.length;
    const fileCount = map.packages.reduce((n, p) => n + p.fileCount, 0);
    const testCount = map.packages.reduce((n, p) => n + p.testFiles.length, 0);
    const exportCount = map.packages.reduce(
      (n, p) => n + p.files.reduce((m, f) => m + f.exports.length, 0),
      0,
    );

    console.error(
      `\nwrote ${outPath}\n` +
        `  packages:  ${pkgCount}\n` +
        `  files:     ${fileCount}\n` +
        `  testFiles: ${testCount}\n` +
        `  exports:   ${exportCount}\n` +
        `  size:      ${(bytes / 1024).toFixed(1)} KB\n` +
        `  duration:  ${((Date.now() - t0) / 1000).toFixed(1)}s`,
    );
  };

  if (args.values.sha) {
    withWorktree(monorepoArg, sha, buildAndWrite);
  } else {
    buildAndWrite(monorepoArg);
  }
}

main();
