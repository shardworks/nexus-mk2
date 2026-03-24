# Work Plan: Guild Layout Refactor + Install Types

## Background

This plan covers two related changes:

1. **Flatten the guildhall layout** — NEXUS_HOME becomes a regular git clone instead of a bare repo + worktree scheme
2. **Revise tool install types** — remove local directory installs, add workshop and git URL installs, ensure durability

These are related because the layout change affects path resolution everywhere, and the install types depend on the final layout (particularly where workshop bare repos live).

## Part 1: Layout Refactor

### What we're changing and why

**Before:** The guildhall is a bare git repo at `NEXUS_HOME/guildhall/` with a standing worktree at `NEXUS_HOME/worktrees/guildhall/main/`. All guild files (guild.json, implements, codex, etc.) live in the worktree. Workshop bare clones are siblings of the guildhall at `NEXUS_HOME/workshop-name/`. Commission worktrees are at `NEXUS_HOME/worktrees/workshop-name/commission-N/`. The Ledger is at `NEXUS_HOME/nexus.db`.

**After:** NEXUS_HOME IS a regular git clone. Guild files live at the root. Workshop bare clones and commission worktrees are tucked inside `.nexus/` (gitignored). The Ledger is at `.nexus/nexus.db`.

**Why:**
- The guildhall is now an npm package (has `package.json`). Running `npm install` at NEXUS_HOME root is natural. Running it at `worktrees/guildhall/main/` is clunky.
- The bare repo + worktree scheme was designed for repos that need multiple worktrees. The guildhall only ever needs one (main). The indirection adds complexity with no benefit.
- `guild.json` at the root instead of three levels deep is a better developer experience.
- Workshop repos and worktrees as gitignored infrastructure inside `.nexus/` is a clean separation of concerns.

**We also remove the `NEXUS_HOME` env var requirement.** Instead:
- `--guild-root <path>` global CLI flag (optional, explicit)
- Default: walk up from cwd looking for `guild.json` (like git finds `.git/`)

This means you can `cd` anywhere inside a guild and commands just work.

### New layout

```
NEXUS_HOME/                           <- regular git clone (IS the guildhall)
  .git/
  .gitignore                          <- ignores: node_modules/, .nexus/
  .nexus/                             <- framework-managed, gitignored
    nexus.db                          <- Ledger (SQLite)
    workshops/
      workshop-a.git/                 <- bare clone
      workshop-b.git/                 <- bare clone
    worktrees/
      workshop-a/
        commission-42/                <- commission worktree
      workshop-b/
        commission-17/                <- commission worktree
  guild.json                          <- central config
  package.json                        <- npm package identity
  package-lock.json
  node_modules/                       <- gitignored
  nexus/
    implements/                       <- framework tools (metadata + source)
      install-tool/0.1.0/
      remove-tool/0.1.0/
      ...
    engines/
      manifest/0.1.0/
      mcp-server/0.1.0/
      ...
    migrations/
      001-initial-schema.sql
  implements/                         <- guild tools (metadata, or full source for tarballs)
  engines/
  codex/
    all.md
    roles/
  training/
    curricula/
    temperaments/
```

### Detailed file changes

#### 1. `packages/core/src/nexus-home.ts` — rewrite entirely

Current functions and their replacements:

| Current | New | Notes |
|---------|-----|-------|
| `resolveNexusHome()` | `findGuildRoot(startDir?)` | Walk up from cwd looking for `guild.json`. Throws if not found. |
| `guildhallBarePath(home)` | **deleted** | No more bare repo. |
| `guildhallWorktreePath(home)` | **deleted** | Callers use `home` directly — the guild root IS the worktree. |
| `ledgerPath(home)` | `ledgerPath(home)` | Returns `path.join(home, '.nexus', 'nexus.db')` (was `path.join(home, 'nexus.db')`) |
| `worktreesPath(home)` | `worktreesPath(home)` | Returns `path.join(home, '.nexus', 'worktrees')` (was `path.join(home, 'worktrees')`) |
| — | `workshopsPath(home)` | New: `path.join(home, '.nexus', 'workshops')` |
| — | `workshopBarePath(home, name)` | New: `path.join(home, '.nexus', 'workshops', name + '.git')` |
| — | `nexusDir(home)` | New: `path.join(home, '.nexus')` — the framework-managed dir |

