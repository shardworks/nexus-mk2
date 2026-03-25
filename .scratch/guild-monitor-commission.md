# Commission: Guild Monitor — Web Dashboard (v1)

## What to Build

A local web dashboard for monitoring Nexus guild state. The monitor reads guild configuration data and presents it in a navigable web interface served on localhost.

## Deliverables

### 1. npm Package

A TypeScript package that exports:

```typescript
export interface MonitorOptions {
  /** Absolute path to the guild root directory. */
  home: string;
  /** Port to serve on. Defaults to 4200. */
  port?: number;
}

/**
 * Start the guild monitor web server.
 * Resolves when the server is listening.
 */
export function startMonitor(options: MonitorOptions): Promise<void>;
```

When called, `startMonitor` starts an HTTP server on localhost serving the dashboard. The server is local-only — it must not bind to `0.0.0.0` or be accessible from other machines.

### 2. Development Harness

A `dev` script in `package.json` that starts the monitor standalone for development and testing:

```
npm run dev -- /path/to/guild
```

Or via environment variable:

```
NEXUS_HOME=/path/to/guild npm run dev
```

The harness should support hot reload during development — changes to the dashboard code should appear without restarting the server.

### 3. Dashboard Content (v1)

A single-page dashboard displaying the guild's current configuration. Data source: `readGuildConfig(home)` from `@shardworks/nexus-core`.

Display the following sections:

**Header**
- Guild name
- Nexus framework version
- Default model

**Roles**
- Table: role name, seat limit (or "unlimited"), number of tools, whether it has custom instructions

**Workshops**
- Table: workshop name, remote URL, date added

**Tools**
- Table: tool name, upstream package, installed date, bundle source (if any)
- Separate section or tab for engines (same columns)

**Training**
- Curricula: name, upstream, installed date
- Temperaments: name, upstream, installed date

**Clockworks**
- Custom events: name, description
- Standing orders: event → action (with verb: run/summon/brief and target)

**Base Tools**
- List of tool names available to all animas regardless of role

## Technical Constraints

- Import `readGuildConfig` and `findGuildRoot` from `@shardworks/nexus-core` to read guild data. Do not read `guild.json` directly — use the core library.
- The `@shardworks/nexus-core` package is available on npm. Install it as a dependency.
- Serve the dashboard over HTTP on localhost only. No WebSocket requirement for v1 — the page can reload to refresh data.
- The package must work when installed and imported by another TypeScript project (the `startMonitor` export is the integration contract).

## What Is NOT In Scope

- SQLite / Books data (animas, commissions, sessions, events) — that's a future commission.
- Authentication or multi-user access.
- Real-time updates or WebSocket push.
- Deployment or hosting — this is a local development tool.
- Integration into the `nsg` CLI — that will be done separately.

## Acceptance Criteria

1. `npm run dev -- /path/to/guild` starts a local server and opens a dashboard showing all guild config sections listed above.
2. The dashboard is readable and navigable without explanation.
3. `startMonitor({ home: '/path/to/guild' })` can be called from another TypeScript project and serves the same dashboard.
4. All dependencies are MIT/Apache/BSD licensed.
5. The project builds and type-checks cleanly with `tsc --noEmit`.
