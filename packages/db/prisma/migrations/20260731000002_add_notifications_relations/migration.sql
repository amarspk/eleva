-- Model the notifications table (Sprint 2 Task 7 — SPEC-DRIFT: the table had
-- no FK to tenants and no repository). Add the tenant FK (cascade on tenant
-- deletion) and a tenant index; the column already exists.

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "idx_notifications_tenant" ON "notifications"("tenantId");
