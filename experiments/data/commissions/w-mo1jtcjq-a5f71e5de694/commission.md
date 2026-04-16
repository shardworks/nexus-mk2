# Bug: piece-5 writ cancelled despite successful session                                                                                                                                                             

See rig rig-mo1j3a41-4bf6c710
  
  The piece-session engine completed, the session output shows the work was committed, but w-mo1j39zo has status cancelled with resolution "Automatically cancelled due to sibling failure." This is the cascade     
  message bug the analyst noted (it should say "parent termination" not "sibling failure"), but the bigger question is why it was cancelled at all.
                                                                                                                                                                                                                     
  I think there's a race: seal completes → rig completes → CDC transitions mandate to completed → Clerk's downward cascade cancels non-terminal children. If piece-5's collect() transition to completed lost the    
  race against the cascade, the writ stays open long enough to get cancelled. The collect() swallows the error silently (line 100: catch { // Piece may already be in a terminal state — ignore }). The work was done
   and committed — it's a bookkeeping bug, not a data-loss bug. But it'll skew any reporting that counts piece outcomes.