# IMPLEMENTATION_ROADMAP.md — Zayjar Restaurant SaaS Platform

> Single execution reference for remaining work from code-complete to general availability.
>
> Source of truth: DOC-001 through DOC-010, SPEC_INDEX.md, PROJECT_MANIFEST.md, PROJECT_COMPLETION_REPORT.md.
>
> Generated: 2026-07-27 | Branch: `main` | HEAD: `993b801`

---

## Current State

| Metric | Value |
|--------|-------|
| **Code completion** | 75/76 requirements (98.7%) |
| **Test suites** | 55 passing, 445 tests |
| **Lint** | Zero errors across 7 packages |
| **Infrastructure** | Not provisioned (local Docker Compose only) |
| **DNS** | Not configured |
| **SSL** | Not provisioned |
| **Third-party accounts** | Not created (Stripe live, SendGrid, Twilio, Firebase, Datadog) |
| **Vendor dependency** | §8.3 KNET/Benefit/Mada blocked on Tap/PayTabs credentials |

The codebase is complete. What remains is infrastructure, deployment, third-party onboarding, validation, and launch.

---

## Scope Definitions

### MVP Scope (Alpha)
Minimum viable product for internal testing. Core flows only. No real payments. No production infrastructure.

**Includes:**
- Local Docker Compose deployment (8 services)
- Stripe test mode (Apple Pay / Google Pay via Stripe Checkout)
- Full menu → order → KDS → checkout flow
- All 445 tests passing
- Backoffice admin panel (branch management, menu management, order monitoring)
- Cashier PWA (offline-first terminal)
- QR Menu browser (customer-facing)
- Authentication (JWT, MFA, RBAC)
- Multi-tenant isolation verified

**Excludes:**
- Real payment processing (Stripe live keys)
- Production AWS infrastructure
- DNS / SSL
- KNET/Benefit/Mada regional wallets
- Monitoring / alerting
- Load testing

### Beta Scope (Limited Market Launch)
Deployed to staging. Real Stripe test keys. Invited pilot restaurants. No production data.

