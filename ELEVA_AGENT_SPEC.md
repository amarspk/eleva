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

## 7. M4 — Research, Evidence & Project Context Foundation

**Milestone:** ELEVA M4 — Research, Evidence & Project Context Foundation  
**Status:** Specification complete; implementation pending.  
**Depends on:** M1 (foundation/state/permissions/audit), M2 (execution foundation), and M3 (intelligence, analysis, planning & advisory foundation).

M4 moves ELEVA from analysis based primarily on supplied context into an evidence-grounded advisor that can safely obtain, organize, and reason over project context and research results. M4 does not modify M1, M2, or M3 behavior; it adds the retrieval, classification, and evidence-binding layer that feeds M3 advisory structures.

### 7.1 Project Context Engine

ELEVA must be able to retrieve relevant project context from existing repository mechanisms.

**Requirements:**
- Retrieve project files, specifications, configuration, code metadata, and documented project state through existing repository interfaces only.
- Return structured context objects.
- Clearly distinguish retrieved facts from assumptions.
- Never invent missing project information.
- If information cannot be confirmed, mark it `UNVERIFIED`.

### 7.2 Context Relevance

ELEVA must determine which available project context is relevant to the user's request.

**Requirements:**
- Avoid dumping unrelated project information into analysis.
- Preserve source/location information for retrieved context where available.
- Truncate or omit low-relevance context rather than returning it unchecked.

### 7.3 Research Planning

Given a question, ELEVA must determine what information needs to be researched.

**Requirements:**
- Break research into explicit research questions.
- Identify required evidence before forming a recommendation.
- Do not claim research was performed when it was not.

### 7.4 Research Source Model

Define a structured research source/reference contract containing, where available:

- `source`
- `title`
- `location/reference`
- `retrieved` timestamp
- `excerpt` or `summary`
- `evidenceClassification`
- `confidence`
- `limitations`

### 7.5 Evidence Model

Use explicit evidence classifications:

- `VERIFIED` — confirmed from repository, runtime, or authoritative project artifacts.
- `INFERRED` — logical deduction from verified facts.
- `ASSUMPTION` — external claim or premise accepted for analysis.
- `UNVERIFIED` — could not be confirmed from available evidence.

Evidence must be traceable to a source or explicitly marked as an assumption/unverified statement.

### 7.6 Research Results

Define a structured research result containing:

- `researchQuestion`
- `sources`
- `findings`
- `verifiedFacts`
- `inferences`
- `assumptions`
- `unknowns`
- `limitations`

### 7.7 Evidence-Grounded Analysis

Integrate M4 research/context with M3:

request understanding  
→ context/research  
→ evidence  
→ analysis  
→ options  
→ risks  
→ recommendation  
→ plan  

M3 must remain responsible for analysis, comparison, risk assessment, explanation, and planning.

### 7.8 Contradiction Handling

If sources or project facts conflict:

- detect the conflict where possible
- preserve both pieces of evidence
- do not silently choose one
- explain the conflict
- mark the affected conclusion appropriately

### 7.9 Freshness

Where information can become outdated, preserve retrieval time/date and make freshness limitations visible.

### 7.10 Research Honesty

ELEVA must never fabricate:

- sources
- URLs
- research results
- project facts
- metrics
- prices
- user behavior
- technical capabilities

If research or context retrieval is unavailable, ELEVA must explicitly state that it cannot confirm the information.

### 7.11 M3 Integration

M4 output must be consumable by the existing M3 advisory/analysis structures.

The intended pipeline is:

User request  
→ M3 request understanding  
→ M4 project context/research  
→ M4 evidence  
→ M3 analysis  
→ M3 option comparison  
→ M3 risk assessment  
→ M3 recommendation  
→ M3 planning  
→ user decision  
→ M2 approval/execution when applicable

### 7.12 M2 Boundary

M4 must never execute actions. Research/context retrieval is informational. Any consequential action continues through the existing M2 approval and execution pipeline.

### 7.13 Future Web Research Boundary

Define an extensible interface/boundary for external research providers so a real web research provider can be connected later. Do NOT invent fake web access. Do NOT add fake external research infrastructure. If the repository already contains a real research/web mechanism, reuse it instead of creating another one.

