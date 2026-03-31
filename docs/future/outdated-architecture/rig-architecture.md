# Nexus Movement System — Architecture & Design

## 1. Overview

The Movement System is the execution backbone of the Nexus guild. It accepts commissions,
constructs dependency graphs, and orchestrates the work of anima and engines until a Matrix
is delivered into a forge.

It sits between the Clockworks (which manages guild lifecycle and delivers signals) and the
forges (which hold the Matrices being built). It is powered by the Mainspring.

---

## 2. Architectural Principles

- **The graph is the truth.** All state lives in the Ledger. No in-memory state is authoritative.
- **The operator is dumb.** Intelligence lives in condition checkers and plugins — not the reconciliation loop.
- **The graph is always open.** Any unturned node may be replaced at any time. The system handles a perpetually mutable graph.
- **Actions are idempotent.** The operator may dispatch the same action multiple times safely.
- **Turned nodes are immutable.** Distillate is final. No replacement, no retraction.
- **Plugins own their domain.** Condition checking, action handling, and graph construction for a given concern belong to one plugin.

---

## 3. System Components

```
┌─────────────────────────────────────────────────────┐
│                   CLOCKWORKS                        │
│   signal bus · commission intake · guild lifecycle  │
└────────────────────────┬────────────────────────────┘
                         │ spawns movements
                         ▼
┌─────────────────────────────────────────────────────┐
│                   MOVEMENT SYSTEM                   │
│                                                     │
│  ┌─────────────┐   ┌─────────────┐  ┌───────────┐  │
│  │   PLANNER   │   │  OPERATOR   │  │  LEDGER   │  │
│  │             │   │             │  │  SQLite   │  │
│  │ backwards   │   │ reconcile   │  │           │  │
│  │ chaining    │◄──┤ loop        │◄─┤ movements │  │
│  │ graph build │   │             │  │ nodes     │  │
│  │             │──►│             │──►│ actions   │  │
│  └──────┬──────┘   └──────┬──────┘  │ sessions  │  │
│         │                 │         └───────────┘  │
│         │          ┌──────▼──────┐                 │
│         │          │  ESCAPEMENT │                 │
│         │          │             │                 │
│         │          │ job runner  │                 │
│         │          │ pluggable   │                 │
│         │          └──────┬──────┘                 │
│         │                 │                        │
│  ┌──────▼─────────────────▼──────┐                 │
│  │        PLUGIN REGISTRY        │                 │
│  │                               │                 │
│  │ capabilities · conditions     │                 │
│  │ job handlers · schemas        │                 │
│  └───────────────────────────────┘                 │
└─────────────────────────────────────────────────────┘
                         │ distillate
                         ▼
┌─────────────────────────────────────────────────────┐
│                    FORGES                           │
│              (repositories / Matrices)              │
└─────────────────────────────────────────────────────┘
```

---

## 4. Component Specifications

### 4.1 Ledger (SQLite)

The authoritative state store. All components read and write through the Ledger.

