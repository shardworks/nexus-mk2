/**
 * lab.claude-session — quick (Animator-backed) engine for claude-direct
 * trials.
 *
 * Spawns a claude session against a freshly-cloned codex working dir,
 * with a role file as the system prompt and a brief (file or template
 * string) as the work prompt. The session's cost / token / output / etc.
 * land in the lab guild's `animator/sessions` book exactly like any other
 * Animator-driven session — no custom per-trial book.
 *
 * Used by claude-direct trial templates as the per-stage work primitive.
 * One stage = one engine instance with its own (rolePath, prompt, model)
 * triple. Multiple stages (implement → review → revise) compose via the
 * usual rig template DAG; the conditional `when` field on RigTemplateEngine
 * gates revise on `${yields.review.passed}`.
 *
 * GIVENS
 * ──────
 *   rolePath        : string (abs)  — required. Read as the session's
 *                                     `--system-prompt-file` content.
 *   briefPath       : string (abs)? — optional. File whose contents
 *                                     become the work prompt. One of
 *                                     briefPath / promptTemplate is
 *                                     required.
 *   promptTemplate  : string?       — optional. Inline work prompt; the
 *                                     spider has already resolved
 *                                     ${yields.X} / ${writ} references in
 *                                     this string by the time run() sees
 *                                     it. Use this for review/revise
 *                                     stages whose prompts cite upstream
 *                                     stages' outputs.
 *   model           : string        — required. Claude model id (`opus`,
 *                                     `sonnet`, etc.). Set on the
 *                                     synthesized AnimaWeave; the
 *                                     claude-code provider passes it via
 *                                     `--model`.
 *   cwd             : string (abs)  — required. The codex working dir.
 *   executionWrap   : enum?         — optional, default 'production'.
 *                                       `production` appends an EPILOGUE
 *                                       string matching @shardworks/spider
 *                                       implement.ts's EXECUTION_EPILOGUE
 *                                       (kept in sync by hand — see
 *                                       PRODUCTION_EXECUTION_EPILOGUE
 *                                       below). `bare` runs role + prompt
 *                                       alone, for "what does the role
 *                                       file alone do" experiments.
 *   outputContract  : enum?         — optional. When set to
 *                                       'review-pass-concerns', collect()
 *                                       parses the session's final
 *                                       assistant text for a leading
 *                                       `REVIEW: PASS` / `REVIEW: CONCERNS`
 *                                       marker and yields
 *                                       `{ passed: bool, concerns: string }`.
 *   environment     : object?       — optional. Extra env vars merged
 *                                       into the session's environment.
 *   writ            : WritDoc       — required (Spider injects via
 *                                       `${writ}`). The trial writ; used
 *                                       to stamp `metadata.trialId`.
 *
 * YIELDS (default)
 * ────────────────
 *   {
 *     sessionId:    string,
 *     status:       string,
 *     exitCode:     number,
 *     costUsd:      number?,
 *     tokenUsage:   TokenUsage?,
 *     durationMs:   number?,
 *     output:       string?,        // final assistant text (verbatim)
 *   }
 *
 * YIELDS (with `outputContract: 'review-pass-concerns'`)
 * ──────────────────────────────────────────────────────
 *   default fields plus:
 *   {
 *     passed:   boolean,           // true iff `REVIEW: PASS` matched
 *     concerns: string,            // trimmed body after `REVIEW: CONCERNS`,
 *                                  // or '' on PASS / unparseable
 *   }
 *
 * NO MCP TOOLS BY DESIGN
 * ──────────────────────
 * The synthesized AnimaWeave has `tools: undefined`. The claude-code
 * provider's babysitter still spawns its own MCP proxy for guild HTTP
 * routing, but with no authorized tools the proxy serves nothing.
 * `--strict-mcp-config` keeps claude bound to native tools (Read, Write,
 * Edit, Bash, Grep, Glob, etc.). This matches the experiment family
 * (X018/X019/X020/X021/X022) where MCP tool usage is empirically near-
 * zero. Future experiments that need MCP-served lab tools should run on
 * the xguild trial doctype instead.
 */

