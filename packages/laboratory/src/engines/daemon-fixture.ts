/**
 * lab.daemon-setup / lab.daemon-teardown — fixture engines for the
 * test guild's daemon lifecycle.
 *
 * MOTIVATION
 * ──────────
 * Phase 1 trials (manifest-validation, baseline-on-disk) only needed a
 * static test guild — `nsg init` creates one, plugins install into it,
 * and probes read its `.nexus/` artifacts directly. No process needs
 * to run inside it.
 *
 * Phase 2 trials want the test guild to actually *execute* a rig: the
 * scenario engine posts a commission, then waits for the resulting
 * writ to reach a terminal state. That requires a running guild
 * daemon inside the test guild — Spider's crawl loop drives engines
 * forward, Clockworks dispatches event-bound handlers, and the tool
 * HTTP server lets the implementer anima call MCP tools.
 *
 * `nsg start` already does the heavy lifting:
 *   - default mode is detached (re-execs self with --foreground +
 *     `detached: true` + `unref()`, stdio piped to
 *     `.nexus/logs/daemon.{out,err}`)
 *   - writes a pidfile at `<guildPath>/.nexus/daemon.pid`
 *   - returns control only after a startup-sync confirms the tool
 *     HTTP server is reachable (10s deadline; tails the err log on
 *     failure)
 *   - is idempotent (refuses double-start, cleans up stale pidfiles)
 *
 * `nsg stop` is the symmetric companion:
 *   - reads pidfile, sends SIGTERM, polls, escalates to SIGKILL
 *   - removes the pidfile
 *   - is idempotent (no-op when no daemon is running)
 *
 * So the daemon-fixture engines are thin wrappers: setup writes a
 * port allocation into `guild.json`, shells out `nsg start`, captures
 * the resulting pid; teardown shells out `nsg stop`.
 *
 * SHAPE — separate fixture, not steps inside guild-setup
 * ──────────────────────────────────────────────────────
 * Daemon lifecycle is its own fixture pair (`lab.daemon-setup` /
 * `lab.daemon-teardown`) rather than appended steps inside
 * `lab.guild-setup`. Three reasons:
 *
 *   1. Opt-in matches reality. Trials that don't drive a rig (e.g.
 *      manifest validation) shouldn't pay startup cost or risk daemon-
 *      orphan cruft.
 *   2. Composes correctly with future patterns: trials that restart
 *      the daemon mid-trial, multi-daemon scenarios, or daemon-only
 *      trials become legal without forking guild-setup.
 *   3. Matches existing fixture decomposition (codex separate from
 *      guild) — convention extends naturally.
 *
 * A phase-2 trial wires it as:
 *
 *   fixtures:
 *     - id: codex
 *       engineId: lab.codex-setup
 *       …
 *     - id: test-guild
 *       engineId: lab.guild-setup
 *       dependsOn: [codex]
 *       …
 *     - id: daemon
 *       engineId: lab.daemon-setup
 *       dependsOn: [test-guild]
 *       givens: {}                # auto-allocate ports
 *
 * Reverse-topo teardown order is daemon → guild → codex. Daemon stops
 * first; then the guild dir is rm-rf'd; then the codex bare repo is
 * cleaned. The daemon teardown does NOT delete files — guild-teardown
 * owns the rm-rf of the entire test guild dir, including the
 * .nexus/daemon.pid that `nsg stop` leaves behind on stale-pid paths.
 *
 * SETUP FLOW
 * ──────────
 * 1. Validate givens (toolServerPort?, oculusPort?).
 * 2. Discover the test guild from `context.upstream` — same duck-
 *    typing pattern as scenario-xguild (any upstream yield with
 *    {guildName, guildPath} both strings).
 * 3. Resolve port pair: each port is either the given value, or
 *    auto-allocated via `net.createServer().listen(0)` then close.
 *    There's a tiny TOCTOU window between close and `nsg start`'s
 *    bind; in single-trial-at-a-time operation this never matters.
 * 4. Deep-merge `{ tools: { serverPort }, oculus: { port } }` into the
 *    test guild's `guild.json`, preserving everything guild-setup
 *    already wrote.
 * 5. Shell out `<localNsg> --guild-root <X> start`. Returns once the
 *    daemon's tool server is reachable.
 * 6. Read pidfile to capture the daemon's pid for the yield.
 * 7. Yield `{ guildPath, daemonPid, toolServerPort, oculusPort,
 *    pidFile, logsDir }`.
 *
 * Failure handling: any error after step 5's `nsg start` succeeds
 * triggers a best-effort `nsg stop` rollback before re-throwing. If
 * step 5 itself fails, no daemon is running to stop; just re-throw.
 *
 * TEARDOWN FLOW
 * ─────────────
 * 1. Validate givens (none required — daemon-teardown derives its
 *    target from upstream's test-guild).
 * 2. Discover the test guild from `context.upstream`.
 * 3. Archive-presence safety check (same pattern as guild-teardown).
 * 4. Shell out `<localNsg> --guild-root <X> stop`. Tolerant —
 *    `nsg stop` is idempotent.
 * 5. Yield `{ stopped: true, guildPath }`.
 *
 * GIVENS (setup AND teardown — fixture givens are shared)
 * ───────────────────────────────────────────────────────
 *   toolServerPort : number?  — Optional. The tool HTTP server's
 *                              port. Defaults to an ephemeral port
 *                              picked at setup time.
 *   oculusPort     : number?  — Optional. Oculus's port. Defaults
 *                              to an ephemeral port. (Oculus is
 *                              skipped at runtime if the plugin
 *                              isn't installed; the port is still
 *                              allocated and written so the config
 *                              has a stable shape.)
 *
 * YIELDS (setup)
 * ──────────────
 *   {
 *     guildPath: string,            // echo of the discovered test guild
 *     daemonPid: number,
 *     toolServerPort: number,
 *     oculusPort: number,
 *     pidFile: string,              // <guildPath>/.nexus/daemon.pid
 *     logsDir: string,              // <guildPath>/.nexus/logs
 *   }
 *
 * YIELDS (teardown)
 * ─────────────────
 *   { stopped: true, guildPath: string }
 */

