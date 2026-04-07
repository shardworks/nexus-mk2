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
