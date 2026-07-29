'use client';
/* eslint-disable @typescript-eslint/explicit-function-return-type, curly */

import React, { useMemo, useState } from 'react';
import Image from 'next/image';
import {
  CartItem,
  GuestOrderConfirmation,
  PublicAddonOption,
  PublicMenuResponse,
  PublicProduct,
  PublicAddonGroup,
  PublicProductSize,
  PublicProductVariant,
} from '../lib/types';
import { computeCartItemCount, computeCartSubtotal, computeUnitPrice, cartItemKey } from '../lib/pricing';
import { buildCheckoutPayload, submitGuestOrder } from '../lib/guest-api';
import { formatPrice } from '../lib/format';

type AddonGroup = PublicAddonGroup;
type Size = PublicProductSize;
type Variant = PublicProductVariant;

interface MenuBrowserProps {
  /** Full guest payload from GET /api/v1/public/menu (SSR-provided). */
  initialData: PublicMenuResponse;
  /** Cryptographic QR table credential (?t=...), sent on checkout (DOC-005 4.6). */
  token: string;
}

export const MenuBrowser: React.FC<MenuBrowserProps> = ({ initialData, token }) => {
  const categories = initialData.categories;
  const primaryColor = initialData.tenant.primaryColor;
  const currency = initialData.restaurant.currency;

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  const [activeCartProduct, setActiveCartProduct] = useState<PublicProduct | null>(null);

  // Item configuration states (modal)
  const [selectedSize, setSelectedSize] = useState<Size | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<Variant | null>(null);
  const [selectedAddons, setSelectedAddons] = useState<PublicAddonOption[]>([]);
  const [quantity, setQuantity] = useState(1);

  // Cart & checkout states
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [specialNotes, setSpecialNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<GuestOrderConfirmation | null>(null);

  // Filter Categories & Products dynamically
  const filteredCategories = useMemo(() => {
    return categories
      .map((category) => {
        const matchingProducts = category.products.filter((product) => {
          const description = product.description ?? '';
          const matchesSearch = product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            description.toLowerCase().includes(searchQuery.toLowerCase());
          return product.isAvailable && matchesSearch;
        });

        return { ...category, products: matchingProducts };
      })
      .filter((category) => {
        const matchesCategorySelection = selectedCategoryId === 'all' || category.id === selectedCategoryId;
        return matchesCategorySelection && category.products.length > 0;
      });
  }, [categories, searchQuery, selectedCategoryId]);

  // Dynamic Inheritance Pricing Logic per DOC-005 4.3 (shared lib, verified)
  const calculatedUnitPrice = useMemo(() => {
    if (!activeCartProduct) return 0;
    return computeUnitPrice(activeCartProduct, selectedSize, selectedVariant, selectedAddons);
  }, [activeCartProduct, selectedSize, selectedVariant, selectedAddons]);

  const cartSubtotal = useMemo(() => computeCartSubtotal(cart), [cart]);
  const cartItemCount = useMemo(() => computeCartItemCount(cart), [cart]);

  const handleAddonClick = (addon: PublicAddonOption, group: AddonGroup) => {
    const isActive = selectedAddons.some((item) => item.id === addon.id);
    if (isActive) {
      setSelectedAddons(selectedAddons.filter((item) => item.id !== addon.id));
    } else {
      // Validate Selection Upper Bounds
      const activeGroupSelections = selectedAddons.filter((item) =>
        group.options.some((opt) => opt.id === item.id),
      );

      if (activeGroupSelections.length < group.maxSelections) {
        setSelectedAddons([...selectedAddons, addon]);
      } else if (group.maxSelections === 1 && activeGroupSelections.length === 1) {
        // Auto-replace single-choice selections
        const groupOptionIds = group.options.map((opt) => opt.id);
        const filteredAddons = selectedAddons.filter((item) => !groupOptionIds.includes(item.id));
        setSelectedAddons([...filteredAddons, addon]);
      }
    }
  };

  const resetCartModal = () => {
    setActiveCartProduct(null);
    setSelectedSize(null);
    setSelectedVariant(null);
    setSelectedAddons([]);
    setQuantity(1);
  };

  const addToCart = () => {
    if (!activeCartProduct) return;

    const addons = selectedAddons.map((addon) => ({ id: addon.id, name: addon.name, price: Number(addon.price) }));
    const key = cartItemKey(activeCartProduct.id, selectedSize?.id ?? null, selectedVariant?.id ?? null, addons);

    setCart((prev) => {
      const existing = prev.find((item) => item.key === key);
      if (existing) {
        return prev.map((item) => (item.key === key ? { ...item, quantity: item.quantity + quantity } : item));
      }
      const line: CartItem = {
        key,
        productId: activeCartProduct.id,
        name: activeCartProduct.name,
        sizeId: selectedSize?.id ?? null,
        sizeName: selectedSize?.name ?? null,
        variantId: selectedVariant?.id ?? null,
        variantName: selectedVariant?.name ?? null,
        addons,
        quantity,
        unitPrice: calculatedUnitPrice,
      };
      return [...prev, line];
    });

    resetCartModal();
  };

  const changeLineQuantity = (key: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) => (item.key === key ? { ...item, quantity: Math.max(0, item.quantity + delta) } : item))
        .filter((item) => item.quantity > 0),
    );
  };

  const removeLine = (key: string) => {
    setCart((prev) => prev.filter((item) => item.key !== key));
  };

  const placeOrder = async () => {
    if (cart.length === 0 || submitting) return;
    setSubmitting(true);
    setCheckoutError(null);

    try {
      const payload = buildCheckoutPayload(cart, {
        qrCodeToken: token,
        branchId: initialData.branch.id,
        paymentMethod: 'CASH',
        specialNotes,
      });
      const result = await submitGuestOrder(payload);
      setConfirmation(result);
      setCart([]);
      setCartOpen(false);
      setSpecialNotes('');
    } catch (err) {
      setCheckoutError(err instanceof Error ? err.message : 'The order could not be placed.');
    } finally {
      setSubmitting(false);
    }
  };

  const startNewOrder = () => {
    setConfirmation(null);
    setCheckoutError(null);
  };

  // ==========================================
  // Order confirmation view (after HTTP 201)
  // ==========================================
  if (confirmation) {
    return (
      <div className="w-full max-w-md mx-auto bg-gray-50 min-h-screen pb-24 px-4 pt-16 text-center">
        <div className="bg-white rounded-2xl shadow-sm p-6">
          <div className="text-4xl mb-3" aria-hidden>✅</div>
          <h2 className="text-lg font-bold text-gray-900 mb-1">Order received</h2>
          <p className="text-sm text-gray-600 mb-4">
            Your order was sent to the kitchen. Pay at the counter when you are ready.
          </p>
          <div className="bg-gray-50 rounded-xl p-4 mb-4 text-left">
            <div className="flex justify-between text-sm py-1">
              <span className="text-gray-500">Order number</span>
              <span className="font-bold text-gray-900">{confirmation.orderNumber}</span>
            </div>
            <div className="flex justify-between text-sm py-1">
              <span className="text-gray-500">Table</span>
              <span className="font-semibold text-gray-900">{initialData.table.number}</span>
            </div>
            <div className="flex justify-between text-sm py-1">
              <span className="text-gray-500">Status</span>
              <span className="font-semibold text-gray-900">{confirmation.status}</span>
            </div>
            <div className="flex justify-between text-sm py-1 border-t mt-2 pt-2">
              <span className="text-gray-500">Total</span>
              <span className="font-bold text-gray-900">{formatPrice(Number(confirmation.total), currency)}</span>
            </div>
          </div>
          <button
            onClick={startNewOrder}
            className="px-6 py-3 rounded-full text-white font-semibold text-sm shadow-md"
            style={{ backgroundColor: primaryColor }}
          >
            Back to menu
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md mx-auto bg-gray-50 min-h-screen pb-24">
      {/* Dynamic Brand Navigation Bar */}
      <header className="sticky top-0 bg-white shadow-sm z-30 px-4 py-3">
        <input
          type="text"
          placeholder="Search menu items..."
          className="w-full px-4 py-2 border rounded-full text-sm bg-gray-100 focus:outline-none focus:ring-2 focus:ring-offset-2"
          style={{ '--tw-ring-color': primaryColor } as React.CSSProperties}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <div className="flex gap-2 overflow-x-auto py-2 scrollbar-none mt-2">
          <button
            onClick={() => setSelectedCategoryId('all')}
            className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
              selectedCategoryId === 'all' ? 'text-white' : 'bg-gray-100 text-gray-700'
            }`}
            style={selectedCategoryId === 'all' ? { backgroundColor: primaryColor } : {}}
          >
            All
          </button>
          {categories.map((category) => (
            <button
              key={category.id}
              onClick={() => setSelectedCategoryId(category.id)}
              className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                selectedCategoryId === category.id ? 'text-white' : 'bg-gray-100 text-gray-700'
              }`}
              style={selectedCategoryId === category.id ? { backgroundColor: primaryColor } : {}}
            >
              {category.name}
            </button>
          ))}
        </div>
      </header>

      {/* Structured Category Lists */}
      <main className="px-4 py-4 space-y-8">
        {(() => {
          let globalProductIndex = 0;
          return filteredCategories.map((category) => (
            <section key={category.id}>
              <h2 className="text-lg font-bold text-gray-900 border-l-4 pl-2 mb-4" style={{ borderColor: primaryColor }}>
                {category.name}
              </h2>
              <div className="grid grid-cols-1 gap-4">
                {category.products.map((product) => {
                  const productIndex = globalProductIndex++;
                  const isAboveFold = productIndex < 3;
                  return (
                    <div
                      key={product.id}
                      onClick={() => setActiveCartProduct(product)}
                      className="bg-white p-3 rounded-xl flex shadow-sm cursor-pointer hover:shadow-md transition-shadow"
                    >
                      <div className="flex-1 pr-3">
                        <h3 className="font-semibold text-gray-900 text-sm">{product.name}</h3>
                        <p className="text-gray-500 text-xs mt-1 line-clamp-2">{product.description ?? ''}</p>
                        <span className="text-gray-900 font-bold text-sm block mt-2">
                          {formatPrice(Number(product.basePrice), currency)}
                        </span>
                      </div>
                      {product.imageUrl && (
                        <div className="relative w-20 h-20 rounded-lg overflow-hidden flex-shrink-0">
                          <Image
                            src={product.imageUrl}
                            alt={product.name}
                            fill
                            sizes="80px"
                            className="object-cover"
                            priority={isAboveFold}
                            loading={isAboveFold ? undefined : 'lazy'}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ));
        })()}
      </main>

      {/* Item Customization Drawer / Modal Container */}
      {activeCartProduct && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center">
          <div className="bg-white w-full max-w-md rounded-t-2xl p-6 max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-lg font-bold text-gray-900">{activeCartProduct.name}</h3>
              <button onClick={resetCartModal} className="text-gray-400 hover:text-gray-600 text-xl font-bold">×</button>
            </div>

            {/* Sizing Section */}
            {activeCartProduct.sizes.length > 0 && (
              <div className="mb-6">
                <h4 className="text-xs font-bold text-gray-500 uppercase mb-2">Select Size</h4>
                <div className="grid grid-cols-3 gap-2">
                  {activeCartProduct.sizes.map((size) => (
                    <button
                      key={size.id}
                      onClick={() => { setSelectedSize(size); setSelectedVariant(null); }}
                      className={`border p-2 rounded-lg text-xs font-semibold text-center ${
                        selectedSize?.id === size.id ? 'border-2 text-gray-900' : 'text-gray-600'
                      }`}
                      style={selectedSize?.id === size.id ? { borderColor: primaryColor } : {}}
                    >
                      {size.name} (+{formatPrice(Number(size.priceAdjustment), currency)})
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Variants Section */}
            {activeCartProduct.variants.length > 0 && (
              <div className="mb-6">
                <h4 className="text-xs font-bold text-gray-500 uppercase mb-2">Select Variant</h4>
                <div className="space-y-2">
                  {activeCartProduct.variants.map((variant) => (
                    <button
                      key={variant.id}
                      disabled={variant.stockQuantity <= 0}
                      onClick={() => { setSelectedVariant(variant); setSelectedSize(null); }}
                      className={`w-full border p-3 rounded-lg text-xs font-semibold text-left flex justify-between ${
                        selectedVariant?.id === variant.id ? 'border-2' : ''
                      } ${variant.stockQuantity <= 0 ? 'bg-gray-100 opacity-50 cursor-not-allowed' : ''}`}
                      style={selectedVariant?.id === variant.id ? { borderColor: primaryColor } : {}}
                    >
                      <span>{variant.name} {variant.stockQuantity <= 5 && `(Only ${variant.stockQuantity} left!)`}</span>
                      <span className="font-bold">{formatPrice(Number(variant.price), currency)}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Modifiers Add-ons Section */}
            {activeCartProduct.addons.map((group) => (
              <div key={group.id} className="mb-6">
                <div className="flex justify-between mb-2">
                  <h4 className="text-xs font-bold text-gray-500 uppercase">{group.name}</h4>
                  <span className="text-[10px] text-gray-400">
                    {group.minSelections > 0 ? `Required (Min ${group.minSelections})` : 'Optional'}
                  </span>
                </div>
                <div className="space-y-2">
                  {group.options.map((addon) => {
                    const isSelected = selectedAddons.some((item) => item.id === addon.id);
                    return (
                      <button
                        key={addon.id}
                        onClick={() => handleAddonClick(addon, group)}
                        className={`w-full border p-3 rounded-lg text-xs text-left flex justify-between ${
                          isSelected ? 'border-2' : ''
                        }`}
                        style={isSelected ? { borderColor: primaryColor } : {}}
                      >
                        <span>{addon.name}</span>
                        <span className="font-bold">+{formatPrice(Number(addon.price), currency)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}

            {/* Total Footer Controls */}
            <div className="border-t pt-4 mt-6 flex justify-between items-center">
              <div className="flex items-center border rounded-full">
                <button
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  className="px-3 py-1 font-bold text-gray-500"
                >
                  -
                </button>
                <span className="px-3 text-sm font-semibold">{quantity}</span>
                <button onClick={() => setQuantity(quantity + 1)} className="px-3 py-1 font-bold text-gray-500">+</button>
              </div>
              <button
                onClick={addToCart}
                className="px-6 py-3 rounded-full text-white font-semibold text-sm shadow-md"
                style={{ backgroundColor: primaryColor }}
              >
                Add to Cart ({formatPrice(calculatedUnitPrice * quantity, currency)})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Persistent Cart Bar */}
      {cart.length > 0 && !cartOpen && (
        <div className="fixed bottom-0 inset-x-0 z-40 px-4 pb-4">
          <button
            onClick={() => setCartOpen(true)}
            className="w-full max-w-md mx-auto flex justify-between items-center px-5 py-4 rounded-2xl text-white font-semibold text-sm shadow-lg"
            style={{ backgroundColor: primaryColor }}
          >
            <span>View cart • {cartItemCount} item{cartItemCount !== 1 ? 's' : ''}</span>
            <span>{formatPrice(cartSubtotal, currency)}</span>
          </button>
        </div>
      )}

      {/* Cart Drawer */}
      {cartOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center">
          <div className="bg-white w-full max-w-md rounded-t-2xl p-6 max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-lg font-bold text-gray-900">Your order</h3>
              <button onClick={() => setCartOpen(false)} className="text-gray-400 hover:text-gray-600 text-xl font-bold">×</button>
            </div>

            {cart.length === 0 ? (
              <p className="text-sm text-gray-500 py-6 text-center">Your cart is empty.</p>
            ) : (
              <>
                <div className="space-y-4 mb-4">
                  {cart.map((item) => (
                    <div key={item.key} className="border rounded-xl p-3">
                      <div className="flex justify-between items-start">
                        <div className="flex-1 pr-2">
                          <p className="font-semibold text-sm text-gray-900">{item.name}</p>
                          <p className="text-xs text-gray-500 mt-1">
                            {[item.variantName, item.sizeName].filter(Boolean).join(' • ')}
                            {item.addons.length > 0 && `${item.variantName || item.sizeName ? ' • ' : ''}+ ${item.addons.map((a) => a.name).join(', ')}`}
                          </p>
                        </div>
                        <span className="font-bold text-sm text-gray-900">
                          {formatPrice(item.unitPrice * item.quantity, currency)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center mt-2">
                        <div className="flex items-center border rounded-full">
                          <button onClick={() => changeLineQuantity(item.key, -1)} className="px-3 py-1 font-bold text-gray-500">-</button>
                          <span className="px-3 text-sm font-semibold">{item.quantity}</span>
                          <button onClick={() => changeLineQuantity(item.key, 1)} className="px-3 py-1 font-bold text-gray-500">+</button>
                        </div>
                        <button onClick={() => removeLine(item.key)} className="text-xs text-red-500 font-semibold">
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <textarea
                  value={specialNotes}
                  onChange={(e) => setSpecialNotes(e.target.value)}
                  placeholder="Special notes for the kitchen (optional)"
                  className="w-full border rounded-xl p-3 text-sm mb-4"
                  rows={2}
                />

                <div className="flex justify-between text-sm py-2 border-t">
                  <span className="text-gray-500">Subtotal</span>
                  <span className="font-bold text-gray-900">{formatPrice(cartSubtotal, currency)}</span>
                </div>
                <p className="text-[11px] text-gray-400 mb-4">Taxes are calculated at checkout. Payment: cash at the counter.</p>

                {checkoutError && (
                  <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl p-3 mb-4">
                    {checkoutError}
                  </div>
                )}

                <button
                  onClick={placeOrder}
                  disabled={submitting}
                  className="w-full py-4 rounded-full text-white font-semibold text-sm shadow-md disabled:opacity-60"
                  style={{ backgroundColor: primaryColor }}
                >
                  {submitting ? 'Placing order…' : `Place order (${formatPrice(cartSubtotal, currency)})`}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
