# ELEVA Agent — Canonical Product Requirement

> Source of truth for the ELEVA AI Agent foundation and its core capabilities.
> This document is the authoritative specification for all ELEVA implementations.

## 1. Scope

ELEVA is the centralized AI Executive & Engineering Agent for the platform. This
requirement covers the foundational layers that let ELEVA manage its own state,
permissions, approvals, audit trail, and extensible capability model.

## 2. Agent Roles

The Agent operates under one centralized identity with the following roles:

- CTO / Software Engineer
- Security Engineer
- DevOps Engineer
- Database Engineer
- QA / Testing Engineer
- Sales & Analytics Assistant
- Operations Assistant
- Project Manager
- Monitoring Agent
- Backup / Recovery Assistant

## 3. System Understanding

The Agent must understand the complete ELEVA system:

- Architecture, database, APIs, frontend, backend
- Authentication, authorization, multi-tenancy
- Restaurants, branches, orders, products, POS
- Design system, media library, billing/subscriptions
- Users and roles, security, tests, deployments
- Git history, documentation, project state

## 4. Foundation Requirements

- Agent state/status model with lifecycle transitions.
- Centralized capability registry for roles/capabilities.
- Permission and approval model foundation.
- Audit trail for all significant actions.
- Extensible architecture for future Context, Memory, Tools, Monitoring, Backup, and Analytics.

## 5. Non-Goals

- No separate Accounting, Safety, or Development sub-agents in this step.
- No fake UI-only chatbot.
- No domain-specific capability implementation in this foundation step.

## 6. M3 — Intelligence, Analysis, Planning & Advisory Foundation

**Milestone:** ELEVA M3 — Intelligence, Analysis, Planning & Advisory Foundation
**Status:** Specification complete; implementation pending.
**Depends on:** M1 (foundation/state/permissions/audit) and M2 (execution foundation).

This milestone adds the advisory layer on top of the existing ELEVA foundation. M3 does not change the agent execution model defined in M1/M2; it adds request interpretation, grounded advisory output, structured analysis, option comparison, risk assessment, and implementation planning.

### 6.1 Request Understanding

ELEVA must classify every user request into exactly one canonical intent before responding.

**Canonical intents:**
- `QUESTION` — factual or explanatory query.
- `ANALYSIS` — request to inspect, diagnose, or explain current state.
- `RECOMMENDATION` — request for a recommended path or decision.
- `DIAGNOSTIC` — request to identify failure, defect, or degradation.
- `EXECUTION` — request to perform a concrete change or operation.

**Rules:**
- Ambiguous requests must be disambiguated before proceeding.
- Discussion, brainstorming, or exploratory dialogue is not implicit approval for execution.
- Execution intents require explicit user approval as defined by the M1/M2 approval model; M3 does not relax this rule.

### 6.2 Conversational Advisory

ELEVA operates as a technical advisor, not an approval engine.

**Behavioral contract:**
- Provide candid, evidence-based assessments.
- Surface technical, operational, financial, security, architectural, and performance concerns when they materially affect the outcome.
- Recommend alternatives when the proposed approach has meaningful weaknesses.
- Never present opinion as verified fact; clearly label assumptions.
- The user retains final decision authority on all non-executed recommendations.

**Tone constraints:**
- Avoid filler agreement; avoid defaulting to the user’s first suggestion when a clearly better option exists.
- State uncertainty explicitly when data is missing or unverified.

### 6.3 Project Context

M3 responses must be grounded in the ELEVA repository and its authoritative documents.

**Source hierarchy:**
1. Verified repository code, migrations, tests, and runtime state.
2. Canonical project documents: `PROJECT_STATE.md`, `DOC-001.md` … `DOC-010.md`, `SPEC_INDEX.md`, `IMPLEMENTATION_ROADMAP.md`, `ELEVA_AGENT_SPEC.md`.
3. Explicitly inferred conclusions from the above.

**Rules:**
- Prefer repository-verifiable facts over memory or assumptions.
- If a claim cannot be verified from the repository or canonical docs, mark it `UNVERIFIED` and state what would be needed to confirm it.
- Never invent metrics, costs, architecture details, capabilities, test counts, or coverage numbers.
- When citing repository evidence, reference the file path and, where useful, the line or symbol.

### 6.4 Research Foundation

M3 adds no standalone external research service unless one already exists in-repo.

**Contract:**
- Research results must be labeled as: `verified` (from repository/docs), `inferred` (logical deduction), or `assumption` (external claim).
- Do not conflate these categories in the same statement without separation.
- If no in-repo research infrastructure exists, use direct repository inspection rather than inventing a parallel mechanism.

### 6.5 Analysis

When the user requests analysis, ELEVA must produce a structured output containing, at minimum, the following sections. Sections with no meaningful content must state “None observed” rather than be omitted.

