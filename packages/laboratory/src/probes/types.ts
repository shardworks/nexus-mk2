/**
 * Probe types — the contract layer that lets `nsg lab trial-extract`
 * dispatch by engine id without a hardcoded probe table.
 *
 * No separate probe registry: the Fabricator already catalogues every
 * registered engine design by id (FabricatorApi.getEngineDesign).
 * Probes are simply engine designs that ALSO carry an `extract()`
 * method — a structural subtype of `EngineDesign`. The trial-extract
 * tool walks the archive row's probe entries, looks each engineId up
 * via the Fabricator, and dispatches when the design satisfies the
 * `isProbeEngineDesign` type guard.
 *
 * Tracked at click c-momkil4p.
 */

import type { EngineDesign } from '@shardworks/fabricator-apparatus';

// ── Extract contract ──────────────────────────────────────────────────

/** Inputs passed to a probe's extract handler. */
export interface ProbeExtractArgs {
  /** The trial writ id whose data we're materializing. */
  trialId: string;
  /**
   * Absolute path to a directory the probe is allowed to write into.
   * Created by the caller before invocation. Probes should write under
   * a probe-specific subdirectory (or a single namespaced file) so
   * multiple probes can share the same `targetDir` without colliding.
   */
  targetDir: string;
}

/** Result of a probe's extract handler. */
export interface ProbeExtractResult {
  /**
   * Files the probe wrote, with paths relative to `targetDir` and
   * byte counts. Used by the extract tool's summary output.
   */
  files: Array<{ path: string; bytes: number }>;
}

/**
 * A probe engine design — `EngineDesign` plus an `extract()` handler.
 *
 * The trial-extract tool resolves probes by their engine id (read
 * from `lab-trial-archives.probes[].engineId`), looks the design up
 * via `FabricatorApi.getEngineDesign(id)`, and confirms it satisfies
 * `isProbeEngineDesign` before invoking `extract()`. Engines without
 * the method are silently skipped from extraction (they may be valid
 * non-probe engines whose design id happens to appear in the probe
 * row — defensive, not expected).
 */
export interface ProbeEngineDesign extends EngineDesign {
  extract(args: ProbeExtractArgs): Promise<ProbeExtractResult>;
}

/**
 * Type guard for engines that carry an extract handler. Used by the
 * trial-extract tool to dispatch probe-aware behavior.
 */
export function isProbeEngineDesign(design: EngineDesign): design is ProbeEngineDesign {
  return typeof (design as Partial<ProbeEngineDesign>).extract === 'function';
}
