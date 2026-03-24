# External MCP Servers

External MCP servers let guilds declare access to pre-existing MCP servers — GitHub, databases, Slack, or any other service that speaks MCP — alongside the guild's own tool server. The manifest engine resolves which servers each anima gets (via role gating) and includes them in the session configuration.

---

## Motivation

Guild tools (the `tool()` SDK, `nexus-tool.json`) are purpose-built for the guild. But many capabilities already exist as published MCP servers:

- **`@modelcontextprotocol/server-github`** — GitHub issues, PRs, repos
- **`@modelcontextprotocol/server-slack`** — Slack messaging
- **`@modelcontextprotocol/server-postgres`** — database queries
- Community and proprietary servers for any service with an MCP integration

Today, connecting these requires manual `.mcp.json` configuration outside the guild system. The guild can't role-gate them, can't include them in manifested sessions, and can't declare them as institutional infrastructure.

---

## Design

### guild.json: `servers` section

External MCP servers are declared in `guild.json` under a `servers` key, parallel to `tools` and `engines`:

```json
{
  "servers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_TOKEN}"
      }
    },
    "postgres": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-postgres"],
      "env": {
        "DATABASE_URL": "${DATABASE_URL}"
      }
    }
  }
}
```

Each entry is keyed by a **server name** — an identifier chosen by the guild operator. The value describes how to launch the server process.

#### Server entry fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `command` | `string` | Yes | The executable to run |
| `args` | `string[]` | No | Arguments to the command |
| `env` | `Record<string, string>` | No | Environment variables for the server process |
| `description` | `string` | No | Human-readable description of what this server provides |

Environment variable values support **`${VAR_NAME}` interpolation** — resolved from the host environment at launch time. This keeps secrets out of `guild.json`. If a referenced variable is not set in the environment, the manifest engine emits a warning (the server will likely fail to authenticate, but that's the server's problem to report).

### Role gating

Servers are assigned to roles the same way tools are — via the role definition's `servers` list:

```json
{
  "baseServers": ["github"],
  "roles": {
    "artificer": {
      "seats": null,
      "tools": ["my-linter"],
      "servers": ["postgres"],
      "instructions": "roles/artificer.md"
    }
  }
}
```

| Field | Meaning |
|-------|---------|
| `baseServers` | Servers available to all animas (like `baseTools`) |
| `roles.*.servers` | Additional servers available to animas holding this role |

Resolution works identically to tools: the manifest engine computes the union of `baseServers` + all role-specific servers for the anima's roles.

### Manifest engine changes

The manifest engine gains a `resolveServers()` function parallel to `resolveTools()`:

```typescript
export interface ResolvedServer {
  /** Server name — how it appears in session config. */
  name: string;
  /** Command to launch the server. */
  command: string;
  /** Arguments to the command. */
  args: string[];
  /** Environment variables (after interpolation). */
  env: Record<string, string>;
}
```

The `ManifestResult` type expands:

```typescript
export interface ManifestResult {
  anima: AnimaRecord;
  systemPrompt: string;
  mcpConfig: McpServerConfig;       // guild's own MCP server (tools)
  externalServers: ResolvedServer[]; // external MCP servers
  unavailable: UnavailableTool[];
  warnings: string[];
}
```

The consumer of `ManifestResult` (whatever launches the Claude session) wires up both:
1. The guild MCP server as the primary tool server
2. Each resolved external server as an additional MCP server

### Session launch output

The manifest engine can produce a `.mcp.json`-compatible config block for the session:

```json
{
  "mcpServers": {
    "nexus-guild": {
      "command": "node",
      "args": ["engines/mcp-server/index.js", "/tmp/nexus-session-config.json"],
      "env": { "NODE_PATH": "/path/to/guild/node_modules" }
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": { "GITHUB_PERSONAL_ACCESS_TOKEN": "ghp_..." }
    },
    "postgres": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-postgres"],
      "env": { "DATABASE_URL": "postgresql://..." }
    }
  }
}
```

This maps directly to Claude Code's MCP server configuration format. The guild MCP server and external servers are peers — Claude's runtime manages all of them identically.

---

## What External Servers Are Not

External servers are **not tools, not engines, and not installable artifacts**. They are infrastructure declarations — config that says "this guild has access to this service." Key differences from guild tools:

| | Guild Tools | External Servers |
|---|---|---|
| Authored by | Guild or framework | Third parties |
| Installed via | `install-tool` | Edit `guild.json` directly |
| Has descriptor? | Yes (`nexus-tool.json`) | No — config only |
| Has instructions? | Optional (`instructions.md`) | No (see below) |
| Individual tool gating? | Yes — each tool is a named entry | No — whole server, all or nothing |
| Runs in | Guild MCP server process | Own separate process |
| Managed by | Nexus framework | Claude runtime |