```sql
-- Active movements
CREATE TABLE movements (
  id           TEXT PRIMARY KEY,
  commissionId TEXT NOT NULL,
  state        TEXT NOT NULL,   -- active | complete | retired
  createdAt    TEXT NOT NULL,
  completedAt  TEXT
);

-- All nodes across all movements
CREATE TABLE nodes (
  id           TEXT PRIMARY KEY,
  movementId   TEXT NOT NULL,
  conditionType TEXT NOT NULL,
  conditionCtx TEXT NOT NULL,   -- JSON: resolved context
  dependencies TEXT NOT NULL,   -- JSON: NodeId[]
  outputSchema TEXT NOT NULL,   -- JSON: schema definition
  output       TEXT,            -- JSON: populated when turning
  state        TEXT NOT NULL,   -- idle|working|turning|seized
  createdAt    TEXT NOT NULL,
  turnedAt     TEXT,
  FOREIGN KEY (movementId) REFERENCES movements(id)
);

-- Action dispatch records
CREATE TABLE actions (
  id           TEXT PRIMARY KEY,
  nodeId       TEXT NOT NULL,
  jobId        TEXT NOT NULL,
  state        TEXT NOT NULL,   -- pending|running|complete|failed|timed-out
  attempts     INTEGER DEFAULT 0,
  maxAttempts  INTEGER NOT NULL,
  backoff      TEXT NOT NULL,
  backoffMs    INTEGER,
  timeoutMs    INTEGER NOT NULL,
  dispatchedAt TEXT NOT NULL,
  deadline     TEXT NOT NULL,
  retryAfter   TEXT,
  output       TEXT,            -- JSON
  error        TEXT,
  FOREIGN KEY (nodeId) REFERENCES nodes(id)
);

-- Anima session tracking
CREATE TABLE anima_sessions (
  id           TEXT PRIMARY KEY,
  nodeId       TEXT NOT NULL,
  branch       TEXT NOT NULL,
  repo         TEXT NOT NULL,
  state        TEXT NOT NULL,   -- active|complete|failed
  heartbeat    TEXT,            -- last heartbeat timestamp
  checkpoint   TEXT,            -- last committed sha
  output       TEXT,            -- JSON: final distillate
  createdAt    TEXT NOT NULL,
  completedAt  TEXT,
  FOREIGN KEY (nodeId) REFERENCES nodes(id)
);

-- Forge registry
CREATE TABLE forges (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  repo         TEXT NOT NULL,
  config       TEXT NOT NULL,   -- JSON: capabilities, packages, workflows, etc.
  createdAt    TEXT NOT NULL
);
```

---

### 4.2 Escapement

The durable job runner. Pluggable implementation. Knows nothing about movements.

```typescript
interface Escapement {
  register(jobType: string, handler: JobHandler): void
  dispatch(job: Job): Promise<void>
  on(event: EscapementEvent, handler: JobEventHandler): void
  cancel(jobId: string): Promise<void>
}

type Job = {
  id:    string     // stable, deterministic — enables idempotency
  type:  string     // matches registered handler
  input: unknown    // resolved context
}

type JobHandler      = (job: Job) => Promise<unknown>
type EscapementEvent = "complete" | "failed"
type JobEventHandler = (jobId: string, result: JobResult) => void

type JobResult =
  | { state: "complete", output: unknown }
  | { state: "failed",   error: string }
```

**InProcessEscapement** — default implementation. Runs handlers as async functions.
No external infrastructure required. State is in-memory only; operator recovers
pending actions from Ledger on restart.

```typescript
class InProcessEscapement implements Escapement {
  private handlers = new Map<string, JobHandler>()
  private emitter  = new EventEmitter()

  register(type: string, handler: JobHandler) {
    this.handlers.set(type, handler)
  }

  async dispatch(job: Job) {
    const handler = this.handlers.get(job.type)
    if (!handler) throw new Error(`No handler for job type: ${job.type}`)
    handler(job)
      .then(output => this.emitter.emit("complete", job.id, { state: "complete", output }))
      .catch(error  => this.emitter.emit("failed",  job.id, { state: "failed", error: String(error) }))
  }

  on(event: EscapementEvent, handler: JobEventHandler) {
    this.emitter.on(event, handler)
  }

  async cancel(jobId: string) {
    // in-process: no cancellation mechanism; operator marks node seized
  }
}
```

**Future implementations:** `BullEscapement` (Redis-backed), `DockerEscapement`
(container-per-job), `RemoteEscapement` (dispatch to remote agent).

---

### 4.3 Plugin Registry

The central registry for all plugin-contributed behavior.

