# StackDash Page-Migration Workflow Builder

## Requirements, architecture, benchmark plan, and acceptance criteria

**Document purpose:** This document is the input specification for a new MastraCode goal/plan whose job is to **build the reusable page-migration workflow** for StackDash.

This document is **not** the page-migration workflow itself. It is also **not** an instruction to immediately redesign every page. The next MastraCode session must use this document to design, implement, test, document, and stabilize the workflow that will later migrate the remaining StackDash pages.

---

## 1. Primary objective

Build a repeatable, evidence-driven, MastraCode-compatible workflow that can take:

1. an existing StackDash page,
2. its current implementation and data plumbing,
3. a redesigned target image or design specification,
4. the surrounding repository architecture,

and produce a complete, verified implementation without silently omitting components, fields, interactions, states, data requirements, or backend handoffs.

The workflow must turn a visual redesign from a best-effort suggestion into an engineering contract.

A successful workflow must answer, with evidence:

- What is the page intended to help the operator understand or do?
- What exact sections, components, controls, labels, states, and data fields appear in the target design?
- Which of those already exist in the current page?
- Which data fields already exist somewhere else in the repository?
- Which fields are missing, partial, ambiguous, duplicated, or currently produced incorrectly?
- What system is the source of truth for each field?
- How is each field transported and refreshed?
- What must be added to UDP telemetry, polling, database aggregation, adapters, or derived calculations?
- Which reusable components, hooks, schemas, services, and chart patterns already exist?
- What must be implemented, in what dependency order?
- How will the workflow prove that nothing visible or behavioral was skipped?

The workflow must remain useful after the initial three benchmark pages. It must not become a Tdarr-specific, Downloads-specific, or Overview-specific script.

---

## 2. Non-goals and boundaries

The workflow-building session must not confuse the following activities:

### 2.1 Building the workflow

This is the current objective. It includes creating the workflow architecture, agents, skills, schemas, artifact formats, validators, commands, tests, benchmark harness, and documentation.

### 2.2 Running the workflow

The workflow will be exercised against three benchmark pages while it is being developed. These benchmark runs are tests of the workflow itself.

### 2.3 Migrating the rest of StackDash

This begins only after the workflow passes all benchmark gates and is declared stable. The production migration phase must use the stabilized workflow rather than redefining it on every page.

### 2.4 Backend ownership

The page-migration workflow may identify and specify missing backend work, and it may implement backend work when that work is explicitly inside its approved scope. However, it must always produce a precise contract that can be handed to the separate full-stack or UDP agent.

It must never fabricate data, hide missing producers behind mock values, or mark a field complete merely because a placeholder renders.

---

## 3. Core design principles

### 3.1 Contract before implementation

Do not begin page implementation from the screenshot alone.

First create an exhaustive, machine-readable page contract. The contract must define every visible element, every field, every interaction, every UI state, every data dependency, and every validation requirement.

Implementation begins only after the contract passes completeness review.

### 3.2 Evidence over self-reporting

An agent saying “the page is complete” is not evidence.

Completion requires artifacts and checks that compare:

- target design,
- current design,
- current code,
- current data producers,
- canonical page specification,
- implemented code,
- rendered page,
- automated test results,
- reviewer findings.

### 3.3 Field-level traceability

Every visible dynamic value must have a stable field ID and a complete chain:

`target design element -> UI component -> field -> source system -> producer -> transport -> transformation -> consumer -> rendered evidence -> verification result`

No dynamic value may exist only as prose in a plan.

### 3.4 Bidirectional accountability

The workflow must validate in both directions:

- Every required UI field has a producer or a documented blocker.
- Every new producer field has a consumer or an explicit reason for existing.

This prevents both missing UI data and unused or duplicated backend work.

### 3.5 Separate source of truth from transport

UDP, polling, and database access are not always the original sources of truth. They are often transport or storage mechanisms.

For every field, record these independently:

- **Source system:** Plex, Tdarr, SABnzbd, qBittorrent, host OS, Docker, StackDash database, configuration, and so on.
- **Producer:** the service or module that obtains or computes the value.
- **Transport:** UDP push, HTTP polling, database query, event, local state, or static configuration.
- **Persistence:** none, short-lived cache, time-series history, relational record, aggregate table, or configuration.
- **Consumer:** page, component, chart, action, alert, or other service.

This distinction is mandatory because classifying a field only as “UDP data” can conceal duplicate producers and unclear ownership.

### 3.6 Deterministic orchestration, agentic analysis

Use deterministic workflow stages when order and dependencies are known. Use agents for open-ended analysis, repository exploration, design interpretation, gap discovery, and adversarial review.

Do not implement the entire system as one giant agent prompt.

### 3.7 Narrow agents, reusable skills

Agents own bounded responsibilities. Skills provide reusable procedures and domain knowledge. The workflow owns sequencing, state, retries, branching, and quality gates.

Do not create a collection of vague general-purpose agents that all inspect and modify the same files.

### 3.8 Independent review

The agent that implements a page must not be the only agent that approves it.

At minimum, the workflow must have:

- deterministic validation,
- an independent completeness reviewer,
- an adversarial reviewer instructed to find omissions and unjustified assumptions.

### 3.9 No silent ambiguity

Unknown information is allowed. Silent guessing is not.

If a field, behavior, source, unit, update policy, or interaction cannot be confidently determined, the workflow must mark it `unknown`, explain the evidence gap, and either:

- resolve it through repository inspection,
- request a human decision,
- or create a clearly owned blocker.

### 3.10 Reuse without premature abstraction

The workflow must search for reusable components, hooks, chart wrappers, formatters, schemas, endpoints, and data adapters before creating new ones.

It must also avoid forcing unrelated page concepts into one overly generic component merely to reduce file count.

Reuse decisions require evidence and a short rationale.

