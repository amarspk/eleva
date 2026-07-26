import { Injectable } from '@nestjs/common';
import { createMongoAbility, AbilityBuilder, MongoAbility, MongoQuery } from '@casl/ability';

export type Action = 'manage' | 'create' | 'read' | 'update' | 'delete';
export type Subjects = 'Product' | 'Order' | 'Branch' | 'Tenant' | 'User' | 'Table' | 'all';

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
    const { can, cannot, build } = new AbilityBuilder<AppAbility>(createMongoAbility);

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

      // A. Cashier: Cannot update PAID orders (takes absolute precedence over general can)
      if (user.roles.includes('CASHIER')) {
        cannot('update', 'Order', { status: 'PAID' } as MongoQuery);
      }

      // B. Branch Manager: Cannot read Orders or update Products belonging to unassigned branches
      if (user.roles.includes('BRANCH_MANAGER') && user.branches && user.branches.length > 0) {
        cannot('read', 'Order', { branchId: { $nin: user.branches } } as MongoQuery);
        cannot('update', 'Product', { branchId: { $nin: user.branches } } as MongoQuery);
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
