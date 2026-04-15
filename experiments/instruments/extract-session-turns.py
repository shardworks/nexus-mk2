#!/usr/bin/env python3
"""
extract-session-turns.py — per-turn token/cache extraction from Claude Code transcripts.

Walks Claude Code transcript JSONL files under ~/.claude/projects/ and emits
per-turn token usage data for a target set of Laboratory sessions. Output is
CSV (per turn) + a per-session summary that can be cross-checked against
Laboratory's session-level `token_usage` totals to verify the totals reflect
reality.

Usage:
    extract-session-turns.py --writ w-mnynxpwd-17535f30f61a [--writ ...]
    extract-session-turns.py --all-ab     # the 6 A/B writs from quest w-mnt3t5h8
    extract-session-turns.py --writ-glob 'w-mnyn*'

Output (defaults to stdout, override with --out-dir):
    <out-dir>/per-turn.csv     — one row per assistant turn
    <out-dir>/per-session.csv  — one row per session with summed totals
    <out-dir>/reconciliation.tsv — laboratory vs computed totals, diff columns

Memory: streams one JSONL line at a time. Never loads a full transcript into
memory. Suitable for multi-GB transcript dirs.

Mapping transcripts to Laboratory sessions: scans each transcript's first
`queue-operation` event — its `content` field contains the plan ID (= writ id)
and optionally a `MODE: X` header. Timestamp on that event is within ~1s of the
Laboratory session's `started_at`. Match is (writ_id, |timestamp_delta| < 5s).
"""

import argparse
import csv
import json
import os
import re
import sys
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterator

# ── Constants ────────────────────────────────────────────────────────

TRANSCRIPT_ROOT = Path.home() / ".claude" / "projects"
DEFAULT_LAB_ROOT = Path("/workspace/nexus-mk2/experiments/data/commissions")

# The six A/B rigs from quest w-mnt3t5h8 (Astrolabe efficiency).
AB_WRIT_IDS = [
    "w-mnynxpwd-17535f30f61a",  # baseline  MCP-precond
    "w-mnynxfhj-2b38ea890673",  # baseline  prompt-inj
    "w-mnynxz7n-d658562985a6",  # SSR       MCP-precond
    "w-mnyny4bg-28b1974bb033",  # SSR       prompt-inj
    "w-mnynycgm-2200291d4972",  # MRA       MCP-precond
    "w-mnynyjub-a5398e15e8ea",  # MRA       prompt-inj
]

MODE_RE = re.compile(r"MODE:\s*([A-Z-]+)", re.MULTILINE)
PLAN_ID_RE = re.compile(r"Plan ID:\s*(w-[a-z0-9-]+)", re.MULTILINE)


# ── Data classes ─────────────────────────────────────────────────────


@dataclass
class LabSession:
    session_id: str
    writ_id: str
    started_at: datetime
    ended_at: datetime
    duration_ms: int
    cost_usd: float
    lab_input_tokens: int
    lab_output_tokens: int
    lab_cache_read_tokens: int
    lab_cache_write_tokens: int
    yaml_path: Path


@dataclass
class TranscriptSection:
    """A logical session within a transcript file, delimited by queue-operation events.

    Claude Code transcripts can contain multiple logical sessions in a single
    .jsonl file when conversationId is reused across stages (the shared-conv
    handoff mechanism used by baseline/SSR astrolabe rigs). Each section starts
    at a queue-operation event bearing a `Plan ID: w-...` line and extends to
    the next queue-operation (or EOF).
    """

    jsonl_path: Path
    section_idx: int  # 0-indexed within the file
    writ_id: str
    mode: str  # READER, ANALYST, WRITER, READER-ANALYST, or ?
    start_ts: datetime


@dataclass
class TurnRow:
    writ_id: str
    lab_session_id: str
    transcript_file: str
    mode: str
    turn_idx: int
    timestamp: str
    model: str
    input_tokens: int
    cache_creation_input_tokens: int
    cache_read_input_tokens: int
    cache_creation_5m: int
    cache_creation_1h: int
    output_tokens: int
    num_tool_use: int
    num_text_blocks: int


@dataclass
class SessionSummary:
    writ_id: str
    lab_session_id: str
    transcript_file: str
    mode: str
    assistant_turns: int = 0
    total_input_tokens: int = 0
    total_cache_creation: int = 0
    total_cache_read: int = 0
    total_cache_creation_5m: int = 0
    total_cache_creation_1h: int = 0
    total_output_tokens: int = 0
    total_tool_uses: int = 0
    multi_tool_turns: int = 0
    max_tools_in_turn: int = 0


# ── Parsing helpers ──────────────────────────────────────────────────