### 7.14 Project Context Boundary

Define interfaces/contracts so future ELEVA capabilities can consume project context consistently. Do not build a complete memory/self-improvement system in M4.

### 7.15 Audit

Significant research/context operations should remain compatible with the existing AuditService. Do not create a new audit system.

### 7.16 M4 Non-Goals

Do NOT implement:

- Accounting capability
- Security capability
- Development capability
- Backup capability
- Analytics capability
- Memory/self-improvement
- Autonomous self-modification
- Model training/retraining
- Autonomous unrestricted web browsing
- Fake web search
- Fake database infrastructure
|- New authentication system
|- New permission system
|- Replacement of JWT/RBAC/CASL
|- Replacement of M2 approval/execution
|- Full ELEVA Dashboard
|- Full voice system
|- Full presentation application
|- Domain-specific agents

## 8. M5 — ELEVA Executive Office, Conversational Agent & Interaction Foundation

**Milestone:** ELEVA M5 — ELEVA Executive Office, Conversational Agent & Interaction Foundation
**Status:** Specification complete; implementation pending.
**Depends on:** M1 (foundation/state/permissions/audit), M2 (execution foundation), M3 (intelligence, analysis, planning & advisory foundation), and M4 (research, evidence & project context foundation).

M5 establishes ELEVA as an executive AI assistant with a persistent interactive office experience, rather than a simple chatbot. M5 does not change M1, M2, M3, or M4 behavior; it adds the presentation, persona, voice, conversation, memory, and controlled interaction layers on top of the existing foundation.

### 8.1 ELEVA Executive Office

ELEVA must provide a dedicated Executive Office experience.

**Requirements:**
- The office is a distinct, dedicated environment for interacting with ELEVA.
- The office is separate from the Platform Owner administrative dashboard.
- The office is the primary environment for interacting with ELEVA.
- The office is an extensible interactive experience, not merely a static background.

**Non-goals:**
- Not a replacement for the Platform Owner administrative dashboard.
- Not a static UI-only chatbot shell.

### 8.2 ELEVA Persona / Avatar

ELEVA is represented as a female AI executive assistant/avatar.

**Requirements:**
- Define the avatar/persona as an interaction layer.
- The persona must not imply human identity.
- The persona must not fabricate real-world personal attributes.

**Non-goals:**
- Do not implement a full avatar engine in this milestone.

### 8.3 Conversational Interaction

ELEVA must support natural multi-turn conversation with candid advisory behavior.

**Requirements:**
- Support natural multi-turn conversation.
- ELEVA must be able to disagree with the user when analysis indicates a problem.
- ELEVA must explain why it disagrees.
- ELEVA must provide alternatives and recommendations instead of blindly agreeing.
- ELEVA must distinguish facts, evidence, assumptions, recommendations, and unknowns.

### 8.4 Contextual Conversation

Integrate M3 advisory capabilities with M4 research/context capabilities.

**Requirements:**
- Conversations must preserve relevant project context.
- ELEVA must not invent project facts.
- Missing context must be surfaced as unknown/unverified.

### 8.5 Voice Interaction Foundation

Define a voice interaction architecture for hands-free conversational interaction.

**Requirements:**
- Support the concept of wake-word activation such as "ELEVA" / "Hey ELEVA".
- The intended UX is hands-free conversational interaction rather than requiring the user to press a record button for every utterance.
- Define listening, thinking, speaking, stopped/muted, and wake states.

**Non-goals:**
- Do not invent or build a full external voice provider/platform if none exists in the repository.
- Voice provider integration remains an architectural boundary unless existing infrastructure supports it.

### 8.6 Research → Analysis → Advice Flow

ELEVA must recognize when a request requires research and produce grounded advice.

**Requirements:**
- ELEVA should be able to recognize when a request requires research.
- Use M4 evidence/context capabilities.
- Pass research results into M3 analysis/advisory capabilities.
- Produce an explainable recommendation.
- Never fabricate research, sources, metrics, or project facts.

### 8.7 Presentation Foundation

ELEVA must be able to transform an analysis/recommendation into a structured presentation payload.

