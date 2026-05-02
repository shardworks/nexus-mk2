/**
 * generate-reverse-usage-index.ts
 *
 * Produce a reverse usage index for a Nexus monorepo at a given git SHA.
 *
 * The index is keyed by exported symbol name. Each entry holds the
 * declaration site (file/line/signature/JSDoc) plus an array of
 * references across the monorepo (file/line/kind, with isCrossPackage
 * and inTest flags). The artifact backs the X019 `code-lookup` MCP tool's
 * three modes (`symbol`, `usages`, `package`).
 *
 * Schema (compact: file paths interned in `files[]`, short ref keys,
 * false flags omitted; symbols-as-arrays handles name collisions):
 *
 *   {
 *     "generatedFromSha": "<sha>",
 *     "generatedAt": "<iso>",
 *     "monorepoRoot": "<path>",
 *     "files": ["packages/.../foo.ts", ...],
 *     "symbols": {
 *       "ensureBook": [
 *         {
 *           "package": "@shardworks/nexus-stacks",
 *           "kind": "function",
 *           "definedAt": [<fileId>, <line>],
 *           "signature": "function ensureBook<T>(...)",
 *           "doc": "...",
 *           "references": [
 *             { "f": 3, "l": 67, "k": "call", "x": 1, "t": 1 }
 *             // f: file id, l: line, k: kind,
 *             // x (optional, =1): cross-package, t (optional, =1): in test
 *           ]
 *         }
 *       ]
 *     },
 *     "packages": {
 *       "@shardworks/nexus-stacks": { "symbols": ["ensureBook", ...] }
 *     }
 *   }
 *
 * Anonymous `export default <expr>` ExportAssignments (no underlying
 * named declaration) are excluded — they produce no useful name-keyed
 * lookup entry.
 *
 * Usage (run directly with node from this `scripts/` dir):
 *
 *   cd experiments/X019-reverse-usage-index/scripts
 *   node --experimental-transform-types generate-reverse-usage-index.ts
 *     [--monorepo /workspace/nexus]   default: /workspace/nexus
 *     [--sha <git-ref>]               default: HEAD of monorepo (no worktree)
 *     [--out <path>]                  default: ../artifacts/<date>-reverse-usage-index-<short-sha>.json
 *
 * When --sha is provided, the script materializes the SHA via `git
 * worktree add` to a temp directory, walks it, and removes the worktree
 * on exit. The live monorepo working tree is never disturbed.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, globSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { Project, Node, SyntaxKind } from 'ts-morph';
import type { SourceFile, Identifier, Symbol as TsmSymbol } from 'ts-morph';

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

type SymbolKind =
  | 'interface'
  | 'type'
  | 'class'
  | 'function'
  | 'enum'
  | 'namespace'
  | 'variable'
  | 'default';

type ReferenceKind =
  | 'import'
  | 're-export'
  | 'call'
  | 'instantiation'
  | 'type-reference'
  | 'extends'
  | 'implements'
  | 'jsx'
  | 'decorator'
  | 'typeof'
  | 'reference';

/** Compact reference entry. False flags are omitted. */
interface ReferenceEntry {
  /** File id (index into top-level `files`). */
  f: number;
  /** 1-based line number. */
  l: number;
  /** Reference kind. */
  k: ReferenceKind;
  /** Cross-package flag. Omitted when false. */
  x?: 1;
  /** In-test-file flag. Omitted when false. */
  t?: 1;
}

interface SymbolEntry {
  package: string;
  kind: SymbolKind;
  /** [fileId, line] tuple. */
  definedAt: [number, number];
  signature: string;
  doc?: string;
  references: ReferenceEntry[];
}

interface PackageEntry {
  symbols: string[];
}

interface ReverseUsageIndex {
  generatedFromSha: string;
  generatedAt: string;
  monorepoRoot: string;
  files: string[];
  symbols: Record<string, SymbolEntry[]>;
  packages: Record<string, PackageEntry>;
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
      'generate-reverse-usage-index.ts — emit a reverse usage index for a Nexus monorepo SHA.',
      '',
      'Options:',
      '  --monorepo <path>   default /workspace/nexus',
      '  --sha <git-ref>     materialize via git worktree; default: live monorepo HEAD',
      '  --out <path>        default artifacts/<date>-reverse-usage-index-<short-sha>.json',
    ].join('\n'),
  );
  process.exit(0);
}

