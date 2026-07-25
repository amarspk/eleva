/* eslint-disable no-console */
import { PrismaClient } from '../src/generated-client';

const prisma = new PrismaClient();

async function main() {
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
  await prisma.tenant.deleteMany();
  await prisma.subscriptionPlan.deleteMany();

  console.log('Cleaned existing data.');

  // ==========================================
  // 1. SUBSCRIPTION PLANS
  // ==========================================
  const starterPlan = await prisma.subscriptionPlan.create({
    data: {
      id: 'plan-starter-001',
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
      id: 'plan-growth-002',
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
      id: 'plan-enterprise-003',
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
      id: 'tenant-demo-001',
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
      id: 'tenant-demo-002',
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
    { action: 'read', resource: 'branch', description: 'View branches' },
    { action: 'write', resource: 'branch', description: 'Manage branches' },
    { action: 'read', resource: 'menu', description: 'View menu items' },
    { action: 'write', resource: 'menu', description: 'Manage menu items' },
    { action: 'read', resource: 'order', description: 'View orders' },
    { action: 'write', resource: 'order', description: 'Manage orders' },
    { action: 'read', resource: 'kds', description: 'View KDS' },
    { action: 'write', resource: 'kds', description: 'Update KDS status' },
    { action: 'read', resource: 'customer', description: 'View customers' },
    { action: 'write', resource: 'customer', description: 'Manage customers' },
    { action: 'read', resource: 'billing', description: 'View billing' },
    { action: 'write', resource: 'billing', description: 'Manage billing' },
    { action: 'read', resource: 'analytics', description: 'View analytics' },
    { action: 'write', resource: 'tenant', description: 'Manage tenant settings' },
  ];

  const permissions = await Promise.all(
    permissionData.map((p) =>
      prisma.permission.create({
        data: {
          id: `perm-${p.action}-${p.resource}`,
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
      id: 'role-owner-001',
      tenantId: tenant1.id,
      name: 'RESTAURANT_OWNER',
      displayName: 'Restaurant Owner',
      description: 'Full access to all restaurant features',
    },
  });

  const managerRole = await prisma.role.create({
    data: {
      id: 'role-manager-001',
      tenantId: tenant1.id,
      name: 'MANAGER',
      displayName: 'Manager',
      description: 'Can manage menu, orders, and branches',
    },
  });

  const cashierRole = await prisma.role.create({
    data: {
      id: 'role-cashier-001',
      tenantId: tenant1.id,
      name: 'CASHIER',
      displayName: 'Cashier',
      description: 'Can process orders and payments',
    },
  });

  const kitchenRole = await prisma.role.create({
    data: {
      id: 'role-kitchen-001',
      tenantId: tenant1.id,
      name: 'KITCHEN_STAFF',
      displayName: 'Kitchen Staff',
      description: 'Can view and update cooking status',
    },
  });

  console.log('Created roles:', ownerRole.name, managerRole.name, cashierRole.name, kitchenRole.name);

  // ==========================================
  // 6. ROLE-PERMISSION MAPPING
  // ==========================================
  // Owner gets everything
  const allPermissions = permissions;
  await Promise.all(
    allPermissions.map((p) =>
      prisma.rolePermission.create({
        data: { roleId: ownerRole.id, permissionId: p.id },
      }),
    ),
  );

  // Manager: read/write branch, menu, order, customer
  const managerPermResources = ['branch', 'menu', 'order', 'customer', 'kds'];
  const managerPermissions = allPermissions.filter(
    (p) => managerPermResources.includes(p.resource) && (p.action === 'read' || p.action === 'write'),
  );
  await Promise.all(
    managerPermissions.map((p) =>
      prisma.rolePermission.create({
        data: { roleId: managerRole.id, permissionId: p.id },
      }),
    ),
  );

  // Cashier: read menu, read/write order, read/write customer
  const cashierPermResources = ['menu', 'order', 'customer'];
  const cashierPermissions = allPermissions.filter(
    (p) => cashierPermResources.includes(p.resource) && (p.action === 'read' || p.action === 'write'),
  );
  await Promise.all(
    cashierPermissions.map((p) =>
      prisma.rolePermission.create({
        data: { roleId: cashierRole.id, permissionId: p.id },
      }),
    ),
  );

  // Kitchen: read order, write kds
  const kitchenPermResources = ['order', 'kds'];
  const kitchenPermissions = allPermissions.filter(
    (p) => kitchenPermResources.includes(p.resource) && (p.action === 'read' || p.action === 'write'),
  );
  await Promise.all(
    kitchenPermissions.map((p) =>
      prisma.rolePermission.create({
        data: { roleId: kitchenRole.id, permissionId: p.id },
      }),
    ),
  );

  console.log('Created role-permission mappings.');

  // ==========================================
  // 7. USERS
  // ==========================================
  // Password: "Demo1234!" — Argon2 hash placeholder (real auth uses bcrypt/argon2 at runtime)
  const passwordHash = '$argon2id$v=19$m=65536,t=3,p=4$demoSaltPlaceholder$demoHashPlaceholder';

  const adminUser = await prisma.user.create({
    data: {
      id: 'user-admin-001',
      tenantId: tenant1.id,
      firstName: 'Ahmed',
      lastName: 'Al-Rashid',
      email: 'admin@albaik.com',
      passwordHash,
      phoneNumber: '+966501234567',
      isActive: true,
    },
  });

  const managerUser = await prisma.user.create({
    data: {
      id: 'user-manager-001',
      tenantId: tenant1.id,
      firstName: 'Fatima',
      lastName: 'Hassan',
      email: 'manager@albaik.com',
      passwordHash,
      phoneNumber: '+966502345678',
      isActive: true,
    },
  });

  const cashierUser = await prisma.user.create({
    data: {
      id: 'user-cashier-001',
      tenantId: tenant1.id,
      firstName: 'Omar',
      lastName: 'Khalil',
      email: 'cashier@albaik.com',
      passwordHash,
      isActive: true,
    },
  });

  const kitchenUser = await prisma.user.create({
    data: {
      id: 'user-kitchen-001',
      tenantId: tenant1.id,
      firstName: 'Yusuf',
      lastName: 'Ibrahim',
      email: 'kitchen@albaik.com',
      passwordHash,
      isActive: true,
    },
  });

  // Tenant 2 users
  const tenant2Admin = await prisma.user.create({
    data: {
      id: 'user-t2-admin-001',
      tenantId: tenant2.id,
      firstName: 'Kenji',
      lastName: 'Tanaka',
      email: 'admin@tokyoramen.com',
      passwordHash,
      phoneNumber: '+81901234567',
      isActive: true,
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

  console.log('Created user-role mappings.');

  // ==========================================
  // 9. RESTAURANTS
  // ==========================================
  const restaurant1 = await prisma.restaurant.create({
    data: {
      id: 'rest-albaik-001',
      tenantId: tenant1.id,
      name: 'Al-Baik Chicken',
      currency: 'SAR',
      timezone: 'Asia/Riyadh',
      taxPercentage: 15.0,
    },
  });

  const restaurant2 = await prisma.restaurant.create({
    data: {
      id: 'rest-t2-ramen-001',
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
      id: 'branch-albaik-riyadh-001',
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
      id: 'branch-albaik-jeddah-001',
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
      id: 'branch-t2-shibuya-001',
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
      id: 'cat-appetizers-001',
      tenantId: tenant1.id,
      restaurantId: restaurant1.id,
      name: 'Appetizers',
      sortOrder: 1,
      isActive: true,
    },
  });

  const catChicken = await prisma.category.create({
    data: {
      id: 'cat-chicken-001',
      tenantId: tenant1.id,
      restaurantId: restaurant1.id,
      name: 'Signature Chicken',
      sortOrder: 2,
      isActive: true,
    },
  });

  const catSides = await prisma.category.create({
    data: {
      id: 'cat-sides-001',
      tenantId: tenant1.id,
      restaurantId: restaurant1.id,
      name: 'Sides & Rice',
      sortOrder: 3,
      isActive: true,
    },
  });

  const catBeverages = await prisma.category.create({
    data: {
      id: 'cat-beverages-001',
      tenantId: tenant1.id,
      restaurantId: restaurant1.id,
      name: 'Beverages',
      sortOrder: 4,
      isActive: true,
    },
  });

  const catDesserts = await prisma.category.create({
    data: {
      id: 'cat-desserts-001',
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
      id: 'cat-t2-ramen-001',
      tenantId: tenant2.id,
      restaurantId: restaurant2.id,
      name: 'Ramen',
      sortOrder: 1,
      isActive: true,
    },
  });

  const catT2Sides = await prisma.category.create({
    data: {
      id: 'cat-t2-sides-001',
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
      id: 'prod-hummus-001',
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
      id: 'prod-soup-001',
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
      id: 'prod-classic-001',
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
      id: 'prod-spicy-001',
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
      id: 'prod-nuggets-001',
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
      id: 'prod-fries-001',
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
      id: 'prod-rice-001',
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
      id: 'prod-coleslaw-001',
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
      id: 'prod-cola-001',
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
      id: 'prod-laban-001',
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
      id: 'prod-baklava-001',
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
      id: 'prod-tonkotsu-001',
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
      id: 'prod-miso-001',
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
      id: 'prod-gyoza-001',
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
      { id: 'size-classic-s', tenantId: tenant1.id, productId: classicChicken.id, name: 'Small (4 pcs)', priceAdjustment: -10.0 },
      { id: 'size-classic-m', tenantId: tenant1.id, productId: classicChicken.id, name: 'Medium (7 pcs)', priceAdjustment: 0 },
      { id: 'size-classic-l', tenantId: tenant1.id, productId: classicChicken.id, name: 'Large (10 pcs)', priceAdjustment: 15.0 },
      { id: 'size-spicy-s', tenantId: tenant1.id, productId: spicyChicken.id, name: 'Small (4 pcs)', priceAdjustment: -10.0 },
      { id: 'size-spicy-m', tenantId: tenant1.id, productId: spicyChicken.id, name: 'Medium (7 pcs)', priceAdjustment: 0 },
      { id: 'size-spicy-l', tenantId: tenant1.id, productId: spicyChicken.id, name: 'Large (10 pcs)', priceAdjustment: 15.0 },
      { id: 'size-nuggets-6', tenantId: tenant1.id, productId: chickenNuggets.id, name: '6 Pieces', priceAdjustment: -6.0 },
      { id: 'size-nuggets-12', tenantId: tenant1.id, productId: chickenNuggets.id, name: '12 Pieces', priceAdjustment: 8.0 },
      { id: 'size-fries-s', tenantId: tenant1.id, productId: fries.id, name: 'Small', priceAdjustment: 0 },
      { id: 'size-fries-l', tenantId: tenant1.id, productId: fries.id, name: 'Large', priceAdjustment: 4.0 },
      { id: 'size-cola-regular', tenantId: tenant1.id, productId: cola.id, name: 'Regular', priceAdjustment: 0 },
      { id: 'size-cola-large', tenantId: tenant1.id, productId: cola.id, name: 'Large', priceAdjustment: 2.0 },
    ],
  });

  console.log('Created product sizes.');

  // ==========================================
  // 15. PRODUCT VARIANTS
  // ==========================================
  await prisma.productVariant.createMany({
    data: [
      { id: 'var-cola-cola', tenantId: tenant1.id, productId: cola.id, sku: 'BEV-COLA', name: 'Coca-Cola', price: 0, stockQuantity: 999 },
      { id: 'var-cola-sprite', tenantId: tenant1.id, productId: cola.id, sku: 'BEV-SPRT', name: 'Sprite', price: 0, stockQuantity: 999 },
      { id: 'var-cola-fanta', tenantId: tenant1.id, productId: cola.id, sku: 'BEV-FNTA', name: 'Fanta', price: 0, stockQuantity: 999 },
      { id: 'var-tonkotsu-regular', tenantId: tenant2.id, productId: tonkotsu.id, sku: 'RMN-TK-R', name: 'Regular', price: 0, stockQuantity: 50 },
      { id: 'var-tonkotsu-spicy', tenantId: tenant2.id, productId: tonkotsu.id, sku: 'RMN-TK-S', name: 'Spicy', price: 100, stockQuantity: 50 },
      { id: 'var-miso-regular', tenantId: tenant2.id, productId: misoRamen.id, sku: 'RMN-MISO-R', name: 'Regular', price: 0, stockQuantity: 50 },
    ],
  });

  console.log('Created product variants.');

  // ==========================================
  // 16. PRODUCT ADDONS
  // ==========================================
  const extraChickenAddon = await prisma.productAddon.create({
    data: {
      id: 'addon-extra-chicken',
      tenantId: tenant1.id,
      productId: classicChicken.id,
      name: 'Extra Chicken',
      minSelections: 0,
      maxSelections: 3,
    },
  });

  await prisma.addonItem.createMany({
    data: [
      { id: 'addon-item-extra-breast', tenantId: tenant1.id, addonGroupId: extraChickenAddon.id, name: 'Extra Breast Piece', price: 8.0, isAvailable: true },
      { id: 'addon-item-extra-wing', tenantId: tenant1.id, addonGroupId: extraChickenAddon.id, name: 'Extra Wing Piece', price: 5.0, isAvailable: true },
      { id: 'addon-item-extra-thigh', tenantId: tenant1.id, addonGroupId: extraChickenAddon.id, name: 'Extra Thigh Piece', price: 6.0, isAvailable: true },
    ],
  });

  const sauceAddon = await prisma.productAddon.create({
    data: {
      id: 'addon-sauces',
      tenantId: tenant1.id,
      productId: classicChicken.id,
      name: 'Dipping Sauces',
      minSelections: 0,
      maxSelections: 2,
    },
  });

  await prisma.addonItem.createMany({
    data: [
      { id: 'addon-item-garlic', tenantId: tenant1.id, addonGroupId: sauceAddon.id, name: 'Garlic Sauce', price: 0, isAvailable: true },
      { id: 'addon-item-hot-sauce', tenantId: tenant1.id, addonGroupId: sauceAddon.id, name: 'Hot Sauce', price: 0, isAvailable: true },
      { id: 'addon-item-cheese', tenantId: tenant1.id, addonGroupId: sauceAddon.id, name: 'Cheese Sauce', price: 2.0, isAvailable: true },
    ],
  });

  console.log('Created addons.');

  // ==========================================
  // 17. CUSTOMERS
  // ==========================================
  const customer1 = await prisma.customer.create({
    data: {
      id: 'cust-001',
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
      id: 'cust-002',
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
      id: 'cust-003',
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
      id: 'order-demo-001',
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
      id: 'oi-001',
      tenantId: tenant1.id,
      orderId: order1.id,
      productId: classicChicken.id,
      sizeId: 'size-classic-m',
      quantity: 1,
      unitPrice: 35.0,
      totalPrice: 43.0,
      cookingStatus: 'SERVED',
    },
  });

  await prisma.orderItemAddon.create({
    data: { tenantId: tenant1.id, orderItemId: orderItem1.id, addonItemId: 'addon-item-extra-breast', price: 8.0 },
  });

  // Fries - Large
  await prisma.orderItem.create({
    data: {
      id: 'oi-002',
      tenantId: tenant1.id,
      orderId: order1.id,
      productId: fries.id,
      sizeId: 'size-fries-l',
      quantity: 1,
      unitPrice: 12.0,
      totalPrice: 12.0,
      cookingStatus: 'SERVED',
    },
  });

  // Cola - Regular
  await prisma.orderItem.create({
    data: {
      id: 'oi-003',
      tenantId: tenant1.id,
      orderId: order1.id,
      productId: cola.id,
      sizeId: 'size-cola-regular',
      quantity: 1,
      unitPrice: 4.0,
      totalPrice: 4.0,
      cookingStatus: 'SERVED',
    },
  });

  // Payment for order1
  await prisma.payment.create({
    data: {
      id: 'pay-001',
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
      id: 'order-demo-002',
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
      id: 'oi-004',
      tenantId: tenant1.id,
      orderId: order2.id,
      productId: spicyChicken.id,
      sizeId: 'size-spicy-l',
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
      id: 'order-demo-003',
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
      id: 'oi-005',
      tenantId: tenant1.id,
      orderId: order3.id,
      productId: chickenNuggets.id,
      sizeId: 'size-nuggets-12',
      quantity: 1,
      unitPrice: 30.0,
      totalPrice: 30.0,
      cookingStatus: 'PENDING',
    },
  });

  await prisma.orderItem.create({
    data: {
      id: 'oi-006',
      tenantId: tenant1.id,
      orderId: order3.id,
      productId: fries.id,
      sizeId: 'size-fries-s',
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
