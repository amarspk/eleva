# Automated Backup & Disaster Recovery

> DOC-009 §8.5 — Production backup strategy, point-in-time recovery, and disaster recovery playbook for the Zayjar PostgreSQL database.

## Table of Contents

1. [RPO and RTO Definitions](#rpo-and-rto-definitions)
2. [Backup Strategy Overview](#backup-strategy-overview)
3. [Automated Backup Configuration](#automated-backup-configuration)
4. [WAL Archiving Strategy](#wal-archiving-strategy)
5. [Point-in-Time Recovery (PITR)](#point-in-time-recovery-pitr)
6. [Backup Retention Policy](#backup-retention-policy)
7. [Restore Procedure](#restore-procedure)
8. [Backup Verification](#backup-verification)
9. [Recovery Testing Checklist](#recovery-testing-checklist)
10. [Production Recovery Playbook](#production-recovery-playbook)
11. [Managed Service Support](#managed-service-support)

---

## RPO and RTO Definitions

| Metric | Definition | Target | Notes |
|--------|-----------|--------|-------|
| **RPO** (Recovery Point Objective) | Maximum acceptable data loss | **5 minutes** | Achieved via WAL archiving with 5-minute archive timeout |
| **RTO** (Recovery Time Objective) | Maximum acceptable downtime | **30 minutes** | Achieved via automated restore scripts + pre-provisioned infrastructure |
| **MTTR** (Mean Time To Repair) | Average time to restore service | **15 minutes** | Target for standard failure scenarios |

### RPO/RTO by Scenario

| Scenario | RPO | RTO | Method |
|----------|-----|-----|--------|
| Accidental data deletion | 0 (WAL replay) | 15 min | PITR to exact timestamp |
| Table corruption | 0 (WAL replay) | 20 min | PITR to pre-corruption timestamp |
| Database server failure | 5 min (WAL archive) | 30 min | Restore from latest + WAL replay |
| Region-wide outage | 1 hour (S3 snapshot) | 4 hours | Cross-region restore from S3 |
| Complete data loss | 1 hour | 4 hours | Full backup + WAL replay from S3 |

---

## Backup Strategy Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Zayjar Backup Layers                       │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  Layer 1: pg_dump (Full Logical Backups)                      │
│  ├── Daily full backup at 02:00 UTC                           │
│  ├── Compressed custom format (-Fc)                           │
│  ├── Retained: 7 daily, 4 weekly, 12 monthly                 │
│  └── Stored: /var/backups/postgresql + S3                     │
│                                                               │
│  Layer 2: WAL Archiving (Continuous)                          │
│  ├── Archive every 5 minutes or on segment switch             │
│  ├── Retained: 7 days                                         │
│  ├── Stored: /var/backups/wal-archive + S3                    │
│  └── Enables PITR to any point within retention window        │
│                                                               │
│  Layer 3: Filesystem Snapshots (Infrastructure)               │
│  ├── LVM/ZFS snapshots before migration operations           │
│  ├── EBS/RDS automated backups (if using managed service)     │
│  └── Retained: 7 days                                         │
│                                                               │
│  Layer 4: Cross-Region Replication (Disaster Recovery)        │
│  ├── S3 cross-region replication for backups                  │
│  ├── Retained: 30 days                                        │
│  └── Used only for region-wide disaster recovery              │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

---

## Automated Backup Configuration

### Configuration File

**Location:** `packages/db/config/pg-backup.conf`

```bash
# Source this file in backup scripts:
# source "$(dirname "$0")/../config/pg-backup.conf"
```

### What Each Script Does

| Script | Purpose | Frequency |
|--------|---------|-----------|
| `backup-postgres.sh` | Full logical backup via `pg_dump` | Daily at 02:00 UTC |
| `wal-archive.sh` | Archive WAL segments for PITR | Continuous (every 5 min or on switch) |
| `verify-backup-full.sh` | Comprehensive backup integrity check | Weekly (Sunday 03:00 UTC) |
| `restore-postgres.sh` | Restore from backup + WAL replay | On-demand (disaster recovery) |

### Running Backups

```bash
# Manual full backup
pnpm --filter db db:backup

# Manual WAL archive
pnpm --filter db db:wal-archive

# Verify backups
pnpm --filter db db:verify-backups

# Restore from backup
pnpm --filter db db:restore
```

---

## WAL Archiving Strategy

### Configuration

WAL archiving is configured in `postgresql.conf` (see `k8s/postgres/configmap.yml`):

```conf
wal_level = replica
archive_mode = on
archive_command = 'test ! -f /var/backups/wal-archive/%f && cp %p /var/backups/wal-archive/%f'
archive_timeout = 300    # Force archive every 5 minutes
max_wal_size = 2GB
min_wal_size = 1GB
```

### WAL Retention

- **Local:** 7 days in `/var/backups/wal-archive/`
- **S3:** 30 days in `s3://zayjar-backups/wal-archive/`
- **Cleanup:** `wal-archive.sh --cleanup` removes archives older than retention period

### PITR Timeline

```
Timeline:
├── 02:00 UTC — Full backup (base)
├── 02:00-06:59 — WAL segments archived every 5 min
├── 06:59 — PITR restore point (e.g., before bad migration)
└── Restore: base backup + WAL replay up to 06:59
```

---

## Point-in-Time Recovery (PITR)

### When to Use PITR

- Accidental `DELETE` or `UPDATE` without `WHERE` clause
- Data corruption detected after the fact
- Need to restore to a specific moment (e.g., before a failed migration)

### PITR Steps

```bash
# 1. Stop writes to the database
# (scale down API pods or set database to read-only)
kubectl scale deployment/api --replicas=0 -n zayjar

# 2. Run PITR restore to specific timestamp
pnpm --filter db db:restore --target "2026-07-26 06:59:00 UTC"

# 3. Verify restored data
pnpm --filter db db:post-migrate-check

# 4. Resume writes
kubectl scale deployment/api --replicas=2 -n zayjar
```

### PITR Limitations

- Requires WAL archiving to be enabled and functioning
- Cannot recover to a point before the last full backup
- Recovery time depends on WAL volume since last backup
- All transactions after the target timestamp are lost

---

## Backup Retention Policy

| Backup Type | Retention | Storage |
|-------------|-----------|---------|
| Daily full backup | 7 days | Local + S3 |
| Weekly full backup | 4 weeks (28 days) | S3 |
| Monthly full backup | 12 months (365 days) | S3 |
| WAL archives | 7 days local, 30 days S3 | Local + S3 |
| Cross-region backups | 30 days | S3 (replica region) |

### Retention Enforcement

The `backup-postgres.sh` script automatically prunes backups exceeding retention:

```bash
# Prune daily backups older than 7 days
find "$BACKUP_DIR/daily" -name "*.dump" -mtime +7 -delete

# Prune weekly backups older than 4 weeks
find "$BACKUP_DIR/weekly" -name "*.dump" -mtime +28 -delete

# Prune monthly backups older than 12 months
find "$BACKUP_DIR/monthly" -name "*.dump" -mtime +365 -delete
```

---

## Restore Procedure

### Standard Restore (from latest backup)

```bash
pnpm --filter db db:restore
```

### Restore to Specific Timestamp (PITR)

```bash
pnpm --filter db db:restore --target "2026-07-26 14:30:00+00"
```

### Restore from Specific Backup File

```bash
pnpm --filter db db:restore --file /var/backups/postgresql/daily/zayjar_20260726_020000.dump
```

### Restore Steps (Manual)

```bash
# 1. Stop application writes
kubectl scale deployment/api --replicas=0 -n zayjar

# 2. Drop and recreate database
dropdb zayjar_production
createdb zayjar_production

# 3. Restore from backup
pg_restore -d zayjar_production -Fc --no-owner --no-privileges backup.dump

# 4. (Optional) Replay WAL segments for PITR
# Copy WAL segments to a temporary directory
# Set restore_command in recovery.conf or postgresql.auto.conf
# Start PostgreSQL — it will replay WAL up to the target

# 5. Verify restored data
psql zayjar_production -c "SELECT COUNT(*) FROM tenants;"
psql zayjar_production -c "SELECT COUNT(*) FROM orders;"

# 6. Regenerate Prisma Client
pnpm --filter @zayjar/db prisma:generate

# 7. Resume application
kubectl scale deployment/api --replicas=2 -n zayjar
```

---

## Backup Verification

### Automated Verification

```bash
# Full verification (integrity + list + test restore)
pnpm --filter db db:verify-backups
```

### What Verification Checks

1. **File existence** — backup files exist in expected locations
2. **File integrity** — gzip checksum valid, non-zero size
3. **pg_restore readable** — `pg_restore --list` succeeds
4. **Recency** — backup is within expected age window
5. **WAL archive completeness** — no gaps in WAL sequence
6. **Test restore** — restore to temporary database, verify row counts

### Weekly Verification Schedule

```bash
# Cron: Sunday 03:00 UTC
0 3 * * 0 /path/to/scripts/verify-backup-full.sh >> /var/log/zayjar/backup-verify.log 2>&1
```

---

## Recovery Testing Checklist

Run this checklist **quarterly** or after any infrastructure change:

- [ ] **Backup exists:** Latest daily backup is less than 24 hours old
- [ ] **Backup integrity:** `pg_restore --list` succeeds on latest backup
- [ ] **WAL archive complete:** No gaps in WAL sequence since last backup
- [ ] **Test restore works:** Restore to temporary database succeeds
- [ ] **Data integrity:** Row counts match expected values after restore
- [ ] **Prisma Client regenerates:** `prisma generate` succeeds against restored DB
- [ ] **Application starts:** API connects and responds to `/api/v1/health`
- [ ] **Performance acceptable:** Query response times within SLA after restore
- [ ] **Cross-region backup accessible:** S3 backup downloadable from DR region
- [ ] **Runbook current:** Recovery playbook matches actual infrastructure
- [ ] **Team trained:** At least 2 team members can execute recovery procedure
- [ ] **RPO/RTO validated:** Recovery achieves target RPO (5 min) and RTO (30 min)

### Recovery Drill Schedule

| Frequency | Activity | Duration |
|-----------|----------|----------|
| Weekly | Automated backup verification | 10 min |
| Monthly | Test restore to staging | 30 min |
| Quarterly | Full DR drill (simulate failure, restore, verify) | 2 hours |
| Annually | Cross-region DR test | 4 hours |

---

## Production Recovery Playbook

### Scenario 1: Database Server Failure

```
Impact: Complete database outage
RTO Target: 30 minutes

Steps:
1. Confirm failure: psql $DATABASE_URL -c "SELECT 1;" fails
2. Check infrastructure: is the VM/container running?
3. If managed (RDS): promote read replica or restore from automated backup
4. If self-hosted: restore from latest pg_dump backup
5. Replay WAL segments for PITR if needed
6. Verify: psql $DATABASE_URL -c "SELECT COUNT(*) FROM tenants;"
7. Update DATABASE_URL if endpoint changed
8. Restart API pods: kubectl rollout restart deployment/api -n zayjar
9. Monitor: watch logs for errors, verify health endpoint
10. Post-incident: update runbook, schedule backup verification
```

### Scenario 2: Accidental Data Deletion

```
Impact: Partial data loss (specific tables/rows)
RTO Target: 15 minutes

Steps:
1. STOP all writes immediately: kubectl scale deployment/api --replicas=0 -n zayjar
2. Identify deletion timestamp: check application logs
3. Run PITR to timestamp just before deletion:
   pg_restore -d zayjar_production -Fc --target-time "2026-07-26 14:29:00+00" backup.dump
4. Verify restored data: SELECT COUNT(*) FROM affected_table
5. Resume writes: kubectl scale deployment/api --replicas=2 -n zayjar
6. Investigate root cause: who/what deleted the data?
```

### Scenario 3: Data Corruption

```
Impact: Silent data corruption (bad migrations, logic errors)
RTO Target: 20 minutes

Steps:
1. Identify corruption scope: which tables/rows are affected?
2. Determine corruption timestamp: when did it start?
3. Stop writes: kubectl scale deployment/api --replicas=0 -n zayjar
4. PITR to timestamp before corruption began
5. Verify: run application health checks + manual data validation
6. If corruption is from a migration: fix forward (new migration) or rollback code
7. Resume writes: kubectl scale deployment/api --replicas=2 -n zayjar
8. Post-incident: add data validation checks to CI
```

### Scenario 4: Region-Wide Outage

```
Impact: Complete infrastructure unavailability
RTO Target: 4 hours

Steps:
1. Assess scope: is this a single AZ or full region outage?
2. Activate DR region: point DNS to DR region endpoints
3. Restore database from cross-region S3 backup:
   aws s3 cp s3://zayjar-backups-dr/daily/latest.dump /tmp/
   pg_restore -d zayjar_production -Fc /tmp/latest.dump
4. Replay WAL from DR archive
5. Update application configuration for DR region
6. Verify all services: API, QR Menu, Backoffice, Cashier
7. Monitor: watch for data consistency issues
8. When primary region recovers: plan failback procedure
```

---

## Managed Service Support

### AWS RDS

If using RDS instead of self-hosted PostgreSQL:

```bash
# Automated backups are enabled by default (7-day retention)
# PITR is available for the last 35 days

# Restore to point in time
aws rds restore-db-instance-to-point-in-time \
  --source-db-instance-identifier zayjar-prod \
  --target-db-instance-identifier zayjar-restore \
  --restore-time "2026-07-26T14:30:00Z"

# Restore to latest
aws rds restore-db-instance-to-point-in-time \
  --source-db-instance-identifier zayjar-prod \
  --target-db-instance-identifier zayjar-restore \
  --use-latest-restorable-time

# Cross-region restore
aws rds copy-db-snapshot \
  --source-db-snapshot-identifier arn:aws:rds:us-east-1::snapshot:zayjar-backup \
  --target-db-snapshot-identifier arn:aws:rds:eu-west-1::snapshot:zayjar-dr \
  --source-region us-east-1 \
  --region eu-west-1
```

### Supabase

If using Supabase PostgreSQL:

```bash
# Supabase provides daily backups for Pro plans
# PITR available for Enterprise plans

# Export database via Supabase CLI
supabase db dump --db-url $DATABASE_URL > backup.sql

# Restore
psql $DATABASE_URL < backup.sql
```

### Environment-Agnostic

The backup scripts in `packages/db/scripts/` are environment-agnostic:
- They use standard `pg_dump` / `pg_restore` commands
- They work with any PostgreSQL instance (self-hosted, RDS, Supabase)
- Configuration is in `pg-backup.conf` — adapt paths/credentials per environment
- S3 upload uses AWS CLI — install separately if needed

---

## Quick Reference

| Action | Command |
|--------|---------|
| Run full backup | `pnpm --filter db db:backup` |
| Archive WAL segment | `pnpm --filter db db:wal-archive` |
| Verify backups | `pnpm --filter db db:verify-backups` |
| Restore from backup | `pnpm --filter db db:restore` |
| PITR to timestamp | `pnpm --filter db db:restore --target "YYYY-MM-DD HH:MM:SS"` |
| Check backup age | `pnpm --filter db db:verify-backup` (migration pre-check) |
| List backup files | `ls -la /var/backups/postgresql/daily/` |
| Check WAL archive | `ls -la /var/backups/wal-archive/` |
