/**
 * lab-trial-extract — materialize a trial's captured data to a directory.
 *
 * CLI surface:
 *
 *     nsg lab trial-extract <trialId> --to <path> [--force]
 *
 * Composes per-probe outputs by walking the archive row's
 * probes[] and dispatching to each probe engine's `extract()`
 * handler (resolved via Fabricator + ProbeEngineDesign type guard).
 * Generates two top-level files in the target dir from archive
 * metadata: `manifest.yaml` (the trial writ's
 * ext.laboratory.config) and `README.md` (archive metadata + probe
 * summaries in human-readable form).
 *
 * Refuses to overwrite a non-empty target directory unless `--force`
 * is supplied. The framework auto-resolves `--to` to an absolute path
 * via the standard CLI convention.
 *
 * Returns a summary of what was written.
 */

import { z } from 'zod';
import { existsSync } from 'node:fs';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { stringify as yamlStringify } from 'yaml';
import { guild } from '@shardworks/nexus-core';
import { tool } from '@shardworks/tools-apparatus';
import type { ClerkApi, WritDoc } from '@shardworks/clerk-apparatus';
import type { StacksApi } from '@shardworks/stacks-apparatus';
import type { FabricatorApi } from '@shardworks/fabricator-apparatus';
import {
  LAB_TRIAL_ARCHIVES_BOOK,
  type LabTrialArchive,
} from '../archive/book.ts';
import { isProbeEngineDesign } from '../probes/types.ts';
import type { LaboratoryTrialConfig } from '../types.ts';

export default tool({
  name: 'lab-trial-extract',
  description: 'Materialize a trial\'s captured data to a directory.',
  instructions:
    'Reads lab-trial-archives for the given trialId, then for each probe in the archive row ' +
    'looks up the engine via the Fabricator and dispatches its extract() handler to write ' +
    'files under <to>/. Top-level manifest.yaml and README.md are generated from archive ' +
    'metadata. Refuses to overwrite a non-empty target directory unless --force is set.',
  params: {
    trialId: z.string().min(1).describe('The trial writ id (or any unambiguous prefix).'),
    to: z.string().min(1).describe('Target directory. Created if missing.'),
    force: z
      .boolean()
      .optional()
      .describe('Allow extraction into a non-empty target directory.'),
  },
  permission: 'write',
  handler: async ({ trialId, to, force }) => {
    const labHost = guild();
    const targetDir = path.isAbsolute(to) ? to : path.resolve(process.cwd(), to);

    // Sanity-check the target dir.
    if (existsSync(targetDir)) {
      const existing = await readdir(targetDir);
      if (existing.length > 0 && force !== true) {
        throw new Error(
          `lab-trial-extract: target dir ${targetDir} is not empty; pass --force to extract anyway.`,
        );
      }
    } else {
      await mkdir(targetDir, { recursive: true });
    }

    const clerk = labHost.apparatus<ClerkApi>('clerk');
    const fullId = await clerk.resolveId(trialId);

    const stacks = labHost.apparatus<StacksApi>('stacks');
    const archives = stacks.readBook<LabTrialArchive>(
      'laboratory',
      LAB_TRIAL_ARCHIVES_BOOK,
    );
    const rows = await archives.find({ where: [['trialId', '=', fullId]] });
    if (rows.length === 0) {
      throw new Error(
        `lab-trial-extract: no archive row for trialId=${fullId}. The trial may have ` +
          `failed before reaching its archive engine.`,
      );
    }
    const archive = rows[0]!;

    // Read writ for manifest + writ-level metadata.
    const writ: WritDoc = await clerk.show(fullId);
    const config = (writ.ext as { laboratory?: { config?: LaboratoryTrialConfig } } | undefined)
      ?.laboratory?.config;

    // Top-level manifest.yaml — best-effort.
    const writtenFiles: Array<{ path: string; bytes: number; probeId?: string }> = [];
    if (config) {
      const manifestText = yamlStringify(config);
      const manifestRel = 'manifest.yaml';
      await writeFile(path.join(targetDir, manifestRel), manifestText, 'utf8');
      writtenFiles.push({
        path: manifestRel,
        bytes: Buffer.byteLength(manifestText, 'utf8'),
      });
    }

    // Top-level README.md — archive metadata + probe summaries.
    const readme = renderReadme({ writ, archive });
    const readmeRel = 'README.md';
    await writeFile(path.join(targetDir, readmeRel), readme, 'utf8');
    writtenFiles.push({
      path: readmeRel,
      bytes: Buffer.byteLength(readme, 'utf8'),
    });

    // Per-probe extract dispatch.
    const fabricator = labHost.apparatus<FabricatorApi>('fabricator');
    const skippedProbes: Array<{ id: string; engineId: string; reason: string }> = [];
    for (const probe of archive.probes) {
      const design = fabricator.getEngineDesign(probe.engineId);
      if (!design) {
        skippedProbes.push({
          id: probe.id,
          engineId: probe.engineId,
          reason: 'engine design not registered (plugin not installed?)',
        });
        continue;
      }
      if (!isProbeEngineDesign(design)) {
        skippedProbes.push({
          id: probe.id,
          engineId: probe.engineId,
          reason: 'engine has no extract() handler',
        });
        continue;
      }
      const result = await design.extract({
        trialId: fullId,
        targetDir,
      });
      for (const file of result.files) {
        writtenFiles.push({ path: file.path, bytes: file.bytes, probeId: probe.id });
      }
    }

    return {
      trialId: fullId,
      archiveId: archive.id,
      targetDir,
      filesWritten: writtenFiles.length,
      files: writtenFiles,
      skippedProbes,
    };
  },
});

// ── Render helpers ────────────────────────────────────────────────────

function renderReadme(args: { writ: WritDoc; archive: LabTrialArchive }): string {
  const { writ, archive } = args;
  const lines: string[] = [];
  lines.push(`# Trial extract — ${writ.title || writ.id}`);
  lines.push('');
  lines.push(`- **Trial id**: \`${writ.id}\``);
  lines.push(`- **Archive id**: \`${archive.id}\``);
  lines.push(`- **Archived at**: ${archive.archivedAt}`);
  lines.push(`- **Writ phase**: ${writ.phase}`);
  if (writ.resolvedAt) {
    lines.push(`- **Writ resolved at**: ${writ.resolvedAt}`);
  }
  lines.push('');
  lines.push('## Probes');
  lines.push('');
  if (archive.probes.length === 0) {
    lines.push('_No probes ran for this trial._');
  } else {
    for (const probe of archive.probes) {
      lines.push(`### ${probe.id} — \`${probe.engineId}\``);
      lines.push('');
      lines.push('```yaml');
      lines.push(yamlStringify(probe.summary).trimEnd());
      lines.push('```');
      lines.push('');
    }
  }
  lines.push('## Layout');
  lines.push('');
  lines.push('- `manifest.yaml` — `ext.laboratory.config` from the trial writ.');
  lines.push('- `README.md` — this file.');
  lines.push('- Per-probe subdirectories — see each probe\'s extractor.');
  lines.push('');
  return lines.join('\n');
}
