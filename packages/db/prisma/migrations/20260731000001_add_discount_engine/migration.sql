-- Discount engine (Sprint 2 Task 4 — replace the `discountAmount = 0.00`
-- placeholder with a real, tenant-scoped discount model + pricing computation).
--
-- Order keeps a snapshot of the discount code (display/history) and a nullable
-- FK to the discount row (SetNull so deleting a discount never cascades into
-- order history). The PaymentMethodType-style enum is created here; discounts
-- are validated and their usage incremented atomically inside the checkout
-- transaction (see order.service.ts createOrder).

-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('PERCENTAGE', 'FIXED_AMOUNT');

-- CreateTable
CREATE TABLE "discounts" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100),
    "description" TEXT,
    "type" "DiscountType" NOT NULL,
    "value" DECIMAL(10,2) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "validFrom" TIMESTAMPTZ,
    "validTo" TIMESTAMPTZ,
    "usageLimit" INTEGER,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "discounts_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "discounts" ADD CONSTRAINT "discounts_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE UNIQUE INDEX "idx_discounts_tenant_code" ON "discounts"("tenantId", "code");
CREATE INDEX "idx_discounts_tenant" ON "discounts"("tenantId");

-- AlterTable (orders)
ALTER TABLE "orders" ADD COLUMN "discountId" UUID;
ALTER TABLE "orders" ADD COLUMN "discountCode" VARCHAR(50);

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_discountId_fkey" FOREIGN KEY ("discountId") REFERENCES "discounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "idx_orders_discount" ON "orders"("discountId");
