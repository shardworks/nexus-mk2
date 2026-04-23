Decision D6 (where to put the contract assertion) selects `patron-anima-test` over `both` because the primer-attended.md prose is a sage instruction, not a machine contract, and asserting on its phrasing locks editorial wording.

However: if the primer-attended.md role file's directive ever changes ("pre-fill on every decision" → "pre-fill only when confident" or any softening), the patron-anima engine's behaviour-test guard will keep passing (tests construct plans by hand) while the actual production behaviour silently shifts. The behaviour test pins the engine; nothing pins the role file's contract.

Not in scope (the brief framed the assertion as an engine-side check), but if the patron observes the primer-attended.md drifting in future rigs, a one-line static-content guard in supportkit.test.ts (assert the role file contains the phrase "pre-fill `selected` on every decision") would tighten the hinge.

Leaving as observation rather than decision because it crosses the editorial-wording-vs-machine-contract line, and the brief did not ask for it.