The `findGuildRoot` implementation:

```typescript
export function findGuildRoot(startDir?: string): string {
  let dir = path.resolve(startDir ?? process.cwd());
  while (true) {
    if (fs.existsSync(path.join(dir, 'guild.json'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error(
        'Not inside a guild. Run `nexus init` to create one, or use --guild-root.'
      );
    }
    dir = parent;
  }
}
```

Consider renaming the file from `nexus-home.ts` to `guild-root.ts` or `paths.ts` to reflect the new naming.

#### 2. `packages/core/src/init-guild.ts` — simplify significantly

**Before:**
1. `git init --bare guildhall/`
2. `git -C guildhall worktree add -b main worktrees/guildhall/main/`
3. Scaffold dirs inside the worktree
4. Write guild.json, package.json, .gitignore to worktree
5. `git add -A && git commit` inside worktree

**After:**
1. `git init` at NEXUS_HOME root
2. `mkdir -p .nexus/workshops .nexus/worktrees`
3. Scaffold dirs at root (nexus/implements, codex, etc.)
4. Write guild.json, package.json, .gitignore to root
5. `git add -A && git commit`

The `.gitignore` should contain:
```
node_modules/
.nexus/
```

Note that `.nexus/` is entirely gitignored — the Ledger, workshop repos, and commission worktrees are all framework-managed state, not guild configuration.

The `initGuild` function signature stays the same: `initGuild(home, name, model)`. But `home` is now the directory that becomes the git repo root (not a container for a bare repo).

#### 3. `packages/core/src/guild-config.ts` — update `guildConfigPath`

```typescript
// Before
export function guildConfigPath(home: string): string {
  return path.join(guildhallWorktreePath(home), 'guild.json');
}

// After
export function guildConfigPath(home: string): string {
  return path.join(home, 'guild.json');
}
```

Same for `readGuildConfig` and `writeGuildConfig` — they call `guildConfigPath`, so they'll automatically work. Just remove the import of `guildhallWorktreePath`.

#### 4. `packages/core/src/install-tool.ts` — replace `guildhallWorktreePath(home)` with `home`

Every reference to `const worktree = guildhallWorktreePath(home)` becomes just `home`. The variable can be renamed to `guildRoot` or `root` for clarity, or just use `home` directly.

The git operations (`git add -A`, `git commit`) now run in `home` instead of the worktree path.

#### 5. `packages/core/src/remove-tool.ts` — same as install-tool

Replace `guildhallWorktreePath(home)` with `home`.

#### 6. `packages/engine-manifest/src/index.ts` — replace worktree path references

- `guildhallWorktreePath(home)` -> `home` in `resolveImplements`, `readCodex`, `generateMcpConfig`
- Remove import of `guildhallWorktreePath`
- The `NODE_PATH` in `generateMcpConfig` becomes `path.join(home, 'node_modules')`

#### 7. `packages/engine-worktree-setup/src/index.ts` — update to use new paths

- Commission worktrees now at `.nexus/worktrees/<workshop>/commission-N/`
- The bare repo source for worktrees is a WORKSHOP repo (`.nexus/workshops/<name>.git`), NOT the guildhall
- `guildhallBarePath(home)` references must be replaced with the workshop bare path
- This is also where the existing TODO about "which repo do commission worktrees come from?" gets resolved

The worktree setup needs to accept a workshop name parameter and create worktrees from the workshop's bare clone:

```typescript
export interface WorktreeConfig {
  home: string;
  workshop: string;      // workshop name
  commissionId: number;
  baseBranch?: string;
}
```

And:
```typescript
const bareRepo = workshopBarePath(home, config.workshop);
const worktreeDir = path.join(worktreesPath(home), config.workshop, `commission-${commissionId}`);
```

#### 8. `packages/engine-ledger-migrate/src/index.ts` — update ledger path

