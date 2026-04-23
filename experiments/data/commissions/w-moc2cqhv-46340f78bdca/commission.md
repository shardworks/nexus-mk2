Looking at the rig, patron-anima's startedAt and completedAt are identical to the millisecond — it never launched an anima session, never
   called the animator, just returned { status: 'completed' } immediately. That's the no-op path at the top of run():                      
                                                                                                                                           
  const reviewable = reviewableDecisions(plan);                   
  if (reviewable.length === 0) {
    return { status: 'completed', yields: {} };   // ← this fired                                                                          
  }                                                                                                                                        
                                                                                                                                           
  Where reviewableDecisions is:                                                                                                            
                                                                  
  return (plan.decisions ?? []).filter(d => d.selected === undefined);
                                                                                                                                           
  The contradiction
                                                                                                                                           
  Look at what the rig's reader-analyst actually produced (from its own output summary):                                                   
  
  ▎ "Decisions — 31 records with recommendations and selected pre-filled on every one."                                                    
                                                                  
  And compare to sage-primer-attended.md, which is the role the reader-analyst runs as when patronRole is configured:                      
                                                                  
  ▎ "This is the attended variant of the primer: a patron-anima is configured downstream and principle-checks every decision you produce.  
  ▎ Your job is to make a confident recommendation on every decision and pre-fill selected on every decision — the patron-anima applies its
  ▎  principles to decide whether to confirm, override, fill in, or abstain. ... there is no razor in this variant."                       
                                                                  
  So the primer is doing exactly what it's told — pre-filling selected on every decision. And the patron-anima's filter d.selected ===     
  undefined then excludes every single one of them. Zero reviewables. Instant no-op.
                                                                                                                                           
  The two halves of the system are speaking past each other. The role instructions and the engine code contradict each other at the        
  selected-as-signal boundary.
                                                                                                                                           
  Where the bug came from                                         

  Commit c653e59 ("refactor(astrolabe): split primer role; patron-anima reviews every decision") is the culprit. It:                       
  
  - Introduced sage-primer-attended with the "pre-fill selected on every decision" contract.                                               
  - Updated the patron-anima JSDoc to say "principle-check every decision the primer produced."
  - But left reviewableDecisions() unchanged — it still has its pre-split semantics from when "pre-decided" meant "razor-cleared, don't    
  bother the patron/anima."                                                                                                                
                                                                                                                                           
  The implementation is incomplete. The filter is a dead semantic leftover.                                                                
                                                                  
  Worse: there's a test at patron-anima.test.ts:290 that explicitly codifies the broken behavior — "no-ops when every decision is already  
  pre-decided by the primer". Under the new attended contract, "every decision pre-decided" is the normal case, not a no-op edge. The test
  survived the split too. That's why the commit's "260 tests pass" felt confident — the broken behavior was tested in, not tested out.     
                                                                  
  Blast radius

  - Every planning run since c653e59 (Apr 22) where patronRole is set has been no-op'ing patron-anima. The primer's pre-fills have been    
  going straight through to spec-writer unvalidated.
  - Silent: no error, no log, no visible symptom — just a 0ms engine and a missing session record.                                         
  - The click c-mo9hnid0 (Monitor patron-anima override rate and abstention rate) is measuring metrics that are structurally 0% — not      
  because the anima is meek, but because it never runs.                                                                                    
  - X008 analyses of override-rate behavior downstream of this commit are suspect. Worth flagging to whoever owns that thread.             
                                                                                                                                           
  The fix shape                                                   
                                                                                                                                           
  The cleanest framing: in attended mode, every decision is reviewable. Two options:                                                       
  
  1. Delete reviewableDecisions() and prompt the anima on all decisions. Cleanest. The engine only runs when patronRole is set, and under  
  that gate the primer always pre-fills every decision — so "reviewable" == "all." The filter has no remaining use.
  2. Invert the filter semantics: "reviewable = every decision" in attended mode. Same behavior, more ceremony. No reason to prefer over   
  (1) unless we want to leave a hook for a future mode that mixes razor + anima.                                                           
  
  The fix also needs:                                                                                                                      
                                                                  
  - Delete the no-ops when every decision is already pre-decided by the primer test — it tests the wrong contract.                         
  - Add a test that attended-mode decisions with pre-filled selected are all reviewed — the positive case for the new contract.
  - Review decision-review's downstream gate — what happens to decisions patron-anima abstained on? In attended mode, they have selected   
  (primer's pre-fill) but no patron emission. Decision-review needs to route those to the human, not silently accept the primer's best     
  guess. I'd want to read that engine before committing to the full fix shape.                                                             
                                                                                                                                           
  What I want to confirm with you                                                                                                          
  
  This is framework code — non-trivial semantic fix, not a one-line UI tweak. I think this wants a commission brief rather than a direct   
  edit, because:                                                  
                                                                                                                                           
  - The decision-review interaction needs investigation before the fix is fully specified.                                                 
  - The test suite needs both deletions and additions.
  - There's a testable assertion worth adding at the supportkit/contract layer ("primer-attended output + patron-anima filter agree on what
   'reviewable' means") to prevent this class of drift.                                                                                    
                                                                                                                                           
  Want me to draft a brief? I'd also want to open a click capturing the diagnosis so the brief has a source to reference. And you'll want  
  to flag c-mo9hnid0 with "measurements pre-fix are invalid" — otherwise whoever closes that click will read the 0% override rate as
  signal.