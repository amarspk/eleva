export const TENANT_A = {
  id: 't110c-9a1b-42b8-bf83-097a18fcd341',
  name: 'Gourmet Burger LLC',
  subdomain: 'gourmet-burgers',
  status: 'ACTIVE',
  branding: {
    logoUrl: 'https://cdn.zayjar.com/t110c/logo.webp',
    bannerUrl: 'https://cdn.zayjar.com/t110c/cover.webp',
    primaryColor: '#FF5733',
    secondaryColor: '#C70039',
  },
};

export const TENANT_B = {
  id: 't220d-5b3c-78a1-cf44-129b8de12345',
  name: 'Pizza Palace Inc',
  subdomain: 'pizza-palace',
  status: 'ACTIVE',
  branding: {
    logoUrl: 'https://cdn.zayjar.com/t220d/logo.webp',
    bannerUrl: 'https://cdn.zayjar.com/t220d/cover.webp',
    primaryColor: '#2563EB',
    secondaryColor: '#1E40AF',
  },
};

export const BRANCH_A = {
  id: 'branch-a-001',
  tenantId: TENANT_A.id,
  name: 'Downtown Branch',
  address: '123 Main St, Riyadh',
  isActive: true,
};

export const BRANCH_B = {
  id: 'branch-b-001',
  tenantId: TENANT_B.id,
  name: 'Westside Branch',
  address: '456 Oak Ave, Jeddah',
  isActive: true,
};

export const TABLE_A = {
  id: 'table-a-07',
  branchId: BRANCH_A.id,
  number: '7',
  seatingCapacity: 4,
  qrCodeToken: 'qr_t14_sec_99a8c1f00b2e3abcdef1234567890ab',
  status: 'VACANT',
};

export const USER_A_OWNER = {
  id: 'user-a-owner-01',
  tenantId: TENANT_A.id,
  email: 'owner@gourmetburgers.com',
  firstName: 'Ahmad',
  lastName: 'Al-Rashid',
  roles: ['RESTAURANT_OWNER'],
};

export const USER_A_CASHIER = {
  id: 'user-a-cashier-01',
  tenantId: TENANT_A.id,
  email: 'cashier@gourmetburgers.com',
  firstName: 'Sara',
  lastName: 'Hassan',
  roles: ['CASHIER'],
};

export const USER_A_KITCHEN = {
  id: 'user-a-kitchen-01',
  tenantId: TENANT_A.id,
  email: 'kitchen@gourmetburgers.com',
  firstName: 'Omar',
  lastName: 'Ali',
  roles: ['KITCHEN_STAFF'],
};

export const USER_B_OWNER = {
  id: 'user-b-owner-01',
  tenantId: TENANT_B.id,
  email: 'owner@pizzapalace.com',
  firstName: 'Khalid',
  lastName: 'Omar',
  roles: ['RESTAURANT_OWNER'],
};

export const CATEGORIES_A = [
  {
    id: 'cat1',
    name: 'Premium Craft Burgers',
    sortOrder: 1,
    products: [
      {
        id: 'prod_1',
        name: 'Truffle Umami Smash Burger',
        description: 'Double smashed patty with truffle aioli, caramelized onions, and aged cheddar on brioche',
        imageUrl: null,
        basePrice: 14.5,
        calories: 850,
        isAvailable: true,
        sizes: [
          { id: 'size_1', name: 'Single', priceAdjustment: 0 },
          { id: 'size_2', name: 'Double Patty Max', priceAdjustment: 4.0 },
        ],
        variants: [],
        addons: [
          {
            id: 'addon_group_1',
            name: 'Extra Sauces',
            minSelections: 0,
            maxSelections: 2,
            options: [
              { id: 'addon_1', name: 'House Truffle Aioli', price: 0.75, isAvailable: true },
              { id: 'addon_2', name: 'Chili Garlic Butter', price: 0.5, isAvailable: true },
            ],
          },
        ],
      },
      {
        id: 'prod_2',
        name: 'Classic Smash Burger',
        description: 'Single smashed patty with American cheese, pickles, and special sauce',
        imageUrl: null,
        basePrice: 10.0,
        calories: 650,
        isAvailable: true,
        sizes: [],
        variants: [],
        addons: [],
      },
    ],
  },
  {
    id: 'cat2',
    name: 'Sides & Fries',
    sortOrder: 2,
    products: [
      {
        id: 'prod_3',
        name: 'Loaded Truffle Fries',
        description: 'Hand-cut fries with truffle oil, parmesan, and herbs',
        imageUrl: null,
        basePrice: 6.5,
        calories: 420,
        isAvailable: true,
        sizes: [
          { id: 'size_3', name: 'Regular', priceAdjustment: 0 },
          { id: 'size_4', name: 'Large', priceAdjustment: 2.5 },
        ],
        variants: [],
        addons: [],
      },
    ],
  },
  {
    id: 'cat3',
    name: 'Beverages',
    sortOrder: 3,
    products: [
      {
        id: 'prod_4',
        name: 'Fresh Lemon Mint',
        description: 'Freshly squeezed lemonade with crushed mint leaves',
        imageUrl: null,
        basePrice: 4.0,
        calories: 120,
        isAvailable: true,
        sizes: [],
        variants: [
          { id: 'var_1', name: 'Regular', price: 4.0, stockQuantity: 50 },
          { id: 'var_2', name: 'Large', price: 6.0, stockQuantity: 30 },
        ],
        addons: [],
      },
    ],
  },
];

