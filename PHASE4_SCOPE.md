# Phase 4 — Customer Experience & Retention Scope

Status: **PLANNING ONLY — Phase 4 is not started.**

Phase 4 preserves the existing project-state/roadmap requirements that remain applicable, while adding the approved customer-facing requirements below.

## Existing scope carried forward

- Complete the remaining product/merchant-facing items that are explicitly still applicable in `PROJECT_STATE.md` and approved before implementation.
- Preserve the platform's multi-tenant isolation, RBAC, CSRF, auditability, server-authoritative pricing/order totals, and existing DINE_IN / TAKE_AWAY ordering model.
- Regional payment expansion, delivery, and other architecture items remain separate decisions unless explicitly approved into this phase.

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