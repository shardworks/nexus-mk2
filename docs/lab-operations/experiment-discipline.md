# Experiment Discipline — Detection vs Deployment Thresholds

When an experiment measures an intervention's effect, two distinct
questions come up:

1. **Detection:** "Did this intervention have a clean, attributable effect?"
2. **Deployment:** "Should we ship this intervention?"

These are different questions with different evidence requirements.
Conflating them — using detection thresholds as deployment gates — has
led us to reject 7-15% improvements as "below threshold" when those
improvements were probably real and worth shipping.

This doc separates the two thresholds and codifies when each applies.

## The detection threshold (statistical)

Used to answer: "Is this effect attributable, mechanistic, publishable?"

- Calibrated against measured CV at small-n
- Typically ~20% at n=3 against ~10% CV (the X021/X023 baseline)
- Used to:
  - Generalize from one workload to others
  - Publish findings ("X intervention reduces cost by Y%")
  - Decide whether a mechanism is real enough to design follow-up work
  - Gate decisions about further investment (more trials, deeper measurement)

When **detection threshold applies:**
- The intervention has significant deployment cost (architecture change,
  ongoing maintenance burden, dependency on other work)
- We want to confidently attribute the effect to the intervention vs
  other factors
- The result will inform broader claims or generalizations
- We're publishing findings externally

## The deployment threshold (economic)

Used to answer: "Given everything we know, is shipping this expected to
save money or improve quality?"

Three conditions, all must hold:

1. **Central estimate is positive.** Mean cost reduction > 0 in trials,
   or measurable quality improvement, or both. Confidence intervals can
   overlap zero — we just need the central tendency to point the right way.
2. **No measurable quality regression.** Tier 1 verify pass rate not
   degraded; no new failure modes introduced relative to baseline.
3. **Deployment is low-risk.** Three criteria — intervention must be:
   - **Cheap to deploy** (single file edit, manifest tweak, etc.)
   - **Trivially reversible** (`git revert` works, no migration debt)
   - **Quality-checked downstream** (review/seal pipeline, or production
     telemetry, will catch any regression that slips through)

When all three hold, the deployment threshold is much lower than the
detection threshold. Expected-value math:

- If intervention is +X% effect with probability P, and -X% effect with
  probability Q, and neutral with probability 1-P-Q
- Expected savings = X × (P - Q) × daily_implementer_spend
- Even at modest P-Q delta (say, 0.5), small effects compound across
  many sessions

For **prompt-content interventions specifically** (role file edits,
inventory format tweaks, few-shot examples, etc.), the low-risk criteria
are met by default. Deployment threshold should be aggressive.

## When deployment threshold applies

- Prompt-content changes (role files, inventory format, briefs)
- Tool description tweaks
- Cache layout reordering
- Position adjustments within a prompt
- Any intervention easily reversible by `git revert`

When **deployment threshold does NOT apply** (need higher bar):

- Framework architecture changes (new engines, new pipeline stages)
- Plugin additions that affect runtime behavior
- Changes to writ/click/rig data shape
- Anything that touches sealing, autonomous execution, or daemon behavior
- Anything that adds latency to the pipeline

## Stacking small wins

If several interventions each meet the deployment threshold (central
estimate positive, no quality regression, low risk), **deploy them as
a bundle** rather than waiting for each to clear the detection threshold
in isolation.

Example math:
- 3 interventions each estimated at -5 to -10% effect with no
  significant quality regression
- Bundle them together; ship as one role-file edit
- Even if 1 of 3 is actually noise (zero effect), the bundle delivers
  ~10-15% real savings
- If 1 of 3 is actually slightly negative (-3%), the bundle still nets
  ~5% positive
- Production telemetry confirms or refutes the bundle as a whole

Production telemetry is the real measurement, not the trial.

## Production telemetry as primary evidence

Each implementer session captures `costUsd`, `durationMs`, `tokenUsage`,
and `exitCode`. Aggregating these across N sessions of post-deployment
work gives a measured comparison vs the pre-deployment baseline.

