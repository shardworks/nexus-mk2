# Inventory: create-copilot-session-provider

## Brief

Add a SessionProvider for GitHub Copilot as a new apparatus package, parallel to `@shardworks/claude-code-apparatus`, so operators can use it instead of Claude Code by setting `guild.json["animator"]["sessionProvider"] = "copilot"`.

---

## Affected Files

### New files (to be created)

| File | Purpose |
|------|---------|
| `packages/plugins/copilot/package.json` | Package manifest — `@shardworks/copilot-apparatus` |
| `packages/plugins/copilot/tsconfig.json` | TypeScript config, extends root |
| `packages/plugins/copilot/src/index.ts` | Provider implementation + `Plugin` export |
| `packages/plugins/copilot/src/index.test.ts` | Tests for the provider |

No existing files should need modification. The Animator discovers providers at runtime via `guild().apparatus(pluginId)` — no hardcoded list.

---

## Existing Files Read (do not modify)

| File | Role |
|------|------|
| `packages/plugins/claude-code/src/index.ts` | Primary sibling — the reference implementation to mirror |
| `packages/plugins/claude-code/src/mcp-server.ts` | MCP server (Claude-specific; copilot will NOT share this) |
| `packages/plugins/claude-code/src/stream-parser.test.ts` | Test patterns to follow |
| `packages/plugins/claude-code/src/mcp-server.test.ts` | Test patterns to follow |
| `packages/plugins/claude-code/package.json` | Package structure to mirror |
| `packages/plugins/claude-code/tsconfig.json` | tsconfig pattern |
| `packages/plugins/animator/src/types.ts` | **Contract definitions** — AnimatorSessionProvider, SessionProviderConfig, SessionProviderResult, SessionChunk |
| `packages/plugins/animator/src/animator.ts` | Shows how providers are discovered and invoked |
| `packages/plugins/animator/src/animator.test.ts` | Shows how a fake provider works in tests — exact pattern to follow for unit tests |
| `packages/plugins/animator/package.json` | Package name `@shardworks/animator-apparatus` |
| `packages/framework/core/src/plugin.ts` | Plugin / Apparatus / Kit types |
| `packages/framework/core/src/guild.ts` | Guild singleton interface |
| `packages/framework/core/src/resolve-package.ts` | `derivePluginId()` — naming convention |
| `packages/framework/core/src/guild-config.ts` | GuildConfig shape |
| `packages/framework/arbor/src/arbor.ts` | Plugin loading pipeline |
| `tsconfig.json` | Root tsconfig |
| `pnpm-workspace.yaml` | Workspace layout |
| `docs/architecture/apparatus/claude-code.md` | Reference doc for the sibling apparatus |
| `docs/architecture/apparatus/_template.md` | Doc template |

---

## Contract: AnimatorSessionProvider (verbatim from types.ts)

```typescript
// From packages/plugins/animator/src/types.ts

export interface AnimatorSessionProvider {
  /** Human-readable name (e.g. 'claude-code'). */
  name: string;

  launch(config: SessionProviderConfig): {
    chunks: AsyncIterable<SessionChunk>;
    result: Promise<SessionProviderResult>;
  };
}

export interface SessionProviderConfig {
  systemPrompt?: string;
  initialPrompt?: string;
  model: string;
  conversationId?: string;
  cwd: string;
  streaming?: boolean;
  tools?: ResolvedTool[];          // from @shardworks/tools-apparatus
  environment?: Record<string, string>;
}

export type SessionChunk =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; tool: string }
  | { type: 'tool_result'; tool: string };

export interface SessionProviderResult {
  status: 'completed' | 'failed' | 'timeout';
  exitCode: number;
  error?: string;
  providerSessionId?: string;
  tokenUsage?: TokenUsage;
  costUsd?: number;
  transcript?: TranscriptMessage[];
  output?: string;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}

export type TranscriptMessage = Record<string, unknown>;

/** Plugin configuration stored at guild.json["animator"]. */
export interface AnimatorConfig {
  sessionProvider?: string;  // defaults to 'claude-code'
}
```

---

## Provider Discovery (verbatim from animator.ts)

```typescript
function resolveProvider(config: AnimatorConfig): AnimatorSessionProvider {
  const pluginId = config.sessionProvider ?? 'claude-code';
  return guild().apparatus<AnimatorSessionProvider>(pluginId);
}
```

