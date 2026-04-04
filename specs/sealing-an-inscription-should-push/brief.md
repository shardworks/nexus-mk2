# Sealing an inscription should push

The seal engine doesn't call push() — even if seal worked, triggerQualityReview needs the commits in the bare clone, and push() is never called after seal.

Let's update the Scriptorium's 'seal' method to also push the main branch to the remote.
