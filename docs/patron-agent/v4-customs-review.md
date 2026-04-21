# v4 Customs — Review

Tag each custom with one of: `endorse` / `partially-endorse` / `context-gap` / `wrong`

Add a one-line note where helpful.


---

## fix-startup-lifecycle-phases-and :: D12  _(Sean also customed — likely endorse)_

**Q:** How is the deprecation warning triggered?


**Planner rec:** `a`  **You selected:** `custom`  **Agent selected:** `custom`


**Your override:** Do not have a deprecation period -- just remove plugin:initialized outright, and update consumers as needed


**Agent's custom:**

> Remove plugin:initialized for apparatuses directly in the same change that introduces apparatus:started — no deprecation warning, no transition window. If any internal consumer still subscribes, migrate it in the same PR.


**Agent's reasoning:** Principle #1 — when removal and deprecation both work, remove; principle #10 — Mk 2.1 carries no legacy; all three options share the premise that a deprecation window exists, which the principles reject (principle #39).


**Tag:** `<endorse | partially-endorse | context-gap | wrong>`


**Note:**


---

## parlour-page-for-oculus :: D19  _(Sean also customed — likely endorse)_

**Q:** What should be displayed as the conversation title in the sidebar?


**Planner rec:** `a`  **You selected:** `custom`  **Agent selected:** `custom`


**Your override:** Use topic if non-null, otherwise use the first human message (truncated) as the title


**Agent's custom:**

> Use topic if non-null; otherwise use the first human message (truncated); only if neither is available, fall back to a short content-bearing placeholder like 'New conversation' (not createdAt).


**Agent's reasoning:** Principle #41 is a direct hit — its example literally names this case: conversation title fallback should be first human message, not createdAt. Option a's createdAt fallback and option c's ignoring topic both share the wrong frame, so #39 applies.


**Tag:** `<endorse | partially-endorse | context-gap | wrong>`


**Note:**


---

## parlour-page-for-oculus :: D23  _(Sean also customed — likely endorse)_

**Q:** Where should the cost card be positioned?


**Planner rec:** `b`  **You selected:** `custom`  **Agent selected:** `custom`


**Your override:** in the sidebar with the session selector, below the sessions and aligned to the bottom of the chat ui


**Agent's custom:**

> In the sidebar, colocated with the conversation selector / session list — NOT in a global header, NOT above/below the message input. Cost is produced by the conversation selection, so the indicator belongs adjacent to that control.


**Agent's reasoning:** Principle #40 is a direct hit — its example names this exact case: 'A session-cost card colocates with session selection, not with the chat-compose area.' Options a/b/c share the wrong frame (placing it near chat compose or ambiguous 'sidebar-or-header'), so #39 applies.


**Tag:** `<endorse | partially-endorse | context-gap | wrong>`


**Note:**


---

## writ-parentchild-relationships :: D3  _(Sean also customed — likely endorse)_

**Q:** What is the type signature of the new WritDoc fields?


**Planner rec:** `a`  **You selected:** `custom`  **Agent selected:** `custom`


**Your override:** parentId?: string; -- optional, absent when not applicable


**Agent's custom:**

> parentId?: string — optional, absent on root writs. childCount is NOT a field per D2 (derived from queries). The option (a) style (optional, absent when not applicable) is the right shape for parentId; option (b)'s null-default sentinels are unnecessary.


**Agent's reasoning:** Both options share a premise (childCount is a field) that D2 rejects (#19, #39). For the field that does exist, prefer optional-absent over explicit-null — 'null parent' is a mis-encoding of 'root' (#2).


**Tag:** `<endorse | partially-endorse | context-gap | wrong>`


**Note:**


---

## anima-session-generic-engine :: D13  

**Q:** Should ReviseYields type be updated to reflect the new generic default shape?


**Planner rec:** `a`  **You selected:** `a`  **Agent selected:** `custom`


**Agent's custom:**

> Delete ReviseYields entirely. It is already drifting (missing output), barely used, and updating it further extends the lifespan of the wrong thing. Remove the type; let consumers fall back to the inferred generic-default shape. If a consumer is found that actually relies on it, reintroduce a corrected type at that time — earned by a named second consumer.