For deployment-threshold decisions, **the production data confirms or
refutes the trial signal at higher n than any affordable trial can
provide**. A 10% intervention effect that costs $300 to detect cleanly
in a trial (n=10 × 2 cells × $15/trial) costs $0 to detect in production
once we deploy and watch for a week.

Discipline for production-monitored deployment:

1. **Deploy with a marker.** Note the commit / timestamp where the
   intervention landed. Tag in the role file's git history or a session
   note.
2. **Set a monitoring window.** Default 7-14 days of normal autonomous
   work after deployment, or N=20+ implementer sessions, whichever first.
3. **Compare aggregate metrics.** Mean session cost, p95 cost, Tier 1
   pass rate, time-to-terminal-state, before vs after deployment.
4. **Roll back if the data is bad.** If the bundle shows aggregate cost
   increase or quality regression vs pre-deployment baseline, `git revert`
   and post-mortem.

If after the monitoring window the intervention shows aggregate cost
reduction or no change, **keep it deployed**. The production measurement
is more reliable than the trial that motivated the deployment.

## How to author hypotheses under this framework

For experiments testing prompt-content interventions:

**H1 (deployment-eligibility hypothesis):**
> Does the intervention show a positive central estimate on cost AND
> no measurable quality regression vs baseline, at n=3?

If H1 sustains, the intervention is eligible for deployment-threshold
shipping. Decision: deploy and monitor.

**H1' (detection hypothesis — optional):**
> Is the intervention's effect attributable at ≥X% with statistical
> confidence at n=Y?

H1' applies if we need to publish, generalize, or invest in follow-up
mechanism work. Set X and Y based on observed CV.

Both can be tested in the same experiment; H1 is the action gate, H1'
is the inference gate.

## Worked example — X025 (few-shot examples)

Under the OLD framework (single 20%/n=3 threshold):
- H1 NOT sustained on either workload (A6p +2%, A2 -8.7%, both below 20%)
- Verdict: don't deploy
- We threw away a possible -8.7% improvement plus a variance-reduction
  signal

Under the NEW framework:
- **Deployment-threshold check:**
  - Central estimate on cost: A6p neutral (+2%), A2 negative (-8.7%) →
    weighted by workload representativeness, net positive
  - Quality regression: NONE (the trial 13 oculus regression was a
    workload-environment edge case, not v3-induced — both baseline
    and v3 trials touched only `packages/plugins/reckoner`; verify
    enumeration failure was a property of which Sonnet variants exposed
    routes, not the few-shot examples)
  - Low-risk: yes (single role-file edit, easily reverted, downstream
    review catches issues)
  - **Deployment-threshold verdict: DEPLOY with production monitoring**
- **Detection-threshold check:**
  - Effect size below ~20% on both workloads
  - **Detection-threshold verdict: NOT sustained**

Two different verdicts on the same data. The deployment-threshold lets
us ship a small but probably-real improvement; the detection-threshold
tells us "this isn't a clean attributable finding worth publishing as
'few-shot examples reduce implementer cost by X%'."

Both are correct verdicts to their own question.

## Retroactive re-evaluation discipline

When a prior experiment's "below threshold" verdict was set using the
OLD framework's single threshold, it's worth re-evaluating against the
deployment threshold:

1. Is the central estimate of cost effect positive (or neutral)?
2. Is there evidence of quality regression?
3. Is the intervention low-risk to deploy?

If yes/no/yes → re-eligible for deployment. Bundle with other re-eligible
interventions and ship via production monitoring.

See `experiments/X025-implementer-few-shot/artifacts/runlog.md` for an
example application of this re-evaluation.

## What this changes operationally

Before:
- Trials sized to detect 20% effects at n=3
- Sub-20% effects abandoned regardless of direction
- Production telemetry tracked but not primary
- Each intervention evaluated in isolation

After:
- Trials sized for "did this make things worse?" first; effect-size
  measurement second
- Sub-20% positive effects eligible for bundled deployment
- Production telemetry primary evidence for deployment-threshold decisions
- Interventions stacked opportunistically and rolled forward as bundles

The detection threshold doesn't go away — we still use it for clean
attribution and publishable claims. But it stops being the gate for
"should we ship this."
