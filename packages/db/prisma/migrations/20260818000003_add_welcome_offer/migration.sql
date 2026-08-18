-- Phase 4 — Promotions & Welcome Offers
-- Tenant-scoped welcome offer config + per-customer redemption tracking

CREATE TABLE "welcome_offer_configs" (
    "id"              UUID        NOT NULL,
    "tenantId"        UUID        NOT NULL,
    "enabled"         BOOLEAN     NOT NULL DEFAULT false,
    "discountType"    TEXT        NOT NULL,
    "discountValue"   DECIMAL(10,2) NOT NULL,
    "minOrderAmount"  DECIMAL(10,2) NOT NULL DEFAULT 0,
    "createdAt"       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMPTZ NOT NULL,
    CONSTRAINT "welcome_offer_configs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "welcome_offer_configs_tenantid_key" UNIQUE ("tenantId"),
    CONSTRAINT "welcome_offer_configs_tenantid_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE
);

CREATE TABLE "welcome_redemptions" (
    "id"            UUID        NOT NULL,
    "tenantId"      UUID        NOT NULL,
    "customerId"    UUID        NOT NULL,
    "orderId"       UUID        NOT NULL,
    "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "welcome_redemptions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "welcome_redemptions_customerid_key" UNIQUE ("customerId"),
    CONSTRAINT "welcome_redemptions_tenantid_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE,
    CONSTRAINT "welcome_redemptions_customerid_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE,
    CONSTRAINT "welcome_redemptions_orderid_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE
);

CREATE INDEX "idx_welcome_redemption_tenant_customer" ON "welcome_redemptions" ("tenantId", "customerId");
CREATE INDEX "idx_welcome_redemption_customer" ON "welcome_redemptions" ("customerId");
