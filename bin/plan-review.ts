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

// Ensure specs dir exists
if (!fs.existsSync(SPECS_DIR)) fs.mkdirSync(SPECS_DIR, { recursive: true });

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
  writId?: string;
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

function runPipelineStep(slug: string, step: string, args: string[], prompt: string): void {
  if (running.has(slug)) {
    console.log('[workshop] Already running a step for ' + slug);
    return;
  }

  const cliArgs = [
    '--agent', 'plan-' + step,
    '--print',
    '--dangerously-skip-permissions',
    '--max-budget-usd', step === 'writer' ? '5' : '3',
    ...args,
    prompt,
  ];

  console.log('[workshop] Starting ' + step + ' for ' + slug);

  const proc = spawn('claude', cliArgs, {
    cwd: PROJECT_ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

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

    // Auto-chain: reader → analyst
    if (code === 0 && step === 'reader') {
      const brief = readSpecFile(slug, 'brief.md') ?? '';
      console.log('[workshop] Auto-starting analyst for ' + slug);
      startAnalyst(slug, brief.trim());
    }
  });
}

function startReader(slug: string, brief: string): void {
  // Pre-create session ID for forking
  const sessionId = crypto.randomUUID();
  const meta = readMeta(slug);
  meta.sessionId = sessionId;
  writeMeta(slug, meta);

  runPipelineStep(slug, 'reader', ['--session-id', sessionId],
    'Brief: ' + brief + '\n\nSlug: ' + slug);
}

function startAnalyst(slug: string, brief: string): void {
  const meta = readMeta(slug);
  const sessionId = meta.sessionId ?? '';

  const args = sessionId ? ['--resume', sessionId, '--fork-session'] : [];

  runPipelineStep(slug, 'analyst', args,
    'Brief: ' + brief + '\n\nSlug: ' + slug + '\n\nThe inventory has been written to specs/' + slug + '/inventory.md. Produce scope and decisions.');
}

function startWriter(slug: string, brief: string): void {
  const meta = readMeta(slug);
  const sessionId = meta.sessionId ?? '';

  const args = sessionId ? ['--resume', sessionId, '--fork-session'] : [];

  runPipelineStep(slug, 'writer', args,
    'Brief: ' + brief + '\n\nSlug: ' + slug + '\n\nThe analyst has written scope.yaml and decisions.yaml in specs/' + slug + '/, and the patron has reviewed and locked them. Read those files plus inventory.md, then produce the spec.');
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

      if (!slug || !brief) return jsonResponse(res, { error: 'brief and slug required' }, 400);

      const dir = path.join(SPECS_DIR, slug);
      if (fs.existsSync(dir)) return jsonResponse(res, { error: 'spec already exists' }, 409);

      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'brief.md'), brief + '\n');
      writeMeta(slug, { createdAt: new Date().toISOString() });

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
      const prevWritId = readMeta(slug).writId ?? null;

      const commissionScript = path.join(PROJECT_ROOT, 'bin', 'commission.sh');
      const codex = body.codex || '';
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

        sendSSE(slug, 'status', { step: 'dispatch', state: code === 0 ? 'complete' : 'failed', elapsed, code });
      });
      return;
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
'.new-spec input { flex: 1; padding: 8px 12px; background: var(--bg); border: 1px solid var(--border);\n' +
'  border-radius: 6px; color: var(--text); font-family: inherit; font-size: 13px; outline: none; }\n' +
'.new-spec input:focus { border-color: var(--cyan); }\n' +
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
'api("GET", "/codexes").then(function(c) { codexList = c || []; });\n' +
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
'    html += \'<button class="btn btn-primary" data-action="create-spec">Start Pipeline &#8594;</button>\';\n' +
'    html += \'</div></div>\';\n' +
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
'  // Populate codex dropdown\n' +
'  var codexEl = document.getElementById("dispatch-codex");\n' +
'  if (codexEl && codexList.length > 0) {\n' +
'    var defaultVal = codexList.length === 1 ? codexList[0] : "";\n' +
'    codexEl.innerHTML = codexList.length === 1 ? "" : \'<option value="">-- select --</option>\';\n' +
'    for (var ci = 0; ci < codexList.length; ci++) {\n' +
'      var sel = codexList[ci] === defaultVal ? " selected" : "";\n' +
'      codexEl.innerHTML += \'<option value="\' + codexList[ci] + \'"\' + sel + \'>\' + codexList[ci] + \'</option>\';\n' +
'    }\n' +
'  }\n' +
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
'  return html;\n' +
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
'  html += \'<label>Codex:</label> <select id="dispatch-codex"><option value="">-- select --</option></select>\';\n' +
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
'    if (!brief) return;\n' +
'    api("POST", "/specs", { brief: brief, slug: slug }).then(function(result) {\n' +
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
'    var codex = document.getElementById("dispatch-codex").value.trim();\n' +
'    var role = document.getElementById("dispatch-role").value.trim();\n' +
'    var complexity = document.getElementById("dispatch-complexity").value.trim();\n' +
'    if (!codex) { alert("Codex is required"); return; }\n' +
'    target.disabled = true;\n' +
'    target.textContent = "Dispatching...";\n' +
'    target.classList.remove("btn-green");\n' +
'    target.classList.add("btn-dim");\n' +
'    api("POST", "/specs/" + currentSlug + "/dispatch", { codex: codex, role: role, complexity: complexity }).then(function(r) {\n' +
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
