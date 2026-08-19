# Phase 4 — Customer Experience & Retention Scope

Status: **IN PROGRESS — Phase 4 P0 complete; P1 restaurant website follow-ups complete.**

This document records the full approved Phase 4 scope: the staff/cashier P0 work, the restaurant-experience P1 work, the Eleva brand/marketing P2 work, the printing P3 work, and the customer/retention requirements. Implementation status is marked per section; `PROJECT_STATE.md` remains the canonical engineering state and the only place where verification evidence is recorded.

Phase 4 preserves the existing project-state/roadmap requirements that remain applicable, while adding the approved customer-facing requirements below.

## Existing scope carried forward

- Complete the remaining product/merchant-facing items that are explicitly still applicable in `PROJECT_STATE.md` and approved before implementation.
- Preserve the platform's multi-tenant isolation, RBAC, CSRF, auditability, server-authoritative pricing/order totals, and existing DINE_IN / TAKE_AWAY ordering model.
- Regional payment expansion, delivery, and other architecture items remain separate decisions unless explicitly approved into this phase.

## Staff & cashier operations (P0) — ✅ COMPLETE (commits `bb68dd7`, `8b3f832`)

- Cashier branch isolation — cashier scope restricted to assigned branch(es) only. ✅
- Cashier orders/POS restricted to assigned branch(es). ✅
- KDS branch isolation. ✅
- One notification per new order. ✅
- Persistent new-order sound until acknowledged/opened/accepted/cancelled. ✅
- Clearly audible configurable notification volume (persisted per device). ✅
- RBAC boundaries between cashier / branch manager / restaurant owner / platform owner; permission vocabulary matches CASL actions/subjects. ✅
- `user_branches` is real and verified — staff JWTs carry only assigned branches. ✅
- Seeded cashier/staff accounts work with real Argon2id hashes. ✅
- Platform Owner remains governed by canonical platform-level rules (no accidental restaurant-order visibility). ✅

## Restaurant experience — website & design (P1) — ✅ COMPLETE

- The restaurant public website is a restaurant website, not a generic Pages CMS.
- **Token-free public restaurant website** (browsable at the tenant subdomain without a QR table token). ✅ `GET /api/v1/public/site` + qr-menu `/` no-token branch (commit pending).
- Categories visible on the restaurant website. ✅
- Clicking a category filters/displays its products. ✅
- Real social/contact links (phone, WhatsApp, Instagram, X) from tenant branding. ✅
- Mobile-first responsive design. ✅
- Branding-aware colors (tenant primary/secondary) and logo. ✅
- Real category images (uploaded photographs) instead of emoji/placeholder fallbacks. ✅ Category gained `imageUrl` (migration `20260818000000_add_category_image_url`), create/update/clear via the menu API, exposed in the public site + QR menu, and rendered by the restaurant website with a clean placeholder fallback.
- Proper Media Library. ✅ Design Builder logo/cover pickers embed the existing Media Library (presigned upload + click-to-apply).
- IndexedDB for large demo/frontend media where appropriate. ✅ `site-media-store` persists uploaded website assets per tenant for the editor.
- About / Contact / Branches / Social content remains simple and restaurant-oriented. ✅ Public site sections + in-page nav; About from published design / tenant branding; branches from live `findMany`.
- Editing controls (website builder) scroll independently from the live preview/page. ✅ `design-controls` and `design-preview` each `lg:overflow-y-auto`.
- Live preview while editing. ✅ DesignBuilder draft preview (desktop/mobile).
- Dark / Light / Auto themes. ✅ RestaurantSite + DesignBuilder.
- Glassmorphism where it improves the design. ✅ sticky category nav `backdrop-blur`.
- Logo/brand-aware color suggestions. ✅ sampled from tenant brand + logo pixels; apply as primary.
- Responsive layouts. ✅ (mobile-first grid + sticky category nav)
- Professional modern restaurant web design; not a generic CRUD-looking interface. ✅
- Additional visual polish only when it materially improves usability/hierarchy/accessibility/perceived quality; no decoration-only effects. ✅ in-page Menu/About/Branches/Contact nav.

## Eleva brand & marketing platform (P2) — ✅ COMPLETE (ELEVA Tower, commit pending)

**The ELEVA Tower IS the official ELEVA Brand & Marketing Platform** (per the approved P2 CTO directive — NOT a separate traditional marketing website).

