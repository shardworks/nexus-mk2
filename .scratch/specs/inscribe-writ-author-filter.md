# Inscribe — Filter Scoring by Writ Author

Companion to the anima-git-identity commission. Once anima sessions produce commits with per-writ git emails (`{writId}@nexus.local`), inscribe's quality scoring should filter by author to isolate the commission's commits from unrelated changes in the same range.

## Problem

Inscribe records `BASE_COMMIT` (bare clone HEAD before dispatch) and `HEAD_COMMIT` (after dispatch), then diffs the full range. Any commits pushed to the bare clone during dispatch — by the patron, other commissions, or manual work — bleed into the range. This has caused "unrelated files in diff" noise in at least 2-3 quality reviews.

## Change

Update inscribe's scoring phase (Phase 5) to filter commits by the writ's git email. Instead of passing the full `BASE..HEAD` range to the quality scorer, extract only the commits authored by `{WRIT_ID}@nexus.local`:

```bash
# Get only commits authored by this writ
WRIT_COMMITS=$(git -C "$BARE_CLONE" log --author="${WRIT_ID}@nexus.local" --format="%H" "${BASE_COMMIT}..${HEAD_COMMIT}")
```

If commits are found, pass them (or derive a tighter range) to `quality-review-full.sh`. If no commits match the writ author — e.g. the commission predates the git identity feature — fall back to the current `BASE..HEAD` behavior for backward compatibility.

## Files

- `bin/inscribe.sh` — update Phase 5 to filter by writ author
- `bin/quality-review-full.sh` — may need to accept a commit list instead of (or in addition to) a range; check its interface and adjust if needed

## Notes

This change only matters once the anima-git-identity commission lands in the nexus framework. Before that, all commits use the host's global git identity and author filtering won't match. The fallback behavior ensures inscribe keeps working in the interim.
