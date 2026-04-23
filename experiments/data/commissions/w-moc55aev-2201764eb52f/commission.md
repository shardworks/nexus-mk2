In `packages/plugins/clerk/README.md` line 367, the Support Kit intro reads:

> The Clerk contributes books, tools, and **pages** to the guild:

But the section only has `### Books` (line 369) and `### Tools` (line 376) subsections. There is no `### Pages` subsection documenting the writs page that the clerk plugin ships at `packages/plugins/clerk/pages/writs/index.html`.

This is a pre-existing documentation gap, not caused by the `w-moc1e9de` deep-descendant changes. A follow-up would add a `### Pages` table listing at least the writs page, its route, and the user-facing capabilities (deep-descendant rendering with expand/collapse toggles, per-row Actions column, create-new-writ form, detail view). This would also pre-empt future audits of this flavour — once the page is actually documented in the README, deep-descendant framing becomes testable against the docs rather than inferred from commission briefs.