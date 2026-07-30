-- DOC-002 §2.7: Database Triggers & Lifecycle Hooks
-- FIX (Runtime Defect R4, verified 2026-07-30): all payload references below now use the real
-- Prisma schema columns ("updatedAt", "tenantId", ...). Previously snake_case references
-- ("updated_at", "tenant_id", ...) matched no live column and made EVERY UPDATE fail on all
-- 8 triggered tables + broke the order-status audit log. Behaviour is unchanged.

-- 1. Generic updatedAt trigger function
CREATE OR REPLACE FUNCTION "update_updated_at"()
RETURNS TRIGGER AS $$
BEGIN
  NEW."updatedAt" = now();
  RETURN NEW;
END;
$$ LANGUAGE 'plpgsql';

-- 2. Apply updated_at trigger to all major tables with an updatedAt column
CREATE TRIGGER "set_updated_at" BEFORE UPDATE ON "tenants" FOR EACH ROW EXECUTE FUNCTION "update_updated_at"();
CREATE TRIGGER "set_updated_at" BEFORE UPDATE ON "users" FOR EACH ROW EXECUTE FUNCTION "update_updated_at"();
CREATE TRIGGER "set_updated_at" BEFORE UPDATE ON "branches" FOR EACH ROW EXECUTE FUNCTION "update_updated_at"();
CREATE TRIGGER "set_updated_at" BEFORE UPDATE ON "products" FOR EACH ROW EXECUTE FUNCTION "update_updated_at"();
CREATE TRIGGER "set_updated_at" BEFORE UPDATE ON "orders" FOR EACH ROW EXECUTE FUNCTION "update_updated_at"();
CREATE TRIGGER "set_updated_at" BEFORE UPDATE ON "customers" FOR EACH ROW EXECUTE FUNCTION "update_updated_at"();
CREATE TRIGGER "set_updated_at" BEFORE UPDATE ON "subscriptions" FOR EACH ROW EXECUTE FUNCTION "update_updated_at"();
CREATE TRIGGER "set_updated_at" BEFORE UPDATE ON "media" FOR EACH ROW EXECUTE FUNCTION "update_updated_at"();

-- Note: webhooks table has no updatedAt column, so no trigger is applied there.

-- 3. Audit log trigger function for order status changes
CREATE OR REPLACE FUNCTION "log_order_status_change"()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD."status" IS DISTINCT FROM NEW."status" THEN
    INSERT INTO "audit_logs" ("id", "tenantId", "userId", "action", "entityName", "entityId", "oldValues", "newValues", "ipAddress", "userAgent", "createdAt")
    VALUES (
      gen_random_uuid(),
      NEW."tenantId",
      NULL,
      'STATUS_CHANGE',
      'Order',
      NEW."id",
      jsonb_build_object('status', OLD."status"),
      jsonb_build_object('status', NEW."status"),
      'system',
      'database-trigger',
      now()
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE 'plpgsql';

-- 4. Apply audit trigger to orders
CREATE TRIGGER "log_status_change" AFTER UPDATE ON "orders" FOR EACH ROW EXECUTE FUNCTION "log_order_status_change"();
