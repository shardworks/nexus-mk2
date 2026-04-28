Animator complexity diagnosis lifted ~7 observations spanning real refactor candidates:
- TERMINAL_STATUSES defined in 4 files (real DRY)
- session-show.ts handler audit (post SessionDoc reducer)
- D-numbered design-decision shorthand inlined or linked to stable index (49 references)
- Schedule removal of cleanupLegacyStatusBook one-shot migration
- cancelHandle shape narrowed (only local-pgid implemented; container/remote documented but not built)
- Animator README mismatches actual startup sequence
- Loom integration audit (lazy resolution pattern)

DO NOT DISPATCH yet — bundle once SessionDoc reducer + Loom integration settle.