---

## 4. StackDash redesign philosophy the workflow must preserve

The benchmark redesigns share a consistent operational-control-center philosophy. The workflow must detect this philosophy and preserve it without forcing every page into an identical grid.

Each page should generally make the following progression clear:

1. **What is happening now?**
   - high-priority summary metrics,
   - current health,
   - active work,
   - exceptions and alerts.

2. **Why is it happening?**
   - queue state,
   - service state,
   - node or client details,
   - relationships between metrics,
   - historical or throughput context.

3. **What can the operator do?**
   - pause, resume, retry, scan, clear, restart, inspect, or navigate,
   - with proper permissions, confirmation, feedback, and audit behavior.

4. **What happened recently?**
   - completion history,
   - uptime,
   - trends,
   - incidents,
   - daily, weekly, monthly, or time-window aggregates.

The workflow must classify each page region by intent, not merely by visual position.

Recommended intent categories:

- `situation-summary`
- `primary-operation`
- `supporting-context`
- `history-and-trends`
- `exceptions-and-alerts`
- `operator-actions`
- `navigation-and-drilldown`
- `service-health`

These categories are analytical aids, not mandatory component names.

---

## 5. Required hierarchy

The workflow must use a stable hierarchy so that analysis, contracts, implementation, and validation refer to the same entities.

### 5.1 System hierarchy

```text
Workflow System
└── Parent Page-Migration Workflow
    ├── Discovery and Evidence Sub-workflow
    ├── Page Contract Sub-workflow
    ├── Data Contract Sub-workflow
    ├── Architecture and Reuse Sub-workflow
    ├── Implementation Sub-workflow
    ├── Verification Sub-workflow
    └── Workflow Evaluation Sub-workflow
```

### 5.2 Page hierarchy

```text
Page
└── Region
    └── Section
        └── Component
            ├── Element
            ├── Field
            ├── Interaction
            └── State
```

Definitions:

- **Page:** One route or operational screen.
- **Region:** Major page area, such as header, summary row, main operational surface, supporting panels, or footer health strip.
- **Section:** A named grouping with one operational purpose.
- **Component:** Reusable or page-specific UI unit.
- **Element:** A visible subpart such as a label, icon, badge, number, chart series, progress bar, button, table column, or help indicator.
- **Field:** Dynamic or configurable data displayed or used by an element.
- **Interaction:** User action and its request/feedback behavior.
- **State:** Loading, empty, active, paused, degraded, stale, error, unauthorized, disconnected, and similar variants.

### 5.3 Execution hierarchy

```text
Workflow
└── Stage
    └── Step
        ├── Agent invocation
        ├── Skill invocation
        ├── Deterministic tool/script
        ├── Artifact write
        └── Quality gate
```

The implementation must document which layer owns each responsibility.

---

## 6. MastraCode compatibility requirements

The workflow-building session must inspect the installed MastraCode and Mastra versions before implementation. It must use the actual project APIs and conventions rather than relying on remembered signatures.

The preferred mapping is:

| Concept in this document | MastraCode/Mastra implementation |
|---|---|
| Long-running workflow-building objective | MastraCode goal with a judge and attempt limit |
| User-reviewed architecture before edits | Plan mode and approved plan |
| Reusable project procedure | Project skill under `.mastracode/skills/<name>/SKILL.md` |
| Repeatable entry point | Project command under `.mastracode/commands/` |
| Goal-enabled entry point | Command with `goal: true` or skill with `metadata.goal: true` |
| Global project invariants | Root `AGENTS.md` or the project’s existing instruction convention |
| Specialized bounded role | Custom MastraCode subagent or equivalent project-supported subagent definition |
| Known multi-step control flow | Mastra workflow or another explicit deterministic orchestration layer already used by the project |
| Validation enforcement | Workflow quality gates, test scripts, and optionally blocking hooks |
| File and execution safety | Narrow tool permissions per subagent and existing sandbox policy |
| Persisted run output | Versioned artifacts committed or stored inside the repository |

### 6.1 Required MastraCode deliverables

The workflow-building session must create or explicitly justify not creating:

1. A goal-enabled command that starts a workflow build or benchmark run.
2. Project skills for the reusable analysis and validation procedures.
3. Narrow subagent definitions for the required roles.
4. The deterministic orchestration implementation.
5. Schema definitions for the canonical artifacts.
6. Validation scripts that fail on incomplete or inconsistent artifacts.
7. Benchmark fixtures and expected-result manifests.
8. Documentation describing how to run, inspect, resume, and debug the workflow.
9. Project instructions that prevent future sessions from bypassing the contract and gates.
10. Tests for workflow branching, waiting states, failed validation, retries, and successful completion.

### 6.2 Do not hard-code unsupported conventions

The next session must verify:

- current subagent configuration format,
- current workflow API,
- current skill frontmatter,
- available tools,
- hook support,
- schema library already used by StackDash,
- repository test conventions,
- existing `.mastracode`, `.claude`, or `AGENTS.md` structure.

When project conventions conflict with examples in this document, preserve the intent while using the repository’s real conventions.

---

## 7. Required agents

The names below are recommended IDs. Exact filenames may follow repository conventions. Responsibilities must remain separated even if implementation combines a small number of closely related roles for practical reasons.

### 7.1 Page Intent and Structure Analyst

**Purpose:** Determine what decisions and operations the page supports, then decompose the target design into the required hierarchy.

**Inputs:**

- current screenshot,
- target screenshot,
- route,
- current page code,
- existing page documentation.

**Outputs:**

- page purpose,
- operator questions answered,
- region and section hierarchy,
- design-element inventory,
- uncertainty list,
- design evidence references.

**Restrictions:**

- read-only,
- must not edit implementation,
- must not infer invisible interactions without evidence.

### 7.2 Current-System Auditor

