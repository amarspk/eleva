import {
  canSeeNavTab,
  hasPermission,
  NAV_TABS,
  visibleNavGroups,
  visibleNavTabs,
  type NavTabId,
} from './nav-permissions';

/** Seeded CASL grants (resource:action) — same vocabulary AuthService emits. */
const OWNER = [
  'product:read', 'product:create', 'product:update', 'product:delete',
  'category:read', 'category:create', 'category:update', 'category:delete',
  'branch:read', 'branch:create', 'branch:update', 'branch:delete',
  'table:read', 'table:create', 'table:update', 'table:delete',
  'order:read', 'order:create', 'order:update',
  'customer:read', 'customer:create', 'customer:update', 'customer:delete',
  'user:read', 'user:create', 'user:update', 'user:delete',
  'tenant:read', 'tenant:update',
  'payment:read', 'payment:create',
  'restaurant:read', 'restaurant:create', 'restaurant:update', 'restaurant:delete',
  'discount:read', 'discount:create', 'discount:update', 'discount:delete',
  'invoice:read', 'invoice:update',
  'media:create', 'media:read', 'media:update', 'media:delete',
];

const MANAGER = [
  'branch:read', 'branch:create', 'branch:update', 'branch:delete',
  'product:read', 'product:create', 'product:update', 'product:delete',
  'category:read', 'category:create', 'category:update', 'category:delete',
  'table:read', 'table:create', 'table:update', 'table:delete',
  'order:read', 'order:create', 'order:update',
  'customer:read', 'customer:create', 'customer:update', 'customer:delete',
  'payment:read', 'payment:create',
  'restaurant:read', 'restaurant:update',
  'discount:read', 'discount:create', 'discount:update',
  'invoice:read', 'invoice:update',
  'media:create', 'media:read', 'media:update', 'media:delete',
];

const CASHIER = [
  'order:read', 'order:create', 'order:update',
  'product:read',
  'customer:read', 'customer:create',
  'payment:read', 'payment:create',
  'table:read',
];

const KITCHEN = ['order:read', 'order:update', 'product:read'];

function ids(permissions: string[], roles: string[] = []): NavTabId[] {
  return visibleNavTabs(permissions, roles).map((tab) => tab.id);
}

describe('nav-permissions (UI visibility only)', () => {
  it('matches resource:action grants case-insensitively', () => {
    expect(hasPermission(['Product:Read'], { resource: 'product', action: 'read' })).toBe(true);
    expect(hasPermission(['product:read'], { resource: 'user', action: 'read' })).toBe(false);
  });

  it('shows the full restaurant-owner set from seeded owner grants (no Agent console)', () => {
    expect(ids(OWNER, ['RESTAURANT_OWNER'])).toEqual(
      NAV_TABS.filter((tab) => tab.id !== 'agent').map((tab) => tab.id),
    );
  });

  it('hides staff and website design from a manager (no user:* / tenant:* grants)', () => {
    const visible = ids(MANAGER, ['MANAGER']);
    expect(visible).toContain('products');
    expect(visible).toContain('orders');
    expect(visible).toContain('branches');
    expect(visible).toContain('media');
    expect(visible).not.toContain('users');
    expect(visible).not.toContain('design');
  });

  it('limits cashier nav to order/product/table/customer surfaces', () => {
    const visible = ids(CASHIER, ['CASHIER']);
    expect(visible).toEqual([
      'dashboard', 'orders', 'tables', 'products', 'customers', 'receipts',
      'complaints', 'ratings', 'settings',
    ]);
    expect(visible).not.toContain('users');
    expect(visible).not.toContain('branches');
    expect(visible).not.toContain('categories');
  });

  it('limits kitchen staff to product/order surfaces', () => {
    const visible = ids(KITCHEN, ['KITCHEN_STAFF']);
    expect(visible).toEqual(['dashboard', 'orders', 'products', 'receipts']);
    expect(visible).not.toContain('customers');
    expect(visible).not.toContain('users');
  });

  it('shows every tab to a platform owner via the existing CASL manage-all role', () => {
    expect(ids([], ['PLATFORM_OWNER'])).toEqual(NAV_TABS.map((tab) => tab.id));
  });

  it('hides an inaccessible module when the grant is missing', () => {
    const staff = NAV_TABS.find((tab) => tab.id === 'users');
    expect(staff && canSeeNavTab(staff, CASHIER, ['CASHIER'])).toBe(false);
  });

  it('drops a parent group when every child is inaccessible', () => {
    const groups = visibleNavGroups(KITCHEN, ['KITCHEN_STAFF']).map((group) => group.id);
    expect(groups).toContain('operations');
    expect(groups).toContain('catalog');
    expect(groups).not.toContain('people');
    expect(groups).not.toContain('support');
    expect(groups).not.toContain('settings');
    expect(groups).not.toContain('locations');
  });

  it('does not treat visibility as authorization — empty grants see nothing unless platform owner', () => {
    expect(visibleNavTabs([], ['CASHIER'])).toEqual([]);
    expect(visibleNavTabs([], ['RESTAURANT_OWNER'])).toEqual([]);
  });
});