- The Tower is simultaneously ELEVA's visual identity, public marketing website, brand experience, information architecture, public entry point, login gateway, and the transition into authenticated ELEVA offices. ✅
- **Exterior** — cinematic, architectural ELEVA tower facade with the ELEVA logo integrated; responds to time-of-day (morning/day/sunset/night: sun/moon/stars, sky gradients, illuminated windows at night). ✅
- **Dynamic environment** — time-of-day computed client-side; real weather fetched from Open-Meteo (Muscat coordinates) with graceful fallback to time-based visuals on failure; weather is purely cosmetic and never gates authorization/permissions/business logic. ✅
- **Reception** — the tower exterior transitions into a reception lobby with distinct architectural zones (About, What we do, How it works, Restaurant Websites, POS & Integrations, Arabic & English, Pricing, FAQ, Contact, Terms & Privacy); each zone is a visually distinct corner with its own styling. ✅
- **Elevator = login** — the visitor signs in inside an elevator experience (doors close → floor indicator animates → arrive). The server determines identity, role, restaurant, branch and permissions. The user is NEVER asked to choose a role. ✅
- **No role→floor disclosure** — the floor/role mapping is an internal implementation detail; never displayed publicly. The authenticated office shows only a descriptive label derived from the real session roles. ✅
- **Keep me logged in** — existing secure session mechanism: authenticated visitors skip the Tower UI and go straight to their office (server-side auth not bypassed). ✅
- **Authorized offices** — the authenticated dashboard (BackofficeShell) wears the premium office metaphor (header band, office label from real roles); all RBAC/permissions remain server-authoritative. ✅
- **Visual identity** — consistent ELEVA logo/typography/color system (orange→pink gradient accent, slate tower palette) across exterior, reception, elevator, and offices; restaurant branding stays logically separate. ✅
- **Arabic + English / LTR + RTL** — the Tower supports a bilingual toggle; `dir="rtl"` flips the experience; Arabic font stack applied. ✅
- **Responsive** — exterior/reception stack gracefully on mobile (no clip-path), sticky nav scrolls horizontally. ✅
- **Accessibility** — `prefers-reduced-motion` respected (global CSS kill-switch), keyboard-navigable buttons, meaningful labels, readable contrast. ✅
- **Performance** — no heavy 3D engine; CSS gradients/animations only; lazy environment updates. ✅
- **SEO** — title/description/OpenGraph in the backoffice layout; the exterior hero (ELEVA, tagline, CTAs) is semantic crawlable HTML, not an animation-only canvas. ✅
- **Architecture rule** — the Tower is a presentation layer; auth/RBAC/tenant isolation/subscriptions remain server-authoritative. ✅
- **Tests** — all Eleva Tower suites green (28 tests across 5 suites: ElevaTower, ElevaTowerExterior, ElevaReception, ElevaElevator, ElevaEnvironment); backoffice tsc 0 errors; production build succeeds (all routes generated); runtime `/`, `/eleva`, `/login` all HTTP 200 with the Tower/Elevator rendering.

## Printing & receipts (P3) — ✅ COMPLETE (commit pending)

