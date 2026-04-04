# Observations: enhance-crawl-cli-behavior-improve

## Doc/Code Discrepancies in spider.md

1. **Stale tool names throughout.** The spider architecture doc (`docs/architecture/apparatus/spider.md`) references `walk`, `start-walking`, and `nsg start-crawling` — names from an earlier design phase that were never implemented. The code has always used `crawl` and `crawlContinual`. This commission updates the names to `crawl-one` and `crawl-continual`, but the doc needs a broader pass to remove all ghost names.

2. **Kit contribution example is wrong.** Line 63 shows `walk: crawlTool` — the actual code uses an array (`tools: [crawlTool, crawlContinualTool]`), not a named map. The doc's example would not work with the current Instrumentarium.

3. **"Hyphenated names have known issues" note is obsolete.** Line 69 warns about CLI parsing issues with hyphenated tool names. Every other tool in the codebase uses hyphenated names successfully (`writ-list`, `commission-post`, `draft-seal`, etc.). This note should be removed.

4. **Operational model section describes desired behavior, not actual.** Lines 103-109 describe a loop that "doesn't stop — it keeps polling", which contradicts the current `maxIdleCycles: 3` default. After this commission, the code will match the doc's description. But the doc references `start-walking` and `nsg start-crawling` which still won't exist.

## Potential Improvements (Out of Scope)

5. **No graceful shutdown for crawl-continual.** The indefinite loop has no signal-based termination. An operator who runs `nsg crawl-continual` with the new default must Ctrl-C to stop it. A future improvement could register a SIGINT handler that sets a flag to break the loop cleanly and return the accumulated actions summary.

6. **No maxIdleCycles in SpiderConfig.** The idle cycle limit is only a tool param, not a guild config option. An operator who always wants `maxIdleCycles: 10` must pass it every invocation. Adding it to `SpiderConfig` (with tool param as override) would follow the `pollIntervalMs` pattern which already works this way.

7. **Error handling resets idle count the same as true idle.** In crawl-continual, a `crawl()` error increments `idleCount` the same as a null result. This means N consecutive errors cause the same termination as N consecutive idle cycles. This may be intentional (errors = "nothing useful happened") but could also mask persistent errors by silently exiting. Worth a future review.

---

## Spec Verification Log (plan-writer, 2026-04-04)

Coverage verification passed with no gaps:

- **Scope coverage:** All 6 scope items (S1–S6) mapped to at least one requirement.
- **Decision coverage:** All 10 decisions (D1–D10) reflected in the spec's Design section.
- **Inventory coverage:** All 8 inventoried files accounted for — 5 modified, 3 confirmed unaffected.
- **R↔V bidirectional check:** All 14 requirements appear in at least one validation item; all 15 validation items reference at least one requirement.
- **Implementer readability:** Full replacement file contents provided for all modified tool files. Loop logic shown in full. Doc replacement text provided verbatim. No ambiguous instructions.