import { readFile } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { guild } from '@shardworks/nexus-core';
import type {
  EngineDesign,
  EngineRunContext,
  EngineRunResult,
} from '@shardworks/fabricator-apparatus';
import type { AnimatorApi, SessionDoc } from '@shardworks/animator-apparatus';
import type { AnimaWeave } from '@shardworks/loom-apparatus';
import type { StacksApi } from '@shardworks/stacks-apparatus';
import type { WritDoc } from '@shardworks/clerk-apparatus';

// ── Production-fidelity execution wrap ───────────────────────────────

/**
 * Mirror of @shardworks/spider-apparatus's `implement.ts` EXECUTION_EPILOGUE
 * as of framework v0.1.304. This string is appended to the work prompt
 * when `executionWrap: 'production'` (the default) — preserves
 * production-shape behavioural hints in the prompt so claude-direct
 * trials measure the same surface production rigs measure, minus the
 * sub-guild orchestration.
 *
 * MAINTENANCE: when the production EPILOGUE evolves, update this string.
 * No automated sync — the framework doesn't re-export the constant at the
 * package level. Drift is a production-fidelity bug; surface it in trial
 * runlogs when it matters.
 *
 * Source: nexus/packages/plugins/spider/src/engines/implement.ts.
 */
const PRODUCTION_EXECUTION_EPILOGUE = `
If the specification above contains a <task-manifest>, follow these execution rules:

1. Work through tasks in the order listed (t1, t2, t3, …).
2. After completing each task, run its <verify> command and confirm the <done> criterion is met before moving on.
3. Commit after each task (or after a logical group of tightly-coupled tasks).
4. The <files> element in each task is the planner's predicted blast radius — useful for orientation, but verify scope independently. Do not limit your changes to only the listed files.
5. If a task reveals additional work not covered by the manifest, do it inline before proceeding to the next task.

Commit all changes before ending your session.`;

// ── Givens validation ───────────────────────────────────────────────

interface ClaudeSessionGivens {
  rolePath: string;
  briefPath?: string;
  promptTemplate?: string;
  model: string;
  cwd: string;
  executionWrap: 'production' | 'bare';
  outputContract?: 'review-pass-concerns';
  environment?: Record<string, string>;
  writ: WritDoc;
}

function validateGivens(givens: Record<string, unknown>): ClaudeSessionGivens {
  const rolePath = givens.rolePath;
  if (typeof rolePath !== 'string' || !isAbsolute(rolePath)) {
    throw new Error(
      `lab.claude-session: givens.rolePath must be an absolute path (got ${JSON.stringify(rolePath)})`,
    );
  }

  const briefPath = givens.briefPath;
  const promptTemplate = givens.promptTemplate;
  if (briefPath === undefined && promptTemplate === undefined) {
    throw new Error(
      `lab.claude-session: one of givens.briefPath or givens.promptTemplate is required`,
    );
  }
  if (briefPath !== undefined && (typeof briefPath !== 'string' || !isAbsolute(briefPath))) {
    throw new Error(
      `lab.claude-session: givens.briefPath must be an absolute path when provided ` +
        `(got ${JSON.stringify(briefPath)})`,
    );
  }
  if (promptTemplate !== undefined && typeof promptTemplate !== 'string') {
    throw new Error(
      `lab.claude-session: givens.promptTemplate must be a string when provided ` +
        `(got ${JSON.stringify(promptTemplate)})`,
    );
  }

  const model = givens.model;
  if (typeof model !== 'string' || model.trim() === '') {
    throw new Error(
      `lab.claude-session: givens.model must be a non-empty string (got ${JSON.stringify(model)})`,
    );
  }

  const cwd = givens.cwd;
  if (typeof cwd !== 'string' || !isAbsolute(cwd)) {
    throw new Error(
      `lab.claude-session: givens.cwd must be an absolute path (got ${JSON.stringify(cwd)})`,
    );
  }

  const wrapRaw = givens.executionWrap;
  let executionWrap: 'production' | 'bare' = 'production';
  if (wrapRaw !== undefined) {
    if (wrapRaw !== 'production' && wrapRaw !== 'bare') {
      throw new Error(
        `lab.claude-session: givens.executionWrap must be 'production' or 'bare' ` +
          `(got ${JSON.stringify(wrapRaw)})`,
      );
    }
    executionWrap = wrapRaw;
  }

  const contractRaw = givens.outputContract;
  let outputContract: 'review-pass-concerns' | undefined;
  if (contractRaw !== undefined) {
    if (contractRaw !== 'review-pass-concerns') {
      throw new Error(
        `lab.claude-session: givens.outputContract must be 'review-pass-concerns' or omitted ` +
          `(got ${JSON.stringify(contractRaw)})`,
      );
    }
    outputContract = contractRaw;
  }

  const environment = givens.environment;
  if (
    environment !== undefined &&
    (typeof environment !== 'object' ||
      environment === null ||
      Array.isArray(environment))
  ) {
    throw new Error(
      `lab.claude-session: givens.environment must be a plain object when provided ` +
        `(got ${JSON.stringify(environment)})`,
    );
  }

  const writ = givens.writ;
  if (typeof writ !== 'object' || writ === null || typeof (writ as WritDoc).id !== 'string') {
    throw new Error(
      `lab.claude-session: givens.writ must be the trial WritDoc (with .id). ` +
        `Set givens.writ to '\${writ}' in your rig template.`,
    );
  }

  return {
    rolePath,
    ...(briefPath !== undefined ? { briefPath } : {}),
    ...(promptTemplate !== undefined ? { promptTemplate } : {}),
    model,
    cwd,
    executionWrap,
    ...(outputContract !== undefined ? { outputContract } : {}),
    ...(environment !== undefined ? { environment: environment as Record<string, string> } : {}),
    writ: writ as WritDoc,
  };
}