**Agent's reasoning:** Both options accept the premise that a drifting, barely-used type deserves preservation; #38 says prefer delete to repair when the thing is drifting, #18 says don't maintain abstractions without a named consumer, and #31 says fix the source (the type itself, via removal) not the consumer.


**Tag:** `<endorse | partially-endorse | context-gap | wrong>`


**Note:**


---

## brief-oculus-page-for-patron :: D42  

**Q:** What structural patterns should the source-text regression tests verify?


**Planner rec:** `a`  **You selected:** `a`  **Agent selected:** `custom`


**Agent's custom:**

> Verify the IIFE wrapper, question-type branching (choice/boolean/text), answer POST body shapes, and badge class mapping. Drop 'event delegation on data-* attributes' — D38 chose post-render querySelectorAll, not event delegation, so that regression is not the one the implementation will actually have. The correct set is: IIFE + question-type branching + POST body shapes + badge class mapping.


**Agent's reasoning:** Option (a) contains a check ('event delegation on data-* attributes') that contradicts the chosen rendering pattern in D38; option (b) drops POST body shapes and badge mapping which are real regression surfaces. The option frame is miscast (#39); correct it to match the actual implementation.


**Tag:** `<endorse | partially-endorse | context-gap | wrong>`


**Note:**


---

## create-copilot-session-provider :: D15  

**Q:** How should the provider handle config.conversationId when no agentic loop state is persisted?


**Planner rec:** `a`  **You selected:** `a`  **Agent selected:** `custom`


**Agent's custom:**

> Throw a clear error at launch() if config.conversationId is set — do not silently ignore it. Conversation resume is unsupported in the MVP copilot provider; silently ignoring a caller's assertion of continuity is exactly the silent-fallback principle #2 rejects. Document the limitation and surface the gap structurally until resume is actually implemented.


**Agent's reasoning:** Both options share a premise — that silently accepting an unsupported conversationId is acceptable — which principle #2 rejects. The right shape is fail-loud, framework-enforced (#12), not documentation-only (#39).


**Tag:** `<endorse | partially-endorse | context-gap | wrong>`


**Note:**


---

## doc-update-pass :: D13  

**Q:** Should the session notes and 'Next Steps' sections be updated or left as historical?


**Planner rec:** `a`  **You selected:** `a`  **Agent selected:** `custom`


**Agent's custom:**

> Remove the 'Next Steps' checklist entirely; leave session notes as-is. Next Steps is a drifting live-work artifact that belongs in real todos/tickets, not in a context doc — #38 says delete rather than repair. Session notes are honest historical record and stay.


**Agent's reasoning:** Principle #39 — both options accept the premise that 'Next Steps' is worth keeping; #19 and #38 say a drifting derived checklist in a context doc should be removed, not synced.


**Tag:** `<endorse | partially-endorse | context-gap | wrong>`


**Note:**


---

## fix-startup-lifecycle-phases-and :: D15  

**Q:** During the deprecation period, in what order are the two event names fired?


**Planner rec:** `a`  **You selected:** `a`  **Agent selected:** `custom`


**Agent's custom:**

> Not applicable — per D12, plugin:initialized is removed directly for apparatuses without a deprecation window, so there is no dual-fire ordering to decide.


**Agent's reasoning:** Follows from the D12 custom — if there is no deprecation window, there is no ordering question; the option set inherits D12's rejected premise (principle #39).


**Tag:** `<endorse | partially-endorse | context-gap | wrong>`


**Note:**


---

## kit-contributed-rig-templates-writ :: D18  

**Q:** Can kit-contributed mapping values reference any template name, or only templates from the same kit?


**Planner rec:** `a`  **You selected:** `a`  **Agent selected:** `custom`


**Agent's custom:**

> Mapping values may reference templates contributed by the same kit, by config, or by kits in the kit's requires + recommends (plus Spider's built-ins) — the same dependency-scoping rule as engine designIds in D7.


