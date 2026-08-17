# Zayjar Platform — Local Demo Environment

## One Command to Start Everything

```bash
bash scripts/demo.sh
```

This automatically:
1. Starts PostgreSQL (port 5432)
2. Creates/verifies the `zayjar_local` database
3. Applies the Prisma schema
4. Seeds all demo data (if not already seeded)
5. Builds API and Backoffice (if not already built)
6. Starts API on port 8000
7. Starts Backoffice on port 3001
8. Starts QR Menu (public website) on port 3000

---

## URLs

| Service | URL |
|---------|-----|
| **Backoffice** (admin dashboard) | http://localhost:3001 |
| **QR Menu** (public restaurant website) | http://localhost:3000 |
| **API** | http://localhost:8000 |
| **API Health** | http://localhost:8000/health |

---

## Demo Accounts

### Platform Owner (system-wide admin)
| Field | Value |
|-------|-------|
| Email | `platform@zayjar.ai` |
| Password | `Platform123!` |
| Tenant | None (`tenantId=NULL`) — sees all tenants' data |
| Roles | `PLATFORM_OWNER` |
| Permissions | 40 (all platform permissions) |
| Can access | Admin metrics, all tenants, all data across tenants |

### Restaurant Owner — Al-Baik
| Field | Value |
|-------|-------|
| Email | `admin@albaik.com` |
| Password | `Demo1234!` |
| Tenant | Al-Baik (`80a00898-782c-4a6e-8bad-880e8f4f7977`) |
| Roles | `RESTAURANT_OWNER` |
| Permissions | 40 (full access) |

### Manager — Al-Baik
| Field | Value |
|-------|-------|
| Email | `manager@albaik.com` |
| Password | `Demo1234!` |
| Roles | `MANAGER` |
| Assigned branches | Riyadh - Olaya **and** Jeddah - Corniche (explicit `user_branches`) |
| Can access | Menu, orders, branches, customers (read/write) — **scoped to assigned branches only** |

### Cashier — Al-Baik
| Field | Value |
|-------|-------|
| Email | `cashier@albaik.com` |
| Password | `Demo1234!` |
| Roles | `CASHIER` |
| Assigned branch | Riyadh - Olaya only (`user_branches`) |
| Can access | Orders (read/create/update), menu (read), payments, tables (read) — **Riyadh branch only** |

### Kitchen Staff — Al-Baik
| Field | Value |
|-------|-------|
| Email | `kitchen@albaik.com` |
| Password | `Demo1234!` |
| Roles | `KITCHEN_STAFF` |
| Assigned branch | Riyadh - Olaya only (`user_branches`) |
| Can access | KDS tickets, order status — **Riyadh branch only** |

> **Phase 4 P0 — branch scoping.** The JWT issued at login carries the user's
> assigned branch IDs (`user_branches`). CASHIER / KITCHEN_STAFF /
> BRANCH_MANAGER are restricted server-side (CASL ABAC + order/KDS service
> checks) to those branches: they cannot read, create, update, cancel or list
> orders, and cannot view KDS tickets, for any other branch. Owners
> (`admin@albaik.com`, `admin@tokyoramen.com`) and the Platform Owner have no
> `user_branches` rows and keep the canonical tenant-wide / platform-wide
> behavior. `branchId` supplied by a client is never trusted on its own.

### Restaurant Owner — Tokyo Ramen
| Field | Value |
|-------|-------|
| Email | `admin@tokyoramen.com` |
| Password | `Demo1234!` |
| Tenant | Tokyo Ramen (`930c9c66-06df-4029-8ee8-ac4d0046c6af`) |
| Roles | `RESTAURANT_OWNER` |
| Permissions | 40 (full access) |

---

## Tenant IDs (for API `X-Tenant-ID` header)

| Tenant | ID |
|--------|---|
| Al-Baik | `80a00898-782c-4a6e-8bad-880e8f4f7977` |
| Tokyo Ramen | `930c9c66-06df-4029-8ee8-ac4d0046c6af` |

---

## Demo Data Summary

