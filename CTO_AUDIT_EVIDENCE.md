# CTO AUDIT — EVIDENCE DOSSIER

**Commit:** `0f663ed` · **Date:** 2026-08-03 · **Files modified:** 0 · **Commits:** 0 · **Pushes:** 0
**PROJECT_STATE.md diff:** empty (untouched)

Every finding below is proven with exact path, verbatim code, and — for absence claims — an exhaustive repository-wide search. **Three findings were disproven or materially downgraded by this exercise and are retracted in §A.**

---

# §A. RETRACTIONS AND CORRECTIONS (evidence contradicted my audit)

## A.1 — AUDIT-003 DOWNGRADED: Critical → Low. **Not an auth bypass.**

I claimed the mock-user fallback was an authentication bypass. **The evidence disproves exploitability.**

**File:** `apps/api/src/auth/auth.service.ts`

The fallback fabricates `passwordHash: 'mock-hash'` (line 456), but execution continues to the password check:

```
481:    // Verify password
482:    const isPasswordValid = await this.comparePassword(password, user.passwordHash);
483:    if (!isPasswordValid) {
484:      throw new UnauthorizedException('Invalid credentials');
485:    }
```

`comparePassword` (line 72-79) calls `argon2.verify(hash, password)` and returns `false` on throw. **Executed live against the real argon2 binding:**

```
argon2.verify('mock-hash', 'anything')
→ THREW: pchstr must contain a $ as first char
→ comparePassword catch → returns false → 401 Unauthorized
```

**Additional gate:** `main.ts:9-20` hard-exits when `DATABASE_URL` is missing in production:
```
if (process.env.NODE_ENV === 'production') { logger.error('FATAL: Missing required environment variables...'); process.exit(1); }
```
The branch requires `!process.env.DATABASE_URL`, which cannot occur in a running production pod.

**Corrected finding:** dead-but-untidy test scaffolding in production source. **Severity: Low (code hygiene).** My "P0 authentication bypass" claim was **wrong** and I withdraw it. It should still be deleted, but it does not block launch and must not displace real P0 work.

## A.2 — AUDIT-013 RECLASSIFIED: Website Builder is not a defect; it is **out of scope**.

I listed "Website Builder" as MISSING. Correct as fact, wrong as criticism — **it appears in no specification document**:

```
grep -rniE "website builder|site builder|public website|landing page" DOC-*.md SPEC_INDEX.md IMPLEMENTATION_ROADMAP.md
→ (no matches)
```
```
grep -niE "model.*(Website|Page|Theme|Site|Content)" packages/db/prisma/schema.prisma
→ (no matches)
```

The item came from the audit checklist supplied to me, not from the project's own scope. **Engineering built what was specified.** Reclassified: *Not Specified — requires CTO product decision before it can be called a gap.* The same applies to **AUDIT-018 (Public Restaurant Website)**.

## A.3 — AUDIT-013 (Domain/TLS) PARTIALLY CORRECTED: TLS provisioning **does** exist.

I wrote "no TLS provisioning." **Incorrect.** `k8s/ingress.yml`:
```
15:    cert-manager.io/cluster-issuer: "letsencrypt-prod"
18:  tls:
19:    - hosts:
20:        - api.zayjar.com
21:        - qr.zayjar.com
22:        - backoffice.zayjar.com
23:        - cashier.zayjar.com
24:      secretName: zayjar-tls
```
cert-manager + Let's Encrypt are configured. **The accurate finding is narrower:** TLS is provisioned for **four static platform hosts only**. There is no mechanism to add a tenant's custom domain to that list, and no DNS ownership verification:
```
grep -rniE "dns\.|resolveTxt|acme|domainVerif|verifyDomain|txtRecord|cname" apps packages --include="*.ts"
→ (no matches)
```
**Corrected finding:** `customDomain` is a stored string with no ownership proof and no path to a certificate. Still a real gap; my original wording overstated it.

## A.4 — AUDIT-024 CORRECTED: repositories are not untested.

I wrote "0 db package tests" and implied the isolation layer is untested. The first half is literally true:
```
find packages/db -name "*.spec.ts" → (none)
```
But `apps/api/src/common/repositories.spec.ts` exists and contains 4 tests exercising the tenant repositories. **Corrected finding:** coverage is thin and located in the wrong package, not absent. Severity reduced.

---

# §B. FINDINGS PROVEN — P0 (block launch)

## B.1 — AUDIT-001: No CSS exists. The entire UI is unstyled. **PROVEN**

Four independent exhaustive searches, all empty:

