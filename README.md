# ZAYJAR RESTAURANT SAAS PLATFORM - TECHNICAL DOCUMENTATION SUITE

Welcome to the official Core Technical Documentation suite for the **Zayjar Restaurant SaaS Platform**. This repository contains production-grade, highly-detailed architecture blueprints, database schemas, API references, business logic pipelines, and deployment guidelines. It serves as an immutable master reference for Core Developers, Platform Engineers, SREs, and Security Auditors.

## DOCUMENTATION INDEX & SITE MAP

| Document ID | Title | Purpose | Key Contents |
| --- | --- | --- | --- |
| [**DOC-001.md**](./DOC-001.md) | **System Architecture Specification** | Describes the physical and logical system structure. | High-Level Cloud Topology, Frontend & Backend architectures, Multi-tenancy, Subscription gating. |
| [**DOC-002.md**](./DOC-002.md) | **Database Schema & Data Dictionary** | Fully documents the database storage mapping. | 29 relational tables, columns, indexes, enums, check constraints, lifecycle triggers, soft-delete policies, complete SQL DDL schema. |
| [**DOC-003.md**](./DOC-003.md) | **REST API Portal Reference** | Exhaustive reference of all exposed HTTP gateways. | Routes, authentication headers, request payloads, success and error responses (JSON), validation rules, rate-limits. |
| [**DOC-004.md**](./DOC-004.md) | **Master Technical Specification** | The unified, combined single-volume spec book. | Complete, unshortened compilation of all architectural sections and implementation modules. |
| [**DOC-005.md**](./DOC-005.md) | **Business Logic & Workflows** | Blueprint for transactional operations. | Onboarding flows, branch context scoping, price inheritance engine, order state-machine, secure QR generation. |
| [**DOC-006.md**](./DOC-006.md) | **Security & Cryptographic Standards** | Security policies, data filters, and access gates. | RS256 asymmetric keys, JWT token structure, Redis session blacklist, SQL-injection prevention, rate limiting. |
| [**DOC-007.md**](./DOC-007.md) | **Image Storage & Processing Pipeline** | Specs for file management and image conversion. | Direct S3 pre-signed URL uploads, serverless Sharp optimization (WebP), CloudFront caching, and validation. |
| [**DOC-008.md**](./DOC-008.md) | **Multi-Channel Notifications** | Architecture for delivery communications. | SendGrid template system, Twilio SMS routing, Firebase Cloud Messaging (FCM) payloads, outbound webhooks, Socket.io rooms. |
| [**DOC-009.md**](./DOC-009.md) | **Third-Party Integrations** | Specs for external billing, wallet and logging systems. | Stripe Billing, regional payment wallets (KNET, benefit, Apple Pay), ELK Stack, Datadog metrics, disaster recovery. |
| [**DOC-010.md**](./DOC-010.md) | **Development, Testing & Operations** | Handover guidelines for SREs and developers. | Monorepo pnpm schemas, ESLint conventions, Jest unit testing, Playwright E2E checks, Docker Compose scripts, Nginx configurations, AWS database failover runbooks. |
| [**TESTING.md**](./TESTING.md) | **Manual Application Testing Index** | Entry point for manually inspecting and testing the running application (Phase 3 closure state). | Boot commands, entry URLs, verified credential path, core test matrix with expected results, suite results, known documented limitations. |

---

## DEVELOPER QUICK-START GUIDE

To boot the complete development infrastructure locally, clone the monorepository and execute the docker-compose orchestrator:

```bash
# 1. Clone the repository
git clone https://github.com/zayjar/platform-core.git
cd platform-core

# 2. Boot all core infrastructure and micro-services
docker-compose up -d --build

# 3. Apply database schemas and seed default lookup values
pnpm --filter @zayjar/db run prisma:migrate:dev
pnpm --filter @zayjar/db run prisma:seed
```

For more detailed descriptions, refer directly to [**DOC-010.md**](./DOC-010.md).
