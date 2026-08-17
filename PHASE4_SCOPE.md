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

## Eleva brand & marketing platform (P2) — NOT STARTED

- Separate Eleva marketing website, independent from the platform dashboard.
- Professional marketing homepage: hero + appropriate animations, features, how it works, pricing, about, contact, FAQ, terms, privacy, CTA/signup.
- Elevator/building metaphor as a UX/branding concept (Floor 1 cashier, Floor 2 management, Floor 3 owner, special platform floor); branding metaphor only, never a security boundary.

## Printing & receipts (P3) — NOT STARTED

- Receipt Designer with logo, VAT/tax number, branch, customer, cashier, items, sizes, add-ons, discount, VAT, total, payment, QR, footer.
- Live receipt preview; independent kitchen ticket.

## Customer account & profile

- Guest checkout remains supported.
- Customer can optionally create an account during/before ordering.
- Login/logout and persistent customer session.
- Saved name, phone, email and relevant customer details.
- Order history and order-detail history.
- Returning customers should not need to re-enter the same checkout information every time.

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