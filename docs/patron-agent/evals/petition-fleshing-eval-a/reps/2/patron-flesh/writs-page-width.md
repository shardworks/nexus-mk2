# Writs page: bring it into the shared page layout

The writs page currently runs edge-to-edge against the viewport and reads as cluttered next to Spider and Guild, which both breathe. I want the writs page to sit in the same layout shell as those pages — same outer margin, same max content width, same card-style panels around the main components — so the Oculus surfaces feel like one product instead of three.

## Reader and decision

The reader is me (or any operator) at the Oculus writs page, scanning the writ table to answer "what's moving, what's stuck, and what needs my attention?" This is a frequent, short-dwell surface — I open it multiple times per active session. Because the dwell is short, visual coherence with the sibling Oculus pages matters: I don't want to context-switch my eye between "full-bleed writs" and "margined Spider" every time I tab over.

## Scope

**In:**
- The writs page routes through the **same page-layout shell** used by Spider and Guild — whatever shared container component they wrap their content in, the writs page uses that same component. Not "copy the margin values," use the component. (#26, #38)
- The writ table (and any sibling panels on the page — filters, detail view, summary strip, whatever's currently sitting there) gets the existing **card treatment** used on Spider/Guild panels. Reuse the card component already in the design system; don't invent a new one. (#26)
- Any bespoke layout CSS that currently makes the writs page full-bleed gets **removed**, not patched with extra margin rules. If the page has its own `.writs-page` wrapper class doing custom full-width styling, delete the wrapper and use the shared one. (#38)

**Out:**
- No functional changes to the writ table — columns, sorting, filtering, selection, row detail behavior all stay exactly as they are. This is a visual re-housing, not a redesign. (#23, #24)
- No new components — no "writs summary card," no "stuck-writs callout," no filter redesign. If the card treatment reveals that the current writ table is too wide for the shared max-width, we deal with that by letting the table horizontally scroll inside its card (or by using the same overflow pattern Spider uses for wide content), not by redesigning the table. (#23)
- No changes to other Oculus pages. Spider and Guild are the reference, not the target.
- No design-system changes. If Spider/Guild's card component needs a variant for this, that's out of scope — file it separately.

## How it works

The writs page's top-level render becomes: `<PageShell>` (or whatever Spider/Guild use) wrapping a vertical stack of `<Card>` panels, one per current top-level block on the page. The card gives each block its own visual container with the system's standard padding, border/shadow, and background — matching the panel treatment already visible on Spider.

The outer margin and max-width are inherited from the shell, not set locally. If I resize the browser, the writs page should breathe and reflow the same way Spider does — because it's the same shell.

If a component on the page is currently designed around having viewport-width (e.g., a wide table), it lives inside its card and gets the same horizontal-overflow behavior Spider uses for its wide content. I don't want a special case.

## Assumptions I made

- There is already a shared page-shell / page-layout component that Spider and Guild route through. The fix is to use it. If it turns out each page is rolling its own layout independently, that's a different and larger problem — flag it, don't fix it as part of this work.
- There is already a card component (or equivalent panel style) in the design system. The fix uses it. If there isn't, flag it — introducing a new shared component is a bigger decision than this petition covers.
- The writs page has no functionality that *requires* full-viewport rendering (e.g., a canvas visualization that genuinely needs the pixels). If it does, that component is the exception and stays full-bleed inside the margined page — but I don't expect this.
- "Match Spider and Guild" means match whichever of those two has the more settled/canonical layout. If they disagree with each other, Spider is the reference (it's the older, more-used surface).

## Deferred questions

- **Are Spider and Guild actually using a shared layout component, or do they just happen to look similar?** The planner should check before implementing. If they're independently styled, the right first move is probably to extract the shared shell, then land the writs page on it — which is a bigger piece of work and I'd want to know before it starts.
- **Is there a component on the writs page that was deliberately built full-bleed?** If so, call it out and I'll decide whether it gets an exception or gets redesigned to fit inside a card.
- **Does the design system have an established "card" primitive, or is the card look on Spider ad-hoc styling?** If ad-hoc, the right move might be to extract the card first; if primitive, just use it.
