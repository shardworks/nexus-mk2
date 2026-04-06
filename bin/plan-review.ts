#!/usr/bin/env npx tsx
/**
 * plan-review — Plan Workshop: full pipeline dashboard for spec planning.
 *
 * Usage: npx tsx bin/plan-review.ts [specs/{slug}]
 *
 * Starts a local web server with:
 *   - Spec listing page (all specs in specs/)
 *   - New spec creation from brief
 *   - Pipeline orchestration (reader → analyst → review → writer)
 *   - Scope and decisions editing
 *   - Spec viewing and dispatch
 *
 * All changes auto-saved. Pipeline agents streamed live.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn, type ChildProcess, execSync } from 'node:child_process';
import { parse, stringify } from 'yaml';
import { createGuild } from '@shardworks/nexus-arbor';
import type { ClerkApi, WritDoc, WritLinkDoc, WritLinks } from '@shardworks/clerk-apparatus';

// ── Config ────────────────────────────────────────────────────────────

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..');
const SPECS_DIR = path.join(PROJECT_ROOT, 'specs');
const GUILD_PATH = '/workspace/vibers';

// Parse --port from argv
const portArgIdx = process.argv.indexOf('--port');
const PORT = portArgIdx !== -1 && process.argv[portArgIdx + 1] ? parseInt(process.argv[portArgIdx + 1], 10) : 3847;

// ── Guild connection ─────────────────────────────────────────────────

let clerk: ClerkApi;
let guildRef: { guildConfig: () => any };

async function bootGuild(): Promise<void> {
  console.log('[workshop] Booting guild at ' + GUILD_PATH + '...');
  const guild = await createGuild(GUILD_PATH);
  clerk = guild.apparatus<ClerkApi>('clerk');
  guildRef = guild;
  console.log('[workshop] Guild ready — clerk connected');
}

function getCodexNames(): string[] {
  const cfg = guildRef.guildConfig();
  return Object.keys(cfg.codexes?.registered ?? {});
}

function getCodexRemoteUrl(codexName: string): string {
  const cfg = guildRef.guildConfig();
  const entry = cfg.codexes?.registered?.[codexName];
  if (!entry?.remoteUrl) throw new Error(`Codex "${codexName}" not found or missing remoteUrl`);
  return entry.remoteUrl;
}

/** Shallow-clone a codex to a temp directory. Returns the clone path. */
function cloneCodex(codexName: string, sessionId?: string): string {
  const remoteUrl = getCodexRemoteUrl(codexName);
  // Use a stable directory name based on session ID so that Claude's per-directory
  // session store survives across pipeline steps (reader → analyst → writer).
  // Each step deletes and re-clones, but the path stays the same, so --resume works.
  const dirName = sessionId
    ? `plan-${codexName}-${sessionId}`
    : `plan-${codexName}-${crypto.randomUUID()}`;
  const tmpDir = path.join(os.tmpdir(), dirName);
  if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.mkdirSync(tmpDir, { recursive: true });
  console.log(`[workshop] Cloning ${codexName} (${remoteUrl}) → ${tmpDir}`);
  execSync(`git clone --depth 1 ${remoteUrl} ${tmpDir}`, { stdio: 'pipe' });
  return tmpDir;
}

// Ensure specs dir exists
if (!fs.existsSync(SPECS_DIR)) fs.mkdirSync(SPECS_DIR, { recursive: true });

// ── Git auto-commit ──────────────────────────────────────────────────

