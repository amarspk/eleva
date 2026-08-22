#!/usr/bin/env node
/**
 * seed-demo.js — Complete local demo seed for Zayjar platform.
 *
 * Creates:
 *   - 3 subscription plans (Starter, Growth, Enterprise)
 *   - 1 Platform Owner (tenantId=null, can manage all tenants)
 *   - 2 restaurant tenants (Al-Baik, Tokyo Ramen)
 *   - 40 permissions with full role-permission mappings
 *   - Restaurant Owner, Manager, Cashier, Kitchen Staff per tenant
 *   - Realistic restaurants, branches, tables, categories, products, customers, orders
 *   - Audit log entries, discounts
 *
 * All passwords use real argon2id hashes — login works immediately.
 *
 * Idempotent: safe to run multiple times (upserts, ON CONFLICT DO NOTHING).
 */
'use strict';

const { PrismaClient } = require('../packages/db/src/generated-client');
const argon2 = require('../apps/api/node_modules/argon2');
const p = new PrismaClient();

// ─── Deterministic UUIDs (all v4-shaped) ───────────────────────────────
const IDS = {
  // Plans
  planStarter:   'b6491cba-adde-47db-8f96-98303e118f54',
  planGrowth:    'd98334d4-fc0c-4344-88f6-449fed277a20',
  planEnterprise:'a33196e9-92cf-4a7b-8efe-d8ec222f821a',

  // Platform tenant (virtual — not a real tenant row)
  // Platform Owner user has tenantId=null

  // Tenant 1: Al-Baik
  tenant1:       '80a00898-782c-4a6e-8bad-880e8f4f7977',
  // Tenant 2: Tokyo Ramen
  tenant2:       '930c9c66-06df-4029-8ee8-ac4d0046c6af',

  // Platform Owner user
  platformOwner: '00000000-0000-4000-a000-000000000001',

  // Al-Baik users
  albOwner:      'a0000001-0000-4000-a000-000000000001',
  albManager:    'a0000001-0000-4000-a000-000000000002',
  albCashier:    'a0000001-0000-4000-a000-000000000003',
  albKitchen:    'a0000001-0000-4000-a000-000000000004',

  // Tokyo Ramen users
  tokOwner:      'a0000002-0000-4000-a000-000000000001',

  // Al-Baik roles
  albOwnerRole:  'b0000001-0000-4000-b000-000000000001',
  albManagerRole:'b0000001-0000-4000-b000-000000000002',
  albCashierRole:'b0000001-0000-4000-b000-000000000003',
  albKitchenRole:'b0000001-0000-4000-b000-000000000004',

  // Tokyo Ramen roles
  tokOwnerRole:  'b0000002-0000-4000-b000-000000000001',

  // Platform Owner role (global, no tenant)
  platformRole:  'b0000000-0000-4000-b000-000000000001',

  // Restaurants
  albRestaurant: 'c0000001-0000-4000-c000-000000000001',
  tokRestaurant: 'c0000002-0000-4000-c000-000000000001',

  // Branches
  albBranch1:    'd0000001-0000-4000-d000-000000000001',
  albBranch2:    'd0000001-0000-4000-d000-000000000002',
  tokBranch1:    'd0000002-0000-4000-d000-000000000001',

  // Categories
  catChicken:    'e0000001-0000-4000-e000-000000000001',
  catSides:      'e0000001-0000-4000-e000-000000000002',
  catBeverages:  'e0000001-0000-4000-e000-000000000003',
  catRamen:      'e0000002-0000-4000-e000-000000000001',
  catAppetizers: 'e0000002-0000-4000-e000-000000000002',

  // Products (first few — rest generated inline)
  prodSpicyChicken:   'f0000001-0000-4000-f000-000000000001',
  prodOriginalChicken:'f0000001-0000-4000-f000-000000000002',
  prodNuggets:        'f0000001-0000-4000-f000-000000000003',
  prodFries:          'f0000001-0000-4000-f000-000000000004',
  prodColeslaw:       'f0000001-0000-4000-f000-000000000005',
  prodPepsi:          'f0000001-0000-4000-f000-000000000006',
  prodWater:          'f0000001-0000-4000-f000-000000000007',
  prodTonkotsu:       'f0000002-0000-4000-f000-000000000001',
  prodMiso:           'f0000002-0000-4000-f000-000000000002',
  prodGyoza:          'f0000002-0000-4000-f000-000000000003',

  // Customers
  custNoura:     '10000001-0000-4000-1000-000000000001',
  custSultan:    '10000001-0000-4000-1000-000000000002',
  custLayla:     '10000001-0000-4000-1000-000000000003',
  custHiroshi:   '10000002-0000-4000-1000-000000000001',

  // Orders
  order1:        '11000001-0000-4000-1100-000000000001',
  order2:        '11000001-0000-4000-1100-000000000002',
  order3:        '11000001-0000-4000-1100-000000000003',

  // Discounts
  discSave10:    '94364284-e295-4af5-8281-aa9e41dd209a',
  discFixed5:    '0e9ce987-4af4-4ffd-82ee-9f76340209ad',
};

