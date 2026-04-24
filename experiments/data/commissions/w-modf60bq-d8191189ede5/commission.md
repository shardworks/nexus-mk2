# Summon relay (stdlib)

## Intent

Ship the stdlib `summon` relay that turns a writ-lifecycle or commission event into an anima session: role resolution, writ binding or synthesis, prompt hydration, manifest, session launch, and post-session writ lifecycle. After this lands, a standing order like `{ on: "mandate.ready", run: "summon-relay", with: { role: "artificer", prompt: "..." } }` actually dispatches an anima session. Summon is a regular relay with no special casing — it lives in the Clockworks apparatus's `supportKit` so every guild gets it by default.

## Motivation

The summon flow is the single most important thing the Clockworks does — it's the bridge from "an event happened" to "an anima works on it." Keeping it out of the core dispatcher commission (task 4) was deliberate: the flow touches anima resolution, writ binding, session provider, and post-session state machinery; folding it into the dispatcher would have bloated that review. With the dispatcher in place, summon is a focused additive commission.

Summon has no sugar form. Operators write the full `run: summon-relay` spelling with `role`, `prompt`, and any other inputs inside the standing order's `with:` field. Sugar can be added later if real usage shows operators want it; punting now keeps the surface tight and the dispatcher uniform.

## Non-negotiable decisions

### Summon is a real relay, registered via the apparatus `supportKit`

Summon is not special-cased in the dispatcher. It is a regular relay — same `relay()` factory, same registry, same invocation contract. It is shipped with the Clockworks apparatus itself via `supportKit` (declared in task 1, populated here) so every guild gets it by default without needing to install a separate plugin.

The relay's registered name is `summon-relay` (or `summon`, implementer's call — pick whichever fits the existing framework naming convention). All subsequent references are to this registered name.

### Invocation is the standard `run:` form

Standing orders invoking summon use the canonical shape established in task 4:

```json
{
  "on": "mandate.ready",
  "run": "summon-relay",
  "with": { "role": "artificer", "prompt": "...", "maxSessions": 5 }
}
```

The dispatcher (task 4) passes `order.with` to the relay as `params`. No desugaring, no sugar shorthand — operators write the full form.

### Summon relay responsibilities

Per the architecture doc's `Dispatch Integration` section and the existing summon-like code paths in the framework:

1. **Role resolution.** Find an active anima filling the `role` param. If none, throw — the dispatcher records the error and task 9 will surface it as `standing-order.failed`.
2. **Writ binding or synthesis.** For writ-lifecycle events (`{type}.ready`), bind to the writ in the event payload. For non-writ events where the standing order wants an anima session, synthesize a minimal writ carrying the triggering event as context.
3. **Prompt hydration.** The standing order's `prompt` param is a template; render it with `{{writ.title}}`, `{{writ.description}}`, etc., using the bound writ's fields.
4. **Manifest + session launch.** Call the existing session provider to launch the anima.
5. **Post-session lifecycle.** On session exit: if the anima declared the writ complete, transition it through its normal lifecycle; if the session failed, apply the circuit breaker.

### Params expected on the relay

All params below live inside the standing order's `with:` object.

- `role` (string, required) — the role to summon.
- `prompt` (string, optional) — prompt template with `{{writ.*}}` placeholders.
- `maxSessions` (number, optional, default 10) — circuit breaker.
- Any additional keys pass through as context available to the prompt template.

If `role` is missing, the relay throws at invocation time with a clear message.

### Circuit breaker: `maxSessions` param with default 10

Per the architecture doc: each writ has a session attempt counter. The summon relay increments on each launch and fails the writ after `maxSessions` attempts. Default 10. The param is per-standing-order — setting `with.maxSessions` to 20 overrides the default; 0 disables the breaker.

### Role-resolution failure throws

If no active anima fills the named role, the relay throws immediately. No fallback, no "try again later" — the standing-order-level error surface (task 9) will reflect this as a `standing-order.failed` event with a clear message.

## Out of scope

- **Sugar shorthand** (`summon:`, `brief:`, any other). Explicitly dropped in task 4; not introduced here. Can be added later if warranted.
- **`standing-order.failed` event emission.** Task 9. The summon relay throws on role-resolution failure; the dispatcher records the error; task 9 wires the downstream event signal.
- **Anima instantiation / retirement.** Existing machinery; the summon relay consumes it but does not change it.
- **Session provider implementation.** Existing machinery.
- **Writ synthesis schema details.** Minimal synthesis (just enough to carry context for standing orders that target non-writ events) — detailed design can happen in-implementation; the brief frames the intent.
- **Prompt template syntax extensions.** Use the existing template syntax; no new interpolations.
- **Parallel-session capacity enforcement.** Existing Animator/Spider concerns — not the summon relay's job.

## Behavioral cases the design depends on

- A standing order `{ on: "mandate.ready", run: "summon-relay", with: { role: "artificer", prompt: "..." } }` fires on a matching event; the dispatcher invokes `summon-relay` with `params: { role: "artificer", prompt: "..." }`; an anima session is launched bound to the event's writ.
- A standing order with `with.maxSessions: 3` fires a fourth time on the same writ; the relay fails the writ with a circuit-breaker message and does not launch another session.
- A standing order naming a role with no active anima throws from the relay; the dispatcher records the error; no session is launched.
- A standing order invoking `summon-relay` with no `with.role` throws at invocation time with a clear message.
- Templates referencing `{{writ.title}}` etc. render correctly from the bound writ's fields.

## References

- `docs/architecture/clockworks.md` — Standing Orders (summon relay params), Relay Contract sections
- `c-mo1mql8a` — Clockworks MVP timer apparatus