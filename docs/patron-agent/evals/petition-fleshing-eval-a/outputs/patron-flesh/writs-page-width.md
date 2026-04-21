# Writs page: conform to the standard page-container and card treatment

The writs page currently renders full-bleed — the table runs edge-to-edge of the viewport, with no outer margin and no surface under its panels. That reads as cluttered not because there's too much on it, but because nothing is *contained*. I want the page to sit inside the same page-container shell Spider and Guild use, and I want its internal panels wrapped in the standard card surface so they read as deliberate composed regions rather than free-floating widgets on the page background.

This is a visual conformance fix, not a redesign. The writs page's information architecture is fine — table with drill-down inspect is the right pattern (#28) and stays put.

## Reader and decision

The reader is me (or whoever is monitoring guild activity), sitting on the writs page while something is dispatched, scanning the mandate/click/session tree to see what's live, stuck, or just finished. The decision is operational: "is the work moving, and if it's stuck, where?" Frequency is several times per working session during active dispatch — this is a surface that gets *looked at*, not just visited once. So a cluttered scan surface has real cost; fixing the framing has real payoff.

## Scope

**In:**
- The writs page root wraps in the shared page-container primitive that Spider and Guild already use — whatever provides their outer margin, max-width, and vertical padding.
- The primary writ table gets a card treatment: background surface, rounded corner, consistent padding on the outside of the table. Identical to the card styling used elsewhere in the app (#27 — reuse existing surface styles, don't invent new ones).
- Any ancillary panels on the writs page (filter/status summary, inspector pane if it's co-present rather than a modal) also get card-wrapped so the page reads as a composed layout rather than a single bleed element plus a floating wrapper.

**Out:**
- Changing the page-container primitive itself, or touching Spider/Guild. They're the reference implementation — I'm conforming the writs page *to* them, not harmonizing all three (#23, #26).
- Touching the writs table's columns, density, sort, filter, or drill-down behavior. The row-click-to-inspect interaction stays exactly as it is (#29 — don't break amendment flow).
- Sweeping other full-bleed pages in the app. If there are more, that's a separate conformance petition — name them in a follow-up, don't smuggle them into this one (#23).
- Refactoring the card component or the page-container component to take new props for this. If the existing shapes don't fit, that's a deferred question, not a license to redesign.

## How it works

The writs page, rendered:

- Outer container is the same shell as Spider/Guild — gutters on left/right so content doesn't touch the viewport edge, max-width so on a wide monitor the table doesn't stretch into unreadable long rows, vertical padding at top under the nav.
- Inside, the writ table is a card: surface background, rounded corners, internal padding around the table element so rows have breathing room against the card edge without losing row density. The table itself keeps its current row height — card padding is *outside* the table, not eating into it.
- If the page has a filter/summary strip, it's a sibling card above the table, not merged into the table card. Colocated with the table it filters (#40).
- If the inspector is a side-panel (rather than a modal), it's its own card to the right. If it's a modal, leave it alone — modals already have their own surface.

The visual result should be: writs page at a glance reads the same shape as Spider and Guild — margin, then card(s), then margin — with the table as the obvious primary object.

## Assumptions I made

- Spider and Guild use a shared page-container component (or a convention — shared Tailwind classes, a layout route) that the writs page is bypassing. Planner should identify the specific primitive and reuse it rather than inline-reimplementing the same spacing.
- A card surface style already exists in the design system (class, styled component, or mixin). Planner should find it and apply it, not author a new one.
- The "cluttered" feeling is driven by the full-bleed framing, not by too many elements on the page. If after this fix it still reads cluttered, that's a separate density/IA problem and a separate petition.

## Deferred questions

- Are there other full-bleed pages in Oculus (e.g., sessions, clickscape, books views) that should be swept in a single conformance pass? My instinct is to handle this page alone and open a follow-up if more exist — but if the planner finds it's a one-line change applied to a shared layout route, the broader sweep may be essentially free. Worth checking before scoping narrowly.
- Does the writ table need a *max-width* specifically, or just outer margin? On a very wide monitor the table may still feel sparse/stretched even with gutters. Planner should check how Spider/Guild handle this and match.
- Is the writs-page inspector (if present) a side-panel or a modal? That changes whether it needs card treatment or not.
