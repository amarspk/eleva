/* eslint-disable no-console */
import { PrismaClient } from '../src/generated-client';

const prisma = new PrismaClient();

// NOTE (Runtime Defect R5 fix, 2026-07-30): every primary key below is a deterministic,
// schema-valid UUID. Raw slugs like 'plan-starter-001' were previously used as IDs, but all
// schema PKs are String @db.Uuid, so Prisma rejected them with P2023 at seed.ts:45.

async function main(): Promise<void> {
  console.log('Seeding database...');

  // Clean all tables in dependency order
  await prisma.orderItemAddon.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.kitchenQueue.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.webhook.deleteMany();
  await prisma.deviceToken.deleteMany();
  await prisma.sessionLog.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.table.deleteMany();
  await prisma.addonItem.deleteMany();
  await prisma.productAddon.deleteMany();
  await prisma.productVariant.deleteMany();
  await prisma.productSize.deleteMany();
  await prisma.product.deleteMany();
  await prisma.category.deleteMany();
  await prisma.branch.deleteMany();
  await prisma.restaurant.deleteMany();
  await prisma.rolePermission.deleteMany();
  await prisma.permission.deleteMany();
  await prisma.userRole.deleteMany();
  await prisma.role.deleteMany();
  await prisma.user.deleteMany();
  await prisma.subscription.deleteMany();
  await prisma.discount.deleteMany();
  await prisma.tenant.deleteMany();
  await prisma.subscriptionPlan.deleteMany();

  console.log('Cleaned existing data.');

  // ==========================================
  // 1. SUBSCRIPTION PLANS
  // ==========================================
  const starterPlan = await prisma.subscriptionPlan.create({
    data: {
      id: 'b6491cba-adde-47db-8f96-98303e118f54',
      name: 'Starter',
      stripePriceId: 'price_starter_monthly',
      maxBranches: 1,
      maxRestaurants: 1,
      maxProductsPerBranch: 50,
      allowCustomDomains: false,
      allowOnlinePayments: false,
      allowAnalytics: false,
      priceMonthly: 29.99,
      priceYearly: 299.99,
    },
  });

  const growthPlan = await prisma.subscriptionPlan.create({
    data: {
      id: 'd98334d4-fc0c-4344-88f6-449fed277a20',
      name: 'Growth',
      stripePriceId: 'price_growth_monthly',
      maxBranches: 5,
      maxRestaurants: 3,
      maxProductsPerBranch: 200,
      allowCustomDomains: true,
      allowOnlinePayments: true,
      allowAnalytics: false,
      priceMonthly: 79.99,
      priceYearly: 799.99,
    },
  });

  const enterprisePlan = await prisma.subscriptionPlan.create({
    data: {
      id: 'a33196e9-92cf-4a7b-8efe-d8ec222f821a',
      name: 'Enterprise',
      stripePriceId: 'price_enterprise_monthly',
      maxBranches: 50,
      maxRestaurants: 20,
      maxProductsPerBranch: 1000,
      allowCustomDomains: true,
      allowOnlinePayments: true,
      allowAnalytics: true,
      priceMonthly: 199.99,
      priceYearly: 1999.99,
    },
  });

  console.log('Created subscription plans:', starterPlan.name, growthPlan.name, enterprisePlan.name);

  // ==========================================
  // 2. TENANTS
  // ==========================================
  const tenant1 = await prisma.tenant.create({
    data: {
      id: '80a00898-782c-4a6e-8bad-880e8f4f7977',
      name: 'Al-Baik Restaurant Group',
      subdomain: 'albaik',
      status: 'ACTIVE',
      primaryColor: '#E31837',
      secondaryColor: '#FFFFFF',
      stripeCustomerId: 'cus_stripe_demo_001',
    },
  });

  const tenant2 = await prisma.tenant.create({
    data: {
      id: '930c9c66-06df-4029-8ee8-ac4d0046c6af',
      name: 'Tokyo Ramen House',
      subdomain: 'tokyoramen',
      status: 'TRIALING',
      primaryColor: '#FF4500',
      secondaryColor: '#1A1A2E',
    },
  });

  console.log('Created tenants:', tenant1.name, tenant2.name);

  // ==========================================
  // 3. SUBSCRIPTIONS
  // ==========================================
  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  await prisma.subscription.create({
    data: {
      tenantId: tenant1.id,
      planId: growthPlan.id,
      status: 'ACTIVE',
      trialStart: new Date('2026-01-01'),
      trialEnd: new Date('2026-01-15'),
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
    },
  });

  await prisma.subscription.create({
    data: {
      tenantId: tenant2.id,
      planId: starterPlan.id,
      status: 'TRIALING',
      trialStart: now,
      trialEnd: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000),
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
    },
  });

  console.log('Created subscriptions.');

  // ==========================================
  // 4. PERMISSIONS
  // ==========================================
  const permissionData = [
    { id: '89b57f62-d43f-4e53-8ca4-a3f6af507190', action: 'read', resource: 'branch', description: 'View branches' },
    { id: 'dcd3e417-4b21-4137-87ad-30f2f308d0a2', action: 'write', resource: 'branch', description: 'Manage branches' },
    { id: '185459a3-11d3-4188-8574-88210fb70bfe', action: 'read', resource: 'menu', description: 'View menu items' },
    { id: 'dbeb4f1c-ada6-4d84-8532-be641a9ee3aa', action: 'write', resource: 'menu', description: 'Manage menu items' },
    { id: '89f81fbd-16ca-453c-83ea-85f714c5cc1f', action: 'read', resource: 'order', description: 'View orders' },
    { id: 'a668e9c1-7232-4e3c-8ace-d80b341f4e3b', action: 'write', resource: 'order', description: 'Manage orders' },
    { id: 'c0843268-f32f-45ad-8449-c4b0ff392dfa', action: 'read', resource: 'kds', description: 'View KDS' },
    { id: 'e5cf5f6c-2221-45a6-8374-77c9fdec5ff8', action: 'write', resource: 'kds', description: 'Update KDS status' },
    { id: '7584c7b6-389b-4f1a-823c-832c3835275c', action: 'read', resource: 'customer', description: 'View customers' },
    { id: '3dfcf3c9-0788-4f54-8ff9-d7f5f6dee021', action: 'write', resource: 'customer', description: 'Manage customers' },
    { id: '8291897b-508f-4a22-8783-2d3305066e40', action: 'read', resource: 'billing', description: 'View billing' },
    { id: '2706f2f7-2490-40de-8dcc-efc14bdfbd45', action: 'write', resource: 'billing', description: 'Manage billing' },
    { id: '1031ff3d-6db6-425d-83a9-5609d545e07b', action: 'read', resource: 'analytics', description: 'View analytics' },
    { id: '817580df-8bb2-4095-8a2a-5faab2fc1032', action: 'write', resource: 'tenant', description: 'Manage tenant settings' },
    // NOTE (RT-ONB-002 fix, 2026-07-31): the rows below use the vocabulary the
    // RBAC guard actually checks (CaslAbilityFactory Subjects/Actions:
    // Product/Order/Branch/Table/Tenant x create/read/update). The legacy rows
    // above keep resources/actions ('menu', 'kds', 'write', ...) that the CASL
    // factory never matches — they are retained for backward compatibility with
    // the MANAGER/CASHIER/KITCHEN_STAFF filters below and are harmless no-ops
    // for the owner. The owner is linked to EVERY row ("Owner gets everything"),
    // so these 8 rows give newly onboarded owners working staff access.
    // IDs are deterministic v4-shaped UUIDs (sha256("zayjar:permission:res:act"),
    // R5 convention — reproducible across clean databases).
    { id: '066e12a9-3a23-4871-98d6-a5866104aaf3', action: 'read', resource: 'product', description: 'View products' },
    { id: 'a1e53cff-66fe-4702-abf3-7dfecbc94d69', action: 'create', resource: 'product', description: 'Create products' },
    { id: '6b767e5a-0e08-43a7-a6d4-b957c1e8a659', action: 'create', resource: 'branch', description: 'Create branches' },
    { id: '74f3d3d2-c05a-4244-8159-162767e35a90', action: 'read', resource: 'table', description: 'View tables' },
    { id: '5b472a2b-bd83-40a7-9492-cf12a7456f87', action: 'create', resource: 'table', description: 'Create tables' },
    { id: 'c18479ea-2b68-44c9-9c67-b7f04497704f', action: 'create', resource: 'order', description: 'Create orders' },
    { id: '9fac8c1f-75ee-4c77-9c3f-11450d5dc3ae', action: 'update', resource: 'order', description: 'Update orders' },
    { id: '788d9744-f80a-4a4e-9ca9-def860879b4b', action: 'update', resource: 'tenant', description: 'Update tenant settings' },
    // AUDIT-004 (staff user management). The `User` CASL subject already
    // existed in CaslAbilityFactory and in the RBAC guard's repository
    // registry, but no permission rows granted it — so no role could manage
    // staff. Same guard vocabulary as the rows above (resource is lowercased
    // and PascalCased by the factory: `user` -> `User`). The owner is linked to
    // EVERY permission row, so seeded and onboarded owners both gain staff
    // management automatically; manager/cashier/kitchen filters below are
    // name-based and therefore unaffected.
    { id: '08c57546-b2c3-4064-a6fe-e0f18b56efdb', action: 'read', resource: 'user', description: 'View staff users' },
    { id: 'f0d9362e-61cc-46e3-a7b3-ce3a971f961b', action: 'create', resource: 'user', description: 'Create staff users' },
    { id: 'df1b4e44-3cb7-473a-a04b-8457f23fbb84', action: 'update', resource: 'user', description: 'Update staff users' },
    { id: '9dff4c6a-ba60-43b1-bac6-37553b6b2155', action: 'delete', resource: 'user', description: 'Delete staff users' },
    // AUDIT-006 / AUDIT-007 (menu + location CRUD). Runtime-proven before this
    // change: a seeded RESTAURANT_OWNER token carried no `*:update`/`*:delete`
    // for product/branch/table and no `category:*` at all, so the new
    // PUT/DELETE/POST-restore endpoints would have returned 403 for every
    // caller including the owner. `Category` is also a new CASL subject (it was
    // absent from CaslAbilityFactory's Subjects union and from the RBAC guard's
    // repository registry — both extended alongside this).
    // Mirrored by migration 20260804000000_soft_delete_partial_unique_and_crud_permissions
    // for databases that are upgraded rather than re-seeded.
    { id: 'c113bd81-a04c-43a2-8b6a-800b7acb6d25', action: 'update', resource: 'product', description: 'Update products' },
    { id: '909d7781-0273-4eac-8d0f-dde089545e5e', action: 'delete', resource: 'product', description: 'Delete products' },
    { id: 'd5e00a2a-a884-4ad6-977f-7a7c3d08ce80', action: 'read', resource: 'category', description: 'View categories' },
    { id: '91333552-edb4-4eba-8102-22e25b392064', action: 'create', resource: 'category', description: 'Create categories' },
    { id: 'b4a79425-a0a9-419a-8e1f-57305ec8c30a', action: 'update', resource: 'category', description: 'Update categories' },
    { id: 'e4678b9a-d826-4455-a185-cf5a14fcbfd1', action: 'delete', resource: 'category', description: 'Delete categories' },
    { id: 'b3dfa635-ecff-4139-9a2a-4b36fac46f9a', action: 'update', resource: 'branch', description: 'Update branches' },
    { id: 'b1a69822-1664-4b09-804d-7dcac002c950', action: 'delete', resource: 'branch', description: 'Delete branches' },
    { id: 'ee2b6baa-999c-4d97-9371-062c40bd6d77', action: 'update', resource: 'table', description: 'Update tables' },
    { id: 'f3d92895-1ac2-470d-a472-7ed904f27b36', action: 'delete', resource: 'table', description: 'Delete tables' },
    // AUDIT-014 (DEFECT-H). `CustomerController` had NO guard at all, so
    // `GET /api/v1/customers` served the whole customer PII table to
    // unauthenticated callers (runtime-proven HTTP 200). It is now guarded with
    // `@RequirePermission(<action>, 'Customer')`, which needs these rows in the
    // CASL vocabulary — the legacy `customer:write` row is not a CASL action
    // and never matched. Mirrored by migration
    // 20260804010000_customer_crud_permissions for upgraded databases.
    { id: '5c801e6a-9dd4-4efa-a259-1a5dda2a0dc4', action: 'create', resource: 'customer', description: 'Create customers' },
    { id: 'b2f0df84-5159-4e76-9aa9-32633d49ba7f', action: 'update', resource: 'customer', description: 'Update customers' },
    { id: 'e388594d-c749-480a-9045-514e01197bc3', action: 'delete', resource: 'customer', description: 'Delete customers' },
    // AUDIT-014 DEFECT-L: the category/branch creation forms need a
    // restaurantId, but nothing exposed one (GET /api/v1/restaurants was a hard
    // 404). Mirrored by migration 20260804020000_restaurant_read_permission.
    { id: 'e639eecc-9662-4413-b0fa-7268801aca3f', action: 'read', resource: 'restaurant', description: 'View restaurant brands' },
    // AUDIT-008 — restaurant write management. Same CASL vocabulary as
    // AUDIT-006/007. Mirrored by migration 20260823000000_restaurant_write_permissions.
    { id: '8b0a0a8f-d547-445c-a490-19e80a3c2140', action: 'create', resource: 'restaurant', description: 'Create restaurant brands' },
    { id: '8a069985-e595-4d35-8d79-5ebf83542603', action: 'update', resource: 'restaurant', description: 'Update restaurant brands' },
    { id: 'c3074e8c-e8c3-4650-9fde-b1f2d828e3f8', action: 'delete', resource: 'restaurant', description: 'Delete restaurant brands' },
    // AUDIT-009 — discount management. Same CASL vocabulary. Mirrored by
    // migration 20260823010000_discount_permissions.
    { id: '240ee971-0299-4a3e-960a-53c50426f5d7', action: 'read', resource: 'discount', description: 'View discount codes' },
    { id: '4fa165bc-d656-49d7-8b91-e98c266c1fe3', action: 'create', resource: 'discount', description: 'Create discount codes' },
    { id: 'ad5d6460-5701-4594-8998-9de09fb072d6', action: 'update', resource: 'discount', description: 'Update discount codes' },
    { id: '2d3a2e90-b039-4e0f-a7b8-997f4a4f0f20', action: 'delete', resource: 'discount', description: 'Delete discount codes' },
    // AUDIT-010 — invoice retrieval/resend. Mirrored by migration
    // 20260824000000_invoice_permissions.
    { id: '63925a50-623b-47d5-b2d2-97135cb19c89', action: 'read', resource: 'invoice', description: 'View invoices' },
    { id: '9ad98f03-c7af-459c-82f9-41bbeb8c5a45', action: 'update', resource: 'invoice', description: 'Resend invoices' },
    // ELEVA AI Agent V1 — PLATFORM_OWNER only (excluded from restaurant owner
    // auto-grant below). Mirrored by migration 20260825000000_agent_v1_foundation.
    { id: 'f6262c6c-e4f3-44fa-9da1-a0d2419f4247', action: 'read', resource: 'agent', description: 'View ELEVA Agent sessions and reports' },
    { id: 'f37db619-1b5c-4296-bdd7-0870baf560e5', action: 'create', resource: 'agent', description: 'Create ELEVA Agent sessions and invoke safe tools' },
    { id: 'a4ef38b5-7df9-4309-8cee-d7860d02a143', action: 'update', resource: 'agent', description: 'Approve or reject ELEVA Agent actions' },
    // AUDIT-002 Finding #5 (RBAC). The wallet payment endpoints require the
    // `payment:create` / `payment:read` permissions (CASL vocabulary, matching
    // the guard's Subjects union). The owner is linked to EVERY row, so seeded
    // and onboarded owners gain both automatically. MANAGER/CASHIER receive
    // `payment:read` via the resource-list filters below ('payment' added to
    // their lists); `payment:create` is a CASL verb the read/write filters
    // never match, so it gets explicit rolePermission links for both roles.
    // KITCHEN_STAFF is deliberately not granted either. Mirrored by migration
    // 20260811010000_payment_permissions for upgraded databases.
    { id: '328a0aa5-0576-4750-87bb-01ba2c283f74', action: 'create', resource: 'payment', description: 'Create wallet payments' },
    { id: 'fec355e8-c91f-45b6-83b7-fbb957c180ae', action: 'read', resource: 'payment', description: 'View wallet payments' },
    // Media library + presigned asset uploads. Owner gets every row;
    // MANAGER is granted these four explicitly. CASHIER/KITCHEN_STAFF
    // are not (POS/KDS must not mutate tenant media).
    { id: 'b005dd96-54ee-4311-a26a-62ca20f35820', action: 'create', resource: 'media', description: 'Upload media assets' },
    { id: '82c64075-ec52-46e5-8b66-4471caf40afa', action: 'read', resource: 'media', description: 'View media assets' },
    { id: '35885e3d-f0c2-4a3a-aada-164ef59a73cd', action: 'update', resource: 'media', description: 'Optimize media assets' },
    { id: '21d7a846-1b80-405f-9d9c-6224e0485524', action: 'delete', resource: 'media', description: 'Delete media assets' },
  ];

  const permissions = await Promise.all(
    permissionData.map((p) =>
      prisma.permission.create({
        data: {
          id: p.id,
          action: p.action,
          resource: p.resource,
          description: p.description,
        },
      }),
    ),
  );

  console.log('Created', permissions.length, 'permissions.');

  // ==========================================
  // 5. ROLES (Tenant 1)
  // ==========================================
  const ownerRole = await prisma.role.create({
    data: {
      id: 'e75d6138-dccf-4f0e-8cb0-256f75ada46c',
      tenantId: tenant1.id,
      name: 'RESTAURANT_OWNER',
      displayName: 'Restaurant Owner',
      description: 'Full access to all restaurant features',
    },
  });

  const managerRole = await prisma.role.create({
    data: {
      id: '6c65c0c0-48d1-42d2-81d5-e6c38e2b2f18',
      tenantId: tenant1.id,
      name: 'MANAGER',
      displayName: 'Manager',
      description: 'Can manage menu, orders, and branches',
    },
  });

  const cashierRole = await prisma.role.create({
    data: {
      id: '9c087a90-7923-402c-87a4-64842ac71614',
      tenantId: tenant1.id,
      name: 'CASHIER',
      displayName: 'Cashier',
      description: 'Can process orders and payments',
    },
  });

  const kitchenRole = await prisma.role.create({
    data: {
      id: 'd11c8c4d-3d2c-414f-8f76-69946a03c106',
      tenantId: tenant1.id,
      name: 'KITCHEN_STAFF',
      displayName: 'Kitchen Staff',
      description: 'Can view and update cooking status',
    },
  });

  // Platform Owner role — tenantId=null, platform-wide. Created with its own
  // deterministic id (Phase 4 P0 / DEMO.md consistency: platform@zayjar.ai must
  // exist in the canonical seed, not only in scripts/seed-demo.js).
  const platformRole = await prisma.role.create({
    data: {
      id: 'b0000001-0000-4000-b000-000000000001',
      tenantId: null,
      name: 'PLATFORM_OWNER',
      displayName: 'Platform Owner',
      description: 'Platform-wide administration (tenantId = null)',
    },
  });

  console.log('Created roles:', ownerRole.name, managerRole.name, cashierRole.name, kitchenRole.name, platformRole.name);

  // ==========================================
  // 6. ROLE-PERMISSION MAPPING
  // ==========================================
  // Owner gets everything except platform-only Agent grants.
  const allPermissions = permissions;
  const restaurantOwnerPermissions = allPermissions.filter((p) => p.resource !== 'agent');
  await Promise.all(
    restaurantOwnerPermissions.map((p) =>
      prisma.rolePermission.create({
        data: { roleId: ownerRole.id, permissionId: p.id },
      }),
    ),
  );

  // ==========================================
  // Phase 4 P0 — role grants use the modern CASL vocabulary.
  // Each grant is an explicit (resource, action) pair whose action is one of
  // create/read/update/delete and whose resource matches a Subject in
  // CaslAbilityFactory (Product, Category, Order, Branch, Tenant, User,
  // Table, Customer, Restaurant, Payment). The legacy `menu`/`kds`/
  // `billing`/`analytics` resource rows and the `write` action remain in the
  // permissions table for backward compatibility (they are harmless no-ops —
  // `write` and `menu`/`kds`/`billing`/`analytics` never match a CASL
  // Subject), but they are NO LONGER the source of effective grants.
  // ==========================================
  const linkRolePermissions = async (
    roleId: string,
    grants: Array<{ resource: string; action: string }>,
  ): Promise<void> => {
    const ids = grants
      .map((g) => allPermissions.find((p) => p.resource === g.resource && p.action === g.action)?.id)
      .filter((id): id is string => !!id);
    await Promise.all(
      ids.map((permissionId) =>
        prisma.rolePermission.create({
          data: { roleId, permissionId },
        }),
      ),
    );
  };

  // MANAGER — restaurant management for the manager's assigned branch(es).
  await linkRolePermissions(managerRole.id, [
    { resource: 'branch', action: 'read' },
    { resource: 'branch', action: 'create' },
    { resource: 'branch', action: 'update' },
    { resource: 'branch', action: 'delete' },
    { resource: 'product', action: 'read' },
    { resource: 'product', action: 'create' },
    { resource: 'product', action: 'update' },
    { resource: 'product', action: 'delete' },
    { resource: 'category', action: 'read' },
    { resource: 'category', action: 'create' },
    { resource: 'category', action: 'update' },
    { resource: 'category', action: 'delete' },
    { resource: 'table', action: 'read' },
    { resource: 'table', action: 'create' },
    { resource: 'table', action: 'update' },
    { resource: 'table', action: 'delete' },
    { resource: 'order', action: 'read' },
    { resource: 'order', action: 'create' },
    { resource: 'order', action: 'update' },
    { resource: 'customer', action: 'read' },
    { resource: 'customer', action: 'create' },
    { resource: 'customer', action: 'update' },
    { resource: 'customer', action: 'delete' },
    { resource: 'payment', action: 'read' },
    { resource: 'payment', action: 'create' },
    { resource: 'restaurant', action: 'read' },
    { resource: 'restaurant', action: 'update' },
    { resource: 'discount', action: 'read' },
    { resource: 'discount', action: 'create' },
    { resource: 'discount', action: 'update' },
    { resource: 'invoice', action: 'read' },
    { resource: 'invoice', action: 'update' },
    { resource: 'media', action: 'create' },
    { resource: 'media', action: 'read' },
    { resource: 'media', action: 'update' },
    { resource: 'media', action: 'delete' },
  ]);

  // CASHIER — POS operations on the cashier's assigned branch(es).
  await linkRolePermissions(cashierRole.id, [
    { resource: 'order', action: 'read' },
    { resource: 'order', action: 'create' },
    { resource: 'order', action: 'update' },
    { resource: 'product', action: 'read' },
    { resource: 'customer', action: 'read' },
    { resource: 'customer', action: 'create' },
    { resource: 'payment', action: 'read' },
    { resource: 'payment', action: 'create' },
    { resource: 'table', action: 'read' },
  ]);

  // KITCHEN_STAFF — KDS only. KDS endpoints are guarded on the Order subject,
  // so the effective grants are order read/update + product read (item names).
  await linkRolePermissions(kitchenRole.id, [
    { resource: 'order', action: 'read' },
    { resource: 'order', action: 'update' },
    { resource: 'product', action: 'read' },
  ]);

  // PLATFORM_OWNER — linked to EVERY permission row (platform-wide).
  await Promise.all(
    allPermissions.map((p) =>
      prisma.rolePermission.create({
        data: { roleId: platformRole.id, permissionId: p.id },
      }),
    ),
  );

  console.log('Created role-permission mappings.');

  // ==========================================
  // 7. USERS
  // ==========================================
  // Password: "Demo1234!" — REAL Argon2id hash (Phase 4 P0). Verified with
  // argon2.verify at generation time; seeded users can actually log in.
  // Generated with argon2id (memoryCost 65536, timeCost 3, parallelism 4).
  const passwordHash = '$argon2id$v=19$m=65536,p=4,t=3$OKCUB0Sk24nQpg6xu2dDkA$sLnvDE29uLc3DueyqaSeXKhEqh4TuOG3BMNrauWYLKo';
  // Platform Owner password: "Platform123!" (DEMO.md). Verified with
  // argon2.verify at generation time.
  const platformPasswordHash = '$argon2id$v=19$m=65536,p=4,t=3$nR7/QNwcjrWPm/S5g8pphQ$pXuCBaq2KB8BqxHhPC/RdxvhU47i2KkrvDnjBNtLtzk';

  const platformUser = await prisma.user.create({
    data: {
      id: 'b0000001-0000-4000-b000-000000000002',
      tenantId: null,
      firstName: 'System',
      lastName: 'Admin',
      email: 'platform@zayjar.ai',
      passwordHash: platformPasswordHash,
      isActive: true,
      emailVerified: true,
    },
  });

  const adminUser = await prisma.user.create({
    data: {
      id: '2f4cde95-8eea-4d7e-8400-77134aca39e5',
      tenantId: tenant1.id,
      firstName: 'Ahmed',
      lastName: 'Al-Rashid',
      email: 'admin@albaik.com',
      passwordHash,
      phoneNumber: '+966501234567',
      isActive: true,
      emailVerified: true,
    },
  });

  const managerUser = await prisma.user.create({
    data: {
      id: 'a5141f0b-4213-405f-8cfa-e32dc0e0ef90',
      tenantId: tenant1.id,
      firstName: 'Fatima',
      lastName: 'Hassan',
      email: 'manager@albaik.com',
      passwordHash,
      phoneNumber: '+966502345678',
      isActive: true,
      emailVerified: true,
    },
  });

  const cashierUser = await prisma.user.create({
    data: {
      id: '62c8645b-82f2-45f1-8289-81fbaf3147ec',
      tenantId: tenant1.id,
      firstName: 'Omar',
      lastName: 'Khalil',
      email: 'cashier@albaik.com',
      passwordHash,
      isActive: true,
      emailVerified: true,
    },
  });

  const kitchenUser = await prisma.user.create({
    data: {
      id: '45687ac4-9514-42a9-82a2-a74db3cddfc6',
      tenantId: tenant1.id,
      firstName: 'Yusuf',
      lastName: 'Ibrahim',
      email: 'kitchen@albaik.com',
      passwordHash,
      isActive: true,
      emailVerified: true,
    },
  });

  // Tenant 2 users
  const tenant2Admin = await prisma.user.create({
    data: {
      id: '98978ba1-a3ac-4b40-8094-cad545f34e61',
      tenantId: tenant2.id,
      firstName: 'Kenji',
      lastName: 'Tanaka',
      email: 'admin@tokyoramen.com',
      passwordHash,
      phoneNumber: '+81901234567',
      isActive: true,
      emailVerified: true,
    },
  });

  console.log('Created users.');

  // ==========================================
  // 8. USER-ROLE MAPPING
  // ==========================================
  await prisma.userRole.create({ data: { userId: adminUser.id, roleId: ownerRole.id } });
  await prisma.userRole.create({ data: { userId: managerUser.id, roleId: managerRole.id } });
  await prisma.userRole.create({ data: { userId: cashierUser.id, roleId: cashierRole.id } });
  await prisma.userRole.create({ data: { userId: kitchenUser.id, roleId: kitchenRole.id } });
  await prisma.userRole.create({ data: { userId: tenant2Admin.id, roleId: ownerRole.id } });
  // Platform owner — tenantId=null (platform-wide administration).
  await prisma.userRole.create({ data: { userId: platformUser.id, roleId: platformRole.id } });

  console.log('Created user-role mappings.');

  // ==========================================
  // 9. RESTAURANTS
  // ==========================================
  const restaurant1 = await prisma.restaurant.create({
    data: {
      id: 'e0478415-d8c4-4868-8083-20bf58cc02f5',
      tenantId: tenant1.id,
      name: 'Al-Baik Chicken',
      currency: 'SAR',
      timezone: 'Asia/Riyadh',
      taxPercentage: 15.0,
    },
  });

  const restaurant2 = await prisma.restaurant.create({
    data: {
      id: 'a0dca7e4-b104-49f9-80ad-9eaa5f4fc6e5',
      tenantId: tenant2.id,
      name: 'Tokyo Ramen House',
      currency: 'JPY',
      timezone: 'Asia/Tokyo',
      taxPercentage: 10.0,
    },
  });

  console.log('Created restaurants.');

  // ==========================================
  // 10. BRANCHES
  // ==========================================
  const branch1 = await prisma.branch.create({
    data: {
      id: 'b09e5d1c-7f77-42ad-8ca9-c6012854bf0b',
      tenantId: tenant1.id,
      restaurantId: restaurant1.id,
      name: 'Riyadh - Olaya Branch',
      address: '123 Olaya Street, Al Olaya District, Riyadh 12211, Saudi Arabia',
      latitude: 24.7136,
      longitude: 46.6753,
      phoneNumber: '+966112345678',
      operatingHours: {
        sunday: { open: '10:00', close: '23:00' },
        monday: { open: '10:00', close: '23:00' },
        tuesday: { open: '10:00', close: '23:00' },
        wednesday: { open: '10:00', close: '23:00' },
        thursday: { open: '10:00', close: '23:59' },
        friday: { open: '13:00', close: '23:59' },
        saturday: { open: '10:00', close: '23:00' },
      },
      isActive: true,
    },
  });

  const branch2 = await prisma.branch.create({
    data: {
      id: '4316ed8e-e1df-43bb-82ab-abbc2140ab8b',
      tenantId: tenant1.id,
      restaurantId: restaurant1.id,
      name: 'Jeddah - Tahlia Branch',
      address: '456 Tahlia Street, Al Andalus District, Jeddah 21431, Saudi Arabia',
      latitude: 21.5433,
      longitude: 39.1728,
      phoneNumber: '+966122345678',
      operatingHours: {
        sunday: { open: '10:00', close: '23:00' },
        monday: { open: '10:00', close: '23:00' },
        tuesday: { open: '10:00', close: '23:00' },
        wednesday: { open: '10:00', close: '23:00' },
        thursday: { open: '10:00', close: '23:59' },
        friday: { open: '13:00', close: '23:59' },
        saturday: { open: '10:00', close: '23:00' },
      },
      isActive: true,
    },
  });

  await prisma.branch.create({
    data: {
      id: 'bc678e09-5018-4c81-871e-eb1eece71274',
      tenantId: tenant2.id,
      restaurantId: restaurant2.id,
      name: 'Shibuya Main',
      address: '1-2-3 Shibuya, Shibuya-ku, Tokyo 150-0002, Japan',
      latitude: 35.658,
      longitude: 139.7016,
      phoneNumber: '+81312345678',
      operatingHours: {
        monday: { open: '11:00', close: '22:00' },
        tuesday: { open: '11:00', close: '22:00' },
        wednesday: { open: '11:00', close: '22:00' },
        thursday: { open: '11:00', close: '22:00' },
        friday: { open: '11:00', close: '23:00' },
        saturday: { open: '10:00', close: '23:00' },
        sunday: { open: '10:00', close: '22:00' },
      },
      isActive: true,
    },
  });

  console.log('Created branches.');

  // ==========================================
  // 10b. USER-BRANCH ASSIGNMENTS (DOC-005 §4.2 / Phase 4 P0)
  // ==========================================
  // Branch-scoped staff roles must carry a persistent user_branches source so
  // the JWT `branches` claim and the CASL branch-scoping rules have real data.
  //   manager@albaik.com  -> BOTH Al-Baik branches (explicit assignment; still
  //                          scoped — no implicit access to other tenants)
  //   cashier@albaik.com  -> Riyadh - Olaya branch only
  //   kitchen@albaik.com  -> Riyadh - Olaya branch only
  // Owners (admin@albaik.com, admin@tokyoramen.com) intentionally have NO
  // user_branches rows -> tenant-wide per the canonical RBAC design.
  await Promise.all([
    prisma.userBranch.create({ data: { userId: managerUser.id, branchId: branch1.id, tenantId: tenant1.id } }),
    prisma.userBranch.create({ data: { userId: managerUser.id, branchId: branch2.id, tenantId: tenant1.id } }),
    prisma.userBranch.create({ data: { userId: cashierUser.id, branchId: branch1.id, tenantId: tenant1.id } }),
    prisma.userBranch.create({ data: { userId: kitchenUser.id, branchId: branch1.id, tenantId: tenant1.id } }),
  ]);
  console.log('Created user-branch assignments.');

  // ==========================================
  // 11. TABLES
  // ==========================================
  const tablesBranch1 = await Promise.all(
    Array.from({ length: 8 }, (_, i) =>
      prisma.table.create({
        data: {
          tenantId: tenant1.id,
          branchId: branch1.id,
          number: String(i + 1),
          seatingCapacity: i < 4 ? 4 : i < 6 ? 6 : 8,
          qrCodeToken: `qr-albaik-r-${i + 1}-${Date.now()}`,
          status: i < 3 ? 'VACANT' : 'OCCUPIED',
        },
      }),
    ),
  );

  const tablesBranch2 = await Promise.all(
    Array.from({ length: 6 }, (_, i) =>
      prisma.table.create({
        data: {
          tenantId: tenant1.id,
          branchId: branch2.id,
          number: String(i + 1),
          seatingCapacity: i < 3 ? 2 : 4,
          qrCodeToken: `qr-albaik-j-${i + 1}-${Date.now()}`,
          status: 'VACANT',
        },
      }),
    ),
  );

  console.log('Created', tablesBranch1.length + tablesBranch2.length, 'tables.');

  // ==========================================
  // 12. CATEGORIES
  // ==========================================
  const catAppetizers = await prisma.category.create({
    data: {
      id: 'ad353fb4-ce19-48bb-8452-2c2849579161',
      tenantId: tenant1.id,
      restaurantId: restaurant1.id,
      name: 'Appetizers',
      sortOrder: 1,
      isActive: true,
    },
  });

  const catChicken = await prisma.category.create({
    data: {
      id: 'b7ce7d14-c59f-40f5-8837-ae41c86a2258',
      tenantId: tenant1.id,
      restaurantId: restaurant1.id,
      name: 'Signature Chicken',
      sortOrder: 2,
      isActive: true,
    },
  });

  const catSides = await prisma.category.create({
    data: {
      id: '9e8deaff-c4eb-41b0-8eb5-2d9bf78e80bb',
      tenantId: tenant1.id,
      restaurantId: restaurant1.id,
      name: 'Sides & Rice',
      sortOrder: 3,
      isActive: true,
    },
  });

  const catBeverages = await prisma.category.create({
    data: {
      id: '350dadb7-058d-4104-883f-a131d841aa85',
      tenantId: tenant1.id,
      restaurantId: restaurant1.id,
      name: 'Beverages',
      sortOrder: 4,
      isActive: true,
    },
  });

  const catDesserts = await prisma.category.create({
    data: {
      id: 'f69acc1a-d5c9-4474-80ee-49bea2363b8f',
      tenantId: tenant1.id,
      restaurantId: restaurant1.id,
      name: 'Desserts',
      sortOrder: 5,
      isActive: true,
    },
  });

  // Tenant 2 categories
  const catT2Ramen = await prisma.category.create({
    data: {
      id: 'cafaa5b2-a751-482e-8d65-831005baaedb',
      tenantId: tenant2.id,
      restaurantId: restaurant2.id,
      name: 'Ramen',
      sortOrder: 1,
      isActive: true,
    },
  });

  const catT2Sides = await prisma.category.create({
    data: {
      id: '3ee79553-2b2b-42d6-83ad-706cad639875',
      tenantId: tenant2.id,
      restaurantId: restaurant2.id,
      name: 'Sides',
      sortOrder: 2,
      isActive: true,
    },
  });

  console.log('Created categories.');

  // ==========================================
  // 13. PRODUCTS
  // ==========================================
  // --- Appetizers ---
  await prisma.product.create({
    data: {
      id: 'ad831f44-a7ff-4d1d-87c1-eb6def23a143',
      tenantId: tenant1.id,
      categoryId: catAppetizers.id,
      name: 'Hummus with Bread',
      description: 'Creamy chickpea hummus served with freshly baked Arabic bread',
      basePrice: 12.0,
      calories: 320,
      preparationTime: 5,
    },
  });

  await prisma.product.create({
    data: {
      id: 'f5af4d28-c867-4ee9-8a54-fd40a5ed541c',
      tenantId: tenant1.id,
      categoryId: catAppetizers.id,
      name: 'Lentil Soup',
      description: 'Traditional Arabic lentil soup with cumin and lemon',
      basePrice: 8.0,
      calories: 180,
      preparationTime: 5,
    },
  });

  // --- Signature Chicken ---
  const classicChicken = await prisma.product.create({
    data: {
      id: 'a7a2721c-1a1d-4671-817f-2c23e12762ab',
      tenantId: tenant1.id,
      categoryId: catChicken.id,
      name: 'Classic Broasted Chicken',
      description: 'Our signature 7-piece broasted chicken with secret spice blend',
      basePrice: 35.0,
      calories: 850,
      preparationTime: 20,
    },
  });

  const spicyChicken = await prisma.product.create({
    data: {
      id: 'b41fbd73-6085-49e6-85ee-882f3980799f',
      tenantId: tenant1.id,
      categoryId: catChicken.id,
      name: 'Spicy Broasted Chicken',
      description: '7-piece broasted chicken with our fiery spice coating',
      basePrice: 38.0,
      calories: 880,
      preparationTime: 20,
    },
  });

  const chickenNuggets = await prisma.product.create({
    data: {
      id: '9b2d794e-d318-4343-894c-8d95891e3729',
      tenantId: tenant1.id,
      categoryId: catChicken.id,
      name: 'Chicken Nuggets',
      description: 'Crispy chicken nuggets with dipping sauce',
      basePrice: 22.0,
      calories: 450,
      preparationTime: 12,
    },
  });

  // --- Sides ---
  const fries = await prisma.product.create({
    data: {
      id: 'bd7fe87e-eeb4-4590-8c79-bf44217d198c',
      tenantId: tenant1.id,
      categoryId: catSides.id,
      name: 'French Fries',
      description: 'Golden crispy French fries',
      basePrice: 8.0,
      calories: 380,
      preparationTime: 8,
    },
  });

  await prisma.product.create({
    data: {
      id: '4b07662b-7e47-4bf5-88d5-93b7dc0c12e5',
      tenantId: tenant1.id,
      categoryId: catSides.id,
      name: 'Spiced Rice',
      description: 'Fragrant basmati rice with traditional spices',
      basePrice: 6.0,
      calories: 280,
      preparationTime: 5,
    },
  });

  await prisma.product.create({
    data: {
      id: '48bcd555-9585-481e-8c31-ca87701005aa',
      tenantId: tenant1.id,
      categoryId: catSides.id,
      name: 'Coleslaw',
      description: 'Fresh coleslaw with creamy dressing',
      basePrice: 5.0,
      calories: 150,
      preparationTime: 2,
    },
  });

  // --- Beverages ---
  const cola = await prisma.product.create({
    data: {
      id: '9deab587-5c3d-4b32-8d07-f3115398cc05',
      tenantId: tenant1.id,
      categoryId: catBeverages.id,
      name: 'Soft Drink',
      description: 'Choice of Coca-Cola, Sprite, or Fanta',
      basePrice: 4.0,
      calories: 150,
      preparationTime: 1,
    },
  });

  await prisma.product.create({
    data: {
      id: 'c1f01b11-1ba7-4bf2-8cb6-b0452c56dfe2',
      tenantId: tenant1.id,
      categoryId: catBeverages.id,
      name: 'Fresh Laban',
      description: 'Traditional fresh buttermilk drink',
      basePrice: 5.0,
      calories: 120,
      preparationTime: 2,
    },
  });

  // --- Desserts ---
  await prisma.product.create({
    data: {
      id: '7e344eef-d30f-470e-89fd-535e735ff878',
      tenantId: tenant1.id,
      categoryId: catDesserts.id,
      name: 'Baklava',
      description: 'Layered phyllo pastry with pistachios and honey syrup',
      basePrice: 10.0,
      calories: 340,
      preparationTime: 2,
    },
  });

  // --- Tenant 2 Products ---
  const tonkotsu = await prisma.product.create({
    data: {
      id: 'c702572b-f2b2-4f77-8913-2a726ca7673c',
      tenantId: tenant2.id,
      categoryId: catT2Ramen.id,
      name: 'Tonkotsu Ramen',
      description: 'Rich pork bone broth with chashu, egg, and nori',
      basePrice: 1200.0,
      calories: 650,
      preparationTime: 10,
    },
  });

  const misoRamen = await prisma.product.create({
    data: {
      id: 'b6b0e1b4-3541-4604-8e43-891830595b65',
      tenantId: tenant2.id,
      categoryId: catT2Ramen.id,
      name: 'Miso Ramen',
      description: 'Savory miso broth with corn, butter, and ground pork',
      basePrice: 1100.0,
      calories: 580,
      preparationTime: 10,
    },
  });

  await prisma.product.create({
    data: {
      id: '2e312149-cbef-4d51-88e5-ce6c53b98e63',
      tenantId: tenant2.id,
      categoryId: catT2Sides.id,
      name: 'Gyoza (6 pcs)',
      description: 'Pan-fried pork dumplings with dipping sauce',
      basePrice: 550.0,
      calories: 320,
      preparationTime: 8,
    },
  });

  console.log('Created products.');

  // ==========================================
  // 14. PRODUCT SIZES
  // ==========================================
  await prisma.productSize.createMany({
    data: [
      { id: '14a114f0-6b4f-42b0-8e01-b66c3197f6dd', tenantId: tenant1.id, productId: classicChicken.id, name: 'Small (4 pcs)', priceAdjustment: -10.0 },
      { id: 'bcd8ffd5-36bb-4ba9-818c-01534d407036', tenantId: tenant1.id, productId: classicChicken.id, name: 'Medium (7 pcs)', priceAdjustment: 0 },
      { id: '86b0acde-b28d-44f8-892f-6b2fe5f4313b', tenantId: tenant1.id, productId: classicChicken.id, name: 'Large (10 pcs)', priceAdjustment: 15.0 },
      { id: '4ebe1bbf-95a4-49c5-8027-2cce9f21dd9b', tenantId: tenant1.id, productId: spicyChicken.id, name: 'Small (4 pcs)', priceAdjustment: -10.0 },
      { id: 'e5f3571c-c92c-4602-8cc2-91fe86a3193e', tenantId: tenant1.id, productId: spicyChicken.id, name: 'Medium (7 pcs)', priceAdjustment: 0 },
      { id: 'e752ba4e-1f17-454b-8020-2c10cc4f8f15', tenantId: tenant1.id, productId: spicyChicken.id, name: 'Large (10 pcs)', priceAdjustment: 15.0 },
      { id: 'c8306d3c-9515-456b-8a06-c78ad38ed5eb', tenantId: tenant1.id, productId: chickenNuggets.id, name: '6 Pieces', priceAdjustment: -6.0 },
      { id: '4667c88c-184f-442b-805a-a4d6bc914e02', tenantId: tenant1.id, productId: chickenNuggets.id, name: '12 Pieces', priceAdjustment: 8.0 },
      { id: 'b2f50c5b-a327-4093-8610-643023ee679b', tenantId: tenant1.id, productId: fries.id, name: 'Small', priceAdjustment: 0 },
      { id: '34f96c36-a426-497a-8407-250b05db7541', tenantId: tenant1.id, productId: fries.id, name: 'Large', priceAdjustment: 4.0 },
      { id: '670bda98-cb39-459e-82c7-1ecf36a92908', tenantId: tenant1.id, productId: cola.id, name: 'Regular', priceAdjustment: 0 },
      { id: '2b4904d9-f63a-4579-8ff4-2565f359215b', tenantId: tenant1.id, productId: cola.id, name: 'Large', priceAdjustment: 2.0 },
    ],
  });

  console.log('Created product sizes.');

  // ==========================================
  // 15. PRODUCT VARIANTS
  // ==========================================
  await prisma.productVariant.createMany({
    data: [
      { id: '3e372363-b8cb-49d2-81f8-01cce873a460', tenantId: tenant1.id, productId: cola.id, sku: 'BEV-COLA', name: 'Coca-Cola', price: 0, stockQuantity: 999 },
      { id: 'e34ca4ad-c17b-4253-8fa8-945a795e4317', tenantId: tenant1.id, productId: cola.id, sku: 'BEV-SPRT', name: 'Sprite', price: 0, stockQuantity: 999 },
      { id: '39321e93-fa32-40f1-87fc-1ba5b7629b02', tenantId: tenant1.id, productId: cola.id, sku: 'BEV-FNTA', name: 'Fanta', price: 0, stockQuantity: 999 },
      { id: 'd24ceaac-a4f0-4cc9-8a53-307ae7141536', tenantId: tenant2.id, productId: tonkotsu.id, sku: 'RMN-TK-R', name: 'Regular', price: 0, stockQuantity: 50 },
      { id: 'd7cf7729-2efa-4b1d-8927-f34cae11c442', tenantId: tenant2.id, productId: tonkotsu.id, sku: 'RMN-TK-S', name: 'Spicy', price: 100, stockQuantity: 50 },
      { id: 'fd46573c-d9d6-4116-8462-01a87528f660', tenantId: tenant2.id, productId: misoRamen.id, sku: 'RMN-MISO-R', name: 'Regular', price: 0, stockQuantity: 50 },
    ],
  });

  console.log('Created product variants.');

  // ==========================================
  // 16. PRODUCT ADDONS
  // ==========================================
  const extraChickenAddon = await prisma.productAddon.create({
    data: {
      id: 'd92ffa0d-e9be-4806-82c9-39a9b1c3d4aa',
      tenantId: tenant1.id,
      productId: classicChicken.id,
      name: 'Extra Chicken',
      minSelections: 0,
      maxSelections: 3,
    },
  });

  await prisma.addonItem.createMany({
    data: [
      { id: '639a8589-d134-4099-8e00-feed15911ee3', tenantId: tenant1.id, addonGroupId: extraChickenAddon.id, name: 'Extra Breast Piece', price: 8.0, isAvailable: true },
      { id: 'fe41c5d8-048f-4bdf-8f37-8254d707fc61', tenantId: tenant1.id, addonGroupId: extraChickenAddon.id, name: 'Extra Wing Piece', price: 5.0, isAvailable: true },
      { id: '799d128e-fa8f-4a25-8d9e-105ded74b42c', tenantId: tenant1.id, addonGroupId: extraChickenAddon.id, name: 'Extra Thigh Piece', price: 6.0, isAvailable: true },
    ],
  });

  const sauceAddon = await prisma.productAddon.create({
    data: {
      id: '94fb6730-0bc3-4878-8a1b-9baf004855ef',
      tenantId: tenant1.id,
      productId: classicChicken.id,
      name: 'Dipping Sauces',
      minSelections: 0,
      maxSelections: 2,
    },
  });

  await prisma.addonItem.createMany({
    data: [
      { id: '4d54a0ea-7bca-4b41-86e9-6b6a47133aaa', tenantId: tenant1.id, addonGroupId: sauceAddon.id, name: 'Garlic Sauce', price: 0, isAvailable: true },
      { id: '9cf1221c-1550-457a-8bbe-e12c2b7f6349', tenantId: tenant1.id, addonGroupId: sauceAddon.id, name: 'Hot Sauce', price: 0, isAvailable: true },
      { id: '46d4e503-8cb9-4e3f-893e-c59f0f10cafa', tenantId: tenant1.id, addonGroupId: sauceAddon.id, name: 'Cheese Sauce', price: 2.0, isAvailable: true },
    ],
  });

  console.log('Created addons.');

  // ==========================================
  // 17. CUSTOMERS
  // ==========================================
  const customer1 = await prisma.customer.create({
    data: {
      id: '386031ba-950f-43b9-8edf-a0043d696340',
      tenantId: tenant1.id,
      firstName: 'Sara',
      lastName: 'Al-Mutairi',
      email: 'sara.mutairi@email.com',
      phoneNumber: '+966551112233',
      loyaltyPoints: 150,
    },
  });

  const customer2 = await prisma.customer.create({
    data: {
      id: 'c505847a-10bf-49a2-8a49-5d4cb0b258bb',
      tenantId: tenant1.id,
      firstName: 'Khalid',
      lastName: 'Al-Otaibi',
      email: 'khalid.otaibi@email.com',
      phoneNumber: '+966552223344',
      loyaltyPoints: 320,
    },
  });

  const customer3 = await prisma.customer.create({
    data: {
      id: '2c0d356f-c26e-498c-8dd9-714a555da96a',
      tenantId: tenant1.id,
      firstName: 'Noura',
      lastName: 'Saeed',
      email: 'noura.saeed@email.com',
      loyaltyPoints: 75,
    },
  });

  console.log('Created customers.');

  // ==========================================
  // 18. SAMPLE ORDERS
  // ==========================================
  const order1 = await prisma.order.create({
    data: {
      id: '192c2d1d-cc77-4759-808d-8a6e5dc40350',
      tenantId: tenant1.id,
      branchId: branch1.id,
      customerId: customer1.id,
      tableId: tablesBranch1[0].id,
      orderNumber: 'ALB-R-00001',
      type: 'DINE_IN',
      status: 'COMPLETED',
      subtotal: 61.0,
      taxAmount: 9.15,
      total: 70.15,
    },
  });

  // Classic Chicken - Medium, 1x extra breast, garlic sauce
  const orderItem1 = await prisma.orderItem.create({
    data: {
      id: 'a967fea5-e573-4223-8052-8c3aa72fcbca',
      tenantId: tenant1.id,
      orderId: order1.id,
      productId: classicChicken.id,
      sizeId: 'bcd8ffd5-36bb-4ba9-818c-01534d407036',
      quantity: 1,
      unitPrice: 35.0,
      totalPrice: 43.0,
      cookingStatus: 'SERVED',
    },
  });

  await prisma.orderItemAddon.create({
    data: { tenantId: tenant1.id, orderItemId: orderItem1.id, addonItemId: '639a8589-d134-4099-8e00-feed15911ee3', price: 8.0 },
  });

  // Fries - Large
  await prisma.orderItem.create({
    data: {
      id: '35544e1f-59eb-4217-806e-e09a9649d673',
      tenantId: tenant1.id,
      orderId: order1.id,
      productId: fries.id,
      sizeId: '34f96c36-a426-497a-8407-250b05db7541',
      quantity: 1,
      unitPrice: 12.0,
      totalPrice: 12.0,
      cookingStatus: 'SERVED',
    },
  });

  // Cola - Regular
  await prisma.orderItem.create({
    data: {
      id: 'bdd82b10-42cc-4799-8a70-6f93ff22adbd',
      tenantId: tenant1.id,
      orderId: order1.id,
      productId: cola.id,
      sizeId: '670bda98-cb39-459e-82c7-1ecf36a92908',
      quantity: 1,
      unitPrice: 4.0,
      totalPrice: 4.0,
      cookingStatus: 'SERVED',
    },
  });

  // Payment for order1
  await prisma.payment.create({
    data: {
      id: 'c0afb3b4-107f-46b6-8e56-4df42e101221',
      tenantId: tenant1.id,
      orderId: order1.id,
      paymentMethod: 'CASH',
      status: 'PAID',
      amount: 70.15,
      completedAt: new Date('2026-07-25T14:30:00Z'),
    },
  });

  // Order 2 - In Progress
  const order2 = await prisma.order.create({
    data: {
      id: 'a962ef47-7ecb-46f8-8241-f908c30b9aa3',
      tenantId: tenant1.id,
      branchId: branch1.id,
      customerId: customer2.id,
      tableId: tablesBranch1[4].id,
      orderNumber: 'ALB-R-00002',
      type: 'DINE_IN',
      status: 'PREPARING',
      subtotal: 53.0,
      taxAmount: 7.95,
      total: 60.95,
    },
  });

  await prisma.orderItem.create({
    data: {
      id: 'c71b9bbc-3a98-4e3f-8709-6b55ea653922',
      tenantId: tenant1.id,
      orderId: order2.id,
      productId: spicyChicken.id,
      sizeId: 'e752ba4e-1f17-454b-8020-2c10cc4f8f15',
      quantity: 1,
      unitPrice: 53.0,
      totalPrice: 53.0,
      cookingStatus: 'PREPARING',
    },
  });

  // Kitchen queue entry for order2
  await prisma.kitchenQueue.create({
    data: {
      tenantId: tenant1.id,
      branchId: branch1.id,
      orderId: order2.id,
      ticketNumber: 'T-002',
      priority: 'NORMAL',
      startedCookingAt: new Date('2026-07-25T19:15:00Z'),
    },
  });

  // Order 3 - Takeaway, pending
  const order3 = await prisma.order.create({
    data: {
      id: '9e7aec16-abbd-4079-8d10-ee7815671514',
      tenantId: tenant1.id,
      branchId: branch1.id,
      customerId: customer3.id,
      orderNumber: 'ALB-R-00003',
      type: 'TAKE_AWAY',
      status: 'PENDING',
      subtotal: 43.0,
      taxAmount: 6.45,
      total: 49.45,
    },
  });

  await prisma.orderItem.create({
    data: {
      id: 'dcd050ea-0de1-4ff8-80aa-595716072734',
      tenantId: tenant1.id,
      orderId: order3.id,
      productId: chickenNuggets.id,
      sizeId: '4667c88c-184f-442b-805a-a4d6bc914e02',
      quantity: 1,
      unitPrice: 30.0,
      totalPrice: 30.0,
      cookingStatus: 'PENDING',
    },
  });

  await prisma.orderItem.create({
    data: {
      id: '5f9d37ec-7376-43c4-81c0-12c5f527ae04',
      tenantId: tenant1.id,
      orderId: order3.id,
      productId: fries.id,
      sizeId: 'b2f50c5b-a327-4093-8610-643023ee679b',
      quantity: 1,
      unitPrice: 8.0,
      totalPrice: 8.0,
      cookingStatus: 'PENDING',
    },
  });

  console.log('Created sample orders.');

  // ==========================================
  // 19. AUDIT LOG ENTRIES
  // ==========================================
  await prisma.auditLog.createMany({
    data: [
      {
        tenantId: tenant1.id,
        userId: adminUser.id,
        action: 'CREATE',
        entityName: 'Tenant',
        entityId: tenant1.id,
        newValues: { name: tenant1.name, subdomain: tenant1.subdomain },
        ipAddress: '192.168.1.100',
        userAgent: 'Mozilla/5.0 (seed script)',
      },
      {
        tenantId: tenant1.id,
        userId: adminUser.id,
        action: 'UPDATE',
        entityName: 'Branch',
        entityId: branch1.id,
        oldValues: { name: 'Riyadh Branch' },
        newValues: { name: 'Riyadh - Olaya Branch' },
        ipAddress: '192.168.1.100',
        userAgent: 'Mozilla/5.0 (seed script)',
      },
    ],
  });

  console.log('Created audit log entries.');

  // ==========================================
  // 14. DISCOUNTS (Tenant 1) — Sprint 2 Task 4
  // ==========================================
  // Demo discounts for the seeded albaik tenant so the discount engine is
  // usable out of the box. IDs are deterministic v4-shaped UUIDs
  // (sha256("zayjar:discount:<CODE>"), R5 convention).
  await prisma.discount.create({
    data: {
      id: '94364284-e295-4af5-8281-aa9e41dd209a',
      tenantId: tenant1.id,
      code: 'SAVE10',
      name: 'Save 10%',
      description: '10% off the pre-tax subtotal (demo)',
      type: 'PERCENTAGE',
      value: 10.0,
      active: true,
    },
  });
  await prisma.discount.create({
    data: {
      id: '0e9ce987-4af4-4ffd-82ee-9f76340209ad',
      tenantId: tenant1.id,
      code: 'FIXED5',
      name: '5 Off',
      description: '5.00 off the pre-tax subtotal, capped at the subtotal (demo)',
      type: 'FIXED_AMOUNT',
      value: 5.0,
      active: true,
      usageLimit: 100,
    },
  });
  console.log('Created discounts.');

  // ==========================================
  // SUMMARY
  // ==========================================
  const counts = {
    plans: await prisma.subscriptionPlan.count(),
    tenants: await prisma.tenant.count(),
    subscriptions: await prisma.subscription.count(),
    users: await prisma.user.count(),
    roles: await prisma.role.count(),
    permissions: await prisma.permission.count(),
    restaurants: await prisma.restaurant.count(),
    branches: await prisma.branch.count(),
    tables: await prisma.table.count(),
    categories: await prisma.category.count(),
    products: await prisma.product.count(),
    productSizes: await prisma.productSize.count(),
    productVariants: await prisma.productVariant.count(),
    customers: await prisma.customer.count(),
    orders: await prisma.order.count(),
    orderItems: await prisma.orderItem.count(),
    discounts: await prisma.discount.count(),
  };

  console.log('\n=== Seed Complete ===');
  console.log(JSON.stringify(counts, null, 2));
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
