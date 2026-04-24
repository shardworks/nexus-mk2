#!/usr/bin/env npx tsx
/**
 * patron-anima-gap-review — Step 2 of patron-anima bug-window remediation.
 *
 * Reads the extracted decisions from step 1 (gap-decisions.json), runs
 * patron-anima retroactively against each writ's decisions, and writes a
 * structured review manifest classifying each decision as confirmed,
 * dissent, or abstained.
 *
 * Mechanics mirror the production astrolabe.patron-anima engine:
 *   - prompt assembly via inlined buildPatronPrompt (copy of the engine's
 *     helper — see patron-anima.ts for the authoritative source)
 *   - emission parsing via inlined parseEmission (ditto)
 *   - static operational prompt read from the packaged markdown file
 *   - `patron` role (per vibers/guild.json's astrolabe.patronRole)
 *
 * Classification rule:
 *   - animaVerdict === 'confirm'                  → confirmed (anima approves
 *                                                    the primer's recommendation,
 *                                                    irrespective of any context-
 *                                                    conditioned `selected` value)
 *   - animaVerdict === 'override'                 → dissent (explicit disagreement
 *                                                    with the recommendation)
 *   - animaVerdict === 'fill-in' and selection
 *       === primerSelected                        → confirmed
 *   - animaVerdict === 'fill-in' and selection
 *       !== primerSelected                        → dissent
 *   - decision absent from emissions              → abstained
 *   - session failed / JSON parse error / etc.    → error (whole writ)
 *
 * Per-writ persistence for resumability:
 *   experiments/data/patron-anima-gap/sessions/<writId>.json
 *
 * Aggregated manifest:
 *   experiments/data/patron-anima-gap/review-results.json
 *
 * Usage:
 *   npx tsx bin/patron-anima-gap-review.ts [--force] [--only <writId>]
 *
 * Options:
 *   --force         Re-run writs that already have a successful session file.
 *   --only <id>     Run only the given writId (short or full). Useful for
 *                   debugging a single case.
 *   --role <name>   Override patron role (default: patron).
 *   --reclassify    Re-apply classification logic to all cached session files
 *                   and rebuild the manifest without re-summoning the anima.
 *                   Useful when the classification rule changes.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

// ── Constants ─────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, '..');
const GAP_DIR = join(PROJECT_ROOT, 'experiments/data/patron-anima-gap');
const SOURCE_FILE = join(GAP_DIR, 'gap-decisions.json');
const SESSIONS_DIR = join(GAP_DIR, 'sessions');
const OUTPUT_FILE = join(GAP_DIR, 'review-results.json');

const PROMPT_TEMPLATE_PATH = '/workspace/nexus/packages/plugins/astrolabe/patron-anima-prompt.md';
const DECISIONS_PLACEHOLDER = '{{DECISIONS}}';

// ── Types (narrow mirror of the engine's Decision / PatronEmission) ───

interface Decision {
  id: string;
  scope: string[];
  question: string;
  context?: string;
  options: Record<string, string>;
  recommendation?: string;
  rationale?: string;
  selected?: string;
  patronOverride?: string;
}

interface PatronEmission {
  verdict: 'confirm' | 'override' | 'fill-in';
  selection: string;
  confidence: 'low' | 'med' | 'high';
  rationale?: string;
}

interface GapWrit {
  writId: string;
  title: string;
  planUpdatedAt: string;
  decisions: Decision[];
}

interface GapSource {
  window: { start: string; end: string };
  bugFixCommit: string;
  generatedAt: string;
  writCount: number;
  decisionCount: number;
  writs: GapWrit[];
}

type DecisionFlag = 'confirmed' | 'dissent' | 'abstained';

interface DecisionReview {
  id: string;
  question: string;
  primerSelected?: string;
  primerRecommendation?: string;
  animaSelection?: string;
  animaVerdict?: 'confirm' | 'override' | 'fill-in';
  confidence?: 'low' | 'med' | 'high';
  rationale?: string;
  flag: DecisionFlag;
}

type WritReviewStatus = 'success' | 'error';

interface WritReview {
  writId: string;
  title: string;
  status: WritReviewStatus;
  error?: string;
  reviewSessionId?: string;
  reviewedAt?: string;
  costUsd?: number;
  durationMs?: number;
  summary: {
    total: number;
    confirmed: number;
    dissent: number;
    abstained: number;
  };
  decisions: DecisionReview[];
}

// ── Inlined: buildPatronPrompt (byte-identical to engine) ─────────────

const PROMPT_TEMPLATE: string = readFileSync(PROMPT_TEMPLATE_PATH, 'utf-8');

function buildPatronPrompt(decisions: Decision[]): string {
  const lines: string[] = [];

  for (const decision of decisions) {
    lines.push(`### ${decision.id}: ${decision.question}`);
    if (decision.context) {
      lines.push('');
      lines.push(`Context: ${decision.context}`);
    }
    lines.push('');
    lines.push('Options:');
    for (const [key, label] of Object.entries(decision.options)) {
      lines.push(`- \`${key}\` — ${label}`);
    }
    if (decision.recommendation) {
      lines.push('');
      const recLabel = decision.options[decision.recommendation] ?? decision.recommendation;
      lines.push(
        `Primer recommendation: \`${decision.recommendation}\` (${recLabel})`,
      );
      if (decision.rationale) {
        lines.push(`Primer rationale: ${decision.rationale}`);
      }
    } else {
      lines.push('');
      lines.push('Primer recommendation: (none — you must fill in)');
    }
    lines.push('');
  }

  const decisionsBlock = lines.join('\n').replace(/\n+$/, '');
  return PROMPT_TEMPLATE.replace(DECISIONS_PLACEHOLDER, decisionsBlock);
}

// ── Inlined: parseEmission (byte-identical to engine) ─────────────────

interface RawVerdict {
  id?: unknown;
  verdict?: unknown;
  selection?: unknown;
  confidence?: unknown;
  rationale?: unknown;
}

function extractJsonBlock(output: string): string | null {
  const jsonFence = /```(?:json)?\s*([\s\S]*?)```/gi;
  let match: RegExpExecArray | null;
  let last: string | null = null;
  while ((match = jsonFence.exec(output)) !== null) {
    last = match[1].trim();
  }
  if (last !== null) return last;
  const trimmed = output.trim();
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) return trimmed;
  return null;
}

function parseEmission(
  output: string,
  decisions: Decision[],
): Map<string, PatronEmission> {
  const result = new Map<string, PatronEmission>();
  const block = extractJsonBlock(output);
  if (block === null) return result;

  let parsed: unknown;
  try {
    parsed = JSON.parse(block);
  } catch {
    return result;
  }

  let entries: unknown[];
  if (Array.isArray(parsed)) {
    entries = parsed;
  } else if (parsed && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>;
    const maybe = obj.emissions ?? obj.verdicts ?? obj.decisions;
    entries = Array.isArray(maybe) ? maybe : [];
  } else {
    return result;
  }

  const decisionById = new Map(decisions.map(d => [d.id, d]));

  for (const rawEntry of entries) {
    if (!rawEntry || typeof rawEntry !== 'object') continue;
    const raw = rawEntry as RawVerdict;
    if (typeof raw.id !== 'string') continue;
    const decision = decisionById.get(raw.id);
    if (!decision) continue;

    const verdict = raw.verdict;
    if (verdict !== 'confirm' && verdict !== 'override' && verdict !== 'fill-in') continue;

    if (typeof raw.selection !== 'string') continue;
    if (!(raw.selection in decision.options)) continue;

    const confidence = raw.confidence;
    if (confidence !== 'low' && confidence !== 'med' && confidence !== 'high') continue;

    if (verdict === 'confirm') {
      if (!decision.recommendation || decision.recommendation !== raw.selection) {
        continue;
      }
    }

    if (verdict === 'override') {
      if (!decision.recommendation) continue;
      if (decision.recommendation === raw.selection) continue;
    }

    const emission: PatronEmission = {
      verdict,
      selection: raw.selection,
      confidence,
    };
    if (typeof raw.rationale === 'string' && raw.rationale.length > 0) {
      emission.rationale = raw.rationale;
    }
    result.set(decision.id, emission);
  }

  return result;
}

// ── Argument parsing ──────────────────────────────────────────────────

const argv = process.argv.slice(2);
const FORCE = argv.includes('--force');
const RECLASSIFY = argv.includes('--reclassify');
const ONLY_IDX = argv.indexOf('--only');
const ONLY = ONLY_IDX !== -1 ? argv[ONLY_IDX + 1] : undefined;
const ROLE_IDX = argv.indexOf('--role');
const ROLE = ROLE_IDX !== -1 ? argv[ROLE_IDX + 1] : 'patron';

// ── Main ──────────────────────────────────────────────────────────────

function ensureDir(path: string): void {
  if (!existsSync(path)) mkdirSync(path, { recursive: true });
}

function summonPatron(prompt: string): {
  sessionId: string;
  costUsd: number;
  durationMs: number;
  status: string;
} {
  // Pass prompt via stdin-less arg since nsg summon reads --prompt.
  // For very large prompts we could switch to a temp file + --prompt-file
  // but the current CLI only exposes --prompt. Serialise prompt into argv.
  const out = execSync(
    `nsg summon --role ${ROLE} --prompt "$PATRON_ANIMA_GAP_PROMPT"`,
    {
      env: { ...process.env, PATRON_ANIMA_GAP_PROMPT: prompt },
      encoding: 'utf-8',
      maxBuffer: 32 * 1024 * 1024,
    },
  );
  const parsed = JSON.parse(out);
  return {
    sessionId: parsed.id,
    costUsd: parsed.costUsd ?? 0,
    durationMs: parsed.durationMs ?? 0,
    status: parsed.status,
  };
}

function fetchSessionOutput(sessionId: string): string {
  const out = execSync(`nsg session show ${sessionId}`, {
    encoding: 'utf-8',
    maxBuffer: 32 * 1024 * 1024,
  });
  const parsed = JSON.parse(out);
  return parsed.output ?? '';
}

function flagFromVerdict(
  verdict: 'confirm' | 'override' | 'fill-in',
  animaSelection: string,
  primerSelected: string | undefined,
): DecisionFlag {
  if (verdict === 'confirm') return 'confirmed';
  if (verdict === 'override') return 'dissent';
  // fill-in: compare to primer's shipped selection
  return animaSelection === primerSelected ? 'confirmed' : 'dissent';
}

function classifyDecision(
  decision: Decision,
  emissions: Map<string, PatronEmission>,
): DecisionReview {
  const emission = emissions.get(decision.id);
  if (!emission) {
    return {
      id: decision.id,
      question: decision.question,
      primerSelected: decision.selected,
      primerRecommendation: decision.recommendation,
      flag: 'abstained',
    };
  }

  return {
    id: decision.id,
    question: decision.question,
    primerSelected: decision.selected,
    primerRecommendation: decision.recommendation,
    animaSelection: emission.selection,
    animaVerdict: emission.verdict,
    confidence: emission.confidence,
    rationale: emission.rationale,
    flag: flagFromVerdict(emission.verdict, emission.selection, decision.selected),
  };
}

/**
 * Reclassify an existing DecisionReview — rebuild `flag` from the already-
 * parsed emission fields. Used by --reclassify to refresh flags after the
 * classification rule changes without re-summoning the anima.
 */
