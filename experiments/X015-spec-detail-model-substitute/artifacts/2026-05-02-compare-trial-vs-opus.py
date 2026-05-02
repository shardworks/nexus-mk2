#!/usr/bin/env python3
"""
Compare an X015 trial's extracted output against the Opus baseline.

Inputs:
  --trial-dir  : directory produced by `nsg lab trial-extract`
                 (contains codex-history/, stacks-export/, archive/, etc.)
  --baseline   : directory produced by extract-opus-baseline.py
                 (defaults to ./2026-05-02-opus-baseline alongside this script)
  --out        : output markdown path (defaults to stdout)

Output: markdown report with side-by-side dimensions:
  - cost / turns / duration totals
  - per-engine breakdown
  - per-commit table (Sonnet vs Opus)
  - file overlap (union, intersection, only-Sonnet, only-Opus)
  - per-file churn comparison
  - terminal verdict (rig outcome)
"""
import argparse
import json
import re
import sys
from collections import defaultdict
from pathlib import Path
from yaml import safe_load


def load_commits_manifest(history_dir: Path):
    p = history_dir / 'commits-manifest.yaml'
    if not p.exists():
        return []
    return safe_load(p.read_text()).get('commits', [])


def load_patch_files(history_dir: Path):
    """Return {sha-prefix12: patch_text}."""
    out = {}
    for patch_file in sorted(history_dir.glob('*.patch')):
        # Filename: NNNN-<sha-12>.patch
        m = re.match(r'\d+-([0-9a-f]+)\.patch$', patch_file.name)
        if m:
            out[m.group(1)] = patch_file.read_text()
    return out


def parse_files_from_diff(patch_text: str):
    """Return {path: (insertions, deletions)} for files changed in a patch."""
    files = {}
    cur = None
    cur_ins = 0
    cur_dels = 0
    # Use diffstat-style parse — but we only have full diff output, so count
    # +/- lines per `diff --git` block.
    for line in patch_text.splitlines():
        m = re.match(r'^diff --git a/(.+?) b/(.+)$', line)
        if m:
            if cur is not None:
                files[cur] = (cur_ins, cur_dels)
            # Use the b/ path as the canonical (post-rename target)
            cur = m.group(2)
            cur_ins = 0
            cur_dels = 0
        elif line.startswith('+') and not line.startswith('+++'):
            cur_ins += 1
        elif line.startswith('-') and not line.startswith('---'):
            cur_dels += 1
    if cur is not None:
        files[cur] = (cur_ins, cur_dels)
    return files


def aggregate_files(commits, patches):
    """Given commits manifest + {sha12: patch}, return {path: (total_ins, total_dels, commit_count)}."""
    out = defaultdict(lambda: [0, 0, 0])
    for c in commits:
        sha12 = c['sha'][:12]
        patch = patches.get(sha12, '')
        for path, (ins, dels) in parse_files_from_diff(patch).items():
            out[path][0] += ins
            out[path][1] += dels
            out[path][2] += 1
    return {p: tuple(v) for p, v in out.items()}


def load_trial_sessions(stacks_dir: Path):
    """Read the test guild's sessions + transcripts from the trial's
    extracted stacks-export. Returns the same shape as the Opus baseline's
    session-summary.json."""
    # Find the sessions file. Naming uses owner__book (e.g. animator__sessions.json).
    sessions_path = None
    transcripts_path = None
    for f in stacks_dir.iterdir():
        if f.name.endswith('sessions.json'):
            sessions_path = f
        elif f.name.endswith('transcripts.json'):
            transcripts_path = f

    if sessions_path is None:
        return None

    sessions = json.loads(sessions_path.read_text())
    transcripts = {}
    if transcripts_path:
        for t in json.loads(transcripts_path.read_text()):
            sid = t.get('sessionId')
            if sid:
                transcripts[sid] = t

    # Enrich with turn count and model
    summary_sessions = []
    for s in sessions:
        sid = s['id']
        meta = s.get('metadata', {}) or {}
        engine_id = meta.get('engineId')
        t = transcripts.get(sid, {})
        msgs = t.get('messages', [])
        asst = [m for m in msgs if m.get('type') == 'assistant']
        turns = len(asst)
        model = asst[0].get('message', {}).get('model') if asst else None
        summary_sessions.append({
            'id': sid,
            'engineId': engine_id,
            'costUsd': s.get('costUsd') or 0,
            'durationMs': s.get('durationMs') or 0,
            'turns': turns,
            'model': model,
            'startedAt': s.get('startedAt'),
            'exitCode': s.get('exitCode'),
        })

    by_engine = {}
    for s in summary_sessions:
        eng = s['engineId'] or '(none)'
        agg = by_engine.setdefault(eng, {
            'sessionCount': 0, 'costUsd': 0, 'durationMs': 0, 'turns': 0,
            'attemptOutcomes': []
        })
        agg['sessionCount'] += 1
        agg['costUsd'] += s['costUsd']
        agg['durationMs'] += s['durationMs']
        agg['turns'] += s['turns']
        agg['attemptOutcomes'].append({'sessionId': s['id'], 'exitCode': s['exitCode'], 'model': s['model']})

    return {
        'sessions': summary_sessions,
        'totals': {
            'sessionCount': len(summary_sessions),
            'costUsd': sum(s['costUsd'] for s in summary_sessions),
            'durationMs': sum(s['durationMs'] for s in summary_sessions),
            'turns': sum(s['turns'] for s in summary_sessions),
        },
        'byEngine': by_engine,
    }


