# System Architecture (Technical Reference)

This document describes the same system as [guild-metaphor.md](./guild-metaphor.md) using standard technical terminology, without the guild metaphor. It exists as a point of comparison for experiment X006, which tests whether the metaphor improves comprehension, engagement, and agent focus.

Both documents describe the same architecture. Where guild-metaphor.md says "anima," this says "agent instance." Where it says "quest," this says "task." The structure is identical — only the language differs.

## Core Entities

### System

The top-level container. One instance encompasses all agents, repositories, and activity.

### Operator

The human user. The operator defines objectives, sets priorities, and evaluates outputs. The operator does not interact with system internals directly — they use the CLI, status reports, and delivered artifacts. The system serves the operator.

### Agent Instance

The fundamental unit of identity. Every agent instance has a unique identifier and an authorship token. No anonymous instances — every action in the system is attributable. An agent instance is an AI-backed entity with persistent identity: named, configured with instructions, tracked, and accountable for its work.

The system distinguishes between agent instances (AI-backed, capable of judgment and open-ended reasoning) and automation scripts (no AI, deterministic, purely mechanical).

#### Lifecycle States

Every agent instance exists in one of three states:

| State | Meaning |
|-------|---------|
| **Training** | Being configured, not yet dispatchable. The instance exists in the registry and may be undergoing instruction configuration, but cannot be assigned to tasks. |
| **Active** | Available for dispatch or currently assigned. This is a working instance. |
| **Decommissioned** | Permanently removed from service. The instance's record and authorship tokens persist in the registry indefinitely, but it is no longer dispatchable. |

#### Persistent vs. Ephemeral

The meaningful distinction among active instances is **persistent** vs. **ephemeral**:

- **Persistent** — available indefinitely, invoked by name. A persistent instance remains active across tasks. The system coordinator, lead planner, and knowledge-base agent are typically persistent. They are always available.
- **Ephemeral** — instantiated for a specific task. An ephemeral instance's active period lasts only as long as the task it was created for. Implementation agents are typically ephemeral — a fresh instance is created for each task, and it is decommissioned when the task completes.

Persistent and ephemeral instances are structurally identical: entries in the registry with identifiers, authorship tokens, instructions, and history. The difference is retention policy, not data model.

### Registry

The authoritative datastore of every agent instance that has ever existed. The registry contains instances in training, active instances, and decommissioned instances whose authorship tokens still appear on artifacts in the system's repositories. Each registry entry records the instance's identifier, authorship token, instructions, capabilities, configuration history (who configured them, how their instructions changed over time), and full state history.

### Active Instance Index

The active subset of the registry. This is a filtered view, not a separate datastore — it returns all instances currently in `active` state. The active instance index is the system's source of truth for "what agents are available right now," including each instance's role, persistent/ephemeral status, and operational instructions.

### Role

A functional category, filled by zero or more agent instances. Roles define what kind of work an instance performs and when it is invoked. Roles are not a fixed enum — new roles can be defined as the system evolves.

Known roles:

| Role | Function |
|------|----------|
| **Implementer** | Executes tasks. Receives a plan and produces code. |
| **Planner** | Plans task execution. Refines vague requirements into concrete specifications and acceptance criteria. |
| **Lead Planner** | Senior planner. If a lead planner is active, it must be consulted before any task is assigned to an implementer. Produces a plan that implementers must follow. May delegate to a planning committee for complex cases. |
| **System Coordinator** | Top-level decision maker. Interfaces with the operator. Determines priorities and allocates resources. |
| **Team Lead** | Decision maker for a specific team. Manages team-level priorities and resources. |
| **Cost Tracker** | Tracks AI token usage and expenditures. Provides cost visibility and may participate in resource allocation decisions. |
| **Knowledge Base Agent** | Answers questions about code and system design. A consultative role invoked when agents need understanding of existing systems. |
| **Training Agent** | Configures other agent instances. Each training agent has its own static configuration and capabilities; instances configured by a training agent carry metadata recording the lineage. |

