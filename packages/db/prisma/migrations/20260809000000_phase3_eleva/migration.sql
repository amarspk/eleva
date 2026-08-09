-- Phase 3 Eleva: preorder + design system
ALTER TABLE "orders" ADD COLUMN "isPreorder" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "orders" ADD COLUMN "scheduledAt" TIMESTAMPTZ;
ALTER TABLE "orders" ADD COLUMN "preorderStatus" VARCHAR(20);
CREATE INDEX "idx_orders_preorder" ON "orders"("isPreorder", "scheduledAt");

CREATE TABLE "tenant_designs" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL UNIQUE REFERENCES "tenants"("id") ON DELETE CASCADE,
  "draft" JSONB NOT NULL DEFAULT '{}',
  "published" JSONB NOT NULL DEFAULT '{}',
  "version" INTEGER NOT NULL DEFAULT 1,
  "publishedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE "tenant_design_versions" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "version" INTEGER NOT NULL,
  "data" JSONB NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE("tenantId","version")
);
CREATE INDEX "idx_design_versions_tenant" ON "tenant_design_versions"("tenantId");

CREATE TABLE "platform_designs" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "draft" JSONB NOT NULL DEFAULT '{}',
  "published" JSONB NOT NULL DEFAULT '{}',
  "version" INTEGER NOT NULL DEFAULT 1,
  "publishedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO "platform_designs" ("draft","published") VALUES ('{}','{}') ON CONFLICT DO NOTHING;