**1. No stylesheet of any kind in the repository:**
```
find . -path ./node_modules -prune -o -type f \( -name "*.css" -o -name "*.scss" -o -name "*.sass" -o -name "*.less" \) -print
→ (no results)
```
**2. No Tailwind/PostCSS configuration:**
```
find . -path ./node_modules -prune -o -type f \( -name "tailwind.config*" -o -name "postcss.config*" \) -print
→ (no results)
```
**3. No CSS framework in ANY package.json:**
```
grep -rn "tailwind\|radix\|@emotion\|styled-components\|bootstrap\|@mui\|chakra" --include="package.json" .
→ (no results)
```
**4. No stylesheet import in any source file:**
```
grep -rnE "import.*\.css|import.*\.scss|require\(.*\.css" apps packages --include="*.ts" --include="*.tsx"
→ (no results)
```

**Yet 308 Tailwind class attributes are in use** — backoffice 192, cashier 41, qr-menu 75. Verbatim, `apps/qr-menu/src/app/components/MenuBrowser.tsx`:
```
186:      <div className="w-full max-w-md mx-auto bg-gray-50 min-h-screen pb-24 px-4 pt-16 text-center">
187:        <div className="bg-white rounded-2xl shadow-sm p-6">
189:          <h2 className="text-lg font-bold text-gray-900 mb-1">Order received</h2>
```

**Build artifact confirms it:** `apps/qr-menu/.next/static/css` does not exist after a successful production build — **no stylesheet is emitted**.

**All three `layout.tsx` files, verbatim** — none imports CSS, none sets viewport:
```tsx
// apps/backoffice/src/app/layout.tsx  AND  apps/qr-menu/src/app/layout.tsx (identical)
import React from 'react';
export default function RootLayout({ children }: { children: React.ReactNode }): React.ReactNode {
  return (<html lang="en"><body>{children}</body></html>);
}
```

**Why this proves the issue:** `className` strings are inert without a stylesheet. The customer QR page, POS, and admin panel render as unstyled HTML. This is a P0 product defect, not the "Low" documentation drift recorded in PROJECT_STATE §7.

## B.2 — AUDIT-002: Payment verification bypass + Tap mocked with a live key. **PROVEN**

**File:** `apps/api/src/payment/wallet.service.ts`

**(a) `verifyPayment` ignores its input and always returns success — verbatim, lines 259-277:**
```ts
  async verifyPayment(paymentId: string, tenantId: string): Promise<{...}> {
    // In real implementation, would query Stripe or Tap API to verify status
    // For mock, return succeeded
    this.logger.log(`Verifying wallet payment [${paymentId}] for tenant [${tenantId}]`);

    // Try to find associated order via payment record (mock)
    // In real, would query payment table
    return {
      paymentId,
      status: 'succeeded',
      verified: true,
      tenantId,
    };
  }
```
`paymentId` is used only for logging. No provider call, no DB read. **Any string returns `verified: true`.**

**(b) Reachable over HTTP** — `apps/api/src/payment/payment.controller.ts:45-57`, authenticated but otherwise unguarded:
```ts
  @Get('wallet/:paymentId/verify')
  async verifyPayment(@Param('paymentId') paymentId: string, @Req() req: AuthenticatedRequest) {
    ...
    return this.walletService.verifyPayment(paymentId, user.tenantId);
  }
```

**(c) Tap Payments returns a fabricated charge even when the key IS configured** — lines 209-223. Note the `if (!tapSecretKey)` mock at 189 is the *unconfigured* path; this is the *configured* path:
```ts
    try {
      // Real Tap Payments integration would use axios to call Tap API
      // For this implementation, we mock success for test/dev
      const mockChargeId = `chg_${walletType}_${Math.random().toString(36).substring(2, 15)}`;
      return {
        paymentId: mockChargeId,
        provider,
        status: 'initiated',
        redirectUrl: `https://api.tap.company/v2/charges/${mockChargeId}`,
        ...
```
KNET/Benefit/Mada — the primary Gulf payment rails — never contact Tap.

**(d) Contrast — Stripe wallet IS real** (lines 132-160), so this is a genuine per-provider defect, not a blanket claim:
```ts
      const Stripe = require('stripe');
      const stripe = new Stripe(stripeSecretKey, { apiVersion: '2023-10-16' });
      const paymentIntent = await stripe.paymentIntents.create({ ... });
