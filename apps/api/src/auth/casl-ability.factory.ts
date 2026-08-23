import { Injectable } from '@nestjs/common';
import { createMongoAbility, AbilityBuilder, MongoAbility, MongoQuery } from '@casl/ability';

export type Action = 'manage' | 'create' | 'read' | 'update' | 'delete';
// AUDIT-006/007: `Category` added. Menu categories were readable/creatable only
// via the `Product` subject, and there was no way to express category-level
// authority at all. The permission strings on the JWT are PascalCased by
// `createForUser` below (`category:update` -> `Category`), so the union must
// contain the subject for the rule to be matchable.
// AUDIT-014: `Customer` added. `GET /api/v1/customers` shipped with NO guard at
// all and no CASL subject, so the entire customer PII table (names, emails,
// loyalty points) was readable by ANY unauthenticated caller — runtime-proven
// as HTTP 200 with full rows before this fix.
export type Subjects =
  | 'Product'
  | 'Category'
  | 'Order'
  | 'Branch'
  | 'Tenant'
  | 'User'
  | 'Table'
  | 'Customer'
  // AUDIT-014 DEFECT-L: reads of the restaurant brand. A dedicated subject is
  // required rather than reusing 'Branch': the RBAC guard re-resolves `:id`
  // against the repository registered for the subject, so a Branch-guarded
  // `/restaurants/:id` looked the restaurant id up in the BRANCHES table and
  // returned 404 for a valid brand (runtime-proven).
  | 'Restaurant'
  // AUDIT-002 Finding #5 (RBAC): the wallet payment endpoints require
  // `payment:create` / `payment:read` permissions. The route params are
  // `:paymentId` (not `:id`), so the guard's entity re-resolution is
  // intentionally skipped and tenant authorization stays in WalletService
  // via dbTenantContext — the subject only needs to exist for `can()` to
  // match (no tenantRepositoryRegistry entry required).
  | 'Payment'
  // Media library + presigned asset uploads. No tenantRepositoryRegistry
  // entry: Media rows are scoped in MediaService/AssetService via JWT
  // tenantId (same pattern as Payment).
  | 'Media'
  // AUDIT-009: staff Discount management. Dedicated subject so the guard
  // re-resolves `:id` against TenantDiscountRepository.
  | 'Discount'
  | 'all';

export type AppAbility = MongoAbility<[Action, Subjects]>;

export interface UserPayload {
  id: string;
  email: string;
  tenantId: string | null;
  roles: string[];
  permissions: string[];
  branches?: string[]; // Scoped branch IDs for managers/cashiers
}

@Injectable()
export class CaslAbilityFactory {
  /**
   * Translates the decoded user permissions and ABAC properties into a CASL Ability instance dynamically.
   */
  createForUser(user: UserPayload): AppAbility {
    const builder = new AbilityBuilder<AppAbility>(createMongoAbility);
    const { can, build } = builder;
    // CAT-5: @casl/ability v7 (7.0.1) types rule `conditions` for pure string
    // subject tuples as `MongoQuery<never>` (tagged instances are required to
    // use conditions in its strict typings) — v6 accepted `MongoQuery`, and the
    // emitted rule objects are unchanged. Unify through one assertion at this
    // choke point instead of touching the three rule sites' runtime values.
    const cannot = builder.cannot as (action: Action, subject: Subjects, conditions: MongoQuery) => unknown;

    // 1. Platform Owners bypass all scoping gates and hold full systemic keys
    if (user.roles.includes('PLATFORM_OWNER')) {
      can('manage', 'all');
    } else {
      
      // 2. Map standard modular permissions dynamically from the token
      if (user.permissions && user.permissions.length > 0) {
        user.permissions.forEach((permString) => {
          const parts = permString.split(':');
          if (parts.length === 2) {
            const resource = parts[0];
            const action = parts[1] as Action;
            const normalizedResource = (resource.charAt(0).toUpperCase() + resource.slice(1)) as Subjects;
            
            can(action, normalizedResource);
          }
        });
      }

      // ==========================================
      // FIX #1: Real Attribute-Based Access Control (ABAC) Exclusions
      // ==========================================
      // Phase 4 P0: every branch-scoped staff role is restricted to its
      // assigned branches (DOC-005 §4.2, persistent user_branches source).
      // The `branches` claim is populated at login/refresh from user_branches.
      // RESTAURANT_OWNER has no user_branches rows -> tenant-wide (unchanged).
      // PLATFORM_OWNER is handled separately above with manage('all').
      // When a role has NO branch assignment the rules below do not fire,
      // preserving the canonical backward-compatible behavior.

      // A. Cashier: POS only — cannot update PAID orders, cannot read/create/
      //    update Orders in unassigned branches.
      if (user.roles.includes('CASHIER')) {
        cannot('update', 'Order', { status: 'PAID' } as MongoQuery);
        if (user.branches && user.branches.length > 0) {
          // `$exists: true` is required so the rule fires ONLY when the subject
          // actually carries a branchId. List endpoints evaluate a branchless
          // subject (no :id to resolve) — the guard must pass there so the
          // SERVICE enforces scope on the query, while entity-level reads and
          // create-bodies (which carry branchId) are still denied for foreign
          // branches.
          cannot('read', 'Order', { branchId: { $exists: true, $nin: user.branches } } as MongoQuery);
          cannot('create', 'Order', { branchId: { $exists: true, $nin: user.branches } } as MongoQuery);
          cannot('update', 'Order', { branchId: { $exists: true, $nin: user.branches } } as MongoQuery);
        }
      }

      // B. Branch Manager: Cannot read/create/update Orders in unassigned
      //    branches.
      if (user.roles.includes('BRANCH_MANAGER') && user.branches && user.branches.length > 0) {
        cannot('read', 'Order', { branchId: { $exists: true, $nin: user.branches } } as MongoQuery);
        cannot('create', 'Order', { branchId: { $exists: true, $nin: user.branches } } as MongoQuery);
        cannot('update', 'Order', { branchId: { $exists: true, $nin: user.branches } } as MongoQuery);
      }

      // C. Kitchen Staff: KDS only — cannot read or update Orders (tickets,
      //    cooking status) in unassigned branches.
      if (user.roles.includes('KITCHEN_STAFF') && user.branches && user.branches.length > 0) {
        cannot('read', 'Order', { branchId: { $exists: true, $nin: user.branches } } as MongoQuery);
        cannot('update', 'Order', { branchId: { $exists: true, $nin: user.branches } } as MongoQuery);
      }

      // 3. Default fallback rules for logged-in tenants
      can('read', 'Tenant');
    }

    return build({
      detectSubjectType: (item: Record<string, unknown>) => {
        if (item && item.constructor && item.constructor.name !== 'Object') {
          return item.constructor.name as Subjects;
        }
        return (item?.__type || item) as Subjects;
      },
    });
  }
}
