#!/usr/bin/env python3
"""read-utilization.py — classify file Reads in a Claude Code transcript.

For each Read in an implementer transcript, determine whether the file was:
  - Edited (via Edit tool)
  - Written (via Write tool)
  - Modified via Bash (rm, mv, sed -i, git rm, perl -i, etc.)
  - Pure-read (never touched after reading)

Computes the token / character cost of pure-reads — context bloat from files
that informed the work but didn't need editing. Categorizes pure-reads by
file kind (source / test / doc / config / other).

Usage:

    # Single transcript by file path
    python3 read-utilization.py path/to/transcript.jsonl

    # Multiple transcripts, labelled
    python3 read-utilization.py --label rig1 path/to/A.jsonl \\
                                --label rig2 path/to/B.jsonl

    # By Claude session id (resolves under ~/.claude/projects/**)
    python3 read-utilization.py --session 1f5b65ff-e31d-40e8-809f-14234c6da681

    # JSON output (one object per analyzed transcript)
    python3 read-utilization.py --json path/to/transcript.jsonl > out.json

History: factored out of
`experiments/X011-context-debt/artifacts/scripts/h4_read_utilization.py`
which produced the 49% pure-read finding for rig-moj12h4o (see
click c-mok4ocec). Promoted to a reusable instrument by X021
(2026-05-03).
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple


# ---------------------------------------------------------------------------
# Tool-call extraction
# ---------------------------------------------------------------------------

@dataclass
class ToolCall:
    turn: int
    name: str
    input: dict
    result_chars: int = 0  # populated from the matching tool_result


# Bash patterns that modify files
BASH_MODIFY = re.compile(
    r'\b(rm|mv|cp|sed\s+-i|perl\s+-i|git\s+(rm|mv)|touch|cat\s*[<>]|>\s*\S+|>>\s*\S+|tee)\b'
)

# Heuristic to extract "target file" from a bash command
BASH_TARGET = re.compile(
    r'(?:^|\s)(/\S+\.(?:ts|tsx|js|md|py|json|yaml|yml|txt|toml))(?:\s|$|;|&|\|)'
)


def load_calls(path: Path) -> List[ToolCall]:
    """Load all tool calls (with their result sizes) from a Claude Code jsonl."""
    seen: Set[str] = set()
    asst_calls: List[ToolCall] = []
    result_by_id: Dict[str, int] = {}

    records = []
    with open(path) as f:
        for line in f:
            try:
                rec = json.loads(line)
            except Exception:
                continue
            records.append(rec)

    # First pass: tool results → id → response size
    for rec in records:
        msg = rec.get('message') or {}
        if msg.get('role') == 'user':
            for c in msg.get('content') or []:
                if isinstance(c, dict) and c.get('type') == 'tool_result':
                    tid = c.get('tool_use_id')
                    if tid:
                        result_by_id[tid] = len(json.dumps(c.get('content', '')))

    # Second pass: assistant tool calls (dedupe by message id)
    turn = 0
    for rec in records:
        if rec.get('type') != 'assistant':
            continue
        msg = rec.get('message') or {}
        mid = msg.get('id')
        if not mid or mid in seen:
            continue
        seen.add(mid)
        turn += 1
        for c in msg.get('content') or []:
            if isinstance(c, dict) and c.get('type') == 'tool_use':
                tid = c.get('id')
                asst_calls.append(ToolCall(
                    turn=turn,
                    name=c.get('name', ''),
                    input=c.get('input') or {},
                    result_chars=result_by_id.get(tid, 0),
                ))
    return asst_calls


def normalize_path(p: str) -> str:
    """Strip workspace / draft prefixes so paths from different sessions compare."""
    if not p:
        return ''
    p = str(p)
    p = re.sub(r'^/workspace/vibers/tmp/nexus-drafts/[^/]+/draft-[^/]+/', '', p)
    p = re.sub(r'^/workspace/[^/]+/', '', p)
    return p


def classify_reads(calls: List[ToolCall]) -> Dict[str, dict]:
    """Per-file: list of reads, list of edits, list of bash-modify turns."""
    files: Dict[str, dict] = {}

    def get(p: str) -> dict:
        np = normalize_path(p)
        if np not in files:
            files[np] = {'reads': [], 'edits': [], 'bash_modifies': []}
        return files[np]

    # Pre-pass: figure out which bash commands modified what files
    bash_targets: List[Tuple[int, Set[str]]] = []
    for c in calls:
        if c.name != 'Bash':
            continue
        cmd = c.input.get('command', '') or ''
        if not BASH_MODIFY.search(cmd):
            continue
        targets = set()
        for m in BASH_TARGET.finditer(cmd):
            targets.add(normalize_path(m.group(1)))
        rm_dir = re.search(r'(?:rm\s+-r\w*|git\s+rm\s+-r\w*)\s+(/\S+)', cmd)
        if rm_dir:
            targets.add(normalize_path(rm_dir.group(1)) + '/**')
        find_target = re.search(r'find\s+(/\S+)', cmd)
        if find_target and 'sed' in cmd:
            targets.add(normalize_path(find_target.group(1)) + '/**')
        bash_targets.append((c.turn, targets))

    for c in calls:
        if c.name == 'Read':
            p = c.input.get('file_path', '')
            if not p:
                continue
            f = get(p)
            f['reads'].append((c.turn, c.result_chars))
        elif c.name == 'Edit':
            p = c.input.get('file_path', '')
            if not p:
                continue
            f = get(p)
            f['edits'].append(c.turn)
        elif c.name == 'Write':
            p = c.input.get('file_path', '')
            if not p:
                continue
            f = get(p)
            f['edits'].append(c.turn)

    # Second pass: bash-modify cross-reference
    for fpath, f in files.items():
        for turn, targets in bash_targets:
            if fpath in targets:
                f['bash_modifies'].append(turn)
                continue
            for t in targets:
                if t.endswith('/**') and fpath.startswith(t[:-3]):
                    f['bash_modifies'].append(turn)
                    break

    return files


def categorize(path: str) -> str:
    if not path:
        return 'other'
    if path.endswith('.test.ts') or path.endswith('.test.js') or path.endswith('.spec.ts'):
        return 'test'
    if path.endswith('.md'):
        return 'doc'
    if path.endswith('.json') or path.endswith('.yaml') or path.endswith('.yml'):
        return 'config'
    if path.endswith('.ts') or path.endswith('.tsx') or path.endswith('.js'):
        return 'source'
    return 'other'


# ---------------------------------------------------------------------------
# Analysis (returns a structured report; renderers below)
# ---------------------------------------------------------------------------

def analyze(path: Path) -> dict:
    calls = load_calls(path)
    files = classify_reads(calls)

    pure_reads: List[Tuple[str, int, int]] = []
    edited_reads: List[Tuple[str, int, int]] = []
    bash_only: List[Tuple[str, int, int]] = []
    by_category_pure: Dict[str, int] = {}

    for fpath, f in files.items():
        if not f['reads']:
            continue
        total_chars = sum(c for _, c in f['reads'])
        n_reads = len(f['reads'])
        if f['edits']:
            edited_reads.append((fpath, total_chars, n_reads))
        elif f['bash_modifies']:
            bash_only.append((fpath, total_chars, n_reads))
        else:
            pure_reads.append((fpath, total_chars, n_reads))
            cat = categorize(fpath)
            by_category_pure[cat] = by_category_pure.get(cat, 0) + total_chars

    pure_reads.sort(key=lambda x: -x[1])
    edited_reads.sort(key=lambda x: -x[1])
    bash_only.sort(key=lambda x: -x[1])

    total_read_chars = (
        sum(c for _, c, _ in pure_reads)
        + sum(c for _, c, _ in edited_reads)
        + sum(c for _, c, _ in bash_only)
    )
    pure_chars = sum(c for _, c, _ in pure_reads)
    edited_chars = sum(c for _, c, _ in edited_reads)
    bash_chars = sum(c for _, c, _ in bash_only)

    return {
        'transcript': str(path),
        'totals': {
            'total_read_chars': total_read_chars,
            'edited_read_chars': edited_chars,
            'bash_modified_read_chars': bash_chars,
            'pure_read_chars': pure_chars,
            'pure_read_share': (pure_chars / total_read_chars) if total_read_chars else 0.0,
            'pure_read_files': len(pure_reads),
            'edited_files': len(edited_reads),
            'bash_modified_files': len(bash_only),
        },
        'by_category_pure': by_category_pure,
        'pure_reads': [
            {'path': p, 'chars': c, 'reads': n, 'category': categorize(p)}
            for p, c, n in pure_reads
        ],
        'edited_reads': [
            {'path': p, 'chars': c, 'reads': n,
             'edits': len(files[p]['edits']),
             'category': categorize(p)}
            for p, c, n in edited_reads
        ],
        'bash_only': [
            {'path': p, 'chars': c, 'reads': n, 'category': categorize(p)}
            for p, c, n in bash_only
        ],
    }


# ---------------------------------------------------------------------------
# Renderers
# ---------------------------------------------------------------------------

def render_text(label: str, report: dict) -> None:
    t = report['totals']
    print(f"\n{'='*88}")
    print(f"=== {label}")
    print(f"=== transcript: {report['transcript']}")
    print(f"{'='*88}")

    print("\nFile-Read accounting:")
    print(f"  Total Read content:      {t['total_read_chars']:>9,} chars  (~{t['total_read_chars']//4:,} tokens)")
    print(f"  Read AND edited:         {t['edited_read_chars']:>9,} chars  ({t['edited_files']} files)")
    print(f"  Read AND bash-modified:  {t['bash_modified_read_chars']:>9,} chars  ({t['bash_modified_files']} files)")
    print(f"  Read but NEVER touched:  {t['pure_read_chars']:>9,} chars  ({t['pure_read_files']} files)  ← context bloat")
    if t['total_read_chars']:
        print(f"  Pure-read share:         {100*t['pure_read_share']:.1f}% of all Read content")

    print("\n  By category (pure-read only):")
    for cat in sorted(report['by_category_pure'], key=lambda c: -report['by_category_pure'][c]):
        print(f"    {cat:<8} {report['by_category_pure'][cat]:>8,} chars")

    print("\nTop 12 PURE-READ files (read into context, never touched):")
    print(f"  {'path':<60} {'reads':>5} {'chars':>9}  {'category':<8}")
    for entry in report['pure_reads'][:12]:
        display = entry['path'] if len(entry['path']) <= 60 else '…' + entry['path'][-58:]
        print(f"  {display:<60} {entry['reads']:>5} {entry['chars']:>9,}  {entry['category']:<8}")

    print("\nTop 8 READ-AND-EDITED files (legitimate work):")
    for entry in report['edited_reads'][:8]:
        display = entry['path'] if len(entry['path']) <= 60 else '…' + entry['path'][-58:]
        print(f"  {display:<60} {entry['reads']:>3}r/{entry['edits']:>2}e {entry['chars']:>9,}")

    if report['bash_only']:
        print("\nREAD-AND-BASH-MODIFIED files (bash sed/rm/mv etc.):")
        for entry in report['bash_only'][:8]:
            display = entry['path'] if len(entry['path']) <= 60 else '…' + entry['path'][-58:]
            print(f"  {display:<60} {entry['reads']:>5} {entry['chars']:>9,}")


# ---------------------------------------------------------------------------
# Session-id resolution (find a transcript jsonl by session uuid)
# ---------------------------------------------------------------------------

def resolve_session(session_id: str, root: Optional[Path] = None) -> Path:
    """Find ~/.claude/projects/**/<session-id>.jsonl."""
    if root is None:
        root = Path.home() / '.claude' / 'projects'
    if not root.exists():
        raise FileNotFoundError(f"Claude projects root not found: {root}")
    matches = list(root.glob(f'**/{session_id}.jsonl'))
    if not matches:
        raise FileNotFoundError(
            f"No transcript found for session {session_id} under {root}"
        )
    if len(matches) > 1:
        # Multiple project dirs may carry the same session id (resume across worktrees)
        # Take the most recently modified.
        matches.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    return matches[0]


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> int:
    p = argparse.ArgumentParser(
        description="Classify Reads in a Claude Code transcript by whether the file was subsequently modified.",
        epilog="""\
