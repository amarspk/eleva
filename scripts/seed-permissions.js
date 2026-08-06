const { PrismaClient } = require('../packages/db/src/generated-client');
const p = new PrismaClient();

const permissions = [
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
  { id: '066e12a9-3a23-4871-98d6-a5866104aaf3', action: 'read', resource: 'product', description: 'View products' },
  { id: 'a1e53cff-66fe-4702-abf3-7dfecbc94d69', action: 'create', resource: 'product', description: 'Create products' },
  { id: '6b767e5a-0e08-43a7-a6d4-b957c1e8a659', action: 'create', resource: 'branch', description: 'Create branches' },
  { id: '74f3d3d2-c05a-4244-8159-162767e35a90', action: 'read', resource: 'table', description: 'View tables' },
  { id: '5b472a2b-bd83-40a7-9492-cf12a7456f87', action: 'create', resource: 'table', description: 'Create tables' },
  { id: 'c18479ea-2b68-44c9-9c67-b7f04497704f', action: 'create', resource: 'order', description: 'Create orders' },
  { id: '9fac8c1f-75ee-4c77-9c3f-11450d5dc3ae', action: 'update', resource: 'order', description: 'Update orders' },
  { id: '788d9744-f80a-4a4e-9ca9-def860879b4b', action: 'update', resource: 'tenant', description: 'Update tenant settings' },
  { id: '08c57546-b2c3-4064-a6fe-e0f18b56efdb', action: 'read', resource: 'user', description: 'View staff users' },
  { id: 'f0d9362e-61cc-46e3-a7b3-ce3a971f961b', action: 'create', resource: 'user', description: 'Create staff users' },
  { id: 'df1b4e44-3cb7-473a-a04b-8457f23fbb84', action: 'update', resource: 'user', description: 'Update staff users' },
  { id: '9dff4c6a-ba60-43b1-bac6-37553b6b2155', action: 'delete', resource: 'user', description: 'Delete staff users' },
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
  { id: '5c801e6a-9dd4-4efa-a259-1a5dda2a0dc4', action: 'create', resource: 'customer', description: 'Create customers' },
  { id: 'b2f0df84-5159-4e76-9aa9-32633d49ba7f', action: 'update', resource: 'customer', description: 'Update customers' },
  { id: 'e388594d-c749-480a-9045-514e01197bc3', action: 'delete', resource: 'customer', description: 'Delete customers' },
  { id: 'e639eecc-9662-4413-b0fa-7268801aca3f', action: 'read', resource: 'restaurant', description: 'View restaurant brands' },
];

async function main() {
  console.error('Seeding permissions...');
  
  // Create all permissions (idempotent upsert)
  for (const pm of permissions) {
    await p.permission.upsert({
      where: { id: pm.id },
      create: pm,
      update: {},
    });
  }
  console.error('Created ' + permissions.length + ' permissions');

  // Grant all permissions to all RESTAURANT_OWNER roles
  const roles = await p.role.findMany({
    where: { name: 'RESTAURANT_OWNER' },
    select: { id: true, tenantId: true },
  });

  for (const r of roles) {
    // Clear existing role-permissions for clean state
    await p.rolePermission.deleteMany({ where: { roleId: r.id } });
    // Grant all permissions
    await p.rolePermission.createMany({
      data: permissions.map(pm => ({ roleId: r.id, permissionId: pm.id })),
    });
    console.error('Granted ' + permissions.length + ' perms to role ' + r.id.substring(0, 8) + ' (tenant=' + (r.tenantId || 'null').substring(0, 8) + ')');
  }

  const total = await p.permission.count();
  console.error('Total permissions in DB: ' + total);

  await p.$disconnect();
}

main().catch(e => {
  console.error('ERROR: ' + e.message);
  process.exit(1);
});
