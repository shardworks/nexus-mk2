`docs/reference/event-catalog.md` carries the same conceptual rot as building-engines.md but is not in this mandate's scope. Specifically:

- Line 144: example `signalEvent(home, 'code.reviewed', { ... }, 'my-engine');` — uses 'engine' as the emitter label.
- Lines 157–163: `"run" — Execute an engine` section. "The Clockworks runner imports the engine by name from `guild.json.engines`..." — describes the now-renamed relay model. Should reference relays and `clockworks.standingOrders` `run:` semantics.
- Lines 165–181: documents `summon:` and `brief:` as separate standing-order order types. The relay commission `w-modf5vyg` consolidated these into the unified `run:` form (the `summon-relay` is the stdlib relay). Sibling observation `w-modi88x2` flags the type-union side of this; the doc side is not specifically tracked elsewhere.
- Line 189: '(`run` engine, or `summon`/`brief` anima)' — same rot.

Address as a single doc-rot pass on event-catalog.md alongside `clockworks.md`'s standing-order section refresh (sibling obs `w-modi88vd`). Keeping them in one commission keeps the engine→relay terminology pass coherent.