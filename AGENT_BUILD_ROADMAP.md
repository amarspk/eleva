# ELEVA Agent — Build Roadmap

> Single source of truth for **construction milestones**.  
> `PROJECT_STATE.md` remains the engineering state document.  
> This file tracks **M1–M9 only**. Numbered Slices 1–10 are historical increments; they are **not** the endpoint.

**Branch:** `arena/01a01767-eleva`  
**HEAD at last roadmap update:** `c98a60ac00fd943b2722dd6158f3b87137f86d89`  
**Date:** 2026-08-25 (Asia/Dubai)

**Critical rule:** Do **not** invent Slice 11+ or treat “another slice” as progress. Advance **only** a named milestone after its Definition of Done is verified.

---

## Status table

| Milestone | Status | Started | Completed | Verification | Notes |
|---|---|---|---|---|---|
| M1 Agent Core | IN_PROGRESS | 2026-08-24 (Slice 1–3) | — | Partial (see below) | Spec loader + Ollama probe (`ee729bf`) + platform project memory (`c98a60a`). Live Ollama from Arena sandbox = **NO**. M1 DoD not fully VERIFIED (owner-host Ollama unproven). |
| M2 Tool System | IN_PROGRESS | 2026-08-24 (Slice 1) | — | Partial | SAFE inspect: `read_project_state`, `read_repo_file`, `git_status`, `git_log`. **No** agent tools for test/lint/build or git branches. |
| M3 Security/Approval | IN_PROGRESS | 2026-08-24 (Slice 2–4) | — | Partial | PLATFORM_OWNER + `agent:read/create/update`, approval/reject, AuditService, plan binding. Sensitive tools **blocked after approve**. Tenant restaurant data not in V1 Agent. |
| M4 Engineering Agent | IN_PROGRESS | 2026-08-24 (Slice 4–10) | — | Partial | Plan + sandbox write + verify + analyze + **two allow-listed copy sinks**. **Cannot** arbitrarily modify product code. **No** agent-run test/lint/build/diff tools. |
| M5 GitHub Loop | NOT_STARTED | — | — | — | No issue/PR/CI/push tools. Dual-push is a **human/session** git workflow, not an Agent tool. |
| M6 Security/DevOps | NOT_STARTED | — | — | — | Deploy/secrets/Stripe/SendGrid names exist as **blocked** SENSITIVE tools only. |
| M7 Backup/Operations | NOT_STARTED | — | — | — | `backup_restore`, `stop_service`, deletes are **blocked**. |
| M8 Business/Analytics | NOT_STARTED | — | — | — | V1 Agent must not read restaurant/order/customer data. |
| M9 Final ELEVA Agent | NOT_STARTED | — | — | — | M9 DoD is a **real E2E engineering loop**. Not met. |

Allowed statuses: `NOT_STARTED` | `IN_PROGRESS` | `BLOCKED` | `COMPLETED` | `VERIFIED`.

---

## Slice → milestone map (do not rewrite Slices)

Existing Slices 1–10 stay in history. Completing a Slice does **not** complete a milestone.

