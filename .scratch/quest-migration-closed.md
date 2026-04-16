# Quest → Click Migration: Closed/Cancelled Quests

Assessment of all 37 completed/cancelled/failed quests for residual value worth preserving as concluded clicks.

Legend:
- ✅ = completed, clear conclusion reached
- ❌ = cancelled, explicit reason recorded
- 💀 = dissolved by construction (a structural change made the question moot)

---

## Worth Preserving as Concluded Clicks

These closed quests contain decisions or conclusions that future sessions should be able to discover. They should become concluded clicks with the conclusion captured.

### Decisions That Inform Active Work

| Quest | Status | Conclusion | Why Preserve |
|-------|--------|------------|--------------|
| **w-mnsx90p1** Writ status model simplification | ✅ | Shipped: 6-value model (new/open/stuck/completed/failed/cancelled). ready/active/waiting removed. | Active reference — agents need to know the canonical status set |
| **w-mnsww5kg** Plugin-contributed writ types | ✅ | Shipped: kit `writTypes` contribution field, config-overrides-kit policy | Referenced by multiple active quests (multi-rig, rig templates) |
| **w-mnt0jin1** File-canonical quest bodies | ✅ | Shipped: convention layer, body lives in file, row has stub+Goal | Historical — dissolved several sibling quests; documents the convention that the click model now replaces |
| **w-mnsx3onr** Rename 'quest' | ✅ | Resolved: renamed to 'click', shipped as Ratchet apparatus | Direct ancestor of current click model |
| **w-mo0gias9** Pilgrimage: alternative quest storage | ✅ | Concluded: explored Ratchet/click as separate apparatus, adopted | Direct ancestor of current click model |
| **w-mnszh7kz** Race-safe pending session recovery | ✅ | Shipped: age-gated + sweep-ordered pending session reaping in Animator | Active reference — the fix is in production, agents working on Animator should know about it |

### Architectural Decisions (Shipped Features)

| Quest | Status | Conclusion | Why Preserve |
|-------|--------|------------|--------------|
| **w-mnsiduuj** Detached sessions architecture | ✅ | Shipped: full detached session architecture | Major architectural decision; children capture review findings and test plan |
| **w-mnsidw40** Detached sessions commission review | ✅ | Code quality strong; identified integration gaps (tool server boot, session registration) | Review findings are reference material |
| **w-mnsidxaz** Detached sessions smoke test plan | ✅ | Test plan executed and passed | Test methodology reference |
| **w-mnsidp6m** Startup lifecycle phases | ✅ | Shipped: unified kit wiring, startup phases | Active reference — the startup model agents build on |
| **w-mnsidnza** Patron input block type | ✅ | Shipped: `patron-input` block type for structured patron input | Active feature; agents building on input requests need this |
| **w-mnsierwe** Patron input early spec | ✅ | Early design that led to the shipped patron-input block type | Historical precursor |
| **w-mnsidmrt** Engine blocking on external conditions | ✅ | Shipped: block types, checkers, rig-resume | Foundation for patron-input and future blocking |
| **w-mnsidlkp** Block checker failure signal | ✅ | Shipped: checkers can signal permanent failure | Complements engine blocking |
| **w-mnsidkdk** Kit-contributed roles | ✅ | Shipped: roles as kit contributions | Framework feature reference |
| **w-mnsidj6m** Configurable rig templates | ✅ | Shipped: guild.json rig template configuration | Active feature reference |
| **w-mnsidhyd** Normalize ID formats | ✅ | Shipped: `{prefix}-{base36ts}{hex}` convention | Active convention agents must follow |
| **w-mnsieqo6** Kit-contributed rig templates | ✅ | Shipped: kits can contribute rig templates | Framework feature reference |
| **w-mnsiepgz** Astrolabe sage instructions | ✅ | Shipped: sage role instructions for astrolabe pipeline | Active reference |
| **w-mnsicty7** Spider engine throttling | ✅ | Shipped: per-rig and global engine concurrency limits | Active feature reference |
| **w-mnsidd2u** Babysitter MCP handshake race | ✅ | Shipped: fix for MCP tool-list race at session start | Bug fix reference |
| **w-mnsidbuq** Oculus Spider page enhancements | ✅ | Shipped: rig template display, rig list improvements | UI feature |
| **w-mnsidfjk** Oculus feedback page | ✅ | Shipped: visual patron feedback UI | UI feature |
| **w-mnsidebi** Decision analysis → QuestionSpec tags | ✅ | Shipped: analyst metadata flows to feedback UI tags | Integration feature |
| **w-mnsidgr1** QuestionSpec tags + feedback filters | ✅ | Shipped: tags field on questions, UI filter toggles | UI feature |
| **w-mnsifdm1** Oculus web dashboard brief | ✅ | Shipped: full Oculus apparatus | Major feature |
| **w-mnsifesq** Oculus web dashboard spec | ✅ | Shipped: detailed spec for Oculus | Spec reference |

