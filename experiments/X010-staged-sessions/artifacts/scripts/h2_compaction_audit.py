#!/usr/bin/env python3
"""Fix dedup: keep LAST (most complete) version of each message.id."""
import json
from pathlib import Path

TRANSCRIPT = Path("/home/vscode/.claude/projects/-workspace-vibers-tmp-nexus-drafts-nexus-draft-mo1wak9c-9415c244/99c46df8-e422-4efa-b8d5-aec28d9f7089.jsonl")

by_id = {}
for line in TRANSCRIPT.read_text().splitlines():
    if not line.strip(): continue
    try: e = json.loads(line)
    except: continue
    if e.get("type") != "assistant": continue
    mid = e.get("message", {}).get("id")
    # Prefer entry with more content blocks
    content_len = len(e.get("message", {}).get("content", []))
    if mid not in by_id or content_len > len(by_id[mid].get("message", {}).get("content", [])):
        by_id[mid] = e

# Order by timestamp
entries = sorted(by_id.values(), key=lambda e: e.get("timestamp"))

turns = []
for e in entries:
    msg = e.get("message", {})
    usage = msg.get("usage", {})
    content = msg.get("content", [])
    tools = []
    text_chars = 0
    for b in content:
        if b.get("type") == "tool_use":
            tools.append((b.get("name"), b.get("input", {})))
        elif b.get("type") == "text":
            text_chars += len(b.get("text", ""))
    turns.append({
        "ts": e.get("timestamp"),
        "cache_read": usage.get("cache_read_input_tokens", 0),
        "cache_create": usage.get("cache_creation_input_tokens", 0),
        "output": usage.get("output_tokens", 0),
        "tools": tools,
        "text_chars": text_chars,
    })

PHASES = [
    ("A (pre-compact-1, turns 1-10)", 0, 10),
    ("B (post-compact-1, turns 11-62)", 10, 62),
    ("C (post-compact-2, turns 63-77)", 62, 77),
]

print(f"total turns: {len(turns)}")

# Show turns with file writes and commits
print(f"\n{'turn':>4} {'ph':<3} {'tool':<12} {'arg'}")
def phase_of(i):
    for nm, lo, hi in PHASES:
        if lo <= i < hi: return nm[0]
    return "?"
for i, t in enumerate(turns):
    for nm, inp in t["tools"]:
        if nm in ("Write", "Edit", "MultiEdit", "Bash"):
            if nm == "Bash":
                arg = inp.get("command", "")[:80]
            else:
                arg = f'{inp.get("file_path", "?").split("/")[-1]}'
            print(f"{i+1:>4d} {phase_of(i):<3} {nm:<12} {arg}")

# Phase summary with correct dedup
print("\n" + "="*80)
print("PHASE SUMMARY (corrected dedup)")
print("="*80)
from collections import Counter
for name, lo, hi in PHASES:
    phase = turns[lo:hi]
    tools = Counter()
    writes = []
    commits = []
    for i, t in enumerate(phase):
        global_turn = lo + i + 1
        for nm, inp in t["tools"]:
            tools[nm] += 1
            if nm in ("Write", "Edit", "MultiEdit"):
                fp = inp.get("file_path", "?").split("/")[-1]
                writes.append((global_turn, nm, fp))
            if nm == "Bash":
                cmd = inp.get("command", "")
                if "git commit" in cmd:
                    commits.append((global_turn, cmd[:80]))
    total_out = sum(t["output"] for t in phase)
    total_text = sum(t["text_chars"] for t in phase)
    print(f"\n{name}")
    print(f"  turns: {len(phase)}  out_sum: {total_out:,}  text_chars: {total_text:,}")
    print(f"  tools: {dict(tools)}")
    print(f"  writes ({len(writes)}):")
    for gt, tn, fp in writes:
        print(f"    turn {gt:>3d}: {tn} {fp}")
    print(f"  commits ({len(commits)}):")
    for gt, cmd in commits:
        print(f"    turn {gt:>3d}: {cmd}")