| Slice | Feature SHA | What it actually delivered | Milestones touched | Milestone complete? |
|---|---|---|---|---|
| 1 | `e9cfd7c711bbe515449dcca78070dc3e5e2dd3bc` | Platform-owner Agent API; SAFE tools; secrets-path deny | M1, M2, M3 | No |
| 2 | `b61afcafcfa559f7352883f1aee9f149805148b6` | Executive Office; `propose_plan`; SENSITIVE persist-only; approve/reject + audit | M2, M3 | No |
| 3 | `34dd6445021bb2223bd70f6c6c349faa5aa97655` | Chat + `AgentLlmProvider` (Ollama + heuristic); orchestrator reads PROJECT_STATE | M1, M2, M3 | No |
| 4 | `eec147484891c4a869add713d505ff115d4fb766` | Structured plans; workflow states; post-approve **SAFE inspection only** | M3, M4 | No |
| 5 | `449f436736226014307da3c401cd5cf3ac071f1e` | `write_agent_note` → `docs/agent-workspace/<slug>.md` | M3, M4 | No |
| 6 | `dcb70cc74ca15ff8f881af06c4bf39a6f3ab4651` | `write_implementation_file` sandbox `.ts` (excluded from API tsc) | M4 | No |
| 7 | `1922046bf553e564ed29a47952981ccd404b5516` | `verify_implementation_file` read-only inspect | M4 | No |
| 8 | `11441ef9024d96dc19312086ed571ee92f258723` | `analyze_implementation_file` structured analysis | M4 | No |
| 9 | `daebd8c876e8bc0eed6a7b29a7cbb58f2f4158a4` | `apply_approved_implementation` → `apps/api/src/agent/promoted.ts` only | M4 | No |
| 10 | `9ceae5017c76152d25888db8cf178b4459620672` | `apply_approved_product_implementation` → `packages/receipts/src/promoted-implementation.ts` only | M4 | No |

**Slice 11+:** not authorized. Do not start.

---

## Milestone Definitions of Done (honest gap)

### M1 — Agent Core
**Required:** project context, PROJECT_STATE awareness, spec/context loading, conversation/project memory, Ollama provider, structured responses, no invented project state.

**Present:** `read_project_state`; **`read_project_spec`** (allow-listed official specs, VERIFIED/MISSING/UNKNOWN); chat; Ollama provider + heuristic fallback; orchestrator reads PROJECT_STATE and injects the approved-spec catalog.

**Missing / unverified:**
- Live Ollama from this **Arena sandbox**: **NO** (`127.0.0.1:11434` not reachable here). That is **not** evidence the developer Windows machine cannot run Ollama. Config remains `OLLAMA_HOST=http://127.0.0.1:11434`, `OLLAMA_MODEL=qwen3:8b`.
- Ollama provider health + honest fallback: **gap closed** (feature SHA `ee729bfaa43320541c1626576d9d9006e6286b8a`). Statuses: `OLLAMA_AVAILABLE` / `OLLAMA_UNAVAILABLE` / `OLLAMA_MODEL_MISSING` / `OLLAMA_REQUEST_FAILED` / `HEURISTIC_FALLBACK`. Chat `provider` is the planner that actually answered.
- Specification/context loader: **gap closed** (`3c24395`).
- Persistent project memory beyond `AgentSession` / `AgentMessage` rows: **gap closed** (feature SHA `c98a60ac00fd943b2722dd6158f3b87137f86d89`) — table `agent_project_memory`, SAFE `read_project_memory` / `remember_project_memory`, loaded on chat. Platform-scoped (`tenantId` null). Secrets and tenant identifiers rejected. Live migrate on production DB: **not run in this sandbox**.

**Status:** `IN_PROGRESS`.

### M2 — Tool System
**Present:** explicit registry (`SAFE` / plan / controlled / sensitive); structured tool results; git status + log; repo file read with deny list.

**Missing:** git **branches**; test/lint/build **as Agent tools**; unrestricted filesystem.

**Status:** `IN_PROGRESS`.

### M3 — Security, Permissions & Approval
**Present:** PLATFORM_OWNER-only HTTP; `agent:read/create/update`; workflow REQUEST→…→COMPLETED|FAILED|REJECTED; plan `filesAffected` binding; AuditService; restaurant/manager/cashier 403; sensitive tools blocked even after approve.

**Missing vs full M3 wording:** general RBAC/tenant-isolation **product** checks are platform features, not Agent-executed security scans. Agent V1 is platform-scoped and must not touch tenant restaurant/order/customer rows.

**Status:** `IN_PROGRESS` (core approval loop works; not a full security-engineering suite).

### M4 — Engineering Agent
**Present:** inspect via SAFE tools; structured plan; risk field; approval; copy to **two** allow-listed TypeScript sinks after verify+analyze; re-read target.