def parse_ts(s: str) -> datetime:
    # Claude Code timestamps are ISO-8601 with Z suffix
    return datetime.fromisoformat(s.replace("Z", "+00:00")).astimezone(timezone.utc)


def iter_transcript_sections(
    root: Path, writ_ids: set[str]
) -> Iterator[TranscriptSection]:
    """Walk all jsonl files under root, yield one TranscriptSection per queue-op
    enqueue event whose content references a target writ id.
    """
    for project_dir in root.iterdir():
        if not project_dir.is_dir():
            continue
        for jsonl in project_dir.glob("*.jsonl"):
            try:
                section_idx = 0
                with jsonl.open("r") as f:
                    for line in f:
                        try:
                            obj = json.loads(line)
                        except Exception:
                            continue
                        if obj.get("type") != "queue-operation":
                            continue
                        if obj.get("operation") != "enqueue":
                            continue
                        content = obj.get("content", "") or ""
                        m = PLAN_ID_RE.search(content)
                        if not m:
                            continue
                        writ_id = m.group(1)
                        if writ_id not in writ_ids:
                            section_idx += 1
                            continue
                        mm = MODE_RE.search(content)
                        mode = mm.group(1) if mm else "?"
                        ts = parse_ts(obj["timestamp"])
                        yield TranscriptSection(
                            jsonl_path=jsonl,
                            section_idx=section_idx,
                            writ_id=writ_id,
                            mode=mode,
                            start_ts=ts,
                        )
                        section_idx += 1
            except Exception as e:
                print(f"[warn] skipping {jsonl}: {e}", file=sys.stderr)


def load_lab_sessions(lab_root: Path, writ_ids: set[str]) -> list[LabSession]:
    """Parse Laboratory session YAMLs — simple key:value format, no PyYAML needed."""
    out: list[LabSession] = []
    for writ_id in writ_ids:
        sess_dir = lab_root / writ_id / "sessions"
        if not sess_dir.exists():
            continue
        for yaml_file in sess_dir.glob("*.yaml"):
            data: dict = {"token_usage": {}}
            current = data
            with yaml_file.open("r") as f:
                for line in f:
                    s = line.rstrip()
                    if not s or s.startswith("#"):
                        continue
                    if s.startswith("token_usage:"):
                        current = data["token_usage"]
                        continue
                    if s.startswith("  "):
                        k, _, v = s.strip().partition(": ")
                        current[k] = v
                        continue
                    if current is not data:
                        current = data
                    if ": " in s:
                        k, _, v = s.partition(": ")
                        data[k] = v
            try:
                out.append(
                    LabSession(
                        session_id=data["id"],
                        writ_id=data["writ_id"],
                        started_at=parse_ts(data["started_at"]),
                        ended_at=parse_ts(data["ended_at"]),
                        duration_ms=int(data["duration_ms"]),
                        cost_usd=float(data["cost_usd"]),
                        lab_input_tokens=int(data["token_usage"].get("input_tokens", 0)),
                        lab_output_tokens=int(
                            data["token_usage"].get("output_tokens", 0)
                        ),
                        lab_cache_read_tokens=int(
                            data["token_usage"].get("cache_read_tokens", 0)
                        ),
                        lab_cache_write_tokens=int(
                            data["token_usage"].get("cache_write_tokens", 0)
                        ),
                        yaml_path=yaml_file,
                    )
                )
            except Exception as e:
                print(f"[warn] could not parse {yaml_file}: {e}", file=sys.stderr)
    return out


def match_sections_to_sessions(
    sections: list[TranscriptSection], sessions: list[LabSession]
) -> dict[str, TranscriptSection]:
    """Return {lab_session_id: TranscriptSection}. Match by (writ_id, |started_at - section.start_ts| min).

    Also de-duplicates so one section is assigned to at most one session.
    """
    matches: dict[str, TranscriptSection] = {}
    used_section_keys: set[tuple[str, int]] = set()

    # Sort sessions by started_at so earlier sessions claim their sections first
    # (baseline: reader at t=0 claims section 0, analyst at t=+3s claims section 1).
    ordered = sorted(sessions, key=lambda s: s.started_at)

    for sess in ordered:
        candidates = [s for s in sections if s.writ_id == sess.writ_id]
        # Exclude already-claimed sections
        candidates = [
            s for s in candidates if (str(s.jsonl_path), s.section_idx) not in used_section_keys
        ]
        if not candidates:
            continue
        best = min(
            candidates, key=lambda s: abs((s.start_ts - sess.started_at).total_seconds())
        )
        delta = abs((best.start_ts - sess.started_at).total_seconds())
        if delta > 60:
            print(
                f"[warn] {sess.session_id}: closest section in {best.jsonl_path.name}#{best.section_idx} is {delta:.0f}s away — skipping",
                file=sys.stderr,
            )
            continue
        matches[sess.session_id] = best
        used_section_keys.add((str(best.jsonl_path), best.section_idx))
    return matches