```

## B.3 — AUDIT-016: The `Payment` table is never written by application code. **PROVEN**

Exhaustive search across `apps/` and `packages/` (excluding generated client and dist):
```
grep -rnE "payment\.(create|update|upsert)|prisma\.payment|tx\.payment|PaymentRepository" --include="*.ts" apps packages
→ packages/db/prisma/seed.ts:17   await prisma.payment.deleteMany();
→ packages/db/prisma/seed.ts:998  await prisma.payment.create({ ... });
→ (all remaining hits are generated-client type definitions)
```
**The only writer is the seed script.** No `TenantPaymentRepository` exists — confirmed against the full repository listing (18 repositories: Branch, Category, Customer, DeviceToken, Invoice, KitchenQueue, Notification, OrderItem, Order, ProductAddon, Product, ProductSize, Restaurant, Table, User, Webhook, Base, index — **no Payment**).

The model is fully specified (`schema.prisma:582-599`) with `status`, `amount`, `transactionReference`, `completedAt`. **No revenue ledger, no reconciliation, no refund trail exists.**

## B.4 — AUDIT-004: No user management. Staff cannot be created. **PROVEN**

**Total HTTP route decorators in the entire API: 51.** Of those:
```
grep -rn "@Controller('.*user\|@Get('user\|@Post('user\|@Get('staff\|@Post('staff\|@Post('invite\|@Post('members" apps/api/src
→ (no results)
```

Exhaustive search for user writes anywhere in application code:
```
grep -rnE "user\.create|user\.update|user\.delete|createUser|inviteUser|userRole\.create|assignRole" apps/api/src packages/db/src
→ apps/api/src/auth/auth.service.ts:277   prisma.user.update  → data: { mfaSecret: secret }
→ apps/api/src/auth/auth.service.ts:282   prisma.user.update  → data: { mfaSecret: secret }
→ apps/api/src/auth/auth.service.ts:355   prisma.user.update  → data: { mfaEnabled: true }
→ apps/api/src/tenant/tenant.service.ts:127  tx.user.create    → onboarding owner ONLY
→ apps/api/src/tenant/tenant.service.ts:146  tx.userRole.create → onboarding owner ONLY
```
All three `user.update` calls are **MFA-only** (verified by reading each `data:` block). The sole `user.create` is inside the onboarding transaction:
```ts
      // C. Register default Restaurant Owner user account
      const owner = await tx.user.create({
        data: { tenantId: tenant.id, firstName: dto.ownerFirstName, ..., passwordHash: hashedPassword },
      });
