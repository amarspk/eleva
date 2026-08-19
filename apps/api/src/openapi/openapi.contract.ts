import {
  ApiBody,
  ApiConsumes,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import { AdminController } from '../admin/admin.controller';
import { AssetController } from '../asset/asset.controller';
import { AuthController } from '../auth/auth.controller';
import { BillingController } from '../billing/billing.controller';
import { BranchController } from '../branch/branch.controller';
import { HealthController } from '../common/health/health.controller';
import { MetricsController } from '../common/metrics/metrics.controller';
import { CustomerController } from '../customer/customer.controller';
import { DesignController } from '../design/design.controller';
import { DeviceTokenController } from '../device-token/device-token.controller';
import { KdsController } from '../kds/kds.controller';
import { MediaController } from '../media/media.controller';
import { MenuController } from '../menu/menu.controller';
import { PublicMenuController } from '../menu/public-menu.controller';
import { OrderController } from '../order/order.controller';
import { PublicOrderController } from '../order/public-order.controller';
import { PaymentController } from '../payment/payment.controller';
import { RestaurantController } from '../restaurant/restaurant.controller';
import { TenantController } from '../tenant/tenant.controller';
import { UserController } from '../user/user.controller';
import { WebhookController } from '../webhook/webhook.controller';
import { arrayOf, ref } from './openapi.schemas';

type ControllerType = abstract new (...args: never[]) => unknown;
type TenantScope = 'tenant-jwt' | 'tenant-context' | 'tenant-path-jwt' | 'platform-global' | 'tenant-free';
type AuthKind = 'public' | 'bearer' | 'refresh-cookie' | 'stripe-webhook' | 'tap-webhook' | 'actual-media' | 'metrics-token';

interface ParameterDoc {
  name: string;
  description: string;
  required?: boolean;
  schema?: SchemaObject;
}

interface EndpointDoc {
  method: string;
  summary: string;
  description?: string;
  auth: AuthKind;
  tenant: TenantScope;
  permission?: string;
  body?: string | SchemaObject;
  response: string | SchemaObject;
  status?: number;
  errors?: number[];
  params?: ParameterDoc[];
  queries?: ParameterDoc[];
  multipart?: boolean;
}

interface ControllerDoc {
  controller: ControllerType;
  tag: string;
  description: string;
  endpoints: EndpointDoc[];
}

const uuid: SchemaObject = { type: 'string', format: 'uuid' };
const string: SchemaObject = { type: 'string' };
const boolean: SchemaObject = { type: 'boolean' };
const integer: SchemaObject = { type: 'integer' };
const schema = (value: string | SchemaObject): SchemaObject => typeof value === 'string' ? ref(value) : value;
const responseArray = (name: string): SchemaObject => arrayOf(name);
const p = (name: string, description: string, value: SchemaObject = uuid): ParameterDoc => ({ name, description, required: true, schema: value });
const q = (name: string, description: string, value: SchemaObject = string, required = false): ParameterDoc => ({ name, description, required, schema: value });

const docs: ControllerDoc[] = [
  {
    controller: AdminController,
    tag: 'Admin',
    description: 'Platform-global administration. Every operation requires an authenticated PLATFORM_OWNER.',
    endpoints: [
      { method: 'getMetrics', summary: 'Get platform tenant metrics', auth: 'bearer', tenant: 'platform-global', permission: 'PLATFORM_OWNER (platform:read)', response: 'AdminMetrics', errors: [401, 403] },
    ],
  },
  {
    controller: AssetController,
    tag: 'Assets',
    description: 'JWT-tenant-scoped presigned asset and optimization operations.',
    endpoints: [
      { method: 'createPresignedUrl', summary: 'Create a presigned asset upload URL', auth: 'bearer', tenant: 'tenant-jwt', permission: 'create:Media', body: 'CreateAssetRequest', response: 'PresignedAsset', errors: [400, 401, 403] },
      { method: 'optimizeImage', summary: 'Trigger asset image optimization', auth: 'bearer', tenant: 'tenant-jwt', permission: 'update:Media', body: 'OptimizeAssetRequest', response: 'OptimizedAsset', errors: [400, 401, 403] },
    ],
  },
  {
    controller: AuthController,
    tag: 'Authentication',
    description: 'Staff login, token rotation, account recovery, session termination, and MFA.',
    endpoints: [
      { method: 'login', summary: 'Authenticate staff and issue access/refresh/CSRF tokens', auth: 'public', tenant: 'tenant-free', body: 'LoginRequest', response: 'AuthSession', errors: [400, 401, 403, 429] },
      { method: 'forgotPassword', summary: 'Request a password-reset email without account enumeration', auth: 'public', tenant: 'tenant-context', body: 'ForgotPasswordRequest', response: 'MessageResponse', errors: [400, 429, 503] },
      { method: 'resetPassword', summary: 'Reset a password with a one-time token', auth: 'public', tenant: 'tenant-context', body: 'ResetPasswordRequest', response: 'MessageResponse', errors: [400, 429, 503] },
      { method: 'verifyEmail', summary: 'Verify an email with a one-time token', auth: 'public', tenant: 'tenant-context', body: 'VerifyEmailRequest', response: 'MessageResponse', errors: [400, 429, 503] },
      { method: 'refresh', summary: 'Rotate the refresh cookie and issue new access/CSRF tokens', auth: 'refresh-cookie', tenant: 'tenant-context', response: 'RefreshResponse', errors: [401, 403, 503] },
      { method: 'logout', summary: 'Terminate the active staff session', auth: 'bearer', tenant: 'tenant-jwt', response: 'SuccessResponse', errors: [401, 403] },
      { method: 'getMe', summary: 'Get the authenticated staff profile', auth: 'bearer', tenant: 'tenant-jwt', response: { type: 'object', properties: { user: ref('AuthUser') }, required: ['user'], additionalProperties: false }, errors: [401, 403, 404] },
      { method: 'enableMfa', summary: 'Generate an MFA enrollment secret', auth: 'bearer', tenant: 'tenant-jwt', response: 'MfaEnableResponse', errors: [401, 403] },
      { method: 'verifyMfa', summary: 'Verify and enable MFA enrollment', auth: 'bearer', tenant: 'tenant-jwt', body: 'MfaVerifyRequest', response: 'MfaVerifyResponse', errors: [400, 401, 403] },
    ],
  },
  {
    controller: BillingController,
    tag: 'Billing',
    description: 'Tenant subscription checkout and Stripe billing webhook synchronization.',
    endpoints: [
      { method: 'createSession', summary: 'Create a Stripe subscription checkout session', auth: 'bearer', tenant: 'tenant-jwt', permission: 'RESTAURANT_OWNER or PLATFORM_OWNER (billing:write)', body: 'BillingSessionRequest', response: 'BillingSession', errors: [400, 401, 403, 404, 503] },
      { method: 'handleWebhook', summary: 'Process a Stripe billing webhook', auth: 'stripe-webhook', tenant: 'tenant-context', response: 'BillingWebhookResponse', errors: [400, 403, 503] },
    ],
  },
  {
    controller: BranchController,
    tag: 'Locations',
    description: 'Tenant-scoped branch and seating-table management.',
    endpoints: [
      { method: 'createBranch', summary: 'Create a branch', auth: 'bearer', tenant: 'tenant-jwt', permission: 'create:Branch', body: 'CreateBranchRequest', response: 'Branch', status: 201, errors: [400, 401, 403, 404] },
      { method: 'getBranches', summary: 'List branches', auth: 'bearer', tenant: 'tenant-jwt', permission: 'read:Branch', response: responseArray('Branch'), queries: [q('includeDeleted', 'Include soft-deleted branches.', { type: 'boolean' })], errors: [400, 401, 403] },
      { method: 'updateBranch', summary: 'Update a branch', auth: 'bearer', tenant: 'tenant-jwt', permission: 'update:Branch', body: 'UpdateBranchRequest', response: 'Branch', params: [p('id', 'Branch UUID.')], errors: [400, 401, 403, 404] },
      { method: 'deleteBranch', summary: 'Soft-delete a branch', auth: 'bearer', tenant: 'tenant-jwt', permission: 'delete:Branch', response: 'DeleteResponse', params: [p('id', 'Branch UUID.')], errors: [401, 403, 404, 409] },
      { method: 'restoreBranch', summary: 'Restore a soft-deleted branch', auth: 'bearer', tenant: 'tenant-jwt', permission: 'update:Branch', response: 'RestoreResponse', params: [p('id', 'Branch UUID.')], errors: [401, 403, 404] },
      { method: 'createTable', summary: 'Create a seating table', auth: 'bearer', tenant: 'tenant-jwt', permission: 'create:Table', body: 'CreateTableRequest', response: 'Table', status: 201, errors: [400, 401, 403, 404] },
      { method: 'getTables', summary: 'List seating tables', auth: 'bearer', tenant: 'tenant-jwt', permission: 'read:Table', response: responseArray('Table'), queries: [q('branchId', 'Optional branch UUID filter.', uuid), q('includeDeleted', 'Include soft-deleted tables.', { type: 'boolean' })], errors: [400, 401, 403] },
      { method: 'updateTable', summary: 'Update seating capacity or status', auth: 'bearer', tenant: 'tenant-jwt', permission: 'update:Table', body: 'UpdateTableRequest', response: 'Table', params: [p('id', 'Table UUID.')], errors: [400, 401, 403, 404] },
      { method: 'deleteTable', summary: 'Soft-delete a seating table', auth: 'bearer', tenant: 'tenant-jwt', permission: 'delete:Table', response: 'DeleteResponse', params: [p('id', 'Table UUID.')], errors: [401, 403, 404, 409] },
      { method: 'restoreTable', summary: 'Restore a soft-deleted seating table', auth: 'bearer', tenant: 'tenant-jwt', permission: 'update:Table', response: 'RestoreResponse', params: [p('id', 'Table UUID.')], errors: [401, 403, 404] },
    ],
  },
  {
    controller: HealthController,
    tag: 'Health',
    description: 'Tenant-free infrastructure health probes. /health preserves the legacy contract; /live is process-only; /ready verifies database availability.',
    endpoints: [
      { method: 'getHealth', summary: 'Get API health (legacy compatibility endpoint)', auth: 'public', tenant: 'tenant-free', response: 'Health' },
      { method: 'getLive', summary: 'Process-only liveness probe — proves the API process/event loop is alive without touching PostgreSQL, Redis, external services, tenant resolution or authentication', auth: 'public', tenant: 'tenant-free', response: 'Health' },
      { method: 'getReady', summary: 'Readiness probe — verifies the required PostgreSQL dependency is available', auth: 'public', tenant: 'tenant-free', response: 'Readiness', errors: [503] },
    ],
  },
  {
    controller: MetricsController,
    tag: 'Metrics',
    description: 'Prometheus text exposition for infrastructure scraping, protected by the static METRICS_TOKEN bearer credential (503 when the credential is not configured server-side).',
    endpoints: [
      { method: 'getMetrics', summary: 'Expose Prometheus metrics (text/plain; Cache-Control: no-store)', auth: 'metrics-token', tenant: 'tenant-free', response: 'MetricsExposition', errors: [401, 503] },
    ],
  },
  {
    controller: CustomerController,
    tag: 'Customers',
    description: 'Public tenant-context registration and staff-protected customer management.',
    endpoints: [
      { method: 'createCustomer', summary: 'Register a customer in the resolved tenant', auth: 'public', tenant: 'tenant-context', body: 'CreateCustomerRequest', response: 'CustomerRegistration', status: 201, errors: [400, 403, 409] },
      { method: 'getCustomers', summary: 'List customers', auth: 'bearer', tenant: 'tenant-jwt', permission: 'read:Customer', response: responseArray('Customer'), queries: [q('includeDeleted', 'Include soft-deleted customers.', boolean)], errors: [400, 401, 403] },
      { method: 'getCustomer', summary: 'Get one customer', auth: 'bearer', tenant: 'tenant-jwt', permission: 'read:Customer', response: 'Customer', params: [p('id', 'Customer UUID.')], errors: [400, 401, 403, 404] },
      { method: 'updateCustomer', summary: 'Update a customer', auth: 'bearer', tenant: 'tenant-jwt', permission: 'update:Customer', body: 'UpdateCustomerRequest', response: 'Customer', params: [p('id', 'Customer UUID.')], errors: [400, 401, 403, 404, 409] },
      { method: 'deleteCustomer', summary: 'Soft-delete a customer', auth: 'bearer', tenant: 'tenant-jwt', permission: 'delete:Customer', response: 'DeleteResponse', params: [p('id', 'Customer UUID.')], errors: [401, 403, 404, 409] },
      { method: 'restoreCustomer', summary: 'Restore a soft-deleted customer', auth: 'bearer', tenant: 'tenant-jwt', permission: 'update:Customer', response: 'RestoreResponse', params: [p('id', 'Customer UUID.')], errors: [401, 403, 404, 409] },
    ],
  },
  {
    controller: DesignController,
    tag: 'Design',
    description: 'Published/draft tenant design and platform design. Every handler is live under both /design and /api/v1/design.',
    endpoints: [
      { method: 'getForTenant', summary: 'Get tenant design state', description: 'The tenantId path parameter is routing input. For non-platform users, the signature-verified JWT tenant is authoritative and a foreign tenantId returns 404.', auth: 'bearer', tenant: 'tenant-path-jwt', permission: 'read:Tenant', response: 'TenantDesignState', params: [p('tenantId', 'Requested tenant UUID; authorization is still controlled by JWT identity.')], queries: [q('preview', 'Return draft in the preview projection when true.', boolean)], errors: [400, 401, 403, 404] },
      { method: 'saveDraft', summary: 'Save a tenant design draft', auth: 'bearer', tenant: 'tenant-path-jwt', permission: 'update:Tenant', body: 'DesignData', response: 'TenantDesignRecord', params: [p('tenantId', 'Requested tenant UUID; authorization is controlled by JWT identity.')], errors: [400, 401, 403, 404] },
      { method: 'publish', summary: 'Publish the current tenant design draft', auth: 'bearer', tenant: 'tenant-path-jwt', permission: 'update:Tenant', response: 'TenantDesignRecord', status: 201, params: [p('tenantId', 'Requested tenant UUID; authorization is controlled by JWT identity.')], errors: [401, 403, 404] },
      { method: 'versions', summary: 'List tenant design versions', auth: 'bearer', tenant: 'tenant-path-jwt', permission: 'read:Tenant', response: responseArray('DesignVersion'), params: [p('tenantId', 'Requested tenant UUID; authorization is controlled by JWT identity.')], errors: [401, 403, 404] },
      { method: 'restore', summary: 'Restore a tenant design version into a new draft revision', auth: 'bearer', tenant: 'tenant-path-jwt', permission: 'update:Tenant', response: 'TenantDesignRecord', status: 201, params: [p('tenantId', 'Requested tenant UUID; authorization is controlled by JWT identity.'), p('version', 'Historical version number.', integer)], errors: [400, 401, 403, 404] },
      { method: 'getPublic', summary: 'Get a tenant published design', auth: 'public', tenant: 'tenant-context', response: 'NullableDesignData', params: [p('tenantId', 'Tenant UUID whose published design is requested.')], errors: [400, 403] },
      { method: 'getPlatform', summary: 'Get the published platform design', auth: 'public', tenant: 'tenant-free', response: 'NullableDesignData' },
      { method: 'getPlatformPreview', summary: 'Preview the platform design draft', auth: 'bearer', tenant: 'platform-global', permission: 'PLATFORM_OWNER', response: 'DesignData', errors: [401, 403] },
      { method: 'savePlatform', summary: 'Save the platform design draft', auth: 'bearer', tenant: 'platform-global', permission: 'PLATFORM_OWNER', body: 'DesignData', response: 'PlatformDesignRecord', errors: [400, 401, 403] },
      { method: 'publishPlatform', summary: 'Publish the platform design draft', auth: 'bearer', tenant: 'platform-global', permission: 'PLATFORM_OWNER', response: 'PlatformDesignRecord', status: 201, errors: [401, 403, 404] },
    ],
  },
  {
    controller: DeviceTokenController,
    tag: 'Device Tokens',
    description: 'JWT-tenant-scoped push-notification device token registration.',
    endpoints: [
      { method: 'registerToken', summary: 'Register a device token', auth: 'bearer', tenant: 'tenant-jwt', body: 'CreateDeviceTokenRequest', response: 'DeviceToken', status: 201, errors: [400, 401, 403, 409] },
      { method: 'listTokens', summary: 'List accessible device tokens', auth: 'bearer', tenant: 'tenant-jwt', response: responseArray('DeviceToken'), queries: [q('userId', 'Privileged roles may list another tenant user’s tokens.', uuid)], errors: [400, 401, 403] },
      { method: 'deleteToken', summary: 'Delete a device token', auth: 'bearer', tenant: 'tenant-jwt', response: { type: 'object', properties: { success: boolean, id: uuid }, required: ['success', 'id'], additionalProperties: false }, params: [p('id', 'Device-token UUID.')], errors: [400, 401, 403, 404] },
    ],
  },
  {
    controller: KdsController,
    tag: 'KDS',
    description: 'Tenant- and branch-scoped kitchen ticket operations.',
    endpoints: [
      { method: 'getTickets', summary: 'List active kitchen tickets for a branch', auth: 'bearer', tenant: 'tenant-jwt', permission: 'read:Order', response: responseArray('KdsTicket'), queries: [q('branchId', 'Required branch UUID.', uuid, true)], errors: [400, 401, 403, 404] },
      { method: 'updateItemStatus', summary: 'Update an order item cooking status', auth: 'bearer', tenant: 'tenant-jwt', permission: 'update:Order', body: 'UpdateCookingStatusRequest', response: 'KdsStatus', params: [p('orderItemId', 'Order-item UUID.')], errors: [400, 401, 403, 404] },
    ],
  },
  {
    controller: MediaController,
    tag: 'Media',
    description: 'JWT + RBAC media library. Tenant identity comes from the verified JWT; Media is a CASL subject without a repository-registry lookup (scoping is in MediaService).',
    endpoints: [
      { method: 'upload', summary: 'Upload and process media', auth: 'bearer', tenant: 'tenant-jwt', permission: 'create:Media', body: 'UploadMediaRequest', response: 'Media', status: 201, multipart: true, errors: [400, 401, 403, 404, 409] },
      { method: 'findAll', summary: 'List media for the authenticated tenant', auth: 'bearer', tenant: 'tenant-jwt', permission: 'read:Media', response: responseArray('Media'), queries: [q('entityType', 'Optional entity type filter.'), q('entityId', 'Optional entity identifier filter.')], errors: [400, 401, 403] },
      { method: 'findOne', summary: 'Get one media record', auth: 'bearer', tenant: 'tenant-jwt', permission: 'read:Media', response: 'Media', params: [p('id', 'Media identifier.', string)], errors: [400, 401, 403, 404] },
      { method: 'remove', summary: 'Delete one media record', auth: 'bearer', tenant: 'tenant-jwt', permission: 'delete:Media', response: 'MessageResponse', params: [p('id', 'Media identifier.', string)], errors: [400, 401, 403, 404] },
    ],
  },
  {
    controller: MenuController,
    tag: 'Menu',
    description: 'Tenant-scoped menu catalog management with RBAC, subscription, and rate-limit guards.',
    endpoints: [
      { method: 'createCategory', summary: 'Create a menu category', auth: 'bearer', tenant: 'tenant-jwt', permission: 'create:Product', body: 'CreateCategoryRequest', response: 'Category', status: 201, errors: [400, 401, 403, 404] },
      { method: 'getCategories', summary: 'List menu categories', auth: 'bearer', tenant: 'tenant-jwt', permission: 'read:Product', response: responseArray('Category'), queries: [q('includeDeleted', 'Include archived categories.', boolean)], errors: [400, 401, 403, 429] },
      { method: 'updateCategory', summary: 'Update a menu category', auth: 'bearer', tenant: 'tenant-jwt', permission: 'update:Category', body: 'UpdateCategoryRequest', response: 'Category', params: [p('id', 'Category UUID.')], errors: [400, 401, 403, 404] },
      { method: 'deleteCategory', summary: 'Soft-delete a category and its products', auth: 'bearer', tenant: 'tenant-jwt', permission: 'delete:Category', response: 'DeleteResponse', params: [p('id', 'Category UUID.')], errors: [401, 403, 404] },
      { method: 'restoreCategory', summary: 'Restore a soft-deleted category', auth: 'bearer', tenant: 'tenant-jwt', permission: 'update:Category', response: 'RestoreResponse', params: [p('id', 'Category UUID.')], errors: [401, 403, 404] },
      { method: 'createProduct', summary: 'Create a menu product', auth: 'bearer', tenant: 'tenant-jwt', permission: 'create:Product', body: 'CreateProductRequest', response: 'Product', status: 201, errors: [400, 401, 403, 404] },
      { method: 'getProducts', summary: 'List menu products', auth: 'bearer', tenant: 'tenant-jwt', permission: 'read:Product', response: responseArray('Product'), queries: [q('categoryId', 'Optional category UUID filter.', uuid), q('includeDeleted', 'Include archived products.', boolean)], errors: [400, 401, 403, 429] },
      { method: 'updateProduct', summary: 'Update a menu product', auth: 'bearer', tenant: 'tenant-jwt', permission: 'update:Product', body: 'UpdateProductRequest', response: 'Product', params: [p('id', 'Product UUID.')], errors: [400, 401, 403, 404] },
      { method: 'deleteProduct', summary: 'Soft-delete a menu product', auth: 'bearer', tenant: 'tenant-jwt', permission: 'delete:Product', response: 'DeleteResponse', params: [p('id', 'Product UUID.')], errors: [401, 403, 404] },
      { method: 'restoreProduct', summary: 'Restore a soft-deleted menu product', auth: 'bearer', tenant: 'tenant-jwt', permission: 'update:Product', response: 'RestoreResponse', params: [p('id', 'Product UUID.')], errors: [401, 403, 404, 409] },
      { method: 'createProductSize', summary: 'Create a product size', auth: 'bearer', tenant: 'tenant-jwt', permission: 'create:Product', body: 'ProductSizeRequest', response: 'ProductSize', status: 201, errors: [400, 401, 403, 404] },
      { method: 'createProductAddon', summary: 'Create a product addon group', auth: 'bearer', tenant: 'tenant-jwt', permission: 'create:Product', body: 'ProductAddonRequest', response: 'ProductAddon', status: 201, errors: [400, 401, 403, 404] },
      { method: 'createAddonItem', summary: 'Create an addon-group option', auth: 'bearer', tenant: 'tenant-jwt', permission: 'create:Product', body: 'AddonItemRequest', response: 'AddonItem', status: 201, errors: [400, 401, 403, 404] },
    ],
  },
  {
    controller: PublicMenuController,
    tag: 'Public Menu',
    description: 'Unauthenticated QR menu reads. Tenant context comes from host/custom domain or X-Tenant-ID; the QR token binds the physical table.',
    endpoints: [
      { method: 'getTableContext', summary: 'Resolve public table context from a QR token', auth: 'public', tenant: 'tenant-context', response: 'TableContext', params: [p('token', 'Cryptographic QR table token.', string)], errors: [400, 403, 404, 429] },
      { method: 'getPublicMenu', summary: 'Get the public menu for a scanned table', auth: 'public', tenant: 'tenant-context', response: 'PublicMenu', queries: [q('token', 'Cryptographic QR table token.', string, true)], errors: [400, 403, 404, 429] },
      { method: 'getPublicSite', summary: 'Get the token-free public restaurant website projection (branding, social links, menu)', auth: 'public', tenant: 'tenant-context', response: 'PublicSite', errors: [400, 403, 404, 429] },
    ],
  },
  {
    controller: OrderController,
    tag: 'Orders',
    description: 'Authenticated tenant order management.',
    endpoints: [
      { method: 'createOrder', summary: 'Create an authenticated order', auth: 'bearer', tenant: 'tenant-jwt', permission: 'create:Order', body: 'CreateOrderRequest', response: 'Order', status: 201, errors: [400, 401, 403, 404, 429] },
      { method: 'getOrder', summary: 'Get one order', auth: 'bearer', tenant: 'tenant-jwt', permission: 'read:Order', response: 'Order', params: [p('id', 'Order UUID.')], errors: [400, 401, 403, 404] },
      { method: 'getOrders', summary: 'List orders', auth: 'bearer', tenant: 'tenant-jwt', permission: 'read:Order', response: responseArray('Order'), queries: [q('branchId', 'Optional branch UUID filter.', uuid)], errors: [400, 401, 403] },
      { method: 'updateOrderStatus', summary: 'Update an order status', auth: 'bearer', tenant: 'tenant-jwt', permission: 'update:Order', body: 'UpdateOrderStatusRequest', response: 'Order', params: [p('id', 'Order UUID.')], errors: [400, 401, 403, 404] },
      { method: 'cancelOrder', summary: 'Cancel an order', auth: 'bearer', tenant: 'tenant-jwt', permission: 'update:Order', response: 'Order', params: [p('id', 'Order UUID.')], errors: [401, 403, 404, 409] },
    ],
  },
  {
    controller: PublicOrderController,
    tag: 'Public Orders',
    description: 'Unauthenticated QR guest checkout, tenant-scoped by host/header and bound to a verified table token.',
    endpoints: [
      { method: 'guestCheckout', summary: 'Place a guest QR order', auth: 'public', tenant: 'tenant-context', body: 'CreateOrderRequest', response: 'Order', status: 201, errors: [400, 403, 404, 429] },
    ],
  },
  {
    controller: PaymentController,
    tag: 'Payments',
    description: 'Tenant wallet payment creation/verification and Tap webhook settlement.',
    endpoints: [
      { method: 'createWalletPayment', summary: 'Create a wallet payment session', auth: 'bearer', tenant: 'tenant-jwt', permission: 'create:Payment', body: 'CreateWalletPaymentRequest', response: 'WalletPayment', status: 201, errors: [400, 401, 403, 404, 409, 503] },
      { method: 'verifyPayment', summary: 'Verify and reconcile a wallet payment', auth: 'bearer', tenant: 'tenant-jwt', permission: 'read:Payment', response: 'VerifyPayment', params: [p('paymentId', 'Payment UUID.')], errors: [400, 401, 403, 404, 503] },
      { method: 'handleTapWebhook', summary: 'Process a Tap payment webhook', auth: 'tap-webhook', tenant: 'tenant-context', body: { type: 'object', additionalProperties: true, description: 'Tap charge event payload. Tenant identity is read only after hashstring verification from metadata.udf1.' }, response: 'WebhookAcknowledgement', errors: [400, 403, 503] },
    ],
  },
  {
    controller: RestaurantController,
    tag: 'Restaurants',
    description: 'Read-only tenant restaurant-brand endpoints.',
    endpoints: [
      { method: 'findAll', summary: 'List restaurant brands', auth: 'bearer', tenant: 'tenant-jwt', permission: 'read:Restaurant', response: responseArray('Restaurant'), queries: [q('includeDeleted', 'Include archived restaurants.', boolean)], errors: [400, 401, 403] },
      { method: 'findOne', summary: 'Get one restaurant brand', auth: 'bearer', tenant: 'tenant-jwt', permission: 'read:Restaurant', response: 'Restaurant', params: [p('id', 'Restaurant UUID.')], errors: [400, 401, 403, 404] },
    ],
  },
  {
    controller: TenantController,
    tag: 'Tenants',
    description: 'Tenant-free subscription-plan/onboarding routes and protected tenant reads/updates.',
    endpoints: [
      { method: 'getPlans', summary: 'List available subscription plans', auth: 'public', tenant: 'tenant-free', response: responseArray('TenantPlan') },
      { method: 'onboard', summary: 'Onboard a tenant, owner, restaurant, and initial branch', auth: 'public', tenant: 'tenant-free', body: 'CreateTenantRequest', response: 'OnboardingResponse', status: 201, errors: [400, 409, 503] },
      { method: 'getTenant', summary: 'Get a tenant', auth: 'bearer', tenant: 'tenant-path-jwt', response: 'Tenant', params: [p('id', 'Tenant UUID; non-platform callers may only access their JWT tenant.')], errors: [400, 401, 403, 404] },
      { method: 'updateTenant', summary: 'Update a tenant', auth: 'bearer', tenant: 'tenant-path-jwt', permission: 'update:Tenant', body: 'UpdateTenantRequest', response: 'Tenant', params: [p('id', 'Tenant UUID; authorization is controlled by JWT identity.')], errors: [400, 401, 403, 404, 409] },
    ],
  },
  {
    controller: UserController,
    tag: 'Users',
    description: 'Tenant staff-user lifecycle, role assignment, and branch assignment.',
    endpoints: [
      { method: 'createUser', summary: 'Create a staff user', auth: 'bearer', tenant: 'tenant-jwt', permission: 'create:User', body: 'CreateUserRequest', response: 'User', status: 201, errors: [400, 401, 403, 404, 409, 503] },
      { method: 'listUsers', summary: 'List staff users', auth: 'bearer', tenant: 'tenant-jwt', permission: 'read:User', response: responseArray('User'), queries: [q('isActive', 'Filter by active state.', boolean), q('branchId', 'Filter by assigned branch UUID.', uuid), q('limit', 'Page size; service clamps to 200.', integer), q('offset', 'Page offset.', integer)], errors: [400, 401, 403] },
      { method: 'getUser', summary: 'Get one staff user', auth: 'bearer', tenant: 'tenant-jwt', permission: 'read:User', response: 'User', params: [p('id', 'User UUID.')], errors: [400, 401, 403, 404] },
      { method: 'updateUser', summary: 'Update a staff user', auth: 'bearer', tenant: 'tenant-jwt', permission: 'update:User', body: 'UpdateUserRequest', response: 'User', params: [p('id', 'User UUID.')], errors: [400, 401, 403, 404, 409, 503] },
      { method: 'assignRoles', summary: 'Replace a staff user’s roles', auth: 'bearer', tenant: 'tenant-jwt', permission: 'update:User', body: 'AssignRolesRequest', response: 'User', params: [p('id', 'User UUID.')], errors: [400, 401, 403, 404] },
      { method: 'assignBranches', summary: 'Replace a staff user’s branch scope', auth: 'bearer', tenant: 'tenant-jwt', permission: 'update:User', body: 'AssignBranchesRequest', response: 'User', params: [p('id', 'User UUID.')], errors: [400, 401, 403, 404] },
      { method: 'deleteUser', summary: 'Soft-delete and deactivate a staff user', auth: 'bearer', tenant: 'tenant-jwt', permission: 'delete:User', response: { type: 'object', properties: { id: uuid, deleted: { type: 'boolean', enum: [true] } }, required: ['id', 'deleted'], additionalProperties: false }, params: [p('id', 'User UUID.')], errors: [400, 401, 403, 404, 409, 503] },
    ],
  },
  {
    controller: WebhookController,
    tag: 'Outbound Webhooks',
    description: 'Tenant-scoped outbound webhook subscription management. Runtime guards are JWT plus controller role checks.',
    endpoints: [
      { method: 'createWebhook', summary: 'Create an outbound webhook subscription', auth: 'bearer', tenant: 'tenant-jwt', permission: 'RESTAURANT_OWNER or PLATFORM_OWNER', body: 'CreateWebhookRequest', response: 'Webhook', status: 201, errors: [400, 401, 403] },
      { method: 'listWebhooks', summary: 'List outbound webhook subscriptions', auth: 'bearer', tenant: 'tenant-jwt', response: responseArray('Webhook'), errors: [401, 403] },
      { method: 'deleteWebhook', summary: 'Delete an outbound webhook subscription', auth: 'bearer', tenant: 'tenant-jwt', permission: 'RESTAURANT_OWNER or PLATFORM_OWNER', response: { type: 'object', properties: { success: boolean, id: uuid }, required: ['success', 'id'], additionalProperties: false }, params: [p('id', 'Webhook UUID.')], errors: [400, 401, 403, 404] },
    ],
  },
];

const errorDescriptions: Record<number, string> = {
  400: 'Bad request or validation failure.',
  401: 'Authentication credentials are missing, expired, revoked, or invalid.',
  403: 'Tenant, CSRF, role, permission, subscription, or authorization failure.',
  404: 'The tenant-scoped resource was not found. Foreign identifiers use 404 to avoid an existence oracle.',
  409: 'The requested state transition conflicts with current persisted state.',
  429: 'Rate limit exceeded.',
  503: 'A required external provider or fail-closed security dependency is unavailable.',
};

function decorateMethod(controller: ControllerType, endpoint: EndpointDoc): void {
  const prototype = controller.prototype as Record<string, unknown>;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, endpoint.method);
  if (!descriptor) {
    throw new Error(`AUDIT-011 OpenAPI contract references missing handler ${controller.name}.${endpoint.method}`);
  }
  const target = prototype as object;
  const key = endpoint.method;
  const operationDescription = [
    endpoint.description,
    `Tenant scope: ${endpoint.tenant}.`,
    endpoint.permission ? `Required runtime permission/role: ${endpoint.permission}.` : undefined,
    endpoint.auth === 'actual-media'
      ? 'Authorization note: no JwtAuthGuard is declared in source; this documents the current runtime inconsistency without changing it.'
      : undefined,
  ].filter(Boolean).join(' ');

  const routeMethod = Reflect.getMetadata('method', descriptor.value as object) as number | undefined;
  const mutating = routeMethod !== undefined && [1, 2, 3, 4].includes(routeMethod);
  const security = endpoint.auth === 'bearer'
    ? [{ bearer: [], ...(mutating ? { csrfToken: [] } : {}) }]
    : endpoint.auth === 'refresh-cookie'
      ? [{ refreshCookie: [] }]
      : endpoint.auth === 'stripe-webhook'
        ? [{ stripeSignature: [] }]
        : endpoint.auth === 'tap-webhook'
          ? [{ tapHashstring: [] }]
          : endpoint.auth === 'metrics-token'
            ? [{ metricsToken: [] }]
            : undefined;

  ApiOperation({
    summary: endpoint.summary,
    description: operationDescription,
    security,
    ...(endpoint.permission ? { 'x-required-permission': endpoint.permission } : {}),
    'x-tenant-scope': endpoint.tenant,
  } as never)(target, key, descriptor);

  if (endpoint.auth === 'stripe-webhook') {
    ApiHeader({ name: 'stripe-signature', required: true, description: 'Stripe webhook signature verified against the raw request body.' })(target, key, descriptor);
  } else if (endpoint.auth === 'tap-webhook') {
    ApiHeader({ name: 'hashstring', required: true, description: 'Tap HMAC-SHA256 hashstring verified before state changes.' })(target, key, descriptor);
  } else if (endpoint.auth === 'metrics-token') {
    ApiHeader({
      name: 'authorization',
      required: true,
      description: 'Bearer credential equal to the METRICS_TOKEN environment value. The endpoint returns 503 when the credential is not configured server-side.',
    })(target, key, descriptor);
  }

  if (endpoint.tenant === 'tenant-jwt' || endpoint.tenant === 'tenant-context' || endpoint.tenant === 'tenant-path-jwt') {
    ApiHeader({
      name: 'X-Tenant-ID',
      required: false,
      description: endpoint.tenant === 'tenant-context'
        ? 'Optional explicit tenant context. The tenant may instead be resolved from the tenant subdomain or custom domain.'
        : 'Optional context hint. For authenticated non-platform users, the signature-verified JWT tenant is authoritative and mismatches return 403.',
    })(target, key, descriptor);
  }

  if (endpoint.auth === 'bearer' && mutating) {
    ApiHeader({ name: 'X-CSRF-Token', required: true, description: 'Redis-backed double-submit token required for authenticated mutating requests.' })(target, key, descriptor);
  }

  if (endpoint.multipart) {
    ApiConsumes('multipart/form-data')(target, key, descriptor);
  }
  if (endpoint.body) {
    ApiBody({ schema: schema(endpoint.body) })(target, key, descriptor);
  }
  for (const parameter of endpoint.params ?? []) {
    ApiParam({ name: parameter.name, required: true, description: parameter.description, schema: parameter.schema })(target, key, descriptor);
  }
  for (const query of endpoint.queries ?? []) {
    ApiQuery({ name: query.name, required: query.required ?? false, description: query.description, schema: query.schema })(target, key, descriptor);
  }

  ApiResponse({
    status: endpoint.status ?? 200,
    description: 'Successful response.',
    schema: schema(endpoint.response),
  })(target, key, descriptor);
  for (const status of [...new Set(endpoint.errors ?? [])]) {
    ApiResponse({ status, description: errorDescriptions[status], schema: ref('ApiError') })(target, key, descriptor);
  }
}

let applied = false;

/** Applies explicit Swagger decorators to every current REST controller/handler. */
export function applyOpenApiContract(): void {
  if (applied) {
    return;
  }
  for (const controller of docs) {
    ApiTags(controller.tag)(controller.controller);
    for (const endpoint of controller.endpoints) {
      decorateMethod(controller.controller, endpoint);
    }
  }
  applied = true;
}

export const DOCUMENTED_HANDLER_COUNT = docs.reduce((total, controller) => total + controller.endpoints.length, 0);
export const DOCUMENTED_CONTROLLER_COUNT = docs.length;
