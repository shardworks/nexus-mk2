The patron-anima engine writes Decision.patron when the anima emits a verdict. There's no per-plan record of "the anima session ran, here's what it returned" surfaced anywhere outside the verdict map on individual decisions. If the anima session itself fails or is partially malformed, there's no top-level signal on the plan (e.g., "3 of 7 decisions had verdicts; 4 abstained or were dropped due to malformed JSON").

Not a concern for this fix, but as the patron-anima becomes load-bearing (post-fix), the operator may want a 'Patron Anima' section on the plan-detail page that summarises: session id, verdict counts (confirm/override/fill-in/absent), session status. The data is already on `Decision.patron`; only rendering is missing.

Follow-up commission candidate.