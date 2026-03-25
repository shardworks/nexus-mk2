# Commission: Guild Monitor — Web Dashboard (v1)

## What to Build

A local web dashboard for monitoring Nexus guild state. The monitor reads guild configuration data and presents it in a navigable web interface served on localhost.

## Deliverables

### 1. npm Package

A TypeScript package that exports:

```typescript
export interface MonitorOptions {
  /** 
   * Absolute path to the guild root directory. Defaults to finding the guild 
   * from the current working directory 
   **/
  home?: string;
  /** Port to serve on. Defaults to 4200. */
  port?: number;
}

/**
 * Start the guild monitor web server.
 * Resolves when the server is listening.
 */
export function startMonitor(options?: MonitorOptions): Promise<void>;
```

When called, `startMonitor` starts an HTTP server on localhost serving the dashboard. The server is local-only — it must not bind to `0.0.0.0` or be accessible from other machines.

### 2. Development Harness

A `dev` script in `package.json` that starts the monitor standalone for development and testing:

```
npm run dev [-- /path/to/guild]
```

The harness should support hot reload during development — changes to the dashboard code should appear without restarting the server.

### 3. Dashboard Content (v1)

A single-page dashboard displaying the guild's current configuration. Data source: `readGuildConfig(home)` from `@shardworks/nexus-core`. The dashboard should present the guild config data in a way that is readable and navigable. Which fields to show and how to organize them is up to you — the `GuildConfig` type definition has everything you need.

## Technical Constraints

- Import `readGuildConfig` and `findGuildRoot` from `@shardworks/nexus-core` (available on npm) to read guild data. Do not read `guild.json` directly — use the core library.
- Serve the dashboard over HTTP on localhost only. No WebSocket requirement for v1 — the page can reload to refresh data.
- The package must work when installed and imported by another TypeScript project (the `startMonitor` export is the integration contract).

## What Is NOT In Scope

- Deployment or hosting — this is a local development tool.

## Acceptance Criteria

1. `npm run dev` starts a local server and opens a dashboard showing guild configuration data.
2. The dashboard is readable and navigable without explanation.
3. `startMonitor({ home: '/path/to/guild' })` can be called from another TypeScript project and serves the same dashboard.