**Missing (blocks M4 COMPLETED):**
- Modify **arbitrary** approved product files (`apply_patch` remains blocked by design).
- Agent-invoked test / lint / build / diff / regression tools.
- Evidence-based root-cause loop as an autonomous capability (human still drives).

**Status:** `IN_PROGRESS`.

### M5–M8
Not started. Sensitive names (`deploy`, `run_migration`, `change_secrets`, `stripe_action`, `sendgrid_send`, `backup_restore`, `delete_*`, `change_rbac`) are **propose-only / blocked**. That is **not** implementation of M5–M8.

### M9 — Final ELEVA Executive & Engineering Agent
**DoD:** one Agent (dashboard + desktop + laptop + mobile) that can run a **real** E2E engineering task (understand → inspect repo + PROJECT_STATE → evidence → plan → approve → change → verify → diff → test/lint/build → commit/push/PR when authorized → verify remote SHA → exact report).

**Not met.** Executive Office is a PLATFORM_OWNER backoffice console only.

---

## Current registry (fact)

**SAFE:** `read_project_state`, `read_project_spec`, `read_repo_file`, `git_status`, `git_log`

**CONTROLLED (approval + allow-list):** `write_agent_note`, `write_implementation_file`, `verify_implementation_file`, `analyze_implementation_file`, `apply_approved_implementation`, `apply_approved_product_implementation`

**SENSITIVE (blocked after approve):** `apply_patch`, `deploy`, `run_migration`, `change_secrets`, `stripe_action`, `sendgrid_send`, `backup_restore`, `delete_tenant`, `delete_user`, `change_rbac`, `stop_service`

Allow-listed write sinks today:
- `docs/agent-workspace/<slug>.md`
- `apps/api/src/agent/implementation/<slug>.ts` (sandbox)
- `apps/api/src/agent/promoted.ts` (Slice 9 sink)
- `packages/receipts/src/promoted-implementation.ts` (Slice 10 product sink; not exported)

---

## Verification last recorded (M1 project memory, this session)

- Agent Jest: **9 suites / 105 passed**
- ESLint on touched Agent files: clean
- Agent-path API `tsc`: 0 errors
- Full `pnpm test` / e2e-live / named CI / live `prisma migrate`: **not claimed**
- Feature SHA: `c98a60ac00fd943b2722dd6158f3b87137f86d89`

## Verification last recorded (M1 Ollama health, prior session)

- Agent Jest: **8 suites / 100 passed** (not full `pnpm test`)
- ESLint on touched Agent files: clean
- Agent-path API `tsc`: 0 errors
- Full `pnpm test` / e2e-live / named CI: **not claimed**
- Feature SHA: `ee729bfaa43320541c1626576d9d9006e6286b8a`
- Sandbox live Ollama: **UNAVAILABLE** (fetch failed) — expected in Arena; local Windows Ollama is a separate environment.

**Blockers (environment / ops, not coding tasks unless CTO names them):**
- Live SendGrid click-through
- Local Prisma generate TLS
- Job 2 `pnpm test` pre-existing FAIL
- Sandbox cannot reach host Ollama
- RS256 vs HS256 deferred S0-T01

---

## Exact next work

**Do not start Slice 11.**  
**Do not start M5–M9.**  
**Do not weaken security to “finish” a milestone.**

**Next named work:** M1 is still `IN_PROGRESS` (owner-host Ollama live click-through unverified). Do **not** start M2–M9 or Slice 11 unless the CTO names that gap.

Closed this turn: M1 persistent project memory.

Until the owner names one of those (or another explicit task), **stop**.

---

## Memory rule

On every completed Slice or milestone:

1. Update this file  
2. Update `PROJECT_STATE.md`  
3. Record commit SHA  
4. Record verification actually run  
5. Record blockers  
6. State the exact next milestone  

Never rely on chat history alone.
