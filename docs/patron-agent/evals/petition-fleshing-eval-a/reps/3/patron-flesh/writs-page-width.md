# Bring the Writs page into the shared page-chrome convention

The Writs page in Oculus currently bleeds to the viewport edges and reads as cluttered. Spider and Guild already sit inside a bounded page layout — margin, max-width, internal spacing. I want Writs to conform to that same layout, and the table (plus any sibling widgets on the page) to render as cards inside it. This is an alignment job, not a redesign.

## Reader and decision

**Reader:** me, in patron/operator mode, using Oculus to check mandate and writ state during active sessions. **Decision:** "what's the state of work right now — what's live, what's stuck, what completed?" **Frequency:** multiple times a session, daily or more. The page is a scanning surface; visual clutter at viewport edges fights scanning (#22).

## Scope

**In:**
- Wrap the Writs page in whatever page-layout component Spider and Guild already use (shared container with max-width, horizontal padding, vertical spacing).
- Give the writs table a card treatment — bounded surface with the Oculus card idiom (rounded corners, border/shadow, internal padding) so it reads as a contained region rather than a full-bleed grid.
- Apply the same card treatment to any sibling widgets on the page (filters, summary counts, anything currently full-bleed alongside the table).

**Out:**
- Redesigning Spider or Guild "for consistency" — those are the authority here. Writs conforms to them, not the other way around (#26).
- Any content change: columns, filters, sort, row interactions, empty state copy. Scope is chrome only (#23).
- Inventing a new card component if the design system already has one. If it does, use it verbatim.
- Polishing adjacent pages that may have also drifted. Note them for follow-up; don't bundle.

## How it works

The right move is to adopt the existing shared layout, not to hand-craft margin and padding on the Writs page (#26, #31). If Spider and Guild already route through a `<PageLayout>` / `<PageShell>` component, Writs gets wrapped in the same one — this is a mechanical change, not a design exercise.

If it turns out each page defines its own layout and Spider/Guild just happen to share visual values by coincidence, that's a #31 signal: extract the shared chrome into one component and route all three pages through it, so the next new page can't drift again. Don't compensate on Writs alone if the upstream fix is obviously cheap.

The card treatment should pull from whatever card idiom Oculus already uses (there will be one somewhere — some panel, widget, or section uses rounded-border-padding today). Match it. Do not define a new card visual language (#8 — don't teach the page layer new vocabulary when an existing idiom serves).

Adequate is: a sighted user scanning Oculus cannot tell which page is which by chrome alone — margins, max-width, and card framing match Spider and Guild. The writs table itself keeps its current internals; only its outer framing changes. Done means the page no longer feels cluttered when I open it (#24).

## Assumptions I made

- Spider and Guild share a layout pattern — either a shared component or consistent values. If each is a snowflake, the fix is larger (extract shared chrome first, then apply).
- Oculus has an existing card idiom somewhere in the design system. If not, we're defining one, which is a bigger scope call I'd want to weigh in on before it happens.
- The Writs page predates whatever shared layout exists, which is why it missed it. Mechanical conversion, not a design debate.
- Card treatment applies at the widget-grouping level (table-as-one-card), not per-row or per-column.

## Deferred questions

- Is there already a shared page-layout component that Spider and Guild both use? If yes, name it so the planner can just wrap Writs in it. If no, confirm whether extracting one is in scope or deferred.
- Is there a named card component in the Oculus design system? If yes, which one. If no, flag before proceeding — I don't want a net-new visual primitive introduced as a side effect of this task.
- Are there other pages that also drift from the Spider/Guild convention? If yes, list them; I'll decide whether to bundle or defer.
- What sibling widgets currently live on the Writs page alongside the table? (Filters, counts, controls?) Each needs a card-treatment call, and I'd rather see the list than guess.
