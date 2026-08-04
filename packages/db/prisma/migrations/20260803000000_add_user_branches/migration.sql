-- AUDIT-004 (User Management) — branch scoping for staff users.
--
-- DOC-005 §4.2 requires a staff member's access token to carry the list of
-- branches they are assigned to, so the dynamic scoping interceptor can
-- validate the X-Branch-ID header against real assignments. No User<->Branch
-- link existed, so the `branches` claim consumed by CaslAbilityFactory
-- (BRANCH_MANAGER `$nin` rules) had no persistent source and was always empty.
--
-- tenantId is denormalized onto the row so the assignment itself is
-- tenant-owned and can never bridge two tenants; the composite PK makes a
-- duplicate assignment impossible.

-- CreateTable
CREATE TABLE "user_branches" (
    "userId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "assignedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_branches_pkey" PRIMARY KEY ("userId","branchId")
);

-- CreateIndex
CREATE INDEX "idx_user_branches_branch_id" ON "user_branches"("branchId");

-- CreateIndex
CREATE INDEX "idx_user_branches_tenant_id" ON "user_branches"("tenantId");

-- AddForeignKey
ALTER TABLE "user_branches" ADD CONSTRAINT "user_branches_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_branches" ADD CONSTRAINT "user_branches_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_branches" ADD CONSTRAINT "user_branches_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
