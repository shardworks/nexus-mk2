## Commission Spec

---
author: plan-writer
estimated_complexity: 13
---

# Copilot Session Provider Apparatus

## Summary

Add a new apparatus package `@shardworks/copilot-apparatus` (plugin id: `copilot`) that implements `AnimatorSessionProvider` using the GitHub Models REST API. The provider calls the OpenAI-compatible chat completions endpoint, runs an in-process agentic tool-call loop when tools are supplied, supports streaming via SSE, and is activated by setting `guild.json["animator"]["sessionProvider"] = "copilot"`.

## Current State

The Animator (`packages/plugins/animator/src/animator.ts`) resolves a session provider at animate-time via:

```typescript
function resolveProvider(config: AnimatorConfig): AnimatorSessionProvider {
  const pluginId = config.sessionProvider ?? 'claude-code';
  return guild().apparatus<AnimatorSessionProvider>(pluginId);
}
```

Today, `claude-code` is the only provider. It spawns the `claude` CLI binary in autonomous mode, parses NDJSON output, and injects tools via an in-process MCP HTTP server. The `AnimatorSessionProvider` interface (from `packages/plugins/animator/src/types.ts`) is fully provider-agnostic — it makes no assumptions about process spawning, CLI flags, or MCP.

The claude-code package (`packages/plugins/claude-code/`) exports a `Plugin` with:
- `apparatus.requires: []`
- `apparatus.provides`: an `AnimatorSessionProvider` object
- `apparatus.start()`: no-op

No copilot-related code exists anywhere in the repository. No existing files need modification — the Animator discovers providers dynamically via `guild().apparatus(pluginId)`.

## Requirements

- R1: The package `@shardworks/copilot-apparatus` must exist at `packages/plugins/copilot/` with a valid `package.json`, `tsconfig.json`, and `src/index.ts` that exports a `Plugin` whose `apparatus.provides` satisfies `AnimatorSessionProvider`.
- R2: The provider's `name` property must be `'copilot'`.
- R3: When `launch()` is called, the provider must call the GitHub Models REST API chat completions endpoint (`https://models.inference.ai.azure.com/chat/completions` by default, configurable) with the model from `config.model` passed through directly.
- R4: The provider must authenticate using a Bearer token read from the environment variable named by `CopilotConfig.tokenEnvVar` (default: `GITHUB_TOKEN`). When the env var is missing or empty, `launch()` must throw with a message naming the expected env var.
- R5: The provider must build the API request messages array from `config.systemPrompt` (as a `system` role message) and `config.initialPrompt` (as a `user` role message). Either may be absent.
- R6: When `config.tools` has entries, the provider must convert each `ResolvedTool` to the OpenAI function tool format (using `z.toJSONSchema()` for the params schema) and include them in the API request's `tools` array.
- R7: When the API response contains `tool_calls`, the provider must execute an agentic loop: parse each tool call, look up the tool by name in the `config.tools` array, validate arguments via `definition.params.parse()`, call `definition.handler()`, and send results back as `tool` role messages. The loop repeats until the model returns a response with no `tool_calls` or the iteration limit is reached.
- R8: Tool handler errors must be caught and returned to the model as tool result messages with the error description — not session failures.
- R9: The agentic loop must enforce a configurable maximum iteration limit (`CopilotConfig.maxToolRounds`, default: 50). When the limit is reached, the session must complete with `status: 'completed'` using the last available response.
- R10: When `config.streaming` is true, the provider must use the streaming API (`stream: true`), parse SSE `data:` lines, and yield `SessionChunk` objects in real time. Text content yields `{ type: 'text', text }` chunks. Tool calls yield `{ type: 'tool_use', tool: name }` chunks. Tool results yield `{ type: 'tool_result', tool: toolCallId }` chunks. Streaming must work throughout the agentic loop — chunks stream during each API call, pause during tool execution, and resume on the next call.
- R11: When `config.streaming` is false (or undefined), the provider must use the non-streaming API (`stream: false`) and return empty chunks.
- R12: The provider must accumulate token usage (inputTokens, outputTokens) by summing across all API calls in the session. `costUsd` must be left `undefined`.
- R13: `providerSessionId` must be set to the `id` field from the last API response (e.g. `chatcmpl-abc123`).
- R14: The transcript must contain the full message array built during the session — each OpenAI-format message object (with `role`, `content`, `tool_calls`, `tool_call_id`) as one `TranscriptMessage` entry.
- R15: The `output` field must contain the text content of the last assistant message that has no `tool_calls`. If no such message exists, `output` is `undefined`.
- R16: `exitCode` must be `0` for successful API completion, `1` for any API error or network failure.
- R17: `config.conversationId` must be ignored (conversation resume is not supported).
- R18: `config.cwd` and `config.environment` must be ignored (no subprocess).
- R19: The apparatus must read `CopilotConfig` from `guild().guildConfig().copilot` at `start()` time and cache it. `GuildConfig` must be augmented via module declaration.
- R20: A `docs/architecture/apparatus/copilot.md` file must exist following the apparatus documentation template.
- R21: The package must have tests covering: successful single-turn completion, agentic tool-call loop, streaming chunk emission, API error handling, missing token error, max tool rounds enforcement, and token usage accumulation.

## Design

### Type Changes

**New file: `packages/plugins/copilot/src/index.ts`**

```typescript
import type { Plugin, StartupContext } from '@shardworks/nexus-core';
import type {
  AnimatorSessionProvider,
  SessionProviderConfig,
  SessionProviderResult,
  SessionChunk,
  TokenUsage,
  TranscriptMessage,
} from '@shardworks/animator-apparatus';
import type { ResolvedTool } from '@shardworks/tools-apparatus';
import { z } from 'zod';

// ── Config types ────────────────────────────────────────────────────

/** Plugin configuration stored at guild.json["copilot"]. */
export interface CopilotConfig {
  /**
   * Chat completions API endpoint URL.
   * Default: 'https://models.inference.ai.azure.com'
   */
  apiEndpoint?: string;
  /**
   * Name of the environment variable holding the API bearer token.
   * Default: 'GITHUB_TOKEN'
   */
  tokenEnvVar?: string;
  /**
   * Maximum number of tool-call rounds in the agentic loop.
   * When reached, the session completes with the last available response.
   * Default: 50
   */
  maxToolRounds?: number;
}

// GuildConfig module augmentation
declare module '@shardworks/nexus-core' {
  interface GuildConfig {
    copilot?: CopilotConfig;
  }
}

// ── Internal types ──────────────────────────────────────────────────

/** OpenAI-compatible chat completion message. */
interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

/** OpenAI-compatible tool call from an assistant response. */
interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

/** OpenAI-compatible function tool definition for the API request. */
interface ToolDef {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

/** OpenAI-compatible chat completion response (non-streaming). */
interface ChatCompletionResponse {
  id: string;
  choices: Array<{
    message: {
      role: 'assistant';
      content: string | null;
      tool_calls?: ToolCall[];
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
  };
}

/** OpenAI-compatible streaming chunk. */
interface ChatCompletionChunk {
  id: string;
  choices: Array<{
    delta: {
      role?: string;
      content?: string | null;
      tool_calls?: Array<{
        index: number;
        id?: string;
        type?: string;
        function?: {
          name?: string;
          arguments?: string;
        };
      }>;
    };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
  } | null;
}

/** Accumulated metrics across API calls. */
interface SessionAccumulator {
  transcript: TranscriptMessage[];
  tokenUsage: { inputTokens: number; outputTokens: number };
  providerSessionId?: string;
}
```

**`CopilotConfig` in guild.json:**

```json
{
  "copilot": {
    "apiEndpoint": "https://models.inference.ai.azure.com",
    "tokenEnvVar": "GITHUB_TOKEN",
    "maxToolRounds": 50
  }
}
```

All fields are optional — defaults apply when absent.

### Behavior

#### Plugin export and lifecycle

The default export is `createCopilotProvider()` which returns a `Plugin`:

```typescript
export function createCopilotProvider(): Plugin {
  let config: CopilotConfig = {};

  const provider: AnimatorSessionProvider = {
    name: 'copilot',
    launch(sessionConfig: SessionProviderConfig) { ... },
  };

  return {
    apparatus: {
      requires: [],
      provides: provider,
      start(_ctx: StartupContext): void {
        config = guild().guildConfig().copilot ?? {};
      },
    },
  };
}

export default createCopilotProvider();
```

`start()` reads and caches `CopilotConfig`. The `config` variable is captured by closure in `launch()`.

#### Token resolution

When `launch()` is called, the provider resolves the API token:

```typescript
const tokenEnvVar = config.tokenEnvVar ?? 'GITHUB_TOKEN';
const token = process.env[tokenEnvVar];
if (!token) {
  throw new Error(
    `Copilot session provider requires a GitHub token. ` +
    `Set the ${tokenEnvVar} environment variable.`
  );
}
```

The throw propagates to the Animator's `catch` block which converts it to a failed `SessionResult` via `buildFailedResult()`.

#### Message construction

Build the initial messages array from config:

- When `config.systemPrompt` is defined and non-empty, prepend `{ role: 'system', content: config.systemPrompt }`.
- When `config.initialPrompt` is defined and non-empty, append `{ role: 'user', content: config.initialPrompt }`.

#### Tool conversion

When `config.tools` has entries, convert each `ResolvedTool` to an OpenAI function tool:

```typescript
function convertTools(tools: ResolvedTool[]): ToolDef[] {
  return tools.map((rt) => ({
    type: 'function' as const,
    function: {
      name: rt.definition.name,
      description: rt.definition.description,
      parameters: z.toJSONSchema(rt.definition.params),
    },
  }));
}
```

The resulting array is included in the API request body as `tools`. A `Map<string, ResolvedTool>` keyed by tool name is built for O(1) lookup during tool execution.

#### API request (non-streaming)

When `config.streaming` is falsy, make a non-streaming request:

```typescript
const response = await fetch(`${apiEndpoint}/chat/completions`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  },
  body: JSON.stringify({
    model: config.model,
    messages,
    ...(apiTools.length > 0 ? { tools: apiTools } : {}),
    stream: false,
  }),
});
```

When the response is not `ok`, throw with status and response text. When `ok`, parse the JSON body as `ChatCompletionResponse`.

Add usage to the accumulator:
```
acc.tokenUsage.inputTokens += response.usage?.prompt_tokens ?? 0;
acc.tokenUsage.outputTokens += response.usage?.completion_tokens ?? 0;
```

Set `acc.providerSessionId = response.id`.

Push the assistant message onto the messages array and the transcript.

#### API request (streaming)

When `config.streaming` is true, make a streaming request with `stream: true` and `stream_options: { include_usage: true }` in the request body. Read `response.body` as a `ReadableStream`, decode with `TextDecoder`, and parse SSE lines:

```typescript
function parseSseLines(buffer: string, handler: (data: string) => void): string {
  let idx: number;
  while ((idx = buffer.indexOf('\n')) !== -1) {
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (line.startsWith('data: ')) {
      const data = line.slice(6);
      if (data === '[DONE]') continue;
      handler(data);
    }
  }
  return buffer;
}
```

Each parsed chunk is a `ChatCompletionChunk`. Process it:
- When `delta.content` is a non-empty string, yield `{ type: 'text', text: delta.content }` and write to stderr (matching claude-code's real-time visibility behavior).
- When `delta.tool_calls` is present, accumulate tool call fragments by index. When a tool call includes an `id` and `function.name`, yield `{ type: 'tool_use', tool: name }`.
- When `usage` is present (final chunk with `stream_options.include_usage`), add to accumulator.

After the stream completes, reconstruct the full assistant message from accumulated deltas, push it to messages and transcript.

#### Agentic tool-call loop

After each API response (streaming or non-streaming), check if the assistant message has `tool_calls`:

```
round = 0
maxRounds = config.maxToolRounds ?? 50

loop:
  if no tool_calls on the last assistant message → break
  if round >= maxRounds → break
  round++

  for each tool_call:
    look up tool by name in the tools map
    if not found → result = "Error: Unknown tool: {name}"
    else:
      try:
        parsed = tool.definition.params.parse(JSON.parse(tool_call.function.arguments))
        rawResult = await tool.definition.handler(parsed)
        result = typeof rawResult === 'string' ? rawResult : JSON.stringify(rawResult, null, 2)
      catch (err):
        result = "Error: {err.message}"

    push { role: 'tool', content: result, tool_call_id: tool_call.id } to messages and transcript
    yield { type: 'tool_result', tool: tool_call.id } chunk (if streaming)

  make next API call (streaming or non-streaming based on config.streaming)
  process response as above
```

When the loop exits due to `maxRounds`, the session still completes normally (`status: 'completed'`) — the limit is a safety valve, not an error.

#### Result construction

After the loop finishes:

```typescript
function extractOutput(messages: ChatMessage[]): string | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]!;
    if (msg.role !== 'assistant') continue;
    if (msg.tool_calls && msg.tool_calls.length > 0) continue;
    if (msg.content) return msg.content;
  }
  return undefined;
}
```

Build the result:

```typescript
const result: SessionProviderResult = {
  status: 'completed',
  exitCode: 0,
  providerSessionId: acc.providerSessionId,
  tokenUsage: acc.tokenUsage,
  costUsd: undefined,
  transcript: acc.transcript,
  output: extractOutput(messages),
};
```

On API/network errors (non-ok response, fetch failure):

```typescript
const result: SessionProviderResult = {
  status: 'failed',
  exitCode: 1,
  error: `GitHub Models API error: ${response.status} ${await response.text()}`,
  transcript: acc.transcript,
  tokenUsage: acc.tokenUsage.inputTokens > 0 ? acc.tokenUsage : undefined,
};
```

#### launch() return shape

`launch()` must return `{ chunks, result }` synchronously, but the work is async. The pattern matches claude-code's approach:

- Non-streaming: `chunks` is an immediately-done async iterable. `result` is the promise of the full API loop.
- Streaming: `chunks` yields via an async queue that the API loop pushes into. `result` is the promise that resolves after the loop completes.

The streaming chunk delivery mechanism uses the same pattern as claude-code: a queue array + resolve callback to bridge push-based SSE events into a pull-based async iterable.

### Package scaffolding

**`packages/plugins/copilot/package.json`:**

```json
{
  "name": "@shardworks/copilot-apparatus",
  "version": "0.0.0",
  "license": "ISC",
  "repository": {
    "type": "git",
    "url": "https://github.com/shardworks/nexus",
    "directory": "packages/plugins/copilot"
  },
  "description": "Copilot session provider apparatus — launches sessions via the GitHub Models API",
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
    "@shardworks/animator-apparatus": "workspace:*",
    "@shardworks/nexus-core": "workspace:*",
    "@shardworks/tools-apparatus": "workspace:*",
    "zod": "4.3.6"
  },
  "devDependencies": {
    "@types/node": "25.5.0"
  },
  "files": [
    "dist"
  ],
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

Note: no `@modelcontextprotocol/sdk` dependency (unlike claude-code). The copilot provider calls tool handlers directly.

**`packages/plugins/copilot/tsconfig.json`:**

```json
{
  "extends": "../../../tsconfig.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": [
    "src"
  ],
  "exclude": [
    "src/**/*.test.ts"
  ]
}
```

### Non-obvious Touchpoints

- **`pnpm-workspace.yaml`**: Already includes `packages/plugins/*` — no change needed. The new package is auto-discovered.
- **`packages/plugins/animator/src/types.ts`**: Contains the `AnimatorConfig.sessionProvider` field and the `GuildConfig` augmentation for `animator`. The copilot provider's `GuildConfig` augmentation for `copilot` uses the same pattern but in its own module. Both augmentations are merged by TypeScript's declaration merging.

## Validation Checklist

- V1 [R1]: Run `cd packages/plugins/copilot && cat package.json | grep '"name"'` — verify output shows `@shardworks/copilot-apparatus`. Run `pnpm typecheck` in the package — verify no type errors.
- V2 [R2]: Grep `packages/plugins/copilot/src/index.ts` for `name: 'copilot'` — verify it appears on the provider object.
- V3 [R3, R5, R28]: In tests, verify that when `launch()` is called with a `systemPrompt` and `initialPrompt`, the fetch call includes a messages array with a `system` role message and a `user` role message, and the `model` field matches `config.model`.
- V4 [R4]: In tests, verify that when the token env var is unset, `launch()` throws an error containing the env var name. Verify that when set, the `Authorization` header is `Bearer <token>`.
- V5 [R6, R16]: In tests, verify that when `config.tools` has entries, the API request body includes a `tools` array with OpenAI function tool format, and each entry has `function.parameters` as a JSON Schema object. Verify that the `z.toJSONSchema()` call produces valid output for a sample Zod schema.
- V6 [R7, R8, R9]: In tests, verify the agentic loop: (a) when the API response has `tool_calls`, the provider calls the tool handler and sends a `tool` role message back; (b) when a tool handler throws, the error is sent back as a tool result, not a session failure; (c) when `maxToolRounds` is reached, the session completes normally with the last response.
- V7 [R10]: In tests with `config.streaming: true`, verify that the chunks async iterable yields `{ type: 'text', text }` chunks for streamed content, `{ type: 'tool_use', tool }` for tool calls, and `{ type: 'tool_result', tool }` for tool results. Verify chunks are emitted during each API call in the loop, not only after the final call.
- V8 [R11]: In tests with `config.streaming: false`, verify the chunks async iterable completes immediately with no items.
- V9 [R12]: In tests with a multi-round tool-calling session, verify `tokenUsage.inputTokens` and `outputTokens` are the sum across all API calls. Verify `costUsd` is `undefined`.
- V10 [R13]: In tests, verify `providerSessionId` equals the `id` field from the last API response.
- V11 [R14, R15]: In tests, verify the transcript contains all messages (system, user, assistant, tool) in order. Verify `output` is the content of the last assistant message with no `tool_calls`.
- V12 [R16, R33]: In tests, verify that an API error (non-ok response) yields `status: 'failed'`, `exitCode: 1`, and an `error` string containing the HTTP status.
- V13 [R17, R18]: In tests, verify that passing `conversationId`, `cwd`, or `environment` does not affect behavior (no errors, values are unused).
- V14 [R19, R29]: Verify that `CopilotConfig` is declared as a module augmentation on `GuildConfig`. Verify that `start()` reads `guild().guildConfig().copilot`.
- V15 [R20]: Verify `docs/architecture/apparatus/copilot.md` exists and follows the template structure (Purpose, Dependencies, `AnimatorSessionProvider` Implementation, Configuration, and behavioral sections).
- V16 [R21]: Run `pnpm test` in the copilot package — all tests pass.

## Test Cases

### Happy path — single-turn completion (no tools)

Scenario: `launch()` called with `systemPrompt`, `initialPrompt`, `model: 'gpt-4o'`, no tools, `streaming: false`.
Expected: Provider makes one non-streaming API call. Result has `status: 'completed'`, `exitCode: 0`, `output` = assistant response content, `tokenUsage` from the response's `usage` field, `providerSessionId` = response `id`. Transcript has 3 entries: system, user, assistant.

### Happy path — tool-calling session

Scenario: `launch()` called with 2 tools, model responds with a `tool_calls` on the first response, then a text-only response after receiving tool results.
Expected: Provider makes 2 API calls. First response triggers tool execution, results sent back. Second response has no tool_calls. Result has `output` = second response content. Transcript has 5+ entries: system, user, assistant (with tool_calls), tool (result), assistant (final). Token usage is summed across both calls.

### Tool handler error

Scenario: A tool handler throws `new Error('database offline')`.
Expected: The error is caught. A tool role message with `content: 'Error: database offline'` is sent to the API. The session does not fail — the model receives the error and may respond accordingly.

### Unknown tool name

Scenario: The API response includes a `tool_call` for a tool name not in `config.tools`.
Expected: A tool role message with `content: 'Error: Unknown tool: nonexistent-tool'` is sent to the API. Session continues.

### Max tool rounds reached

Scenario: The model keeps returning `tool_calls` indefinitely. `maxToolRounds` is set to 3.
Expected: After 3 rounds, the loop stops. Result has `status: 'completed'`, `output` is extracted from the last assistant message (may include tool_calls), `exitCode: 0`.

### Streaming — text chunks

Scenario: `streaming: true`, no tools. API streams back 3 SSE chunks with `delta.content`.
Expected: Chunks iterable yields 3 `{ type: 'text', text: '...' }` entries. Result resolves after stream completes.

### Streaming — with tool-call loop

Scenario: `streaming: true`, 1 tool. First API call streams a tool_call, tool executes, second API call streams text.
Expected: Chunks iterable yields `{ type: 'tool_use', tool: 'tool-name' }`, then `{ type: 'tool_result', tool: 'call-id' }`, then `{ type: 'text', text: '...' }` chunks from the second call. All interleaved in order.

### API error — HTTP 401

Scenario: API returns 401 Unauthorized.
Expected: Result has `status: 'failed'`, `exitCode: 1`, `error` contains `401`. No `output`.

### API error — network failure

Scenario: `fetch()` throws (e.g. DNS resolution failure).
Expected: The error propagates from `launch().result`. The Animator catches it via `buildFailedResult()`.

### Missing token

Scenario: `GITHUB_TOKEN` env var is not set.
Expected: `launch()` throws synchronously (inside the result promise) with message containing `GITHUB_TOKEN`.

### Empty tools array

Scenario: `config.tools` is an empty array.
Expected: No `tools` field in the API request body. Single API call, no agentic loop.

### No system prompt, no initial prompt

Scenario: Both `config.systemPrompt` and `config.initialPrompt` are undefined.
Expected: Messages array is empty (or has only system message if prompt exists). API call proceeds. No error from the provider — input validation is the Animator's concern.

### Token usage accumulation across rounds

Scenario: 3-round tool-calling session. Each API call reports `prompt_tokens: 100, completion_tokens: 50`.
Expected: Final `tokenUsage` is `{ inputTokens: 300, outputTokens: 150 }`.

### Config defaults

Scenario: `guild.json` has no `copilot` section.
Expected: Provider uses defaults: endpoint `https://models.inference.ai.azure.com`, token from `GITHUB_TOKEN`, `maxToolRounds: 50`.

### Custom config

Scenario: `guild.json["copilot"]` has `{ "apiEndpoint": "https://custom.endpoint.com", "tokenEnvVar": "MY_TOKEN", "maxToolRounds": 5 }`.
Expected: Provider uses the custom endpoint, reads from `MY_TOKEN` env var, limits tool rounds to 5.

## Referenced Files (from spec, pre-commission state)

=== REFERENCED FILE: packages/plugins/animator/src/animator.ts (pre-commission state) ===
/**
 * The Animator — session launch and telemetry recording apparatus.
 *
 * Two API levels:
 * - summon() — high-level: composes context via The Loom, then launches.
 * - animate() — low-level: takes a pre-composed AnimaWeave + prompt.
 *
 * See: docs/specification.md (animator)
 */

import type { Plugin, StartupContext } from '@shardworks/nexus-core';
import { guild, generateId } from '@shardworks/nexus-core';
import type { StacksApi, Book } from '@shardworks/stacks-apparatus';

import type { LoomApi } from '@shardworks/loom-apparatus';

import type {
  AnimatorApi,
  AnimateHandle,
  AnimatorConfig,
  AnimateRequest,
  SummonRequest,
  SessionResult,
  SessionChunk,
  SessionDoc,
  TranscriptDoc,
  TranscriptMessage,
  AnimatorSessionProvider,
  SessionProviderConfig,
  SessionProviderResult,
} from './types.ts';

import { sessionList, sessionShow, summon as summonTool } from './tools/index.ts';

// ── Core logic ───────────────────────────────────────────────────────

/**
 * Resolve the session provider apparatus.
 *
 * Looks up the provider by plugin id from guild config. The provider is
 * an apparatus whose `provides` implements AnimatorSessionProvider.
 * Arbor throws immediately if the plugin isn't loaded or has no provides.
 */
function resolveProvider(config: AnimatorConfig): AnimatorSessionProvider {
  const pluginId = config.sessionProvider ?? 'claude-code';
  return guild().apparatus<AnimatorSessionProvider>(pluginId);
}

/**
 * Resolve the model from guild settings.
 */
function resolveModel(): string {
  const g = guild();
  const guildConfig = g.guildConfig();
  return guildConfig.settings?.model ?? 'sonnet';
}

/**
 * Build the provider config from an AnimateRequest.
 *
 * The system prompt comes from the AnimaWeave (composed by The Loom).
 * The work prompt comes from the request directly (bypasses The Loom).
 * The streaming flag is passed through for the provider to honor (or ignore).
 */
function buildProviderConfig(
  request: AnimateRequest,
  model: string,
): SessionProviderConfig {
  return {
    systemPrompt: request.context.systemPrompt,
    initialPrompt: request.prompt,
    model,
    conversationId: request.conversationId,
    cwd: request.cwd,
    streaming: request.streaming,
    tools: request.context.tools,
    environment: { ...request.context.environment, ...request.environment },
  };
}

/**
 * Build a SessionResult from provider output and session metadata.
 */
function buildSessionResult(
  id: string,
  startedAt: string,
  providerName: string,
  providerResult: SessionProviderResult,
  request: AnimateRequest,
): SessionResult {
  const endedAt = new Date().toISOString();
  const durationMs = new Date(endedAt).getTime() - new Date(startedAt).getTime();

  return {
    id,
    status: providerResult.status,
    startedAt,
    endedAt,
    durationMs,
    provider: providerName,
    exitCode: providerResult.exitCode,
    error: providerResult.error,
    conversationId: request.conversationId,
    providerSessionId: providerResult.providerSessionId,
    tokenUsage: providerResult.tokenUsage,
    costUsd: providerResult.costUsd,
    metadata: request.metadata,
    output: providerResult.output,
  };
}

/**
 * Build a failed SessionResult when the provider throws.
 */
function buildFailedResult(
  id: string,
  startedAt: string,
  providerName: string,
  error: unknown,
  request: AnimateRequest,
): SessionResult {
  const endedAt = new Date().toISOString();
  const durationMs = new Date(endedAt).getTime() - new Date(startedAt).getTime();
  const errorMessage = error instanceof Error ? error.message : String(error);

  return {
    id,
    status: 'failed',
    startedAt,
    endedAt,
    durationMs,
    provider: providerName,
    exitCode: 1,
    error: errorMessage,
    conversationId: request.conversationId,
    metadata: request.metadata,
  };
}

/**
 * Convert a SessionResult to a SessionDoc for Stacks storage.
 */
function toSessionDoc(result: SessionResult): SessionDoc {
  return {
    id: result.id,
    status: result.status,
    startedAt: result.startedAt,
    endedAt: result.endedAt,
    durationMs: result.durationMs,
    provider: result.provider,
    exitCode: result.exitCode,
    error: result.error,
    conversationId: result.conversationId,
    providerSessionId: result.providerSessionId,
    tokenUsage: result.tokenUsage,
    costUsd: result.costUsd,
    metadata: result.metadata,
    output: result.output,
  };
}

/**
 * Record a session result to The Stacks (sessions + transcripts books).
 *
 * Errors are logged but never propagated — session data loss is
 * preferable to masking the original failure. See § Error Handling Contract.
 */
async function recordSession(
  sessions: Book<SessionDoc>,
  transcripts: Book<TranscriptDoc>,
  result: SessionResult,
  transcript: TranscriptMessage[] | undefined,
): Promise<void> {
  try {
    await sessions.put(toSessionDoc(result));
  } catch (err) {
    console.warn(
      `[animator] Failed to record session ${result.id}: ${err instanceof Error ? err.message : err}`,
    );
  }

  if (transcript && transcript.length > 0) {
    try {
      await transcripts.put({ id: result.id, messages: transcript });
    } catch (err) {
      console.warn(
        `[animator] Failed to record transcript for ${result.id}: ${err instanceof Error ? err.message : err}`,
      );
    }
  }
}

/**
 * Write the initial 'running' session record to The Stacks.
 */
async function recordRunning(
  sessions: Book<SessionDoc>,
  id: string,
  startedAt: string,
  providerName: string,
  request: AnimateRequest,
): Promise<void> {
  try {
    await sessions.put({
      id,
      status: 'running',
      startedAt,
      provider: providerName,
      conversationId: request.conversationId,
      metadata: request.metadata,
    });
  } catch (err) {
    console.warn(
      `[animator] Failed to write initial session record ${id}: ${err instanceof Error ? err.message : err}`,
    );
  }
}

// ── Apparatus factory ────────────────────────────────────────────────

/**
 * Create the Animator apparatus plugin.
 *
 * Returns a Plugin with:
 * - `requires: ['stacks']` — records session results
 * - `provides: AnimatorApi` — the session launch API
 * - `supportKit` — contributes `sessions` book + inspection tools
 */
export function createAnimator(): Plugin {
  let config: AnimatorConfig = {};
  let sessions: Book<SessionDoc>;
  let transcripts: Book<TranscriptDoc>;

  const api: AnimatorApi = {
    summon(request: SummonRequest): AnimateHandle {
      // Resolve The Loom at call time — not a startup dependency.
      // This allows the Animator to start without the Loom installed;
      // only summon() requires it.
      let loom: LoomApi;
      try {
        loom = guild().apparatus<LoomApi>('loom');
      } catch {
        throw new Error(
          'summon() requires The Loom apparatus to be installed. ' +
          'Use animate() directly if you want to provide a pre-composed AnimaWeave.',
        );
      }

      // Generate session id up front so it's available on the handle
      // immediately — before the Loom weave or session launch resolves.
      const sessionId = generateId('ses', 4);

      // We need to weave context before we can animate, but summon()
      // must return synchronously. Wrap the async Loom call and the
      // animate delegation into a single deferred flow.
      const deferred = (async () => {
        // Compose identity context via The Loom.
        // The Loom owns system prompt composition — it produces the system
        // prompt from the anima's identity layers (role instructions,
        // curriculum, temperament, charter). MVP: returns empty (no
        // systemPrompt); the session runs without one until the Loom
        // gains composition logic. The work prompt bypasses the Loom.
        const context = await loom.weave({
          role: request.role,
        });

        // Merge caller metadata with auto-generated summon metadata
        const metadata: Record<string, unknown> = {
          trigger: 'summon',
          ...(request.role ? { role: request.role } : {}),
          ...request.metadata,
        };

        // Delegate to the standard animate path, threading through the
        // pre-generated session id so animate() uses it instead of
        // generating a new one.
        return this.animate({
          sessionId,
          context,
          prompt: request.prompt,
          cwd: request.cwd,
          conversationId: request.conversationId,
          metadata,
          streaming: request.streaming,
          environment: request.environment,
        });
      })();

      // Pipe chunks through — can't get them until the Loom weave resolves.
      // Works for both streaming and non-streaming: non-streaming providers
      // return empty chunks, so the generator yields nothing and completes.
      async function* pipeChunks(): AsyncIterable<SessionChunk> {
        const handle = await deferred;
        yield* handle.chunks;
      }

      return {
        sessionId,
        chunks: pipeChunks(),
        result: deferred.then((handle) => handle.result),
      };
    },

    animate(request: AnimateRequest): AnimateHandle {
      const provider = resolveProvider(config);
      const model = resolveModel();
      const providerConfig = buildProviderConfig(request, model);

      // Step 1: use pre-generated session id if provided (from summon()),
      // otherwise generate one. Capture startedAt.
      const id = request.sessionId ?? generateId('ses', 4);
      const startedAt = new Date().toISOString();

      // Single path — the provider returns { chunks, result } regardless
      // of whether streaming is enabled. Providers that don't support
      // streaming return empty chunks; the Animator doesn't branch.
      const { chunks, result: providerResultPromise } = provider.launch(providerConfig);

      // Write initial record (fire and forget — don't block streaming)
      const initPromise = recordRunning(sessions, id, startedAt, provider.name, request);

      const result = (async () => {
        await initPromise;

        let sessionResult: SessionResult;
        try {
          const providerResult = await providerResultPromise;
          sessionResult = buildSessionResult(id, startedAt, provider.name, providerResult, request);
          await recordSession(sessions, transcripts, sessionResult, providerResult.transcript);
        } catch (err) {
          sessionResult = buildFailedResult(id, startedAt, provider.name, err, request);
          await recordSession(sessions, transcripts, sessionResult, undefined);
          throw err;
        }
        return sessionResult;
      })();

      return { sessionId: id, chunks, result };
    },
  };

  return {
    apparatus: {
      requires: ['stacks'],
      recommends: ['loom'],

      supportKit: {
        books: {
          sessions: {
            indexes: ['startedAt', 'status', 'conversationId', 'provider'],
          },
          transcripts: {
            indexes: ['sessionId'],
          },
        },
        tools: [sessionList, sessionShow, summonTool],
      },

      provides: api,

      start(_ctx: StartupContext): void {
        const g = guild();
        config = g.guildConfig().animator ?? {};

        const stacks = g.apparatus<StacksApi>('stacks');
        sessions = stacks.book<SessionDoc>('animator', 'sessions');
        transcripts = stacks.book<TranscriptDoc>('animator', 'transcripts');
      },
    },
  };
}

=== REFERENCED FILE: packages/plugins/animator/src/types.ts (pre-commission state) ===
/**
 * The Animator — public types.
 *
 * These types form the contract between The Animator apparatus and all
 * callers (summon relay, nsg consult, etc.). No implementation details.
 *
 * See: docs/specification.md (animator)
 */

import type { AnimaWeave } from '@shardworks/loom-apparatus';
import type { ResolvedTool } from '@shardworks/tools-apparatus';

// ── Session chunks (streaming output) ────────────────────────────────

/** A chunk of output from a running session. */
export type SessionChunk =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; tool: string }
  | { type: 'tool_result'; tool: string };

// ── Request / Result ─────────────────────────────────────────────────

export interface AnimateRequest {
  /**
   * Optional pre-generated session id. When provided, the Animator uses
   * this id instead of generating a new one. Used by summon() to make the
   * session id available on the handle before the Loom weave resolves.
   */
  sessionId?: string;
  /** The anima weave from The Loom (composed identity context). */
  context: AnimaWeave;
  /**
   * The work prompt — what the anima should do.
   * Passed directly to the session provider as the initial prompt.
   * This bypasses The Loom — it is not a composition concern.
   */
  prompt?: string;
  /**
   * Working directory for the session.
   * The session provider launches the AI process here.
   */
  cwd: string;
  /**
   * Optional conversation id to resume a multi-turn conversation.
   * If provided, the session provider resumes the existing conversation
   * rather than starting a new one.
   */
  conversationId?: string;
  /**
   * Caller-supplied metadata recorded alongside the session.
   * The Animator stores this as-is — it does not interpret the contents.
   */
  metadata?: Record<string, unknown>;
  /**
   * Enable streaming output. When true, the returned `chunks` iterable
   * yields output as the session produces it. When false (default), the
   * `chunks` iterable completes immediately with no items.
   *
   * Either way, the return shape is the same: `{ chunks, result }`.
   */
  streaming?: boolean;
  /**
   * Task-layer environment variables. Overrides the identity-layer
   * environment from the AnimaWeave when keys collide. Spread into the
   * spawned process environment.
   */
  environment?: Record<string, string>;
}

export interface SessionResult {
  /** Unique session id (generated by The Animator). */
  id: string;
  /** Terminal status. */
  status: 'completed' | 'failed' | 'timeout';
  /** When the session started (ISO-8601). */
  startedAt: string;
  /** When the session ended (ISO-8601). */
  endedAt: string;
  /** Wall-clock duration in milliseconds. */
  durationMs: number;
  /** Provider name (e.g. 'claude-code'). */
  provider: string;
  /** Numeric exit code from the provider process. */
  exitCode: number;
  /** Error message if failed. */
  error?: string;
  /** Conversation id (for multi-turn resume). */
  conversationId?: string;
  /** Session id from the provider (e.g. for --resume). */
  providerSessionId?: string;
  /** Token usage from the provider, if available. */
  tokenUsage?: TokenUsage;
  /** Cost in USD from the provider, if available. */
  costUsd?: number;
  /** Caller-supplied metadata, recorded as-is. */
  metadata?: Record<string, unknown>;
  /**
   * The final assistant text from the session.
   * Extracted by the Animator from the provider's transcript.
   * Useful for programmatic consumers that need the session's conclusion
   * without parsing the full transcript (e.g. the Spider's review collect step).
   */
  output?: string;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}

// ── Summon request ──────────────────────────────────────────────────

export interface SummonRequest {
  /**
   * The work prompt — what the anima should do.
   * Passed directly to the session provider as the initial prompt.
   */
  prompt: string;
  /**
   * The role to summon (e.g. 'artificer', 'scribe').
   * Passed to The Loom for context composition and recorded in session metadata.
   */
  role?: string;
  /**
   * Working directory for the session.
   * The session provider launches the AI process here.
   */
  cwd: string;
  /**
   * Optional conversation id to resume a multi-turn conversation.
   */
  conversationId?: string;
  /**
   * Additional metadata to record alongside the session.
   * Merged with auto-generated metadata (trigger: 'summon', role).
   */
  metadata?: Record<string, unknown>;
  /**
   * Enable streaming output. When true, the returned `chunks` iterable
   * yields output as the session produces it. When false (default), the
   * `chunks` iterable completes immediately with no items.
   */
  streaming?: boolean;
  /**
   * Task-layer environment variables. Overrides the identity-layer
   * environment from the AnimaWeave when keys collide. Spread into the
   * spawned process environment.
   */
  environment?: Record<string, string>;
}

// ── Animator API (the `provides` interface) ──────────────────────────

/** The return value from animate() and summon(). */
export interface AnimateHandle {
  /**
   * Session ID, available immediately after launch — before the session
   * completes. Callers that only need to know the session was launched
   * (e.g. quick engines returning `{ status: 'launched', sessionId }`)
   * can return without awaiting `result`.
   */
  sessionId: string;
  /**
   * Async iterable of output chunks from the session. When streaming is
   * disabled (the default), this iterable completes immediately with no
   * items. When streaming is enabled, it yields chunks as the session
   * produces output.
   */
  chunks: AsyncIterable<SessionChunk>;
  /**
   * Promise that resolves to the final SessionResult after the session
   * completes (or fails/times out) and the result is recorded to The Stacks.
   */
  result: Promise<SessionResult>;
}

export interface AnimatorApi {
  /**
   * Summon an anima — compose context via The Loom and launch a session.
   *
   * This is the high-level "make an anima do a thing" entry point.
   * Internally calls The Loom for context composition (passing the role),
   * then animate() for session launch and recording. The work prompt
   * bypasses the Loom and goes directly to the provider.
   *
   * Requires The Loom apparatus to be installed. Throws if not available.
   *
   * Auto-populates session metadata with `trigger: 'summon'` and `role`.
   *
   * Returns synchronously — the async work lives inside `result` and `chunks`.
   */
  summon(request: SummonRequest): AnimateHandle;

  /**
   * Animate a session — launch an AI process with the given context.
   *
   * This is the low-level entry point for callers that compose their own
   * AnimaWeave (e.g. The Parlour for multi-turn conversations).
   *
   * Records the session result to The Stacks before `result` resolves.
   *
   * Set `streaming: true` on the request to receive output chunks as the
   * session runs. When streaming is disabled (default), the `chunks`
   * iterable completes immediately with no items.
   *
   * Returns synchronously — the async work lives inside `result` and `chunks`.
   */
  animate(request: AnimateRequest): AnimateHandle;
}

// ── Session provider interface ───────────────────────────────────────

/**
 * A session provider — pluggable backend that knows how to launch and
 * communicate with a specific AI system.
 *
 * Implemented as an apparatus plugin whose `provides` object satisfies
 * this interface. The Animator discovers the provider via guild config:
 * `guild.json["animator"]["sessionProvider"]` names the plugin id.
 *
 * The provider always returns `{ chunks, result }` — the same shape as
 * AnimateHandle. When `config.streaming` is true, the provider MAY yield
 * output chunks as the session runs. When false (or when the provider
 * does not support streaming), the chunks iterable completes immediately
 * with no items. The Animator does not branch on streaming capability —
 * it passes the flag through and trusts the provider to do the right thing.
 */
export interface AnimatorSessionProvider {
  /** Human-readable name (e.g. 'claude-code'). */
  name: string;

  /**
   * Launch a session. Returns `{ chunks, result }` synchronously.
   *
   * The `result` promise resolves when the AI process exits.
   * The `chunks` async iterable yields output when `config.streaming`
   * is true and the provider supports streaming; otherwise it completes
   * immediately with no items.
   *
   * Providers that don't support streaming simply ignore the flag and
   * return empty chunks — no separate method needed.
   */
  launch(config: SessionProviderConfig): {
    chunks: AsyncIterable<SessionChunk>;
    result: Promise<SessionProviderResult>;
  };
}

export interface SessionProviderConfig {
  /** System prompt for the AI process. May be undefined if composition is not yet implemented. */
  systemPrompt?: string;
  /** Initial user message (e.g. writ description). */
  initialPrompt?: string;
  /** Model to use (from guild settings). */
  model: string;
  /** Optional conversation id for resume. */
  conversationId?: string;
  /** Working directory for the session. */
  cwd: string;
  /**
   * Enable streaming output. When true, the provider should yield output
   * chunks as the session produces them. When false (default), the chunks
   * iterable should complete immediately with no items.
   *
   * Providers that don't support streaming may ignore this flag.
   */
  streaming?: boolean;
  /**
   * Resolved tools for this session. When present, the provider should
   * configure an MCP server with these tool definitions.
   *
   * The Loom resolves role → permissions → tools via the Instrumentarium.
   * The Animator passes them through from the AnimaWeave.
   */
  tools?: ResolvedTool[];
  /**
   * Merged environment variables to spread into the spawned process.
   * The Animator merges identity-layer (weave) and task-layer (request)
   * variables before passing them here — task layer wins on collision.
   */
  environment?: Record<string, string>;
}

/** A single message from the NDJSON stream. Untyped — shape varies by provider. */
export type TranscriptMessage = Record<string, unknown>;

export interface SessionProviderResult {
  /** Exit status. */
  status: 'completed' | 'failed' | 'timeout';
  /** Numeric exit code from the process. */
  exitCode: number;
  /** Error message if failed. */
  error?: string;
  /** Provider's session id (e.g. for --resume). */
  providerSessionId?: string;
  /** Token usage, if the provider can report it. */
  tokenUsage?: TokenUsage;
  /** Cost in USD, if the provider can report it. */
  costUsd?: number;
  /** The session's full transcript — array of NDJSON message objects. */
  transcript?: TranscriptMessage[];
  /**
   * The final assistant text from the session.
   * Extracted from the last assistant message's text content blocks.
   * Undefined if the session produced no assistant output.
   */
  output?: string;
}

// ── Stacks document type ─────────────────────────────────────────────

/**
 * The session document stored in The Stacks' `sessions` book.
 * Includes all SessionResult fields plus the `id` required by BookEntry.
 */
export interface SessionDoc {
  id: string;
  /**
   * Session status. Initially written as `'running'` when the session is
   * launched (Step 2), then updated to a terminal status (`'completed'`,
   * `'failed'`, or `'timeout'`) after the provider exits (Step 5).
   * The `'running'` state is transient — it only exists between Steps 2 and 5.
   * `SessionResult.status` only includes terminal states.
   */
  status: 'running' | 'completed' | 'failed' | 'timeout';
  startedAt: string;
  endedAt?: string;
  durationMs?: number;
  provider: string;
  exitCode?: number;
  error?: string;
  conversationId?: string;
  providerSessionId?: string;
  tokenUsage?: TokenUsage;
  costUsd?: number;
  metadata?: Record<string, unknown>;
  /** The final assistant text from the session. */
  output?: string;
  /** Index signature required by BookEntry. */
  [key: string]: unknown;
}

/**
 * The transcript document stored in The Stacks' `transcripts` book.
 * One record per session — 1:1 relationship with SessionDoc.
 */
export interface TranscriptDoc {
  /** Same as the session id. */
  id: string;
  /** Full NDJSON transcript from the session. */
  messages: TranscriptMessage[];
  /** Index signature required by BookEntry. */
  [key: string]: unknown;
}

// ── Animator config ──────────────────────────────────────────────────

/** Plugin configuration stored at guild.json["animator"]. */
export interface AnimatorConfig {
  /**
   * Plugin id of the apparatus that implements AnimatorSessionProvider.
   * The Animator looks this up via guild().apparatus() at animate-time.
   * Defaults to 'claude-code' if not specified.
   */
  sessionProvider?: string;
}

// Augment GuildConfig so `guild().guildConfig().animator` is typed without
// requiring a manual type parameter at the call site.
declare module '@shardworks/nexus-core' {
  interface GuildConfig {
    animator?: AnimatorConfig;
  }
}



## Commission Diff

```
 docs/architecture/apparatus/copilot.md     | 225 ++++++++
 packages/plugins/copilot/package.json      |  40 ++
 packages/plugins/copilot/src/index.test.ts | 897 +++++++++++++++++++++++++++++
 packages/plugins/copilot/src/index.ts      | 756 ++++++++++++++++++++++++
 packages/plugins/copilot/tsconfig.json     |  13 +
 pnpm-lock.yaml                             |  19 +
 6 files changed, 1950 insertions(+)

diff --git a/docs/architecture/apparatus/copilot.md b/docs/architecture/apparatus/copilot.md
new file mode 100644
index 0000000..0787854
--- /dev/null
+++ b/docs/architecture/apparatus/copilot.md
@@ -0,0 +1,225 @@
+# The Copilot Session Provider — API Contract
+
+Status: **Draft — MVP**
+
+Package: `@shardworks/copilot-apparatus` · Plugin id: `copilot`
+
+> **⚠️ MVP scope.** This spec covers the session provider implementation: calling the GitHub Models REST API, running an in-process agentic tool-call loop, streaming via SSE, and reporting structured results back to The Animator. Conversation resume (`conversationId`) is not supported.
+
+---
+
+## Purpose
+
+The Copilot apparatus is a **session provider** — a pluggable backend that The Animator delegates to for launching and communicating with a specific AI system. It implements `AnimatorSessionProvider` from `@shardworks/animator-apparatus` and is discovered via guild config:
+
+```json
+{
+  "animator": {
+    "sessionProvider": "copilot"
+  }
+}
+```
+
+The apparatus calls the GitHub Models REST API (OpenAI-compatible chat completions endpoint), runs an in-process agentic tool-call loop when tools are supplied, and delivers streaming output via SSE. Unlike the Claude Code provider, it spawns no subprocess and requires no MCP server — tool handlers are called directly in-process.
+
+---
+
+## Dependencies
+
+```
+requires: []
+```
+
+The Copilot apparatus has no apparatus dependencies. It implements `AnimatorSessionProvider` (imported as a type from `@shardworks/animator-apparatus`) but does not call The Animator at runtime — the relationship is reversed: The Animator calls the provider.
+
+Tool definitions and resolved tools are imported from `@shardworks/tools-apparatus` as compile-time type dependencies only. No MCP SDK is required.
+
+---
+
+## `AnimatorSessionProvider` Implementation (`provides`)
+
+The apparatus provides an implementation of `AnimatorSessionProvider`:
+
+```typescript
+interface AnimatorSessionProvider {
+  name: 'copilot';
+  launch(config: SessionProviderConfig): {
+    chunks: AsyncIterable<SessionChunk>;
+    result: Promise<SessionProviderResult>;
+  };
+}
+```
+
+A single `launch()` method handles both streaming and non-streaming sessions. When `config.streaming` is true, the provider uses the streaming API and yields `SessionChunk` objects in real time. When false, it accumulates all output internally and returns empty chunks. The return shape is always `{ chunks, result }`.
+
+The apparatus reads `CopilotConfig` from `guild().guildConfig().copilot` in `start()` and caches it as a closure variable for use in `launch()`.
+
+---
+
+## Session Lifecycle
+
+```
+launch(config)
+  │
+  ├─ 1. Resolve config: apiEndpoint, tokenEnvVar, maxRounds
+  ├─ 2. Validate token from process.env[tokenEnvVar]
+  │     └─ Throw if missing or empty
+  ├─ 3. Build initial messages array:
+  │     ├─ { role: 'system', content: systemPrompt }  (if present)
+  │     └─ { role: 'user', content: initialPrompt }   (if present)
+  ├─ 4. Convert tools to OpenAI format (z.toJSONSchema for params)
+  ├─ 5. Build toolMap: Map<name, ResolvedTool> for O(1) lookup
+  ├─ 6. Make initial API call (streaming or non-streaming)
+  └─ 7. Enter agentic loop:
+        ├─ If no tool_calls on last assistant message → break
+        ├─ If round >= maxRounds → break
+        ├─ Execute each tool call (catch errors → tool result message)
+        ├─ Append tool result messages to messages + transcript
+        └─ Make next API call → repeat
+```
+
+---
+
+## Agentic Tool-Call Loop
+
+The provider implements an in-process tool-call loop. This differs from the Claude Code provider, which delegates tool execution to the `claude` CLI via MCP.
+
+```
+round = 0
+
+loop:
+  check assistant message tool_calls
+  if none → exit loop
+  if round >= maxRounds → exit loop (safety valve)
+  round++
+
+  for each tool_call:
+    look up tool by name in toolMap
+    if not found → result = "Error: Unknown tool: {name}"
+    else:
+      try:
+        args = JSON.parse(tool_call.function.arguments)
+        parsed = tool.definition.params.parse(args)
+        rawResult = await tool.definition.handler(parsed)
+        result = rawResult (string) or JSON.stringify(rawResult)
+      catch err:
+        result = "Error: {err.message}"
+
+    append { role: 'tool', content: result, tool_call_id } to messages + transcript
+    if streaming: yield { type: 'tool_result', tool: tool_call_id }
+
+  make next API call (streaming or non-streaming)
+  process response → loop
+```
+
+Tool handler errors are caught and returned as tool result messages — the model receives the error description and may retry, clarify, or recover. The session does not fail.
+
+When `maxRounds` is reached, the loop exits and the session completes normally (`status: 'completed'`, `exitCode: 0`) using the last available assistant response. The limit is a safety valve, not an error condition.
+
+---
+
+## Streaming
+
+When `config.streaming` is true, the provider:
+
+1. Makes API calls with `stream: true` and `stream_options: { include_usage: true }`.
+2. Reads `response.body` as a `ReadableStream`, decodes with `TextDecoder`, and parses SSE `data:` lines.
+3. Yields `SessionChunk` objects in real time:
+   - `{ type: 'text', text }` — text content delta (also written to stderr for terminal visibility)
+   - `{ type: 'tool_use', tool: name }` — when a tool call's name is first seen in a delta
+   - `{ type: 'tool_result', tool: toolCallId }` — after each tool call is executed
+4. Accumulates tool call fragments by index across deltas to reconstruct the full tool call.
+5. Extracts usage from the final streaming chunk (via `stream_options.include_usage`).
+6. Streaming continues throughout the agentic loop — chunks stream during each API call, pause during tool execution, and resume on the next call.
+
+The streaming chunk delivery mechanism uses a push queue + resolve callback pattern, bridging the async generator (SSE events) into a pull-based async iterable compatible with `for await...of` consumers.
+
+---
+
+## Token Usage
+
+The provider accumulates token usage across all API calls in the session:
+
+```
+tokenUsage.inputTokens  += response.usage.prompt_tokens     (each call)
+tokenUsage.outputTokens += response.usage.completion_tokens (each call)
+```
+
+For streaming, usage is included in the final SSE chunk via `stream_options: { include_usage: true }`. For non-streaming, usage is in the response body's `usage` field.
+
+`costUsd` is always `undefined` — the GitHub Models API does not report per-call costs.
+
+---
+
+## Result Construction
+
+After the loop exits:
+
+- `status: 'completed'`, `exitCode: 0` on success.
+- `status: 'failed'`, `exitCode: 1` on API error or network failure — with `error` containing the message.
+- `providerSessionId` = `id` field from the last API response.
+- `output` = content of the last assistant message with no `tool_calls` (walking backwards).
+- `transcript` = full message array built during the session (system, user, assistant, tool messages).
+
+---
+
+## Configuration
+
+Plugin configuration in `guild.json`:
+
+```json
+{
+  "copilot": {
+    "apiEndpoint": "https://models.inference.ai.azure.com",
+    "tokenEnvVar": "GITHUB_TOKEN",
+    "maxToolRounds": 50
+  }
+}
+```
+
+| Field | Type | Default | Description |
+|-------|------|---------|-------------|
+| `apiEndpoint` | `string` | `https://models.inference.ai.azure.com` | Base URL for the chat completions API |
+| `tokenEnvVar` | `string` | `GITHUB_TOKEN` | Environment variable name holding the Bearer token |
+| `maxToolRounds` | `number` | `50` | Maximum agentic tool-call iterations before stopping |
+
+All fields are optional — defaults apply when absent or when `guild.json` has no `copilot` section.
+
+The token is read from `process.env[tokenEnvVar]` at `launch()` time. When the env var is missing or empty, `launch()` throws synchronously (inside the result promise) with a message naming the expected variable.
+
+The model comes from `SessionProviderConfig.model`, passed through from The Animator's guild settings resolution. The `copilot` config section does not set a model default.
+
+---
+
+## Ignored Config Fields
+
+The following `SessionProviderConfig` fields are intentionally ignored:
+
+| Field | Reason |
+|-------|--------|
+| `conversationId` | Conversation resume not supported by the GitHub Models API in this implementation |
+| `cwd` | No subprocess is spawned |
+| `environment` | No subprocess is spawned; environment variables are not injected into API calls |
+
+---
+
+## Open Questions
+
+- **Conversation resume.** The GitHub Models API is stateless (no server-side history). Resume could be implemented by storing and re-sending the full message history, but this requires Stacks integration and is deferred to a future iteration.
+
+- **`callableBy` filtering.** The claude-code provider filters tools by `callableBy: ['anima']` in its MCP server. The copilot provider currently passes all tools through. Should it apply the same filter? Likely yes — needs confirmation.
+
+---
+
+## Future: Conversation Resume
+
+Multi-turn conversation support could be added by storing the full message array in The Stacks alongside the session transcript, then reloading it when `conversationId` is provided. The API call would include the full message history, effectively resuming the conversation.
+
+---
+
+## Implementation Notes
+
+- **No MCP server.** The copilot provider calls tool handlers directly in-process, unlike claude-code which routes tool calls through an HTTP MCP server. This is simpler because the provider owns the full request/response cycle.
+- **SSE `[DONE]` sentinel.** The GitHub Models streaming API follows the OpenAI convention of sending `data: [DONE]` as the final SSE line. The parser skips this sentinel.
+- **Trailing slash handling.** The `apiEndpoint` has trailing slashes stripped before use to avoid double-slash URLs in the fetch call.
+- **`z.toJSONSchema`.** Requires Zod 4.x. The `z.toJSONSchema()` function converts a Zod schema to a JSON Schema object for inclusion in the OpenAI tools array.
diff --git a/packages/plugins/copilot/package.json b/packages/plugins/copilot/package.json
new file mode 100644
index 0000000..cb3fcc8
--- /dev/null
+++ b/packages/plugins/copilot/package.json
@@ -0,0 +1,40 @@
+{
+  "name": "@shardworks/copilot-apparatus",
+  "version": "0.0.0",
+  "license": "ISC",
+  "repository": {
+    "type": "git",
+    "url": "https://github.com/shardworks/nexus",
+    "directory": "packages/plugins/copilot"
+  },
+  "description": "Copilot session provider apparatus — launches sessions via the GitHub Models API",
+  "type": "module",
+  "exports": {
+    ".": "./src/index.ts"
+  },
+  "scripts": {
+    "build": "tsc",
+    "test": "node --disable-warning=ExperimentalWarning --experimental-transform-types --test 'src/**/*.test.ts'",
+    "typecheck": "tsc --noEmit"
+  },
+  "dependencies": {
+    "@shardworks/animator-apparatus": "workspace:*",
+    "@shardworks/nexus-core": "workspace:*",
+    "@shardworks/tools-apparatus": "workspace:*",
+    "zod": "4.3.6"
+  },
+  "devDependencies": {
+    "@types/node": "25.5.0"
+  },
+  "files": [
+    "dist"
+  ],
+  "publishConfig": {
+    "exports": {
+      ".": {
+        "types": "./dist/index.d.ts",
+        "import": "./dist/index.js"
+      }
+    }
+  }
+}
diff --git a/packages/plugins/copilot/src/index.test.ts b/packages/plugins/copilot/src/index.test.ts
new file mode 100644
index 0000000..88cdfdd
--- /dev/null
+++ b/packages/plugins/copilot/src/index.test.ts
@@ -0,0 +1,897 @@
+/**
+ * Tests for the Copilot session provider apparatus.
+ *
+ * Uses Node's built-in test runner and mocks globalThis.fetch to avoid
+ * real network calls. Covers all requirements specified in the plan.
+ */
+
+import assert from 'node:assert/strict';
+import { describe, it, beforeEach, afterEach, mock } from 'node:test';
+import { z } from 'zod';
+
+import {
+  createCopilotProvider,
+  convertTools,
+  extractOutput,
+  parseSseLines,
+} from './index.ts';
+
+import type { CopilotConfig } from './index.ts';
+import type { SessionProviderConfig } from '@shardworks/animator-apparatus';
+import type { ResolvedTool } from '@shardworks/tools-apparatus';
+
+// ── Test helpers ────────────────────────────────────────────────────
+
+/** Build a minimal SessionProviderConfig for testing. */
+function makeConfig(overrides: Partial<SessionProviderConfig> = {}): SessionProviderConfig {
+  return {
+    model: 'gpt-4o',
+    cwd: '/tmp',
+    ...overrides,
+  };
+}
+
+/** Build a minimal ResolvedTool for testing. */
+function makeTool(
+  name: string,
+  handler: (params: Record<string, unknown>) => unknown = () => 'tool result',
+): ResolvedTool {
+  return {
+    definition: {
+      name,
+      description: `Tool ${name}`,
+      params: z.object({ input: z.string().optional() }),
+      handler: handler as (params: unknown) => unknown,
+    },
+    pluginId: 'test',
+  };
+}
+
+/** Build a non-streaming ChatCompletionResponse. */
+function makeApiResponse(
+  content: string | null,
+  options: {
+    id?: string;
+    toolCalls?: Array<{ id: string; name: string; args: string }>;
+    promptTokens?: number;
+    completionTokens?: number;
+  } = {},
+) {
+  const id = options.id ?? 'chatcmpl-test123';
+  return {
+    id,
+    choices: [
+      {
+        message: {
+          role: 'assistant' as const,
+          content,
+          ...(options.toolCalls
+            ? {
+                tool_calls: options.toolCalls.map((tc) => ({
+                  id: tc.id,
+                  type: 'function' as const,
+                  function: { name: tc.name, arguments: tc.args },
+                })),
+              }
+            : {}),
+        },
+        finish_reason: options.toolCalls ? 'tool_calls' : 'stop',
+      },
+    ],
+    usage: {
+      prompt_tokens: options.promptTokens ?? 100,
+      completion_tokens: options.completionTokens ?? 50,
+    },
+  };
+}
+
+/** Build an SSE stream body from array of ChatCompletionChunk JSON objects. */
+function makeSseStream(chunks: object[], done = true): ReadableStream<Uint8Array> {
+  const encoder = new TextEncoder();
+  const lines: string[] = [];
+  for (const chunk of chunks) {
+    lines.push(`data: ${JSON.stringify(chunk)}\n`);
+  }
+  if (done) lines.push('data: [DONE]\n');
+  const body = lines.join('');
+
+  return new ReadableStream<Uint8Array>({
+    start(controller) {
+      controller.enqueue(encoder.encode(body));
+      controller.close();
+    },
+  });
+}
+
+/** Mock global fetch. Returns a cleanup function that restores the original. */
+function mockFetch(impl: typeof fetch): () => void {
+  const original = globalThis.fetch;
+  globalThis.fetch = impl;
+  return () => { globalThis.fetch = original; };
+}
+
+/** Collect all chunks from an async iterable. */
+async function collectChunks<T>(iterable: AsyncIterable<T>): Promise<T[]> {
+  const items: T[] = [];
+  for await (const item of iterable) {
+    items.push(item);
+  }
+  return items;
+}
+
+// ── Guild mock ──────────────────────────────────────────────────────
+
+// We mock guild() to return a minimal GuildConfig. The apparatus reads
+// guild().guildConfig().copilot in start(), which we call manually in tests.
+
+let mockCopilotConfig: CopilotConfig = {};
+
+// Patch guild module to return controlled config
+import { setGuild } from '@shardworks/nexus-core';
+
+// Set up a minimal mock guild before tests
+function setupGuild(copilotConfig: CopilotConfig = {}) {
+  mockCopilotConfig = copilotConfig;
+  setGuild({
+    home: '/tmp/test-guild',
+    guildConfig: () => ({
+      name: 'test-guild',
+      nexus: '0.0.0',
+      plugins: [],
+      copilot: mockCopilotConfig,
+    }),
+    apparatus: <T>(_name: string): T => { throw new Error('not implemented'); },
+    config: <T>(_pluginId: string): T => ({} as T),
+    writeConfig: () => {},
+    kits: () => [],
+    apparatuses: () => [],
+    failedPlugins: () => [],
+  });
+}
+
+// ── Helper: create and start a provider ────────────────────────────
+
+function createStartedProvider(copilotConfig: CopilotConfig = {}) {
+  setupGuild(copilotConfig);
+  const plugin = createCopilotProvider();
+  if (!('apparatus' in plugin)) throw new Error('Expected apparatus plugin');
+  plugin.apparatus.start({ on: () => {} });
+  return plugin.apparatus.provides as import('@shardworks/animator-apparatus').AnimatorSessionProvider;
+}
+
+// ── Tests ───────────────────────────────────────────────────────────
+
+describe('convertTools', () => {
+  it('converts ResolvedTool array to OpenAI function tool format', () => {
+    const tools = [
+      makeTool('search'),
+      makeTool('compute'),
+    ];
+    const result = convertTools(tools);
+
+    assert.equal(result.length, 2);
+    assert.equal(result[0]!.type, 'function');
+    assert.equal(result[0]!.function.name, 'search');
+    assert.equal(result[0]!.function.description, 'Tool search');
+    assert.ok(typeof result[0]!.function.parameters === 'object');
+    assert.equal(result[1]!.function.name, 'compute');
+  });
+
+  it('produces valid JSON Schema from Zod schema', () => {
+    const tool = {
+      ...makeTool('test'),
+      definition: {
+        ...makeTool('test').definition,
+        params: z.object({
+          query: z.string().describe('Search query'),
+          limit: z.number().optional(),
+        }),
+      },
+    };
+    const [converted] = convertTools([tool]);
+    const params = converted!.function.parameters;
+
+    // Should be a JSON Schema object
+    assert.equal((params as { type: string }).type, 'object');
+    assert.ok('properties' in params);
+  });
+
+  it('returns empty array for empty input', () => {
+    assert.deepEqual(convertTools([]), []);
+  });
+});
+
+describe('extractOutput', () => {
+  it('returns content of the last assistant message with no tool_calls', () => {
+    const messages = [
+      { role: 'system' as const, content: 'system prompt' },
+      { role: 'user' as const, content: 'hello' },
+      { role: 'assistant' as const, content: 'world' },
+    ];
+    assert.equal(extractOutput(messages), 'world');
+  });
+
+  it('skips assistant messages that have tool_calls', () => {
+    const messages = [
+      { role: 'user' as const, content: 'hello' },
+      {
+        role: 'assistant' as const,
+        content: null,
+        tool_calls: [{ id: 'c1', type: 'function' as const, function: { name: 'f', arguments: '{}' } }],
+      },
+      { role: 'tool' as const, content: 'result', tool_call_id: 'c1' },
+      { role: 'assistant' as const, content: 'final answer' },
+    ];
+    assert.equal(extractOutput(messages), 'final answer');
+  });
+
+  it('returns undefined when no suitable assistant message exists', () => {
+    const messages = [{ role: 'user' as const, content: 'hi' }];
+    assert.equal(extractOutput(messages), undefined);
+  });
+
+  it('returns undefined when last assistant message has null content', () => {
+    const messages = [
+      { role: 'assistant' as const, content: null },
+    ];
+    assert.equal(extractOutput(messages), undefined);
+  });
+});
+
+describe('parseSseLines', () => {
+  it('parses data lines and calls handler', () => {
+    const received: string[] = [];
+    const remaining = parseSseLines(
+      'data: {"hello":"world"}\ndata: {"foo":"bar"}\n',
+      (d) => received.push(d),
+    );
+    assert.deepEqual(received, ['{"hello":"world"}', '{"foo":"bar"}']);
+    assert.equal(remaining, '');
+  });
+
+  it('skips [DONE] sentinel', () => {
+    const received: string[] = [];
+    parseSseLines('data: {"text":"hi"}\ndata: [DONE]\n', (d) => received.push(d));
+    assert.deepEqual(received, ['{"text":"hi"}']);
+  });
+
+  it('ignores non-data lines (empty, comments, event:)', () => {
+    const received: string[] = [];
+    parseSseLines('event: message\ndata: {"ok":true}\n: comment\n\n', (d) => received.push(d));
+    assert.deepEqual(received, ['{"ok":true}']);
+  });
+
+  it('returns incomplete last line as remaining buffer', () => {
+    const received: string[] = [];
+    const remaining = parseSseLines('data: {"a":1}\ndata: {"b"', (d) => received.push(d));
+    assert.deepEqual(received, ['{"a":1}']);
+    assert.equal(remaining, 'data: {"b"');
+  });
+});
+
+describe('createCopilotProvider', () => {
+  it('returns a plugin with apparatus.provides having name "copilot"', () => {
+    setupGuild();
+    const plugin = createCopilotProvider();
+    assert.ok('apparatus' in plugin);
+    const provider = plugin.apparatus.provides as { name: string };
+    assert.equal(provider.name, 'copilot');
+  });
+
+  it('reads copilot config from guild at start() time', () => {
+    // Just verify start() doesn't throw; the config is used during launch()
+    const provider = createStartedProvider({ tokenEnvVar: 'MY_TOKEN', maxToolRounds: 5 });
+    assert.equal(provider.name, 'copilot');
+  });
+});
+
+describe('launch() — missing token', () => {
+  it('throws when the token env var is missing', async () => {
+    const provider = createStartedProvider({ tokenEnvVar: 'MISSING_TOKEN_XYZ' });
+    delete process.env['MISSING_TOKEN_XYZ'];
+
+    const { result } = provider.launch(makeConfig());
+    await assert.rejects(result, /MISSING_TOKEN_XYZ/);
+  });
+
+  it('uses GITHUB_TOKEN by default', async () => {
+    const provider = createStartedProvider();
+    const savedToken = process.env['GITHUB_TOKEN'];
+    delete process.env['GITHUB_TOKEN'];
+
+    const { result } = provider.launch(makeConfig());
+    await assert.rejects(result, /GITHUB_TOKEN/);
+
+    if (savedToken !== undefined) process.env['GITHUB_TOKEN'] = savedToken;
+  });
+});
+
+describe('launch() — non-streaming single-turn', () => {
+  let restoreToken: (() => void) | undefined;
+  let restoreFetch: (() => void) | undefined;
+
+  beforeEach(() => {
+    process.env['GITHUB_TOKEN'] = 'test-token';
+    restoreToken = () => { delete process.env['GITHUB_TOKEN']; };
+  });
+
+  afterEach(() => {
+    restoreToken?.();
+    restoreFetch?.();
+  });
+
+  it('happy path: single-turn completion with no tools', async () => {
+    const apiResp = makeApiResponse('Hello from the model', {
+      id: 'chatcmpl-abc123',
+      promptTokens: 120,
+      completionTokens: 30,
+    });
+
+    restoreFetch = mockFetch(async (url, opts) => {
+      assert.ok(String(url).includes('/chat/completions'));
+      const body = JSON.parse((opts as RequestInit).body as string) as Record<string, unknown>;
+      assert.equal(body['model'], 'gpt-4o');
+      assert.equal(body['stream'], false);
+      assert.ok(!('tools' in body)); // No tools in request
+
+      const msgs = body['messages'] as Array<{ role: string; content: string }>;
+      assert.equal(msgs[0]!.role, 'system');
+      assert.equal(msgs[0]!.content, 'You are a helpful assistant');
+      assert.equal(msgs[1]!.role, 'user');
+      assert.equal(msgs[1]!.content, 'Say hello');
+
+      const headers = (opts as RequestInit).headers as Record<string, string>;
+      assert.equal(headers['Authorization'], 'Bearer test-token');
+
+      return new Response(JSON.stringify(apiResp), { status: 200 });
+    });
+
+    const provider = createStartedProvider();
+    const { chunks, result } = provider.launch(makeConfig({
+      systemPrompt: 'You are a helpful assistant',
+      initialPrompt: 'Say hello',
+    }));
+
+    const chunkItems = await collectChunks(chunks);
+    assert.equal(chunkItems.length, 0); // Non-streaming: no chunks
+
+    const res = await result;
+    assert.equal(res.status, 'completed');
+    assert.equal(res.exitCode, 0);
+    assert.equal(res.output, 'Hello from the model');
+    assert.equal(res.providerSessionId, 'chatcmpl-abc123');
+    assert.deepEqual(res.tokenUsage, { inputTokens: 120, outputTokens: 30 });
+    assert.equal(res.costUsd, undefined);
+
+    // Transcript: system, user, assistant
+    assert.equal(res.transcript?.length, 3);
+    assert.equal((res.transcript?.[0] as { role: string })?.role, 'system');
+    assert.equal((res.transcript?.[1] as { role: string })?.role, 'user');
+    assert.equal((res.transcript?.[2] as { role: string })?.role, 'assistant');
+  });
+
+  it('uses custom apiEndpoint from config', async () => {
+    let capturedUrl = '';
+    restoreFetch = mockFetch(async (url) => {
+      capturedUrl = String(url);
+      return new Response(JSON.stringify(makeApiResponse('ok')), { status: 200 });
+    });
+
+    const provider = createStartedProvider({ apiEndpoint: 'https://custom.endpoint.com' });
+    const { result } = provider.launch(makeConfig({ initialPrompt: 'test' }));
+    await result;
+
+    assert.ok(capturedUrl.startsWith('https://custom.endpoint.com'));
+  });
+
+  it('ignores conversationId, cwd, and environment without errors', async () => {
+    restoreFetch = mockFetch(async () =>
+      new Response(JSON.stringify(makeApiResponse('ok')), { status: 200 }),
+    );
+
+    const provider = createStartedProvider();
+    const { result } = provider.launch(makeConfig({
+      conversationId: 'conv-123',
+      cwd: '/some/path',
+      environment: { FOO: 'bar' },
+      initialPrompt: 'test',
+    }));
+
+    const res = await result;
+    assert.equal(res.status, 'completed');
+  });
+
+  it('handles absent systemPrompt and initialPrompt', async () => {
+    let capturedBody: Record<string, unknown> = {};
+    restoreFetch = mockFetch(async (_, opts) => {
+      capturedBody = JSON.parse((opts as RequestInit).body as string) as Record<string, unknown>;
+      return new Response(JSON.stringify(makeApiResponse('ok')), { status: 200 });
+    });
+
+    const provider = createStartedProvider();
+    const { result } = provider.launch(makeConfig());
+    const res = await result;
+
+    assert.equal(res.status, 'completed');
+    assert.deepEqual(capturedBody['messages'], []); // Empty messages array
+  });
+
+  it('returns status: failed on HTTP error', async () => {
+    restoreFetch = mockFetch(async () =>
+      new Response('Unauthorized', { status: 401 }),
+    );
+
+    const provider = createStartedProvider();
+    const { result } = provider.launch(makeConfig({ initialPrompt: 'hi' }));
+    const res = await result;
+
+    assert.equal(res.status, 'failed');
+    assert.equal(res.exitCode, 1);
+    assert.ok(res.error?.includes('401'));
+  });
+
+  it('returns status: failed on network failure (fetch throws)', async () => {
+    restoreFetch = mockFetch(async () => {
+      throw new Error('DNS resolution failed');
+    });
+
+    const provider = createStartedProvider();
+    const { result } = provider.launch(makeConfig({ initialPrompt: 'hi' }));
+    const res = await result;
+
+    assert.equal(res.status, 'failed');
+    assert.equal(res.exitCode, 1);
+    assert.ok(res.error?.includes('DNS resolution failed'));
+  });
+});
+
+describe('launch() — agentic tool-call loop', () => {
+  let restoreToken: (() => void) | undefined;
+  let restoreFetch: (() => void) | undefined;
+
+  beforeEach(() => {
+    process.env['GITHUB_TOKEN'] = 'test-token';
+    restoreToken = () => { delete process.env['GITHUB_TOKEN']; };
+  });
+
+  afterEach(() => {
+    restoreToken?.();
+    restoreFetch?.();
+  });
+
+  it('happy path: tool-calling session with 2 API calls', async () => {
+    const toolHandler = mock.fn((_params: unknown) => 'tool output from handler');
+    const tool = makeTool('my-tool', toolHandler);
+
+    let callCount = 0;
+    restoreFetch = mockFetch(async (_, opts) => {
+      callCount++;
+      const body = JSON.parse((opts as RequestInit).body as string) as Record<string, unknown>;
+      const messages = body['messages'] as Array<{ role: string }>;
+
+      if (callCount === 1) {
+        // First call: return a response with tool_calls
+        return new Response(JSON.stringify(makeApiResponse(null, {
+          id: 'chatcmpl-round1',
+          toolCalls: [{ id: 'call-1', name: 'my-tool', args: '{"input":"test"}' }],
+          promptTokens: 100,
+          completionTokens: 10,
+        })), { status: 200 });
+      }
+
+      // Second call: verify tool result is included, return final response
+      assert.ok(messages.some((m) => m.role === 'tool'));
+      return new Response(JSON.stringify(makeApiResponse('Final answer', {
+        id: 'chatcmpl-round2',
+        promptTokens: 150,
+        completionTokens: 20,
+      })), { status: 200 });
+    });
+
+    const provider = createStartedProvider();
+    const { result } = provider.launch(makeConfig({
+      initialPrompt: 'Use my-tool',
+      tools: [tool],
+    }));
+
+    const res = await result;
+    assert.equal(res.status, 'completed');
+    assert.equal(res.exitCode, 0);
+    assert.equal(res.output, 'Final answer');
+    assert.equal(res.providerSessionId, 'chatcmpl-round2'); // Last response id
+    assert.deepEqual(res.tokenUsage, { inputTokens: 250, outputTokens: 30 }); // Summed
+    assert.equal(callCount, 2);
+    assert.equal(toolHandler.mock.callCount(), 1);
+
+    // Transcript: user, assistant(tool_calls), tool(result), assistant(final)
+    assert.equal(res.transcript?.length, 4);
+    assert.equal((res.transcript?.[0] as { role: string })?.role, 'user');
+    assert.equal((res.transcript?.[1] as { role: string })?.role, 'assistant');
+    assert.equal((res.transcript?.[2] as { role: string })?.role, 'tool');
+    assert.equal((res.transcript?.[3] as { role: string })?.role, 'assistant');
+  });
+
+  it('includes tools array in API request when tools are provided', async () => {
+    let capturedBody: Record<string, unknown> = {};
+    restoreFetch = mockFetch(async (_, opts) => {
+      capturedBody = JSON.parse((opts as RequestInit).body as string) as Record<string, unknown>;
+      return new Response(JSON.stringify(makeApiResponse('done')), { status: 200 });
+    });
+
+    const provider = createStartedProvider();
+    const { result } = provider.launch(makeConfig({
+      tools: [makeTool('search'), makeTool('write')],
+      initialPrompt: 'go',
+    }));
+    await result;
+
+    const tools = capturedBody['tools'] as Array<{ type: string; function: { name: string } }>;
+    assert.ok(Array.isArray(tools));
+    assert.equal(tools.length, 2);
+    assert.equal(tools[0]!.type, 'function');
+    assert.equal(tools[0]!.function.name, 'search');
+    assert.equal(tools[1]!.function.name, 'write');
+  });
+
+  it('handles tool handler error — sends error message back to model', async () => {
+    const failingTool = makeTool('bad-tool', () => { throw new Error('database offline'); });
+
+    let secondCallMessages: Array<{ role: string; content: string }> = [];
+    let callCount = 0;
+    restoreFetch = mockFetch(async (_, opts) => {
+      callCount++;
+      const body = JSON.parse((opts as RequestInit).body as string) as Record<string, unknown>;
+      if (callCount === 1) {
+        return new Response(JSON.stringify(makeApiResponse(null, {
+          toolCalls: [{ id: 'call-err', name: 'bad-tool', args: '{}' }],
+        })), { status: 200 });
+      }
+      secondCallMessages = body['messages'] as Array<{ role: string; content: string }>;
+      return new Response(JSON.stringify(makeApiResponse('OK despite error')), { status: 200 });
+    });
+
+    const provider = createStartedProvider();
+    const { result } = provider.launch(makeConfig({
+      tools: [failingTool],
+      initialPrompt: 'try bad-tool',
+    }));
+
+    const res = await result;
+    assert.equal(res.status, 'completed'); // Session does NOT fail
+    assert.equal(res.exitCode, 0);
+    assert.equal(callCount, 2);
+
+    // The tool result message should contain the error
+    const toolMsg = secondCallMessages.find((m) => m.role === 'tool');
+    assert.ok(toolMsg);
+    assert.ok(toolMsg.content.includes('Error: database offline'));
+  });
+
+  it('handles unknown tool name — sends error message back to model', async () => {
+    let secondCallMessages: Array<{ role: string; content: string }> = [];
+    let callCount = 0;
+    restoreFetch = mockFetch(async (_, opts) => {
+      callCount++;
+      const body = JSON.parse((opts as RequestInit).body as string) as Record<string, unknown>;
+      if (callCount === 1) {
+        return new Response(JSON.stringify(makeApiResponse(null, {
+          toolCalls: [{ id: 'call-x', name: 'nonexistent-tool', args: '{}' }],
+        })), { status: 200 });
+      }
+      secondCallMessages = body['messages'] as Array<{ role: string; content: string }>;
+      return new Response(JSON.stringify(makeApiResponse('Handled unknown tool')), { status: 200 });
+    });
+
+    const provider = createStartedProvider();
+    const { result } = provider.launch(makeConfig({
+      tools: [makeTool('known-tool')],
+      initialPrompt: 'try nonexistent',
+    }));
+
+    const res = await result;
+    assert.equal(res.status, 'completed');
+
+    const toolMsg = secondCallMessages.find((m) => m.role === 'tool');
+    assert.ok(toolMsg?.content.includes('Unknown tool: nonexistent-tool'));
+  });
+
+  it('enforces maxToolRounds — stops after limit and completes normally', async () => {
+    let callCount = 0;
+    restoreFetch = mockFetch(async () => {
+      callCount++;
+      // Always return tool_calls to trigger more rounds
+      return new Response(JSON.stringify(makeApiResponse(null, {
+        id: `chatcmpl-round${callCount}`,
+        toolCalls: [{ id: `call-${callCount}`, name: 'loop-tool', args: '{}' }],
+      })), { status: 200 });
+    });
+
+    const provider = createStartedProvider({ maxToolRounds: 3 });
+    const { result } = provider.launch(makeConfig({
+      tools: [makeTool('loop-tool')],
+      initialPrompt: 'loop forever',
+    }));
+
+    const res = await result;
+    assert.equal(res.status, 'completed'); // Completes normally, not as failure
+    assert.equal(res.exitCode, 0);
+    // Initial call + 3 rounds = 4 total calls
+    assert.equal(callCount, 4);
+  });
+
+  it('accumulates token usage across multiple rounds', async () => {
+    let callCount = 0;
+    restoreFetch = mockFetch(async () => {
+      callCount++;
+      if (callCount <= 3) {
+        return new Response(JSON.stringify(makeApiResponse(null, {
+          toolCalls: [{ id: `c${callCount}`, name: 'counter', args: '{}' }],
+          promptTokens: 100,
+          completionTokens: 50,
+        })), { status: 200 });
+      }
+      return new Response(JSON.stringify(makeApiResponse('done', {
+        promptTokens: 100,
+        completionTokens: 50,
+      })), { status: 200 });
+    });
+
+    const provider = createStartedProvider();
+    const { result } = provider.launch(makeConfig({
+      tools: [makeTool('counter')],
+      initialPrompt: 'count',
+    }));
+
+    const res = await result;
+    // 4 API calls × 100 input + 4 × 50 output = 400/200
+    assert.deepEqual(res.tokenUsage, { inputTokens: 400, outputTokens: 200 });
+    assert.equal(res.costUsd, undefined);
+  });
+
+  it('uses providerSessionId from the last API response', async () => {
+    let callCount = 0;
+    restoreFetch = mockFetch(async () => {
+      callCount++;
+      if (callCount === 1) {
+        return new Response(JSON.stringify(makeApiResponse(null, {
+          id: 'chatcmpl-first',
+          toolCalls: [{ id: 'c1', name: 'tool', args: '{}' }],
+        })), { status: 200 });
+      }
+      return new Response(JSON.stringify(makeApiResponse('done', { id: 'chatcmpl-last' })), { status: 200 });
+    });
+
+    const provider = createStartedProvider();
+    const { result } = provider.launch(makeConfig({
+      tools: [makeTool('tool')],
+      initialPrompt: 'run tool',
+    }));
+
+    const res = await result;
+    assert.equal(res.providerSessionId, 'chatcmpl-last');
+  });
+});
+
+describe('launch() — streaming', () => {
+  let restoreToken: (() => void) | undefined;
+  let restoreFetch: (() => void) | undefined;
+
+  beforeEach(() => {
+    process.env['GITHUB_TOKEN'] = 'test-token';
+    restoreToken = () => { delete process.env['GITHUB_TOKEN']; };
+  });
+
+  afterEach(() => {
+    restoreToken?.();
+    restoreFetch?.();
+  });
+
+  it('yields text chunks from streamed response', async () => {
+    const streamChunks = [
+      { id: 'chatcmpl-s1', choices: [{ delta: { content: 'Hello' }, finish_reason: null }], usage: null },
+      { id: 'chatcmpl-s1', choices: [{ delta: { content: ' world' }, finish_reason: null }], usage: null },
+      { id: 'chatcmpl-s1', choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 5 } },
+    ];
+
+    restoreFetch = mockFetch(async (_, opts) => {
+      const body = JSON.parse((opts as RequestInit).body as string) as Record<string, unknown>;
+      assert.equal(body['stream'], true);
+      assert.ok((body['stream_options'] as Record<string, unknown>)?.['include_usage']);
+      return new Response(makeSseStream(streamChunks), { status: 200 });
+    });
+
+    const provider = createStartedProvider();
+    const { chunks, result } = provider.launch(makeConfig({
+      streaming: true,
+      initialPrompt: 'hi',
+    }));
+
+    const received = await collectChunks(chunks);
+    const res = await result;
+
+    assert.deepEqual(received, [
+      { type: 'text', text: 'Hello' },
+      { type: 'text', text: ' world' },
+    ]);
+    assert.equal(res.status, 'completed');
+    assert.equal(res.output, 'Hello world');
+    assert.deepEqual(res.tokenUsage, { inputTokens: 10, outputTokens: 5 });
+  });
+
+  it('yields tool_use chunk when tool call is streamed', async () => {
+    const streamChunks = [
+      {
+        id: 'chatcmpl-t1',
+        choices: [{
+          delta: {
+            tool_calls: [{ index: 0, id: 'call-123', type: 'function', function: { name: 'my-tool', arguments: '' } }],
+          },
+          finish_reason: null,
+        }],
+        usage: null,
+      },
+      {
+        id: 'chatcmpl-t1',
+        choices: [{
+          delta: {
+            tool_calls: [{ index: 0, function: { arguments: '{"input":"test"}' } }],
+          },
+          finish_reason: 'tool_calls',
+        }],
+        usage: null,
+      },
+      { id: 'chatcmpl-t1', choices: [{ delta: {}, finish_reason: null }], usage: { prompt_tokens: 20, completion_tokens: 10 } },
+    ];
+
+    let callCount = 0;
+    restoreFetch = mockFetch(async () => {
+      callCount++;
+      if (callCount === 1) {
+        return new Response(makeSseStream(streamChunks), { status: 200 });
+      }
+      // Second call: return text response
+      const finalChunks = [
+        { id: 'chatcmpl-t2', choices: [{ delta: { content: 'Tool done' }, finish_reason: null }], usage: null },
+        { id: 'chatcmpl-t2', choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 30, completion_tokens: 15 } },
+      ];
+      return new Response(makeSseStream(finalChunks), { status: 200 });
+    });
+
+    const provider = createStartedProvider();
+    const { chunks, result } = provider.launch(makeConfig({
+      streaming: true,
+      tools: [makeTool('my-tool')],
+      initialPrompt: 'use my-tool',
+    }));
+
+    const received = await collectChunks(chunks);
+    const res = await result;
+
+    // Should have: tool_use chunk, tool_result chunk, text chunk
+    const toolUseChunks = received.filter((c) => c.type === 'tool_use');
+    const toolResultChunks = received.filter((c) => c.type === 'tool_result');
+    const textChunks = received.filter((c) => c.type === 'text');
+
+    assert.equal(toolUseChunks.length, 1);
+    assert.equal((toolUseChunks[0] as { type: string; tool: string })?.tool, 'my-tool');
+    assert.equal(toolResultChunks.length, 1);
+    assert.equal((toolResultChunks[0] as { type: string; tool: string })?.tool, 'call-123');
+    assert.equal(textChunks.length, 1);
+    assert.equal((textChunks[0] as { type: string; text: string })?.text, 'Tool done');
+
+    assert.equal(res.status, 'completed');
+    // Token usage summed across both calls
+    assert.deepEqual(res.tokenUsage, { inputTokens: 50, outputTokens: 25 });
+  });
+
+  it('returns failed result on streaming API error', async () => {
+    restoreFetch = mockFetch(async () =>
+      new Response('Forbidden', { status: 403 }),
+    );
+
+    const provider = createStartedProvider();
+    const { chunks, result } = provider.launch(makeConfig({
+      streaming: true,
+      initialPrompt: 'hi',
+    }));
+
+    const received = await collectChunks(chunks);
+    const res = await result;
+
+    assert.equal(received.length, 0);
+    assert.equal(res.status, 'failed');
+    assert.equal(res.exitCode, 1);
+    assert.ok(res.error?.includes('403'));
+  });
+
+  it('non-streaming returns empty chunks iterable', async () => {
+    restoreFetch = mockFetch(async () =>
+      new Response(JSON.stringify(makeApiResponse('done')), { status: 200 }),
+    );
+
+    const provider = createStartedProvider();
+    const { chunks, result } = provider.launch(makeConfig({
+      streaming: false,
+      initialPrompt: 'hi',
+    }));
+
+    const received = await collectChunks(chunks);
+    assert.equal(received.length, 0);
+
+    const res = await result;
+    assert.equal(res.status, 'completed');
+  });
+});
+
+describe('config defaults', () => {
+  let restoreToken: (() => void) | undefined;
+  let restoreFetch: (() => void) | undefined;
+
+  beforeEach(() => {
+    process.env['GITHUB_TOKEN'] = 'test-token';
+    restoreToken = () => { delete process.env['GITHUB_TOKEN']; };
+  });
+
+  afterEach(() => {
+    restoreToken?.();
+    restoreFetch?.();
+  });
+
+  it('uses default endpoint when copilot config is absent', async () => {
+    let capturedUrl = '';
+    restoreFetch = mockFetch(async (url) => {
+      capturedUrl = String(url);
+      return new Response(JSON.stringify(makeApiResponse('ok')), { status: 200 });
+    });
+
+    const provider = createStartedProvider(); // No copilot config
+    const { result } = provider.launch(makeConfig({ initialPrompt: 'hi' }));
+    await result;
+
+    assert.ok(capturedUrl.startsWith('https://models.inference.ai.azure.com'));
+  });
+
+  it('uses default maxToolRounds of 50', async () => {
+    let callCount = 0;
+    restoreFetch = mockFetch(async () => {
+      callCount++;
+      // Always return tool_calls
+      return new Response(JSON.stringify(makeApiResponse(null, {
+        toolCalls: [{ id: `c${callCount}`, name: 't', args: '{}' }],
+      })), { status: 200 });
+    });
+
+    const provider = createStartedProvider(); // No maxToolRounds config
+    const { result } = provider.launch(makeConfig({
+      tools: [makeTool('t')],
+      initialPrompt: 'loop',
+    }));
+
+    const res = await result;
+    assert.equal(res.status, 'completed');
+    // Initial call + 50 rounds = 51 total
+    assert.equal(callCount, 51);
+  });
+
+  it('uses custom config values', async () => {
+    let capturedUrl = '';
+    let capturedAuth = '';
+    restoreFetch = mockFetch(async (url, opts) => {
+      capturedUrl = String(url);
+      capturedAuth = ((opts as RequestInit).headers as Record<string, string>)['Authorization'] ?? '';
+      return new Response(JSON.stringify(makeApiResponse('ok')), { status: 200 });
+    });
+
+    process.env['MY_CUSTOM_TOKEN'] = 'custom-token-value';
+    const provider = createStartedProvider({
+      apiEndpoint: 'https://custom.endpoint.com',
+      tokenEnvVar: 'MY_CUSTOM_TOKEN',
+    });
+    const { result } = provider.launch(makeConfig({ initialPrompt: 'hi' }));
+    await result;
+
+    assert.ok(capturedUrl.startsWith('https://custom.endpoint.com'));
+    assert.equal(capturedAuth, 'Bearer custom-token-value');
+    delete process.env['MY_CUSTOM_TOKEN'];
+  });
+});
diff --git a/packages/plugins/copilot/src/index.ts b/packages/plugins/copilot/src/index.ts
new file mode 100644
index 0000000..61d5c81
--- /dev/null
+++ b/packages/plugins/copilot/src/index.ts
@@ -0,0 +1,756 @@
+/**
+ * Copilot Session Provider
+ *
+ * Apparatus plugin that implements AnimatorSessionProvider using the
+ * GitHub Models REST API (OpenAI-compatible). The Animator discovers
+ * this via guild config:
+ *
+ *   guild.json["animator"]["sessionProvider"] = "copilot"
+ *
+ * Calls the chat completions endpoint, runs an in-process agentic
+ * tool-call loop when tools are supplied, and supports streaming via SSE.
+ *
+ * Key design choice: calls tool handlers directly in-process (no MCP server).
+ * This is simpler than the claude-code approach since we control the API
+ * request/response cycle directly.
+ */
+
+import { z } from 'zod';
+
+import { guild } from '@shardworks/nexus-core';
+import type { Plugin, StartupContext } from '@shardworks/nexus-core';
+import type {
+  AnimatorSessionProvider,
+  SessionProviderConfig,
+  SessionProviderResult,
+  SessionChunk,
+} from '@shardworks/animator-apparatus';
+import type { ResolvedTool } from '@shardworks/tools-apparatus';
+
+// ── Config types ────────────────────────────────────────────────────
+
+/** Plugin configuration stored at guild.json["copilot"]. */
+export interface CopilotConfig {
+  /**
+   * Chat completions API base endpoint URL.
+   * Default: 'https://models.inference.ai.azure.com'
+   */
+  apiEndpoint?: string;
+  /**
+   * Name of the environment variable holding the API bearer token.
+   * Default: 'GITHUB_TOKEN'
+   */
+  tokenEnvVar?: string;
+  /**
+   * Maximum number of tool-call rounds in the agentic loop.
+   * When reached, the session completes with the last available response.
+   * Default: 50
+   */
+  maxToolRounds?: number;
+}
+
+// GuildConfig module augmentation — merged with other augmentations via declaration merging
+declare module '@shardworks/nexus-core' {
+  interface GuildConfig {
+    copilot?: CopilotConfig;
+  }
+}
+
+// ── Internal types ──────────────────────────────────────────────────
+
+/** OpenAI-compatible chat completion message. */
+interface ChatMessage {
+  role: 'system' | 'user' | 'assistant' | 'tool';
+  content: string | null;
+  tool_calls?: ToolCall[];
+  tool_call_id?: string;
+  /** Index signature makes ChatMessage compatible with Record<string, unknown>. */
+  [key: string]: unknown;
+}
+
+/** OpenAI-compatible tool call from an assistant response. */
+interface ToolCall {
+  id: string;
+  type: 'function';
+  function: {
+    name: string;
+    arguments: string;
+  };
+}
+
+/** OpenAI-compatible function tool definition for the API request. */
+interface ToolDef {
+  type: 'function';
+  function: {
+    name: string;
+    description: string;
+    parameters: Record<string, unknown>;
+  };
+}
+
+/** OpenAI-compatible chat completion response (non-streaming). */
+interface ChatCompletionResponse {
+  id: string;
+  choices: Array<{
+    message: {
+      role: 'assistant';
+      content: string | null;
+      tool_calls?: ToolCall[];
+    };
+    finish_reason: string;
+  }>;
+  usage?: {
+    prompt_tokens: number;
+    completion_tokens: number;
+  };
+}
+
+/** OpenAI-compatible streaming chunk. */
+interface ChatCompletionChunk {
+  id: string;
+  choices: Array<{
+    delta: {
+      role?: string;
+      content?: string | null;
+      tool_calls?: Array<{
+        index: number;
+        id?: string;
+        type?: string;
+        function?: {
+          name?: string;
+          arguments?: string;
+        };
+      }>;
+    };
+    finish_reason: string | null;
+  }>;
+  usage?: {
+    prompt_tokens: number;
+    completion_tokens: number;
+  } | null;
+}
+
+/** A single transcript message entry. Matches the TranscriptMessage alias in animator types. */
+type TranscriptEntry = Record<string, unknown>;
+
+/** Accumulated metrics across API calls. */
+interface SessionAccumulator {
+  transcript: TranscriptEntry[];
+  tokenUsage: { inputTokens: number; outputTokens: number };
+  providerSessionId?: string;
+}
+
+// ── Tool conversion ─────────────────────────────────────────────────
+
+/**
+ * Convert ResolvedTool array to OpenAI function tool format.
+ *
+ * Uses z.toJSONSchema() to convert Zod params schema to JSON Schema.
+ *
+ * @internal Exported for testing only.
+ */
+export function convertTools(tools: ResolvedTool[]): ToolDef[] {
+  return tools.map((rt) => ({
+    type: 'function' as const,
+    function: {
+      name: rt.definition.name,
+      description: rt.definition.description,
+      parameters: z.toJSONSchema(rt.definition.params) as Record<string, unknown>,
+    },
+  }));
+}
+
+// ── Output extraction ───────────────────────────────────────────────
+
+/**
+ * Extract the output text from the last assistant message with no tool_calls.
+ *
+ * Walks the messages array backwards to find the last assistant message
+ * that is a "final" response (no pending tool calls).
+ *
+ * @internal Exported for testing only.
+ */
+export function extractOutput(messages: ChatMessage[]): string | undefined {
+  for (let i = messages.length - 1; i >= 0; i--) {
+    const msg = messages[i]!;
+    if (msg.role !== 'assistant') continue;
+    if (msg.tool_calls && msg.tool_calls.length > 0) continue;
+    if (msg.content) return msg.content;
+  }
+  return undefined;
+}
+
+// ── SSE parsing ─────────────────────────────────────────────────────
+
+/**
+ * Parse SSE data lines from a buffer, invoking handler for each parsed data value.
+ * Returns the remaining incomplete buffer.
+ *
+ * @internal Exported for testing only.
+ */
+export function parseSseLines(buffer: string, handler: (data: string) => void): string {
+  let idx: number;
+  while ((idx = buffer.indexOf('\n')) !== -1) {
+    const line = buffer.slice(0, idx).trim();
+    buffer = buffer.slice(idx + 1);
+    if (line.startsWith('data: ')) {
+      const data = line.slice(6);
+      if (data === '[DONE]') continue;
+      handler(data);
+    }
+  }
+  return buffer;
+}
+
+// ── API helpers ─────────────────────────────────────────────────────
+
+/**
+ * Make a non-streaming API call and return the parsed response.
+ *
+ * @throws When the HTTP response is not ok, with the status and body.
+ */
+async function callApi(
+  apiEndpoint: string,
+  token: string,
+  model: string,
+  messages: ChatMessage[],
+  apiTools: ToolDef[],
+): Promise<ChatCompletionResponse> {
+  const response = await fetch(`${apiEndpoint}/chat/completions`, {
+    method: 'POST',
+    headers: {
+      'Content-Type': 'application/json',
+      'Authorization': `Bearer ${token}`,
+    },
+    body: JSON.stringify({
+      model,
+      messages,
+      ...(apiTools.length > 0 ? { tools: apiTools } : {}),
+      stream: false,
+    }),
+  });
+
+  if (!response.ok) {
+    const body = await response.text();
+    throw new Error(`GitHub Models API error: ${response.status} ${body}`);
+  }
+
+  return response.json() as Promise<ChatCompletionResponse>;
+}
+
+/**
+ * Make a streaming API call, yielding chunks and returning the accumulated assistant message.
+ *
+ * Parses SSE events, yields SessionChunk objects in real time, and accumulates
+ * tool call fragments across delta chunks. Returns the fully assembled assistant
+ * message and final usage info.
+ */
+async function* callApiStreaming(
+  apiEndpoint: string,
+  token: string,
+  model: string,
+  messages: ChatMessage[],
+  apiTools: ToolDef[],
+  acc: SessionAccumulator,
+): AsyncGenerator<SessionChunk, ChatMessage, undefined> {
+  const response = await fetch(`${apiEndpoint}/chat/completions`, {
+    method: 'POST',
+    headers: {
+      'Content-Type': 'application/json',
+      'Authorization': `Bearer ${token}`,
+    },
+    body: JSON.stringify({
+      model,
+      messages,
+      ...(apiTools.length > 0 ? { tools: apiTools } : {}),
+      stream: true,
+      stream_options: { include_usage: true },
+    }),
+  });
+
+  if (!response.ok) {
+    const body = await response.text();
+    throw new Error(`GitHub Models API error: ${response.status} ${body}`);
+  }
+
+  if (!response.body) {
+    throw new Error('GitHub Models API error: no response body for streaming request');
+  }
+
+  // Accumulate tool call fragments keyed by index
+  const toolCallFragments = new Map<number, { id: string; name: string; arguments: string }>();
+  let textContent = '';
+  let lastId = '';
+  let buffer = '';
+
+  const reader = response.body.getReader();
+  const decoder = new TextDecoder();
+
+  try {
+    while (true) {
+      const { done, value } = await reader.read();
+      if (done) break;
+
+      buffer += decoder.decode(value, { stream: true });
+
+      // Process complete SSE lines
+      const chunks: ChatCompletionChunk[] = [];
+      buffer = parseSseLines(buffer, (data) => {
+        try {
+          chunks.push(JSON.parse(data) as ChatCompletionChunk);
+        } catch {
+          // Skip malformed JSON
+        }
+      });
+
+      for (const chunk of chunks) {
+        if (chunk.id) lastId = chunk.id;
+
+        // Accumulate usage from the final chunk (stream_options.include_usage)
+        if (chunk.usage) {
+          acc.tokenUsage.inputTokens += chunk.usage.prompt_tokens;
+          acc.tokenUsage.outputTokens += chunk.usage.completion_tokens;
+        }
+
+        const choice = chunk.choices[0];
+        if (!choice) continue;
+
+        const delta = choice.delta;
+
+        // Text content delta
+        if (delta.content != null && delta.content !== '') {
+          textContent += delta.content;
+          process.stderr.write(delta.content);
+          yield { type: 'text', text: delta.content };
+        }
+
+        // Tool call deltas — accumulate by index
+        if (delta.tool_calls) {
+          for (const tc of delta.tool_calls) {
+            const existing = toolCallFragments.get(tc.index);
+            if (!existing) {
+              // First fragment for this tool call — must have id and name
+              const frag = {
+                id: tc.id ?? '',
+                name: tc.function?.name ?? '',
+                arguments: tc.function?.arguments ?? '',
+              };
+              toolCallFragments.set(tc.index, frag);
+              if (frag.name) {
+                yield { type: 'tool_use', tool: frag.name };
+              }
+            } else {
+              // Subsequent fragment — accumulate arguments and fill in missing fields
+              if (tc.id && !existing.id) existing.id = tc.id;
+              if (tc.function?.name && !existing.name) {
+                existing.name = tc.function.name;
+                yield { type: 'tool_use', tool: existing.name };
+              }
+              if (tc.function?.arguments) existing.arguments += tc.function.arguments;
+            }
+          }
+        }
+      }
+    }
+  } finally {
+    reader.releaseLock();
+  }
+
+  if (lastId) acc.providerSessionId = lastId;
+
+  // Reconstruct the full assistant message from accumulated deltas
+  const toolCalls: ToolCall[] = [];
+  for (const [, frag] of toolCallFragments) {
+    toolCalls.push({
+      id: frag.id,
+      type: 'function',
+      function: { name: frag.name, arguments: frag.arguments },
+    });
+  }
+
+  const assistantMsg: ChatMessage = {
+    role: 'assistant',
+    content: textContent || null,
+    ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
+  };
+
+  return assistantMsg;
+}
+
+// ── Agentic loop (non-streaming) ────────────────────────────────────
+
+/**
+ * Run the full agentic tool-call loop without streaming.
+ *
+ * Makes API calls, executes tools, sends results back, and repeats until
+ * the model returns a response with no tool_calls or the iteration limit.
+ */
+async function runAgenticLoop(
+  apiEndpoint: string,
+  token: string,
+  model: string,
+  messages: ChatMessage[],
+  apiTools: ToolDef[],
+  toolMap: Map<string, ResolvedTool>,
+  maxRounds: number,
+  acc: SessionAccumulator,
+): Promise<void> {
+  // Make the initial API call
+  let apiResponse = await callApi(apiEndpoint, token, model, messages, apiTools);
+
+  acc.tokenUsage.inputTokens += apiResponse.usage?.prompt_tokens ?? 0;
+  acc.tokenUsage.outputTokens += apiResponse.usage?.completion_tokens ?? 0;
+  acc.providerSessionId = apiResponse.id;
+
+  const firstChoice = apiResponse.choices[0];
+  if (!firstChoice) return;
+
+  let assistantMsg: ChatMessage = {
+    role: 'assistant',
+    content: firstChoice.message.content,
+    ...(firstChoice.message.tool_calls && firstChoice.message.tool_calls.length > 0
+      ? { tool_calls: firstChoice.message.tool_calls }
+      : {}),
+  };
+  messages.push(assistantMsg);
+  acc.transcript.push(assistantMsg as TranscriptEntry);
+
+  let round = 0;
+
+  while (
+    assistantMsg.tool_calls &&
+    assistantMsg.tool_calls.length > 0 &&
+    round < maxRounds
+  ) {
+    round++;
+
+    // Execute each tool call and collect results
+    for (const toolCall of assistantMsg.tool_calls) {
+      const toolResult = await executeToolCall(toolCall, toolMap);
+      const toolMsg: ChatMessage = {
+        role: 'tool',
+        content: toolResult,
+        tool_call_id: toolCall.id,
+      };
+      messages.push(toolMsg);
+      acc.transcript.push(toolMsg as TranscriptEntry);
+    }
+
+    // Make the next API call with tool results
+    apiResponse = await callApi(apiEndpoint, token, model, messages, apiTools);
+
+    acc.tokenUsage.inputTokens += apiResponse.usage?.prompt_tokens ?? 0;
+    acc.tokenUsage.outputTokens += apiResponse.usage?.completion_tokens ?? 0;
+    acc.providerSessionId = apiResponse.id;
+
+    const choice = apiResponse.choices[0];
+    if (!choice) break;
+
+    assistantMsg = {
+      role: 'assistant',
+      content: choice.message.content,
+      ...(choice.message.tool_calls && choice.message.tool_calls.length > 0
+        ? { tool_calls: choice.message.tool_calls }
+        : {}),
+    };
+    messages.push(assistantMsg);
+    acc.transcript.push(assistantMsg as TranscriptEntry);
+  }
+}
+
+/**
+ * Run the full agentic tool-call loop with streaming.
+ *
+ * Yields chunks from each API call, executes tools, sends results back.
+ */
+async function* runAgenticLoopStreaming(
+  apiEndpoint: string,
+  token: string,
+  model: string,
+  messages: ChatMessage[],
+  apiTools: ToolDef[],
+  toolMap: Map<string, ResolvedTool>,
+  maxRounds: number,
+  acc: SessionAccumulator,
+): AsyncGenerator<SessionChunk, void, undefined> {
+  // Make the initial streaming API call
+  const gen = callApiStreaming(apiEndpoint, token, model, messages, apiTools, acc);
+  let assistantMsg: ChatMessage;
+
+  // Yield chunks from the generator and capture the return value
+  while (true) {
+    const result = await gen.next();
+    if (result.done) {
+      assistantMsg = result.value;
+      break;
+    }
+    yield result.value;
+  }
+
+  messages.push(assistantMsg);
+  acc.transcript.push(assistantMsg as TranscriptEntry);
+
+  let round = 0;
+
+  while (
+    assistantMsg.tool_calls &&
+    assistantMsg.tool_calls.length > 0 &&
+    round < maxRounds
+  ) {
+    round++;
+
+    // Execute each tool call and collect results
+    for (const toolCall of assistantMsg.tool_calls) {
+      const toolResult = await executeToolCall(toolCall, toolMap);
+      const toolMsg: ChatMessage = {
+        role: 'tool',
+        content: toolResult,
+        tool_call_id: toolCall.id,
+      };
+      messages.push(toolMsg);
+      acc.transcript.push(toolMsg as TranscriptEntry);
+      yield { type: 'tool_result', tool: toolCall.id };
+    }
+
+    // Make the next streaming API call
+    const nextGen = callApiStreaming(apiEndpoint, token, model, messages, apiTools, acc);
+    while (true) {
+      const result = await nextGen.next();
+      if (result.done) {
+        assistantMsg = result.value;
+        break;
+      }
+      yield result.value;
+    }
+
+    messages.push(assistantMsg);
+    acc.transcript.push(assistantMsg as TranscriptEntry);
+  }
+}
+
+// ── Tool execution ─────────────────────────────────────────────────
+
+/**
+ * Execute a single tool call and return the result string.
+ *
+ * Catches all errors and returns them as error strings rather than
+ * propagating — the model receives the error and may retry or recover.
+ */
+async function executeToolCall(
+  toolCall: ToolCall,
+  toolMap: Map<string, ResolvedTool>,
+): Promise<string> {
+  const tool = toolMap.get(toolCall.function.name);
+  if (!tool) {
+    return `Error: Unknown tool: ${toolCall.function.name}`;
+  }
+
+  try {
+    const args = JSON.parse(toolCall.function.arguments) as unknown;
+    const parsed = tool.definition.params.parse(args);
+    const rawResult = await tool.definition.handler(parsed);
+    if (typeof rawResult === 'string') return rawResult;
+    return JSON.stringify(rawResult, null, 2);
+  } catch (err) {
+    const message = err instanceof Error ? err.message : String(err);
+    return `Error: ${message}`;
+  }
+}
+
+// ── Provider implementation ──────────────────────────────────────────
+
+/**
+ * Create the Copilot session provider apparatus.
+ *
+ * The apparatus reads CopilotConfig from guild config at start() time
+ * and provides an AnimatorSessionProvider backed by the GitHub Models API.
+ */
+export function createCopilotProvider(): Plugin {
+  let config: CopilotConfig = {};
+
+  const provider: AnimatorSessionProvider = {
+    name: 'copilot',
+
+    launch(sessionConfig: SessionProviderConfig): {
+      chunks: AsyncIterable<SessionChunk>;
+      result: Promise<SessionProviderResult>;
+    } {
+      // Resolve config values with defaults
+      const apiEndpoint = (config.apiEndpoint ?? 'https://models.inference.ai.azure.com').replace(/\/$/, '');
+      const tokenEnvVar = config.tokenEnvVar ?? 'GITHUB_TOKEN';
+      const maxRounds = config.maxToolRounds ?? 50;
+
+      const acc: SessionAccumulator = {
+        transcript: [],
+        tokenUsage: { inputTokens: 0, outputTokens: 0 },
+      };
+
+      // Build initial messages from config
+      const messages: ChatMessage[] = [];
+      if (sessionConfig.systemPrompt) {
+        const systemMsg: ChatMessage = { role: 'system', content: sessionConfig.systemPrompt };
+        messages.push(systemMsg);
+        acc.transcript.push(systemMsg as TranscriptEntry);
+      }
+      if (sessionConfig.initialPrompt) {
+        const userMsg: ChatMessage = { role: 'user', content: sessionConfig.initialPrompt };
+        messages.push(userMsg);
+        acc.transcript.push(userMsg as TranscriptEntry);
+      }
+
+      // Convert tools
+      const tools = sessionConfig.tools ?? [];
+      const apiTools = convertTools(tools);
+      const toolMap = new Map<string, ResolvedTool>(
+        tools.map((rt) => [rt.definition.name, rt]),
+      );
+
+      if (sessionConfig.streaming) {
+        // ── Streaming mode ────────────────────────────────────────────
+        // Use a push queue + resolve callback to bridge the async generator
+        // into a pull-based async iterable.
+
+        const chunkQueue: SessionChunk[] = [];
+        let chunkResolve: (() => void) | null = null;
+        let done = false;
+        let streamError: Error | null = null;
+
+        const result: Promise<SessionProviderResult> = (async () => {
+          // Validate token
+          const token = process.env[tokenEnvVar];
+          if (!token) {
+            throw new Error(
+              `Copilot session provider requires a GitHub token. ` +
+              `Set the ${tokenEnvVar} environment variable.`,
+            );
+          }
+
+          try {
+            const gen = runAgenticLoopStreaming(
+              apiEndpoint, token, sessionConfig.model, messages, apiTools, toolMap, maxRounds, acc,
+            );
+
+            for await (const chunk of gen) {
+              chunkQueue.push(chunk);
+              // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
+              const notify = chunkResolve as (() => void) | null;
+              chunkResolve = null;
+              notify?.();
+            }
+
+            return {
+              status: 'completed' as const,
+              exitCode: 0,
+              providerSessionId: acc.providerSessionId,
+              tokenUsage: acc.tokenUsage,
+              costUsd: undefined,
+              transcript: acc.transcript,
+              output: extractOutput(messages),
+            };
+          } catch (err) {
+            const message = err instanceof Error ? err.message : String(err);
+            streamError = err instanceof Error ? err : new Error(message);
+            return {
+              status: 'failed' as const,
+              exitCode: 1,
+              error: message,
+              transcript: acc.transcript,
+              tokenUsage: acc.tokenUsage.inputTokens > 0 ? acc.tokenUsage : undefined,
+            };
+          } finally {
+            done = true;
+            // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
+            const notify = chunkResolve as (() => void) | null;
+            chunkResolve = null;
+            notify?.();
+          }
+        })();
+
+        // Async iterable that drains the chunk queue, pausing between batches
+        const chunks: AsyncIterable<SessionChunk> = {
+          [Symbol.asyncIterator]() {
+            return {
+              async next(): Promise<IteratorResult<SessionChunk>> {
+                while (true) {
+                  if (chunkQueue.length > 0) {
+                    return { value: chunkQueue.shift()!, done: false };
+                  }
+                  if (done || streamError) {
+                    return { value: undefined as unknown as SessionChunk, done: true };
+                  }
+                  await new Promise<void>((resolve) => { chunkResolve = resolve; });
+                }
+              },
+            };
+          },
+        };
+
+        return { chunks, result };
+      }
+
+      // ── Non-streaming mode ─────────────────────────────────────────
+      // Chunks iterable is immediately done; all work happens in result.
+
+      const emptyChunks: AsyncIterable<SessionChunk> = {
+        [Symbol.asyncIterator]() {
+          return {
+            next(): Promise<IteratorResult<SessionChunk>> {
+              return Promise.resolve({ value: undefined as unknown as SessionChunk, done: true });
+            },
+          };
+        },
+      };
+
+      const result: Promise<SessionProviderResult> = (async () => {
+        // Validate token
+        const token = process.env[tokenEnvVar];
+        if (!token) {
+          throw new Error(
+            `Copilot session provider requires a GitHub token. ` +
+            `Set the ${tokenEnvVar} environment variable.`,
+          );
+        }
+
+        try {
+          await runAgenticLoop(
+            apiEndpoint, token, sessionConfig.model, messages, apiTools, toolMap, maxRounds, acc,
+          );
+
+          return {
+            status: 'completed' as const,
+            exitCode: 0,
+            providerSessionId: acc.providerSessionId,
+            tokenUsage: acc.tokenUsage,
+            costUsd: undefined,
+            transcript: acc.transcript,
+            output: extractOutput(messages),
+          };
+        } catch (err) {
+          const message = err instanceof Error ? err.message : String(err);
+          return {
+            status: 'failed' as const,
+            exitCode: 1,
+            error: message,
+            transcript: acc.transcript,
+            tokenUsage: acc.tokenUsage.inputTokens > 0 ? acc.tokenUsage : undefined,
+          };
+        }
+      })();
+
+      return { chunks: emptyChunks, result };
+    },
+  };
+
+  return {
+    apparatus: {
+      requires: [],
+      provides: provider,
+
+      start(_ctx: StartupContext): void {
+        config = guild().guildConfig().copilot ?? {};
+      },
+    },
+  };
+}
+
+export default createCopilotProvider();
diff --git a/packages/plugins/copilot/tsconfig.json b/packages/plugins/copilot/tsconfig.json
new file mode 100644
index 0000000..4229950
--- /dev/null
+++ b/packages/plugins/copilot/tsconfig.json
@@ -0,0 +1,13 @@
+{
+  "extends": "../../../tsconfig.json",
+  "compilerOptions": {
+    "outDir": "dist",
+    "rootDir": "src"
+  },
+  "include": [
+    "src"
+  ],
+  "exclude": [
+    "src/**/*.test.ts"
+  ]
+}
diff --git a/pnpm-lock.yaml b/pnpm-lock.yaml
index a0c2709..31b3221 100644
--- a/pnpm-lock.yaml
+++ b/pnpm-lock.yaml
@@ -132,6 +132,25 @@ importers:
         specifier: 25.5.0
         version: 25.5.0
 
+  packages/plugins/copilot:
+    dependencies:
+      '@shardworks/animator-apparatus':
+        specifier: workspace:*
+        version: link:../animator
+      '@shardworks/nexus-core':
+        specifier: workspace:*
+        version: link:../../framework/core
+      '@shardworks/tools-apparatus':
+        specifier: workspace:*
+        version: link:../tools
+      zod:
+        specifier: 4.3.6
+        version: 4.3.6
+    devDependencies:
+      '@types/node':
+        specifier: 25.5.0
+        version: 25.5.0
+
   packages/plugins/fabricator:
     dependencies:
       '@shardworks/nexus-core':

```

## Full File Contents (for context)

=== FILE: docs/architecture/apparatus/copilot.md ===
# The Copilot Session Provider — API Contract

Status: **Draft — MVP**

Package: `@shardworks/copilot-apparatus` · Plugin id: `copilot`

> **⚠️ MVP scope.** This spec covers the session provider implementation: calling the GitHub Models REST API, running an in-process agentic tool-call loop, streaming via SSE, and reporting structured results back to The Animator. Conversation resume (`conversationId`) is not supported.

---

## Purpose

The Copilot apparatus is a **session provider** — a pluggable backend that The Animator delegates to for launching and communicating with a specific AI system. It implements `AnimatorSessionProvider` from `@shardworks/animator-apparatus` and is discovered via guild config:

```json
{
  "animator": {
    "sessionProvider": "copilot"
  }
}
```

The apparatus calls the GitHub Models REST API (OpenAI-compatible chat completions endpoint), runs an in-process agentic tool-call loop when tools are supplied, and delivers streaming output via SSE. Unlike the Claude Code provider, it spawns no subprocess and requires no MCP server — tool handlers are called directly in-process.

---

## Dependencies

```
requires: []
```

The Copilot apparatus has no apparatus dependencies. It implements `AnimatorSessionProvider` (imported as a type from `@shardworks/animator-apparatus`) but does not call The Animator at runtime — the relationship is reversed: The Animator calls the provider.

Tool definitions and resolved tools are imported from `@shardworks/tools-apparatus` as compile-time type dependencies only. No MCP SDK is required.

---

## `AnimatorSessionProvider` Implementation (`provides`)

The apparatus provides an implementation of `AnimatorSessionProvider`:

```typescript
interface AnimatorSessionProvider {
  name: 'copilot';
  launch(config: SessionProviderConfig): {
    chunks: AsyncIterable<SessionChunk>;
    result: Promise<SessionProviderResult>;
  };
}
```

A single `launch()` method handles both streaming and non-streaming sessions. When `config.streaming` is true, the provider uses the streaming API and yields `SessionChunk` objects in real time. When false, it accumulates all output internally and returns empty chunks. The return shape is always `{ chunks, result }`.

The apparatus reads `CopilotConfig` from `guild().guildConfig().copilot` in `start()` and caches it as a closure variable for use in `launch()`.

---

## Session Lifecycle

```
launch(config)
  │
  ├─ 1. Resolve config: apiEndpoint, tokenEnvVar, maxRounds
  ├─ 2. Validate token from process.env[tokenEnvVar]
  │     └─ Throw if missing or empty
  ├─ 3. Build initial messages array:
  │     ├─ { role: 'system', content: systemPrompt }  (if present)
  │     └─ { role: 'user', content: initialPrompt }   (if present)
  ├─ 4. Convert tools to OpenAI format (z.toJSONSchema for params)
  ├─ 5. Build toolMap: Map<name, ResolvedTool> for O(1) lookup
  ├─ 6. Make initial API call (streaming or non-streaming)
  └─ 7. Enter agentic loop:
        ├─ If no tool_calls on last assistant message → break
        ├─ If round >= maxRounds → break
        ├─ Execute each tool call (catch errors → tool result message)
        ├─ Append tool result messages to messages + transcript
        └─ Make next API call → repeat
```

---

## Agentic Tool-Call Loop

The provider implements an in-process tool-call loop. This differs from the Claude Code provider, which delegates tool execution to the `claude` CLI via MCP.

```
round = 0

loop:
  check assistant message tool_calls
  if none → exit loop
  if round >= maxRounds → exit loop (safety valve)
  round++

  for each tool_call:
    look up tool by name in toolMap
    if not found → result = "Error: Unknown tool: {name}"
    else:
      try:
        args = JSON.parse(tool_call.function.arguments)
        parsed = tool.definition.params.parse(args)
        rawResult = await tool.definition.handler(parsed)
        result = rawResult (string) or JSON.stringify(rawResult)
      catch err:
        result = "Error: {err.message}"

    append { role: 'tool', content: result, tool_call_id } to messages + transcript
    if streaming: yield { type: 'tool_result', tool: tool_call_id }

  make next API call (streaming or non-streaming)
  process response → loop
```

Tool handler errors are caught and returned as tool result messages — the model receives the error description and may retry, clarify, or recover. The session does not fail.

When `maxRounds` is reached, the loop exits and the session completes normally (`status: 'completed'`, `exitCode: 0`) using the last available assistant response. The limit is a safety valve, not an error condition.

---

## Streaming

When `config.streaming` is true, the provider:

1. Makes API calls with `stream: true` and `stream_options: { include_usage: true }`.
2. Reads `response.body` as a `ReadableStream`, decodes with `TextDecoder`, and parses SSE `data:` lines.
3. Yields `SessionChunk` objects in real time:
   - `{ type: 'text', text }` — text content delta (also written to stderr for terminal visibility)
   - `{ type: 'tool_use', tool: name }` — when a tool call's name is first seen in a delta
   - `{ type: 'tool_result', tool: toolCallId }` — after each tool call is executed
4. Accumulates tool call fragments by index across deltas to reconstruct the full tool call.
5. Extracts usage from the final streaming chunk (via `stream_options.include_usage`).
6. Streaming continues throughout the agentic loop — chunks stream during each API call, pause during tool execution, and resume on the next call.

The streaming chunk delivery mechanism uses a push queue + resolve callback pattern, bridging the async generator (SSE events) into a pull-based async iterable compatible with `for await...of` consumers.

---

## Token Usage

The provider accumulates token usage across all API calls in the session:

```
tokenUsage.inputTokens  += response.usage.prompt_tokens     (each call)
tokenUsage.outputTokens += response.usage.completion_tokens (each call)
```

For streaming, usage is included in the final SSE chunk via `stream_options: { include_usage: true }`. For non-streaming, usage is in the response body's `usage` field.

`costUsd` is always `undefined` — the GitHub Models API does not report per-call costs.

---

## Result Construction

After the loop exits:

- `status: 'completed'`, `exitCode: 0` on success.
- `status: 'failed'`, `exitCode: 1` on API error or network failure — with `error` containing the message.
- `providerSessionId` = `id` field from the last API response.
- `output` = content of the last assistant message with no `tool_calls` (walking backwards).
- `transcript` = full message array built during the session (system, user, assistant, tool messages).

---

## Configuration

Plugin configuration in `guild.json`:

```json
{
  "copilot": {
    "apiEndpoint": "https://models.inference.ai.azure.com",
    "tokenEnvVar": "GITHUB_TOKEN",
    "maxToolRounds": 50
  }
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `apiEndpoint` | `string` | `https://models.inference.ai.azure.com` | Base URL for the chat completions API |
| `tokenEnvVar` | `string` | `GITHUB_TOKEN` | Environment variable name holding the Bearer token |
| `maxToolRounds` | `number` | `50` | Maximum agentic tool-call iterations before stopping |

All fields are optional — defaults apply when absent or when `guild.json` has no `copilot` section.

The token is read from `process.env[tokenEnvVar]` at `launch()` time. When the env var is missing or empty, `launch()` throws synchronously (inside the result promise) with a message naming the expected variable.

The model comes from `SessionProviderConfig.model`, passed through from The Animator's guild settings resolution. The `copilot` config section does not set a model default.

---

## Ignored Config Fields

The following `SessionProviderConfig` fields are intentionally ignored:

| Field | Reason |
|-------|--------|
| `conversationId` | Conversation resume not supported by the GitHub Models API in this implementation |
| `cwd` | No subprocess is spawned |
| `environment` | No subprocess is spawned; environment variables are not injected into API calls |

---

## Open Questions

- **Conversation resume.** The GitHub Models API is stateless (no server-side history). Resume could be implemented by storing and re-sending the full message history, but this requires Stacks integration and is deferred to a future iteration.

- **`callableBy` filtering.** The claude-code provider filters tools by `callableBy: ['anima']` in its MCP server. The copilot provider currently passes all tools through. Should it apply the same filter? Likely yes — needs confirmation.

---

## Future: Conversation Resume

Multi-turn conversation support could be added by storing the full message array in The Stacks alongside the session transcript, then reloading it when `conversationId` is provided. The API call would include the full message history, effectively resuming the conversation.

---

## Implementation Notes

- **No MCP server.** The copilot provider calls tool handlers directly in-process, unlike claude-code which routes tool calls through an HTTP MCP server. This is simpler because the provider owns the full request/response cycle.
- **SSE `[DONE]` sentinel.** The GitHub Models streaming API follows the OpenAI convention of sending `data: [DONE]` as the final SSE line. The parser skips this sentinel.
- **Trailing slash handling.** The `apiEndpoint` has trailing slashes stripped before use to avoid double-slash URLs in the fetch call.
- **`z.toJSONSchema`.** Requires Zod 4.x. The `z.toJSONSchema()` function converts a Zod schema to a JSON Schema object for inclusion in the OpenAI tools array.

=== FILE: packages/plugins/copilot/package.json ===
{
  "name": "@shardworks/copilot-apparatus",
  "version": "0.0.0",
  "license": "ISC",
  "repository": {
    "type": "git",
    "url": "https://github.com/shardworks/nexus",
    "directory": "packages/plugins/copilot"
  },
  "description": "Copilot session provider apparatus — launches sessions via the GitHub Models API",
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
    "@shardworks/animator-apparatus": "workspace:*",
    "@shardworks/nexus-core": "workspace:*",
    "@shardworks/tools-apparatus": "workspace:*",
    "zod": "4.3.6"
  },
  "devDependencies": {
    "@types/node": "25.5.0"
  },
  "files": [
    "dist"
  ],
  "publishConfig": {
    "exports": {
      ".": {
        "types": "./dist/index.d.ts",
        "import": "./dist/index.js"
      }
    }
  }
}

=== FILE: packages/plugins/copilot/src/index.test.ts ===
/**
 * Tests for the Copilot session provider apparatus.
 *
 * Uses Node's built-in test runner and mocks globalThis.fetch to avoid
 * real network calls. Covers all requirements specified in the plan.
 */

import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import { z } from 'zod';

import {
  createCopilotProvider,
  convertTools,
  extractOutput,
  parseSseLines,
} from './index.ts';

import type { CopilotConfig } from './index.ts';
import type { SessionProviderConfig } from '@shardworks/animator-apparatus';
import type { ResolvedTool } from '@shardworks/tools-apparatus';

// ── Test helpers ────────────────────────────────────────────────────

/** Build a minimal SessionProviderConfig for testing. */
function makeConfig(overrides: Partial<SessionProviderConfig> = {}): SessionProviderConfig {
  return {
    model: 'gpt-4o',
    cwd: '/tmp',
    ...overrides,
  };
}

/** Build a minimal ResolvedTool for testing. */
function makeTool(
  name: string,
  handler: (params: Record<string, unknown>) => unknown = () => 'tool result',
): ResolvedTool {
  return {
    definition: {
      name,
      description: `Tool ${name}`,
      params: z.object({ input: z.string().optional() }),
      handler: handler as (params: unknown) => unknown,
    },
    pluginId: 'test',
  };
}

/** Build a non-streaming ChatCompletionResponse. */
function makeApiResponse(
  content: string | null,
  options: {
    id?: string;
    toolCalls?: Array<{ id: string; name: string; args: string }>;
    promptTokens?: number;
    completionTokens?: number;
  } = {},
) {
  const id = options.id ?? 'chatcmpl-test123';
  return {
    id,
    choices: [
      {
        message: {
          role: 'assistant' as const,
          content,
          ...(options.toolCalls
            ? {
                tool_calls: options.toolCalls.map((tc) => ({
                  id: tc.id,
                  type: 'function' as const,
                  function: { name: tc.name, arguments: tc.args },
                })),
              }
            : {}),
        },
        finish_reason: options.toolCalls ? 'tool_calls' : 'stop',
      },
    ],
    usage: {
      prompt_tokens: options.promptTokens ?? 100,
      completion_tokens: options.completionTokens ?? 50,
    },
  };
}

/** Build an SSE stream body from array of ChatCompletionChunk JSON objects. */
function makeSseStream(chunks: object[], done = true): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const lines: string[] = [];
  for (const chunk of chunks) {
    lines.push(`data: ${JSON.stringify(chunk)}\n`);
  }
  if (done) lines.push('data: [DONE]\n');
  const body = lines.join('');

  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(body));
      controller.close();
    },
  });
}

/** Mock global fetch. Returns a cleanup function that restores the original. */
function mockFetch(impl: typeof fetch): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = impl;
  return () => { globalThis.fetch = original; };
}

/** Collect all chunks from an async iterable. */
async function collectChunks<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of iterable) {
    items.push(item);
  }
  return items;
}

// ── Guild mock ──────────────────────────────────────────────────────

// We mock guild() to return a minimal GuildConfig. The apparatus reads
// guild().guildConfig().copilot in start(), which we call manually in tests.

let mockCopilotConfig: CopilotConfig = {};

// Patch guild module to return controlled config
import { setGuild } from '@shardworks/nexus-core';

// Set up a minimal mock guild before tests
function setupGuild(copilotConfig: CopilotConfig = {}) {
  mockCopilotConfig = copilotConfig;
  setGuild({
    home: '/tmp/test-guild',
    guildConfig: () => ({
      name: 'test-guild',
      nexus: '0.0.0',
      plugins: [],
      copilot: mockCopilotConfig,
    }),
    apparatus: <T>(_name: string): T => { throw new Error('not implemented'); },
    config: <T>(_pluginId: string): T => ({} as T),
    writeConfig: () => {},
    kits: () => [],
    apparatuses: () => [],
    failedPlugins: () => [],
  });
}

// ── Helper: create and start a provider ────────────────────────────

function createStartedProvider(copilotConfig: CopilotConfig = {}) {
  setupGuild(copilotConfig);
  const plugin = createCopilotProvider();
  if (!('apparatus' in plugin)) throw new Error('Expected apparatus plugin');
  plugin.apparatus.start({ on: () => {} });
  return plugin.apparatus.provides as import('@shardworks/animator-apparatus').AnimatorSessionProvider;
}

// ── Tests ───────────────────────────────────────────────────────────

describe('convertTools', () => {
  it('converts ResolvedTool array to OpenAI function tool format', () => {
    const tools = [
      makeTool('search'),
      makeTool('compute'),
    ];
    const result = convertTools(tools);

    assert.equal(result.length, 2);
    assert.equal(result[0]!.type, 'function');
    assert.equal(result[0]!.function.name, 'search');
    assert.equal(result[0]!.function.description, 'Tool search');
    assert.ok(typeof result[0]!.function.parameters === 'object');
    assert.equal(result[1]!.function.name, 'compute');
  });

  it('produces valid JSON Schema from Zod schema', () => {
    const tool = {
      ...makeTool('test'),
      definition: {
        ...makeTool('test').definition,
        params: z.object({
          query: z.string().describe('Search query'),
          limit: z.number().optional(),
        }),
      },
    };
    const [converted] = convertTools([tool]);
    const params = converted!.function.parameters;

    // Should be a JSON Schema object
    assert.equal((params as { type: string }).type, 'object');
    assert.ok('properties' in params);
  });

  it('returns empty array for empty input', () => {
    assert.deepEqual(convertTools([]), []);
  });
});

describe('extractOutput', () => {
  it('returns content of the last assistant message with no tool_calls', () => {
    const messages = [
      { role: 'system' as const, content: 'system prompt' },
      { role: 'user' as const, content: 'hello' },
      { role: 'assistant' as const, content: 'world' },
    ];
    assert.equal(extractOutput(messages), 'world');
  });

  it('skips assistant messages that have tool_calls', () => {
    const messages = [
      { role: 'user' as const, content: 'hello' },
      {
        role: 'assistant' as const,
        content: null,
        tool_calls: [{ id: 'c1', type: 'function' as const, function: { name: 'f', arguments: '{}' } }],
      },
      { role: 'tool' as const, content: 'result', tool_call_id: 'c1' },
      { role: 'assistant' as const, content: 'final answer' },
    ];
    assert.equal(extractOutput(messages), 'final answer');
  });

  it('returns undefined when no suitable assistant message exists', () => {
    const messages = [{ role: 'user' as const, content: 'hi' }];
    assert.equal(extractOutput(messages), undefined);
  });

  it('returns undefined when last assistant message has null content', () => {
    const messages = [
      { role: 'assistant' as const, content: null },
    ];
    assert.equal(extractOutput(messages), undefined);
  });
});

describe('parseSseLines', () => {
  it('parses data lines and calls handler', () => {
    const received: string[] = [];
    const remaining = parseSseLines(
      'data: {"hello":"world"}\ndata: {"foo":"bar"}\n',
      (d) => received.push(d),
    );
    assert.deepEqual(received, ['{"hello":"world"}', '{"foo":"bar"}']);
    assert.equal(remaining, '');
  });

  it('skips [DONE] sentinel', () => {
    const received: string[] = [];
    parseSseLines('data: {"text":"hi"}\ndata: [DONE]\n', (d) => received.push(d));
    assert.deepEqual(received, ['{"text":"hi"}']);
  });

  it('ignores non-data lines (empty, comments, event:)', () => {
    const received: string[] = [];
    parseSseLines('event: message\ndata: {"ok":true}\n: comment\n\n', (d) => received.push(d));
    assert.deepEqual(received, ['{"ok":true}']);
  });

  it('returns incomplete last line as remaining buffer', () => {
    const received: string[] = [];
    const remaining = parseSseLines('data: {"a":1}\ndata: {"b"', (d) => received.push(d));
    assert.deepEqual(received, ['{"a":1}']);
    assert.equal(remaining, 'data: {"b"');
  });
});

describe('createCopilotProvider', () => {
  it('returns a plugin with apparatus.provides having name "copilot"', () => {
    setupGuild();
    const plugin = createCopilotProvider();
    assert.ok('apparatus' in plugin);
    const provider = plugin.apparatus.provides as { name: string };
    assert.equal(provider.name, 'copilot');
  });

  it('reads copilot config from guild at start() time', () => {
    // Just verify start() doesn't throw; the config is used during launch()
    const provider = createStartedProvider({ tokenEnvVar: 'MY_TOKEN', maxToolRounds: 5 });
    assert.equal(provider.name, 'copilot');
  });
});

describe('launch() — missing token', () => {
  it('throws when the token env var is missing', async () => {
    const provider = createStartedProvider({ tokenEnvVar: 'MISSING_TOKEN_XYZ' });
    delete process.env['MISSING_TOKEN_XYZ'];

    const { result } = provider.launch(makeConfig());
    await assert.rejects(result, /MISSING_TOKEN_XYZ/);
  });

  it('uses GITHUB_TOKEN by default', async () => {
    const provider = createStartedProvider();
    const savedToken = process.env['GITHUB_TOKEN'];
    delete process.env['GITHUB_TOKEN'];

    const { result } = provider.launch(makeConfig());
    await assert.rejects(result, /GITHUB_TOKEN/);

    if (savedToken !== undefined) process.env['GITHUB_TOKEN'] = savedToken;
  });
});

describe('launch() — non-streaming single-turn', () => {
  let restoreToken: (() => void) | undefined;
  let restoreFetch: (() => void) | undefined;

  beforeEach(() => {
    process.env['GITHUB_TOKEN'] = 'test-token';
    restoreToken = () => { delete process.env['GITHUB_TOKEN']; };
  });

  afterEach(() => {
    restoreToken?.();
    restoreFetch?.();
  });

  it('happy path: single-turn completion with no tools', async () => {
    const apiResp = makeApiResponse('Hello from the model', {
      id: 'chatcmpl-abc123',
      promptTokens: 120,
      completionTokens: 30,
    });

    restoreFetch = mockFetch(async (url, opts) => {
      assert.ok(String(url).includes('/chat/completions'));
      const body = JSON.parse((opts as RequestInit).body as string) as Record<string, unknown>;
      assert.equal(body['model'], 'gpt-4o');
      assert.equal(body['stream'], false);
      assert.ok(!('tools' in body)); // No tools in request

      const msgs = body['messages'] as Array<{ role: string; content: string }>;
      assert.equal(msgs[0]!.role, 'system');
      assert.equal(msgs[0]!.content, 'You are a helpful assistant');
      assert.equal(msgs[1]!.role, 'user');
      assert.equal(msgs[1]!.content, 'Say hello');

      const headers = (opts as RequestInit).headers as Record<string, string>;
      assert.equal(headers['Authorization'], 'Bearer test-token');

      return new Response(JSON.stringify(apiResp), { status: 200 });
    });

    const provider = createStartedProvider();
    const { chunks, result } = provider.launch(makeConfig({
      systemPrompt: 'You are a helpful assistant',
      initialPrompt: 'Say hello',
    }));

    const chunkItems = await collectChunks(chunks);
    assert.equal(chunkItems.length, 0); // Non-streaming: no chunks

    const res = await result;
    assert.equal(res.status, 'completed');
    assert.equal(res.exitCode, 0);
    assert.equal(res.output, 'Hello from the model');
    assert.equal(res.providerSessionId, 'chatcmpl-abc123');
    assert.deepEqual(res.tokenUsage, { inputTokens: 120, outputTokens: 30 });
    assert.equal(res.costUsd, undefined);

    // Transcript: system, user, assistant
    assert.equal(res.transcript?.length, 3);
    assert.equal((res.transcript?.[0] as { role: string })?.role, 'system');
    assert.equal((res.transcript?.[1] as { role: string })?.role, 'user');
    assert.equal((res.transcript?.[2] as { role: string })?.role, 'assistant');
  });

  it('uses custom apiEndpoint from config', async () => {
    let capturedUrl = '';
    restoreFetch = mockFetch(async (url) => {
      capturedUrl = String(url);
      return new Response(JSON.stringify(makeApiResponse('ok')), { status: 200 });
    });

    const provider = createStartedProvider({ apiEndpoint: 'https://custom.endpoint.com' });
    const { result } = provider.launch(makeConfig({ initialPrompt: 'test' }));
    await result;

    assert.ok(capturedUrl.startsWith('https://custom.endpoint.com'));
  });

  it('ignores conversationId, cwd, and environment without errors', async () => {
    restoreFetch = mockFetch(async () =>
      new Response(JSON.stringify(makeApiResponse('ok')), { status: 200 }),
    );

    const provider = createStartedProvider();
    const { result } = provider.launch(makeConfig({
      conversationId: 'conv-123',
      cwd: '/some/path',
      environment: { FOO: 'bar' },
      initialPrompt: 'test',
    }));

    const res = await result;
    assert.equal(res.status, 'completed');
  });

  it('handles absent systemPrompt and initialPrompt', async () => {
    let capturedBody: Record<string, unknown> = {};
    restoreFetch = mockFetch(async (_, opts) => {
      capturedBody = JSON.parse((opts as RequestInit).body as string) as Record<string, unknown>;
      return new Response(JSON.stringify(makeApiResponse('ok')), { status: 200 });
    });

    const provider = createStartedProvider();
    const { result } = provider.launch(makeConfig());
    const res = await result;

    assert.equal(res.status, 'completed');
    assert.deepEqual(capturedBody['messages'], []); // Empty messages array
  });

  it('returns status: failed on HTTP error', async () => {
    restoreFetch = mockFetch(async () =>
      new Response('Unauthorized', { status: 401 }),
    );

    const provider = createStartedProvider();
    const { result } = provider.launch(makeConfig({ initialPrompt: 'hi' }));
    const res = await result;

    assert.equal(res.status, 'failed');
    assert.equal(res.exitCode, 1);
    assert.ok(res.error?.includes('401'));
  });

  it('returns status: failed on network failure (fetch throws)', async () => {
    restoreFetch = mockFetch(async () => {
      throw new Error('DNS resolution failed');
    });

    const provider = createStartedProvider();
    const { result } = provider.launch(makeConfig({ initialPrompt: 'hi' }));
    const res = await result;

    assert.equal(res.status, 'failed');
    assert.equal(res.exitCode, 1);
    assert.ok(res.error?.includes('DNS resolution failed'));
  });
});

describe('launch() — agentic tool-call loop', () => {
  let restoreToken: (() => void) | undefined;
  let restoreFetch: (() => void) | undefined;

  beforeEach(() => {
    process.env['GITHUB_TOKEN'] = 'test-token';
    restoreToken = () => { delete process.env['GITHUB_TOKEN']; };
  });

  afterEach(() => {
    restoreToken?.();
    restoreFetch?.();
  });

  it('happy path: tool-calling session with 2 API calls', async () => {
    const toolHandler = mock.fn((_params: unknown) => 'tool output from handler');
    const tool = makeTool('my-tool', toolHandler);

    let callCount = 0;
    restoreFetch = mockFetch(async (_, opts) => {
      callCount++;
      const body = JSON.parse((opts as RequestInit).body as string) as Record<string, unknown>;
      const messages = body['messages'] as Array<{ role: string }>;

      if (callCount === 1) {
        // First call: return a response with tool_calls
        return new Response(JSON.stringify(makeApiResponse(null, {
          id: 'chatcmpl-round1',
          toolCalls: [{ id: 'call-1', name: 'my-tool', args: '{"input":"test"}' }],
          promptTokens: 100,
          completionTokens: 10,
        })), { status: 200 });
      }

      // Second call: verify tool result is included, return final response
      assert.ok(messages.some((m) => m.role === 'tool'));
      return new Response(JSON.stringify(makeApiResponse('Final answer', {
        id: 'chatcmpl-round2',
        promptTokens: 150,
        completionTokens: 20,
      })), { status: 200 });
    });

    const provider = createStartedProvider();
    const { result } = provider.launch(makeConfig({
      initialPrompt: 'Use my-tool',
      tools: [tool],
    }));

    const res = await result;
    assert.equal(res.status, 'completed');
    assert.equal(res.exitCode, 0);
    assert.equal(res.output, 'Final answer');
    assert.equal(res.providerSessionId, 'chatcmpl-round2'); // Last response id
    assert.deepEqual(res.tokenUsage, { inputTokens: 250, outputTokens: 30 }); // Summed
    assert.equal(callCount, 2);
    assert.equal(toolHandler.mock.callCount(), 1);

    // Transcript: user, assistant(tool_calls), tool(result), assistant(final)
    assert.equal(res.transcript?.length, 4);
    assert.equal((res.transcript?.[0] as { role: string })?.role, 'user');
    assert.equal((res.transcript?.[1] as { role: string })?.role, 'assistant');
    assert.equal((res.transcript?.[2] as { role: string })?.role, 'tool');
    assert.equal((res.transcript?.[3] as { role: string })?.role, 'assistant');
  });

  it('includes tools array in API request when tools are provided', async () => {
    let capturedBody: Record<string, unknown> = {};
    restoreFetch = mockFetch(async (_, opts) => {
      capturedBody = JSON.parse((opts as RequestInit).body as string) as Record<string, unknown>;
      return new Response(JSON.stringify(makeApiResponse('done')), { status: 200 });
    });

    const provider = createStartedProvider();
    const { result } = provider.launch(makeConfig({
      tools: [makeTool('search'), makeTool('write')],
      initialPrompt: 'go',
    }));
    await result;

    const tools = capturedBody['tools'] as Array<{ type: string; function: { name: string } }>;
    assert.ok(Array.isArray(tools));
    assert.equal(tools.length, 2);
    assert.equal(tools[0]!.type, 'function');
    assert.equal(tools[0]!.function.name, 'search');
    assert.equal(tools[1]!.function.name, 'write');
  });

  it('handles tool handler error — sends error message back to model', async () => {
    const failingTool = makeTool('bad-tool', () => { throw new Error('database offline'); });

    let secondCallMessages: Array<{ role: string; content: string }> = [];
    let callCount = 0;
    restoreFetch = mockFetch(async (_, opts) => {
      callCount++;
      const body = JSON.parse((opts as RequestInit).body as string) as Record<string, unknown>;
      if (callCount === 1) {
        return new Response(JSON.stringify(makeApiResponse(null, {
          toolCalls: [{ id: 'call-err', name: 'bad-tool', args: '{}' }],
        })), { status: 200 });
      }
      secondCallMessages = body['messages'] as Array<{ role: string; content: string }>;
      return new Response(JSON.stringify(makeApiResponse('OK despite error')), { status: 200 });
    });

    const provider = createStartedProvider();
    const { result } = provider.launch(makeConfig({
      tools: [failingTool],
      initialPrompt: 'try bad-tool',
    }));

    const res = await result;
    assert.equal(res.status, 'completed'); // Session does NOT fail
    assert.equal(res.exitCode, 0);
    assert.equal(callCount, 2);

    // The tool result message should contain the error
    const toolMsg = secondCallMessages.find((m) => m.role === 'tool');
    assert.ok(toolMsg);
    assert.ok(toolMsg.content.includes('Error: database offline'));
  });

  it('handles unknown tool name — sends error message back to model', async () => {
    let secondCallMessages: Array<{ role: string; content: string }> = [];
    let callCount = 0;
    restoreFetch = mockFetch(async (_, opts) => {
      callCount++;
      const body = JSON.parse((opts as RequestInit).body as string) as Record<string, unknown>;
      if (callCount === 1) {
        return new Response(JSON.stringify(makeApiResponse(null, {
          toolCalls: [{ id: 'call-x', name: 'nonexistent-tool', args: '{}' }],
        })), { status: 200 });
      }
      secondCallMessages = body['messages'] as Array<{ role: string; content: string }>;
      return new Response(JSON.stringify(makeApiResponse('Handled unknown tool')), { status: 200 });
    });

    const provider = createStartedProvider();
    const { result } = provider.launch(makeConfig({
      tools: [makeTool('known-tool')],
      initialPrompt: 'try nonexistent',
    }));

    const res = await result;
    assert.equal(res.status, 'completed');

    const toolMsg = secondCallMessages.find((m) => m.role === 'tool');
    assert.ok(toolMsg?.content.includes('Unknown tool: nonexistent-tool'));
  });

  it('enforces maxToolRounds — stops after limit and completes normally', async () => {
    let callCount = 0;
    restoreFetch = mockFetch(async () => {
      callCount++;
      // Always return tool_calls to trigger more rounds
      return new Response(JSON.stringify(makeApiResponse(null, {
        id: `chatcmpl-round${callCount}`,
        toolCalls: [{ id: `call-${callCount}`, name: 'loop-tool', args: '{}' }],
      })), { status: 200 });
    });

    const provider = createStartedProvider({ maxToolRounds: 3 });
    const { result } = provider.launch(makeConfig({
      tools: [makeTool('loop-tool')],
      initialPrompt: 'loop forever',
    }));

    const res = await result;
    assert.equal(res.status, 'completed'); // Completes normally, not as failure
    assert.equal(res.exitCode, 0);
    // Initial call + 3 rounds = 4 total calls
    assert.equal(callCount, 4);
  });

  it('accumulates token usage across multiple rounds', async () => {
    let callCount = 0;
    restoreFetch = mockFetch(async () => {
      callCount++;
      if (callCount <= 3) {
        return new Response(JSON.stringify(makeApiResponse(null, {
          toolCalls: [{ id: `c${callCount}`, name: 'counter', args: '{}' }],
          promptTokens: 100,
          completionTokens: 50,
        })), { status: 200 });
      }
      return new Response(JSON.stringify(makeApiResponse('done', {
        promptTokens: 100,
        completionTokens: 50,
      })), { status: 200 });
    });

    const provider = createStartedProvider();
    const { result } = provider.launch(makeConfig({
      tools: [makeTool('counter')],
      initialPrompt: 'count',
    }));

    const res = await result;
    // 4 API calls × 100 input + 4 × 50 output = 400/200
    assert.deepEqual(res.tokenUsage, { inputTokens: 400, outputTokens: 200 });
    assert.equal(res.costUsd, undefined);
  });

  it('uses providerSessionId from the last API response', async () => {
    let callCount = 0;
    restoreFetch = mockFetch(async () => {
      callCount++;
      if (callCount === 1) {
        return new Response(JSON.stringify(makeApiResponse(null, {
          id: 'chatcmpl-first',
          toolCalls: [{ id: 'c1', name: 'tool', args: '{}' }],
        })), { status: 200 });
      }
      return new Response(JSON.stringify(makeApiResponse('done', { id: 'chatcmpl-last' })), { status: 200 });
    });

    const provider = createStartedProvider();
    const { result } = provider.launch(makeConfig({
      tools: [makeTool('tool')],
      initialPrompt: 'run tool',
    }));

    const res = await result;
    assert.equal(res.providerSessionId, 'chatcmpl-last');
  });
});

describe('launch() — streaming', () => {
  let restoreToken: (() => void) | undefined;
  let restoreFetch: (() => void) | undefined;

  beforeEach(() => {
    process.env['GITHUB_TOKEN'] = 'test-token';
    restoreToken = () => { delete process.env['GITHUB_TOKEN']; };
  });

  afterEach(() => {
    restoreToken?.();
    restoreFetch?.();
  });

  it('yields text chunks from streamed response', async () => {
    const streamChunks = [
      { id: 'chatcmpl-s1', choices: [{ delta: { content: 'Hello' }, finish_reason: null }], usage: null },
      { id: 'chatcmpl-s1', choices: [{ delta: { content: ' world' }, finish_reason: null }], usage: null },
      { id: 'chatcmpl-s1', choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 5 } },
    ];

    restoreFetch = mockFetch(async (_, opts) => {
      const body = JSON.parse((opts as RequestInit).body as string) as Record<string, unknown>;
      assert.equal(body['stream'], true);
      assert.ok((body['stream_options'] as Record<string, unknown>)?.['include_usage']);
      return new Response(makeSseStream(streamChunks), { status: 200 });
    });

    const provider = createStartedProvider();
    const { chunks, result } = provider.launch(makeConfig({
      streaming: true,
      initialPrompt: 'hi',
    }));

    const received = await collectChunks(chunks);
    const res = await result;

    assert.deepEqual(received, [
      { type: 'text', text: 'Hello' },
      { type: 'text', text: ' world' },
    ]);
    assert.equal(res.status, 'completed');
    assert.equal(res.output, 'Hello world');
    assert.deepEqual(res.tokenUsage, { inputTokens: 10, outputTokens: 5 });
  });

  it('yields tool_use chunk when tool call is streamed', async () => {
    const streamChunks = [
      {
        id: 'chatcmpl-t1',
        choices: [{
          delta: {
            tool_calls: [{ index: 0, id: 'call-123', type: 'function', function: { name: 'my-tool', arguments: '' } }],
          },
          finish_reason: null,
        }],
        usage: null,
      },
      {
        id: 'chatcmpl-t1',
        choices: [{
          delta: {
            tool_calls: [{ index: 0, function: { arguments: '{"input":"test"}' } }],
          },
          finish_reason: 'tool_calls',
        }],
        usage: null,
      },
      { id: 'chatcmpl-t1', choices: [{ delta: {}, finish_reason: null }], usage: { prompt_tokens: 20, completion_tokens: 10 } },
    ];

    let callCount = 0;
    restoreFetch = mockFetch(async () => {
      callCount++;
      if (callCount === 1) {
        return new Response(makeSseStream(streamChunks), { status: 200 });
      }
      // Second call: return text response
      const finalChunks = [
        { id: 'chatcmpl-t2', choices: [{ delta: { content: 'Tool done' }, finish_reason: null }], usage: null },
        { id: 'chatcmpl-t2', choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 30, completion_tokens: 15 } },
      ];
      return new Response(makeSseStream(finalChunks), { status: 200 });
    });

    const provider = createStartedProvider();
    const { chunks, result } = provider.launch(makeConfig({
      streaming: true,
      tools: [makeTool('my-tool')],
      initialPrompt: 'use my-tool',
    }));

    const received = await collectChunks(chunks);
    const res = await result;

    // Should have: tool_use chunk, tool_result chunk, text chunk
    const toolUseChunks = received.filter((c) => c.type === 'tool_use');
    const toolResultChunks = received.filter((c) => c.type === 'tool_result');
    const textChunks = received.filter((c) => c.type === 'text');

    assert.equal(toolUseChunks.length, 1);
    assert.equal((toolUseChunks[0] as { type: string; tool: string })?.tool, 'my-tool');
    assert.equal(toolResultChunks.length, 1);
    assert.equal((toolResultChunks[0] as { type: string; tool: string })?.tool, 'call-123');
    assert.equal(textChunks.length, 1);
    assert.equal((textChunks[0] as { type: string; text: string })?.text, 'Tool done');

    assert.equal(res.status, 'completed');
    // Token usage summed across both calls
    assert.deepEqual(res.tokenUsage, { inputTokens: 50, outputTokens: 25 });
  });

  it('returns failed result on streaming API error', async () => {
    restoreFetch = mockFetch(async () =>
      new Response('Forbidden', { status: 403 }),
    );

    const provider = createStartedProvider();
    const { chunks, result } = provider.launch(makeConfig({
      streaming: true,
      initialPrompt: 'hi',
    }));

    const received = await collectChunks(chunks);
    const res = await result;

    assert.equal(received.length, 0);
    assert.equal(res.status, 'failed');
    assert.equal(res.exitCode, 1);
    assert.ok(res.error?.includes('403'));
  });

  it('non-streaming returns empty chunks iterable', async () => {
    restoreFetch = mockFetch(async () =>
      new Response(JSON.stringify(makeApiResponse('done')), { status: 200 }),
    );

    const provider = createStartedProvider();
    const { chunks, result } = provider.launch(makeConfig({
      streaming: false,
      initialPrompt: 'hi',
    }));

    const received = await collectChunks(chunks);
    assert.equal(received.length, 0);

    const res = await result;
    assert.equal(res.status, 'completed');
  });
});

describe('config defaults', () => {
  let restoreToken: (() => void) | undefined;
  let restoreFetch: (() => void) | undefined;

  beforeEach(() => {
    process.env['GITHUB_TOKEN'] = 'test-token';
    restoreToken = () => { delete process.env['GITHUB_TOKEN']; };
  });

  afterEach(() => {
    restoreToken?.();
    restoreFetch?.();
  });

  it('uses default endpoint when copilot config is absent', async () => {
    let capturedUrl = '';
    restoreFetch = mockFetch(async (url) => {
      capturedUrl = String(url);
      return new Response(JSON.stringify(makeApiResponse('ok')), { status: 200 });
    });

    const provider = createStartedProvider(); // No copilot config
    const { result } = provider.launch(makeConfig({ initialPrompt: 'hi' }));
    await result;

    assert.ok(capturedUrl.startsWith('https://models.inference.ai.azure.com'));
  });

  it('uses default maxToolRounds of 50', async () => {
    let callCount = 0;
    restoreFetch = mockFetch(async () => {
      callCount++;
      // Always return tool_calls
      return new Response(JSON.stringify(makeApiResponse(null, {
        toolCalls: [{ id: `c${callCount}`, name: 't', args: '{}' }],
      })), { status: 200 });
    });

    const provider = createStartedProvider(); // No maxToolRounds config
    const { result } = provider.launch(makeConfig({
      tools: [makeTool('t')],
      initialPrompt: 'loop',
    }));

    const res = await result;
    assert.equal(res.status, 'completed');
    // Initial call + 50 rounds = 51 total
    assert.equal(callCount, 51);
  });

  it('uses custom config values', async () => {
    let capturedUrl = '';
    let capturedAuth = '';
    restoreFetch = mockFetch(async (url, opts) => {
      capturedUrl = String(url);
      capturedAuth = ((opts as RequestInit).headers as Record<string, string>)['Authorization'] ?? '';
      return new Response(JSON.stringify(makeApiResponse('ok')), { status: 200 });
    });

    process.env['MY_CUSTOM_TOKEN'] = 'custom-token-value';
    const provider = createStartedProvider({
      apiEndpoint: 'https://custom.endpoint.com',
      tokenEnvVar: 'MY_CUSTOM_TOKEN',
    });
    const { result } = provider.launch(makeConfig({ initialPrompt: 'hi' }));
    await result;

    assert.ok(capturedUrl.startsWith('https://custom.endpoint.com'));
    assert.equal(capturedAuth, 'Bearer custom-token-value');
    delete process.env['MY_CUSTOM_TOKEN'];
  });
});

=== FILE: packages/plugins/copilot/src/index.ts ===
/**
 * Copilot Session Provider
 *
 * Apparatus plugin that implements AnimatorSessionProvider using the
 * GitHub Models REST API (OpenAI-compatible). The Animator discovers
 * this via guild config:
 *
 *   guild.json["animator"]["sessionProvider"] = "copilot"
 *
 * Calls the chat completions endpoint, runs an in-process agentic
 * tool-call loop when tools are supplied, and supports streaming via SSE.
 *
 * Key design choice: calls tool handlers directly in-process (no MCP server).
 * This is simpler than the claude-code approach since we control the API
 * request/response cycle directly.
 */

import { z } from 'zod';

import { guild } from '@shardworks/nexus-core';
import type { Plugin, StartupContext } from '@shardworks/nexus-core';
import type {
  AnimatorSessionProvider,
  SessionProviderConfig,
  SessionProviderResult,
  SessionChunk,
} from '@shardworks/animator-apparatus';
import type { ResolvedTool } from '@shardworks/tools-apparatus';

// ── Config types ────────────────────────────────────────────────────

/** Plugin configuration stored at guild.json["copilot"]. */
export interface CopilotConfig {
  /**
   * Chat completions API base endpoint URL.
   * Default: 'https://models.inference.ai.azure.com'
   */
  apiEndpoint?: string;
  /**
   * Name of the environment variable holding the API bearer token.
   * Default: 'GITHUB_TOKEN'
   */
  tokenEnvVar?: string;
  /**
   * Maximum number of tool-call rounds in the agentic loop.
   * When reached, the session completes with the last available response.
   * Default: 50
   */
  maxToolRounds?: number;
}

// GuildConfig module augmentation — merged with other augmentations via declaration merging
declare module '@shardworks/nexus-core' {
  interface GuildConfig {
    copilot?: CopilotConfig;
  }
}

// ── Internal types ──────────────────────────────────────────────────

/** OpenAI-compatible chat completion message. */
interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  /** Index signature makes ChatMessage compatible with Record<string, unknown>. */
  [key: string]: unknown;
}

/** OpenAI-compatible tool call from an assistant response. */
interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

/** OpenAI-compatible function tool definition for the API request. */
interface ToolDef {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

/** OpenAI-compatible chat completion response (non-streaming). */
interface ChatCompletionResponse {
  id: string;
  choices: Array<{
    message: {
      role: 'assistant';
      content: string | null;
      tool_calls?: ToolCall[];
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
  };
}

/** OpenAI-compatible streaming chunk. */
interface ChatCompletionChunk {
  id: string;
  choices: Array<{
    delta: {
      role?: string;
      content?: string | null;
      tool_calls?: Array<{
        index: number;
        id?: string;
        type?: string;
        function?: {
          name?: string;
          arguments?: string;
        };
      }>;
    };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
  } | null;
}

/** A single transcript message entry. Matches the TranscriptMessage alias in animator types. */
type TranscriptEntry = Record<string, unknown>;

/** Accumulated metrics across API calls. */
interface SessionAccumulator {
  transcript: TranscriptEntry[];
  tokenUsage: { inputTokens: number; outputTokens: number };
  providerSessionId?: string;
}

// ── Tool conversion ─────────────────────────────────────────────────

/**
 * Convert ResolvedTool array to OpenAI function tool format.
 *
 * Uses z.toJSONSchema() to convert Zod params schema to JSON Schema.
 *
 * @internal Exported for testing only.
 */
export function convertTools(tools: ResolvedTool[]): ToolDef[] {
  return tools.map((rt) => ({
    type: 'function' as const,
    function: {
      name: rt.definition.name,
      description: rt.definition.description,
      parameters: z.toJSONSchema(rt.definition.params) as Record<string, unknown>,
    },
  }));
}

// ── Output extraction ───────────────────────────────────────────────

/**
 * Extract the output text from the last assistant message with no tool_calls.
 *
 * Walks the messages array backwards to find the last assistant message
 * that is a "final" response (no pending tool calls).
 *
 * @internal Exported for testing only.
 */
export function extractOutput(messages: ChatMessage[]): string | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]!;
    if (msg.role !== 'assistant') continue;
    if (msg.tool_calls && msg.tool_calls.length > 0) continue;
    if (msg.content) return msg.content;
  }
  return undefined;
}

// ── SSE parsing ─────────────────────────────────────────────────────

/**
 * Parse SSE data lines from a buffer, invoking handler for each parsed data value.
 * Returns the remaining incomplete buffer.
 *
 * @internal Exported for testing only.
 */
export function parseSseLines(buffer: string, handler: (data: string) => void): string {
  let idx: number;
  while ((idx = buffer.indexOf('\n')) !== -1) {
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (line.startsWith('data: ')) {
      const data = line.slice(6);
      if (data === '[DONE]') continue;
      handler(data);
    }
  }
  return buffer;
}

// ── API helpers ─────────────────────────────────────────────────────

/**
 * Make a non-streaming API call and return the parsed response.
 *
 * @throws When the HTTP response is not ok, with the status and body.
 */
async function callApi(
  apiEndpoint: string,
  token: string,
  model: string,
  messages: ChatMessage[],
  apiTools: ToolDef[],
): Promise<ChatCompletionResponse> {
  const response = await fetch(`${apiEndpoint}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      model,
      messages,
      ...(apiTools.length > 0 ? { tools: apiTools } : {}),
      stream: false,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub Models API error: ${response.status} ${body}`);
  }

  return response.json() as Promise<ChatCompletionResponse>;
}

/**
 * Make a streaming API call, yielding chunks and returning the accumulated assistant message.
 *
 * Parses SSE events, yields SessionChunk objects in real time, and accumulates
 * tool call fragments across delta chunks. Returns the fully assembled assistant
 * message and final usage info.
 */
async function* callApiStreaming(
  apiEndpoint: string,
  token: string,
  model: string,
  messages: ChatMessage[],
  apiTools: ToolDef[],
  acc: SessionAccumulator,
): AsyncGenerator<SessionChunk, ChatMessage, undefined> {
  const response = await fetch(`${apiEndpoint}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      model,
      messages,
      ...(apiTools.length > 0 ? { tools: apiTools } : {}),
      stream: true,
      stream_options: { include_usage: true },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub Models API error: ${response.status} ${body}`);
  }

  if (!response.body) {
    throw new Error('GitHub Models API error: no response body for streaming request');
  }

  // Accumulate tool call fragments keyed by index
  const toolCallFragments = new Map<number, { id: string; name: string; arguments: string }>();
  let textContent = '';
  let lastId = '';
  let buffer = '';

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Process complete SSE lines
      const chunks: ChatCompletionChunk[] = [];
      buffer = parseSseLines(buffer, (data) => {
        try {
          chunks.push(JSON.parse(data) as ChatCompletionChunk);
        } catch {
          // Skip malformed JSON
        }
      });

      for (const chunk of chunks) {
        if (chunk.id) lastId = chunk.id;

        // Accumulate usage from the final chunk (stream_options.include_usage)
        if (chunk.usage) {
          acc.tokenUsage.inputTokens += chunk.usage.prompt_tokens;
          acc.tokenUsage.outputTokens += chunk.usage.completion_tokens;
        }

        const choice = chunk.choices[0];
        if (!choice) continue;

        const delta = choice.delta;

        // Text content delta
        if (delta.content != null && delta.content !== '') {
          textContent += delta.content;
          process.stderr.write(delta.content);
          yield { type: 'text', text: delta.content };
        }

        // Tool call deltas — accumulate by index
        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const existing = toolCallFragments.get(tc.index);
            if (!existing) {
              // First fragment for this tool call — must have id and name
              const frag = {
                id: tc.id ?? '',
                name: tc.function?.name ?? '',
                arguments: tc.function?.arguments ?? '',
              };
              toolCallFragments.set(tc.index, frag);
              if (frag.name) {
                yield { type: 'tool_use', tool: frag.name };
              }
            } else {
              // Subsequent fragment — accumulate arguments and fill in missing fields
              if (tc.id && !existing.id) existing.id = tc.id;
              if (tc.function?.name && !existing.name) {
                existing.name = tc.function.name;
                yield { type: 'tool_use', tool: existing.name };
              }
              if (tc.function?.arguments) existing.arguments += tc.function.arguments;
            }
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  if (lastId) acc.providerSessionId = lastId;

  // Reconstruct the full assistant message from accumulated deltas
  const toolCalls: ToolCall[] = [];
  for (const [, frag] of toolCallFragments) {
    toolCalls.push({
      id: frag.id,
      type: 'function',
      function: { name: frag.name, arguments: frag.arguments },
    });
  }

  const assistantMsg: ChatMessage = {
    role: 'assistant',
    content: textContent || null,
    ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
  };

  return assistantMsg;
}

// ── Agentic loop (non-streaming) ────────────────────────────────────

/**
 * Run the full agentic tool-call loop without streaming.
 *
 * Makes API calls, executes tools, sends results back, and repeats until
 * the model returns a response with no tool_calls or the iteration limit.
 */
async function runAgenticLoop(
  apiEndpoint: string,
  token: string,
  model: string,
  messages: ChatMessage[],
  apiTools: ToolDef[],
  toolMap: Map<string, ResolvedTool>,
  maxRounds: number,
  acc: SessionAccumulator,
): Promise<void> {
  // Make the initial API call
  let apiResponse = await callApi(apiEndpoint, token, model, messages, apiTools);

  acc.tokenUsage.inputTokens += apiResponse.usage?.prompt_tokens ?? 0;
  acc.tokenUsage.outputTokens += apiResponse.usage?.completion_tokens ?? 0;
  acc.providerSessionId = apiResponse.id;

  const firstChoice = apiResponse.choices[0];
  if (!firstChoice) return;

  let assistantMsg: ChatMessage = {
    role: 'assistant',
    content: firstChoice.message.content,
    ...(firstChoice.message.tool_calls && firstChoice.message.tool_calls.length > 0
      ? { tool_calls: firstChoice.message.tool_calls }
      : {}),
  };
  messages.push(assistantMsg);
  acc.transcript.push(assistantMsg as TranscriptEntry);

  let round = 0;

  while (
    assistantMsg.tool_calls &&
    assistantMsg.tool_calls.length > 0 &&
    round < maxRounds
  ) {
    round++;

    // Execute each tool call and collect results
    for (const toolCall of assistantMsg.tool_calls) {
      const toolResult = await executeToolCall(toolCall, toolMap);
      const toolMsg: ChatMessage = {
        role: 'tool',
        content: toolResult,
        tool_call_id: toolCall.id,
      };
      messages.push(toolMsg);
      acc.transcript.push(toolMsg as TranscriptEntry);
    }

    // Make the next API call with tool results
    apiResponse = await callApi(apiEndpoint, token, model, messages, apiTools);

    acc.tokenUsage.inputTokens += apiResponse.usage?.prompt_tokens ?? 0;
    acc.tokenUsage.outputTokens += apiResponse.usage?.completion_tokens ?? 0;
    acc.providerSessionId = apiResponse.id;

    const choice = apiResponse.choices[0];
    if (!choice) break;

    assistantMsg = {
      role: 'assistant',
      content: choice.message.content,
      ...(choice.message.tool_calls && choice.message.tool_calls.length > 0
        ? { tool_calls: choice.message.tool_calls }
        : {}),
    };
    messages.push(assistantMsg);
    acc.transcript.push(assistantMsg as TranscriptEntry);
  }
}

/**
 * Run the full agentic tool-call loop with streaming.
 *
 * Yields chunks from each API call, executes tools, sends results back.
 */
async function* runAgenticLoopStreaming(
  apiEndpoint: string,
  token: string,
  model: string,
  messages: ChatMessage[],
  apiTools: ToolDef[],
  toolMap: Map<string, ResolvedTool>,
  maxRounds: number,
  acc: SessionAccumulator,
): AsyncGenerator<SessionChunk, void, undefined> {
  // Make the initial streaming API call
  const gen = callApiStreaming(apiEndpoint, token, model, messages, apiTools, acc);
  let assistantMsg: ChatMessage;

  // Yield chunks from the generator and capture the return value
  while (true) {
    const result = await gen.next();
    if (result.done) {
      assistantMsg = result.value;
      break;
    }
    yield result.value;
  }

  messages.push(assistantMsg);
  acc.transcript.push(assistantMsg as TranscriptEntry);

  let round = 0;

  while (
    assistantMsg.tool_calls &&
    assistantMsg.tool_calls.length > 0 &&
    round < maxRounds
  ) {
    round++;

    // Execute each tool call and collect results
    for (const toolCall of assistantMsg.tool_calls) {
      const toolResult = await executeToolCall(toolCall, toolMap);
      const toolMsg: ChatMessage = {
        role: 'tool',
        content: toolResult,
        tool_call_id: toolCall.id,
      };
      messages.push(toolMsg);
      acc.transcript.push(toolMsg as TranscriptEntry);
      yield { type: 'tool_result', tool: toolCall.id };
    }

    // Make the next streaming API call
    const nextGen = callApiStreaming(apiEndpoint, token, model, messages, apiTools, acc);
    while (true) {
      const result = await nextGen.next();
      if (result.done) {
        assistantMsg = result.value;
        break;
      }
      yield result.value;
    }

    messages.push(assistantMsg);
    acc.transcript.push(assistantMsg as TranscriptEntry);
  }
}

// ── Tool execution ─────────────────────────────────────────────────

/**
 * Execute a single tool call and return the result string.
 *
 * Catches all errors and returns them as error strings rather than
 * propagating — the model receives the error and may retry or recover.
 */
async function executeToolCall(
  toolCall: ToolCall,
  toolMap: Map<string, ResolvedTool>,
): Promise<string> {
  const tool = toolMap.get(toolCall.function.name);
  if (!tool) {
    return `Error: Unknown tool: ${toolCall.function.name}`;
  }

  try {
    const args = JSON.parse(toolCall.function.arguments) as unknown;
    const parsed = tool.definition.params.parse(args);
    const rawResult = await tool.definition.handler(parsed);
    if (typeof rawResult === 'string') return rawResult;
    return JSON.stringify(rawResult, null, 2);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return `Error: ${message}`;
  }
}

// ── Provider implementation ──────────────────────────────────────────

/**
 * Create the Copilot session provider apparatus.
 *
 * The apparatus reads CopilotConfig from guild config at start() time
 * and provides an AnimatorSessionProvider backed by the GitHub Models API.
 */
export function createCopilotProvider(): Plugin {
  let config: CopilotConfig = {};

  const provider: AnimatorSessionProvider = {
    name: 'copilot',

    launch(sessionConfig: SessionProviderConfig): {
      chunks: AsyncIterable<SessionChunk>;
      result: Promise<SessionProviderResult>;
    } {
      // Resolve config values with defaults
      const apiEndpoint = (config.apiEndpoint ?? 'https://models.inference.ai.azure.com').replace(/\/$/, '');
      const tokenEnvVar = config.tokenEnvVar ?? 'GITHUB_TOKEN';
      const maxRounds = config.maxToolRounds ?? 50;

      const acc: SessionAccumulator = {
        transcript: [],
        tokenUsage: { inputTokens: 0, outputTokens: 0 },
      };

      // Build initial messages from config
      const messages: ChatMessage[] = [];
      if (sessionConfig.systemPrompt) {
        const systemMsg: ChatMessage = { role: 'system', content: sessionConfig.systemPrompt };
        messages.push(systemMsg);
        acc.transcript.push(systemMsg as TranscriptEntry);
      }
      if (sessionConfig.initialPrompt) {
        const userMsg: ChatMessage = { role: 'user', content: sessionConfig.initialPrompt };
        messages.push(userMsg);
        acc.transcript.push(userMsg as TranscriptEntry);
      }

      // Convert tools
      const tools = sessionConfig.tools ?? [];
      const apiTools = convertTools(tools);
      const toolMap = new Map<string, ResolvedTool>(
        tools.map((rt) => [rt.definition.name, rt]),
      );

      if (sessionConfig.streaming) {
        // ── Streaming mode ────────────────────────────────────────────
        // Use a push queue + resolve callback to bridge the async generator
        // into a pull-based async iterable.

        const chunkQueue: SessionChunk[] = [];
        let chunkResolve: (() => void) | null = null;
        let done = false;
        let streamError: Error | null = null;

        const result: Promise<SessionProviderResult> = (async () => {
          // Validate token
          const token = process.env[tokenEnvVar];
          if (!token) {
            throw new Error(
              `Copilot session provider requires a GitHub token. ` +
              `Set the ${tokenEnvVar} environment variable.`,
            );
          }

          try {
            const gen = runAgenticLoopStreaming(
              apiEndpoint, token, sessionConfig.model, messages, apiTools, toolMap, maxRounds, acc,
            );

            for await (const chunk of gen) {
              chunkQueue.push(chunk);
              // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
              const notify = chunkResolve as (() => void) | null;
              chunkResolve = null;
              notify?.();
            }

            return {
              status: 'completed' as const,
              exitCode: 0,
              providerSessionId: acc.providerSessionId,
              tokenUsage: acc.tokenUsage,
              costUsd: undefined,
              transcript: acc.transcript,
              output: extractOutput(messages),
            };
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            streamError = err instanceof Error ? err : new Error(message);
            return {
              status: 'failed' as const,
              exitCode: 1,
              error: message,
              transcript: acc.transcript,
              tokenUsage: acc.tokenUsage.inputTokens > 0 ? acc.tokenUsage : undefined,
            };
          } finally {
            done = true;
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
            const notify = chunkResolve as (() => void) | null;
            chunkResolve = null;
            notify?.();
          }
        })();

        // Async iterable that drains the chunk queue, pausing between batches
        const chunks: AsyncIterable<SessionChunk> = {
          [Symbol.asyncIterator]() {
            return {
              async next(): Promise<IteratorResult<SessionChunk>> {
                while (true) {
                  if (chunkQueue.length > 0) {
                    return { value: chunkQueue.shift()!, done: false };
                  }
                  if (done || streamError) {
                    return { value: undefined as unknown as SessionChunk, done: true };
                  }
                  await new Promise<void>((resolve) => { chunkResolve = resolve; });
                }
              },
            };
          },
        };

        return { chunks, result };
      }

      // ── Non-streaming mode ─────────────────────────────────────────
      // Chunks iterable is immediately done; all work happens in result.

      const emptyChunks: AsyncIterable<SessionChunk> = {
        [Symbol.asyncIterator]() {
          return {
            next(): Promise<IteratorResult<SessionChunk>> {
              return Promise.resolve({ value: undefined as unknown as SessionChunk, done: true });
            },
          };
        },
      };

      const result: Promise<SessionProviderResult> = (async () => {
        // Validate token
        const token = process.env[tokenEnvVar];
        if (!token) {
          throw new Error(
            `Copilot session provider requires a GitHub token. ` +
            `Set the ${tokenEnvVar} environment variable.`,
          );
        }

        try {
          await runAgenticLoop(
            apiEndpoint, token, sessionConfig.model, messages, apiTools, toolMap, maxRounds, acc,
          );

          return {
            status: 'completed' as const,
            exitCode: 0,
            providerSessionId: acc.providerSessionId,
            tokenUsage: acc.tokenUsage,
            costUsd: undefined,
            transcript: acc.transcript,
            output: extractOutput(messages),
          };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return {
            status: 'failed' as const,
            exitCode: 1,
            error: message,
            transcript: acc.transcript,
            tokenUsage: acc.tokenUsage.inputTokens > 0 ? acc.tokenUsage : undefined,
          };
        }
      })();

      return { chunks: emptyChunks, result };
    },
  };

  return {
    apparatus: {
      requires: [],
      provides: provider,

      start(_ctx: StartupContext): void {
        config = guild().guildConfig().copilot ?? {};
      },
    },
  };
}

export default createCopilotProvider();

=== FILE: packages/plugins/copilot/tsconfig.json ===
{
  "extends": "../../../tsconfig.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": [
    "src"
  ],
  "exclude": [
    "src/**/*.test.ts"
  ]
}

=== FILE: pnpm-lock.yaml ===
lockfileVersion: '9.0'

settings:
  autoInstallPeers: true
  excludeLinksFromLockfile: false

importers:

  .:
    devDependencies:
      '@tsconfig/node24':
        specifier: 24.0.4
        version: 24.0.4
      typescript:
        specifier: 5.9.3
        version: 5.9.3

  packages/framework/arbor:
    dependencies:
      '@shardworks/nexus-core':
        specifier: workspace:*
        version: link:../core
    devDependencies:
      '@types/node':
        specifier: 25.5.0
        version: 25.5.0

  packages/framework/cli:
    dependencies:
      '@shardworks/nexus-arbor':
        specifier: workspace:*
        version: link:../arbor
      '@shardworks/nexus-core':
        specifier: workspace:*
        version: link:../core
      '@shardworks/tools-apparatus':
        specifier: workspace:*
        version: link:../../plugins/tools
      commander:
        specifier: 14.0.3
        version: 14.0.3
      zod:
        specifier: 4.3.6
        version: 4.3.6
    devDependencies:
      '@types/node':
        specifier: 25.5.0
        version: 25.5.0

  packages/framework/core:
    devDependencies:
      '@types/node':
        specifier: 25.5.0
        version: 25.5.0

  packages/plugins/animator:
    dependencies:
      '@shardworks/loom-apparatus':
        specifier: workspace:*
        version: link:../loom
      '@shardworks/nexus-core':
        specifier: workspace:*
        version: link:../../framework/core
      '@shardworks/stacks-apparatus':
        specifier: workspace:*
        version: link:../stacks
      '@shardworks/tools-apparatus':
        specifier: workspace:*
        version: link:../tools
      zod:
        specifier: 4.3.6
        version: 4.3.6
    devDependencies:
      '@types/node':
        specifier: 25.5.0
        version: 25.5.0

  packages/plugins/claude-code:
    dependencies:
      '@modelcontextprotocol/sdk':
        specifier: 1.27.1
        version: 1.27.1(zod@4.3.6)
      '@shardworks/animator-apparatus':
        specifier: workspace:*
        version: link:../animator
      '@shardworks/nexus-core':
        specifier: workspace:*
        version: link:../../framework/core
      '@shardworks/tools-apparatus':
        specifier: workspace:*
        version: link:../tools
      zod:
        specifier: 4.3.6
        version: 4.3.6
    devDependencies:
      '@types/node':
        specifier: 25.5.0
        version: 25.5.0

  packages/plugins/clerk:
    dependencies:
      '@shardworks/nexus-core':
        specifier: workspace:*
        version: link:../../framework/core
      '@shardworks/stacks-apparatus':
        specifier: workspace:*
        version: link:../stacks
      '@shardworks/tools-apparatus':
        specifier: workspace:*
        version: link:../tools
      zod:
        specifier: 4.3.6
        version: 4.3.6
    devDependencies:
      '@types/node':
        specifier: 25.5.0
        version: 25.5.0

  packages/plugins/codexes:
    dependencies:
      '@shardworks/nexus-core':
        specifier: workspace:*
        version: link:../../framework/core
      '@shardworks/tools-apparatus':
        specifier: workspace:*
        version: link:../tools
      zod:
        specifier: 4.3.6
        version: 4.3.6
    devDependencies:
      '@types/node':
        specifier: 25.5.0
        version: 25.5.0

  packages/plugins/copilot:
    dependencies:
      '@shardworks/animator-apparatus':
        specifier: workspace:*
        version: link:../animator
      '@shardworks/nexus-core':
        specifier: workspace:*
        version: link:../../framework/core
      '@shardworks/tools-apparatus':
        specifier: workspace:*
        version: link:../tools
      zod:
        specifier: 4.3.6
        version: 4.3.6
    devDependencies:
      '@types/node':
        specifier: 25.5.0
        version: 25.5.0

  packages/plugins/fabricator:
    dependencies:
      '@shardworks/nexus-core':
        specifier: workspace:*
        version: link:../../framework/core
    devDependencies:
      '@types/node':
        specifier: 25.5.0
        version: 25.5.0

  packages/plugins/loom:
    dependencies:
      '@shardworks/nexus-core':
        specifier: workspace:*
        version: link:../../framework/core
      '@shardworks/tools-apparatus':
        specifier: workspace:*
        version: link:../tools
      zod:
        specifier: 4.3.6
        version: 4.3.6
    devDependencies:
      '@types/node':
        specifier: 25.5.0
        version: 25.5.0

  packages/plugins/parlour:
    dependencies:
      '@shardworks/animator-apparatus':
        specifier: workspace:*
        version: link:../animator
      '@shardworks/loom-apparatus':
        specifier: workspace:*
        version: link:../loom
      '@shardworks/nexus-core':
        specifier: workspace:*
        version: link:../../framework/core
      '@shardworks/stacks-apparatus':
        specifier: workspace:*
        version: link:../stacks
      '@shardworks/tools-apparatus':
        specifier: workspace:*
        version: link:../tools
      zod:
        specifier: 4.3.6
        version: 4.3.6
    devDependencies:
      '@types/node':
        specifier: 25.5.0
        version: 25.5.0

  packages/plugins/spider:
    dependencies:
      '@shardworks/animator-apparatus':
        specifier: workspace:*
        version: link:../animator
      '@shardworks/clerk-apparatus':
        specifier: workspace:*
        version: link:../clerk
      '@shardworks/codexes-apparatus':
        specifier: workspace:*
        version: link:../codexes
      '@shardworks/fabricator-apparatus':
        specifier: workspace:*
        version: link:../fabricator
      '@shardworks/nexus-core':
        specifier: workspace:*
        version: link:../../framework/core
      '@shardworks/stacks-apparatus':
        specifier: workspace:*
        version: link:../stacks
      '@shardworks/tools-apparatus':
        specifier: workspace:*
        version: link:../tools
      zod:
        specifier: 4.3.6
        version: 4.3.6
    devDependencies:
      '@types/node':
        specifier: 25.5.0
        version: 25.5.0

  packages/plugins/stacks:
    dependencies:
      '@shardworks/nexus-core':
        specifier: workspace:*
        version: link:../../framework/core
      better-sqlite3:
        specifier: 12.8.0
        version: 12.8.0
    devDependencies:
      '@types/better-sqlite3':
        specifier: 7.6.13
        version: 7.6.13
      '@types/node':
        specifier: 25.5.0
        version: 25.5.0

  packages/plugins/tools:
    dependencies:
      '@shardworks/nexus-core':
        specifier: workspace:*
        version: link:../../framework/core
      zod:
        specifier: 4.3.6
        version: 4.3.6
    devDependencies:
      '@types/node':
        specifier: 25.5.0
        version: 25.5.0

packages:

  '@hono/node-server@1.19.11':
    resolution: {integrity: sha512-dr8/3zEaB+p0D2n/IUrlPF1HZm586qgJNXK1a9fhg/PzdtkK7Ksd5l312tJX2yBuALqDYBlG20QEbayqPyxn+g==}
    engines: {node: '>=18.14.1'}
    peerDependencies:
      hono: ^4

  '@modelcontextprotocol/sdk@1.27.1':
    resolution: {integrity: sha512-sr6GbP+4edBwFndLbM60gf07z0FQ79gaExpnsjMGePXqFcSSb7t6iscpjk9DhFhwd+mTEQrzNafGP8/iGGFYaA==}
    engines: {node: '>=18'}
    peerDependencies:
      '@cfworker/json-schema': ^4.1.1
      zod: ^3.25 || ^4.0
    peerDependenciesMeta:
      '@cfworker/json-schema':
        optional: true

  '@tsconfig/node24@24.0.4':
    resolution: {integrity: sha512-2A933l5P5oCbv6qSxHs7ckKwobs8BDAe9SJ/Xr2Hy+nDlwmLE1GhFh/g/vXGRZWgxBg9nX/5piDtHR9Dkw/XuA==}

  '@types/better-sqlite3@7.6.13':
    resolution: {integrity: sha512-NMv9ASNARoKksWtsq/SHakpYAYnhBrQgGD8zkLYk/jaK8jUGn08CfEdTRgYhMypUQAfzSP8W6gNLe0q19/t4VA==}

  '@types/node@25.5.0':
    resolution: {integrity: sha512-jp2P3tQMSxWugkCUKLRPVUpGaL5MVFwF8RDuSRztfwgN1wmqJeMSbKlnEtQqU8UrhTmzEmZdu2I6v2dpp7XIxw==}

  accepts@2.0.0:
    resolution: {integrity: sha512-5cvg6CtKwfgdmVqY1WIiXKc3Q1bkRqGLi+2W/6ao+6Y7gu/RCwRuAhGEzh5B4KlszSuTLgZYuqFqo5bImjNKng==}
    engines: {node: '>= 0.6'}

  ajv-formats@3.0.1:
    resolution: {integrity: sha512-8iUql50EUR+uUcdRQ3HDqa6EVyo3docL8g5WJ3FNcWmu62IbkGUue/pEyLBW8VGKKucTPgqeks4fIU1DA4yowQ==}
    peerDependencies:
      ajv: ^8.0.0
    peerDependenciesMeta:
      ajv:
        optional: true

  ajv@8.18.0:
    resolution: {integrity: sha512-PlXPeEWMXMZ7sPYOHqmDyCJzcfNrUr3fGNKtezX14ykXOEIvyK81d+qydx89KY5O71FKMPaQ2vBfBFI5NHR63A==}

  base64-js@1.5.1:
    resolution: {integrity: sha512-AKpaYlHn8t4SVbOHCy+b5+KKgvR4vrsD8vbvrbiQJps7fKDTkjkDry6ji0rUJjC0kzbNePLwzxq8iypo41qeWA==}

  better-sqlite3@12.8.0:
    resolution: {integrity: sha512-RxD2Vd96sQDjQr20kdP+F+dK/1OUNiVOl200vKBZY8u0vTwysfolF6Hq+3ZK2+h8My9YvZhHsF+RSGZW2VYrPQ==}
    engines: {node: 20.x || 22.x || 23.x || 24.x || 25.x}

  bindings@1.5.0:
    resolution: {integrity: sha512-p2q/t/mhvuOj/UeLlV6566GD/guowlr0hHxClI0W9m7MWYkL1F0hLo+0Aexs9HSPCtR1SXQ0TD3MMKrXZajbiQ==}

  bl@4.1.0:
    resolution: {integrity: sha512-1W07cM9gS6DcLperZfFSj+bWLtaPGSOHWhPiGzXmvVJbRLdG82sH/Kn8EtW1VqWVA54AKf2h5k5BbnIbwF3h6w==}

  body-parser@2.2.2:
    resolution: {integrity: sha512-oP5VkATKlNwcgvxi0vM0p/D3n2C3EReYVX+DNYs5TjZFn/oQt2j+4sVJtSMr18pdRr8wjTcBl6LoV+FUwzPmNA==}
    engines: {node: '>=18'}

  buffer@5.7.1:
    resolution: {integrity: sha512-EHcyIPBQ4BSGlvjB16k5KgAJ27CIsHY/2JBmCRReo48y9rQ3MaUzWX3KVlBa4U7MyX02HdVj0K7C3WaB3ju7FQ==}

  bytes@3.1.2:
    resolution: {integrity: sha512-/Nf7TyzTx6S3yRJObOAV7956r8cr2+Oj8AC5dt8wSP3BQAoeX58NoHyCU8P8zGkNXStjTSi6fzO6F0pBdcYbEg==}
    engines: {node: '>= 0.8'}

  call-bind-apply-helpers@1.0.2:
    resolution: {integrity: sha512-Sp1ablJ0ivDkSzjcaJdxEunN5/XvksFJ2sMBFfq6x0ryhQV/2b/KwFe21cMpmHtPOSij8K99/wSfoEuTObmuMQ==}
    engines: {node: '>= 0.4'}

  call-bound@1.0.4:
    resolution: {integrity: sha512-+ys997U96po4Kx/ABpBCqhA9EuxJaQWDQg7295H4hBphv3IZg0boBKuwYpt4YXp6MZ5AmZQnU/tyMTlRpaSejg==}
    engines: {node: '>= 0.4'}

  chownr@1.1.4:
    resolution: {integrity: sha512-jJ0bqzaylmJtVnNgzTeSOs8DPavpbYgEr/b0YL8/2GO3xJEhInFmhKMUnEJQjZumK7KXGFhUy89PrsJWlakBVg==}

  commander@14.0.3:
    resolution: {integrity: sha512-H+y0Jo/T1RZ9qPP4Eh1pkcQcLRglraJaSLoyOtHxu6AapkjWVCy2Sit1QQ4x3Dng8qDlSsZEet7g5Pq06MvTgw==}
    engines: {node: '>=20'}

  content-disposition@1.0.1:
    resolution: {integrity: sha512-oIXISMynqSqm241k6kcQ5UwttDILMK4BiurCfGEREw6+X9jkkpEe5T9FZaApyLGGOnFuyMWZpdolTXMtvEJ08Q==}
    engines: {node: '>=18'}

  content-type@1.0.5:
    resolution: {integrity: sha512-nTjqfcBFEipKdXCv4YDQWCfmcLZKm81ldF0pAopTvyrFGVbcR6P/VAAd5G7N+0tTr8QqiU0tFadD6FK4NtJwOA==}
    engines: {node: '>= 0.6'}

  cookie-signature@1.2.2:
    resolution: {integrity: sha512-D76uU73ulSXrD1UXF4KE2TMxVVwhsnCgfAyTg9k8P6KGZjlXKrOLe4dJQKI3Bxi5wjesZoFXJWElNWBjPZMbhg==}
    engines: {node: '>=6.6.0'}

  cookie@0.7.2:
    resolution: {integrity: sha512-yki5XnKuf750l50uGTllt6kKILY4nQ1eNIQatoXEByZ5dWgnKqbnqmTrBE5B4N7lrMJKQ2ytWMiTO2o0v6Ew/w==}
    engines: {node: '>= 0.6'}

  cors@2.8.6:
    resolution: {integrity: sha512-tJtZBBHA6vjIAaF6EnIaq6laBBP9aq/Y3ouVJjEfoHbRBcHBAHYcMh/w8LDrk2PvIMMq8gmopa5D4V8RmbrxGw==}
    engines: {node: '>= 0.10'}

  cross-spawn@7.0.6:
    resolution: {integrity: sha512-uV2QOWP2nWzsy2aMp8aRibhi9dlzF5Hgh5SHaB9OiTGEyDTiJJyx0uy51QXdyWbtAHNua4XJzUKca3OzKUd3vA==}
    engines: {node: '>= 8'}

  debug@4.4.3:
    resolution: {integrity: sha512-RGwwWnwQvkVfavKVt22FGLw+xYSdzARwm0ru6DhTVA3umU5hZc28V3kO4stgYryrTlLpuvgI9GiijltAjNbcqA==}
    engines: {node: '>=6.0'}
    peerDependencies:
      supports-color: '*'
    peerDependenciesMeta:
      supports-color:
        optional: true

  decompress-response@6.0.0:
    resolution: {integrity: sha512-aW35yZM6Bb/4oJlZncMH2LCoZtJXTRxES17vE3hoRiowU2kWHaJKFkSBDnDR+cm9J+9QhXmREyIfv0pji9ejCQ==}
    engines: {node: '>=10'}

  deep-extend@0.6.0:
    resolution: {integrity: sha512-LOHxIOaPYdHlJRtCQfDIVZtfw/ufM8+rVj649RIHzcm/vGwQRXFt6OPqIFWsm2XEMrNIEtWR64sY1LEKD2vAOA==}
    engines: {node: '>=4.0.0'}

  depd@2.0.0:
    resolution: {integrity: sha512-g7nH6P6dyDioJogAAGprGpCtVImJhpPk/roCzdb3fIh61/s/nPsfR6onyMwkCAR/OlC3yBC0lESvUoQEAssIrw==}
    engines: {node: '>= 0.8'}

  detect-libc@2.1.2:
    resolution: {integrity: sha512-Btj2BOOO83o3WyH59e8MgXsxEQVcarkUOpEYrubB0urwnN10yQ364rsiByU11nZlqWYZm05i/of7io4mzihBtQ==}
    engines: {node: '>=8'}

  dunder-proto@1.0.1:
    resolution: {integrity: sha512-KIN/nDJBQRcXw0MLVhZE9iQHmG68qAVIBg9CqmUYjmQIhgij9U5MFvrqkUL5FbtyyzZuOeOt0zdeRe4UY7ct+A==}
    engines: {node: '>= 0.4'}

  ee-first@1.1.1:
    resolution: {integrity: sha512-WMwm9LhRUo+WUaRN+vRuETqG89IgZphVSNkdFgeb6sS/E4OrDIN7t48CAewSHXc6C8lefD8KKfr5vY61brQlow==}

  encodeurl@2.0.0:
    resolution: {integrity: sha512-Q0n9HRi4m6JuGIV1eFlmvJB7ZEVxu93IrMyiMsGC0lrMJMWzRgx6WGquyfQgZVb31vhGgXnfmPNNXmxnOkRBrg==}
    engines: {node: '>= 0.8'}

  end-of-stream@1.4.5:
    resolution: {integrity: sha512-ooEGc6HP26xXq/N+GCGOT0JKCLDGrq2bQUZrQ7gyrJiZANJ/8YDTxTpQBXGMn+WbIQXNVpyWymm7KYVICQnyOg==}

  es-define-property@1.0.1:
    resolution: {integrity: sha512-e3nRfgfUZ4rNGL232gUgX06QNyyez04KdjFrF+LTRoOXmrOgFKDg4BCdsjW8EnT69eqdYGmRpJwiPVYNrCaW3g==}
    engines: {node: '>= 0.4'}

  es-errors@1.3.0:
    resolution: {integrity: sha512-Zf5H2Kxt2xjTvbJvP2ZWLEICxA6j+hAmMzIlypy4xcBg1vKVnx89Wy0GbS+kf5cwCVFFzdCFh2XSCFNULS6csw==}
    engines: {node: '>= 0.4'}

  es-object-atoms@1.1.1:
    resolution: {integrity: sha512-FGgH2h8zKNim9ljj7dankFPcICIK9Cp5bm+c2gQSYePhpaG5+esrLODihIorn+Pe6FGJzWhXQotPv73jTaldXA==}
    engines: {node: '>= 0.4'}

  escape-html@1.0.3:
    resolution: {integrity: sha512-NiSupZ4OeuGwr68lGIeym/ksIZMJodUGOSCZ/FSnTxcrekbvqrgdUxlJOMpijaKZVjAJrWrGs/6Jy8OMuyj9ow==}

  etag@1.8.1:
    resolution: {integrity: sha512-aIL5Fx7mawVa300al2BnEE4iNvo1qETxLrPI/o05L7z6go7fCw1J6EQmbK4FmJ2AS7kgVF/KEZWufBfdClMcPg==}
    engines: {node: '>= 0.6'}

  eventsource-parser@3.0.6:
    resolution: {integrity: sha512-Vo1ab+QXPzZ4tCa8SwIHJFaSzy4R6SHf7BY79rFBDf0idraZWAkYrDjDj8uWaSm3S2TK+hJ7/t1CEmZ7jXw+pg==}
    engines: {node: '>=18.0.0'}

  eventsource@3.0.7:
    resolution: {integrity: sha512-CRT1WTyuQoD771GW56XEZFQ/ZoSfWid1alKGDYMmkt2yl8UXrVR4pspqWNEcqKvVIzg6PAltWjxcSSPrboA4iA==}
    engines: {node: '>=18.0.0'}

  expand-template@2.0.3:
    resolution: {integrity: sha512-XYfuKMvj4O35f/pOXLObndIRvyQ+/+6AhODh+OKWj9S9498pHHn/IMszH+gt0fBCRWMNfk1ZSp5x3AifmnI2vg==}
    engines: {node: '>=6'}

  express-rate-limit@8.3.1:
    resolution: {integrity: sha512-D1dKN+cmyPWuvB+G2SREQDzPY1agpBIcTa9sJxOPMCNeH3gwzhqJRDWCXW3gg0y//+LQ/8j52JbMROWyrKdMdw==}
    engines: {node: '>= 16'}
    peerDependencies:
      express: '>= 4.11'

  express@5.2.1:
    resolution: {integrity: sha512-hIS4idWWai69NezIdRt2xFVofaF4j+6INOpJlVOLDO8zXGpUVEVzIYk12UUi2JzjEzWL3IOAxcTubgz9Po0yXw==}
    engines: {node: '>= 18'}

  fast-deep-equal@3.1.3:
    resolution: {integrity: sha512-f3qQ9oQy9j2AhBe/H9VC91wLmKBCCU/gDOnKNAYG5hswO7BLKj09Hc5HYNz9cGI++xlpDCIgDaitVs03ATR84Q==}

  fast-uri@3.1.0:
    resolution: {integrity: sha512-iPeeDKJSWf4IEOasVVrknXpaBV0IApz/gp7S2bb7Z4Lljbl2MGJRqInZiUrQwV16cpzw/D3S5j5Julj/gT52AA==}

  file-uri-to-path@1.0.0:
    resolution: {integrity: sha512-0Zt+s3L7Vf1biwWZ29aARiVYLx7iMGnEUl9x33fbB/j3jR81u/O2LbqK+Bm1CDSNDKVtJ/YjwY7TUd5SkeLQLw==}

  finalhandler@2.1.1:
    resolution: {integrity: sha512-S8KoZgRZN+a5rNwqTxlZZePjT/4cnm0ROV70LedRHZ0p8u9fRID0hJUZQpkKLzro8LfmC8sx23bY6tVNxv8pQA==}
    engines: {node: '>= 18.0.0'}

  forwarded@0.2.0:
    resolution: {integrity: sha512-buRG0fpBtRHSTCOASe6hD258tEubFoRLb4ZNA6NxMVHNw2gOcwHo9wyablzMzOA5z9xA9L1KNjk/Nt6MT9aYow==}
    engines: {node: '>= 0.6'}

  fresh@2.0.0:
    resolution: {integrity: sha512-Rx/WycZ60HOaqLKAi6cHRKKI7zxWbJ31MhntmtwMoaTeF7XFH9hhBp8vITaMidfljRQ6eYWCKkaTK+ykVJHP2A==}
    engines: {node: '>= 0.8'}

  fs-constants@1.0.0:
    resolution: {integrity: sha512-y6OAwoSIf7FyjMIv94u+b5rdheZEjzR63GTyZJm5qh4Bi+2YgwLCcI/fPFZkL5PSixOt6ZNKm+w+Hfp/Bciwow==}

  function-bind@1.1.2:
    resolution: {integrity: sha512-7XHNxH7qX9xG5mIwxkhumTox/MIRNcOgDrxWsMt2pAr23WHp6MrRlN7FBSFpCpr+oVO0F744iUgR82nJMfG2SA==}

  get-intrinsic@1.3.0:
    resolution: {integrity: sha512-9fSjSaos/fRIVIp+xSJlE6lfwhES7LNtKaCBIamHsjr2na1BiABJPo0mOjjz8GJDURarmCPGqaiVg5mfjb98CQ==}
    engines: {node: '>= 0.4'}

  get-proto@1.0.1:
    resolution: {integrity: sha512-sTSfBjoXBp89JvIKIefqw7U2CCebsc74kiY6awiGogKtoSGbgjYE/G/+l9sF3MWFPNc9IcoOC4ODfKHfxFmp0g==}
    engines: {node: '>= 0.4'}

  github-from-package@0.0.0:
    resolution: {integrity: sha512-SyHy3T1v2NUXn29OsWdxmK6RwHD+vkj3v8en8AOBZ1wBQ/hCAQ5bAQTD02kW4W9tUp/3Qh6J8r9EvntiyCmOOw==}

  gopd@1.2.0:
    resolution: {integrity: sha512-ZUKRh6/kUFoAiTAtTYPZJ3hw9wNxx+BIBOijnlG9PnrJsCcSjs1wyyD6vJpaYtgnzDrKYRSqf3OO6Rfa93xsRg==}
    engines: {node: '>= 0.4'}

  has-symbols@1.1.0:
    resolution: {integrity: sha512-1cDNdwJ2Jaohmb3sg4OmKaMBwuC48sYni5HUw2DvsC8LjGTLK9h+eb1X6RyuOHe4hT0ULCW68iomhjUoKUqlPQ==}
    engines: {node: '>= 0.4'}

  hasown@2.0.2:
    resolution: {integrity: sha512-0hJU9SCPvmMzIBdZFqNPXWa6dqh7WdH0cII9y+CyS8rG3nL48Bclra9HmKhVVUHyPWNH5Y7xDwAB7bfgSjkUMQ==}
    engines: {node: '>= 0.4'}

  hono@4.12.9:
    resolution: {integrity: sha512-wy3T8Zm2bsEvxKZM5w21VdHDDcwVS1yUFFY6i8UobSsKfFceT7TOwhbhfKsDyx7tYQlmRM5FLpIuYvNFyjctiA==}
    engines: {node: '>=16.9.0'}

  http-errors@2.0.1:
    resolution: {integrity: sha512-4FbRdAX+bSdmo4AUFuS0WNiPz8NgFt+r8ThgNWmlrjQjt1Q7ZR9+zTlce2859x4KSXrwIsaeTqDoKQmtP8pLmQ==}
    engines: {node: '>= 0.8'}

  iconv-lite@0.7.2:
    resolution: {integrity: sha512-im9DjEDQ55s9fL4EYzOAv0yMqmMBSZp6G0VvFyTMPKWxiSBHUj9NW/qqLmXUwXrrM7AvqSlTCfvqRb0cM8yYqw==}
    engines: {node: '>=0.10.0'}

  ieee754@1.2.1:
    resolution: {integrity: sha512-dcyqhDvX1C46lXZcVqCpK+FtMRQVdIMN6/Df5js2zouUsqG7I6sFxitIC+7KYK29KdXOLHdu9zL4sFnoVQnqaA==}

  inherits@2.0.4:
    resolution: {integrity: sha512-k/vGaX4/Yla3WzyMCvTQOXYeIHvqOKtnqBduzTHpzpQZzAskKMhZ2K+EnBiSM9zGSoIFeMpXKxa4dYeZIQqewQ==}

  ini@1.3.8:
    resolution: {integrity: sha512-JV/yugV2uzW5iMRSiZAyDtQd+nxtUnjeLt0acNdw98kKLrvuRVyB80tsREOE7yvGVgalhZ6RNXCmEHkUKBKxew==}

  ip-address@10.1.0:
    resolution: {integrity: sha512-XXADHxXmvT9+CRxhXg56LJovE+bmWnEWB78LB83VZTprKTmaC5QfruXocxzTZ2Kl0DNwKuBdlIhjL8LeY8Sf8Q==}
    engines: {node: '>= 12'}

  ipaddr.js@1.9.1:
    resolution: {integrity: sha512-0KI/607xoxSToH7GjN1FfSbLoU0+btTicjsQSWQlh/hZykN8KpmMf7uYwPW3R+akZ6R/w18ZlXSHBYXiYUPO3g==}
    engines: {node: '>= 0.10'}

  is-promise@4.0.0:
    resolution: {integrity: sha512-hvpoI6korhJMnej285dSg6nu1+e6uxs7zG3BYAm5byqDsgJNWwxzM6z6iZiAgQR4TJ30JmBTOwqZUw3WlyH3AQ==}

  isexe@2.0.0:
    resolution: {integrity: sha512-RHxMLp9lnKHGHRng9QFhRCMbYAcVpn69smSGcq3f36xjgVVWThj4qqLbTLlq7Ssj8B+fIQ1EuCEGI2lKsyQeIw==}

  jose@6.2.2:
    resolution: {integrity: sha512-d7kPDd34KO/YnzaDOlikGpOurfF0ByC2sEV4cANCtdqLlTfBlw2p14O/5d/zv40gJPbIQxfES3nSx1/oYNyuZQ==}

  json-schema-traverse@1.0.0:
    resolution: {integrity: sha512-NM8/P9n3XjXhIZn1lLhkFaACTOURQXjWhV4BA/RnOv8xvgqtqpAX9IO4mRQxSx1Rlo4tqzeqb0sOlruaOy3dug==}

  json-schema-typed@8.0.2:
    resolution: {integrity: sha512-fQhoXdcvc3V28x7C7BMs4P5+kNlgUURe2jmUT1T//oBRMDrqy1QPelJimwZGo7Hg9VPV3EQV5Bnq4hbFy2vetA==}

  math-intrinsics@1.1.0:
    resolution: {integrity: sha512-/IXtbwEk5HTPyEwyKX6hGkYXxM9nbj64B+ilVJnC/R6B0pH5G4V3b0pVbL7DBj4tkhBAppbQUlf6F6Xl9LHu1g==}
    engines: {node: '>= 0.4'}

  media-typer@1.1.0:
    resolution: {integrity: sha512-aisnrDP4GNe06UcKFnV5bfMNPBUw4jsLGaWwWfnH3v02GnBuXX2MCVn5RbrWo0j3pczUilYblq7fQ7Nw2t5XKw==}
    engines: {node: '>= 0.8'}

  merge-descriptors@2.0.0:
    resolution: {integrity: sha512-Snk314V5ayFLhp3fkUREub6WtjBfPdCPY1Ln8/8munuLuiYhsABgBVWsozAG+MWMbVEvcdcpbi9R7ww22l9Q3g==}
    engines: {node: '>=18'}

  mime-db@1.54.0:
    resolution: {integrity: sha512-aU5EJuIN2WDemCcAp2vFBfp/m4EAhWJnUNSSw0ixs7/kXbd6Pg64EmwJkNdFhB8aWt1sH2CTXrLxo/iAGV3oPQ==}
    engines: {node: '>= 0.6'}

  mime-types@3.0.2:
    resolution: {integrity: sha512-Lbgzdk0h4juoQ9fCKXW4by0UJqj+nOOrI9MJ1sSj4nI8aI2eo1qmvQEie4VD1glsS250n15LsWsYtCugiStS5A==}
    engines: {node: '>=18'}

  mimic-response@3.1.0:
    resolution: {integrity: sha512-z0yWI+4FDrrweS8Zmt4Ej5HdJmky15+L2e6Wgn3+iK5fWzb6T3fhNFq2+MeTRb064c6Wr4N/wv0DzQTjNzHNGQ==}
    engines: {node: '>=10'}

  minimist@1.2.8:
    resolution: {integrity: sha512-2yyAR8qBkN3YuheJanUpWC5U3bb5osDywNB8RzDVlDwDHbocAJveqqj1u8+SVD7jkWT4yvsHCpWqqWqAxb0zCA==}

  mkdirp-classic@0.5.3:
    resolution: {integrity: sha512-gKLcREMhtuZRwRAfqP3RFW+TK4JqApVBtOIftVgjuABpAtpxhPGaDcfvbhNvD0B8iD1oUr/txX35NjcaY6Ns/A==}

  ms@2.1.3:
    resolution: {integrity: sha512-6FlzubTLZG3J2a/NVCAleEhjzq5oxgHyaCU9yYXvcLsvoVaHJq/s5xXI6/XXP6tz7R9xAOtHnSO/tXtF3WRTlA==}

  napi-build-utils@2.0.0:
    resolution: {integrity: sha512-GEbrYkbfF7MoNaoh2iGG84Mnf/WZfB0GdGEsM8wz7Expx/LlWf5U8t9nvJKXSp3qr5IsEbK04cBGhol/KwOsWA==}

  negotiator@1.0.0:
    resolution: {integrity: sha512-8Ofs/AUQh8MaEcrlq5xOX0CQ9ypTF5dl78mjlMNfOK08fzpgTHQRQPBxcPlEtIw0yRpws+Zo/3r+5WRby7u3Gg==}
    engines: {node: '>= 0.6'}

  node-abi@3.89.0:
    resolution: {integrity: sha512-6u9UwL0HlAl21+agMN3YAMXcKByMqwGx+pq+P76vii5f7hTPtKDp08/H9py6DY+cfDw7kQNTGEj/rly3IgbNQA==}
    engines: {node: '>=10'}

  object-assign@4.1.1:
    resolution: {integrity: sha512-rJgTQnkUnH1sFw8yT6VSU3zD3sWmu6sZhIseY8VX+GRu3P6F7Fu+JNDoXfklElbLJSnc3FUQHVe4cU5hj+BcUg==}
    engines: {node: '>=0.10.0'}

  object-inspect@1.13.4:
    resolution: {integrity: sha512-W67iLl4J2EXEGTbfeHCffrjDfitvLANg0UlX3wFUUSTx92KXRFegMHUVgSqE+wvhAbi4WqjGg9czysTV2Epbew==}
    engines: {node: '>= 0.4'}

  on-finished@2.4.1:
    resolution: {integrity: sha512-oVlzkg3ENAhCk2zdv7IJwd/QUD4z2RxRwpkcGY8psCVcCYZNq4wYnVWALHM+brtuJjePWiYF/ClmuDr8Ch5+kg==}
    engines: {node: '>= 0.8'}

  once@1.4.0:
    resolution: {integrity: sha512-lNaJgI+2Q5URQBkccEKHTQOPaXdUxnZZElQTZY0MFUAuaEqe1E+Nyvgdz/aIyNi6Z9MzO5dv1H8n58/GELp3+w==}

  parseurl@1.3.3:
    resolution: {integrity: sha512-CiyeOxFT/JZyN5m0z9PfXw4SCBJ6Sygz1Dpl0wqjlhDEGGBP1GnsUVEL0p63hoG1fcj3fHynXi9NYO4nWOL+qQ==}
    engines: {node: '>= 0.8'}

  path-key@3.1.1:
    resolution: {integrity: sha512-ojmeN0qd+y0jszEtoY48r0Peq5dwMEkIlCOu6Q5f41lfkswXuKtYrhgoTpLnyIcHm24Uhqx+5Tqm2InSwLhE6Q==}
    engines: {node: '>=8'}

  path-to-regexp@8.3.0:
    resolution: {integrity: sha512-7jdwVIRtsP8MYpdXSwOS0YdD0Du+qOoF/AEPIt88PcCFrZCzx41oxku1jD88hZBwbNUIEfpqvuhjFaMAqMTWnA==}

  pkce-challenge@5.0.1:
    resolution: {integrity: sha512-wQ0b/W4Fr01qtpHlqSqspcj3EhBvimsdh0KlHhH8HRZnMsEa0ea2fTULOXOS9ccQr3om+GcGRk4e+isrZWV8qQ==}
    engines: {node: '>=16.20.0'}

  prebuild-install@7.1.3:
    resolution: {integrity: sha512-8Mf2cbV7x1cXPUILADGI3wuhfqWvtiLA1iclTDbFRZkgRQS0NqsPZphna9V+HyTEadheuPmjaJMsbzKQFOzLug==}
    engines: {node: '>=10'}
    deprecated: No longer maintained. Please contact the author of the relevant native addon; alternatives are available.
    hasBin: true

  proxy-addr@2.0.7:
    resolution: {integrity: sha512-llQsMLSUDUPT44jdrU/O37qlnifitDP+ZwrmmZcoSKyLKvtZxpyV0n2/bD/N4tBAAZ/gJEdZU7KMraoK1+XYAg==}
    engines: {node: '>= 0.10'}

  pump@3.0.4:
    resolution: {integrity: sha512-VS7sjc6KR7e1ukRFhQSY5LM2uBWAUPiOPa/A3mkKmiMwSmRFUITt0xuj+/lesgnCv+dPIEYlkzrcyXgquIHMcA==}

  qs@6.15.0:
    resolution: {integrity: sha512-mAZTtNCeetKMH+pSjrb76NAM8V9a05I9aBZOHztWy/UqcJdQYNsf59vrRKWnojAT9Y+GbIvoTBC++CPHqpDBhQ==}
    engines: {node: '>=0.6'}

  range-parser@1.2.1:
    resolution: {integrity: sha512-Hrgsx+orqoygnmhFbKaHE6c296J+HTAQXoxEF6gNupROmmGJRoyzfG3ccAveqCBrwr/2yxQ5BVd/GTl5agOwSg==}
    engines: {node: '>= 0.6'}

  raw-body@3.0.2:
    resolution: {integrity: sha512-K5zQjDllxWkf7Z5xJdV0/B0WTNqx6vxG70zJE4N0kBs4LovmEYWJzQGxC9bS9RAKu3bgM40lrd5zoLJ12MQ5BA==}
    engines: {node: '>= 0.10'}

  rc@1.2.8:
    resolution: {integrity: sha512-y3bGgqKj3QBdxLbLkomlohkvsA8gdAiUQlSBJnBhfn+BPxg4bc62d8TcBW15wavDfgexCgccckhcZvywyQYPOw==}
    hasBin: true

  readable-stream@3.6.2:
    resolution: {integrity: sha512-9u/sniCrY3D5WdsERHzHE4G2YCXqoG5FTHUiCC4SIbr6XcLZBY05ya9EKjYek9O5xOAwjGq+1JdGBAS7Q9ScoA==}
    engines: {node: '>= 6'}

  require-from-string@2.0.2:
    resolution: {integrity: sha512-Xf0nWe6RseziFMu+Ap9biiUbmplq6S9/p+7w7YXP/JBHhrUDDUhwa+vANyubuqfZWTveU//DYVGsDG7RKL/vEw==}
    engines: {node: '>=0.10.0'}

  router@2.2.0:
    resolution: {integrity: sha512-nLTrUKm2UyiL7rlhapu/Zl45FwNgkZGaCpZbIHajDYgwlJCOzLSk+cIPAnsEqV955GjILJnKbdQC1nVPz+gAYQ==}
    engines: {node: '>= 18'}

  safe-buffer@5.2.1:
    resolution: {integrity: sha512-rp3So07KcdmmKbGvgaNxQSJr7bGVSVk5S9Eq1F+ppbRo70+YeaDxkw5Dd8NPN+GD6bjnYm2VuPuCXmpuYvmCXQ==}

  safer-buffer@2.1.2:
    resolution: {integrity: sha512-YZo3K82SD7Riyi0E1EQPojLz7kpepnSQI9IyPbHHg1XXXevb5dJI7tpyN2ADxGcQbHG7vcyRHk0cbwqcQriUtg==}

  semver@7.7.4:
    resolution: {integrity: sha512-vFKC2IEtQnVhpT78h1Yp8wzwrf8CM+MzKMHGJZfBtzhZNycRFnXsHk6E5TxIkkMsgNS7mdX3AGB7x2QM2di4lA==}
    engines: {node: '>=10'}
    hasBin: true

  send@1.2.1:
    resolution: {integrity: sha512-1gnZf7DFcoIcajTjTwjwuDjzuz4PPcY2StKPlsGAQ1+YH20IRVrBaXSWmdjowTJ6u8Rc01PoYOGHXfP1mYcZNQ==}
    engines: {node: '>= 18'}

  serve-static@2.2.1:
    resolution: {integrity: sha512-xRXBn0pPqQTVQiC8wyQrKs2MOlX24zQ0POGaj0kultvoOCstBQM5yvOhAVSUwOMjQtTvsPWoNCHfPGwaaQJhTw==}
    engines: {node: '>= 18'}

  setprototypeof@1.2.0:
    resolution: {integrity: sha512-E5LDX7Wrp85Kil5bhZv46j8jOeboKq5JMmYM3gVGdGH8xFpPWXUMsNrlODCrkoxMEeNi/XZIwuRvY4XNwYMJpw==}

  shebang-command@2.0.0:
    resolution: {integrity: sha512-kHxr2zZpYtdmrN1qDjrrX/Z1rR1kG8Dx+gkpK1G4eXmvXswmcE1hTWBWYUzlraYw1/yZp6YuDY77YtvbN0dmDA==}
    engines: {node: '>=8'}

  shebang-regex@3.0.0:
    resolution: {integrity: sha512-7++dFhtcx3353uBaq8DDR4NuxBetBzC7ZQOhmTQInHEd6bSrXdiEyzCvG07Z44UYdLShWUyXt5M/yhz8ekcb1A==}
    engines: {node: '>=8'}

  side-channel-list@1.0.0:
    resolution: {integrity: sha512-FCLHtRD/gnpCiCHEiJLOwdmFP+wzCmDEkc9y7NsYxeF4u7Btsn1ZuwgwJGxImImHicJArLP4R0yX4c2KCrMrTA==}
    engines: {node: '>= 0.4'}

  side-channel-map@1.0.1:
    resolution: {integrity: sha512-VCjCNfgMsby3tTdo02nbjtM/ewra6jPHmpThenkTYh8pG9ucZ/1P8So4u4FGBek/BjpOVsDCMoLA/iuBKIFXRA==}
    engines: {node: '>= 0.4'}

  side-channel-weakmap@1.0.2:
    resolution: {integrity: sha512-WPS/HvHQTYnHisLo9McqBHOJk2FkHO/tlpvldyrnem4aeQp4hai3gythswg6p01oSoTl58rcpiFAjF2br2Ak2A==}
    engines: {node: '>= 0.4'}

  side-channel@1.1.0:
    resolution: {integrity: sha512-ZX99e6tRweoUXqR+VBrslhda51Nh5MTQwou5tnUDgbtyM0dBgmhEDtWGP/xbKn6hqfPRHujUNwz5fy/wbbhnpw==}
    engines: {node: '>= 0.4'}

  simple-concat@1.0.1:
    resolution: {integrity: sha512-cSFtAPtRhljv69IK0hTVZQ+OfE9nePi/rtJmw5UjHeVyVroEqJXP1sFztKUy1qU+xvz3u/sfYJLa947b7nAN2Q==}

  simple-get@4.0.1:
    resolution: {integrity: sha512-brv7p5WgH0jmQJr1ZDDfKDOSeWWg+OVypG99A/5vYGPqJ6pxiaHLy8nxtFjBA7oMa01ebA9gfh1uMCFqOuXxvA==}

  statuses@2.0.2:
    resolution: {integrity: sha512-DvEy55V3DB7uknRo+4iOGT5fP1slR8wQohVdknigZPMpMstaKJQWhwiYBACJE3Ul2pTnATihhBYnRhZQHGBiRw==}
    engines: {node: '>= 0.8'}

  string_decoder@1.3.0:
    resolution: {integrity: sha512-hkRX8U1WjJFd8LsDJ2yQ/wWWxaopEsABU1XfkM8A+j0+85JAGppt16cr1Whg6KIbb4okU6Mql6BOj+uup/wKeA==}

  strip-json-comments@2.0.1:
    resolution: {integrity: sha512-4gB8na07fecVVkOI6Rs4e7T6NOTki5EmL7TUduTs6bu3EdnSycntVJ4re8kgZA+wx9IueI2Y11bfbgwtzuE0KQ==}
    engines: {node: '>=0.10.0'}

  tar-fs@2.1.4:
    resolution: {integrity: sha512-mDAjwmZdh7LTT6pNleZ05Yt65HC3E+NiQzl672vQG38jIrehtJk/J3mNwIg+vShQPcLF/LV7CMnDW6vjj6sfYQ==}

  tar-stream@2.2.0:
    resolution: {integrity: sha512-ujeqbceABgwMZxEJnk2HDY2DlnUZ+9oEcb1KzTVfYHio0UE6dG71n60d8D2I4qNvleWrrXpmjpt7vZeF1LnMZQ==}
    engines: {node: '>=6'}

  toidentifier@1.0.1:
    resolution: {integrity: sha512-o5sSPKEkg/DIQNmH43V0/uerLrpzVedkUh8tGNvaeXpfpuwjKenlSox/2O/BTlZUtEe+JG7s5YhEz608PlAHRA==}
    engines: {node: '>=0.6'}

  tunnel-agent@0.6.0:
    resolution: {integrity: sha512-McnNiV1l8RYeY8tBgEpuodCC1mLUdbSN+CYBL7kJsJNInOP8UjDDEwdk6Mw60vdLLrr5NHKZhMAOSrR2NZuQ+w==}

  type-is@2.0.1:
    resolution: {integrity: sha512-OZs6gsjF4vMp32qrCbiVSkrFmXtG/AZhY3t0iAMrMBiAZyV9oALtXO8hsrHbMXF9x6L3grlFuwW2oAz7cav+Gw==}
    engines: {node: '>= 0.6'}

  typescript@5.9.3:
    resolution: {integrity: sha512-jl1vZzPDinLr9eUt3J/t7V6FgNEw9QjvBPdysz9KfQDD41fQrC2Y4vKQdiaUpFT4bXlb1RHhLpp8wtm6M5TgSw==}
    engines: {node: '>=14.17'}
    hasBin: true

  undici-types@7.18.2:
    resolution: {integrity: sha512-AsuCzffGHJybSaRrmr5eHr81mwJU3kjw6M+uprWvCXiNeN9SOGwQ3Jn8jb8m3Z6izVgknn1R0FTCEAP2QrLY/w==}

  unpipe@1.0.0:
    resolution: {integrity: sha512-pjy2bYhSsufwWlKwPc+l3cN7+wuJlK6uz0YdJEOlQDbl6jo/YlPi4mb8agUkVC8BF7V8NuzeyPNqRksA3hztKQ==}
    engines: {node: '>= 0.8'}

  util-deprecate@1.0.2:
    resolution: {integrity: sha512-EPD5q1uXyFxJpCrLnCc1nHnq3gOa6DZBocAIiI2TaSCA7VCJ1UJDMagCzIkXNsUYfD1daK//LTEQ8xiIbrHtcw==}

  vary@1.1.2:
    resolution: {integrity: sha512-BNGbWLfd0eUPabhkXUVm0j8uuvREyTh5ovRa/dyow/BqAbZJyC+5fU+IzQOzmAKzYqYRAISoRhdQr3eIZ/PXqg==}
    engines: {node: '>= 0.8'}

  which@2.0.2:
    resolution: {integrity: sha512-BLI3Tl1TW3Pvl70l3yq3Y64i+awpwXqsGBYWkkqMtnbXgrMD+yj7rhW0kuEDxzJaYXGjEW5ogapKNMEKNMjibA==}
    engines: {node: '>= 8'}
    hasBin: true

  wrappy@1.0.2:
    resolution: {integrity: sha512-l4Sp/DRseor9wL6EvV2+TuQn63dMkPjZ/sp9XkghTEbV9KlPS1xUsZ3u7/IQO4wxtcFB4bgpQPRcR3QCvezPcQ==}

  zod-to-json-schema@3.25.1:
    resolution: {integrity: sha512-pM/SU9d3YAggzi6MtR4h7ruuQlqKtad8e9S0fmxcMi+ueAK5Korys/aWcV9LIIHTVbj01NdzxcnXSN+O74ZIVA==}
    peerDependencies:
      zod: ^3.25 || ^4

  zod@4.3.6:
    resolution: {integrity: sha512-rftlrkhHZOcjDwkGlnUtZZkvaPHCsDATp4pGpuOOMDaTdDDXF91wuVDJoWoPsKX/3YPQ5fHuF3STjcYyKr+Qhg==}

snapshots:

  '@hono/node-server@1.19.11(hono@4.12.9)':
    dependencies:
      hono: 4.12.9

  '@modelcontextprotocol/sdk@1.27.1(zod@4.3.6)':
    dependencies:
      '@hono/node-server': 1.19.11(hono@4.12.9)
      ajv: 8.18.0
      ajv-formats: 3.0.1(ajv@8.18.0)
      content-type: 1.0.5
      cors: 2.8.6
      cross-spawn: 7.0.6
      eventsource: 3.0.7
      eventsource-parser: 3.0.6
      express: 5.2.1
      express-rate-limit: 8.3.1(express@5.2.1)
      hono: 4.12.9
      jose: 6.2.2
      json-schema-typed: 8.0.2
      pkce-challenge: 5.0.1
      raw-body: 3.0.2
      zod: 4.3.6
      zod-to-json-schema: 3.25.1(zod@4.3.6)
    transitivePeerDependencies:
      - supports-color

  '@tsconfig/node24@24.0.4': {}

  '@types/better-sqlite3@7.6.13':
    dependencies:
      '@types/node': 25.5.0

  '@types/node@25.5.0':
    dependencies:
      undici-types: 7.18.2

  accepts@2.0.0:
    dependencies:
      mime-types: 3.0.2
      negotiator: 1.0.0

  ajv-formats@3.0.1(ajv@8.18.0):
    optionalDependencies:
      ajv: 8.18.0

  ajv@8.18.0:
    dependencies:
      fast-deep-equal: 3.1.3
      fast-uri: 3.1.0
      json-schema-traverse: 1.0.0
      require-from-string: 2.0.2

  base64-js@1.5.1: {}

  better-sqlite3@12.8.0:
    dependencies:
      bindings: 1.5.0
      prebuild-install: 7.1.3

  bindings@1.5.0:
    dependencies:
      file-uri-to-path: 1.0.0

  bl@4.1.0:
    dependencies:
      buffer: 5.7.1
      inherits: 2.0.4
      readable-stream: 3.6.2

  body-parser@2.2.2:
    dependencies:
      bytes: 3.1.2
      content-type: 1.0.5
      debug: 4.4.3
      http-errors: 2.0.1
      iconv-lite: 0.7.2
      on-finished: 2.4.1
      qs: 6.15.0
      raw-body: 3.0.2
      type-is: 2.0.1
    transitivePeerDependencies:
      - supports-color

  buffer@5.7.1:
    dependencies:
      base64-js: 1.5.1
      ieee754: 1.2.1

  bytes@3.1.2: {}

  call-bind-apply-helpers@1.0.2:
    dependencies:
      es-errors: 1.3.0
      function-bind: 1.1.2

  call-bound@1.0.4:
    dependencies:
      call-bind-apply-helpers: 1.0.2
      get-intrinsic: 1.3.0

  chownr@1.1.4: {}

  commander@14.0.3: {}

  content-disposition@1.0.1: {}

  content-type@1.0.5: {}

  cookie-signature@1.2.2: {}

  cookie@0.7.2: {}

  cors@2.8.6:
    dependencies:
      object-assign: 4.1.1
      vary: 1.1.2

  cross-spawn@7.0.6:
    dependencies:
      path-key: 3.1.1
      shebang-command: 2.0.0
      which: 2.0.2

  debug@4.4.3:
    dependencies:
      ms: 2.1.3

  decompress-response@6.0.0:
    dependencies:
      mimic-response: 3.1.0

  deep-extend@0.6.0: {}

  depd@2.0.0: {}

  detect-libc@2.1.2: {}

  dunder-proto@1.0.1:
    dependencies:
      call-bind-apply-helpers: 1.0.2
      es-errors: 1.3.0
      gopd: 1.2.0

  ee-first@1.1.1: {}

  encodeurl@2.0.0: {}

  end-of-stream@1.4.5:
    dependencies:
      once: 1.4.0

  es-define-property@1.0.1: {}

  es-errors@1.3.0: {}

  es-object-atoms@1.1.1:
    dependencies:
      es-errors: 1.3.0

  escape-html@1.0.3: {}

  etag@1.8.1: {}

  eventsource-parser@3.0.6: {}

  eventsource@3.0.7:
    dependencies:
      eventsource-parser: 3.0.6

  expand-template@2.0.3: {}

  express-rate-limit@8.3.1(express@5.2.1):
    dependencies:
      express: 5.2.1
      ip-address: 10.1.0

  express@5.2.1:
    dependencies:
      accepts: 2.0.0
      body-parser: 2.2.2
      content-disposition: 1.0.1
      content-type: 1.0.5
      cookie: 0.7.2
      cookie-signature: 1.2.2
      debug: 4.4.3
      depd: 2.0.0
      encodeurl: 2.0.0
      escape-html: 1.0.3
      etag: 1.8.1
      finalhandler: 2.1.1
      fresh: 2.0.0
      http-errors: 2.0.1
      merge-descriptors: 2.0.0
      mime-types: 3.0.2
      on-finished: 2.4.1
      once: 1.4.0
      parseurl: 1.3.3
      proxy-addr: 2.0.7
      qs: 6.15.0
      range-parser: 1.2.1
      router: 2.2.0
      send: 1.2.1
      serve-static: 2.2.1
      statuses: 2.0.2
      type-is: 2.0.1
      vary: 1.1.2
    transitivePeerDependencies:
      - supports-color

  fast-deep-equal@3.1.3: {}

  fast-uri@3.1.0: {}

  file-uri-to-path@1.0.0: {}

  finalhandler@2.1.1:
    dependencies:
      debug: 4.4.3
      encodeurl: 2.0.0
      escape-html: 1.0.3
      on-finished: 2.4.1
      parseurl: 1.3.3
      statuses: 2.0.2
    transitivePeerDependencies:
      - supports-color

  forwarded@0.2.0: {}

  fresh@2.0.0: {}

  fs-constants@1.0.0: {}

  function-bind@1.1.2: {}

  get-intrinsic@1.3.0:
    dependencies:
      call-bind-apply-helpers: 1.0.2
      es-define-property: 1.0.1
      es-errors: 1.3.0
      es-object-atoms: 1.1.1
      function-bind: 1.1.2
      get-proto: 1.0.1
      gopd: 1.2.0
      has-symbols: 1.1.0
      hasown: 2.0.2
      math-intrinsics: 1.1.0

  get-proto@1.0.1:
    dependencies:
      dunder-proto: 1.0.1
      es-object-atoms: 1.1.1

  github-from-package@0.0.0: {}

  gopd@1.2.0: {}

  has-symbols@1.1.0: {}

  hasown@2.0.2:
    dependencies:
      function-bind: 1.1.2

  hono@4.12.9: {}

  http-errors@2.0.1:
    dependencies:
      depd: 2.0.0
      inherits: 2.0.4
      setprototypeof: 1.2.0
      statuses: 2.0.2
      toidentifier: 1.0.1

  iconv-lite@0.7.2:
    dependencies:
      safer-buffer: 2.1.2

  ieee754@1.2.1: {}

  inherits@2.0.4: {}

  ini@1.3.8: {}

  ip-address@10.1.0: {}

  ipaddr.js@1.9.1: {}

  is-promise@4.0.0: {}

  isexe@2.0.0: {}

  jose@6.2.2: {}

  json-schema-traverse@1.0.0: {}

  json-schema-typed@8.0.2: {}

  math-intrinsics@1.1.0: {}

  media-typer@1.1.0: {}

  merge-descriptors@2.0.0: {}

  mime-db@1.54.0: {}

  mime-types@3.0.2:
    dependencies:
      mime-db: 1.54.0

  mimic-response@3.1.0: {}

  minimist@1.2.8: {}

  mkdirp-classic@0.5.3: {}

  ms@2.1.3: {}

  napi-build-utils@2.0.0: {}

  negotiator@1.0.0: {}

  node-abi@3.89.0:
    dependencies:
      semver: 7.7.4

  object-assign@4.1.1: {}

  object-inspect@1.13.4: {}

  on-finished@2.4.1:
    dependencies:
      ee-first: 1.1.1

  once@1.4.0:
    dependencies:
      wrappy: 1.0.2

  parseurl@1.3.3: {}

  path-key@3.1.1: {}

  path-to-regexp@8.3.0: {}

  pkce-challenge@5.0.1: {}

  prebuild-install@7.1.3:
    dependencies:
      detect-libc: 2.1.2
      expand-template: 2.0.3
      github-from-package: 0.0.0
      minimist: 1.2.8
      mkdirp-classic: 0.5.3
      napi-build-utils: 2.0.0
      node-abi: 3.89.0
      pump: 3.0.4
      rc: 1.2.8
      simple-get: 4.0.1
      tar-fs: 2.1.4
      tunnel-agent: 0.6.0

  proxy-addr@2.0.7:
    dependencies:
      forwarded: 0.2.0
      ipaddr.js: 1.9.1

  pump@3.0.4:
    dependencies:
      end-of-stream: 1.4.5
      once: 1.4.0

  qs@6.15.0:
    dependencies:
      side-channel: 1.1.0

  range-parser@1.2.1: {}

  raw-body@3.0.2:
    dependencies:
      bytes: 3.1.2
      http-errors: 2.0.1
      iconv-lite: 0.7.2
      unpipe: 1.0.0

  rc@1.2.8:
    dependencies:
      deep-extend: 0.6.0
      ini: 1.3.8
      minimist: 1.2.8
      strip-json-comments: 2.0.1

  readable-stream@3.6.2:
    dependencies:
      inherits: 2.0.4
      string_decoder: 1.3.0
      util-deprecate: 1.0.2

  require-from-string@2.0.2: {}

  router@2.2.0:
    dependencies:
      debug: 4.4.3
      depd: 2.0.0
      is-promise: 4.0.0
      parseurl: 1.3.3
      path-to-regexp: 8.3.0
    transitivePeerDependencies:
      - supports-color

  safe-buffer@5.2.1: {}

  safer-buffer@2.1.2: {}

  semver@7.7.4: {}

  send@1.2.1:
    dependencies:
      debug: 4.4.3
      encodeurl: 2.0.0
      escape-html: 1.0.3
      etag: 1.8.1
      fresh: 2.0.0
      http-errors: 2.0.1
      mime-types: 3.0.2
      ms: 2.1.3
      on-finished: 2.4.1
      range-parser: 1.2.1
      statuses: 2.0.2
    transitivePeerDependencies:
      - supports-color

  serve-static@2.2.1:
    dependencies:
      encodeurl: 2.0.0
      escape-html: 1.0.3
      parseurl: 1.3.3
      send: 1.2.1
    transitivePeerDependencies:
      - supports-color

  setprototypeof@1.2.0: {}

  shebang-command@2.0.0:
    dependencies:
      shebang-regex: 3.0.0

  shebang-regex@3.0.0: {}

  side-channel-list@1.0.0:
    dependencies:
      es-errors: 1.3.0
      object-inspect: 1.13.4

  side-channel-map@1.0.1:
    dependencies:
      call-bound: 1.0.4
      es-errors: 1.3.0
      get-intrinsic: 1.3.0
      object-inspect: 1.13.4

  side-channel-weakmap@1.0.2:
    dependencies:
      call-bound: 1.0.4
      es-errors: 1.3.0
      get-intrinsic: 1.3.0
      object-inspect: 1.13.4
      side-channel-map: 1.0.1

  side-channel@1.1.0:
    dependencies:
      es-errors: 1.3.0
      object-inspect: 1.13.4
      side-channel-list: 1.0.0
      side-channel-map: 1.0.1
      side-channel-weakmap: 1.0.2

  simple-concat@1.0.1: {}

  simple-get@4.0.1:
    dependencies:
      decompress-response: 6.0.0
      once: 1.4.0
      simple-concat: 1.0.1

  statuses@2.0.2: {}

  string_decoder@1.3.0:
    dependencies:
      safe-buffer: 5.2.1

  strip-json-comments@2.0.1: {}

  tar-fs@2.1.4:
    dependencies:
      chownr: 1.1.4
      mkdirp-classic: 0.5.3
      pump: 3.0.4
      tar-stream: 2.2.0

  tar-stream@2.2.0:
    dependencies:
      bl: 4.1.0
      end-of-stream: 1.4.5
      fs-constants: 1.0.0
      inherits: 2.0.4
      readable-stream: 3.6.2

  toidentifier@1.0.1: {}

  tunnel-agent@0.6.0:
    dependencies:
      safe-buffer: 5.2.1

  type-is@2.0.1:
    dependencies:
      content-type: 1.0.5
      media-typer: 1.1.0
      mime-types: 3.0.2

  typescript@5.9.3: {}

  undici-types@7.18.2: {}

  unpipe@1.0.0: {}

  util-deprecate@1.0.2: {}

  vary@1.1.2: {}

  which@2.0.2:
    dependencies:
      isexe: 2.0.0

  wrappy@1.0.2: {}

  zod-to-json-schema@3.25.1(zod@4.3.6):
    dependencies:
      zod: 4.3.6

  zod@4.3.6: {}



## Convention Reference (sibling files not modified by this commission)

=== CONTEXT FILE: README.md ===
# Nexus Mk 2.1

A framework for operating multi-agent AI workforces. Nexus provides the guild model: a structured workspace where animas (AI identities) receive commissions, use tools, record work, and collaborate through a shared Books database and event-driven Clockworks.

The framework is plugin-based. Almost everything — tools, engines, database schemas, anima management — is contributed by plugins. The core runtime is intentionally minimal.

---

## For users

### Install the CLI

```sh
npm install -g @shardworks/nexus
```

This installs the `nsg` command globally.

### Initialize a guild

A guild is the workspace where animas operate. Create one with `nsg init`:

```sh
nsg init ./my-guild --name my-guild
cd my-guild
```

This writes `guild.json`, `package.json`, `.gitignore`, and the `.nexus/` directory structure. It does not install any plugins or create any animas.

### Install plugins

Plugins are npm packages that contribute tools, engines, database schemas, and other capabilities to your guild. Install them with `nsg rig install`:

```sh
# Install from npm
nsg rig install @shardworks/nexus-stdlib

# Pin a version
nsg rig install @shardworks/nexus-stdlib@1.2.0

# Install from a git repository
nsg rig install git+https://github.com/acme/my-plugin.git

# Symlink a local directory during development
nsg rig install ./path/to/my-plugin --type link
```

By default, a plugin's tools are added to `baseTools` (available to all animas). To assign tools to specific roles instead:

```sh
nsg rig install @shardworks/nexus-stdlib --roles artificer,scribe
```

List installed plugins:

```sh
nsg rig list
```

Remove a plugin:

```sh
nsg rig remove nexus-stdlib
```

### Check guild status

```sh
nsg status          # guild name, nexus version, installed plugins, roles
nsg version         # framework version + installed plugin versions
```

### `guild.json`

The guild's central configuration file. Updated automatically by `nsg rig install` and `nsg rig remove`. Stores the plugin list, role definitions, tool assignments, Clockworks standing orders, and guild settings.

Plugins are listed by their derived plugin id (package name with the `@shardworks/` scope stripped):

```json
{
  "name": "my-guild",
  "nexus": "2.1.0",
  "plugins": ["nexus-stdlib", "nexus-clockworks"],
  "baseTools": ["commission", "signal", "list-writs"],
  "roles": { ... },
  "settings": { "model": "claude-opus-4-5" }
}
```

---

## For plugin authors

Nexus plugins are npm packages that contribute capabilities to a guild. There are two kinds:

- **Kit** — a passive package contributing tools, engines, relays, or other capabilities. No lifecycle; contributions are read at load time and used by consuming apparatuses.
- **Apparatus** — a package contributing persistent running infrastructure. Has a `start`/`stop` lifecycle, receives `GuildContext` at startup, and exposes a runtime API via `provides`.

Plugin authors import exclusively from `@shardworks/nexus-core`. The arbor runtime (`@shardworks/nexus-arbor`) is an internal concern of the CLI and session provider.

### Key points

- A plugin's **name is inferred from its npm package name** at load time — never declared in the manifest.
- A **kit** is a plain object exported as `{ kit: { ... } }`. The `tools` field (array of `ToolDefinition`) is the most common contribution.
- An **apparatus** is exported as `{ apparatus: { start, stop?, provides?, requires?, supportKit?, consumes? } }`.
- `requires` on a kit names apparatuses whose runtime APIs the kit's tool handlers will call. Hard startup failure if not installed.
- `requires` on an apparatus names other apparatuses that must be started first. Determines start order.
- Apparatus `provides` objects are retrieved at handler invocation time via `ctx.apparatus<T>(name)`.

### Authoring tools

The `tool()` function is the primary authoring entry point. Define a name, description, Zod param schema, and a handler:

```typescript
import { tool } from '@shardworks/nexus-core';
import { z } from 'zod';

const greet = tool({
  name: 'greet',
  description: 'Greet someone by name',
  params: {
    name: z.string().describe('Name to greet'),
  },
  handler: async ({ name }, ctx) => {
    return `Hello, ${name}! Guild root: ${ctx.home}`;
  },
});
```

The handler receives:
- `params` — validated input, typed from your Zod schemas
- `ctx` — a `HandlerContext` with `home` (guild root path) and `apparatus<T>(name)` for accessing started apparatus APIs

Restrict a tool to specific callers with `callableBy`:

```typescript
tool({
  name: 'admin-reset',
  callableBy: ['cli'],    // CLI only — not available to animas
  // ...
});
```

### Exporting a kit

A kit is the simplest plugin form — a plain object with a `kit` key:

```typescript
import { tool, type Kit } from '@shardworks/nexus-core';

const myTool = tool({ name: 'lookup', /* ... */ });

export default {
  kit: {
    tools: [myTool],

    // Optional: declare required apparatuses whose APIs your handlers call
    requires: ['nexus-books'],

    // Optional: document contribution fields for consuming apparatuses
    // (field types are defined by the apparatus packages that consume them)
    books: {
      records: { indexes: ['status', 'createdAt'] },
    },
  } satisfies Kit,
};
```

The `tools` field is the most common kit contribution. Other contribution fields (`engines`, `relays`, etc.) are defined by the apparatus packages that consume them — the framework treats any unknown field as opaque data.

### Exporting an apparatus

An apparatus has a `start`/`stop` lifecycle and can expose a runtime API:

```typescript
import { type Apparatus, type GuildContext } from '@shardworks/nexus-core';

// The API you expose to other plugins
interface MyApi {
  lookup(key: string): string | null;
}

const store = new Map<string, string>();

export default {
  apparatus: {
    // Apparatuses this one requires to be started first
    requires: ['nexus-books'],

    // The runtime API object exposed via ctx.apparatus<MyApi>('my-plugin')
    provides: {
      lookup(key: string) { return store.get(key) ?? null; },
    } satisfies MyApi,

    async start(ctx: GuildContext) {
      // ctx.apparatus<BooksApi>('nexus-books') is available here
      // ctx.kits() — snapshot of all loaded kits
      // ctx.on('plugin:initialized', handler) — react to kit contributions
    },

    async stop() {
      store.clear();
    },
  } satisfies Apparatus,
};
```

Consumers retrieve your `provides` object via `ctx.apparatus<MyApi>('my-plugin')` — either in their own `start()` or in tool handlers via `HandlerContext.apparatus<T>()`.

An apparatus can also contribute tools via `supportKit`:

```typescript
export default {
  apparatus: {
    supportKit: {
      tools: [myAdminTool],
    },
    // ...
  },
};
```

### `HandlerContext`

Injected into every tool and engine handler at invocation time:

```typescript
interface HandlerContext {
  home: string;                        // absolute path to the guild root
  apparatus<T>(name: string): T;       // access a started apparatus's provides object
}
```

### Further reading

- [`packages/arbor/README.md`](packages/arbor/README.md) — runtime API reference (`createArbor`, `Arbor`, `LoadedKit`, `LoadedApparatus`, `derivePluginId`, Books database)
- [`docs/architecture/plugins.md`](docs/architecture/plugins.md) — full plugin architecture specification
- [`docs/architecture/apparatus/books.md`](docs/architecture/apparatus/books.md) — Books apparatus design (in progress)

=== CONTEXT FILE: package.json ===
{
  "private": true,
  "packageManager": "pnpm@10.32.1",
  "version": "0.0.0",
  "license": "ISC",
  "repository": {
    "type": "git",
    "url": "https://github.com/shardworks/nexus-mk2"
  },
  "type": "module",
  "engines": {
    "node": "24.x"
  },
  "scripts": {
    "build": "pnpm -r build",
    "test": "pnpm -r test",
    "typecheck": "pnpm -r typecheck",
    "nsg": "node --disable-warning=ExperimentalWarning --experimental-transform-types packages/framework/cli/src/cli.ts",
    "vibe": "node --disable-warning=ExperimentalWarning --experimental-transform-types packages/framework/cli/src/cli.ts --guild-root /workspace/vibers"
  },
  "devDependencies": {
    "@tsconfig/node24": "24.0.4",
    "typescript": "5.9.3"
  },
  "pnpm": {
    "onlyBuiltDependencies": [
      "better-sqlite3"
    ]
  }
}

=== CONTEXT FILE: LICENSE ===
ISC License

Copyright (c) 2026 Sean Boots

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.

=== CONTEXT FILE: docs/architecture/apparatus/animator.md ===
# The Animator — API Contract

Status: **Draft — MVP**

Package: `@shardworks/animator-apparatus` · Plugin id: `animator`

> **⚠️ MVP scope.** This spec covers session launch, structured telemetry recording, streaming output, error guarantees, and session inspection tools. There is no MCP tool server, no Instrumentarium dependency, no role awareness, and no event signalling. The Animator receives a woven context and a working directory, launches a session provider process, and records what happened. See the Future sections for the target design.

---

## Purpose

The Animator brings animas to life. It is the guild's session apparatus — the single entry point for making an anima do work. Two API levels serve different callers:

- **`summon()`** — the high-level "make an anima do a thing" call. Composes context via The Loom, launches a session, records the result. This is what the summon relay, the CLI, and most callers use.
- **`animate()`** — the low-level call for callers that compose their own `AnimaWeave` (e.g. The Parlour for multi-turn conversations).

Both methods return an `AnimateHandle` synchronously — a `{ sessionId, chunks, result }` triple. The `sessionId` is available immediately, before the session completes — callers that only need to know the session was launched can return without awaiting. The `result` promise resolves when the session completes. The `chunks` async iterable yields output when `streaming: true` is set; otherwise it completes immediately with no items. There is no separate streaming method — the `streaming` flag on the request controls the behavior, and the return shape is always the same.

The Animator does not assemble system prompts — that is The Loom's job. `summon()` delegates context composition to The Loom; `animate()` accepts a pre-composed `AnimaWeave` from any source. This separation means The Loom can evolve its composition model (adding role instructions, curricula, temperaments) without changing The Animator's interface.

---

## Dependencies

```
requires:   ['stacks']
recommends: ['loom']
```

- **The Stacks** (required) — records session results (the `sessions` book) and full transcripts (the `transcripts` book).
- **The Loom** (recommended) — composes session context for `summon()`. Not needed for `animate()`, which accepts a pre-composed context. Resolved at call time, not at startup — the Animator starts without the Loom, but `summon()` throws if it's not installed. Arbor emits a startup warning if the Loom is not installed.

---

## Kit Contribution

The Animator contributes two books and session tools via its supportKit:

```typescript
supportKit: {
  books: {
    sessions: {
      indexes: ['startedAt', 'status', 'conversationId', 'provider'],
    },
    transcripts: {
      indexes: ['sessionId'],
    },
  },
  tools: [sessionList, sessionShow, summon],
},
```

### `session-list` tool

List recent sessions with optional filters. Returns session summaries ordered by `startedAt` descending (newest first).

| Parameter | Type | Description |
|---|---|---|
| `status` | `'running' \| 'completed' \| 'failed' \| 'timeout'` | Filter by terminal status |
| `provider` | `string` | Filter by provider name |
| `conversationId` | `string` | Filter by conversation |
| `limit` | `number` | Maximum results (default: 20) |

Returns: `SessionResult[]` (summary projection — id, status, provider, startedAt, endedAt, durationMs, exitCode, costUsd).

Callers that need to filter by metadata fields (e.g. `metadata.writId`, `metadata.animaName`) use The Stacks' query API directly. The tool exposes filters for fields the Animator itself indexes.

### `session-show` tool

Show full detail for a single session by id.

| Parameter | Type | Description |
|---|---|---|
| `id` | `string` | Session id |

Returns: the complete session record from The Stacks, including `tokenUsage`, `metadata`, `output`, and all indexed fields.

### `summon` tool

Summon an anima from the CLI. Calls `animator.summon()` with the guild home as working directory. CLI-only (`callableBy: 'cli'`). Requires `animate` permission.

| Parameter | Type | Description |
|---|---|---|
| `prompt` | `string` (required) | The work prompt — what the anima should do |
| `role` | `string` (optional) | Role to summon (e.g. `'artificer'`, `'scribe'`) |

Returns: session summary (id, status, provider, durationMs, exitCode, costUsd, tokenUsage, error).

---

## `AnimatorApi` Interface (`provides`)

```typescript
interface AnimatorApi {
  /**
   * Summon an anima — compose context via The Loom and launch a session.
   *
   * This is the high-level entry point. Passes the role to The Loom for
   * identity composition, then animate() for session launch and recording.
   * The work prompt bypasses The Loom and goes directly to the provider.
   * Auto-populates session metadata with `trigger: 'summon'` and `role`.
   *
   * Returns synchronously — the async work lives inside `result` and `chunks`.
   * Requires The Loom apparatus to be installed. Throws if not available.
   */
  summon(request: SummonRequest): AnimateHandle

  /**
   * Animate a session — launch an AI process with the given context.
   *
   * This is the low-level entry point for callers that compose their own
   * AnimaWeave (e.g. The Parlour for multi-turn conversations).
   *
   * Returns synchronously — the async work lives inside `result` and `chunks`.
   * Records the session result to The Stacks before `result` resolves.
   *
   * Set `streaming: true` to receive output chunks as the session runs.
   * When streaming is disabled (default), `chunks` completes immediately.
   */
  animate(request: AnimateRequest): AnimateHandle
}

/** The return value from animate() and summon(). */
interface AnimateHandle {
  /** Session ID, available immediately after launch — before the session completes. */
  sessionId: string
  /** Output chunks. Empty iterable when not streaming. */
  chunks: AsyncIterable<SessionChunk>
  /** Resolves to the final SessionResult after recording. */
  result: Promise<SessionResult>
}

/** A chunk of output from a running session. */
type SessionChunk =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; tool: string }
  | { type: 'tool_result'; tool: string }

interface SummonRequest {
  /** The work prompt — sent directly to the provider, bypasses The Loom. */
  prompt: string
  /** The role to summon (e.g. 'artificer'). Passed to The Loom for composition. */
  role?: string
  /** Working directory for the session. */
  cwd: string
  /** Optional conversation id to resume a multi-turn conversation. */
  conversationId?: string
  /**
   * Additional metadata recorded alongside the session.
   * Merged with auto-generated metadata ({ trigger: 'summon', role }).
   * See § Caller Metadata.
   */
  metadata?: Record<string, unknown>
  /**
   * Environment variable overrides for the session process.
   * Merged with the AnimaWeave's environment (request overrides weave).
   * Use this for per-task identity — e.g. setting GIT_AUTHOR_EMAIL
   * to a writ ID for commit attribution.
   * See § Session Environment.
   */
  environment?: Record<string, string>
  /** Enable streaming output (default false). */
  streaming?: boolean
}

interface AnimateRequest {
  /** The anima weave — composed identity context from The Loom (or self-composed). */
  context: AnimaWeave
  /** The work prompt — sent directly to the provider as initialPrompt. */
  prompt?: string
  /**
   * Working directory for the session.
   * The session provider launches the AI process here.
   */
  cwd: string
  /**
   * Optional conversation id to resume a multi-turn conversation.
   * If provided, the session provider resumes the existing conversation
   * rather than starting a new one.
   */
  conversationId?: string
  /**
   * Caller-supplied metadata recorded alongside the session.
   * The Animator stores this as-is — it does not interpret the contents.
   * See § Caller Metadata.
   */
  metadata?: Record<string, unknown>
  /**
   * Environment variable overrides for the session process.
   * Merged with the AnimaWeave's environment (request overrides weave).
   * See § Session Environment.
   */
  environment?: Record<string, string>
  /** Enable streaming output (default false). */
  streaming?: boolean
}

interface SessionResult {
  /** Unique session id (generated by The Animator). */
  id: string
  /** Terminal status. */
  status: 'completed' | 'failed' | 'timeout'
  /** When the session started (ISO-8601). */
  startedAt: string
  /** When the session ended (ISO-8601). */
  endedAt: string
  /** Wall-clock duration in milliseconds. */
  durationMs: number
  /** Provider name (e.g. 'claude-code'). */
  provider: string
  /** Numeric exit code from the provider process. */
  exitCode: number
  /** Error message if failed. */
  error?: string
  /** Conversation id (for multi-turn resume). */
  conversationId?: string
  /** Session id from the provider (e.g. for --resume). */
  providerSessionId?: string
  /** Token usage from the provider, if available. */
  tokenUsage?: TokenUsage
  /** Cost in USD from the provider, if available. */
  costUsd?: number
  /** Caller-supplied metadata, recorded as-is. See § Caller Metadata. */
  metadata?: Record<string, unknown>
  /**
   * The final assistant text from the session.
   * Extracted from the last assistant message in the provider's transcript.
   * Useful for programmatic consumers that need the session's conclusion
   * without parsing the full transcript (e.g. the Spider's review collect step).
   */
  output?: string
}

interface TokenUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
}
```

---

## Session Lifecycle

### `summon()` — the high-level path

```
summon(request)
  │
  ├─ 1. Resolve The Loom (throws if not installed)
  ├─ 2. Compose identity: loom.weave({ role })
  │     (Loom produces systemPrompt from anima identity layers;
  │      MVP: systemPrompt is undefined — composition not yet implemented)
  ├─ 3. Build AnimateRequest with:
  │     - context (AnimaWeave from Loom — includes environment)
  │     - prompt (work prompt, bypasses Loom)
  │     - environment (per-request overrides, if any)
  │     - auto-metadata { trigger: 'summon', role }
  └─ 4. Delegate to animate() → full animate lifecycle below
```

### `animate()` — the low-level path

```
animate(request)  →  { chunks, result }  (returned synchronously)
  │
  ├─ 1. Generate session id, capture startedAt
  ├─ 2. Write initial session record to The Stacks (status: 'running')
  │
  ├─ 3. Call provider.launch(config):
  │     - System prompt, initial prompt, model, cwd, conversationId
  │     - environment (merged: weave defaults + request overrides)
  │     - streaming flag passed through for provider to honor
  │     → provider returns { chunks, result } immediately
  │
  ├─ 4. Wrap provider result promise with recording:
  │     - On resolve: capture endedAt, durationMs, extract output from
  │       provider transcript, record session to Stacks, record transcript
  │       to transcripts book
  │     - On reject: record failed result, re-throw
  │     (ALWAYS records — see § Error Handling Contract)
  │
  └─ 5. Return { chunks, result } to caller
        chunks: the provider's iterable (may be empty)
        result: wraps provider result with Animator recording
```

The Animator does not branch on streaming. It passes the `streaming` flag to the provider via `SessionProviderConfig` and returns whatever the provider gives back. Providers that support streaming yield chunks when the flag is set; providers that don't return empty chunks. Callers should not assume chunks will be emitted.

---

## Session Providers

The Animator delegates AI process management to a **session provider** — a pluggable apparatus that knows how to launch and communicate with a specific AI system. The provider is discovered at runtime via guild config:

```json
{
  "animator": {
    "sessionProvider": "claude-code"
  }
}
```

The `sessionProvider` field names the plugin id of an apparatus whose `provides` object implements `AnimatorSessionProvider`. The Animator looks it up via `guild().apparatus<AnimatorSessionProvider>(config.sessionProvider)` at animate-time. Defaults to `'claude-code'` if not specified.

```typescript
interface AnimatorSessionProvider {
  /** Human-readable name (e.g. 'claude-code'). */
  name: string

  /**
   * Launch a session. Returns { chunks, result } synchronously.
   *
   * The result promise resolves when the AI process exits.
   * The chunks async iterable yields output when config.streaming
   * is true and the provider supports streaming; otherwise it
   * completes immediately with no items.
   *
   * Providers that don't support streaming simply ignore the flag
   * and return empty chunks — no separate method needed.
   */
  launch(config: SessionProviderConfig): {
    chunks: AsyncIterable<SessionChunk>
    result: Promise<SessionProviderResult>
  }
}

interface SessionProviderConfig {
  /** System prompt from the AnimaWeave — may be undefined at MVP. */
  systemPrompt?: string
  /** Work prompt from AnimateRequest.prompt — what the anima should do. */
  initialPrompt?: string
  /** Model to use (from guild settings). */
  model: string
  /** Optional conversation id for resume. */
  conversationId?: string
  /** Working directory for the session. */
  cwd: string
  /** Enable streaming output. Providers may ignore this flag. */
  streaming?: boolean
  /**
   * Environment variables for the session process.
   * Merged by the Animator from the AnimaWeave's environment and any
   * per-request overrides (request overrides weave). The provider
   * spreads these into the spawned process environment.
   */
  environment?: Record<string, string>
}

interface SessionProviderResult {
  /** Exit status. */
  status: 'completed' | 'failed' | 'timeout'
  /** Numeric exit code from the process. */
  exitCode: number
  /** Error message if failed. */
  error?: string
  /** Provider's session id (e.g. for --resume). */
  providerSessionId?: string
  /** Token usage, if the provider can report it. */
  tokenUsage?: TokenUsage
  /** Cost in USD, if the provider can report it. */
  costUsd?: number
  /** Full session transcript — array of NDJSON message objects. */
  transcript?: TranscriptMessage[]
  /**
   * The final assistant text from the session.
   * Extracted from the last assistant message's text content blocks.
   */
  output?: string
}

/** A single message from the NDJSON stream. Shape varies by provider. */
type TranscriptMessage = Record<string, unknown>
```

The default provider is `@shardworks/claude-code-apparatus` (plugin id: `claude-code`), which launches a `claude` CLI process in autonomous mode with `--output-format stream-json`. Provider packages import the `AnimatorSessionProvider` type from `@shardworks/animator-apparatus` and export an apparatus whose `provides` satisfies the interface.

---

## Error Handling Contract

The Animator guarantees that **step 5 (recording) always executes**, even if the provider throws or the process crashes. The provider launch (steps 3–4) is wrapped in try/finally. If the provider fails:

- The session record is still updated in The Stacks with `status: 'failed'`, the captured `endedAt`, `durationMs`, and the error message.
- `exitCode` defaults to `1` if the provider didn't return one.
- `tokenUsage` and `costUsd` are omitted (the provider may not have reported them).

If the Stacks write itself fails (e.g. database locked), the error is logged but does not propagate — the Animator returns or re-throws the provider error, not a recording error. Session data loss is preferable to masking the original failure.

```
Provider succeeds  → record status 'completed', return result
Provider fails     → record status 'failed' + error, re-throw provider error
Provider times out → record status 'timeout', return result with error
Recording fails    → log warning, continue with return/re-throw
```

---

## Caller Metadata

The `metadata` field on `AnimateRequest` is an opaque pass-through. The Animator records it in the session's Stacks entry without interpreting it. This allows callers to attach contextual information that the Animator itself doesn't understand:

```typescript
// Example: the summon relay attaches dispatch context
const { result } = animator.animate({
  context: wovenContext,
  cwd: '/path/to/worktree',
  metadata: {
    trigger: 'summon',
    animaId: 'anm-3f7b2c1',
    animaName: 'scribe',
    writId: 'wrt-8a4c9e2',
    workshop: 'nexus-mk2',
    workspaceKind: 'workshop-temp',
  },
});
const session = await result;

// Example: nsg consult attaches interactive session context
const { chunks, result: consultResult } = animator.animate({
  context: wovenContext,
  cwd: guildHome,
  streaming: true,
  metadata: {
    trigger: 'consult',
    animaId: 'anm-b2e8f41',
    animaName: 'coco',
  },
});
for await (const chunk of chunks) { /* stream to terminal */ }
const consultSession = await consultResult;
```

The `metadata` field is indexed in The Stacks as a JSON blob. Callers that need to query by metadata fields (e.g. "all sessions for writ X") use The Stacks' JSON path queries against the stored metadata.

This design keeps the Animator focused: it launches sessions and records what happened. Identity, dispatch context, and writ binding are concerns of the caller.

---

## Session Environment

The Animator supports environment variable injection into the spawned session process. This is the mechanism for giving animas distinct identities (e.g. git author) without modifying global host configuration.

Environment variables come from two sources, merged at session launch time:

1. **AnimaWeave** (`context.environment`) — identity-layer defaults from The Loom. Set per-role. Example: `GIT_AUTHOR_NAME=Artificer`, `GIT_AUTHOR_EMAIL=artificer@nexus.local`.
2. **Request** (`request.environment`) — per-task overrides from the caller. Example: the implement engine sets `GIT_AUTHOR_EMAIL=w-{writId}@nexus.local` for per-commission git attribution.

The merge is simple: `{ ...weave.environment, ...request.environment }`. Request values override weave values for the same key. The merged result is passed to the session provider as `SessionProviderConfig.environment`, which the provider spreads into the child process environment (`{ ...process.env, ...config.environment }`).

This keeps the Animator generic — it does not interpret environment variables or know about git. The Loom decides what identity defaults a role should have. Orchestrators decide what per-task overrides are needed. The Animator just merges and passes through.

---

## Invocation Paths

The Animator is called from three places:

1. **The summon relay** — when a standing order fires `summon: "role"`, the relay calls `animator.summon()`. This is the Clockworks-driven autonomous path.

2. **`nsg summon`** — the CLI command for direct dispatch. Calls `animator.summon()` to launch a session with a work prompt.

3. **`nsg consult`** — the CLI command for interactive multi-turn sessions. Uses The Parlour, which composes its own context and calls `animator.animate()` directly.

Paths 1 and 2 use `summon()` (high-level — The Loom composes the context). Path 3 uses `animate()` (low-level — The Parlour composes the context). The Animator doesn't know or care which path invoked it — the session lifecycle is identical.

### CLI streaming behavior

The `nsg summon` command invokes the `summon` tool through the generic CLI tool runner, which `await`s the handler and prints the return value. The tool contract (`ToolDefinition.handler`) returns a single value — there is no streaming return type. The CLI prints the structured session summary (id, status, cost, token usage) to stdout when the session completes.

However, **real-time session output is visible during execution via stderr**. The claude-code provider spawns `claude` with `--output-format stream-json` and parses NDJSON from the child process's stdout. As assistant text chunks arrive, the provider writes them to `process.stderr` as a side effect of parsing (in `parseStreamJsonMessage`). Because the CLI inherits the provider's stderr, users see streaming text output in the terminal while the session runs.

This is intentional: stderr carries progress output, stdout carries the structured result. The pattern is standard for CLI tools that produce both human-readable progress and machine-readable results. The streaming output is a provider-level concern — the Animator and the tool system are not involved.

---

## Open Questions

- ~~**Provider discovery.** How does The Animator find installed session providers?~~ **Resolved:** the `guild.json["animator"]["sessionProvider"]` config field names the plugin id of the provider apparatus. The Animator looks it up via `guild().apparatus()`. Defaults to `'claude-code'`.
- **Timeout.** How are session timeouts configured? MVP: no timeout (the session runs until the provider exits).
- **Concurrency.** Can multiple sessions run simultaneously? Current answer: yes, each `animate()` call is independent.

---

## Future: Event Signalling

When The Clockworks integration is updated, The Animator will signal lifecycle events:

- **`session.started`** — fired after step 2 (initial record written). Payload includes `sessionId`, `provider`, `startedAt`, and caller-supplied `metadata`.
- **`session.ended`** — fired after step 5 (result recorded). Payload includes `sessionId`, `status`, `exitCode`, `durationMs`, `costUsd`, `error`, and `metadata`.
- **`session.record-failed`** — fired if the Stacks write in step 5 fails. Payload includes `sessionId` and the recording error. This is a diagnostic event — it means session data was lost.

These events are essential for clockworks standing orders (e.g. retry-on-failure, cost alerting, session auditing). The Animator fires them best-effort — event signalling failures are logged but never mask session results.

Blocked on: Clockworks apparatus spec finalization.

---

## Future: Enriched Session Records

At MVP, the Animator records what it directly observes (provider telemetry) and what the caller passes via `metadata`. The session record in The Stacks looks like:

```typescript
// MVP session record (what The Animator writes)
{
  id: 'ses-a3f7b2c1',
  status: 'completed',
  startedAt: '2026-04-01T12:00:00Z',
  endedAt: '2026-04-01T12:05:30Z',
  durationMs: 330000,
  provider: 'claude-code',
  exitCode: 0,
  providerSessionId: 'claude-sess-xyz',
  tokenUsage: {
    inputTokens: 12500,
    outputTokens: 3200,
    cacheReadTokens: 8000,
    cacheWriteTokens: 1500,
  },
  costUsd: 0.42,
  conversationId: null,
  metadata: { trigger: 'summon', animaId: 'anm-3f7b2c1', writId: 'wrt-8a4c9e2' },
  output: '### Overall: PASS\n\n### Completeness\n...',  // final assistant message
}
```

When The Loom and The Roster are available, the session record can be enriched with anima provenance — a snapshot of the identity and composition at session time. This provenance is critical for experiment ethnography (understanding what an anima "was" when it produced a given output).

Enriched fields (contributed by the caller or a post-session enrichment step):

| Field | Source | Purpose |
|---|---|---|
| `animaId` | Roster / caller metadata | Which anima ran |
| `animaName` | Roster / caller metadata | Human-readable identity |
| `roles` | Roster | Roles the anima held at session time |
| `curriculumName` | Loom / manifest | Curriculum snapshot |
| `curriculumVersion` | Loom / manifest | Curriculum version for reproducibility |
| `temperamentName` | Loom / manifest | Temperament snapshot |
| `temperamentVersion` | Loom / manifest | Temperament version |
| `trigger` | Caller (clockworks / CLI) | What invoked the session |
| `workshop` | Caller (workspace resolver) | Workshop name |
| `workspaceKind` | Caller (workspace resolver) | guildhall / workshop-temp / workshop-managed |
| `writId` | Caller (clockworks) | Bound writ for traceability |
| `turnNumber` | Caller (conversation manager) | Position in a multi-turn conversation |

**Design question:** Should enrichment happen via (a) the caller passing structured metadata that The Animator promotes into indexed fields, or (b) a post-session enrichment step that reads the session record and augments it? Option (a) is simpler; option (b) keeps the Animator interface stable as the enrichment set grows. Both work with the current `metadata` bag — the difference is whether The Animator's Stacks schema gains named columns for these fields or whether they remain JSON-path-queried properties inside `metadata`.

---

## Transcripts

The Animator captures full session transcripts in a dedicated `transcripts` book, separate from the `sessions` book. This keeps the operational session records lean (small records, fast CDC) while making the full interaction history available for web UIs, operational logs, debugging, and research.

Each transcript record contains the complete NDJSON message stream from the session provider:

```typescript
interface TranscriptDoc {
  id: string                          // same as session id — 1:1 relationship
  messages: TranscriptMessage[]       // full NDJSON transcript
}

type TranscriptMessage = Record<string, unknown>
```

The transcript is written at session completion (step 4 in the animate lifecycle), alongside the session result. If the transcript write fails, the error is logged but does not propagate — same error handling contract as session recording.

The `output` field on the session record (the final assistant message text) is extracted from the transcript before storage. This gives programmatic consumers a fast path to the session's conclusion without parsing the full transcript.

### Data scale

Transcripts are typically 500KB–5MB per session. At ~60 sessions/day, this is ~30–300MB/day in the transcripts book. SQLite handles this comfortably — primary key lookups are microseconds regardless of row size. The transcripts book has no CDC handlers, so there is no amplification concern. Retention/archival is a future concern.

---

## Future: Tool-Equipped Sessions

When The Instrumentarium ships, The Animator gains the ability to launch sessions with an MCP tool server. Tool resolution is the Loom's responsibility — the Loom resolves role → permissions → tools and returns them on the `AnimaWeave`. The Animator receives the resolved tool set and handles MCP server lifecycle.

### Updated lifecycle

```
summon(request)
  │
  ├─ 1. Resolve The Loom
  ├─ 2. loom.weave({ role }) → AnimaWeave { systemPrompt, tools }
  │     (Loom resolves role → permissions, calls instrumentarium.resolve(),
  │      reads tool instructions, composes full system prompt)
  └─ 3. Delegate to animate()

animate(request)
  │
  ├─ 1. Generate session id
  ├─ 2. Write initial session record to The Stacks
  │
  ├─ 3. If context.tools is present, configure MCP server:
  │     - Register each tool from the resolved set
  │     - Each tool handler accesses guild infrastructure via guild() singleton
  │
  ├─ 4. Launch session provider (with MCP server attached)
  ├─ 5. Monitor process until exit
  ├─ 6. Record result to The Stacks
  └─ 7. Return SessionResult
```

The Animator does not call the Instrumentarium directly — it receives the tool set from the AnimaWeave. This keeps tool resolution and system prompt composition together in the Loom, where tool instructions can be woven into the prompt alongside the tools they describe.

### Updated `SessionProviderConfig`

```typescript
interface SessionProviderConfig {
  systemPrompt: string
  initialPrompt?: string
  /** Resolved tools to serve via MCP. */
  tools?: ToolDefinition[]
  model: string
  conversationId?: string
  cwd: string
  streaming?: boolean
  /** Environment variables for the session process. */
  environment?: Record<string, string>
}
```

The session provider interface gains an optional `tools` field. The provider configures the MCP server from the tool definitions. Providers that don't support MCP ignore it. The Animator handles MCP server lifecycle (start before launch, stop after exit).

---

## Future: Streaming Through the Tool Contract

The current CLI streaming path works via a stderr side-channel in the provider (see § CLI streaming behavior). This is pragmatic and works well for the `nsg summon` use case, but it has limitations:

- The CLI has no control over formatting or filtering of streamed output — it's raw provider text on stderr.
- MCP callers cannot receive streaming output at all — the tool contract returns a single value.
- Callers that want to interleave chunk types (text, tool_use, tool_result) with their own UI cannot — the stderr stream is unstructured text.

The Animator already supports structured streaming internally: `animate({ streaming: true })` returns an `AnimateHandle` whose `chunks` async iterable yields typed `SessionChunk` objects in real time. The gap is that the tool system has no way to expose this to callers.

### Design sketch

Extend `ToolDefinition.handler` to support an `AsyncIterable` return type:

```typescript
// Current
handler: (params: T) => unknown | Promise<unknown>

// Extended
handler: (params: T) => unknown | Promise<unknown> | AsyncIterable<unknown>
```

Each caller adapts the iterable to its transport:

- **CLI** — detects `AsyncIterable`, writes chunks to stdout as they arrive (e.g. text chunks as plain text, tool_use/tool_result as structured lines). Prints the final summary after iteration completes.
- **MCP** — maps the iterable to MCP's streaming response model (SSE or streaming content blocks, depending on MCP protocol version).
- **Engines** — consume the iterable directly for programmatic streaming.

The `summon` tool handler would change from:

```typescript
const { result } = animator.summon({ prompt, role, cwd });
const session = await result;
return { id: session.id, status: session.status, ... };
```

To:

```typescript
const { chunks, result } = animator.summon({ prompt, role, cwd, streaming: true });
yield* chunks;           // stream output to caller
const session = await result;
return { id: session.id, status: session.status, ... };
```

(Using an async generator handler, or a dedicated streaming return wrapper — exact syntax TBD.)

### What this enables

- CLI users see formatted, filterable streaming output on stdout instead of raw stderr.
- MCP clients (e.g. IDE extensions, web UIs) receive real-time session output through the standard tool response channel.
- The stderr side-channel in the provider becomes unnecessary — streaming is a first-class concern of the tool contract.

### Dependencies

- Tool contract change (`ToolDefinition` in tools-apparatus)
- CLI adapter for async iterable tool returns
- MCP server adapter for streaming tool responses
- Decision: should the streaming return include both chunks and a final summary, or just chunks (with the summary as the last chunk)?

Blocked on: tool contract design discussion, MCP streaming support.

=== CONTEXT FILE: docs/architecture/apparatus/spider.md ===
# The Spider — API Contract

Status: **Ready — MVP**

Package: `@shardworks/spider-apparatus` · Plugin id: `spider`

> **⚠️ MVP scope.** This spec covers a static rig graph: every commission gets the same five-engine pipeline (`draft → implement → review → revise → seal`). No origination, no dynamic extension, no capability resolution. The Spider runs engines directly — the Executor earns its independence later. See [What This Spec Does NOT Cover](#what-this-spec-does-not-cover) for the full list.

---

## Purpose

The Spider is the spine of the guild's rigging system. It runs a structured engine pipeline for each commission, advancing the rig one step at a time via a `crawl()` step function.

The Spider owns the rig's structural lifecycle — spawn, traverse, complete — and delegates everything else. Engine designs come from the Fabricator. Sessions come from the Animator. Draft bindings come from the Scriptorium. Writ transitions are handled by a CDC handler, not inline. The Spider itself is stateless between `crawl()` calls; all state lives in the Stacks.

---

## Dependencies

```
requires: ['fabricator', 'clerk', 'stacks']
```

- **The Fabricator** — resolves engine designs by `designId`.
- **The Clerk** — queries ready writs; receives writ transitions via CDC.
- **The Stacks** — persists rigs book, reads sessions book, hosts CDC handler on rigs book.

Engines pull their own apparatus dependencies (Scriptorium, Animator, Loom) via the `guild()` singleton — these are not Spider dependencies.

### Reference docs

- **The Rigging System** (`docs/architecture/rigging.md`) — full rigging architecture (Spider, Fabricator, Executor, Manifester). This spec implements a subset.
- **The Fabricator** (`docs/architecture/apparatus/fabricator.md`) — engine design registry and `EngineDesign` type definitions.
- **The Scriptorium** (`docs/architecture/apparatus/scriptorium.md`) — draft binding API (`openDraft`, `seal`, `abandonDraft`).
- **The Animator** (`docs/architecture/apparatus/animator.md`) — session API (`summon`, `animate`), `AnimateHandle`, `SessionResult`.
- **The Clerk** (`docs/architecture/apparatus/clerk.md`) — writ lifecycle API.
- **The Stacks** (`docs/architecture/apparatus/stacks.md`) — CDC phases, cascade vs notification, `watch()` API.

---

## The Engine Interface

Engines are the unit of work in a rig. Each engine implements a standard interface defined by the Fabricator apparatus (`@shardworks/fabricator-apparatus`). The `EngineDesign`, `EngineRunContext`, and `EngineRunResult` types are owned and exported by the Fabricator — see the Fabricator spec (`docs/architecture/apparatus/fabricator.md`) for full type definitions. Engines pull their own apparatus dependencies via `guild().apparatus(...)` — same pattern as tool handlers.

The Spider resolves engine designs by `designId` from the Fabricator at runtime: `fabricator.getEngineDesign(id)`.

### Kit contribution

The Spider contributes its five engine designs via its support kit:

```typescript
// In spider-apparatus plugin
supportKit: {
  engines: {
    draft:     draftEngine,
    implement: implementEngine,
    review:    reviewEngine,
    revise:    reviseEngine,
    seal:      sealEngine,
  },
  tools: [crawlOneTool, crawlContinualTool],
},
```

The Fabricator scans kit `engines` contributions at startup (same pattern as the Instrumentarium scanning tools). The Spider contributes its engines like any other kit — no special registration path.

---

## The Walk Function

The Spider's core is a single step function:

```typescript
interface SpiderApi {
  /**
   * Examine guild state and perform the single highest-priority action.
   * Returns a description of what was done, or null if there's nothing to do.
   */
  crawl(): Promise<CrawlResult | null>
}

type CrawlResult =
  | { action: 'engine-completed'; rigId: string; engineId: string }
  | { action: 'engine-started'; rigId: string; engineId: string }
  | { action: 'rig-spawned'; rigId: string; writId: string }
  | { action: 'rig-completed'; rigId: string; writId: string; outcome: 'completed' | 'failed' }
```

Each `crawl()` call does exactly one thing. The priority ordering:

1. **Collect a completed engine.** Scan all running rigs for an engine with `status === 'running'`. Read the session record from the sessions book by `engine.sessionId`. If the session has reached a terminal status (`completed` or `failed`), update the engine: set its status and populate its yields (or error). **Yield assembly:** look up the `EngineDesign` by `designId` from the Fabricator. If the design defines a `collect(sessionId, givens, context)` method, call it to assemble the yields — passing the same givens and context that were passed to `run()`. Otherwise, use the generic default: `{ sessionId, sessionStatus, output? }`. This keeps engine-specific yield logic (e.g. parsing review findings) in the engine, not the Spider. If the engine failed, mark the rig `failed` (same transaction). If the completed engine is the terminal engine (`seal`), mark the rig `completed` (same transaction). Rig status changes trigger the CDC handler (see below). Returns `rig-completed` if the rig transitioned, otherwise `engine-completed`. This is the first priority because it unblocks downstream engines.
2. **Run a ready engine.** An engine is ready when `status === 'pending'` and all engines in its `upstream` array have `status === 'completed'`. Look up the `EngineDesign` by `designId` from the Fabricator. Assemble givens (from givensSpec) and context (with upstream yields), then call `design.run(givens, context)`. For clockwork engines (`status: 'completed'` result): store the yields on the engine instance, mark it completed, and check for rig completion (same as step 1). Returns `engine-completed` (or `rig-completed` if this was the terminal engine). For quick engines (`status: 'launched'` result): store the `sessionId`, mark the engine `running`. Returns `engine-started`. Completion is collected on subsequent crawl calls via step 1.
3. **Spawn a rig.** If there's a ready writ with no rig, spawn the static graph. Returns `rig-spawned`.

If nothing qualifies at any level, return null (the guild is idle or all work is blocked on running quick engines).

### Operational model

The Spider exports two tools:

```
nsg crawl-continual   # starts polling loop, crawls every ~5s, runs indefinitely
nsg crawl-one         # single step (useful for debugging/testing)
```

The `crawl-continual` loop: call `crawl()`, sleep `pollIntervalMs` (default 5000), repeat. When `crawl()` returns null, the loop doesn't stop — it keeps polling. New writs posted via `nsg commission-post` from a separate terminal are picked up on the next poll cycle. Pass `--maxIdleCycles N` to stop after N consecutive idle cycles.

---

## Rig Data Model

### Rig

```typescript
interface Rig {
  id: string
  writId: string
  status: 'running' | 'completed' | 'failed'
  engines: EngineInstance[]
}
```

Stored in the Stacks `rigs` book. One rig per writ. The Spider reads and updates rigs via normal Stacks `put()`/`patch()` operations.

### Engine Instance

```typescript
interface EngineInstance {
  id: string               // unique within the rig, e.g. 'draft', 'implement', 'review', 'revise', 'seal'
  designId: string         // engine design id — resolved from the Fabricator
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  upstream: string[]       // ids of engines that must complete first (empty = first engine)
  givensSpec: Record<string, unknown>  // givens specification — literal values now, templates later
  yields: unknown          // set on completion — the engine's yields (see Yield Types below)
  error?: string           // set on failure
  sessionId?: string       // set when run() returns 'launched' — Spider polls for completion
  startedAt?: string       // ISO-8601, set when engine begins running (enables future timeout detection)
  completedAt?: string     // ISO-8601, set when engine reaches terminal status
}
```

An engine is **ready** when: `status === 'pending'` and all engines in its `upstream` array have `status === 'completed'`.

### The Static Graph

Every spawned rig gets this engine list:

```typescript
function spawnStaticRig(writ: Writ, config: SpiderConfig): EngineInstance[] {
  return [
    { id: 'draft',     designId: 'draft',     status: 'pending', upstream: [],
      givensSpec: { writ }, yields: null },
    { id: 'implement', designId: 'implement', status: 'pending', upstream: ['draft'],
      givensSpec: { writ, role: config.role }, yields: null },
    { id: 'review',    designId: 'review',    status: 'pending', upstream: ['implement'],
      givensSpec: { writ, role: 'reviewer', buildCommand: config.buildCommand, testCommand: config.testCommand }, yields: null },
    { id: 'revise',    designId: 'revise',    status: 'pending', upstream: ['review'],
      givensSpec: { writ, role: config.role }, yields: null },
    { id: 'seal',      designId: 'seal',      status: 'pending', upstream: ['revise'],
      givensSpec: {}, yields: null },
  ]
}
```

The `givensSpec` is populated from the Spider's config at rig spawn time. The rig is self-contained after spawning — no runtime config lookups needed. The `writ` is passed as a given to engines that need it (most do; `seal` doesn't). All engines start with `yields: null` — yields are populated when the engine completes (see [Yield Types](#yield-types-and-data-flow)).

The rig is **completed** when the terminal engine (`seal`) has `status === 'completed'`. The rig is **failed** when any engine has `status === 'failed'`.

---

## Yield Types and Data Flow

Each engine produces typed yields that downstream engines consume. The yields are stored on the `EngineInstance.yields` field in the Stacks.

**Serialization constraint:** Because yields are persisted to the Stacks (JSON-backed), all yield values **must be JSON-serializable**. The Spider should validate this at storage time — if an engine returns a non-serializable value (function, circular reference, etc.), the engine fails with a clear error. This is important because engines are a plugin extension point — kit authors need a hard boundary, not a silent corruption.

When the Spider runs an engine, it assembles givens from the givensSpec only — upstream yields are **not** merged into givens. Engines that need upstream data access it via the `context.upstream` escape hatch:

```typescript
function assembleGivensAndContext(rig: Rig, engine: EngineInstance) {
  // Collect all completed engine yields for the context escape hatch.
  // All completed yields are included regardless of graph distance —
  // simpler than chain-walking and equivalent for the static graph.
  const upstream: Record<string, unknown> = {}
  for (const e of rig.engines) {
    if (e.status === 'completed' && e.yields !== undefined) {
      upstream[e.id] = e.yields
    }
  }

  // Givens = givensSpec only. Upstream data stays on context.
  const givens = { ...engine.givensSpec }

  const context: EngineRunContext = {
    engineId: engine.id,
    upstream,
  }

  return { givens, context }
}
```

Givens contain only what the givensSpec declares — static values set at rig spawn time (writ, role, buildCommand, etc.). Engines that need upstream data (worktree path, review findings, etc.) pull it from `context.upstream` by engine id. This keeps the givens contract clean: what you see in the givensSpec is exactly what the engine receives.

### `DraftYields`

```typescript
interface DraftYields {
  draftId: string         // the draft binding's unique id (from DraftRecord.id)
  codexName: string       // which codex this draft is on (from DraftRecord.codexName)
  branch: string          // git branch name for the draft (from DraftRecord.branch)
  path: string            // absolute path to the draft worktree (from DraftRecord.path)
  baseSha: string         // commit SHA at draft open — used to compute diffs later
}
```

**Produced by:** `draft` engine
**Consumed by:** all downstream engines. Establishes the physical workspace.

> **Note:** Field names mirror the Scriptorium's `DraftRecord` type (`codexName`, `branch`, `path`) rather than inventing Spider-specific aliases. `baseSha` is the only field the draft engine adds itself — by reading `HEAD` after opening the draft.

### `ImplementYields`

```typescript
interface ImplementYields {
  sessionId: string
  sessionStatus: 'completed' | 'failed'
}
```

**Produced by:** `implement` engine (set by Spider's collect step when session completes)
**Consumed by:** `review` (needs to know the session completed)

### `ReviewYields`

```typescript
interface ReviewYields {
  sessionId: string
  passed: boolean                      // reviewer's overall assessment
  findings: string                     // structured markdown: what passed, what's missing, what's wrong
  mechanicalChecks: MechanicalCheck[]  // build/test results run before the reviewer session
}

interface MechanicalCheck {
  name: 'build' | 'test'
  passed: boolean
  output: string    // stdout+stderr, truncated to 4KB
  durationMs: number
}
```

**Produced by:** `review` engine
**Consumed by:** `revise` (needs `passed` to decide whether to do work, needs `findings` as context)

The `mechanicalChecks` are run by the engine *before* launching the reviewer session — their results are included in the reviewer's prompt.

### `ReviseYields`

```typescript
interface ReviseYields {
  sessionId: string
  sessionStatus: 'completed' | 'failed'
}
```

**Produced by:** `revise` engine (set by Spider's collect step when session completes)
**Consumed by:** `seal` (no data dependency — seal just needs revise to be done)

### `SealYields`

```typescript
interface SealYields {
  sealedCommit: string                     // the commit SHA at head of target after sealing (from SealResult)
  strategy: 'fast-forward' | 'rebase'      // merge strategy used (from SealResult)
  retries: number                          // rebase retry attempts needed (from SealResult)
  inscriptionsSealed: number               // number of commits incorporated (from SealResult)
}
```

**Produced by:** `seal` engine
**Consumed by:** nothing (terminal). Used by the CDC handler for the writ transition resolution message.

> **Note:** Field names mirror the Scriptorium's `SealResult` type. The Scriptorium's `seal()` method pushes the target branch to the remote after sealing.

---

## Engine Implementations

Each engine is an `EngineDesign` contributed by the Spider's support kit. The engine's `run()` method receives assembled givens and a thin context, and returns an `EngineRunResult`. Engines pull apparatus dependencies via `guild().apparatus(...)`.

### `draft` (clockwork)

Opens a draft binding on the commission's target codex.

```typescript
async run(givens: Record<string, unknown>, _context: EngineRunContext): Promise<EngineRunResult> {
  const scriptorium = guild().apparatus<ScriptoriumApi>('codexes')
  const writ = givens.writ as Writ
  const draft = await scriptorium.openDraft({ codexName: writ.codex, associatedWith: writ.id })
  const baseSha = await getHeadSha(draft.path)

  return {
    status: 'completed',
    yields: { draftId: draft.id, codexName: draft.codexName, branch: draft.branch, path: draft.path, baseSha } satisfies DraftYields,
  }
}
```

### `implement` (quick)

Summons an anima to do the commissioned work.

```typescript
async run(givens: Record<string, unknown>, context: EngineRunContext): Promise<EngineRunResult> {
  const animator = guild().apparatus<AnimatorApi>('animator')
  const writ = givens.writ as Writ
  const draft = context.upstream.draft as DraftYields

  const prompt = `${writ.body}\n\nCommit all changes before ending your session.`

  const handle = animator.summon({
    role: givens.role as string,
    prompt,
    cwd: draft.path,
    environment: { GIT_AUTHOR_EMAIL: `${writ.id}@nexus.local` },
    metadata: { engineId: context.engineId, writId: writ.id },
  })

  return { status: 'launched', sessionId: handle.sessionId }
}
```

The implement engine wraps the writ body with a commit instruction — each engine owns its own prompt contract rather than relying on `dispatch.sh` to append instructions to the writ body.

**Collect step:** The implement engine has no `collect` method — the Spider uses the generic default: `{ sessionId, sessionStatus, output? }`.

### `review` (quick)

Runs mechanical checks, then summons a reviewer anima to assess the implementation.

```typescript
async run(givens: Record<string, unknown>, context: EngineRunContext): Promise<EngineRunResult> {
  const animator = guild().apparatus<AnimatorApi>('animator')
  const writ = givens.writ as Writ
  const draft = context.upstream.draft as DraftYields

  // 1. Run mechanical checks synchronously
  const checks: MechanicalCheck[] = []
  if (givens.buildCommand) {
    checks.push(await runCheck('build', givens.buildCommand as string, draft.path))
  }
  if (givens.testCommand) {
    checks.push(await runCheck('test', givens.testCommand as string, draft.path))
  }

  // 2. Compute diff since draft opened
  const diff = await gitDiff(draft.path, draft.baseSha)
  const status = await gitStatus(draft.path)

  // 3. Assemble review prompt
  const prompt = assembleReviewPrompt(writ, diff, status, checks)

  // 4. Launch reviewer session
  const handle = animator.summon({
    role: givens.role as string,
    prompt,
    cwd: draft.path,
    metadata: {
      engineId: context.engineId,
      writId: writ.id,
      mechanicalChecks: checks,  // stash for collect step to retrieve
    },
  })

  return { status: 'launched', sessionId: handle.sessionId }
}
```

**Review prompt template:**

```markdown
# Code Review

You are reviewing work on a commission. Your job is to assess whether the
implementation satisfies the spec, identify any gaps or problems, and produce
a structured findings document.

## The Commission (Spec)

{writ.body}

## Implementation Diff

Changes since the draft was opened:

```diff
{git diff draft.baseSha..HEAD in worktree}
```

## Current Worktree State

```
{git status --porcelain}
```

## Mechanical Check Results

{for each check}
### {name}: {PASSED | FAILED}
```
{output, truncated to 4KB}
```
{end for}

## Instructions

Assess the implementation against the spec. Produce your findings in this format:

### Overall: PASS or FAIL

### Completeness
- Which spec requirements are addressed?
- Which are missing or partially addressed?

### Correctness
- Are there bugs, logic errors, or regressions?
- Do the tests pass? If not, what fails?

### Quality
- Code style consistent with the codebase?
- Appropriate test coverage for new code?
- Any concerns about the approach?

### Required Changes (if FAIL)
Numbered list of specific changes needed, in priority order.

Produce your findings as your final message in the format above.
```

**Collect step:** The review engine defines a `collect` method that the Spider calls when the session completes. The engine looks up the session record itself and parses the reviewer's structured findings. No file is written to the worktree (review artifacts don't belong in the codebase).

```typescript
async collect(sessionId: string, _givens: Record<string, unknown>, _context: EngineRunContext): Promise<ReviewYields> {
  const stacks = guild().apparatus<StacksApi>('stacks')
  const session = await stacks.readBook<SessionDoc>('animator', 'sessions').get(sessionId)
  const findings = session?.output ?? ''
  const passed = /^###\s*Overall:\s*PASS/mi.test(findings)
  const mechanicalChecks = (session?.metadata?.mechanicalChecks as MechanicalCheck[]) ?? []
  return { sessionId, passed, findings, mechanicalChecks }
}
```

**Dependency:** The Animator's `SessionResult.output` field (the final assistant message text) must be available for this to work. See the Animator spec (`docs/architecture/apparatus/animator.md`) — the `output` field is populated from the session provider's transcript at recording time.

### `revise` (quick)

Summons an anima to address review findings.

```typescript
async run(givens: Record<string, unknown>, context: EngineRunContext): Promise<EngineRunResult> {
  const animator = guild().apparatus<AnimatorApi>('animator')
  const writ = givens.writ as Writ
  const draft = context.upstream.draft as DraftYields
  const review = context.upstream.review as ReviewYields

  const status = await gitStatus(draft.path)
  const diff = await gitDiffUncommitted(draft.path)
  const prompt = assembleRevisionPrompt(writ, review, status, diff)

  const handle = animator.summon({
    role: givens.role as string,
    prompt,
    cwd: draft.path,
    environment: { GIT_AUTHOR_EMAIL: `${writ.id}@nexus.local` },
    metadata: { engineId: context.engineId, writId: writ.id },
  })

  return { status: 'launched', sessionId: handle.sessionId }
}
```

**Revision prompt template:**

```markdown
# Revision Pass

You are revising prior work on a commission based on review findings.

## The Commission (Spec)

{writ.body}

## Review Findings

{review.findings}

## Review Result: {PASS | FAIL}

{if review.passed}
The review passed. No changes are required. Confirm the work looks correct
and exit. Do not make unnecessary changes or spend unnecessary time reassessing.
{else}
The review identified issues that need to be addressed. See "Required Changes"
in the findings above. Address each item, then commit your changes.
{end if}

## Current State

```
{git status --porcelain}
```

```diff
{git diff HEAD, if any uncommitted changes}
```

Commit all changes before ending your session.
```

**Collect step:** The revise engine has no `collect` method — the Spider uses the generic default: `{ sessionId, sessionStatus, output? }`.

### `seal` (clockwork)

Seals the draft binding.

```typescript
async run(_givens: Record<string, unknown>, ctx: EngineRunContext): Promise<EngineRunResult> {
  const scriptorium = guild().apparatus<ScriptoriumApi>('codexes')
  const draft = ctx.upstream.draft as DraftYields

  const result = await scriptorium.seal({
    codexName: draft.codexName,
    sourceBranch: draft.branch,
  })

  return {
    status: 'completed',
    yields: {
      sealedCommit: result.sealedCommit,
      strategy: result.strategy,
      retries: result.retries,
      inscriptionsSealed: result.inscriptionsSealed,
    } satisfies SealYields,
  }
}
```

The seal engine does **not** transition the writ — that's handled by the CDC handler on the rigs book.

---

## CDC Handler

The Spider registers one CDC handler at startup:

### Rig terminal state → writ transition

**Book:** `rigs`
**Phase:** Phase 1 (cascade) — the writ transition joins the same transaction as the rig update
**Trigger:** rig status transitions to `completed` or `failed`

```typescript
stacks.watch('rigs', async (event) => {
  if (event.type !== 'update') return
  const rig = event.doc
  const prev = event.prev

  // Only fire on terminal transitions
  if (prev.status === rig.status) return
  if (rig.status !== 'completed' && rig.status !== 'failed') return

  if (rig.status === 'completed') {
    const sealYields = rig.engines.find(e => e.id === 'seal')?.yields as SealYields
    await clerk.transition(rig.writId, 'completed', {
      resolution: `Sealed at ${sealYields.sealedCommit} (${sealYields.strategy}, ${sealYields.inscriptionsSealed} inscriptions).`,
    })
  } else {
    const failedEngine = rig.engines.find(e => e.status === 'failed')
    await clerk.transition(rig.writId, 'failed', {
      resolution: `Engine '${failedEngine?.id}' failed: ${failedEngine?.error ?? 'unknown error'}`,
    })
  }
})
```

Because this is Phase 1 (cascade), the writ transition joins the same transaction as the rig status update. If the Clerk call throws, the rig update rolls back too.

---

## Engine Failure

When any engine fails (throws, or a quick engine's session has `status: 'failed'`):

1. The engine is marked `status: 'failed'` with the error (detected during "collect completed engines" for quick engines, or directly during execution for clockwork engines)
2. All engines in the rig with `status === 'pending'` are set to `status: 'cancelled'` — they will never run. Engines already in `'running'`, `'completed'`, or `'failed'` are left untouched. Cancelled engines do **not** receive `completedAt` or `error` — cancellation is a consequence, not a failure.
3. The rig is marked `status: 'failed'` (same transaction as steps 1 and 2)
4. CDC fires on the rig status change → handler calls Clerk API to transition the writ to `failed`
5. The draft is **not** abandoned — preserved for patron inspection

No retry. No recovery. The patron inspects and decides what to do. This is appropriate for the static rig — see [Future Evolution](#future-evolution) for the retry/recovery direction.

Quick engine "failure" definition: if the Animator session completes with `status: 'failed'`, the engine fails. If the session completes with `status: 'completed'`, the engine succeeds — even if the anima's work is incomplete (that's the review engine's job to catch, not the Spider's).

---

## Dependency Map

```
Spider
  ├── Fabricator  (resolve engine designs by designId)
  ├── Clerk       (query ready writs, transition writ state via CDC)
  ├── Stacks      (persist rigs book, read sessions book, CDC handler on rigs book)
  │
  Engines (via guild() singleton, not Spider dependencies)
  ├── Scriptorium (draft, seal engines — open drafts, seal)
  ├── Animator    (implement, review, revise engines — summon animas)
  └── Loom        (via Animator's summon — context composition)
```

---

## Future Evolution

These are known directions the Spider and its data model will grow. None are in scope for the static rig MVP.

- **givensSpec templates.** The givensSpec currently holds literal values set at rig spawn time. It will grow to support template expressions (e.g. `${draft.worktreePath}`) that resolve specific values from upstream yields into typed givens, replacing the current reliance on the `context.upstream` escape hatch.
- **Engine needs declarations.** Engine designs will declare a `needs` specification that controls which upstream yields are included and how they're mapped — making the data flow between engines explicit and type-safe.
- **Typed engine contracts.** The `Record<string, unknown>` givens map with type assertions is scaffolding. The needs/planning system will introduce typed contracts between engines — defining what each engine requires and provides. This scaffolding gets replaced, not extended.
- **Dynamic rig extension.** Capability resolution (via the Fabricator) and rig growth at runtime. Engines can declare needs that the Fabricator resolves to additional engine chains, grafted onto the rig mid-execution.
- **Retry and recovery.** The static rig has no retry. Recovery logic arrives with dynamic extension — a failed engine can trigger a recovery chain rather than failing the whole rig.
- **Engine timeouts.** The `startedAt` field on engine instances is included in the data model for future use. During the collect step, the Spider checks `startedAt` against a configurable timeout. If an engine has been running longer than the threshold, the Spider marks it failed (and optionally terminates the session).
- **Unified capability catalog.** The Fabricator may absorb tool designs from the Instrumentarium, becoming the single answer to "what can this guild do?" regardless of whether the answer is an engine or a tool.

---

## What This Spec Does NOT Cover

- **Origination.** Commission → rig mapping is hardcoded (static graph).
- **The Executor as a separate apparatus.** The Spider runs engines directly — clockwork engines inline, quick engines via the Animator. The Executor earns its independence when substrate switching (Docker, remote VM) is needed. Key design constraint: the Spider currently `await`s `design.run()`, meaning a slow or misbehaving engine blocks the entire crawl loop. The Executor must not have this property — engine execution should be fully non-blocking, with yields persisted to a book so the orchestrator can poll for completion. This is essential for remote and Docker runners where the process that ran the engine is not the process polling for results.
- **Concurrent rigs.** The priority system supports multiple rigs in principle, but the polling loop + single-guild model means we process one commission at a time in practice. Concurrency comes naturally when the Spider processes multiple ready engines across rigs.
- **Reviewer role curriculum/temperament.** The `reviewer` role exists with a blank identity. The review engine assembles the prompt. Loom content for the reviewer is a separate concern.

---

## Configuration

```json
{
  "spider": {
    "pollIntervalMs": 5000,
    "buildCommand": "pnpm build",
    "testCommand": "pnpm test",
    "variables": {
      "role": "artificer"
    }
  }
}
```

All fields optional. `pollIntervalMs` defaults to `5000`. `buildCommand` and `testCommand` are run by the review engine before launching the reviewer; omitted means those mechanical checks are skipped (reviewer anima still does spec-vs-diff assessment).

The `variables` dict contains user-defined values available in rig template givens as `$vars.<key>`. For example, `"$vars.role"` in a template givens entry resolves to `variables.role` at rig spawn time. The only other supported variable reference is `"$writ"`, which resolves to the full WritDoc for the spawned rig. Variables resolving to `undefined` (key absent from `variables`) cause the givens key to be omitted entirely.

=== CONTEXT FILE: docs/architecture/apparatus/scriptorium.md ===
# The Scriptorium — API Contract

Status: **Draft**

Package: `@shardworks/codexes-apparatus` · Plugin id: `codexes`

> **⚠️ Future work.** Clockworks event emission (see [Future: Clockworks Events](#future-clockworks-events)) and the Surveyor's codex-awareness integration are not yet implemented.

---

## Purpose

The Scriptorium manages the guild's codexes — the git repositories where the guild's inscriptions accumulate. It owns the registry of known codexes, maintains local bare clones for efficient access, opens and closes draft bindings (worktrees) for concurrent work, and handles the sealing lifecycle that incorporates drafts into the sealed binding.

The Scriptorium does **not** know what a codex contains or what work applies to it (that's the Surveyor's domain). It does **not** orchestrate which anima works in which draft (that's the caller's concern — rig engines or direct invocation). It is pure git infrastructure — repository lifecycle, draft isolation, and branch management.

### Vocabulary Mapping

The Scriptorium's tools use the [guild metaphor's binding vocabulary](../../guild-metaphor.md#binding-canonical). The mapping to git concepts:

| Metaphor | Git | Scriptorium API |
|----------|-----|-----------------|
| **Codex** | Repository | `add`, `list`, `show`, `remove`, `fetch` |
| **Draft binding** (draft) | Worktree + branch | `openDraft`, `listDrafts`, `abandonDraft` |
| **Sealed binding** | Default branch (e.g. `main`) | Target of `seal` |
| **Sealing** | Fast-forward merge (or rebase + ff) | `seal` |
| **Abandoning** | Remove worktree + branch | `abandonDraft` |
| **Inscription** | Commit | *(not managed by the Scriptorium — animas inscribe directly via git)* |

Use plain git terms (branch, commit, merge) in error messages and logs where precision matters; the binding vocabulary is for the tool-facing API and documentation.

---

## Kit Interface

The Scriptorium does not consume kit contributions. No `consumes` declaration.

---

## Support Kit

```typescript
supportKit: {
  tools: [
    codexAddTool,
    codexListTool,
    codexShowTool,
    codexRemoveTool,
    codexPushTool,
    draftOpenTool,
    draftListTool,
    draftAbandonTool,
    draftSealTool,
  ],
},
```

---

## `ScriptoriumApi` Interface (`provides`)

```typescript
interface ScriptoriumApi {
  // ── Codex Registry ──────────────────────────────────────────

  /**
   * Register an existing repository as a codex.
   * Clones a bare copy to `.nexus/codexes/<name>.git` and adds the
   * entry to the `codexes` config section in `guild.json`.
   * Blocks until the clone completes.
   */
  add(name: string, remoteUrl: string): Promise<CodexRecord>

  /**
   * List all registered codexes with their status.
   */
  list(): Promise<CodexRecord[]>

  /**
   * Show details for a single codex, including active drafts.
   */
  show(name: string): Promise<CodexDetail>

  /**
   * Remove a codex from the guild. Abandons all active drafts,
   * removes the bare clone from `.nexus/codexes/`, and removes the
   * entry from `guild.json`. Does NOT delete the remote repository.
   */
  remove(name: string): Promise<void>

  /**
   * Fetch latest refs from the remote for a codex's bare clone.
   * Called automatically before draft creation and sealing; can
   * also be invoked manually.
   */
  fetch(name: string): Promise<void>

  /**
   * Push a branch to the codex's remote.
   * Pushes the specified branch (default: codex's default branch)
   * to the bare clone's configured remote. Does not force-push.
   */
  push(request: PushRequest): Promise<void>

  // ── Draft Binding Lifecycle ─────────────────────────────────

  /**
   * Open a draft binding on a codex.
   *
   * Creates a new git branch from `startPoint` (default: the codex's
   * sealed binding) and checks it out as an isolated worktree under
   * `.nexus/worktrees/<codex>/<branch>`. Fetches from the remote
   * before branching to ensure freshness.
   *
   * If `branch` is omitted, generates one automatically as `draft-<ulid>`.
   * Rejects with a clear error if a draft with the same branch name
   * already exists for this codex.
   */
  openDraft(request: OpenDraftRequest): Promise<DraftRecord>

  /**
   * List active drafts, optionally filtered by codex.
   */
  listDrafts(codexName?: string): Promise<DraftRecord[]>

  /**
   * Abandon a draft — remove the draft's worktree and git branch.
   * Fails if the draft has unsealed inscriptions unless `force: true`.
   * The inscriptions persist in the git reflog but the draft is no
   * longer active.
   */
  abandonDraft(request: AbandonDraftRequest): Promise<void>

  /**
   * Seal a draft — incorporate its inscriptions into the sealed binding.
   *
   * Git strategy: fast-forward merge only. If ff is not possible,
   * rebases the draft branch onto the target and retries. Retries up
   * to `maxRetries` times (default: from settings.maxMergeRetries)
   * to handle contention from concurrent sealing. Fails hard if the
   * rebase produces conflicts — no auto-resolution, no merge commits.
   *
   * On success, abandons the draft (unless `keepDraft: true`).
   */
  seal(request: SealRequest): Promise<SealResult>
}
```

### Supporting Types

```typescript
interface CodexRecord {
  /** Codex name — unique within the guild. */
  name: string
  /** Remote repository URL. */
  remoteUrl: string
  /** Whether the bare clone exists and is healthy. */
  cloneStatus: 'ready' | 'cloning' | 'error'
  /** Number of active drafts for this codex. */
  activeDrafts: number
}

interface CodexDetail extends CodexRecord {
  /** Default branch name on the remote (e.g. 'main'). */
  defaultBranch: string
  /** Timestamp of last fetch. */
  lastFetched: string | null
  /** Active drafts for this codex. */
  drafts: DraftRecord[]
}

interface DraftRecord {
  /** Unique draft id (ULID). */
  id: string
  /** Codex this draft belongs to. */
  codexName: string
  /** Git branch name for this draft. */
  branch: string
  /** Absolute filesystem path to the draft's working directory (git worktree). */
  path: string
  /** When the draft was opened. */
  createdAt: string
  /** Optional association — e.g. a writ id. */
  associatedWith?: string
}

interface OpenDraftRequest {
  /** Codex to open the draft for. */
  codexName: string
  /** Branch name for the draft. If omitted, generates `draft-<ulid>`. */
  branch?: string
  /**
   * Starting point — branch, tag, or commit to branch from.
   * Default: remote HEAD (the codex's default branch).
   */
  startPoint?: string
  /** Optional association metadata (e.g. writ id). */
  associatedWith?: string
}

interface AbandonDraftRequest {
  /** Codex name. */
  codexName: string
  /** Git branch name of the draft to abandon. */
  branch: string
  /** Force abandonment even if the draft has unsealed inscriptions. */
  force?: boolean
}

interface SealRequest {
  /** Codex name. */
  codexName: string
  /** Git branch to seal (the draft's branch). */
  sourceBranch: string
  /** Target branch (the sealed binding). Default: codex's default branch. */
  targetBranch?: string
  /** Max rebase retry attempts under contention. Default: from settings.maxMergeRetries (3). */
  maxRetries?: number
  /** Keep the draft after successful sealing. Default: false. */
  keepDraft?: boolean
}

interface SealResult {
  /** Whether sealing succeeded. */
  success: boolean
  /** Strategy used: 'fast-forward' or 'rebase'. */
  strategy: 'fast-forward' | 'rebase'
  /** Number of retry attempts needed (0 = first try). */
  retries: number
  /** The commit SHA at head of target after sealing. */
  sealedCommit: string
  /** Number of inscriptions (commits) incorporated from the draft. 0 means no-op seal. */
  inscriptionsSealed: number
}

interface PushRequest {
  /** Codex name. */
  codexName: string
  /**
   * Branch to push. Default: codex's default branch.
   */
  branch?: string
}
```

---

## Configuration

The `codexes` key in `guild.json` has two sections: `settings` (apparatus-level configuration) and `registered` (the codex registry). Both can be edited by hand or through tools.

```json
{
  "codexes": {
    "settings": {
      "maxMergeRetries": 3,
      "draftRoot": ".nexus/worktrees"
    },
    "registered": {
      "nexus": {
        "remoteUrl": "git@github.com:shardworks/nexus.git"
      },
      "my-app": {
        "remoteUrl": "git@github.com:patron/my-app.git"
      }
    }
  }
}
```

### Settings

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `maxMergeRetries` | `number` | `3` | Max rebase-retry attempts during sealing under contention. |
| `draftRoot` | `string` | `".nexus/worktrees"` | Directory where draft worktrees are created, relative to guild root. |

### Registered Codexes

Each key in `registered` is the codex name (unique within the guild). The value:

| Field | Type | Description |
|-------|------|-------------|
| `remoteUrl` | `string` | The remote URL of the codex's git repository. Used for cloning and fetching. |

The config is intentionally minimal — a human can add a codex by hand-editing `guild.json` and the Scriptorium will pick it up on next startup (cloning the bare repo if needed).

---

## Tool Definitions

### `codex-add`

Register an existing repository as a codex.

```typescript
tool({
  name: 'codex-add',
  description: 'Register an existing git repository as a guild codex',
  permission: 'write',
  params: {
    name: z.string().describe('Name for the codex (unique within the guild)'),
    remoteUrl: z.string().describe('Git remote URL of the repository'),
  },
  handler: async ({ name, remoteUrl }) => {
    const api = guild().apparatus<ScriptoriumApi>('codexes')
    return api.add(name, remoteUrl)
  },
})
```

### `codex-list`

List all registered codexes.

```typescript
tool({
  name: 'codex-list',
  description: 'List all codexes registered with the guild',
  permission: 'read',
  params: {},
  handler: async () => {
    const api = guild().apparatus<ScriptoriumApi>('codexes')
    return api.list()
  },
})
```

### `codex-show`

Show details of a specific codex including active drafts.

```typescript
tool({
  name: 'codex-show',
  description: 'Show details of a registered codex including active draft bindings',
  permission: 'read',
  params: {
    name: z.string().describe('Codex name'),
  },
  handler: async ({ name }) => {
    const api = guild().apparatus<ScriptoriumApi>('codexes')
    return api.show(name)
  },
})
```

### `codex-remove`

Remove a codex from the guild (does not delete the remote).

```typescript
tool({
  name: 'codex-remove',
  description: 'Remove a codex from the guild (does not affect the remote repository)',
  permission: 'delete',
  params: {
    name: z.string().describe('Codex name to remove'),
  },
  handler: async ({ name }) => {
    const api = guild().apparatus<ScriptoriumApi>('codexes')
    return api.remove(name)
  },
})
```

### `codex-push`

Push a branch to the codex's remote.

```typescript
tool({
  name: 'codex-push',
  description: 'Push a branch to the codex remote',
  permission: 'write',
  params: {
    codexName: z.string().describe('Codex name'),
    branch: z.string().optional().describe('Branch to push (default: codex default branch)'),
  },
  handler: async (params) => {
    const api = guild().apparatus<ScriptoriumApi>('codexes')
    return api.push(params)
  },
})
```

### `draft-open`

Open a draft binding — create an isolated worktree for a codex.

```typescript
tool({
  name: 'draft-open',
  description: 'Open a draft binding on a codex (creates an isolated git worktree)',
  permission: 'write',
  params: {
    codexName: z.string().describe('Codex to open the draft for'),
    branch: z.string().optional().describe('Branch name for the draft (default: auto-generated draft-<ulid>)'),
    startPoint: z.string().optional().describe('Branch/tag/commit to start from (default: remote HEAD)'),
    associatedWith: z.string().optional().describe('Optional association (e.g. writ id)'),
  },
  handler: async (params) => {
    const api = guild().apparatus<ScriptoriumApi>('codexes')
    return api.openDraft(params)
  },
})
```

### `draft-list`

List active draft bindings.

```typescript
tool({
  name: 'draft-list',
  description: 'List active draft bindings, optionally filtered by codex',
  permission: 'read',
  params: {
    codexName: z.string().optional().describe('Filter by codex name'),
  },
  handler: async ({ codexName }) => {
    const api = guild().apparatus<ScriptoriumApi>('codexes')
    return api.listDrafts(codexName)
  },
})
```

### `draft-abandon`

Abandon a draft binding.

```typescript
tool({
  name: 'draft-abandon',
  description: 'Abandon a draft binding (removes the git worktree and branch)',
  permission: 'delete',
  params: {
    codexName: z.string().describe('Codex name'),
    branch: z.string().describe('Branch of the draft to abandon'),
    force: z.boolean().optional().describe('Force abandonment even with unmerged changes'),
  },
  handler: async (params) => {
    const api = guild().apparatus<ScriptoriumApi>('codexes')
    return api.abandonDraft(params)
  },
})
```

### `draft-seal`

Seal a draft — merge its branch into the sealed binding.

```typescript
tool({
  name: 'draft-seal',
  description: 'Seal a draft binding into the codex (ff-only merge or rebase; no merge commits)',
  permission: 'write',
  params: {
    codexName: z.string().describe('Codex name'),
    sourceBranch: z.string().describe('Draft branch to seal'),
    targetBranch: z.string().optional().describe('Target branch (default: codex default branch)'),
    maxRetries: z.number().optional().describe('Max rebase retries under contention (default: 3)'),
    keepDraft: z.boolean().optional().describe('Keep draft after sealing (default: false)'),
  },
  handler: async (params) => {
    const api = guild().apparatus<ScriptoriumApi>('codexes')
    return api.seal(params)
  },
})
```

---

## Session Integration

The Scriptorium and the Animator are **intentionally decoupled**. The Scriptorium manages git infrastructure; the Animator manages sessions. Neither knows about the other. They compose through a simple handoff: the `DraftRecord.path` returned by `openDraft()` is the `cwd` passed to the Animator's `summon()` or `animate()`.

### Composition pattern

The binding between a session and a draft is the caller's responsibility. The typical flow:

```
  Spider engine (or other caller)
    │
    ├─ 1. scriptorium.openDraft({ codexName, branch })
    │     → DraftRecord { path: '.nexus/worktrees/nexus/writ-42' }
    │
    ├─ 2. animator.summon({ role, prompt, cwd: draft.path })
    │     → session runs, anima inscribes in the draft
    │     → session exits
    │
    └─ 3. scriptorium.seal({ codexName, sourceBranch })
          → draft sealed into codex and pushed to remote
```

The anima never touches draft lifecycle — it is launched *inside* the draft's working directory and inscribes there naturally. Infrastructure steps (open, seal) happen outside the session, ensuring they execute even if the session crashes or times out.

### The `DraftRecord` as handoff object

The `DraftRecord` carries everything the Animator needs:

- **`path`** — the session's `cwd`
- **`codexName`** — for session metadata (which codex this session worked on)
- **`branch`** — for session metadata (which draft)
- **`associatedWith`** — the writ id, if any (passed through to session metadata)

The Animator stores these as opaque metadata on the session record. The Scriptorium doesn't read session records; the Animator doesn't read draft records. They share data through the orchestrator that calls both.

### Why not tighter integration?

Animas cannot reliably manage their own draft lifecycle. A session's working directory is set at launch — the anima cannot relocate itself to a draft it opens mid-session. Even if it could (via absolute paths and `cd`), the failure modes are poor: crashed sessions leave orphaned drafts, forgotten seal steps leave inscriptions stranded, and every anima reimplements the same boilerplate. External orchestration is simpler and more reliable.

---

## Bare Clone Architecture

The Scriptorium maintains **bare clones** of each codex under `.nexus/codexes/<name>.git`. This is the local git infrastructure that makes draft operations fast and network-efficient.

```
.nexus/
  codexes/
    nexus.git/          ← bare clone of git@github.com:shardworks/nexus.git
    my-app.git/         ← bare clone of git@github.com:patron/my-app.git
  worktrees/
    nexus/
      writ-42/          ← draft: nexus, branch writ-42
      writ-57/          ← draft: nexus, branch writ-57
    my-app/
      writ-63/          ← draft: my-app, branch writ-63
```

### Why bare clones?

- **Single clone, many drafts.** A bare clone has no working tree of its own — it's just the git object database. Multiple draft worktrees can be created from it simultaneously without duplicating the repository data.
- **Network efficiency.** After the initial clone, updates are `git fetch` operations — fast, incremental, no full re-clone.
- **Transparent to animas.** An anima inscribing in a draft sees a normal git checkout. It doesn't know or care that the underlying repo is a bare clone. `git commit`, `git log`, `git diff` all work normally.
- **Clean separation.** The bare clone in `.nexus/codexes/` is infrastructure; the draft worktrees in `.nexus/worktrees/` are workspaces. Neither pollutes the guild's versioned content.

### Lifecycle

```
codex-add
  ├─ 1. Write entry to guild.json config
  ├─ 2. git clone --bare <remoteUrl> .nexus/codexes/<name>.git
  └─ 3. Track clone status in memory

draft-open
  ├─ 1. git fetch (in bare clone) — ensure refs are current
  ├─ 2. git worktree add .nexus/worktrees/<codex>/<branch> -b <branch> <startPoint>
  └─ 3. Track draft in memory

draft-seal
  ├─ 1. Fetch remote refs (git fetch --prune origin +refs/heads/*:refs/remotes/origin/*)
  │     → populates refs/remotes/origin/* without touching local sealed binding or draft branches
  ├─ 2. Advance local sealed binding if remote is ahead
  │     → if refs/remotes/origin/<target> is ahead of refs/heads/<target>: advance refs/heads/<target>
  │     → if local is ahead (unpushed seals): keep local — preserves inter-draft contention ordering
  ├─ 3. Attempt fast-forward merge
  │     └─ If ff not possible: rebase source onto target
  │        └─ If rebase conflicts: FAIL (no auto-resolution)
  │        └─ If rebase succeeds: retry ff (up to maxRetries)
  ├─ 4. Update target branch ref in bare clone
  ├─ 5. Push target branch to remote (git push origin <branch>)
  └─ 6. Abandon draft (unless keepDraft)

codex-push
  ├─ 1. git push origin <branch> (from bare clone)
  └─ 2. Never force-push

codex-remove
  ├─ 1. Abandon all drafts for codex
  ├─ 2. Remove bare clone directory
  ├─ 3. Remove entry from guild.json
  └─ 4. Clean up in-memory state
```

### Sealing Strategy Detail

Sealing enforces **linear history** on the sealed binding — no merge commits, no force pushes. If a draft's inscriptions contradict the sealed binding (i.e. the sealed binding has advanced since the draft was opened), the sealing engine attempts to reconcile via rebase. If reconciliation fails, sealing seizes — the tool fails rather than creating non-linear history or silently resolving conflicts.

Git mechanics:

```
Seal Attempt:
  ├─ Try: git merge --ff-only <draft-branch> into <sealed-branch>
  │   ├─ Success → draft sealed
  │   └─ Fail (sealed binding has advanced) →
  │       ├─ Fetch latest sealed binding from remote
  │       ├─ Try: git rebase <sealed-branch> <draft-branch>
  │       │   ├─ Conflict → FAIL (sealing seizes — manual reconciliation needed)
  │       │   └─ Clean rebase →
  │       │       └─ Retry ff-only merge (loop, up to maxRetries)
  │       └─ All retries exhausted → FAIL
  └─ Never: merge commits, force push, conflict auto-resolution
```

The retry loop handles **contention** — when multiple animas seal to the same codex in quick succession, each fetch-rebase-ff cycle picks up the other's sealed inscriptions. Three retries (configurable via `settings.maxMergeRetries`) is sufficient for typical guild concurrency; the limit prevents infinite loops in pathological cases.

---

## Clone Readiness and Fetch Policy

### Initial clone

The `add()` API **blocks until the bare clone completes**. The caller gets back a `CodexRecord` with `cloneStatus: 'ready'` — registration isn't done until the clone is usable. This keeps the contract simple: if `add()` returns successfully, the codex is operational.

At **startup**, the Scriptorium checks each configured codex for an existing bare clone. Missing clones are initiated in the background — the apparatus starts without waiting. However, any tool invocation that requires the bare clone (everything except `codex-list`) **blocks until that codex's clone is ready**. The tool doesn't fail or return stale data; it waits. If the clone fails, the tool fails with a clear error referencing the clone failure.

### Fetch before branch operations

Every operation that creates or modifies branches **fetches from the remote first**:

- **`openDraft`** — fetches before branching, ensuring the start point reflects the latest remote state.
- **`seal`** — fetches the target branch before attempting ff-only, and again on each retry iteration. The fetch uses an explicit refspec (`+refs/heads/*:refs/remotes/origin/*`) to populate remote-tracking refs — a plain `git fetch origin` in a bare clone (which has no default fetch refspec) only updates `FETCH_HEAD` and leaves both `refs/heads/*` and `refs/remotes/origin/*` stale. After fetching, if `refs/remotes/origin/<target>` is strictly ahead of `refs/heads/<target>` (i.e. commits were pushed outside the Scriptorium), the local sealed binding is advanced to the remote position before the seal attempt. This ensures the draft is rebased onto the actual remote state and the subsequent push fast-forwards cleanly.
- **`push`** — does **not** fetch first (it's pushing, not pulling).

`fetch` is also exposed as a standalone API for manual use, but callers generally don't need it — the branch operations handle freshness internally.

### Startup reconciliation

On `start()`, the Scriptorium:

1. Reads the `codexes` config from `guild.json`
2. For each configured codex, checks whether a bare clone exists at `.nexus/codexes/<name>.git`
3. Initiates background clones for any missing codexes
4. Reconciles in-memory draft tracking with filesystem state (cleans up tracking for drafts that no longer exist on disk)

This means a patron can hand-edit `guild.json` to add a codex, and the Scriptorium will clone it on next startup.

---

## Draft Branch Collisions

If a caller requests a draft with a branch name that already exists for that codex, `openDraft` **rejects with a clear error**. Branch naming is the caller's responsibility. Auto-suffixing would hide real problems (two writs accidentally opening drafts on the same branch). Git enforces this at the worktree level — a branch can only be checked out in one worktree at a time — and the Scriptorium surfaces the constraint rather than working around it.

---

## Draft Cleanup

The Scriptorium does **not** automatically reap stale drafts. It provides the `abandonDraft` API; when and why to call it is an external concern. A future reaper process, automated process, or manual cleanup can use `draft-list` and `draft-abandon` as needed. This keeps the Scriptorium ignorant of writ lifecycle and other domain concerns.

---

## Future: Clockworks Events

When the Clockworks apparatus exists, the Scriptorium should emit events for downstream consumers (particularly the Surveyor):

| Event | Payload | When |
|-------|---------|------|
| `codex.added` | `{ name, remoteUrl }` | A codex is registered |
| `codex.removed` | `{ name }` | A codex is deregistered |
| `codex.fetched` | `{ name }` | A codex's bare clone is fetched |
| `draft.opened` | `{ codexName, branch, path, associatedWith? }` | A draft is opened |
| `draft.abandoned` | `{ codexName, branch }` | A draft is abandoned |
| `draft.sealed` | `{ codexName, sourceBranch, targetBranch, strategy }` | A draft is sealed |
| `codex.pushed` | `{ codexName, branch }` | A branch is pushed to remote |

Until then, downstream consumers query the Scriptorium API directly.

---

## Implementation Notes

- **`guild().writeConfig()`** — the Scriptorium uses `guild().writeConfig('codexes', ...)` to persist codex registry changes to `guild.json`. This API was added to the `Guild` interface in `@shardworks/nexus-core` and implemented in Arbor. It updates both the in-memory config and the disk file atomically.
- **Git operations.** All git operations use `child_process.execFile` (not shell) via a lightweight `git.ts` helper that handles error parsing and provides typed results (`GitResult`, `GitError`).
- **Concurrency.** Multiple animas may open/seal drafts concurrently. The bare clone's git operations need appropriate locking — git's own ref locking handles most cases, but the fetch-rebase-seal cycle should be serialized per codex to avoid ref races.
- **No downstream coupling.** The Scriptorium has no dependency on the Surveyor, the Spider, or any other consumer of codex state. It is pure infrastructure. Downstream apparatus query or (future) subscribe to the Scriptorium's state independently.

---

## Future State

### Draft Persistence via Stacks

The current implementation tracks active drafts **in memory**, reconstructed from filesystem state at startup. This is sufficient for MVP — draft worktrees are durable on disk and the Scriptorium reconciles on restart. However, this means:

- Draft metadata (`associatedWith`, `createdAt`) is approximate after a restart — the original values are lost.
- There is no queryable history of past drafts (abandoned or sealed).
- Other apparatus cannot subscribe to draft state changes via CDC.

A future iteration should persist `DraftRecord` entries to a Stacks book (`codexes/drafts`), enabling:

- Durable metadata that survives restarts
- Historical draft records (with terminal status: `sealed`, `abandoned`)
- CDC-driven downstream reactions (e.g. the Surveyor updating its codex-awareness when a draft is sealed)

### Per-Codex Sealing Lock

The sealing retry loop (fetch → rebase → ff) is not currently serialized per codex. Under high concurrency (multiple animas sealing to the same codex simultaneously), ref races are possible. Git's own ref locking prevents corruption, but the retry loop may exhaust retries unnecessarily.

A per-codex async mutex around the seal operation would eliminate this. The lock should be held only during the seal attempt, not during the preceding fetch or the subsequent draft cleanup.

### Clockworks Event Emission

Documented in the **Future: Clockworks Events** section above. When the Clockworks apparatus exists, the Scriptorium should emit events for each lifecycle operation. This replaces the current pattern where downstream consumers poll the API directly.

=== CONTEXT FILE: packages/plugins/copilot/src ===
tree f8c14f1947b005cf5739bb403505065a46b6d58f:packages/plugins/copilot/src

index.test.ts
index.ts



## Codebase Structure (surrounding directories)

```
=== TREE: ./ ===
.claude
.gitattributes
.github
.gitignore
.nvmrc
LICENSE
README.md
bin
docs
package.json
packages
pnpm-lock.yaml
pnpm-workspace.yaml
tsconfig.json

=== TREE: docs/architecture/apparatus/ ===
_template.md
animator.md
claude-code.md
clerk.md
copilot.md
fabricator.md
instrumentarium.md
loom.md
parlour.md
review-loop.md
scriptorium.md
spider.md
stacks.md

=== TREE: packages/plugins/copilot/ ===
package.json
src
tsconfig.json

=== TREE: packages/plugins/copilot/src/ ===
index.test.ts
index.ts


```
