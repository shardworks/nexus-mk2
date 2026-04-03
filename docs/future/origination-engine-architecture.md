# Guild Origination System

> This document describes how commissions become rigs — the intake process, the origination engine, and the codex surveying system that makes origination fast, reliable, and low-cost for common cases.

---

## Overview

When a commission arrives, something must turn it into a rig. That something is the **origination engine** — a guild-configured engine bound to the `commission.posted` signal via a standing order. The origination engine reads the commission, determines what the rig must ultimately achieve, and seeds an initial rig for the Spider to build out.

The Originator is not a named apparatus. It is a standing order and an engine — the guild's choice of engine, configured to meet the guild's needs. A guild that wants autonomous origination configures an autonomous engine. A guild that wants planning judgment configures a staffed engine. The framework provides the signal and the contract; the guild provides the implementation.

---

## The Origination Standing Order

Every guild that accepts commissions must define an origination standing order in `guild.json`:

```json
{
  "standingOrders": [
    {
      "on": "commission.posted",
      "run": "origination-engine"
    }
  ]
}
```

When `commission.posted` fires, the Clockworks runs the configured origination engine. The engine receives the commission payload and is expected to produce a rig seed — at minimum, a terminal need and an initial engine chain.

The origination engine's output is the rig's starting point. The Spider takes over from there.

---

## The Origination Contract

Whatever engine the guild configures for origination, it must honor this contract:

**Input:**
```typescript
{
  commissionId: string
  text:         string          // the patron's natural language commission
  charge?:      string          // optional charge type hint from the patron
  codexId?:     string          // target codex, if specified
  survey?:      CodexSurvey     // pre-loaded survey results for the target codex
}
```

**Output:**
```typescript
{
  terminalNeed:   Need          // what the rig must ultimately achieve
  initialEngines: Engine[]      // the first engine(s) to seed the rig with
  writs?:         Writ[]        // any writs to create alongside the rig
}
```

The engine may produce a minimal seed — a single engine, a single need — and trust the Spider to extend the rig as it runs. It does not need to plan the whole rig upfront.

---

## Implementations

### Default Engine — Commit to Default Branch

The simplest possible origination engine. Sets a single terminal need: a sealed draft binding on the codex's default branch. Appropriate for guilds that want human oversight after the AI works — the anima commits, the patron reviews and decides what happens next.

**Terminal need produced:** `draft-binding-sealed: {codexId}, branch: main`

**When to use:** Early-stage guilds, guilds where deployment decisions are made by humans outside the system, or any commission where the patron just wants code written and merged.

**Configuration:**
```json
{
  "standingOrders": [
    {
      "on": "commission.posted",
      "run": "commit-origination-engine",
      "params": {
        "branch": "main"
      }
    }
  ]
}
```

**Example commission:** *"Add a logout button to the header on every page."*

**Rig produced:**
```
[draft binding opened from main]
        ↓
[anima staffed engine: implement logout button]
        ↓
[sealing engine: merge draft to main]
```

The patron inspects the result, decides whether to deploy. The commission is fulfilled when the draft is sealed.

---

### Survey-Aware Autonomous Engine

Reads the commission text and the codex survey to select an appropriate charge type and fulfillment path. No anima required for origination. Fast, deterministic, appropriate for well-surveyed codices with predictable commission patterns.

Matches the patron's charge hint (or infers from commission text) against surveyed charge types. Selects the fulfillment path the survey specifies. Seeds the rig accordingly.

**When to use:** Mature guilds with well-surveyed codices, high commission volume, predictable commission patterns.

**Example commission:** *"Add a logout button to the header on every page."* Charge hint: `deploy`

**Survey consulted:**
```json
{
  "chargeTypes": {
    "deploy": {
      "applicable": true,
      "fulfillment": {
        "workflow": "deploy.yml",
        "environment": "production",
        "requiresCi": true
      }
    }
  }
}
```

**Rig produced:**
```
[draft binding opened from main]
        ↓
[anima staffed engine: implement logout button]
        ↓
[sealing engine: merge draft to main]
        ↓
[ci engine: run test suite]
        ↓
[deploy engine: run deploy.yml → production]
```

---

### Sage-Based Origination Engine

A staffed engine. A sage anima reads the commission, inspects the codex survey, considers the guild's installed kits, and produces a rig seed through judgment. Handles ambiguous commissions, novel charge types, and cases where the survey is incomplete or stale.

