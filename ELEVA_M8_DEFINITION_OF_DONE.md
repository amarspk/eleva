# ELEVA M8 — Business Intelligence & Operations

**Status:** Approved scope; implementation not started.
**Depends on:** M1–M7 verified.
**Scope:** Business intelligence, operational analytics, executive decision support, and operational planning.

## 1. Goal

M8 moves ELEVA from proactive awareness (M7) to evidence-grounded business and operational intelligence. ELEVA must be able to inspect real available project/business/operational data, identify meaningful trends and changes, explain evidence and limitations, and produce decision-ready recommendations and plans.

M8 must not fabricate metrics, business facts, costs, or operational state.

## 2. Business & Operational Metrics

ELEVA must expose structured metric definitions and results for real available data, including where applicable:

- sales/revenue
- orders
- operational performance
- errors/failures
- restaurant/branch performance
- system/platform indicators

Each metric must have a source, time range, calculation/definition, and evidence status where applicable.

If a required provider or dataset is unavailable or unconfigured, ELEVA must explicitly report `UNAVAILABLE`/`UNVERIFIED` rather than inventing a value.

## 3. Analytics Engine

ELEVA must support deterministic, testable analysis of available data, including:

- period-over-period comparison
- trends
- significant changes/anomalies where deterministically detectable
- segmentation by relevant resource such as restaurant or branch
- evidence-grounded likely-cause analysis

Analytical conclusions must distinguish verified facts from inference and unknowns.

## 4. Executive Insights

An executive insight must contain, where applicable:

- insightId
- metric/data source
- observation
- time range
- evidence
- analysis
- impact
- confidence/evidence classification
- limitations/unknowns
- recommendation

An insight must be traceable to the underlying data/evidence.

## 5. Business Decision Support

For a decision request, ELEVA must provide:

- current state
- relevant evidence
- viable options
- benefits
- costs/effort, or `CANNOT ESTIMATE`
- risks using LOW/MEDIUM/HIGH/CRITICAL
- operational/technical impact
- recommended option
- rationale

Recommendations are advisory and are not approvals or executions.

## 6. Operational Planning

ELEVA must be able to convert an approved recommendation into a structured implementation/operational plan compatible with the existing M6 pipeline:

analysis → recommendation → plan → approval when required → M6 execution → verification → outcome/audit

Plans must identify objective, affected components/resources, ordered tasks, dependencies, verification requirements, and abort/rollback criteria.

## 7. Executive Office Integration

The Executive Office must expose decision-ready intelligence, including where applicable:

- KPI/metric summaries
- trends
- executive insights
- business/operational situations from M7
- recommendations
- pending approvals from M6
- execution/verification outcomes

Data shown must come from real available sources. No placeholder business numbers or fake operational state.

## 8. Memory Integration

Reuse the existing ELEVA memory/context mechanisms. M8 must preserve and retrieve relevant history such as:

- previous insight/analysis
- recommendation
- user decision
- approval state
- execution/verification outcome
- resulting business/operational state

Do not create a competing memory system.

## 9. M6/M7 Integration

M8 must consume M7 situations/events when relevant and hand consequential recommendations to M6 when execution is required.

The boundary remains:

M7 observation → M8 analysis/decision support → recommendation/plan → M6 approval → M6 execution → M6 verification → outcome/audit.

M8 must never bypass M6 approval or verification requirements.

## 10. Data Honesty & Safety

- No fabricated metrics, costs, business results, provider state, or operational status.
- Missing data must be explicitly identified.
- External claims must be marked according to the existing evidence model.
- No new authentication or permission system.
- Preserve existing JWT/RBAC/CASL, tenant isolation, approval, audit, and verification controls.
- No unrestricted autonomous execution.
- No autonomous self-healing.
- No autonomous financial transactions.

## 11. Tests & Verification

Tests must cover at minimum:

1. valid metric definitions/results
2. unavailable/unconfigured data providers
3. metric source/evidence traceability
4. period comparisons and trend analysis
5. deterministic significant-change detection
6. segmentation where supported
7. evidence-grounded insight generation
8. fact vs inference vs unknown handling
9. executive insight structure
10. decision-support options and recommendation
11. risk classification
12. operational planning contract
13. M6 handoff for consequential actions
14. M7 situation consumption
15. memory reuse
16. Executive Office intelligence surfaces
17. regression of M1–M7

Static gates:

- TypeScript clean
- ESLint clean
- Jest tests pass
- production build succeeds
- `git diff --check` clean

## 12. Non-Goals

Do NOT implement:

- M8.1 or later slices
- Slice 11+
- M9
- avatar implementation
- full mobile application
- full voice platform
- camera/vision platform
- unrestricted autonomous execution
- approval bypass
- autonomous self-healing
- autonomous financial transactions
- fake data/providers
- new authentication system
- new permission system
- replacement of JWT/RBAC/CASL
- replacement of M6 approval/execution/verification
- competing memory system
- deployment/backup execution

## 13. Completion Rule

M8 is complete only after the implementation satisfies this Definition of Done, all required tests and static gates pass, and the completion state is recorded in the canonical project documentation.

No M9 work begins until M8 is verified complete.