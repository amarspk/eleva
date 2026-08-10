-- AUDIT-002 Finding #3 — wallet payment idempotency.
--
-- A provider charge id must map to AT MOST ONE payments row. The pre-fix
-- code had no uniqueness anywhere: identical double-submits created two
-- provider charges and two PENDING rows, and a paid order could be charged
-- again. The application now (a) sends a deterministic provider idempotency
-- key (Tap reference.idempotent / Stripe Idempotency-Key), (b) deduplicates
-- post-provider, and (c) reuses the existing row on a P2002 race. This index
-- is the database-level backstop for (b)/(c).
--
-- schema.prisma cannot express partial indexes, so this lives here as raw
-- SQL (same convention as 20260804000000_soft_delete_partial_unique_and_crud_permissions);
-- the Payment model carries an annotation comment pointing here.

-- Defensive pre-flight: the pre-fix code could already have produced
-- duplicate rows for the same charge (identical double-submits). Keep the
-- EARLIEST row per transactionReference and remove later duplicates so the
-- unique index can be created. No-op on clean data. POS references are
-- excluded (they are deterministic by design and keep their replay
-- behaviour).
DELETE FROM "payments" a
USING "payments" b
WHERE a."transactionReference" IS NOT NULL
  AND a."transactionReference" NOT LIKE 'pos:%'
  AND a."transactionReference" = b."transactionReference"
  AND (a."createdAt" > b."createdAt"
       OR (a."createdAt" = b."createdAt" AND a."id" > b."id"));

-- Non-POS references (tap_payments:chg_…, stripe:pi_…) are unique provider
-- charge ids; NULLs are allowed (PostgreSQL unique semantics) and multiple
-- NULLs remain legal for pre-webhook legacy rows.
CREATE UNIQUE INDEX "idx_payments_reference_unique"
  ON "payments"("transactionReference")
  WHERE "transactionReference" IS NOT NULL AND "transactionReference" NOT LIKE 'pos:%';