**Purpose:** Inspect the current implementation and repository to identify existing components, hooks, data clients, types, endpoints, schemas, formatters, actions, tests, and data producers.

**Outputs:**

- current implementation map,
- existing field inventory,
- reusable asset candidates,
- current data-flow map,
- conflicting or duplicated implementations,
- code evidence locations.

**Restrictions:**

- read-only during analysis,
- must search broadly enough to find shared implementations outside the page directory.

### 7.3 Data Contract Analyst

**Purpose:** Convert every visible or behavioral requirement into field-level data and action contracts.

**Outputs:**

- field definitions,
- types and units,
- source-system ownership,
- producer and transport classification,
- refresh and staleness policy,
- historical-window requirements,
- missing-producer list,
- UDP/polling/database/derived handoff.

**Restrictions:**

- cannot mark a field available solely because a similarly named variable exists,
- must verify semantic equivalence, units, freshness, and cardinality.

### 7.4 Reuse and Architecture Analyst

**Purpose:** Decide what should be reused, extended, extracted, or created while reducing duplication without flattening distinct domain concepts.

**Outputs:**

- component reuse plan,
- hook/service reuse plan,
- schema consolidation plan,
- new abstraction proposals,
- rejected reuse candidates with rationale,
- duplication risks.

**Restrictions:**

- cannot create a generic abstraction without at least two concrete consumers or a strong architectural reason,
- must favor existing repository conventions.

### 7.5 Implementation Agent

**Purpose:** Implement the approved page and data-adapter work in dependency order.

**Inputs:**

- approved canonical page specification,
- approved implementation plan,
- data contract,
- reuse decisions,
- repository rules.

**Outputs:**

- code changes,
- tests,
- generated or updated artifacts,
- implementation evidence map.

**Restrictions:**

- cannot silently modify the contract to match an easier implementation,
- must raise a contract-change request when new evidence contradicts the approved spec,
- cannot approve its own completion.

### 7.6 Deterministic Verification Agent or Runner

**Purpose:** Run non-subjective checks and record exact results.

**Checks include:**

- schema validation,
- field coverage,
- traceability coverage,
- missing status handling,
- tests,
- type checking,
- linting,
- build,
- route rendering,
- interaction tests,
- source-consumer consistency,
- prohibited placeholders.

This role should use scripts and tools wherever possible rather than model judgment.

### 7.7 Visual and Behavioral Reviewer

**Purpose:** Compare the rendered page with the target design and test page behavior.

**Outputs:**

- missing or extra regions,
- hierarchy mismatches,
- label and unit mismatches,
- responsive issues,
- empty/loading/error/stale-state results,
- action feedback results,
- visual evidence.

**Restrictions:**

- must inspect the rendered page directly,
- must not rely solely on the implementation agent’s summary.

### 7.8 Adversarial Completeness Reviewer

**Purpose:** Assume the implementation is incomplete and actively try to prove it.

**Review questions:**

- Which target elements have no implementation evidence?
- Which fields render constants, fixtures, placeholders, or mismatched units?
- Which required states are absent?
- Which actions lack confirmation, feedback, permissions, or error handling?
- Which source assignments are guesses?
- Which backend requirements were silently pushed out of scope?
- Which new components duplicate existing ones?
- Which artifact claims are not supported by code or runtime evidence?
- Which requirements disappeared between analysis and implementation?

**Restrictions:**

- read-only,
- separate context from implementation where practical,
- must cite exact evidence for every finding.

### 7.9 Workflow Evaluator

**Purpose:** During the benchmark phase only, evaluate the workflow itself rather than patching each benchmark page ad hoc.

**Outputs:**

- workflow failure classification,
- missing stage or skill,
- bad artifact schema,
- unreliable agent boundary,
- unnecessary duplication,
- proposed workflow change,
- regression test for the discovered failure.

When a benchmark exposes a systematic omission, fix the workflow and rerun the relevant stages. Do not merely patch the page and declare success.

---

## 8. Required skills

Skills are reusable procedures. Agents may use several skills. A skill must not own orchestration state that belongs to the workflow.

Recommended project skills:

### 8.1 `stackdash-design-inventory`

Exhaustively enumerate regions, sections, components, elements, visible labels, charts, table columns, badges, actions, and states from target evidence.

### 8.2 `stackdash-current-page-audit`

Inspect a route and follow imports, hooks, services, types, endpoints, tests, and shared components to build the current implementation map.

### 8.3 `stackdash-field-extraction`

Translate every dynamic display and interaction dependency into stable field and action IDs.

### 8.4 `stackdash-data-source-classification`

Classify source system, producer, transport, persistence, refresh policy, aggregation, and consumer independently.

### 8.5 `stackdash-data-gap-analysis`

Compare required fields with existing fields and categorize each as:

- `existing-compatible`
- `existing-needs-adapter`
- `existing-wrong-semantics`
- `partial`
- `missing-udp-producer`
- `missing-polling-source`
- `missing-database-storage`
- `missing-aggregation`
- `missing-derived-calculation`
- `unknown`
- `not-applicable`

### 8.6 `stackdash-contract-generation`

Generate and validate the canonical page specification, human-readable projection, JSON Schema, and backend handoff.

### 8.7 `stackdash-traceability`

Maintain target-to-code-to-data-to-runtime links and calculate coverage.

### 8.8 `stackdash-reuse-audit`

Search for existing implementations, compare semantics, and produce reuse/extraction decisions.

### 8.9 `stackdash-implementation-planning`

Create dependency-ordered tasks with exact inputs, outputs, affected files, tests, and acceptance evidence.

### 8.10 `stackdash-runtime-verification`

Render the page, exercise states and interactions, capture evidence, and compare with the contract.

### 8.11 `stackdash-adversarial-review`

Perform omission-focused review without changing files.

