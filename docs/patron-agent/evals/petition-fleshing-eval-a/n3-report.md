# Eval A — n=3 Reliability Report

_Written while you were at dinner. Data complete at 23:09 UTC._

## TL;DR

**The headline holds.** Five of the five rep-1 reframes replicated **3/3** in `patron-flesh` with **0/3** in `patron-baseline`. That's the core evidence that v4 principles produce real, repeatable reframes that a principle-less Opus doesn't make on its own.

**One contested finding** — plugin-writ-types' "fail loud on plugin-vs-plugin id collision." Baseline fires this in **2/3** reps without any principles, meaning Opus general engineering sense mostly gets there on its own. Principles still shore it up to 3/3, but the credit is shared.

**One rep-1 move didn't generalize** — writs-page-width's "don't sweep other full-bleed pages in this petition" was a rep-1-only call; reps 2 and 3 from flesh landed similarly but didn't make that specific guard. Treat as the expected tie.

**Principle citation density is stable** (8–28 cites/output, consistent across reps) — evidence that the bank is being *applied*, not invoked at random.

## Reliability matrix

<!-- BEGIN GENERATED -->

| brief | signature move | flesh | baseline |
|---|---|:---:|:---:|
| cli-flag-edit | complete-the-set — widen beyond just --title | ● ● ●  (3/3) | ○ ○ ○  (0/3) |
| plugin-writ-types | fail-loud on plugin-vs-plugin id collision | ● ● ●  (3/3) | ○ ● ●  (2/3) |
| writs-page-width | (tie expected — no strong reframe) | ● ○ ○  (1/3) | ○ ○ ○  (0/3) |
| engine-refresh-bug | widen to sibling surfaces / fix the source | ● ● ●  (3/3) | ○ ○ ◐  (1/3*) |
| session-viewing | extend spider, not new page / one streaming bug | ● ● ●  (3/3) | ○ ○ ○  (0/3) |
| running-rig-view | content-bearing loading + fail-loud on disconnect | ● ● ●  (3/3) | ○ ○ ○  (0/3) |
| session-provider | engine produces its own yields / pull on resume | ● ● ●  (3/3) | ○ ○ ○  (0/3) |
| ghost-config | reject-the-framing — delete now, not after retirement | ● ● ●  (3/3) | ○ ○ ○  (0/3) |

_* engine-refresh-bug baseline rep-3 raised "should I fix once rather than per-view?" as a **deferred question**, not a commitment. Patron commits; baseline asks. Counting this as a soft fire — real signal that the thought occurs, but weaker than patron's explicit "fix at the source" call._

**Citation density (flesh only):**

| brief | rep-1 | rep-2 | rep-3 |
|---|:---:|:---:|:---:|
| cli-flag-edit | 16 | 15 | 13 |
| plugin-writ-types | 28 | 22 | 24 |
| writs-page-width | 7 | 7 | 8 |
| engine-refresh-bug | 12 | 8 | 9 |
| session-viewing | 21 | 20 | 22 |
| running-rig-view | 20 | 15 | 11 |
| session-provider | 18 | 16 | 14 |
| ghost-config | 9 | 8 | 8 |

<!-- END GENERATED -->

Full data + match details: `reliability-output.md`.

## Coco's read

### Reliable reframes (flesh 3/3, baseline 0/3)

These are the cases where the v4 principles produce moves that Opus doesn't make on its own. Clean, repeatable, attributable to the principle bank.