This engine reads the ledger path. Verify it uses `ledgerPath(home)` — if so, no code change needed (the function itself is updated in step 1). If it constructs paths manually, update them.

#### 9. `packages/cli/src/commands/*.ts` — add `--guild-root`, remove `NEXUS_HOME`

**Global option:** Add `--guild-root <path>` to the root Commander program (not to each subcommand individually). Subcommands read it from the parent options.

In the main CLI entry point (likely `packages/cli/src/index.ts` or similar):

```typescript
program
  .option('--guild-root <path>', 'Path to guild root (default: auto-detect from cwd)')
```

**Each command** currently does:
```typescript
const home = resolveNexusHome();
```

Replace with:
```typescript
const home = options.guildRoot
  ? path.resolve(options.guildRoot)
  : findGuildRoot();
```

Or create a helper that encapsulates this:
```typescript
function resolveGuildRoot(options: { guildRoot?: string }): string {
  if (options.guildRoot) return path.resolve(options.guildRoot);
  return findGuildRoot();
}
```

**Commands that need updating:** `install-tool.ts`, `remove-tool.ts`, `manifest.ts`, `dispatch.ts`, `publish.ts`, `instantiate.ts`, `status.ts`. Basically all commands except `init` (which creates a new guild rather than operating on an existing one).

The `init` command is special — it creates a guild at a specified path. It doesn't need `--guild-root` or guild discovery.

#### 10. `packages/core/src/bootstrap.ts` — replace worktree path references

Uses `guildhallWorktreePath(home)` for the final git commit. Replace with `home`.

#### 11. `packages/core/src/index.ts` — update exports

- Remove `guildhallBarePath` export
- Remove `guildhallWorktreePath` export
- Add `findGuildRoot` export
- Add `workshopsPath`, `workshopBarePath`, `nexusDir` exports
- Rename `resolveNexusHome` to `findGuildRoot` (or remove old, add new)

#### 12. `packages/implement-install-tool/src/handler.ts` — no change needed

The handler receives `context.home` which is already the guild root. The core `installTool` function handles all path resolution.

#### 13. All test files — update path expectations

Tests currently set up: `initGuild(home, ...)` then derive `wt = path.join(home, 'worktrees', 'guildhall', 'main')`.

After: `initGuild(home, ...)` and use `home` directly. All assertions about file locations drop the `worktrees/guildhall/main/` prefix.

Tests that check for `path.join(home, 'guildhall', 'HEAD')` (bare repo existence) should check for `path.join(home, '.git')` instead.

Tests that check for `path.join(home, 'nexus.db')` should check for `path.join(home, '.nexus', 'nexus.db')`.

Affected test files:
- `packages/core/src/install-tool.test.ts`
- `packages/core/src/guild-config.test.ts`
- `packages/cli/src/commands/init.test.ts`
- `packages/engine-mcp-server/src/index.test.ts` (if it references paths)

#### 14. Documentation — update architecture overview

`docs/architecture/overview.md` contains the directory structure diagram and describes the layout. Update to match the new layout. Also update any references to `NEXUS_HOME` env var.

#### 15. Agent instructions

`docs/anima-instructions/valdris-the-unwritten.md` and any other agent instruction files that reference guild layout or `NEXUS_HOME` should be updated.

---

## Part 2: Revised Install Types

### What we're changing and why

**Before:** `installTool` supported local directories (with or without `package.json`), with npm install for dirs that have `package.json` and file copy for bare dirs. Also `--link` for dev symlinks.

**After:** Five install types, each with clear durability semantics:

1. **Registry** — canonical for published tools, fully durable
2. **Git URL** — for sharing without publishing, fully durable
3. **Workshop** — for forge-built tools, durable within the guild
4. **Tarball** — for non-npm artifacts, durable via extracted source in slot
5. **Link** — for dev iteration, explicitly ephemeral

**Local directory installs are removed entirely.** The forge agent use case is covered by workshop installs.

### Source classification

