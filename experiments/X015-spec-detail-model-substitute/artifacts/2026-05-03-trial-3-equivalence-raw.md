# X015 trial 3 — equivalence evaluation

Comparing Sonnet (trial 3) vs Opus (baseline) post-state files,
both rebuilt from base `03d36cb849c9`. Lines normalized to ignore
trailing whitespace; "differ" status + line counts capture
substantive divergence.

## Summary

- **Files Opus touched:**     33
- **Files Sonnet touched:**   28
- **Both touched:**           24
  - **Byte-identical:**       2
  - **Whitespace-only diff:** 0
  - **Substantive diff:**     22
- **Opus-only (Sonnet missed):**  9
- **Sonnet-only (extra work):**   4

## Byte-identical between Opus and Sonnet

- `packages/plugins/animator/src/tools/index.ts`
- `packages/plugins/spider/src/block-types/index.ts`

## Substantive divergences (per-file)

Line counts are unique-to-each-side after normalization.

| File | only-Opus lines | only-Sonnet lines |
|------|----------------:|------------------:|
| `packages/plugins/animator/src/animator.ts` | 120 | 180 |
| `packages/plugins/animator/src/animator.test.ts` | 93 | 162 |
| `docs/architecture/apparatus/animator.md` | 67 | 91 |
| `packages/plugins/animator/src/types.ts` | 102 | 55 |
| `packages/plugins/claude-code/src/index.ts` | 97 | 33 |
| `packages/plugins/claude-code/src/babysitter.ts` | 62 | 36 |
| `packages/plugins/spider/src/spider.ts` | 57 | 37 |
| `packages/plugins/spider/src/static/spider-ui.test.ts` | 35 | 43 |
| `packages/plugins/animator/src/oculus-routes.test.ts` | 42 | 33 |
| `packages/plugins/spider/src/static/spider.js` | 33 | 32 |
| `packages/plugins/animator/README.md` | 40 | 19 |
| `packages/plugins/animator/src/tools/animator-status.ts` | 43 | 14 |
| `packages/plugins/animator/src/session-record-handler.ts` | 52 | 2 |
| `packages/plugins/spider/src/block-types/animator-paused.ts` | 28 | 18 |
| `packages/plugins/spider/src/static/spider.css` | 17 | 11 |
| `packages/plugins/animator/src/tools/session-record.ts` | 14 | 1 |
| `packages/plugins/spider/src/static/index.html` | 9 | 5 |
| `packages/plugins/animator/src/oculus-routes.ts` | 6 | 4 |
| `packages/plugins/animator/src/tools/session-heartbeat.ts` | 7 | 1 |
| `packages/plugins/animator/src/tools/session-running.ts` | 7 | 1 |
| `packages/plugins/claude-code/src/detached.ts` | 3 | 5 |
| `packages/plugins/animator/src/tools/session-list.ts` | 3 | 1 |

## Files only Opus touched (Sonnet missed)

- `packages/framework/cli/src/commands/start.ts`
- `packages/plugins/animator/src/index.ts`
- `packages/plugins/animator/src/rate-limit-backoff.test.ts`
- `packages/plugins/animator/src/rate-limit-backoff.ts`
- `packages/plugins/animator/src/tools/animator-status.test.ts`
- `packages/plugins/claude-code/README.md`
- `packages/plugins/claude-code/src/rate-limit-detection.test.ts`
- `packages/plugins/spider/README.md`
- `packages/plugins/spider/src/rate-limit.test.ts`

## Files only Sonnet touched (extra work)

- `packages/plugins/animator/src/tools/session-tools.test.ts`
- `packages/plugins/claude-code/src/babysitter.test.ts`
- `packages/plugins/claude-code/src/stream-parser.test.ts`
- `packages/plugins/spider/src/spider.test.ts`

