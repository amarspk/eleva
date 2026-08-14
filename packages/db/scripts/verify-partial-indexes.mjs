#!/usr/bin/env node
/**
 * CI regression guard — the 5 REQUIRED PARTIAL unique indexes.
 *
 * Authoritative definition: migration
 * `20260804000000_soft_delete_partial_unique_and_crud_permissions`
 * (AUDIT-006/007), per DOC-002 §28/§29/§114/§234/§448/§602 — uniqueness
 * bounds that IGNORE soft-deleted rows ("WHERE deletedAt IS NULL").
 *
 * Why this guard exists:
 *   - The init migration created these 5 indexes as FULL unique indexes, so a
 *     soft-deleted row kept occupying its unique slot forever (runtime-proven:
 *     e.g. soft-deleting table "12" permanently burned its QR token/number).
 *   - Prisma's schema language cannot express partial indexes, so
 *     `schema.prisma` still declares plain `@@unique` for these columns.
 *   - A future `prisma migrate dev` (or a regenerated init migration) would
 *     therefore diff the plain `@@unique` against the partial indexes and can
 *     generate a new migration that reverts them to FULL — silently
 *     reintroducing the irreversible-soft-delete defect.
 *
 * What this guard does (pure static analysis — it never opens a database):
 *   - Scans every migration.sql under packages/db/prisma/migrations in
 *     chronological order.
 *   - Tracks the LAST definition applied to each guarded index name
 *     (CREATE UNIQUE INDEX … WHERE, CREATE UNIQUE INDEX … without WHERE,
 *     CREATE INDEX, or DROP INDEX).
 *   - Fails with an exact diagnostic if any guarded index's final state is
 *     not a UNIQUE PARTIAL index whose predicate matches the authoritative
 *     expected predicate character-for-character (whitespace-normalized):
 *     dropped/missing, FULL UNIQUE, FULL NON-UNIQUE and PARTIAL NON-UNIQUE
 *     final states are all violations.
 *
 * Environment override for focused negative testing (never needed in CI):
 *   PARTIAL_INDEX_MIGRATIONS_DIR=/some/dir node scripts/verify-partial-indexes.mjs
 */
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const EXPECTED = [
  {
    name: 'idx_tables_qr_token',
    table: 'tables',
    columns: '"qrCodeToken"',
    predicate: '"deletedAt" IS NULL',
  },
  {
    name: 'idx_users_email_tenant',
    table: 'users',
    columns: '"email", "tenantId"',
    predicate: '"deletedAt" IS NULL',
  },
  {
    name: 'idx_customers_email_tenant',
    table: 'customers',
    columns: '"email", "tenantId"',
    predicate: '"deletedAt" IS NULL',
  },
  {
    name: 'idx_tenants_subdomain',
    table: 'tenants',
    columns: '"subdomain"',
    predicate: '"deletedAt" IS NULL',
  },
  {
    name: 'idx_tenants_custom_domain',
    table: 'tenants',
    columns: '"customDomain"',
    predicate: '"customDomain" IS NOT NULL AND "deletedAt" IS NULL',
  },
];

const scriptDir = dirname(fileURLToPath(import.meta.url));
const migrationsDir = process.env.PARTIAL_INDEX_MIGRATIONS_DIR || join(scriptDir, '..', 'prisma', 'migrations');

const normalize = (value) => value.replace(/\s+/g, ' ').trim();

/** Removes `--` line comments and splits a SQL file into normalized statements. */
function statementsFrom(sql) {
  const withoutComments = sql
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n');
  return withoutComments
    .split(';')
    .map(normalize)
    .filter((statement) => statement.length > 0);
}

