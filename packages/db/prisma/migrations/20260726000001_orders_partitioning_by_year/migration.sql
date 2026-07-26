-- ==============================================================================
-- DOC-001 §1.5 — Historical Partitioning for orders & order_items by year
-- ==============================================================================
-- Prisma does not natively support PostgreSQL table partitioning.
-- This migration converts the orders and order_items tables to RANGE-partitioned
-- tables on the created_at timestamp, partitioned by calendar year.
--
-- DEPLOYMENT: Run during a maintenance window. Back up data before executing.
-- ROLLBACK:   Drop partitioned tables and recreate from Prisma migration baseline.
-- ==============================================================================

-- 1. Create yearly partition helper function
CREATE OR REPLACE FUNCTION create_yearly_partitions(
  p_table_name TEXT,
  p_start_year INT,
  p_end_year INT
) RETURNS VOID AS $$
DECLARE
  yr INT;
  partition_name TEXT;
  start_date DATE;
  end_date DATE;
BEGIN
  FOR yr IN p_start_year..p_end_year LOOP
    partition_name := p_table_name || '_' || yr;
    start_date := make_date(yr, 1, 1);
    end_date := make_date(yr + 1, 1, 1);

    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS %I PARTITION OF %I FOR VALUES FROM (%L) TO (%L)',
      partition_name, p_table_name, start_date, end_date
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- 2. Create partitioned orders table
CREATE TABLE orders_partitioned (
  LIKE orders INCLUDING DEFAULTS INCLUDING CONSTRAINTS
) PARTITION BY RANGE (created_at);

-- 3. Create partitioned order_items table
CREATE TABLE order_items_partitioned (
  LIKE order_items INCLUDING DEFAULTS INCLUDING CONSTRAINTS
) PARTITION BY RANGE (created_at);

-- 4. Generate partitions for years 2024–2030 (7-year window)
SELECT create_yearly_partitions('orders_partitioned', 2024, 2030);
SELECT create_yearly_partitions('order_items_partitioned', 2024, 2030);

-- 5. Copy existing data into partitioned tables
INSERT INTO orders_partitioned SELECT * FROM orders;
INSERT INTO order_items_partitioned SELECT * FROM order_items;

-- 6. Validate row counts match
DO $$
DECLARE
  v_orders_orig BIGINT;
  v_orders_part BIGINT;
  v_items_orig  BIGINT;
  v_items_part  BIGINT;
BEGIN
  SELECT COUNT(*) INTO v_orders_orig FROM orders;
  SELECT COUNT(*) INTO v_orders_part FROM orders_partitioned;
  SELECT COUNT(*) INTO v_items_orig  FROM order_items;
  SELECT COUNT(*) INTO v_items_part  FROM order_items_partitioned;

  IF v_orders_orig != v_orders_part THEN
    RAISE EXCEPTION 'orders row count mismatch: original=%, partitioned=%', v_orders_orig, v_orders_part;
  END IF;
  IF v_items_orig != v_items_part THEN
    RAISE EXCEPTION 'order_items row count mismatch: original=%, partitioned=%', v_items_orig, v_items_part;
  END IF;

  RAISE NOTICE 'Partition validation passed — orders: %, order_items: %', v_orders_orig, v_items_orig;
END $$;

-- 7. Swap tables (atomic rename)
BEGIN;
  ALTER TABLE orders RENAME TO orders_backup;
  ALTER TABLE orders_partitioned RENAME TO orders;

  ALTER TABLE order_items RENAME TO order_items_backup;
  ALTER TABLE order_items_partitioned RENAME TO order_items;

  -- Rebuild foreign key references from dependent tables
  ALTER TABLE kitchen_queues DROP CONSTRAINT IF EXISTS kitchen_queues_orderId_fkey;
  ALTER TABLE kitchen_queues ADD CONSTRAINT kitchen_queues_orderId_fkey
    FOREIGN KEY ("orderId") REFERENCES orders("id") ON DELETE CASCADE;

  ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_orderId_fkey;
  ALTER TABLE payments ADD CONSTRAINT payments_orderId_fkey
    FOREIGN KEY ("orderId") REFERENCES orders("id") ON DELETE CASCADE;

  ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_orderId_fkey;
  ALTER TABLE invoices ADD CONSTRAINT invoices_orderId_fkey
    FOREIGN KEY ("orderId") REFERENCES orders("id") ON DELETE RESTRICT;

  ALTER TABLE order_items DROP CONSTRAINT IF EXISTS order_items_orderId_fkey;
  ALTER TABLE order_items ADD CONSTRAINT order_items_orderId_fkey
    FOREIGN KEY ("orderId") REFERENCES orders("id") ON DELETE CASCADE;
COMMIT;

-- 8. Rebuild indexes on partitioned tables (indexes do not inherit from LIKE)
CREATE INDEX idx_orders_partitioned_tenant_branch ON orders("tenantId", "branchId");
CREATE INDEX idx_orders_partitioned_customer ON orders("customerId");
CREATE INDEX idx_orders_partitioned_table ON orders("tableId");
CREATE INDEX idx_orders_partitioned_status ON orders("status");

CREATE INDEX idx_order_items_partitioned_parent ON order_items("orderId");
CREATE INDEX idx_order_items_partitioned_product ON order_items("productId");

-- 9. Create a maintenance function for adding future year partitions
--    Note: table names are 'orders' and 'order_items' after the swap in step 7
CREATE OR REPLACE FUNCTION ensure_order_partitions(p_year INT) RETURNS VOID AS $$
BEGIN
  PERFORM create_yearly_partitions('orders', p_year, p_year);
  PERFORM create_yearly_partitions('order_items', p_year, p_year);
  RAISE NOTICE 'Created partitions for year %', p_year;
END;
$$ LANGUAGE plpgsql;

-- 10. Clean up backup tables (run AFTER validation in production)
-- DROP TABLE IF EXISTS orders_backup;
-- DROP TABLE IF EXISTS order_items_backup;