The sage is not planning the whole rig — the Spider will extend it. The sage is determining the terminal need and the first meaningful engine chain. This is a bounded planning task, not open-ended reasoning.

**When to use:** Complex or ambiguous commissions, codices with low survey confidence, guilds that want explicit planning oversight on every commission.

**Example commission:** *"The checkout flow is broken on mobile. Investigate and fix."*

The sage reads this and recognizes it is ambiguous — investigation may reveal the fix is trivial or substantial. The sage seeds a rig with an investigation engine first, leaving the terminal need conditional on what the investigation finds. The Spider extends the rig after investigation completes.

**Rig seed produced:**
```
[anima staffed engine: investigate checkout issue on mobile]
        ↓
[conditional: terminal need determined by investigation output]
```

The sage inscribes a note in the writ: *"Terminal need to be determined after investigation. Spider will extend rig based on findings."*

**Standing order:**
```json
{
  "on": "commission.posted",
  "summon": "sage",
  "params": {
    "task": "origination",
    "maxTokens": 4000
  }
}
```

---

### Hybrid Engine — Survey-First with Sage Fallback

The recommended default for most guilds. Attempts autonomous origination using survey data. Falls back to a sage when survey confidence is below threshold or no charge type matches.

```
commission arrives
        ↓
load codex survey
        ↓
survey confidence > threshold AND charge type matched?
        ├── yes → autonomous origination → rig seeded
        └── no  → sage origination → rig seeded
```

**Confidence threshold:** configurable per guild, default 0.7.

This engine handles the common case cheaply and the edge case correctly. Most commissions on well-surveyed codices flow through autonomously. Novel commissions and stale surveys escalate to judgment.

---

## Codex Surveying

When a codex is registered with the guild, the guild surveys it — an agent inspects the codex and determines which charge types are applicable and how each is fulfilled for this specific codex. Survey results are stored in the guildhall and consulted by the origination engine on every commission.

### What a Survey Produces

For each registered charge type, the survey records:

```typescript
type ChargeTypeSurvey = {
  chargeType:   string          // "deploy", "publish", "test-only", etc.
  applicable:   boolean         // does this charge type make sense for this codex?
  confidence:   number          // 0-1, how certain the survey agent is
  fulfillment:  Fulfillment     // how to accomplish this charge type
  analyzedAt:   string          // ISO timestamp
  evidence:     string[]        // what the agent found that supports this conclusion
}

type Fulfillment = {
  engines:      string[]        // which kit engines to use
  params:       Record<string, unknown>  // engine-specific configuration
  requirements: string[]        // what must be true before this charge type can run
}
```

**Example survey entry — deploy charge type:**
```json
{
  "chargeType": "deploy",
  "applicable": true,
  "confidence": 0.92,
  "fulfillment": {
    "engines": ["github-actions-engine"],
    "params": {
      "workflow": "deploy.yml",
      "environment": "production",
      "branch": "main"
    },
    "requirements": ["ci-passed"]
  },
  "analyzedAt": "2025-03-15T14:22:00Z",
  "evidence": [
    "Found .github/workflows/deploy.yml",
    "Found environment: production in workflow",
    "deploy.yml triggered on push to main"
  ]
}
```

### Where Surveys Live

Survey results live in the guildhall, not the codex repo. The survey is the guild's understanding of the codex — it belongs with the guild's records, not the project's source.

```
guildhall/
  surveys/
    {codexId}/
      current.json      ← active survey results
      history/
        {timestamp}.json  ← prior survey snapshots
```

Survey history is preserved. The guild can inspect how a codex's operational profile has changed over time.

### Managing Staleness

Codices change. Workflows are renamed, environments are added, deployment strategies shift. A survey accurate on registration day may be wrong six months later. Stale surveys produce wrong rigs — the origination engine selects a fulfillment path that no longer exists.

The recommended approach combines three layers:

---

**Layer 1 — Event-triggered re-survey**

The Clockworks watches each registered codex for changes that signal the survey may be stale. When detected, a re-survey runs automatically.

Trigger events:
- `.github/workflows/` modified — workflow configuration changed
- `package.json` modified — package name, scripts, or registry configuration changed
- Deployment configuration files modified (`fly.toml`, `vercel.json`, `Dockerfile`, etc.)
- New environments detected in workflow files

This layer catches most staleness proactively. The survey updates when the thing it describes updates.

---

**Layer 2 — Commission-time validation**