### 8.12 `stackdash-workflow-regression`

Turn benchmark-discovered workflow failures into reusable tests and rerun criteria.

Each `SKILL.md` must contain:

- clear trigger description,
- required inputs,
- ordered procedure,
- required outputs,
- prohibited shortcuts,
- evidence requirements,
- failure conditions,
- examples that use StackDash terminology without hard-coding one page.

---

## 9. Canonical artifacts

The workflow must avoid creating many manually edited documents that can contradict each other. Use one canonical machine-readable specification and generate human-readable views from it.

### 9.1 Per-run directory

Recommended shape:

```text
workflow-runs/
└── <page-id>/
    └── <run-id>/
        ├── run-state.json
        ├── evidence/
        │   ├── current-design.*
        │   ├── target-design.*
        │   ├── rendered-page.*
        │   └── interaction-captures/
        ├── page-spec.json
        ├── page-spec.md
        ├── implementation-plan.md
        ├── backend-handoff.json
        ├── backend-handoff.md
        ├── verification-report.json
        ├── adversarial-review.md
        └── final-summary.md
```

The exact location may change to match repository conventions, but the separation of run state, evidence, canonical specification, derived documentation, verification, and review is required.

### 9.2 Canonical page specification

`page-spec.json` is the source of truth for a page run.

At minimum it must contain:

```json
{
  "schemaVersion": "1.0.0",
  "workflowVersion": "0.1.0",
  "pageId": "tdarr",
  "route": "/tdarr",
  "purpose": {
    "summary": "Monitor and manage transcode workers, queues, and I/O governance.",
    "operatorQuestions": [],
    "primaryActions": []
  },
  "evidence": {
    "currentDesign": [],
    "targetDesign": [],
    "codeLocations": []
  },
  "regions": [],
  "fields": [],
  "actions": [],
  "states": [],
  "dataSources": [],
  "reuseDecisions": [],
  "implementation": {
    "tasks": [],
    "files": []
  },
  "traceability": [],
  "verification": {
    "checks": [],
    "coverage": {}
  },
  "openQuestions": [],
  "blockers": []
}
```

### 9.3 Stable IDs

IDs must remain stable across workflow reruns unless the underlying concept changes.

Recommended pattern:

```text
<page>.<region>.<section>.<component>.<element-or-field>
```

Examples:

```text
tdarr.summary.active-workers.value
tdarr.governor.status.mode
tdarr.worker-card.current-job.progress
downloads.sab-queue.item.eta
overview.service-health.service.latency
```

IDs must describe meaning, not screen coordinates.

### 9.4 Field contract

Every dynamic field requires a record similar to:

```json
{
  "fieldId": "downloads.sab-queue.item.speed",
  "label": "Speed",
  "purpose": "Shows current transfer speed for the queue item.",
  "valueType": "number",
  "unit": "bytes-per-second",
  "displayFormat": "human-readable-rate",
  "nullable": true,
  "cardinality": "per-queue-item",
  "sourceSystem": "sabnzbd",
  "producer": {
    "status": "existing-compatible",
    "module": "to-be-discovered",
    "field": "to-be-discovered"
  },
  "transport": {
    "kind": "udp-push",
    "intervalMs": 1000
  },
  "persistence": {
    "kind": "none"
  },
  "transformation": [],
  "staleness": {
    "staleAfterMs": 3000,
    "behavior": "show-stale-indicator"
  },
  "fallback": {
    "behavior": "show-em-dash"
  },
  "consumers": [
    "downloads.sab-queue.table.speed-cell"
  ],
  "evidence": [],
  "verification": {
    "status": "pending"
  }
}
```

The schema must support at least these transport kinds:

- `udp-push`
- `http-poll`
- `database-query`
- `event-driven`
- `local-derived`
- `server-derived`
- `static-config`
- `unknown`

### 9.5 Action contract

Every control must define:

```json
{
  "actionId": "tdarr.worker.pause",
  "label": "Pause",
  "scope": "single-worker",
  "permissions": [],
  "confirmation": {
    "required": false
  },
  "request": {
    "producer": "to-be-discovered",
    "operation": "to-be-discovered"
  },
  "optimisticBehavior": "none",
  "successFeedback": "status-update-and-toast",
  "errorFeedback": "inline-and-toast",
  "auditRequirement": "record-operator-and-result",
  "states": ["available", "pending", "disabled", "error"],
  "verification": {
    "status": "pending"
  }
}
```

### 9.6 Traceability record

Each target requirement must map to implementation and evidence:

```json
{
  "requirementId": "tdarr.governor.status.mode",
  "targetEvidence": ["target-design:governor-banner"],
  "component": "GovernorStatusPanel",
  "codeEvidence": ["src/.../GovernorStatusPanel.tsx"],
  "fieldIds": ["tdarr.governor.status.mode"],
  "producerEvidence": ["src/.../telemetry.ts"],
  "runtimeEvidence": ["rendered-page:governing-state"],
  "testEvidence": ["test:governor-mode-renders"],
  "status": "verified"
}
```

### 9.7 Run-state artifact

`run-state.json` must record:

- workflow version,
- active stage,
- stage status,
- attempts,
- blockers,
- human decisions,
- contract revision history,
- generated artifact hashes or timestamps,
- benchmark identity,
- final result.

This allows a run to resume without relying on conversation memory alone.

---

## 10. Data audit requirements

The data audit is a central quality mechanism, not a side document.

### 10.1 Exhaustive extraction

For every visible dynamic item, chart series, badge, status, progress bar, table column, timestamp, count, percentage, rate, capacity, uptime value, health value, and control state, create a field record.

For every user action, create an action record.

For every conditional visual state, create a state record.

Examples of commonly missed data:

