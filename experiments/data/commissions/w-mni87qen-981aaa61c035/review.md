# Review: w-mni87qen-981aaa61c035

## Web Dashboard

**Outcome:** partial

**Spec quality (post-review):** weak

**Revision required:** yes

**Failure mode:** broken

## Notes

Impressive scope delivery for a complexity-20 weak spec. The anima built a full SPA with 5 tabs (Overview, Clerk, Walker, Animator, Codexes), sortable/filterable tables, pagination, commission posting modal, writ status transition modal, toast notifications, and a REST API layer — all with zero external dependencies.

**What went well:**
- Codebase consistency was perfect (3.00 blind & aware) — plugin shape, package.json, tsconfig, tool() usage all match sibling plugins exactly.
- Graceful degradation via `tryApparatus` pattern — tabs show empty states when optional apparatus not installed.
- API layer is clean: proper HTTP status codes, JSON content types, query param parsing.
- The overall UX concept is solid — dark theme, status badges, engine pipeline visualization.

**What went wrong:**
- **Fatal JS syntax error** in `writActions()` — `\'` escapes in TypeScript template literal render as bare `'` in HTML onclick attributes, producing `openTrans('' + w.id + '','active')` which is a syntax error. Every writ action button was broken. The app loaded but clicking anything threw.
- **No tests at all** for a 1,566-line change with an HTTP server, multiple API endpoints, and client-side state management.
- **1,000-line html.ts monolith** — all HTML/CSS/JS in a single template string. TypeScript compiler can't check the embedded JS. This is where the fatal bug hid.
- Missing Stacks tab (spec said "tab for each apparatus").
- Codexes columns not sortable despite spec requesting sortable tables throughout.
- No request body size limits on POST endpoints.

**Spec quality reflection:**
The spec was a single paragraph — "create a dashboard, make it good." At complexity 20 this gave the anima a massive design space with no guardrails. The fatal quoting bug is arguably a spec gap: if you're going to ask for an embedded SPA, you need to spec a testing strategy. The architecture choice (JS in template literal) was reasonable but untestable by `tsc`.
