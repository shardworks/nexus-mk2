# Improve rig engine status accuracy

If an engine in a rig fails, the whole rig fails. However, all downstream engines remain the 'ready' state or 'pending' or whatever. We should transition them to an appropriate state to indicate they are cancelled or some other suitable term. Use the stacks CDC for this.