| Source pattern | Type | Example |
|---|---|---|
| `workshop:<name>#<ref>` | workshop | `workshop:forge#tool/fetch-jira@1.0` |
| Starts with `git+` | git-url | `git+https://github.com/someone/tool.git#v1.0` |
| Ends with `.tgz` or `.tar.gz` | tarball | `./my-tool-1.0.0.tgz` |
| `--link` flag + local dir | link | `~/projects/my-tool --link` |
| Everything else | registry | `some-tool@1.0`, `@scope/tool` |

### Install behavior by type

#### Registry — `nexus install-tool some-tool@1.0 --roles artificer`

- `npm install --save some-tool@1.0` in guild root
- Read descriptor from `node_modules/some-tool/`
- Copy metadata (descriptor + instructions) to slot
- Write `package` field into slot descriptor
- `upstream` in guild.json: `some-tool@1.0.0`
- **Durable:** `package.json` has the specifier. `npm install` on fresh clone resolves it.

#### Git URL — `nexus install-tool git+https://github.com/someone/tool.git#v1.0 --roles artificer`

- `npm install --save git+https://github.com/someone/tool.git#v1.0` in guild root
- Same flow as registry after that
- `upstream` in guild.json: `git+https://github.com/someone/tool.git#v1.0`
- **Durable:** `package.json` has the git URL. `npm install` on fresh clone resolves it.
- **Note:** npm handles git URLs natively. No special code needed — this is just a registry install with a different specifier format.

#### Workshop — `nexus install-tool workshop:forge#tool/fetch-jira@1.0 --roles artificer`

- Parse the source: workshop name = `forge`, git ref = `tool/fetch-jira@1.0`
- Resolve the workshop bare repo path: `path.join(home, '.nexus', 'workshops', 'forge.git')`
- Construct the git URL: `git+file://<absolute-path-to-bare>/#<ref>`
- `npm install --save git+file://<path>#<ref>` in guild root
- Same metadata copy flow
- `upstream` in guild.json: `workshop:forge#tool/fetch-jira@1.0` (the original specifier, not the resolved file URL)
- **Durable within the guild:** The workshop bare repo is part of the guild's `.nexus/` infrastructure. On a fresh clone of the guildhall, the guild needs to be rehydrated — the rehydrate step resolves workshop refs from the co-located bare repos. The `package.json` will have an absolute `git+file://` URL that's machine-specific, so `package-lock.json` should not be committed (or the rehydrate step rewrites the URLs). Alternative: store the `workshop:` specifier in `guild.json` and have the rehydrate step resolve it. See the rehydrate section below.

**Important implementation detail for workshop installs and durability:** The `package.json` dependency will contain an absolute `git+file://` path, which is machine-specific. Two options:

**(A)** Don't save workshop installs to `package.json` (`--no-save`). Store the full source in the guildhall slot (like tarball installs). Rehydrate installs from the slot. This is simpler but duplicates source between the workshop repo and the guildhall.

**(B)** Save to `package.json` but have the rehydrate step rewrite `git+file://` URLs using the current machine's paths. The rehydrate step reads `guild.json` (which has `workshop:forge#ref`), resolves the workshop bare path, and updates `package.json` before running `npm install`. This avoids source duplication but adds rehydrate complexity.

**Recommendation: Option A** — store full source in slot, use `--no-save`. It's simpler, self-contained, and consistent with tarball behavior. The workshop repo is the source of truth; the guildhall slot is a snapshot.

#### Tarball — `nexus install-tool ./my-tool-1.0.0.tgz --roles artificer`

- Create a temp directory
- `npm install --no-save ./my-tool-1.0.0.tgz` in guild root (installs to node_modules, resolves deps)
- Read descriptor from the installed package in `node_modules/`
- Copy **full source** (not just metadata) from the installed package to the guildhall slot
- Write `package` field into slot descriptor
- `upstream` in guild.json: null (local artifact, not a durable reference)
- **Durable:** Full source is in the guildhall slot (git-tracked). On rehydrate, `npm install --no-save <slot-path>` reinstalls from the slot.

#### Link — `nexus install-tool ~/projects/my-tool --link --roles artificer`

