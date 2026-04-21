# Fix the Spider page engine-detail flicker and scroll-reset

When I expand an engine on the Spider page in Oculus, the detail panel is currently repainting on every polling tick. Two things I want fixed: the visible flicker, and — more importantly — the fact that my scroll position inside the transcript and any other scrollable text areas in that panel gets reset every refresh. Right now it's literally impossible to read a transcript longer than the viewport. Make the refresh targeted so the DOM subtrees that haven't changed don't get thrown out, and scroll position is preserved across updates.

## Reader and decision

The reader is me (or any operator) using Oculus to babysit a running guild — typically when something looks off with an engine and I want to read through its recent transcript and state to decide whether to intervene, kill it, or let it keep going. I open the Spider page, expand the engine in question, and try to read. The decision is "is this engine doing what I expect?" and I make it maybe a dozen times a day during active work. The panel needs to behave like a document I'm reading, not a dashboard that keeps snapping back to the top.

## Scope

**In:**
- The engine-detail view on the Spider page in Oculus — the panel that appears when you expand or select an engine.
- The transcript pane inside that panel, plus any other scrollable text region rendered there (state dumps, log tails, stderr, tool-call history — whatever's in there today).
- The polling/refresh mechanism that drives updates to this panel.
- Scroll-position preservation across refreshes in every scrollable subregion of the panel.

**Out:**
- The Spider page engine list itself (the row-per-engine summary) — if it already refreshes fine, leave it alone.
- Other Oculus pages (guild overview, writ browser, clicks view, etc.), even if they share the same polling pattern. I want this one fixed first; we can generalize later if the pattern turns out to be reusable.
- Switching away from polling to websockets / SSE. Keep the current transport; just make the render targeted.
- Visual redesign of the panel. Same layout, same content, same styling.

## How it works

My expectation for the fixed behavior:

- **Targeted updates.** Instead of replacing the panel's DOM on each poll, diff the incoming state against the previous state and only update the fields that actually changed. If the transcript has appended three new lines, append those three lines; don't re-render the whole transcript. If the engine's status badge changed from `running` to `stuck`, update just the badge. React/Preact/Solid/whatever's in use should be doing this already with stable keys — so part of the fix is probably giving list items stable keys and making sure state identity is preserved across polls.
- **Scroll preservation.** Every scrollable region inside the panel keeps its `scrollTop` across refreshes. If I'm reading the middle of a transcript and new lines arrive at the bottom, my scroll position does not move. If I'm pinned to the bottom (within ~20px), new lines auto-follow — standard tail-follow behavior.
- **No flicker.** No full-panel unmount/remount on the polling cadence. The panel should look visually static between updates except for the specific fields that changed.
- **Poll cadence stays.** Whatever interval we're polling at today is fine; don't change it as part of this fix unless the current cadence is itself part of the problem.

A quick way to sanity-check the fix: open an engine with a long transcript, scroll to the middle, wait through several refresh cycles, and confirm the viewport doesn't move and nothing flashes.

## Assumptions I made

- The Spider page lives in the Oculus web app and the refresh is driven by a client-side polling hook (interval fetch → setState → re-render). If it's actually server-pushed or rendered differently, adapt but keep the behavior goals.
- The flicker is caused by wholesale component replacement or list items without stable keys, not by a CSS animation or transition. If it turns out to be something else (e.g. a layout thrash from a resizing container), fix that instead — the observable bug is what matters.
- "Transcript and other text areas" means there's more than one scrollable region in the panel. If it's actually just the transcript today, scope accordingly but build the fix so it generalizes to siblings added later.
- Tail-follow (auto-scroll when pinned to bottom) is desirable default behavior. If the current panel doesn't do this at all, add it; if it does, preserve it.

## Deferred questions

- Is there a specific engine type or state where the flicker is worst? If so, I'd like to know — it might point at the root cause faster than a generic diffing pass.
- Does Oculus already have a shared "live data" hook used elsewhere (writs list, clicks tree, etc.)? If yes, the fix probably belongs there rather than local to the Spider page, and we should decide whether this commission widens to cover those call sites too.
- Is there appetite for replacing polling with a push transport as a follow-up? Not in scope here, but flag it if the fix makes that transition meaningfully easier or harder.
