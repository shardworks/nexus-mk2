Lifted from the planning run of "CLI and Oculus — multi-type writ rendering" (w-mod646hu-38b7cf7a1e4f). Each numbered observation below is a draft mandate ready for curator promotion.

1. Update clerk.md support-kit listing to include writTree and pieceAdd tools
2. Remove pre-T2 'CDC cascade behavior' docstring from ClerkApi.transition
3. Phase filter bar in Oculus writs page omits the 'stuck' button
4. Validate --type against the writ-types registry to catch typos
5. Reckoner hardcodes mandate phase strings; T5's classification model is the eventual replacement
6. Spider's writ-phase block-type and adjacent surfaces still consume mandate phase strings
7. Children-summary count is typed Record<WritPhase, number> in WritShow response
8. WritFilters.phase typing is mandate-narrow but runtime accepts any string
9. Local .badge--draft style is defined inline in writs page rather than in shared style.css
