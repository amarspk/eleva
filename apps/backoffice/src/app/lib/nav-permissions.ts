/**
 * Backoffice navigation visibility — derived from the real JWT/session
 * permission strings (`resource:action`, same format AuthService.validateLogin
 * writes and CaslAbilityFactory reads).
 *
 * This is UI-only. JwtAuthGuard + RbacPermissionGuard remain authoritative.
 */

export type NavAction = 'create' | 'read' | 'update' | 'delete';

export interface NavPermission {
  resource: string;
  action: NavAction;
}

export type NavTabId =
  | 'dashboard'
  | 'products'
  | 'categories'
  | 'restaurants'
  | 'branches'
  | 'tables'
  | 'customers'
  | 'users'
  | 'orders'
  | 'design'
  | 'receipts'
  | 'media'
  | 'complaints'
  | 'ratings'
  | 'discounts'
  | 'invoices'
  | 'settings';

export type NavGroupId =
  | 'operations'
  | 'catalog'
  | 'locations'
  | 'people'
  | 'experience'
  | 'support'
  | 'settings';

export interface NavTabDefinition {
  id: NavTabId;
  group: NavGroupId;
  /** Show the tab if the session holds ANY of these existing CASL grants. */
  anyOf: NavPermission[];
  /**
   * True when the module has no dedicated CASL subject and visibility is
   * inferred from a related existing grant. The API remains JWT-only.
   */
  inferredFromRelatedGrant?: boolean;
}

export const NAV_TABS: NavTabDefinition[] = [
  { id: 'dashboard', group: 'operations', anyOf: [
    { resource: 'order', action: 'read' },
    { resource: 'product', action: 'read' },
    { resource: 'branch', action: 'read' },
  ] },
  { id: 'orders', group: 'operations', anyOf: [{ resource: 'order', action: 'read' }] },
  { id: 'tables', group: 'operations', anyOf: [{ resource: 'table', action: 'read' }] },
  { id: 'products', group: 'catalog', anyOf: [{ resource: 'product', action: 'read' }] },
  { id: 'categories', group: 'catalog', anyOf: [{ resource: 'category', action: 'read' }] },
  { id: 'restaurants', group: 'locations', anyOf: [{ resource: 'restaurant', action: 'read' }] },
  { id: 'branches', group: 'locations', anyOf: [{ resource: 'branch', action: 'read' }] },
  { id: 'customers', group: 'people', anyOf: [{ resource: 'customer', action: 'read' }] },
  { id: 'users', group: 'people', anyOf: [{ resource: 'user', action: 'read' }] },
  { id: 'design', group: 'experience', anyOf: [{ resource: 'tenant', action: 'read' }] },
  { id: 'receipts', group: 'experience', anyOf: [{ resource: 'order', action: 'read' }] },
  { id: 'media', group: 'experience', anyOf: [{ resource: 'media', action: 'read' }] },
  { id: 'complaints', group: 'support', anyOf: [{ resource: 'customer', action: 'read' }] },
  { id: 'ratings', group: 'support', anyOf: [{ resource: 'customer', action: 'read' }] },
  { id: 'discounts', group: 'settings', anyOf: [{ resource: 'discount', action: 'read' }] },
  { id: 'invoices', group: 'settings', anyOf: [{ resource: 'invoice', action: 'read' }] },
  { id: 'settings', group: 'settings', anyOf: [{ resource: 'customer', action: 'read' }] },
];

export const NAV_GROUP_ORDER: NavGroupId[] = [
  'operations',
  'catalog',
  'locations',
  'people',
  'experience',
  'support',
  'settings',
];

export const NAV_LABELS: Record<'en' | 'ar', { tabs: Record<NavTabId, string>; groups: Record<NavGroupId, string> }> = {
  en: {
    tabs: {
      dashboard: 'Dashboard',
      products: 'Products',
      categories: 'Categories',
      restaurants: 'Restaurants',
      branches: 'Branches',
      tables: 'Tables',
      customers: 'Customers',
      users: 'Staff',
      orders: 'Orders',
      design: 'Design / Website',
      receipts: 'Receipts',
      media: 'Media Library',
      complaints: 'Complaints',
      ratings: 'Ratings',
      discounts: 'Discounts',
      invoices: 'Invoices',
      settings: 'Settings',
    },
    groups: {
      operations: 'Operations',
      catalog: 'Menu',
      locations: 'Locations',
      people: 'People',
      experience: 'Experience',
      support: 'Support',
      settings: 'Settings',
    },
  },
  ar: {
    tabs: {
      dashboard: 'لوحة التحكم',
      products: 'المنتجات',
      categories: 'التصنيفات',
      restaurants: 'المطاعم',
      branches: 'الفروع',
      tables: 'الطاولات',
      customers: 'العملاء',
      users: 'الموظفون',
      orders: 'الطلبات',
      design: 'التصميم / الموقع',
      receipts: 'الإيصالات',
      media: 'مكتبة الوسائط',
      complaints: 'الشكاوى',
      ratings: 'التقييمات',
      discounts: 'الخصومات',
      invoices: 'الفواتير',
      settings: 'الإعدادات',
    },
    groups: {
      operations: 'التشغيل',
      catalog: 'القائمة',
      locations: 'المواقع',
      people: 'الأشخاص',
      experience: 'التجربة',
      support: 'الدعم',
      settings: 'الإعدادات',
    },
  },
};

export function parsePermissionGrant(raw: string): { resource: string; action: string } | null {
  const parts = raw.split(':');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return null;
  }
  return { resource: parts[0].toLowerCase(), action: parts[1].toLowerCase() };
}

export function hasPermission(permissions: readonly string[], required: NavPermission): boolean {
  const wantResource = required.resource.toLowerCase();
  const wantAction = required.action.toLowerCase();
  return permissions.some((raw) => {
    const grant = parsePermissionGrant(raw);
    return grant !== null && grant.resource === wantResource && grant.action === wantAction;
  });
}

/**
 * Mirrors CaslAbilityFactory: PLATFORM_OWNER bypasses modular mapping with
 * manage(all). Restaurant staff are judged only by permission strings.
 */
export function canSeeNavTab(
  tab: NavTabDefinition,
  permissions: readonly string[],
  roles: readonly string[],
): boolean {
  if (roles.includes('PLATFORM_OWNER')) {
    return true;
  }
  return tab.anyOf.some((required) => hasPermission(permissions, required));
}

export function visibleNavTabs(
  permissions: readonly string[],
  roles: readonly string[],
): NavTabDefinition[] {
  return NAV_TABS.filter((tab) => canSeeNavTab(tab, permissions, roles));
}

export function visibleNavGroups(
  permissions: readonly string[],
  roles: readonly string[],
): Array<{ id: NavGroupId; tabs: NavTabDefinition[] }> {
  const tabs = visibleNavTabs(permissions, roles);
  return NAV_GROUP_ORDER
    .map((id) => ({ id, tabs: tabs.filter((tab) => tab.group === id) }))
    .filter((group) => group.tabs.length > 0);
}
