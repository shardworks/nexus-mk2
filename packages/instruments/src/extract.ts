/**
 * Run extractor scripts to produce template variable values.
 *
 * Each extractor is a shell script that receives parameters as
 * INSTRUMENT_* environment variables and writes its output to stdout.
 * A shared INSTRUMENT_CONTEXT_DIR allows extractors to cache and
 * share intermediate state (e.g. resolved commit ranges).
 */

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { InstrumentConfig, ResolvedParams, ExtractedInputs } from './types.ts';

/** Maximum extractor execution time (30 seconds) */
const EXTRACTOR_TIMEOUT_MS = 30_000;

/**
 * Build the environment variables passed to all extractor scripts.
 */
function buildEnv(
  params: ResolvedParams,
  instrumentDir: string,
  contextDir: string,
): Record<string, string> {
  const env: Record<string, string> = {
    // Inherit PATH and basic shell env
    PATH: process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin',
    HOME: process.env.HOME ?? '/tmp',
    // Instrument runner vars
    INSTRUMENT_DIR: resolve(instrumentDir),
    INSTRUMENT_CONTEXT_DIR: resolve(contextDir),
  };

  // Pass each parameter as INSTRUMENT_<UPPER_NAME>
  for (const [key, value] of Object.entries(params)) {
    env[`INSTRUMENT_${key.toUpperCase()}`] = value;
  }

  return env;
}

/**
 * Run the setup script if declared. Setup runs once before extractors
 * and typically writes shared state to INSTRUMENT_CONTEXT_DIR.
 */
export function runSetup(
  config: InstrumentConfig,
  instrumentDir: string,
  params: ResolvedParams,
  contextDir: string,
): void {
  if (!config.setup) return;

  const scriptPath = join(instrumentDir, config.setup);
  if (!existsSync(scriptPath)) {
    throw new Error(`Setup script not found: ${scriptPath}`);
  }

  const env = buildEnv(params, instrumentDir, contextDir);

  try {
    execFileSync('bash', [scriptPath], {
      env,
      timeout: EXTRACTOR_TIMEOUT_MS,
      maxBuffer: 10 * 1024 * 1024,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Setup script failed: ${config.setup}\n${msg}`);
  }
}

/**
 * Run all extractor scripts and return a map of variable name → output.
 */
export function runExtractors(
  config: InstrumentConfig,
  instrumentDir: string,
  params: ResolvedParams,
  contextDir: string,
): ExtractedInputs {
  const env = buildEnv(params, instrumentDir, contextDir);
  const results: ExtractedInputs = {};

  for (const [varName, inputDef] of Object.entries(config.inputs)) {
    const scriptPath = join(instrumentDir, inputDef.extractor);

    if (!existsSync(scriptPath)) {
      if (inputDef.optional) {
        results[varName] = '';
        continue;
      }
      throw new Error(`Extractor script not found: ${scriptPath}`);
    }

    try {
      const output = execFileSync('bash', [scriptPath], {
        env,
        timeout: EXTRACTOR_TIMEOUT_MS,
        maxBuffer: 10 * 1024 * 1024,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      results[varName] = output.toString('utf-8');
    } catch (err) {
      if (inputDef.optional) {
        results[varName] = '';
        continue;
      }
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Extractor failed for ${varName} (${inputDef.extractor}):\n${msg}`);
    }
  }

  return results;
}
