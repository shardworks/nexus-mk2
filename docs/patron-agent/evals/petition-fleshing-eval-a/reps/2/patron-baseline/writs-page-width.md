# Tame the Writs page layout to match the rest of the app

The Writs page currently bleeds edge-to-edge across the viewport and reads as a wall of data. I want it reframed to sit inside the same centered, margined layout we use on Spider and Guild, with the main content areas wrapped in card treatments so the eye has somewhere to land. This is a visual-polish pass, not a re-architecture — the data and controls on the page stay the same.

## Reader and decision

The reader is a guild operator (me, or another patron sitting at the console) triaging writs during a work session. The decision they're making: *which writ needs my attention next, and what's its current state?* They land on this page several times a day, scan the list, and either drill into one writ or move on. Right now the full-bleed layout makes that scan harder than it should be — everything has equal visual weight, and there's no breathing room between the list, filters, and detail panels.

## Scope

**In:**
- The top-level `/writs` page and its immediate layout container.
- The writs list/table component, any filter or toolbar region above it, and the detail pane if it renders on the same page.
- Applying the same outer margin + max-width wrapper that Spider and Guild use, so the three pages feel like siblings.
- Card-style treatment (background, border/shadow, rounded corners, internal padding) on the list region and the detail region — whatever's needed so they read as discrete surfaces inside the margined frame.
- Matching the existing design tokens already in use on Spider/Guild (spacing scale, card radius, border color, shadow). I don't want a new visual language — I want consistency.

**Out:**
- Changing what data is shown, what columns exist, filter behavior, sort order, or any interaction model.
- Touching Spider, Guild, or other pages. They're the reference, not the target.
- Introducing new components or a shared layout primitive *unless* one already exists on Spider/Guild and it's the obvious way to wrap Writs. If Spider/Guild each hand-roll their margins, Writs can hand-roll to match — don't stop to build an abstraction.
- Mobile/responsive rework beyond "don't make it worse." If the card treatment breaks at narrow widths, fall back to full-bleed on small viewports.
- Dark mode tuning, accessibility audit, or any perf work.

## How it works

When I load `/writs`, I expect to see:

1. A centered content column with generous horizontal margin on wide viewports — matching whatever max-width Spider uses. Vertical margin at the top so the content doesn't kiss the app chrome.
2. Inside that column, the page header (title + any page-level actions) sits flush against the column edge, same as Spider.
3. Below the header, the writs list sits inside a card: rounded corners, subtle border or shadow, padding inside so rows don't touch the card edge. Alternating row backgrounds, if we have them today, stay.
4. If there's a filter/toolbar strip, it either sits inside the same card above the list (separated by a divider) or in its own smaller card directly above. Planner's call — pick whichever matches the Spider/Guild pattern more closely.
5. If the detail pane is on-page (split view), it's a second card beside or below the list with the same treatment.

The net effect I'm after: the page should feel like it belongs to the same app as Spider and Guild. A screenshot test with all three pages side by side should look like siblings, not cousins.

## Assumptions I made

- Spider and Guild already share a common layout pattern (centered column, consistent margins) that I'm asking Writs to adopt. If they don't actually match each other, pick Spider as the reference and flag that Guild is also inconsistent.
- There's an existing card style somewhere in the codebase — whether a `<Card>` component, a CSS class, or just a repeated set of Tailwind classes. I'd rather reuse it than invent one.
- The writs page content currently renders at full width because of an explicit layout choice (a wrapper missing, or a `w-full` where Spider has a max-width), not because of a deep structural reason that'd make this hard.

## Deferred questions

- Is there a split detail pane on `/writs` today, or is detail a separate route? That changes whether one card or two is the right answer.
- Do we have a canonical `<Card>` / `<PageLayout>` component I should use, or is each page wrapping itself? Planner: confirm before implementing.
- If the writs table is wide (many columns) and the new max-width causes horizontal scroll, I'd rather have horizontal scroll inside the card than blow the layout back out to full-width — confirm that's acceptable.