- **Receipt Designer** — new backoffice "Receipts" tab (`ReceiptDesigner.tsx`): restaurant owner customizes the customer receipt (field visibility toggles, footer message, language EN/AR) with a **live preview** against the tenant's most recent **real order** (never mock data). Settings persist in the existing TenantDesign JSONB (`draft.receipt` → `published.receipt` on publish) via the existing draft/save/publish/version flow — no new tables or systems. ✅
- **Customer Receipt** — thermal-width (80 mm) printer-friendly rendering with restaurant name/logo (branding-aware), branch info, order number, date/time, items (name, qty, size, variant, add-ons), prices, subtotal/tax/discount/total (from the real order model), payment method, notes, and a configurable footer message. ✅
- **Kitchen Ticket** — separate kitchen-print format focused on order number, items, quantities, sizes, add-ons and order notes; **deliberately omits prices, totals and payment** (no unnecessary customer-facing information); independently printable. ✅
- **Printing** — browser/printer-safe HTML/CSS (shared `packages/receipts` with `PRINT_STYLES`: `@page size 80mm`, print-color-adjust, reliable page breaks); cashier opens a dedicated print window (`/receipt/:id?kind=customer|kitchen`) that fetches the server-assembled receipt and auto-prints. ✅
- **POS integration** — cashier order-detail modal gained "Print Receipt" + "Print Kitchen Ticket" buttons; printing uses the **real order data** via the new `GET /api/v1/orders/:id/receipt` endpoint (no mock orders/receipts). ✅
- **Permissions / tenant isolation** — the receipt endpoint is an authenticated staff surface with the same guards + `read Order` RBAC as the order routes; order lookup is tenant-scoped (no existence oracle); branch-scoped staff (P0) are restricted to their assigned branches server-side; platform owner capabilities intact. ✅
- **Design / branding** — reuses the existing TenantDesign JSONB + tenant branding (logo/primary color/currency); no duplicate branding systems. ✅
- **Arabic / English** — receipt language config with full RTL/LTR switching; Arabic labels for all static receipt chrome (order/date/total/payment/…); kitchen ticket respects the same direction. ✅
- **Architecture** — shared `@zayjar/receipts` package (types, config defaults/resolver, i18n, formatting, `CustomerReceipt`, `KitchenTicket`, print styles) consumed by both cashier and backoffice so receipt rendering is defined once. ✅
- **Tests** — 40 new tests green: receipts package 22/22, API `receipt.service.spec` 7/7 (incl. tenant scoping + branch isolation + config resolution), ReceiptDesigner 6/6, cashier print page 3/3, cashier print buttons 2/2. Backoffice tsc 0, cashier tsc 0 (new files), `next build` backoffice + cashier both succeed (cashier adds the `/receipt/[id]` route). Runtime: SSR render of the receipt/ticket verified (RTL, Arabic labels, no prices on kitchen ticket); dev servers boot and serve all routes HTTP 200. Root `jest.config.js` testMatch restored to `.spec.ts` (P1's `.tsx` widening made CI's node-env root test collect frontend specs that require jsdom — frontend specs run via their per-app configs).

## Customer account & profile — ✅ COMPLETE (commit pending)

