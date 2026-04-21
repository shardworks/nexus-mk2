#!/usr/bin/env python3
"""
Strip a decisions.yaml to just {id, question, options} per decision.

Drops all planner-supplied signal (recommendation, rationale, context,
confidence, stakes, analysis block, observable, audience, scope) and all
outcome fields (selected, patron_override).

Input:  path to a decisions.yaml
Output: stripped YAML to stdout (or to --out path)

Usage:
    strip-decisions.py <path-to-decisions.yaml>
    strip-decisions.py <path-to-decisions.yaml> --out <output-path>
"""
import argparse
import sys
from pathlib import Path

import yaml


KEEP_FIELDS = ("id", "question", "options")


def strip(decisions_path: Path) -> dict:
    with decisions_path.open() as f:
        data = yaml.safe_load(f)
    if not data or "decisions" not in data:
        raise ValueError(f"No 'decisions' key in {decisions_path}")
    stripped = []
    for dec in data["decisions"]:
        if not isinstance(dec, dict):
            continue
        stripped.append({k: dec.get(k) for k in KEEP_FIELDS if dec.get(k) is not None})
    return {"decisions": stripped}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("path", type=Path, help="Path to decisions.yaml")
    ap.add_argument("--out", type=Path, default=None, help="Write to path instead of stdout")
    args = ap.parse_args()

    if not args.path.exists():
        print(f"error: {args.path} does not exist", file=sys.stderr)
        return 1

    result = strip(args.path)
    rendered = yaml.dump(result, sort_keys=False, default_flow_style=False, allow_unicode=True)

    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(rendered)
        print(f"wrote {args.out}", file=sys.stderr)
    else:
        sys.stdout.write(rendered)
    return 0


if __name__ == "__main__":
    sys.exit(main())
