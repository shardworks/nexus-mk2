# Constrain the writs page layout and give it the same breathing room as the rest of the app

The writs page currently bleeds edge-to-edge across the viewport, which makes it feel noisy and unlike every other page in the app. I want it to adopt the same centered, margined layout we use on Spider, Guild, and the other primary pages, and I want the components on the page to get a card treatment so they read as discrete units rather than one undifferentiated slab.

## Reader and decision

The reader is an operator using the web UI to monitor and triage writs across the guild — typically the patron or an anima steward glancing at the page dozens of times a day to answer "what's in flight, what's stuck, and what needs me?" The layout decision shapes whether they can scan the page quickly or have to hunt across a wall of content. The treatment needs to match the visual language of Spider and Guild so the operator's eye doesn't have to recalibrate every time they switch tabs.

## Scope

**In:**
- Apply the same page-container wrapper Spider and Guild use to the writs page, so it's centered with horizontal margin and a max-width that matches those pages.
- Give the main structural regions of the writs page a card treatment — background panel, subtle border or shadow, consistent internal padding, rounded corners matching the rest of the app.
- Align vertical rhythm: same top/bottom page padding as Spider and Guild; same gap between cards as between sections on those pages.
- Preserve existing functionality exactly — filters, sorting, row actions, detail drill-in all continue to work.

**Out:**
- No redesign of the writs table itself (columns, row density, status chips, action menus all stay as they are).
- No changes to the other pages' layouts; writs is being pulled in line with them, not the reverse.
- No new filters, no new information density changes, no responsive-breakpoint rework beyond what falls out of using the shared container.
- No changes to routing or navigation chrome.

## How it works

The writs page should be wrapped in whatever shared page-shell component Spider and Guild use (if there isn't one yet, extract it — but the extraction is a side effect, not the goal). That shell provides: centered column, consistent max-width, standard horizontal margin, standard top/bottom padding.

Inside the shell, the page gets two or three cards depending on what's currently rendered there:

1. A **header card** if there's a page title / summary / top-level controls — otherwise just a plain heading above the content, matching how Spider does it.
2. A **filters card** wrapping the filter/search controls, if those exist as a distinct region today.
3. A **writs list card** wrapping the table/list of writs itself. The table keeps its current internal styling; the card provides the outer container (padding, border, background).

Each card uses the same visual treatment: surface background color from the theme, 1px border or soft shadow (whichever Spider/Guild use — match it, don't invent a third variant), same border-radius token, same internal padding.

When viewport is narrow, the cards should still respect a reasonable minimum margin on the sides — don't let them touch the viewport edge. Match the behavior of Spider/Guild here rather than specifying new breakpoints.

Success looks like: open Spider, open Guild, open writs in three tabs and flip between them — the outer layout and card rhythm feels identical. Only the content inside differs.

## Assumptions I made

- Spider and Guild are already using a consistent page-shell pattern (shared component, shared tokens, or at least copy-pasted styles that are visibly consistent). If they're not actually aligned with each other, the planner should flag that and ask which one to treat as the reference.
- There is an existing card component or established card style in the design system. If not, the planner should propose a minimal one rather than inventing bespoke styles for this page.
- The writs page today has recognizable sub-regions (header, filters, list). If it's currently a single monolithic component, splitting into card-sized regions is in scope as part of this work.

## Deferred questions

- Which page should we treat as the canonical reference — Spider or Guild — if they differ in subtle ways?
- Should the writs list card scroll internally when long, or should the page scroll as a whole (matching whichever Spider/Guild do for their long lists)?
- Is there any top-level summary content you want surfaced in the header area that isn't there today, or strictly a layout-only change?
