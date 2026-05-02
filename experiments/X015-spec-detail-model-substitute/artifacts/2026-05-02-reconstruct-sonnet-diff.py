#!/usr/bin/env python3
"""
Reconstruct Sonnet's final worktree from the X015 trial 1 transcript by
replaying every Edit / Write / MultiEdit tool call in order against a
fresh checkout at the rig's baseSha (d871dd76). Outputs a git diff.

Why this exists: the trial's writ went terminal (Sonnet self-completed
via writ-complete) before review/seal could capture commits, and the
codex bare repo was deleted at teardown. The transcript is the only
surviving record of Sonnet's edits.

Inputs:
  - .scratch/sonnet-eval/trial-1-extract/stacks-export/animator-transcripts.json
  - /workspace/nexus repository (read-only — we clone to /tmp)

Outputs (under <artifacts>/2026-05-02-sonnet-reconstructed/):
  - worktree/                       full reconstructed tree (cleaned)
  - sonnet.diff                     git diff vs baseSha
  - replay-log.txt                  per-tool-call status + skip reasons
  - replay-summary.json             machine-readable summary
"""
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

# Paths
HERE = Path(__file__).parent
TRANSCRIPT = HERE / '2026-05-02-trial-1-extract' / 'stacks-export' / 'animator-transcripts.json'
NEXUS_REPO = '/workspace/nexus'
BASE_SHA = 'd871dd76cd56f9236a8866952081b22f8dbcfa30'

# The path prefix Sonnet used inside its sandbox worktree
SANDBOX_PREFIX = (
    '/workspace/vibers/.nexus/laboratory/guilds/'
    'x015-trial-1-clerk-refactor-sonnet-n1-3b7e3f65/.nexus/worktrees/'
    'x015-trial-1-clerk-refactor-sonnet-n1-3b7e3f65/draft-moocjvd1-d3cf9b1f/'
)

OUT_DIR = HERE / '2026-05-02-sonnet-reconstructed'
WORK = OUT_DIR / 'worktree'
DIFF = OUT_DIR / 'sonnet.diff'
LOG = OUT_DIR / 'replay-log.txt'
SUMMARY = OUT_DIR / 'replay-summary.json'


def run(cmd, cwd=None, check=True):
    return subprocess.run(cmd, cwd=cwd, check=check, capture_output=True, text=True)


def setup_worktree():
    """Fresh clone at baseSha. Force-overwrite if it exists."""
    if WORK.exists():
        shutil.rmtree(WORK)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    # Clone with depth=1 isn't possible here (we need the specific sha
    # which may not be the head). Clone fully then check out.
    print(f'Cloning {NEXUS_REPO} → {WORK} ...', file=sys.stderr)
    run(['git', 'clone', NEXUS_REPO, str(WORK)])
    run(['git', 'checkout', BASE_SHA], cwd=WORK)
    # Detached HEAD is fine — we're not committing.
    print(f'Worktree at {BASE_SHA[:12]}', file=sys.stderr)


def extract_tool_calls(transcript_path):
    """Walk the transcript, return ordered list of (kind, payload) for
    every Edit / Write / MultiEdit call. The stacks-export file is a
    JSON array of transcript rows (lab.probe-stacks-dump format)."""
    raw = json.loads(transcript_path.read_text())
    if isinstance(raw, list):
        # Trial only has one transcript (one implement session). If
        # multiple ever appear, concatenate in original order.
        messages = []
        for t in raw:
            messages.extend(t.get('messages', []))
    else:
        messages = raw.get('messages', [])
    calls = []
    for m in messages:
        if m.get('type') != 'assistant':
            continue
        for b in m.get('message', {}).get('content', []):
            if b.get('type') != 'tool_use':
                continue
            n = b.get('name', '')
            inp = b.get('input', {}) or {}
            if n in ('Edit', 'Write', 'MultiEdit'):
                calls.append((n, inp))
    return calls


def relative_path(abs_path):
    """Strip the sandbox prefix to get path relative to repo root."""
    if abs_path.startswith(SANDBOX_PREFIX):
        return abs_path[len(SANDBOX_PREFIX):]
    return abs_path