def fmt_duration(ms: int) -> str:
    if ms is None or ms <= 0:
        return '—'
    minutes = ms / 60000
    if minutes < 60:
        return f'{minutes:.1f}m'
    return f'{minutes/60:.1f}h'


def render_markdown(opus, sonnet, trial_id, opus_writ_id):
    out = []
    out.append(f'# X015 trial 1 — Sonnet vs Opus comparison\n')
    out.append(f'- **Trial:** `{trial_id}` (Sonnet implementer + Opus reviewer)')
    out.append(f'- **Baseline:** `{opus_writ_id}` (all-Opus, Apr 23)\n')

    # ── Overall totals
    o = opus['session_summary']['totals']
    s = sonnet['session_summary']['totals'] if sonnet['session_summary'] else None
    out.append('## Totals\n')
    if s:
        out.append('| Metric          | Opus baseline       | Sonnet trial        | Δ                       |')
        out.append('|-----------------|---------------------|---------------------|-------------------------|')
        out.append(f'| Sessions        | {o["sessionCount"]:>19} | {s["sessionCount"]:>19} | {s["sessionCount"]-o["sessionCount"]:+d} |')
        cost_delta_pct = ((s["costUsd"]/o["costUsd"]) - 1) * 100 if o["costUsd"] else 0
        out.append(f'| Cost            | ${o["costUsd"]:>17.2f}  | ${s["costUsd"]:>17.2f}  | {cost_delta_pct:+.0f}% |')
        out.append(f'| Total turns     | {o["turns"]:>19} | {s["turns"]:>19} | {s["turns"]-o["turns"]:+d} |')
        out.append(f'| Wall duration   | {fmt_duration(o["durationMs"]):>19} | {fmt_duration(s["durationMs"]):>19} | — |')
    else:
        out.append('Sonnet session summary not available — trial may still be running.')
    out.append('')

    # ── Per-engine breakdown
    out.append('## Per-engine cost\n')
    if s:
        out.append('| Engine               | Opus sessions / cost / turns | Sonnet sessions / cost / turns |')
        out.append('|----------------------|------------------------------|--------------------------------|')
        engines = sorted(set(opus['session_summary']['byEngine']) | set(sonnet['session_summary']['byEngine']))
        for eng in engines:
            o_agg = opus['session_summary']['byEngine'].get(eng, {})
            s_agg = sonnet['session_summary']['byEngine'].get(eng, {})
            o_str = f'{o_agg.get("sessionCount", 0)} / ${o_agg.get("costUsd", 0):.2f} / {o_agg.get("turns", 0)}' if o_agg else '—'
            s_str = f'{s_agg.get("sessionCount", 0)} / ${s_agg.get("costUsd", 0):.2f} / {s_agg.get("turns", 0)}' if s_agg else '—'
            out.append(f'| {eng:<20} | {o_str:<28} | {s_str:<30} |')
    out.append('')

    # ── Commits comparison
    out.append('## Commits\n')
    out.append(f'- **Opus:** {len(opus["commits"])} commits')
    out.append(f'- **Sonnet:** {len(sonnet["commits"])} commits\n')
    out.append('| # | Opus subject | Sonnet subject |')
    out.append('|---|--------------|----------------|')
    n = max(len(opus['commits']), len(sonnet['commits']))
    for i in range(n):
        oc = opus['commits'][i]['message'][:80] if i < len(opus['commits']) else '—'
        sc = sonnet['commits'][i]['message'][:80] if i < len(sonnet['commits']) else '—'
        out.append(f'| {i} | {oc} | {sc} |')
    out.append('')

    # ── File overlap
    o_files = opus['files']
    s_files = sonnet['files']
    only_opus = sorted(set(o_files) - set(s_files))
    only_sonnet = sorted(set(s_files) - set(o_files))
    both = sorted(set(o_files) & set(s_files))
    out.append('## File overlap\n')
    out.append(f'- **Both touched:** {len(both)}')
    out.append(f'- **Only Opus:** {len(only_opus)}')
    out.append(f'- **Only Sonnet:** {len(only_sonnet)}')
    out.append(f'- **Total Opus:** {len(o_files)}')
    out.append(f'- **Total Sonnet:** {len(s_files)}\n')

    if only_opus:
        out.append('### Files only Opus touched (Sonnet missed?)\n')
        for p in only_opus:
            ins, dels, n = o_files[p]
            out.append(f'- `{p}` (+{ins} -{dels}, {n} commits)')
        out.append('')
    if only_sonnet:
        out.append('### Files only Sonnet touched (extra work or different approach?)\n')
        for p in only_sonnet:
            ins, dels, n = s_files[p]
            out.append(f'- `{p}` (+{ins} -{dels}, {n} commits)')
        out.append('')

    # ── Per-file churn comparison (intersection)
    out.append('### Files both touched — per-file churn\n')
    out.append('| File | Opus +/- | Sonnet +/- | Δ ins | Δ dels |')
    out.append('|------|----------|------------|-------|--------|')
    rows = []
    for p in both:
        oi, od, _ = o_files[p]
        si, sd, _ = s_files[p]
        rows.append((p, oi, od, si, sd))
    # Sort by absolute Opus churn (to show biggest files first)
    rows.sort(key=lambda r: -(r[1] + r[2]))
    for p, oi, od, si, sd in rows[:30]:
        out.append(f'| `{p}` | +{oi}/-{od} | +{si}/-{sd} | {si-oi:+d} | {sd-od:+d} |')
    if len(rows) > 30:
        out.append(f'\n*({len(rows)-30} more files truncated for brevity)*')
    out.append('')

    return '\n'.join(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--trial-dir', required=True, help='Output dir from `nsg lab trial-extract`.')
    ap.add_argument('--baseline', default=None, help='Opus baseline dir (default: 2026-05-02-opus-baseline alongside this script)')
    ap.add_argument('--out', default=None, help='Markdown output path (default: stdout)')
    ap.add_argument('--trial-id', default=None, help='Trial writ id label for the report (default: read from trial-context.yaml)')
    ap.add_argument('--opus-writ-id', default='w-mod6458g-992589fcce60')
    args = ap.parse_args()

    here = Path(__file__).parent
    baseline = Path(args.baseline) if args.baseline else here / '2026-05-02-opus-baseline'
    trial = Path(args.trial_dir)

    # Opus side
    opus_history = baseline / 'codex-history'
    opus_commits = load_commits_manifest(opus_history)
    opus_patches = load_patch_files(opus_history)
    opus_files = aggregate_files(opus_commits, opus_patches)
    opus_session = json.loads((baseline / 'session-summary.json').read_text())

    # Sonnet (trial) side
    trial_history = trial / 'codex-history'
    sonnet_commits = load_commits_manifest(trial_history)
    sonnet_patches = load_patch_files(trial_history)
    sonnet_files = aggregate_files(sonnet_commits, sonnet_patches)
    trial_stacks = trial / 'stacks-export'
    sonnet_session = load_trial_sessions(trial_stacks) if trial_stacks.exists() else None

    # Trial id
    trial_id = args.trial_id
    if not trial_id:
        ctx_path = trial / 'trial-context.yaml'
        if ctx_path.exists():
            ctx = safe_load(ctx_path.read_text())
            trial_id = ctx.get('writId', '<unknown>')
        else:
            trial_id = '<unknown>'

    md = render_markdown(
        opus={'commits': opus_commits, 'files': opus_files, 'session_summary': opus_session},
        sonnet={'commits': sonnet_commits, 'files': sonnet_files, 'session_summary': sonnet_session},
        trial_id=trial_id,
        opus_writ_id=args.opus_writ_id,
    )

    if args.out:
        Path(args.out).write_text(md)
        print(f'Wrote {args.out}', file=sys.stderr)
    else:
        print(md)


if __name__ == '__main__':
    main()
