# Implements, Engines, Curricula & Temperaments

This document describes the artifact model for the guild system — how implements, engines, curricula, and temperaments are structured, packaged, installed, and resolved. All four follow the same packaging pattern: a descriptor file, content, and a registration entry in `guild.json`. For the broader system architecture, see [overview.md](overview.md).

---

## What they are

**Implements** are tools wielded by animas during work — operations that animas invoke to interact with guild systems, query information, record notes, and perform operations. An implement can optionally ship with an instruction document (`instructions.md`) that is delivered to the anima when manifested for a session.

Implements are accessible through multiple paths: animas invoke them as MCP tools during sessions; humans invoke them via the `nexus` CLI; engines import them programmatically. All paths execute the same logic with the same inputs and outputs — the implement author writes the logic once.

**Engines** are automated mechanical processes with no AI involvement — scripts, queue readers, and other deterministic processes built into the guild's infrastructure. Engines handle the repeatable, mechanical work: manifesting animas, setting up worktrees, running migrations. They do not have instruction documents because no anima wields them.

Both follow the same packaging model. Curricula and temperaments also follow this model — see [below](#curricula--temperaments).

---

## Implement architecture

### The handler model

Every implement is, at its core, a **handler with a defined contract** — inputs, outputs, and the logic between them. The framework provides access paths:

```
┌─────────────────────────────────────┐
│  IMPLEMENT (what the author writes) │
│                                     │
│  handler — a script or module       │
│  instructions.md — anima guidance   │
└──────────────┬──────────────────────┘
               │
    ┌──────────┼──────────┐
    │          │          │
  MCP        CLI       import
  (animas)  (humans)  (engines)
    │          │          │
  same input → same code → same output
```

- **MCP** — The manifest engine configures an MCP server that exposes implements as typed, callable tools. The anima sees them as native tools alongside built-in tools like Read, Write, and Bash.
- **CLI** — The `nexus` CLI exposes implements as subcommands (`nexus dispatch`, `nexus install-tool`, etc.).
- **Import** — Engines and other implements can import module-based handlers directly.

### Two kinds of implements

Implements come in two kinds, determined by the `kind` field in the descriptor (or inferred from the entry point):

#### `module` — a JavaScript/TypeScript module

The entry point exports a handler with a typed schema using the Nexus SDK:

```typescript
import { implement } from "@shardworks/nexus-core";
import { z } from "zod";

export default implement({
  description: "Look up an anima by name",
  params: {
    name: z.string().describe("Anima name"),
  },
  handler: async ({ name }, { home }) => {
    // look up anima using home to find the guild...
    return { found: true, status: "active" };
  },
});
```

The `implement()` factory wraps the params into a Zod object schema and returns an `ImplementDefinition` — a typed object that the framework can introspect. The handler receives two arguments: validated params (typed from the Zod schemas) and a framework-injected context (`{ home }` — the NEXUS_HOME path).

For MCP, the Nexus MCP engine dynamically imports the module, reads `.params.shape` for the tool's input schema, and wraps `.handler` as the tool callback. For CLI, Commander options can be auto-generated from the Zod schema. For direct import, other code calls `.handler` as a function.

#### `script` — an executable script

The entry point is any executable — shell script, Python, compiled binary:

```bash
#!/usr/bin/env bash
# get-anima — look up an anima by name
echo "$(sqlite3 "$NEXUS_HOME/nexus.db" "SELECT * FROM animas WHERE name = '$1'" -json)"
```

Scripts receive arguments as CLI args and return results on stdout (plain text or JSON). The framework wraps them for MCP by shelling out to the script when the tool is called. For CLI, the `nexus` command delegates to the script directly.

This is the lowest-ceremony path — an implement can be a bash script with a one-line descriptor. No SDK, no TypeScript, no build step.

#### Kind inference

If `kind` is not specified in the descriptor, the framework infers it from the entry point:

| Entry point | Inferred kind |
|-------------|---------------|
| `.js`, `.mjs`, `.ts`, `.mts` | `module` |
| `.sh`, `.bash`, `.py`, or executable without extension | `script` |

An explicit `kind` always wins. Inference is a convenience, not magic — if the file extension is ambiguous, specify the kind.

### The MCP engine

Animas don't connect to individual MCP servers per implement. Instead, Nexus provides a single framework engine — the **MCP engine** — that runs as one stdio process per anima session. At session start, the manifest engine determines which implements the anima has access to (based on all of the anima's roles — see [role gating](#role-gating)), then launches the MCP engine configured with that set. The MCP engine loads each implement's handler (importing modules directly, wrapping scripts as shell-out calls) and registers them all as tools.

One process. All the anima's tools. Claude's runtime spawns it at session start and kills it at session end — no daemon management, no manual start/stop.

```
Session starts
  → manifest engine resolves implements for anima's roles
  → launches MCP engine with that implement set
  → Claude connects to MCP engine over stdio

Anima calls dispatch(...)
  → JSON-RPC over stdin to MCP engine
  → MCP engine calls dispatch handler
  → result back over stdout

Anima calls get_anima(...)
  → same process, same pipe

Session ends
  → Claude kills MCP engine process
```

Third-party MCP servers (GitHub, databases, external services) can be connected alongside the guild's MCP engine if needed. The manifest engine configures all of them as part of session setup.

### MCP as a standard protocol

[MCP (Model Context Protocol)](https://modelcontextprotocol.io/) is a standard for connecting AI agents to tools. An MCP server exposes typed, callable tools over a standardized protocol (JSON-RPC over stdio). The agent's runtime connects to the server, discovers its tools, and makes them available as native tool calls — typed parameters in, structured results out. No CLI argument parsing or stdout scraping by the agent.

Nexus uses MCP as the transport layer between animas and implements. The implement author doesn't need to know MCP exists — the framework handles the protocol. But because it's a standard, it also means:

- Third-party MCP servers work alongside guild implements with no wrapping
- Guild implements could be used by non-Nexus MCP clients if needed
- Schema validation happens at the protocol level — bad calls fail fast with clear errors

### Instructions: what MCP doesn't provide

MCP exposes three pieces of metadata about a tool: its **name**, a brief **description**, and the **parameter schema** (types, defaults, constraints). This is a reference card — enough to call the tool correctly. It is not enough to call the tool **wisely**.

An implement's `instructions.md` is an optional teaching document that is delivered to the anima as part of its composed identity (system prompt), not as MCP metadata. It provides what a reference card cannot:

- **When to use the tool** — "Always consult the Master Sage before dispatching to artificers"
- **When NOT to use it** — "Don't dispatch if the commission spec lacks acceptance criteria"
- **Workflow context** — "After dispatching, record the commission ID in your notes for the handoff"
- **Judgment guidance** — "Use priority:urgent sparingly — it preempts other work. Include justification in the spec"
- **Institutional conventions** — "Specs should follow the guild's spec format: problem statement, acceptance criteria, constraints"
- **Interaction with other tools** — "If dispatch returns a conflict, use get-anima to check the anima's current commission before retrying"

The MCP schema tells the anima what buttons a tool has. The instructions teach the **craft of using it** — when to reach for it, what judgment to apply, how it fits into the guild's workflows.

Not every implement needs instructions. A simple query tool (`get-anima`) may be fully described by its MCP schema and parameter descriptions. Instructions matter most for implements that require judgment: dispatch, publish, instantiate — tools where knowing the API isn't enough.

Instructions are also **institutional, not intrinsic**. The MCP schema is the tool's own contract — the same everywhere. Instructions reflect the guild's teaching about how to use the tool, and they compose with the rest of the anima's identity (codex, curriculum, temperament). The same implement installed in two different guilds could have different instructions reflecting different policies and workflows.

---

## The descriptor file

Every artifact has a descriptor at its root:

- **`nexus-implement.json`** for implements
- **`nexus-engine.json`** for engines

### Schema

Required fields marked with `*`:

```json
{
  "entry": "index.js",                    // * entry point
  "kind": "module",                       // "module" or "script" (inferred from entry if omitted)
  "instructions": "instructions.md",      // implements only — delivered to animas (optional)
  "version": "1.11.3",                    // upstream version (semver)
  "description": "Post commissions and trigger the manifest engine",
  "repository": "https://github.com/nexus/dispatch",
  "license": "MIT",
  "nexusVersion": ">=0.1.0"              // compatible Nexus version range
}
```

Only `entry` is required. All other fields are optional.

There is no `name` field — the **directory name is the tool's identity**. After installation, the directory name (`dispatch/`, `my-engine/`) is the canonical name. During installation from npm, the directory name is derived from the package name (strip scope: `@shardworks/dispatch` → `dispatch`) or specified with `--name`.

### Kind

The `kind` field tells the framework what shape the entry point is:

| Kind | Entry point | MCP engine behavior | CLI behavior |
|------|-------------|--------------------|-|
| `module` | JS/TS module exporting a Nexus implement | Imports handler, registers as typed tool | Auto-generates Commander options from Zod schema |
| `script` | Any executable | Wraps as shell-out call | Delegates directly |

If `kind` is omitted, it is inferred from the entry point's file extension (see [kind inference](#kind-inference)). An explicit `kind` always takes precedence.

### `package.json` fallback

If a `package.json` also exists in the package, the descriptor fields take precedence. Fields present only in `package.json` (e.g. `version`, `description`, `repository`) are used as fallbacks. This means:

- An npm package can omit duplicated fields from the descriptor and let `package.json` provide them
- A hand-built tool with no `package.json` puts everything in the descriptor
- Either way, the installer resolves from the same merged view

For `entry` specifically: if absent from the descriptor, the installer falls back to `package.json`'s `main` / `exports` / `bin`.

---

## On-disk layout

Installed tools live in versioned **slot** directories:

```
guildhall/
  nexus/                          ← framework-managed
    implements/
      dispatch/0.1.0/
        nexus-implement.json      →  { "entry": "handler.js", ... }
        handler.js                →  module exporting the implement handler
        instructions.md
      publish/0.1.0/
      install-tool/0.1.0/
      remove-tool/0.1.0/
      instantiate/0.1.0/
    engines/
      manifest/0.1.0/
        nexus-engine.json
        index.js
      mcp-server/0.1.0/
        nexus-engine.json
        index.js
      worktree-setup/0.1.0/
      ledger-migrate/0.1.0/
    migrations/
      001-initial-schema.sql
  implements/                     ← guild-managed
    my-tool/0.3.0/
      nexus-implement.json
      handler.js
      instructions.md
  engines/                        ← guild-managed
    my-engine/1.0.0/
      nexus-engine.json
      run.sh
```

**Framework implements** are `kind: "module"` packages — the same shape as any guild-authored implement. Each contains a descriptor, a handler module, and an instructions document. The handler modules import core logic from `@shardworks/nexus-core`. `nexus init` copies these packages into `nexus/implements/`. `nexus repair` regenerates them from the same source. See [framework tools: workspace packages](#framework-tools-workspace-packages) for the development-time structure.

**Framework engines** (manifest, mcp-server, worktree-setup, ledger-migrate) follow the same pattern — each has a descriptor and an entry point module. The MCP engine is the framework engine that serves implements as MCP tools during anima sessions.

**Guild-installed tools** are pristine copies of the source package — the installer never modifies their contents. Guild implements can be either `module` or `script` kind. All provenance metadata (where the tool came from, when it was installed) lives in `guild.json`, not in the installed files.

Other files (`README.md`, `LICENSE`, `package.json`, source maps, etc.) are installed as-is alongside the descriptor and entry point. The entire package contents end up in the slot directory — no cherry-picking.

---

## Role gating

Implements are gated by role — an anima only has access to implements permitted by its roles. An anima may hold **multiple roles** (e.g. both artificer and sage), and its available implements are the **union** of all implements permitted across all of its roles.

Role permissions are declared in `guild.json` as part of each implement's registration:

```json
{
  "implements": {
    "dispatch": {
      "source": "nexus",
      "slot": "0.1.0",
      "roles": ["*"],
      "upstream": null,
      "installedAt": "2026-03-23T12:00:00Z"
    },
    "install-tool": {
      "source": "nexus",
      "slot": "0.1.0",
      "roles": ["*"],
      "upstream": null,
      "installedAt": "2026-03-23T12:00:00Z"
    },
    "my-custom-tool": {
      "source": "guild",
      "slot": "0.3.0",
      "roles": ["sage"],
      "upstream": null,
      "installedAt": "2026-03-22T09:30:00Z"
    }
  }
}
```

| Field | Meaning |
|-------|---------|
| `source` | `"nexus"` (framework-provided) or `"guild"` (guild-authored/installed) |
| `slot` | Directory name under `{implements\|engines}/{name}/` |
| `roles` | Array of roles that may use this implement. `["*"]` means all roles. |
| `upstream` | npm package specifier the tool was installed from, or `null` for locally-built tools |
| `installedAt` | ISO-8601 timestamp of installation |

At manifest time, the manifest engine computes the implement set:

```
Anima "Valdris" has roles: [artificer, sage]

  dispatch      — roles: [*]            → wildcard         ✓
  install-tool  — roles: [*]            → wildcard         ✓
  publish       — roles: [*]            → wildcard         ✓
  my-linter     — roles: [artificer]    → artificer matches ✓
  plan          — roles: [sage]         → sage matches     ✓
  review        — roles: [guildmaster]  → no match         ✗

  Valdris gets: [dispatch, install-tool, publish, my-linter, plan]
```

The MCP engine is launched with this resolved set. The anima sees exactly the tools its combined roles permit — no more, no less.

Engines do not have role gating — they are infrastructure, not tools wielded by animas. Their `guild.json` entries omit `roles`:

```json
{
  "engines": {
    "manifest": {
      "source": "nexus",
      "slot": "0.1.0",
      "upstream": null,
      "installedAt": "2026-03-23T12:00:00Z"
    },
    "mcp-server": {
      "source": "nexus",
      "slot": "0.1.0",
      "upstream": null,
      "installedAt": "2026-03-23T12:00:00Z"
    }
  }
}
```

The manifest engine resolves tool paths from `source` + `slot`: `nexus` → `nexus/implements/{name}/{slot}/`, `guild` → `implements/{name}/{slot}/`.

---

## Version slots

The **slot** is the name of the on-disk directory for a particular installation of a tool. It decouples the guild's operational versioning from upstream release cadence.

### Slot naming

When installing, the slot name is determined as follows:

| Source | Slot name | Example |
|--------|-----------|---------|
| npm package | The installed package version | `@shardworks/dispatch@1.11.3` → slot `1.11.3` |
| Local directory or tarball with `version` in descriptor | The descriptor's `version` field | `{ "version": "0.3.0" }` → slot `0.3.0` |
| Local directory or tarball without `version` | Must be specified with `--slot` | `install-tool ./my-tool --slot 0.1.0` |
| Explicit override | Always wins | `install-tool @shardworks/dispatch@1.11.3 --slot v1` |

For npm packages, the default is clean — the upstream version *is* the slot name. For local sources without a version, requiring `--slot` avoids ambiguity.

### Slot lifecycle

- **New slot**: Installing a version that doesn't match an existing slot creates a new directory. Both old and new remain on disk; `guild.json` points at whichever is active.
- **Overwrite**: Installing a version that matches an existing slot replaces it in place (e.g. reinstalling `1.11.3` after a rebuild).
- **Rollback**: Point `guild.json`'s `slot` field back to the previous directory. The files are still there.

---

## Installation

### The `install-tool` implement

`install-tool` is a base implement provided by Nexus. It accepts a polymorphic **tool source** argument:

| Input shape | Example | Behavior |
|-------------|---------|----------|
| npm specifier | `install-tool @shardworks/dispatch@^2.0.0` | Fetch from registry, unpack to slot |
| Bare name | `install-tool dispatch` | Shorthand for `@shardworks/dispatch@latest` |
| Local tarball | `install-tool ./dispatch-1.0.0.tgz` | Unpack, read descriptor |
| Local directory | `install-tool ./path/to/tool` | Copy directory, read descriptor |

Every path converges to the same core operation: "I have a directory with a descriptor. Validate it, place it in a slot, register it."

The install process:

1. Resolve the source to a local directory (fetch/unpack if needed)
2. Find and validate the descriptor (`nexus-implement.json`, `nexus-engine.json`, `nexus-curriculum.json`, or `nexus-temperament.json`)
3. Determine the tool name (from `--name`, or derived from package/directory name)
4. Determine the slot name (from version, or `--slot` flag)
5. Copy the entire directory to the appropriate location
6. Register in `guild.json` (source, slot, upstream, timestamp, roles for implements)
7. Commit to the guildhall

Both the CLI (`nexus install-tool`) and the implement (wielded by animas via MCP) share the same core logic. Currently only local directory sources are implemented; npm and tarball sources are planned. The CLI adds operator niceties (interactive prompts, `--dry-run`); the MCP interface provides the anima-facing tool.

### The `remove-tool` implement

`remove-tool` is the counterpart to `install-tool`. It deregisters a tool from `guild.json` and removes its on-disk directory. Only guild-managed tools can be removed — framework tools (`source: "nexus"`) are managed by `nexus repair` / `nexus install` and cannot be removed through this implement.

If removing a tool leaves its parent name directory empty (e.g. `implements/my-tool/` after removing the only slot), the parent directory is also cleaned up.

### Installation sources

| Source | Example | How it resolves |
|--------|---------|-----------------|
| npm registry | `install-tool dispatch` | Fetches from npm, unpacks to slot |
| Scoped / private | `install-tool @org/tool` | Same, with registry auth |
| Local tarball | `install-tool ./tool.tgz` | Unpacks tarball, reads descriptor |
| Local directory | `install-tool ./path/` | Copies directory, reads descriptor |
| In-repo build | *(no install step)* | Tool lives directly in `implements/` or `engines/` |

### Framework tools: workspace packages

Base implements and engines are separate packages in the Nexus monorepo — each one a complete artifact with its own descriptor, handler module, and (for implements) instructions document. They follow the same artifact shape as any guild-authored tool; they just happen to be maintained alongside the framework.

The monorepo is structured as a pnpm workspace:

```
packages/
  core/                          ← @shardworks/nexus-core — shared library (ledger, config, paths, install logic)
  cli/                           ← @shardworks/nexus — the CLI operators run
  implement-install-tool/        ← base implement: install-tool
  engine-mcp-server/             ← base engine: mcp-server
  engine-ledger-migrate/         ← base engine: ledger-migrate
  ...                            ← additional base implements/engines as separate packages
```

All handler modules in base implements import from `@shardworks/nexus-core` — the shared library that owns guild configuration, ledger access, path resolution, and core operations like `installTool()`. The CLI is a separate consumer of the same library. This clean separation means:

- **Implement handlers don't depend on the CLI** — they import `@shardworks/nexus-core` directly, same as any guild-authored module implement would.
- **The CLI doesn't contain implement logic** — it's a thin wrapper that imports handlers from `@shardworks/nexus-core` or from implement packages.
- **New base implements are just new packages** — add a directory under `packages/`, give it a descriptor and a handler that imports from `@shardworks/nexus-core`, done.

`nexus init` copies each base implement/engine package into the appropriate `nexus/implements/` or `nexus/engines/` slot and registers it in `guild.json` with `source: "nexus"`, the current framework version as the slot, and `roles: ["*"]` for implements. `nexus repair` regenerates them from the same source packages.

The `nexus` CLI also exposes base implements as subcommands (`nexus install-tool`, etc.) — calling the same handler code from `@shardworks/nexus-core`. Humans use CLI subcommands; animas use MCP tools; both execute the same underlying logic.

This model means:
- **Same artifact shape** — framework implements are identical in structure to guild implements; the MCP engine loads them the same way
- **Clean dependency graph** — implements → `@shardworks/nexus-core` ← CLI. No circular dependencies, no implement-knows-about-CLI coupling
- **Easy iteration** — each base implement is its own package with its own tests, independently buildable and testable
- **Version coherence** — all base tools share the framework version; the slot matches the framework version at install time
- **Anima interface** — animas see the same kind of MCP tools whether they came from the framework or the guild

---

## Ad-hoc / in-repo development

Guild-authored tools can live directly in `implements/` or `engines/` without a publishing step. A tool directory with a valid descriptor is installable as-is. For development, the tool can have a `src/` subdirectory with TypeScript source and a build script — the built artifact goes into the versioned directory.

The simplest possible guild implement is a shell script and a one-line descriptor:

```
my-tool/0.1.0/
  nexus-implement.json  →  { "entry": "run.sh" }
  run.sh                →  #!/usr/bin/env bash ...
```

No SDK, no TypeScript, no build step. The framework infers `kind: "script"` from the `.sh` extension, wraps it for MCP automatically, and the anima can call it as a typed tool.

When ready to share, `npm pack` from the tool directory creates a `.tgz` that any guild can install. Since the descriptor is the contract, sharing works regardless of whether the tool was originally built with npm in mind.

### Animas building tools

An anima commissioned to build a new implement works in a workshop worktree like any other commission. When the commission completes:

1. Leadership reviews the output
2. `install-tool ./path/to/built-tool --slot 0.1.0` installs it into the guild
3. The tool is now operational — registered in `guild.json`, resolved by the manifest engine

Since `install-tool` is itself an implement, animas with appropriate access can install tools directly — enabling the guild to extend its own toolkit autonomously.

---

## Curricula & Temperaments

Curricula and temperaments follow the same packaging model as implements and engines — a descriptor file, content, versioned slot directories, and registration in `guild.json`. The key difference: they are not executed, they are **read as text** and delivered to animas as part of their composition.

### Descriptors

- **`nexus-curriculum.json`** — for curricula
- **`nexus-temperament.json`** — for temperaments

Schema (required fields marked with `*`):

```json
{
  "content": "curriculum.md",    // * path to the content file
  "version": "2.0.0",            // upstream version (semver)
  "description": "Craft-focused builder — TDD, clean code, iterative delivery"
}
```

Only `content` is required — the path to the markdown file within the package. As with tools, the **directory name is identity** (no `name` field), and `version`/`description` fall back to `package.json` if present.

### On-disk layout

```
training/
  curricula/
    artificer-craft/2.0.0/
      nexus-curriculum.json
      curriculum.md
    guild-standards/1.0.0/
      nexus-curriculum.json
      curriculum.md
  temperaments/
    stoic/1.0.0/
      nexus-temperament.json
      temperament.md
    candid/1.0.0/
      nexus-temperament.json
      temperament.md
```

### guild.json registration

Curricula and temperaments have simpler registry entries than implements — no `source` (there is no framework/guild split for training content) and no `roles` (they are composition, not access control):

```json
{
  "curricula": {
    "artificer-craft": {
      "slot": "2.0.0",
      "upstream": "@shardworks/curriculum-artificer@2.0.0",
      "installedAt": "2026-03-23T12:00:00Z"
    },
    "guild-standards": {
      "slot": "1.0.0",
      "upstream": null,
      "installedAt": "2026-03-23T10:00:00Z"
    }
  },
  "temperaments": {
    "stoic": {
      "slot": "1.0.0",
      "upstream": null,
      "installedAt": "2026-03-23T10:00:00Z"
    }
  }
}
```

The registry answers "what training content is available in this guild." It does *not* assign training content to roles — that's the wrong layer. A curriculum and temperament are assigned to an individual **anima** at instantiation time (recorded in the Ledger). The `instantiate` implement picks from the available set.

### How they differ from tools

| | Implements/Engines | Curricula/Temperaments |
|---|---|---|
| Executed? | Yes — handler (module or script) | No — read as text |
| Access paths? | MCP (animas), CLI (humans), import (engines) | Manifest engine only |
| `roles` gating? | Yes (implements only) | No — assigned per-anima |
| `source` field? | Yes (nexus vs guild) | No |
| Instructions doc? | Optional (implements only) | N/A — they *are* the instructions |
| Installed by | `install-tool` | `install-tool` (same command) |
| Registered in | `guild.json` implements/engines | `guild.json` curricula/temperaments |
| Consumed by | Animas at runtime (MCP tools) | Manifest engine at assembly time |
