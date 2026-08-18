-- Phase 4 — Complaints / Customer Support
-- Tenant-scoped customer complaints with message threads

CREATE TABLE "customer_complaints" (
    "id"          UUID        NOT NULL,
    "tenantId"    UUID        NOT NULL,
    "customerId"  UUID        NOT NULL,
    "orderId"     UUID,
    "subject"     VARCHAR(255) NOT NULL,
    "description" TEXT        NOT NULL,
    "status"      VARCHAR(20) NOT NULL DEFAULT 'NEW',
    "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMPTZ NOT NULL,
    "resolvedAt"  TIMESTAMPTZ,
    "closedAt"    TIMESTAMPTZ,
    CONSTRAINT "customer_complaints_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "complaints_tenantid_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE,
    CONSTRAINT "complaints_customerid_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE,
    CONSTRAINT "complaints_orderid_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE SET NULL
);

CREATE INDEX "idx_complaints_tenant" ON "customer_complaints" ("tenantId");
CREATE INDEX "idx_complaints_customer" ON "customer_complaints" ("customerId");
CREATE INDEX "idx_complaints_status" ON "customer_complaints" ("status");

CREATE TABLE "complaint_messages" (
    "id"          UUID        NOT NULL,
    "complaintId" UUID        NOT NULL,
    "authorType"  VARCHAR(10) NOT NULL,
    "message"     TEXT        NOT NULL,
    "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "complaint_messages_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "messages_complaintid_fkey" FOREIGN KEY ("complaintId") REFERENCES "customer_complaints"("id") ON DELETE CASCADE
);

CREATE INDEX "idx_complaint_messages_parent" ON "complaint_messages" ("complaintId");