```
**Consequence:** exactly one user can ever exist per tenant. The Cashier and KDS apps — whose login screens were delivered in Sprint 2 Task 1 — have no users to authenticate.

## B.5 — AUDIT-005: No password reset, no email verification. **PROVEN**

Exhaustive repository search:
```
grep -rniE "forgot.?password|reset.?password|verify.?email|resetToken|verificationToken" apps packages --include="*.ts" --include="*.tsx" --include="*.prisma"
→ apps/api/src/notification/email/email.service.ts:53   'password-reset' template
→ apps/api/src/notification/email/email.service.ts:153  'password-reset' subject
→ apps/api/src/notification/email/email.service.ts:224  async sendPasswordResetEmail(...)
→ apps/api/src/tenant/tenant.service.ts:90              // Verify email availability (unrelated)
```

**`sendPasswordResetEmail()` is fully implemented and never called:**
```
grep -rn "sendPasswordResetEmail" apps packages | grep -v email.service
→ (no results — dead code)
```

**Schema confirms no token storage** — `User` model (`schema.prisma:187-211`) contains `passwordHash`, `mfaSecret`, `mfaEnabled`, `lastLoginAt` — **no `resetToken`, no `resetTokenExpiry`, no `emailVerified`**. A migration is required.

## B.6 — AUDIT-006 / AUDIT-007: Menu/branch data is create-only. **PROVEN**

**Every mutating route in the entire API — complete list, 6 total:**
```
grep -rnE "@(Put|Patch|Delete)\(" apps/api/src --include="*.ts" | grep -v spec
→ device-token.controller.ts:54   @Delete(':id')
→ kds.controller.ts:54            @Put('items/:orderItemId/status')
→ media.controller.ts:70          @Delete(':id')
→ order.controller.ts:42          @Put(':id/status')
→ tenant.controller.ts:61         @Put(':id')
→ webhook.controller.ts:54        @Delete(':id')
```
**No PUT/PATCH/DELETE exists for Product, Category, ProductSize, ProductAddon, AddonItem, Branch, Table, Restaurant, Discount, User, or Invoice.**

`menu.controller.ts` in full — 7 routes, all create-or-read:
```
16: @Post('categories')   22: @Get('categories')
29: @Post('products')     36: @Get('products')
43: @Post('sizes')        53: @Post('addons')     64: @Post('addon-items')
```
`branch.controller.ts` in full — 4 routes:
```
15: @Post('branches')  22: @Get('branches')  28: @Post('tables')  34: @Get('tables')
```
**A mistyped price is permanent. A discontinued dish cannot be removed.**

---

# §C. FINDINGS PROVEN — P1/P2

## C.1 — AUDIT-009: Discounts have no management API. **PROVEN**
```
find apps/api/src -ipath "*discount*" ! -name "*.spec.ts"  → discount.service.ts   (service only, no controller)
grep -rn "discount" apps/api/src --include="*.controller.ts"  → (no results)
```
Writes outside the seed:
```
apps/api/src/order/order.service.ts:272  await tx.discount.update({...})   ← usage-count increment only
packages/db/prisma/seed.ts:1136, 1148    await prisma.discount.create({...})
```
**Discount codes can only be created by re-seeding the database.**

## C.2 — AUDIT-010: Invoices are generated but unreachable. **PROVEN**
```
find apps/api/src -ipath "*invoice*"  → invoice-pdf.service.ts, invoice-storage.service.ts, invoice.module.ts
grep -rn "invoice" apps/api/src --include="*.controller.ts"  → (no results)
grep -rn "TenantInvoiceRepository" apps/api/src  → order.service.ts:12, :37  (internal use only)
```
Real PDFs are rendered and stored; **no endpoint lists, downloads, or resends them.** Output is write-only.

## C.3 — AUDIT-011: Zero API documentation. **PROVEN**
```
grep -rn "swagger\|Swagger\|OpenAPI\|ApiProperty\|ApiOperation\|ApiTags" apps packages --include="*.ts" --include="*.json"
→ (no results)
find . -iname "*openapi*" -o -iname "*swagger*"  → (no results)
```
DOC-003 documents 23 endpoints; **51 route decorators exist.**

## C.4 — AUDIT-020: No Helmet. **PROVEN**
```
grep -rn "helmet" --include="package.json" .   → (no results)
grep -rn "helmet" apps/api/src --include="*.ts"  → (no results)
```
`main.ts` registers: express.json, ValidationPipe, CORS, static assets, shutdown hooks — **no security headers**. nginx.conf sets them (lines 61-65) but only for traffic through that ingress.

**Additional finding, same file (`main.ts:66-68`)** — CORS defaults to fully open when unset:
```ts
    app.enableCors({ origin: '*', methods: [...] });
    logger.warn('CORS_ORIGIN not set — allowing all origins (development mode only)');
