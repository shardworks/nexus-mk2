/**
 * tighten-surface-map.ts — emit a compact textual representation of a
 * surface-map JSON artifact, intended for prompt injection.
 *
 * Three byte-shrink levers applied (X018 variant trial 2):
 *
 *   Lever 1 — drop re-export records.
 *     Re-exports are barrel-file forwards (`index.ts` re-exporting names
 *     defined in `types.ts` etc.). The original definition is already in
 *     the map under the source file with its real kind. We collapse them
 *     into a single `publicApi:` line per re-exporting file (just names,
 *     no kinds).
 *
 *   Lever 2 — flat one-line-per-kind representation.
 *     Replace JSON objects with `<kind>: name1, name2, name3` lines,
 *     grouped by export kind within each file. Cuts JSON quote/bracket
 *     overhead and gives the planner a scannable per-file view.
 *
 *   Lever 3 — strip predictable prefixes.
 *     All paths start with `src/` and end with `.ts`; both are
 *     zero-information for a TS monorepo. Drop them. Drop the
 *     `@shardworks/` package-name prefix and restate it once in the
 *     header. Drop the `-apparatus` suffix from package names.
 *
 * Kind codes:
 *   fn = function   int = interface   type = type alias
 *   cls = class     var = variable    def = default export
 *   publicApi = barrel-file re-exports (collapsed; consult the defining
 *               file for kind)
 *
 * Usage:
 *   tighten-surface-map.ts --in <map.json> --out <tight.md>
 */

import { readFile, writeFile } from 'node:fs/promises';
import { argv, exit } from 'node:process';

interface Export {
  name: string;
  kind: 'function' | 'interface' | 'type' | 'class' | 'variable' | 'default' | 're-export';
  from?: string;
}
interface FileEntry { path: string; exports: Export[] }
interface PackageEntry { name: string; fileCount: number; files: FileEntry[] }
interface SurfaceMap {
  generatedFromSha: string;
  generatedAt: string;
  monorepoRoot: string;
  packages: PackageEntry[];
}

const KIND_CODE: Record<string, string> = {
  function: 'fn',
  interface: 'int',
  type: 'type',
  class: 'cls',
  variable: 'var',
  default: 'def',
};

// ── Arg parsing ──────────────────────────────────────────────────────

function parseArgs(): { in: string; out: string } {
  const args = argv.slice(2);
  let inPath = '';
  let outPath = '';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--in') inPath = args[++i] ?? '';
    else if (args[i] === '--out') outPath = args[++i] ?? '';
    else if (args[i] === '-h' || args[i] === '--help') {
      console.error('usage: tighten-surface-map.ts --in <map.json> --out <tight.md>');
      exit(0);
    }
  }
  if (!inPath || !outPath) {
    console.error('usage: tighten-surface-map.ts --in <map.json> --out <tight.md>');
    exit(2);
  }
  return { in: inPath, out: outPath };
}

// ── Path / name normalization (Lever 3) ──────────────────────────────

function tightPath(path: string): string {
  return path.replace(/^src\//, '').replace(/\.ts$/, '');
}

function tightPackageName(name: string): string {
  return name.replace(/^@shardworks\//, '').replace(/-apparatus$/, '');
}

// ── Per-file rendering ──────────────────────────────────────────────

function renderFile(file: FileEntry): string {
  // Lever 1: split re-exports out into a single publicApi line.
  const reExports: string[] = [];
  const byKind = new Map<string, string[]>();

  // Sort exports by name within each kind for deterministic output.
  const sortedExports = [...file.exports].sort((a, b) => a.name.localeCompare(b.name));

  for (const exp of sortedExports) {
    if (exp.kind === 're-export') {
      reExports.push(exp.name);
      continue;
    }
    const code = KIND_CODE[exp.kind];
    if (!code) continue; // unknown kind — skip rather than fabricate
    if (!byKind.has(code)) byKind.set(code, []);
    byKind.get(code)!.push(exp.name);
  }

  const lines: string[] = [];
  lines.push(`  ${tightPath(file.path)}`);

  // Lever 2: one line per kind, comma-separated names.
  // Order: structural types first, then implementations, then values.
  const kindOrder = ['int', 'type', 'cls', 'fn', 'def', 'var'];
  for (const code of kindOrder) {
    const names = byKind.get(code);
    if (names && names.length > 0) {
      lines.push(`    ${code}: ${names.join(', ')}`);
    }
  }
  if (reExports.length > 0) {
    lines.push(`    publicApi: ${reExports.join(', ')}`);
  }

  return lines.join('\n');
}

function renderPackage(pkg: PackageEntry): string {
  const sortedFiles = [...pkg.files].sort((a, b) => a.path.localeCompare(b.path));
  const lines: string[] = [];
  lines.push(`${tightPackageName(pkg.name)} (${pkg.fileCount} files)`);
  for (const file of sortedFiles) {
    if (file.exports.length === 0) continue; // skip silent files
    lines.push(renderFile(file));
  }
  return lines.join('\n');
}

function countExports(map: SurfaceMap, kind: 'all' | 'own'): number {
  let n = 0;
  for (const pkg of map.packages) {
    for (const file of pkg.files) {
      for (const exp of file.exports) {
        if (kind === 'all') n++;
        else if (exp.kind !== 're-export') n++;
      }
    }
  }
  return n;
}

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs();
  const map: SurfaceMap = JSON.parse(await readFile(args.in, 'utf8'));

  const totalExports = countExports(map, 'all');
  const ownExports = countExports(map, 'own');
  const totalFiles = map.packages.reduce((n, p) => n + p.files.length, 0);

  const header = [
    `PACKAGE SURFACE MAP — codex ${map.generatedFromSha.slice(0, 8)}`,
    `${map.packages.length} packages, ${totalFiles} files, ${ownExports} own exports (${totalExports - ownExports} re-exports collapsed)`,
    'Path convention: src/ prefix and .ts suffix stripped; @shardworks/ and -apparatus stripped from package names.',
    'Kinds: fn=function, int=interface, type=type-alias, cls=class, var=variable, def=default-export',
    'publicApi: lists names re-exported by a barrel file (defined elsewhere in this map; consult the defining file for kind).',
  ].join('\n');

  const sortedPackages = [...map.packages].sort((a, b) => a.name.localeCompare(b.name));
  const body = sortedPackages.map(renderPackage).join('\n\n');

  const text = `${header}\n\n${body}\n`;
  await writeFile(args.out, text, 'utf8');

  const bytes = Buffer.byteLength(text, 'utf8');
  const lines = text.split('\n').length;
  // eslint-disable-next-line no-console
  console.error(`wrote ${args.out}\n  bytes:    ${bytes}\n  lines:    ${lines}\n  packages: ${map.packages.length}\n  files:    ${totalFiles}\n  own exports: ${ownExports}\n  re-exports collapsed: ${totalExports - ownExports}`);
}

main().catch((err) => {
  console.error(err);
  exit(1);
});
