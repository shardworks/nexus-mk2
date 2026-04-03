/**
 * Resolve an instrument directory from root + name + version.
 *
 * Supports three resolution strategies:
 *   1. Explicit path: --instrument /full/path/to/version/dir
 *   2. Name + version: --instrument-name foo --instrument-version v1
 *      resolves to {root}/foo/v1
 *   3. Name only: --instrument-name foo
 *      auto-selects version if exactly one exists; errors if multiple
 *
 * The instrument root defaults to experiments/instruments/ relative
 * to the project root, overridable via --instrument-root.
 */

import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

/** Default instrument root, relative to process.cwd() */
const DEFAULT_ROOT = 'experiments/instruments';

export interface ResolveOptions {
  /** Explicit full path to a versioned instrument directory */
  instrument?: string;
  /** Root directory containing all instruments */
  instrumentRoot?: string;
  /** Instrument name (directory name under root) */
  instrumentName?: string;
  /** Instrument version (subdirectory under name) */
  instrumentVersion?: string;
}

/**
 * Resolve the instrument directory from the provided options.
 */
export function resolveInstrumentDir(opts: ResolveOptions): string {
  // Strategy 1: explicit path
  if (opts.instrument) {
    const dir = resolve(opts.instrument);
    if (!existsSync(join(dir, 'instrument.yaml'))) {
      throw new Error(`No instrument.yaml found in: ${dir}`);
    }
    return dir;
  }

  // Need instrument name for strategies 2 and 3
  if (!opts.instrumentName) {
    throw new Error(
      'Either --instrument <path> or --instrument-name <name> is required',
    );
  }

  const root = resolve(opts.instrumentRoot ?? DEFAULT_ROOT);
  if (!existsSync(root)) {
    throw new Error(`Instrument root not found: ${root}`);
  }

  const instrumentDir = join(root, opts.instrumentName);
  if (!existsSync(instrumentDir)) {
    // List available instruments for a helpful error
    const available = listInstruments(root);
    throw new Error(
      `Instrument '${opts.instrumentName}' not found in ${root}\n` +
        `Available: ${available.length > 0 ? available.join(', ') : '(none)'}`,
    );
  }

  // Strategy 2: explicit version
  if (opts.instrumentVersion) {
    const versionDir = join(instrumentDir, opts.instrumentVersion);
    if (!existsSync(join(versionDir, 'instrument.yaml'))) {
      const versions = listVersions(instrumentDir);
      throw new Error(
        `Version '${opts.instrumentVersion}' not found for '${opts.instrumentName}'\n` +
          `Available: ${versions.length > 0 ? versions.join(', ') : '(none)'}`,
      );
    }
    return versionDir;
  }

  // Strategy 3: auto-select version
  const versions = listVersions(instrumentDir);
  if (versions.length === 0) {
    throw new Error(
      `No versions found for instrument '${opts.instrumentName}' in ${instrumentDir}`,
    );
  }
  if (versions.length > 1) {
    throw new Error(
      `Multiple versions found for '${opts.instrumentName}': ${versions.join(', ')}\n` +
        `Specify one with --instrument-version`,
    );
  }

  return join(instrumentDir, versions[0]);
}

/**
 * List instrument names (directories) under the root.
 */
function listInstruments(root: string): string[] {
  try {
    return readdirSync(root)
      .filter((name) => {
        const full = join(root, name);
        return statSync(full).isDirectory() && !name.startsWith('.');
      })
      .sort();
  } catch {
    return [];
  }
}

/**
 * List version directories (containing instrument.yaml) under an instrument.
 */
function listVersions(instrumentDir: string): string[] {
  try {
    return readdirSync(instrumentDir)
      .filter((name) => {
        const full = join(instrumentDir, name);
        return (
          statSync(full).isDirectory() &&
          existsSync(join(full, 'instrument.yaml'))
        );
      })
      .sort();
  } catch {
    return [];
  }
}
