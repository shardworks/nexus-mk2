/**
 * MCP Server Engine
 *
 * Serves guild implements as typed MCP tools during anima sessions.
 * The manifest engine launches this as a stdio process, configured with
 * the set of implements the anima has access to (based on role gating).
 *
 * For each implement:
 *   - kind: "module" → imports the handler and registers it as an MCP tool
 *   - kind: "script" → registers an MCP tool that shells out to the script
 *
 * One process per session. All the anima's tools. Claude's runtime manages
 * the lifecycle — spawns at session start, kills at session end.
 *
 * ## Usage
 *
 * The engine reads a JSON config from a file path passed as argv[2]:
 *
 *   node engine-mcp-server <config.json>
 *
 * Config shape:
 *   {
 *     "home": "/absolute/path/to/NEXUS_HOME",
 *     "implements": [
 *       { "name": "install-tool", "modulePath": "@shardworks/implement-install-tool" },
 *       { "name": "my-tool", "modulePath": "/absolute/path/to/handler.ts" }
 *     ]
 *   }
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { VERSION } from '@shardworks/nexus-core';
import type { ImplementDefinition, ImplementContext } from '@shardworks/nexus-core';

/** A single implement to load into the MCP server. */
export interface ImplementSpec {
  /** Tool name — how the anima sees it. */
  name: string;
  /** Module path — package name (for framework implements) or absolute file path (for guild implements). */
  modulePath: string;
}

/** Configuration for the MCP server engine. */
export interface ServerConfig {
  /** Absolute path to NEXUS_HOME. */
  home: string;
  /** Implements to register as MCP tools. */
  implements: ImplementSpec[];
}

/**
 * Load an implement definition from a module path.
 * Expects the module's default export to be an ImplementDefinition (from the implement() SDK).
 */
async function loadImplement(spec: ImplementSpec): Promise<ImplementDefinition | null> {
  try {
    const mod = await import(spec.modulePath);
    const def: ImplementDefinition = mod.default;

    if (!def || !def.params || !def.handler || !def.description) {
      console.error(
        `[mcp-server] ${spec.name}: module does not export a valid implement definition (missing params, handler, or description). Skipping.`,
      );
      return null;
    }

    return def;
  } catch (err) {
    console.error(`[mcp-server] ${spec.name}: failed to load module "${spec.modulePath}":`, err);
    return null;
  }
}

/**
 * Create and configure an MCP server with the given implements.
 *
 * Each implement's Zod param schema is registered directly with the MCP SDK
 * (which handles JSON Schema conversion). The handler is wrapped to inject
 * the framework context and format the result as MCP tool output.
 */
export async function createMcpServer(config: ServerConfig): Promise<McpServer> {
  const server = new McpServer({
    name: 'nexus-guild',
    version: VERSION,
  });

  const context: ImplementContext = { home: config.home };

  for (const spec of config.implements) {
    const def = await loadImplement(spec);
    if (!def) continue;

    // Register the implement as an MCP tool.
    // The MCP SDK accepts Zod shapes directly — it handles JSON Schema conversion.
    server.tool(
      spec.name,
      def.description,
      def.params.shape,
      async (params) => {
        try {
          // Validate params through Zod before passing to handler
          const validated = def.params.parse(params);
          const result = await def.handler(validated, context);

          return {
            content: [{
              type: 'text' as const,
              text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
            }],
          };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return {
            content: [{ type: 'text' as const, text: `Error: ${message}` }],
            isError: true,
          };
        }
      },
    );
  }

  return server;
}

/**
 * Entry point when run as a standalone process.
 *
 * Reads config from a JSON file (path passed as first argument),
 * creates the MCP server, and connects via stdio transport.
 */
export async function main(configPath?: string): Promise<void> {
  const resolvedPath = configPath ?? process.argv[2];

  if (!resolvedPath) {
    console.error('Usage: nexus-mcp-server <config.json>');
    process.exit(1);
  }

  const fs = await import('node:fs');
  const configText = fs.readFileSync(resolvedPath, 'utf-8');
  const config: ServerConfig = JSON.parse(configText);

  const server = await createMcpServer(config);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
