#!/usr/bin/env node
/**
 * backfill-session-prompts — Reconstruct `prompt` and `systemPrompt` on
 * historical SessionDocs.
 *
 * Pairs with the framework change that added `prompt`, `systemPrompt`,
 * `promptReconstructed`, and `frameworkSha` to `SessionDoc`
 * (animator/src/types.ts).
 *
 * Reconstruction strategy (per Sean's direction):
 *   - Framework content (engine prompt builders, prompt.md files,
 *     EPILOGUE constants, cwdPreamble text) is pulled from the
 *     framework repo *at the inferred session-time sha* via `git show`.
 *     The inferred sha is the most recent commit on `HEAD` at or before
 *     each session's `startedAt` timestamp.
 *   - Vibers guild content (codex, charter, role instructions, Loom
 *     config) uses the current on-disk state via `nsg loom weave`.
 *     Vibers content lacks the per-commit indexing needed to time-
 *     travel cleanly, so the live state is the best we have.
 *
 * What gets reconstructed (per engine designId):
 *   - anima-session              — template + spider-style yield substitution
 *   - astrolabe.reader-analyst   — givens.prompt (passed through verbatim)
 *   - scaffold-surveyor          — givens.prompt (passed through verbatim)
 *   - astrolabe.patron-anima     — patron-anima-prompt.md at sha +
 *                                  decisions block from the current plan
 *                                  (caveat: plans are mutable)
 *   - implement / implement-loop — `${writ.body || givens.prompt}` +
 *                                  EXECUTION_EPILOGUE-at-sha (modern era)
 *                                  or pre-EPILOGUE inline text (early era)
 *   - step-session / piece-session — mandate + step bodies +
 *                                    STEP_EXECUTION_EPILOGUE-at-sha
 *
 * What gets skipped:
 *   - review / revise / manual-merge — prompts embed git diff/status
 *     captured at session-launch time; not reconstructible
 *   - sessions with no metadata.engineId — typically manual `nsg summon`
 *   - any engine designId we don't have a handler for
 *   - sessions whose startedAt predates the framework repo's earliest
 *     commit (sha inference returns nothing)
 *
 * Usage:
 *   node --experimental-transform-types bin/backfill-session-prompts.ts        # dry-run
 *   node --experimental-transform-types bin/backfill-session-prompts.ts --apply
 *   node --experimental-transform-types bin/backfill-session-prompts.ts --apply --limit 50
 *   node --experimental-transform-types bin/backfill-session-prompts.ts --verbose
 *
 * The UPDATE statement guards against clobbering live-captured rows:
 *   AND (prompt IS NULL OR promptReconstructed = 1)
 * Re-running this script after another sha-bump is safe and idempotent.
 */

import Database from 'better-sqlite3';
import { execFileSync } from 'node:child_process';

// ── Constants ────────────────────────────────────────────────────────

const DB_PATH = '/workspace/vibers/.nexus/nexus.db';
const VIBERS_ROOT = '/workspace/vibers';
const FRAMEWORK_REPO = '/workspace/nexus';
const NSG_BIN = '/usr/local/bin/nsg';

// File paths within the framework repo (constants kept here so they're
// easy to update if the layout ever shifts).
const PATH_PATRON_ANIMA_PROMPT_MD =
  'packages/plugins/astrolabe/patron-anima-prompt.md';
const PATH_IMPLEMENT_TS = 'packages/plugins/spider/src/engines/implement.ts';
const PATH_STEP_SESSION_TS = 'packages/plugins/spider/src/engines/step-session.ts';
// Historical name retained for pre-rename shas; the engine was called
// `piece-session` before the `piece → step` rename (see
// docs/future/guild-vocabulary.md).
const PATH_PIECE_SESSION_TS = 'packages/plugins/spider/src/engines/piece-session.ts';
const PATH_ANIMATOR_TS = 'packages/plugins/animator/src/animator.ts';

