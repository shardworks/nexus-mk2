/**
 * lab.guild-setup / lab.guild-teardown — fixture engines for a per-trial
 * test guild.
 *
 * MOTIVATION
 * ──────────
 * A trial wants a fresh, disposable guild instance to commission work
 * into. The guild needs:
 *   - The right plugins installed (varies per trial: every plugin the
 *     test workload exercises must be there).
 *   - The codexes from upstream fixtures registered (so the test guild
 *     knows about them).
 *   - Optional `guild.json` overlay (e.g. configuring patron role for
 *     astrolabe).
 *   - Optional file copies (e.g. a custom prompt template for animator).
 *
 * SETUP FLOW
 * ──────────
 * 1. Validate givens; resolve guildName, guildPath, frameworkVersion.
 * 2. Refuse if the target dir already exists (idempotency / safety).
 * 3. **Bootstrap (one-time, npx):**
 *    `npx -p @shardworks/nexus@<frameworkVersion> nsg init <guildPath>
 *    --name <guildName>`. This mirrors how a real user would create a
 *    guild from scratch and binds the test guild to the trial-pinned
 *    framework version (the version-true `init` runs against the
 *    version-true `VERSION` constant). After bootstrap,
 *    `<guildPath>/node_modules/.bin/nsg` exists.
 * 4. For each plugin pin: `<guildPath>/node_modules/.bin/nsg
 *    --guild-root <guildPath> plugin install <name>@<version>`.
 * 5. Discover codexes from `context.upstream`: any upstream yields with
 *    `codexName` + `remoteUrl` (the codex-fixture's yields shape) get
 *    registered via the test guild's local nsg. Walks all upstream
 *    entries — no manifest-level dependsOn declaration of "this is
 *    the codex" needed.
 * 6. Deep-merge `givens.config` into `<guildPath>/guild.json`.
 * 7. Copy each `givens.files[]` entry from `sourcePath` (absolute only
 *    in v1) to `<guildPath>/<guildPath>` (per-entry guildPath).
 * 8. Yield guildPath, pluginsResolved, codexesAdded, filesCopied.
 *
 * After bootstrap (step 3), the lab-host's `nsg` is **not** invoked
 * again for this trial. Steps 4-5 use the test guild's locally-
 * installed CLI; the scenario engine (commission-post-xguild) and
 * its sibling do the same. The lab-host doesn't need a global or
 * local `nsg` install for the laboratory to work — only `npx` (which
 * ships with Node).
 *
 * Failure handling: any error mid-setup triggers best-effort rollback
 * (rm -rf the guild dir) and re-throws.
 *
 * TEARDOWN FLOW
 * ─────────────
 * 1. Validate givens; resolve guildPath.
 * 2. Archive-safety check (same as codex-teardown).
 * 3. `rm -rf <guildPath>`.
 * 4. Yield `{ removed: true, guildPath }`.
 *
 * GIVENS (setup AND teardown — fixture givens are shared)
 * ───────────────────────────────────────────────────────
 *   guildName : string?  — Optional. The test guild's identity name.
 *                          Defaults to `<slug>-<writId-tail>` from the
 *                          framework-injected `_trial` context (matches
 *                          the codex-fixture's default-naming convention).
 *   guildPath : string?  — Optional. Absolute path for the test guild dir.
 *                          Defaults to
 *                          `<labHostGuild>/.nexus/laboratory/guilds/<guildName>/`.
 *   plugins   : Array<{name, version}>?  — Optional. Plugin pins to install.
 *                          Each entry is shelled out as
 *                          `nsg plugin install <name>@<version>` against the
 *                          test guild's local nsg. **Versions must be stable
 *                          pins** (exact semver, git+url#sha, github-shorthand
 *                          #sha, or registry tarball) — the manifest CLI
 *                          rejects file:/link:/range/dist-tag forms at load
 *                          time, see `stable-pin.ts`.
 *   config    : object?   — Optional. Deep-merged into the guild's
 *                          `guild.json` after init.
 *   files     : Array<{sourcePath, guildPath}>?  — Optional. File copies.
 *                          sourcePath must be absolute in v1 (throws on
 *                          relative). guildPath is relative to the guild
 *                          root.
 *
 * YIELDS (setup)
 * ──────────────
 *   {
 *     guildName: string,
 *     guildPath: string,
 *     pluginsResolved: Array<{ name: string; version: string }>,
 *     codexesAdded: Array<{ codexName: string; remoteUrl: string }>,
 *     filesCopied: Array<{ sourcePath: string; guildPath: string }>,
 *   }
 *
 * YIELDS (teardown)
 * ─────────────────
 *   { removed: true, guildName: string, guildPath: string }
 */