The Animator calls this at animate-time (not startup). The copilot apparatus's `provides` object must satisfy `AnimatorSessionProvider`. The apparatus is looked up by plugin id (`'copilot'` once installed).

---

## Plugin Export Shape (verbatim from core/plugin.ts)

```typescript
export type Plugin =
  | { kit:       Kit }
  | { apparatus: Apparatus }

export type Apparatus = {
  requires?:    string[]
  recommends?:  string[]
  provides?:    unknown
  start:        (ctx: StartupContext) => void | Promise<void>
  stop?:        () => void | Promise<void>
  supportKit?:  Kit
  consumes?:    string[]
}
```

The claude-code apparatus:
- `requires: []` (no apparatus dependencies — AnimatorSessionProvider is imported as a type only)
- `provides: provider` (the `AnimatorSessionProvider` implementation)
- `start()` is a no-op

---

## Plugin ID Derivation (verbatim from resolve-package.ts)

```typescript
export function derivePluginId(packageName: string): string {
  let name: string;
  if (packageName.startsWith('@shardworks/')) {
    name = packageName.slice('@shardworks/'.length);
  } else if (packageName.startsWith('@')) {
    name = packageName.slice(1);
  } else {
    name = packageName;
  }
  return name.replace(/-(plugin|apparatus|kit)$/, '');
}
```

`@shardworks/copilot-apparatus` → `copilot`. This becomes the plugin id in `guild.json["plugins"]` and in `guild.json["animator"]["sessionProvider"]`.

---

## Reference Implementation: claude-code (full summary)

Located at `packages/plugins/claude-code/src/index.ts`. Key structure:

### What it does

1. `prepareSession(config)` — writes temp directory, assembles CLI args:
   - Creates `nsg-session-XXXXX` temp dir
   - Builds args: `--setting-sources user`, `--dangerously-skip-permissions`, `--model <model>`
   - If `config.systemPrompt`: writes to file, adds `--system-prompt-file <path>`
   - If `config.conversationId`: adds `--resume <id>`
   - If `config.tools && tools.length > 0`: starts `startMcpHttpServer(tools)`, writes `--mcp-config` JSON, adds `--mcp-config <path>`, `--strict-mcp-config`

2. `launch(config)` — orchestrates async prep and process spawn:
   - Calls `prepareSession()` (async, because MCP server start is async)
   - Adds `--print -`, `--output-format stream-json`, `--verbose`
   - Pipes `config.initialPrompt` via stdin
   - Delegates to `spawnClaudeStreamJson()` (non-streaming) or `spawnClaudeStreamingJson()` (streaming)
   - Cleans up temp dir and MCP server in finally block

3. `spawnClaudeStreamJson(args, cwd, env, stdin)` — spawns `claude` process, accumulates NDJSON result into `StreamJsonResult`

4. `spawnClaudeStreamingJson(args, cwd, env, stdin)` — spawns `claude` process, yields `SessionChunk` objects in real time AND accumulates full result

5. `parseStreamJsonMessage(msg, acc)` — parses one NDJSON line into chunks + accumulator updates

6. `processNdjsonBuffer(buffer, handler)` — splits buffer on `\n`, calls handler for each complete JSON line

7. `extractFinalAssistantText(transcript)` — walks transcript backwards for last assistant message's text blocks

8. `buildResult(raw)` — converts `StreamJsonResult` → `SessionProviderResult`

### Provider object shape

```typescript
const provider: AnimatorSessionProvider = {
  name: 'claude-code',
  launch(config: SessionProviderConfig): {
    chunks: AsyncIterable<SessionChunk>;
    result: Promise<SessionProviderResult>;
  } { ... }
};
```

### Plugin export shape

```typescript
export function createClaudeCodeProvider(): Plugin {
  return {
    apparatus: {
      requires: [],
      provides: provider,
      start() { /* no-op */ },
    },
  };
}

export default createClaudeCodeProvider();
```

### Exported types/functions (the new package does NOT need to share these)

- `createMcpServer`, `startMcpHttpServer`, `McpHttpHandle` — Claude-specific MCP tooling
- `extractFinalAssistantText`, `parseStreamJsonMessage`, `processNdjsonBuffer` — exported for testing
- `StreamJsonResult` — internal type exported for testing

---

## Package Structure: claude-code (verbatim from package.json)