Examples:
  read-utilization.py transcript.jsonl
  read-utilization.py --label rig1 a.jsonl --label rig2 b.jsonl
  read-utilization.py --session 1f5b65ff-e31d-40e8-809f-14234c6da681
  read-utilization.py --json transcript.jsonl
""",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    p.add_argument('paths', nargs='*', help='transcript jsonl path(s)')
    p.add_argument('--session', action='append', default=[],
                   help='session UUID; resolves under ~/.claude/projects/')
    p.add_argument('--label', action='append', default=[],
                   help='per-input label (one per path/session, in order)')
    p.add_argument('--json', action='store_true',
                   help='emit machine-readable JSON instead of text')
    args = p.parse_args()

    inputs: List[Tuple[str, Path]] = []
    label_idx = 0

    def next_label(default: str) -> str:
        nonlocal label_idx
        if label_idx < len(args.label):
            lbl = args.label[label_idx]
            label_idx += 1
            return lbl
        return default

    for s in args.session:
        path = resolve_session(s)
        inputs.append((next_label(f'session:{s[:8]}'), path))

    for raw in args.paths:
        path = Path(raw)
        if not path.exists():
            print(f"ERROR: not found: {raw}", file=sys.stderr)
            return 2
        inputs.append((next_label(path.name), path))

    if not inputs:
        p.print_help()
        return 1

    if args.json:
        out = []
        for label, path in inputs:
            r = analyze(path)
            r['label'] = label
            out.append(r)
        print(json.dumps(out, indent=2))
    else:
        for label, path in inputs:
            r = analyze(path)
            render_text(label, r)

    return 0


if __name__ == '__main__':
    sys.exit(main())
