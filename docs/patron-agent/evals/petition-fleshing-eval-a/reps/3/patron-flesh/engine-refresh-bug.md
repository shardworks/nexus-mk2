# Engine-detail view in Oculus Spider page: stop clobbering the scroll

The Spider engine-detail view currently refetches the whole thing on some interval and blows away scroll position in the transcript and other text panels. The flicker is a symptom; the real defect is that I can't read a transcript without losing my place every few seconds. Fix the refresh to be targeted — update the data without re-rendering or re-mounting the panels that hold scrollable content.

This is a straightforward defect fix, not a redesign. I'm fleshing it as a petition because the thin brief doesn't say *how targeted* or *what "targeted" even means here*, and those calls want a principled answer before a planner picks it up.

## Reader and decision

The reader is me (the patron) or whichever anima is doing live engine triage — watching an engine's transcript scroll past while it's running, looking at tool calls and status to decide whether to intervene. The decision is "is this engine doing the right thing, should I let it continue / cancel / amend?" The cadence is *while an engine is active* — seconds-to-minutes of sustained attention on the detail view. That cadence is what makes scroll-reset fatal: a surface you stare at for five minutes must not reset your reading position (#22).

## Scope

**In:**
- The Oculus Spider page's engine-detail view — the panel/route/drawer that appears when you select or click through to a specific engine.
- The transcript panel, tool-call log, status block, and any other scrollable text region on that view.
- Whatever polling / live-update mechanism is currently driving the refresh — that's the thing being fixed.

**Out:**
- The Spider page's engine *list* / index view. Not in the bug. Leave it alone.
- Other Oculus pages (writs, sessions, etc.) — even if they share a polling pattern, fixing them is a separate petition unless the fix is trivially the same component. If the code is shared and the fix naturally lands in the shared spot, that's fine; don't refactor other views into a new abstraction to get there (#18).
- A general "live-update framework" for Oculus. No second consumer has earned it (#18). Fix this view; if a pattern emerges, extract later.
- Websockets / push-based updates. Polling is fine if it works. Don't rewrite the transport to fix a re-render bug — fix the re-render (#31: fix the source, which here is the component update, not the data transport).

## How it works

**The defect.** My strong guess — planner should confirm — is that the engine-detail view is fetching the whole engine record on an interval, and the resulting state update is causing React (or whatever the view layer is) to re-mount the subtree that contains the scrollable panels, which resets their `scrollTop`. Either that, or every poll is replacing the content array wholesale with a new identity, triggering a full re-render of every child including a scroll container that doesn't know to preserve its offset. Fix the *source* (#31), not "restore scroll position after every refresh" — that kind of compensation is the wrong shape.

**What "targeted" means.** The poll should update data; the DOM should update *only where data actually changed*. Concretely:
- Stable component identity across polls for any scrollable panel. No remount.
- Transcript should be append-mostly — new lines added to the end, existing lines untouched. If the transcript panel is already scrolled somewhere, appending new content below does not move the viewport (standard behavior; just don't fight it).
- Status / metadata blocks can update in place when their values change. No flicker means: if the value hasn't changed, the DOM node doesn't churn.

**Autoscroll behavior.** For the transcript specifically: if the user is scrolled to the bottom (or within some small threshold), *keep them pinned to the bottom* as new content arrives. If the user has scrolled up to read something, *do not* yank them back down. This is the standard "chat window" pattern and it's what makes the panel usable while a live engine streams into it. This is the one bit of behavior I want explicitly called out because it's easy to get wrong in either direction.

**Flicker.** Once identity is stable and updates are diffed, flicker goes away as a free consequence. I don't want a separate "de-flicker" intervention (debounce, fade transitions, etc.) — that's compensation on the wrong layer (#31).

**Failure mode if the poll errors.** Current behavior probably silently retries. Keep that — a transient fetch failure shouldn't blank the panel or show a modal. But the status indicator (if there is one) should reflect "stale as of X" if the poll has been failing. If there's no such indicator today, don't add one for this fix — log it structurally if anywhere (#20, #21), but this is scope creep and belongs in a follow-up if I notice it mattering.

## Assumptions I made

- The engine-detail view is a component on the existing Oculus Spider page, not a separate route/app. If it's actually a separate surface, scope still stands — fix that surface.
- The refresh is driven by interval polling, not websockets or SSE. If it turns out to be push-based and the re-render is still wrong, the fix is the same shape (stable identity, diffed updates) — the transport doesn't matter.
- The transcript panel is the primary painful one; "other text areas" in the brief covers tool-call output, logs, whatever else scrolls. Treat them all the same way.
- "Targeted" means component-level reconciliation, not network-level (i.e., I'm not asking for a delta API from the backend unless the planner finds the payload is so large that re-fetching it is itself the problem — unlikely).
- No one else is relying on the current refresh cadence for anything. It's a polling interval, not a contract.

## Deferred questions

- **Polling interval** — if the current interval is, say, 1s, and moving to 3–5s visibly helps *without* the component fix, that's a red flag the component fix didn't actually land. The interval is not the fix. But I'm open to the planner also tuning the interval if there's a reason (e.g., server load). Default: leave the interval alone, fix the render.
- **Autoscroll threshold** — "near bottom = pin to bottom" needs a pixel threshold. Pick something reasonable (e.g., within 40–80px of bottom counts as "at bottom"). Not worth my time to specify; planner picks.
- **Does this view exist in one place or several?** If Oculus has multiple entry points to engine-detail (e.g., a drawer on the list page AND a dedicated route), confirm the fix applies to all of them, or explicitly scope to the one the bug report is about (the Spider page's detail view). My intent is "wherever I see engine details on Spider, scroll must survive refreshes."
- **Is there existing Oculus pattern for live-updating panels that I should reuse?** If yes, use it (#26 — extend existing surfaces / patterns). If not, don't invent a framework; solve it locally in this view.