// ─── Permissions (40 total, same as seed.ts) ──────────────────────────
const PERMISSIONS = [
  { id: '89b57f62-d43f-4e53-8ca4-a3f6af507190', action: 'read',   resource: 'branch',    description: 'View branches' },
  { id: 'dcd3e417-4b21-4137-87ad-30f2f308d0a2', action: 'write',  resource: 'branch',    description: 'Manage branches' },
  { id: '185459a3-11d3-4188-8574-88210fb70bfe', action: 'read',   resource: 'menu',      description: 'View menu items' },
  { id: 'dbeb4f1c-ada6-4d84-8532-be641a9ee3aa', action: 'write',  resource: 'menu',      description: 'Manage menu items' },
  { id: '89f81fbd-16ca-453c-83ea-85f714c5cc1f', action: 'read',   resource: 'order',     description: 'View orders' },
  { id: 'a668e9c1-7232-4e3c-8ace-d80b341f4e3b', action: 'write',  resource: 'order',     description: 'Manage orders' },
  { id: 'c0843268-f32f-45ad-8449-c4b0ff392dfa', action: 'read',   resource: 'kds',       description: 'View KDS' },
  { id: 'e5cf5f6c-2221-45a6-8374-77c9fdec5ff8', action: 'write',  resource: 'kds',       description: 'Update KDS status' },
  { id: '7584c7b6-389b-4f1a-823c-832c3835275c', action: 'read',   resource: 'customer',  description: 'View customers' },
  { id: '3dfcf3c9-0788-4f54-8ff9-d7f5f6dee021', action: 'write',  resource: 'customer',  description: 'Manage customers' },
  { id: '8291897b-508f-4a22-8783-2d3305066e40', action: 'read',   resource: 'billing',   description: 'View billing' },
  { id: '2706f2f7-2490-40de-8dcc-efc14bdfbd45', action: 'write',  resource: 'billing',   description: 'Manage billing' },
  { id: '1031ff3d-6db6-425d-83a9-5609d545e07b', action: 'read',   resource: 'analytics', description: 'View analytics' },
  { id: '817580df-8bb2-4095-8a2a-5faab2fc1032', action: 'write',  resource: 'tenant',    description: 'Manage tenant settings' },
  { id: '066e12a9-3a23-4871-98d6-a5866104aaf3', action: 'read',   resource: 'product',   description: 'View products' },
  { id: 'a1e53cff-66fe-4702-abf3-7dfecbc94d69', action: 'create', resource: 'product',   description: 'Create products' },
  { id: '6b767e5a-0e08-43a7-a6d4-b957c1e8a659', action: 'create', resource: 'branch',   description: 'Create branches' },
  { id: '74f3d3d2-c05a-4244-8159-162767e35a90', action: 'read',   resource: 'table',    description: 'View tables' },
  { id: '5b472a2b-bd83-40a7-9492-cf12a7456f87', action: 'create', resource: 'table',    description: 'Create tables' },
  { id: 'c18479ea-2b68-44c9-9c67-b7f04497704f', action: 'create', resource: 'order',    description: 'Create orders' },
  { id: '9fac8c1f-75ee-4c77-9c3f-11450d5dc3ae', action: 'update', resource: 'order',    description: 'Update orders' },
  { id: '788d9744-f80a-4a4e-9ca9-def860879b4b', action: 'update', resource: 'tenant',   description: 'Update tenant settings' },
  { id: '08c57546-b2c3-4064-a6fe-e0f18b56efdb', action: 'read',   resource: 'user',     description: 'View staff users' },
  { id: 'f0d9362e-61cc-46e3-a7b3-ce3a971f961b', action: 'create', resource: 'user',     description: 'Create staff users' },
  { id: 'df1b4e44-3cb7-473a-a04b-8457f23fbb84', action: 'update', resource: 'user',     description: 'Update staff users' },
  { id: '9dff4c6a-ba60-43b1-bac6-37553b6b2155', action: 'delete', resource: 'user',     description: 'Delete staff users' },
  { id: 'c113bd81-a04c-43a2-8b6a-800b7acb6d25', action: 'update', resource: 'product',  description: 'Update products' },
  { id: '909d7781-0273-4eac-8d0f-dde089545e5e', action: 'delete', resource: 'product',  description: 'Delete products' },
  { id: 'd5e00a2a-a884-4ad6-977f-7a7c3d08ce80', action: 'read',   resource: 'category',  description: 'View categories' },
  { id: '91333552-edb4-4eba-8102-22e25b392064', action: 'create', resource: 'category',  description: 'Create categories' },
  { id: 'b4a79425-a0a9-419a-8e1f-57305ec8c30a', action: 'update', resource: 'category',  description: 'Update categories' },
  { id: 'e4678b9a-d826-4455-a185-cf5a14fcbfd1', action: 'delete', resource: 'category',  description: 'Delete categories' },
  { id: 'b3dfa635-ecff-4139-9a2a-4b36fac46f9a', action: 'update', resource: 'branch',   description: 'Update branches' },
  { id: 'b1a69822-1664-4b09-804d-7dcac002c950', action: 'delete', resource: 'branch',   description: 'Delete branches' },
  { id: 'ee2b6baa-999c-4d97-9371-062c40bd6d77', action: 'update', resource: 'table',    description: 'Update tables' },
  { id: 'f3d92895-1ac2-470d-a472-7ed904f27b36', action: 'delete', resource: 'table',    description: 'Delete tables' },
  { id: '5c801e6a-9dd4-4efa-a259-1a5dda2a0dc4', action: 'create', resource: 'customer', description: 'Create customers' },
  { id: 'b2f0df84-5159-4e76-9aa9-32633d49ba7f', action: 'update', resource: 'customer', description: 'Update customers' },
  { id: 'e388594d-c749-480a-9045-514e01197bc3', action: 'delete', resource: 'customer', description: 'Delete customers' },
  { id: 'e639eecc-9662-4413-b0fa-7268801aca3f', action: 'read',   resource: 'restaurant', description: 'View restaurant brands' },
  { id: '8b0a0a8f-d547-445c-a490-19e80a3c2140', action: 'create', resource: 'restaurant', description: 'Create restaurant brands' },
  { id: '8a069985-e595-4d35-8d79-5ebf83542603', action: 'update', resource: 'restaurant', description: 'Update restaurant brands' },
  { id: 'c3074e8c-e8c3-4650-9fde-b1f2d828e3f8', action: 'delete', resource: 'restaurant', description: 'Delete restaurant brands' },
  { id: '328a0aa5-0576-4750-87bb-01ba2c283f74', action: 'create', resource: 'payment', description: 'Create wallet payments' },
  { id: 'fec355e8-c91f-45b6-83b7-fbb957c180ae', action: 'read',   resource: 'payment', description: 'View wallet payments' },
];

