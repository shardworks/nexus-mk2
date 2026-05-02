#!/usr/bin/env python3
"""coco-extract-conversation.py — extract the human-readable backbone of a
Claude Code JSONL transcript.

Filters out tool-result content, system messages, and command-injection
caveats; preserves user-typed and assistant text, with tool_use blocks
compressed to one-line summaries. Output is markdown with numbered
messages, suitable for piping into a distiller or verifier prompt.

Usage:
    coco-extract-conversation.py <transcript-path>

Output goes to stdout.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path


SKIP_PREFIXES = (
    "Caveat:",
    "agent-setting",
    "permission-mode",
)

SKIP_FRAGMENTS = (
    "<system-reminder>",
    "<command-name>",
    "<command-message>",
    "<command-args>",
    "<local-command-stdout>",
    "<local-command-caveat>",
    "<task-notification>",
    "[SYSTEM NOTIFICATION",
)


def summarize_tool_use(name: str, inp: dict) -> str:
    if name == "Bash":
        desc = (inp.get("description") or "").strip()
        return f"[tool: Bash] {desc[:120]}" if desc else "[tool: Bash]"
    if name in {"Read", "Write", "Edit", "MultiEdit"}:
        path = inp.get("file_path") or "?"
        return f"[tool: {name}] {path}"
    if name in {"Glob", "Grep"}:
        pat = inp.get("pattern") or inp.get("path") or "?"
        return f"[tool: {name}] {pat}"
    return f"[tool: {name}]"


def extract_text(content) -> str:
    """Extract the substantive text from a message.content value."""
    if isinstance(content, str):
        return content
    if not isinstance(content, list):
        return ""
    parts: list[str] = []
    for block in content:
        if not isinstance(block, dict):
            continue
        btype = block.get("type")
        if btype == "text":
            parts.append(block.get("text") or "")
        elif btype == "tool_use":
            parts.append(summarize_tool_use(block.get("name", "?"), block.get("input") or {}))
        # tool_result deliberately skipped — too noisy
    return "\n".join(p for p in parts if p.strip())


def should_skip(text: str) -> bool:
    s = text.strip()
    if not s:
        return True
    if any(s.startswith(p) for p in SKIP_PREFIXES):
        return True
    if any(frag in s for frag in SKIP_FRAGMENTS):
        return True
    return False


def main() -> int:
    if len(sys.argv) != 2:
        print(f"usage: {sys.argv[0]} <transcript-path>", file=sys.stderr)
        return 2

    path = Path(sys.argv[1])
    if not path.is_file():
        print(f"transcript not found: {path}", file=sys.stderr)
        return 1

    msg_idx = 0
    session_date: str | None = None  # YYYY-MM-DD of first message timestamp

    out_lines: list[str] = []
    body_lines: list[str] = []

    with path.open() as fp:
        for line in fp:
            line = line.strip()
            if not line:
                continue
            try:
                d = json.loads(line)
            except json.JSONDecodeError:
                continue
            # Capture the session date from the first record carrying a timestamp.
            if session_date is None:
                ts = d.get("timestamp")
                if isinstance(ts, str) and len(ts) >= 10:
                    session_date = ts[:10]
            if d.get("type") not in ("user", "assistant"):
                continue
            msg = d.get("message") or {}
            role = msg.get("role") or d.get("type")
            text = extract_text(msg.get("content", ""))
            if should_skip(text):
                continue
            msg_idx += 1
            body_lines.append(f"## [{msg_idx:03d}] {role}")
            body_lines.append("")
            body_lines.append(text)
            body_lines.append("")

    # Header carries metadata the distiller needs (session id + date).
    out_lines.append(f"# Conversation — {path.stem}")
    out_lines.append("")
    out_lines.append(f"- Session ID: `{path.stem}`")
    if session_date:
        out_lines.append(f"- Session date: `{session_date}`")
    out_lines.append("")
    out_lines.extend(body_lines)
    out_lines.append(f"<!-- {msg_idx} messages extracted -->")
    sys.stdout.write("\n".join(out_lines) + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
