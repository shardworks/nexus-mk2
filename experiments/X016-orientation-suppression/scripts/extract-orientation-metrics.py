#!/usr/bin/env python3
"""
extract-orientation-metrics.py — sanctum-side analysis script for X016
phase 2c.

Reads `animator-transcripts.json` from a Laboratory trial extract and
emits one row per session with the orientation-tax metrics:

  - sessionId                  : the session row id (ses-...)
  - firstProductiveEditTurn    : turn ordinal of the first Edit/Write/
                                 MultiEdit tool call (1-indexed). null
                                 if the session never produced one.
  - firstProductiveEditFile    : the file_path argument of that first
                                 productive edit. null if none.
  - firstProductiveEditTool    : "Edit" | "Write" | "MultiEdit" | null
  - totalTurns                 : count of assistant turns in the session
  - readonlyCallsBeforeFirst   : count of readonly tool calls (Bash,
                                 Read, Glob, Grep, LS, TodoWrite) seen
                                 before the first productive edit.
  - readonlyCallsTotal         : total readonly calls in the session.
  - productiveEditsTotal       : total Edit/Write/MultiEdit calls.

A "turn" is one cycle of [user msg → assistant response]. Multiple
consecutive assistant messages (e.g., a thinking block followed by a
tool_use) are part of the same turn. Turns are 1-indexed; turn 1 is
the first assistant response after the initial prompt.

Usage:
  extract-orientation-metrics.py <trial-extract-dir> [--variant <name>] [--json]

By default emits CSV to stdout. With --json, emits a JSON array.

The `--variant` flag stamps every output row with a variant label so
multiple trial extracts can be merged downstream into a single dataset.
"""

import argparse
import csv
import json
import sys
from pathlib import Path

# Tool-call classification.
PRODUCTIVE_TOOLS = {"Edit", "Write", "MultiEdit"}
READONLY_TOOLS = {"Bash", "Read", "Glob", "Grep", "LS", "TodoWrite"}


def is_assistant(msg: dict) -> bool:
    return msg.get("type") == "assistant"


def is_user(msg: dict) -> bool:
    return msg.get("type") == "user"


def iter_tool_uses(msg: dict):
    """Yield (tool_name, tool_input_dict) for each tool_use in the msg."""
    inner = msg.get("message", {})
    content = inner.get("content", [])
    if not isinstance(content, list):
        return
    for piece in content:
        if not isinstance(piece, dict):
            continue
        if piece.get("type") != "tool_use":
            continue
        yield piece.get("name", ""), (piece.get("input") or {})


def analyze_session(row: dict) -> dict:
    session_id = row.get("id")
    messages = row.get("messages", [])

    turn = 0
    in_turn = False  # are we currently inside an assistant turn

    first_productive_edit_turn = None
    first_productive_edit_file = None
    first_productive_edit_tool = None

    readonly_before_first = 0
    readonly_total = 0
    productive_total = 0

    for msg in messages:
        if is_assistant(msg):
            if not in_turn:
                turn += 1
                in_turn = True

            for tool_name, tool_input in iter_tool_uses(msg):
                if tool_name in PRODUCTIVE_TOOLS:
                    productive_total += 1
                    if first_productive_edit_turn is None:
                        first_productive_edit_turn = turn
                        first_productive_edit_file = tool_input.get(
                            "file_path"
                        ) or tool_input.get("path")
                        first_productive_edit_tool = tool_name
                elif tool_name in READONLY_TOOLS:
                    readonly_total += 1
                    if first_productive_edit_turn is None:
                        readonly_before_first += 1
                # tools we don't recognize are silently ignored — only
                # the listed sets count toward the headline metric.
        elif is_user(msg):
            in_turn = False

    return {
        "sessionId": session_id,
        "firstProductiveEditTurn": first_productive_edit_turn,
        "firstProductiveEditFile": first_productive_edit_file,
        "firstProductiveEditTool": first_productive_edit_tool,
        "totalTurns": turn,
        "readonlyCallsBeforeFirst": readonly_before_first,
        "readonlyCallsTotal": readonly_total,
        "productiveEditsTotal": productive_total,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "extract_dir",
        type=Path,
        help="Trial extract directory (containing stacks-export/animator-transcripts.json)",
    )
    parser.add_argument(
        "--variant",
        type=str,
        default=None,
        help="Optional variant label to stamp on each output row (e.g., 'baseline')",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Emit JSON array instead of CSV",
    )
    args = parser.parse_args()

    transcripts_path = (
        args.extract_dir / "stacks-export" / "animator-transcripts.json"
    )
    if not transcripts_path.exists():
        print(f"error: transcripts not found at {transcripts_path}", file=sys.stderr)
        return 2

    with transcripts_path.open() as f:
        rows = json.load(f)

    if not isinstance(rows, list):
        print(
            f"error: expected an array at the top of {transcripts_path}, got {type(rows).__name__}",
            file=sys.stderr,
        )
        return 2

    results = []
    for row in rows:
        metrics = analyze_session(row)
        if args.variant is not None:
            metrics = {"variant": args.variant, **metrics}
        results.append(metrics)

    if args.json:
        json.dump(results, sys.stdout, indent=2)
        sys.stdout.write("\n")
    else:
        if not results:
            return 0
        fieldnames = list(results[0].keys())
        writer = csv.DictWriter(sys.stdout, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(results)

    return 0


if __name__ == "__main__":
    sys.exit(main())