- subtitle status text beneath a headline metric,
- chart legends and series labels,
- “last updated” timestamps,
- units and formatting rules,
- free-space labels under capacity gauges,
- average, peak, and current values shown together,
- queue totals versus visible rows,
- pagination totals,
- empty-state explanatory copy,
- stale or disconnected indicators,
- permission-based disabled states,
- recent-completion timestamps,
- service latency alongside service status,
- action pending and failure states.

### 10.2 Current availability audit

Every required field must be compared against the repository and classified.

A match requires all of the following:

- same meaning,
- compatible type,
- compatible unit,
- compatible cardinality,
- sufficient freshness,
- correct source ownership,
- acceptable null/error behavior.

A name match alone is insufficient.

### 10.3 Update-semantics audit

Every field must define:

- desired update method,
- desired update interval or trigger,
- maximum acceptable staleness,
- behavior when updates stop,
- whether history is required,
- aggregation window,
- timezone behavior for time buckets,
- whether the UI can derive it safely,
- whether it must be computed server-side.

### 10.4 Backend handoff

The workflow must generate a backend handoff grouped by owner and mechanism.

Recommended groups:

```text
UDP producer additions
Polling/API additions
Database schema additions
Aggregation jobs or queries
Server-derived calculations
Frontend-only derived values
Configuration additions
Unknowns requiring human decision
```

Each handoff item must include:

- stable field ID,
- source system,
- type,
- unit,
- cardinality,
- sample payload shape,
- update semantics,
- persistence requirement,
- consumers,
- acceptance test,
- owning agent or subsystem,
- dependency and blocker information.

### 10.5 Cross-validator

The workflow must include a validator that fails when:

- a required field has no producer and no explicit blocker,
- a producer has no consumer and no justification,
- two producers claim ownership of the same semantic field without a conflict decision,
- two fields represent the same concept with incompatible names or units,
- transport is specified but source system is missing,
- historical charts lack persistence or aggregation definitions,
- current values are incorrectly used as historical values,
- mock or fixture values remain in a production completion path.

---

## 11. Reuse and duplication control

### 11.1 Mandatory repository search

Before creating any component, hook, service, schema, endpoint, formatter, chart wrapper, status badge, metric card, table primitive, or action pattern, the workflow must search the repository for semantic equivalents.

### 11.2 Reuse decision categories

Each candidate must be classified as:

- `reuse-as-is`
- `reuse-with-props`
- `extend-existing`
- `extract-shared-abstraction`
- `keep-page-specific`
- `replace-duplicate`
- `reject-incompatible`

### 11.3 Duplication checks

The workflow must detect at least:

- duplicate data fetching for the same source,
- duplicate UDP payload fields,
- duplicate polling timers,
- duplicate formatters,
- duplicate chart transforms,
- duplicate schemas and types,
- nearly identical cards with hard-coded differences,
- multiple definitions of service health or status colors,
- separate calculations of the same aggregate,
- page-specific copies of shared layout primitives.

### 11.4 Guard against false reuse

The workflow must not merge concepts merely because they look similar.

For example, a worker load indicator and a service health score may both be circular gauges, but they can have different semantics, thresholds, interaction behavior, and accessibility requirements. Reuse the visual primitive if appropriate, not necessarily the domain component.

### 11.5 Reuse report

Every run must include:

- items reused,
- items extended,
- new shared abstractions,
- page-specific implementations,
- duplicates removed,
- suspected duplicates left unresolved,
- rationale and evidence.

---

## 12. Workflow stages and gates

The parent workflow must persist state and produce artifacts after every stage. A failed gate must prevent advancement.

### Stage 0: Initialize run

**Tasks:**

- identify page and route,
- register current and target evidence,
- record repository commit or working-tree state,
- create run ID,
- load workflow version,
- confirm benchmark or production mode.

**Gate:** All required inputs exist or are explicitly marked unavailable.

### Stage 1: Discover repository and MastraCode conventions

**Tasks:**

- inspect root instructions,
- inspect `.mastracode`, `.claude`, and existing skills/commands,
- inspect package scripts and test setup,
- locate page route and shared UI/data architecture,
- confirm installed MastraCode and Mastra APIs.

**Gate:** A repository map and implementation-convention record exist.

### Stage 2: Capture and normalize evidence

**Tasks:**

- register screenshots or design files,
- record dimensions and viewport assumptions,
- register current rendered page when available,
- identify evidence limitations,
- store code locations.

**Gate:** Evidence can be referenced by stable IDs.

### Stage 3: Analyze page intent and hierarchy

**Tasks:**

- define page purpose,
- identify operator questions,
- identify primary actions,
- classify page regions by intent,
- create region/section/component hierarchy.

**Gate:** Every major target region is represented and no unexplained target area remains.

### Stage 4: Build exhaustive target inventory

**Tasks:**

- enumerate all visible elements,
- enumerate dynamic fields,
- enumerate actions,
- enumerate states,
- enumerate responsive and conditional behavior visible or implied by repository conventions,
- assign stable IDs.

**Gate:** Independent inventory review reports full target coverage or documented uncertainty.

### Stage 5: Audit current implementation

**Tasks:**

- inspect current page,
- trace imports and shared dependencies,
- inventory existing fields and actions,
- locate producers and transports,
- locate reusable components and tests,
- identify current technical debt relevant to migration.

**Gate:** Every target item has a current status: present, partial, missing, incompatible, or unknown.

### Stage 6: Build data and action contracts

**Tasks:**

- define field types, units, cardinality, format, source, producer, transport, persistence, freshness, fallbacks, and consumers,
- define action request and feedback contracts,
- generate backend handoff,
- validate cross-source consistency.

**Gate:** Every dynamic target item has a complete contract or explicit blocker.

### Stage 7: Review canonical page specification

**Tasks:**

- generate `page-spec.json`,
- validate against JSON Schema,
- generate `page-spec.md`,
- run completeness and contradiction checks,
- perform independent review.