/** Commit spec files and push, non-blocking. Logs errors but never throws. */
function autoCommitSpec(slug: string, message: string): void {
  const specDir = path.join(SPECS_DIR, slug);
  const proc = spawn('bash', ['-c', `git add "${specDir}" && git commit -m "${message}" && git push`], {
    cwd: PROJECT_ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  proc.on('close', (code) => {
    if (code === 0) console.log('[workshop] Auto-committed: ' + message);
    else console.warn('[workshop] Auto-commit failed (code=' + code + '): ' + message);
  });
  proc.stderr!.on('data', (chunk: Buffer) => {
    const msg = chunk.toString().trim();
    if (msg) console.warn('[workshop] git: ' + msg);
  });
}

// ── Types ─────────────────────────────────────────────────────────────

interface PipelineProcess {
  step: string;
  proc: ChildProcess;
  log: string[];
  startTime: number;
  tokenCount: number;
}

interface SSEClient {
  res: http.ServerResponse;
  slug: string;
}

// ── State ─────────────────────────────────────────────────────────────

const running = new Map<string, PipelineProcess>();
const sseClients: SSEClient[] = [];

// ── Helpers ───────────────────────────────────────────────────────────

interface SpecMeta {
  createdAt?: string;
  sessionId?: string;
  sessions?: Record<string, string>;  // step → session ID (reader, analyst, writer)
  writId?: string;
  codex?: string;
  link?: { type: string; targetId: string };
}

function readMeta(slug: string): SpecMeta {
  const metaPath = path.join(SPECS_DIR, slug, '.meta.yml');
  if (!fs.existsSync(metaPath)) {
    // Migrate from old .session-id file
    const oldPath = path.join(SPECS_DIR, slug, '.session-id');
    if (fs.existsSync(oldPath)) {
      const sessionId = fs.readFileSync(oldPath, 'utf-8').trim();
      const meta: SpecMeta = { sessionId };
      writeMeta(slug, meta);
      fs.unlinkSync(oldPath);
      return meta;
    }
    return {};
  }
  try {
    return parse(fs.readFileSync(metaPath, 'utf-8')) ?? {};
  } catch { return {}; }
}

function writeMeta(slug: string, meta: SpecMeta): void {
  const metaPath = path.join(SPECS_DIR, slug, '.meta.yml');
  fs.writeFileSync(metaPath, stringify(meta, { lineWidth: 0 }));
}

// Cache writ status to avoid redundant queries
const writStatusCache = new Map<string, { writ: WritDoc; fetchedAt: number }>();
const WRIT_CACHE_TTL = 10_000; // 10 seconds

async function getWrit(writId: string): Promise<WritDoc | null> {
  const cached = writStatusCache.get(writId);
  if (cached && (Date.now() - cached.fetchedAt) < WRIT_CACHE_TTL) {
    return cached.writ;
  }
  try {
    const writ = await clerk.show(writId);
    writStatusCache.set(writId, { writ, fetchedAt: Date.now() });
    return writ;
  } catch {
    return null;
  }
}

function getWritSync(writId: string): WritDoc | null {
  const cached = writStatusCache.get(writId);
  if (cached) return cached.writ;
  return null;
}

// Links cache
const linksCache = new Map<string, { links: WritLinks; fetchedAt: number }>();

async function getLinks(writId: string): Promise<WritLinks | null> {
  const cached = linksCache.get(writId);
  if (cached && (Date.now() - cached.fetchedAt) < WRIT_CACHE_TTL) {
    return cached.links;
  }
  try {
    const links = await clerk.links(writId);
    linksCache.set(writId, { links, fetchedAt: Date.now() });
    return links;
  } catch {
    return null;
  }
}

function getLinksSync(writId: string): WritLinks | null {
  const cached = linksCache.get(writId);
  if (cached) return cached.links;
  return null;
}

/** Walk the full retry chain backwards from a writ. Returns newest-first. */
async function getWritChain(writId: string): Promise<Array<{ id: string; status: string; title: string; linkType?: string }>> {
  const chain: Array<{ id: string; status: string; title: string; linkType?: string }> = [];
  const visited = new Set<string>();
  let currentId: string | null = writId;

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const writ = await getWrit(currentId);
    if (!writ) break;

    const links = await getLinks(currentId);
    // Find outbound "retries" link — this writ retries something
    const retriesLink = links?.outbound.find(l => l.type === 'retries');

    chain.push({
      id: writ.id,
      status: writ.status,
      title: writ.title,
      linkType: retriesLink ? 'retries' : undefined,
    });

    currentId = retriesLink?.targetId ?? null;
  }

  return chain;
}

/** Pre-warm writ cache for all specs that have a writId in their meta. */
async function warmWritCache(): Promise<void> {
  if (!fs.existsSync(SPECS_DIR)) return;
  const dirs = fs.readdirSync(SPECS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory()).map(d => d.name);
  const fetches: Promise<void>[] = [];
  for (const slug of dirs) {
    const meta = readMeta(slug);
    if (meta.writId) {
      fetches.push(getWrit(meta.writId).then(() => {}));
    }
  }
  await Promise.all(fetches);
}

function specsList(): Array<{ slug: string; brief: string; status: string; mtime: string }> {
  if (!fs.existsSync(SPECS_DIR)) return [];
  const dirs = fs.readdirSync(SPECS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)
    .sort();

  return dirs.map(slug => {
    const dir = path.join(SPECS_DIR, slug);
    const briefPath = path.join(dir, 'brief.md');
    const brief = fs.existsSync(briefPath) ? fs.readFileSync(briefPath, 'utf-8').trim() : '(no brief)';
    const status = deriveStatus(slug);
    const meta = readMeta(slug);
    const createdAt = meta.createdAt ?? fs.statSync(dir).mtime.toISOString();
    return { slug, brief, status, createdAt };
  }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function deriveStatus(slug: string): string {
  const r = running.get(slug);
  if (r) return 'running-' + r.step;

  // Check for dispatch running
  if (running.has(slug + ':dispatch')) return 'dispatching';

  const dir = path.join(SPECS_DIR, slug);
  const has = (f: string) => fs.existsSync(path.join(dir, f));

  // If we have a writ ID, check its status for post-dispatch states
  const meta = readMeta(slug);
  if (meta.writId) {
    const writ = getWritSync(meta.writId);
    if (writ) {
      if (writ.status === 'completed') return 'complete';
      if (writ.status === 'failed') return 'failed';
      if (writ.status === 'active') return 'implementing';
      if (writ.status === 'ready') return 'dispatched';
      if (writ.status === 'cancelled') return 'cancelled';
    }
  }

  if (has('spec.md')) return 'spec';
  if (has('gaps.yaml')) return 'gaps';
  if (has('scope.yaml') && has('decisions.yaml')) return 'review';
  if (has('inventory.md')) return 'inventory';
  if (has('brief.md')) return 'brief';
  return 'new';
}

function readSpecFile(slug: string, filename: string): string | null {
  const fp = path.join(SPECS_DIR, slug, filename);
  if (!fs.existsSync(fp)) return null;
  return fs.readFileSync(fp, 'utf-8');
}

// ── Pipeline Cost Tracking ───────────────────────────────────────────

// Anthropic pricing per million tokens
const MODEL_PRICING: Record<string, { input: number; output: number; cacheWrite: number; cacheRead: number }> = {
  'claude-opus-4-6':         { input: 15,  output: 75,  cacheWrite: 18.75, cacheRead: 1.875 },
  'claude-sonnet-4-20250514': { input: 3,   output: 15,  cacheWrite: 3.75,  cacheRead: 0.30 },
};
const DEFAULT_PRICING = MODEL_PRICING['claude-opus-4-6'];

interface StepCost {
  step: string;
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
  costUsd: number;
  model: string | null;
}

interface PipelineCosts {
  steps: StepCost[];
  totalCostUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
}

function computePipelineCosts(slug: string): PipelineCosts | null {
  const transcriptDir = path.join(SPECS_DIR, slug, 'planner-transcripts');
  if (!fs.existsSync(transcriptDir)) return null;

  const files = fs.readdirSync(transcriptDir).filter(f => f.endsWith('.jsonl')).sort();
  if (files.length === 0) return null;

  const stepOrder = ['reader', 'analyst', 'writer'];

  // Resumed sessions share JSONL — the same file is copied for each step in the chain.
  // To avoid double-counting, group by session ID and attribute the full cost to the
  // latest step that used it.
  const sessionLatestStep = new Map<string, string>();  // sessionId → latest step
  const sessionFile = new Map<string, string>();         // sessionId → any filename (all identical)

  for (const f of files) {
    const match = f.match(/^(reader|analyst|writer)-(.+)\.jsonl$/);
    if (!match) continue;
    const [, step, sessionId] = match;
    const existing = sessionLatestStep.get(sessionId);
    if (!existing || stepOrder.indexOf(step) > stepOrder.indexOf(existing)) {
      sessionLatestStep.set(sessionId, step);
      sessionFile.set(sessionId, f);
    }
  }

  // Parse each unique session once and attribute to its latest step
  const stepTotals = new Map<string, StepCost>();

  for (const [sessionId, step] of sessionLatestStep) {
    const filePath = path.join(transcriptDir, sessionFile.get(sessionId)!);
    const messages = parseTranscriptUsage(filePath);
    const usage = sumUsage(messages);

    const existing = stepTotals.get(step);
    if (existing) {
      mergeStepCost(existing, usage);
    } else {
      stepTotals.set(step, { step, ...usage });
    }
  }

  const stepsResult: StepCost[] = [];
  for (const step of stepOrder) {
    const s = stepTotals.get(step);
    if (s) stepsResult.push(s);
  }

  if (stepsResult.length === 0) return null;

  return {
    steps: stepsResult,
    totalCostUsd: stepsResult.reduce((sum, s) => sum + s.costUsd, 0),
    totalInputTokens: stepsResult.reduce((sum, s) => sum + s.inputTokens, 0),
    totalOutputTokens: stepsResult.reduce((sum, s) => sum + s.outputTokens, 0),
  };
}

interface UsageSummary {
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
  costUsd: number;
  model: string | null;
}

function parseTranscriptUsage(filePath: string): Array<{ model: string; input: number; output: number; cacheWrite: number; cacheRead: number }> {
  const messages: Array<{ model: string; input: number; output: number; cacheWrite: number; cacheRead: number }> = [];
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    for (const line of content.split('\n')) {
      if (!line.trim()) continue;
      const obj = JSON.parse(line);
      if (obj.type === 'assistant' && obj.message?.usage) {
        const usage = obj.message.usage;
        messages.push({
          model: obj.message.model || 'unknown',
          input: usage.input_tokens || 0,
          output: usage.output_tokens || 0,
          cacheWrite: usage.cache_creation_input_tokens || 0,
          cacheRead: usage.cache_read_input_tokens || 0,
        });
      }
    }
  } catch { /* ignore parse errors */ }
  return messages;
}

function sumUsage(messages: Array<{ model: string; input: number; output: number; cacheWrite: number; cacheRead: number }>): UsageSummary {
  let inputTokens = 0, outputTokens = 0, cacheWriteTokens = 0, cacheReadTokens = 0;
  let model: string | null = null;
  for (const m of messages) {
    inputTokens += m.input;
    outputTokens += m.output;
    cacheWriteTokens += m.cacheWrite;
    cacheReadTokens += m.cacheRead;
    if (m.model !== 'unknown') model = m.model;
  }
  const pricing = (model && MODEL_PRICING[model]) || DEFAULT_PRICING;
  const costUsd = (inputTokens * pricing.input + outputTokens * pricing.output +
    cacheWriteTokens * pricing.cacheWrite + cacheReadTokens * pricing.cacheRead) / 1_000_000;
  return { inputTokens, outputTokens, cacheWriteTokens, cacheReadTokens, costUsd, model };
}

function mergeStepCost(target: StepCost, source: UsageSummary): void {
  target.inputTokens += source.inputTokens;
  target.outputTokens += source.outputTokens;
  target.cacheWriteTokens += source.cacheWriteTokens;
  target.cacheReadTokens += source.cacheReadTokens;
  target.costUsd += source.costUsd;
  if (source.model) target.model = source.model;
}

function getSpecData(slug: string): Record<string, any> {
  const dir = path.join(SPECS_DIR, slug);
  const data: Record<string, any> = { slug, status: deriveStatus(slug) };

  const briefPath = path.join(dir, 'brief.md');
  if (fs.existsSync(briefPath)) data.brief = fs.readFileSync(briefPath, 'utf-8').trim();

  const scopePath = path.join(dir, 'scope.yaml');
  if (fs.existsSync(scopePath)) data.scope = parse(fs.readFileSync(scopePath, 'utf-8'));

  const decisionsPath = path.join(dir, 'decisions.yaml');
  if (fs.existsSync(decisionsPath)) data.decisions = parse(fs.readFileSync(decisionsPath, 'utf-8'));

  const specPath = path.join(dir, 'spec.md');
  if (fs.existsSync(specPath)) data.spec = fs.readFileSync(specPath, 'utf-8');

  const inventoryPath = path.join(dir, 'inventory.md');
  if (fs.existsSync(inventoryPath)) data.inventory = fs.readFileSync(inventoryPath, 'utf-8');

  const observationsPath = path.join(dir, 'observations.md');
  if (fs.existsSync(observationsPath)) data.observations = fs.readFileSync(observationsPath, 'utf-8');

  const gapsPath = path.join(dir, 'gaps.yaml');
  if (fs.existsSync(gapsPath)) data.gaps = fs.readFileSync(gapsPath, 'utf-8');

  // Read meta
  const meta = readMeta(slug);
  if (meta.codex) data.codex = meta.codex;
  if (meta.sessionId) data.readerSessionId = meta.sessionId;
  if (meta.writId) {
    data.writId = meta.writId;
    const writ = getWritSync(meta.writId);
    if (writ) data.writStatus = writ.status;
  }

  // Include running process info
  const r = running.get(slug);
  if (r) {
    data.runningStep = r.step;
    data.runningLog = r.log.join('\n');
    data.runningElapsed = Math.floor((Date.now() - r.startTime) / 1000);
    data.runningTokens = r.tokenCount;
  }

  // Pipeline costs from planner transcripts
  const costs = computePipelineCosts(slug);
  if (costs) data.pipelineCosts = costs;

  return data;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

// ── SSE ───────────────────────────────────────────────────────────────

function sendSSE(slug: string, event: string, data: any): void {
  const payload = 'event: ' + event + '\ndata: ' + JSON.stringify(data) + '\n\n';
  for (let i = sseClients.length - 1; i >= 0; i--) {
    const client = sseClients[i];
    if (client.slug === slug) {
      try {
        client.res.write(payload);
      } catch {
        sseClients.splice(i, 1);
      }
    }
  }
}

// ── Pipeline ──────────────────────────────────────────────────────────

function runPipelineStep(slug: string, step: string, args: string[], prompt: string, promptFile?: string): void {
  if (running.has(slug)) {
    console.log('[workshop] Already running a step for ' + slug);
    return;
  }

  // Clone the target codex to a temp directory so the agent runs from within it.
  // This ensures all paths the agent discovers are relative to the codex root,
  // which matches the worktree structure the implementing anima will work in.
  const meta = readMeta(slug);
  const codexName = meta.codex;
  if (!codexName) {
    console.error('[workshop] No codex set for ' + slug + ' — cannot run pipeline');
    sendSSE(slug, 'status', { step, state: 'failed', error: 'no codex set' });
    return;
  }

  let cloneDir: string;
  try {
    cloneDir = cloneCodex(codexName, meta.sessionId);
  } catch (err: any) {
    console.error('[workshop] Clone failed for ' + codexName + ': ' + err.message);
    sendSSE(slug, 'status', { step, state: 'failed', error: 'clone failed: ' + err.message });
    return;
  }

  const promptPath = path.join(PROJECT_ROOT, 'bin', 'plan-prompts', (promptFile ?? step) + '.md');

  const cliArgs = [
    '--print', '-',
    '--system-prompt-file', promptPath,
    '--model', 'opus',
    '--tools', 'Read,Glob,Grep,Write',
    '--setting-sources', 'user',
    '--permission-mode', 'acceptEdits',
    '--add-dir', SPECS_DIR,
    '--max-budget-usd', step === 'writer' ? '5' : '3',
    ...args,
  ];

  console.log('[workshop] Starting ' + step + ' for ' + slug + ' (cwd=' + cloneDir + ')');

  const proc = spawn('claude', cliArgs, {
    cwd: cloneDir,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  // Send prompt via stdin to avoid arg-length limits and dash-prefix parsing issues
  proc.stdin!.write(prompt);
  proc.stdin!.end();

  const pipeline: PipelineProcess = {
    step,
    proc,
    log: [],
    startTime: Date.now(),
    tokenCount: 0,
  };

  running.set(slug, pipeline);
  sendSSE(slug, 'status', { step, state: 'running' });

  const appendLog = (line: string) => {
    pipeline.log.push(line);
    // Keep last 500 lines
    if (pipeline.log.length > 500) pipeline.log.shift();
    sendSSE(slug, 'log', { line });
  };

  let stdoutBuf = '';
  proc.stdout!.on('data', (chunk: Buffer) => {
    stdoutBuf += chunk.toString();
    const lines = stdoutBuf.split('\n');
    stdoutBuf = lines.pop() ?? '';
    for (const line of lines) {
      appendLog(line);
    }
  });

  let stderrBuf = '';
  proc.stderr!.on('data', (chunk: Buffer) => {
    stderrBuf += chunk.toString();
    const lines = stderrBuf.split('\n');
    stderrBuf = lines.pop() ?? '';
    for (const line of lines) {
      appendLog('[stderr] ' + line);
    }
  });

  proc.on('close', (code) => {
    if (stdoutBuf) appendLog(stdoutBuf);
    if (stderrBuf) appendLog('[stderr] ' + stderrBuf);
    running.delete(slug);
    const elapsed = Math.floor((Date.now() - pipeline.startTime) / 1000);
    console.log('[workshop] ' + step + ' for ' + slug + ' finished (code=' + code + ', ' + elapsed + 's)');
    sendSSE(slug, 'status', { step, state: code === 0 ? 'complete' : 'failed', elapsed, code });

    // Copy session transcripts before cleaning up.
    // Only copy files that are NEW to this step — skip transcripts already captured
    // by previous steps (e.g., the reader's session file that's still in the project
    // dir when the analyst runs via --fork-session).
    try {
      const projectKey = cloneDir.replace(/\//g, '-');
      const claudeProjectDir = path.join(os.homedir(), '.claude', 'projects', projectKey);
      if (fs.existsSync(claudeProjectDir)) {
        const transcriptDir = path.join(SPECS_DIR, slug, 'planner-transcripts');
        fs.mkdirSync(transcriptDir, { recursive: true });
        const existingSessionIds = new Set(
          fs.readdirSync(transcriptDir)
            .filter(f => f.endsWith('.jsonl'))
            .map(f => f.replace(/^[a-z]+-/, '').replace('.jsonl', ''))
        );
        const jsonlFiles = fs.readdirSync(claudeProjectDir).filter(f => f.endsWith('.jsonl'));
        let copied = 0;
        for (const f of jsonlFiles) {
          const sessionId = f.replace('.jsonl', '');
          if (existingSessionIds.has(sessionId)) {
            console.log('[workshop] Skipping already-captured transcript: ' + sessionId);
            continue;
          }
          const dest = path.join(transcriptDir, step + '-' + sessionId + '.jsonl');
          fs.copyFileSync(path.join(claudeProjectDir, f), dest);
          copied++;

          // Record this step's session ID in meta
          const updatedMeta = readMeta(slug);
          if (!updatedMeta.sessions) updatedMeta.sessions = {};
          updatedMeta.sessions[step] = sessionId;
          writeMeta(slug, updatedMeta);
          console.log('[workshop] Recorded session for ' + step + ': ' + sessionId);
        }
        if (copied > 0) {
          console.log('[workshop] Saved ' + copied + ' transcript(s) for ' + step + '/' + slug);
        }
      }
    } catch (err: any) {
      console.warn('[workshop] Failed to copy transcripts: ' + err.message);
    }

    // Clean up the temp clone
    try {
      fs.rmSync(cloneDir, { recursive: true, force: true });
      console.log('[workshop] Cleaned up temp clone: ' + cloneDir);
    } catch (err: any) {
      console.warn('[workshop] Failed to clean up temp clone: ' + err.message);
    }

    // Auto-chain: reader → analyst (only if reader produced inventory)
    if (code === 0 && step === 'reader') {
      const inventoryPath = path.join(SPECS_DIR, slug, 'inventory.md');
      if (fs.existsSync(inventoryPath)) {
        const brief = readSpecFile(slug, 'brief.md') ?? '';
        console.log('[workshop] Auto-starting analyst for ' + slug);
        startAnalyst(slug, brief.trim());
      } else {
        console.warn('[workshop] Reader finished but no inventory.md produced — skipping analyst for ' + slug);
        sendSSE(slug, 'status', { step: 'reader', state: 'failed', error: 'no inventory produced' });
      }
    }

    // Auto-commit when writer produces the finished spec
    if (code === 0 && step === 'writer') {
      autoCommitSpec(slug, `specs: finalize spec for ${slug}`);
    }
  });
}

function startReader(slug: string, brief: string): void {
  // Pre-create session ID for forking
  const sessionId = crypto.randomUUID();
  const meta = readMeta(slug);
  meta.sessionId = sessionId;
  if (!meta.sessions) meta.sessions = {};
  meta.sessions.reader = sessionId;
  writeMeta(slug, meta);

  const outputPath = path.join(SPECS_DIR, slug, 'inventory.md');
  runPipelineStep(slug, 'reader', ['--session-id', sessionId],
    'Here is the brief:\n\n' + brief + '\n\n---\n\nSlug: ' + slug + '\n\nFollowing your instructions, read the codebase and create an inventory at: ' + outputPath);
}

function startAnalyst(slug: string, brief: string): void {
  const meta = readMeta(slug);
  const sessionId = meta.sessions?.reader ?? meta.sessionId ?? '';
  const specDir = path.join(SPECS_DIR, slug);

  const args = sessionId ? ['--resume', sessionId, '--fork-session'] : [];

  runPipelineStep(slug, 'analyst', args,
    'Here is the brief:\n\n' + brief + '\n\n---\n\nSlug: ' + slug +
    '\n\nThe inventory has been written. Read it at: ' + path.join(specDir, 'inventory.md') +
    '\n\nFollowing your instructions, produce scope and decisions. Write output files to:' +
    '\n- ' + path.join(specDir, 'scope.yaml') +
    '\n- ' + path.join(specDir, 'decisions.yaml') +
    '\n- ' + path.join(specDir, 'observations.md'));
}

function startAnalystRevise(slug: string, amendment: string): void {
  const meta = readMeta(slug);
  const sessionId = meta.sessions?.analyst ?? meta.sessions?.reader ?? meta.sessionId ?? '';
  const specDir = path.join(SPECS_DIR, slug);
  const brief = readSpecFile(slug, 'brief.md') ?? '';

  const args = sessionId ? ['--resume', sessionId, '--fork-session'] : [];

  runPipelineStep(slug, 'analyst', args,
    'You are in REVISION MODE. The patron has reviewed your previous scope and decisions and has corrections.\n\n' +
    '## Original Brief\n\n' + brief.trim() + '\n\n' +
    '## Patron\'s Amendment\n\n' + amendment + '\n\n---\n\n' +
    'Read your previous output files, apply the patron\'s feedback, and rewrite them:' +
    '\n- ' + path.join(specDir, 'scope.yaml') +
    '\n- ' + path.join(specDir, 'decisions.yaml') +
    '\n- ' + path.join(specDir, 'observations.md'),
    'analyst-revise');
}

function startWriter(slug: string, brief: string): void {
  const meta = readMeta(slug);
  const sessionId = meta.sessions?.analyst ?? meta.sessions?.reader ?? meta.sessionId ?? '';
  const specDir = path.join(SPECS_DIR, slug);

  const args = sessionId ? ['--resume', sessionId, '--fork-session'] : [];

  runPipelineStep(slug, 'writer', args,
    'Here is the brief:\n\n' + brief + '\n\n---\n\nSlug: ' + slug +
    '\n\nThe analyst has written scope and decisions, and the patron has reviewed and locked them. Read these input files:' +
    '\n- ' + path.join(specDir, 'scope.yaml') +
    '\n- ' + path.join(specDir, 'decisions.yaml') +
    '\n- ' + path.join(specDir, 'inventory.md') +
    '\n\nFollowing your instructions, produce the spec. Write output to: ' + path.join(specDir, 'spec.md') +
    '\nIf gaps are found, write: ' + path.join(specDir, 'gaps.yaml'));
}

// ── HTTP Server ───────────────────────────────────────────────────────

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
    req.on('end', () => resolve(body));
  });
}

function jsonResponse(res: http.ServerResponse, data: any, status = 200): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const parts = url.pathname.split('/').filter(Boolean);

  try {
    // ── API routes ──

    // GET /api/specs
    if (req.method === 'GET' && url.pathname === '/api/specs') {
      await warmWritCache();
      return jsonResponse(res, specsList());
    }

    // POST /api/specs — create new spec
    if (req.method === 'POST' && url.pathname === '/api/specs') {
      const body = JSON.parse(await readBody(req));
      const brief: string = body.brief || '';
      const slug: string = body.slug || slugify(brief);
      const codex: string = body.codex || '';

      if (!slug || !brief) return jsonResponse(res, { error: 'brief and slug required' }, 400);
      if (!codex) return jsonResponse(res, { error: 'codex is required' }, 400);

      // Validate optional writ link
      const link = body.link as { type?: string; targetId?: string } | undefined;
      if (link?.targetId) {
        try {
          await clerk.show(link.targetId);
        } catch {
          return jsonResponse(res, { error: 'Linked writ not found: ' + link.targetId }, 400);
        }
      }

      const dir = path.join(SPECS_DIR, slug);
      if (fs.existsSync(dir)) return jsonResponse(res, { error: 'spec already exists' }, 409);

      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'brief.md'), brief + '\n');
      const meta: SpecMeta = { createdAt: new Date().toISOString(), codex };
      if (link?.type && link?.targetId) {
        meta.link = { type: link.type, targetId: link.targetId };
      }
      writeMeta(slug, meta);

      autoCommitSpec(slug, `specs: create brief for ${slug}`);

      // Auto-start the reader
      startReader(slug, brief);

      return jsonResponse(res, { slug, status: 'running-reader' }, 201);
    }

    // GET /api/specs/:slug
    if (req.method === 'GET' && parts[0] === 'api' && parts[1] === 'specs' && parts.length === 3) {
      const slug = parts[2];
      const dir = path.join(SPECS_DIR, slug);
      if (!fs.existsSync(dir)) return jsonResponse(res, { error: 'not found' }, 404);
      const meta = readMeta(slug);
      if (meta.writId) await getWrit(meta.writId);
      const data = getSpecData(slug);
      if (meta.writId) {
        data.writChain = await getWritChain(meta.writId);
      }
      return jsonResponse(res, data);
    }

    // PATCH /api/specs/:slug/scope
    if (req.method === 'PATCH' && parts[0] === 'api' && parts[1] === 'specs' && parts[3] === 'scope') {
      const slug = parts[2];
      const body = JSON.parse(await readBody(req));
      const scopePath = path.join(SPECS_DIR, slug, 'scope.yaml');
      if (!fs.existsSync(scopePath)) return jsonResponse(res, { error: 'no scope.yaml' }, 404);

      const data = parse(fs.readFileSync(scopePath, 'utf-8'));
      const item = data.scope.find((s: any) => s.id === body.id);
      if (item) {
        item.included = body.included;
        fs.writeFileSync(scopePath, stringify(data, { lineWidth: 0 }));
      }
      return jsonResponse(res, { ok: true });
    }

    // PATCH /api/specs/:slug/decision
    if (req.method === 'PATCH' && parts[0] === 'api' && parts[1] === 'specs' && parts[3] === 'decision') {
      const slug = parts[2];
      const body = JSON.parse(await readBody(req));
      const decPath = path.join(SPECS_DIR, slug, 'decisions.yaml');
      if (!fs.existsSync(decPath)) return jsonResponse(res, { error: 'no decisions.yaml' }, 404);

      const data = parse(fs.readFileSync(decPath, 'utf-8'));
      const item = data.decisions.find((d: any) => d.id === body.id);
      if (item) {
        item.selected = body.selected;
        if (body.patron_override !== undefined) {
          item.patron_override = body.patron_override;
        } else {
          delete item.patron_override;
        }
        fs.writeFileSync(decPath, stringify(data, { lineWidth: 0 }));
      }
      return jsonResponse(res, { ok: true });
    }

    // POST /api/specs/:slug/pipeline/:step
    if (req.method === 'POST' && parts[0] === 'api' && parts[1] === 'specs' && parts[3] === 'pipeline') {
      const slug = parts[2];
      const step = parts[4];
      const dir = path.join(SPECS_DIR, slug);
      if (!fs.existsSync(dir)) return jsonResponse(res, { error: 'not found' }, 404);

      const brief = readSpecFile(slug, 'brief.md') ?? '';

      if (step === 'reader') startReader(slug, brief.trim());
      else if (step === 'analyst') startAnalyst(slug, brief.trim());
      else if (step === 'analyst-revise') {
        const body = JSON.parse(await readBody(req));
        const amendment = body.amendment;
        if (!amendment) return jsonResponse(res, { error: 'amendment text required' }, 400);
        startAnalystRevise(slug, amendment);
      }
      else if (step === 'writer') startWriter(slug, brief.trim());
      else return jsonResponse(res, { error: 'unknown step' }, 400);

      return jsonResponse(res, { ok: true, step });
    }

    // GET /api/specs/:slug/events — SSE
    if (req.method === 'GET' && parts[0] === 'api' && parts[1] === 'specs' && parts[3] === 'events') {
      const slug = parts[2];
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });
      res.write('event: connected\ndata: {}\n\n');

      const client: SSEClient = { res, slug };
      sseClients.push(client);

      // Send current log if running
      const r = running.get(slug);
      if (r) {
        res.write('event: status\ndata: ' + JSON.stringify({ step: r.step, state: 'running' }) + '\n\n');
        for (const line of r.log) {
          res.write('event: log\ndata: ' + JSON.stringify({ line }) + '\n\n');
        }
      }

      req.on('close', () => {
        const idx = sseClients.indexOf(client);
        if (idx !== -1) sseClients.splice(idx, 1);
      });
      return;
    }

    // POST /api/specs/:slug/dispatch
    if (req.method === 'POST' && parts[0] === 'api' && parts[1] === 'specs' && parts[3] === 'dispatch') {
      const slug = parts[2];
      const body = JSON.parse(await readBody(req));
      const specPath = path.join(SPECS_DIR, slug, 'spec.md');
      if (!fs.existsSync(specPath)) return jsonResponse(res, { error: 'no spec.md — run the writer first' }, 400);

      // Guard against double-dispatch
      if (running.has(slug + ':dispatch')) return jsonResponse(res, { error: 'dispatch already in progress' }, 409);

      // Capture previous writ ID for retry linking
      const dispatchMeta = readMeta(slug);
      const prevWritId = dispatchMeta.writId ?? null;

      const commissionScript = path.join(PROJECT_ROOT, 'bin', 'commission.sh');
      const codex = dispatchMeta.codex || '';
      const complexity = body.complexity || '';

      if (!codex) return jsonResponse(res, { error: 'codex is required' }, 400);

      const spawnArgs = [commissionScript, '--codex', codex];
      if (complexity) spawnArgs.push('--complexity', complexity);
      spawnArgs.push('--', '@' + specPath);

      // Respond immediately, run dispatch async
      jsonResponse(res, { ok: true, message: 'dispatch started' });

      const dispatchKey = slug + ':dispatch';
      const proc = spawn('bash', spawnArgs, { cwd: PROJECT_ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
      const pipeline: PipelineProcess = { step: 'dispatch', proc, log: [], startTime: Date.now(), tokenCount: 0 };
      running.set(dispatchKey, pipeline);
      sendSSE(slug, 'status', { step: 'dispatch', state: 'running' });

      proc.stdout!.on('data', (chunk: Buffer) => {
        const lines = chunk.toString().split('\n').filter(Boolean);
        for (const line of lines) {
          pipeline.log.push(line);
          sendSSE(slug, 'log', { line: '[dispatch] ' + line });

          // Capture writ ID from commission.sh output
          const writMatch = line.match(/Commission posted:\s+(w-[^\s]+)/);
          if (writMatch) {
            const writId = writMatch[1];
            console.log('[workshop] Captured writ ID: ' + writId);
            const meta = readMeta(slug);
            meta.writId = writId;
            writeMeta(slug, meta);
            sendSSE(slug, 'meta', { writId });
          }
        }
      });
      proc.stderr!.on('data', (chunk: Buffer) => {
        const lines = chunk.toString().split('\n').filter(Boolean);
        for (const line of lines) {
          pipeline.log.push(line);
          sendSSE(slug, 'log', { line: '[dispatch] ' + line });
        }
      });
      proc.on('close', (code) => {
        running.delete(dispatchKey);
        const elapsed = Math.floor((Date.now() - pipeline.startTime) / 1000);
        console.log('[workshop] dispatch for ' + slug + ' finished (code=' + code + ', ' + elapsed + 's)');
        // Invalidate writ cache so next status check gets fresh data
        const dmeta = readMeta(slug);
        if (dmeta.writId) writStatusCache.delete(dmeta.writId);

        // Link new writ to previous writ if this is a redispatch
        if (code === 0 && dmeta.writId && prevWritId && dmeta.writId !== prevWritId) {
          clerk.link(dmeta.writId, prevWritId, 'retries').then(() => {
            console.log('[workshop] Linked ' + dmeta.writId + ' --retries--> ' + prevWritId);
          }).catch((err: any) => {
            console.error('[workshop] Failed to link writs:', err.message);
          });
        }

        // Link new writ per patron-specified link from the brief form
        if (code === 0 && dmeta.writId && dmeta.link?.type && dmeta.link?.targetId) {
          clerk.link(dmeta.writId, dmeta.link.targetId, dmeta.link.type).then(() => {
            console.log('[workshop] Linked ' + dmeta.writId + ' --' + dmeta.link!.type + '--> ' + dmeta.link!.targetId);
          }).catch((err: any) => {
            console.error('[workshop] Failed to create patron link:', err.message);
          });
        }

        if (code === 0) {
          autoCommitSpec(slug, `specs: dispatch ${slug}` + (dmeta.writId ? ` (${dmeta.writId})` : ''));
        }

        sendSSE(slug, 'status', { step: 'dispatch', state: code === 0 ? 'complete' : 'failed', elapsed, code });
      });
      return;
    }

    // GET /api/writs — recent writs for linking dropdown
    if (req.method === 'GET' && url.pathname === '/api/writs') {
      const writs = await clerk.list({ limit: 15 });
      return jsonResponse(res, writs.map(w => ({ id: w.id, title: w.title, status: w.status })));
    }

    // GET /api/writs/:id/exists — validate a writ ID
    if (req.method === 'GET' && parts[0] === 'api' && parts[1] === 'writs' && parts[3] === 'exists') {
      const writId = parts[2];
      try {
        await clerk.show(writId);
        return jsonResponse(res, { exists: true });
      } catch {
        return jsonResponse(res, { exists: false });
      }
    }

    // GET /api/codexes
    if (req.method === 'GET' && url.pathname === '/api/codexes') {
      return jsonResponse(res, getCodexNames());
    }

    // PATCH /api/specs/:slug/spec — edit spec content
    if (req.method === 'PATCH' && parts[0] === 'api' && parts[1] === 'specs' && parts[3] === 'spec') {
      const slug = parts[2];
      const body = JSON.parse(await readBody(req));
      const specPath = path.join(SPECS_DIR, slug, 'spec.md');
      fs.writeFileSync(specPath, body.content);
      return jsonResponse(res, { ok: true });
    }

    // ── Serve HTML ──
    if (url.pathname === '/' || url.pathname.startsWith('/#')) {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(HTML);
      return;
    }

    res.writeHead(404);
    res.end('Not found');

  } catch (e: any) {
    console.error('[workshop] Error:', e);
    res.writeHead(500);
    res.end(JSON.stringify({ error: e.message }));
  }
});

