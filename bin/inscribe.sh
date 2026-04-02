#!/usr/bin/env bash
# bin/inscribe.sh — Orchestrate a full inscription cycle
#
# Opens a draft binding on a codex, summons an anima (weaving its
# identity via the Loom), runs the session in the draft's worktree,
# then seals and pushes the binding. All operations go through the
# guild's apparatus APIs — Scriptorium, Loom, and Animator.
#
# Usage:
#   ./bin/inscribe.sh --codex <codex> --role <role> [--branch <branch>] \
#                     [--guild-path <path>] -- 'prompt'
#
# Arguments:
#   --codex       Name of a registered codex (must be added via codex-add)
#   --role        Anima role to summon (e.g. artificer, scribe)
#   --branch      Optional branch name for the draft (default: auto-generated)
#   --guild-path  Guild root directory (default: /workspace/vibers)
#   -- 'prompt'   Work prompt passed to the anima (everything after --)
#
# Lifecycle:
#   1. Boot the guild via Arbor (createGuild)
#   2. Open a draft binding on the codex (Scriptorium.openDraft)
#   3. Summon the anima — weave identity context via the Loom, launch
#      session in the draft's worktree (Animator.summon)
#   4. Seal the draft into the codex's sealed binding (Scriptorium.seal)
#   5. Push the sealed binding to the remote (Scriptorium.push)
#
# Environment:
#   NSG_DRY_RUN — if set, print the plan without executing
#
# Exit codes:
#   0 — full cycle completed
#   1 — usage error or missing arguments
#   2 — guild bootstrap failed
#   3 — draft open failed
#   4 — summon/session failed (draft left open for inspection)
#   5 — seal failed (draft left open; may need manual reconciliation)
#   6 — push failed (sealed locally but not pushed)
#   7 — session produced no commits (draft left open for inspection)

set -euo pipefail

# ── Parse arguments ───────────────────────────────────────────

CODEX=""
ROLE=""
BRANCH=""
GUILD_PATH="/workspace/vibers"
PROMPT=""
ALLOW_NO_COMMITS=false

show_help() {
  cat <<'HELP'
inscribe — orchestrate a full inscription cycle

Usage:
  inscribe.sh --codex <codex> --role <role> [options] -- 'prompt'

Required:
  --codex <name>       Registered codex name
  --role <role>        Anima role to summon (e.g. artificer, scribe)
  -- 'prompt'          Work prompt for the anima

Options:
  --branch <name>        Draft branch name (default: auto-generated)
  --guild-path <path>    Guild root directory (default: /workspace/vibers)
  --allow-no-commits     Don't fail if the session produces no commits
  -h, --help             Show this help

Lifecycle:
  1. Boots the guild (Arbor)
  2. Opens a draft binding (Scriptorium)
  3. Summons the anima — weaves context via the Loom, launches session
     in the draft worktree (Animator)
  4. Seals the draft (Scriptorium)
  5. Pushes to remote (Scriptorium)
HELP
}

if [[ $# -eq 0 ]]; then
  show_help
  exit 0
fi

while [[ $# -gt 0 ]]; do
  case "$1" in
    --codex)
      CODEX="${2:-}"
      [[ -z "$CODEX" ]] && { echo "Error: --codex requires a value" >&2; exit 1; }
      shift 2
      ;;
    --role)
      ROLE="${2:-}"
      [[ -z "$ROLE" ]] && { echo "Error: --role requires a value" >&2; exit 1; }
      shift 2
      ;;
    --branch)
      BRANCH="${2:-}"
      [[ -z "$BRANCH" ]] && { echo "Error: --branch requires a value" >&2; exit 1; }
      shift 2
      ;;
    --guild-path)
      GUILD_PATH="${2:-}"
      [[ -z "$GUILD_PATH" ]] && { echo "Error: --guild-path requires a value" >&2; exit 1; }
      shift 2
      ;;
    --allow-no-commits)
      ALLOW_NO_COMMITS=true
      shift
      ;;
    -h|--help)
      show_help
      exit 0
      ;;
    --)
      shift
      PROMPT="$*"
      break
      ;;
    *)
      echo "Error: unknown option '$1'" >&2
      echo "Run 'inscribe.sh --help' for usage." >&2
      exit 1
      ;;
  esac
