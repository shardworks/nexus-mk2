#!/usr/bin/env python3
"""
Compare patron agent output against Sean's actual plandoc decisions.

For each decision, classify into buckets:
  - agent=sean       — agent's selection matches what Sean selected
  - agent=planner    — agent matches planner recommendation (which Sean may
                      or may not have overridden)
  - agent=abstain    — agent set no_principle_fired: true
  - agent=custom     — agent wrote a custom_answer (compare text separately)
  - other            — agent picked something neither Sean nor planner chose

The eval signal is strongest on **override decisions** — those where
selected != recommendation, or where patron_override has text. That's where
principles have to do real work.

Usage:
    compare.py                     # print summary to stdout
    compare.py --details           # include per-divergence detail
    compare.py --json <path>       # write full comparison as JSON
"""
from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from pathlib import Path

import yaml

ROOT = Path("/workspace/nexus-mk2")
SPECS = ROOT / "specs"
OUTPUTS = ROOT / ".scratch/patron-anima-eval/agent-output"
STRIPPED = ROOT / ".scratch/patron-anima-eval/stripped"


def load_yaml(p: Path) -> dict:
    with p.open() as f:
        return yaml.safe_load(f) or {}


def classify(dec: dict, agent: dict) -> str:
    """Classify agent's answer against Sean + planner."""
    sean = dec.get("selected")
    planner = (dec.get("analysis") or {}).get("recommendation")
    has_override_text = bool(dec.get("patron_override"))

    if agent is None:
        return "missing"
    if agent.get("no_principle_fired"):
        return "abstain"

    a_sel = agent.get("selected")
    if a_sel == "custom":
        return "custom"

    # For Sean-matching: if Sean selected "custom" (with override text), the
    # agent can only match by also going custom. A letter match against the
    # letter in `selected` when `patron_override` is set would be spurious.
    if has_override_text and sean == "custom":
        if a_sel == "custom":
            return "sean-custom"
        # Agent picked a letter when Sean went custom.
        if a_sel == planner:
            return "planner"
        return "other"

    if a_sel == sean:
        return "sean"
    if a_sel == planner:
        return "planner"
    return "other"


def is_override(dec: dict) -> bool:
    """True if Sean overrode the planner on this decision."""
    sean = dec.get("selected")
    planner = (dec.get("analysis") or {}).get("recommendation")
    if dec.get("patron_override"):
        return True
    return sean is not None and planner is not None and sean != planner


def plandoc_slug_to_spec(slug: str) -> Path:
    return SPECS / slug / "decisions.yaml"


def compare_one(slug: str) -> dict:
    orig_path = plandoc_slug_to_spec(slug)
    out_path = OUTPUTS / f"{slug}.yaml"

    if not orig_path.exists():
        return {"slug": slug, "error": f"no spec at {orig_path}"}
    if not out_path.exists():
        return {"slug": slug, "error": f"no agent output at {out_path}"}

    orig = load_yaml(orig_path)
    agent = load_yaml(out_path)

    agent_by_id = {d["id"]: d for d in agent.get("decisions", []) if isinstance(d, dict)}

    results = []
    for dec in orig.get("decisions", []):
        did = dec.get("id")
        a = agent_by_id.get(did)
        cls = classify(dec, a)
        entry = {
            "id": did,
            "question": dec.get("question", ""),
            "planner": (dec.get("analysis") or {}).get("recommendation"),
            "sean": dec.get("selected"),
            "override": is_override(dec),
            "patron_override": dec.get("patron_override"),
            "agent_sel": (a or {}).get("selected"),
            "agent_custom": (a or {}).get("custom_answer"),
            "agent_conf": (a or {}).get("confidence"),
            "agent_principles": (a or {}).get("principles"),
            "agent_reasoning": (a or {}).get("reasoning"),
            "classification": cls,
        }
        results.append(entry)

    return {"slug": slug, "decisions": results}


def summarize(all_results: list[dict]) -> dict:
    total = Counter()
    override_only = Counter()
    per_plandoc = []

    for pr in all_results:
        if "error" in pr:
            per_plandoc.append({"slug": pr["slug"], "error": pr["error"]})
            continue
        row = Counter()
        ovr = Counter()
        for d in pr["decisions"]:
            cls = d["classification"]
            row[cls] += 1
            total[cls] += 1
            if d["override"]:
                ovr[cls] += 1
                override_only[cls] += 1
        per_plandoc.append({
            "slug": pr["slug"],
            "all": dict(row),
            "overrides": dict(ovr),
            "n_decisions": len(pr["decisions"]),
            "n_overrides": sum(ovr.values()),
        })

    return {
        "total": dict(total),
        "override_only": dict(override_only),
        "per_plandoc": per_plandoc,
    }