**Gate:** Canonical spec is approved. Implementation cannot begin before this gate.

### Stage 8: Plan reuse and architecture

**Tasks:**

- audit existing abstractions,
- decide reuse categories,
- identify shared improvements,
- define component boundaries,
- define data-adapter boundaries,
- identify changes that affect other pages.

**Gate:** No new major abstraction lacks rationale and no known duplicate remains silently ignored.

### Stage 9: Create dependency-ordered implementation plan

The plan must separate:

1. schemas and types,
2. producers and adapters,
3. transport changes,
4. persistence and aggregation,
5. shared UI primitives,
6. page-specific components,
7. interactions,
8. state handling,
9. tests,
10. runtime and visual verification.

Every task must include:

- task ID,
- requirement IDs,
- dependencies,
- files or modules,
- agent/owner,
- expected output,
- test method,
- completion evidence.

**Gate:** Every contract requirement is covered by at least one task or explicit external blocker.

### Stage 10: Implement

**Tasks:**

- implement in dependency order,
- update traceability as files change,
- add tests alongside code,
- record contract-change requests when needed,
- avoid unrelated refactors.

**Gate:** Implementation tasks complete and implementation evidence exists.

### Stage 11: Run deterministic validation

**Tasks:**

- validate schemas,
- calculate coverage,
- run focused tests,
- run type checking, linting, and build commands appropriate to the affected packages,
- detect placeholders and fixture leakage,
- validate producer-consumer mapping,
- validate action contracts.

**Gate:** All required deterministic checks pass.

### Stage 12: Run visual and behavioral validation

**Tasks:**

- render at target viewport,
- compare section hierarchy and contents,
- test responsive sizes required by the project,
- test loading, empty, active, degraded, stale, disconnected, error, and permission states as applicable,
- exercise actions and feedback,
- capture evidence.

**Gate:** No unaccounted visual or behavioral requirement remains.

### Stage 13: Run adversarial review

**Tasks:**

- review target design against rendered page,
- review page spec against code,
- review data contract against producers,
- review claimed tests against actual results,
- search for omissions, duplication, shortcuts, and assumptions.

**Gate:** All critical and major findings are resolved. Minor deviations are documented and explicitly accepted.

### Stage 14: Repair loop

Findings must route to the correct earlier stage:

- inventory failure -> Stage 4,
- current-audit failure -> Stage 5,
- data-contract failure -> Stage 6,
- reuse failure -> Stage 8,
- implementation failure -> Stage 10,
- runtime failure -> Stage 12.

Do not patch the final report to hide a failed earlier stage.

### Stage 15: Finalize run

**Tasks:**

- regenerate derived documents from canonical JSON,
- produce final coverage metrics,
- list external backend handoffs,
- list accepted deviations,
- record workflow version,
- write final summary.

**Gate:** Final artifacts are internally consistent and reproducible.

### Stage 16: Evaluate the workflow itself

This stage runs only while the workflow is experimental or when a stable workflow encounters a new class of page.

**Tasks:**

- classify every benchmark failure as page-specific or workflow-systemic,
- update agent boundaries, skills, stages, schemas, or validators when systemic,
- add regression coverage,
- rerun affected benchmark stages,
- record workflow changelog.

**Gate:** The workflow change fixes the failure without breaking completed benchmarks.

---

## 13. Branching and waiting behavior

The workflow must support explicit branches.

### 13.1 Missing data producer

If a required producer is missing:

- create the exact backend contract,
- assign owner,
- decide whether the current run may implement it,
- otherwise enter a blocked or waiting state,
- do not render fabricated production data.

### 13.2 Ambiguous design

If two interpretations materially change data or interaction requirements:

- record both interpretations,
- gather repository evidence,
- ask the user only when evidence cannot decide,
- persist the decision.

### 13.3 Existing reusable component conflicts with redesign

The workflow must choose among extension, wrapper, extraction, or replacement and record migration risk to other consumers.

### 13.4 Benchmark exposes workflow flaw

Pause page-specific completion, update the workflow, add regression coverage, and rerun. The benchmark exists to improve the workflow.

### 13.5 Human approval checkpoints

Human approval is required for:

- canonical page contract when material ambiguity exists,
- broad shared-component replacement,
- destructive data-model changes,
- scope expansion into unrelated backend systems,
- accepted visual or behavioral deviations,
- final transition from experimental to stable workflow.

---

## 14. Benchmark program

Use the three provided page pairs in this order.

### Benchmark 1: Tdarr

**Why first:** Tdarr is the most representative complex page. It combines fast-changing state, multiple workers, queue information, governance logic, actions, progress, throughput, health, and historical context.

The workflow must prove it can handle:

- headline metrics,
- I/O governor state and explanation,
- multiple worker/node cards,
- current jobs and progress,
- worker limits and statuses,
- pause controls,
- queue depth trend,
- active worker/load visualization,
- worker throughput by series,
- uptime and service health,
- mixed current, historical, and actionable data.

**Workflow lessons expected:**

- field-level data classification,
- repeated component schemas,
- dynamic collections,
- action contracts,
- real-time versus historical data separation,
- governor-specific data ownership.

### Benchmark 2: Downloads

**Why second:** Downloads tests whether the workflow generalizes from worker orchestration to queue-heavy operational data and multiple external clients.

The workflow must prove it can handle:

- Usenet and torrent metrics,
- queue totals and remaining size,
- SABnzbd queue state,
- active item progress and ETA,
- paginated or virtualized queue tables,
- qBittorrent status breakdown,
- pause and resume actions,
- throughput history and multiple series,
- recently completed items,
- per-service uptime and health,
- empty and active queue variants.

**Workflow lessons expected:**

- high-cardinality collections,
- pagination and totals,
- per-item fields,
- multi-source data contracts,
- empty-state versus active-state validation,
- completion-history persistence.