```json
{
  "name": "@shardworks/claude-code-apparatus",
  "version": "0.0.0",
  "license": "ISC",
  "description": "Claude Code session provider apparatus...",
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "build": "tsc",
    "test": "node --disable-warning=ExperimentalWarning --experimental-transform-types --test 'src/**/*.test.ts'",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "1.27.1",
    "@shardworks/animator-apparatus": "workspace:*",
    "@shardworks/nexus-core": "workspace:*",
    "@shardworks/tools-apparatus": "workspace:*",
    "zod": "4.3.6"
  },
  "devDependencies": {
    "@types/node": "25.5.0"
  },
  "files": ["dist"],
  "publishConfig": {
    "exports": {
      ".": {
        "types": "./dist/index.d.ts",
        "import": "./dist/index.js"
      }
    }
  }
}
```

---

## tsconfig Pattern (all packages extend root, verbatim)

Root `tsconfig.json`:
```json
{
  "extends": "@tsconfig/node24/tsconfig.json",
  "compilerOptions": {
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "verbatimModuleSyntax": true,
    "rewriteRelativeImportExtensions": true,
    "composite": true
  }
}
```

Package tsconfig (e.g. `packages/plugins/claude-code/tsconfig.json`):
```json
{
  "extends": "../../../tsconfig.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src"],
  "exclude": ["src/**/*.test.ts"]
}
```

---

## Test Pattern: Fake Provider in Animator Tests (verbatim from animator.test.ts)

The animator tests create fake providers that implement `AnimatorSessionProvider`:

```typescript
function createFakeProvider(overrides: Partial<SessionProviderResult> = {}): AnimatorSessionProvider {
  return {
    name: 'fake',
    launch(_config: SessionProviderConfig) {
      return {
        chunks: emptyChunks,
        result: Promise.resolve({
          status: 'completed' as const,
          exitCode: 0,
          ...overrides,
        }),
      };
    },
  };
}
```

The new copilot apparatus's own tests should mock the actual network/API calls (since there's no real `claude` binary to spawn), exposing the logic of:
- Argument/request construction from `SessionProviderConfig`
- Response parsing into `SessionProviderResult`
- Streaming chunk emission
- Error/exit-code handling

---

## What GitHub Copilot Offers for Autonomous Sessions

No existing copilot code is in the repository. The following is a neutral survey of the available surfaces for a copilot session provider, to inform the analyst:

### 1. GitHub Models REST API
- OpenAI-compatible chat completions endpoint: `https://models.inference.ai.azure.com/chat/completions`
- Authenticated via `GITHUB_TOKEN` (or a fine-grained PAT with Models read access)
- Streaming support via `stream: true` (SSE with `data:` lines of JSON)
- Models available include Copilot-branded models (GPT-4o, o1, etc.)
- No autonomous agent loop built in — the provider would implement the agentic loop (tool calls → parse → respond → repeat)
- Token usage and cost reported in response body (`usage` field)
- No native `--resume` analog — conversation continuity via message history in request body
- No process spawning — pure HTTP

### 2. GitHub Copilot Chat API (internal, not public)
- Used by VS Code/JetBrains extensions; not a documented public API
- Not suitable for a plugin apparatus

### 3. `gh copilot` CLI commands
- `gh copilot explain` and `gh copilot suggest` — interactive, not autonomous
- No `--print` / `--output-format stream-json` analogs
- Not suitable for an autonomous session provider

### 4. GitHub Copilot Extensions (agent protocol)
- HTTP-based protocol for building Copilot Extensions (chat in github.com/VS Code)
- Receives events from GitHub, not the other direction
- Not suitable — requires a running HTTP server to receive Copilot's calls

