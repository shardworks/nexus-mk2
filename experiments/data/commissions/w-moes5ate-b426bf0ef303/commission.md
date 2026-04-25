The mandate writ `w-moda2w1a` body cites `packages/plugins/spider/src/spider.ts:2441-2452` for `isAnimatorPaused()`, but the implementation is now at `spider.ts:2757-2768` after recent re-orderings. The named symbol (`isAnimatorPaused`) and the file path are still correct — only the line numbers are off.

- `packages/plugins/spider/src/block-types/animator-paused.ts:44-50` cited → actually `41-58` today.
- `packages/plugins/spider/src/static/spider.js:1546-1554` cited → actually `1693-1718` (`renderAnimatorBanner`) today.

No action needed beyond a future-pass refresh of mandate writs that quote line numbers, but worth noting because line-number drift in mandates is a recurring failure mode that misleads automated implementers. A pattern ("mandates cite symbols, not line numbers") would help.