import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import net from 'node:net';
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  EngineDesign,
  EngineRunContext,
  EngineRunResult,
} from '@shardworks/fabricator-apparatus';
import {
  assertArchiveRowExists,
  resolveTrialIdForTeardown,
} from '../archive/presence.ts';
import { deepMerge } from './guild-fixture.ts';
import { discoverTestGuilds, resolveLocalNsg } from './scenario-xguild.ts';

const execFile = promisify(execFileCb);

// ── Givens validation ────────────────────────────────────────────────

interface ResolvedDaemonFixtureGivens {
  toolServerPort: number | undefined;
  oculusPort: number | undefined;
}

function validateGivens(
  rawGivens: Record<string, unknown>,
  designId: string,
): ResolvedDaemonFixtureGivens {
  const toolServerPort = optionalPort(rawGivens.toolServerPort, designId, 'toolServerPort');
  const oculusPort = optionalPort(rawGivens.oculusPort, designId, 'oculusPort');
  return { toolServerPort, oculusPort };
}

function optionalPort(
  value: unknown,
  designId: string,
  fieldName: string,
): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error(
      `[${designId}] givens.${fieldName} must be an integer in [1, 65535]; got ${JSON.stringify(value)}.`,
    );
  }
  return value;
}

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Bind an ephemeral port on 127.0.0.1, capture the kernel-assigned
 * port number, then release. The port is "free at this moment" — a
 * race with `nsg start`'s bind is theoretically possible but does not
 * matter for single-trial-at-a-time operation, which is the only
 * supported mode in v1.
 */
export async function allocatePort(): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', (err) => {
      reject(err);
    });
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (typeof addr === 'object' && addr !== null) {
        const port = addr.port;
        server.close((closeErr) => {
          if (closeErr) reject(closeErr);
          else resolve(port);
        });
      } else {
        server.close();
        reject(new Error('failed to allocate port: server.address() did not return an object'));
      }
    });
  });
}

/**
 * Resolve the single test guild from upstream yields. Throws on zero
 * or multiple — explicit selection is future work.
 *
 * (Mirrors scenario-xguild's resolveTestGuild; exported here so this
 * module can have a self-contained discovery flow with daemon-fixture-
 * specific error messages.)
 */
export interface DiscoveredTestGuild {
  guildName: string;
  guildPath: string;
}

export function resolveTestGuildForDaemon(
  upstream: Record<string, unknown>,
  designId: string,
): DiscoveredTestGuild {
  const guilds = discoverTestGuilds(upstream);
  if (guilds.length === 0) {
    throw new Error(
      `[${designId}] no test guild found in context.upstream — the engine ` +
        `expects at least one upstream yield with {guildName: string, guildPath: string} ` +
        `(the guild-fixture's yield shape). Check that this fixture's dependsOn ` +
        `includes the guild fixture.`,
    );
  }
  if (guilds.length > 1) {
    const names = guilds.map((g) => g.guildName).join(', ');
    throw new Error(
      `[${designId}] multiple test guilds found in context.upstream (${names}); ` +
        `explicit selection is not yet supported in v1.`,
    );
  }
  return guilds[0]!;
}

async function exec(
  cmd: string,
  args: string[],
  cwd?: string,
): Promise<{ stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await execFile(cmd, args, {
      cwd,
      maxBuffer: 50 * 1024 * 1024,
    });
    return { stdout: stdout.trim(), stderr: stderr.trim() };
  } catch (err: unknown) {
    const e = err as { stderr?: string; message?: string };
    throw new Error(
      `${cmd} ${args.join(' ')} failed: ${e.stderr || e.message || 'unknown error'}`,
    );
  }
}

/**
 * Write port overrides into the test guild's `guild.json`, preserving
 * everything else in the file. Deep-merge so any nested keys
 * guild-setup wrote (or that nsg-init produced) survive.
 */
