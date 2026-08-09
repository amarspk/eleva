/**
 * Contract mirror of the public guest read API (Sprint 1, Step 1):
 *   GET /api/v1/public/menu?token=...
 * Field-for-field aligned with apps/api/src/menu/public-menu.service.ts.
 * Kept local because @zayjar/types intentionally does not export
 * transport DTOs of the api app.
 */

export interface PublicTenantBranding {
  name: string;
  logoUrl: string | null;
  bannerUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
}

export interface PublicTableContext {
  number: string;
}

export interface PublicBranchContext {
  id: string;
  name: string;
}

export interface PublicRestaurantContext {
  name: string;
  currency: string;
}

export interface PublicAddonOption {
  id: string;
  name: string;
  price: number;
  isAvailable: boolean;
}

export interface PublicAddonGroup {
  id: string;
  name: string;
  minSelections: number;
  maxSelections: number;
  options: PublicAddonOption[];
}

export interface PublicProductSize {
  id: string;
  name: string;
  priceAdjustment: number;
}

export interface PublicProductVariant {
  id: string;
  name: string;
  price: number;
  stockQuantity: number;
}

export interface PublicProduct {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  basePrice: number;
  calories: number | null;
  preparationTime: number;
  isAvailable: boolean;
  sizes: PublicProductSize[];
  variants: PublicProductVariant[];
  addons: PublicAddonGroup[];
}

export interface PublicCategory {
  id: string;
  name: string;
  products: PublicProduct[];
}

export interface PublicMenuResponse {
  table: PublicTableContext;
  branch: PublicBranchContext;
  restaurant: PublicRestaurantContext;
  tenant: PublicTenantBranding;
  categories: PublicCategory[];
  design?: Record<string, unknown> | null;
}

// ------------------------------------------
// Guest checkout request contract
// (mirrors CreateOrderRequestDto, apps/api/src/order/dto/create-order-request.dto.ts)
// ------------------------------------------

export interface GuestOrderAddonSelection {
  addonItemId: string;
}

export interface GuestOrderItemSelection {
  productId: string;
  sizeId?: string;
  variantId?: string;
  quantity: number;
  addons?: GuestOrderAddonSelection[];
}

export interface CreateGuestOrderPayload {
  branchId: string;
  tableId?: string;
  qrCodeToken: string;
  type: 'DINE_IN' | 'TAKE_AWAY' | 'DELIVERY';
  specialNotes?: string;
  items: GuestOrderItemSelection[];
  paymentMethod: 'CASH' | 'CREDIT_CARD' | 'APPLE_PAY' | 'LOCAL_WALLET';
}

/**
 * Subset of the checkout response the guest surface consumes.
 * The backend returns the full persisted order record.
 */
export interface GuestOrderConfirmation {
  id: string;
  orderNumber: string;
  status: string;
  total: number;
}

// ------------------------------------------
// Cart model (frontend-local)
// ------------------------------------------

export interface CartItemAddon {
  id: string;
  name: string;
  price: number;
}

export interface CartItem {
  key: string;
  productId: string;
  name: string;
  sizeId: string | null;
  sizeName: string | null;
  variantId: string | null;
  variantName: string | null;
  addons: CartItemAddon[];
  quantity: number;
  unitPrice: number;
}