### Benchmark 3: Overview

**Why third:** Overview is the consolidation test. It combines data from many systems and should prove the workflow can build an executive operational surface without duplicating data producers from domain pages.

The workflow must prove it can handle:

- global summary metrics,
- storage tiers,
- service health,
- NAS vitals,
- system status,
- quick actions,
- throughput summary,
- recent incidents,
- cross-domain navigation,
- shared components and shared data contracts.

**Workflow lessons expected:**

- cross-page reuse,
- summary and aggregation contracts,
- source deduplication,
- shared health definitions,
- action discoverability,
- consolidated operational hierarchy.

### 14.1 Benchmark rerun rule

When the workflow changes after a benchmark, rerun all earlier benchmark checks that could be affected.

Examples:

- a field-schema change requires contract validation on all prior pages,
- a traceability change requires coverage recalculation on all prior pages,
- an agent-boundary change requires rerunning the affected analysis or review stage,
- a shared UI abstraction change requires rendering all prior benchmark pages.

---

## 15. Workflow maturity and freeze rule

Use two simple states.

### 15.1 Experimental

During Tdarr, Downloads, and Overview benchmarking:

- workflow stages may change,
- agents and skills may be split or merged,
- artifact schemas may evolve with migration support,
- validators may become stricter,
- every systemic failure must add regression coverage.

### 15.2 Stable

The workflow becomes stable only after all three benchmark pages pass without requiring structural workflow changes.

After stabilization:

- normal page migrations may fix workflow bugs,
- structural changes require versioning and regression runs,
- a page run must not casually rewrite the workflow,
- older artifacts must remain readable or have an explicit migration path.

The first stable version should be tagged `1.0.0` or the repository’s equivalent.

---

## 16. Required validation metrics

The workflow must calculate and report metrics rather than using “looks complete.”

### 16.1 Inventory coverage

```text
inventoried target requirements / independently observed target requirements
```

Required: `100%`, excluding documented ambiguous items awaiting a decision.

### 16.2 Implementation coverage

```text
requirements with implementation evidence / approved requirements
```

Required: `100%` for in-scope requirements.

### 16.3 Field producer coverage

```text
required fields with valid producer or accepted blocker / required fields
```

Required: `100%`.

A blocker counts only when explicitly owned and accepted. It does not make the page fully production-complete.

### 16.4 Field consumer coverage

```text
new producer fields with valid consumers or justification / new producer fields
```

Required: `100%`.

### 16.5 State coverage

```text
verified applicable states / required applicable states
```

Required: `100%` for critical states and all states represented in the approved contract.

### 16.6 Action coverage

```text
verified actions / required actions
```

Required: `100%`.

### 16.7 Traceability coverage

Every approved requirement must have:

- target evidence,
- implementation evidence,
- runtime evidence,
- test or review evidence,
- final status.

Required: `100%`.

### 16.8 Duplication status

Required:

- zero unresolved critical duplicate producers,
- zero duplicate semantic fields with conflicting units,
- zero known duplicate fetch loops without justification,
- all suspected duplication documented.

### 16.9 Build health

Required:

- focused tests pass,
- affected package type checks pass,
- affected package lint checks pass,
- affected build passes,
- no new unhandled runtime errors.

---

## 17. Definition of done for the workflow-building goal

The goal judge must not mark the workflow-building objective complete until all of the following are true:

1. The workflow architecture exists in code, not only in a design document.
2. The workflow has explicit stages, persisted state, branching, retries, waiting behavior, and quality gates.
3. Required agents or equivalent bounded subagents exist with narrow instructions and tool permissions.
4. Required skills exist as valid project skills with reusable procedures.
5. Canonical artifact schemas exist and are validated automatically.
6. A goal-enabled command or equivalent repeatable MastraCode entry point exists.
7. Deterministic validation scripts exist and fail intentionally incomplete fixtures.
8. The adversarial reviewer is independent from implementation.
9. The Tdarr benchmark passes.
10. The Downloads benchmark passes without a page-specific workflow rewrite.
11. The Overview benchmark passes as a consolidation test.
12. Earlier benchmarks still pass after later workflow changes.
13. Backend handoffs are generated with field-level schemas and ownership.
14. Traceability and coverage reports are generated automatically.
15. Workflow documentation explains installation, invocation, artifacts, failure recovery, and extension.
16. The workflow has a version and changelog.
17. The stable/frozen decision is explicitly recorded.
18. No critical or major adversarial-review findings remain unresolved.
19. No required data is represented by an unmarked placeholder or mock.
20. A fresh page can be initialized without manually rewriting agent prompts or artifact formats.

The judge must inspect actual files and test output. It must not rely only on the primary agent’s completion summary.

The judge should return:

- `continue` when a check can be completed by additional work,
- `waiting` when a human decision or inaccessible external dependency is genuinely required,
- `done` only when the full definition of done is evidenced.

---

## 18. Required tests for the workflow system

The workflow itself needs tests in addition to page tests.

### 18.1 Schema tests

- valid page spec passes,
- missing field source fails,
- missing stable ID fails,
- duplicate stable IDs fail,
- invalid unit or transport enum fails,
- action without feedback behavior fails,
- traceability record without evidence fails.

### 18.2 Gate tests

- implementation cannot begin before contract approval,
- failed deterministic validation blocks adversarial review completion,
- unresolved critical review finding blocks finalization,
- missing input causes waiting rather than guessing,
- explicit blocker is preserved across resume.

### 18.3 Repair-routing tests

- missing design element routes back to inventory,
- wrong data source routes back to data contract,
- duplicated component routes back to architecture/reuse,
- runtime state failure routes back to implementation or runtime verification.

### 18.4 Resume tests