def apply_edit(work_root: Path, file_path: str, old_string: str, new_string: str, replace_all: bool):
    """Apply a single Edit. Returns (status, message)."""
    rel = relative_path(file_path)
    target = work_root / rel
    if not target.exists():
        return ('skipped-no-file', f'target does not exist: {rel}')
    content = target.read_text()
    if old_string == '':
        # Edit with empty old_string is the create-file pattern (Claude
        # Code's contract: it actually only allows this in conjunction
        # with Write, but be defensive).
        return ('skipped-empty-old', f'empty old_string on existing file: {rel}')
    occurrences = content.count(old_string)
    if occurrences == 0:
        return ('failed-no-match', f'old_string not found in {rel}')
    if occurrences > 1 and not replace_all:
        return ('failed-non-unique', f'old_string occurs {occurrences}× in {rel} (no replace_all)')
    if replace_all:
        new_content = content.replace(old_string, new_string)
    else:
        new_content = content.replace(old_string, new_string, 1)
    target.write_text(new_content)
    return ('ok', f'edited {rel} ({occurrences} occurrence{"s" if occurrences > 1 else ""})')


def apply_write(work_root: Path, file_path: str, content: str):
    rel = relative_path(file_path)
    target = work_root / rel
    target.parent.mkdir(parents=True, exist_ok=True)
    existed = target.exists()
    target.write_text(content)
    return ('ok', f'wrote {rel} ({"replaced" if existed else "created"})')


def apply_multiedit(work_root: Path, file_path: str, edits: list):
    """Replay a MultiEdit's edits sequentially. Each must match in the
    state left by the previous one."""
    rel = relative_path(file_path)
    target = work_root / rel
    if not target.exists():
        return ('skipped-no-file', f'target does not exist: {rel}')
    content = target.read_text()
    for i, e in enumerate(edits):
        old_s = e.get('old_string', '')
        new_s = e.get('new_string', '')
        replace_all = bool(e.get('replace_all', False))
        if old_s == '':
            return ('failed-empty-old', f'edit {i} had empty old_string')
        occ = content.count(old_s)
        if occ == 0:
            return ('failed-no-match', f'edit {i}/{len(edits)} old_string not found')
        if occ > 1 and not replace_all:
            return ('failed-non-unique', f'edit {i}/{len(edits)} non-unique ({occ}×)')
        if replace_all:
            content = content.replace(old_s, new_s)
        else:
            content = content.replace(old_s, new_s, 1)
    target.write_text(content)
    return ('ok', f'multi-edited {rel} ({len(edits)} edits)')


def replay(calls):
    log_lines = []
    summary = {'total': len(calls), 'ok': 0, 'failed': 0, 'skipped': 0, 'failures': []}
    for i, (kind, inp) in enumerate(calls):
        fp = inp.get('file_path', '')
        if kind == 'Edit':
            status, msg = apply_edit(
                WORK, fp,
                inp.get('old_string', ''),
                inp.get('new_string', ''),
                bool(inp.get('replace_all', False)),
            )
        elif kind == 'Write':
            status, msg = apply_write(WORK, fp, inp.get('content', ''))
        elif kind == 'MultiEdit':
            status, msg = apply_multiedit(WORK, fp, inp.get('edits', []))
        else:
            status, msg = ('skipped-unknown', kind)

        log_lines.append(f'[{i:3}] {kind:10} {status:18} {msg}')
        if status == 'ok':
            summary['ok'] += 1
        elif status.startswith('skipped'):
            summary['skipped'] += 1
        else:
            summary['failed'] += 1
            summary['failures'].append({
                'index': i, 'kind': kind, 'status': status,
                'message': msg, 'file_path': relative_path(fp),
            })

    LOG.write_text('\n'.join(log_lines))
    SUMMARY.write_text(json.dumps(summary, indent=2))
    return summary


def write_diff():
    res = run(['git', 'diff'], cwd=WORK, check=False)
    DIFF.write_text(res.stdout)
    # Also log shortstat
    short = run(['git', 'diff', '--shortstat'], cwd=WORK, check=False)
    print(f'\nDiff shortstat: {short.stdout.strip()}', file=sys.stderr)


def main():
    print('=== Reconstructing Sonnet diff from transcript ===', file=sys.stderr)
    if not TRANSCRIPT.exists():
        print(f'Transcript not found at {TRANSCRIPT}', file=sys.stderr)
        sys.exit(1)
    setup_worktree()
    calls = extract_tool_calls(TRANSCRIPT)
    print(f'Tool calls to replay: {len(calls)}', file=sys.stderr)
    summary = replay(calls)
    write_diff()
    print(f'Replay summary: ok={summary["ok"]} failed={summary["failed"]} skipped={summary["skipped"]}', file=sys.stderr)
    if summary['failures']:
        print(f'\nFirst few failures:', file=sys.stderr)
        for f in summary['failures'][:5]:
            print(f'  [{f["index"]:3}] {f["kind"]:10} {f["status"]:18} {f["file_path"]}: {f["message"]}', file=sys.stderr)
    print(f'\nOutputs in {OUT_DIR}', file=sys.stderr)


if __name__ == '__main__':
    main()