- Guest checkout remains supported and unchanged (guest ordering without an account keeps working exactly as before). ✅
- Customer can optionally create an account (public `POST /api/v1/public/customers/register`) or sign in (`POST /api/v1/public/customers/login`) — registration is never mandatory. ✅
- Login/logout and a persistent customer session (signed customer JWT, 30-day expiry, reusing the existing JWT infrastructure; separate from staff auth). ✅
- Profile with the details the existing `Customer` model supports: first/last name, email, phone, loyalty points; editable name/phone via `PUT /api/v1/customer/me` (email immutable). ✅
- Order history (`GET /api/v1/customer/orders`) — only the customer's own orders, linked at checkout when the customer is signed in; real order data; guest orders without an account have no history (per scope). ✅
- Returning customers do not need to re-enter checkout info; orders placed while signed in are linked to the account automatically. ✅
- **Architecture:** `Customer.passwordHash` (Argon2id, nullable) + migration `20260818000001_add_customer_password_hash`; customer JWT carries `type: 'customer'` and is validated by a dedicated `CustomerJwtStrategy`/`CustomerAuthGuard` — fully disjoint from staff JWT/RBAC (staff strategy resolves `sub` in the User table; customer strategy requires the customer type claim + Customer lookup). CSRF double-submit reused (token issued at register/login, echoed on `PUT /me`). Optional customer linking at guest checkout via the existing `Authorization` header (invalid tokens silently fall back to guest — never block ordering). ✅
- **Isolation (server-authoritative):** tenant-scoped customer/order lookups via the existing extension; a customer token from restaurant A cannot authenticate on restaurant B's host; staff/platform endpoints remain inaccessible to customer tokens; customer endpoints are outside staff RBAC. ✅
- **UI:** mobile-first `CustomerAccount` component at `/account` (qr-menu), restaurant-branded (fetches the tenant's public site branding — never ELEVA tower styling), English/Arabic with full RTL/LTR, sign in / create account / profile / order history / sign out; entry points added to the restaurant website hero and the ordering (MenuBrowser) flow; guest ordering path preserved. ✅

## Loyalty — ✅ COMPLETE (commit pending)

- Tenant-scoped loyalty points for customers. ✅ Already existed on the `Customer` model (`loyaltyPoints` field + staff CRUD).
- **Earn points** from eligible completed orders according to **restaurant-configured rules** — `LoyaltyRule` model (`earnRate`, `earnMinOrderAmount`, `minRedeemPoints`, `redeemRate`; singleton per tenant; no points earned until the restaurant configures it). Points are awarded atomically at order COMPLETED status (inside the existing `OrderService.updateOrderStatus`), guarded by an idempotency check (existing `LoyaltyTransaction` with orderId prevents double-earn). ✅
- **Redeem points** for a one-time `FIXED` discount code (reusable via the existing Discount engine). Redemption is atomic: balance checked → balance deducted → discount code generated → `LoyaltyTransaction` created — all in a single DB transaction. Gated by tenant rule (min redeem points, redeem rate). ✅
- **Customer experience** integrated into the existing `/account` page: balance display, transaction history (EARNED/REDEEMED/ADJUSTMENT), redeem input with discount-code result. English + Arabic with full RTL/LTR. Restaurant-branded, mobile-first. ✅
- **Restaurant management** via the new `LoyaltySettings` component in the Backoffice Settings tab (the existing backoffice shell — no second admin system). Staff-only surface with `read/update Customer` RBAC. ✅
- **API:** new `loyalty` module: `GET /api/v1/customer/loyalty/me` (balance), `GET /api/v1/customer/loyalty/history`, `POST /api/v1/customer/loyalty/redeem` (customer JWT), `GET /api/v1/backoffice/loyalty/rule`, `PUT /api/v1/backoffice/loyalty/rule` (staff JWT + RBAC). ✅
- **Database:** new `LoyaltyRule` + `LoyaltyTransaction` models with proper relations, indexes, and tenant isolation. Migration `20260818000002_add_loyalty` (2 tables + FKs + indexes). ✅
- **Architecture note:** the earning formula (points per currency unit) is deliberately not hard-coded — the restaurant configures it via the LoyaltyRule. If no rule is set, no points are earned; if `earnRate = 0`, no points are earned; the order must meet `earnMinOrderAmount`. This satisfies "restaurant-configured rules" without inventing a business rule.

## Promotions & welcome offers — ✅ COMPLETE (commit pending)

- **Welcome offer discount** — restaurant-configurable via the new `WelcomeOfferSettings` component in the backoffice Settings tab. Configure: enabled/disabled, discount type (PERCENTAGE | FIXED), discount value, minimum order amount. Tenant-scoped (singleton `WelcomeOfferConfig` model).
- **Eligibility defined by server-authoritative data** — a customer is "new" if they have NO existing `WelcomeRedemption` record for this tenant (created atomically at first successful order). Not defined by browser state, localStorage, or client-side logic.
- **Once-per-customer enforcement** — atomic per-customer tracking via `WelcomeRedemption` table with a `UNIQUE` constraint on `customerId`. Concurrent checkout attempts are serialized by the constraint: the second request fails with the uniform `DISCOUNT_INVALID_MESSAGE`.
- **Server-verified** — eligibility (`customerId` present, no existing redemption) + standard discount validation (active, dates, usage) both inside the checkout transaction. Guest checkout (no customer token) cannot apply the welcome offer.
- **Discount code** — `WELCOME` (uppercase, trimmed). The qr-menu `MenuBrowser` checks eligibility when the customer token is present and shows a welcome banner with an "Apply" button that sets the code.
- **Existing Discount engine reused** — the `WELCOME` discount passes through the same `DiscountService.validateDiscount` pipeline (anti-oracle, server-authoritative pricing). Only the per-customer check is additional.
- **Arabic/English** supported in the customer-facing menu (labels, statuses).
- **API:** new `promotion` module: `GET /api/v1/customer/promotions/welcome-offer` (customer JWT, checks eligibility + returns offer details), `GET|PUT /api/v1/backoffice/promotions/welcome-offer` (staff JWT + RBAC read/update Customer).
- **Database:** new `WelcomeOfferConfig` + `WelcomeRedemption` models with proper FKs, unique constraints, and indexes. Migration `20260818000003_add_welcome_offer`.

## Customer wallet / store credit — ✅ COMPLETE (commit pending)

- **Separate customer store credit** from payment-provider/payment-attempt records — new `CustomerWallet` + `WalletTransaction` models (tenant-scoped, immutable ledger). ✅
- **Restaurant can grant credit** via the backoffice `WalletManager` in the Settings tab (staff RBAC: read/update Customer, tenant-scoped). ✅
- **Customer can view wallet balance and transaction history** (`GET /api/v1/customer/wallet`, customer JWT) — integrated into the existing `/account` page (restaurant-branded, AR/EN, mobile-first). ✅
- **Wallet credit applied atomically at checkout** — inside the existing order transaction, after discounts, the wallet is debited and used toward the order. A new `Order.walletUsed` field tracks the amount covered. The `total` stays as the full total; `total - walletUsed` is paid via the selected payment method. ✅
- **Atomic balance updates** via database transactions (multi-table, rollback on failure). The `customerId` unique constraint on `CustomerWallet` prevents duplicate wallets. Wallet debit + transaction creation + order creation are in the same Prisma transaction. ✅
- **Audit trail** — every mutation creates a `WalletTransaction` entry with type (CREDIT/DEBIT/ORDER_PAYMENT/REFUND/ADJUSTMENT), amount (signed), balanceAfter, order reference, timestamp. ✅
- **No cash-out**, no payment-provider integration in this phase. ✅

## Complaints / customer support — ✅ COMPLETE (commit pending)

- **Complaints linked to real customers and optional order reference** — new `CustomerComplaint` + `ComplaintMessage` models (tenant-scoped, proper FKs, optimistic locking via status transitions). ✅
- **Customer experience** in the existing `/account` page: create complaints (subject + description + optional order), list own complaints, view detail with message thread, reply to staff. Restaurant-branded, mobile-first, AR/EN, RTL/LTR. Customer cannot access another customer's complaints or reference another customer's order. ✅
- **Backoffice management** in a new "Complaints" tab: filter by status, view detail with message thread, reply, update status (NEW → REVIEWING → RESOLVED → CLOSED) with full state-machine validation. Existing RBAC (`read/update Customer`). ✅
- **Status lifecycle:** NEW → REVIEWING → RESOLVED → CLOSED (validated transitions only; CLOSED → REVIEWING reopens). `resolvedAt` / `closedAt` timestamps set on relevant transitions. ✅
- **Security:** tenant isolation via existing Prisma extension; customer JWT separate from staff; staff mutations RBAC-gated; customers cannot access cross-customer/tenant complaints; order ownership verified server-side before linking. ✅
- **API:** new `complaint` module with customer endpoints (customer JWT: create, list, get, add message) and staff endpoints (JWT + RBAC: list, get, reply, update status). ✅

## Ratings & feedback — ✅ COMPLETE (commit pending)

- **Customer can rate an eligible completed order** — `POST /api/v1/customer/ratings` (customer JWT, verifies order ownership + COMPLETED status + no duplicate). Star rating 1-5 with optional feedback text. ✅
- **Duplicate prevention** via `orderId` unique constraint (one rating per order, server-verified). ✅
- **Order eligibility** — only COMPLETED orders belonging to the authenticated customer can be rated. ✅
- **Customer view** — in the existing `/account` page, completed orders show a "Rate" button that opens an inline star-rating + feedback form. Customer can view their submitted ratings. ✅
- **Restaurant backoffice** — new "Ratings" tab showing all tenant ratings with star filter (All / 5★ / 4★ / 3★ / 2★ / 1★). Customer reference (partial UUID), rating, feedback, order reference, date. ✅
- **Public API** — `GET /api/v1/public/ratings` returns customer-safe ratings (no customer IDs, no order IDs) for restaurant website testimonial display. ✅
- **Architecture:** new `OrderRating` model with unique constraint on orderId, FKs, tenant indexes. Migration `20260818000006_add_order_ratings`. Tenant isolation via Prisma extension; customer JWT separate from staff; staff endpoints RBAC-gated (`read Customer`). ✅

## Explicitly out of scope for Phase 4

- Full delivery system: drivers, dispatch, delivery zones, delivery fees, live rider tracking, proof of delivery, and delivery-specific complaint workflows.
- Cash-out from customer wallet.
- Any payment-provider feature not explicitly approved as part of the Phase 4 payment scope.

## Verification requirement

Phase 4 implementation must be verified end-to-end with real API/database persistence and browser testing. No mock-only success may be reported as production verification.

The canonical source of truth remains `PROJECT_STATE.md`; this file records the approved Phase 4 scope without marking Phase 4 as started.