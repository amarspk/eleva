# V2-PROMOTIONS.md — Promotion Engine Roadmap (Version 2)

> **Status:** Planned (Documentation Only)
> **Version:** 2.0
> **Created:** 2026-07-26
> **Owner:** Zayjar Platform Engineering
>
> This document outlines the complete Promotion Engine roadmap for Version 2 of the Zayjar platform. No production code, database schema, or SPEC_INDEX counts are modified by this document.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Promotion Types](#2-promotion-types)
3. [Scheduling & Time-Based Rules](#3-scheduling--time-based-rules)
4. [Customer Eligibility & Targeting](#4-customer-eligibility--targeting)
5. [Coupon Code System](#5-coupon-code-system)
6. [Promotion Stacking Rules](#6-promotion-stacking-rules)
7. [Loyalty & Rewards Integration](#7-loyalty--rewards-integration)
8. [Homepage Promotions & Banners](#8-homepage-promotions--banners)
9. [Promotions Page & Customer UX](#9-promotions-page--customer-ux)
10. [Countdown Timers & Urgency](#10-countdown-timers--urgency)
11. [Campaign Management](#11-campaign-management)
12. [Promotion Analytics & Reporting](#12-promotion-analytics--reporting)
13. [API Design](#13-api-design)
14. [Database Design Proposal](#14-database-design-proposal)
15. [UI/UX Proposal](#15-uiux-proposal)
16. [Implementation Phases](#16-implementation-phases)

---

## 1. Executive Summary

The Promotion Engine is the single largest feature addition for V2. It transforms Zayjar from a basic ordering platform into a full-featured restaurant commerce system capable of running sophisticated marketing campaigns, loyalty programs, and dynamic pricing strategies.

### Core Objectives

- Enable restaurant owners to create and manage promotions without developer intervention
- Support both simple discounts (percentage, fixed) and complex rules (BOGO, bundles, time-gated)
- Provide a complete coupon code infrastructure with single-use, multi-use, and per-customer limits
- Integrate promotions into the existing order checkout flow with zero friction
- Deliver real-time analytics on promotion performance (redemption rates, revenue impact, customer acquisition)
- Support multi-branch promotion scoping (chain-wide vs. branch-specific)

### Design Principles

1. **Composable rules** — Every promotion is a composition of conditions + effects. New promotion types are added by registering new effect handlers, not by modifying the checkout flow.
2. **Stackability by design** — Promotion stacking is a first-class concept, not an afterthought. Each promotion declares its stack group and priority.
3. **Audit trail** — Every promotion application is logged with the full calculation breakdown for debugging and analytics.
4. **Graceful degradation** — If the promotion engine fails, orders proceed at full price rather than being blocked.

---

## 2. Promotion Types

### 2.1 Percentage Discounts

**Description:** Reduce item or order total by a fixed percentage.

| Property | Type | Description |
|----------|------|-------------|
| `percentage` | `number` (0.01–100) | Discount percentage |
| `maxDiscountAmount` | `number?` | Optional cap on discount (e.g., "20% off, max $50") |
| `appliesTo` | `enum` | `ORDER_TOTAL`, `SPECIFIC_ITEMS`, `SPECIFIC_CATEGORIES`, `CHEAPEST_ITEM` |

**Examples:**
- 15% off entire order
- 20% off all appetizers (category-scoped)
- 10% off, max discount $25

**Calculation:**
```
discount = min(itemPrice × (percentage / 100), maxDiscountAmount ?? Infinity)
```

### 2.2 Fixed Amount Discounts

**Description:** Reduce item or order total by a fixed monetary amount.

| Property | Type | Description |
|----------|------|-------------|
| `discountAmount` | `number` (cents) | Fixed discount in smallest currency unit |
| `appliesTo` | `enum` | `ORDER_TOTAL`, `SPECIFIC_ITEMS`, `SPECIFIC_CATEGORIES` |
| `minimumOrderAmount` | `number?` | Minimum order total to qualify (in cents) |

**Examples:**
- $10 off orders over $50
- $5 off any burger (product-scoped)
- $3 off all drinks (category-scoped)

**Constraint:** `discountAmount` must be less than the applicable subtotal. If the discount exceeds the subtotal, the item/order price floors at $0.00.

### 2.3 Buy One Get One (BOGO)

**Description:** When a customer purchases a qualifying item, they receive a second item free (or at a discount).

| Property | Type | Description |
|----------|------|-------------|
| `buyQuantity` | `number` | Number of items to purchase |
| `getQuantity` | `number` | Number of free/discounted items |
| `discountType` | `enum` | `FREE`, `PERCENTAGE`, `FIXED_AMOUNT` |
| `discountValue` | `number?` | Required if discountType is not FREE |
| `appliesTo` | `ref` | Product ID or Category ID |
| `getAppliesTo` | `ref?` | If different from buy item (for BOGO across products) |

**Examples:**
- Buy 1 Get 1 Free (same product)
- Buy 2 Get 1 Free (most expensive of the 3 is free)
- Buy 1 Get 1 50% Off (cross-product: buy a burger, get fries 50% off)

**Calculation (Buy 1 Get 1 Free):**
```
// Customer buys N items, gets floor(N / buyQuantity) × getQuantity free
freeCount = floor(quantity / buyQuantity) * getQuantity
// Sort items by price descending — free items are the cheapest ones
discount = sum of cheapest freeCount items' prices
```

### 2.4 Buy X Get Y

**Description:** Purchase a minimum quantity of one product to unlock a discount on another product.

| Property | Type | Description |
|----------|------|-------------|
| `buyProductId` | `ref` | Product that must be purchased |
| `buyMinQuantity` | `number` | Minimum quantity to qualify |
| `getProductId` | `ref` | Product that receives the discount |
| `discountType` | `enum` | `FREE`, `PERCENTAGE`, `FIXED_AMOUNT` |
| `discountValue` | `number` | Discount value |

**Examples:**
- Buy 2 coffees, get a pastry free
- Buy 3 drinks, get 1 appetizer 50% off

### 2.5 Bundle Offers

**Description:** Discount applied when specific products are purchased together as a group.

| Property | Type | Description |
|----------|------|-------------|
| `bundleItems` | `Array<{ productId, quantity }>` | Required items in the bundle |
| `bundlePrice` | `number?` | Fixed bundle price (overrides individual pricing) |
| `bundleDiscount` | `number?` | Discount applied to bundle total |
| `discountType` | `enum` | `FIXED_BUNDLE_PRICE`, `PERCENTAGE_OFF`, `FIXED_AMOUNT_OFF` |

**Examples:**
- "Family Meal Deal": Burger + Fries + Drink + Dessert for $29.99 (vs. $38.00 individually)
- "Lunch Combo": Any main + any side + any drink = 20% off
- "Date Night": 2 mains + 1 shared dessert = $15 off

**Calculation (Fixed Bundle Price):**
```
individualTotal = sum of individual item prices in bundle
discount = individualTotal - bundlePrice
```

### 2.6 Category-Wide Promotions

**Description:** Apply a promotion to all products within a specific category.

| Property | Type | Description |
|----------|------|-------------|
| `categoryId` | `ref` | Target category |
| `discountType` | `enum` | `PERCENTAGE`, `FIXED_AMOUNT` |
| `discountValue` | `number` | Discount value |
| `excludeProducts` | `ref[]?` | Product IDs to exclude from the promotion |

**Examples:**
- 25% off all appetizers
- $2 off all desserts (excluding the premium chocolate cake)
- BOGO on all drinks (excluding alcoholic beverages)

### 2.7 Product-Specific Promotions

**Description:** Apply a promotion to one or more specific products.

| Property | Type | Description |
|----------|------|-------------|
| `productIds` | `ref[]` | Target product IDs |
| `discountType` | `enum` | `PERCENTAGE`, `FIXED_AMOUNT`, `BOGO`, `BUNDLE` |
| `discountValue` | `number` | Discount value |
| `perCustomerLimit` | `number?` | Max redemptions per customer |

**Examples:**
- 30% off the new signature dish (launch promotion)
- Buy 1 Get 1 Free on weekend specials
- $5 off the chef's special (limit 1 per customer)

---

## 3. Scheduling & Time-Based Rules

### 3.1 Scheduled Promotions

Every promotion supports a time window during which it is active.

| Property | Type | Description |
|----------|------|-------------|
| `startDate` | `DateTime` | Promotion becomes active at this time |
| `endDate` | `DateTime?` | Promotion expires at this time (null = no expiry) |
| `timezone` | `string` | IANA timezone for the restaurant (e.g., `Asia/Kuwait`) |

### 3.2 Date/Time Based Promotions

Promotions can be restricted to specific days and times within their active window.

| Property | Type | Description |
|----------|------|-------------|
| `validDaysOfWeek` | `DayOfWeek[]?` | `['MONDAY', 'TUESDAY', ...]` — null = all days |
| `validTimeRanges` | `TimeRange[]?` | `[{ start: "11:00", end: "14:00" }]` — null = all day |
| `validDates` | `Date[]?` | Specific dates only (for holiday promotions) |
| `excludeDates` | `Date[]?` | Specific dates to exclude |

**Examples:**
- Happy Hour: 4PM–6PM, Monday–Friday
- Weekend Brunch: Saturday–Sunday, 9AM–1PM
- Ramadan Iftar Special: Sunset–10PM during Ramadan dates
- National Day Promotion: Specific holiday date only
- Early Bird Discount: 7AM–9AM, weekdays

### 3.3 Recurrence Patterns

For recurring promotions (e.g., "Taco Tuesday"), support cron-like patterns.

| Property | Type | Description |
|----------|------|-------------|
| `recurrencePattern` | `string?` | Cron expression (e.g., `0 11 * * 2` for every Tuesday at 11AM) |
| `recurrenceEndDate` | `DateTime?` | Stop recurring after this date |

---

## 4. Customer Eligibility & Targeting

### 4.1 Customer Segments

Promotions can target specific customer segments.

| Segment | Description |
|---------|-------------|
| `ALL` | All customers (default) |
| `NEW_CUSTOMERS` | Customers who placed their first order within the last N days |
| `RETURNING_CUSTOMERS` | Customers with 2+ orders |
| `VIP_CUSTOMERS` | Customers with lifetime spend above threshold |
| `INACTIVE_CUSTOMERS` | Customers with no orders in the last N days |
| `CUSTOM_SEGMENT` | Manually curated list of customer IDs |

### 4.2 Customer Eligibility Rules

| Property | Type | Description |
|----------|------|-------------|
| `minOrdersPlaced` | `number?` | Minimum total orders to qualify |
| `maxOrdersPlaced` | `number?` | Maximum total orders to qualify |
| `minLifetimeSpend` | `number?` | Minimum lifetime spend (in cents) |
| `maxLifetimeSpend` | `number?` | Maximum lifetime spend (in cents) |
| `minLoyaltyPoints` | `number?` | Minimum loyalty points balance |
| `customerIds` | `ref[]?` | Specific customer IDs |
| `excludeCustomerIds` | `ref[]?` | Specific customer IDs to exclude |

### 4.3 Branch-Scoped Eligibility

| Property | Type | Description |
|----------|------|-------------|
| `scope` | `enum` | `ALL_BRANCHES`, `SPECIFIC_BRANCHES` |
| `branchIds` | `ref[]?` | Required if scope is `SPECIFIC_BRANCHES` |

---

## 5. Coupon Code System

### 5.1 Coupon Code Properties

| Property | Type | Description |
|----------|------|-------------|
| `code` | `string` (unique) | Customer-facing coupon code (e.g., `SUMMER20`) |
| `promotionId` | `ref` | Associated promotion |
| `usageLimit` | `number?` | Total redemption limit (null = unlimited) |
| `usageCount` | `number` | Current redemption count |
| `perCustomerLimit` | `number?` | Max uses per customer |
| `minOrderAmount` | `number?` | Minimum order amount to apply |
| `startDate` | `DateTime` | Code becomes valid |
| `endDate` | `DateTime?` | Code expires |
| `isActive` | `boolean` | Enable/disable without deleting |

### 5.2 Coupon Code Types

| Type | Description |
|------|-------------|
| `STANDARD` | Single code, shared across all customers |
| `ONE_TIME` | Unique code per customer (generated in bulk) |
| `REFERRAL` | Generated when a customer refers a friend |
| `LOYALTY_REWARD` | Generated as a loyalty points redemption |

### 5.3 Code Validation Rules

1. Code must be active and within its valid date range
2. Total usage count must not exceed `usageLimit`
3. Customer's individual usage must not exceed `perCustomerLimit`
4. Order must meet `minOrderAmount` if specified
5. Code is case-insensitive (stored uppercase)
6. Invalid codes return HTTP 400 with descriptive error (but do not reveal remaining uses)

---

## 6. Promotion Stacking Rules

### 6.1 Stack Groups

Promotions are assigned to stack groups that determine how they combine.

| Stack Group | Description | Example |
|-------------|-------------|---------|
| `MARKETING` | Marketing/promotional discounts | "20% off appetizers", "Happy Hour" |
| `COUPON` | Coupon-based discounts | `SAVE10`, `WELCOME20` |
| `LOYALTY` | Loyalty point redemptions | Redeem 500 points for $5 off |
| `BUNDLE` | Bundle/combo discounts | "Family Meal Deal" |

### 6.2 Stacking Rules

| Rule | Description |
|------|-------------|
| **Within same group** | Non-stackable — only the highest-value discount applies |
| **Across groups** | Stackable — discounts from different groups combine |
| **Priority** | Higher `priority` value takes precedence within the same group |
| **Order** | Stackable discounts are applied in this order: Bundle → Marketing → Coupon → Loyalty |
| **Floor price** | Item price cannot go below $0.00 after all discounts |

### 6.3 Stackability Declaration

Each promotion declares its stacking behavior.

| Property | Type | Description |
|----------|------|-------------|
| `stackGroup` | `enum` | `MARKETING`, `COUPON`, `LOYALTY`, `BUNDLE` |
| `isStackable` | `boolean` | Whether this promotion stacks with others in its group |
| `priority` | `number` | Higher = applied first (within same group) |
| `maxStackCount` | `number?` | Maximum number of promotions that can apply from this group |

### 6.4 Conflict Resolution

When multiple promotions compete for the same item:
1. All applicable promotions are calculated independently
2. Promotions are sorted by: stack group order → priority (desc) → discount amount (desc)
3. Non-stackable promotions: only the best one applies
4. Stackable promotions: all apply, but floor at $0.00
5. The customer always sees the highest total discount

---

## 7. Loyalty & Rewards Integration

### 7.1 Points Earning

| Event | Points Awarded |
|-------|---------------|
| Order placed | 1 point per $1 spent (configurable) |
| Promotion redeemed | Bonus points (configurable per promotion) |
| Account creation | Welcome bonus (configurable) |
| Referral completed | Referral bonus (configurable) |
| Birthday month | 2x points multiplier |

### 7.2 Points Redemption

| Redemption | Points Required |
|------------|----------------|
| $1 discount | Configurable (e.g., 100 points) |
| Free item | Configurable per item |
| Free delivery | Configurable |

### 7.3 Loyalty Tiers

| Tier | Points Threshold | Benefits |
|------|-----------------|----------|
| Bronze | 0 | Base earning rate |
| Silver | 1,000 | 1.2x earning rate, birthday reward |
| Gold | 5,000 | 1.5x earning rate, free delivery, priority support |
| Platinum | 15,000 | 2x earning rate, exclusive promotions, early access |

### 7.4 Integration Points

- Loyalty points are earned on the post-discount order total (not the pre-discount total)
- Promotions can award bonus loyalty points as an effect
- Loyalty tier can be a customer eligibility rule for promotions
- Points expiry: configurable (default 12 months from earning date)

---

## 8. Homepage Promotions & Banners

### 8.1 Promotional Banner System

Restaurant owners can configure rotating banners on their public menu page.

| Property | Type | Description |
|----------|------|-------------|
| `title` | `string` | Banner headline |
| `subtitle` | `string?` | Supporting text |
| `imageUrl` | `string` | Banner image (optimized via existing media pipeline) |
| `linkUrl` | `string?` | Deep link to specific category/product/promotion |
| `ctaText` | `string?` | Call-to-action button text |
| `position` | `number` | Display order (lower = first) |
| `backgroundColor` | `string?` | Hex color for banner background |

### 8.2 Banner Display Rules

- Banners can be scheduled (start/end date)
- Banners can be scoped to specific branches
- Maximum 5 active banners (to prevent carousel overload)
- Mobile-optimized aspect ratios (16:9 landscape, 1:1 square)
- Lazy-loaded with `loading="lazy"` attribute
- Served via CloudFront CDN with aggressive caching

### 8.3 Auto-Generated Promotional Banners

The system can automatically generate banners for active promotions:

- "20% Off All Appetizers — Today Only!"
- "Happy Hour: 5PM–7PM, Half-Price Drinks"
- Use promotion `name`, `description`, and discount value

---

## 9. Promotions Page & Customer UX

### 9.1 Promotions Page (`/promotions`)

A dedicated page showing all active promotions for the restaurant.

**Sections:**
1. **Hero Banner** — Current best offer (highest discount or most popular)
2. **Active Coupons** — Promo codes customers can copy
3. **Category Deals** — Promotions grouped by category
4. **Limited Time** — Promotions with countdown timers
5. **Loyalty Rewards** — Points balance and available redemptions

### 9.2 Promotion Badges

Products with active promotions display badges on the menu:

| Badge Type | Display |
|------------|---------|
| Percentage off | "20% OFF" |
| Fixed amount off | "$5 OFF" |
| BOGO | "BOGO" |
| Bundle | "COMBO" |
| New | "NEW" (not a promotion, but visually similar) |
| Popular | "POPULAR" |

### 9.3 Cart Integration

- Applied promotions shown as line items in the cart
- "Have a coupon code?" input field in checkout
- Real-time discount preview as items are added/removed
- Promotion details expandable (showing calculation breakdown)

---

## 10. Countdown Timers & Urgency

### 10.1 Timer Types

| Type | Description |
|------|-------------|
| `END_DATE` | Countdown to promotion expiration |
| `DAILY_WINDOW` | Countdown to end of daily window (e.g., happy hour) |
| `WEEKLY_RESET` | Countdown to end of weekly recurring window |
| `STOCK_BASED` | Countdown based on remaining redemption count |

### 10.2 Timer Display Rules

- Show on product cards when a time-limited promotion is active
- Show on the promotions page
- Show in the cart when an applied promotion is expiring soon (< 1 hour)
- Timer format: `HH:MM:SS` for < 24h, `D days HH:MM` for multi-day
- Server-side expiration enforcement (not client-side only)
- UTC-based with client-side timezone conversion

### 10.3 Urgency Indicators

| Condition | Display |
|-----------|---------|
| < 1 hour remaining | Red timer, pulsing animation |
| < 24 hours remaining | Orange timer |
| < 3 items/uses remaining | "Only X left!" badge |
| < 10 redemptions remaining | "Almost gone!" badge |

---

## 11. Campaign Management

### 11.1 Campaign Concepts

A **campaign** is a container for related promotions, banners, and communications.

| Property | Type | Description |
|----------|------|-------------|
| `name` | `string` | Campaign name (internal) |
| `description` | `string?` | Campaign notes |
| `startDate` | `DateTime` | Campaign start |
| `endDate` | `DateTime` | Campaign end |
| `budget` | `number?` | Maximum total discount budget (in cents) |
| `spent` | `number` | Current total discount given |
| `status` | `enum` | `DRAFT`, `SCHEDULED`, `ACTIVE`, `PAUSED`, `COMPLETED`, `CANCELLED` |

### 11.2 Campaign Components

A campaign groups:
- **Promotions** — One or more promotion rules
- **Banners** — Promotional banners on the menu page
- **Notifications** — Push/email/SMS messages to customers
- **Analytics** — Performance metrics for the entire campaign

### 11.3 Campaign Workflow

1. **Draft** — Create campaign, add promotions and banners
2. **Schedule** — Set start/end dates, preview
3. **Activate** — Campaign goes live, promotions become active
4. **Monitor** — Track redemptions, revenue, budget consumption
5. **Pause** — Temporarily suspend all campaign promotions
6. **Complete** — Campaign ends, final analytics generated

### 11.4 Budget Controls

- Campaign-level budget cap: stop all promotions when total discounts reach budget
- Per-promotion budget cap: stop individual promotion when its discounts reach cap
- Daily budget cap: limit total daily discount amount
- Alert at 80% and 100% budget consumption

---

## 12. Promotion Analytics & Reporting

### 12.1 Promotion-Level Metrics

| Metric | Description |
|--------|-------------|
| Total Redemptions | Number of times the promotion was applied |
| Unique Customers | Number of distinct customers who used it |
| Total Discount Given | Sum of all discounts (in cents) |
| Average Discount Per Redemption | Total discount / total redemptions |
| Revenue Impact | Revenue from orders using the promotion |
| Incremental Revenue | Revenue that would not have occurred without the promotion |
| Conversion Rate | Orders with promotion / total orders |
| Cost Per Redemption | Total discount / total redemptions |
| ROI | (Incremental Revenue - Total Discount) / Total Discount |

### 12.2 Campaign-Level Metrics

| Metric | Description |
|--------|-------------|
| Campaign ROI | Aggregate ROI across all campaign promotions |
| Budget Utilization | Spent / Budget |
| Customer Acquisition | New customers gained during campaign |
| Customer Retention | Returning customers who re-ordered during campaign |
| Average Order Value (AOV) | AOV during campaign vs. baseline |
| Peak Redemption Time | Hour/day with highest redemption activity |

### 12.3 Reporting Views

1. **Dashboard** — Real-time promotion performance cards
2. **Detailed Report** — Exportable CSV/Excel with per-promotion breakdown
3. **Comparison Report** — Side-by-side comparison of two promotions
4. **Cohort Report** — Customer behavior over time after first promotion use

### 12.4 Analytics Data Model

Promotion redemptions are logged to a dedicated `promotion_redemptions` table:

```sql
CREATE TABLE promotion_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  promotion_id UUID NOT NULL REFERENCES promotions(id),
  order_id UUID NOT NULL REFERENCES orders(id),
  customer_id UUID REFERENCES customers(id),
  coupon_code_id UUID REFERENCES coupon_codes(id),
  discount_amount INTEGER NOT NULL,  -- in cents
  calculation_breakdown JSONB NOT NULL,  -- full audit trail
  created_at TIMESTAMPTZ DEFAULT now()
);
```

---

## 13. API Design

### 13.1 Promotion Management (Backoffice)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/promotions` | List all promotions (with filters) |
| `POST` | `/api/v1/promotions` | Create a new promotion |
| `GET` | `/api/v1/promotions/:id` | Get promotion details |
| `PUT` | `/api/v1/promotions/:id` | Update promotion |
| `DELETE` | `/api/v1/promotions/:id` | Soft-delete promotion |
| `POST` | `/api/v1/promotions/:id/activate` | Activate promotion |
| `POST` | `/api/v1/promotions/:id/deactivate` | Deactivate promotion |

### 13.2 Coupon Code Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/coupons` | List all coupon codes |
| `POST` | `/api/v1/coupons` | Create coupon code (standard) |
| `POST` | `/api/v1/coupons/bulk` | Generate bulk unique codes |
| `PUT` | `/api/v1/coupons/:id` | Update coupon code |
| `DELETE` | `/api/v1/coupons/:id` | Deactivate coupon code |

### 13.3 Campaign Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/campaigns` | List all campaigns |
| `POST` | `/api/v1/campaigns` | Create campaign |
| `GET` | `/api/v1/campaigns/:id` | Get campaign with promotions |
| `PUT` | `/api/v1/campaigns/:id` | Update campaign |
| `POST` | `/api/v1/campaigns/:id/activate` | Activate campaign |
| `POST` | `/api/v1/campaigns/:id/pause` | Pause campaign |

### 13.4 Banner Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/banners` | List active banners |
| `POST` | `/api/v1/banners` | Create banner |
| `PUT` | `/api/v1/banners/:id` | Update banner |
| `DELETE` | `/api/v1/banners/:id` | Delete banner |

### 13.5 Customer-Facing Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/public/promotions` | Active promotions for restaurant |
| `GET` | `/api/v1/public/banners` | Active promotional banners |
| `POST` | `/api/v1/public/coupons/validate` | Validate a coupon code |
| `POST` | `/api/v1/public/loyalty/points` | Get loyalty points balance |
| `POST` | `/api/v1/public/loyalty/redeem` | Redeem loyalty points |

### 13.6 Order Checkout Integration

The existing `POST /api/v1/orders/checkout` endpoint is extended:

```json
{
  "branchId": "...",
  "items": [...],
  "couponCode": "SUMMER20",
  "loyaltyPointsRedemption": 500,
  "appliedPromotionIds": ["promo-1", "promo-2"]
}
```

The checkout response includes a `discountBreakdown`:

```json
{
  "subtotal": 5000,
  "discounts": [
    {
      "promotionId": "promo-1",
      "name": "20% Off Appetizers",
      "stackGroup": "MARKETING",
      "amount": 600
    },
    {
      "couponCode": "SUMMER20",
      "stackGroup": "COUPON",
      "amount": 500
    }
  ],
  "totalDiscount": 1100,
  "total": 3900,
  "loyaltyPointsEarned": 39
}
```

---

## 14. Database Design Proposal

### 14.1 New Prisma Models

```prisma
model Promotion {
  id                String   @id @default(uuid()) @db.Uuid
  tenantId          String   @map("tenant_id") @db.Uuid
  name              String
  description       String?
  discountType      String   @map("discount_type") // PERCENTAGE, FIXED_AMOUNT, BOGO, BUY_X_GET_Y, BUNDLE
  discountValue     Int      @map("discount_value") // percentage (1-10000 = 0.01%-100%) or cents
  maxDiscountAmount Int?     @map("max_discount_amount") // cap in cents
  appliesTo         String   @map("applies_to") // ORDER_TOTAL, SPECIFIC_ITEMS, SPECIFIC_CATEGORIES, CHEAPEST_ITEM
  stackGroup        String   @map("stack_group") @default("MARKETING")
  isStackable       Boolean  @map("is_stackable") @default(false)
  priority          Int      @default(0)
  maxStackCount     Int?     @map("max_stack_count")
  scope             String   @default("ALL_BRANCHES") // ALL_BRANCHES, SPECIFIC_BRANCHES
  budgetLimit       Int?     @map("budget_limit") // cents, null = unlimited
  budgetSpent       Int      @map("budget_spent") @default(0)
  startDate         DateTime @map("start_date")
  endDate           DateTime? @map("end_date")
  timezone          String   @default("UTC")
  validDaysOfWeek   String[] @map("valid_days_of_week") // ["MONDAY","TUESDAY",...]
  validTimeRanges   Json?    @map("valid_time_ranges") // [{start:"11:00",end:"14:00"}]
  validDates        DateTime[] @map("valid_dates")
  excludeDates      DateTime[] @map("exclude_dates")
  customerSegment   String   @map("customer_segment") @default("ALL")
  minOrdersPlaced   Int?     @map("min_orders_placed")
  maxOrdersPlaced   Int?     @map("max_orders_placed")
  minLifetimeSpend  Int?     @map("min_lifetime_spend")
  maxLifetimeSpend  Int?     @map("max_lifetime_spend")
  status            String   @default("DRAFT") // DRAFT, SCHEDULED, ACTIVE, PAUSED, COMPLETED, CANCELLED
  createdAt         DateTime @default(now()) @map("created_at")
  updatedAt         DateTime @updatedAt @map("updated_at")
  deletedAt         DateTime? @map("deleted_at")

  tenant            Tenant   @relation(fields: [tenantId], references: [id])
  promotionItems    PromotionItem[]
  promotionCategories PromotionCategory[]
  promotionBranches  PromotionBranch[]
  promotionRedemptions PromotionRedemption[]
  couponCodes       CouponCode[]
  campaignPromotions CampaignPromotion[]

  @@index([tenantId, status], map: "idx_promotions_tenant_status")
  @@index([tenantId, startDate, endDate], map: "idx_promotions_active_window")
  @@map("promotions")
}

model PromotionItem {
  id           String   @id @default(uuid()) @db.Uuid
  promotionId  String   @map("promotion_id") @db.Uuid
  productId    String   @map("product_id") @db.Uuid
  quantity     Int      @default(1)
  role         String   @default("BUY") // BUY, GET, BUNDLE

  promotion    Promotion @relation(fields: [promotionId], references: [id])
  product      Product   @relation(fields: [productId], references: [id])

  @@unique([promotionId, productId, role])
  @@map("promotion_items")
}

model PromotionCategory {
  id           String   @id @default(uuid()) @db.Uuid
  promotionId  String   @map("promotion_id") @db.Uuid
  categoryId   String   @map("category_id") @db.Uuid
  role         String   @default("INCLUDE") // INCLUDE, EXCLUDE

  promotion    Promotion @relation(fields: [promotionId], references: [id])
  category     Category  @relation(fields: [categoryId], references: [id])

  @@unique([promotionId, categoryId])
  @@map("promotion_categories")
}

model PromotionBranch {
  id           String   @id @default(uuid()) @db.Uuid
  promotionId  String   @map("promotion_id") @db.Uuid
  branchId     String   @map("branch_id") @db.Uuid

  promotion    Promotion @relation(fields: [promotionId], references: [id])
  branch       Branch    @relation(fields: [branchId], references: [id])

  @@unique([promotionId, branchId])
  @@map("promotion_branches")
}

model CouponCode {
  id              String    @id @default(uuid()) @db.Uuid
  tenantId        String    @map("tenant_id") @db.Uuid
  promotionId     String    @map("promotion_id") @db.Uuid
  code            String
  type            String    @default("STANDARD") // STANDARD, ONE_TIME, REFERRAL, LOYALTY_REWARD
  usageLimit      Int?      @map("usage_limit")
  usageCount      Int       @map("usage_count") @default(0)
  perCustomerLimit Int?     @map("per_customer_limit")
  minOrderAmount  Int?      @map("min_order_amount") // cents
  startDate       DateTime  @map("start_date")
  endDate         DateTime? @map("end_date")
  isActive        Boolean   @map("is_active") @default(true)
  createdAt       DateTime  @default(now()) @map("created_at")
  updatedAt       DateTime  @updatedAt @map("updated_at")

  tenant          Tenant    @relation(fields: [tenantId], references: [id])
  promotion       Promotion @relation(fields: [promotionId], references: [id])
  redemptions     PromotionRedemption[]

  @@unique([tenantId, code])
  @@index([tenantId, isActive], map: "idx_coupon_codes_tenant_active")
  @@map("coupon_codes")
}

model Campaign {
  id          String   @id @default(uuid()) @db.Uuid
  tenantId    String   @map("tenant_id") @db.Uuid
  name        String
  description String?
  startDate   DateTime @map("start_date")
  endDate     DateTime @map("end_date")
  budgetLimit Int?     @map("budget_limit")
  budgetSpent Int      @map("budget_spent") @default(0)
  status      String   @default("DRAFT")
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")
  deletedAt   DateTime? @map("deleted_at")

  tenant      Tenant   @relation(fields: [tenantId], references: [id])
  promotions  CampaignPromotion[]

  @@index([tenantId, status], map: "idx_campaigns_tenant_status")
  @@map("campaigns")
}

model CampaignPromotion {
  id           String     @id @default(uuid()) @db.Uuid
  campaignId   String     @map("campaign_id") @db.Uuid
  promotionId  String     @map("promotion_id") @db.Uuid

  campaign     Campaign   @relation(fields: [campaignId], references: [id])
  promotion    Promotion  @relation(fields: [promotionId], references: [id])

  @@unique([campaignId, promotionId])
  @@map("campaign_promotions")
}

model Banner {
  id              String   @id @default(uuid()) @db.Uuid
  tenantId        String   @map("tenant_id") @db.Uuid
  title           String
  subtitle        String?
  imageUrl        String   @map("image_url")
  linkUrl         String?  @map("link_url")
  ctaText         String?  @map("cta_text")
  position        Int      @default(0)
  backgroundColor String?  @map("background_color")
  scope           String   @default("ALL_BRANCHES")
  startDate       DateTime? @map("start_date")
  endDate         DateTime? @map("end_date")
  isActive        Boolean  @map("is_active") @default(true)
  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt @map("updated_at")
  deletedAt       DateTime? @map("deleted_at")

  tenant          Tenant   @relation(fields: [tenantId], references: [id])
  bannerBranches  BannerBranch[]

  @@index([tenantId, isActive, position], map: "idx_banners_display")
  @@map("banners")
}

model BannerBranch {
  id        String  @id @default(uuid()) @db.Uuid
  bannerId  String  @map("banner_id") @db.Uuid
  branchId  String  @map("branch_id") @db.Uuid

  banner    Banner  @relation(fields: [bannerId], references: [id])
  branch    Branch  @relation(fields: [branchId], references: [id])

  @@unique([bannerId, branchId])
  @@map("banner_branches")
}

model PromotionRedemption {
  id                   String   @id @default(uuid()) @db.Uuid
  tenantId             String   @map("tenant_id") @db.Uuid
  promotionId          String   @map("promotion_id") @db.Uuid
  orderId              String   @map("order_id") @db.Uuid
  customerId           String?  @map("customer_id") @db.Uuid
  couponCodeId         String?  @map("coupon_code_id") @db.Uuid
  discountAmount       Int      @map("discount_amount") // cents
  calculationBreakdown Json     @map("calculation_breakdown") // full audit trail
  createdAt            DateTime @default(now()) @map("created_at")

  tenant               Tenant   @relation(fields: [tenantId], references: [id])
  promotion            Promotion @relation(fields: [promotionId], references: [id])
  order                Order    @relation(fields: [orderId], references: [id])
  customer             Customer? @relation(fields: [customerId], references: [id])
  couponCode           CouponCode? @relation(fields: [couponCodeId], references: [id])

  @@index([tenantId, promotionId, createdAt], map: "idx_redemptions_analytics")
  @@index([orderId], map: "idx_redemptions_order")
  @@map("promotion_redemptions")
}

model LoyaltyAccount {
  id           String   @id @default(uuid()) @db.Uuid
  tenantId     String   @map("tenant_id") @db.Uuid
  customerId   String   @map("customer_id") @db.Uuid
  points       Int      @default(0)
  tier         String   @default("BRONZE") // BRONZE, SILVER, GOLD, PLATINUM
  totalEarned  Int      @map("total_earned") @default(0)
  totalRedeemed Int     @map("total_redeemed") @default(0)
  createdAt    DateTime @default(now()) @map("created_at")
  updatedAt    DateTime @updatedAt @map("updated_at")

  tenant       Tenant   @relation(fields: [tenantId], references: [id])
  customer     Customer @relation(fields: [customerId], references: [id])
  transactions LoyaltyTransaction[]

  @@unique([tenantId, customerId])
  @@map("loyalty_accounts")
}

model LoyaltyTransaction {
  id            String   @id @default(uuid()) @db.Uuid
  accountId     String   @map("account_id") @db.Uuid
  type          String   // EARN, REDEEM, EXPIRE, ADJUSTMENT
  points        Int
  orderId       String?  @map("order_id") @db.Uuid
  description   String?
  expiresAt     DateTime? @map("expires_at")
  createdAt     DateTime @default(now()) @map("created_at")

  account       LoyaltyAccount @relation(fields: [accountId], references: [id])

  @@index([accountId, createdAt], map: "idx_loyalty_tx_account")
  @@map("loyalty_transactions")
}
```

---

## 15. UI/UX Proposal

### 15.1 Backoffice — Promotion Management

**Promotions List View:**
- Table with columns: Name, Type, Discount, Status, Budget Used, Redemptions, Actions
- Filter by: Status (Draft/Active/Paused/Completed), Type, Date Range
- Bulk actions: Activate, Deactivate, Delete
- Quick-create from template (Happy Hour, BOGO, Welcome Discount)

**Promotion Create/Edit Form:**
- Step 1: Basic Info (name, description, type)
- Step 2: Discount Configuration (type-specific fields)
- Step 3: Targeting (products, categories, branches)
- Step 4: Scheduling (date range, days of week, time windows)
- Step 5: Customer Eligibility (segments, rules)
- Step 6: Coupon Codes (optional, generate codes)
- Step 7: Budget & Limits
- Step 8: Preview & Confirm

**Campaign Dashboard:**
- Campaign cards with status badges
- Budget progress bar (green → yellow → red)
- Real-time redemption counter
- Quick actions: Pause, Resume, View Analytics

### 15.2 Customer-Facing — QR Menu

**Product Card Additions:**
- Promotion badge (e.g., "20% OFF", "BOGO")
- Strikethrough original price + discounted price
- Countdown timer badge for time-limited offers

**Cart/Checkout Additions:**
- Coupon code input field with validation
- Applied promotions summary with discount breakdown
- Loyalty points balance + "Redeem" toggle
- Savings summary ("You're saving $X.XX!")

**Promotions Page (new):**
- Banner carousel at top
- Promotion cards with countdown timers
- Copy-to-clipboard coupon codes
- Category-filtered view

### 15.3 Cashier Terminal

- Promotion badges on menu items
- Manual coupon code entry
- Loyalty points display for customer
- Discount breakdown on receipt

---

## 16. Implementation Phases

### Phase 1: Foundation (Weeks 1–3)

**Goal:** Core promotion infrastructure

| Task | Priority | Estimate |
|------|----------|----------|
| Prisma schema for promotions, coupon codes, banners | P0 | 3 days |
| Promotion CRUD API (backoffice) | P0 | 3 days |
| Promotion calculation engine (core logic) | P0 | 5 days |
| Checkout integration (discount application) | P0 | 3 days |
| Unit tests for calculation engine | P0 | 2 days |

**Deliverable:** Percentage discounts and fixed amount discounts work end-to-end.

### Phase 2: Advanced Promotions (Weeks 4–6)

**Goal:** BOGO, bundles, category promotions

| Task | Priority | Estimate |
|------|----------|----------|
| BOGO promotion type | P0 | 2 days |
| Buy X Get Y promotion type | P0 | 2 days |
| Bundle promotion type | P0 | 3 days |
| Category-wide promotions | P0 | 1 day |
| Promotion stacking engine | P0 | 3 days |
| Integration tests for all types | P0 | 2 days |

**Deliverable:** All promotion types functional with stacking rules.

### Phase 3: Coupons & Scheduling (Weeks 7–8)

**Goal:** Coupon codes and time-based rules

| Task | Priority | Estimate |
|------|----------|----------|
| Coupon code CRUD API | P0 | 2 days |
| Bulk code generation | P1 | 1 day |
| Code validation at checkout | P0 | 1 day |
| Scheduled promotion activation/deactivation | P0 | 2 days |
| Day-of-week and time-range rules | P0 | 2 days |
| Coupon code tests | P0 | 1 day |

**Deliverable:** Full coupon system with scheduling.

### Phase 4: Banners & Customer UX (Weeks 9–10)

**Goal:** Visual promotion system

| Task | Priority | Estimate |
|------|----------|----------|
| Banner CRUD API | P1 | 1 day |
| Banner display on QR menu | P1 | 2 days |
| Product promotion badges | P0 | 1 day |
| Cart discount preview | P0 | 1 day |
| Promotions page | P1 | 2 days |
| Countdown timer component | P1 | 1 day |

**Deliverable:** Complete customer-facing promotion UX.

### Phase 5: Loyalty & Campaigns (Weeks 11–13)

**Goal:** Loyalty program and campaign management

| Task | Priority | Estimate |
|------|----------|----------|
| Loyalty account model + API | P1 | 3 days |
| Points earning on order completion | P1 | 1 day |
| Points redemption at checkout | P1 | 2 days |
| Loyalty tier system | P2 | 2 days |
| Campaign CRUD API | P1 | 2 days |
| Campaign dashboard (backoffice) | P1 | 3 days |
| Campaign budget enforcement | P1 | 1 day |

**Deliverable:** Full loyalty program and campaign management.

### Phase 6: Analytics & Optimization (Weeks 14–15)

**Goal:** Analytics and performance optimization

| Task | Priority | Estimate |
|------|----------|----------|
| Redemption logging (analytics table) | P0 | 1 day |
| Promotion analytics API | P1 | 3 days |
| Analytics dashboard (backoffice) | P1 | 3 days |
| Exportable reports (CSV/Excel) | P2 | 1 day |
| Performance optimization (calculation caching) | P1 | 2 days |

**Deliverable:** Complete analytics and reporting.

### Phase 7: Polish & Launch (Week 16)

| Task | Priority | Estimate |
|------|----------|----------|
| End-to-end testing | P0 | 2 days |
| Security audit (coupon abuse, budget overflow) | P0 | 1 day |
| Documentation (API docs, user guide) | P1 | 1 day |
| Performance load testing | P1 | 1 day |

**Deliverable:** Production-ready Promotion Engine.

---

## Appendix: Glossary

| Term | Definition |
|------|-----------|
| **Promotion** | A rule that reduces the price of items or orders based on conditions |
| **Coupon Code** | A customer-facing code that triggers a promotion |
| **Campaign** | A container for related promotions, banners, and communications |
| **Stack Group** | A category that determines how promotions combine (MARKETING, COUPON, LOYALTY, BUNDLE) |
| **Redemption** | An instance of a promotion being applied to an order |
| **Budget Cap** | Maximum total discount amount before a promotion/campaign is automatically deactivated |
| **Loyalty Points** | Virtual currency earned on purchases and redeemable for discounts |
| **Tier** | A customer loyalty level that determines earning rates and perks |
| **Calculation Breakdown** | A JSON audit trail showing exactly how a discount was calculated |

---

*End of V2-PROMOTIONS.md*
