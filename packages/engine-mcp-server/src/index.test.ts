import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createMcpServer, type ServerConfig } from './index.ts';

describe('MCP server engine', () => {
  it('creates a server that loads module tools', async () => {
    const config: ServerConfig = {
      home: '/tmp/test-home',
      tools: [
        {
          name: 'install-tool',
          modulePath: '@shardworks/tool-install',
        },
      ],
    };

    const server = await createMcpServer(config);
    assert.ok(server, 'server should be created');
    assert.ok(server.server, 'underlying Server instance should exist');
  });

  it('skips tools with invalid module paths', async () => {
    const config: ServerConfig = {
      home: '/tmp/test-home',
      tools: [
        {
          name: 'nonexistent',
          modulePath: '/absolutely/does/not/exist.ts',
        },
      ],
    };

    // Should not throw — invalid tools are skipped with a warning
    const server = await createMcpServer(config);
    assert.ok(server, 'server should still be created despite invalid tool');
  });

  it('handles empty tool list', async () => {
    const config: ServerConfig = {
      home: '/tmp/test-home',
      tools: [],
    };

    const server = await createMcpServer(config);
    assert.ok(server, 'server should be created with no tools');
  });
});
