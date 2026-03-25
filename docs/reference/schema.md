# Schema Reference

The guild's Books database (``.nexus/nexus.db``) — SQLite, WAL mode, foreign keys enforced. All entity IDs are TEXT using prefixed hex format.

---

## Entity Relationship Diagram

```
                            ┌─────────────────────┐
                            │    commissions       │
                            │─────────────────────│
                            │ id (c-)              │
                            │ content              │
                            │ status               │
                            │ workshop             │
                            └──────┬──────┬────────┘
                                   │      │
                    ┌──────────────┘      └──────────────┐
                    │                                    │
        ┌───────────┴──────────┐          ┌──────────────┴──────────┐
        │ commission_assignments│          │  commission_sessions    │
        │──────────────────────│          │─────────────────────────│
        │ commission_id ←──────│          │ commission_id ←─────────│
        │ anima_id ────────────│──┐       │ session_id ─────────────│──┐
        └──────────────────────┘  │       └─────────────────────────┘  │
                                  │                                    │
        ┌─────────────────────────┘                                    │
        │                                                              │
   ┌────┴──────────────┐                                ┌──────────────┴──────┐
   │     animas        │                                │      sessions       │
   │───────────────────│                                │─────────────────────│
   │ id (a-)           │                                │ id (ses-)           │
   │ name (unique)     │                                │ anima_id ───────────│──→ animas
   │ status            │                                │ provider, model     │
   └────┬──────────────┘                                │ trigger, workshop   │
        │                                               │ token usage, cost   │
        │                                               └─────────────────────┘
   ┌────┴──────────────────┐
   │  anima_compositions   │     ┌───────────────┐
   │───────────────────────│     │    roster      │
   │ anima_id (unique) ────│     │───────────────│
   │ curriculum snapshot   │     │ anima_id ──────│──→ animas
   │ temperament snapshot  │     │ role           │
   └───────────────────────┘     └───────────────┘


   ┌─────────────────────┐
   │       works         │
   │─────────────────────│
   │ id (w-)             │
   │ commission_id ──────│──→ commissions (optional)
   │ title, description  │
   │ status              │
   └──────┬──────────────┘
          │
   ┌──────┴──────────────┐
   │      pieces         │
   │─────────────────────│
   │ id (p-)             │
   │ work_id ────────────│──→ works (optional)
   │ title, description  │
   │ status              │
   └──────┬──────────────┘
          │
   ┌──────┴──────────────┐
   │       jobs          │
   │─────────────────────│
   │ id (j-)             │
   │ piece_id ───────────│──→ pieces (optional)
   │ title, description  │
   │ status, assignee    │
   └──────┬──────────────┘
          │
   ┌──────┴──────────────┐
   │     strokes         │
   │─────────────────────│
   │ id (s-)             │
   │ job_id ─────────────│──→ jobs (required)
   │ kind, content       │
   │ status              │
   └─────────────────────┘


   ┌─────────────────────┐          ┌──────────────────────┐
   │      events         │          │   event_dispatches   │
   │─────────────────────│          │──────────────────────│
   │ id (evt-)           │          │ id (ed-)             │
   │ name, payload       │←─────────│ event_id             │
   │ emitter, fired_at   │          │ handler_type/name    │
   │ processed           │          │ target_role          │
   └─────────────────────┘          │ status, error        │
                                    └──────────────────────┘

   ┌─────────────────────┐
   │    audit_log        │
   │─────────────────────│
   │ id (aud-)           │
   │ actor, action       │
   │ target_type/id      │
   │ detail, timestamp   │
   └─────────────────────┘
```

---

## Table-by-Table Reference

### `animas`

The Register — anima identity records.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY | Prefixed hex ID (a-) |
| `name` | TEXT | NOT NULL, UNIQUE | Human-readable name |
| `status` | TEXT | NOT NULL, CHECK | One of: `aspirant`, `active`, `retired` |
| `created_at` | TEXT | NOT NULL, DEFAULT now | ISO-8601 timestamp |
| `updated_at` | TEXT | NOT NULL, DEFAULT now | ISO-8601 timestamp |

### `anima_compositions`

Frozen snapshots of an anima's training content at instantiation time.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY | Prefixed hex ID |
| `anima_id` | TEXT | NOT NULL, UNIQUE, FK → animas | One composition per anima |
| `curriculum_name` | TEXT | NOT NULL | Curriculum name at instantiation |
| `curriculum_version` | TEXT | NOT NULL | Curriculum version at instantiation |
| `temperament_name` | TEXT | NOT NULL | Temperament name at instantiation |
| `temperament_version` | TEXT | NOT NULL | Temperament version at instantiation |
| `curriculum_snapshot` | TEXT | NOT NULL | Full curriculum content (frozen) |
| `temperament_snapshot` | TEXT | NOT NULL | Full temperament content (frozen) |
| `composed_at` | TEXT | NOT NULL, DEFAULT now | When the composition was created |

### `roster`