import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { guild } from '@shardworks/nexus-core';
import type {
  EngineDesign,
  EngineRunContext,
  EngineRunResult,
} from '@shardworks/fabricator-apparatus';
import type { InjectedTrialContext } from './phases.ts';
import {
  assertArchiveRowExists,
  resolveTrialIdForTeardown,
} from '../archive/presence.ts';

const execFile = promisify(execFileCb);

// ── Givens validation ────────────────────────────────────────────────

export interface PluginPin {
  name: string;
  version: string;
}

export interface FileCopy {
  sourcePath: string;
  guildPath: string;
}

interface ResolvedGuildFixtureGivens {
  guildName: string;
  guildPath: string;
  plugins: PluginPin[];
  config: Record<string, unknown>;
  files: FileCopy[];
  frameworkVersion?: string;
}

/**
 * Guild-name rules — used as the test guild's `name` field and as the
 * default dir basename. Conservative: kebab-case, 1–60 chars.
 */
const GUILD_NAME_PATTERN = /^[a-z][a-z0-9-]{0,59}$/;

/**
 * Compute the default guild name from the framework-injected `_trial`
 * context: `<slug>-<writIdTail>`. Returns null when `_trial` is missing
 * or malformed.
 */
function defaultGuildName(givens: Record<string, unknown>): string | null {
  const trial = givens._trial as InjectedTrialContext | undefined;
  if (!trial || typeof trial.slug !== 'string' || typeof trial.writId !== 'string') {
    return null;
  }
  const tail = (trial.writId.split('-').pop() ?? trial.writId).slice(0, 8);
  return `${trial.slug}-${tail}`;
}

/**
 * Resolve the default guild path inside the lab-host guild's filesystem.
 * Mirrors the codex-fixture's `.nexus/laboratory/codexes/<name>.git`
 * placement: lab-host-internal, namespaced under `.nexus/laboratory/`.
 */
export function defaultGuildPath(labHostGuildHome: string, guildName: string): string {
  return path.join(labHostGuildHome, '.nexus', 'laboratory', 'guilds', guildName);
}

function validateGivens(
  rawGivens: Record<string, unknown>,
  designId: string,
): ResolvedGuildFixtureGivens {
  // Resolve guildName.
  let guildName = rawGivens.guildName;
  if (guildName === undefined || guildName === null) {
    const fallback = defaultGuildName(rawGivens);
    if (fallback === null) {
      throw new Error(
        `[${designId}] givens.guildName is missing and no _trial context was injected. ` +
          `Either author guildName explicitly, or ensure the engine runs under the ` +
          `Laboratory phase orchestrators.`,
      );
    }
    guildName = fallback;
  }
  if (typeof guildName !== 'string' || !GUILD_NAME_PATTERN.test(guildName)) {
    throw new Error(
      `[${designId}] guildName must be kebab-case (start with a letter; ` +
        `alphanumeric and hyphens; ≤60 chars); got "${String(guildName)}".`,
    );
  }

  // Resolve guildPath.
  let guildPath = rawGivens.guildPath;
  if (guildPath === undefined || guildPath === null) {
    guildPath = defaultGuildPath(guild().home, guildName);
  }
  if (typeof guildPath !== 'string' || !path.isAbsolute(guildPath)) {
    throw new Error(
      `[${designId}] guildPath must be an absolute path; got "${String(guildPath)}".`,
    );
  }

  // Plugins.
  const rawPlugins = rawGivens.plugins ?? [];
  if (!Array.isArray(rawPlugins)) {
    throw new Error(
      `[${designId}] givens.plugins must be an array of {name, version}; got ` +
        `${typeof rawPlugins}.`,
    );
  }
  const plugins: PluginPin[] = [];
  for (let i = 0; i < rawPlugins.length; i += 1) {
    const p = rawPlugins[i] as Record<string, unknown> | undefined;
    if (!p || typeof p.name !== 'string' || typeof p.version !== 'string') {
      throw new Error(
        `[${designId}] givens.plugins[${i}] must be {name: string, version: string}; ` +
          `got ${JSON.stringify(p)}.`,
      );
    }
    plugins.push({ name: p.name, version: p.version });
  }

  // Config.
  const rawConfig = rawGivens.config ?? {};
  if (!isPlainObject(rawConfig)) {
    throw new Error(
      `[${designId}] givens.config must be a plain object; got ${typeof rawConfig}.`,
    );
  }

  // Files.
  const rawFiles = rawGivens.files ?? [];
  if (!Array.isArray(rawFiles)) {
    throw new Error(
      `[${designId}] givens.files must be an array of {sourcePath, guildPath}; got ` +
        `${typeof rawFiles}.`,
    );
  }
  const files: FileCopy[] = [];
  for (let i = 0; i < rawFiles.length; i += 1) {
    const f = rawFiles[i] as Record<string, unknown> | undefined;
    if (!f || typeof f.sourcePath !== 'string' || typeof f.guildPath !== 'string') {
      throw new Error(
        `[${designId}] givens.files[${i}] must be {sourcePath: string, guildPath: string}; ` +
          `got ${JSON.stringify(f)}.`,
      );
    }
    if (!path.isAbsolute(f.sourcePath)) {
      throw new Error(
        `[${designId}] givens.files[${i}].sourcePath must be absolute in v1 ` +
          `(manifest-relative resolution is future work); got "${f.sourcePath}".`,
      );
    }
    if (path.isAbsolute(f.guildPath)) {
      throw new Error(
        `[${designId}] givens.files[${i}].guildPath must be relative to the guild root; ` +
          `got absolute "${f.guildPath}".`,
      );
    }
    files.push({ sourcePath: f.sourcePath, guildPath: f.guildPath });
  }

  // Pull frameworkVersion from the framework-injected _trial context.
  // trial-post.ts resolves an undefined manifest value before stamping
  // the writ, so on a posted trial this should always be set —
  // teardown calls don't need it (we early-return here for
  // teardown).
  const trial = rawGivens._trial as InjectedTrialContext | undefined;
  const frameworkVersion =
    trial && typeof trial.frameworkVersion === 'string' && trial.frameworkVersion.length > 0
      ? trial.frameworkVersion
      : undefined;

  return { guildName, guildPath, plugins, config: rawConfig, files, frameworkVersion };
}

