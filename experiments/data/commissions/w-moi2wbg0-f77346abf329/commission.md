Spider dashboard (`packages/plugins/spider/src/static/spider.js` + `index.html` + `spider.css`) has lifted UX-polish observations:
- Six different em-dash literal placeholders unified as a shared missing-cell constant.
- Pipeline-node lacks aria-label for screen-reader status announcements.
- engine.holdCondition rendered via JSON.stringify instead of human-readable per-shape rendering.
- rig-list dropdown hand-codes `<option>` tags; consider enum-driven build.
- `.elapsed-running` CSS rule is dead.
- badgeClass conventions divergent across spider/animator/feedback dashboards (switch-multi-case, switch-single, object literal).
- Legacy `stuck`/`blocked` filter values lingering in dropdowns.

DO NOT DISPATCH — UX polish; gather a few more observations, then bundle as a single sweep.