Role assignments — which animas hold which roles.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY | Prefixed hex ID |
| `anima_id` | TEXT | NOT NULL, FK → animas | The anima |
| `role` | TEXT | NOT NULL | Role name (must match guild.json roles) |
| `standing` | INTEGER | NOT NULL, DEFAULT 0 | Reserved for future use |
| `assigned_at` | TEXT | NOT NULL, DEFAULT now | When the role was assigned |

### `commissions`

Patron-posted work orders.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY | Prefixed hex ID (c-) |
| `content` | TEXT | NOT NULL | The commission specification |
| `status` | TEXT | NOT NULL, CHECK | One of: `posted`, `assigned`, `in_progress`, `completed`, `failed` |
| `workshop` | TEXT | NOT NULL | Target workshop name |
| `status_reason` | TEXT | | Human-readable reason for current status |
| `created_at` | TEXT | NOT NULL, DEFAULT now | |
| `updated_at` | TEXT | NOT NULL, DEFAULT now | |

### `commission_assignments`

Join table — which animas are assigned to which commissions.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY | |
| `commission_id` | TEXT | NOT NULL, FK → commissions | |
| `anima_id` | TEXT | NOT NULL, FK → animas | |
| `assigned_at` | TEXT | NOT NULL, DEFAULT now | |

UNIQUE constraint on `(commission_id, anima_id)`.

### `works`

Top-level work decomposition units.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY | Prefixed hex ID (w-) |
| `commission_id` | TEXT | FK → commissions | Optional — works can be standalone |
| `title` | TEXT | NOT NULL | |
| `description` | TEXT | | |
| `status` | TEXT | NOT NULL, DEFAULT 'open', CHECK | One of: `open`, `active`, `completed`, `cancelled` |
| `created_at` | TEXT | NOT NULL, DEFAULT now | |
| `updated_at` | TEXT | NOT NULL, DEFAULT now | |

### `pieces`

Subdivisions of work, grouping related jobs.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY | Prefixed hex ID (p-) |
| `work_id` | TEXT | FK → works | Optional |
| `title` | TEXT | NOT NULL | |
| `description` | TEXT | | |
| `status` | TEXT | NOT NULL, DEFAULT 'open', CHECK | One of: `open`, `active`, `completed`, `cancelled` |
| `created_at` | TEXT | NOT NULL, DEFAULT now | |
| `updated_at` | TEXT | NOT NULL, DEFAULT now | |

### `jobs`

Assignable work units belonging to a piece.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY | Prefixed hex ID (j-) |
| `piece_id` | TEXT | FK → pieces | Optional |
| `title` | TEXT | NOT NULL | |
| `description` | TEXT | | |
| `status` | TEXT | NOT NULL, DEFAULT 'open', CHECK | One of: `open`, `active`, `completed`, `failed`, `cancelled` |
| `assignee` | TEXT | | Anima name or identifier |
| `created_at` | TEXT | NOT NULL, DEFAULT now | |
| `updated_at` | TEXT | NOT NULL, DEFAULT now | |

### `strokes`

Atomic records of work performed against a job.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY | Prefixed hex ID (s-) |
| `job_id` | TEXT | NOT NULL, FK → jobs | Required — every stroke belongs to a job |
| `kind` | TEXT | NOT NULL | Type of work (e.g. "commit", "review", "test") |
| `content` | TEXT | | Details of the work performed |
| `status` | TEXT | NOT NULL, DEFAULT 'pending', CHECK | One of: `pending`, `complete`, `failed` |
| `created_at` | TEXT | NOT NULL, DEFAULT now | |
| `updated_at` | TEXT | NOT NULL, DEFAULT now | |

### `audit_log`

The Daybook audit trail — records of all significant actions.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY | Prefixed hex ID (aud-) |
| `actor` | TEXT | NOT NULL | Who did it: `patron`, `operator`, `framework`, `instantiate`, anima name |
| `action` | TEXT | NOT NULL | What happened: `commission_posted`, `anima_updated`, `job_created`, etc. |
| `target_type` | TEXT | | Entity type: `commission`, `anima`, `work`, `piece`, `job`, `stroke` |
| `target_id` | TEXT | | Entity ID |
| `detail` | TEXT | | JSON-encoded additional context |
| `timestamp` | TEXT | NOT NULL, DEFAULT now | |

### `events`

The Clockworks event queue.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY | Prefixed hex ID (evt-) |
| `name` | TEXT | NOT NULL | Event name (e.g. `commission.posted`, `code.reviewed`) |
| `payload` | TEXT | | JSON-encoded event data |
| `emitter` | TEXT | NOT NULL | Who signaled it |
| `fired_at` | TEXT | NOT NULL, DEFAULT now | |
| `processed` | INTEGER | NOT NULL, DEFAULT 0 | 0 = pending, 1 = processed |

### `event_dispatches`

Dispatch records — what happened when a standing order executed.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY | Prefixed hex ID (ed-) |
| `event_id` | TEXT | NOT NULL, FK → events | The triggering event |
| `handler_type` | TEXT | NOT NULL | `engine` or `anima` |
| `handler_name` | TEXT | NOT NULL | Engine name or anima name |
| `target_role` | TEXT | | Role name (for anima dispatches) |
| `notice_type` | TEXT | | `summon` or `brief` (for anima dispatches) |
| `started_at` | TEXT | | |
| `ended_at` | TEXT | | |
| `status` | TEXT | | `success` or `error` |
| `error` | TEXT | | Error message if status is error |