// ── Output-contract parsing ─────────────────────────────────────────

/**
 * Parse a reviewer session's final assistant text for the
 * REVIEW: PASS / REVIEW: CONCERNS contract.
 *
 * Convention (set by the rig template's reviewer prompt):
 *   - A line containing `REVIEW: PASS` (case-insensitive, at line start)
 *     anywhere in the output → passed=true.
 *   - Otherwise, a line containing `REVIEW: CONCERNS` anywhere in the
 *     output → passed=false; concerns body is everything after the
 *     marker line through end of output, trimmed.
 *   - Neither marker found → passed=false; full output is the concerns
 *     body. (Conservative default — a wasted revise pass beats a false
 *     PASS that hides a quality regression.)
 *
 * Scanning the whole output (rather than only the first line) matches
 * production's reviewer parser shape — `^###\s*Overall:\s*PASS` with `m`
 * flag in @shardworks/spider-apparatus's review.ts. Reviewers naturally
 * put the verdict marker at the end of their message after explaining
 * their checks; insisting on a leading-line marker rejects that shape
 * and produces false-CONCERNS.
 *
 * If the same output contains both markers (shouldn't happen by the
 * contract, but a confused reviewer might emit both), PASS wins —
 * pulling the trigger on revise based on contradictory signals is
 * worse than letting a confused PASS through verify.
 */
export function parseReviewOutput(output: string): { passed: boolean; concerns: string } {
  const passRe = /^[ \t]*REVIEW:\s*PASS\b/im;
  const concernsRe = /^[ \t]*REVIEW:\s*CONCERNS\b.*$/im;
  if (passRe.test(output)) {
    return { passed: true, concerns: '' };
  }
  const concernsMatch = output.match(concernsRe);
  if (concernsMatch && concernsMatch.index !== undefined) {
    const after = output.slice(concernsMatch.index + concernsMatch[0].length);
    return { passed: false, concerns: after.trim() };
  }
  // Unparseable — treat as concerns and forward the full output.
  return { passed: false, concerns: output.trim() };
}

// ── Engine ──────────────────────────────────────────────────────────

