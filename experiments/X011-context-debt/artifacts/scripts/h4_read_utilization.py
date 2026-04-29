#!/usr/bin/env python3
"""Classify file Reads by whether they were subsequently modified.

For each Read in an implementer transcript, determine whether the file was:
  - Edited (via Edit tool)
  - Written (via Write tool)
  - Modified via Bash (rm, mv, sed -i, git rm, perl -i, etc.)
  - Pure-read (never touched after reading)

Compute the token cost of pure-reads — context bloat from files that
informed the work but didn't need editing. Also flag pure-reads of
documentation/spec/test files vs source files, since the patterns
suggest different fixes.

Usage: python3 h4_read_utilization.py [transcript_path...]
"""
from __future__ import annotations
import json
import re
import sys
from pathlib import Path
from dataclasses import dataclass, field
from typing import List, Dict, Set, Tuple


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
BASH_TARGET = re.compile(r'(?:^|\s)(/\S+\.(?:ts|tsx|js|md|py|json|yaml|yml|txt|toml))(?:\s|$|;|&|\|)')


def load_calls(path: Path) -> List[ToolCall]:
    """Load all tool calls (with their result sizes) from a Claude Code jsonl."""
    seen: Set[str] = set()
    asst_calls: List[ToolCall] = []
    # Map from tool_use_id -> tool result chars
    result_by_id: Dict[str, int] = {}
    # Need to do a two-pass: collect all results first, then match
    records = []
    with open(path) as f:
        for line in f:
            try:
                rec = json.loads(line)
            except Exception:
                continue
            records.append(rec)

    # First pass: tool results
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
    """Strip the worktree prefix to get a comparable path."""
    if not p:
        return ''
    p = str(p)
    # Strip the /workspace/vibers/tmp/nexus-drafts/<codex>/draft-<id>/ prefix
    p = re.sub(r'^/workspace/vibers/tmp/nexus-drafts/[^/]+/draft-[^/]+/', '', p)
    p = re.sub(r'^/workspace/[^/]+/', '', p)
    return p


def classify_reads(calls: List[ToolCall]) -> Dict[str, dict]:
    """For each Read, determine if the same file was later modified.

    Returns map: normalized_path -> {
        reads: list of (turn, chars),
        edits: list of turns where Edit/Write hit it,
        bash_modifies: list of turns where a Bash command appears to modify it,
    }
    """
    files: Dict[str, dict] = {}

    def get(p: str) -> dict:
        np = normalize_path(p)
        if np not in files:
            files[np] = {'reads': [], 'edits': [], 'bash_modifies': []}
        return files[np]

    # Pre-pass: figure out which bash commands were "modifying" and what files
    # they likely touched
    bash_targets: List[Tuple[int, Set[str]]] = []  # (turn, set of normalized paths)
    for c in calls:
        if c.name != 'Bash':
            continue
        cmd = c.input.get('command', '') or ''
        if not BASH_MODIFY.search(cmd):
            continue
        targets = set()
        for m in BASH_TARGET.finditer(cmd):
            targets.add(normalize_path(m.group(1)))
        # Also: if this is `rm -rf <dir>` or `git rm <dir>`, mark the dir
        rm_dir = re.search(r'(?:rm\s+-r\w*|git\s+rm\s+-r\w*)\s+(/\S+)', cmd)
        if rm_dir:
            targets.add(normalize_path(rm_dir.group(1)) + '/**')
        # `find ... -exec sed -i` etc: extract the find target
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

    # Second pass: mark files as bash-modified if their path matches a target
    for fpath, f in files.items():
        for turn, targets in bash_targets:
            if fpath in targets:
                f['bash_modifies'].append(turn)
                continue
            # check directory wildcards
            for t in targets:
                if t.endswith('/**') and fpath.startswith(t[:-3]):
                    f['bash_modifies'].append(turn)
                    break

    return files


# Heuristic categorization of files
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


def analyze(label: str, path: Path) -> None:
    calls = load_calls(path)
    files = classify_reads(calls)

    print(f"\n{'='*88}")
    print(f"=== {label}")
    print(f"{'='*88}")

    pure_reads: List[Tuple[str, int, int]] = []   # (path, total_chars, n_reads)
    edited_reads: List[Tuple[str, int, int]] = []
    bash_only: List[Tuple[str, int, int]] = []
    by_category_pure: Dict[str, int] = {}

    for fpath, f in files.items():
        if not f['reads']:
            continue  # skip files only edited (not read first)
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

    print(f"\nFile-Read accounting:")
    print(f"  Total Read content:      {total_read_chars:>9,} chars  (~{total_read_chars//4:,} tokens)")
    print(f"  Read AND edited:         {sum(c for _,c,_ in edited_reads):>9,} chars  ({len(edited_reads)} files)")
    print(f"  Read AND bash-modified:  {sum(c for _,c,_ in bash_only):>9,} chars  ({len(bash_only)} files)")
    print(f"  Read but NEVER touched:  {pure_chars:>9,} chars  ({len(pure_reads)} files)  ← context bloat")
    if total_read_chars:
        print(f"  Pure-read share:         {100*pure_chars/total_read_chars:.1f}% of all Read content")

    print(f"\n  By category (pure-read only):")
    for cat in sorted(by_category_pure, key=lambda c: -by_category_pure[c]):
        print(f"    {cat:<8} {by_category_pure[cat]:>8,} chars")

    print(f"\nTop 12 PURE-READ files (read into context, never touched):")
    print(f"  {'path':<60} {'reads':>5} {'chars':>9}  {'category':<8}")
    for fpath, chars, nreads in pure_reads[:12]:
        cat = categorize(fpath)
        # Truncate long paths
        display = fpath if len(fpath) <= 60 else '…' + fpath[-58:]
        print(f"  {display:<60} {nreads:>5} {chars:>9,}  {cat:<8}")

    print(f"\nTop 8 READ-AND-EDITED files (legitimate work):")
    for fpath, chars, nreads in edited_reads[:8]:
        display = fpath if len(fpath) <= 60 else '…' + fpath[-58:]
        n_edits = len(files[fpath]['edits'])
        print(f"  {display:<60} {nreads:>3}r/{n_edits:>2}e {chars:>9,}")

    if bash_only:
        print(f"\nREAD-AND-BASH-MODIFIED files (bash sed/rm/mv etc.):")
        for fpath, chars, nreads in bash_only[:8]:
            display = fpath if len(fpath) <= 60 else '…' + fpath[-58:]
            print(f"  {display:<60} {nreads:>5} {chars:>9,}")


TRANSCRIPTS = [
    ("rig1-impl (vision-keeper cleanup)",
     "/home/vscode/.claude/projects/-workspace-vibers-tmp-nexus-drafts-nexus-draft-moji64zc-dfc28f4b/08c3166d-b785-4083-9152-4c7f67920193.jsonl"),
    ("rig2-impl (reckoner tick)",
     "/home/vscode/.claude/projects/-workspace-vibers-tmp-nexus-drafts-nexus-draft-moj12hm9-741d87c7/1f5b65ff-e31d-40e8-809f-14234c6da681.jsonl"),
]


if __name__ == '__main__':
    paths = sys.argv[1:] if len(sys.argv) > 1 else None
    if paths:
        for p in paths:
            analyze(Path(p).name, Path(p))
    else:
        for label, path in TRANSCRIPTS:
            try:
                analyze(label, Path(path))
            except FileNotFoundError:
                print(f"\nNOT FOUND: {path}")