function reclassifyDecisionReview(d: DecisionReview): DecisionReview {
  if (!d.animaVerdict || !d.animaSelection) {
    // Either abstained (no emission) or missing data — preserve abstained.
    return { ...d, flag: 'abstained' };
  }
  return {
    ...d,
    flag: flagFromVerdict(d.animaVerdict, d.animaSelection, d.primerSelected),
  };
}

function reviewWrit(writ: GapWrit): WritReview {
  const writPath = join(SESSIONS_DIR, `${writ.writId}.json`);
  if (!FORCE && existsSync(writPath)) {
    const cached = JSON.parse(readFileSync(writPath, 'utf-8')) as WritReview;
    if (cached.status === 'success') {
      console.log(`  ↺ ${writ.writId} — cached (${cached.summary.confirmed}c/${cached.summary.dissent}d/${cached.summary.abstained}a)`);
      return cached;
    }
  }

  console.log(`  ▸ ${writ.writId} — ${writ.title.slice(0, 60)}... (${writ.decisions.length} decisions)`);

  const prompt = buildPatronPrompt(writ.decisions);

  let summonResult: ReturnType<typeof summonPatron>;
  try {
    summonResult = summonPatron(prompt);
  } catch (err) {
    const review: WritReview = {
      writId: writ.writId,
      title: writ.title,
      status: 'error',
      error: `summon failed: ${(err as Error).message}`,
      summary: { total: writ.decisions.length, confirmed: 0, dissent: 0, abstained: 0 },
      decisions: [],
    };
    writeFileSync(writPath, JSON.stringify(review, null, 2));
    console.log(`    ✗ summon error`);
    return review;
  }

  if (summonResult.status !== 'completed') {
    const review: WritReview = {
      writId: writ.writId,
      title: writ.title,
      status: 'error',
      error: `session status: ${summonResult.status}`,
      reviewSessionId: summonResult.sessionId,
      summary: { total: writ.decisions.length, confirmed: 0, dissent: 0, abstained: 0 },
      decisions: [],
    };
    writeFileSync(writPath, JSON.stringify(review, null, 2));
    console.log(`    ✗ session status: ${summonResult.status}`);
    return review;
  }

  const output = fetchSessionOutput(summonResult.sessionId);
  const emissions = parseEmission(output, writ.decisions);

  const decisionReviews = writ.decisions.map(d => classifyDecision(d, emissions));
  const summary = {
    total: writ.decisions.length,
    confirmed: decisionReviews.filter(d => d.flag === 'confirmed').length,
    dissent: decisionReviews.filter(d => d.flag === 'dissent').length,
    abstained: decisionReviews.filter(d => d.flag === 'abstained').length,
  };

  const review: WritReview = {
    writId: writ.writId,
    title: writ.title,
    status: 'success',
    reviewSessionId: summonResult.sessionId,
    reviewedAt: new Date().toISOString(),
    costUsd: summonResult.costUsd,
    durationMs: summonResult.durationMs,
    summary,
    decisions: decisionReviews,
  };

  writeFileSync(writPath, JSON.stringify(review, null, 2));
  console.log(
    `    ✓ ${summary.confirmed}c/${summary.dissent}d/${summary.abstained}a` +
      ` ($${summonResult.costUsd.toFixed(3)}, ${Math.round(summonResult.durationMs / 1000)}s)`,
  );
  return review;
}