## Organizational Structure

### Team

An organizational subunit of the system. Teams group related work and repositories. Each team has its own scope of concern and may have a team lead. Teams are the unit of autonomy within the system — they can manage their own priorities within the bounds set by the system coordinator and operator.

### Repository

A git repository owned by a team. Repositories store the system's produced artifacts — code, configurations, assets. A team owns one or more repositories. (The 1:1 vs. 1:N relationship is to be determined.)

### Internal Tooling Team

A special team that produces tools and infrastructure for the system itself. This team builds CLI tools, deployment services, and internal utilities — anything the system uses to operate. Its artifacts are consumed by other agent instances, not by the operator directly.

### Training Subsystem

A subsystem that takes agent instances in `training` state and configures them with capabilities and instructions. The training subsystem has training agents — named instances that fill the `training agent` role. Each training agent has its own static configuration. When a training agent configures an instance, that event is recorded as provenance: the instance's registry entry records who configured it, when, and what was applied. This creates a traceable lineage for how any instance's instructions evolved.

## Communication

### Message Queue

Each agent instance has a message queue where messages are delivered for the instance to process. When a message arrives, it is passed to the instance's AI context, and the instance acts according to its role. Message queues are the primary mechanism for asynchronous coordination. (Format and transport TBD.)

## Infrastructure

### Automation Scripts

Deterministic glue code with no AI. Automation scripts are cron jobs, queue consumers, file movers, and other mechanical processes that handle repeatable work: reading a message from a queue and passing it to an agent instance, moving files between repositories, triggering state transitions, etc.

The distinction is essential: **agent instances use AI** (capable of judgment and open-ended reasoning), **automation scripts do not** (deterministic, purely mechanical, perfectly repeatable). Automation scripts are the connective tissue that lets agent instances focus on work that requires intelligence.

## Work

### Task

A unit of work that produces artifacts. Tasks result in code committed to a repository. Tasks are created by the operator (or, eventually, by system-internal processes), assigned to agent instances, and tracked through a lifecycle.

#### Planning Review

If a **lead planner** is active, it must be consulted before any task is assigned to an implementer. The lead planner reviews the task and produces a `plan` — a structured output that the implementer must follow. Implementers are instructed to never deviate from the plan.

If other planners are active, they form a **planning committee**. The lead planner may choose to convene the committee for complex cases, gathering multiple perspectives before producing the plan. Committee consultation is at the lead planner's discretion, not automatic.

### Internal Request

A task submitted by a team rather than the operator. Internal requests are proposals to build or improve team resources — paying tech debt, upgrading tooling, refactoring internal systems. The cost tracker and system coordinator evaluate internal requests and decide which to approve, balancing cost against value. Internal requests use the same task infrastructure but originate from within the system.

### Artifacts

The outputs stored in repositories — code, configurations, assets, and other deliverables produced by task execution. Artifacts are the tangible output of the system.

## Records & History

### Operational Logs

Logs, transcripts, and metadata produced by system activity. Session logs, task records, planning outputs, cost reports — the record of what the system did, why, and how it went.

## Open Questions

- **Team-to-repository cardinality:** Is a team always 1:1 with a repository, or can a team own multiple repositories? The 1:N model is more flexible but adds complexity to dispatch and ownership.
- **Internal request mechanics:** How does a team submit an internal request? Does the team lead use the same CLI? Is there an approval flow, or does the system coordinator just see a queue?
- **Planning committee protocol:** When the lead planner convenes the committee, what does that look like? Parallel consultation? Sequential? Does the lead planner synthesize, or does each planner contribute independently?
- **Training provenance format:** What does the configuration lineage look like in practice? A list of configuration events? A tree? How granular — per-capability, or per-session?
- **Message queue implementation:** What does the queue look like? File-based? Database rows? How do automation scripts know when to deliver? Polling? Event-driven?
