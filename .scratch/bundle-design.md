# Bundle Design

## Current State

As of `4cdde80`, the install system has:

- **Five install types:** registry, git-url, workshop, tarball, link
- **Package routing via guild.json:** the `package` field on `ToolEntry` tells the manifest engine which npm package to resolve at runtime. Slot descriptors remain pristine copies of what the tool author shipped.
- **Framework/guild split:** `source: 'nexus' | 'guild'` in guild.json, separate directory trees (`nexus/implements/` vs `implements/`), `framework` flag in `installTool`, removal protection for framework tools.
- **Hardcoded bootstrap:** `base-tools.ts` lists `BASE_IMPLEMENTS` and `BASE_ENGINES` by package name. `bootstrap.ts` loops over them calling `installTool({ framework: true })`.

## The Problem

1. Adding the advisor (temperament + curriculum + anima) would mean more hardcoded init logic in TypeScript.
2. Small artifacts like a single-markdown-file temperament don't justify their own npm package.
3. The framework/guild split adds complexity without real value.

## The Vision

A **bundle** is a package that delivers multiple installable artifacts. Init becomes "install the starter kit." The framework/guild split goes away. All artifacts are treated equally.

## Simplifications

### Unified directory structure

The `nexus/implements/` and `nexus/engines/` prefix directories go away. All tools live in `implements/` and `engines/`.

### Simplified guild.json ToolEntry

The `source: 'nexus' | 'guild'` field is removed. `upstream` provides provenance. `package` field (already in guild.json as of `4cdde80`) handles runtime resolution. Slot descriptors stay pristine.

### Recovery via reinstall

The bundle IS the recovery mechanism. No removal protection needed.

---

## Bundle Manifest: `nexus-bundle.json`

The manifest has explicit top-level arrays for each artifact category. This enforces what can be inline at the schema level.

**Implements and engines** require a `package` specifier — they have runtime code and potentially npm dependencies, so they must be proper npm packages. The `package` value can be an npm registry specifier (`@scope/name@^1.0`) or a git URL (`git+https://github.com/org/repo.git#v1.0`). No npm publishing required — a git repo suffices.

**Curricula and temperaments** support either `package` (for published/git-hosted content) or `path` (for content bundled inline). Inline is appropriate because these are content-only artifacts — markdown files and descriptors with no npm dependencies.

```json
{
  "description": "Everything a new guild needs",
  "implements": [
    { "package": "@shardworks/implement-install-tool@^0.1.0", "roles": ["*"] },
    { "package": "@shardworks/implement-remove-tool@^0.1.0", "roles": ["*"] },
    { "package": "@shardworks/implement-dispatch@^0.1.0", "roles": ["*"] },
    { "package": "@shardworks/implement-instantiate@^0.1.0", "roles": ["*"] },
    { "package": "@shardworks/implement-nexus-version@^0.1.0", "roles": ["*"] }
  ],
  "engines": [
    { "package": "@shardworks/engine-manifest@^0.1.0" },
    { "package": "@shardworks/engine-mcp-server@^0.1.0" },
    { "package": "@shardworks/engine-worktree-setup@^0.1.0" },
    { "package": "@shardworks/engine-ledger-migrate@^0.1.0" }
  ],
  "temperaments": [
    { "path": "temperaments/guide" }
  ],
  "curricula": [
    { "path": "curricula/guild-operations" }
  ]
}
```

### Schema rules

| Category | `package` | `path` | Why |
|----------|-----------|--------|-----|
| `implements` | ✅ required | ❌ error | Runtime code with potential npm deps — must be a resolvable package |
| `engines` | ✅ required | ❌ error | Same as implements |
| `curricula` | ✅ allowed | ✅ allowed | Content-only — inline or packaged |
| `temperaments` | ✅ allowed | ✅ allowed | Content-only — inline or packaged |

If a bundle author puts a `path` entry in `implements` or `engines`, installation fails immediately with a clear error: "Implements must be npm packages or git URLs. Use a `package` specifier instead of `path`."

### Package specifier formats