- Validate source is a local directory with `package.json`
- Create symlink in `node_modules/` pointing to source directory
- Copy metadata to slot
- Write `package` field into slot descriptor
- `upstream` in guild.json: null
- **NOT durable.** Strong warning in CLI output and documentation. Other clones won't have this tool. The linked source must have its own `node_modules` (developer runs `npm install` in their project).

### Changes to `classifySource`

```typescript
export type SourceKind = 'registry' | 'git-url' | 'workshop' | 'tarball' | 'link';

export function classifySource(source: string, link: boolean): SourceKind {
  if (link) return 'link';
  if (source.startsWith('workshop:')) return 'workshop';
  if (source.startsWith('git+')) return 'git-url';
  if (source.endsWith('.tgz') || source.endsWith('.tar.gz')) return 'tarball';
  return 'registry';
}
```

The old `npm-local` and `bare-local` types are removed.

### Changes to `installTool`

Remove the `npm-local` and `bare-local` code paths. The function should have these branches:

1. **framework** — `copyDir` as today (framework tools are installed from workspace packages at bootstrap time, not via npm)
2. **registry / git-url** — `npm install --save <source>`, metadata to slot
3. **workshop** — parse `workshop:<name>#<ref>`, resolve to `git+file://` URL, `npm install --no-save`, full source to slot
4. **tarball** — `npm install --no-save <source>`, full source to slot
5. **link** — symlink + metadata to slot

### Changes to `removeTool`

For tools with `upstream` containing a package specifier (registry, git-url), run `npm uninstall`.

For workshop and tarball tools (no `package.json` entry, source in slot), just delete the slot and clean up `node_modules` manually if needed.

For linked tools, remove the symlink.

### Rehydrate command

A new CLI command: `nexus rehydrate` (or could be `nexus repair` or `nexus install`).

Purpose: reconstruct `node_modules` from git-tracked state after a fresh clone.

Steps:
1. Run `npm install` in guild root — resolves registry and git-url deps from `package.json`
2. For each tool in `guild.json` that has full source in its slot (workshop and tarball installs): run `npm install --no-save <slot-path>` to install the package from the git-tracked source
3. Report any linked tools that need to be re-linked manually

This command is idempotent and safe to run at any time.

### Documentation

Update `docs/guides/building-implements.md` to reflect:
- The five install types with examples
- Durability expectations for each type
- The rehydrate workflow
- Strong warnings about link ephemerality
- Remove all references to local directory installs

---

## Execution order

These changes should be done in two phases:

### Phase 1: Layout refactor

1. Rewrite `nexus-home.ts` (path functions + guild root discovery)
2. Rewrite `initGuild` (regular git init instead of bare + worktree)
3. Update all callers of removed/changed functions (mechanical — replace `guildhallWorktreePath(home)` with `home`, update `ledgerPath` references, etc.)
4. Add `--guild-root` global option to CLI, remove `NEXUS_HOME` env var usage
5. Update all tests
6. Update architecture docs
7. Run full test suite, verify green

### Phase 2: Install type revision

1. Rewrite `classifySource` (new source types)
2. Rewrite `installTool` (new install paths)
3. Update `removeTool` (handle new types)
4. Add `nexus rehydrate` command
5. Update implement handler and CLI command
6. Update tests
7. Update guide documentation
8. Run full test suite, verify green

### Important notes for the implementing agent

- The `guild.json` schema gains a `name` field — this was already added in the current session. Verify it's present.
- The `package.json` and `.gitignore` in the guildhall — already added in the current session. These stay, but their location changes (from the worktree path to the guild root).
- Framework tool descriptors do NOT have a `package` field — `installTool` writes it at install time by reading from the source's `package.json`. This was established in the current session.
- The `ImplementContext` passed to handlers currently has `{ home: string }`. `home` is the guild root. This doesn't change — it's just that the guild root is now NEXUS_HOME directly instead of being derived.
- The MCP server config's `env.NODE_PATH` should point to `path.join(home, 'node_modules')` — no longer needs to go through the worktree path.
- Commission worktrees are created from WORKSHOP bare repos, not the guildhall. The worktree-setup engine needs updating to accept a workshop name and resolve the bare path. This was already a known TODO.