### Instructions for external server tools

External MCP servers bring their own tool descriptions and schemas — the MCP protocol handles that. But the guild may want to provide **institutional guidance** for how animas should use external tools (e.g., "don't create GitHub issues directly — use the dispatch workflow instead").

This guidance belongs in **role instructions** or **codex documents**, not on the server entry. The server entry is launch config; teaching is the guild's domain. A role instruction file can reference external tools by name:

```markdown
## GitHub Access

You have access to GitHub tools via the `github` MCP server. Guidelines:

- Use `create_pull_request` only for commissions you are actively working on
- Never force-push to main — the guild's branch protection will reject it anyway
- Prefer `search_issues` before creating new issues to avoid duplicates
```

This keeps the separation clean: the server config says "how to launch it," role/codex docs say "how to use it wisely."

---

## Preconditions

External servers don't use the tool precondition system (they have no `nexus-tool.json`). However, the manifest engine can perform basic availability checks:

1. **Command exists** — verify the `command` is on PATH (e.g., `npx` exists)
2. **Env vars set** — verify all `${VAR}` references in `env` resolve to non-empty values

Failed checks move the server to an `unavailableServers` list in the manifest result, with reasons. The system prompt can inform the anima:

> The **github** server is unavailable: environment variable `GITHUB_TOKEN` is not set. GitHub tools will not be available this session.

This mirrors how unavailable tools work today.

---

## Type Changes

### GuildConfig (nexus-core)

```typescript
export interface ServerEntry {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  description?: string;
}

export interface RoleDefinition {
  seats: number | null;
  tools: string[];
  servers?: string[];      // ← new
  instructions?: string;
}

export interface GuildConfig {
  baseTools: string[];
  baseServers?: string[];  // ← new
  roles: Record<string, RoleDefinition>;
  tools: Record<string, ToolEntry>;
  engines: Record<string, ToolEntry>;
  servers?: Record<string, ServerEntry>;  // ← new
  curricula: Record<string, TrainingEntry>;
  temperaments: Record<string, TrainingEntry>;
}
```

### ManifestResult (engine-manifest)

```typescript
export interface ResolvedServer {
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
}

export interface UnavailableServer {
  name: string;
  reasons: string[];
}

export interface ManifestResult {
  anima: AnimaRecord;
  systemPrompt: string;
  mcpConfig: McpServerConfig;
  externalServers: ResolvedServer[];       // ← new
  unavailableServers: UnavailableServer[]; // ← new
  unavailable: UnavailableTool[];
  warnings: string[];
}
```

---

## Implementation Plan

1. **Add `ServerEntry` type and `servers`/`baseServers` fields** to `GuildConfig` in `nexus-core`. Update `guild-config.ts` schema validation.

2. **Add `servers` field to `RoleDefinition`** — optional string array, defaults to `[]`.

3. **Add `resolveServers()` to the manifest engine** — parallel to `resolveTools()`. Collects `baseServers` + role-specific servers, deduplicates, validates entries exist in `guild.json.servers`, interpolates env vars, runs availability checks.

4. **Expand `ManifestResult`** with `externalServers` and `unavailableServers` fields.

5. **Update `assembleSystemPrompt()`** to include unavailable server notices alongside unavailable tool notices.

6. **Update `nsg status`** to display configured servers and their availability.

7. **Update docs** — `tools-and-engines.md` (or a new `external-servers.md`), `overview.md`.

8. **Starter kit** — the guild starter kit does not ship with any external servers. Servers are opt-in guild infrastructure.

---

## Deferred

- **Server-level instructions** — a dedicated `instructions` field on the server entry, delivered to the system prompt. Could be useful but role/codex instructions cover this for now.
- **Individual tool gating within a server** — MCP doesn't support "connect but hide some tools." Would require a proxy layer. Not worth the complexity yet.
- **`install-server` / `remove-server` commands** — servers are config, not artifacts. Editing `guild.json` directly is fine for now. Could add convenience commands later if guilds accumulate many servers.
- **Server health monitoring** — pinging a server to verify it's healthy before/during a session. Deferred to Clockworks Phase 2 (daemon mode).
- **SSE/Streamable HTTP transport** — the spec assumes stdio servers (command + args). Remote MCP servers over HTTP would need a `url` field instead of `command`. Add when there's a real use case.