The `package` value accepts anything npm can install:

- **Registry:** `@shardworks/implement-dispatch@^0.1.0`
- **Git URL:** `git+https://github.com/my-org/my-tool.git#v1.0`
- **Git SSH:** `git+ssh://git@github.com/my-org/my-tool.git#v1.0`

No npm publishing required. A git repo with a `package.json` and a nexus descriptor is sufficient. This is important for guilds building internal tools — reference your workshop repos directly.

### Artifact optional fields

- **`name`** — artifact name in the guild (defaults to package name or directory basename)
- **`roles`** — for implements, which roles can use it

### Transitive bundles

A `package` entry in any category can resolve to another bundle (a package with `nexus-bundle.json`). The installer recurses. This enables composition without the sub-bundle's internal structure leaking into the parent manifest.

---

## Bundle as Recipe (Install Approach)

The bundle is fetched, read, and discarded. It is NOT retained as a guild dependency. Each artifact it references gets installed individually. This avoids authoring redundancy (no need to list deps in both `package.json` and `nexus-bundle.json`) and gives clean removal semantics (each tool is an independent direct dep).

### Install Flow

```
installBundle(guildRoot, bundleDir, bundleSource):

  1. Read and validate nexus-bundle.json from bundleDir
     → Error if implements/engines have "path" entries

  2. Collect all package specifiers across all categories

  3. Batch npm install:
     npm install --save <pkg1> <pkg2> ... <pkgN> into guildRoot
     (One npm call resolves the full dep tree)

  4. For each package artifact (implements, engines, curricula, temperaments):
     → Resolve installed package in node_modules
     → Check for nexus-bundle.json → recurse if found
     → Find descriptor (nexus-implement.json, etc.)
     → Copy metadata to guild slot (descriptor + instructions)
     → Register in guild.json with:
       - package: <npm package name> (for runtime resolution)
       - upstream: <specifier@resolved-version>
       - bundle: <bundleSource@version> (provenance)
       - roles: from artifact entry (implements only)

  5. For each inline artifact (curricula, temperaments only):
     → Resolve path relative to bundleDir
     → Find descriptor
     → Copy full directory to guild slot
     → Register in guild.json with:
       - package: null (resolved via file path)
       - upstream: null
       - bundle: <bundleSource@version> (provenance)

  6. Git add + commit all changes in one batch
```

### How the bundle itself is fetched

The bundle needs to be fetched before its manifest can be read. This can happen through any install mode:

| Mode | How bundle is fetched | Package artifacts resolved via |
|------|----------------------|-------------------------------|
| Registry | `npm pack` to temp or `npm install --no-save` | `npm install --save` (registry/git) |
| Git URL | `npm pack` to temp or `npm install --no-save` | `npm install --save` (registry/git) |
| Workshop | Resolve from workshop bare clone | `npm install --save` (registry/git) |
| Tarball | Extract to temp | `npm install --save` (registry/git) |
| Link | Read in place | `npm install --save` or skip in dev |

---

## What the Starter Kit Package Looks Like

```
packages/guild-starter-kit/
  package.json                          ← minimal: name, version (NO dependencies)
  nexus-bundle.json                     ← the single manifest (above)
  migrations/
    001-initial-schema.sql
  temperaments/
    guide/
      nexus-temperament.json            ← { "version": "0.1.0", "content": "content.md" }
      content.md                        ← helpful, patient, teaching-oriented
  curricula/
    guild-operations/
      nexus-curriculum.json             ← { "version": "0.1.0", "content": "content.md" }
      content.md                        ← how guilds work, tools, workshops, etc.
```

The `package.json` is just for npm publishing — no dependencies:
```json
{
  "name": "@shardworks/guild-starter-kit",
  "version": "0.1.0",
  "description": "Default bundle for new Nexus guilds"
}
```

---

## How Init Changes

```typescript
// Before (current)
initGuild(home, name, model);
bootstrapBaseTools(home, resolvePackage);
applyMigrations(home);

// After
initGuild(home, name, model);           // skeleton only (no nexus/ dirs, no migration file)
installBundle(home, starterKitDir);      // tools, training, migrations
applyMigrations(home);                  // create ledger
instantiateAdvisor(home);               // seed the advisor anima
```