export const PRODUCTS_A_FLAT = CATEGORIES_A.flatMap((cat) =>
  cat.products.map((p) => ({
    ...p,
    categoryId: cat.id,
    categoryName: cat.name,
  }))
);

export const CATEGORY_B = [
  {
    id: 'cat-p1',
    name: 'Classic Pizzas',
    sortOrder: 1,
    products: [
      {
        id: 'prod_p1',
        name: 'Margherita',
        description: 'San Marzano tomatoes, fresh mozzarella, basil',
        imageUrl: null,
        basePrice: 12.0,
        calories: 700,
        isAvailable: true,
        sizes: [
          { id: 'size_p1', name: 'Medium 12"', priceAdjustment: 0 },
          { id: 'size_p2', name: 'Large 14"', priceAdjustment: 3.5 },
        ],
        variants: [],
        addons: [],
      },
    ],
  },
];

const now = new Date().toISOString();

export const ORDER_A_001 = {
  id: 'order-a-001',
  orderNumber: 'ORD-2026-001',
  tenantId: TENANT_A.id,
  branchId: BRANCH_A.id,
  tableId: TABLE_A.id,
  type: 'DINE_IN',
  status: 'PENDING',
  subtotal: 19.0,
  taxAmount: 2.85,
  discountAmount: 0,
  tipAmount: 0,
  total: 21.85,
  specialNotes: null,
  createdAt: now,
  updatedAt: now,
  orderItems: [
    {
      id: 'oi-001',
      orderId: 'order-a-001',
      productId: 'prod_1',
      productName: 'Truffle Umami Smash Burger',
      quantity: 1,
      unitPrice: 19.25,
      totalPrice: 19.25,
      sizeName: 'Double Patty Max',
      cookingStatus: 'PENDING',
      orderItemAddons: [
        { id: 'oia-1', addonItemName: 'House Truffle Aioli', price: 0.75 },
      ],
    },
  ],
};

export const ORDER_A_002 = {
  id: 'order-a-002',
  orderNumber: 'ORD-2026-002',
  tenantId: TENANT_A.id,
  branchId: BRANCH_A.id,
  type: 'DINE_IN',
  status: 'PENDING',
  subtotal: 10.0,
  taxAmount: 1.5,
  total: 11.5,
  orderItems: [
    {
      id: 'oi-002',
      orderId: 'order-a-002',
      productId: 'prod_2',
      productName: 'Classic Smash Burger',
      quantity: 1,
      unitPrice: 10.0,
      totalPrice: 10.0,
      sizeName: null,
      cookingStatus: 'PENDING',
      orderItemAddons: [],
    },
  ],
};

export const CHECKOUT_RESPONSE = {
  id: 'order-new-001',
  orderNumber: 'ORD-2026-010',
  status: 'PENDING',
  subtotal: 19.0,
  taxAmount: 2.85,
  total: 21.85,
  createdAt: now,
  orderItems: [
    {
      id: 'oi-new-001',
      productId: 'prod_1',
      productName: 'Truffle Umami Smash Burger',
      quantity: 1,
      unitPrice: 19.25,
      totalPrice: 19.25,
      cookingStatus: 'PENDING',
    },
  ],
};

export const KDS_TICKETS = [
  {
    ticketId: ORDER_A_001.id,
    ticketNumber: '001',
    priority: 'NORMAL',
    elapsedMinutes: 0,
    items: ORDER_A_001.orderItems.map((item) => ({
      id: item.id,
      name: item.productName,
      quantity: item.quantity,
      size: item.sizeName,
      addons: item.orderItemAddons.map((a) => a.addonItemName),
      cookingStatus: 'PENDING',
    })),
  },
];

export const METRICS_RESPONSE = {
  totalTenants: 2,
  activeTenants: 2,
  totalOrders: 156,
  totalRevenue: 4521.5,
  monthlyRecurringRevenue: 109.98,
};
