# Eval A — Reliability Report (n=3)

Signature-pattern match across 3 reps per (brief × agent). 
A ✓ means the rep's output contained at least one phrase capturing the key semantic move we observed in rep-1.

**How to read:** flesh `3/3` on a row means the principle fires reliably. 
Baseline `0/3` on the same row means baseline never made the move. 
Baseline `2/3` would mean Opus sometimes makes the move unprompted, which narrows the principle's credit.

| brief | signature move | flesh | baseline |
|---|---|:---:|:---:|
| cli-flag-edit | complete-the-set — widen beyond just --title | ● ● ●  (3/3) | ○ ○ ○  (0/3) |
| plugin-writ-types | fail-loud on plugin-vs-plugin id collision | ● ● ●  (3/3) | ○ ● ●  (2/3) |
| writs-page-width | (tie expected — no strong reframe) | ● ○ ○  (1/3) | ○ ○ ○  (0/3) |
| engine-refresh-bug | widen to sibling surfaces / fix the source | ● ● ●  (3/3) | ○ ○ ●  (1/3) |
| session-viewing | extend spider, not new page / one streaming bug | ● ● ●  (3/3) | ○ ○ ○  (0/3) |
| running-rig-view | content-bearing loading + fail-loud on disconnect | ● ● ●  (3/3) | ○ ○ ○  (0/3) |
| session-provider | engine produces its own yields / pull on resume | ● ● ●  (3/3) | ○ ○ ○  (0/3) |
| ghost-config | reject-the-framing — delete now, not after retirement | ● ● ●  (3/3) | ○ ○ ○  (0/3) |

## Principle citation density (flesh only)

Count of inline `#N` citations per rep. Stable density suggests principles are being applied, not just randomly invoked.

| brief | rep-1 cites | rep-2 cites | rep-3 cites |
|---|:---:|:---:|:---:|
| cli-flag-edit | 16 | 15 | 13 |
| plugin-writ-types | 28 | 22 | 24 |
| writs-page-width | 7 | 7 | 8 |
| engine-refresh-bug | 12 | 8 | 9 |
| session-viewing | 21 | 20 | 22 |
| running-rig-view | 20 | 15 | 11 |
| session-provider | 18 | 16 | 14 |
| ghost-config | 9 | 8 | 8 |

## Character count per rep

| brief | flesh 1 | flesh 2 | flesh 3 | baseline 1 | baseline 2 | baseline 3 |
|---|---:|---:|---:|---:|---:|---:|
| cli-flag-edit | 4486 | 4432 | 4867 | 4110 | 4574 | 4653 |
| plugin-writ-types | 5902 | 7034 | 6544 | 5331 | 4616 | 5709 |
| writs-page-width | 5159 | 5019 | 4364 | 4435 | 4662 | 4609 |
| engine-refresh-bug | 5443 | 5079 | 6978 | 5186 | 4615 | 4852 |
| session-viewing | 5930 | 6879 | 7199 | 5806 | 5592 | 6315 |
| running-rig-view | 7158 | 5937 | 6247 | 4501 | 5400 | 5124 |
| session-provider | 6935 | 5964 | 5677 | 8026 | 5870 | 6532 |
| ghost-config | 5370 | 5556 | 5205 | 4269 | 4585 | 4520 |

## Match details

Which signature phrases matched per (brief × agent × rep). Helps sanity-check whether the pattern captured the real move or a lexical coincidence.


### cli-flag-edit — _complete-the-set — widen beyond just --title_

Patterns: `complete the set | all\s+(user-?)?editable | audit\s+(the\s+)?(user-?)?editable | sibling(s)?\s+(flag|operation|field) | coherent set | #\s*36\b`

| agent | rep-1 | rep-2 | rep-3 |
|---|---|---|---|
| patron-flesh | `#\s*36\b` | `#\s*36\b` | `#\s*36\b` |
| patron-baseline | — | — | — |

### plugin-writ-types — _fail-loud on plugin-vs-plugin id collision_