done

# ── Validate ──────────────────────────────────────────────────

if [[ -z "$CODEX" ]]; then
  echo "Error: --codex is required" >&2
  exit 1
fi

if [[ -z "$ROLE" ]]; then
  echo "Error: --role is required" >&2
  exit 1
fi

if [[ -z "$PROMPT" ]]; then
  echo "Error: work prompt is required (pass after --)" >&2
  exit 1
fi

# ── Dry run ───────────────────────────────────────────────────

if [[ -n "${NSG_DRY_RUN:-}" ]]; then
  echo "[inscribe] dry run"
  echo "  guild:  $GUILD_PATH"
  echo "  codex:  $CODEX"
  echo "  role:   $ROLE"
  echo "  branch: ${BRANCH:-<auto>}"
  echo "  prompt: $PROMPT"
  echo "  allow-no-commits: $ALLOW_NO_COMMITS"
  echo ""
  echo "  1. createGuild('$GUILD_PATH')"
  echo "  2. scriptorium.openDraft({ codexName: '$CODEX'${BRANCH:+, branch: '$BRANCH'} })"
  echo "  3. animator.summon({ role: '$ROLE', prompt: '...', cwd: <draft-path> })"
  echo "  4. scriptorium.seal({ codexName: '$CODEX', sourceBranch: <draft-branch> })"
  echo "  5. scriptorium.push({ codexName: '$CODEX' })"
  exit 0
fi

# ── Execute ───────────────────────────────────────────────────

log() { echo "[inscribe] $*"; }
err() { echo "[inscribe] ERROR: $*" >&2; }

log "Starting inscription cycle"
log "  guild=$GUILD_PATH codex=$CODEX role=$ROLE branch=${BRANCH:-<auto>}"

# Escape strings for safe embedding in JS template literal.
# Replaces \ → \\, backtick → \`, and $ → \$ to prevent injection.
js_escape() {
  local s="$1"
  s="${s//\\/\\\\}"
  s="${s//\`/\\\`}"
  s="${s//\$/\\\$}"
  echo "$s"
}

CODEX_ESC=$(js_escape "$CODEX")
ROLE_ESC=$(js_escape "$ROLE")
BRANCH_ESC=$(js_escape "$BRANCH")
PROMPT_ESC=$(js_escape "$PROMPT")
GUILD_PATH_ESC=$(js_escape "$GUILD_PATH")
ALLOW_NO_COMMITS_ESC="$ALLOW_NO_COMMITS"

exec node --disable-warning=ExperimentalWarning --experimental-transform-types -e "
// Import arbor by filesystem path — this script runs from the sanctum,
// which doesn't have framework packages in its node_modules. The guild's
// node_modules provides plugin resolution; arbor is in the framework.
const ARBOR_PATH = '/workspace/nexus/packages/framework/arbor/src/index.ts';