```typescript
type Plugin = {
  name:         string
  capabilities: Capability[]
  conditions:   Record<string, ConditionChecker>
  handlers:     Record<string, JobHandler>
}

type Capability = {
  satisfies:    string                                    // condition type this satisfies
  requires?:    string[]                                  // condition types needed first
  produces?:    string[]                                  // side conditions also satisfied
  appliesWhen?: Partial<Record<string, unknown>>          // context constraints
  priority?:    number                                    // higher wins on conflict
  insertChain:  (ctx: ResolvedContext) => NodeDefinition[]
}

type ConditionChecker = (ctx: ResolvedContext) => Promise<ConditionResult>

type ConditionResult =
  | { satisfied: false }
  | { satisfied: true, output: unknown }

type NodeDefinition = {
  id?:          string           // generated if omitted
  conditionType: string
  conditionCtx:  Record<string, ContextValue>
  dependencies?: string[]
  outputSchema:  Schema
  action?:       ActionDefinition
  failurePolicy?: FailurePolicy
}

type ContextValue =
  | { kind: "literal", value: Primitive }
  | { kind: "ref",     node: string, path: string }

type ActionDefinition =
  | { kind: "engine",         jobType: string }
  | { kind: "anima",          task: string    }
  | { kind: "spawn-movement", commissionRef: string }

type FailurePolicy =
  | { kind: "retry",  maxAttempts: number, backoff: "none" | "linear" | "exponential", backoffMs?: number }
  | { kind: "seize"  }
  | { kind: "notify", animaRole: string }
```

**Plugin registration at startup:**

```typescript
class PluginRegistry {
  register(plugin: Plugin, escapement: Escapement) {
    for (const [type, handler] of Object.entries(plugin.handlers)) {
      escapement.register(type, handler)
    }
    // store capabilities and condition checkers internally
  }

  getCapabilities(conditionType: string): Capability[]
  getConditionChecker(conditionType: string): ConditionChecker | undefined
}
```

---

### 4.4 Operator

The reconciliation loop. Runs on a configurable interval. Stateless between cycles.

```typescript
class Operator {
  constructor(
    private ledger:   Ledger,
    private registry: PluginRegistry,
    private escapement: Escapement
  ) {
    escapement.on("complete", this.onJobComplete.bind(this))
    escapement.on("failed",   this.onJobFailed.bind(this))
  }

  async reconcile() {
    const movements = await this.ledger.getActiveMovements()
    for (const movement of movements) {
      const nodes = await this.ledger.getNodes(movement.id)
      for (const node of nodes) {
        await this.reconcileNode(node)
      }
    }
  }

  private async reconcileNode(node: Node) {
    if (node.state === "turning")  return
    if (node.state === "seized")   return

    const deps = await this.ledger.getDependencies(node.id)

    if (deps.some(d => d.state === "seized")) {
      await this.ledger.setNodeState(node.id, "seized")
      await this.emitImpulse(node)
      return
    }

    if (deps.some(d => d.state !== "turning")) return

    const context = await this.resolveContext(node, deps)
    if (!context) return   // unresolvable refs — wait

    const checker = this.registry.getConditionChecker(node.conditionType)
    if (!checker) return   // no checker registered — planner will handle

    const result = await checker(context)

    if (result.satisfied) {
      await this.ledger.setNodeTurning(node.id, result.output)
      await this.emitImpulse(node)
      return
    }

    // check for pending action — do not double-dispatch
    const pending = await this.ledger.getPendingAction(node.id)
    if (pending) {
      await this.checkDeadline(pending)
      return
    }

    if (!node.action) return   // planner will insert chain

    await this.dispatch(node, context)
  }

  private async checkDeadline(action: ActionRecord) {
    if (Date.now() < new Date(action.deadline).getTime()) return
    await this.ledger.setActionState(action.id, "timed-out")
    await this.applyFailurePolicy(action)
  }

  private async applyFailurePolicy(action: ActionRecord) {
    const node   = await this.ledger.getNode(action.nodeId)
    const policy = node.failurePolicy ?? { kind: "retry", maxAttempts: 3, backoff: "exponential", backoffMs: 1000 }

    if (policy.kind === "seize") {
      await this.ledger.setNodeState(node.id, "seized")
      await this.emitImpulse(node)
      return
    }

    if (policy.kind === "retry" && action.attempts < policy.maxAttempts) {
      const delay     = this.backoffDelay(policy, action.attempts)
      const retryAfter = new Date(Date.now() + delay).toISOString()
      await this.ledger.scheduleRetry(action.id, retryAfter)
      return
    }

    if (policy.kind === "retry" && action.attempts >= policy.maxAttempts) {
      await this.ledger.setNodeState(node.id, "seized")
      await this.emitImpulse(node)
      return
    }

    if (policy.kind === "notify") {
      await this.insertConsultation(node)
    }
  }

  private async dispatch(node: Node, context: ResolvedContext) {
    const jobId = this.stableJobId(node.id, context)
    await this.ledger.createActionRecord(node.id, jobId, node.action)
    await this.escapement.dispatch({ id: jobId, type: node.action.jobType, input: context })
  }

  private async onJobComplete(jobId: string, result: JobResult) {
    const action = await this.ledger.getActionByJobId(jobId)
    if (!action) return
    await this.ledger.setActionComplete(action.id, result.output)
    // operator will pick up on next reconcile cycle
  }

  private async onJobFailed(jobId: string, result: JobResult) {
    const action = await this.ledger.getActionByJobId(jobId)
    if (!action) return
    await this.ledger.setActionFailed(action.id, result.error)
    await this.applyFailurePolicy(action)
  }

  private stableJobId(nodeId: string, context: ResolvedContext): string {
    // deterministic hash of nodeId + context — ensures idempotent dispatch
    return `${nodeId}:${hash(context)}`
  }
}
```