Before the origination engine uses survey data, a lightweight validation check runs:

- Does the specified workflow still exist?
- Does the specified environment still exist in the workflow?
- Does the specified registry still appear in configuration?

This is not a full re-survey — it takes seconds. It catches the most common staleness case: a referenced artifact has been renamed or removed. If validation fails, confidence is set to zero and the origination engine falls back to sage origination.

---

**Layer 3 — Confidence decay**

Each survey entry carries an `analyzedAt` timestamp. Confidence decays over time according to a configurable schedule:

```json
{
  "surveyConfidenceDecay": {
    "halfLifeDays": 30,
    "minimumConfidence": 0.2
  }
}
```

A survey with 0.92 confidence at analysis time decays to ~0.65 after 30 days, ~0.46 after 60 days. When confidence falls below the origination engine's threshold, the engine escalates to sage origination rather than proceeding autonomously.

This ensures graceful degradation — the system never hard-fails on stale surveys, it routes edge cases to judgment.

---

**Manual override**

Patrons or guild operators may mark a survey as stale at any time, triggering immediate re-survey. They may also manually correct survey entries when the agent has made an error.

```
guildhall/
  surveys/
    {codexId}/
      overrides.json    ← manual corrections, take precedence over survey results
```

---

### Charge Type Dropdown Population

Survey results populate the charge type hint in the patron's commission interface. Only applicable charge types with confidence above a minimum threshold are shown.

```
Commission: [___________________________]

Charge: [ Deploy to production      ▼ ]
          Deploy to production
          Deploy to staging
          Publish to npm
          Merge only
          ──────────────────
          Other (describe below)
```

The dropdown reflects what the guild actually knows how to do for this codex. A patron cannot select a charge type the survey has not validated. This prevents impossible commissions before they reach the origination engine.

---

## Does Codex Management Warrant a New Apparatus?

The surveying system introduces a continuous, guild-level concern that doesn't fit cleanly into any existing apparatus:

- The **Clockworks** handles events — it can fire re-survey triggers, but doesn't own survey logic
- The **Spider** handles rigs — survey management is not a rig concern
- The **Originator** (as standing order) handles single commissions — it consumes surveys but doesn't manage them

Surveying is ongoing, proactive, not tied to any single commission or rig. It watches codices, maintains records, runs re-analysis, manages confidence decay. That profile — continuous, guild-level, codex-aware — matches the character of an apparatus.

**The case for a Surveyor apparatus:**

A named apparatus makes the surveying concern explicit and extensible. Kit providers could contribute specialized survey engines for platforms they understand (GitHub Actions, Vercel, Fly.io). The guild's survey capability grows as kits are installed. A Surveyor apparatus gives this concern a home in the system's architecture.

*"The Surveyor watches registered codices and maintains the guild's understanding of their operational profiles. When a codex changes, the Surveyor re-analyses the affected entries. When confidence decays below threshold, the Surveyor schedules re-analysis. The guild's origination capability is only as good as its Surveyor's knowledge."*

**The case against:**

The surveying system can be implemented entirely through standing orders and engines — `codex.registered` triggers a survey engine, `codex.changed` triggers a re-survey engine, a scheduled standing order handles confidence decay. No new apparatus required. The Clockworks already handles all of this if the right standing orders are defined.

**Recommendation:**

Define the **Surveyor** as a named apparatus. The standing-order-only approach works mechanically but leaves the surveying concern unnamed and therefore invisible — a guild operator has no single place to look when survey quality is degrading. The Surveyor gives the concern identity, makes it inspectable, and provides a natural home for kit-contributed survey engines.

The Surveyor joins the Clockworks and Spider as a core apparatus — always running, codex-aware, predating any individual commission. Unlike the Originator (which was retired as an apparatus), the Surveyor has continuous work to do that justifies its status.

---

## Summary

| Concept | Implementation |
|---|---|
| Origination | Standing order on `commission.posted` running guild-configured engine |
| Default engine | Commit-to-branch — terminal need is a sealed draft binding on main |
| Sage engine | Staffed engine — sage anima reads commission and produces rig seed |
| Recommended engine | Survey-aware with sage fallback |
| Surveying | Surveyor apparatus — inspects codices at registration, maintains operational profiles |
| Staleness management | Three layers: event triggers, commission-time validation, confidence decay |
| Survey storage | Guildhall — not the codex repo |
| Charge type hints | Dropdown populated from survey results above confidence threshold |