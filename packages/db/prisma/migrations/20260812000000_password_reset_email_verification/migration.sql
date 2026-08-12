-- AUDIT-005 — password reset + email verification infrastructure.
--
-- Adds the five User fields required by the approved scope:
--   resetTokenHash / resetTokenExpiry          — one-time password-reset token
--   emailVerified                              — email ownership state (defaults false)
--   emailVerificationTokenHash / Expiry        — one-time email-verification token
--
-- Security contract: ONLY SHA-256 hex digests (64 chars) of the one-time
-- tokens are persisted — never the raw tokens, which exist solely inside the
-- emailed links. Token hashes are cleared after successful use (one-time
-- use) and rejected after their expiry timestamp.
--
-- Column naming follows the init migration's convention (quoted camelCase).
-- No indexes are added: lookups by token hash and by email are low-volume
-- public auth paths; the users PK/email index already covers email lookups.

ALTER TABLE "users"
  ADD COLUMN "resetTokenHash" VARCHAR(64),
  ADD COLUMN "resetTokenExpiry" TIMESTAMPTZ,
  ADD COLUMN "emailVerified" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "emailVerificationTokenHash" VARCHAR(64),
  ADD COLUMN "emailVerificationTokenExpiry" TIMESTAMPTZ;
