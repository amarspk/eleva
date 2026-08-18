# Phase 4 — Customer Experience & Retention Scope

Status: **IN PROGRESS — Phase 4 P0 (staff/cashier) complete; P1 (restaurant website) started.**

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

## Restaurant experience — website & design (P1) — IN PROGRESS

- The restaurant public website is a restaurant website, not a generic Pages CMS.
- **Token-free public restaurant website** (browsable at the tenant subdomain without a QR table token). ✅ `GET /api/v1/public/site` + qr-menu `/` no-token branch (commit pending).
- Categories visible on the restaurant website. ✅
- Clicking a category filters/displays its products. ✅
- Real social/contact links (phone, WhatsApp, Instagram, X) from tenant branding. ✅
- Mobile-first responsive design. ✅
- Branding-aware colors (tenant primary/secondary) and logo. ✅
- Real category images (uploaded photographs) instead of emoji/placeholder fallbacks. ✅ Category gained `imageUrl` (migration `20260818000000_add_category_image_url`), create/update/clear via the menu API, exposed in the public site + QR menu, and rendered by the restaurant website with a clean placeholder fallback.
- Proper Media Library. ⏳ partially present (`MediaLibrary.tsx` in backoffice + `Media` model/API) — category images can reference media URLs; deeper editor wiring is a follow-up.
- IndexedDB for large demo/frontend media where appropriate. ⏳
- About / Contact / Branches / Social content remains simple and restaurant-oriented. ⏳
- Editing controls (website builder) scroll independently from the live preview/page. ⏳
- Live preview while editing. ⏳ (DesignBuilder preview exists for the QR menu; restaurant-site editing is a follow-up)
- Dark / Light / Auto themes. ⏳
- Glassmorphism where it improves the design. ⏳
- Logo/brand-aware color suggestions. ⏳
- Responsive layouts. ✅ (mobile-first grid + sticky category nav)
- Professional modern restaurant web design; not a generic CRUD-looking interface. ✅ (first unit)
- Additional visual polish only when it materially improves usability/hierarchy/accessibility/perceived quality; no decoration-only effects. ⏳

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

## Loyalty

- Tenant-scoped loyalty points for customers.
- Earn points from eligible completed orders according to restaurant-configured rules.
- Redeem points for configured rewards/discounts.
- Customer can view balance, earning history and redemption history.
- Restaurant can manage the loyalty rules/rewards from Backoffice.

## Promotions & discount codes

- Customer-facing display of active restaurant offers/discount codes.
- Customer can enter/apply an eligible discount code at checkout.
- Reuse the existing tenant-scoped discount engine rather than creating a second discount mechanism.
- Preserve existing anti-oracle validation and usage limits.
- Restaurant owner can create a **new-customer / first-order welcome offer**.
- Welcome offer can be either **percentage-based** (for example, 10% off) or **fixed-amount** (for example, 2 OMR/SAR off, according to the restaurant currency).
- Restaurant owner can enable/disable the welcome offer and configure its value and validity according to the existing discount rules.
- The welcome offer must be restricted to customers who are genuinely eligible as **new customers of that restaurant**.
- A qualifying customer may redeem the welcome offer **once only** for that restaurant; repeated orders by the same customer must not receive it again.
- Eligibility and redemption must be enforced server-side using the real customer/order relationship, not only by hiding the offer in the UI.
- Guest checkout must not be able to bypass the one-time rule by repeatedly submitting the same promotion without a verified customer identity; the exact guest-identity policy must be defined during implementation.
- Existing global `usageLimit`/`usageCount` behavior is not sufficient by itself for this requirement because it limits total campaign usage, not one redemption per customer.

## Customer wallet / store credit

- Separate customer credit balance from payment-provider/payment-attempt records.
- Restaurant can grant store credit to a customer as compensation for an approved issue.
- Customer can view wallet balance and transaction ledger.
- Wallet credit can be applied to eligible future orders.
- Every credit/debit must have an auditable ledger entry tied to the tenant/customer/order where applicable.
- No cash-out requirement in this phase.

## Complaints / customer support

- Complaints are linked to a real customer and order.
- Current scope is **restaurant pickup / dine-in / take-away only**; delivery complaints are explicitly out of Phase 4.
- Customer can create a complaint from an eligible order.
- Complaint includes category/reason, free-text description and order reference.
- Customer can attach photographic evidence.
- On supported mobile browsers, the attachment flow should allow the user to open the device camera for a fresh photo; the system must still validate the uploaded media server-side.
- Restaurant Backoffice receives and manages complaints.
- Complaint lifecycle: New → Reviewing → Resolved → Closed (exact states to be verified against the existing state conventions before implementation).
- Restaurant can resolve a complaint with an approved customer compensation action such as wallet credit or loyalty points.

## Ratings & feedback

- Customer can rate an eligible completed order using stars.
- Customer can add written feedback/suggestions.
- Rating is tied to the real order/customer relationship; arbitrary users cannot rate an order they did not place.
- Restaurant can view ratings and feedback in Backoffice.
- Customer-facing published ratings/reviews may be shown where the restaurant enables them; moderation/publication rules must be defined before implementation.
- Rating/feedback data is tenant-isolated and auditable.

## Explicitly out of scope for Phase 4

- Full delivery system: drivers, dispatch, delivery zones, delivery fees, live rider tracking, proof of delivery, and delivery-specific complaint workflows.
- Cash-out from customer wallet.
- Any payment-provider feature not explicitly approved as part of the Phase 4 payment scope.

## Verification requirement

Phase 4 implementation must be verified end-to-end with real API/database persistence and browser testing. No mock-only success may be reported as production verification.

The canonical source of truth remains `PROJECT_STATE.md`; this file records the approved Phase 4 scope without marking Phase 4 as started.