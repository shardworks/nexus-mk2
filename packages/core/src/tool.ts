/**
 * Tool SDK — the primary authoring interface for module-based tools.
 *
 * Use `tool()` to define a typed tool with Zod parameter schemas.
 * The returned definition is what the MCP engine imports and registers as a tool,
 * what the CLI uses to auto-generate subcommands, and what engines import directly.
 *
 * @example
 * ```typescript
 * import { tool } from '@shardworks/nexus-core';
 * import { z } from 'zod';
 *
 * export default tool({
 *   description: 'Look up an anima by name',
 *   params: {
 *     name: z.string().describe('Anima name'),
 *   },
 *   handler: async ({ name }, { home }) => {
 *     // ... look up anima using home to find the guild ...
 *     return { found: true, status: 'active' };
 *   },
 * });
 * ```
 */
import { z } from 'zod';

// Zod shape type — a record of string keys to Zod schemas.
// Using a local alias keeps our public API stable across Zod versions.
type ZodShape = Record<string, z.ZodType>;

/**
 * Framework-provided context injected into every tool handler call.
 * The tool author doesn't construct this — the framework (MCP engine, CLI,
 * or calling engine) provides it.
 */
export interface ToolContext {
  /** Absolute path to the guild root. */
  home: string;
}

/**
 * A fully-defined tool — the return type of `tool()`.
 *
 * The MCP engine uses `.params.shape` to register the tool's input schema,
 * `.description` for the tool description, and `.handler` to execute calls.
 * The CLI uses `.params` to auto-generate Commander options.
 * Engines call `.handler` directly.
 */
export interface ToolDefinition<TShape extends ZodShape = ZodShape> {
  readonly description: string;
  readonly params: z.ZodObject<TShape>;
  readonly handler: (
    params: z.infer<z.ZodObject<TShape>>,
    context: ToolContext,
  ) => unknown | Promise<unknown>;
}

/**
 * Define a Nexus tool.
 *
 * This is the primary SDK entry point for module-based tools. Pass a
 * description, a params object of Zod schemas, and a handler function.
 * The framework handles the rest — MCP registration, CLI generation, validation.
 *
 * The handler receives two arguments:
 * - `params` — the validated input, typed from your Zod schemas
 * - `context` — framework-injected context (guild root path, etc.)
 *
 * Return any JSON-serializable value. The MCP engine wraps it as tool output;
 * the CLI prints it; engines use it directly.
 */
export function tool<TShape extends ZodShape>(def: {
  description: string;
  params: TShape;
  handler: (
    params: z.infer<z.ZodObject<TShape>>,
    context: ToolContext,
  ) => unknown | Promise<unknown>;
}): ToolDefinition<TShape> {
  return {
    description: def.description,
    params: z.object(def.params),
    handler: def.handler,
  };
}