async function main() {
  console.log('=== Zayjar Demo Seed ===\n');

  // ── Hash passwords ────────────────────────────────────────────────
  console.log('Hashing passwords...');
  const hashDemo     = await argon2.hash('Demo1234!',     { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 4 });
  const hashPlatform = await argon2.hash('Platform123!',  { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 4 });
  const hashCustomer = await argon2.hash('Customer123!',  { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 4 });

  // ── 1. Clean slate ────────────────────────────────────────────────
  console.log('Cleaning existing data...');
  const tables = [
    'orderItemAddon','orderItem','order','payment','invoice',
    'kitchenQueue','notification','webhook','deviceToken',
    'sessionLog','auditLog','customer','table',
    'addonItem','productAddon','productVariant','productSize','product',
    'category','branch','restaurant',
    'rolePermission','userRole','permission','role','user',
    'subscription','discount','tenant','subscriptionPlan',
  ];
  for (const t of tables) {
    try { await p[t].deleteMany(); } catch(_) {}
  }
  console.log('Cleaned.');

  // ── 2. Subscription Plans ──────────────────────────────────────────
  console.log('Creating subscription plans...');
  await p.subscriptionPlan.create({ data: { id: IDS.planStarter, name: 'Starter', stripePriceId: 'price_starter', maxBranches: 1, maxRestaurants: 1, maxProductsPerBranch: 50, allowCustomDomains: false, allowOnlinePayments: false, allowAnalytics: false, priceMonthly: 29.99, priceYearly: 299.99 } });
  await p.subscriptionPlan.create({ data: { id: IDS.planGrowth, name: 'Growth', stripePriceId: 'price_growth', maxBranches: 5, maxRestaurants: 3, maxProductsPerBranch: 200, allowCustomDomains: true, allowOnlinePayments: true, allowAnalytics: false, priceMonthly: 79.99, priceYearly: 799.99 } });
  await p.subscriptionPlan.create({ data: { id: IDS.planEnterprise, name: 'Enterprise', stripePriceId: 'price_enterprise', maxBranches: 50, maxRestaurants: 20, maxProductsPerBranch: 1000, allowCustomDomains: true, allowOnlinePayments: true, allowAnalytics: true, priceMonthly: 199.99, priceYearly: 1999.99 } });

  // ── 3. Tenants ────────────────────────────────────────────────────
  console.log('Creating tenants...');
  await p.tenant.create({ data: { id: IDS.tenant1, name: 'Al-Baik Restaurant Group', subdomain: 'albaik', status: 'ACTIVE', primaryColor: '#E31837', secondaryColor: '#FFFFFF' } });
  await p.tenant.create({ data: { id: IDS.tenant2, name: 'Tokyo Ramen House', subdomain: 'tokyoramen', status: 'TRIALING', primaryColor: '#FF4500', secondaryColor: '#1A1A2E' } });

  // ── 4. Subscriptions ──────────────────────────────────────────────
  console.log('Creating subscriptions...');
  const now = new Date();
  const periodEnd = new Date(now); periodEnd.setMonth(periodEnd.getMonth() + 1);
  await p.subscription.create({ data: { tenantId: IDS.tenant1, planId: IDS.planGrowth, status: 'ACTIVE', currentPeriodStart: now, currentPeriodEnd: periodEnd } });
  await p.subscription.create({ data: { tenantId: IDS.tenant2, planId: IDS.planStarter, status: 'TRIALING', trialStart: now, trialEnd: new Date(now.getTime() + 14*86400000), currentPeriodStart: now, currentPeriodEnd: periodEnd } });

  // ── 5. Permissions (40) ───────────────────────────────────────────
  console.log('Creating 40 permissions...');
  for (const pm of PERMISSIONS) {
    await p.permission.upsert({ where: { id: pm.id }, create: pm, update: {} });
  }

  // ── 6. Roles ─────────────────────────────────────────────────────
  console.log('Creating roles...');
  // Platform Owner role (no tenant)
  await p.role.upsert({ where: { id: IDS.platformRole }, create: { id: IDS.platformRole, name: 'PLATFORM_OWNER', displayName: 'Platform Owner', description: 'Full system access across all tenants' }, update: {} });
  // Al-Baik roles
  await p.role.upsert({ where: { id: IDS.albOwnerRole }, create: { id: IDS.albOwnerRole, tenantId: IDS.tenant1, name: 'RESTAURANT_OWNER', displayName: 'Restaurant Owner', description: 'Full access to all restaurant features' }, update: {} });
  await p.role.upsert({ where: { id: IDS.albManagerRole }, create: { id: IDS.albManagerRole, tenantId: IDS.tenant1, name: 'MANAGER', displayName: 'Manager', description: 'Can manage menu, orders, and branches' }, update: {} });
  await p.role.upsert({ where: { id: IDS.albCashierRole }, create: { id: IDS.albCashierRole, tenantId: IDS.tenant1, name: 'CASHIER', displayName: 'Cashier', description: 'Can process orders and payments' }, update: {} });
  await p.role.upsert({ where: { id: IDS.albKitchenRole }, create: { id: IDS.albKitchenRole, tenantId: IDS.tenant1, name: 'KITCHEN_STAFF', displayName: 'Kitchen Staff', description: 'Can view and update cooking status' }, update: {} });
  // Tokyo Ramen roles
  await p.role.upsert({ where: { id: IDS.tokOwnerRole }, create: { id: IDS.tokOwnerRole, tenantId: IDS.tenant2, name: 'RESTAURANT_OWNER', displayName: 'Restaurant Owner', description: 'Full access' }, update: {} });

  // ── 7. Role-Permission mappings ───────────────────────────────────
  console.log('Creating role-permission mappings...');
  // Owner gets ALL 40 permissions
  for (const ownerRoleId of [IDS.albOwnerRole, IDS.tokOwnerRole]) {
    await p.rolePermission.deleteMany({ where: { roleId: ownerRoleId } });
    await p.rolePermission.createMany({ data: PERMISSIONS.map(pm => ({ roleId: ownerRoleId, permissionId: pm.id })) });
  }
  // Platform Owner gets all permissions too
  await p.rolePermission.deleteMany({ where: { roleId: IDS.platformRole } });
  await p.rolePermission.createMany({ data: PERMISSIONS.map(pm => ({ roleId: IDS.platformRole, permissionId: pm.id })) });

  // Phase 4 P0 — role grants use the modern CASL vocabulary (resource +
  // create/read/update/delete matching the CaslAbilityFactory Subjects union).
  // The legacy menu/kds/billing/analytics rows and the `write` action remain
  // in PERMISSIONS for backward compatibility but are no longer the source of
  // effective grants.
  const linkRolePermissions = (roleId, grants) => {
    const ids = grants
      .map(g => PERMISSIONS.find(pm => pm.resource === g.resource && pm.action === g.action)?.id)
      .filter(Boolean);
    return p.rolePermission.createMany({ data: ids.map(permissionId => ({ roleId, permissionId })) });
  };

  // MANAGER — restaurant management for the manager's assigned branch(es).
  await linkRolePermissions(IDS.albManagerRole, [
    { resource: 'branch', action: 'read' }, { resource: 'branch', action: 'create' },
    { resource: 'branch', action: 'update' }, { resource: 'branch', action: 'delete' },
    { resource: 'product', action: 'read' }, { resource: 'product', action: 'create' },
    { resource: 'product', action: 'update' }, { resource: 'product', action: 'delete' },
    { resource: 'category', action: 'read' }, { resource: 'category', action: 'create' },
    { resource: 'category', action: 'update' }, { resource: 'category', action: 'delete' },
    { resource: 'table', action: 'read' }, { resource: 'table', action: 'create' },
    { resource: 'table', action: 'update' }, { resource: 'table', action: 'delete' },
    { resource: 'order', action: 'read' }, { resource: 'order', action: 'create' },
    { resource: 'order', action: 'update' },
    { resource: 'customer', action: 'read' }, { resource: 'customer', action: 'create' },
    { resource: 'customer', action: 'update' }, { resource: 'customer', action: 'delete' },
    { resource: 'payment', action: 'read' }, { resource: 'payment', action: 'create' },
    { resource: 'restaurant', action: 'read' },
    { resource: 'restaurant', action: 'update' },
  ]);

  // CASHIER — POS operations on the cashier's assigned branch(es).
  await linkRolePermissions(IDS.albCashierRole, [
    { resource: 'order', action: 'read' }, { resource: 'order', action: 'create' },
    { resource: 'order', action: 'update' },
    { resource: 'product', action: 'read' },
    { resource: 'customer', action: 'read' }, { resource: 'customer', action: 'create' },
    { resource: 'payment', action: 'read' }, { resource: 'payment', action: 'create' },
    { resource: 'table', action: 'read' },
  ]);

  // KITCHEN_STAFF — KDS only (KDS endpoints are guarded on the Order subject).
  await linkRolePermissions(IDS.albKitchenRole, [
    { resource: 'order', action: 'read' }, { resource: 'order', action: 'update' },
    { resource: 'product', action: 'read' },
  ]);

  // ── 8. Users ─────────────────────────────────────────────────────
  console.log('Creating users...');
  // Platform Owner (tenantId = null)
  await p.user.upsert({ where: { id: IDS.platformOwner }, create: { id: IDS.platformOwner, firstName: 'System', lastName: 'Admin', email: 'platform@zayjar.ai', passwordHash: hashPlatform, isActive: true }, update: { passwordHash: hashPlatform } });

  // Al-Baik users
  await p.user.upsert({ where: { id: IDS.albOwner }, create: { id: IDS.albOwner, tenantId: IDS.tenant1, firstName: 'Ahmed', lastName: 'Al-Rashid', email: 'admin@albaik.com', passwordHash: hashDemo, phoneNumber: '+966501234567', isActive: true }, update: { passwordHash: hashDemo } });
  await p.user.upsert({ where: { id: IDS.albManager }, create: { id: IDS.albManager, tenantId: IDS.tenant1, firstName: 'Fatima', lastName: 'Hassan', email: 'manager@albaik.com', passwordHash: hashDemo, phoneNumber: '+966502345678', isActive: true }, update: { passwordHash: hashDemo } });
  await p.user.upsert({ where: { id: IDS.albCashier }, create: { id: IDS.albCashier, tenantId: IDS.tenant1, firstName: 'Omar', lastName: 'Khalil', email: 'cashier@albaik.com', passwordHash: hashDemo, isActive: true }, update: { passwordHash: hashDemo } });
  await p.user.upsert({ where: { id: IDS.albKitchen }, create: { id: IDS.albKitchen, tenantId: IDS.tenant1, firstName: 'Yusuf', lastName: 'Ibrahim', email: 'kitchen@albaik.com', passwordHash: hashDemo, isActive: true }, update: { passwordHash: hashDemo } });

  // Tokyo Ramen users
  await p.user.upsert({ where: { id: IDS.tokOwner }, create: { id: IDS.tokOwner, tenantId: IDS.tenant2, firstName: 'Kenji', lastName: 'Tanaka', email: 'admin@tokyoramen.com', passwordHash: hashDemo, phoneNumber: '+81901234567', isActive: true }, update: { passwordHash: hashDemo } });

  // ── 9. User-Role mappings ─────────────────────────────────────────
  console.log('Creating user-role mappings...');
  await p.userRole.createMany({ data: [
    { userId: IDS.platformOwner, roleId: IDS.platformRole },
    { userId: IDS.albOwner,      roleId: IDS.albOwnerRole },
    { userId: IDS.albManager,    roleId: IDS.albManagerRole },
    { userId: IDS.albCashier,    roleId: IDS.albCashierRole },
    { userId: IDS.albKitchen,    roleId: IDS.albKitchenRole },
    { userId: IDS.tokOwner,      roleId: IDS.tokOwnerRole },
  ], skipDuplicates: true });

  // ── 10. Restaurants ───────────────────────────────────────────────
  console.log('Creating restaurants...');
  await p.restaurant.create({ data: { id: IDS.albRestaurant, tenantId: IDS.tenant1, name: "Al-Baik", currency: 'SAR', timezone: 'Asia/Riyadh', taxPercentage: 15 } });
  await p.restaurant.create({ data: { id: IDS.tokRestaurant, tenantId: IDS.tenant2, name: "Tokyo Ramen", currency: 'JPY', timezone: 'Asia/Tokyo', taxPercentage: 10 } });

  // ── 11. Branches ──────────────────────────────────────────────────
  console.log('Creating branches...');
  const defaultHours = {
    monday:    { open: '09:00', close: '22:00', closed: false },
    tuesday:   { open: '09:00', close: '22:00', closed: false },
    wednesday: { open: '09:00', close: '22:00', closed: false },
    thursday:  { open: '09:00', close: '22:00', closed: false },
    friday:    { open: '09:00', close: '23:00', closed: false },
    saturday:  { open: '10:00', close: '23:00', closed: false },
    sunday:    { open: '10:00', close: '21:00', closed: false },
  };
  await p.branch.create({ data: { id: IDS.albBranch1, tenantId: IDS.tenant1, restaurantId: IDS.albRestaurant, name: 'Riyadh - Olaya Branch', address: 'Olaya Main St, Riyadh', phoneNumber: '+96611234567', latitude: 24.7136, longitude: 46.6753, operatingHours: defaultHours } });
  await p.branch.create({ data: { id: IDS.albBranch2, tenantId: IDS.tenant1, restaurantId: IDS.albRestaurant, name: 'Jeddah - Corniche Branch', address: 'Corniche Rd, Jeddah', phoneNumber: '+96612234567', latitude: 21.5439, longitude: 39.1725, operatingHours: defaultHours } });
  await p.branch.create({ data: { id: IDS.tokBranch1, tenantId: IDS.tenant2, restaurantId: IDS.tokRestaurant, name: 'Shibuya Branch', address: '1-2-3 Shibuya, Tokyo', phoneNumber: '+81312345678', latitude: 35.6580, longitude: 139.7016, operatingHours: defaultHours } });

  // ── 11b. User-Branch assignments (DOC-005 §4.2 / Phase 4 P0) ─────────
  // manager -> both Al-Baik branches (explicit); cashier & kitchen -> Riyadh
  // branch only. Owners have NO user_branches rows -> tenant-wide.
  await p.userBranch.createMany({ data: [
    { userId: IDS.albManager, branchId: IDS.albBranch1, tenantId: IDS.tenant1 },
    { userId: IDS.albManager, branchId: IDS.albBranch2, tenantId: IDS.tenant1 },
    { userId: IDS.albCashier, branchId: IDS.albBranch1, tenantId: IDS.tenant1 },
    { userId: IDS.albKitchen, branchId: IDS.albBranch1, tenantId: IDS.tenant1 },
  ] });

  // ── 12. Tables ────────────────────────────────────────────────────
  console.log('Creating tables...');
  const tablesData = [];
  for (let i = 1; i <= 10; i++) {
    tablesData.push({ tenantId: IDS.tenant1, branchId: IDS.albBranch1, number: `A-${i}`, seatingCapacity: i <= 4 ? 2 : i <= 8 ? 4 : 6, status: 'VACANT', qrCodeToken: `alb-olaya-${i}` });
  }
  for (let i = 1; i <= 6; i++) {
    tablesData.push({ tenantId: IDS.tenant1, branchId: IDS.albBranch2, number: `J-${i}`, seatingCapacity: i <= 3 ? 2 : 4, status: 'VACANT', qrCodeToken: `alb-jed-${i}` });
  }
  for (let i = 1; i <= 8; i++) {
    tablesData.push({ tenantId: IDS.tenant2, branchId: IDS.tokBranch1, number: `T-${i}`, seatingCapacity: i <= 4 ? 2 : 4, status: 'VACANT', qrCodeToken: `tok-shi-${i}` });
  }
  await p.table.createMany({ data: tablesData });

  // ── 13. Categories ────────────────────────────────────────────────
  console.log('Creating categories...');
  await p.category.createMany({ data: [
    { id: IDS.catChicken,   tenantId: IDS.tenant1, restaurantId: IDS.albRestaurant, name: 'Chicken',     sortOrder: 1 },
    { id: IDS.catSides,     tenantId: IDS.tenant1, restaurantId: IDS.albRestaurant, name: 'Sides',       sortOrder: 2 },
    { id: IDS.catBeverages, tenantId: IDS.tenant1, restaurantId: IDS.albRestaurant, name: 'Beverages',   sortOrder: 3 },
    { id: IDS.catRamen,     tenantId: IDS.tenant2, restaurantId: IDS.tokRestaurant, name: 'Ramen',       sortOrder: 1 },
    { id: IDS.catAppetizers,tenantId: IDS.tenant2, restaurantId: IDS.tokRestaurant, name: 'Appetizers',  sortOrder: 2 },
  ] });

  // ── 14. Products ──────────────────────────────────────────────────
  console.log('Creating products...');
  const products = [
    { id: IDS.prodSpicyChicken,    tenantId: IDS.tenant1, categoryId: IDS.catChicken,   name: 'Spicy Chicken Meal',   description: 'Our signature spicy fried chicken with special sauce', basePrice: 45.00, isAvailable: true },
    { id: IDS.prodOriginalChicken, tenantId: IDS.tenant1, categoryId: IDS.catChicken,   name: 'Original Chicken Meal', description: 'Classic crispy fried chicken', basePrice: 38.00, isAvailable: true },
    { id: IDS.prodNuggets,         tenantId: IDS.tenant1, categoryId: IDS.catChicken,   name: 'Chicken Nuggets (6pc)',  description: 'Crispy chicken nuggets', basePrice: 22.00, isAvailable: true },
    { id: IDS.prodFries,           tenantId: IDS.tenant1, categoryId: IDS.catSides,     name: 'French Fries',          description: 'Golden crispy fries', basePrice: 12.00, isAvailable: true },
    { id: IDS.prodColeslaw,        tenantId: IDS.tenant1, categoryId: IDS.catSides,     name: 'Coleslaw',              description: 'Fresh creamy coleslaw', basePrice: 8.00, isAvailable: true },
    { id: IDS.prodPepsi,           tenantId: IDS.tenant1, categoryId: IDS.catBeverages, name: 'Pepsi',                 description: '330ml can', basePrice: 5.00, isAvailable: true },
    { id: IDS.prodWater,           tenantId: IDS.tenant1, categoryId: IDS.catBeverages, name: 'Water',                 description: 'Bottled water 500ml', basePrice: 3.00, isAvailable: true },
    { id: IDS.prodTonkotsu,        tenantId: IDS.tenant2, categoryId: IDS.catRamen,     name: 'Tonkotsu Ramen',        description: 'Rich pork bone broth ramen', basePrice: 1200, isAvailable: true },
    { id: IDS.prodMiso,            tenantId: IDS.tenant2, categoryId: IDS.catRamen,     name: 'Miso Ramen',            description: 'Soybean paste based ramen', basePrice: 1100, isAvailable: true },
    { id: IDS.prodGyoza,           tenantId: IDS.tenant2, categoryId: IDS.catAppetizers,name: 'Gyoza (6pc)',           description: 'Pan-fried dumplings', basePrice: 600, isAvailable: true },
  ];
  for (const prod of products) {
    await p.product.create({ data: prod });
  }

  // Product sizes
  console.log('Creating product sizes...');
  const sizesData = [];
  for (const prod of products.filter(pr => pr.tenantId === IDS.tenant1)) {
    sizesData.push({ tenantId: prod.tenantId, productId: prod.id, name: 'Regular', priceAdjustment: 0 });
    sizesData.push({ tenantId: prod.tenantId, productId: prod.id, name: 'Large', priceAdjustment: 8 });
  }
  for (const prod of products.filter(pr => pr.tenantId === IDS.tenant2)) {
    sizesData.push({ tenantId: prod.tenantId, productId: prod.id, name: 'Regular', priceAdjustment: 0 });
    sizesData.push({ tenantId: prod.tenantId, productId: prod.id, name: 'Large', priceAdjustment: 200 });
  }
  await p.productSize.createMany({ data: sizesData });

  // ── 15. Customers ─────────────────────────────────────────────────
  console.log('Creating customers...');
  await p.customer.create({ data: { id: IDS.custNoura, tenantId: IDS.tenant1, firstName: 'Noura', lastName: 'Saeed', email: 'noura.saeed@email.com', phoneNumber: '+966551234567', loyaltyPoints: 75 } });
  await p.customer.create({ data: { id: IDS.custSultan, tenantId: IDS.tenant1, firstName: 'Sultan', lastName: 'Mohammed', email: 'sultan.m@email.com', phoneNumber: '+966552345678', loyaltyPoints: 120 } });
  await p.customer.create({ data: { id: IDS.custLayla, tenantId: IDS.tenant1, firstName: 'Layla', lastName: 'Ahmed', email: 'layla.a@email.com', phoneNumber: '+966553456789', loyaltyPoints: 30 } });
  await p.customer.create({ data: { id: IDS.custHiroshi, tenantId: IDS.tenant2, firstName: 'Hiroshi', lastName: 'Yamamoto', email: 'hiroshi.y@email.com', phoneNumber: '+819012345678', loyaltyPoints: 50 } });

  // ── 16. Orders ────────────────────────────────────────────────────
  console.log('Creating sample orders...');
  const branch1Tables = await p.table.findMany({ where: { branchId: IDS.albBranch1 }, take: 5, orderBy: { number: 'asc' } });

  // Order 1 - Completed
  await p.order.create({ data: { id: IDS.order1, tenantId: IDS.tenant1, branchId: IDS.albBranch1, customerId: IDS.custNoura, tableId: branch1Tables[0]?.id, orderNumber: 'ALB-R-00001', type: 'DINE_IN', status: 'COMPLETED', subtotal: 57.00, taxAmount: 8.55, total: 65.55 } });
  await p.orderItem.createMany({ data: [
    { tenantId: IDS.tenant1, orderId: IDS.order1, productId: IDS.prodSpicyChicken, quantity: 1, unitPrice: 45.00, totalPrice: 45.00, cookingStatus: 'SERVED' },
    { tenantId: IDS.tenant1, orderId: IDS.order1, productId: IDS.prodFries, quantity: 1, unitPrice: 12.00, totalPrice: 12.00, cookingStatus: 'SERVED' },
  ] });

  // Order 2 - Preparing
  await p.order.create({ data: { id: IDS.order2, tenantId: IDS.tenant1, branchId: IDS.albBranch1, customerId: IDS.custSultan, tableId: branch1Tables[1]?.id, orderNumber: 'ALB-R-00002', type: 'DINE_IN', status: 'PREPARING', subtotal: 53.00, taxAmount: 7.95, total: 60.95 } });
  await p.orderItem.createMany({ data: [
    { tenantId: IDS.tenant1, orderId: IDS.order2, productId: IDS.prodSpicyChicken, quantity: 1, unitPrice: 53.00, totalPrice: 53.00, cookingStatus: 'PREPARING' },
  ] });

  // Order 3 - Pending takeaway
  await p.order.create({ data: { id: IDS.order3, tenantId: IDS.tenant1, branchId: IDS.albBranch1, customerId: IDS.custLayla, orderNumber: 'ALB-R-00003', type: 'TAKE_AWAY', status: 'PENDING', subtotal: 30.00, taxAmount: 4.50, total: 34.50 } });
  await p.orderItem.createMany({ data: [
    { tenantId: IDS.tenant1, orderId: IDS.order3, productId: IDS.prodNuggets, quantity: 1, unitPrice: 22.00, totalPrice: 22.00, cookingStatus: 'PENDING' },
    { tenantId: IDS.tenant1, orderId: IDS.order3, productId: IDS.prodFries, quantity: 1, unitPrice: 8.00, totalPrice: 8.00, cookingStatus: 'PENDING' },
  ] });

  // Kitchen queue entries
  await p.kitchenQueue.create({ data: { tenantId: IDS.tenant1, branchId: IDS.albBranch1, orderId: IDS.order2, ticketNumber: 'T-001', priority: 'NORMAL', startedCookingAt: new Date() } });

  // ── 17. Discounts ─────────────────────────────────────────────────
  console.log('Creating discounts...');
  await p.discount.create({ data: { id: IDS.discSave10, tenantId: IDS.tenant1, code: 'SAVE10', name: 'Save 10%', description: '10% off subtotal', type: 'PERCENTAGE', value: 10.0, active: true } });
  await p.discount.create({ data: { id: IDS.discFixed5, tenantId: IDS.tenant1, code: 'FIXED5', name: '5 SAR Off', description: '5 SAR off subtotal', type: 'FIXED_AMOUNT', value: 5.0, active: true, usageLimit: 100 } });

  // ── 18. Audit logs ────────────────────────────────────────────────
  console.log('Creating audit log entries...');
  await p.auditLog.createMany({ data: [
    { tenantId: IDS.tenant1, userId: IDS.albOwner, action: 'CREATE', entityName: 'Tenant', entityId: IDS.tenant1, newValues: { name: 'Al-Baik Restaurant Group' }, ipAddress: '127.0.0.1', userAgent: 'Demo seed' },
    { tenantId: IDS.tenant1, userId: IDS.albOwner, action: 'UPDATE', entityName: 'Branch', entityId: IDS.albBranch1, oldValues: { name: 'Riyadh Branch' }, newValues: { name: 'Riyadh - Olaya Branch' }, ipAddress: '127.0.0.1', userAgent: 'Demo seed' },
  ] });

  // ── 19. Payment for completed order ───────────────────────────────
  await p.payment.create({ data: { tenantId: IDS.tenant1, orderId: IDS.order1, paymentMethod: 'CASH', status: 'PAID', amount: 65.55, completedAt: new Date() } });

  // ── Summary ───────────────────────────────────────────────────────
  const counts = {
    plans:        await p.subscriptionPlan.count(),
    tenants:      await p.tenant.count(),
    subscriptions:await p.subscription.count(),
    users:        await p.user.count(),
    roles:        await p.role.count(),
    permissions:  await p.permission.count(),
    rolePermissions: await p.rolePermission.count(),
    restaurants:  await p.restaurant.count(),
    branches:     await p.branch.count(),
    tables:       await p.table.count(),
    categories:   await p.category.count(),
    products:     await p.product.count(),
    customers:    await p.customer.count(),
    orders:       await p.order.count(),
    orderItems:   await p.orderItem.count(),
    discounts:    await p.discount.count(),
  };

  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║        ZAYJAR DEMO — SEED COMPLETE            ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log(JSON.stringify(counts, null, 2));
  console.log('\n── Demo Accounts ───────────────────────────────');
  console.log('Platform Owner:  platform@zayjar.ai  / Platform123!');
  console.log('Restaurant Owner (Al-Baik):   admin@albaik.com      / Demo1234!');
  console.log('Manager (Al-Baik):            manager@albaik.com     / Demo1234!');
  console.log('Cashier (Al-Baik):            cashier@albaik.com     / Demo1234!');
  console.log('Kitchen Staff (Al-Baik):      kitchen@albaik.com     / Demo1234!');
  console.log('Restaurant Owner (Tokyo):     admin@tokyoramen.com  / Demo1234!');
  console.log('\n── Tenant IDs ──────────────────────────────────');
  console.log('Al-Baik:     ', IDS.tenant1);
  console.log('Tokyo Ramen: ', IDS.tenant2);
}

main()
  .catch(e => { console.error('SEED FAILED:', e.message); console.error(e.stack); process.exit(1); })
  .finally(() => p.$disconnect());
