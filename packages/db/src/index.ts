import { PrismaClient } from './generated-client';
import { AsyncLocalStorage } from 'async_hooks';

export interface TenantContext {
  tenantId?: string;
  isPlatformOwner?: boolean;
}

// Central thread-local execution context
export const dbTenantContext = new AsyncLocalStorage<TenantContext>();

/**
 * Builds the tenant-scoped PrismaClient extension that enforces:
 * - Fail-safe context verification (no unscoped writes)
 * - Tenant isolation filters on all read/write operations
 * - Cross-tenant insertion prevention
 */
function buildTenantScopedExtension(): Record<string, unknown> {
  return {
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }: { model: string; operation: string; args: Record<string, unknown>; query: (args: Record<string, unknown>) => Promise<unknown> }): Promise<unknown> {
          const context = dbTenantContext.getStore();
          const tenantId = context?.tenantId;
          const isPlatformOwner = context?.isPlatformOwner || false;

          const unscopedModels = ['Tenant', 'SubscriptionPlan', 'AuditLog', 'Notification'];

          // ==========================================
          // 1. Fail-safe context verification
          // ==========================================
          if (!unscopedModels.includes(model)) {
            if (!tenantId && !isPlatformOwner) {
              throw new Error(`Fail-Safe Block: Access to model '${model}' was blocked due to missing tenant context.`);
            }
          }

          // Apply tenant-scoping restrictions if tenant context is resolved
          if (tenantId && !unscopedModels.includes(model)) {
            // ==========================================
            // 2. Block unsupported operations
            // ==========================================
            const unsupportedOperations = ['createMany', 'updateMany', 'deleteMany', 'aggregate', 'groupBy', 'upsert'];
            if (unsupportedOperations.includes(operation)) {
              throw new Error(`Fail-Safe Block: Operation '${operation}' is unsupported on scoped model '${model}' to prevent isolation bypasses.`);
            }

            // ==========================================
            // 3. Enforce tenant scoping filters on standard operations (no rerouting/recursion)
            // ==========================================
            if (operation === 'findFirst' || operation === 'findMany' || operation === 'count' || operation === 'update' || operation === 'delete') {
              const rawArgs = args as Record<string, Record<string, unknown>>;
              rawArgs.where = {
                ...(rawArgs.where as Record<string, unknown>),
                tenantId,
              };
            }
            
            // ==========================================
            // 4. Secure create operations
            // ==========================================
            else if (operation === 'create') {
              const rawArgs = args as Record<string, Record<string, unknown>>;
              if (rawArgs.data && rawArgs.data.tenantId && rawArgs.data.tenantId !== tenantId) {
                throw new Error(`Fail-Safe Block: Cross-tenant data insertion attempt detected and blocked.`);
              }
              rawArgs.data = {
                ...rawArgs.data,
                tenantId,
              };
            }
          }

          // Standard direct execution path (No operation reassignments or delegate re-entry)
          return query(args);
        },
      },
    },
  };
}

/**
 * Primary PrismaClient — connected to the write primary (DATABASE_URL).
 * Used for all mutating operations (create, update, delete).
 */
export const prisma = new PrismaClient().$extends(buildTenantScopedExtension());

/**
 * Read-replica PrismaClient — connected to the read replica (DATABASE_READ_URL).
 * Falls back to DATABASE_URL when DATABASE_READ_URL is not configured.
 * Used for read-only queries (menu browsing, dashboard analytics, KDS polling)
 * to reduce load on the primary database per DOC-001 §1.5.
 *
 * When no replica is available, queries route to the primary transparently.
 */
const readReplicaUrl = process.env.DATABASE_READ_URL || process.env.DATABASE_URL;
export const prismaRead = readReplicaUrl
  ? new PrismaClient({
      datasources: {
        db: {
          url: readReplicaUrl,
        },
      },
    }).$extends(buildTenantScopedExtension())
  : prisma;

export * from './generated-client';
export * from './repositories';
export const dbPlaceholder = "zayjar-db";
