# ELEVA M7 — Proactive Intelligence & Autonomous Awareness

**Status:** Approved scope; implementation not started.
**Depends on:** M1–M6.
**Scope rule:** No M7.1, Slice 11+, M8, or M9 work is included.

## 1. Objective

M7 makes ELEVA proactive: it receives real signals, detects events and anomalies, correlates related events, forms a Situation/Incident, analyzes it, determines severity, preserves evidence, produces recommendations, and alerts the user when appropriate.

M7 does not autonomously execute sensitive actions. Any consequential execution continues through the M6 approval, execution, verification, and audit controls.

## 2. Event & Signal Foundation

- Define a normalized Signal model with source, type, received time, and evidence/raw data.
- Convert valid Signals into traceable Events.
- Reject invalid signals explicitly.
- Never fabricate signals or events.
- Providers that are unavailable or unconfigured must report an explicit unavailable state.

## 3. Situation / Incident Engine

- Define a first-class `Situation` model.
- A Situation may be formed from one or more related Events.
- Include situation ID, state, severity, related events, evidence, detection time, last update, known impact, analysis, and recommendation.
- Support a clear lifecycle such as DETECTED → INVESTIGATING → ACTIVE → RESOLVED.

## 4. Event Correlation

- Correlate events only using explicit, verifiable criteria such as source, time window, resource, or correlation key.
- Record `correlationReason` for every correlation.
- Do not merge unrelated events.

## 5. Anomaly Detection

- Start with deterministic, testable rules rather than speculative ML.
- Support rules such as repeated failures within a configured window or repeated identical errors.
- Every anomaly must retain the triggering evidence and reason.

## 6. Severity Assessment

Use exactly:

- `LOW`
- `MEDIUM`
- `HIGH`
- `CRITICAL`

HIGH/CRITICAL assessments must include a reason and supporting evidence.

## 7. Recommendation Engine

Recommendations must contain, at minimum:

- recommendation ID
- situation ID
- summary
- proposed action
- reason
- risk
- whether approval is required
- recommendation status

A recommendation is never an approval and never an execution. Sensitive/consequential actions must enter the M6 approval/verification pipeline.

## 8. Alert Policy

- LOW: visible in the situations list only.
- MEDIUM: visible in Executive Office.
- HIGH: alert the user.
- CRITICAL: immediate alert plus recommendation.

Every alert must reference a Situation and have an evidence-based reason.

## 9. Scheduled Intelligence

- Support scheduled monitoring/check cycles for configured real providers.
- Scheduler state and results must be inspectable.
- Unconfigured providers must return unavailable rather than fake results.
- Scheduled intelligence must not become unrestricted autonomous execution.

## 10. Situation Memory

Reuse M5 memory foundations where possible. Preserve:

- what happened
- evidence
- analysis
- recommendation
- user decision
- approval state where applicable
- execution/verification outcome where applicable
- resolution state

## 11. Executive Office

Add first-class Situation visibility:

- active situation count
- severity
- state
- detection time
- last update
- related events
- evidence
- correlation reason
- analysis
- impact
- recommendation
- alert state
- approval/execution state where applicable

## 12. M6 Integration

The required flow is:

Signal → Event → Detection/Correlation → Situation → Analysis → Recommendation → M6 Approval (when required) → M6 Execution → M6 Verification → Outcome/Audit

M7 must never bypass M6 controls.

## 13. Verification / Tests

M7 is complete only when tests cover:

1. valid and invalid Signals
2. unavailable providers
3. Event creation
4. event correlation and correlation reasons
5. rejection of unrelated correlations
6. anomaly detection
7. severity assignment
8. HIGH/CRITICAL evidence requirements
9. Situation lifecycle
10. Recommendation creation
11. M6 handoff for sensitive actions
12. alert policy
13. scheduled check cycle
14. Executive Office Situation endpoints
15. no regression of M1–M6

Static gates:

- TypeScript
- ESLint
- Jest
- build

## 14. Non-Goals

Do NOT implement:

- sensitive autonomous execution
- approval bypass
- autonomous self-healing
- fake operational or monitoring data
- a new authentication/authorization/permission system
- a new competing memory system when M5 can be reused
- speculative ML anomaly detection
- deployment or backup execution
- M7.1 or later slices
- Slice 11+
- M8
- M9

## 15. Completion Rule

M7 may be declared complete only after the Definition of Done above is verified against the repository and all required tests/static gates pass. Until then, M7 remains implementation-in-progress and no later milestone is started.
