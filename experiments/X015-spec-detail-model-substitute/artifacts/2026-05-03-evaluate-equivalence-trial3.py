#!/usr/bin/env python3
"""
Evaluate semantic equivalence of Sonnet's trial 3 work vs Opus's
baseline. For each file in (Opus-touched ∪ Sonnet-touched):
  - Classify: O-only / S-only / both
  - For "both" files: byte-identical vs whitespace-only vs substantive
  - For substantive: per-side unique-line count after normalization

Outputs a markdown report on stdout.

Mirrors the trial-2 evaluator (2026-05-02-evaluate-equivalence.py) so
the analyses are directly comparable.
"""
import re
import subprocess
import sys
from pathlib import Path

OPUS_DIR = Path('/workspace/nexus-mk2/experiments/X015-spec-detail-model-substitute/artifacts/2026-05-03-trial-3-opus-reconstructed')
SONNET_DIR = Path('/workspace/nexus-mk2/experiments/X015-spec-detail-model-substitute/artifacts/2026-05-03-trial-3-sonnet-reconstructed')
BASE_SHA = '03d36cb849c92d0ab434c9bd4a066716c8f50fbb'

ARTIFACT_PATTERNS = [
    re.compile(r'tsconfig\.tsbuildinfo$'),
    re.compile(r'^node_modules/'),
    re.compile(r'^coverage/'),
    re.compile(r'^dist/'),
]


def is_artifact(path: str) -> bool:
    return any(p.search(path) for p in ARTIFACT_PATTERNS)


def files_touched(repo: Path):
    out = subprocess.check_output(
        ['git', '-C', str(repo), 'diff', '--name-only', BASE_SHA],
        text=True,
    )
    return [p for p in out.splitlines() if p and not is_artifact(p)]


def file_at(repo: Path, path: str):
    f = repo / path
    if not f.exists():
        return None
    try:
        return f.read_text()
    except Exception:
        return None


def normalize_for_stylistic_check(text: str) -> str:
    return '\n'.join(line.rstrip() for line in text.splitlines())


def line_set_diff(a: str, b: str):
    a_lines = [line.rstrip() for line in a.splitlines() if line.strip()]
    b_lines = [line.rstrip() for line in b.splitlines() if line.strip()]
    sa, sb = set(a_lines), set(b_lines)
    only_a = [line for line in a_lines if line not in sb]
    only_b = [line for line in b_lines if line not in sa]
    seen_a, oa = set(), []
    for line in only_a:
        if line not in seen_a:
            oa.append(line); seen_a.add(line)
    seen_b, ob = set(), []
    for line in only_b:
        if line not in seen_b:
            ob.append(line); seen_b.add(line)
    return oa, ob


def file_diff_stats(opus_text, sonnet_text):
    if opus_text is None and sonnet_text is None:
        return 'absent-both', 0, 0
    if opus_text == sonnet_text:
        return 'identical', 0, 0
    if normalize_for_stylistic_check(opus_text or '') == normalize_for_stylistic_check(sonnet_text or ''):
        return 'whitespace-only', 0, 0

    only_o, only_s = line_set_diff(opus_text or '', sonnet_text or '')
    return 'differ', len(only_o), len(only_s)


def gen_summary(opus_files, sonnet_files):
    union = sorted(set(opus_files) | set(sonnet_files))
    rows = []
    for path in union:
        in_o = path in opus_files
        in_s = path in sonnet_files
        opus_text = file_at(OPUS_DIR, path) if in_o else None
        sonnet_text = file_at(SONNET_DIR, path) if in_s else None

        if in_o and not in_s:
            rows.append({'path': path, 'side': 'opus-only', 'status': '—'})
        elif in_s and not in_o:
            rows.append({'path': path, 'side': 'sonnet-only', 'status': '—'})
        else:
            status, n_only_o, n_only_s = file_diff_stats(opus_text, sonnet_text)
            rows.append({
                'path': path, 'side': 'both', 'status': status,
                'only_opus_lines': n_only_o, 'only_sonnet_lines': n_only_s,
            })
    return rows


def render_report(rows):
    out = []
    out.append('# X015 trial 3 — equivalence evaluation\n')
    out.append('Comparing Sonnet (trial 3) vs Opus (baseline) post-state files,')
    out.append(f'both rebuilt from base `{BASE_SHA[:12]}`. Lines normalized to ignore')
    out.append('trailing whitespace; "differ" status + line counts capture')
    out.append('substantive divergence.\n')

    both = [r for r in rows if r['side'] == 'both']
    opus_only = [r for r in rows if r['side'] == 'opus-only']
    sonnet_only = [r for r in rows if r['side'] == 'sonnet-only']

    identical = [r for r in both if r['status'] == 'identical']
    whitespace = [r for r in both if r['status'] == 'whitespace-only']
    differ = [r for r in both if r['status'] == 'differ']

    out.append('## Summary')
    out.append('')
    out.append(f'- **Files Opus touched:**     {len([r for r in rows if r["side"] != "sonnet-only"])}')
    out.append(f'- **Files Sonnet touched:**   {len([r for r in rows if r["side"] != "opus-only"])}')
    out.append(f'- **Both touched:**           {len(both)}')
    out.append(f'  - **Byte-identical:**       {len(identical)}')
    out.append(f'  - **Whitespace-only diff:** {len(whitespace)}')
    out.append(f'  - **Substantive diff:**     {len(differ)}')
    out.append(f'- **Opus-only (Sonnet missed):**  {len(opus_only)}')
    out.append(f'- **Sonnet-only (extra work):**   {len(sonnet_only)}')
    out.append('')

    if identical:
        out.append('## Byte-identical between Opus and Sonnet\n')
        for r in identical:
            out.append(f'- `{r["path"]}`')
        out.append('')
    if whitespace:
        out.append('## Whitespace-only differences\n')
        for r in whitespace:
            out.append(f'- `{r["path"]}`')
        out.append('')

    out.append('## Substantive divergences (per-file)\n')
    out.append('Line counts are unique-to-each-side after normalization.\n')
    out.append('| File | only-Opus lines | only-Sonnet lines |')
    out.append('|------|----------------:|------------------:|')
    for r in sorted(differ, key=lambda x: -(x['only_opus_lines'] + x['only_sonnet_lines'])):
        out.append(f'| `{r["path"]}` | {r["only_opus_lines"]} | {r["only_sonnet_lines"]} |')
    out.append('')

    if opus_only:
        out.append('## Files only Opus touched (Sonnet missed)\n')
        for r in opus_only:
            out.append(f'- `{r["path"]}`')
        out.append('')

    if sonnet_only:
        out.append('## Files only Sonnet touched (extra work)\n')
        for r in sonnet_only:
            out.append(f'- `{r["path"]}`')
        out.append('')

    return '\n'.join(out)


def main():
    opus_files = set(files_touched(OPUS_DIR))
    sonnet_files = set(files_touched(SONNET_DIR))
    rows = gen_summary(opus_files, sonnet_files)
    report = render_report(rows)
    print(report)


if __name__ == '__main__':
    main()
