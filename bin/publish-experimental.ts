#!/usr/bin/env npx tsx
/**
 * publish-experimental — publish a prerelease version of every nexus
 * workspace package to npm under the `experimental` dist-tag, for use as a
 * reproducible artifact in Laboratory trials.
 *
 * Operates on a fresh clone of the nexus repo in a temp directory, never
 * touching /workspace/nexus's working tree. Mirrors the CI publish workflow's
 * version-injection pattern (.github/workflows/publish.yml in nexus), but
 * runs manually from an experiment branch.
 *
 * Usage:
 *   npx tsx bin/publish-experimental.ts --branch <branch-name> [opts]
 *
 *   --branch <name>       (required) Branch in the nexus repo to publish from
 *   --experiment <x###>   Override experiment id (default: derive from branch)
 *   --skip-checks         Skip typecheck + test, still build before publish
 *   --yes, -y             Skip confirmation prompt
 *   --keep                Keep the temp clone dir on exit (for debugging)
 *   --help, -h            Print this message
 *
 * Branch convention:
 *   experimental/<x###>-<short-desc>   e.g., experimental/x019-code-lookup
 *
 * Auth: requires npm publish access to @shardworks. Configure via ~/.npmrc:
 *   //registry.npmjs.org/:_authToken=<token>
 *
 * Companion doc:
 *   experiments/lab-operations/running-trials.md
 *   §"Framework changes for experiments"
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

// ── Config ────────────────────────────────────────────────────────────────

const NEXUS_GIT_URL = 'git@github.com:shardworks/nexus.git';
const PROBE_PACKAGE = '@shardworks/stacks-apparatus';
const TMP_PREFIX = 'nexus-publish-';

// ── Argument parsing ──────────────────────────────────────────────────────

interface Args {
  branch: string | null;
  experimentId: string | null;
  skipChecks: boolean;
  yes: boolean;
  keep: boolean;
}

function parseArgs(argv: string[]): Args {
  const result: Args = {
    branch: null,
    experimentId: null,
    skipChecks: false,
    yes: false,
    keep: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--branch') {
      result.branch = argv[++i] ?? null;
    } else if (arg === '--experiment') {
      result.experimentId = argv[++i] ?? null;
    } else if (arg === '--skip-checks') {
      result.skipChecks = true;
    } else if (arg === '--yes' || arg === '-y') {
      result.yes = true;
    } else if (arg === '--keep') {
      result.keep = true;
    } else if (arg === '--help' || arg === '-h') {
      printUsageAndExit(0);
    } else {
      console.error(`Unknown argument: ${arg}`);
      printUsageAndExit(2);
    }
  }
  return result;
}

function printUsageAndExit(code: number): never {
  console.error(`Usage: publish-experimental --branch <branch-name> [opts]

Required:
  --branch <name>       Branch in the nexus repo to publish from

Options:
  --experiment <x###>   Override experiment id (default: derive from branch)
  --skip-checks         Skip typecheck + test, still build before publish
  --yes, -y             Skip confirmation prompt
  --keep                Keep the temp clone dir on exit (for debugging)
  --help, -h            Print this message

Branch convention:
  experimental/<x###>-<short-desc>   e.g., experimental/x019-code-lookup
`);
  process.exit(code);
}

// ── Subprocess helpers ────────────────────────────────────────────────────

function gitOutput(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function run(cwd: string, cmd: string, args: string[]): void {
  const result = spawnSync(cmd, args, { cwd, stdio: 'inherit' });
  if (result.status !== 0) {
    throw new Error(`Command failed: ${cmd} ${args.join(' ')} (exit ${result.status})`);
  }
}

// ── Version computation ───────────────────────────────────────────────────

function deriveExperimentIdFromBranch(branch: string): string | null {
  const match = branch.match(/^experimental\/(x\d+)-/);
  return match ? match[1] : null;
}

function latestReleasedVersion(cwd: string): string {
  try {
    const tag = gitOutput(cwd, [
      'describe', '--tags', '--abbrev=0', '--match=v*',
    ]);
    return tag.replace(/^v/, '');
  } catch {
    return '0.0.0';
  }
}

function nextPatchOf(version: string): string {
  const [major, minor, patch] = version.split('.').map(Number);
  return `${major}.${minor}.${patch + 1}`;
}

function fetchNpmVersions(pkg: string): string[] {
  try {
    const stdoutText = execFileSync(
      'npm', ['view', pkg, 'versions', '--json'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    );
    const parsed = JSON.parse(stdoutText);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [];
  }
}

function nextPrereleaseIncrement(
  versions: string[], basePatch: string, experimentId: string,
): number {
  const re = new RegExp(
    `^${basePatch.replace(/\./g, '\\.')}-${experimentId}\\.(\\d+)$`,
  );
  let max = -1;
  for (const v of versions) {
    const m = v.match(re);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return max + 1;
}

// ── Workspace package discovery + version injection (in tmp clone) ────────

interface WorkspacePackage {
  manifestPath: string;
  name: string;
  isPrivate: boolean;
}

function listWorkspacePackages(cloneDir: string): WorkspacePackage[] {
  const tracked = gitOutput(cloneDir, [
    'ls-files', '--', 'package.json', 'packages/*/*/package.json',
  ]).split('\n').filter(Boolean);
  return tracked.map((relPath) => {
    const fullPath = path.join(cloneDir, relPath);
    const pkg = JSON.parse(readFileSync(fullPath, 'utf8'));
    return {
      manifestPath: fullPath,
      name: pkg.name ?? '',
      isPrivate: pkg.private === true,
    };
  });
}

function injectVersion(packages: WorkspacePackage[], version: string): void {
  for (const pkg of packages) {
    const json = JSON.parse(readFileSync(pkg.manifestPath, 'utf8'));
    json.version = version;
    writeFileSync(pkg.manifestPath, JSON.stringify(json, null, 2) + '\n');
  }
}

