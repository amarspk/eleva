-- ELEVA AI Agent V1 Slice 1 — platform-owned persistence + agent:* permissions.
-- Deterministic UUIDs from sha256("zayjar:permission:agent:<act>") with
-- RFC-4122 version/variant nibble adjustment.

CREATE TABLE "agent_sessions" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL DEFAULT 'Agent session',
    "status" VARCHAR(20) NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "agent_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "agent_messages" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "role" VARCHAR(20) NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "agent_messages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "agent_actions" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "tool" VARCHAR(80) NOT NULL,
    "input" JSONB,
    "result" JSONB,
    "status" VARCHAR(20) NOT NULL,
    "sensitivity" VARCHAR(20) NOT NULL DEFAULT 'SAFE',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "agent_actions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "agent_approvals" (
    "id" UUID NOT NULL,
    "actionId" UUID NOT NULL,
    "approverUserId" UUID NOT NULL,
    "decision" VARCHAR(20) NOT NULL,
    "reason" TEXT,
    "decidedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "agent_approvals_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_agent_sessions_user" ON "agent_sessions"("userId");
CREATE INDEX "idx_agent_sessions_status" ON "agent_sessions"("status");
CREATE INDEX "idx_agent_messages_session" ON "agent_messages"("sessionId");
CREATE INDEX "idx_agent_actions_session" ON "agent_actions"("sessionId");
CREATE INDEX "idx_agent_actions_status" ON "agent_actions"("status");
CREATE INDEX "idx_agent_approvals_action" ON "agent_approvals"("actionId");

ALTER TABLE "agent_sessions" ADD CONSTRAINT "agent_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_messages" ADD CONSTRAINT "agent_messages_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "agent_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_actions" ADD CONSTRAINT "agent_actions_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "agent_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_approvals" ADD CONSTRAINT "agent_approvals_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "agent_actions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_approvals" ADD CONSTRAINT "agent_approvals_approverUserId_fkey" FOREIGN KEY ("approverUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "permissions" ("id", "action", "resource", "description", "createdAt")
VALUES
  ('f6262c6c-e4f3-44fa-9da1-a0d2419f4247', 'read', 'agent', 'View ELEVA Agent sessions and reports', CURRENT_TIMESTAMP),
  ('f37db619-1b5c-4296-bdd7-0870baf560e5', 'create', 'agent', 'Create ELEVA Agent sessions and invoke safe tools', CURRENT_TIMESTAMP),
  ('a4ef38b5-7df9-4309-8cee-d7860d02a143', 'update', 'agent', 'Approve or reject ELEVA Agent actions', CURRENT_TIMESTAMP)
ON CONFLICT ("action", "resource") DO NOTHING;

-- PLATFORM_OWNER only. Restaurant roles must not receive agent:*.
INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."name" = 'PLATFORM_OWNER'
  AND p."resource" = 'agent'
  AND p."action" IN ('read', 'create', 'update')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