**Requirements:**
- Presentation sections may include: problem, context, evidence, options, comparison, risks, recommendation, decision, and implementation plan.

**Non-goals:**
- Do not build a complete presentation application in M5.

### 8.8 Visual Explanation Foundation

Define contracts for visual explanations derived from analysis.

**Requirements:**
- Define contracts for diagrams, workflows, comparisons, charts, and other visual explanations.
- Visual explanations must be derived from available evidence/analysis.
- Do not fabricate visual data.

### 8.9 Controlled Application Interaction

ELEVA may interpret requests to modify the application, subject to existing controls.

**Requirements:**
- ELEVA may interpret requests to modify the application.
- Such requests must flow through the existing M2 execution/authorization model.
- ELEVA must not bypass JWT/RBAC/CASL/approval controls.
- High-risk or consequential actions require the appropriate approval.

**Non-goals:**
- M5 must not introduce a replacement permission system.

### 8.10 ELEVA Memory Foundation

Define a persistent memory architecture for ELEVA without implementing a fake database.

**Requirements:**
- Memory must be separate from model training or retraining.
- Memory categories should include, where appropriate:
  - a. Project context
  - b. User preferences
  - c. Project goals
  - d. Decisions
  - e. Decision rationale
  - f. Rejected alternatives
  - g. Important conversation context
  - h. Explicit user instructions
  - i. Relevant verified project facts
- Memory entries must have provenance/evidence metadata where applicable.

### 8.11 M5 Non-Goals

Do NOT implement:

- Accounting capability
- Security capability
- Development capability
- Backup capability
- Analytics capability
- Memory/self-improvement
- Autonomous self-modification
- Model training/retraining
- Autonomous unrestricted web browsing
- Fake web search
- Fake database infrastructure
- New authentication system
- New permission system
- Replacement of JWT/RBAC/CASL
- Replacement of M1/M2 approval/execution
- Full ELEVA Dashboard
- Full voice system
- Full presentation application
- Domain-specific agents

### 8.12 Verification Criteria

M5 is considered complete when:

- The Executive Office experience is present and distinct from the Platform Owner administrative dashboard.
- Conversational interaction supports multi-turn dialogue and can disagree with explanations and alternatives.
- Voice interaction foundation defines wake-word UX and the required states without inventing unavailable voice infrastructure.
- Research/analysis/advice flow consumes M4 evidence and M3 advisory structures without fabricating facts.
- Presentation payloads include the required structured sections.
- Visual explanation contracts are defined and bound to evidence/analysis.
- Controlled application interaction requests flow through the existing M2 authorization model.
- Memory architecture is defined with categories and provenance metadata.
- No fake database, new auth system, new permission system, or replacement of existing controls is introduced.
- Static gates for touched surfaces pass: TypeScript, ESLint, Jest, build.

## 9. M6 — Agent Safety, Operational Control & Verified Execution

**Milestone:** ELEVA M6 — Agent Safety, Operational Control & Verified Execution
**Status:** Implementation complete; verification in progress.
**Depends on:** M1 (foundation/state/permissions/audit), M2 (execution foundation), M3 (intelligence/analysis/planning), M4 (research/evidence), and M5 (executive office/interaction).

M6 hardens the ELEVA agent runtime with first-class outcome contracts, approval lifecycle surfaces, operational control endpoints, and security risk-policy guardrails. M6 does not change the conversational, advisory, research, memory, or voice foundations defined in M1–M5; it adds enforcement, observability, and control layers on top of them.

### 9.1 Verified / Executed Outcome Contract

ELEVA must distinguish between execution completion and post-execution verification.

**Requirements:**
- `AgentTaskResult` must carry both `status` and `outcome` fields, with outcomes including `EXECUTED` and `VERIFICATION_FAILURE`.
- High-risk and sensitive tools require successful post-execution verification before the result is treated as trusted.
- Unverified results for high-risk/sensitive tools must be rejected with a distinct `VERIFICATION_FAILURE` outcome.
- Audit logs must record the verification outcome alongside execution details.
- The execution pipeline must never mutate a failed verification into a successful outcome.

