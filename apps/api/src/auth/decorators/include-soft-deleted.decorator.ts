import { CustomDecorator, SetMetadata } from '@nestjs/common';

export const INCLUDE_SOFT_DELETED_KEY = 'include_soft_deleted';

/**
 * Marks a route whose `:id` target is expected to be soft-deleted.
 *
 * `RbacPermissionGuard` re-resolves the `:id` path parameter against the real
 * database row before evaluating the caller's ability, and it does so through
 * `findById`, which applies the `deletedAt IS NULL` filter for soft-deletable
 * models. That is correct for every ordinary route — an update or delete
 * targeting an already-deleted record must read as 404 — but it makes a restore
 * endpoint impossible: the guard rejects the request with 404 before the
 * handler runs, because the only rows a restore can legitimately target are
 * exactly the ones the filter hides.
 *
 * Runtime-proven during AUDIT-006/007 implementation: with the restore routes
 * in place and the correct `product:update` permission on the token,
 * `POST /api/v1/menu/products/:id/restore` returned
 * `404 The requested Product with ID [...] was not found.` while the row was
 * present in Postgres with `deletedAt` set.
 *
 * Applying this decorator switches the guard to `findByIdIncludingDeleted` for
 * that handler only. Tenant scoping is unchanged — the widened lookup relaxes
 * the soft-delete predicate exclusively, never the `tenantId` predicate, so a
 * cross-tenant restore still resolves to nothing and returns 404.
 */
export const IncludeSoftDeleted = (): CustomDecorator<string> =>
  SetMetadata(INCLUDE_SOFT_DELETED_KEY, true);
