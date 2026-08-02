
Object.defineProperty(exports, "__esModule", { value: true });

const {
  Decimal,
  objectEnumValues,
  makeStrictEnum,
  Public,
  getRuntime,
  skip
} = require('./runtime/index-browser.js')


const Prisma = {}

exports.Prisma = Prisma
exports.$Enums = {}

/**
 * Prisma Client JS version: 5.22.0
 * Query Engine version: 605197351a3c8bdd595af2d2a9bc3025bca48ea2
 */
Prisma.prismaVersion = {
  client: "5.22.0",
  engine: "605197351a3c8bdd595af2d2a9bc3025bca48ea2"
}

Prisma.PrismaClientKnownRequestError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientKnownRequestError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)};
Prisma.PrismaClientUnknownRequestError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientUnknownRequestError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientRustPanicError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientRustPanicError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientInitializationError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientInitializationError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientValidationError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientValidationError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.NotFoundError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`NotFoundError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.Decimal = Decimal

/**
 * Re-export of sql-template-tag
 */
Prisma.sql = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`sqltag is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.empty = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`empty is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.join = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`join is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.raw = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`raw is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.validator = Public.validator

/**
* Extensions
*/
Prisma.getExtensionContext = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`Extensions.getExtensionContext is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.defineExtension = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`Extensions.defineExtension is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}

/**
 * Shorthand utilities for JSON filtering
 */
Prisma.DbNull = objectEnumValues.instances.DbNull
Prisma.JsonNull = objectEnumValues.instances.JsonNull
Prisma.AnyNull = objectEnumValues.instances.AnyNull

Prisma.NullTypes = {
  DbNull: objectEnumValues.classes.DbNull,
  JsonNull: objectEnumValues.classes.JsonNull,
  AnyNull: objectEnumValues.classes.AnyNull
}



/**
 * Enums
 */

exports.Prisma.TransactionIsolationLevel = makeStrictEnum({
  ReadUncommitted: 'ReadUncommitted',
  ReadCommitted: 'ReadCommitted',
  RepeatableRead: 'RepeatableRead',
  Serializable: 'Serializable'
});

exports.Prisma.TenantScalarFieldEnum = {
  id: 'id',
  name: 'name',
  subdomain: 'subdomain',
  customDomain: 'customDomain',
  status: 'status',
  logoUrl: 'logoUrl',
  bannerUrl: 'bannerUrl',
  primaryColor: 'primaryColor',
  secondaryColor: 'secondaryColor',
  branding: 'branding',
  stripeCustomerId: 'stripeCustomerId',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  deletedAt: 'deletedAt'
};

exports.Prisma.SubscriptionPlanScalarFieldEnum = {
  id: 'id',
  name: 'name',
  stripePriceId: 'stripePriceId',
  maxBranches: 'maxBranches',
  maxRestaurants: 'maxRestaurants',
  maxProductsPerBranch: 'maxProductsPerBranch',
  allowCustomDomains: 'allowCustomDomains',
  allowOnlinePayments: 'allowOnlinePayments',
  allowAnalytics: 'allowAnalytics',
  priceMonthly: 'priceMonthly',
  priceYearly: 'priceYearly',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  deletedAt: 'deletedAt'
};

exports.Prisma.SubscriptionScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  planId: 'planId',
  stripeSubscriptionId: 'stripeSubscriptionId',
  status: 'status',
  trialStart: 'trialStart',
  trialEnd: 'trialEnd',
  currentPeriodStart: 'currentPeriodStart',
  currentPeriodEnd: 'currentPeriodEnd',
  cancelAtPeriodEnd: 'cancelAtPeriodEnd',
  canceledAt: 'canceledAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.UserScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  firstName: 'firstName',
  lastName: 'lastName',
  email: 'email',
  passwordHash: 'passwordHash',
  phoneNumber: 'phoneNumber',
  isActive: 'isActive',
  mfaSecret: 'mfaSecret',
  mfaEnabled: 'mfaEnabled',
  lastLoginAt: 'lastLoginAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  deletedAt: 'deletedAt'
};

exports.Prisma.RoleScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  name: 'name',
  displayName: 'displayName',
  description: 'description',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.PermissionScalarFieldEnum = {
  id: 'id',
  action: 'action',
  resource: 'resource',
  description: 'description',
  createdAt: 'createdAt'
};

exports.Prisma.UserRoleScalarFieldEnum = {
  userId: 'userId',
  roleId: 'roleId',
  assignedAt: 'assignedAt'
};

exports.Prisma.RolePermissionScalarFieldEnum = {
  roleId: 'roleId',
  permissionId: 'permissionId',
  grantedAt: 'grantedAt'
};

exports.Prisma.RestaurantScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  name: 'name',
  currency: 'currency',
  timezone: 'timezone',
  taxPercentage: 'taxPercentage',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  deletedAt: 'deletedAt'
};

exports.Prisma.BranchScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  restaurantId: 'restaurantId',
  name: 'name',
  address: 'address',
  latitude: 'latitude',
  longitude: 'longitude',
  phoneNumber: 'phoneNumber',
  operatingHours: 'operatingHours',
  isActive: 'isActive',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  deletedAt: 'deletedAt'
};

exports.Prisma.TableScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  branchId: 'branchId',
  number: 'number',
  seatingCapacity: 'seatingCapacity',
  qrCodeToken: 'qrCodeToken',
  status: 'status',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  deletedAt: 'deletedAt'
};

exports.Prisma.CategoryScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  restaurantId: 'restaurantId',
  name: 'name',
  sortOrder: 'sortOrder',
  isActive: 'isActive',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  deletedAt: 'deletedAt'
};

exports.Prisma.ProductScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  categoryId: 'categoryId',
  name: 'name',
  description: 'description',
  imageUrl: 'imageUrl',
  basePrice: 'basePrice',
  isAvailable: 'isAvailable',
  calories: 'calories',
  preparationTime: 'preparationTime',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  deletedAt: 'deletedAt'
};

exports.Prisma.ProductSizeScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  productId: 'productId',
  name: 'name',
  priceAdjustment: 'priceAdjustment',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ProductVariantScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  productId: 'productId',
  sku: 'sku',
  name: 'name',
  price: 'price',
  stockQuantity: 'stockQuantity',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ProductAddonScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  productId: 'productId',
  name: 'name',
  minSelections: 'minSelections',
  maxSelections: 'maxSelections',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.AddonItemScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  addonGroupId: 'addonGroupId',
  name: 'name',
  price: 'price',
  isAvailable: 'isAvailable',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.DiscountScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  code: 'code',
  name: 'name',
  description: 'description',
  type: 'type',
  value: 'value',
  active: 'active',
  validFrom: 'validFrom',
  validTo: 'validTo',
  usageLimit: 'usageLimit',
  usageCount: 'usageCount',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.OrderScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  branchId: 'branchId',
  customerId: 'customerId',
  tableId: 'tableId',
  orderNumber: 'orderNumber',
  type: 'type',
  paymentMethod: 'paymentMethod',
  status: 'status',
  subtotal: 'subtotal',
  taxAmount: 'taxAmount',
  discountAmount: 'discountAmount',
  discountId: 'discountId',
  discountCode: 'discountCode',
  tipAmount: 'tipAmount',
  total: 'total',
  specialNotes: 'specialNotes',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.OrderItemScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  orderId: 'orderId',
  productId: 'productId',
  variantId: 'variantId',
  sizeId: 'sizeId',
  quantity: 'quantity',
  unitPrice: 'unitPrice',
  totalPrice: 'totalPrice',
  cookingStatus: 'cookingStatus',
  createdAt: 'createdAt'
};

exports.Prisma.OrderItemAddonScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  orderItemId: 'orderItemId',
  addonItemId: 'addonItemId',
  price: 'price'
};

exports.Prisma.CustomerScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  firstName: 'firstName',
  lastName: 'lastName',
  email: 'email',
  phoneNumber: 'phoneNumber',
  loyaltyPoints: 'loyaltyPoints',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  deletedAt: 'deletedAt'
};

exports.Prisma.PaymentScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  orderId: 'orderId',
  paymentMethod: 'paymentMethod',
  status: 'status',
  amount: 'amount',
  transactionReference: 'transactionReference',
  completedAt: 'completedAt',
  createdAt: 'createdAt'
};

exports.Prisma.InvoiceScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  orderId: 'orderId',
  invoiceNumber: 'invoiceNumber',
  pdfUrl: 'pdfUrl',
  createdAt: 'createdAt'
};

exports.Prisma.AuditLogScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  userId: 'userId',
  action: 'action',
  entityName: 'entityName',
  entityId: 'entityId',
  oldValues: 'oldValues',
  newValues: 'newValues',
  ipAddress: 'ipAddress',
  userAgent: 'userAgent',
  createdAt: 'createdAt'
};

exports.Prisma.DeviceTokenScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  userId: 'userId',
  token: 'token',
  deviceType: 'deviceType',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.KitchenQueueScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  branchId: 'branchId',
  orderId: 'orderId',
  ticketNumber: 'ticketNumber',
  priority: 'priority',
  startedCookingAt: 'startedCookingAt',
  completedCookingAt: 'completedCookingAt'
};

exports.Prisma.SessionLogScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  userId: 'userId',
  refreshTokenHash: 'refreshTokenHash',
  expiresAt: 'expiresAt',
  isRevoked: 'isRevoked',
  createdAt: 'createdAt'
};

exports.Prisma.NotificationScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  recipientType: 'recipientType',
  recipientId: 'recipientId',
  title: 'title',
  body: 'body',
  type: 'type',
  isRead: 'isRead',
  createdAt: 'createdAt'
};

exports.Prisma.WebhookScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  targetUrl: 'targetUrl',
  secretKey: 'secretKey',
  events: 'events',
  isActive: 'isActive',
  createdAt: 'createdAt'
};

exports.Prisma.MediaScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  entityType: 'entityType',
  entityId: 'entityId',
  mediaType: 'mediaType',
  originalName: 'originalName',
  mimeType: 'mimeType',
  originalFileSize: 'originalFileSize',
  fileSize: 'fileSize',
  checksum: 'checksum',
  width: 'width',
  height: 'height',
  storageKey: 'storageKey',
  storageProvider: 'storageProvider',
  originalUrl: 'originalUrl',
  thumbnailUrl: 'thumbnailUrl',
  mediumUrl: 'mediumUrl',
  largeUrl: 'largeUrl',
  status: 'status',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.SortOrder = {
  asc: 'asc',
  desc: 'desc'
};

exports.Prisma.NullableJsonNullValueInput = {
  DbNull: Prisma.DbNull,
  JsonNull: Prisma.JsonNull
};

exports.Prisma.JsonNullValueInput = {
  JsonNull: Prisma.JsonNull
};

exports.Prisma.QueryMode = {
  default: 'default',
  insensitive: 'insensitive'
};

exports.Prisma.JsonNullValueFilter = {
  DbNull: Prisma.DbNull,
  JsonNull: Prisma.JsonNull,
  AnyNull: Prisma.AnyNull
};

exports.Prisma.NullsOrder = {
  first: 'first',
  last: 'last'
};
exports.TenantStatus = exports.$Enums.TenantStatus = {
  TRIALING: 'TRIALING',
  ACTIVE: 'ACTIVE',
  PAST_DUE: 'PAST_DUE',
  UNPAID: 'UNPAID',
  CANCELED: 'CANCELED'
};

exports.SubscriptionStatus = exports.$Enums.SubscriptionStatus = {
  TRIALING: 'TRIALING',
  ACTIVE: 'ACTIVE',
  PAST_DUE: 'PAST_DUE',
  UNPAID: 'UNPAID',
  CANCELED: 'CANCELED'
};

exports.TableStatus = exports.$Enums.TableStatus = {
  VACANT: 'VACANT',
  OCCUPIED: 'OCCUPIED',
  RESERVED: 'RESERVED',
  DIRTY: 'DIRTY'
};

exports.DiscountType = exports.$Enums.DiscountType = {
  PERCENTAGE: 'PERCENTAGE',
  FIXED_AMOUNT: 'FIXED_AMOUNT'
};

exports.OrderType = exports.$Enums.OrderType = {
  DINE_IN: 'DINE_IN',
  TAKE_AWAY: 'TAKE_AWAY',
  DELIVERY: 'DELIVERY'
};

exports.PaymentMethodType = exports.$Enums.PaymentMethodType = {
  CASH: 'CASH',
  CREDIT_CARD: 'CREDIT_CARD',
  APPLE_PAY: 'APPLE_PAY',
  LOCAL_WALLET: 'LOCAL_WALLET'
};

exports.OrderStatus = exports.$Enums.OrderStatus = {
  DRAFT: 'DRAFT',
  PENDING: 'PENDING',
  ACCEPTED: 'ACCEPTED',
  PREPARING: 'PREPARING',
  READY: 'READY',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED'
};

exports.CookingStatus = exports.$Enums.CookingStatus = {
  PENDING: 'PENDING',
  PREPARING: 'PREPARING',
  COOKED: 'COOKED',
  SERVED: 'SERVED'
};

exports.PaymentStatus = exports.$Enums.PaymentStatus = {
  PENDING: 'PENDING',
  AUTHORIZED: 'AUTHORIZED',
  PAID: 'PAID',
  FAILED: 'FAILED',
  REFUNDED: 'REFUNDED'
};

exports.MediaType = exports.$Enums.MediaType = {
  IMAGE: 'IMAGE',
  LOGO: 'LOGO',
  BANNER: 'BANNER',
  AVATAR: 'AVATAR',
  DOCUMENT: 'DOCUMENT'
};

exports.Prisma.ModelName = {
  Tenant: 'Tenant',
  SubscriptionPlan: 'SubscriptionPlan',
  Subscription: 'Subscription',
  User: 'User',
  Role: 'Role',
  Permission: 'Permission',
  UserRole: 'UserRole',
  RolePermission: 'RolePermission',
  Restaurant: 'Restaurant',
  Branch: 'Branch',
  Table: 'Table',
  Category: 'Category',
  Product: 'Product',
  ProductSize: 'ProductSize',
  ProductVariant: 'ProductVariant',
  ProductAddon: 'ProductAddon',
  AddonItem: 'AddonItem',
  Discount: 'Discount',
  Order: 'Order',
  OrderItem: 'OrderItem',
  OrderItemAddon: 'OrderItemAddon',
  Customer: 'Customer',
  Payment: 'Payment',
  Invoice: 'Invoice',
  AuditLog: 'AuditLog',
  DeviceToken: 'DeviceToken',
  KitchenQueue: 'KitchenQueue',
  SessionLog: 'SessionLog',
  Notification: 'Notification',
  Webhook: 'Webhook',
  Media: 'Media'
};

/**
 * This is a stub Prisma Client that will error at runtime if called.
 */
class PrismaClient {
  constructor() {
    return new Proxy(this, {
      get(target, prop) {
        let message
        const runtime = getRuntime()
        if (runtime.isEdge) {
          message = `PrismaClient is not configured to run in ${runtime.prettyName}. In order to run Prisma Client on edge runtime, either:
- Use Prisma Accelerate: https://pris.ly/d/accelerate
- Use Driver Adapters: https://pris.ly/d/driver-adapters
`;
        } else {
          message = 'PrismaClient is unable to run in this browser environment, or has been bundled for the browser (running in `' + runtime.prettyName + '`).'
        }
        
        message += `
If this is unexpected, please open an issue: https://pris.ly/prisma-prisma-bug-report`

        throw new Error(message)
      }
    })
  }
}

exports.PrismaClient = PrismaClient

Object.assign(exports, Prisma)
