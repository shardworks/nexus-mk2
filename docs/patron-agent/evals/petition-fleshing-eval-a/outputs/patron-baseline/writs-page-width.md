# Bring the Writs page into the standard page chrome

The Writs page currently runs edge-to-edge — the table and its surrounding UI bleed all the way to the viewport's left, right, top, and bottom edges. That feels cluttered and inconsistent with how Spider, Guild, and the other primary pages present themselves. I want Writs to sit inside the same page frame as everything else, with proper margin around it, and I want the components inside to read as distinct regions rather than a wall of content.

## Reader and decision

The reader is the patron (me) or another operator using the guild dashboard to triage active work. The decision the page supports is "what's going on across my writs right now, and is anything stuck that needs my attention." That decision is made many times a day, usually mid-task, and the current edge-to-edge layout makes the page feel like a system log rather than a dashboard I can glance at and trust.

The fix is cosmetic and structural, not a redesign. I'm not changing what data is shown or how it's filtered — only the framing.

## Scope

**In:**
- The Writs page (`/writs` or equivalent route) and its top-level container.
- Applying whatever shared page-shell component Spider and Guild use — same max-width, same horizontal and vertical padding, same header treatment.
- Giving the major sub-regions on the Writs page a card treatment: the filter/toolbar strip, the writs table/list, and any side panel or detail region. Each should read as its own surface with a subtle border/background and rounded corners, matching how cards render on Spider and Guild.
- Making sure the table inside its card scrolls horizontally if it overflows rather than forcing the page itself wider.

**Out:**
- Any change to the columns shown, filter behavior, sorting, or data model.
- Any change to Spider, Guild, or the shared page-shell component itself — those are the reference, not in scope to modify.
- A mobile/responsive redesign. If the existing pages don't handle narrow viewports gracefully, Writs doesn't need to either — just match them.
- New visual design tokens. Use whatever spacing, radius, and color tokens the other pages already use.

## How it works

When I navigate to Writs, the page renders inside the same outer frame as Spider: centered in the viewport up to the shared max-width, with the standard horizontal gutter and the standard top padding beneath the app header. Below the page title, the content area stacks:

1. **Toolbar card** — filters, status chips, "new commission" button. Same card styling as Spider's toolbar.
2. **Writs table card** — the main list. Card has a header row (column titles) and the scrollable body beneath. If the table has more columns than fit, it scrolls within the card, not the page.
3. **Detail region** (if present) — either beneath the table or as a right-hand pane, in its own card.

Cards have consistent spacing between them (matching Spider). The page has a visible bottom margin so the last card doesn't touch the viewport edge. Background behind the cards is the app's page background, not the card surface.

If the existing page-shell component already handles the outer margins and only the inner components need card treatment, that's fine — prefer composing with what's already there over introducing a new wrapper.

## Assumptions I made

- Spider and Guild are already using a shared page-shell or layout component. If they're not — if each page hand-rolls its own margins — the planner should flag this, because then "match other pages" means picking the version I like and factoring it out, which is a bigger job.
- The Writs page's internal components (toolbar, table, detail) are already separable enough to wrap in cards without restructuring. If the table is deeply entangled with page-level layout, the planner should say so.
- "Card treatment" means the same visual language as existing cards elsewhere in the app. I'm not inventing a new card style.

## Deferred questions

- Is there a specific reference page I should use as the canonical template — Spider or Guild? If they differ, I'll pick Spider, but confirm.
- Does the Writs page have a detail/side pane today, or is it just toolbar + table? The plan should reflect what's actually there.
- Are there any components on Writs that should *not* get card treatment (e.g., a breadcrumb or page title that belongs at the page-shell level)? Use judgment, but flag the call.
