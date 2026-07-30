-- DOC-002 §2.4: Indexing Strategy & Full-Text Search
--
-- FIX 2026-07-30 (PREX-MIG-003 / Runtime Defect R3): statements 3–4 referenced
-- quoted snake_case identifiers that do not exist; the real Prisma columns are
-- un-mapped camelCase ("tenantId", "branchId", "createdAt", "orderId",
-- "cookingStatus"). Corrected identifiers only — statements, index names and
-- index structures unchanged.

-- 1. Add generated tsvector column for full-text search on products
ALTER TABLE "products" ADD COLUMN "tsv_menu_search" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce("name", '')), 'A') ||
    setweight(to_tsvector('english', coalesce("description", '')), 'B')
  ) STORED;

-- 2. GIN index for full-text search queries on products
CREATE INDEX "idx_products_tsv_menu_search" ON "products" USING GIN ("tsv_menu_search");

-- 3. Composite index for KDS polling optimization on orders
CREATE INDEX "idx_orders_kds_polling" ON "orders" ("tenantId", "branchId", "status", "createdAt" DESC);

-- 4. Composite index for KDS on order_items
CREATE INDEX "idx_order_items_kds" ON "order_items" ("orderId", "cookingStatus");