- interrupted run resumes from persisted stage,
- completed stages do not rerun unnecessarily,
- changed contract invalidates dependent stages,
- workflow-version change triggers appropriate migration or rerun.

### 18.5 Reviewer tests

Use intentionally flawed fixtures to prove the reviewer catches:

- missing metric subtitle,
- hard-coded value,
- incorrect unit,
- missing empty state,
- missing action error feedback,
- duplicate polling loop,
- data field with no producer,
- target element with no traceability record.

### 18.6 Generalization test

After the three official benchmarks, initialize a fourth page in analysis-only mode. The workflow should produce a valid inventory, data contract, and plan without adding a new stage or rewriting core prompts.

The fourth page does not need to be fully migrated before workflow stabilization unless the benchmark results expose a new systemic flaw.

---

## 19. Recommended implementation structure

The implementation session should adapt this to the repository rather than forcing it literally.

```text
.mastracode/
├── commands/
│   ├── build-stackdash-page-workflow.md
│   └── migrate-stackdash-page.md
└── skills/
    ├── stackdash-design-inventory/
    │   └── SKILL.md
    ├── stackdash-current-page-audit/
    │   └── SKILL.md
    ├── stackdash-data-contract/
    │   └── SKILL.md
    ├── stackdash-reuse-audit/
    │   └── SKILL.md
    ├── stackdash-runtime-verification/
    │   └── SKILL.md
    └── stackdash-adversarial-review/
        └── SKILL.md

src/
└── workflow-system/
    └── stackdash-page-migration/
        ├── workflow.ts
        ├── stages/
        ├── agents/
        ├── schemas/
        ├── validators/
        ├── artifact-store/
        └── tests/

workflow-benchmarks/
├── tdarr/
├── downloads/
└── overview/

workflow-runs/
└── .gitignore-or-selected-fixtures
```

Whether run artifacts are committed depends on repository policy. Golden benchmark manifests and small expected fixtures should be versioned. Large captures may use an artifact directory or ignored local storage, but their references must remain stable.

---

## 20. Suggested goal-enabled command behavior

The workflow-building session should create a command similar in intent to:

```markdown
---
name: build-stackdash-page-workflow
description: Build and benchmark the reusable StackDash page-migration workflow
goal: true
---

Use the workflow-builder requirements document as the governing specification.
Build the MastraCode-compatible workflow, agents, skills, schemas, validators,
benchmark fixtures, and documentation. Test it in order against Tdarr,
Downloads, and Overview. Treat benchmark omissions as workflow defects,
add regression coverage, and rerun affected benchmarks. Do not mark the goal
complete until the documented definition of done is evidenced by files,
artifacts, and passing checks.

Arguments: $ARGUMENTS
```

The exact frontmatter and command path must match the installed MastraCode version.

---

## 21. Suggested initial goal for the new session

Use this document as attached or repository context, then start the new session with an objective equivalent to:

> Build the reusable StackDash page-migration workflow defined in this requirements document. This goal is about constructing and validating the workflow system, not migrating the rest of the dashboard. First inspect the repository, installed MastraCode/Mastra versions, current project instructions, existing agents, skills, commands, workflows, tests, and StackDash architecture. Then propose a concrete implementation plan that maps the requirements to actual supported MastraCode constructs. After approval, implement the workflow, its bounded subagents, reusable skills, canonical schemas, validators, artifact system, goal-enabled entry point, and benchmark harness. Exercise it in order against Tdarr, Downloads, and Overview. When a benchmark reveals a systemic weakness, repair the workflow, add regression coverage, and rerun affected benchmarks instead of patching only the page. Do not declare success from prose. Completion requires the documented artifacts, field-level traceability, backend handoffs, independent adversarial review, and passing benchmark gates.

---

## 22. First-session execution instructions

The new MastraCode session should proceed in this order:

1. Read this entire requirements document.
2. Inspect the repository and current MastraCode integration.
3. Locate all six benchmark images or request them before design analysis begins.
4. Locate current routes and implementations for Tdarr, Downloads, and Overview.
5. Produce a proposed mapping from requirements to actual files, agents, skills, workflows, scripts, and tests.
6. Identify requirements that conflict with current APIs or repository conventions.
7. Resolve those conflicts explicitly while preserving the underlying intent.
8. Submit the workflow-building plan for approval.
9. After approval, use the plan as a goal so work and verification continue across turns.
10. Build the workflow and benchmark it, without beginning broad dashboard migration.

---

## 23. Questions the implementation plan must answer

Before code changes begin, the plan must answer:

- What exact orchestration mechanism will be used?
- Which stages are deterministic workflow steps?
- Which stages invoke agents?
- Which procedures become skills?
- How are subagents registered and tool-scoped?
- Where is run state persisted?
- What is the canonical artifact schema?
- How are Markdown views generated from JSON?
- How are screenshots and render evidence referenced?
- How is target inventory coverage measured?
- How does the workflow inspect the current repository broadly enough to find reusable code?
- How are UDP, polling, database, source system, producer, and consumer represented separately?
- How are backend handoffs generated?
- How is a contract change proposed and approved?
- How are stage dependencies invalidated after a contract change?
- How does the workflow enter and resume a waiting state?
- How does the independent reviewer receive clean evidence?
- What scripts prevent a goal judge from accepting an incomplete run?
- How are benchmark regressions run?
- What exact event marks the workflow stable?

A plan that does not answer these is not ready for implementation.

---

## 24. Final guiding rule

The workflow succeeds when page migration stops being “look at the redesign and build something close” and becomes:

```text
observe everything
-> specify everything
-> map every field
-> identify every gap
-> reuse deliberately
-> implement from contract
-> verify with evidence
-> attack the result for omissions
-> repair the workflow when the process fails
```

The workflow must make omission difficult, duplication visible, backend ownership explicit, and completion objectively testable.
