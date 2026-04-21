#!/usr/bin/env python3
"""
Catalog all commission briefs and classify by "thinness."

Thinness measures:
  - char count (body, excluding boilerplate footer)
  - markdown heading count
  - sentence count (crude)

Filters (exclude from candidate list):
  - TEST / PROBE posts (commission-post tests)
  - STUB-BODY references (body-lives-elsewhere pointers)
  - XML-ONLY posts (task/piece blocks that aren't petitions)
  - PURE BUG REPORTS (detectable by headers like "Bug:", "Fix:",
    or verbatim "X does not work" single-issue descriptions)

Output: TSV to stdout and a markdown-rendered catalog.
"""
from __future__ import annotations

import argparse
import re
import sys
from dataclasses import dataclass
from pathlib import Path

BOILERPLATE_RE = re.compile(
    r'\n---\s*\n\*\*Important:\*\*.*', flags=re.DOTALL
)
XML_BLOCK_RE = re.compile(r'^<\s*task\b|^<\s*piece\b', flags=re.IGNORECASE)
BUG_LEAD_RE = re.compile(
    r'^\s*(bug:|fix:|the [^.]*(does not work|is broken|fails|flickers|404|crashes|throws))',
    flags=re.IGNORECASE | re.MULTILINE,
)
TEST_RE = re.compile(r'\btest(ing)?\b.*\bcommission[-_]post\b', flags=re.IGNORECASE)
STUB_RE = re.compile(r'\bstub body\b', flags=re.IGNORECASE)


@dataclass
class Brief:
    id: str
    chars: int
    headings: int
    sentences: int
    category: str
    rejected: str | None
    content: str

    def title(self) -> str:
        # Use first heading or first line
        for line in self.content.splitlines():
            m = re.match(r'^#{1,6}\s+(.*)', line)
            if m:
                return m.group(1).strip()
        for line in self.content.splitlines():
            s = line.strip()
            if s:
                return s[:80]
        return "(empty)"


def classify(content: str) -> tuple[str, str | None]:
    """Return (category, reject_reason_or_none)."""
    c = content.strip()

    if TEST_RE.search(c) and len(c) < 120:
        return "test-probe", "test/probe post"
    if STUB_RE.search(c):
        return "stub-body", "body lives elsewhere"
    if XML_BLOCK_RE.match(c):
        return "xml-task", "XML task block, not a petition"

    # Pure bug report heuristic: starts with bug/fix lead AND is short
    if BUG_LEAD_RE.match(c) and len(c) < 700:
        return "bug-fix", None  # keep, but flag

    # Default: petition-like
    return "petition", None


def analyze(path: Path) -> Brief | None:
    try:
        raw = path.read_text()
    except Exception:
        return None
    body = BOILERPLATE_RE.sub('', raw).strip()
    if not body:
        return None
    chars = len(body)
    headings = len(re.findall(r'^#{1,6}\s', body, flags=re.MULTILINE))
    sentences = len(re.findall(r'[.!?]\s', body)) + (1 if body and body[-1] in '.!?' else 0)
    category, reject = classify(body)
    return Brief(
        id=path.parent.name,
        chars=chars,
        headings=headings,
        sentences=sentences,
        category=category,
        rejected=reject,
        content=body,
    )


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--root",
        type=Path,
        default=Path("/workspace/nexus-mk2/experiments/data/commissions"),
    )
    ap.add_argument("--max-chars", type=int, default=1200, help="Thin-brief threshold")
    ap.add_argument("--format", choices=("tsv", "md"), default="md")
    args = ap.parse_args()

    briefs = []
    for cm in args.root.rglob("commission.md"):
        b = analyze(cm)
        if b:
            briefs.append(b)
    briefs.sort(key=lambda b: b.chars)

    # Partition
    thin = [b for b in briefs if b.chars <= args.max_chars]
    rejected = [b for b in thin if b.rejected]
    petitions = [b for b in thin if not b.rejected and b.category == "petition"]
    bugs = [b for b in thin if not b.rejected and b.category == "bug-fix"]

    if args.format == "tsv":
        print("chars\theadings\tsent\tcategory\treject\tid\ttitle")
        for b in thin:
            print(f"{b.chars}\t{b.headings}\t{b.sentences}\t{b.category}\t{b.rejected or ''}\t{b.id}\t{b.title()}")
        return 0

    # Markdown format
    print(f"# Thin-Brief Catalog (char-count ≤ {args.max_chars})\n")
    print(f"Total briefs scanned: {len(briefs)}")
    print(f"Thin: {len(thin)}  |  Petitions: {len(petitions)}  |  Bug-fixes: {len(bugs)}  |  Rejected (test/stub/xml): {len(rejected)}\n")

    def section(title: str, items: list[Brief]) -> None:
        print(f"\n## {title} ({len(items)})\n")
        print("| chars | hdrs | id | title |")
        print("|---:|---:|---|---|")
        for b in items:
            t = b.title().replace('|', '\\|')
            print(f"| {b.chars} | {b.headings} | `{b.id}` | {t} |")

    section("Petitions — candidates for Eval A", petitions)
    section("Bug fixes — narrower fleshing room, lower priority for Eval A", bugs)
    if rejected:
        section("Rejected (test / stub / XML-task)", rejected)

    return 0


if __name__ == "__main__":
    sys.exit(main())
