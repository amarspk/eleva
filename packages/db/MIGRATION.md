# Zero-Downtime Database Migration Strategy

> DOC-010 §10.3 — Production-safe, forward-only migration workflow for the Zayjar PostgreSQL database managed by Prisma ORM.

## Table of Contents

1. [Principles](#principles)
2. [Expand → Migrate → Contract](#expand--migrate--contract)
3. [Migration Naming Convention](#migration-naming-convention)
4. [Pre-Deployment Checklist](#pre-deployment-checklist)
5. [Pre-Deployment Validation](#pre-deployment-validation)
6. [Backup Verification](#backup-verification)
7. [Migration Execution](#migration-execution)
8. [Post-Deployment Verification](#post-deployment-verification)
9. [Rollback Procedure](#rollback-procedure)
10. [Large-Table Migration Guidance](#large-table-migration-guidance)
11. [Partitioned Table Migrations](#partitioned-table-migrations)
12. [CI Integration](#ci-integration)

---

## Principles

1. **Zero downtime.** No migration may require an application restart that causes user-visible downtime.
2. **Forward-only.** Migrations are never modified after merge to `main`. Corrections are applied via new forward migrations.
3. **Backward-compatible.** Every migration must be compatible with the current running code AND the next release simultaneously.
4. **Idempotent verification.** Post-deployment checks can be run repeatedly without side effects.
5. **Backup before risk.** A verified backup must exist before any destructive migration is applied.

---

## Expand → Migrate → Contract

Every schema change that modifies or removes an existing column follows a three-phase lifecycle executed across **two or more releases**.

### Phase 1: Expand (Release N)

Add the new column as **nullable** (or with a default). Existing rows get `NULL`. No existing code reads or writes the new column yet.

```sql
-- Safe: additive, nullable, no lock contention
ALTER TABLE orders ADD COLUMN total_cents INTEGER;
```

### Phase 2: Migrate (Release N+1)

Deploy application code that reads AND writes both the old and new columns. Run a backfill script to populate existing rows.

```sql
-- Backfill in batches (see Large-Table Migration Guidance)
UPDATE orders SET total_cents = (total * 100)::INTEGER
WHERE total_cents IS NULL AND id >= $start AND id < $end;
```

### Phase 3: Contract (Release N+2)

Once all rows are migrated and the new code has been live for at least one full business cycle, drop the old column.

```sql
-- Destructive: only after backfill is 100% complete
ALTER TABLE orders DROP COLUMN total;
```

> **Rule:** Phases 1 and 2 must be in different releases. Phase 3 may be in the same release as Phase 2 if the backfill is guaranteed complete before deployment (small tables only).

---

## Migration Naming Convention

```
YYYYMMDDHHMMSS_descriptive_name/
```

- Timestamp prefix ensures ordering
- Snake_case description
- One logical change per migration
- Prefix with category when helpful: `add_`, `alter_`, `drop_`, `backfill_`, `index_`

**Examples:**
```
20260727000000_add_order_total_cents/
20260728000000_backfill_order_total_cents/
20260730000000_drop_order_total_column/
```

---

## Pre-Deployment Checklist

Run this checklist **before every production migration**:

- [ ] Migration applies cleanly on a clean database (test from scratch)
- [ ] Migration is forward-only (never modify merged migrations)
- [ ] `prisma migrate diff` shows expected changes only
- [ ] No destructive operations without a prior expand phase
- [ ] Nullable columns used for all new fields (or safe defaults)
- [ ] Indexes created with `CREATE INDEX CONCURRENTLY` where specified
- [ ] Large-table changes use batched backfill (see Large-Table Guidance)
- [ ] Backup verified within the last 24 hours
- [ ] Rollback script exists and has been tested
- [ ] Application code is backward-compatible with the new schema

---

## Pre-Deployment Validation

Run the validation script before deploying:

```bash
# Full validation (dry-run diff + pending migration check)
pnpm --filter db db:validate-migration

# What it checks:
# 1. DATABASE_URL is set and database is reachable
# 2. prisma migrate status shows no drift
# 3. prisma migrate diff --exit-code shows pending changes
# 4. No unapplied migrations from other branches
```

**Script:** `packages/db/scripts/migrate-validate.sh`

---

## Backup Verification

Before applying **any** production migration, verify a recent backup exists:

```bash
pnpm --filter db db:verify-backup
```

**What it checks:**
1. PostgreSQL `pg_dump` backup exists in the backup directory
2. Backup is less than 24 hours old
3. Backup file integrity (compressed, non-empty, valid header)
4. Backup can be listed with `pg_restore --list`

**Script:** `packages/db/scripts/migrate-backup-verify.sh`

For automated backups, see [§8.5 — Automated Backups & Disaster Recovery](../../DOC-009-backup-recovery.md).

---

## Migration Execution

### Standard Deployment (CI/CD)

```bash
# Deploy all pending migrations (production)
pnpm --filter db prisma:migrate
# Executes: prisma migrate deploy
```

This applies all pending migrations in order. It is **idempotent** — running it again on a fully-migrated database is a no-op.

### Manual Execution (Emergency)

```bash
# Check status first
pnpm --filter db db:migrate-status

# Apply
pnpm --filter db prisma:migrate

# Verify
pnpm --filter db db:post-migrate-check
```

---

## Post-Deployment Verification

After every migration deployment, run verification:

```bash
pnpm --filter db db:post-migrate-check
```

**What it checks:**
1. `prisma migrate status` — no pending migrations, no drift
2. Schema matches generated client (no stale `prisma generate`)
3. Critical table row counts are non-zero
4. No locks held by the migration (check `pg_locks`)
5. Index health — no invalid indexes

**Script:** `packages/db/scripts/migrate-post-verify.sh`

---

## Rollback Procedure

### Rule: Migrations Are Forward-Only

Prisma does not support `migrate rollback`. If a migration causes issues:

1. **Application-level rollback:** Revert the code deployment (previous image tag). The database schema remains forward — the old code must tolerate the new schema.
2. **Forward fix:** Create a new migration that corrects the issue.
3. **Emergency revert:** Use `pg_restore` from a verified backup only as a **last resort** — this causes data loss for all changes since the backup.

### Rollback Decision Matrix

| Scenario | Action |
|----------|--------|
| Migration applied, code not deployed | Revert code (schema is forward-compatible) |
| Migration + code deployed, minor issue | Forward-fix migration |
| Migration + code deployed, data corruption | `pg_restore` from verified backup |
| Migration partially applied (connection lost) | Re-run `prisma migrate deploy` (idempotent) |

---

## Large-Table Migration Guidance

For tables with **>1M rows**, avoid long-running locks:

### Adding an Index

```sql
-- NEVER: locks the table for the duration
CREATE INDEX idx_orders_created ON orders(created_at);

-- ALWAYS: non-blocking
CREATE INDEX CONCURRENTLY idx_orders_created ON orders(created_at);
```

### Adding a Column

```sql
-- Safe: PostgreSQL 11+ adds nullable columns without rewriting the table
ALTER TABLE orders ADD COLUMN total_cents INTEGER;
-- Fast: metadata-only change, no row lock
```

### Backfilling Data

```sql
-- Batched backfill — run in application code or a script
-- Process 10,000 rows at a time with a delay between batches
DO $$
DECLARE
  batch_size INT := 10000;
  rows_updated INT;
BEGIN
  LOOP
    UPDATE orders
    SET total_cents = (total * 100)::INTEGER
    WHERE total_cents IS NULL
    AND id IN (
      SELECT id FROM orders
      WHERE total_cents IS NULL
      LIMIT batch_size
    );
    GET DIAGNOSTICS rows_updated = ROW_COUNT;
    EXIT WHEN rows_updated = 0;
    PERFORM pg_sleep(0.5);  -- throttle to reduce load
    COMMIT;
  END LOOP;
END $$;
```

### Dropping a Column

```sql
-- Only after ALL application code no longer references the column
-- Verify with: grep -r "old_column_name" apps/
ALTER TABLE orders DROP COLUMN total;
```

---

## Partitioned Table Migrations

The `orders` and `order_items` tables are **range-partitioned by year**. Prisma does not natively support partition management.

### Adding a New Partition

```sql
-- Create partition for next year (run annually in Q4)
CREATE TABLE IF NOT EXISTS orders_2027
  PARTITION OF orders
  FOR VALUES FROM ('2027-01-01') TO ('2028-01-01');

CREATE TABLE IF NOT EXISTS order_items_2027
  PARTITION OF order_items
  FOR VALUES FROM ('2027-01-01') TO ('2028-01-01');
```

### Migration Rules for Partitioned Tables

1. Never use `ALTER TABLE orders` directly — target the partition
2. Use the `validate_partition_range()` PL/pgSQL function before applying
3. Always create the partition BEFORE the application writes data for that period
4. Test partition creation on a clone before production

---

## CI Integration

The CI pipeline validates migrations on every PR:

```yaml
# In .github/workflows/ci.yml
- name: Validate database migrations
  run: pnpm --filter db db:validate-migration
  env:
    DATABASE_URL: postgresql://test:test@localhost:5432/zayjar_test
```

**What CI checks:**
1. `prisma migrate diff --exit-code` — no unexpected schema drift
2. `prisma migrate status` — all migrations applied
3. `prisma generate` — client matches schema
4. Migration SQL is syntactically valid

---

## Quick Reference

| Action | Command |
|--------|---------|
| Check migration status | `pnpm --filter db db:migrate-status` |
| Validate before deploy | `pnpm --filter db db:validate-migration` |
| Verify backup exists | `pnpm --filter db db:verify-backup` |
| Deploy pending migrations | `pnpm --filter db prisma:migrate` |
| Post-deploy verification | `pnpm --filter db db:post-migrate-check` |
| Generate Prisma Client | `pnpm --filter db prisma:generate` |
| Profile slow queries | `pnpm --filter db db:profile` |
| Run health checks | `pnpm --filter db db:health` |
