Lifted from the planning run of "Oculus list pages should deep link with configured filters" (w-moix1zoj-73eeb792cbaf). Each numbered observation below is a draft mandate ready for curator promotion.

1. Oculus has no architecture doc despite being a listed apparatus
2. Oculus home page bypasses chrome injection so shared helpers are unavailable there
3. Five pages duplicate the same currentUrlParams + updateUrl helper inline
4. Spider rigs page WRIT_TITLE_MISSING fallback asymmetry is load-bearing and undocumented in the page contract
5. Spider tab state and engine selection are tested as non-URL-tracked, contradicting brief's Oculus-level requirement
6. Per-page popstate handlers re-implement a search/restore pattern that could be a shared helper
7. URL-handling tests assert source-text patterns rather than exercising the runtime
8. The Oculus README and oculus.test.ts both bake in 'exactly one shared chrome script' as the assumption