// Boot guild, then start server
bootGuild().then(() => {
  server.listen(PORT, () => {
    const initialSlug = process.argv[2];
    const url = 'http://localhost:' + PORT + (initialSlug ? '/#/' + path.basename(initialSlug) : '');
    console.log('\n  plan-workshop serving at ' + url);
    console.log('  specs dir: ' + SPECS_DIR);
    console.log('  guild: ' + GUILD_PATH);
    console.log('  Press Ctrl+C to quit\n');

    try {
      const platform = process.platform;
      if (platform === 'darwin') execSync('open ' + url);
      else if (platform === 'linux') execSync('xdg-open ' + url + ' 2>/dev/null || true');
    } catch { /* silent */ }
  });
}).catch((err) => {
  console.error('[workshop] Failed to boot guild:', err.message);
  process.exit(1);
});

// ── HTML ──────────────────────────────────────────────────────────────

const HTML = /* html */ '<!DOCTYPE html>\n' +
'<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">\n' +
'<title>Plan Workshop</title>\n' +
'<style>\n' +
':root {\n' +
'  --bg: #1a1b26; --surface: #24283b; --surface2: #2f3549; --border: #3b4261;\n' +
'  --text: #c0caf5; --text-dim: #565f89; --text-bright: #e0e6ff;\n' +
'  --green: #9ece6a; --red: #f7768e; --yellow: #e0af68; --cyan: #7dcfff;\n' +
'  --magenta: #bb9af7; --blue: #7aa2f7;\n' +
'}\n' +
'* { margin: 0; padding: 0; box-sizing: border-box; }\n' +
'body { font-family: "SF Mono", "Fira Code", "JetBrains Mono", monospace; font-size: 13px;\n' +
'  line-height: 1.6; background: var(--bg); color: var(--text); }\n' +
'a { color: var(--cyan); text-decoration: none; }\n' +
'a:hover { text-decoration: underline; }\n' +
'.header { background: var(--surface); border-bottom: 1px solid var(--border); padding: 16px 24px;\n' +
'  display: flex; align-items: center; justify-content: space-between; }\n' +
'.header h1 { font-size: 16px; font-weight: 600; color: var(--cyan); }\n' +
'.header h1 a { color: var(--cyan); }\n' +
'.container { max-width: 960px; margin: 0 auto; padding: 24px; }\n' +
'\n' +
'/* ── List view ── */\n' +
'.new-spec { background: var(--surface); border: 1px dashed var(--border); border-radius: 8px;\n' +
'  padding: 16px; margin-bottom: 24px; }\n' +
'.new-spec textarea { width: 100%; height: 80px; background: var(--bg); border: 1px solid var(--border);\n' +
'  border-radius: 6px; color: var(--text); font-family: inherit; font-size: 13px; padding: 10px;\n' +
'  resize: vertical; outline: none; }\n' +
'.new-spec textarea:focus { border-color: var(--cyan); }\n' +
'.new-spec .row { display: flex; gap: 10px; margin-top: 10px; align-items: center; }\n' +
'.new-spec input, .new-spec select { padding: 8px 12px; background: var(--bg); border: 1px solid var(--border);\n' +
'  border-radius: 6px; color: var(--text); font-family: inherit; font-size: 13px; outline: none; }\n' +
'.new-spec input { flex: 1; }\n' +
'.new-spec select { min-width: 120px; }\n' +
'.new-spec input:focus, .new-spec select:focus { border-color: var(--cyan); }\n' +
'.new-spec .link-row { display: flex; gap: 10px; margin-top: 10px; align-items: center; }\n' +
'.new-spec .link-row .link-label { color: var(--text-dim); font-size: 12px; white-space: nowrap; }\n' +
'.new-spec .link-row input { flex: 1; min-width: 0; }\n' +
'.new-spec .link-row .link-type-input { max-width: 140px; }\n' +
'.new-spec .link-row .link-writ-input { flex: 2; }\n' +
'.new-spec .link-row .link-status { font-size: 11px; white-space: nowrap; min-width: 16px; }\n' +
'.new-spec .link-row .link-status.valid { color: var(--green); }\n' +
'.new-spec .link-row .link-status.invalid { color: var(--red, #f44); }\n' +
'.new-spec .link-row .link-status.checking { color: var(--text-dim); }\n' +
'.btn { padding: 8px 20px; border: none; border-radius: 6px; font-family: inherit; font-size: 13px;\n' +
'  font-weight: 600; cursor: pointer; transition: opacity 0.15s; }\n' +
'.btn:hover { opacity: 0.85; }\n' +
'.btn-primary { background: var(--cyan); color: var(--bg); }\n' +
'.btn-green { background: var(--green); color: var(--bg); }\n' +
'.btn-yellow { background: var(--yellow); color: var(--bg); }\n' +
'.btn-dim { background: var(--surface2); color: var(--text-dim); }\n' +
'.spec-card { display: flex; align-items: center; gap: 12px; padding: 14px 16px;\n' +
'  background: var(--surface); border: 1px solid var(--border); border-radius: 8px;\n' +
'  margin-bottom: 8px; cursor: pointer; transition: border-color 0.15s; }\n' +
'.spec-card:hover { border-color: var(--cyan); }\n' +
'.spec-card .slug { font-weight: 600; color: var(--text-bright); flex-shrink: 0; }\n' +
'.spec-card .brief { flex: 1; color: var(--text-dim); font-size: 12px;\n' +
'  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }\n' +
'.badge { font-size: 11px; padding: 2px 10px; border-radius: 10px; font-weight: 500; flex-shrink: 0; }\n' +
'.badge-brief { background: rgba(86,95,137,0.3); color: var(--text-dim); }\n' +
'.badge-inventory { background: rgba(125,207,255,0.15); color: var(--cyan); }\n' +
'.badge-review { background: rgba(224,175,104,0.15); color: var(--yellow); }\n' +
'.badge-spec { background: rgba(158,206,106,0.15); color: var(--green); }\n' +
'.badge-gaps { background: rgba(247,118,142,0.15); color: var(--red); }\n' +
'.badge-running { background: rgba(187,154,247,0.15); color: var(--magenta); }\n' +
'.badge-dispatched { background: rgba(125,207,255,0.15); color: var(--cyan); }\n' +
'.badge-dispatching { background: rgba(187,154,247,0.15); color: var(--magenta); }\n' +
'.badge-implementing { background: rgba(224,175,104,0.15); color: var(--yellow); }\n' +
'.badge-complete { background: rgba(158,206,106,0.15); color: var(--green); }\n' +
'.badge-failed { background: rgba(247,118,142,0.15); color: var(--red); }\n' +
'.badge-cancelled { background: rgba(86,95,137,0.3); color: var(--text-dim); }\n' +
'\n' +
'/* ── Detail view ── */\n' +
'.back { color: var(--text-dim); font-size: 12px; margin-bottom: 8px; display: inline-block; }\n' +
'.detail-header { margin-bottom: 16px; }\n' +
'.detail-header h2 { font-size: 18px; color: var(--text-bright); }\n' +
'.detail-header .brief-text { color: var(--text-dim); font-size: 12px; margin-top: 4px; }\n' +
'.tabs { display: flex; gap: 0; border-bottom: 1px solid var(--border); margin-bottom: 16px; }\n' +
'.tab { padding: 10px 20px; cursor: pointer; color: var(--text-dim); border-bottom: 2px solid transparent;\n' +
'  transition: all 0.15s; font-size: 13px; user-select: none; }\n' +
'.tab:hover { color: var(--text); background: var(--surface); }\n' +
'.tab.active { color: var(--cyan); border-bottom-color: var(--cyan); }\n' +
'.tab .count { background: var(--surface2); color: var(--text-dim); padding: 1px 6px;\n' +
'  border-radius: 8px; font-size: 11px; margin-left: 4px; }\n' +
'.tab.active .count { background: rgba(125,207,255,0.15); color: var(--cyan); }\n' +
'\n' +
'/* ── Pipeline tab ── */\n' +
'.pipeline-steps { margin-bottom: 16px; }\n' +
'.pipeline-step { display: flex; align-items: center; gap: 10px; padding: 8px 0; }\n' +
'.step-indicator { width: 24px; height: 24px; border-radius: 50%; display: flex;\n' +
'  align-items: center; justify-content: center; font-size: 12px; flex-shrink: 0; }\n' +
'.step-indicator.done { background: var(--green); color: var(--bg); }\n' +
'.step-indicator.active { background: var(--magenta); color: var(--bg); animation: pulse 1.5s infinite; }\n' +
'.step-indicator.pending { background: var(--surface2); color: var(--text-dim); }\n' +
'.step-indicator.failed { background: var(--red); color: var(--bg); }\n' +
'@keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }\n' +
'.step-name { font-weight: 500; min-width: 80px; }\n' +
'.step-status { color: var(--text-dim); font-size: 12px; }\n' +
'.step-actions { margin-left: auto; }\n' +
'.step-actions .btn { padding: 4px 12px; font-size: 11px; }\n' +
'.log-area { background: var(--bg); border: 1px solid var(--border); border-radius: 8px;\n' +
'  padding: 12px; height: 400px; overflow-y: auto; font-size: 12px; line-height: 1.5;\n' +
'  white-space: pre-wrap; word-break: break-word; color: var(--text-dim); }\n' +
'.log-area .log-line { margin: 0; }\n' +
'.log-area .stderr { color: var(--yellow); }\n' +
'.elapsed { color: var(--text-dim); font-size: 12px; margin-top: 8px; }\n' +
'\n' +
'/* ── Cost card ── */\n' +
'/* ── Amendment section ── */\n' +
'.amendment-section { margin-bottom: 16px; }\n' +
'.amendment-toggle { font-size: 12px; color: var(--text-dim); cursor: pointer;\n' +
'  user-select: none; padding: 6px 0; }\n' +
'.amendment-toggle:hover { color: var(--cyan); }\n' +
'.amendment-toggle.open { color: var(--cyan); }\n' +
'.amendment-body { margin-top: 8px; }\n' +
'.amendment-hint { font-size: 12px; color: var(--text-dim); margin-bottom: 8px; line-height: 1.5; }\n' +
'.amendment-textarea { width: 100%; min-height: 80px; padding: 10px 12px; background: var(--bg);\n' +
'  border: 1px solid var(--border); border-radius: 6px; color: var(--text); font-family: inherit;\n' +
'  font-size: 13px; resize: vertical; outline: none; margin-bottom: 8px; box-sizing: border-box; }\n' +
'.amendment-textarea:focus { border-color: var(--cyan); }\n' +
'\n' +
'.cost-card { background: var(--surface); border: 1px solid var(--border); border-radius: 8px;\n' +
'  padding: 16px; margin-top: 16px; }\n' +
'.cost-card-title { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;\n' +
'  color: var(--text-dim); margin-bottom: 10px; }\n' +
'.cost-steps { display: flex; gap: 16px; margin-bottom: 12px; }\n' +
'.cost-step { flex: 1; }\n' +
'.cost-step-label { font-size: 11px; color: var(--text-dim); margin-bottom: 2px; }\n' +
'.cost-step-value { font-size: 16px; font-weight: 600; color: var(--text); }\n' +
'.cost-total { border-top: 1px solid var(--border); padding-top: 10px;\n' +
'  display: flex; justify-content: space-between; align-items: baseline; }\n' +
'.cost-total-label { font-size: 12px; color: var(--text-dim); }\n' +
'.cost-total-value { font-size: 20px; font-weight: 700; color: var(--green); }\n' +
'.cost-total-tokens { font-size: 11px; color: var(--text-dim); margin-left: 8px; font-weight: 400; }\n' +
'\n' +
'/* ── Scope tab ── */\n' +
'.scope-item { display: flex; align-items: flex-start; gap: 12px; padding: 12px 16px;\n' +
'  border-radius: 8px; margin-bottom: 4px; cursor: pointer; transition: background 0.1s; }\n' +
'.scope-item:hover { background: var(--surface); }\n' +
'.scope-toggle { width: 20px; height: 20px; border-radius: 4px; border: 2px solid var(--border);\n' +
'  display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 2px;\n' +
'  font-size: 12px; transition: all 0.15s; }\n' +
'.scope-item.included .scope-toggle { background: var(--green); border-color: var(--green); color: var(--bg); }\n' +
'.scope-item.excluded .scope-toggle { background: transparent; border-color: var(--red); color: var(--red); }\n' +
'.scope-id { color: var(--text-dim); font-size: 11px; flex-shrink: 0; width: 28px; margin-top: 3px; }\n' +
'.scope-desc { flex: 1; }\n' +
'.scope-item.excluded .scope-desc { color: var(--text-dim); text-decoration: line-through; }\n' +
'.scope-rationale { font-size: 11px; color: var(--text-dim); margin-top: 4px; }\n' +
'\n' +
'/* ── Decisions tab ── */\n' +
'.filters { display: flex; gap: 10px; margin-bottom: 16px; align-items: center; }\n' +
'.filters span { color: var(--text-dim); font-size: 12px; }\n' +
'.filter-chip { padding: 4px 12px; border-radius: 12px; border: 1px solid var(--border);\n' +
'  cursor: pointer; font-size: 12px; color: var(--text-dim); transition: all 0.15s; user-select: none; }\n' +
'.filter-chip.on { border-color: var(--cyan); color: var(--cyan); background: rgba(125,207,255,0.1); }\n' +
'.filter-chip:hover { background: var(--surface2); }\n' +
'.decision { background: var(--surface); border: 1px solid var(--border); border-radius: 8px;\n' +
'  margin-bottom: 12px; overflow: hidden; }\n' +
'.decision-header { padding: 12px 16px; display: flex; align-items: flex-start; gap: 10px; }\n' +
'.decision-question { flex: 1; font-weight: 500; color: var(--text-bright); }\n' +
'.cat-badge { font-size: 11px; padding: 2px 8px; border-radius: 8px; font-weight: 500; flex-shrink: 0; }\n' +
'.cat-badge.product { background: rgba(158,206,106,0.15); color: var(--green); }\n' +
'.cat-badge.api { background: rgba(125,207,255,0.15); color: var(--cyan); }\n' +
'.cat-badge.implementation { background: rgba(224,175,104,0.15); color: var(--yellow); }\n' +
'.conf-badge { font-size: 11px; padding: 2px 8px; border-radius: 8px; font-weight: 500; flex-shrink: 0; }\n' +
'.conf-badge.high { background: rgba(158,206,106,0.15); color: var(--green); }\n' +
'.conf-badge.medium { background: rgba(224,175,104,0.15); color: var(--yellow); }\n' +
'.conf-badge.low { background: rgba(247,118,142,0.15); color: var(--red); }\n' +
'.decision-options { padding: 0 16px 12px; }\n' +
'.option { display: flex; align-items: flex-start; gap: 10px; padding: 8px 12px;\n' +
'  border-radius: 6px; cursor: pointer; transition: background 0.1s; margin-bottom: 2px; }\n' +
'.option:hover { background: var(--surface2); }\n' +
'.option-radio { width: 16px; height: 16px; border-radius: 50%; border: 2px solid var(--border);\n' +
'  flex-shrink: 0; margin-top: 2px; display: flex; align-items: center; justify-content: center;\n' +
'  transition: all 0.15s; }\n' +
'.option.selected .option-radio { border-color: var(--green); }\n' +
'.option.selected .option-radio::after { content: ""; width: 8px; height: 8px;\n' +
'  border-radius: 50%; background: var(--green); }\n' +
'.option-key { color: var(--text-dim); font-size: 12px; flex-shrink: 0; width: 16px; margin-top: 2px; }\n' +
'.option-text { flex: 1; }\n' +
'.option.selected .option-text { color: var(--text-bright); font-weight: 500; }\n' +
'.custom-row { padding: 8px 16px 12px; }\n' +
'.custom-row input { width: 100%; padding: 8px 12px; background: var(--bg); border: 1px solid var(--border);\n' +
'  border-radius: 6px; color: var(--text); font-family: inherit; font-size: 13px; outline: none; }\n' +
'.custom-row input:focus { border-color: var(--cyan); }\n' +
'.custom-override { padding: 4px 16px 12px; font-size: 12px; color: var(--magenta); }\n' +
'.explain-toggle { font-size: 11px; color: var(--text-dim); cursor: pointer;\n' +
'  padding: 4px 16px 12px; user-select: none; }\n' +
'.explain-toggle:hover { color: var(--cyan); }\n' +
'.explain-content { display: none; padding: 12px 16px; font-size: 12px;\n' +
'  border-top: 1px solid var(--border); margin: 0 16px 12px; }\n' +
'.explain-content.visible { display: block; }\n' +
'.explain-label { color: var(--text-dim); font-size: 11px; text-transform: uppercase;\n' +
'  letter-spacing: 0.5px; margin-bottom: 4px; }\n' +
'.explain-text { margin-bottom: 10px; }\n' +
'.explain-text.rationale { color: var(--cyan); }\n' +
'\n' +
'/* ── Spec tab ── */\n' +
'.spec-content { background: var(--surface); border: 1px solid var(--border); border-radius: 8px;\n' +
'  padding: 20px; white-space: pre-wrap; font-size: 13px; line-height: 1.7; max-height: 600px;\n' +
'  overflow-y: auto; }\n' +
'.spec-actions { margin-top: 16px; display: flex; gap: 10px; align-items: center; }\n' +
'.dispatch-form { margin-top: 16px; display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }\n' +
'.dispatch-form label { color: var(--text-dim); font-size: 12px; }\n' +
'.dispatch-form input, .dispatch-form select { padding: 6px 10px; background: var(--bg);\n' +
'  border: 1px solid var(--border); border-radius: 6px; color: var(--text); font-family: inherit;\n' +
'  font-size: 13px; outline: none; }\n' +
'.dispatch-form input:focus, .dispatch-form select:focus { border-color: var(--cyan); }\n' +
'.empty { color: var(--text-dim); padding: 40px 0; text-align: center; }\n' +
'</style></head><body>\n' +
'\n' +
'<div class="header">\n' +
'  <h1><a href="#/" id="home-link">Plan Workshop</a></h1>\n' +
'  <div id="header-right"></div>\n' +
'</div>\n' +
'\n' +
'<div class="container" id="app"></div>\n' +
'\n' +
'<script>\n' +
'var currentSlug = null;\n' +
'var currentTab = "pipeline";\n' +
'var specData = null;\n' +
'var evtSource = null;\n' +
'var logLines = [];\n' +
'var elapsedTimer = null;\n' +
'var filters = { product: true, api: true, implementation: true };\n' +
'var codexList = [];\n' +
'var writList = [];\n' +
'api("GET", "/codexes").then(function(c) { codexList = c || []; });\n' +
'api("GET", "/writs").then(function(w) { writList = w || []; });\n' +
'\n' +
'var linkValidationTimer = null;\n' +
'var lastValidatedWrit = "";\n' +
'\n' +
'function validateWritId(value) {\n' +
'  var statusEl = document.getElementById("link-writ-status");\n' +
'  if (!statusEl) return;\n' +
'  if (!value) { statusEl.textContent = ""; statusEl.className = "link-status"; return; }\n' +
'  // Check if it matches a known writ from the list\n' +
'  var known = writList.find(function(w) { return w.id === value; });\n' +
'  if (known) { statusEl.textContent = "\\u2713"; statusEl.className = "link-status valid"; return; }\n' +
'  // Debounced server validation for freetext IDs\n' +
'  if (value === lastValidatedWrit) return;\n' +
'  statusEl.textContent = "\\u22EF"; statusEl.className = "link-status checking";\n' +
'  clearTimeout(linkValidationTimer);\n' +
'  linkValidationTimer = setTimeout(function() {\n' +
'    lastValidatedWrit = value;\n' +
'    api("GET", "/writs/" + encodeURIComponent(value) + "/exists").then(function(r) {\n' +
'      if (document.getElementById("new-link-writ").value.trim() !== value) return;\n' +
'      statusEl.textContent = r.exists ? "\\u2713" : "\\u2717";\n' +
'      statusEl.className = "link-status " + (r.exists ? "valid" : "invalid");\n' +
'    });\n' +
'  }, 400);\n' +
'}\n' +
'\n' +
'// ── Router ──\n' +
'function route() {\n' +
'  var hash = location.hash || "#/";\n' +
'  if (hash === "#/" || hash === "#") {\n' +
'    currentSlug = null;\n' +
'    showList();\n' +
'  } else if (hash.indexOf("#/") === 0) {\n' +
'    currentSlug = hash.slice(2);\n' +
'    currentTab = "pipeline";\n' +
'    showDetail(currentSlug);\n' +
'  }\n' +
'}\n' +
'window.addEventListener("hashchange", route);\n' +
'\n' +
'// ── API helpers ──\n' +
'function api(method, path, body) {\n' +
'  var opts = { method: method, headers: { "Content-Type": "application/json" } };\n' +
'  if (body) opts.body = JSON.stringify(body);\n' +
'  return fetch("/api" + path, opts).then(function(r) { return r.json(); });\n' +
'}\n' +
'\n' +
'// ── List view ──\n' +
'function showList() {\n' +
'  cleanup();\n' +
'  document.getElementById("header-right").innerHTML = "";\n' +
'  api("GET", "/specs").then(function(specs) {\n' +
'    var el = document.getElementById("app");\n' +
'    var html = "";\n' +
'    html += \'<div class="new-spec">\';\n' +
'    html += \'<textarea id="new-brief" placeholder="Describe the feature..."></textarea>\';\n' +
'    html += \'<div class="row">\';\n' +
'    html += \'<input id="new-slug" placeholder="slug (auto-generated from brief)">\';\n' +
'    html += \'<select id="new-codex"><option value="">codex...</option></select>\';\n' +
'    html += \'<button class="btn btn-primary" data-action="create-spec">Start Pipeline &#8594;</button>\';\n' +
'    html += \'</div>\';\n' +
'    html += \'<div class="link-row">\';\n' +
'    html += \'<span class="link-label">Link:</span>\';\n' +
'    html += \'<input id="new-link-type" class="link-type-input" list="link-types" placeholder="link type...">\';\n' +
'    html += \'<datalist id="link-types"><option value="fixes"><option value="depends on"></datalist>\';\n' +
'    html += \'<input id="new-link-writ" class="link-writ-input" list="link-writs" placeholder="writ id...">\';\n' +
'    html += \'<span id="link-writ-status" class="link-status"></span>\';\n' +
'    html += \'<datalist id="link-writs"></datalist>\';\n' +
'    html += \'</div>\';\n' +
'    html += \'</div>\';\n' +
'\n' +
'    if (specs.length === 0) {\n' +
'      html += \'<div class="empty">No specs yet. Write a brief above to get started.</div>\';\n' +
'    } else {\n' +
'      for (var i = 0; i < specs.length; i++) {\n' +
'        var s = specs[i];\n' +
'        var badgeClass = "badge-" + (s.status.indexOf("running") === 0 ? "running" : s.status);\n' +
'        var statusLabel = s.status;\n' +
'        if (s.status.indexOf("running") === 0) statusLabel = s.status.replace("running-", "&#9672; ");\n' +
'        else if (s.status === "implementing" || s.status === "dispatching") statusLabel = "&#9672; " + s.status;\n' +
'        html += \'<div class="spec-card" data-action="open-spec" data-slug="\' + esc(s.slug) + \'">\';\n' +
'        html += \'<div class="slug">\' + esc(s.slug) + \'</div>\';\n' +
'        html += \'<div class="brief">\' + esc(s.brief) + \'</div>\';\n' +
'        html += \'<span class="badge \' + badgeClass + \'">\' + statusLabel + \'</span>\';\n' +
'        html += \'</div>\';\n' +
'      }\n' +
'    }\n' +
'    el.innerHTML = html;\n' +
'\n' +
'    // Auto-slug from brief\n' +
'    var briefEl = document.getElementById("new-brief");\n' +
'    var slugEl = document.getElementById("new-slug");\n' +
'    if (briefEl && slugEl) {\n' +
'      briefEl.addEventListener("input", function() {\n' +
'        var firstLine = briefEl.value.split("\\n")[0] || "";\n' +
'        var words = firstLine.toLowerCase().replace(/[^a-z0-9\\s-]/g, "").split(/\\s+/).slice(0, 6);\n' +
'        slugEl.value = words.join("-").replace(/-+/g, "-").replace(/^-|-$/g, "");\n' +
'      });\n' +
'    }\n' +
'\n' +
'    // Populate codex dropdown\n' +
'    var newCodexEl = document.getElementById("new-codex");\n' +
'    if (newCodexEl && codexList.length > 0) {\n' +
'      var defaultVal = codexList.length === 1 ? codexList[0] : "";\n' +
'      newCodexEl.innerHTML = codexList.length === 1 ? "" : \'<option value="">codex...</option>\';\n' +
'      for (var ci = 0; ci < codexList.length; ci++) {\n' +
'        var sel = codexList[ci] === defaultVal ? " selected" : "";\n' +
'        newCodexEl.innerHTML += \'<option value="\' + codexList[ci] + \'"\' + sel + \'>\' + codexList[ci] + \'</option>\';\n' +
'      }\n' +
'    }\n' +
'\n' +
'    // Populate writ datalist and attach validation\n' +
'    var writDatalist = document.getElementById("link-writs");\n' +
'    if (writDatalist && writList.length > 0) {\n' +
'      var dlHtml = "";\n' +
'      for (var wi = 0; wi < writList.length; wi++) {\n' +
'        dlHtml += \'<option value="\' + escAttr(writList[wi].id) + \'">\' + esc(writList[wi].title) + \'</option>\';\n' +
'      }\n' +
'      writDatalist.innerHTML = dlHtml;\n' +
'    }\n' +
'    var linkWritEl = document.getElementById("new-link-writ");\n' +
'    if (linkWritEl) {\n' +
'      linkWritEl.addEventListener("input", function() { validateWritId(linkWritEl.value.trim()); });\n' +
'      linkWritEl.addEventListener("change", function() { validateWritId(linkWritEl.value.trim()); });\n' +
'    }\n' +
'  });\n' +
'}\n' +
'\n' +
'// ── Detail view ──\n' +
'function showDetail(slug) {\n' +
'  cleanup();\n' +
'  api("GET", "/specs/" + slug).then(function(data) {\n' +
'    specData = data;\n' +
'    renderDetail();\n' +
'    connectSSE(slug);\n' +
'  });\n' +
'}\n' +
'\n' +
'function renderDetail() {\n' +
'  var d = specData;\n' +
'  var el = document.getElementById("app");\n' +
'  var html = "";\n' +
'\n' +
'  html += \'<a class="back" href="#/">&larr; all specs</a>\';\n' +
'  html += \'<div class="detail-header">\';\n' +
'  html += \'<h2>\' + esc(d.slug) + \'</h2>\';\n' +
'  html += \'<div class="brief-text">\' + esc(d.brief || "") + \'</div>\';\n' +
'  html += \'</div>\';\n' +
'\n' +
'  // Tabs\n' +
'  var tabs = ["pipeline", "scope", "decisions", "spec"];\n' +
'  html += \'<div class="tabs">\';\n' +
'  for (var i = 0; i < tabs.length; i++) {\n' +
'    var t = tabs[i];\n' +
'    var cls = t === currentTab ? " active" : "";\n' +
'    var count = "";\n' +
'    if (t === "scope" && d.scope) count = \' <span class="count">\' + d.scope.scope.filter(function(s){return s.included}).length + "/" + d.scope.scope.length + "</span>";\n' +
'    if (t === "decisions" && d.decisions) count = \' <span class="count">\' + d.decisions.decisions.length + "</span>";\n' +
'    html += \'<div class="tab\' + cls + \'" data-action="switch-tab" data-tab="\' + t + \'">\' + t + count + \'</div>\';\n' +
'  }\n' +
'  html += \'</div>\';\n' +
'\n' +
'  // Tab content\n' +
'  html += \'<div id="tab-content">\';\n' +
'  if (currentTab === "pipeline") html += renderPipeline();\n' +
'  else if (currentTab === "scope") html += renderScope();\n' +
'  else if (currentTab === "decisions") html += renderDecisions();\n' +
'  else if (currentTab === "spec") html += renderSpec();\n' +
'  html += \'</div>\';\n' +
'\n' +
'  el.innerHTML = html;\n' +
'\n' +
'  // Scroll log to bottom\n' +
'  var logEl = document.getElementById("log-area");\n' +
'  if (logEl) logEl.scrollTop = logEl.scrollHeight;\n' +
'\n' +
'\n' +
'  startElapsedTimer();\n' +
'}\n' +
'\n' +
'function renderPipeline() {\n' +
'  var d = specData;\n' +
'  var html = \'<div class="pipeline-steps">\';\n' +
'\n' +
'  var steps = [\n' +
'    { key: "reader", label: "Reader", file: "inventory.md" },\n' +
'    { key: "analyst", label: "Analyst", file: "scope.yaml" },\n' +
'    { key: "review", label: "Review", file: null },\n' +
'    { key: "writer", label: "Writer", file: "spec.md" },\n' +
'    { key: "dispatch", label: "Dispatch", file: null },\n' +
'  ];\n' +
'\n' +
'  for (var i = 0; i < steps.length; i++) {\n' +
'    var s = steps[i];\n' +
'    var state = "pending";\n' +
'    var statusText = "pending";\n' +
'    var icon = "&#9675;";\n' +
'    var actionBtn = "";\n' +
'\n' +
'    if (s.key === "dispatch") {\n' +
'      // Dispatch step derives state from writ status\n' +
'      if (d.status === "dispatching") { state = "active"; statusText = "dispatching..."; icon = "&#9672;"; }\n' +
'      else if (d.writId) {\n' +
'        var ws = d.writStatus || "unknown";\n' +
'        if (ws === "completed") { state = "done"; statusText = "complete"; icon = "&#10003;"; }\n' +
'        else if (ws === "failed") { state = "failed"; statusText = "failed"; icon = "&#10007;"; }\n' +
'        else if (ws === "active") { state = "active"; statusText = "implementing..."; icon = "&#9672;"; }\n' +
'        else if (ws === "ready") { state = "done"; statusText = "dispatched"; icon = "&#10003;"; }\n' +
'        else if (ws === "cancelled") { state = "failed"; statusText = "cancelled"; icon = "&#10007;"; }\n' +
'        else { state = "done"; statusText = ws; icon = "&#10003;"; }\n' +
'      }\n' +
'    } else if (d.runningStep === s.key) {\n' +
'      state = "active"; statusText = "running..."; icon = "&#9672;";\n' +
'    } else if (s.key === "review") {\n' +
'      if (d.scope && d.decisions) { state = "done"; statusText = "ready"; icon = "&#10003;"; }\n' +
'    } else if (s.file && d[s.key === "reader" ? "inventory" : s.key === "analyst" ? "scope" : "spec"]) {\n' +
'      state = "done"; statusText = "complete"; icon = "&#10003;";\n' +
'    }\n' +
'\n' +
'    // Show run/re-run buttons (not for review or dispatch)\n' +
'    if (s.key !== "review" && s.key !== "dispatch" && !d.runningStep) {\n' +
'      if (state === "done") {\n' +
'        actionBtn = \'<button class="btn btn-dim" data-action="run-step" data-step="\' + s.key + \'">re-run</button>\';\n' +
'      } else if (state === "pending") {\n' +
'        // Only show run if previous step is done\n' +
'        var canRun = false;\n' +
'        if (s.key === "reader") canRun = !!d.brief;\n' +
'        if (s.key === "analyst") canRun = !!d.inventory;\n' +
'        if (s.key === "writer") canRun = !!(d.scope && d.decisions);\n' +
'        if (canRun) actionBtn = \'<button class="btn btn-primary" data-action="run-step" data-step="\' + s.key + \'">run</button>\';\n' +
'      }\n' +
'    }\n' +
'\n' +
'    html += \'<div class="pipeline-step">\';\n' +
'    html += \'<div class="step-indicator \' + state + \'">\' + icon + \'</div>\';\n' +
'    html += \'<div class="step-name">\' + s.label + \'</div>\';\n' +
'    html += \'<div class="step-status">\' + statusText + \'</div>\';\n' +
'    html += \'<div class="step-actions">\' + actionBtn + \'</div>\';\n' +
'    html += \'</div>\';\n' +
'  }\n' +
'  html += \'</div>\';\n' +
'\n' +
'  // Log area\n' +
'  html += \'<div id="log-area" class="log-area">\';\n' +
'  for (var j = 0; j < logLines.length; j++) {\n' +
'    var line = logLines[j];\n' +
'    var cls = line.indexOf("[stderr]") === 0 ? " stderr" : "";\n' +
'    html += \'<div class="log-line\' + cls + \'">\' + esc(line) + \'</div>\';\n' +
'  }\n' +
'  if (logLines.length === 0 && !d.runningStep) {\n' +
'    html += \'<div style="color: var(--text-dim)">No active pipeline. Click a step to run it.</div>\';\n' +
'  }\n' +
'  html += \'</div>\';\n' +
'\n' +
'  if (d.runningStep) {\n' +
'    html += \'<div class="elapsed" id="elapsed">Elapsed: <span id="elapsed-val">0</span>s</div>\';\n' +
'  }\n' +
'\n' +
'  html += renderCostCard();\n' +
'\n' +
'  return html;\n' +
'}\n' +
'\n' +
'function renderCostCard() {\n' +
'  var costs = specData.pipelineCosts;\n' +
'  if (!costs || costs.steps.length === 0) return "";\n' +
'\n' +
'  var html = \'<div class="cost-card">\';\n' +
'  html += \'<div class="cost-card-title">Pipeline Cost</div>\';\n' +
'  html += \'<div class="cost-steps">\';\n' +
'  for (var i = 0; i < costs.steps.length; i++) {\n' +
'    var s = costs.steps[i];\n' +
'    html += \'<div class="cost-step">\';\n' +
'    html += \'<div class="cost-step-label">\' + esc(s.step) + \'</div>\';\n' +
'    html += \'<div class="cost-step-value">$\' + s.costUsd.toFixed(2) + \'</div>\';\n' +
'    html += \'</div>\';\n' +
'  }\n' +
'  html += \'</div>\';\n' +
'  html += \'<div class="cost-total">\';\n' +
'  html += \'<div class="cost-total-label">Total</div>\';\n' +
'  var totalTokens = costs.totalInputTokens + costs.totalOutputTokens;\n' +
'  html += \'<div><span class="cost-total-value">$\' + costs.totalCostUsd.toFixed(2) + \'</span>\';\n' +
'  html += \'<span class="cost-total-tokens">\' + fmtTokens(totalTokens) + \' tokens</span>\';\n' +
'  html += \'</div>\';\n' +
'  html += \'</div>\';\n' +
'  html += \'</div>\';\n' +
'  return html;\n' +
'}\n' +
'\n' +
'function fmtTokens(n) {\n' +
'  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";\n' +
'  if (n >= 1000) return (n / 1000).toFixed(1) + "k";\n' +
'  return "" + n;\n' +
'}\n' +
'\n' +
'function renderScope() {\n' +
'  if (!specData.scope) return \'<div class="empty">No scope.yaml yet. Run the analyst first.</div>\';\n' +
'  var scope = specData.scope.scope;\n' +
'  var html = "";\n' +
'  for (var i = 0; i < scope.length; i++) {\n' +
'    var s = scope[i];\n' +
'    var cls = s.included ? "included" : "excluded";\n' +
'    var check = s.included ? "&#10003;" : "&#10007;";\n' +
'    html += \'<div class="scope-item \' + cls + \'" data-action="toggle-scope" data-index="\' + i + \'">\';\n' +
'    html += \'<div class="scope-toggle">\' + check + \'</div>\';\n' +
'    html += \'<div class="scope-id">\' + esc(s.id) + \'</div>\';\n' +
'    html += \'<div class="scope-desc">\' + esc(s.description);\n' +
'    html += \'<div class="scope-rationale">\' + esc(s.rationale) + \'</div>\';\n' +
'    html += \'</div></div>\';\n' +
'  }\n' +
'  return html;\n' +
'}\n' +
'\n' +
'function renderDecisions() {\n' +
'  if (!specData.decisions) return \'<div class="empty">No decisions.yaml yet. Run the analyst first.</div>\';\n' +
'\n' +
'  var html = \'<div class="filters">\';\n' +
'  html += \'<span>Show:</span>\';\n' +
'  var cats = ["product", "api", "implementation"];\n' +
'  for (var ci = 0; ci < cats.length; ci++) {\n' +
'    var cat = cats[ci];\n' +
'    var on = filters[cat] ? " on" : "";\n' +
'    html += \'<div class="filter-chip\' + on + \'" data-action="toggle-filter" data-cat="\' + cat + \'">\' + cat + \'</div>\';\n' +
'  }\n' +
'  html += \'</div>\';\n' +
'\n' +
'  var excluded = {};\n' +
'  if (specData.scope) {\n' +
'    specData.scope.scope.forEach(function(s) { if (!s.included) excluded[s.id] = true; });\n' +
'  }\n' +
'\n' +
'  var decisions = specData.decisions.decisions.filter(function(d) {\n' +
'    if (!d.observable) return false;\n' +
'    if (!filters[d.category]) return false;\n' +
'    var hasScope = d.scope.some(function(s) { return !excluded[s]; });\n' +
'    return hasScope;\n' +
'  });\n' +
'\n' +
'  // Amendment section\n' +
'  html += \'<div class="amendment-section">\';\n' +
'  html += \'<div class="amendment-toggle" data-action="toggle-amendment">&#9656; Amend analysis</div>\';\n' +
'  html += \'<div class="amendment-body" id="amendment-body" style="display:none;">\';\n' +
'  html += \'<div class="amendment-hint">Describe what the analyst got wrong — wrong assumptions, missing context, or misdirected framing. The analyst will revise scope and decisions in light of your feedback.</div>\';\n' +
'  html += \'<textarea id="amendment-text" class="amendment-textarea" placeholder="The analyst assumed X, but actually Y. This means..."></textarea>\';\n' +
'  html += \'<button class="btn btn-primary" data-action="submit-amendment">Revise &#8594;</button>\';\n' +
'  html += \'</div></div>\';\n' +
'\n' +
'  if (decisions.length === 0) {\n' +
'    html += \'<div class="empty">No decisions match filters.</div>\';\n' +
'    return html;\n' +
'  }\n' +
'\n' +
'  for (var di = 0; di < decisions.length; di++) {\n' +
'    var d = decisions[di];\n' +
'    var optionKeys = Object.keys(d.options);\n' +
'    html += \'<div class="decision" data-id="\' + escAttr(d.id) + \'">\';\n' +
'    html += \'<div class="decision-header">\';\n' +
'    html += \'<span class="cat-badge \' + d.category + \'">\' + esc(d.category) + \'</span>\';\n' +
'    html += \'<div class="decision-question">\' + esc(d.question) + \'</div>\';\n' +
'    html += \'<span class="conf-badge \' + d.analysis.confidence + \'">\' + esc(d.analysis.confidence) + \'</span>\';\n' +
'    html += \'</div><div class="decision-options">\';\n' +
'\n' +
'    for (var oi = 0; oi < optionKeys.length; oi++) {\n' +
'      var ok = optionKeys[oi];\n' +
'      var sel = d.selected === ok ? " selected" : "";\n' +
'      html += \'<div class="option\' + sel + \'" data-action="select-option" data-decision="\' + escAttr(d.id) + \'" data-option="\' + escAttr(ok) + \'">\';\n' +
'      html += \'<div class="option-radio"></div>\';\n' +
'      html += \'<div class="option-key">\' + esc(ok) + \')</div>\';\n' +
'      html += \'<div class="option-text">\' + esc(d.options[ok]) + \'</div>\';\n' +
'      html += \'</div>\';\n' +
'    }\n' +
'    html += \'</div>\';\n' +
'\n' +
'    html += \'<div class="custom-row">\';\n' +
'    html += \'<input type="text" placeholder="Custom override... (Enter to apply)"\';\n' +
'    html += \' value="\' + escAttr(d.patron_override || "") + \'"\';\n' +
'    html += \' data-action="custom-input" data-decision="\' + escAttr(d.id) + \'">\';\n' +
'    html += \'</div>\';\n' +
'\n' +
'    if (d.selected === "custom" && d.patron_override) {\n' +
'      html += \'<div class="custom-override">&#8594; custom: \' + esc(d.patron_override) + \'</div>\';\n' +
'    }\n' +
'\n' +
'    html += \'<div class="explain-toggle" data-action="toggle-explain">&#9656; explain</div>\';\n' +
'    html += \'<div class="explain-content">\';\n' +
'    html += \'<div class="explain-label">Context</div>\';\n' +
'    html += \'<div class="explain-text">\' + esc(d.context) + \'</div>\';\n' +
'    html += \'<div class="explain-label">Analyst recommendation: \' + esc(d.analysis.recommendation) + \' (confidence: \' + esc(d.analysis.confidence) + \')</div>\';\n' +
'    html += \'<div class="explain-text rationale">\' + esc(d.analysis.rationale) + \'</div>\';\n' +
'    html += \'</div></div>\';\n' +
'  }\n' +
'  return html;\n' +
'}\n' +
'\n' +
'function renderSpec() {\n' +
'  if (!specData.spec) return \'<div class="empty">No spec.md yet. Run the writer first.</div>\';\n' +
'  var html = \'<div class="spec-content">\' + esc(specData.spec) + \'</div>\';\n' +
'\n' +
'  // Writ history chain\n' +
'  if (specData.writChain && specData.writChain.length > 0) {\n' +
'    html += \'<div style="margin-top:12px; background:var(--surface); border:1px solid var(--border); border-radius:8px; overflow:hidden;">\';\n' +
'    html += \'<div style="padding:8px 14px; border-bottom:1px solid var(--border); color:var(--text-dim); font-size:11px; text-transform:uppercase; letter-spacing:0.5px;">Writ History</div>\';\n' +
'    for (var wi = 0; wi < specData.writChain.length; wi++) {\n' +
'      var w = specData.writChain[wi];\n' +
'      var wColor = w.status === "completed" ? "var(--green)" : w.status === "failed" ? "var(--red)" : w.status === "active" ? "var(--yellow)" : w.status === "cancelled" ? "var(--text-dim)" : "var(--cyan)";\n' +
'      var isCurrent = wi === 0;\n' +
'      html += \'<div style="display:flex; align-items:center; gap:10px; padding:8px 14px;\' + (wi > 0 ? " border-top:1px solid var(--border); opacity:0.7;" : "") + \'">\';\n' +
'      if (wi > 0) html += \'<span style="color:var(--text-dim); font-size:11px;">&#8627; retried from</span>\';\n' +
'      if (isCurrent) html += \'<span style="color:var(--text-dim); font-size:11px;">current</span>\';\n' +
'      html += \'<code style="color:var(--cyan); font-size:12px;">\' + esc(w.id) + \'</code>\';\n' +
'      html += \'<span style="color:\' + wColor + \'; font-size:12px; font-weight:500;">\' + esc(w.status) + \'</span>\';\n' +
'      html += \'</div>\';\n' +
'    }\n' +
'    html += \'</div>\';\n' +
'  } else if (specData.writId) {\n' +
'    var ws = specData.writStatus || "unknown";\n' +
'    var wsColor = ws === "completed" ? "var(--green)" : ws === "failed" ? "var(--red)" : ws === "active" ? "var(--yellow)" : "var(--text-dim)";\n' +
'    html += \'<div style="margin-top:12px; padding:10px 14px; background:var(--surface); border:1px solid var(--border); border-radius:8px; display:flex; align-items:center; gap:12px;">\';\n' +
'    html += \'<span style="color:var(--text-dim)">Writ:</span> \';\n' +
'    html += \'<code style="color:var(--cyan)">\' + esc(specData.writId) + \'</code>\';\n' +
'    html += \'<span style="color:\' + wsColor + \'">\' + esc(ws) + \'</span>\';\n' +
'    html += \'</div>\';\n' +
'  }\n' +
'\n' +
'  html += \'<div class="dispatch-form">\';\n' +
'  html += \'<label>Role:</label> <input id="dispatch-role" value="artificer">\';\n' +
'  html += \'<label>Complexity:</label> <input id="dispatch-complexity" placeholder="1 2 3 5 8 13 21" style="width:80px">\';\n' +
'  if (specData.writId) {\n' +
'    html += \'<button class="btn btn-yellow" data-action="dispatch">Redispatch &#8634;</button>\';\n' +
'  } else {\n' +
'    html += \'<button class="btn btn-green" data-action="dispatch">Dispatch &#8594;</button>\';\n' +
'  }\n' +
'  html += \'</div>\';\n' +
'\n' +
'  if (specData.gaps) {\n' +
'    html += \'<div style="margin-top:16px; padding:12px; background:rgba(247,118,142,0.1); border:1px solid var(--red); border-radius:8px;">\';\n' +
'    html += \'<strong style="color:var(--red)">Gaps detected:</strong><pre style="margin-top:8px">\' + esc(specData.gaps) + \'</pre></div>\';\n' +
'  }\n' +
'\n' +
'  return html;\n' +
'}\n' +
'\n' +
'// ── SSE ──\n' +
'function connectSSE(slug) {\n' +
'  cleanup();\n' +
'  evtSource = new EventSource("/api/specs/" + slug + "/events");\n' +
'\n' +
'  evtSource.addEventListener("log", function(e) {\n' +
'    var data = JSON.parse(e.data);\n' +
'    logLines.push(data.line);\n' +
'    if (logLines.length > 500) logLines.shift();\n' +
'    var logEl = document.getElementById("log-area");\n' +
'    if (logEl) {\n' +
'      var cls = data.line.indexOf("[stderr]") === 0 ? " stderr" : "";\n' +
'      logEl.innerHTML += \'<div class="log-line\' + cls + \'">\' + esc(data.line) + \'</div>\';\n' +
'      logEl.scrollTop = logEl.scrollHeight;\n' +
'    }\n' +
'  });\n' +
'\n' +
'  evtSource.addEventListener("meta", function(e) {\n' +
'    var data = JSON.parse(e.data);\n' +
'    if (data.writId && specData) {\n' +
'      specData.writId = data.writId;\n' +
'      specData.writStatus = "ready";\n' +
'    }\n' +
'  });\n' +
'\n' +
'  evtSource.addEventListener("status", function(e) {\n' +
'    var data = JSON.parse(e.data);\n' +
'    if (data.state === "complete" || data.state === "failed") {\n' +
'      // Refresh data\n' +
'      api("GET", "/specs/" + slug).then(function(d) {\n' +
'        specData = d;\n' +
'        renderDetail();\n' +
'      });\n' +
'    } else {\n' +
'      specData.runningStep = data.step;\n' +
'      if (currentTab === "pipeline") {\n' +
'        renderDetail();\n' +
'      }\n' +
'    }\n' +
'  });\n' +
'}\n' +
'\n' +
'function cleanup() {\n' +
'  if (evtSource) { evtSource.close(); evtSource = null; }\n' +
'  if (elapsedTimer) { clearInterval(elapsedTimer); elapsedTimer = null; }\n' +
'}\n' +
'\n' +
'function startElapsedTimer() {\n' +
'  if (elapsedTimer) clearInterval(elapsedTimer);\n' +
'  if (!specData.runningStep) return;\n' +
'  var startTime = specData.runningElapsed ? (Date.now() - specData.runningElapsed * 1000) : Date.now();\n' +
'  elapsedTimer = setInterval(function() {\n' +
'    var el = document.getElementById("elapsed-val");\n' +
'    if (el) el.textContent = Math.floor((Date.now() - startTime) / 1000);\n' +
'  }, 1000);\n' +
'}\n' +
'\n' +
'// ── Event delegation ──\n' +
'document.addEventListener("click", function(e) {\n' +
'  var target = e.target.closest("[data-action]");\n' +
'  if (!target) return;\n' +
'  var action = target.dataset.action;\n' +
'\n' +
'  if (action === "create-spec") {\n' +
'    var brief = document.getElementById("new-brief").value.trim();\n' +
'    var slug = document.getElementById("new-slug").value.trim();\n' +
'    var codex = document.getElementById("new-codex").value.trim();\n' +
'    var linkType = document.getElementById("new-link-type").value.trim();\n' +
'    var linkWrit = document.getElementById("new-link-writ").value.trim();\n' +
'    if (!brief) return;\n' +
'    if (!codex) { alert("Codex is required"); return; }\n' +
'    // If one link field is filled, both are required\n' +
'    if ((linkType && !linkWrit) || (!linkType && linkWrit)) {\n' +
'      alert("Link requires both a type and a writ ID"); return;\n' +
'    }\n' +
'    var payload = { brief: brief, slug: slug, codex: codex };\n' +
'    if (linkType && linkWrit) {\n' +
'      payload.link = { type: linkType, targetId: linkWrit };\n' +
'    }\n' +
'    api("POST", "/specs", payload).then(function(result) {\n' +
'      if (result.error) { alert(result.error); return; }\n' +
'      if (result.slug) { location.hash = "#/" + result.slug; }\n' +
'    });\n' +
'  }\n' +
'\n' +
'  else if (action === "open-spec") {\n' +
'    location.hash = "#/" + target.dataset.slug;\n' +
'  }\n' +
'\n' +
'  else if (action === "switch-tab") {\n' +
'    currentTab = target.dataset.tab;\n' +
'    renderDetail();\n' +
'  }\n' +
'\n' +
'  else if (action === "run-step") {\n' +
'    logLines = [];\n' +
'    api("POST", "/specs/" + currentSlug + "/pipeline/" + target.dataset.step).then(function() {\n' +
'      api("GET", "/specs/" + currentSlug).then(function(d) {\n' +
'        specData = d;\n' +
'        currentTab = "pipeline";\n' +
'        renderDetail();\n' +
'      });\n' +
'    });\n' +
'  }\n' +
'\n' +
'  else if (action === "toggle-scope") {\n' +
'    var idx = parseInt(target.dataset.index, 10);\n' +
'    var s = specData.scope.scope[idx];\n' +
'    s.included = !s.included;\n' +
'    api("PATCH", "/specs/" + currentSlug + "/scope", { id: s.id, included: s.included }).then(function() {\n' +
'      renderDetail();\n' +
'    });\n' +
'  }\n' +
'\n' +
'  else if (action === "select-option") {\n' +
'    var did = target.dataset.decision;\n' +
'    var opt = target.dataset.option;\n' +
'    var dec = specData.decisions.decisions.find(function(x) { return x.id === did; });\n' +
'    if (dec) {\n' +
'      dec.selected = opt;\n' +
'      delete dec.patron_override;\n' +
'      api("PATCH", "/specs/" + currentSlug + "/decision", { id: did, selected: opt }).then(function() {\n' +
'        renderDetail();\n' +
'      });\n' +
'    }\n' +
'  }\n' +
'\n' +
'  else if (action === "toggle-amendment") {\n' +
'    var body = document.getElementById("amendment-body");\n' +
'    var isOpen = body.style.display !== "none";\n' +
'    body.style.display = isOpen ? "none" : "block";\n' +
'    target.innerHTML = isOpen ? "&#9656; Amend analysis" : "&#9662; Amend analysis";\n' +
'    target.classList.toggle("open", !isOpen);\n' +
'  }\n' +
'\n' +
'  else if (action === "submit-amendment") {\n' +
'    var text = document.getElementById("amendment-text").value.trim();\n' +
'    if (!text) { alert("Write your amendment first"); return; }\n' +
'    logLines = [];\n' +
'    api("POST", "/specs/" + currentSlug + "/pipeline/analyst-revise", { amendment: text }).then(function() {\n' +
'      api("GET", "/specs/" + currentSlug).then(function(d) {\n' +
'        specData = d;\n' +
'        currentTab = "pipeline";\n' +
'        renderDetail();\n' +
'      });\n' +
'    });\n' +
'  }\n' +
'\n' +
'  else if (action === "toggle-explain") {\n' +
'    var content = target.nextElementSibling;\n' +
'    var isVisible = content.classList.toggle("visible");\n' +
'    target.innerHTML = isVisible ? "&#9662; explain" : "&#9656; explain";\n' +
'  }\n' +
'\n' +
'  else if (action === "toggle-filter") {\n' +
'    var cat = target.dataset.cat;\n' +
'    filters[cat] = !filters[cat];\n' +
'    target.classList.toggle("on", filters[cat]);\n' +
'    renderDetail();\n' +
'  }\n' +
'\n' +
'  else if (action === "dispatch") {\n' +
'    var role = document.getElementById("dispatch-role").value.trim();\n' +
'    var complexity = document.getElementById("dispatch-complexity").value.trim();\n' +
'    target.disabled = true;\n' +
'    target.textContent = "Dispatching...";\n' +
'    target.classList.remove("btn-green");\n' +
'    target.classList.add("btn-dim");\n' +
'    api("POST", "/specs/" + currentSlug + "/dispatch", { role: role, complexity: complexity }).then(function(r) {\n' +
'      if (r.error) {\n' +
'        alert("Dispatch failed: " + r.error);\n' +
'        target.disabled = false;\n' +
'        target.textContent = "Dispatch";\n' +
'        target.classList.remove("btn-dim");\n' +
'        target.classList.add("btn-green");\n' +
'      }\n' +
'    });\n' +
'  }\n' +
'});\n' +
'\n' +
'document.addEventListener("keydown", function(e) {\n' +
'  if (e.key !== "Enter") return;\n' +
'  var target = e.target;\n' +
'  if (target.dataset && target.dataset.action === "custom-input") {\n' +
'    var value = target.value.trim();\n' +
'    if (!value) return;\n' +
'    var did = target.dataset.decision;\n' +
'    var dec = specData.decisions.decisions.find(function(x) { return x.id === did; });\n' +
'    if (dec) {\n' +
'      dec.selected = "custom";\n' +
'      dec.patron_override = value;\n' +
'      api("PATCH", "/specs/" + currentSlug + "/decision", { id: did, selected: "custom", patron_override: value }).then(function() {\n' +
'        renderDetail();\n' +
'      });\n' +
'    }\n' +
'  }\n' +
'});\n' +
'\n' +
'function esc(s) {\n' +
'  if (!s) return "";\n' +
'  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");\n' +
'}\n' +
'function escAttr(s) {\n' +
'  if (!s) return "";\n' +
'  return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");\n' +
'}\n' +
'\n' +
'route();\n' +
'</script></body></html>';
