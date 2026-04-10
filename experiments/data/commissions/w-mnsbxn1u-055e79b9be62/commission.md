Currently, the spider will spawn as many available engines as it can, based on which ones are ready to start. We want to provide two dimensions of throttling:

- limit each rig to one concurrent engine, to avoid race conditions with rig-local resources
- limit the overall number of engines across all rigs to help manage costs and conserve system resources

Introduce two new guild config variables under the `spider` key:

- maxConcurrentEngines: total number of engines which may be running at once, as an absolute system-wide limit. Default to 3. Applies to engines of any kind
- maxConcurrentEnginesPerRig: total number of engines which may be running within a single rig. Default to 1.

Before starting a new engine, the spider should check its Books for the engines currently running (engine.status === 'running'). If starting an engine would surpass either of these limits, the spider should not start that engine. It stays in whatever pre-running status it was already in. The crawl priority loop should be updated as necessary:

On each crawl tick, in priority order:                                                                                           
1. Collect terminal sessions (always, no limit).
2. Start ready engines in existing running rigs (subject to per-rig and system-wide limits).                                     
3. Open new rigs from ready writs (subject to system-wide limit).      

When engine starts are held due to a throttling, the oculus UI for the rig(s) and engine(s) affected should have a visual cue that they are deferred to rate limits.