---

### 4.5 Planner

Watches for unsatisfied nodes with no action and no pending dispatch. Queries the plugin
registry for capabilities. Inserts chains via replace-with-chain. Runs separately from
the operator on a slower interval.

```typescript
class Planner {
  async plan() {
    const unplanned = await this.ledger.getUnplannedNodes()
    for (const node of unplanned) {
      await this.planNode(node)
    }
  }

  private async planNode(node: Node) {
    const capabilities = this.registry.getCapabilities(node.conditionType)

    if (capabilities.length === 0) {
      // no plugin can satisfy this — surface to guild operator
      await this.ledger.flagUnresolvable(node.id)
      return
    }

    const capability = await this.selectCapability(node, capabilities)
    if (!capability) return

    const context = await this.resolveContext(node)
    const chain   = capability.insertChain(context)

    await this.replaceWithChain(node, chain)
  }

  private async selectCapability(node: Node, capabilities: Capability[]): Promise<Capability | null> {
    // filter by appliesWhen context constraints
    const applicable = capabilities.filter(c => this.contextMatches(c.appliesWhen, node))

    if (applicable.length === 0) return null
    if (applicable.length === 1) return applicable[0]

    // multiple applicable — sort by priority, highest wins
    const sorted = applicable.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
    if (sorted[0].priority !== sorted[1].priority) return sorted[0]

    // true conflict — insert consultation node for anima to resolve
    return this.insertCapabilityConflictConsultation(node, applicable)
  }

  private async replaceWithChain(node: Node, chain: NodeDefinition[]) {
    if (node.state === "turning") return   // immutable — should not happen

    // tail node must honor replaced node's output schema
    const tail = chain[chain.length - 1]
    this.assertSchemaCompatible(tail.outputSchema, node.outputSchema)

    await this.ledger.replaceNodeWithChain(node.id, chain)
  }
}
```

---

### 4.6 Replace-With-Chain

The single dynamic graph modification mechanism. Implemented as a Ledger transaction.

```typescript
async replaceNodeWithChain(nodeId: string, chain: NodeDefinition[]) {
  // within a single SQLite transaction:
  // 1. verify node has not turned
  // 2. find all nodes that depend on nodeId
  // 3. insert chain nodes into movement
  // 4. repoint dependents to tail node id
  // 5. remove original node
  // 6. set tail node id = original node id (identity inheritance)
}
```

