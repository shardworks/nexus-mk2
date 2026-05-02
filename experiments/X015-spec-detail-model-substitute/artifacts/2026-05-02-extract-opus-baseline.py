#!/usr/bin/env python3
"""
Extract Opus baseline data for the Clerk refactor commission
(vibers writ w-mod6458g-992589fcce60). This is the "control arm"
for X015 trial 1 — the original all-Opus run we're comparing
Sonnet's work against.

Captures, into <artifacts>/2026-05-02-opus-baseline/:
  - commits-manifest.yaml    Per-commit sha, subject, files, ins, dels.
  - NNNN-<sha-12>.patch      One file per commit, full git show output.
  - session-summary.json     Cost, tokens, turns, duration from vibers DB.

Naming mirrors lab.probe-git-range so the comparison script can read
both sides with the same code path.

Run anytime — pure read against vibers DB and /workspace/nexus.
"""
import sqlite3
import json
import subprocess
import sys
from pathlib import Path
from yaml import safe_dump

VIBERS_DB = '/workspace/vibers/.nexus/nexus.db'
NEXUS_REPO = '/workspace/nexus'

WRIT_ID = 'w-mod6458g-992589fcce60'
# The rig drafted from d871dd76, sealed into main. At seal time main had
# advanced 11 unrelated commits past d871dd76 (clockworks Pillar 5, etc.),
# so post-seal the writ's commits appear in main parented to 81b309e
# rather than d871dd76. The diff *content* of each writ commit is
# preserved by the rebase — we enumerate only the 8 writ-authored
# commits via the author email filter.
RIG_FORK_SHA = 'd871dd76cd56f9236a8866952081b22f8dbcfa30'   # what the rig actually forked from
WRIT_AUTHOR_EMAIL = f'{WRIT_ID}@nexus.local'

OUT = Path(__file__).parent / '2026-05-02-opus-baseline'


def git(args, cwd=NEXUS_REPO):
    return subprocess.check_output(['git', '-C', cwd, *args], text=True)


def patch_filename(sequence: int, sha: str) -> str:
    return f'{sequence:04d}-{sha[:12]}.patch'


def extract_commits():
    OUT.mkdir(parents=True, exist_ok=True)
    history_dir = OUT / 'codex-history'
    history_dir.mkdir(exist_ok=True)

    # Enumerate commits authored by the writ, oldest first. Mirrors
    # how lab.probe-git-range extracts the trial's commits — sorted by
    # ancestry/time, one row per commit.
    raw = git(['log', '--all', '--reverse',
               '--author=' + WRIT_AUTHOR_EMAIL,
               '--pretty=format:%H']).strip()
    shas = raw.split('\n') if raw else []
    print(f'Writ-authored commits: {len(shas)}', file=sys.stderr)

    manifest_commits = []
    for i, sha in enumerate(shas):
        message = git(['show', '--no-patch', '--format=%B', sha]).rstrip('\n')
        shortstat = git(['log', '-1', '--shortstat', '--format=', sha]).strip()
        # Parse "N files changed, M insertions(+), K deletions(-)"
        import re
        files = int(re.search(r'(\d+)\s+files?\s+changed', shortstat).group(1)) if re.search(r'files?\s+changed', shortstat) else 0
        ins = int(re.search(r'(\d+)\s+insertions?', shortstat).group(1)) if re.search(r'insertions?', shortstat) else 0
        dels = int(re.search(r'(\d+)\s+deletions?', shortstat).group(1)) if re.search(r'deletions?', shortstat) else 0

        diff = git(['show', '--patch', '--format=%H%n', sha])
        diff = re.sub(rf'^{sha}\n', '', diff, count=1)

        patch_name = patch_filename(i, sha)
        (history_dir / patch_name).write_text(diff)

        manifest_commits.append({
            'sequence': i,
            'sha': sha,
            'message': message.split('\n')[0],
            'filesChanged': files,
            'insertions': ins,
            'deletions': dels,
            'patchFile': patch_name,
        })

    manifest_path = history_dir / 'commits-manifest.yaml'
    manifest_path.write_text(safe_dump({'commits': manifest_commits}, sort_keys=False))
    print(f'Wrote {manifest_path}', file=sys.stderr)
    return manifest_commits