| Entity | Count | Details |
|--------|------|---------|
| Subscription Plans | 3 | Starter, Growth, Enterprise |
| Tenants | 2 | Al-Baik (ACTIVE), Tokyo Ramen (TRIALING) |
| Users | 6 | Platform Owner + 4 Al-Baik staff + 1 Tokyo owner |
| Roles | 5 | PLATFORM_OWNER + RESTAURANT_OWNER, MANAGER, CASHIER, KITCHEN_STAFF (Al-Baik) |
| Permissions | 42 | Full CASL-compatible set (create/read/update/delete vocabulary) |
| Role-Permission mappings | 122 | Owner=42, Platform=42, Manager=26, Cashier=9, Kitchen=3 |
| Restaurants | 2 | Al-Baik, Tokyo Ramen |
| Branches | 3 | Riyadh Olaya, Jeddah Corniche, Shibuya |
| Tables | 24 | 10 + 6 + 8 across branches |
| Categories | 5 | Chicken, Sides, Beverages, Ramen, Appetizers |
| Products | 10 | 7 Al-Baik items + 3 Tokyo items |
| Product Sizes | 20 | Regular + Large for each product |
| Customers | 4 | 3 Al-Baik + 1 Tokyo |
| Orders | 3 | Completed, Preparing, Pending |
| Order Items | 5 | Across 3 orders |
| Discounts | 2 | SAVE10 (10%), FIXED5 (5 SAR off) |
| Payments | 1 | Cash payment for completed order |
| Audit Logs | 2 | Tenant create, Branch update |

---

## What You Can Test

### Platform Owner
- ✅ Login as platform admin
- ✅ View admin metrics (`GET /api/v1/admin/tenants/metrics`)
- ✅ View all tenants
- ✅ Manage subscriptions
- ✅ Access any tenant's data

### Restaurant Owner (Al-Baik)
- ✅ Login to Backoffice
- ✅ **Products** — List (7), Create, Update, Delete
- ✅ **Categories** — List (3), Create, Update, Delete
- ✅ **Branches** — List (2), Create, Update, Delete
- ✅ **Tables** — List (10 per branch), Create, Update, Delete
- ✅ **Customers** — List (3), Create, Update, Delete
- ✅ **Orders** — List (3), Create, Update status
- ✅ **Staff/Users** — List, Create, Update roles
- ✅ **Tenant settings** — Read, Update
- ✅ **Discounts** — Active (SAVE10, FIXED5)
- ✅ **Roles & Permissions** — 40 permissions on RESTAURANT_OWNER

### Restaurant Owner (Tokyo Ramen)
- ✅ Login with Tokyo tenant context
- ✅ Manage Tokyo-specific products, branches, etc.

### Public Website (QR Menu)
- ✅ Browse menu without authentication
- ✅ View table info via QR token
- ✅ Place orders as guest

---

## API Quick Test (curl)

```bash
# Login as Restaurant Owner (Al-Baik)
TOKEN=$(curl -s http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -H "X-Tenant-ID: 80a00898-782c-4a6e-8bad-880e8f4f7977" \
  -d '{"email":"admin@albaik.com","password":"Demo1234!"}' \
  | python3 -c "import json,sys; print(json.loads(sys.stdin.read())['accessToken'])")

# List products
curl -s http://localhost:8000/api/v1/menu/products \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Tenant-ID: 80a00898-782c-4a6e-8bad-880e8f4f7977"

# List branches
curl -s http://localhost:8000/api/v1/branches \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Tenant-ID: 80a00898-782c-4a6e-8bad-880e8f4f7977"

# List orders
curl -s http://localhost:8000/api/v1/orders \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Tenant-ID: 80a00898-782c-4a6e-8bad-880e8f4f7977"

# Admin metrics (Platform Owner)
PTOKEN=$(curl -s http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"platform@zayjar.ai","password":"Platform123!"}' \
  | python3 -c "import json,sys; print(json.loads(sys.stdin.read())['accessToken'])")

curl -s http://localhost:8000/api/v1/admin/tenants/metrics \
  -H "Authorization: Bearer $PTOKEN"
```

---

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  QR Menu    │     │  Backoffice │     │   Your      │
│  :3000      │     │  :3001      │     │   curl      │
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       │                   │                   │
       │  NEXT_PUBLIC_     │  /api/* rewrite  │
       │  API_URL          │  to :8000        │
       └───────────────────┴───────────────────┘
                           │
                    ┌──────▼──────┐
                    │  API :8000  │
                    │  NestJS     │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │ PostgreSQL  │
                    │ :5432       │
                    └─────────────┘
```

All passwords use real **argon2id** hashes. Login works immediately — no mock fallback.