// ── Helpers ──────────────────────────────────────────────────────────

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return (
    typeof v === 'object' &&
    v !== null &&
    !Array.isArray(v) &&
    Object.getPrototypeOf(v) === Object.prototype
  );
}

/**
 * Recursive deep-merge — source overrides target. Plain objects are
 * merged structurally; arrays and scalars from source replace target
 * outright. Non-mutating.
 */
export function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...target };
  for (const [k, v] of Object.entries(source)) {
    if (isPlainObject(v) && isPlainObject(result[k])) {
      result[k] = deepMerge(result[k] as Record<string, unknown>, v);
    } else {
      result[k] = v;
    }
  }
  return result;
}

/**
 * Discover codexes from upstream yields — any object that has both
 * `codexName: string` and `remoteUrl: string` is treated as a codex
 * to register in the test guild. Matches the codex-fixture's yield
 * shape exactly.
 */
export interface DiscoveredCodex {
  codexName: string;
  remoteUrl: string;
}

export function discoverCodexes(
  upstream: Record<string, unknown>,
): DiscoveredCodex[] {
  const result: DiscoveredCodex[] = [];
  for (const value of Object.values(upstream)) {
    if (
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value)
    ) {
      const obj = value as Record<string, unknown>;
      if (typeof obj.codexName === 'string' && typeof obj.remoteUrl === 'string') {
        result.push({ codexName: obj.codexName, remoteUrl: obj.remoteUrl });
      }
    }
  }
  return result;
}

/**
 * Run a command via execFile — no shell, predictable arg quoting.
 * Throws with stderr on non-zero exit.
 */
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

// ── Setup engine ─────────────────────────────────────────────────────

