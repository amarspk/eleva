-- DOC-002 §2.7: Database Triggers & Lifecycle Hooks

-- 1. Generic updated_at trigger function
CREATE OR REPLACE FUNCTION "update_updated_at"()
RETURNS TRIGGER AS $$
BEGIN
  NEW."updated_at" = now();
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
    INSERT INTO "audit_logs" ("id", "tenant_id", "user_id", "action", "entity_name", "entity_id", "old_values", "new_values", "ip_address", "user_agent", "created_at")
    VALUES (
      gen_random_uuid(),
      NEW."tenant_id",
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
