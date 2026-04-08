# Astrolabe MVP: Part 2

B — Astrolabe Clockwork Engines (complexity ~8)                                                                                                                                                         
  - plan-init — creates PlanDoc, sets status, yields planId. (Simple)
  - inventory-check — validates inventory exists in plans book. (Simple)                                                                                                                                  
  - decision-review — the big one: reads decisions → maps to InputRequestDoc → blocks on patron-input → reconciles answers back → validates consistency → yields decisionSummary. (Substantial)
  - Writ linking: the refines link from generated mandate back to brief. (This is really spec-writer behavior, but the linking mechanics need to be wired somewhere — likely in the decision-review or as 
  a utility the anima-session prompt can reference)