---

## Not Worth Preserving (Dissolved / Cancelled with Clear Reason)

These quests were either dissolved by construction or cancelled with the reasoning fully captured in the quest body itself. The conclusions are self-evident or no longer relevant.

### Dissolved by File-Canonical Quest Bodies (w-mnt0jin1)
All three dissolved when quest bodies moved to files — the problems they described (concurrent writes, edit history, editing ergonomics) vanished because the substrate changed:

| Quest | Status | Why Not Preserve |
|-------|--------|-----------------|
| **w-mnszkcd5** Quest body edit history | 💀 | Git log on quest files = free audit trail. Problem dissolved. |
| **w-mnszjvrr** Quest body editing ergonomics | 💀 | Files editable with native tools. Problem dissolved. |
| **w-mnswwgah** Concurrent session writes | 💀 | Git conflict semantics apply. Problem dissolved. |

### Cancelled — Premature or Superseded

| Quest | Status | Why Not Preserve |
|-------|--------|-----------------|
| **w-mo0ffh3c** Quest workflow and orientation rituals | ❌ | Premature umbrella, cancelled same day. One-child umbrellas don't earn their keep. |
| **w-mnt106rv** Quest-helper CLI wrapper | ❌ | Superseded by click CLI (Ratchet P2). |
| **w-mnszhkjq** Unify capability registries | ❌ | Speculative refactor without forcing function. Idea noted, no decision needed. |
| **w-mnszhjq5** --setting-sources user research | ❌ | Superseded by containerization strategy. |
| **w-mnszhc65** Codex boundaries & permissions | ❌ | Superseded by containerization — filesystem isolation makes this moot. |
| **w-mnsyzpni** Verification contracts (Nyquist) | ❌ | Parked idea capture. The pattern is noted in the explicit-contracts quest cluster. |
| **w-mnsi25h6** Smoke test: opt-in dispatch | ❌ | Test passed. Pure operational artifact, no decision value. |
| **w-mnshgkja** Quest-scribe subagent | ❌ | Gating condition (context bloat) didn't trigger. Cancelled correctly. |

---

## Assessment Summary

| Category | Count | Recommendation |
|----------|-------|---------------|
| Decisions informing active work | 6 | Create concluded clicks with conclusions |
| Shipped architectural features | 22 | Create concluded clicks (batch) — these form a "decision digest" |
| Dissolved by construction | 3 | Drop — reasoning is self-evident |
| Cancelled / superseded | 8 | Drop — reasoning captured in quest bodies |
| **Total** | **37** | **28 worth preserving, 11 drop** |

### Value Assessment

**High value in preserving shipped-feature conclusions as concluded clicks:**
The 28 "worth preserving" quests document architectural decisions and shipped features that agents need to know about. Currently this knowledge exists only in quest bodies (which are about to be retired) and scattered commit history. Migrating them as concluded clicks creates a queryable decision record — directly addressing the "concluded clicks as forgotten knowledge" concern raised in click `c-mo1itn3x`.

**Low value in the cancelled/dissolved quests:**
The 11 "drop" quests have their reasoning fully captured in the quest body text. If we need to reference why something was cancelled, `nsg writ show` still works — the quest substrate isn't being deleted, just retired from active use.

### Recommendation

For the 28 worth preserving: create them as pre-concluded clicks (status: `concluded`, conclusion: one-line summary of what shipped/was decided). This is a batch operation that could be scripted. The question is whether this bulk backfill is worth the effort now vs. creating concluded clicks on-demand when a future session needs to reference one.