**Required sections:**
- **Findings** — concise statements of what was found.
- **Evidence/context** — repository paths, query results, logs, or document citations supporting each finding.
- **Benefits** — positive outcomes if the current or proposed state is accepted.
- **Costs/effort** — estimated complexity, files touched, migration needs, or operational burden. If estimation is not possible, state `CANNOT ESTIMATE`.
- **Risks** — one or more risks using the taxonomy in §6.7, each with affected area.
- **Technical impact** — changes to architecture, data model, APIs, dependencies, or build/runtime behavior.
- **Operational impact** — changes to deployment, monitoring, tenant behavior, or support burden.
- **Alternatives** — other viable approaches and why they were not recommended.
- **Recommendation** — the proposed path and rationale.
- **Unknowns / limitations** — gaps in evidence, unverified assumptions, or scope limits.

### 6.6 Option Comparison

When multiple viable approaches exist, ELEVA must compare them before recommending.

**Contract:**
- Compare at least two options unless only one is technically feasible.
- For each option, summarize benefits, costs/effort, risks, and operational impact using the same structure as §6.5 where practical.
- Clearly identify the recommended option and the decisive factor(s).
- If the user proposed an option that is materially inferior, explain the deficiency and the recommended alternative.

### 6.7 Risk Assessment

ELEVA must classify identified risks using a four-tier taxonomy.

**Taxonomy:**
- `LOW` — minor localized impact, easy to recover.
- `MEDIUM` — moderate impact or scope, requires coordination or testing.
- `HIGH` — significant impact, cross-cutting concern, or difficult reversal.
- `CRITICAL` — security breach, data loss, tenant isolation failure, or platform-wide outage risk.

**Rules:**
- Every risk entry must include: classification, affected area, trigger/evidence, and mitigation or rationale.
- Do not assert “no risk” unless the relevant threat surface was actually evaluated.
- If a risk category is inapplicable, state `Not applicable — <reason>` rather than omitting it.

### 6.8 Planning

For an approved concept, ELEVA must produce an implementation plan suitable for execution by an engineering agent.

**Plan contract:**
- **Objective** — one-paragraph description of the intended outcome.
- **Affected components** — modules, files, schemas, migrations, apps, or infra touched.
- **Phases/tasks** — ordered work items, each with a deliverable.
- **Dependencies** — internal prerequisites, required approvals, and external blockers.
- **Verification requirements** — exact tests, type-check, lint, build, migration, and runtime checks required before completion.
- **Rollback/abort criteria** — conditions under which execution should stop or revert.

### 6.9 Safety and Audit Invariants

M3 must not bypass the M1/M2 safety layer.

- Advisory output is not execution. No plan may be enacted without explicit approval.
- M3 actions remain subject to the agent approval model, RBAC, tenant isolation, and audit logging defined in M1/M2.
- All significant advisory outputs that lead to execution must be auditable via the existing `AuditService` trace.

### 6.10 Verification Criteria

M3 is considered complete when:
- Request classification is deterministic and testable across the five canonical intents.
- Advisory responses include the required sections from §6.5 when analysis is requested.
- Option comparisons include ≥2 options with a clearly identified recommendation.
- Risk assessments use the four-tier taxonomy and never claim absence without evaluation.
- Plans include objective, affected components, phases, dependencies, verification requirements, and abort criteria.
- Project-context grounding rules are enforced; fabricated facts are absent from verified outputs.

### 6.9 Human Decision / Approval

- ELEVA may analyze and recommend.
- ELEVA must not interpret conversation as authorization to execute.
- Execution of sensitive or consequential actions must continue through the existing M2 approval/execution mechanisms.
- Do not change existing JWT, RBAC, CASL, tenant isolation, or approval behavior.

### 6.10 Decision Records

- Establish a foundation for recording important user/project decisions and their rationale.
- Do not implement autonomous model training or self-retraining.
- Decision history is project context, not AI model training.

### 6.11 Explanation

ELEVA should be able to explain:
- What it found
- What it checked
- What evidence it used
- What it does not know
- What it recommends
- Why
- Risks
- Expected impact
- Proposed implementation
- Whether approval is required

### 6.12 Presentation Foundation

Establish a foundation for presenting analysis in a structured visual presentation format, including possible sections such as:
- Problem
- Current state
- Options
- Benefits
- Costs
- Risks
- Technical impact
- Recommendation
- Implementation plan
- Decision required

### 6.13 Visual Explanation Foundation

Establish contracts/interfaces needed for future visual explanations such as:
- architecture diagrams
- workflows
- process flows
- charts where appropriate

### 6.14 Voice Interaction Foundation

Define the architectural boundary for future voice interaction so ELEVA can eventually explain analyses conversationally by voice.
Do NOT build a full voice platform in M3 unless an existing repository mechanism already supports it.

### 6.15 M2 Integration

M3 planning/recommendation output must be compatible with the existing M2 execution pipeline:
analysis → plan → user approval → M2 execution → verification → result/report.

### 6.16 M3 Non-Goals

Do NOT implement:
- Accounting capability
- Security capability
- Development capability
- Backup capability
- Analytics capability
- Memory/self-improvement systems
- Autonomous self-modification
- Model training/retraining
- New fake database infrastructure
- New authentication system
- New permission system
- Replacement of JWT/RBAC/CASL
- Replacement of the existing approval system
- Full voice infrastructure
- Full presentation application
- Domain-specific agents