**Non-goals:**
- Do not implement autonomous retries or self-healing execution without explicit user approval.
- Do not bypass approval requirements for high-risk tools even when verification passes.

### 9.2 Approval Center Completeness

ELEVA must provide first-class surfaces for pending approvals, approval inspection, and execution lifecycle tracking.

**Requirements:**
- `ElevaService` must expose `listPendingApprovals()`, returning only approved-but-not-yet-executed actions.
- Individual approval inspection must include `actionId`, `approved`, `capability`, `approvedAt`, `revokedAt`, and `executedAt`.
- Approval records must be immutable after creation; revocation and execution must create new record snapshots.
- `markExecuted(actionId)` must transition an approval to an executed state and emit an audit event.
- `assertApproved`, `assertActionVerified`, and `assertNotExecuted` must provide pre-condition guards for the execution pipeline.

**Non-goals:**
- Do not implement distributed approval consensus or multi-party signing in this milestone.
- Do not persist approvals to the database; in-memory lifecycle tracking is sufficient for this milestone.

### 9.3 Security Risk-Policy Guardrails

ELEVA must enforce security policies beyond coarse tool-level RBAC.

**Requirements:**
- Tool risk levels (`LOW`, `SENSITIVE`, `HIGH`) must be first-class fields on `AgentToolDefinition`.
- `HIGH` and `SENSITIVE` tools must require explicit approval before execution.
- `HIGH` and `SENSITIVE` tools must require successful post-execution verification; missing or failing verification must produce `VERIFICATION_FAILURE`.
- The execution service must reject execution of high-risk tools without both approval and verification.
- All risk-policy violations must be auditable via the existing `AuditService`.

**Non-goals:**
- Do not implement dynamic risk scoring or ML-based risk assessment.
- Do not introduce a new permission system; reuse the existing CASL/RBAC layer for authorization.

### 9.4 Executive Office Operational Control Surfaces

ELEVA must expose operational health, deployment, and backup status through first-class endpoints, not only read-only status.

**Requirements:**
- `ElevaOperationalService` must provide `getHealth()`, `getDeployment()`, `getBackup()`, and `getOperationalStatus()`.
- Operational providers must be swappable via `setHealthProvider`, `setDeploymentProvider`, and `setBackupProvider`.
- Default providers must return `unknown` with explicit `unavailable: true` details; never fabricate operational data.
- `ElevaOperationalController` must expose `GET /eleva-office/operational/health`, `/deployment`, `/backup`, and `/status`.
- All operational endpoints must require `read:agent` permission via the existing RBAC guards.

**Non-goals:**
- Do not implement actual deployment or backup actions in this milestone; read-only status only.
- Do not invent fake health/deployment/backup data when providers are unconfigured.

### 9.5 Existing M1–M5 Behavior Preservation

M6 must not alter the behavior of M1–M5 surfaces.

**Requirements:**
- Agent state transitions (`IDLE`, `RUNNING`, `ERROR`) must remain byte-identical.
- Capability registry, memory operations, voice state machine, and advisory response formats must be unchanged.
- Existing approval `recordApproval` / `revokeApproval` / `isApproved` semantics must be preserved.
- Existing M5 Executive Office routes (`/eleva-office/*`) must continue to function without modification.

### 9.6 M6 Non-Goals

Do NOT implement:

- M6.1 or later slices
- M7, M8, or M9 capabilities
- New authentication, permission, or authorization systems
- Persistent approval storage or database schema changes
- Autonomous execution without user approval
- Fake infrastructure or fabricated operational data

### 9.7 Verification Criteria

M6 is considered complete when:

- High-risk/sensitive tools without verification produce `VERIFICATION_FAILURE` and are audited.
- `listPendingApprovals` returns only approved, non-revoked, non-executed actions.
- `markExecuted` transitions approvals to executed state and emits audit events.
- Operational endpoints return `unknown` with `unavailable: true` when providers are unconfigured.
- All existing ELEVA tests pass; no M1–M5 tests are broken or removed.
- Static gates pass: TypeScript, ESLint, Jest, build.
- `ELEVA_AGENT_SPEC.md` and `PROJECT_STATE.md` are updated to record M6 completion.