function main(): void {
  if (!existsSync(SOURCE_FILE)) {
    console.error(`Source artifact not found: ${SOURCE_FILE}`);
    console.error('Run bin/patron-anima-gap-extract.sh first.');
    process.exit(1);
  }

  ensureDir(SESSIONS_DIR);

  if (RECLASSIFY) {
    runReclassify();
    return;
  }

  const source = JSON.parse(readFileSync(SOURCE_FILE, 'utf-8')) as GapSource;

  let writs = source.writs;
  if (ONLY) {
    const match = writs.filter(w => w.writId === ONLY || w.writId.startsWith(ONLY));
    if (match.length === 0) {
      console.error(`No writ matches --only ${ONLY}`);
      process.exit(1);
    }
    if (match.length > 1) {
      console.error(`Ambiguous --only ${ONLY}: ${match.map(m => m.writId).join(', ')}`);
      process.exit(1);
    }
    writs = match;
  }

  console.log(`Patron-anima gap retro-review`);
  console.log(`  role: ${ROLE}`);
  console.log(`  writs: ${writs.length} / ${source.writs.length}`);
  console.log(`  force: ${FORCE}`);
  console.log(`  output: ${OUTPUT_FILE}`);
  console.log();

  const reviews: WritReview[] = [];
  let totalCost = 0;
  for (const writ of writs) {
    const review = reviewWrit(writ);
    reviews.push(review);
    if (review.costUsd) totalCost += review.costUsd;
  }

  // If --only was used, aggregate everything available in sessions/ so the
  // manifest stays complete. Otherwise reviews already covers the full set.
  const manifestReviews: WritReview[] = ONLY
    ? readAllSessionFiles()
    : reviews;

  const overallSummary = manifestReviews.reduce(
    (acc, r) => ({
      writs: acc.writs + 1,
      decisions: acc.decisions + r.summary.total,
      confirmed: acc.confirmed + r.summary.confirmed,
      dissent: acc.dissent + r.summary.dissent,
      abstained: acc.abstained + r.summary.abstained,
      errors: acc.errors + (r.status === 'error' ? 1 : 0),
    }),
    { writs: 0, decisions: 0, confirmed: 0, dissent: 0, abstained: 0, errors: 0 },
  );

  const flagged = manifestReviews.flatMap(r =>
    r.decisions
      .filter(d => d.flag === 'dissent' || d.flag === 'abstained')
      .map(d => ({
        writId: r.writId,
        writTitle: r.title,
        decisionId: d.id,
        question: d.question,
        primerSelected: d.primerSelected,
        animaSelection: d.animaSelection,
        flag: d.flag,
        confidence: d.confidence,
        rationale: d.rationale,
      })),
  );

  const manifest = {
    generatedAt: new Date().toISOString(),
    sourceArtifact: 'gap-decisions.json',
    animaRole: ROLE,
    overallSummary,
    flagged,
    writs: manifestReviews,
  };

  writeFileSync(OUTPUT_FILE, JSON.stringify(manifest, null, 2));

  console.log();
  console.log('Done.');
  console.log(`  total cost (this run): $${totalCost.toFixed(3)}`);
  console.log(`  overall: ${overallSummary.writs} writs, ${overallSummary.decisions} decisions`);
  console.log(`           ${overallSummary.confirmed} confirmed, ${overallSummary.dissent} dissent, ${overallSummary.abstained} abstained, ${overallSummary.errors} errored`);
  console.log(`  flagged: ${flagged.length} decisions need patron attention`);
  console.log(`  wrote: ${OUTPUT_FILE}`);
}

