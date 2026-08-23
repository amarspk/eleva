import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';

const uuid = (description?: string): SchemaObject => ({ type: 'string', format: 'uuid', description });
const dateTime = (nullable = false): SchemaObject => ({ type: 'string', format: 'date-time', nullable });
const money: SchemaObject = {
  oneOf: [{ type: 'string', pattern: '^\\d+(\\.\\d{1,2})?$' }, { type: 'number' }],
  description: 'Decimal monetary amount. Prisma Decimal values serialize as strings; some projected responses convert them to numbers.',
};
const nullableString: SchemaObject = { type: 'string', nullable: true };
const object = (properties: Record<string, SchemaObject>, required: string[] = []): SchemaObject => ({
  type: 'object',
  properties,
  ...(required.length > 0 ? { required } : {}),
  additionalProperties: false,
});
const array = (items: SchemaObject): SchemaObject => ({ type: 'array', items });

export const ref = (name: string): SchemaObject =>
  ({ $ref: `#/components/schemas/${name}` }) as unknown as SchemaObject;

const timestampFields = {
  createdAt: dateTime(),
  updatedAt: dateTime(),
  deletedAt: dateTime(true),
};

export const OPENAPI_SCHEMAS: Record<string, SchemaObject> = {
  ApiError: object(
    {
      statusCode: { type: 'integer' },
      message: {
        oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
      },
      error: { type: 'string' },
    },
    ['statusCode', 'message'],
  ),
  MessageResponse: object({ message: { type: 'string' } }, ['message']),
  SuccessResponse: object({ success: { type: 'boolean' }, message: { type: 'string' } }, ['success']),
  DeleteResponse: object({ id: uuid(), deleted: { type: 'boolean' } }, ['id', 'deleted']),
  RestoreResponse: object({ id: uuid(), restored: { type: 'boolean', enum: [true] } }, ['id', 'restored']),

  LoginRequest: object(
    {
      email: { type: 'string', format: 'email' },
      password: { type: 'string', format: 'password', writeOnly: true },
      mfaToken: { type: 'string', pattern: '^\\d{6}$', writeOnly: true },
    },
    ['email', 'password'],
  ),
  ForgotPasswordRequest: object({ email: { type: 'string', format: 'email' } }, ['email']),
  ResetPasswordRequest: object(
    {
      token: { type: 'string', writeOnly: true },
      password: { type: 'string', format: 'password', minLength: 8, maxLength: 128, writeOnly: true },
    },
    ['token', 'password'],
  ),
  VerifyEmailRequest: object({ token: { type: 'string', writeOnly: true } }, ['token']),
  MfaVerifyRequest: object(
    { mfaToken: { type: 'string', pattern: '^\\d{6}$', minLength: 6, maxLength: 6, writeOnly: true } },
    ['mfaToken'],
  ),
  AuthUser: object(
    {
      id: uuid(),
      tenantId: { ...uuid(), nullable: true },
      email: { type: 'string', format: 'email' },
      roles: array({ type: 'string' }),
      permissions: array({ type: 'string' }),
      firstName: nullableString,
      lastName: nullableString,
      mfaEnabled: { type: 'boolean' },
      mfaRequired: { type: 'boolean' },
    },
    ['id', 'tenantId', 'email', 'roles'],
  ),
  AuthSession: object(
    {
      accessToken: { type: 'string', format: 'password', readOnly: true, description: 'Sensitive short-lived JWT access token returned only by authentication.' },
      csrfToken: { type: 'string', format: 'password', readOnly: true, description: 'Sensitive double-submit CSRF token returned only by authentication.' },
      expiresIn: { type: 'integer', example: 900 },
      user: ref('AuthUser'),
    },
    ['accessToken', 'csrfToken', 'expiresIn', 'user'],
  ),
  RefreshResponse: object(
    {
      accessToken: { type: 'string', format: 'password', readOnly: true },
      csrfToken: { type: 'string', format: 'password', readOnly: true },
      expiresIn: { type: 'integer', example: 900 },
    },
    ['accessToken', 'csrfToken', 'expiresIn'],
  ),
  MfaEnableResponse: object(
    {
      secret: { type: 'string', format: 'password', readOnly: true, description: 'Sensitive MFA enrollment secret.' },
      qrCodeDataUrl: { type: 'string', readOnly: true },
    },
    ['secret', 'qrCodeDataUrl'],
  ),
  MfaVerifyResponse: object(
    {
      mfaEnabled: { type: 'boolean' },
      backupCodes: { type: 'array', items: { type: 'string', format: 'password' }, readOnly: true, description: 'Sensitive one-time MFA backup codes.' },
    },
    ['mfaEnabled', 'backupCodes'],
  ),

  TenantPlan: object(
    {
      id: uuid(), name: { type: 'string' }, priceMonthly: { type: 'number' }, priceYearly: { type: 'number' },
      maxBranches: { type: 'integer' }, maxRestaurants: { type: 'integer' }, maxProductsPerBranch: { type: 'integer' },
      allowCustomDomains: { type: 'boolean' }, allowOnlinePayments: { type: 'boolean' }, allowAnalytics: { type: 'boolean' },
    },
    ['id', 'name', 'priceMonthly', 'priceYearly'],
  ),
  CreateTenantRequest: object(
    {
      companyName: { type: 'string', minLength: 2, maxLength: 100 },
      subdomain: { type: 'string', pattern: '^[a-z0-9-]+$', minLength: 2, maxLength: 63 },
      ownerFirstName: { type: 'string', minLength: 2, maxLength: 50 },
      ownerLastName: { type: 'string', minLength: 2, maxLength: 50 },
      ownerEmail: { type: 'string', format: 'email' },
      ownerPassword: { type: 'string', format: 'password', minLength: 8, maxLength: 64, writeOnly: true },
      planId: uuid(), restaurantName: { type: 'string' }, currency: { type: 'string', minLength: 3, maxLength: 3 },
      timezone: { type: 'string' }, taxPercentage: { type: 'number', minimum: 0, maximum: 100 },
      branch: object({
        name: { type: 'string' }, address: { type: 'string' }, phoneNumber: { type: 'string' },
        latitude: { type: 'number', minimum: -90, maximum: 90 }, longitude: { type: 'number', minimum: -180, maximum: 180 },
        operatingHours: { type: 'object', additionalProperties: true },
      }, ['name', 'address', 'phoneNumber']),
    },
    ['companyName', 'subdomain', 'ownerFirstName', 'ownerLastName', 'ownerEmail', 'ownerPassword', 'planId'],
  ),
  UpdateTenantRequest: object({
    name: { type: 'string' }, customDomain: { type: 'string' },
    branding: object({
      logoUrl: { type: 'string', format: 'uri' }, bannerUrl: { type: 'string', format: 'uri' },
      primaryColor: { type: 'string' }, secondaryColor: { type: 'string' },
      dynamic: { type: 'object', additionalProperties: true },
    }),
  }),
  Tenant: object(
    {
      id: uuid(), name: { type: 'string' }, subdomain: { type: 'string' }, customDomain: nullableString,
      status: { type: 'string' }, branding: { type: 'object', additionalProperties: true }, ...timestampFields,
    },
    ['id', 'name', 'subdomain', 'status'],
  ),
  OnboardingResponse: object(
    {
      tenant: object({ id: uuid(), name: { type: 'string' }, subdomain: { type: 'string' }, status: { type: 'string' } }, ['id', 'name', 'subdomain', 'status']),
      owner: object({ id: uuid(), email: { type: 'string', format: 'email' } }, ['id', 'email']),
      restaurant: object({ id: uuid(), name: { type: 'string' }, currency: { type: 'string' }, timezone: { type: 'string' } }, ['id', 'name', 'currency', 'timezone']),
      branch: object({ id: uuid(), name: { type: 'string' } }, ['id', 'name']),
    },
    ['tenant', 'owner', 'restaurant', 'branch'],
  ),

  Restaurant: object(
    { id: uuid(), tenantId: uuid(), name: { type: 'string' }, currency: { type: 'string' }, timezone: { type: 'string' }, taxPercentage: money, ...timestampFields },
    ['id', 'tenantId', 'name', 'currency', 'timezone', 'taxPercentage'],
  ),
  CreateRestaurantRequest: object(
    { name: { type: 'string', minLength: 2, maxLength: 255 }, currency: { type: 'string', minLength: 3, maxLength: 3 }, timezone: { type: 'string' }, taxPercentage: { type: 'number', minimum: 0, maximum: 100 } },
    ['name'],
  ),
  UpdateRestaurantRequest: object({
    name: { type: 'string', minLength: 2, maxLength: 255 }, currency: { type: 'string', minLength: 3, maxLength: 3 }, timezone: { type: 'string' }, taxPercentage: { type: 'number', minimum: 0, maximum: 100 },
  }),
  Discount: object(
    {
      id: uuid(), tenantId: uuid(), code: { type: 'string' }, name: nullableString, description: nullableString,
      type: { type: 'string', enum: ['PERCENTAGE', 'FIXED_AMOUNT'] }, value: money, active: { type: 'boolean' },
      validFrom: dateTime(true), validTo: dateTime(true), usageLimit: { type: 'integer', nullable: true }, usageCount: { type: 'integer' },
      createdAt: dateTime(), updatedAt: dateTime(),
    },
    ['id', 'tenantId', 'code', 'type', 'value', 'active', 'usageCount'],
  ),
  CreateDiscountRequest: object(
    {
      code: { type: 'string', minLength: 1, maxLength: 50 }, name: { type: 'string' }, description: { type: 'string' },
      type: { type: 'string', enum: ['PERCENTAGE', 'FIXED_AMOUNT'] }, value: { type: 'number', minimum: 0.01 },
      active: { type: 'boolean' }, validFrom: { type: 'string', format: 'date-time' }, validTo: { type: 'string', format: 'date-time' },
      usageLimit: { type: 'integer', minimum: 1 },
    },
    ['code', 'type', 'value'],
  ),
  UpdateDiscountRequest: object({
    code: { type: 'string', minLength: 1, maxLength: 50 }, name: { type: 'string', nullable: true }, description: { type: 'string', nullable: true },
    type: { type: 'string', enum: ['PERCENTAGE', 'FIXED_AMOUNT'] }, value: { type: 'number', minimum: 0.01 },
    active: { type: 'boolean' }, validFrom: { type: 'string', format: 'date-time', nullable: true }, validTo: { type: 'string', format: 'date-time', nullable: true },
    usageLimit: { type: 'integer', minimum: 1, nullable: true },
  }),
  CreateBranchRequest: object(
    {
      restaurantId: uuid(), name: { type: 'string', minLength: 2, maxLength: 100 }, address: { type: 'string' },
      latitude: { type: 'number', minimum: -90, maximum: 90 }, longitude: { type: 'number', minimum: -180, maximum: 180 },
      phoneNumber: { type: 'string' }, operatingHours: { type: 'object', additionalProperties: true },
    },
    ['restaurantId', 'name', 'address', 'phoneNumber', 'operatingHours'],
  ),
  UpdateBranchRequest: object({
    name: { type: 'string' }, address: { type: 'string' }, latitude: { type: 'number' }, longitude: { type: 'number' },
    phoneNumber: { type: 'string' }, operatingHours: { type: 'object', additionalProperties: true }, isActive: { type: 'boolean' },
  }),
  Branch: object(
    {
      id: uuid(), tenantId: uuid(), restaurantId: uuid(), name: { type: 'string' }, address: { type: 'string' },
      latitude: { ...money, nullable: true }, longitude: { ...money, nullable: true }, phoneNumber: { type: 'string' },
      operatingHours: { type: 'object', additionalProperties: true }, isActive: { type: 'boolean' }, ...timestampFields,
    },
    ['id', 'tenantId', 'restaurantId', 'name', 'address', 'phoneNumber', 'operatingHours', 'isActive'],
  ),
  CreateTableRequest: object({ branchId: uuid(), number: { type: 'string' }, seatingCapacity: { type: 'integer', minimum: 1, maximum: 100 } }, ['branchId', 'number', 'seatingCapacity']),
  UpdateTableRequest: object({ seatingCapacity: { type: 'integer', minimum: 1, maximum: 100 }, status: { type: 'string', enum: ['VACANT', 'OCCUPIED', 'RESERVED', 'DIRTY'] } }),
  Table: object(
    { id: uuid(), tenantId: uuid(), branchId: uuid(), number: { type: 'string' }, seatingCapacity: { type: 'integer' }, qrCodeToken: { type: 'string', readOnly: true }, status: { type: 'string' }, ...timestampFields },
    ['id', 'tenantId', 'branchId', 'number', 'seatingCapacity', 'qrCodeToken', 'status'],
  ),

  CreateCategoryRequest: object({ restaurantId: uuid(), name: { type: 'string', minLength: 2, maxLength: 100 }, sortOrder: { type: 'integer', minimum: 0 } }, ['restaurantId', 'name', 'sortOrder']),
  UpdateCategoryRequest: object({ name: { type: 'string' }, sortOrder: { type: 'integer', minimum: 0 }, isActive: { type: 'boolean' } }),
  Category: object(
    { id: uuid(), tenantId: uuid(), restaurantId: uuid(), name: { type: 'string' }, sortOrder: { type: 'integer' }, isActive: { type: 'boolean' }, ...timestampFields },
    ['id', 'tenantId', 'restaurantId', 'name', 'sortOrder', 'isActive'],
  ),
  CreateProductRequest: object(
    { categoryId: uuid(), name: { type: 'string' }, description: { type: 'string' }, imageUrl: { type: 'string' }, basePrice: { type: 'number', minimum: 0 }, calories: { type: 'integer', minimum: 0 }, preparationTime: { type: 'integer', minimum: 0 } },
    ['categoryId', 'name', 'basePrice'],
  ),
  UpdateProductRequest: object({ categoryId: uuid(), name: { type: 'string' }, description: { type: 'string' }, imageUrl: { type: 'string' }, basePrice: { type: 'number', minimum: 0 }, isAvailable: { type: 'boolean' }, calories: { type: 'integer', minimum: 0 }, preparationTime: { type: 'integer', minimum: 0 } }),
  Product: object(
    { id: uuid(), tenantId: uuid(), categoryId: uuid(), name: { type: 'string' }, description: nullableString, imageUrl: nullableString, basePrice: money, isAvailable: { type: 'boolean' }, calories: { type: 'integer', nullable: true }, preparationTime: { type: 'integer' }, ...timestampFields },
    ['id', 'tenantId', 'categoryId', 'name', 'basePrice', 'isAvailable', 'preparationTime'],
  ),
  ProductSizeRequest: object({ productId: uuid(), name: { type: 'string' }, priceAdjustment: { type: 'number' } }, ['productId', 'name', 'priceAdjustment']),
  ProductSize: object({ id: uuid(), tenantId: uuid(), productId: uuid(), name: { type: 'string' }, priceAdjustment: money, createdAt: dateTime(), updatedAt: dateTime() }, ['id', 'tenantId', 'productId', 'name', 'priceAdjustment']),
  ProductAddonRequest: object({ productId: uuid(), name: { type: 'string' }, minSelections: { type: 'integer' }, maxSelections: { type: 'integer' } }, ['productId', 'name']),
  ProductAddon: object({ id: uuid(), tenantId: uuid(), productId: uuid(), name: { type: 'string' }, minSelections: { type: 'integer' }, maxSelections: { type: 'integer' }, createdAt: dateTime(), updatedAt: dateTime() }, ['id', 'tenantId', 'productId', 'name']),
  AddonItemRequest: object({ addonGroupId: uuid(), name: { type: 'string' }, price: { type: 'number' } }, ['addonGroupId', 'name', 'price']),
  AddonItem: object({ id: uuid(), tenantId: uuid(), addonGroupId: uuid(), name: { type: 'string' }, price: money, isAvailable: { type: 'boolean' }, createdAt: dateTime(), updatedAt: dateTime() }, ['id', 'tenantId', 'addonGroupId', 'name', 'price']),

  CreateCustomerRequest: object({ firstName: { type: 'string' }, lastName: { type: 'string' }, email: { type: 'string', format: 'email' }, phoneNumber: { type: 'string' } }, ['firstName', 'lastName', 'email']),
  UpdateCustomerRequest: object({ firstName: { type: 'string' }, lastName: { type: 'string' }, email: { type: 'string', format: 'email' }, phoneNumber: { type: 'string' }, loyaltyPoints: { type: 'integer', minimum: 0 } }),
  CustomerRegistration: object(
    { id: uuid(), firstName: { type: 'string' }, lastName: { type: 'string' }, email: { type: 'string', format: 'email' }, loyaltyPoints: { type: 'integer' }, createdAt: dateTime() },
    ['id', 'firstName', 'lastName', 'email', 'loyaltyPoints', 'createdAt'],
  ),
  Customer: object(
    { id: uuid(), tenantId: uuid(), firstName: { type: 'string' }, lastName: { type: 'string' }, email: { type: 'string', format: 'email' }, phoneNumber: nullableString, loyaltyPoints: { type: 'integer' }, ...timestampFields },
    ['id', 'tenantId', 'firstName', 'lastName', 'email', 'loyaltyPoints'],
  ),

  OrderAddonSelection: object({ addonItemId: uuid() }, ['addonItemId']),
  OrderItemSelection: object(
    { productId: uuid(), sizeId: uuid(), variantId: uuid(), quantity: { type: 'integer', minimum: 1 }, addons: array(ref('OrderAddonSelection')) },
    ['productId', 'quantity'],
  ),
  CreateOrderRequest: object(
    {
      branchId: uuid(), tableId: uuid(), qrCodeToken: { type: 'string', writeOnly: true }, type: { type: 'string', enum: ['DINE_IN', 'TAKE_AWAY', 'DELIVERY'] },
      specialNotes: { type: 'string' }, items: array(ref('OrderItemSelection')),
      paymentMethod: { type: 'string', enum: ['CASH', 'CREDIT_CARD', 'APPLE_PAY', 'LOCAL_WALLET'] },
      discountCode: { type: 'string' }, isPreorder: { type: 'boolean' }, scheduledAt: dateTime(),
    },
    ['branchId', 'type', 'items', 'paymentMethod'],
  ),
  UpdateOrderStatusRequest: object({ status: { type: 'string', enum: ['DRAFT', 'PENDING', 'ACCEPTED', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED'] } }, ['status']),
  Order: object(
    {
      id: uuid(), tenantId: uuid(), branchId: uuid(), customerId: { ...uuid(), nullable: true }, tableId: { ...uuid(), nullable: true },
      orderNumber: { type: 'string' }, type: { type: 'string' }, paymentMethod: nullableString, status: { type: 'string' },
      subtotal: money, taxAmount: money, discountAmount: money, discountId: { ...uuid(), nullable: true }, discountCode: nullableString,
      tipAmount: money, total: money, specialNotes: nullableString, isPreorder: { type: 'boolean' }, scheduledAt: dateTime(true),
      preorderStatus: nullableString, createdAt: dateTime(), updatedAt: dateTime(), orderItems: array({ type: 'object', additionalProperties: true }),
    },
    ['id', 'tenantId', 'branchId', 'orderNumber', 'type', 'status', 'subtotal', 'taxAmount', 'total', 'isPreorder'],
  ),

  PublicAddonOption: object({ id: uuid(), name: { type: 'string' }, price: { type: 'number' }, isAvailable: { type: 'boolean' } }, ['id', 'name', 'price', 'isAvailable']),
  PublicAddonGroup: object({ id: uuid(), name: { type: 'string' }, minSelections: { type: 'integer' }, maxSelections: { type: 'integer' }, options: array(ref('PublicAddonOption')) }, ['id', 'name', 'minSelections', 'maxSelections', 'options']),
  PublicProductSize: object({ id: uuid(), name: { type: 'string' }, priceAdjustment: { type: 'number' } }, ['id', 'name', 'priceAdjustment']),
  PublicProductVariant: object({ id: uuid(), name: { type: 'string' }, price: { type: 'number' }, stockQuantity: { type: 'integer' } }, ['id', 'name', 'price', 'stockQuantity']),
  PublicProduct: object({ id: uuid(), name: { type: 'string' }, description: nullableString, imageUrl: nullableString, basePrice: { type: 'number' }, calories: { type: 'integer', nullable: true }, preparationTime: { type: 'integer' }, isAvailable: { type: 'boolean' }, sizes: array(ref('PublicProductSize')), variants: array(ref('PublicProductVariant')), addons: array(ref('PublicAddonGroup')) }, ['id', 'name', 'description', 'imageUrl', 'basePrice', 'calories', 'preparationTime', 'isAvailable', 'sizes', 'variants', 'addons']),
  PublicCategory: object({ id: uuid(), name: { type: 'string' }, products: array(ref('PublicProduct')) }, ['id', 'name', 'products']),
  TableContext: object({
    table: object({ number: { type: 'string' } }, ['number']),
    branch: object({ id: uuid(), name: { type: 'string' } }, ['id', 'name']),
    restaurant: object({ name: { type: 'string' }, currency: { type: 'string' } }, ['name', 'currency']),
    tenant: object({ name: { type: 'string' }, logoUrl: nullableString, bannerUrl: nullableString, primaryColor: { type: 'string' }, secondaryColor: { type: 'string' } }, ['name', 'logoUrl', 'bannerUrl', 'primaryColor', 'secondaryColor']),
  }, ['table', 'branch', 'restaurant', 'tenant']),
  PublicMenu: object({
    table: object({ number: { type: 'string' } }, ['number']),
    branch: object({ id: uuid(), name: { type: 'string' } }, ['id', 'name']),
    restaurant: object({ name: { type: 'string' }, currency: { type: 'string' } }, ['name', 'currency']),
    tenant: object({ name: { type: 'string' }, logoUrl: nullableString, bannerUrl: nullableString, primaryColor: { type: 'string' }, secondaryColor: { type: 'string' } }, ['name', 'logoUrl', 'bannerUrl', 'primaryColor', 'secondaryColor']),
    categories: array(ref('PublicCategory')),
    design: { type: 'object', nullable: true, additionalProperties: true },
  }, ['table', 'branch', 'restaurant', 'tenant']),
  // Phase 4 P1 — token-free public restaurant website projection.
  PublicSite: object({
    tenant: object({
      name: { type: 'string' },
      logoUrl: nullableString,
      bannerUrl: nullableString,
      primaryColor: { type: 'string' },
      secondaryColor: { type: 'string' },
      social: object({
        phone: nullableString,
        whatsapp: nullableString,
        instagram: nullableString,
        twitter: nullableString,
      }),
    }, ['name', 'logoUrl', 'bannerUrl', 'primaryColor', 'secondaryColor']),
    restaurant: object({ name: { type: 'string' }, currency: { type: 'string' } }, ['name', 'currency']),
    branch: object({
      id: uuid(),
      name: { type: 'string' },
      phoneNumber: nullableString,
      address: nullableString,
    }, ['id', 'name']),
    branches: array(object({
      id: uuid(),
      name: { type: 'string' },
      phoneNumber: nullableString,
      address: nullableString,
    }, ['id', 'name'])),
    about: nullableString,
    categories: array(ref('PublicCategory')),
    design: { type: 'object', nullable: true, additionalProperties: true },
  }, ['tenant', 'restaurant', 'categories']),

  DesignData: {
    type: 'object',
    properties: {
      colors: object({ primary: { type: 'string' }, secondary: { type: 'string' } }),
      fonts: object({ heading: { type: 'string' }, body: { type: 'string' } }),
      logo: nullableString, coverImage: nullableString,
      navigation: { type: 'object', additionalProperties: true },
      sections: array(object({ id: { type: 'string' }, type: { type: 'string' }, enabled: { type: 'boolean' }, order: { type: 'integer' }, config: { type: 'object', additionalProperties: true } }, ['id', 'type', 'enabled', 'order', 'config'])),
      layout: { type: 'object', additionalProperties: true },
    },
    additionalProperties: true,
  },
  NullableDesignData: { allOf: [ref('DesignData')], nullable: true },
  TenantDesignState: object({ draft: ref('DesignData'), published: ref('DesignData'), version: { type: 'integer' }, publishedAt: dateTime(true), preview: ref('DesignData') }, ['draft', 'published', 'version', 'publishedAt', 'preview']),
  TenantDesignRecord: object({ id: uuid(), tenantId: uuid(), draft: ref('DesignData'), published: ref('DesignData'), version: { type: 'integer' }, publishedAt: dateTime(true), createdAt: dateTime(), updatedAt: dateTime() }, ['id', 'tenantId', 'draft', 'published', 'version', 'publishedAt', 'createdAt', 'updatedAt']),
  PlatformDesignRecord: object({ id: uuid(), draft: ref('DesignData'), published: ref('DesignData'), version: { type: 'integer' }, publishedAt: dateTime(true), createdAt: dateTime(), updatedAt: dateTime() }, ['id', 'draft', 'published', 'version', 'publishedAt', 'createdAt', 'updatedAt']),
  DesignVersion: object({ id: uuid(), tenantId: uuid(), version: { type: 'integer' }, data: ref('DesignData'), createdAt: dateTime() }, ['id', 'tenantId', 'version', 'data', 'createdAt']),

  CreateAssetRequest: object({ contentType: { type: 'string', enum: ['image/jpeg', 'image/png', 'image/webp'] }, fileSize: { type: 'integer', minimum: 1, maximum: 5242880 }, fileName: { type: 'string' }, folder: { type: 'string' } }, ['contentType', 'fileSize', 'fileName']),
  PresignedAsset: object({ presignedUrl: { type: 'string', format: 'uri', readOnly: true, description: 'Sensitive short-lived upload URL.' }, publicUrl: { type: 'string', format: 'uri' }, key: { type: 'string' }, expiresIn: { type: 'integer' }, contentType: { type: 'string' } }, ['presignedUrl', 'publicUrl', 'key', 'expiresIn', 'contentType']),
  OptimizeAssetRequest: object({ bucket: { type: 'string' }, key: { type: 'string' }, folder: { type: 'string' } }, ['key']),
  OptimizedAsset: object({ originalKey: { type: 'string' }, optimizedKey: { type: 'string' }, originalSize: { type: 'integer' }, optimizedSize: { type: 'integer' }, format: { type: 'string', enum: ['webp'] }, width: { type: 'integer' }, height: { type: 'integer' }, publicUrl: { type: 'string', format: 'uri' }, cacheControl: { type: 'string' } }, ['originalKey', 'optimizedKey', 'originalSize', 'optimizedSize', 'format', 'width', 'height', 'publicUrl', 'cacheControl']),

  UploadMediaRequest: object({ file: { type: 'string', format: 'binary', writeOnly: true }, entityType: { type: 'string', maxLength: 50 }, entityId: uuid(), mediaType: { type: 'string', enum: ['IMAGE', 'LOGO', 'BANNER', 'AVATAR', 'DOCUMENT'] }, description: { type: 'string', maxLength: 255 } }, ['file', 'entityType', 'entityId', 'mediaType']),
  Media: object({
    id: uuid(), tenantId: uuid(), entityType: { type: 'string' }, entityId: { type: 'string' }, mediaType: { type: 'string' }, originalName: { type: 'string' }, mimeType: { type: 'string' }, originalFileSize: { type: 'integer' }, fileSize: { type: 'integer' }, checksum: { type: 'string' }, width: { type: 'integer', nullable: true }, height: { type: 'integer', nullable: true }, storageKey: { type: 'string' }, storageProvider: { type: 'string' }, originalUrl: { type: 'string' }, thumbnailUrl: nullableString, mediumUrl: nullableString, largeUrl: nullableString, status: { type: 'string' }, createdAt: dateTime(), updatedAt: dateTime(),
  }, ['id', 'tenantId', 'entityType', 'entityId', 'mediaType', 'originalName', 'mimeType', 'originalFileSize', 'fileSize', 'checksum', 'storageKey', 'storageProvider', 'originalUrl', 'status', 'createdAt', 'updatedAt']),

  CreateWalletPaymentRequest: object({ orderId: uuid(), paymentMethod: { type: 'string', enum: ['CASH', 'CREDIT_CARD', 'APPLE_PAY', 'LOCAL_WALLET'] }, walletType: { type: 'string', enum: ['apple_pay', 'google_pay', 'knet', 'benefit', 'mada', 'cash', 'credit_card'] }, currency: { type: 'string' }, customerEmail: { type: 'string', format: 'email' }, customerPhone: { type: 'string' }, successUrl: { type: 'string', format: 'uri' }, cancelUrl: { type: 'string', format: 'uri' } }, ['orderId', 'paymentMethod']),
  WalletPayment: object({ paymentId: uuid(), provider: { type: 'string' }, walletType: { type: 'string' }, amount: { type: 'number' }, currency: { type: 'string' }, status: { type: 'string' }, nextAction: object({ type: { type: 'string' }, url: { type: 'string', format: 'uri' }, stripeSdk: object({ walletType: { type: 'string' }, clientSecret: { type: 'string', format: 'password', readOnly: true, description: 'Sensitive payment provider client secret returned to the initiating client.' } }, ['walletType', 'clientSecret']) }, ['type']), redirectUrl: { type: 'string', format: 'uri' }, clientSecret: { type: 'string', format: 'password', readOnly: true, description: 'Sensitive payment provider client secret returned to the initiating client.' }, successUrl: { type: 'string', format: 'uri' }, cancelUrl: { type: 'string', format: 'uri' } }, ['paymentId', 'provider', 'walletType', 'amount', 'currency', 'status']),
  VerifyPayment: object({ paymentId: uuid(), orderId: uuid(), status: { type: 'string' }, verified: { type: 'boolean' }, amount: { type: 'number' }, provider: { type: 'string' }, tenantId: uuid() }, ['paymentId', 'orderId', 'status', 'verified', 'amount', 'provider', 'tenantId']),
  WebhookAcknowledgement: object({ received: { type: 'boolean' } }, ['received']),

  CreateUserRequest: object({ firstName: { type: 'string', maxLength: 100 }, lastName: { type: 'string', maxLength: 100 }, email: { type: 'string', format: 'email' }, password: { type: 'string', format: 'password', minLength: 8, maxLength: 128, writeOnly: true }, phoneNumber: { type: 'string' }, isActive: { type: 'boolean' }, roles: array({ type: 'string' }), branchIds: array(uuid()) }, ['firstName', 'lastName', 'email', 'password']),
  UpdateUserRequest: object({ firstName: { type: 'string' }, lastName: { type: 'string' }, email: { type: 'string', format: 'email' }, password: { type: 'string', format: 'password', writeOnly: true }, phoneNumber: { type: 'string' }, isActive: { type: 'boolean' }, roles: array({ type: 'string' }), branchIds: array(uuid()) }),
  AssignRolesRequest: object({ roles: array({ type: 'string' }) }, ['roles']),
  AssignBranchesRequest: object({ branchIds: array(uuid()) }, ['branchIds']),
  User: object({ id: uuid(), tenantId: { ...uuid(), nullable: true }, firstName: { type: 'string' }, lastName: { type: 'string' }, email: { type: 'string', format: 'email' }, phoneNumber: nullableString, isActive: { type: 'boolean' }, mfaEnabled: { type: 'boolean' }, lastLoginAt: dateTime(true), createdAt: dateTime(), updatedAt: dateTime(), roles: array({ type: 'string' }), branchIds: array(uuid()) }, ['id', 'tenantId', 'firstName', 'lastName', 'email', 'isActive', 'mfaEnabled', 'roles', 'branchIds']),

  CreateDeviceTokenRequest: object({ token: { type: 'string', writeOnly: true }, deviceType: { type: 'string', enum: ['ios', 'android', 'web', 'unknown'] }, userId: uuid() }, ['token', 'deviceType']),
  DeviceToken: object({ id: uuid(), token: { type: 'string', format: 'password', readOnly: true, description: 'Sensitive device token returned by the current runtime contract.' }, deviceType: { type: 'string' }, userId: uuid(), createdAt: dateTime() }, ['id', 'token', 'deviceType', 'userId']),
  CreateWebhookRequest: object({ targetUrl: { type: 'string', format: 'uri' }, secretKey: { type: 'string', writeOnly: true }, events: array({ type: 'string' }), isActive: { type: 'boolean' } }, ['targetUrl', 'secretKey', 'events']),
  Webhook: object({ id: uuid(), targetUrl: { type: 'string', format: 'uri' }, events: array({ type: 'string' }), isActive: { type: 'boolean' }, createdAt: dateTime() }, ['id', 'targetUrl', 'events', 'isActive', 'createdAt']),

  BillingSessionRequest: object({ planId: uuid(), successUrl: { type: 'string', format: 'uri' }, cancelUrl: { type: 'string', format: 'uri' } }, ['planId', 'successUrl', 'cancelUrl']),
  BillingSession: object({ checkoutSessionId: { type: 'string' }, stripeCheckoutUrl: { type: 'string', format: 'uri' } }, ['checkoutSessionId', 'stripeCheckoutUrl']),
  BillingWebhookResponse: { type: 'object', properties: { received: { type: 'boolean' }, action: { type: 'string' }, eventType: { type: 'string' }, eventId: { type: 'string' }, tenantId: { ...uuid(), nullable: true }, newSubscriptionStatus: nullableString, newTenantStatus: nullableString }, required: ['received'], additionalProperties: false },

  AdminMetrics: object({ totalTenants: { type: 'integer' }, activeSubscriptions: { type: 'integer' }, mrrUSD: { type: 'number' }, arrUSD: { type: 'number' }, systemLoadAverage: { type: 'number' }, databaseConnectionsCount: { type: 'integer' } }, ['totalTenants', 'activeSubscriptions', 'mrrUSD', 'arrUSD', 'systemLoadAverage', 'databaseConnectionsCount']),
  KdsTicket: object({ ticketId: uuid(), orderId: uuid(), ticketNumber: { type: 'string' }, priority: { type: 'string' }, elapsedMinutes: { type: 'number' }, createdAt: dateTime(), orderStatus: { type: 'string' }, items: array(object({ orderItemId: uuid(), name: { type: 'string' }, quantity: { type: 'integer' }, size: nullableString, addons: array({ type: 'string', nullable: true }), cookingStatus: { type: 'string' } }, ['orderItemId', 'name', 'quantity', 'cookingStatus'])) }, ['ticketId', 'orderId', 'ticketNumber', 'priority', 'elapsedMinutes', 'createdAt', 'orderStatus', 'items']),
  UpdateCookingStatusRequest: object({ status: { type: 'string', enum: ['PENDING', 'PREPARING', 'COOKED', 'SERVED'] } }, ['status']),
  KdsStatus: object({ orderItemId: uuid(), cookingStatus: { type: 'string' }, updatedAt: dateTime() }, ['orderItemId', 'cookingStatus', 'updatedAt']),
  Health: object({ status: { type: 'string' }, timestamp: dateTime(), uptime: { type: 'number' } }, ['status', 'timestamp', 'uptime']),
  Readiness: object(
    {
      status: { type: 'string' },
      checks: object({ database: { type: 'string', enum: ['up', 'down'] } }, ['database']),
      timestamp: dateTime(),
    },
    ['status', 'checks', 'timestamp'],
  ),
  MetricsExposition: { type: 'string', description: 'Prometheus text-based exposition (text/plain; version=0.0.4). Label values are bounded route templates, methods and status codes only — no raw URLs, query strings or identifiers.' },
};

export const arrayOf = (name: string): SchemaObject => array(ref(name));