export async function writePortConfig(
  guildPath: string,
  toolServerPort: number,
  oculusPort: number,
): Promise<void> {
  const guildJsonPath = path.join(guildPath, 'guild.json');
  const existingRaw = await readFile(guildJsonPath, 'utf8');
  const existing = JSON.parse(existingRaw) as Record<string, unknown>;
  const merged = deepMerge(existing, {
    tools: { serverPort: toolServerPort },
    oculus: { port: oculusPort },
  });
  await writeFile(guildJsonPath, JSON.stringify(merged, null, 2) + '\n');
}

// ── Setup engine ─────────────────────────────────────────────────────

export const daemonSetupEngine: EngineDesign = {
  id: 'lab.daemon-setup',
  async run(rawGivens, context: EngineRunContext): Promise<EngineRunResult> {
    const designId = 'lab.daemon-setup';
    const givens = validateGivens(rawGivens, designId);
    const testGuild = resolveTestGuildForDaemon(context.upstream, designId);
    const localNsg = resolveLocalNsg(testGuild.guildPath, designId);

    // 1. Resolve ports.
    const toolServerPort = givens.toolServerPort ?? (await allocatePort());
    const oculusPort = givens.oculusPort ?? (await allocatePort());

    // 2. Write port overrides into the test guild's guild.json.
    await writePortConfig(testGuild.guildPath, toolServerPort, oculusPort);

    // 3. Pre-flight: refuse to clobber a running daemon. nsg start is
    //    idempotent (returns "already running" rather than failing),
    //    but a concurrent daemon implies a stale fixture state, not
    //    a legitimate setup invocation. Surface it as an error so
    //    the rig fails fast.
    const pidFile = path.join(testGuild.guildPath, '.nexus', 'daemon.pid');
    if (existsSync(pidFile)) {
      throw new Error(
        `[${designId}] pidfile already exists at ${pidFile} — a daemon is either running ` +
          `or a stale pidfile is left from a prior failed teardown. Run \`nsg --guild-root ` +
          `${testGuild.guildPath} stop\` to clean up before re-running.`,
      );
    }

    // 4. Start the daemon. Returns once the tool HTTP server is
    //    reachable; nsg start owns the detach + startup-sync internally.
    let daemonStarted = false;
    try {
      await exec(localNsg, ['--guild-root', testGuild.guildPath, 'start']);
      daemonStarted = true;

      // 5. Read pidfile for the yield. nsg start writes it before the
      //    parent's startup-sync returns success, so this is racefree.
      if (!existsSync(pidFile)) {
        throw new Error(
          `[${designId}] nsg start succeeded but pidfile is missing at ${pidFile}. ` +
            `This indicates a framework regression — startup-sync should not return ` +
            `success without the pidfile in place.`,
        );
      }
      const pidStr = (await readFile(pidFile, 'utf8')).trim();
      const daemonPid = Number(pidStr);
      if (!Number.isFinite(daemonPid) || daemonPid <= 0) {
        throw new Error(
          `[${designId}] pidfile at ${pidFile} contains malformed content: "${pidStr}".`,
        );
      }

      const logsDir = path.join(testGuild.guildPath, '.nexus', 'logs');

      return {
        status: 'completed',
        yields: {
          guildPath: testGuild.guildPath,
          daemonPid,
          toolServerPort,
          oculusPort,
          pidFile,
          logsDir,
        },
      };
    } catch (err) {
      // Best-effort rollback: if the daemon came up but a later step
      // (e.g. pidfile read) failed, stop the daemon so we don't leave
      // it orphaned.
      if (daemonStarted) {
        try {
          await exec(localNsg, ['--guild-root', testGuild.guildPath, 'stop']);
        } catch {
          // swallow — primary error is what we re-throw
        }
      }
      throw err;
    }
  },
};

// ── Teardown engine ──────────────────────────────────────────────────

export const daemonTeardownEngine: EngineDesign = {
  id: 'lab.daemon-teardown',
  async run(rawGivens, context: EngineRunContext): Promise<EngineRunResult> {
    const designId = 'lab.daemon-teardown';
    validateGivens(rawGivens, designId);
    const testGuild = resolveTestGuildForDaemon(context.upstream, designId);

    // Archive-presence safety check (same as guild-teardown).
    const trialId = resolveTrialIdForTeardown(rawGivens, designId);
    await assertArchiveRowExists(trialId, designId, `daemon for guild "${testGuild.guildName}"`);

    // nsg stop is idempotent: returns "no daemon running" when the
    // pidfile is absent, escalates SIGTERM to SIGKILL if needed.
    // Tolerant of the local nsg being missing — if guild-teardown
    // ran first (it shouldn't, in reverse-topo order, but defend
    // against it anyway), the binstub may be gone.
    const localNsg = path.join(testGuild.guildPath, 'node_modules', '.bin', 'nsg');
    if (existsSync(localNsg)) {
      await exec(localNsg, ['--guild-root', testGuild.guildPath, 'stop']);
    }

    return {
      status: 'completed',
      yields: {
        stopped: true,
        guildPath: testGuild.guildPath,
      },
    };
  },
};
