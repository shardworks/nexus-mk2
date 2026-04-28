The current event-catalog acknowledges that `book.<owner>.<book>.<verb>` events are emitted by framework code today but are NOT in the merged event set, so the `signal` validator does NOT block animas from forging them.

C3 (`clockworks-stacks-signals`) plants a function-form `events` kit that declares every `book.*` event the bridge can produce, which CLOSES this gap by making the names plugin-declared (sticky-true). Until C3 lands, the gap stays.

This is a known C3 follow-up; the event-catalog's docs in C2 should keep noting the gap and link to C3 (`w-mohuoxgh`) as the closing commission so doc readers do not assume the gap closed with C2.