The tail node inherits the replaced node's identity. All downstream refs remain valid.

---

## 5. Plugin Design

### 5.1 Structure

```typescript
// example: git plugin
export const GitPlugin: Plugin = {
  name: "git",

  capabilities: [
    {
      satisfies:   "branch-merged",
      requires:    ["branch-exists"],
      insertChain: (ctx) => [
        {
          conditionType: "branch-merged",
          conditionCtx:  {
            repo:   { kind: "literal", value: ctx.repo },
            branch: { kind: "ref",     node: "anima-task-complete", path: "branch" },
            into:   { kind: "literal", value: "main" }
          },
          outputSchema: BranchMergedSchema,
          action: { kind: "engine", jobType: "git-merge" }
        }
      ]
    },
    {
      satisfies:   "branch-exists",
      requires:    [],
      insertChain: (ctx) => [
        {
          conditionType: "anima-task-complete",
          conditionCtx:  {
            task:   { kind: "literal", value: ctx.task },
            repo:   { kind: "literal", value: ctx.repo },
            branch: { kind: "literal", value: `anima/task-${generateId()}` }
          },
          outputSchema: AnimaTaskCompleteSchema,
          action: { kind: "anima", task: ctx.task }
        }
      ]
    }
  ],

  conditions: {
    "branch-exists": async (ctx) => {
      const sha = await git.getRef(ctx.repo, ctx.branch)
      if (!sha) return { satisfied: false }
      return { satisfied: true, output: { repo: ctx.repo, branch: ctx.branch, sha } }
    },
    "branch-merged": async (ctx) => {
      const merged = await git.isMerged(ctx.repo, ctx.branch, ctx.into)
      if (!merged) return { satisfied: false }
      const sha = await git.getRef(ctx.repo, ctx.into)
      return { satisfied: true, output: { repo: ctx.repo, branch: ctx.branch, into: ctx.into, sha, mergedAt: new Date().toISOString() } }
    }
  },

  handlers: {
    "git-merge": async (job) => {
      const { repo, branch, into } = job.input as any
      await git.merge(repo, branch, into)
      return {}   // condition checker verifies on next pass
    }
  }
}
```

---

## 6. Bootstrap Commissions

The minimum viable commission the system can fulfill on itself.

### Commission: "Add stub condition checker for file-exists"

**Initial graph submitted by anima planner:**

```
[anima-task-complete]
  task:   "Implement file-exists condition checker in git plugin"
  repo:   "guild/nexus"
  branch: "anima/task-{id}"
  output: { branch, sha, summary, artifacts }
        ↓
[branch-merged]
  repo:   ref(anima-task-complete.repo)
  branch: ref(anima-task-complete.branch)
  into:   "main"
  output: { repo, branch, into, sha, mergedAt }
        ↓
[ci-passed]                       ← stub: always true
  repo:   ref(branch-merged.repo)
  sha:    ref(branch-merged.sha)
  output: { repo, sha, passed }
        ↓
[commission-satisfied]
  commissionId: "{id}"
```

**What happens:**

1. Planner sees `anima-task-complete` unsatisfied, no action. Git plugin capability
   registers handler. Planner inserts locus apparatus.
2. Operator reconciles. Drive shaft spins. Locus prepared. Anima session spawned.
3. Anima inhabits locus. Writes condition checker. Commits to branch. Trips detent.
4. `anima-task-complete` turns. Distillate: `{ branch, sha, summary, artifacts }`.
5. `branch-merged` becomes actionable. Operator dispatches `git-merge` engine job.
6. Git merge completes. Condition checker verifies on next pass. Node turns.
7. `ci-passed` stub turns immediately.
8. `commission-satisfied` turns. Movement completes. Matrix updated.

---

## 7. Anima Session Lifecycle