const monorepoArg = resolve(args.values.monorepo as string);

// ---------------------------------------------------------------------------
// Worktree management
// ---------------------------------------------------------------------------

function resolveSha(repo: string, ref: string): string {
  return execFileSync('git', ['-C', repo, 'rev-parse', ref], { encoding: 'utf8' }).trim();
}

function withWorktree<T>(monorepo: string, sha: string, fn: (worktreePath: string) => T): T {
  const shortSha = sha.slice(0, 12);
  const worktreePath = `/tmp/x019-reverse-usage-index-${shortSha}`;

  if (existsSync(worktreePath)) {
    try {
      execFileSync('git', ['-C', monorepo, 'worktree', 'remove', '--force', worktreePath], {
        stdio: 'pipe',
      });
    } catch {
      // Ignore — may not be a registered worktree anymore.
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
  /** Path relative to monorepo root (e.g. `packages/framework/core`). */
  relDir: string;
  /**
   * Import-key → relative-source-path mappings derived from the
   * package's dev-time `exports` field. Used to populate compiler
   * `paths` so the language service resolves cross-package imports
   * even in a fresh worktree (no node_modules).
   *
   * Example: `{"@shardworks/clerk-apparatus": "packages/plugins/clerk/src/index.ts",
   *           "@shardworks/clerk-apparatus/testing": "packages/plugins/clerk/src/testing.ts"}`
   */
  pathMappings: Record<string, string>;
}

function discoverPackages(monorepoRoot: string): DiscoveredPackage[] {
  const manifests = globSync('packages/**/package.json', {
    cwd: monorepoRoot,
    exclude: (path: string) => path.includes('node_modules'),
  });

  const out: DiscoveredPackage[] = [];
  for (const rel of manifests) {
    const abs = join(monorepoRoot, rel);
    let pkg: { name?: string; exports?: unknown; main?: string };
    try {
      pkg = JSON.parse(readFileSync(abs, 'utf8'));
    } catch {
      continue;
    }
    if (!pkg.name) continue;

    const pkgDir = dirname(abs);
    const relDir = relative(monorepoRoot, pkgDir);

    // Build path mappings from package.json `exports` (dev-time form
    // points at `./src/*.ts`). Falls back to `main` if no exports.
    const pathMappings: Record<string, string> = {};
    const addMapping = (subpath: string, targetRel: string) => {
      const importKey = subpath === '.' ? pkg.name! : `${pkg.name!}${subpath.slice(1)}`;
      const normalized = targetRel.replace(/^\.\//, '');
      pathMappings[importKey] = `${relDir}/${normalized}`;
    };
    if (pkg.exports && typeof pkg.exports === 'object') {
      for (const [subpath, value] of Object.entries(pkg.exports as Record<string, unknown>)) {
        if (typeof value === 'string') {
          addMapping(subpath, value);
        } else if (value && typeof value === 'object') {
          // Conditional exports: prefer `import`, then `types`, then `default`.
          const v = value as Record<string, string>;
          const tgt = v.import ?? v.types ?? v.default;
          if (typeof tgt === 'string') addMapping(subpath, tgt);
        }
      }
    } else if (typeof pkg.exports === 'string') {
      addMapping('.', pkg.exports);
    } else if (typeof pkg.main === 'string') {
      addMapping('.', pkg.main);
    }

    out.push({
      name: pkg.name,
      dir: pkgDir,
      relDir,
      pathMappings,
    });
  }

  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

// ---------------------------------------------------------------------------
// Source file walking
// ---------------------------------------------------------------------------

const TEST_FILE_RE = /\.test\.tsx?$/;
const DTS_RE = /\.d\.ts$/;

interface SourceFileInfo {
  /** Absolute path. */
  abs: string;
  /** Path relative to monorepo root. */
  rel: string;
  /** Owning package's `name`. */
  packageName: string;
  /** True for `*.test.ts(x)` files. */
  isTest: boolean;
}

function listSourceFiles(monorepoRoot: string, packages: DiscoveredPackage[]): SourceFileInfo[] {
  const out: SourceFileInfo[] = [];
  for (const pkg of packages) {
    const all = globSync('src/**/*.{ts,tsx}', {
      cwd: pkg.dir,
      exclude: (path: string) =>
        path.includes('node_modules') ||
        path.includes('dist/') ||
        path.includes('coverage/') ||
        DTS_RE.test(path),
    });
    for (const p of all) {
      const abs = join(pkg.dir, p);
      out.push({
        abs,
        rel: relative(monorepoRoot, abs),
        packageName: pkg.name,
        isTest: TEST_FILE_RE.test(p),
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Symbol enumeration (exported declarations)
// ---------------------------------------------------------------------------

/**
 * Internal-only rich reference (pre-compaction, with full file path
 * and boolean flags). Compacted at assembly time.
 */
interface RichReference {
  file: string;
  line: number;
  kind: ReferenceKind;
  isCrossPackage: boolean;
  inTest: boolean;
}

/**
 * A registered exported declaration. Keyed in `defByDecl` by the
 * declaration node's compiler-node pointer so that, during reference
 * walking, we can look up which export a definition node belongs to.
 */
interface RegisteredDeclaration {
  name: string;
  packageName: string;
  /** The declaration node itself (function/class/interface/etc.). */
  declNode: Node;
  /** The name identifier on the declaration. May be undefined for `export default <expr>`. */
  nameNode?: Node;
  kind: SymbolKind;
  /** File path relative to monorepo root. */
  file: string;
  /** 1-based line number. */
  line: number;
  signature: string;
  doc?: string;
  /** Reference list, populated during walking phase. */
  references: RichReference[];
  /** De-dup set of `${file}:${line}:${kind}` to avoid double-counting at one site. */
  refKeys: Set<string>;
}

function getJsDoc(node: Node): string | undefined {
  // ts-morph: many declarations expose getJsDocs()
  const withJsDocs = node as unknown as { getJsDocs?: () => Array<{ getInnerText: () => string }> };
  const docs = withJsDocs.getJsDocs?.();
  if (!docs || docs.length === 0) return undefined;
  return docs.map((d) => d.getInnerText().trim()).join('\n\n').trim() || undefined;
}

/**
 * Get a single-line signature for a declaration.
 *
 * For function/class/interface/enum/namespace declarations we cut at
 * the body's opening brace — the header line carries name + params /
 * type-params / extends-clause but not member bodies. For type aliases
 * and variable statements we keep the full RHS (it's already compact
 * by definition).
 *
 * Newlines are collapsed to single spaces.
 */
function getSignature(node: Node): string {
  let text = node.getText();

  // Strip leading JSDoc — ts-morph sometimes includes preceding comments.
  text = text.replace(/^\s*\/\*\*[\s\S]*?\*\/\s*/, '');

  // Cut at the body's opening brace for declarations whose body would
  // otherwise dominate the signature.
  if (
    Node.isFunctionDeclaration(node) ||
    Node.isClassDeclaration(node) ||
    Node.isMethodDeclaration(node) ||
    Node.isInterfaceDeclaration(node) ||
    Node.isEnumDeclaration(node) ||
    Node.isModuleDeclaration(node)
  ) {
    const braceIdx = text.indexOf('{');
    if (braceIdx > 0) text = text.slice(0, braceIdx).trimEnd();
  }

  // Collapse internal whitespace.
  return text.replace(/\s+/g, ' ').trim();
}

function classifySymbolKind(node: Node, isDefault: boolean): SymbolKind {
  if (isDefault) return 'default';
  if (Node.isInterfaceDeclaration(node)) return 'interface';
  if (Node.isTypeAliasDeclaration(node)) return 'type';
  if (Node.isClassDeclaration(node)) return 'class';
  if (Node.isFunctionDeclaration(node)) return 'function';
  if (Node.isEnumDeclaration(node)) return 'enum';
  if (Node.isModuleDeclaration(node)) return 'namespace';
  return 'variable';
}

function hasModifier(node: Node, kind: SyntaxKind): boolean {
  const modifiers = (node as unknown as { getModifiers?: () => Node[] }).getModifiers?.();
  if (!modifiers) return false;
  return modifiers.some((m) => m.getKind() === kind);
}

/**
 * Walk a source file's top-level statements and register each export.
 *
 * Returns the new RegisteredDeclaration list for this file.
 */
function collectExports(
  sf: SourceFile,
  packageName: string,
  monorepoRoot: string,
): RegisteredDeclaration[] {
  const out: RegisteredDeclaration[] = [];
  const fileRel = relative(monorepoRoot, sf.getFilePath());

  for (const stmt of sf.getStatements()) {
    // Pure re-exports: `export { X } from './y'` or `export * from './y'`.
    // We do NOT register these as defining sites; they'll show up as
    // re-export references instead, pointing at the original definition.
    if (Node.isExportDeclaration(stmt)) continue;

    // `export default <expr>` (ExportAssignment). Skipped — the bare
    // name "default" is a useless lookup key, and the underlying
    // expression is usually a local binding that's already exported by
    // its own declaration site.
    if (Node.isExportAssignment(stmt)) continue;

    // Decls with `export` modifier.
    if (!hasModifier(stmt, SyntaxKind.ExportKeyword)) continue;
    const isDefault = hasModifier(stmt, SyntaxKind.DefaultKeyword);

    if (
      Node.isInterfaceDeclaration(stmt) ||
      Node.isTypeAliasDeclaration(stmt) ||
      Node.isEnumDeclaration(stmt) ||
      Node.isModuleDeclaration(stmt)
    ) {
      const nameNode = stmt.getNameNode();
      const name = stmt.getName();
      out.push({
        name: typeof name === 'string' ? name : nameNode.getText(),
        packageName,
        declNode: stmt,
        nameNode,
        kind: classifySymbolKind(stmt, false),
        file: fileRel,
        line: stmt.getStartLineNumber(),
        signature: getSignature(stmt),
        doc: getJsDoc(stmt),
        references: [],
        refKeys: new Set(),
      });
    } else if (Node.isClassDeclaration(stmt) || Node.isFunctionDeclaration(stmt)) {
      const nameNode = stmt.getNameNode();
      const name = stmt.getName();
      // Anonymous default class/function (e.g. `export default class {}`)
      // gets no useful name — skip rather than collapse under "default".
      if (!name) continue;
      out.push({
        name,
        packageName,
        declNode: stmt,
        nameNode: nameNode ?? undefined,
        kind: classifySymbolKind(stmt, isDefault),
        file: fileRel,
        line: stmt.getStartLineNumber(),
        signature: getSignature(stmt),
        doc: getJsDoc(stmt),
        references: [],
        refKeys: new Set(),
      });
    } else if (Node.isVariableStatement(stmt)) {
      // `export const x = ..., y = ...` — emit one per declarator.
      const doc = getJsDoc(stmt);
      const sig = getSignature(stmt);
      for (const d of stmt.getDeclarations()) {
        const nameNode = d.getNameNode();
        // Ignore destructuring patterns — they don't expose a single name.
        if (!Node.isIdentifier(nameNode)) continue;
        out.push({
          name: nameNode.getText(),
          packageName,
          declNode: d,
          nameNode,
          kind: 'variable',
          file: fileRel,
          line: d.getStartLineNumber(),
          signature: sig,
          doc,
          references: [],
          refKeys: new Set(),
        });
      }
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// Reference walking
// ---------------------------------------------------------------------------

/**
 * Determine the reference kind from an identifier's surrounding AST.
 *
 * `id` is the identifier node we're classifying. We walk up to the
 * meaningful parent and inspect its kind.
 */
function classifyReference(id: Identifier): ReferenceKind {
  const parent = id.getParent();
  if (!parent) return 'reference';

  // Imports
  if (Node.isImportSpecifier(parent) || Node.isImportClause(parent) || Node.isNamespaceImport(parent)) {
    return 'import';
  }
  // Re-exports: `export { X } from '...'` or `export { X }` (local re-export)
  if (Node.isExportSpecifier(parent)) return 're-export';

  // typeof X
  if (Node.isTypeQuery(parent)) return 'typeof';

  // Type references: `: T`, `<T>`, etc.
  if (Node.isTypeReference(parent)) return 'type-reference';

  // Heritage clause leaf nodes: `extends Foo` / `implements Bar`.
  // The identifier sits inside an ExpressionWithTypeArguments inside a HeritageClause.
  if (Node.isExpressionWithTypeArguments(parent)) {
    const heritage = parent.getParent();
    if (heritage && Node.isHeritageClause(heritage)) {
      const tok = heritage.getToken();
      if (tok === SyntaxKind.ExtendsKeyword) return 'extends';
      if (tok === SyntaxKind.ImplementsKeyword) return 'implements';
    }
    return 'type-reference';
  }

  // new X(...)
  if (Node.isNewExpression(parent) && parent.getExpression() === id) return 'instantiation';

  // X(...)
  if (Node.isCallExpression(parent) && parent.getExpression() === id) return 'call';

  // <X />  or  <X>...</X>
  if (Node.isJsxOpeningElement(parent) || Node.isJsxSelfClosingElement(parent) || Node.isJsxClosingElement(parent)) {
    return 'jsx';
  }

  // @X
  if (Node.isDecorator(parent)) return 'decorator';

  // PropertyAccessExpression where id is the leftmost name (e.g. `Foo.bar`):
  // walk further up to detect a call/new on the chain.
  if (Node.isPropertyAccessExpression(parent) && parent.getExpression() === id) {
    const grand = parent.getParent();
    if (grand && Node.isCallExpression(grand) && grand.getExpression() === parent) return 'call';
    if (grand && Node.isNewExpression(grand) && grand.getExpression() === parent) return 'instantiation';
  }

  return 'reference';
}

/**
 * Resolve an identifier to its definition declarations via the language
 * service. Returns the unique set of declaration nodes pointed at.
 *
 * We use `getSymbol().getDeclarations()` because `getDefinitionNodes()`
 * occasionally returns the same declaration we're calling on (the
 * identifier's own location). For exported bindings this is good enough
 * — the exported symbol's declarations are stable across files.
 */
function resolveDeclarations(id: Identifier): Node[] {
  const sym: TsmSymbol | undefined = id.getSymbol();
  if (!sym) return [];
  return sym.getDeclarations();
}

// ---------------------------------------------------------------------------
// Index assembly
// ---------------------------------------------------------------------------

function buildIndex(monorepoRoot: string, sha: string): ReverseUsageIndex {
  const t0 = Date.now();
  const packages = discoverPackages(monorepoRoot);
  const sourceFiles = listSourceFiles(monorepoRoot, packages);
  console.error(
    `discovered: ${packages.length} packages, ${sourceFiles.length} source files`,
  );

  // Synthesize `paths` from each package's dev-time exports so cross-
  // package imports resolve without relying on pnpm node_modules. This
  // is essential in worktree mode (a freshly-checked-out tree has no
  // node_modules); it's also fine — and faster — in live-tree mode.
  const paths: Record<string, string[]> = {};
  for (const pkg of packages) {
    for (const [importKey, target] of Object.entries(pkg.pathMappings)) {
      paths[importKey] = [target];
    }
  }

  // Single Project across the whole monorepo so the language service can
  // resolve cross-package imports.
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    skipFileDependencyResolution: false,
    skipLoadingLibFiles: true,
    compilerOptions: {
      target: 99 /* ESNext */,
      module: 199 /* NodeNext */,
      moduleResolution: 100 /* Bundler — works with `paths` and is permissive about extensions */,
      allowJs: false,
      noLib: true,
      types: [],
      strict: false,
      noResolve: false,
      baseUrl: monorepoRoot,
      paths,
    },
  });

  for (const sfi of sourceFiles) {
    project.addSourceFileAtPath(sfi.abs);
  }
  console.error(`loaded source files: ${(Date.now() - t0) / 1000}s`);

  // Build a path → packageName lookup for fast cross-package classification.
  const fileMeta = new Map<string, { packageName: string; isTest: boolean }>();
  for (const sfi of sourceFiles) {
    fileMeta.set(sfi.abs, { packageName: sfi.packageName, isTest: sfi.isTest });
  }

  // Collect exports per source file.
  const decls: RegisteredDeclaration[] = [];
  const declByNode = new Map<Node, RegisteredDeclaration>();
  for (const sfi of sourceFiles) {
    if (sfi.isTest) continue; // tests don't define exported library surface
    const sf = project.getSourceFile(sfi.abs);
    if (!sf) continue;
    const list = collectExports(sf, sfi.packageName, monorepoRoot);
    for (const d of list) {
      decls.push(d);
      declByNode.set(d.declNode, d);
    }
  }
  console.error(`collected ${decls.length} exported declarations: ${(Date.now() - t0) / 1000}s`);

  // Walk every identifier in every source file. Resolve its declaration
  // and, if the declaration is one we tracked, append a reference entry.
  let identifierCount = 0;
  let referenceCount = 0;
  for (const sfi of sourceFiles) {
    const sf = project.getSourceFile(sfi.abs);
    if (!sf) continue;
    const fileMetaEntry = fileMeta.get(sfi.abs)!;

    sf.forEachDescendant((node) => {
      if (!Node.isIdentifier(node)) return;
      identifierCount++;

      // Skip declaration-name positions — we don't count a declaration as
      // a reference to itself.
      const parent = node.getParent();
      if (parent) {
        if (
          (Node.isFunctionDeclaration(parent) ||
            Node.isClassDeclaration(parent) ||
            Node.isInterfaceDeclaration(parent) ||
            Node.isTypeAliasDeclaration(parent) ||
            Node.isEnumDeclaration(parent) ||
            Node.isModuleDeclaration(parent) ||
            Node.isVariableDeclaration(parent)) &&
          (parent as unknown as { getNameNode?: () => Node }).getNameNode?.() === node
        ) {
          return;
        }
      }

      const resolved = resolveDeclarations(node);
      if (resolved.length === 0) return;

      // For each resolved declaration that we tracked, record a ref.
      for (const declNode of resolved) {
        // Imported aliases resolve to ImportSpecifier — chase one hop to the
        // actual underlying export.
        let target: Node | undefined = declNode;
        if (Node.isImportSpecifier(target) || Node.isImportClause(target) || Node.isNamespaceImport(target)) {
          // ts-morph: importSpec.getNameNode().getDefinitionNodes() walks across.
          // We've already traversed via getSymbol once; chase via the symbol of the import's name.
          const importNameNode = (target as unknown as { getNameNode?: () => Node }).getNameNode?.();
          const importSym = importNameNode ? (importNameNode as Identifier).getSymbol?.() : undefined;
          const importDecls = importSym?.getAliasedSymbol?.()?.getDeclarations() ?? [];
          if (importDecls.length > 0) target = importDecls[0];
        }
        if (!target) continue;

        const reg = declByNode.get(target);
        if (!reg) continue;

        const refFile = relative(monorepoRoot, sf.getFilePath());
        const refLine = node.getStartLineNumber();
        const kind = classifyReference(node);

        const dedupKey = `${refFile}:${refLine}:${kind}`;
        if (reg.refKeys.has(dedupKey)) continue;
        reg.refKeys.add(dedupKey);

        reg.references.push({
          file: refFile,
          line: refLine,
          kind,
          isCrossPackage: fileMetaEntry.packageName !== reg.packageName,
          inTest: fileMetaEntry.isTest,
        });
        referenceCount++;
      }
    });
  }
  console.error(
    `walked identifiers: ${identifierCount} examined, ${referenceCount} refs recorded (${
      (Date.now() - t0) / 1000
    }s)`,
  );

  // Intern file paths. Stable order: sort the de-duped file set so the
  // ID assignment is deterministic across runs.
  const fileSet = new Set<string>();
  for (const d of decls) {
    fileSet.add(d.file);
    for (const r of d.references) fileSet.add(r.file);
  }
  const files = [...fileSet].sort();
  const fileId = new Map<string, number>();
  files.forEach((f, i) => fileId.set(f, i));

  // Assemble output. Sort references for stable diffs.
  const symbols: Record<string, SymbolEntry[]> = {};
  const packageSymbols = new Map<string, Set<string>>();
  for (const d of decls) {
    d.references.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.kind.localeCompare(b.kind));

    const refs: ReferenceEntry[] = d.references.map((r) => {
      const entry: ReferenceEntry = { f: fileId.get(r.file)!, l: r.line, k: r.kind };
      if (r.isCrossPackage) entry.x = 1;
      if (r.inTest) entry.t = 1;
      return entry;
    });

    const entry: SymbolEntry = {
      package: d.packageName,
      kind: d.kind,
      definedAt: [fileId.get(d.file)!, d.line],
      signature: d.signature,
      ...(d.doc ? { doc: d.doc } : {}),
      references: refs,
    };
    (symbols[d.name] ??= []).push(entry);

    if (!packageSymbols.has(d.packageName)) packageSymbols.set(d.packageName, new Set());
    packageSymbols.get(d.packageName)!.add(d.name);
  }

  // Stable-sort entries within each name (by package, then by file id).
  for (const list of Object.values(symbols)) {
    list.sort(
      (a, b) =>
        a.package.localeCompare(b.package) ||
        a.definedAt[0] - b.definedAt[0] ||
        a.definedAt[1] - b.definedAt[1],
    );
  }

  const packagesOut: Record<string, PackageEntry> = {};
  for (const pkg of packages) {
    const set = packageSymbols.get(pkg.name) ?? new Set();
    packagesOut[pkg.name] = { symbols: [...set].sort() };
  }

  return {
    generatedFromSha: sha,
    generatedAt: new Date().toISOString(),
    monorepoRoot,
    files,
    symbols: Object.fromEntries(Object.entries(symbols).sort(([a], [b]) => a.localeCompare(b))),
    packages: packagesOut,
  };
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

function defaultOutPath(sha: string): string {
  const date = new Date().toISOString().slice(0, 10);
  const shortSha = sha.slice(0, 12);
  return resolve(EXPERIMENT_ROOT, 'artifacts', `${date}-reverse-usage-index-${shortSha}.json`);
}

function writeOut(idx: ReverseUsageIndex, outPath: string): void {
  mkdirSync(dirname(outPath), { recursive: true });
  // No pretty-printing — index is large; consumer parses it programmatically.
  // (One trailing newline for POSIX-friendly tools.)
  writeFileSync(outPath, JSON.stringify(idx) + '\n', 'utf8');
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
    const idx = buildIndex(root, sha);
    writeOut(idx, outPath);

    const bytes = JSON.stringify(idx).length;
    const symbolNames = Object.keys(idx.symbols).length;
    const symbolEntries = Object.values(idx.symbols).reduce((n, list) => n + list.length, 0);
    const refCount = Object.values(idx.symbols).reduce(
      (n, list) => n + list.reduce((m, e) => m + e.references.length, 0),
      0,
    );

    console.error(
      `\nwrote ${outPath}\n` +
        `  packages:        ${Object.keys(idx.packages).length}\n` +
        `  files (interned):${idx.files.length}\n` +
        `  unique names:    ${symbolNames}\n` +
        `  total entries:   ${symbolEntries}  (entries-per-name: ${(symbolEntries / Math.max(1, symbolNames)).toFixed(2)})\n` +
        `  references:      ${refCount}\n` +
        `  size:            ${(bytes / 1024).toFixed(1)} KB\n` +
        `  total duration:  ${((Date.now() - t0) / 1000).toFixed(1)}s`,
    );
  };

  if (args.values.sha) {
    withWorktree(monorepoArg, sha, buildAndWrite);
  } else {
    buildAndWrite(monorepoArg);
  }
}

main();
