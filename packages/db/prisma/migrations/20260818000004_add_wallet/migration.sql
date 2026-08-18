-- Phase 4 — Customer Wallet / Store Credit
-- Tenant-scoped wallet balance + immutable transaction ledger

CREATE TABLE "customer_wallets" (
    "id"            UUID        NOT NULL,
    "tenantId"      UUID        NOT NULL,
    "customerId"    UUID        NOT NULL,
    "balance"       DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMPTZ NOT NULL,
    CONSTRAINT "customer_wallets_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "customer_wallets_customerid_key" UNIQUE ("customerId"),
    CONSTRAINT "customer_wallets_tenantid_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE,
    CONSTRAINT "customer_wallets_customerid_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE
);

CREATE INDEX "idx_wallet_tenant" ON "customer_wallets" ("tenantId");

CREATE TABLE "wallet_transactions" (
    "id"            UUID        NOT NULL,
    "tenantId"      UUID        NOT NULL,
    "customerId"    UUID        NOT NULL,
    "walletId"      UUID        NOT NULL,
    "type"          VARCHAR(30) NOT NULL,
    "amount"        DECIMAL(10,2) NOT NULL,
    "balanceAfter"  DECIMAL(10,2) NOT NULL,
    "orderId"       UUID,
    "description"   TEXT,
    "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "wallet_transactions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "wallet_tx_tenantid_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE,
    CONSTRAINT "wallet_tx_customerid_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE,
    CONSTRAINT "wallet_tx_walletid_fkey" FOREIGN KEY ("walletId") REFERENCES "customer_wallets"("id") ON DELETE CASCADE,
    CONSTRAINT "wallet_tx_orderid_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE SET NULL
);

CREATE INDEX "idx_wlt_tx_wallet" ON "wallet_transactions" ("walletId");
CREATE INDEX "idx_wlt_tx_customer" ON "wallet_transactions" ("customerId");
CREATE INDEX "idx_wlt_tx_order" ON "wallet_transactions" ("orderId");

ALTER TABLE "orders" ADD COLUMN "walletUsed" DECIMAL(10,2) NOT NULL DEFAULT 0.00;