// ── Confirmation prompt ───────────────────────────────────────────────────

async function confirm(question: string): Promise<boolean> {
  const rl = createInterface({ input: stdin, output: stdout });
  const answer = await rl.question(question);
  rl.close();
  return /^y(es)?$/i.test(answer.trim());
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (!args.branch) {
    console.error('--branch <name> is required.');
    printUsageAndExit(1);
  }
  const branch = args.branch;

  // Resolve experiment id
  let experimentId = args.experimentId;
  if (!experimentId) {
    experimentId = deriveExperimentIdFromBranch(branch);
    if (!experimentId) {
      console.error(
        `Cannot derive experiment id from branch '${branch}'.\n` +
        `Either use a branch named 'experimental/x###-*' or pass --experiment <x###>.`
      );
      process.exit(1);
    }
  }
  // Must be a valid semver prerelease identifier (one segment): [0-9A-Za-z-]+
  // Additionally require it start with a letter to prevent ambiguity with
  // numeric prerelease suffixes.
  if (!/^[A-Za-z][0-9A-Za-z-]*$/.test(experimentId)) {
    console.error(
      `Experiment id '${experimentId}' is malformed. ` +
      `Expected: starts with a letter, alphanumeric and dashes only ` +
      `(e.g., x019, verify, x019-batch2).`
    );
    process.exit(1);
  }

  // Set up temp clone dir
  const cloneDir = mkdtempSync(path.join(os.tmpdir(), TMP_PREFIX));
  console.log(`Clone dir: ${cloneDir}`);

  // Always clean up unless --keep
  let keepDir = args.keep;
  const cleanup = () => {
    if (keepDir) {
      console.log(`Keeping clone dir: ${cloneDir}`);
      return;
    }
    try {
      rmSync(cloneDir, { recursive: true, force: true });
    } catch (err) {
      console.error(`Failed to remove ${cloneDir}: ${err}`);
    }
  };
  process.on('exit', cleanup);
  process.on('SIGINT', () => { cleanup(); process.exit(130); });
  process.on('SIGTERM', () => { cleanup(); process.exit(143); });

  // Clone (full history needed for git describe to find tags)
  console.log(`Cloning ${NEXUS_GIT_URL}#${branch}...`);
  run(process.cwd(), 'git', [
    'clone', '--branch', branch, NEXUS_GIT_URL, cloneDir,
  ]);

  // Fetch tags explicitly (in case branch's history doesn't include them)
  run(cloneDir, 'git', ['fetch', '--tags', '--quiet']);

  // Compute target version
  const latestVersion = latestReleasedVersion(cloneDir);
  const basePatch = nextPatchOf(latestVersion);

  console.log('');
  console.log(`Experiment:      ${experimentId}`);
  console.log(`Branch:          ${branch}`);
  console.log(`Latest released: ${latestVersion}`);
  console.log(`Base patch:      ${basePatch}`);

  console.log(`Probing existing prereleases on ${PROBE_PACKAGE}...`);
  const existingVersions = fetchNpmVersions(PROBE_PACKAGE);
  const incrementN = nextPrereleaseIncrement(existingVersions, basePatch, experimentId);
  const newVersion = `${basePatch}-${experimentId}.${incrementN}`;
  console.log(`Next version:    ${newVersion}`);

  // Confirm
  if (!args.yes) {
    const ok = await confirm(
      `\nPublish ${newVersion} to npm with --tag experimental? [y/N] `,
    );
    if (!ok) {
      console.log('Aborted.');
      keepDir = false; // ensure cleanup runs
      return;
    }
  }

  // Discover packages
  const packages = listWorkspacePackages(cloneDir);
  const publishable = packages.filter((p) => !p.isPrivate && p.name);
  console.log(`Workspace packages: ${packages.length} total, ${publishable.length} publishable`);

  // Pre-publish checks run BEFORE version injection — mirrors CI workflow
  // ordering (.github/workflows/publish.yml). Tests that pin to the
  // framework's own version (e.g., framework/cli init.test.ts) need to see
  // the placeholder 0.0.0 in package.json, not the not-yet-published
  // experimental version.
  if (!args.skipChecks) {
    console.log('Running pre-publish checks: install, build, typecheck, test...');
    run(cloneDir, 'pnpm', ['install', '--frozen-lockfile']);
    run(cloneDir, 'pnpm', ['build']);
    run(cloneDir, 'pnpm', ['typecheck']);
    run(cloneDir, 'pnpm', ['test']);
  } else {
    console.log('Skipping checks (--skip-checks); installing + building only...');
    run(cloneDir, 'pnpm', ['install', '--frozen-lockfile']);
    run(cloneDir, 'pnpm', ['build']);
  }

  // Inject version + rebuild so dist/ embeds the right version
  console.log(`Injecting version ${newVersion} into package.json files...`);
  injectVersion(packages, newVersion);
  console.log('Rebuilding with injected version...');
  run(cloneDir, 'pnpm', ['build']);

  // Publish
  console.log(`Publishing all workspace packages as ${newVersion}...`);
  run(cloneDir, 'pnpm', [
    '-r', 'publish',
    '--no-git-checks',
    '--access', 'public',
    '--tag', 'experimental',
  ]);

  // Success
  console.log('');
  console.log(`✓ Published: ${newVersion}`);
  console.log('');
  console.log('Trial manifest snippet:');
  console.log('');
  console.log(`  frameworkVersion: '${newVersion}'`);
  console.log('');
  console.log('  plugins:');
  for (const pkg of publishable) {
    console.log(`    - { name: '${pkg.name}', version: '${newVersion}' }`);
  }
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