**Agent's reasoning:** Option a is too open (any kit's templates, no declared dependency) and option b is too restrictive (can't reference templates from declared dependencies). Principle #15 — cross-kit template references need the same dependency-scope discipline as engine designIds; both offered options violate that principle in opposite directions.


**Tag:** `<endorse | partially-endorse | context-gap | wrong>`


**Note:**


---

## parlour-page-for-oculus :: D29  

**Q:** What is the complete set of custom API routes the parlour page needs?


**Planner rec:** `a`  **You selected:** `a`  **Agent selected:** `custom`


**Agent's custom:**

> POST /api/parlour/turn ONLY as a genuine custom route (streaming, plus optional inline create per D34/D35). All other operations reuse existing tool routes: loom-roles tool (per D16), parlour.list with participantName filter (per D18), parlour.show, parlour.end. parlour.create remains a tool route but the turn endpoint short-circuits the new-conversation flow.


**Agent's reasoning:** Principle #3 (extend existing) and #23 (thinnest slice) — each listed option either over-routes around tool routes (a) or is internally inconsistent with D16/D18/D34 choices (b, c). #39 applies: the option set doesn't reflect the coherent route inventory once upstream decisions are settled.


**Tag:** `<endorse | partially-endorse | context-gap | wrong>`


**Note:**


---

## patron-input-block-type-commission :: D1  

**Q:** What is the shape of the InputRequestDoc type?


**Planner rec:** `a`  **You selected:** `a`  **Agent selected:** `custom`


**Agent's custom:**

> Questions as an ordered array of objects with an id field (preserves logical question order, matches the plan-decision precedent). Answers as a Record<questionId, AnswerValue> — keyed lookup for validation, NOT a parallel array. Parallel arrays desync under edits; maps mirror the natural access pattern.


**Agent's reasoning:** Both offered options share a flawed premise (all-maps vs parallel-arrays). Questions want order (#13, plan-decision precedent); answers want keyed lookup (#15, contract shape). The correct frame is the mixed shape.


**Tag:** `<endorse | partially-endorse | context-gap | wrong>`


**Note:**


---

## update-rig-template-variable-handling :: D17  

**Q:** How extensively should spider.md be updated?


**Planner rec:** `a`  **You selected:** `b`  **Agent selected:** `custom`


**Agent's custom:**

> Update the Configuration section to show variables and $vars.* syntax, AND remove the Static Graph section entirely since buildStaticEngines is being removed as dead code (see D18). Repairing a docs section that describes a removed function extends the lifespan of the wrong thing.


**Agent's reasoning:** Principle #38 — delete over repair when the artifact is drifting; the Static Graph section documents dead code being removed. #31 — fix at the source: if buildStaticEngines goes, its docs go with it, not get patched.


**Tag:** `<endorse | partially-endorse | context-gap | wrong>`


**Note:**


---

## writ-parentchild-relationships :: D34  

**Q:** What is the complete ALLOWED_FROM map after adding 'waiting'?


**Planner rec:** `a`  **You selected:** `a`  **Agent selected:** `custom`


**Agent's custom:**

> ready: ['new', 'waiting']
active: ['ready']
completed: ['active']
failed: ['active', 'waiting']
cancelled: ['new', 'ready', 'active', 'waiting']
waiting: ['new', 'ready', 'active']
new: []


**Agent's reasoning:** Both offered maps have `waiting: ['new', 'ready']` which contradicts D11=b (active → waiting must be valid when an active rig decomposes). Option (b) additionally omits 'waiting' from failed's sources, contradicting D12=a. The option set is mis-posed (#39); the complete map must include active in waiting's allowed-from.


**Tag:** `<endorse | partially-endorse | context-gap | wrong>`


**Note:**


---

## writ-parentchild-relationships :: D39  

**Q:** What error does post() throw when parentId references a writ in active or terminal status?


**Planner rec:** `a`  **You selected:** `a`  **Agent selected:** `custom`


**Agent's custom:**

> Throw with message: 'Cannot add children to writ "<id>": status is "<status>", expected one of: new, ready, active, waiting.' Single informative error; the allowed list must match D5=b (active is allowed).


**Agent's reasoning:** Option (a)'s error format is right but its enumerated list excludes 'active', contradicting D5=b (#39). Option (b) over-specializes the error without reader benefit. Single informative error with the correct allowed set (#2).


**Tag:** `<endorse | partially-endorse | context-gap | wrong>`


**Note:**


---