### `sessions`

Session records — every session launched through the funnel.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY | Prefixed hex ID (ses-) |
| `anima_id` | TEXT | NOT NULL, FK → animas | |
| `provider` | TEXT | NOT NULL | Session provider name (e.g. `claude-code`) |
| `model` | TEXT | | Model identifier |
| `trigger` | TEXT | NOT NULL | `consult`, `summon`, or `brief` |
| `workshop` | TEXT | | Workshop name (null for guildhall sessions) |
| `workspace_kind` | TEXT | NOT NULL | `guildhall`, `workshop-temp`, or `workshop-managed` |
| `curriculum_name` | TEXT | | |
| `curriculum_version` | TEXT | | |
| `temperament_name` | TEXT | | |
| `temperament_version` | TEXT | | |
| `roles` | TEXT | | JSON array of role names |
| `started_at` | TEXT | NOT NULL | |
| `ended_at` | TEXT | | Null while session is active |
| `exit_code` | INTEGER | | |
| `input_tokens` | INTEGER | | |
| `output_tokens` | INTEGER | | |
| `cache_read_tokens` | INTEGER | | |
| `cache_write_tokens` | INTEGER | | |
| `cost_usd` | REAL | | |
| `duration_ms` | INTEGER | | |
| `provider_session_id` | TEXT | | Provider's own session identifier |
| `record_path` | TEXT | | Path to the SessionRecord JSON file (relative to guild root) |

### `commission_sessions`

Join table — which sessions are linked to which commissions.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `commission_id` | TEXT | NOT NULL, FK → commissions | |
| `session_id` | TEXT | NOT NULL, FK → sessions | |

PRIMARY KEY on `(commission_id, session_id)`.

### `_migrations`

Internal tracking table for the migration system. Not part of the regular schema.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `sequence` | INTEGER | PRIMARY KEY | Migration sequence number |
| `filename` | TEXT | NOT NULL | Migration filename |
| `applied_at` | TEXT | NOT NULL, DEFAULT now | |
| `bundle` | TEXT | | Bundle that delivered this migration |
| `original_name` | TEXT | | Original filename before renumbering |

---

## Status Lifecycles

### Anima

```
aspirant → active → retired
```

- **aspirant** — created but not yet activated (not currently used by `instantiate()`, which creates directly as `active`)
- **active** — manifested for sessions, holds roles, can be dispatched
- **retired** — removed from service, roster entries deleted

### Commission

```
posted → assigned → in_progress → completed
                                → failed
```

- **posted** — created by patron, waiting for dispatch
- **assigned** — (manual transition) an anima has been assigned
- **in_progress** — the Clockworks has summoned an anima (automatic on `summon` dispatch)
- **completed** — all works finished (`completeCommissionIfReady()`)
- **failed** — manually set when the commission cannot be completed

### Work

```
open → active → completed
              → cancelled
```

- **open** — created, no work started
- **active** — work in progress
- **completed** — all pieces done, or manually set
- **cancelled** — abandoned

### Piece

```
open → active → completed
              → cancelled
```

Same as work. **Policy:** a piece with failed jobs stays `active` — it does not auto-complete until all jobs are completed/cancelled with none failed.

### Job

```
open → active → completed
              → failed
              → cancelled
```

- **open** — created, not yet assigned or started
- **active** — work in progress (signals `job.ready`)
- **completed** — all strokes done, none failed
- **failed** — at least one stroke failed (set by `completeJobIfReady()`)
- **cancelled** — abandoned

### Stroke

```
pending → complete
        → failed
```

- **pending** — recorded, awaiting outcome
- **complete** — work succeeded
- **failed** — work failed

---

## ID Conventions

All entity IDs use the format `{prefix}-{8 hex chars}` where the hex is generated from 4 random bytes (`crypto.randomBytes(4)`).

| Prefix | Entity | Example |
|--------|--------|---------|
| `a-` | Anima | `a-5e6f7a8b` |
| `c-` | Commission | `c-a3f7b2c1` |
| `evt-` | Event | `evt-1a2b3c4d` |
| `ses-` | Session | `ses-deadbeef` |
| `w-` | Work | `w-12345678` |
| `p-` | Piece | `p-abcdef01` |
| `j-` | Job | `j-fedcba98` |
| `s-` | Stroke | `s-11223344` |
| `aud-` | Audit log entry | `aud-aabbccdd` |
| `ed-` | Event dispatch | `ed-55667788` |
| `r-` | Roster entry | `r-99aabbcc` |
| `ac-` | Anima composition | `ac-ddeeff00` |
| `ca-` | Commission assignment | `ca-11223344` |

8 hex characters = 4 random bytes ≈ 4.3 billion possibilities per prefix. Sufficient for a single-guild system.

Generation: `generateId(prefix)` from `@shardworks/nexus-core`.