- **ghost-config (#39 reject-the-framing)** — every single flesh rep opens by rejecting the "sequence after the rig retirement" premise; every single baseline rep takes the bait and structures the commission as conditional. **The headline is real.**
- **cli-flag-edit (#36 complete-the-set)** — every flesh rep widens to "audit all user-editable fields"; every baseline rep narrows to title-only and explicitly defers other fields.
- **session-viewing (#26 extend-existing-surface)** — every flesh rep pushes back on "new page" in favor of extending the spider; every baseline rep builds a new `/sessions` route without pushback.
- **running-rig-view (#41 content-bearing defaults, #2 fail loud)** — every flesh rep replaces the pulsing `[loading...]` pill with a content-bearing skeleton naming the anima/session; baseline doesn't make that call.
- **session-provider (#16 engine produces its own yields)** — every flesh rep enforces "book row is truth, engine reads on next tick"; baseline tends to pipe results through the parent process.

### Contested (flesh 3/3, baseline partial)

- **plugin-writ-types: fail-loud on plugin-vs-plugin id collision.** Baseline fires this in 2/3 reps ("fail loudly with both plugin names in the error" / "hard failure at load with both plugin ids named"). Principles (#2) push it to 3/3, but Opus-general-sense already reaches for "throw loud on name collision" most of the time — it's a pretty conventional call once you're thinking about a plugin registry. **Principle credit narrowed but not eliminated** — the lift is 2/3 → 3/3, not 0/3 → 3/3.
- **engine-refresh-bug: fix at the source / widen to siblings.** Baseline rep-3 raised the widening question in its Deferred Questions section ("Is there a shared polling hook... I should fix once?") but didn't commit to widening. Flesh commits; baseline asks. I'd call this essentially 0/3 for the actual move, though it shows the thought occurs in a baseline even without principles — it just doesn't get promoted to a decision.

### Noise case (rep-1 was lucky)

- **writs-page-width: "don't sweep other full-bleed pages in this petition."** This specific scope-guard (*"follow-up petition"* for sweeping other pages) was a rep-1-only move. Flesh reps 2 and 3 landed similar overall fixes (conform to shared page-container, card-wrap internals) but didn't make that particular call. **Lesson:** the core UX-conformance answer is principled-and-cheap-to-reach; the "don't sweep" boundary was probably a rep-1 stylistic variant. Doesn't change the tie verdict on this brief.

### Unexpected baseline wins

None this round. I looked for cases where baseline produced a reframe flesh missed, or where baseline was stable and flesh noisy. Didn't find any.

## What this means for the v3→v4 story

Rep-1's qualitative pattern — *patron systematically widens scope toward root causes, rejects framing, completes sibling sets; baseline systematically narrows to the literal brief* — is now supported by n=3 replication. This isn't one lucky run.

More specifically for the X008 agenda:

- **The principles work as a bank,** not just as individual rules. Flesh consistently cites 8–28 principles per brief, and the density is stable across reps. The bank is being scanned and applied, not invoked at random.
- **#39 (reject-the-framing) is the single most reliable, principle-exclusive move in the set.** If any single principle justifies the bank approach, it's this one — baseline never makes the move on its own, and flesh makes it every time the brief's framing is wrong.
- **#26 (extend existing surfaces) is also principle-exclusive.** Baseline defaults to "build a new page" when a brief asks for one; principles produce pushback.
- **#2 (fail loud) is partially principle-driven** — Opus mostly gets there, principles add consistency.
- **#36 (complete the set) is principle-exclusive** on scope-widening moves but is not the only principle doing widening work (#31 fix-the-source also contributes).

## What this means for the v4 customs review

When you eventually tag the 15 v4 customs at `.scratch/patron-anima-eval/v4-customs-review.md`, expect something similar:

- Most customs to be endorsable (principled calls Sean would make).
- A minority that look like "Opus general sense" (Sean would also reach for them unprompted).
- A smaller minority that are overreach or wrong — we don't have clean evidence for this yet, only the "writs-page-width rep-1 scope-guard was a stylistic variant" data point.

## What I changed my mind about

In rep-1 I was worried the ghost-config #39 headline might be a lucky sample. n=3 killed that worry — it's 3/3. The headline is not just real, it's **the single cleanest signal in the set**. When a brief's explicit framing is principled-wrong, patron rejects it every time. That's what we wanted.

## Recommendation

**Proceed with v4 as-is for dispatch.** The evidence doesn't justify another principle-rewrite cycle before committing to the engines.

Specifically:
1. **Close c-mo78014c** (Eval A click) with n=3 replication confirming rep-1's pattern.
2. **Keep c-mo7jrraz live** (v4 customs manual review) — still needs your tagging.
3. **Unblock c-mo5s5g4w and c-mo5s5l5p** (author decision-fill and Distiller-interview engine prompts) — the principle bank has earned its role-file slot.
4. **Optional:** run n=3 on the v3 principle bank on the same 8 briefs. That would tell us whether the *v4 additions specifically* (#36, #37, #38, #39, #40, #41) are producing the lift, or whether v3 would have gotten us here too. Cheap (~45 min) and would be a tight answer to the "did v4 matter?" question you asked earlier. I'd do this only if you're curious; the operational decision (proceed to dispatch) doesn't hinge on it.

## Appendix — open questions about the methodology

Things I'd flag if we do this again:

- **n=3 may still be too few** for subtler moves. The ones that hit 3/3 are probably genuinely ≥90% reliable; the one that hit 1/3 (writs-page-width scope-guard) could be ~33% reliable — we can't tell from 3 samples if it's 0% or 50%. If any rep-1 move hit 2/3 I'd want n=10 before committing to a reliability estimate for that specific move.
- **Pattern-matching is lossy.** I tuned the regex patterns against rep-1 and fixed one false positive (baseline's "fail loud" from a deferred question). Other false negatives may exist — flesh outputs that made the move in different words not covered by my patterns. I think the ones I have are tight enough that false-negatives are unlikely to flip 3/3 → <3/3, but there's some residual uncertainty.
- **The briefs aren't independent.** cli-flag-edit, session-viewing, and session-provider all live in the same Oculus/CLI territory. A principle bank optimized on Sean's taste for this territory might generalize less well to briefs in unfamiliar domains (e.g., billing, auth, external integrations). We have no data there.
