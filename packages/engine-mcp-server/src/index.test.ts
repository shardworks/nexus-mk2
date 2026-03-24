import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createMcpServer, type ServerConfig } from './index.ts';

describe('MCP server engine', () => {
  it('creates a server that loads module implements', async () => {
    const config: ServerConfig = {
      home: '/tmp/test-home',
      implements: [
        {
          name: 'install-tool',
          modulePath: '@shardworks/implement-install-tool',
        },
      ],
    };

    const server = await createMcpServer(config);
    assert.ok(server, 'server should be created');
    assert.ok(server.server, 'underlying Server instance should exist');
  });

  it('skips implements with invalid module paths', async () => {
    const config: ServerConfig = {
      home: '/tmp/test-home',
      implements: [
        {
          name: 'nonexistent',
          modulePath: '/absolutely/does/not/exist.ts',
        },
      ],
    };

    // Should not throw — invalid implements are skipped with a warning
    const server = await createMcpServer(config);
    assert.ok(server, 'server should still be created despite invalid implement');
  });

  it('handles empty implement list', async () => {
    const config: ServerConfig = {
      home: '/tmp/test-home',
      implements: [],
    };

    const server = await createMcpServer(config);
    assert.ok(server, 'server should be created with no tools');
  });
});