# ── Per-turn extraction (streaming) ──────────────────────────────────


def iter_section_assistant_turns(
    jsonl_path: Path, target_section_idx: int
) -> Iterator[tuple[dict, dict, dict]]:
    """Yield (event, message, usage) for each assistant event inside the given
    section of the file. A section is the range of events following the Nth
    queue-operation enqueue event and before the (N+1)th, or EOF.
    """
    current_section = -1
    with jsonl_path.open("r") as f:
        for line in f:
            try:
                obj = json.loads(line)
            except Exception:
                continue
            t = obj.get("type")
            if t == "queue-operation" and obj.get("operation") == "enqueue":
                current_section += 1
                if current_section > target_section_idx:
                    return
                continue
            if current_section != target_section_idx:
                continue
            if t != "assistant":
                continue
            msg = obj.get("message", {}) or {}
            usage = msg.get("usage") or {}
            yield obj, msg, usage


def extract_session(
    lab_session: LabSession, section: TranscriptSection
) -> tuple[list[TurnRow], SessionSummary]:
    rows: list[TurnRow] = []
    summary = SessionSummary(
        writ_id=lab_session.writ_id,
        lab_session_id=lab_session.session_id,
        transcript_file=f"{section.jsonl_path.name}#{section.section_idx}",
        mode=section.mode,
    )
    turn_idx = 0
    seen_msg_ids: set[str] = set()
    for event, msg, usage in iter_section_assistant_turns(
        section.jsonl_path, section.section_idx
    ):
        # Deduplicate by message id — each logical assistant message appears
        # as multiple chained JSONL events (parentUuid chain) all sharing the
        # same msg id. Without this, every token total is inflated 2–5×.
        msg_id = msg.get("id")
        if msg_id:
            if msg_id in seen_msg_ids:
                continue
            seen_msg_ids.add(msg_id)
        turn_idx += 1
        content = msg.get("content", []) or []
        num_tool_use = sum(1 for b in content if isinstance(b, dict) and b.get("type") == "tool_use")
        num_text = sum(1 for b in content if isinstance(b, dict) and b.get("type") == "text")
        cache_creation = usage.get("cache_creation", {}) or {}
        row = TurnRow(
            writ_id=lab_session.writ_id,
            lab_session_id=lab_session.session_id,
            transcript_file=f"{section.jsonl_path.name}#{section.section_idx}",
            mode=section.mode,
            turn_idx=turn_idx,
            timestamp=event.get("timestamp", ""),
            model=msg.get("model", ""),
            input_tokens=int(usage.get("input_tokens", 0) or 0),
            cache_creation_input_tokens=int(usage.get("cache_creation_input_tokens", 0) or 0),
            cache_read_input_tokens=int(usage.get("cache_read_input_tokens", 0) or 0),
            cache_creation_5m=int(cache_creation.get("ephemeral_5m_input_tokens", 0) or 0),
            cache_creation_1h=int(cache_creation.get("ephemeral_1h_input_tokens", 0) or 0),
            output_tokens=int(usage.get("output_tokens", 0) or 0),
            num_tool_use=num_tool_use,
            num_text_blocks=num_text,
        )
        rows.append(row)

        summary.assistant_turns += 1
        summary.total_input_tokens += row.input_tokens
        summary.total_cache_creation += row.cache_creation_input_tokens
        summary.total_cache_read += row.cache_read_input_tokens
        summary.total_cache_creation_5m += row.cache_creation_5m
        summary.total_cache_creation_1h += row.cache_creation_1h
        summary.total_output_tokens += row.output_tokens
        summary.total_tool_uses += num_tool_use
        if num_tool_use > 1:
            summary.multi_tool_turns += 1
        if num_tool_use > summary.max_tools_in_turn:
            summary.max_tools_in_turn = num_tool_use

    return rows, summary