Patterns: `(throw|fail|error).{0,60}(collision|duplicate|conflict) | (collision|duplicate|conflict).{0,60}(throw|fail|error) | both plugin ids named | no\s+silent\s+(shadowing|fallback)`

| agent | rep-1 | rep-2 | rep-3 |
|---|---|---|---|
| patron-flesh | `(throw|fail|error).{0,60}(collision|dupl`, `both plugin ids named` | `(throw|fail|error).{0,60}(collision|dupl`, `(collision|duplicate|conflict).{0,60}(th` | `(throw|fail|error).{0,60}(collision|dupl` |
| patron-baseline | — | `(collision|duplicate|conflict).{0,60}(th` | `(throw|fail|error).{0,60}(collision|dupl`, `both plugin ids named` |

### writs-page-width — _(tie expected — no strong reframe)_

Patterns: `separate conformance | not.*sweep.*other | follow-?up\s+petition`

| agent | rep-1 | rep-2 | rep-3 |
|---|---|---|---|
| patron-flesh | `separate conformance` | — | — |
| patron-baseline | — | — | — |

### engine-refresh-bug — _widen to sibling surfaces / fix the source_

Patterns: `sibling.*(refresh|polling|render|view) | shared.*(polling|refresh|render)\s+helper | fix\s+(it\s+)?once | fix\s+the\s+source | treating the symptom | #\s*31\b`

| agent | rep-1 | rep-2 | rep-3 |
|---|---|---|---|
| patron-flesh | `sibling.*(refresh|polling|render|view)`, `shared.*(polling|refresh|render)\s+helpe` | `fix\s+the\s+source`, `#\s*31\b` | `fix\s+the\s+source`, `#\s*31\b` |
| patron-baseline | — | — | `fix\s+(it\s+)?once` |

### session-viewing — _extend spider, not new page / one streaming bug_

Patterns: `(extend|grow)\s+the\s+spider | new\s+page.*(wrong|misframed|speculation) | one\s+(bug|fix).*two\s+surfaces | misframed | reframe | #\s*26\b`

| agent | rep-1 | rep-2 | rep-3 |
|---|---|---|---|
| patron-flesh | `(extend|grow)\s+the\s+spider`, `misframed` | `reframe`, `#\s*26\b` | `#\s*26\b` |
| patron-baseline | — | — | — |

### running-rig-view — _content-bearing loading + fail-loud on disconnect_

Patterns: `content-?bearing | fail\s+loud | don'?t\s+silently | #\s*41\b`

| agent | rep-1 | rep-2 | rep-3 |
|---|---|---|---|
| patron-flesh | `content-?bearing`, `fail\s+loud` | `content-?bearing`, `fail\s+loud` | `content-?bearing`, `#\s*41\b` |
| patron-baseline | — | — | — |

### session-provider — _engine produces its own yields / pull on resume_

Patterns: `engine\s+produces | pull\s+on\s+resume | (book|row)\s+is\s+(the\s+)?truth | don'?t\s+pass.*what\s+.*produces | engine\s+does\s+not\s+receive | #\s*16\b`

| agent | rep-1 | rep-2 | rep-3 |
|---|---|---|---|
| patron-flesh | `engine\s+produces`, `pull\s+on\s+resume` | `#\s*16\b` | `#\s*16\b` |
| patron-baseline | — | — | — |

### ghost-config — _reject-the-framing — delete now, not after retirement_

Patterns: `reject(ing)?\s+(the\s+)?(that\s+)?framing | delete\s+(it\s+)?now | two\s+deletions\s+are\s+independent | independent.*delet | don'?t\s+wait | #\s*39\b`

| agent | rep-1 | rep-2 | rep-3 |
|---|---|---|---|
| patron-flesh | `reject(ing)?\s+(the\s+)?(that\s+)?framin`, `delete\s+(it\s+)?now` | `reject(ing)?\s+(the\s+)?(that\s+)?framin`, `#\s*39\b` | `reject(ing)?\s+(the\s+)?(that\s+)?framin`, `delete\s+(it\s+)?now` |
| patron-baseline | — | — | — |