**Most viable**: GitHub Models REST API, called programmatically via `fetch()` or OpenAI-compatible SDK. This would make the copilot provider fundamentally different from claude-code: HTTP calls instead of process spawn, response parsing instead of NDJSON stream parsing, no MCP server (tool calls go through the API's tool-use mechanism).

---

## Key Differences vs. Claude Code Provider

| Concern | claude-code | copilot (expected) |
|---------|-------------|---------------------|
| Invocation | Spawns `claude` CLI process | HTTP API call |
| Streaming | NDJSON stdout from process | SSE response stream |
| Prompt delivery | Stdin (`--print -`) | Request body (`messages[].content`) |
| System prompt | File (`--system-prompt-file`) | `messages[0]` with role `system` |
| Conversation resume | `--resume <providerSessionId>` | Full message history in request |
| Tool injection | MCP HTTP server + `--mcp-config` | API tool_calls mechanism |
| Cost reporting | `result` NDJSON message `total_cost_usd` | `usage` field in HTTP response |
| Token usage | `result.usage` in NDJSON | `usage` field in HTTP response |
| Session id | `result.session_id` in NDJSON | No native equivalent — generated by the new apparatus |
| Model | `--model` CLI arg | `model` field in HTTP request body |
| Environment injection | Spread into `spawn()` env | Not applicable (no subprocess) |
| MCP tools | Fully implemented | Must use API-level tool_calls |
| Process exit code | Literal process exit code | Derived: 0 = success, 1 = API error |

---

## Animator Configuration (how the copilot provider is activated)

Once installed, operators configure:

```json
{
  "animator": {
    "sessionProvider": "copilot"
  }
}
```

And the guild's `plugins` list must include `"copilot"`. No changes to the Animator itself are required.

---

## `GuildConfig` Declaration Augmentation

The claude-code package does NOT augment `GuildConfig` (it has no config of its own). The copilot apparatus may need a config section (e.g. for API endpoint, auth token name) if it needs operator-configurable settings. The pattern for augmenting is shown in `packages/plugins/animator/src/types.ts`:

```typescript
declare module '@shardworks/nexus-core' {
  interface GuildConfig {
    animator?: AnimatorConfig;
  }
}
```

The copilot apparatus could similarly augment with a `CopilotConfig` interface for settings like `apiEndpoint`, `tokenEnvVar`, etc.

---

## Workspace Registration

The new package lives at `packages/plugins/copilot/`. The `pnpm-workspace.yaml` already includes `packages/plugins/*` — no change needed. The package will be picked up automatically.

---

## Adjacent Patterns

### Other apparatus packages (2-3 comparables)

**Fabricator** (`packages/plugins/fabricator/`):
- Minimal apparatus: stateless `provides` object, no-op `start()`
- No external dependencies beyond `@shardworks/nexus-core`
- Pattern: thin wrapper around shared logic

**Loom** (`packages/plugins/loom/`):
- `requires: ['tools']`
- `start()` reads config and files; otherwise stateless API
- Augments `GuildConfig` with `loom?: LoomConfig`

**Parlour** (`packages/plugins/parlour/`):
- `requires: ['animator', 'loom', 'stacks']`
- Complex API with multiple methods

The copilot apparatus is most like the claude-code apparatus: minimal dependencies, stateless, single `launch()` method, no-op start.

---

## Doc/Code Discrepancies Found

1. `docs/architecture/apparatus/claude-code.md` describes the MCP config format as `type: "http"` with a `/mcp` path (`http://127.0.0.1:PORT/mcp`), but the actual code in `mcp-server.ts` uses `SSEServerTransport` with a `/sse` endpoint and the URL is `http://127.0.0.1:PORT/sse` — and in `index.ts` the mcpConfig JSON uses `type: 'sse'`. The doc is incorrect about both the transport type and URL path.

2. `docs/architecture/index.md` says at line ~471: "MVP: one hardcoded provider (`claude-code`). Future: provider discovery via kit contributions or guild config." — The code already uses guild config (`guild.json["animator"]["sessionProvider"]`), so the config-based discovery is already implemented. The doc is stale.

---

## Open Questions / Things Not Found

- No existing copilot-related code anywhere in the repository.
- No existing docs on how a second provider should handle tool injection (MCP vs API tool_calls).
- The `SessionProviderConfig.tools` field is typed as `ResolvedTool[]` which includes `definition.handler` closures — these cannot be serialized across HTTP. A copilot provider using HTTP API tool_calls would need to execute tool calls in-process, bridging API `tool_calls` responses back to guild tools. This is a significant design surface with no precedent in the codebase.
- Whether `conversationId` maps to message-history replay or just a reference is unresolved for the copilot provider.
- Whether `transcript` (currently `Record<string, unknown>[]` from stream-json NDJSON) should use a different structure for HTTP API responses is an open question — `SessionProviderResult.transcript` is typed as `TranscriptMessage[]` which is `Record<string, unknown>[]` (opaque).