def fmt_row(counts: dict, total: int) -> str:
    buckets = ["sean", "sean-custom", "planner", "other", "abstain", "custom", "missing"]
    parts = []
    for b in buckets:
        n = counts.get(b, 0)
        if n:
            parts.append(f"{b}={n}")
    return f"(n={total})  " + "  ".join(parts) if parts else f"(n={total})"


def print_summary(summary: dict) -> None:
    total = sum(summary["total"].values())
    ovr = sum(summary["override_only"].values())

    print("=" * 78)
    print("PATRON AGENT vs SEAN — SUMMARY")
    print("=" * 78)
    print()
    print(f"All decisions:       {fmt_row(summary['total'], total)}")
    print(f"Override decisions:  {fmt_row(summary['override_only'], ovr)}")
    print()
    print("Per-plandoc:")
    print("-" * 78)
    print(f"{'slug':<50} {'n':>4} {'ovr':>4} {'=sean':>6} {'=plan':>6} {'other':>6}")
    print("-" * 78)
    for p in sorted(summary["per_plandoc"], key=lambda x: x.get("n_overrides", 0), reverse=True):
        if "error" in p:
            print(f"{p['slug']:<50} ERROR: {p['error']}")
            continue
        ovr_c = p["overrides"]
        sean_n = ovr_c.get("sean", 0) + ovr_c.get("sean-custom", 0)
        plan_n = ovr_c.get("planner", 0)
        other_n = ovr_c.get("other", 0) + ovr_c.get("abstain", 0) + ovr_c.get("custom", 0)
        print(f"{p['slug']:<50} {p['n_decisions']:>4} {p['n_overrides']:>4} "
              f"{sean_n:>6} {plan_n:>6} {other_n:>6}")


def print_details(all_results: list[dict], show: str = "override") -> None:
    """Print per-decision detail. `show` in {'override','all','divergent'}."""
    print()
    print("=" * 78)
    print(f"DETAIL — {show} decisions")
    print("=" * 78)

    for pr in all_results:
        if "error" in pr:
            continue
        rows = []
        for d in pr["decisions"]:
            if show == "override" and not d["override"]:
                continue
            if show == "divergent" and d["classification"] in ("sean", "sean-custom"):
                continue
            rows.append(d)
        if not rows:
            continue
        print()
        print(f"--- {pr['slug']} ---")
        for d in rows:
            marker = "*" if d["override"] else " "
            print(f"{marker} {d['id']}  planner={d['planner']}  sean={d['sean']}  agent={d['agent_sel']}  [{d['classification']}]")
            q = (d["question"] or "").strip().replace("\n", " ")
            print(f"    Q: {q[:140]}")
            if d["patron_override"]:
                po = d["patron_override"].strip().replace("\n", " ")
                print(f"    SEAN OVERRIDE: {po[:200]}")
            if d["agent_custom"]:
                ac = d["agent_custom"].strip().replace("\n", " ")
                print(f"    AGENT CUSTOM:  {ac[:200]}")
            if d["agent_reasoning"]:
                ar = d["agent_reasoning"].strip().replace("\n", " ")
                print(f"    AGENT REASON:  {ar[:200]}")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--details", choices=["override", "all", "divergent"], default=None,
                    help="Show per-decision detail (default: summary only)")
    ap.add_argument("--json", type=Path, default=None, help="Write full comparison as JSON")
    ap.add_argument("--slug", action="append", help="Restrict to specific slug(s)")
    args = ap.parse_args()

    if args.slug:
        slugs = args.slug
    else:
        slugs = sorted(p.stem for p in STRIPPED.glob("*.yaml"))

    all_results = [compare_one(s) for s in slugs]
    summary = summarize(all_results)

    print_summary(summary)

    if args.details:
        print_details(all_results, show=args.details)

    if args.json:
        args.json.parent.mkdir(parents=True, exist_ok=True)
        args.json.write_text(json.dumps({
            "summary": summary,
            "plandocs": all_results,
        }, indent=2, default=str))
        print(f"\nwrote {args.json}", file=sys.stderr)

    return 0


if __name__ == "__main__":
    sys.exit(main())
