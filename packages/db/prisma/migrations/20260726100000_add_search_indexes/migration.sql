-- DOC-002 §2.4: Indexing Strategy & Full-Text Search

-- 1. Add generated tsvector column for full-text search on products
ALTER TABLE "products" ADD COLUMN "tsv_menu_search" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce("name", '')), 'A') ||
    setweight(to_tsvector('english', coalesce("description", '')), 'B')
  ) STORED;

-- 2. GIN index for full-text search queries on products
CREATE INDEX "idx_products_tsv_menu_search" ON "products" USING GIN ("tsv_menu_search");

-- 3. Composite index for KDS polling optimization on orders
CREATE INDEX "idx_orders_kds_polling" ON "orders" ("tenant_id", "branch_id", "status", "created_at" DESC);

-- 4. Composite index for KDS on order_items
CREATE INDEX "idx_order_items_kds" ON "order_items" ("order_id", "cooking_status");
