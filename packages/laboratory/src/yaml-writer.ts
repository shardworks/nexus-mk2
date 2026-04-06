/**
 * Hand-formatted YAML writing utilities.
 *
 * We hand-write YAML rather than using a library to preserve the existing
 * commission log's comments, spacing, and formatting. The commission log
 * is a standing research instrument with a carefully maintained header;
 * library serialization would strip all of that.
 */

import fs from 'node:fs';
import path from 'node:path';

// ── Frontmatter parsing ─────────────────────────────────────────────

/**
 * Extract the `author` field from YAML frontmatter in a writ body.
 * Returns undefined if no frontmatter or no author field.
 */
function extractFrontmatterAuthor(body: string): string | undefined {
  const match = body.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return undefined;
  const authorMatch = match[1].match(/^author:\s*(.+)$/m);
  return authorMatch?.[1].trim();
}

// ── Commission log ───────────────────────────────────────────────────

/**
 * Append a skeleton commission log entry for a newly created writ.
 *
 * Omits revision_required and failure_mode (added later if needed).
 * If the writ body has frontmatter with author: plan-writer, sets
 * spec_quality_pre and spec_quality_post to 'strong'.
 */
export function appendCommissionLogEntry(
  logPath: string,
  writ: { id: string; title: string; codex?: string; body?: string },
): void {
  // Escape the title for YAML (wrap in double quotes, escape internal quotes)
  const safeTitle = writ.title.replace(/"/g, '\\"');
  const codexLine = writ.codex ? `    codex: ${writ.codex}` : '    codex: null';

  const author = writ.body ? extractFrontmatterAuthor(writ.body) : undefined;
  const specQuality = author === 'plan-writer' ? 'strong' : 'null';

  const entry = `
  - id: ${writ.id}
    title: "${safeTitle}"
${codexLine}
    complexity: null
    spec_quality_pre: ${specQuality}
    outcome: null
    spec_quality_post: ${specQuality}
`;

  fs.appendFileSync(logPath, entry, 'utf-8');
}

/**
 * Set the outcome field on an existing commission log entry.
 * Optionally sets failure_mode as well (appends a new line after outcome).
 * No-op if the entry is not found.
 */
export function setCommissionOutcome(
  logPath: string,
  writId: string,
  outcome: string,
  failureMode?: string,
): boolean {
  if (!fs.existsSync(logPath)) return false;

  let content = fs.readFileSync(logPath, 'utf-8');

  // Replace outcome field
  const outcomePattern = new RegExp(
    `(- id: ${writId}\\n(?:    .*\\n)*?    outcome: )(null|\\w+)`,
  );

  const match = content.match(outcomePattern);
  if (!match) return false;

  content = content.replace(outcomePattern, `$1${outcome}`);

  // If failureMode provided, append failure_mode line after spec_quality_post
  // (or after outcome if spec_quality_post isn't present)
  if (failureMode) {
    const fmInsertPattern = new RegExp(
      `(- id: ${writId}\\n(?:    .*\\n)*?    spec_quality_post: (?:null|\\w+)\\n)`,
    );
    const fmInsertMatch = content.match(fmInsertPattern);
    if (fmInsertMatch) {
      content = content.replace(fmInsertPattern, `$1    failure_mode: ${failureMode}\n`);
    }
  }

  fs.writeFileSync(logPath, content, 'utf-8');
  return true;
}

/**
 * If a commission's outcome is 'success', clear it to null.
 * Used when a fixes link indicates the commission needs revision —
 * the presumption of success is withdrawn.
 * No-op if the entry is not found or outcome is not 'success'.
 */
export function clearSuccessOutcome(logPath: string, writId: string): boolean {
  if (!fs.existsSync(logPath)) return false;

  const content = fs.readFileSync(logPath, 'utf-8');

  const pattern = new RegExp(
    `(- id: ${writId}\\n(?:    .*\\n)*?    outcome: )(success)`,
  );

  const match = content.match(pattern);
  if (!match) return false;

  const updated = content.replace(pattern, '$1null');
  fs.writeFileSync(logPath, updated, 'utf-8');
  return true;
}

/**
 * Set revision_required: true on an existing commission log entry.
 * Finds the entry by writ ID and replaces its `revision_required: null`
 * (or `revision_required: false`) with `revision_required: true`.
 *
 * No-op if the entry is not found or already marked true.
 */
export function markRevisionRequired(logPath: string, writId: string): boolean {
  if (!fs.existsSync(logPath)) return false;

  const content = fs.readFileSync(logPath, 'utf-8');

  // Find the entry block for this writ ID and replace revision_required
  // We look for the id line followed (within a few lines) by revision_required
  const idPattern = new RegExp(
    `(- id: ${writId}\\n(?:    .*\\n)*?    revision_required: )(null|false)`,
  );

  const match = content.match(idPattern);
  if (!match) return false;

  const updated = content.replace(idPattern, '$1true');
  fs.writeFileSync(logPath, updated, 'utf-8');
  return true;
}

// ── Commission artifacts ─────────────────────────────────────────────

/**
 * Write commission.md — the writ body as a permanent record.
 * This is the spec/prompt that was dispatched to the anima.
 */
export function writeCommissionMd(
  commissionsDir: string,
  writ: { id: string; title: string; body: string },
): void {
  const filePath = path.join(commissionsDir, writ.id, 'commission.md');
  // Don't overwrite — the patron may have edited the file
  if (fs.existsSync(filePath)) return;
  fs.writeFileSync(filePath, writ.body, 'utf-8');
}

/**
 * Write a review.md template — placeholder for patron review.
 */
export function writeReviewTemplate(
  commissionsDir: string,
  writ: { id: string; title: string },
): void {
  const filePath = path.join(commissionsDir, writ.id, 'review.md');
  // Don't overwrite — the patron may have started writing
  if (fs.existsSync(filePath)) return;

  const template = `# Review: ${writ.id}

## ${writ.title}

**Outcome:**
<!-- success | partial | wrong | abandoned -->

**Spec quality (post-review):**
<!-- strong | adequate | weak -->

**Revision required:**
<!-- yes | no -->

**Failure mode (if not success):**
<!-- spec_ambiguous | requirement_wrong | execution_error | complexity_overrun -->

## Notes

<!-- What went well? What went wrong? What would you change about the spec? -->
`;

  fs.writeFileSync(filePath, template, 'utf-8');
}

// ── Session YAML ─────────────────────────────────────────────────────

/**
 * Write a session record YAML file in the commission's sessions/ directory.
 */
export function writeSessionRecord(
  commissionsDir: string,
  writId: string,
  session: {
    id: string;
    startedAt: string;
    endedAt?: string;
    durationMs?: number;
    status: string;
    provider: string;
    exitCode?: number;
    error?: string;
    costUsd?: number;
    tokenUsage?: {
      inputTokens: number;
      outputTokens: number;
      cacheReadTokens?: number;
      cacheWriteTokens?: number;
    };
  },
): void {
  const dir = path.join(commissionsDir, writId, 'sessions');
  fs.mkdirSync(dir, { recursive: true });

  const lines: string[] = [
    `# Session: ${session.id}`,
    `# Auto-generated by The Laboratory`,
    '',
    `id: ${session.id}`,
    `writ_id: ${writId}`,
    `status: ${session.status}`,
    `provider: ${session.provider}`,
    `started_at: ${session.startedAt}`,
  ];

  if (session.endedAt) lines.push(`ended_at: ${session.endedAt}`);
  if (session.durationMs !== undefined) lines.push(`duration_ms: ${session.durationMs}`);
  if (session.exitCode !== undefined) lines.push(`exit_code: ${session.exitCode}`);
  if (session.error) lines.push(`error: "${session.error.replace(/"/g, '\\"')}"`);
  if (session.costUsd !== undefined) lines.push(`cost_usd: ${session.costUsd}`);

  if (session.tokenUsage) {
    lines.push('token_usage:');
    lines.push(`  input_tokens: ${session.tokenUsage.inputTokens}`);
    lines.push(`  output_tokens: ${session.tokenUsage.outputTokens}`);
    if (session.tokenUsage.cacheReadTokens !== undefined) {
      lines.push(`  cache_read_tokens: ${session.tokenUsage.cacheReadTokens}`);
    }
    if (session.tokenUsage.cacheWriteTokens !== undefined) {
      lines.push(`  cache_write_tokens: ${session.tokenUsage.cacheWriteTokens}`);
    }
  }

  lines.push(''); // trailing newline
  fs.writeFileSync(path.join(dir, `${session.id}.yaml`), lines.join('\n'), 'utf-8');
}