def extract_session_summary():
    """Pull the implement session(s) and aggregate cost/tokens/turns."""
    con = sqlite3.connect(VIBERS_DB)
    cur = con.cursor()

    # Find the rig
    cur.execute("""
      SELECT json_extract(content, '$.id') FROM books_spider_rigs
      WHERE json_extract(content, '$.writId')=?
    """, (WRIT_ID,))
    rig_id = cur.fetchone()[0]

    # Find sessions for this writ
    cur.execute("""
      SELECT json_extract(s.content, '$.id') as id,
             json_extract(s.content, '$.metadata.engineId') as engineId,
             json_extract(s.content, '$.costUsd') as costUsd,
             json_extract(s.content, '$.durationMs') as durationMs,
             json_extract(s.content, '$.tokenUsage.outputTokens') as out,
             json_extract(s.content, '$.tokenUsage.cacheReadTokens') as cr,
             json_extract(s.content, '$.startedAt') as startedAt,
             json_extract(s.content, '$.exitCode') as exitCode
      FROM books_animator_sessions s
      WHERE json_extract(s.content, '$.metadata.writId')=?
      ORDER BY startedAt
    """, (WRIT_ID,))
    sessions = [dict(zip([d[0] for d in cur.description], r)) for r in cur.fetchall()]

    # Add turn count and model from each transcript
    for s in sessions:
        cur.execute("SELECT content FROM books_animator_transcripts WHERE id=?", (s['id'],))
        r = cur.fetchone()
        if not r:
            s['turns'] = None
            s['model'] = None
            continue
        t = json.loads(r[0])
        msgs = t.get('messages', [])
        asst = [m for m in msgs if m.get('type') == 'assistant']
        s['turns'] = len(asst)
        s['model'] = asst[0].get('message', {}).get('model') if asst else None

    summary = {
        'writId': WRIT_ID,
        'rigId': rig_id,
        'rigForkSha': RIG_FORK_SHA,
        'sessions': sessions,
        'totals': {
            'costUsd': sum(s['costUsd'] or 0 for s in sessions),
            'durationMs': sum(s['durationMs'] or 0 for s in sessions),
            'turns': sum(s['turns'] or 0 for s in sessions),
            'sessionCount': len(sessions),
        },
        'byEngine': {},
    }
    # Aggregate by engine
    for s in sessions:
        eng = s.get('engineId') or '(none)'
        agg = summary['byEngine'].setdefault(eng, {
            'sessionCount': 0, 'costUsd': 0, 'durationMs': 0, 'turns': 0,
            'attemptOutcomes': []
        })
        agg['sessionCount'] += 1
        agg['costUsd'] += s['costUsd'] or 0
        agg['durationMs'] += s['durationMs'] or 0
        agg['turns'] += s['turns'] or 0
        agg['attemptOutcomes'].append({'sessionId': s['id'], 'exitCode': s['exitCode'], 'model': s['model']})

    OUT.mkdir(parents=True, exist_ok=True)
    out_path = OUT / 'session-summary.json'
    out_path.write_text(json.dumps(summary, indent=2))
    print(f'Wrote {out_path}', file=sys.stderr)
    return summary


def main():
    print('=== Extracting Opus baseline for X015 trial 1 ===', file=sys.stderr)
    commits = extract_commits()
    summary = extract_session_summary()
    print(f'\nDone. {len(commits)} commits, '
          f'{summary["totals"]["sessionCount"]} sessions, '
          f'${summary["totals"]["costUsd"]:.2f} total cost, '
          f'{summary["totals"]["turns"]} total turns.', file=sys.stderr)


if __name__ == '__main__':
    main()