const DROP_RE = /^DROP INDEX(?: IF EXISTS)? "([^"]+)"$/i;
const CREATE_RE = /^CREATE\s*(UNIQUE\s+)?INDEX(?: IF NOT EXISTS)? "([^"]+)" ON "([^"]+)"\s*\(([^)]+)\)\s*(?:WHERE (.+))?$/i;

/** Human-readable classification of an index's final definition. */
function stateDescription(state) {
  const uniqueness = state.unique ? 'UNIQUE' : 'NON-UNIQUE';
  const scope = state.partial ? 'PARTIAL' : 'FULL';
  return `${uniqueness} ${scope}`;
}

function main() {
  const migrationDirs = readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== 'migration_lock')
    .map((entry) => entry.name)
    .sort();

  if (migrationDirs.length === 0) {
    console.error(`[partial-index-guard] No migration directories found under: ${migrationsDir}`);
    process.exit(1);
  }

  /** index name -> { kind: 'dropped' } or { unique, partial, migration, table, columns, predicate } */
  const finalState = new Map();
  let partialCreates = 0;

  for (const dirName of migrationDirs) {
    const sqlPath = join(migrationsDir, dirName, 'migration.sql');
    const sql = readFileSync(sqlPath, 'utf8');
    for (const statement of statementsFrom(sql)) {
      const createMatch = CREATE_RE.exec(statement);
      if (createMatch) {
        const [, uniqueKeyword, name, table, rawColumns, rawWhere] = createMatch;
        finalState.set(name, {
          unique: Boolean(uniqueKeyword),
          partial: Boolean(rawWhere),
          migration: dirName,
          table,
          columns: normalize(rawColumns),
          predicate: normalize(rawWhere || ''),
        });
        if (rawWhere) {
          partialCreates += 1;
        }
        continue;
      }
      const dropMatch = DROP_RE.exec(statement);
      if (dropMatch) {
        finalState.set(dropMatch[1], { kind: 'dropped', migration: dirName });
      }
    }
  }

  const problems = [];
  for (const expected of EXPECTED) {
    const state = finalState.get(expected.name);
    if (!state || state.kind === 'dropped') {
      problems.push(
        `[partial-index-guard] FAIL: index "${expected.name}" has no partial unique definition in the migration chain ` +
          `(last definition: ${state ? `dropped in ${state.migration}` : 'none found'}).`,
      );
      continue;
    }
    if (!state.unique || !state.partial) {
      const actual = stateDescription(state);
      problems.push(
        `[partial-index-guard] FAIL: index "${expected.name}" final state is ${actual} (${state.migration}) — ` +
          `it MUST remain a UNIQUE PARTIAL index with the authoritative predicate per DOC-002 §602 and ` +
          `migration 20260804000000.`,
      );
      continue;
    }
    if (state.table !== expected.table) {
      problems.push(
        `[partial-index-guard] FAIL: index "${expected.name}" is defined on table ${state.table}, expected "${expected.table}".`,
      );
      continue;
    }
    if (normalize(state.columns) !== normalize(expected.columns)) {
      problems.push(
        `[partial-index-guard] FAIL: index "${expected.name}" columns (${state.columns}) differ from the authoritative ` +
          `definition (${expected.columns}).`,
      );
      continue;
    }
    if (state.predicate !== normalize(expected.predicate)) {
      problems.push(
        `[partial-index-guard] FAIL: index "${expected.name}" predicate (${state.predicate}) differs from the ` +
          `authoritative predicate (${expected.predicate}) — changed in ${state.migration}.`,
      );
      continue;
    }
    console.log(`[partial-index-guard] OK: "${expected.name}" partial WHERE ${state.predicate} (${state.migration})`);
  }

  if (problems.length > 0) {
    for (const problem of problems) {
      console.error(problem);
    }
    console.error(`[partial-index-guard] ${problems.length} violation(s) — the required partial indexes were reverted or altered.`);
    process.exit(1);
  }

  console.log(
    `[partial-index-guard] PASS: all ${EXPECTED.length} required partial unique indexes verified across ` +
      `${migrationDirs.length} migration directories (${partialCreates} partial CREATE INDEX statements found).`,
  );
}

main();