export const claudeSessionEngine: EngineDesign = {
  id: 'lab.claude-session',

  async run(givens, context: EngineRunContext): Promise<EngineRunResult> {
    const v = validateGivens(givens);

    // 1. Read role file → systemPrompt.
    const systemPrompt = await readFile(v.rolePath, 'utf8');

    // 2. Resolve work prompt source.
    let workPrompt: string;
    if (v.promptTemplate !== undefined) {
      workPrompt = v.promptTemplate;
    } else {
      workPrompt = await readFile(v.briefPath!, 'utf8');
    }

    // 3. Apply executionWrap.
    if (v.executionWrap === 'production') {
      workPrompt = `${workPrompt}\n${PRODUCTION_EXECUTION_EPILOGUE}`;
    }

    // 4. Synthesize a tools-free AnimaWeave directly — bypasses the Loom.
    //    The claude-code provider reads systemPrompt and model from the
    //    weave; absent tools means no MCP tool authorizations.
    const weave: AnimaWeave = {
      systemPrompt,
      model: v.model,
      // tools: undefined  — explicit absence; native claude tools only.
      // environment: undefined — task-layer env handled below.
    };

    // 5. Launch via Animator.animate (low-level entry; we composed the weave).
    const animator = guild().apparatus<AnimatorApi>('animator');
    const handle = animator.animate({
      context: weave,
      prompt: workPrompt,
      cwd: v.cwd,
      ...(v.environment ? { environment: v.environment } : {}),
      metadata: {
        engineId: context.engineId,
        trialId: v.writ.id,
        stage: context.engineId,
        provider: 'lab.claude-session',
      },
    });

    return { status: 'launched', sessionId: handle.sessionId };
  },

  async collect(sessionId, givens, context): Promise<unknown> {
    const stacks = guild().apparatus<StacksApi>('stacks');
    const sessionsBook = stacks.readBook<SessionDoc>('animator', 'sessions');
    const session = await sessionsBook.get(sessionId);
    if (!session) {
      throw new Error(
        `lab.claude-session.collect: session ${sessionId} not found in animator/sessions ` +
          `(engineId=${context.engineId})`,
      );
    }

    // Stamp trial metadata via raw write-through put if missing.
    //
    // Animator's dispatchAnimate races recordRunning (which carries
    // request.metadata) against the babysitter's terminal session-record
    // write — when a session terminates faster than processInfoPromise
    // resolves (observed in reviewer sessions at ~3.5s), the terminal
    // write lands first and the reducer's terminal-immutability rule
    // no-ops the metadata merge. Result: short sessions in
    // animator/sessions have no metadata field, and the trial-sessions
    // probe's metadata.trialId filter misses them.
    //
    // Workaround until the framework race is fixed
    // (sanctum click c-movszemq): on collect — which runs only after
    // the session has terminated — re-stamp metadata via raw `put`
    // (bypassing reduceSessionTransition's terminal-immutability).
    // The probe filter then catches the row.
    const writ = givens.writ as WritDoc | undefined;
    const expectedMetadata = {
      engineId: context.engineId,
      trialId: writ?.id,
      stage: context.engineId,
      provider: 'lab.claude-session',
    } as const;
    if (writ && (!session.metadata || (session.metadata as Record<string, unknown>).trialId !== writ.id)) {
      const writableSessions = stacks.book<SessionDoc>('animator', 'sessions');
      const existingMetadata = (session.metadata ?? {}) as Record<string, unknown>;
      await writableSessions.put({
        ...session,
        metadata: { ...existingMetadata, ...expectedMetadata },
      });
    }

    const base = {
      sessionId,
      status: session.status,
      ...(session.exitCode !== undefined ? { exitCode: session.exitCode } : {}),
      ...(session.costUsd !== undefined ? { costUsd: session.costUsd } : {}),
      ...(session.tokenUsage !== undefined ? { tokenUsage: session.tokenUsage } : {}),
      ...(session.durationMs !== undefined ? { durationMs: session.durationMs } : {}),
      ...(session.output !== undefined ? { output: session.output } : {}),
    };

    // Parse output contract if requested.
    const contractRaw = givens.outputContract;
    if (contractRaw === 'review-pass-concerns') {
      const parsed = parseReviewOutput(session.output ?? '');
      return { ...base, passed: parsed.passed, concerns: parsed.concerns };
    }

    return base;
  },
};

export default claudeSessionEngine;