**Includes:**
- Everything in MVP
- Kubernetes staging cluster deployment
- Stripe test mode with real webhook endpoints
- SSL certificates (cert-manager + Let's Encrypt staging)
- DNS for staging subdomains (`*.staging.zayjar.com`)
- SendGrid email templates verified
- Twilio SMS verified
- Firebase FCM verified
- Winston structured logging verified
- Health check endpoint operational
- Database on RDS (staging)
- Redis on ElastiCache (staging)
- CloudFront CDN configured
- Sentry or Datadog error tracking

**Excludes:**
- Production Stripe keys
- Production AWS infrastructure
- KNET/Benefit/Mada
- Full monitoring / alerting
- Load testing at scale

### Production Scope (General Availability)
Full production deployment. All payment methods. All monitoring. All compliance.

**Includes:**
- Everything in Beta
- Production AWS infrastructure (RDS Multi-AZ, ElastiCache, S3, CloudFront, ECS/EKS)
- Production Stripe keys (live mode)
- Production DNS (`*.zayjar.com`)
- Production SSL certificates (cert-manager + Let's Encrypt)
- KNET/Benefit/Mada regional wallets (when vendor credentials received)
- Full Datadog APM monitoring
- ELK stack logging pipeline
- Automated backups verified (RPO 5min, RTO 30min)
- Load testing completed
- ZATCA invoice compliance (Saudi Arabia)
- GDPR data retention verified
- Production security audit passed
- Incident response runbooks tested

---

## Phase 1: Foundation & Local Validation

**Duration:** 2–3 days
**Prerequisites:** None
**Status:** In Progress

### Tasks

| # | Task | Depends On | Deliverable |
|---|------|------------|-------------|
| 1.1 | Verify all 445 tests pass on clean checkout | — | CI badge green |
| 1.2 | Verify Docker Compose brings up all 8 services | 1.1 | `docker compose up` healthy |
| 1.3 | Verify full order flow locally: login → create tenant → add menu → place order → KDS receives ticket → mark prepared → checkout | 1.2 | Manual test pass |
| 1.4 | Verify backoffice panel loads and connects to API | 1.2 | Browser test pass |
| 1.5 | Verify cashier PWA loads and connects to API | 1.2 | Browser test pass |
| 1.6 | Verify QR menu browser loads and displays categories | 1.2 | Browser test pass |
| 1.7 | Verify WebSocket (KDS) real-time updates work across tabs | 1.2 | Manual test pass |
| 1.8 | Verify health endpoint returns `{status: "ok"}` | 1.2 | `curl localhost:8000/health` |
| 1.9 | Verify CSRF tokens are issued and validated | 1.2 | Login + mutating request test |
| 1.10 | Verify rate limiting returns HTTP 429 | 1.2 | Rapid-fire test |

### Definition of Done

- [ ] All 445 tests pass on clean checkout
- [ ] All 8 Docker Compose services start without errors
- [ ] Full order lifecycle works end-to-end locally
- [ ] All 3 frontend apps load and communicate with API
- [ ] WebSocket real-time updates functional
- [ ] Health endpoint responsive

### Milestone: LOCAL_VALIDATED

---

## Phase 2: Third-Party Account Setup

**Duration:** 1–2 weeks (can run in parallel with Phase 1)
**Prerequisites:** Business registration documents
**Status:** Not Started

### Tasks

| # | Task | Depends On | Deliverable |
|---|------|------------|-------------|
| 2.1 | Create Stripe account and verify business | — | Stripe dashboard active |
| 2.2 | Configure Stripe products and prices (TIER_STARTER, TIER_GROWTH, TIER_ENTERPRISE) | 2.1 | 3 subscription tiers live |
| 2.3 | Create Stripe webhook endpoint (test mode) | 2.1 | Webhook URL registered |
| 2.4 | Configure Stripe webhook events: `checkout.session.completed`, `invoice.payment_succeeded`, `invoice.payment_failed`, `customer.subscription.deleted`, `customer.subscription.updated`, `customer.subscription.trial_will_end` | 2.3 | 6 events subscribed |
| 2.5 | Create SendGrid account and verify sender domain | — | Sender authentication complete |
| 2.6 | Create SendGrid transactional email templates (welcome, invoice, password-reset) | 2.5 | 3 templates active |
| 2.7 | Create Twilio account and purchase phone number | — | Twilio number active |
| 2.8 | Create Firebase project and enable FCM | — | FCM server key generated |
| 2.9 | Create Datadog account (if using cloud-hosted) | — | API key generated |
| 2.10 | Document all API keys and credentials (NOT in git) | 2.1–2.9 | Credentials inventory |

### Definition of Done

- [ ] Stripe test mode configured with webhook endpoint
- [ ] 3 subscription tiers created in Stripe
- [ ] SendGrid sender domain verified
- [ ] Twilio phone number provisioned
- [ ] Firebase FCM project created
- [ ] All API keys documented securely (e.g., in 1Password, AWS Secrets Manager)

### Milestone: THIRD_PARTY_READY

---

## Phase 3: Staging Infrastructure

**Duration:** 3–5 days
**Prerequisites:** Phase 2 complete, AWS account created
**Status:** Not Started

### Tasks

| # | Task | Depends On | Deliverable |
|---|------|------------|-------------|
| 3.1 | Create AWS account (if not exists) | — | AWS account active |
| 3.2 | Create VPC with public/private subnets across 2 AZs | 3.1 | VPC created |
| 3.3 | Provision RDS PostgreSQL 15 (Multi-AZ for staging) | 3.2 | RDS instance running |
| 3.4 | Provision ElastiCache Redis 7.2 cluster | 3.2 | Redis cluster running |
| 3.5 | Create S3 bucket for media assets (`zayjar-assets-staging`) | 3.1 | S3 bucket created |
| 3.6 | Create S3 bucket for backups (`zayjar-backups-staging`) | 3.1 | S3 bucket created |
| 3.7 | Provision CloudFront distribution | 3.5 | CloudFront distribution created |
| 3.8 | Create ECS cluster (Fargate) | 3.2 | ECS cluster ready |
| 3.9 | Create ECR repositories for API, Worker, QR Menu, Backoffice, Cashier | 3.1 | 5 ECR repos created |
| 3.10 | Create Kubernetes staging cluster (EKS or k3s) | 3.8 | K8s cluster running |
| 3.11 | Install NGINX Ingress Controller | 3.10 | Ingress controller running |
| 3.12 | Install cert-manager | 3.10 | cert-manager ready |
| 3.13 | Create Route 53 hosted zone for `zayjar.com` | 3.1 | Hosted zone created |
| 3.14 | Create staging subdomains: `*.staging.zayjar.com`, `api.staging.zayjar.com`, `admin.staging.zayjar.com`, `cashier.staging.zayjar.com` | 3.13 | DNS records created |
| 3.15 | Request SSL certificates via cert-manager (Let's Encrypt) | 3.14 | SSL certs issued |
| 3.16 | Create AWS Secrets Manager secret for staging | 3.1 | Secret created |
| 3.17 | Populate Secrets Manager with: DATABASE_URL, JWT_PRIVATE_KEY, JWT_PUBLIC_KEY, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, SENDGRID_API_KEY, TWILIO_AUTH_TOKEN, REDIS_URL | 2.10, 3.16 | Secrets populated |
| 3.18 | Run Prisma migrations against staging RDS | 3.3, 3.17 | Database schema deployed |
| 3.19 | Run database seeding (subscription plans, demo tenant) | 3.18 | Seed data loaded |
| 3.20 | Enable WAL archiving to S3 for PITR | 3.3 | WAL archiving active |

### Definition of Done

- [ ] AWS VPC with 2 AZs, public/private subnets
- [ ] RDS PostgreSQL 15 Multi-AZ running
- [ ] ElastiCache Redis 7.2 running
- [ ] S3 buckets for assets and backups created
- [ ] CloudFront distribution provisioned
- [ ] ECS cluster or EKS cluster running
- [ ] ECR repositories created for all 5 apps
- [ ] Route 53 hosted zone with staging subdomains
- [ ] SSL certificates issued and valid
- [ ] Secrets Manager populated with all credentials
- [ ] Database schema deployed and seeded
- [ ] WAL archiving to S3 enabled

### Milestone: STAGING_INFRA_READY

---

## Phase 4: Staging Deployment

**Duration:** 2–3 days
**Prerequisites:** Phase 3 complete
**Status:** Not Started

### Tasks

| # | Task | Depends On | Deliverable |
|---|------|------------|-------------|
| 4.1 | Configure CI/CD GitHub Secrets (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, ECR_REGISTRY, ECS_CLUSTER, etc.) | 3.1 | Secrets configured |
| 4.2 | Push Docker images to ECR (API, Worker, QR Menu, Backoffice, Cashier) | 3.9, 4.1 | 5 images in ECR |
| 4.3 | Deploy Kubernetes manifests to staging cluster | 3.10, 4.2 | All pods running |
| 4.4 | Configure NGINX Ingress with TLS termination | 3.11, 3.15 | Ingress routing active |
| 4.5 | Verify API health endpoint returns 200 through ingress | 4.4 | `curl api.staging.zayjar.com/health` |
| 4.6 | Verify all 3 frontend apps load through ingress | 4.4 | Browser test pass |
| 4.7 | Configure Stripe webhook to point to staging API | 2.3, 4.5 | Webhook delivering events |
| 4.8 | Test Stripe checkout session creation (test mode) | 4.7 | Checkout flow works |
| 4.9 | Verify email delivery (welcome email via SendGrid) | 4.5 | Email received |
| 4.10 | Verify SMS delivery (Twilio test message) | 4.5 | SMS received |
| 4.11 | Verify FCM push notification delivery | 4.5 | Push received |
| 4.12 | Verify WebSocket KDS updates through ingress | 4.4 | Real-time updates work |
| 4.13 | Run full test suite against staging | 4.5 | 445 tests pass |
| 4.14 | Verify CloudFront CDN serves images | 3.7, 4.5 | CDN URLs resolve |
| 4.15 | Verify rate limiting works through ingress | 4.5 | HTTP 429 returned |

### Definition of Done

- [ ] All 5 Docker images deployed to ECR
- [ ] All pods running and healthy in staging K8s
- [ ] API accessible at `api.staging.zayjar.com` with valid SSL
- [ ] All 3 frontends accessible through ingress
- [ ] Stripe test mode checkout flow works end-to-end
- [ ] Email, SMS, and push notifications delivery verified
- [ ] WebSocket KDS real-time updates functional through ingress
- [ ] Full test suite passes against staging
- [ ] CloudFront CDN serving images
- [ ] Rate limiting operational

### Milestone: STAGING_DEPLOYED

---

## Phase 5: Monitoring & Observability

**Duration:** 2–3 days
**Prerequisites:** Phase 4 complete
**Status:** Not Started

### Tasks

| # | Task | Depends On | Deliverable |
|---|------|------------|-------------|
| 5.1 | Enable Datadog APM agent in K8s (set DD_AGENT_HOST) | 4.3 | APM traces visible |
| 5.2 | Verify Winston structured JSON logs in CloudWatch or ELK | 4.3 | Logs searchable |
| 5.3 | Verify correlation IDs in request logs | 4.3 | X-Request-ID propagated |
| 5.4 | Verify sensitive data masking in logs | 4.3 | No passwords/tokens in logs |
| 5.5 | Create CloudWatch alarms: CPU > 80%, Memory > 80%, RDS connections > 80%, Redis memory > 80% | 3.1 | Alarms configured |
| 5.6 | Create CloudWatch alarms: API 5xx error rate > 1%, P99 latency > 2s | 4.5 | Alarms configured |
| 5.7 | Set up log rotation (14-day general, 30-day error-only) | 4.3 | Rotation verified |
| 5.8 | Verify audit logs are immutable (UPDATE/DELETE blocked) | 3.18 | Audit log integrity confirmed |
| 5.9 | Create PagerDuty or Opsgenie integration for critical alarms | 5.5, 5.6 | Alert routing active |
| 5.10 | Document monitoring dashboard URLs | 5.1–5.9 | Dashboard links documented |

### Definition of Done

- [ ] Datadog APM traces visible for API requests
- [ ] Structured JSON logs searchable
- [ ] Correlation IDs propagated across all requests
- [ ] Sensitive data masked in all log outputs
- [ ] CloudWatch alarms for CPU, memory, RDS, Redis, 5xx errors, latency
- [ ] Alert routing to PagerDuty/Opsgenie
- [ ] Audit logs confirmed immutable
- [ ] Monitoring dashboard URLs documented

### Milestone: OBSERVABILITY_ACTIVE

---

## Phase 6: Security Hardening & Validation

**Duration:** 2–3 days
**Prerequisites:** Phase 4 complete
**Status:** Not Started

### Tasks

| # | Task | Depends On | Deliverable |
|---|------|------------|-------------|
| 6.1 | Generate 2048-bit RSA key pair for JWT signing | 3.16 | Keys in Secrets Manager |
| 6.2 | Verify JWT RS256 tokens are correctly signed and validated | 6.1 | Token validation pass |
| 6.3 | Verify CSRF double-submit token pattern blocks cross-origin mutations | 4.3 | CSRF blocks unauthorized POST |
| 6.4 | Verify XSS sanitization strips HTML from all inputs | 4.3 | `<script>` tags removed |
| 6.5 | Verify SQL injection defenses (Prisma parameterized queries) | 4.3 | No raw SQL injection |
| 6.6 | Verify rate limiting returns HTTP 429 with Retry-After header | 4.5 | Rate limit active |
| 6.7 | Verify CORS configuration matches staging origins | 4.5 | Only allowed origins pass |
| 6.8 | Verify TLS 1.2/1.3 on all external endpoints | 3.15 | `nmap --script ssl-enum-ciphers` |
| 6.9 | Verify CSP headers are set correctly | 4.5 | `curl -I` shows CSP |
| 6.10 | Run OWASP ZAP scan against staging API | 4.5 | No critical/high findings |
| 6.11 | Verify MFA TOTP enrollment and verification flow | 4.5 | MFA works end-to-end |
| 6.12 | Verify token refresh rotation and revocation | 4.5 | Old tokens rejected |
| 6.13 | Verify tenant isolation (cross-tenant access blocked) | 4.5 | Tenant A cannot see Tenant B data |
| 6.14 | Verify subscription gating (plan limits enforced) | 4.5 | HTTP 403 on limit breach |
| 6.15 | Verify backup and restore procedure | 3.20 | Backup restored successfully |

### Definition of Done

- [ ] RSA key pair in Secrets Manager
- [ ] JWT RS256 signing and validation verified
- [ ] CSRF protection blocks unauthorized mutations
- [ ] XSS sanitization strips all HTML payloads
- [ ] SQL injection defenses confirmed
- [ ] Rate limiting operational with Retry-After
- [ ] CORS configured for staging
- [ ] TLS 1.2/1.3 verified on all endpoints
- [ ] CSP headers present
- [ ] OWASP ZAP scan passes (no critical/high)
- [ ] MFA enrollment and verification works
- [ ] Token refresh rotation works
- [ ] Tenant isolation verified
- [ ] Subscription gating verified
- [ ] Backup and restore verified

### Milestone: SECURITY_HARDENED

---

## Phase 7: E2E Testing & Load Testing

**Duration:** 3–5 days
**Prerequisites:** Phase 5 and Phase 6 complete
**Status:** Not Started

### Tasks

| # | Task | Depends On | Deliverable |
|---|------|------------|-------------|
| 7.1 | Run Playwright E2E suite against staging | 4.5 | All 4 E2E tests pass |
| 7.2 | Test complete order lifecycle: QR scan → menu → cart → checkout → KDS → prepared → completed | 4.5 | Manual E2E pass |
| 7.3 | Test multi-branch scenario: Tenant A with 2 branches, separate KDS per branch | 4.5 | Branch isolation verified |
| 7.4 | Test concurrent orders: 10 simultaneous checkout requests | 4.5 | No race conditions |
| 7.5 | Test WebSocket reconnection: disconnect and reconnect KDS client | 4.5 | Reconnection successful |
| 7.6 | Test offline cashier PWA: go offline, place order, come back online, sync | 4.5 | Offline sync works |
| 7.7 | Run k6 load test: 100 concurrent users browsing menu | 4.5 | P99 < 500ms |
| 7.8 | Run k6 load test: 50 concurrent checkout requests | 4.5 | P99 < 2s, no errors |
| 7.9 | Run k6 load test: 20 concurrent KDS WebSocket connections | 4.5 | All connections stable |
| 7.10 | Run k6 soak test: 24-hour sustained load | 4.5 | No memory leaks |
| 7.11 | Profile database queries under load | 4.5 | No slow queries > 1s |
| 7.12 | Profile Redis memory usage under load | 4.5 | Memory stable |
| 7.13 | Test HPA scaling: trigger CPU > 70%, verify scale-out | 4.3 | Pods scale 2→10 |
| 7.14 | Test HPA scale-in: reduce load, verify scale-in | 4.3 | Pods scale back |
| 7.15 | Document performance baselines | 7.7–7.14 | Performance report |

### Definition of Done

- [ ] All Playwright E2E tests pass against staging
- [ ] Complete order lifecycle verified manually
- [ ] Multi-branch isolation verified
- [ ] 10 concurrent checkouts complete without errors
- [ ] WebSocket reconnection works
- [ ] Offline cashier sync works
- [ ] Load tests: 100 menu browsers, 50 checkouts, 20 KDS connections
- [ ] 24-hour soak test passes
- [ ] No database queries > 1s
- [ ] HPA scaling verified (scale-out and scale-in)
- [ ] Performance baselines documented

### Milestone: TESTED_AND_LOADED

---

## Phase 8: Beta Launch

**Duration:** 1 week
**Prerequisites:** Phase 7 complete
**Status:** Not Started

### Tasks

| # | Task | Depends On | Deliverable |
|---|------|------------|-------------|
| 8.1 | Configure production Stripe test webhook endpoint | 4.7 | Stripe test webhooks active |
| 8.2 | Enable real Stripe test keys (not secret key placeholders) | 2.1 | Stripe test mode live |
| 8.3 | Invite 3–5 pilot restaurants | 8.2 | Pilot restaurants onboarded |
| 8.4 | Onboard first restaurant: create tenant, add branches, configure menu | 8.3 | Restaurant A configured |
| 8.5 | Onboard second restaurant: create tenant, add branches, configure menu | 8.3 | Restaurant B configured |
| 8.6 | Onboard third restaurant: create tenant, add branches, configure menu | 8.3 | Restaurant C configured |
| 8.7 | Train restaurant staff on backoffice panel | 8.4 | Staff trained |
| 8.8 | Train restaurant staff on cashier PWA | 8.4 | Staff trained |
| 8.9 | Train kitchen staff on KDS | 8.4 | Staff trained |
| 8.10 | Monitor error rates and user feedback | 8.3 | Error rate < 0.1% |
| 8.11 | Collect pilot feedback (feature requests, bugs) | 8.3 | Feedback document |
| 8.12 | Fix critical bugs discovered during pilot | 8.11 | Bugs resolved |
| 8.13 | Update documentation based on pilot learnings | 8.11 | Docs updated |

### Definition of Done

- [ ] 3–5 pilot restaurants onboarded
- [ ] All staff trained on backoffice, cashier, and KDS
- [ ] Real order flow working end-to-end with Stripe test payments
- [ ] Error rate < 0.1%
- [ ] Pilot feedback collected and prioritized
- [ ] Critical bugs fixed
- [ ] Documentation updated

### Milestone: BETA_LAUNCHED

---

## Phase 9: Production Infrastructure

**Duration:** 3–5 days
**Prerequisites:** Phase 7 complete (can run in parallel with Phase 8)
**Status:** Not Started

### Tasks

| # | Task | Depends On | Deliverable |
|---|------|------------|-------------|
| 9.1 | Provision production RDS PostgreSQL 15 Multi-AZ | 3.1 | Production RDS running |
| 9.2 | Provision production ElastiCache Redis 7.2 | 3.1 | Production Redis running |
| 9.3 | Create production S3 bucket (`zayjar-assets-production`) | 3.1 | S3 bucket created |
| 9.4 | Create production CloudFront distribution | 9.3 | CDN distribution created |
| 9.5 | Provision production ECS/EKS cluster | 3.1 | Cluster running |
| 9.6 | Configure production Route 53 records (`*.zayjar.com`) | 3.13 | DNS records created |
| 9.7 | Request production SSL certificates | 9.6 | SSL certs issued |
| 9.8 | Create production AWS Secrets Manager secret | 3.16 | Secret created |
| 9.9 | Populate production secrets (all API keys, JWT keys, DB credentials) | 2.10, 9.8 | Secrets populated |
| 9.10 | Run Prisma migrations against production RDS | 9.1 | Schema deployed |
| 9.11 | Enable WAL archiving to S3 for production | 9.1 | PITR enabled |
| 9.12 | Configure production backups (daily/weekly/monthly) | 9.3 | Backup schedule active |
| 9.13 | Verify backup restore procedure on production | 9.12 | Restore tested |
| 9.14 | Deploy production Kubernetes manifests | 9.5, 4.3 | All pods running |
| 9.15 | Configure production NGINX Ingress with TLS | 9.7 | Ingress active |
| 9.16 | Configure production HPA (API 2–10, Worker 2–6) | 9.14 | Autoscaling active |
| 9.17 | Configure production PDB (API) | 9.14 | Disruption budget active |
| 9.18 | Verify production health endpoint | 9.14 | `curl api.zayjar.com/health` |
| 9.19 | Enable production CloudWatch alarms | 9.14 | Alarms active |
| 9.20 | Enable production Datadog APM | 9.14 | APM traces visible |

### Definition of Done

- [ ] Production RDS Multi-AZ running
- [ ] Production ElastiCache running
- [ ] Production S3 bucket created
- [ ] Production CloudFront distribution active
- [ ] Production cluster running (ECS or EKS)
- [ ] Production DNS configured (`*.zayjar.com`)
- [ ] Production SSL certificates valid
- [ ] Production secrets populated
- [ ] Database schema deployed and seeded
- [ ] WAL archiving enabled
- [ ] Backups scheduled and verified
- [ ] All pods running in production
- [ ] Ingress with TLS active
- [ ] HPA scaling active
- [ ] PDB active
- [ ] Health endpoint responsive
- [ ] CloudWatch alarms active
- [ ] Datadog APM active

### Milestone: PRODUCTION_INFRA_READY

---

## Phase 10: Production Launch

**Duration:** 1–2 days
**Prerequisites:** Phase 8 and Phase 9 complete
**Status:** Not Started

### Tasks

| # | Task | Depends On | Deliverable |
|---|------|------------|-------------|
| 10.1 | Switch Stripe to production keys (live mode) | 9.9 | Stripe live mode active |
| 10.2 | Configure production Stripe webhook endpoint | 10.1 | Webhook delivering events |
| 10.3 | Verify Stripe checkout session creation in live mode | 10.2 | Live checkout works |
| 10.4 | Verify email delivery in production (SendGrid production mode) | 9.14 | Production emails working |
| 10.5 | Verify SMS delivery in production (Twilio production mode) | 9.14 | Production SMS working |
| 10.6 | Verify FCM push notifications in production | 9.14 | Production push working |
| 10.7 | Run full E2E test suite against production | 10.1 | All tests pass |
| 10.8 | Run smoke test: create tenant → add menu → place order → checkout → verify in Stripe dashboard | 10.1 | End-to-end live test |
| 10.9 | Monitor error rates for 1 hour post-launch | 10.8 | Error rate < 0.01% |
| 10.10 | Monitor latency for 1 hour post-launch | 10.8 | P99 < 1s |
| 10.11 | Monitor resource utilization for 1 hour post-launch | 10.8 | CPU < 70%, Memory < 80% |
| 10.12 | Announce launch (internal team notification) | 10.8 | Launch announced |

### Definition of Done

- [ ] Stripe production keys active
- [ ] Production webhook endpoint delivering events
- [ ] Live checkout flow works end-to-end
- [ ] All notification channels working in production
- [ ] Full E2E test suite passes against production
- [ ] Smoke test: tenant → menu → order → checkout → Stripe verified
- [ ] Error rate < 0.01% for 1 hour post-launch
- [ ] P99 latency < 1s for 1 hour post-launch
- [ ] Resource utilization stable
- [ ] Launch announced

### Milestone: PRODUCTION_LAUNCHED

---

## Phase 11: Regional Payment Gateways (§8.3)

**Duration:** 2–4 weeks (dependent on vendor onboarding)
**Prerequisites:** Phase 10 complete, Tap/PayTabs vendor credentials received
**Status:** Blocked on external vendor

### Tasks

| # | Task | Depends On | Deliverable |
|---|------|------------|-------------|
| 11.1 | Complete Tap Payments vendor onboarding (Kuwait, Mada) | Vendor credentials | Vendor account active |
| 11.2 | Obtain Tap Payments sandbox API credentials | 11.1 | Sandbox keys received |
| 11.3 | Test KNET payment flow in Tap sandbox | 11.2 | Sandbox KNET test passes |
| 11.4 | Test Mada payment flow in Tap sandbox | 11.2 | Sandbox Mada test passes |
| 11.5 | Request Tap Payments production credentials | 11.3, 11.4 | Production keys received |
| 11.6 | Complete PayTabs vendor onboarding (Bahrain) | Vendor credentials | Vendor account active |
| 11.7 | Obtain PayTabs sandbox API credentials | 11.6 | Sandbox keys received |
| 11.8 | Test Benefit payment flow in PayTabs sandbox | 11.7 | Sandbox Benefit test passes |
| 11.9 | Request PayTabs production credentials | 11.8 | Production keys received |
| 11.10 | Replace stub implementations with real Tap/PayTabs SDK integration | 11.5, 11.9 | Real payment flow implemented |
| 11.11 | Test KNET/Mada/Benefit in production (micro-transactions) | 11.10 | Production payments verified |
| 11.12 | Enable regional wallets in production | 11.11 | All payment methods live |

### Definition of Done

- [ ] Tap Payments vendor onboarding complete
- [ ] PayTabs vendor onboarding complete
- [ ] KNET, Mada, Benefit tested in sandbox
- [ ] Real Tap/PayTabs SDK integration replacing stubs
- [ ] KNET, Mada, Benefit tested in production (micro-transactions)
- [ §8.3 fully implemented and live

### Milestone: REGIONAL_PAYMENTS_LIVE

---

## Phase 12: Production Hardening & Compliance

**Duration:** 1–2 weeks (can run in parallel with Phase 11)
**Prerequisites:** Phase 10 complete
**Status:** Not Started

### Tasks

| # | Task | Depends On | Deliverable |
|---|------|------------|-------------|
| 12.1 | Run full OWASP ZAP scan against production | 10.1 | No critical/high findings |
| 12.2 | Conduct production security audit (penetration testing) | 10.1 | Audit report clean |
| 12.3 | Verify data retention cron jobs (session_logs 30d, notifications 90d) | 10.1 | Cron jobs running |
| 12.4 | Verify audit log WORM storage archival | 10.1 | Audit logs archived |
| 12.5 | Test disaster recovery: RDS failover simulation | 10.1 | Failover < 30s |
| 12.6 | Test disaster recovery: restore from WAL backup | 10.1 | Restore successful, RPO < 5min |
| 12.7 | Verify GDPR erasure engine (customer data deletion) | 10.1 | Erasure works with fiscal retention |
| 12.8 | Verify ZATCA invoice compliance (Saudi Arabia) | 10.1 | UBL 2.1 XML + TLV QR code |
| 12.9 | Verify data retention policy (session_logs 30d, notifications 90d) | 10.1 | Retention cron verified |
| 12.10 | Document production runbooks (DB failover, cache desync, webhook backlog) | 10.1 | Runbooks written |
| 12.11 | Document incident response procedures | 12.10 | Incident playbook |
| 12.12 | Train operations team on runbooks | 12.11 | Team trained |
| 12.13 | Conduct tabletop disaster recovery exercise | 12.11 | Exercise completed |

### Definition of Done

- [ ] OWASP ZAP scan passes (no critical/high)
- [ ] Penetration test report clean
- [ ] Data retention cron jobs running
- [ ] Audit logs archived to WORM storage
- [ ] RDS failover test passed (< 30s)
- [ ] WAL restore test passed (RPO < 5min)
- [ ] GDPR erasure verified with fiscal retention
- [ ] ZATCA invoice compliance verified
- [ ] Production runbooks documented
- [ ] Incident response procedures documented
- [ ] Operations team trained
- [ ] Tabletop DR exercise completed

### Milestone: PRODUCTION_HARDENED

---

## Dependency Graph

```
Phase 1 (Local Validation)
    |
    v
Phase 2 (Third-Party Accounts) ──────┐
    |                                  |
    v                                  v
Phase 3 (Staging Infra)          Phase 9 (Production Infra)
    |                                  |
    v                                  v
Phase 4 (Staging Deploy)         Phase 10 (Production Launch)
    |                                  |
    +──────────────┬───────────────────┘
                   |
        Phase 5 (Monitoring)
        Phase 6 (Security)
                   |
                   v
           Phase 7 (E2E & Load)
                   |
        ┌──────────┴──────────┐
        v                     v
  Phase 8 (Beta)     Phase 12 (Hardening)
        |                     |
        v                     v
  Phase 10 (Launch)   Phase 11 (Regional Payments)
```

---

## Milestone Summary

| # | Milestone | Phase | Description |
|---|-----------|-------|-------------|
| 1 | `LOCAL_VALIDATED` | 1 | All services running locally, full order flow works |
| 2 | `THIRD_PARTY_READY` | 2 | All vendor accounts created and configured |
| 3 | `STAGING_INFRA_READY` | 3 | AWS staging infrastructure provisioned |
| 4 | `STAGING_DEPLOYED` | 4 | Application deployed to staging, all endpoints verified |
| 5 | `OBSERVABILITY_ACTIVE` | 5 | Logging, monitoring, alerting operational |
| 6 | `SECURITY_HARDENED` | 6 | All security controls verified |
| 7 | `TESTED_AND_LOADED` | 7 | E2E and load tests pass, performance baselines set |
| 8 | `BETA_LAUNCHED` | 8 | Pilot restaurants onboarded, real-world testing underway |
| 9 | `PRODUCTION_INFRA_READY` | 9 | Production infrastructure provisioned and verified |
| 10 | `PRODUCTION_LAUNCHED` | 10 | Live in production with real payments |
| 11 | `REGIONAL_PAYMENTS_LIVE` | 11 | KNET, Mada, Benefit fully operational |
| 12 | `PRODUCTION_HARDENED` | 12 | Security audit passed, DR tested, compliance verified |

---

## Timeline Summary

| Phase | Duration | Cumulative | Milestone |
|-------|----------|------------|-----------|
| 1. Local Validation | 2–3 days | Day 3 | `LOCAL_VALIDATED` |
| 2. Third-Party Accounts | 1–2 weeks | Week 2 | `THIRD_PARTY_READY` |
| 3. Staging Infrastructure | 3–5 days | Week 3 | `STAGING_INFRA_READY` |
| 4. Staging Deployment | 2–3 days | Week 3 | `STAGING_DEPLOYED` |
| 5. Monitoring & Observability | 2–3 days | Week 4 | `OBSERVABILITY_ACTIVE` |
| 6. Security Hardening | 2–3 days | Week 4 | `SECURITY_HARDENED` |
| 7. E2E & Load Testing | 3–5 days | Week 5 | `TESTED_AND_LOADED` |
| 8. Beta Launch | 1 week | Week 6 | `BETA_LAUNCHED` |
| 9. Production Infrastructure | 3–5 days | Week 6 | `PRODUCTION_INFRA_READY` |
| 10. Production Launch | 1–2 days | Week 6 | `PRODUCTION_LAUNCHED` |
| 11. Regional Payments | 2–4 weeks | Week 10 | `REGIONAL_PAYMENTS_LIVE` |
| 12. Production Hardening | 1–2 weeks | Week 8 | `PRODUCTION_HARDENED` |

**Estimated timeline to production launch: 6 weeks**
**Estimated timeline to full completion (including regional payments): 10 weeks**

---

## Risk Register

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Tap/PayTabs vendor onboarding delayed | KNET/Benefit/Mada unavailable at launch | High | Launch without regional gateways; Apple Pay/Google Pay fully functional |
| AWS infrastructure provisioning delays | Cannot deploy to staging | Medium | Use Docker Compose for local testing; escalate AWS support |
| Load testing reveals performance issues | P99 latency exceeds targets | Medium | Profile early; optimize hot-path queries; scale infrastructure |
| Security audit reveals vulnerabilities | Launch blocked | Low | OWASP ZAP scan in Phase 6; fix before production |
| Pilot restaurants report critical bugs | Beta launch delayed | Medium | Rapid bug fix cycle; maintain rollback capability |
| RDS failover takes longer than 30s | Production outage | Low | Test failover in Phase 12; RDS Multi-AZ with automatic failover |
| WebSocket connections overwhelm server | KDS becomes unresponsive | Low | Load test KDS in Phase 7; scale WebSocket workers independently |
| Data retention cron fails silently | Data accumulates beyond policy | Low | Monitor cron job status; alert on failure |

---

## Outstanding Items

| Item | Phase | Blocked By | Notes |
|------|-------|------------|-------|
| §8.3 KNET/Benefit/Mada | 11 | Tap/PayTabs vendor credentials | Engineering complete, stub wired in |
| Production SSL certificate | 9 | Phase 3 (DNS) | cert-manager + Let's Encrypt |
| AWS infrastructure | 3 | AWS account | RDS, ElastiCache, S3, CloudFront, ECS |
| DNS configuration | 3 | Route 53 | `*.zayjar.com` subdomains |
| Stripe live keys | 10 | Stripe business verification | Production mode |
| Load testing baselines | 7 | Phase 4 (staging) | k6 or Artillery |
| Penetration testing | 12 | Phase 10 (production) | Third-party or internal security team |
| ZATCA invoice compliance | 12 | Phase 10 (production) | Saudi Arabia e-invoicing |
| GDPR erasure engine | 12 | Phase 10 (production) | Customer data deletion with fiscal retention |
| Operational runbooks | 12 | Phase 10 (production) | DB failover, cache desync, webhook backlog |

---

## Acceptance Criteria Summary

### MVP Acceptance Criteria
1. All 445 unit/integration tests pass
2. Docker Compose brings up all 8 services
3. Full order lifecycle works locally (menu → order → KDS → checkout)
4. All 3 frontend apps load and communicate with API
5. WebSocket real-time updates functional
6. Health endpoint returns 200

### Beta Acceptance Criteria
1. All MVP criteria met
2. Deployed to Kubernetes staging cluster
3. Stripe test mode with real webhook endpoints
4. SSL certificates valid
5. DNS configured for staging subdomains
6. 3–5 pilot restaurants onboarded
7. All staff trained on backoffice, cashier, and KDS
8. Error rate < 0.1%

### Production Acceptance Criteria
1. All Beta criteria met
2. Production AWS infrastructure provisioned (RDS Multi-AZ, ElastiCache, S3, CloudFront)
3. Production DNS configured (`*.zayjar.com`)
4. Production SSL certificates valid
5. Stripe live mode active
6. All notification channels working in production
7. Full E2E test suite passes against production
8. Smoke test: tenant → menu → order → checkout → Stripe verified
9. Error rate < 0.01% for 1 hour post-launch
10. P99 latency < 1s for 1 hour post-launch
11. Datadog APM traces visible
12. CloudWatch alarms active
13. Backup and restore verified (RPO < 5min, RTO < 30min)

### Full Completion Acceptance Criteria
1. All Production criteria met
2. KNET, Mada, Benefit operational via Tap/PayTabs
3. OWASP ZAP scan passes (no critical/high)
4. Penetration test report clean
5. Data retention cron jobs running
6. Audit logs archived to WORM storage
7. RDS failover test passed (< 30s)
8. WAL restore test passed (RPO < 5min)
9. GDPR erasure verified with fiscal retention
10. ZATCA invoice compliance verified
11. Production runbooks documented
12. Operations team trained
13. Tabletop DR exercise completed

---

*End of IMPLEMENTATION_ROADMAP.md*
