-- Phase 4 — Customer Account & Profile
-- Adds the Argon2id password hash for customer self-service accounts.
-- Nullable: legacy / guest-registered customer rows never set a password and
-- cannot sign in; only accounts created through the public customer
-- registration endpoint carry a hash.
ALTER TABLE "customers" ADD COLUMN "passwordHash" VARCHAR(255);