```
This is a warning, not a production hard-fail (unlike the env check at line 15).

## C.5 — AUDIT-012: E2E tests are mocked and absent from CI. **PROVEN**

CI jobs — complete list from `.github/workflows/ci.yml`: `code-quality`, `test`, `build`, `docker`. No playwright/`test:e2e` reference anywhere in the file.

`tests/e2e/fixtures/api-mocks.ts` intercepts every endpoint:
```ts
82:  page.route(`**/api/v1/tenants/*`, ...route.fulfill(jsonOk(tenant)));
94:  page.route('**/api/v1/menu/products', ...);
113: page.route('**/api/v1/orders/checkout', ...route.fulfill(jsonCreated(order)));
205: page.route('**/api/v1/kds/tickets**', ...);
```
`checkout.spec.ts:9-10` calls `mockAllCheckoutFlows(page, store)` before navigating. **These tests assert against fixtures and cannot detect a backend regression.**

## C.6 — AUDIT-014: Restaurant dashboard is read-only. **PROVEN**
```
grep -nE "useMutation|method:\s*'(POST|PUT|PATCH|DELETE)'|onSubmit|<form" apps/backoffice/src/app/components/AdminPanel.tsx
→ (no results)
```
298 lines, 4 read queries, zero writes. Hardcoded defaults, `apps/backoffice/src/app/page.tsx`:
```
17:  const [branchId, setBranchId] = useState('branch-uuid-1234');
18:  const [tenantId, setTenantId] = useState('tenant-uuid-1111');
```

## C.7 — AUDIT-015: Platform dashboard = 1 endpoint, 0 UI. **PROVEN**

`admin.controller.ts` in full contains exactly one route, `@Get('metrics')`; `admin.service.ts` exposes exactly one method, `getTenantsMetrics()`. Apps directory: `api`, `backoffice`, `cashier`, `qr-menu` — **no platform-owner frontend**. No tenant list, suspend, plan-override, or impersonation.

## C.8 — AUDIT-017: Subscription lifecycle incomplete. **PROVEN**
```
grep -rniE "cancelSubscription|upgradeSubscription|downgrade|billingPortal|proration|reactivate" apps/api/src
→ (no results)
```
`subscription.service.ts` exposes only 7 read/gate methods (`getActiveSubscription`, `checkSubscriptionStatus`, `checkBranchLimit`, `checkProductLimit`, `checkCustomDomainAllowed`, `checkOnlinePaymentsAllowed`, `checkAnalyticsAllowed`). **A merchant cannot change or cancel a plan.**

## C.9 — AUDIT-021: Unifonic SMS mocked with credentials present. **PROVEN**

`sms.service.ts:166-170` — the *configured* branch:
```ts
    try {
      // Mock Unifonic API call (real implementation would use axios POST to Unifonic)
      // For dev, simulate success
      const mockId = `unifonic-${Math.random().toString(36).substring(2, 10)}`;
      return { success: true, provider: 'unifonic', messageId: mockId };
```
Twilio (line 140-147) is genuinely implemented. **The Middle-East router is not.**

## C.10 — AUDIT-019: No viewport meta. **PROVEN**
No `viewport` export or `<meta name="viewport">` in any of the three `layout.tsx` files (all reproduced verbatim in §B.1). Only `cashier` has a `<head>`, containing manifest + theme-color only. Compounded by AUDIT-001, the mobile-first QR flow has no responsive foundation.

## C.11 — AUDIT-022: No notification API. **PROVEN**
```
find apps/api/src/notification -name "*.controller.ts"  → (no results)
```
`Notification` rows are persisted by the FCM mirror but cannot be listed, marked read, or configured.

## C.12 — AUDIT-023: No metrics endpoint. **PROVEN**
```
grep -rniE "prom-client|/metrics|prometheus" apps/api/src k8s
→ only admin.controller.ts:12 (a business-metrics REST route, not telemetry)
```
`health.controller.ts` in full returns `{status:'ok', timestamp, uptime}` — a static literal. **No dependency checks (DB/Redis), no readiness/liveness distinction**, while `k8s/api/hpa.yml` scales 2-10 pods.

---

# §D. REVISED SEVERITY LEDGER

| ID | Original | **Revised** | Basis for change |
|---|---|---|---|
| AUDIT-003 | P0 Critical | **Low** | Password check blocks it; prod hard-exits (§A.1) |
| AUDIT-013 Website Builder | P2 Missing | **Out of scope** | In no spec document (§A.2) |
| AUDIT-018 Public Website | P2 Missing | **Out of scope** | In no spec document (§A.2) |
| AUDIT-013 Domain/TLS | "no TLS" | **Narrowed** | cert-manager exists; static hosts only (§A.3) |
| AUDIT-024 | P2 | **Low** | 4 repo tests exist in api package (§A.4) |
| AUDIT-001 | P0 | **P0 confirmed** | 4 exhaustive searches empty; no CSS emitted |
| AUDIT-002 | P0 | **P0 confirmed** | Hardcoded `verified:true`; Tap mocked with key |
| AUDIT-004 | P0 | **P0 confirmed** | 51 routes, zero user management |
| AUDIT-005 | P0 | **P0 confirmed** | Dead sender; no schema fields |
| AUDIT-006/007 | P1 | **P1 confirmed** | Only 6 mutating routes platform-wide |

**Production readiness: unchanged at ≈55%.** Removing AUDIT-003 from P0 is offset by AUDIT-002 proving *worse* than reported (Tap mocked even when configured).

**Revised P0 set (4 items):** AUDIT-001 (CSS) · AUDIT-002 (payments) · AUDIT-004 (users) · AUDIT-005 (password reset).

---

# §E. RECOMMENDED FIRST INCREMENT (awaiting approval — nothing implemented)

If you approve work, I recommend **AUDIT-004 + AUDIT-005 together** as the first commit:
- They share a dependency (invite/reset both need tokens + EmailService, which is already real).
- They unblock every other workflow — without users, no staff app is testable.
- They are backend-only, so they are provable by the existing gate discipline (tsc/lint/suites/runtime) without touching the unstyled UI.

I would sequence AUDIT-002 second (financial integrity), AUDIT-001 third (CSS, before any dashboard work so UI is built once).

**Standing by for CTO approval. No file has been modified, no commit created, no push performed.**
