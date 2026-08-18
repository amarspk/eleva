-- Phase 4 — Loyalty system (tenant-scoped)
-- Restaurant-configured earn/redeem rules + per-customer transaction history.

CREATE TABLE "loyalty_rules" (
    "id"            UUID        NOT NULL,
    "tenantId"      UUID        NOT NULL,
    "earnRate"      DECIMAL(10,2) NOT NULL DEFAULT 0,
    "earnMinOrderAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "minRedeemPoints"    INTEGER     NOT NULL DEFAULT 0,
    "redeemRate"    DECIMAL(10,4) NOT NULL DEFAULT 0,
    "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMPTZ NOT NULL,
    CONSTRAINT "loyalty_rules_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "loyalty_rules_tenantid_key" UNIQUE ("tenantId"),
    CONSTRAINT "loyalty_rules_tenantid_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE
);

CREATE TABLE "loyalty_transactions" (
    "id"            UUID        NOT NULL,
    "tenantId"      UUID        NOT NULL,
    "customerId"    UUID        NOT NULL,
    "orderId"       UUID,
    "type"          VARCHAR(20) NOT NULL,
    "points"        INTEGER     NOT NULL,
    "balanceAfter"  INTEGER     NOT NULL,
    "description"   TEXT,
    "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "loyalty_transactions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "loyalty_tx_tenantid_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE,
    CONSTRAINT "loyalty_tx_customerid_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE,
    CONSTRAINT "loyalty_tx_orderid_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE SET NULL
);

CREATE INDEX "idx_loyalty_tx_tenant_customer" ON "loyalty_transactions" ("tenantId", "customerId");
CREATE INDEX "idx_loyalty_tx_customer" ON "loyalty_transactions" ("customerId");
CREATE INDEX "idx_loyalty_tx_order" ON "loyalty_transactions" ("orderId");