```
1. Operator dispatches "anima-task" job to Escapement
2. Job handler:
   a. Check Ledger for existing session on this branch
   b. If exists and alive → attach, do not spawn new
   c. If not → spawn Claude Code subprocess
   d. Write session record to Ledger: state=active
3. Session runs:
   a. Emits heartbeat to Ledger periodically
   b. Commits work-in-progress to branch (checkpoint)
   c. May emit replace-with-chain requests via structured output
4. Session completes:
   a. Final commit on branch
   b. Emits completion signal with output distillate
   c. Job handler writes output to Ledger, marks complete
   d. Escapement emits "complete" event
5. Operator picks up on next reconcile cycle
   a. Condition checker verifies branch-exists
   b. Node turns
```

**Crash recovery:**

```
1. Heartbeat stops
2. Operator detects stale heartbeat on next cycle
3. Action marked timed-out
4. Failure policy applied (default: notify)
5. Consultation node inserted — sage anima assesses checkpoint
6. Sage decides: retry from checkpoint, seize, or replace-with-chain
```

---

## 8. Commission Intake

Commissions may be submitted in two forms:

**Pre-built graph** — patron or anima submits explicit node definitions. Operator
executes immediately. No planner involvement unless gaps exist.

**Goal declaration** — patron submits only a terminal condition. Planner constructs
the full graph via backwards chaining from the goal. Recommended for well-covered
condition types with registered plugin capabilities.

```typescript
type CommissionSubmission =
  | { kind: "graph", nodes: NodeDefinition[] }
  | { kind: "goal",  condition: ConditionDefinition, forgeId: string }
```

For bootstrap, anima submit pre-built graphs. Goal declaration is used once plugin
coverage is sufficient to make backwards chaining reliable.

---

## 9. Failure Modes & Recovery

| Failure | Detection | Recovery |
|---|---|---|
| Job never started | Deadline exceeded with no heartbeat | Retry per policy |
| Job handler threw | Escapement `failed` event | Retry per policy |
| Job hung | Deadline exceeded with active heartbeat | Timed-out, retry per policy |
| Anima session crashed | Heartbeat stale | Notify — sage assesses checkpoint |
| No plugin for condition | Planner finds no capability | Flag unresolvable, surface to guild |
| Plugin conflict | Multiple applicable capabilities, equal priority | Insert consultation node |
| Node replace-with-chain on turned node | Ledger transaction rejects | Error surfaced to requestor |
| Process restart | Operator reads Ledger on startup | Re-dispatches pending actions |

---

## 10. Startup Sequence

```
1. Load config
2. Connect to Ledger (SQLite)
3. Instantiate Escapement (InProcessEscapement by default)
4. Instantiate PluginRegistry
5. Register plugins → register handlers with Escapement
6. Instantiate Operator, Planner
7. Operator: recover pending actions from Ledger, re-dispatch
8. Start reconciliation loop (Operator)
9. Start planning loop (Planner)
10. Register with Clockworks — ready to accept commissions
```

---

## 11. Configuration

```typescript
type NexusMovementConfig = {
  escapement:
    | { kind: "in-process" }
    | { kind: "bullmq",  redis: RedisConfig }
    | { kind: "docker",  socketPath: string }
    | { kind: "remote",  endpoint: string, auth: string }

  reconcileIntervalMs: number    // default: 2000
  planIntervalMs:      number    // default: 5000

  plugins: Plugin[]

  ledger: {
    path: string                 // SQLite file path
  }
}
```

---

## 12. Invariants

1. **Turned nodes are immutable.** Output distillate is final.
2. **Tail nodes must honor replaced node output schemas.** Enforced at replace-with-chain time.
3. **Context grammar is literals and refs only.** No transformation in wiring.
4. **Actions are idempotent.** Stable job IDs derived from node ID and context.
5. **The graph is always open.** Scanner handles new nodes on next cycle without special casing.
6. **The Ledger is authoritative.** No in-memory state survives a restart.
7. **The operator is stateless between cycles.** All decisions are made from current Ledger state.