# ── Main ─────────────────────────────────────────────────────────────


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--writ", action="append", default=[], help="Writ ID (repeatable)")
    ap.add_argument(
        "--all-ab",
        action="store_true",
        help=f"Use the {len(AB_WRIT_IDS)} A/B writs from quest w-mnt3t5h8",
    )
    ap.add_argument(
        "--lab-root",
        type=Path,
        default=DEFAULT_LAB_ROOT,
        help="Laboratory commission data root",
    )
    ap.add_argument(
        "--transcript-root",
        type=Path,
        default=TRANSCRIPT_ROOT,
        help="Claude Code transcript root",
    )
    ap.add_argument(
        "--out-dir",
        type=Path,
        required=True,
        help="Directory to write per-turn.csv, per-session.csv, reconciliation.tsv",
    )
    args = ap.parse_args()

    writ_ids: set[str] = set(args.writ)
    if args.all_ab:
        writ_ids.update(AB_WRIT_IDS)
    if not writ_ids:
        ap.error("Need at least one --writ or --all-ab")

    args.out_dir.mkdir(parents=True, exist_ok=True)

    print(f"[info] scanning Laboratory sessions in {args.lab_root}", file=sys.stderr)
    lab_sessions = load_lab_sessions(args.lab_root, writ_ids)
    print(f"[info] found {len(lab_sessions)} Laboratory sessions", file=sys.stderr)

    print(f"[info] scanning transcripts in {args.transcript_root}", file=sys.stderr)
    sections = list(iter_transcript_sections(args.transcript_root, writ_ids))
    print(f"[info] found {len(sections)} matching transcript sections", file=sys.stderr)

    matches = match_sections_to_sessions(sections, lab_sessions)
    print(
        f"[info] matched {len(matches)}/{len(lab_sessions)} sessions to transcript sections",
        file=sys.stderr,
    )

    all_rows: list[TurnRow] = []
    all_summaries: list[tuple[LabSession, SessionSummary]] = []

    for sess in lab_sessions:
        t = matches.get(sess.session_id)
        if t is None:
            print(f"[warn] no transcript match for {sess.session_id}", file=sys.stderr)
            continue
        rows, summary = extract_session(sess, t)
        all_rows.extend(rows)
        all_summaries.append((sess, summary))

    # per-turn.csv
    turn_csv = args.out_dir / "per-turn.csv"
    with turn_csv.open("w", newline="") as f:
        w = csv.DictWriter(
            f,
            fieldnames=[
                "writ_id",
                "lab_session_id",
                "transcript_file",
                "mode",
                "turn_idx",
                "timestamp",
                "model",
                "input_tokens",
                "cache_creation_input_tokens",
                "cache_read_input_tokens",
                "cache_creation_5m",
                "cache_creation_1h",
                "output_tokens",
                "num_tool_use",
                "num_text_blocks",
            ],
        )
        w.writeheader()
        for r in all_rows:
            w.writerow(r.__dict__)
    print(f"[ok] wrote {len(all_rows)} per-turn rows -> {turn_csv}", file=sys.stderr)

    # per-session.csv
    sess_csv = args.out_dir / "per-session.csv"
    with sess_csv.open("w", newline="") as f:
        w = csv.DictWriter(
            f,
            fieldnames=[
                "writ_id",
                "lab_session_id",
                "transcript_file",
                "mode",
                "assistant_turns",
                "total_tool_uses",
                "multi_tool_turns",
                "max_tools_in_turn",
                "total_input_tokens",
                "total_cache_creation",
                "total_cache_creation_5m",
                "total_cache_creation_1h",
                "total_cache_read",
                "total_output_tokens",
            ],
        )
        w.writeheader()
        for _, s in all_summaries:
            w.writerow(s.__dict__)
    print(f"[ok] wrote {len(all_summaries)} per-session rows -> {sess_csv}", file=sys.stderr)

    # reconciliation.tsv
    recon_tsv = args.out_dir / "reconciliation.tsv"
    with recon_tsv.open("w") as f:
        f.write(
            "lab_session_id\tmode\tlab_input\tcomp_input\tdiff_input\t"
            "lab_cache_write\tcomp_cache_create\tdiff_cache_write\t"
            "lab_cache_read\tcomp_cache_read\tdiff_cache_read\t"
            "lab_output\tcomp_output\tdiff_output\n"
        )
        for sess, s in all_summaries:
            def diff(lab, comp):
                return f"{comp - lab:+d}"
            f.write(
                f"{sess.session_id}\t{s.mode}\t"
                f"{sess.lab_input_tokens}\t{s.total_input_tokens}\t{diff(sess.lab_input_tokens, s.total_input_tokens)}\t"
                f"{sess.lab_cache_write_tokens}\t{s.total_cache_creation}\t{diff(sess.lab_cache_write_tokens, s.total_cache_creation)}\t"
                f"{sess.lab_cache_read_tokens}\t{s.total_cache_read}\t{diff(sess.lab_cache_read_tokens, s.total_cache_read)}\t"
                f"{sess.lab_output_tokens}\t{s.total_output_tokens}\t{diff(sess.lab_output_tokens, s.total_output_tokens)}\n"
            )
    print(f"[ok] wrote reconciliation -> {recon_tsv}", file=sys.stderr)


if __name__ == "__main__":
    main()