// ── CLI args ─────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const limitIdx = args.indexOf('--limit');
const LIMIT = limitIdx >= 0 ? Number(args[limitIdx + 1]) : Infinity;
const VERBOSE = args.includes('--verbose');

// ── cwdPreamble (matches animator/animator.ts:cwdPreamble) ──────────
//
// The text has been stable since the function was introduced on
// 2026-04-08 (sha 2545320). Sessions launched against shas earlier
// than that didn't have a preamble injected, so we suppress this for
// pre-2545320 shas — see ShaArtifacts.cwdPreambleApplied.

function cwdPreamble(cwd: string): string {
  return [
    `Your working directory is: ${cwd}`,
    'All file operations (Read, Edit, Write, Glob, Grep) must use paths rooted in this directory.',
    'Do NOT read, write, or explore files outside this directory.',
    '',
  ].join('\n');
}

// ── Template helpers (mirror spider/src/template.ts) ─────────────────

const TEMPLATE_EXPR_RE = /\$\{([^}]+)\}/g;
const ESCAPED_TEMPLATE_RE = /\\\$\{/g;
const ESCAPE_SENTINEL = '\x00ESCAPED_DOLLAR_BRACE\x00';
const SKIP: unique symbol = Symbol('SKIP');

function resolveDotPath(root: unknown, path: string): unknown {
  let current: unknown = root;
  for (const segment of path.split('.')) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function stringifyForInline(value: unknown): string {
  if (value === undefined) return '';
  if (value === null || typeof value === 'object') return JSON.stringify(value);
  if (typeof value === 'string') return value;
  return String(value);
}

function interpolateTemplate(
  value: string,
  resolveExpr: (expr: string) => unknown | typeof SKIP,
): unknown {
  const working = value.replace(ESCAPED_TEMPLATE_RE, ESCAPE_SENTINEL);
  const singleMatch = /^\$\{([^}]+)\}$/.exec(working);
  if (singleMatch) {
    const resolved = resolveExpr(singleMatch[1]);
    if (resolved === SKIP) return value;
    return resolved;
  }
  const result = working.replace(
    new RegExp(TEMPLATE_EXPR_RE.source, 'g'),
    (fullMatch: string, expr: string) => {
      const resolved = resolveExpr(expr);
      if (resolved === SKIP) return fullMatch;
      return stringifyForInline(resolved);
    },
  );
  return result.replaceAll(ESCAPE_SENTINEL, '${');
}

function substituteYieldRefs(
  value: string,
  upstreamYields: Record<string, unknown>,
  writ: unknown,
): unknown {
  return interpolateTemplate(value, (expr) => {
    if (expr === 'writ') return writ;
    if (expr.startsWith('writ.')) {
      return resolveDotPath(writ, expr.slice('writ.'.length));
    }
    if (expr.startsWith('yields.')) {
      const withoutPrefix = expr.slice('yields.'.length);
      const dotIndex = withoutPrefix.indexOf('.');
      if (dotIndex < 0) return undefined;
      const engineId = withoutPrefix.slice(0, dotIndex);
      const propPath = withoutPrefix.slice(dotIndex + 1);
      return resolveDotPath(upstreamYields[engineId], propPath);
    }
    return undefined;
  });
}

// ── Sha inference + per-sha artifact loading ─────────────────────────

function inferShaForTimestamp(iso: string): string | undefined {
  try {
    const sha = execFileSync(
      'git',
      ['-C', FRAMEWORK_REPO, 'log', `--before=${iso}`, '-1', '--pretty=%H', 'HEAD'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim();
    return sha || undefined;
  } catch {
    return undefined;
  }
}

function gitShow(sha: string, path: string): string | undefined {
  try {
    return execFileSync(
      'git',
      ['-C', FRAMEWORK_REPO, 'show', `${sha}:${path}`],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    );
  } catch {
    return undefined;
  }
}

/**
 * Extract a `const NAME = \`...\`` template-literal constant from TS source.
 *
 * Matches both bare `const NAME = ...` and `export const NAME = ...`
 * forms. Returns undefined if not found or if the assignment isn't a
 * template literal (we don't need to handle plain-string forms today —
 * the EPILOGUE constants are all backtick-delimited).
 */
function extractTemplateConst(source: string | undefined, name: string): string | undefined {
  if (!source) return undefined;
  const re = new RegExp(
    `(?:export\\s+)?const\\s+${name}\\b[^=]*=\\s*\`([\\s\\S]*?)\`\\s*;`,
  );
  const m = re.exec(source);
  return m?.[1];
}

interface ShaArtifacts {
  sha: string;
  cwdPreambleApplied: boolean;
  patronAnimaTemplate?: string;
  executionEpilogue?: string;
  /** STEP_EXECUTION_EPILOGUE from the modern step-session.ts. */
  stepExecutionEpilogue?: string;
  /** PIECE_EXECUTION_EPILOGUE from the historical piece-session.ts (pre-rename). */
  pieceExecutionEpilogue?: string;
  /**
   * The pre-EXECUTION_EPILOGUE-era implement.ts inline text, when the
   * sha predates the EPILOGUE constant. Hard-coded from the source at
   * sha 6e16fde (2026-04-03) since git history is short enough to
   * verify by inspection.
   */
  legacyImplementEpilogue?: string;
}

const shaArtifactsCache = new Map<string, ShaArtifacts>();

function loadShaArtifacts(sha: string): ShaArtifacts {
  const cached = shaArtifactsCache.get(sha);
  if (cached) return cached;

  const animatorSrc = gitShow(sha, PATH_ANIMATOR_TS);
  const implementSrc = gitShow(sha, PATH_IMPLEMENT_TS);
  const stepSessionSrc = gitShow(sha, PATH_STEP_SESSION_TS);
  const pieceSessionSrc = gitShow(sha, PATH_PIECE_SESSION_TS);

  const artifacts: ShaArtifacts = {
    sha,
    // The function was introduced 2026-04-08 — detect its presence rather
    // than test against a fixed sha so we don't have to track the cutoff.
    cwdPreambleApplied:
      animatorSrc !== undefined && animatorSrc.includes('function cwdPreamble'),
    patronAnimaTemplate: gitShow(sha, PATH_PATRON_ANIMA_PROMPT_MD),
    executionEpilogue: extractTemplateConst(implementSrc, 'EXECUTION_EPILOGUE'),
    stepExecutionEpilogue: extractTemplateConst(stepSessionSrc, 'STEP_EXECUTION_EPILOGUE'),
    pieceExecutionEpilogue: extractTemplateConst(pieceSessionSrc, 'PIECE_EXECUTION_EPILOGUE'),
    // Pre-EXECUTION_EPILOGUE inline text (era ending 2026-04-16). The
    // earliest implement.ts in the repo used this exact text — sessions
    // that ran against that era reconstruct with it instead of the
    // modern EPILOGUE.
    legacyImplementEpilogue:
      implementSrc !== undefined && !implementSrc.includes('EXECUTION_EPILOGUE')
        ? '\nCommit all changes before ending your session.'
        : undefined,
  };

  shaArtifactsCache.set(sha, artifacts);
  return artifacts;
}

// ── Patron-anima prompt assembly (mirror buildPatronPrompt) ──────────
//
// We could time-travel-import the engine's exported function from each
// sha, but that requires a working node_modules at the worktree which
// pnpm's workspace layout makes painful to set up. The assembly logic
// is simple text concatenation — re-implement once here and use the
// sha-pinned template (which carries the static content that varies).

interface DecisionShape {
  id?: string;
  question?: string;
  context?: string;
  options?: Record<string, string>;
  recommendation?: string;
  rationale?: string;
  [key: string]: unknown;
}

function buildPatronPromptFromTemplate(
  template: string,
  decisions: DecisionShape[],
): string {
  const DECISIONS_PLACEHOLDER = '{{DECISIONS}}';
  const lines: string[] = [];
  for (const d of decisions) {
    lines.push(`### ${d.id}: ${d.question}`);
    if (d.context) {
      lines.push('');
      lines.push(`Context: ${d.context}`);
    }
    lines.push('');
    lines.push('Options:');
    for (const [key, label] of Object.entries(d.options ?? {})) {
      lines.push(`- \`${key}\` — ${label}`);
    }
    if (d.recommendation) {
      lines.push('');
      const recLabel = d.options?.[d.recommendation] ?? d.recommendation;
      lines.push(`Primer recommendation: \`${d.recommendation}\` (${recLabel})`);
      if (d.rationale) {
        lines.push(`Primer rationale: ${d.rationale}`);
      }
    } else {
      lines.push('');
      lines.push('Primer recommendation: (none — you must fill in)');
    }
    lines.push('');
  }
  const decisionsBlock = lines.join('\n').replace(/\n+$/, '');
  return template.replace(DECISIONS_PLACEHOLDER, decisionsBlock);
}

// ── Loom weave cache (current on-disk vibers guild) ──────────────────

const loomCache = new Map<string, string | undefined>();

function getSystemPromptForRole(role: string): string | undefined {
  if (loomCache.has(role)) return loomCache.get(role);
  let systemPrompt: string | undefined;
  try {
    const out = execFileSync(NSG_BIN, ['loom', 'weave', role], {
      encoding: 'utf8',
      cwd: VIBERS_ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const weave = JSON.parse(out);
    systemPrompt =
      typeof weave.systemPrompt === 'string' && weave.systemPrompt.length > 0
        ? weave.systemPrompt
        : undefined;
  } catch (err) {
    if (VERBOSE) {
      console.warn(`[loom-weave ${role}] ${err instanceof Error ? err.message : err}`);
    }
    systemPrompt = undefined;
  }
  loomCache.set(role, systemPrompt);
  return systemPrompt;
}

// ── DB row types ─────────────────────────────────────────────────────

interface RawRow {
  id: string;
  content: string;
}

interface RigEngineEntry {
  id: string;
  designId: string;
  upstream?: string[];
  givensSpec?: Record<string, unknown>;
  attempts?: Array<{ sessionId?: string; yields?: Record<string, unknown> }>;
}

interface RigRow {
  id: string;
  engines: RigEngineEntry[];
  writId?: string;
}

// ── Spec resolution / draft-cwd lookup ───────────────────────────────

function collectUpstreamYields(rig: RigRow): Record<string, unknown> {
  const upstream: Record<string, unknown> = {};
  for (const e of rig.engines) {
    const lastYields = e.attempts
      ?.map((a) => a.yields)
      .filter((y): y is Record<string, unknown> => !!y)
      .pop();
    if (lastYields) upstream[e.id] = lastYields;
  }
  return upstream;
}

function resolveSpec(
  spec: Record<string, unknown>,
  rig: RigRow,
  engine: RigEngineEntry,
): Record<string, unknown> {
  const upstreamYields = collectUpstreamYields(rig);
  const writ = engine.givensSpec?.writ;
  const resolved: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(spec)) {
    if (typeof value !== 'string' || !value.includes('${')) {
      resolved[key] = value;
      continue;
    }
    const out = substituteYieldRefs(value, upstreamYields, writ);
    if (out !== undefined) resolved[key] = out;
  }
  return resolved;
}

function findDraftCwd(rig: RigRow): string | undefined {
  for (const e of rig.engines) {
    if (e.id !== 'draft' && e.designId !== 'draft') continue;
    const lastYields = e.attempts
      ?.map((a) => a.yields)
      .filter((y): y is Record<string, unknown> => !!y)
      .pop();
    if (lastYields && typeof lastYields.path === 'string') {
      return lastYields.path;
    }
  }
  return undefined;
}

// ── Reconstructors ───────────────────────────────────────────────────

type ReconResult =
  | { ok: true; prompt: string; cwd: string | undefined }
  | { ok: false; skipReason: string };

interface ReconCtx {
  artifacts: ShaArtifacts;
  plansByPlanId: Map<string, unknown>;
}

function reconstructAnimaSession(rig: RigRow, engine: RigEngineEntry): ReconResult {
  const resolved = resolveSpec(engine.givensSpec ?? {}, rig, engine);
  if (typeof resolved.prompt !== 'string') {
    return { ok: false, skipReason: 'anima-session engine has no resolvable prompt' };
  }
  return {
    ok: true,
    prompt: resolved.prompt,
    cwd: typeof resolved.cwd === 'string' ? resolved.cwd : undefined,
  };
}

function reconstructGivensPromptPassthrough(
  rig: RigRow,
  engine: RigEngineEntry,
): ReconResult {
  const resolved = resolveSpec(engine.givensSpec ?? {}, rig, engine);
  if (typeof resolved.prompt !== 'string') {
    return { ok: false, skipReason: 'engine has no resolvable givens.prompt' };
  }
  return {
    ok: true,
    prompt: resolved.prompt,
    cwd: typeof resolved.cwd === 'string' ? resolved.cwd : undefined,
  };
}

function reconstructPatronAnima(
  rig: RigRow,
  engine: RigEngineEntry,
  ctx: ReconCtx,
): ReconResult {
  const resolved = resolveSpec(engine.givensSpec ?? {}, rig, engine);
  const planId = typeof resolved.planId === 'string' ? resolved.planId : undefined;
  if (!planId) {
    return { ok: false, skipReason: 'patron-anima givensSpec missing planId' };
  }
  const plan = ctx.plansByPlanId.get(planId) as Record<string, unknown> | undefined;
  if (!plan) {
    return { ok: false, skipReason: `patron-anima plan ${planId} not in books` };
  }
  const decisions = ((plan.decisions as unknown[]) ?? []) as DecisionShape[];
  if (decisions.length === 0) {
    return { ok: false, skipReason: 'patron-anima plan has no decisions' };
  }
  if (!ctx.artifacts.patronAnimaTemplate) {
    return {
      ok: false,
      skipReason: `patron-anima-prompt.md absent at sha ${ctx.artifacts.sha.slice(0, 7)}`,
    };
  }
  const prompt = buildPatronPromptFromTemplate(ctx.artifacts.patronAnimaTemplate, decisions);
  return {
    ok: true,
    prompt,
    cwd: typeof resolved.cwd === 'string' ? resolved.cwd : undefined,
  };
}

function reconstructImplement(
  rig: RigRow,
  engine: RigEngineEntry,
  ctx: ReconCtx,
): ReconResult {
  const resolved = resolveSpec(engine.givensSpec ?? {}, rig, engine);
  let body: string | undefined;
  if (typeof resolved.prompt === 'string' && resolved.prompt.length > 0) {
    body = resolved.prompt;
  } else if (
    resolved.writ &&
    typeof (resolved.writ as Record<string, unknown>).body === 'string'
  ) {
    body = (resolved.writ as Record<string, unknown>).body as string;
  }
  if (body === undefined) {
    return { ok: false, skipReason: 'implement engine has no writ.body or givens.prompt' };
  }
  let epilogue: string | undefined;
  if (ctx.artifacts.executionEpilogue !== undefined) {
    epilogue = ctx.artifacts.executionEpilogue;
  } else if (ctx.artifacts.legacyImplementEpilogue !== undefined) {
    epilogue = ctx.artifacts.legacyImplementEpilogue;
  } else {
    // implement.ts didn't even exist at this sha — bail out rather than
    // invent a prompt shape.
    return {
      ok: false,
      skipReason: `implement.ts absent at sha ${ctx.artifacts.sha.slice(0, 7)}`,
    };
  }
  const prompt = `${body}\n${epilogue}`;
  const cwd =
    (typeof resolved.cwd === 'string' ? resolved.cwd : undefined) ?? findDraftCwd(rig);
  return { ok: true, prompt, cwd };
}

function reconstructStepSession(
  rig: RigRow,
  engine: RigEngineEntry,
  ctx: ReconCtx,
  taskKey: 'step' | 'piece',
): ReconResult {
  const resolved = resolveSpec(engine.givensSpec ?? {}, rig, engine);
  const mandate = resolved.writ as Record<string, unknown> | undefined;
  const task = resolved[taskKey] as Record<string, unknown> | undefined;
  if (!mandate || typeof mandate.body !== 'string' || typeof mandate.id !== 'string') {
    return {
      ok: false,
      skipReason: `${taskKey}-session has no resolvable mandate writ`,
    };
  }
  if (!task || typeof task.body !== 'string') {
    return {
      ok: false,
      skipReason: `${taskKey}-session has no resolvable ${taskKey} writ`,
    };
  }
  // Pick the era-correct EPILOGUE: pre-rename shas have piece-session.ts
  // exporting PIECE_EXECUTION_EPILOGUE; post-rename shas have
  // step-session.ts exporting STEP_EXECUTION_EPILOGUE. The two have
  // identical assembly shape (mandate + task body + epilogue) so the
  // selection is purely about which constant is in scope at this sha.
  const epilogue =
    taskKey === 'piece'
      ? ctx.artifacts.pieceExecutionEpilogue
      : ctx.artifacts.stepExecutionEpilogue;
  if (epilogue === undefined) {
    const constName =
      taskKey === 'piece' ? 'PIECE_EXECUTION_EPILOGUE' : 'STEP_EXECUTION_EPILOGUE';
    return {
      ok: false,
      skipReason: `${constName} absent at sha ${ctx.artifacts.sha.slice(0, 7)}`,
    };
  }
  const prompt =
    `${mandate.body}\n\n---\n\n## Current Task\n\nMandate ID: ${mandate.id}\n\n` +
    `${task.body}\n${epilogue}`;
  return {
    ok: true,
    prompt,
    cwd: typeof resolved.cwd === 'string' ? resolved.cwd : undefined,
  };
}

const RECONSTRUCTORS: Record<
  string,
  (rig: RigRow, engine: RigEngineEntry, ctx: ReconCtx) => ReconResult
> = {
  'anima-session': (rig, engine) => reconstructAnimaSession(rig, engine),
  'astrolabe.reader-analyst': (rig, engine) => reconstructGivensPromptPassthrough(rig, engine),
  'scaffold-surveyor': (rig, engine) => reconstructGivensPromptPassthrough(rig, engine),
  'scaffold-surveyor.surveyor': (rig, engine) =>
    reconstructGivensPromptPassthrough(rig, engine),
  'astrolabe.patron-anima': (rig, engine, ctx) => reconstructPatronAnima(rig, engine, ctx),
  implement: (rig, engine, ctx) => reconstructImplement(rig, engine, ctx),
  'implement-loop': (rig, engine, ctx) => reconstructImplement(rig, engine, ctx),
  'step-session': (rig, engine, ctx) => reconstructStepSession(rig, engine, ctx, 'step'),
  'piece-session': (rig, engine, ctx) => reconstructStepSession(rig, engine, ctx, 'piece'),
};

// ── Load DB state ────────────────────────────────────────────────────

const db = new Database(DB_PATH, { readonly: !APPLY });
db.pragma('journal_mode = WAL');

const sessionRows = db
  .prepare('SELECT id, content FROM books_animator_sessions ORDER BY id')
  .all() as RawRow[];

const rigRows = db
  .prepare('SELECT id, content FROM books_spider_rigs')
  .all() as RawRow[];

const planRows = db
  .prepare('SELECT id, content FROM books_astrolabe_plans')
  .all() as RawRow[];

const plansByPlanId = new Map<string, unknown>();
for (const row of planRows) {
  try {
    plansByPlanId.set(row.id, JSON.parse(row.content));
  } catch {
    /* skip malformed */
  }
}

const engineBySessionId = new Map<string, { rig: RigRow; engine: RigEngineEntry }>();
for (const row of rigRows) {
  let rig: RigRow;
  try {
    rig = JSON.parse(row.content);
  } catch {
    continue;
  }
  for (const engine of rig.engines ?? []) {
    for (const attempt of engine.attempts ?? []) {
      if (attempt.sessionId) {
        engineBySessionId.set(attempt.sessionId, { rig, engine });
      }
    }
  }
}

// ── UPDATE statements (race-safe) ────────────────────────────────────
//
// Guard: write only when prompt is still NULL (V1 missed it) or when
// the row is already marked promptReconstructed=true (V1 wrote a HEAD-
// based reconstruction that V2 wants to refresh). Never overwrite a
// live-captured row.

const updateStmt = db.prepare(
  `UPDATE books_animator_sessions
   SET content = json_set(
     content,
     '$.prompt', ?,
     '$.systemPrompt', ?,
     '$.promptReconstructed', json('true'),
     '$.frameworkSha', ?
   )
   WHERE id = ?
     AND (
       json_extract(content, '$.prompt') IS NULL
       OR json_extract(content, '$.promptReconstructed') = 1
     )`,
);

const updateStmtNoSystemPrompt = db.prepare(
  `UPDATE books_animator_sessions
   SET content = json_set(
     content,
     '$.prompt', ?,
     '$.promptReconstructed', json('true'),
     '$.frameworkSha', ?
   )
   WHERE id = ?
     AND (
       json_extract(content, '$.prompt') IS NULL
       OR json_extract(content, '$.promptReconstructed') = 1
     )`,
);

// ── Main loop ────────────────────────────────────────────────────────

interface Tally {
  total: number;
  alreadyHasPromptLive: number;
  reconstructed: number;
  byEngine: Map<string, number>;
  byShaShort: Map<string, number>;
  skippedByReason: Map<string, number>;
  rolesSeen: Set<string>;
  errors: number;
}

const tally: Tally = {
  total: 0,
  alreadyHasPromptLive: 0,
  reconstructed: 0,
  byEngine: new Map(),
  byShaShort: new Map(),
  skippedByReason: new Map(),
  rolesSeen: new Set(),
  errors: 0,
};

function incr(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

let processed = 0;
for (const row of sessionRows) {
  if (processed >= LIMIT) break;

  tally.total++;
  let doc: Record<string, unknown>;
  try {
    doc = JSON.parse(row.content);
  } catch {
    tally.errors++;
    continue;
  }

  // Skip live-captured rows. V1-reconstructed rows are eligible for refresh.
  if (
    typeof doc.prompt === 'string' &&
    doc.prompt.length > 0 &&
    doc.promptReconstructed !== true
  ) {
    tally.alreadyHasPromptLive++;
    continue;
  }

  const metadata = (doc.metadata as Record<string, unknown> | undefined) ?? {};
  const engineId = typeof metadata.engineId === 'string' ? metadata.engineId : undefined;
  const role = typeof metadata.role === 'string' ? metadata.role : undefined;
  const startedAt = typeof doc.startedAt === 'string' ? doc.startedAt : undefined;

  if (!engineId) {
    incr(tally.skippedByReason, 'no engineId (manual summon or no rig record)');
    if (VERBOSE) console.log(`SKIP ${row.id} — no engineId`);
    continue;
  }

  const located = engineBySessionId.get(row.id);
  if (!located) {
    incr(tally.skippedByReason, 'session not found in any rig');
    if (VERBOSE) console.log(`SKIP ${row.id} — not found in rig`);
    continue;
  }

  const { rig, engine } = located;
  const designId = engine.designId;
  incr(tally.byEngine, designId);

  const reconstructor = RECONSTRUCTORS[designId];
  if (!reconstructor) {
    incr(tally.skippedByReason, `unsupported designId: ${designId}`);
    if (VERBOSE) console.log(`SKIP ${row.id} — unsupported designId ${designId}`);
    continue;
  }

  if (!startedAt) {
    incr(tally.skippedByReason, 'session has no startedAt');
    continue;
  }

  const sha = inferShaForTimestamp(startedAt);
  if (!sha) {
    incr(tally.skippedByReason, 'sha inference failed (startedAt predates framework history)');
    if (VERBOSE) console.log(`SKIP ${row.id} — no sha for ${startedAt}`);
    continue;
  }
  incr(tally.byShaShort, sha.slice(0, 7));
  const artifacts = loadShaArtifacts(sha);

  let result: ReconResult;
  try {
    result = reconstructor(rig, engine, { artifacts, plansByPlanId });
  } catch (err) {
    tally.errors++;
    console.error(
      `ERROR ${row.id} (${designId}): ${err instanceof Error ? err.message : err}`,
    );
    continue;
  }

  if (!result.ok) {
    incr(tally.skippedByReason, result.skipReason);
    if (VERBOSE) console.log(`SKIP ${row.id} — ${result.skipReason}`);
    continue;
  }

  // Apply cwd preamble for non-resumed sessions when the sha era had it.
  const conversationId =
    typeof doc.conversationId === 'string' ? doc.conversationId : undefined;
  const providerSessionId =
    typeof doc.providerSessionId === 'string' ? doc.providerSessionId : undefined;
  const wasResumed =
    conversationId !== undefined &&
    providerSessionId !== undefined &&
    conversationId !== providerSessionId;

  let finalPrompt = result.prompt;
  if (!wasResumed && artifacts.cwdPreambleApplied && result.cwd) {
    finalPrompt = cwdPreamble(result.cwd) + finalPrompt;
  }

  let systemPrompt: string | undefined;
  if (role) {
    tally.rolesSeen.add(role);
    systemPrompt = getSystemPromptForRole(role);
  }

  if (APPLY) {
    if (systemPrompt) {
      updateStmt.run(finalPrompt, systemPrompt, sha, row.id);
    } else {
      updateStmtNoSystemPrompt.run(finalPrompt, sha, row.id);
    }
  }

  tally.reconstructed++;
  processed++;
  if (VERBOSE) {
    console.log(
      `OK   ${row.id} (${designId}, sha=${sha.slice(0, 7)}, role=${role ?? '?'}, prompt=${finalPrompt.length}b, sys=${systemPrompt ? systemPrompt.length + 'b' : 'none'})`,
    );
  }
}

db.close();

// ── Summary ──────────────────────────────────────────────────────────

function fmtMap(map: Map<string, number>, maxRows = 20): string {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxRows)
    .map(([k, v]) => `  ${String(v).padStart(5)}  ${k}`)
    .join('\n');
}

console.log('');
console.log('═══ Backfill summary ═══════════════════════════════════════');
console.log(`Mode:                ${APPLY ? 'APPLY (writes committed)' : 'DRY-RUN (no writes)'}`);
console.log(`Total sessions:      ${tally.total}`);
console.log(`Live-captured:       ${tally.alreadyHasPromptLive}`);
console.log(`Reconstructed:       ${tally.reconstructed}`);
console.log(`Errors:              ${tally.errors}`);
console.log('');
console.log('By engine designId:');
console.log(fmtMap(tally.byEngine));
console.log('');
console.log(`Distinct framework shas: ${tally.byShaShort.size}`);
console.log('Top shas by session count:');
console.log(fmtMap(tally.byShaShort, 10));
console.log('');
console.log('Skipped by reason:');
console.log(fmtMap(tally.skippedByReason));
console.log('');
console.log(`Roles seen (loom-weave invocations): ${tally.rolesSeen.size}`);
console.log('═════════════════════════════════════════════════════════════');
