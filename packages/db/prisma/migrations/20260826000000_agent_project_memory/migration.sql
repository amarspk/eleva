-- M1 persistent Agent project memory — platform-owned, no tenantId.

CREATE TABLE "agent_project_memory" (
    "id" UUID NOT NULL,
    "key" VARCHAR(80) NOT NULL,
    "value" TEXT NOT NULL,
    "source" VARCHAR(200) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'VERIFIED',
    "updatedByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "agent_project_memory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "agent_project_memory_key_key" ON "agent_project_memory"("key");
CREATE INDEX "idx_agent_project_memory_updated" ON "agent_project_memory"("updatedAt");

ALTER TABLE "agent_project_memory"
  ADD CONSTRAINT "agent_project_memory_updatedByUserId_fkey"
  FOREIGN KEY ("updatedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