export const guildSetupEngine: EngineDesign = {
  id: 'lab.guild-setup',
  async run(rawGivens, context: EngineRunContext): Promise<EngineRunResult> {
    const givens = validateGivens(rawGivens, 'lab.guild-setup');
    const { guildName, guildPath, plugins, config, files, frameworkVersion } = givens;

    if (frameworkVersion === undefined) {
      throw new Error(
        `[lab.guild-setup] framework-injected _trial.frameworkVersion is missing. ` +
          `The trial-post tool resolves this from the manifest or the lab-host's ` +
          `@shardworks/nexus-core VERSION before stamping the writ; a missing value here ` +
          `means the engine was invoked outside the laboratory's phase orchestrators or ` +
          `against a writ posted before the resolution change landed.`,
      );
    }

    if (existsSync(guildPath)) {
      throw new Error(
        `[lab.guild-setup] target dir already exists at ${guildPath}; refusing to clobber. ` +
          `Guild name "${guildName}" likely collides with an active trial — pick a unique name.`,
      );
    }

    let initialized = false;

    try {
      // 1. Bootstrap via npx — runs the trial-pinned `nsg init` against
      //    the trial-pinned VERSION. Mirrors how a real user would
      //    create a guild (npx-the-CLI). After this, the test guild
      //    has @shardworks/nexus installed at the pinned version and
      //    its node_modules/.bin/nsg is the version-true CLI.
      await mkdir(path.dirname(guildPath), { recursive: true });
      await exec('npx', [
        '--yes',
        '-p',
        `@shardworks/nexus@${frameworkVersion}`,
        'nsg',
        'init',
        guildPath,
        '--name',
        guildName,
      ]);
      initialized = true;

      // From here on, every shellout uses the test guild's local nsg
      // — version-matched to the test guild, no dependency on whatever
      // CLI happens to be on PATH.
      const localNsg = path.join(guildPath, 'node_modules', '.bin', 'nsg');
      if (!existsSync(localNsg)) {
        throw new Error(
          `[lab.guild-setup] expected ${localNsg} after bootstrap but it is missing. ` +
            `nsg init's dev-guard skips writing the framework dep and skips npm install when ` +
            `running from unbuilt source (VERSION=0.0.0). Pin frameworkVersion to a stable ` +
            `spec where the source is built (dist/ exists) — e.g. an exact semver from npm, ` +
            `or 'git+file:///path/to/built/repo#<sha>' for a local commit.`,
        );
      }

      // 2. Plugin install. Sequential, not parallel — npm install in the
      //    same dir doesn't tolerate concurrency, and order matters when
      //    plugins declare peer/optional deps. Per-plugin shellout (vs.
      //    a bulk `npm install`) preserves whatever side effects
      //    `nsg plugin install` carries beyond the npm install (it
      //    updates guild.json's `plugins` array, etc.).
      const pluginsResolved: PluginPin[] = [];
      for (const pin of plugins) {
        const spec = `${pin.name}@${pin.version}`;
        await exec(localNsg, ['--guild-root', guildPath, 'plugin', 'install', spec]);
        pluginsResolved.push(pin);
      }

      // 3. Codex registration from upstream.
      const codexesAdded: DiscoveredCodex[] = [];
      const discovered = discoverCodexes(context.upstream);
      for (const codex of discovered) {
        await exec(localNsg, [
          '--guild-root',
          guildPath,
          'codex',
          'add',
          '--name',
          codex.codexName,
          '--remote-url',
          codex.remoteUrl,
        ]);
        codexesAdded.push(codex);
      }

      // 4. Deep-merge config into guild.json.
      if (Object.keys(config).length > 0) {
        const guildJsonPath = path.join(guildPath, 'guild.json');
        const existing = JSON.parse(await readFile(guildJsonPath, 'utf8')) as Record<
          string,
          unknown
        >;
        const merged = deepMerge(existing, config);
        await writeFile(guildJsonPath, JSON.stringify(merged, null, 2) + '\n');
      }

      // 5. File copies.
      const filesCopied: FileCopy[] = [];
      for (const file of files) {
        const dest = path.join(guildPath, file.guildPath);
        await mkdir(path.dirname(dest), { recursive: true });
        await copyFile(file.sourcePath, dest);
        filesCopied.push(file);
      }

      return {
        status: 'completed',
        yields: {
          guildName,
          guildPath,
          pluginsResolved,
          codexesAdded,
          filesCopied,
        },
      };
    } catch (err) {
      // Best-effort rollback: remove the guild dir if we got far enough
      // to create it. This means partial-state is not left behind for
      // teardown to clean up — every setup attempt is all-or-nothing.
      if (initialized) {
        try {
          await rm(guildPath, { recursive: true, force: true });
        } catch {
          // swallow — primary error is what we re-throw
        }
      }
      throw err;
    }
  },
};

// ── Teardown engine ──────────────────────────────────────────────────

export const guildTeardownEngine: EngineDesign = {
  id: 'lab.guild-teardown',
  async run(rawGivens, _context: EngineRunContext): Promise<EngineRunResult> {
    const { guildName, guildPath } = validateGivens(rawGivens, 'lab.guild-teardown');

    // Archive-presence safety check (tightened per c-momkqtn5).
    const trialId = resolveTrialIdForTeardown(rawGivens, 'lab.guild-teardown');
    await assertArchiveRowExists(trialId, 'lab.guild-teardown', `guild "${guildName}"`);

    // rm -rf — tolerant of "doesn't exist".
    await rm(guildPath, { recursive: true, force: true });

    return {
      status: 'completed',
      yields: {
        removed: true,
        guildName,
        guildPath,
      },
    };
  },
};
