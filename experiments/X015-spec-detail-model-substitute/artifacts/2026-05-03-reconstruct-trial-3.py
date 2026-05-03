#!/usr/bin/env python3
"""
Reconstruct trial 3 worktrees (Opus baseline + Sonnet trial) from
the captured commit patches against the codex base sha
03d36cb849c92d0ab434c9bd4a066716c8f50fbb. Each reconstruction
applies the patches in sequence to a fresh checkout at base, leaving
the working tree at the sealed state — a stand-in for what the trial
shipped.

Outputs:
  - 2026-05-03-trial-3-opus-reconstructed/    (8 commits)
  - 2026-05-03-trial-3-sonnet-reconstructed/  (2 commits)

Both are git worktrees on detached HEAD at the trial's sealed sha.
Use them with `git diff <base> -- <path>` style commands.
"""
import shutil
import subprocess
import sys
from pathlib import Path

NEXUS_REPO = '/workspace/nexus'
BASE_SHA = '03d36cb849c92d0ab434c9bd4a066716c8f50fbb'
HERE = Path(__file__).parent

SOURCES = [
    {
        'name': 'opus',
        'patches_dir': HERE / '2026-05-02-opus-baseline-trial3' / 'codex-history',
        'out_dir': HERE / '2026-05-03-trial-3-opus-reconstructed',
    },
    {
        'name': 'sonnet',
        'patches_dir': HERE / '2026-05-03-trial-3-extract' / 'codex-history',
        'out_dir': HERE / '2026-05-03-trial-3-sonnet-reconstructed',
    },
]


def run(cmd, cwd=None, check=True):
    return subprocess.run(cmd, cwd=cwd, check=check, capture_output=True, text=True)


def reconstruct(source):
    name = source['name']
    out = source['out_dir']
    patches_dir = source['patches_dir']

    if out.exists():
        shutil.rmtree(out)
    out.parent.mkdir(parents=True, exist_ok=True)

    print(f'[{name}] cloning {NEXUS_REPO} → {out}', file=sys.stderr)
    run(['git', 'clone', NEXUS_REPO, str(out)])
    run(['git', 'checkout', BASE_SHA], cwd=out)
    # `git am` needs a local committer identity; the cloned repo
    # inherits the user's global config but we set it explicitly to
    # keep reconstructions reproducible.
    run(['git', 'config', 'user.email', 'reconstruct@nexus-mk2.local'], cwd=out)
    run(['git', 'config', 'user.name', 'X015 Reconstruct'], cwd=out)

    patches = sorted(patches_dir.glob('*.patch'))
    if not patches:
        print(f'[{name}] no patches in {patches_dir}', file=sys.stderr)
        return
    print(f'[{name}] applying {len(patches)} patch(es)', file=sys.stderr)

    # Patches are plain `git diff` output (no commit-metadata header),
    # so `git am` rejects them. Apply each in sequence with `git apply`
    # and stage; commit at the end so the worktree mirrors the sealed
    # state and still has clean git semantics for downstream diffing.
    for p in patches:
        try:
            run(['git', 'apply', '--index', str(p)], cwd=out)
        except subprocess.CalledProcessError as e:
            print(f'[{name}] git apply failed on {p.name}: {e.stderr}', file=sys.stderr)
            sys.exit(1)

    run(['git', 'commit', '-m', f'reconstructed: {name} trial-3 sealed state'], cwd=out)

    short = run(['git', 'diff', '--shortstat', BASE_SHA], cwd=out)
    print(f'[{name}] diff vs base: {short.stdout.strip()}', file=sys.stderr)


def main():
    for source in SOURCES:
        reconstruct(source)
    print(f'\nDone. Worktrees ready for diffing:', file=sys.stderr)
    for s in SOURCES:
        print(f'  {s["name"]:8s} {s["out_dir"]}', file=sys.stderr)


if __name__ == '__main__':
    main()
