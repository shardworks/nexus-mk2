# Parlour Oculus Page — Test Coverage Gap

Date: 2026-04-07

## Setup

Commission `w-mnoznabx-3f83f1ad2c50` (Parlour Oculus Page, cx 13, spec
quality strong) delivered with 140 passing tests and a clean build. Manually
sealed by Coco after the rig stalled. Initially recorded as `outcome: success`.

Discovered during live use: the chat feature was completely non-functional.
User messages never reached the anima — the Parlour's `turnRoute` recorded
the human turn but never forwarded the message to `takeTurnStreaming()`. The
anima received an empty prompt on every turn and responded to nothing.

## The Bug

In `routes.ts`, the turn handler:

1. Records the human turn with the message (correct)
2. Calls `parlour.takeTurnStreaming({ conversationId, participantId })` — 
   **omits the `message` field**
3. `assembleConsultMessage()` sees no message, no topic → returns `undefined`
4. Animator passes `undefined` as the prompt → Claude CLI gets empty stdin
5. Anima sees dashes or nothing; responds generically

One-line fix: add `message: message.trim()` to the `takeTurnStreaming` call.

## Observations

### High test count ≠ functional correctness

The commission produced 140 tests — an impressive number that passed both
the implement and revise sessions. But the route handler tests mock the
Parlour API at the boundary. They verify:

- Correct HTTP status codes for invalid input
- The *shape* of the `takeTurnStreaming` call (that it gets called)
- SSE event formatting
- Conversation creation and participant lookup

They do **not** verify that the user's message propagates through to the
anima's session. The mock captures *that* `takeTurnStreaming` was called,
but not *what* it was called with — or more precisely, the test doesn't
assert that the `message` field is present in the request.

This is a category of bug that unit tests with mocked dependencies
systematically miss: correct wiring at integration seams. Each side of
the seam works correctly in isolation — the route correctly parses the
message, and `takeTurnStreaming` correctly uses `request.message` when
present. The bug exists only in the join between them.

### The core feature was untested

The Parlour page's entire purpose is to let a human chat with an anima.
The one thing it absolutely must do — deliver the human's words to the
anima — was the thing that was broken. The test suite validated
everything around the critical path without validating the critical path
itself.

### Detection required live use

This bug was invisible to automated checks. It was only discovered when
Sean used the Parlour UI to talk to an anima and the anima responded as
if it hadn't heard anything. No amount of CI would have caught this
without an integration test that asserts on prompt content downstream of
the route handler.

## Relevance to X013

### H1 (Spec Quality Predicts Output Quality)

Complicates the picture. The spec was rated "strong" both pre- and
post-dispatch, and the commission met all 20 stated requirements. But
the delivered system had a critical functional bug. This suggests
`outcome: success` based on requirement checklist matching can mask
integration-level defects that the requirements didn't explicitly
test for.

Downgraded to `outcome: partial`, `revision_required: true`.

### H3 (Revision Rate as System Health Indicator)

Adds a revision to a commission previously counted as clean. The
revision was trivial (one line), but the *detection* required human
use — no automated instrument caught it. This is a reminder that
revision rate undercounts: it only captures defects that are found.
At current test coverage patterns, integration-seam bugs may
systematically escape.

### H4 (Attribution)

Failure mode is `execution_error` — the spec was clear, complexity
was appropriate, the anima just didn't wire the call correctly. The
anima wrote the `assembleConsultMessage` function that *expects* the
message to be passed, then wrote the route that *doesn't pass it*.
Both halves individually demonstrate understanding of the design;
the integration between them was dropped.