const guildPath      = \`$GUILD_PATH_ESC\`;
const codex          = \`$CODEX_ESC\`;
const role           = \`$ROLE_ESC\`;
const branch         = \`$BRANCH_ESC\` || undefined;
const prompt         = \`$PROMPT_ESC\`;
const allowNoCommits = $ALLOW_NO_COMMITS_ESC === 'true';

const log = (msg) => console.log('[inscribe] ' + msg);
const err = (msg) => console.error('[inscribe] ERROR: ' + msg);

async function main() {
  // ── Phase 1: Boot guild ──────────────────────────────────
  log('Booting guild...');
  const { createGuild } = await import(ARBOR_PATH);
  const guild = await createGuild(guildPath);
  log('Guild booted: ' + guild.home);

  // ── Phase 2: Open draft ──────────────────────────────────
  log('Opening draft on codex \"' + codex + '\"...');
  const scriptorium = guild.apparatus('codexes');
  const draft = await scriptorium.openDraft({
    codexName: codex,
    ...(branch ? { branch } : {}),
  });
  log('Draft opened: branch=' + draft.branch + ' path=' + draft.path);

  // Record the draft's starting ref so we can detect if the session adds commits.
  const { execFileSync } = await import('node:child_process');
  const draftStartRef = execFileSync(
    'git', ['rev-parse', 'HEAD'],
    { cwd: draft.path, encoding: 'utf-8' },
  ).trim();
  log('Draft start ref: ' + draftStartRef.slice(0, 12));

  // ── Phase 3: Summon ──────────────────────────────────────
  log('Summoning anima (role=' + role + ') in draft worktree...');
  const animator = guild.apparatus('animator');
  const handle = animator.summon({
    role,
    prompt,
    cwd: draft.path,
  });

  // Stream output chunks to stderr for visibility
  for await (const chunk of handle.chunks) {
    if (chunk.type === 'text') {
      process.stderr.write(chunk.text);
    }
  }

  const session = await handle.result;
  log('Session completed: id=' + session.id + ' status=' + session.status +
      ' duration=' + session.durationMs + 'ms' +
      (session.costUsd ? ' cost=\$' + session.costUsd.toFixed(4) : ''));

  if (session.status !== 'completed') {
    err('Session ' + session.status + (session.error ? ': ' + session.error : ''));
    err('Draft left open for inspection: ' + draft.path);
    err('To abandon: use draft-abandon for codex=' + codex + ' branch=' + draft.branch);
    process.exit(4);
  }

  // ── Phase 3.5: Commit guard ──────────────────────────────
  // Check whether the session produced commits. We recorded the draft
  // HEAD before the session started — compare against current HEAD.
  {
    const currentHead = execFileSync(
      'git', ['rev-parse', 'HEAD'],
      { cwd: draft.path, encoding: 'utf-8' },
    ).trim();

    if (currentHead === draftStartRef) {
      if (allowNoCommits) {
        log('No commits on draft branch (--allow-no-commits set). Abandoning draft.');
        await scriptorium.abandonDraft({ codexName: codex, branch: draft.branch, force: true });
        log('Draft abandoned. Session completed but produced no inscriptions.');
        process.exit(0);
      } else {
        err('Session completed but produced no commits on the draft branch.');
        err('The anima may have done work but failed to commit it.');
        err('Draft left open for inspection: ' + draft.path);
        err('Use --allow-no-commits to skip this check.');
        process.exit(7);
      }
    }

    const countOutput = execFileSync(
      'git', ['rev-list', '--count', draftStartRef + '..HEAD'],
      { cwd: draft.path, encoding: 'utf-8' },
    ).trim();
    log('Commit guard passed: ' + countOutput + ' commit(s) on draft branch');
  }

  // ── Phase 4: Seal ────────────────────────────────────────
  log('Sealing draft \"' + draft.branch + '\" into codex \"' + codex + '\"...');
  const seal = await scriptorium.seal({
    codexName: codex,
    sourceBranch: draft.branch,
  });
  log('Sealed: strategy=' + seal.strategy + ' commit=' + seal.sealedCommit.slice(0, 12) +
      ' retries=' + seal.retries);

  // ── Phase 5: Push ────────────────────────────────────────
  log('Pushing sealed binding to remote...');
  await scriptorium.push({ codexName: codex });
  log('Push complete');

  log('✓ Inscription cycle complete');
  log('  codex=' + codex + ' branch=' + draft.branch + ' commit=' + seal.sealedCommit.slice(0, 12));
  log('  session=' + session.id + ' role=' + role);
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error('[inscribe] FATAL: ' + msg);

  // Map error phases to exit codes based on message content
  if (msg.includes('not registered') || msg.includes('codex')) process.exit(3);
  if (msg.includes('Sealing seized') || msg.includes('Sealing failed')) process.exit(5);
  if (msg.includes('push')) process.exit(6);
  process.exit(2);
});
"
