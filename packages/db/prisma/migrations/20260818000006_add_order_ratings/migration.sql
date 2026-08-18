-- Phase 4 — Ratings & Feedback
-- One rating per order (unique constraint on orderId)
CREATE TABLE "order_ratings" (
    "id"          UUID        NOT NULL,
    "tenantId"    UUID        NOT NULL,
    "customerId"  UUID        NOT NULL,
    "orderId"     UUID        NOT NULL,
    "rating"      INTEGER     NOT NULL,
    "feedback"    TEXT,
    "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "order_ratings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "order_ratings_orderid_key" UNIQUE ("orderId"),
    CONSTRAINT "or_tenantid_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE,
    CONSTRAINT "or_customerid_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE,
    CONSTRAINT "or_orderid_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE
);
CREATE INDEX "idx_ratings_tenant" ON "order_ratings" ("tenantId");
CREATE INDEX "idx_ratings_customer" ON "order_ratings" ("customerId");
CREATE INDEX "idx_ratings_tenant_rating" ON "order_ratings" ("tenantId", "rating");
