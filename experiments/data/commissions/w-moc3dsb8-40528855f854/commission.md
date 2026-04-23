The brief explicitly asks for this: *"And you'll want to flag c-mo9hnid0 with 'measurements pre-fix are invalid' — otherwise whoever closes that click will read the 0% override rate as signal."*

Click `c-mo9hnid0-d865f4cb28b8` is **live** under parent `c-mo81527r-9c0943f1ea18` ("Ongoing patron-agent refinement"). Its goal: *"Monitor patron-anima override rate and abstention rate across the next ~10 rigs after the razor-removal + abstention-rewrite edits land. Target: override rate 5-20% (below suggests rubber-stamping; above suggests analyst's Three Defaults are drifting from patron taste). Abstention rate should be near zero."*

Under the bug, both metrics are structurally 0% — not because the anima is meek but because it never ran. Any planner closing the click reading the metrics will conclude the rates are healthy when in fact zero rigs have been measured.

Suggested action (for whoever picks this up): add a child click or a comment under c-mo9hnid0 noting that all measurements taken before the patron-anima review-every-decision fix lands are invalid, and the monitoring window restarts after the fix is in place. This is a Ratchet-side curation step — not a code change.