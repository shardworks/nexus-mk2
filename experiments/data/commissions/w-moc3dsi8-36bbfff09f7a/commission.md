`packages/plugins/astrolabe/patron-anima-prompt.md:8-9` says: *"Everything you confirm, override, or fill in is a decision `decision-review` can fast-path past; everything you abstain on flows through to the patron."*

This sentence remains accurate after the D1 + D2 fixes (decision-review still fast-paths past `selected !== undefined` decisions; abstained decisions get `selected` cleared by patron-anima.collect() and so flow through to the patron via decision-review's existing surface). But the mechanism described in the second clause ("abstained … flows through") relies on the D2/clear-selected behaviour to be implemented — today, abstained decisions silently retain primer's `selected` and never reach the patron.

No prompt edit is strictly required: the prompt's external-facing description of the contract is correct under the post-fix behaviour. But worth a re-read once the fix lands to verify nothing else in the prompt promises behaviour the engine wasn't doing.

Not blocking; a 60-second proofread after the fix is adequate.