During init, the starter kit is resolved from the CLI's own shipped copy (works offline, fast). For user-installed bundles later, `nsg tool install <bundle>` fetches from npm/git/workshop.

---

## After Init

### Guild directory
```
my-guild/
  guild.json
  package.json        ← each tool as a direct dep
  .gitignore
  implements/
    install-tool/0.1.0/   ← metadata only (descriptor + instructions.md)
    remove-tool/0.1.0/
    dispatch/0.1.0/
    instantiate/0.1.0/
    nexus-version/0.1.0/
  engines/
    manifest/0.1.0/
    mcp-server/0.1.0/
    worktree-setup/0.1.0/
    ledger-migrate/0.1.0/
  migrations/
    001-initial-schema.sql
  training/
    curricula/
      guild-operations/0.1.0/  ← full content (inline from bundle)
    temperaments/
      guide/0.1.0/             ← full content (inline from bundle)
  codex/
    all.md
    roles/
  node_modules/                ← all tool packages + their transitive deps
  .nexus/
    nexus.db                   ← Ledger (with advisor anima)
    workshops/
    worktrees/
```

### Guild.json entry examples
```json
{
  "implements": {
    "dispatch": {
      "slot": "0.1.0",
      "upstream": "@shardworks/implement-dispatch@0.1.0",
      "bundle": "@shardworks/guild-starter-kit@0.1.0",
      "installedAt": "...",
      "roles": ["*"],
      "package": "@shardworks/implement-dispatch"
    }
  },
  "temperaments": {
    "guide": {
      "slot": "0.1.0",
      "upstream": null,
      "bundle": "@shardworks/guild-starter-kit@0.1.0",
      "installedAt": "..."
    }
  }
}
```

---

## Post-Install: The Advisor

Instantiated in init code after migrations:

```typescript
instantiate({
  home,
  name: 'advisor',
  roles: ['advisor'],
  curriculum: 'guild-operations',
  temperament: 'guide',
});
```

Init output:
```
Guild "my-guild" created at /home/sean/my-guild

  cd my-guild
  nsg consult advisor    # ask your guild advisor for help
```

---

## What Goes Away

| Removed | Replaced by |
|---------|-------------|
| `packages/core/src/base-tools.ts` | `nexus-bundle.json` in starter kit |
| `packages/core/src/bootstrap.ts` | `installBundle()` |
| `makePackageResolver()` in init command | npm resolution via bundle |
| `nexus/implements/` and `nexus/engines/` dirs | unified `implements/` and `engines/` |
| `source: 'nexus' \| 'guild'` in ToolEntry | `bundle` field for provenance |
| `framework` option in `installTool` | removed — all artifacts equal |
| `nexus/` prefix routing logic | removed |
| Framework removal protection | reinstall from bundle |

## What Changes in Existing Code

| File | Change |
|------|--------|
| `guild-config.ts` | Remove `source` from `ToolEntry`. Add optional `bundle` field. |
| `install-tool.ts` | Remove `framework` option + `nexus/` prefix. Add bundle detection + `installBundle()`. Validate no `path` entries for implements/engines. |
| `remove-tool.ts` | Remove framework protection guard. |
| `init-guild.ts` | Simplify — no migration file, no `nexus/` dirs. |
| `init.ts` (CLI) | Replace `bootstrapBaseTools` with bundle install + advisor instantiation. |
| `engine-manifest` | No changes — already reads `package` from guild.json. |

## Open Questions

1. **Migrations in the bundle?** The sketch shows `001-initial-schema.sql` delivered by the starter kit. Should migrations be a formal bundle category, or just a file copy into `migrations/`?

2. **Bundle idempotency.** Overwrite same-slot on reinstall. Skip if a newer slot is active?

3. **`bundle` provenance field.** Enables `nsg tool remove-bundle <name>` and upgrade tracking. Low cost, high future value. Recommend adding.