function readAllSessionFiles(): WritReview[] {
  const files = readdirSync(SESSIONS_DIR).filter(f => f.endsWith('.json'));
  return files.map(f =>
    JSON.parse(readFileSync(join(SESSIONS_DIR, f), 'utf-8')) as WritReview,
  );
}

function runReclassify(): void {
  console.log('Patron-anima gap retro-review — RECLASSIFY');
  console.log(`  reading cached sessions from ${SESSIONS_DIR}`);
  console.log();

  const files = readdirSync(SESSIONS_DIR).filter(f => f.endsWith('.json'));
  const writs: WritReview[] = [];

  for (const f of files) {
    const path = join(SESSIONS_DIR, f);
    const review = JSON.parse(readFileSync(path, 'utf-8')) as WritReview;
    if (review.status !== 'success') {
      writs.push(review);
      continue;
    }

    const reclassified = review.decisions.map(reclassifyDecisionReview);
    const summary = {
      total: reclassified.length,
      confirmed: reclassified.filter(d => d.flag === 'confirmed').length,
      dissent: reclassified.filter(d => d.flag === 'dissent').length,
      abstained: reclassified.filter(d => d.flag === 'abstained').length,
    };

    const updated: WritReview = { ...review, decisions: reclassified, summary };
    writeFileSync(path, JSON.stringify(updated, null, 2));
    writs.push(updated);

    const delta =
      summary.confirmed !== review.summary.confirmed ||
      summary.dissent !== review.summary.dissent ||
      summary.abstained !== review.summary.abstained;
    const marker = delta ? '↻' : '•';
    console.log(
      `  ${marker} ${review.writId} ${review.summary.confirmed}c/${review.summary.dissent}d/${review.summary.abstained}a → ${summary.confirmed}c/${summary.dissent}d/${summary.abstained}a`,
    );
  }

  const overallSummary = writs.reduce(
    (acc, r) => ({
      writs: acc.writs + 1,
      decisions: acc.decisions + r.summary.total,
      confirmed: acc.confirmed + r.summary.confirmed,
      dissent: acc.dissent + r.summary.dissent,
      abstained: acc.abstained + r.summary.abstained,
      errors: acc.errors + (r.status === 'error' ? 1 : 0),
    }),
    { writs: 0, decisions: 0, confirmed: 0, dissent: 0, abstained: 0, errors: 0 },
  );

  const flagged = writs.flatMap(r =>
    r.decisions
      .filter(d => d.flag === 'dissent' || d.flag === 'abstained')
      .map(d => ({
        writId: r.writId,
        writTitle: r.title,
        decisionId: d.id,
        question: d.question,
        primerSelected: d.primerSelected,
        animaSelection: d.animaSelection,
        flag: d.flag,
        confidence: d.confidence,
        rationale: d.rationale,
      })),
  );

  const manifest = {
    generatedAt: new Date().toISOString(),
    sourceArtifact: 'gap-decisions.json',
    animaRole: ROLE,
    overallSummary,
    flagged,
    writs,
  };

  writeFileSync(OUTPUT_FILE, JSON.stringify(manifest, null, 2));
  console.log();
  console.log('Done (reclassify).');
  console.log(`  overall: ${overallSummary.writs} writs, ${overallSummary.decisions} decisions`);
  console.log(`           ${overallSummary.confirmed} confirmed, ${overallSummary.dissent} dissent, ${overallSummary.abstained} abstained, ${overallSummary.errors} errored`);
  console.log(`  flagged: ${flagged.length} decisions need patron attention`);
  console.log(`  wrote: ${OUTPUT_FILE}`);
}

main();
