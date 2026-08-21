'use client';
/* eslint-disable @typescript-eslint/explicit-function-return-type, curly */

import React, { useMemo, useState, useRef, useCallback, useEffect } from 'react';
import Image from 'next/image';
import {
  CartItem,
  CreateGuestOrderPayload,
  GuestOrderConfirmation,
  PublicAddonOption,
  PublicCategory,
  PublicMenuResponse,
  PublicProduct,
  PublicAddonGroup,
  PublicProductSize,
  PublicProductVariant,
} from '../lib/types';
import { computeCartItemCount, computeCartSubtotal, computeUnitPrice, cartItemKey } from '../lib/pricing';
import { buildCheckoutPayload, submitGuestOrder } from '../lib/guest-api';
import { getCustomerToken, checkWelcomeEligibility } from '../lib/customer-api';
import { resolveSectionProducts } from '../lib/design-sections';
import type { DesignSection, TenantDesignPayload } from '../lib/design-sections';
import { formatPrice } from '../lib/format';

type AddonGroup = PublicAddonGroup;
type Size = PublicProductSize;
type Variant = PublicProductVariant;

interface MenuBrowserProps {
  initialData: PublicMenuResponse;
  token: string;
}

const ProductGrid = React.memo(function ProductGrid({
  categories,
  primaryColor,
  currency,
  onSelect,
}: {
  categories: PublicMenuResponse['categories'];
  primaryColor: string;
  currency: string;
  onSelect: (p: PublicProduct) => void;
}) {
  let globalProductIndex = 0;
  return (
    <>
      {categories.map((category) => (
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
                  onClick={() => onSelect(product)}
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
      ))}
    </>
  );
});


function DesignSections({ design, categories, primaryColor, currency, onSelect, tenantName, coverImage }: { design: TenantDesignPayload | null; categories: PublicCategory[]; primaryColor: string; currency: string; onSelect: (p: PublicProduct) => void; tenantName: string; coverImage?: string }) {
  const sections: DesignSection[] = design?.sections ? [...design.sections].sort((a: DesignSection, b: DesignSection) => (a.order ?? 0) - (b.order ?? 0)).filter((s: DesignSection) => s.enabled) : [];
  const flatProducts: PublicProduct[] = categories.flatMap((c: PublicCategory) => c.products);
  // fallback when no design or no sections: render default grid
  if (sections.length === 0) {
    return <main className="px-4 py-4 space-y-8"><ProductGrid categories={categories} primaryColor={primaryColor} currency={currency} onSelect={onSelect} /></main>;
  }
  return (
    <main className="px-4 py-4 space-y-4">
      {sections.map((sec: DesignSection) => {
        const v = sec.config?.variant || 'grid';
        if (sec.type==='hero') {
          if (v==='full-width') return <div key={sec.id} className="h-40 rounded-xl flex items-center justify-center text-white font-bold" style={{ backgroundColor: primaryColor, backgroundImage: coverImage?`url(${coverImage})`:undefined, backgroundSize:'cover' }}><span style={{textShadow:'0 1px 4px rgba(0,0,0,0.6)'}}>{tenantName}</span></div>;
          if (v==='text-overlay') return <div key={sec.id} className="h-40 rounded-xl relative overflow-hidden"><div className="absolute inset-0 bg-black/40"/><img src={coverImage||''} alt="hero" className="w-full h-full object-cover"/><div className="absolute inset-0 flex items-center justify-center text-white font-bold">{tenantName}</div></div>;
          if (v==='image-left') return <div key={sec.id} className="rounded-xl flex gap-3 bg-white p-3 border"><img src={coverImage||''} alt="hero" className="w-1/2 h-32 object-cover rounded-lg"/><div className="flex-1 flex flex-col justify-center"><div className="font-bold">{tenantName}</div><div className="text-xs text-gray-500">Welcome — order from your table</div></div></div>;
          if (v==='image-top') return <div key={sec.id} className="rounded-xl bg-white border overflow-hidden"><img src={coverImage||''} alt="hero" className="w-full h-32 object-cover"/><div className="p-3 font-bold text-center">{tenantName}</div></div>;
          return <div key={sec.id} className="rounded-xl bg-white border p-4 flex gap-4"><div className="flex-1"><div className="font-bold">{tenantName}</div><div className="text-xs text-gray-500">Welcome</div></div><img src={coverImage||''} alt="hero" className="w-24 h-24 object-cover rounded-lg"/></div>;
        }
        if (sec.type==='categories') {
          if (v==='circular') return <div key={sec.id} className="flex gap-3 overflow-x-auto pb-2">{categories.map((c: PublicCategory) => <div key={c.id} className="flex flex-col items-center shrink-0"><div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center text-[10px] border">{c.name.slice(0,3)}</div><span className="text-[10px] mt-1">{c.name}</span></div>)}</div>;
          if (v==='grid') return <div key={sec.id} className="grid grid-cols-2 gap-2">{categories.map((c: PublicCategory) => <div key={c.id} className="bg-white border rounded-xl p-3 text-center text-sm font-semibold">{c.name}<div className="text-xs text-gray-400">{c.products.length} items</div></div>)}</div>;
          if (v==='horizontal') return <div key={sec.id} className="flex gap-2 overflow-x-auto pb-2">{categories.map((c: PublicCategory) => <div key={c.id} className="shrink-0 bg-white border rounded-full px-4 py-2 text-xs font-semibold whitespace-nowrap">{c.name}</div>)}</div>;
          if (v==='sidebar') return <div key={sec.id} className="flex gap-3"><div className="w-28 bg-white border rounded-xl p-2 space-y-1 shrink-0">{categories.map((c: PublicCategory) => <div key={c.id} className="text-xs py-1 border-b last:border-0">{c.name}</div>)}</div><div className="flex-1 text-xs text-gray-500 p-3">Select a category to browse</div></div>;
          if (v==='image-based') return <div key={sec.id} className="grid grid-cols-2 gap-2">{categories.map((c: PublicCategory) => <div key={c.id} className="bg-white border rounded-xl overflow-hidden"><div className="h-16 bg-gray-100"/><div className="p-2 text-xs font-semibold">{c.name}</div></div>)}</div>;
          return <div key={sec.id} className="flex gap-2 overflow-x-auto pb-2">{categories.map((c: PublicCategory) => <button key={c.id} className="shrink-0 px-3 py-1 rounded-full text-xs font-semibold border">{c.name}</button>)}</div>;
        }
        if (sec.type==='featured' || sec.type==='popular') {
          // CTO decision 2026-08-10 (§14 #26): explicit config.productIds
          // selection, order-preserving; legacy slice fallback only for
          // designs published before the decision.
          const prods = resolveSectionProducts(sec, flatProducts);
          if (v==='list') return <div key={sec.id} className="space-y-2"><div className="text-sm font-bold capitalize">{sec.type}</div>{prods.map((pr: PublicProduct) => <div key={pr.id} onClick={()=>onSelect(pr)} className="bg-white border rounded-xl p-3 flex gap-3 cursor-pointer"><img src={pr.imageUrl||''} alt="" className="w-12 h-12 rounded bg-gray-100 object-cover"/><div className="flex-1"><div className="text-sm font-semibold">{pr.name}</div><div className="text-xs text-gray-500">{pr.description?.slice(0,40)}</div><div className="text-xs font-bold">{formatPrice(Number(pr.basePrice),currency)}</div></div></div>)}</div>;
          if (v==='large-cards') return <div key={sec.id}><div className="text-sm font-bold capitalize mb-2">{sec.type}</div><div className="grid gap-3">{prods.map((pr: PublicProduct) => <div key={pr.id} onClick={()=>onSelect(pr)} className="bg-white border rounded-xl p-4 cursor-pointer"><div className="h-28 bg-gray-100 rounded-lg mb-2"/><div className="font-semibold text-sm">{pr.name}</div><div className="text-xs text-gray-500 line-clamp-2">{pr.description}</div><div className="font-bold mt-1">{formatPrice(Number(pr.basePrice),currency)}</div></div>)}</div></div>;
          if (v==='compact') return <div key={sec.id}><div className="text-sm font-bold capitalize mb-2">{sec.type}</div><div className="grid grid-cols-3 gap-2">{prods.map((pr: PublicProduct) => <div key={pr.id} onClick={()=>onSelect(pr)} className="bg-white border rounded-lg p-2 cursor-pointer text-center"><div className="h-12 bg-gray-100 rounded mb-1"/><div className="text-[11px] font-semibold line-clamp-1">{pr.name}</div><div className="text-[10px] font-bold">{formatPrice(Number(pr.basePrice),currency)}</div></div>)}</div></div>;
          if (v==='slider') return <div key={sec.id}><div className="text-sm font-bold capitalize mb-2">{sec.type}</div><div className="flex gap-3 overflow-x-auto pb-2">{prods.map((pr: PublicProduct) => <div key={pr.id} onClick={()=>onSelect(pr)} className="shrink-0 w-32 bg-white border rounded-xl p-3 cursor-pointer"><div className="h-16 bg-gray-100 rounded mb-2"/><div className="text-xs font-semibold line-clamp-1">{pr.name}</div><div className="text-xs font-bold">{formatPrice(Number(pr.basePrice),currency)}</div></div>)}</div></div>;
          if (v==='cards') return <div key={sec.id}><div className="text-sm font-bold capitalize mb-2">{sec.type}</div><div className="grid grid-cols-2 gap-3">{prods.map((pr: PublicProduct) => <div key={pr.id} onClick={()=>onSelect(pr)} className="bg-white border rounded-xl p-3 cursor-pointer shadow-sm"><div className="h-20 bg-gray-100 rounded-lg mb-2"/><div className="text-sm font-semibold">{pr.name}</div><div className="text-xs font-bold">{formatPrice(Number(pr.basePrice),currency)}</div></div>)}</div></div>;
          return <div key={sec.id} data-testid={`${sec.type}-section`}><div className="text-sm font-bold capitalize mb-2">{sec.type}</div><div className="grid grid-cols-2 gap-2">{prods.map((pr: PublicProduct) => <div key={pr.id} onClick={()=>onSelect(pr)} className="bg-white border rounded-xl p-3 cursor-pointer"><div className="text-sm font-semibold line-clamp-1">{pr.name}</div><div className="text-xs text-gray-500 line-clamp-1">{pr.description}</div><div className="text-xs font-bold mt-1">{formatPrice(Number(pr.basePrice),currency)}</div></div>)}</div></div>;
        }
        if (sec.type==='banner' || sec.type==='promo') {
          if (v==='split') return <div key={sec.id} className="rounded-xl bg-gradient-to-r from-orange-100 to-pink-100 p-4 flex justify-between items-center"><span className="font-bold text-sm">Special Offer</span><span className="bg-black text-white px-3 py-1 rounded-full text-xs">Order now</span></div>;
          if (v==='text-overlay') return <div key={sec.id} className="h-24 rounded-xl bg-black text-white flex items-center justify-center font-bold relative overflow-hidden"><div className="absolute inset-0 bg-gradient-to-r from-orange-500/30 to-pink-500/30"/><span className="relative">Limited time — 20% off</span></div>;
          return <div key={sec.id} className="h-20 rounded-xl bg-gradient-to-r from-orange-400 to-pink-500 flex items-center justify-center text-white font-bold">Banner — {v}</div>;
        }
        return null;
      })}
      {/* Curated sections are promotional views, not a replacement catalog. Keep
          every active tenant product reachable through the filtered full menu. */}
      <ProductGrid categories={categories} primaryColor={primaryColor} currency={currency} onSelect={onSelect} />
    </main>
  );
}

export const MenuBrowser: React.FC<MenuBrowserProps> = ({ initialData, token }) => {
  const categories = initialData.categories;
  const design = (initialData.design ?? null) as TenantDesignPayload | null;
  const primaryColor = (design?.colors?.primary as string) || initialData.tenant.primaryColor;
  const currency = initialData.restaurant.currency;

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  const [activeCartProduct, setActiveCartProduct] = useState<PublicProduct | null>(null);
  const [selectedSize, setSelectedSize] = useState<Size | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<Variant | null>(null);
  const [selectedAddons, setSelectedAddons] = useState<PublicAddonOption[]>([]);
  const [quantity, setQuantity] = useState(1);

  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [specialNotes, setSpecialNotes] = useState('');
  const [isPreorder, setIsPreorder] = useState(false);
  const [scheduledAt, setScheduledAt] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [, setWelcomeOffer] = useState<{discountType:string;discountValue:number;minOrderAmount:number} | null>(null);
  const [welcomeChecked, setWelcomeChecked] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<GuestOrderConfirmation | null>(null);

  const scrollYRef = useRef(0);

  useEffect(() => {
    if (!getCustomerToken() || welcomeChecked) return;
    (async () => {
      try {
        const r = await checkWelcomeEligibility();
        if (r.eligible && r.offer) setWelcomeOffer(r.offer);
      } catch {
        /* not eligible */
      }
      setWelcomeChecked(true);
    })();
  }, [welcomeChecked]);

  const openCart = useCallback(() => {
    scrollYRef.current = window.scrollY;
    setCartOpen(true);
  }, []);
  const closeCart = useCallback(() => {
    setCartOpen(false);
    // restore scroll without jump — requestAnimationFrame ensures paint after drawer unmount
    const y = scrollYRef.current;
    requestAnimationFrame(() => {
      window.scrollTo({ top: y, behavior: 'instant' as ScrollBehavior });
    });
  }, []);
  const openProduct = useCallback((p: PublicProduct) => {
    scrollYRef.current = window.scrollY;
    setActiveCartProduct(p);
  }, []);
  const closeProduct = useCallback(() => {
    const y = scrollYRef.current;
    setActiveCartProduct(null);
    setSelectedSize(null);
    setSelectedVariant(null);
    setSelectedAddons([]);
    setQuantity(1);
    requestAnimationFrame(() => window.scrollTo({ top: y, behavior: 'instant' as ScrollBehavior }));
  }, []);

  // Prevent body scroll lock jump — use overscroll contain instead of overflow hidden
  useEffect(() => {
    if (cartOpen || activeCartProduct) {
      document.body.style.overscrollBehavior = 'contain';
    } else {
      document.body.style.overscrollBehavior = '';
    }
    return () => { document.body.style.overscrollBehavior = ''; };
  }, [cartOpen, activeCartProduct]);

  const filteredCategories = useMemo(() => {
    return categories
      .map((category) => {
        const matchingProducts = category.products.filter((product) => {
          const description = product.description ?? '';
          const matchesSearch =
            product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
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

  const calculatedUnitPrice = useMemo(() => {
    if (!activeCartProduct) return 0;
    return computeUnitPrice(activeCartProduct, selectedSize, selectedVariant, selectedAddons);
  }, [activeCartProduct, selectedSize, selectedVariant, selectedAddons]);

  /* design: use published only — draft never leaks to public */
  const cartSubtotal = useMemo(() => computeCartSubtotal(cart), [cart]);
  const cartItemCount = useMemo(() => computeCartItemCount(cart), [cart]);

  const handleAddonClick = (addon: PublicAddonOption, group: AddonGroup) => {
    const isActive = selectedAddons.some((item) => item.id === addon.id);
    if (isActive) {
      setSelectedAddons(selectedAddons.filter((item) => item.id !== addon.id));
    } else {
      const activeGroupSelections = selectedAddons.filter((item) =>
        group.options.some((opt) => opt.id === item.id),
      );
      if (activeGroupSelections.length < group.maxSelections) {
        setSelectedAddons([...selectedAddons, addon]);
      } else if (group.maxSelections === 1 && activeGroupSelections.length === 1) {
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
    // single state update — no second setState that causes extra paint
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
    // keep scroll position after modal close
    requestAnimationFrame(() => window.scrollTo({ top: scrollYRef.current, behavior: 'instant' as ScrollBehavior }));
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
      const payload: CreateGuestOrderPayload = buildCheckoutPayload(cart, {
        qrCodeToken: token,
        branchId: initialData.branch.id,
        paymentMethod: 'CASH',
        specialNotes,
      });
      if (isPreorder && scheduledAt) { payload.isPreorder = true; payload.scheduledAt = new Date(scheduledAt).toISOString(); }
      const result = await submitGuestOrder(payload);
      setConfirmation(result);
      // atomic reset — single paint
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

  if (confirmation) {
    return (
      <div className="w-full max-w-md mx-auto bg-gray-50 min-h-screen pb-24 px-4 pt-16 text-center">
        <div className="bg-white rounded-2xl shadow-sm p-6">
          <div className="text-4xl mb-3" aria-hidden>✅</div>
          <h2 className="text-lg font-bold text-gray-900 mb-1">Order received</h2>
          <p className="text-sm text-gray-600 mb-4">Your order was sent to the kitchen. Pay at the counter when you are ready.</p>
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
      {/* Phase 4 — customer account entry (floating, restaurant-branded) */}
      <a
        href="/account"
        className="fixed top-3 right-3 z-40 inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold text-white shadow-md"
        style={{ backgroundColor: primaryColor }}
        aria-label="My account"
      >
        <span aria-hidden>👤</span> My account
      </a>
      <header className="sticky top-0 bg-white shadow-sm z-30 px-4 py-3">
        {design?.logo && <img src={design.logo} alt="logo" className="h-8 mb-2 object-contain" />}
        <input
          type="text"
          placeholder="Search menu items..."
          className="w-full px-4 py-2 border rounded-full text-sm bg-gray-100 focus:outline-none focus:ring-2 focus:ring-offset-2"
          style={{ ['--tw-ring-color' as string]: primaryColor } as React.CSSProperties}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <div className="flex gap-2 overflow-x-auto py-2 scrollbar-none mt-2">
          <button
            onClick={() => setSelectedCategoryId('all')}
            className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${selectedCategoryId === 'all' ? 'text-white' : 'bg-gray-100 text-gray-700'}`}
            style={selectedCategoryId === 'all' ? { backgroundColor: primaryColor } : {}}
          >
            All
          </button>
          {categories.map((category) => (
            <button
              key={category.id}
              onClick={() => setSelectedCategoryId(category.id)}
              className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${selectedCategoryId === category.id ? 'text-white' : 'bg-gray-100 text-gray-700'}`}
              style={selectedCategoryId === category.id ? { backgroundColor: primaryColor } : {}}
            >
              {category.name}
            </button>
          ))}
        </div>
      </header>

      {/* Design-driven public sections (published only) */}
      <DesignSections design={design} categories={filteredCategories} primaryColor={primaryColor} currency={currency} onSelect={openProduct} tenantName={initialData.tenant.name} coverImage={design?.coverImage as string | undefined} />

      {activeCartProduct && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center" onClick={closeProduct}>
          <div
            className="bg-white w-full max-w-md rounded-t-2xl p-6 max-h-[65vh] overflow-y-auto shadow-2xl"
            style={{ overscrollBehavior: 'contain' } as React.CSSProperties}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-lg font-bold text-gray-900">{activeCartProduct.name}</h3>
              <button onClick={closeProduct} className="text-gray-400 hover:text-gray-600 text-xl font-bold">×</button>
            </div>
            {activeCartProduct.sizes.length > 0 && (
              <div className="mb-6">
                <h4 className="text-xs font-bold text-gray-500 uppercase mb-2">Select Size</h4>
                <div className="grid grid-cols-3 gap-2">
                  {activeCartProduct.sizes.map((size) => (
                    <button
                      key={size.id}
                      onClick={() => { setSelectedSize(size); setSelectedVariant(null); }}
                      className={`border p-2 rounded-lg text-xs font-semibold text-center ${selectedSize?.id === size.id ? 'border-2 text-gray-900' : 'text-gray-600'}`}
                      style={selectedSize?.id === size.id ? { borderColor: primaryColor } : {}}
                    >
                      {size.name} (+{formatPrice(Number(size.priceAdjustment), currency)})
                    </button>
                  ))}
                </div>
              </div>
            )}
            {activeCartProduct.variants.length > 0 && (
              <div className="mb-6">
                <h4 className="text-xs font-bold text-gray-500 uppercase mb-2">Select Variant</h4>
                <div className="space-y-2">
                  {activeCartProduct.variants.map((variant) => (
                    <button
                      key={variant.id}
                      disabled={variant.stockQuantity <= 0}
                      onClick={() => { setSelectedVariant(variant); setSelectedSize(null); }}
                      className={`w-full border p-3 rounded-lg text-xs font-semibold text-left flex justify-between ${selectedVariant?.id === variant.id ? 'border-2' : ''} ${variant.stockQuantity <= 0 ? 'bg-gray-100 opacity-50 cursor-not-allowed' : ''}`}
                      style={selectedVariant?.id === variant.id ? { borderColor: primaryColor } : {}}
                    >
                      <span>{variant.name} {variant.stockQuantity <= 5 && `(Only ${variant.stockQuantity} left!)`}</span>
                      <span className="font-bold">{formatPrice(Number(variant.price), currency)}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {activeCartProduct.addons.map((group) => (
              <div key={group.id} className="mb-6">
                <div className="flex justify-between mb-2">
                  <h4 className="text-xs font-bold text-gray-500 uppercase">{group.name}</h4>
                  <span className="text-[10px] text-gray-400">{group.minSelections > 0 ? `Required (Min ${group.minSelections})` : 'Optional'}</span>
                </div>
                <div className="space-y-2">
                  {group.options.map((addon) => {
                    const isSelected = selectedAddons.some((item) => item.id === addon.id);
                    return (
                      <button
                        key={addon.id}
                        onClick={() => handleAddonClick(addon, group)}
                        className={`w-full border p-3 rounded-lg text-xs text-left flex justify-between ${isSelected ? 'border-2' : ''}`}
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
            <div className="border-t pt-4 mt-6 flex justify-between items-center">
              <div className="flex items-center border rounded-full">
                <button onClick={() => setQuantity(Math.max(1, quantity - 1))} className="px-3 py-1 font-bold text-gray-500">-</button>
                <span className="px-3 text-sm font-semibold">{quantity}</span>
                <button onClick={() => setQuantity(quantity + 1)} className="px-3 py-1 font-bold text-gray-500">+</button>
              </div>
              <button onClick={addToCart} className="px-6 py-3 rounded-full text-white font-semibold text-sm shadow-md" style={{ backgroundColor: primaryColor }}>
                Add to Cart ({formatPrice(calculatedUnitPrice * quantity, currency)})
              </button>
            </div>
          </div>
        </div>
      )}

      {cart.length > 0 && !cartOpen && (
        <div className="fixed bottom-0 inset-x-0 z-40 px-4 pb-4 pointer-events-none">
          <button
            onClick={openCart}
            className="pointer-events-auto w-full max-w-md mx-auto flex justify-between items-center px-5 py-4 rounded-2xl text-white font-semibold text-sm shadow-lg transition-transform active:scale-[0.98]"
            style={{ backgroundColor: primaryColor }}
          >
            <span>View cart • {cartItemCount} item{cartItemCount !== 1 ? 's' : ''}</span>
            <span>{formatPrice(cartSubtotal, currency)}</span>
          </button>
        </div>
      )}

      {cartOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center" onClick={closeCart}>
          <div
            className="bg-white w-full max-w-md rounded-t-2xl p-6 max-h-[65vh] overflow-y-auto shadow-2xl"
            style={{ overscrollBehavior: 'contain' } as React.CSSProperties}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-lg font-bold text-gray-900">Your order</h3>
              <button onClick={closeCart} className="text-gray-400 hover:text-gray-600 text-xl font-bold">×</button>
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
                        <span className="font-bold text-sm text-gray-900">{formatPrice(item.unitPrice * item.quantity, currency)}</span>
                      </div>
                      <div className="flex justify-between items-center mt-2">
                        <div className="flex items-center border rounded-full">
                          <button onClick={() => changeLineQuantity(item.key, -1)} className="px-3 py-1 font-bold text-gray-500">-</button>
                          <span className="px-3 text-sm font-semibold">{item.quantity}</span>
                          <button onClick={() => changeLineQuantity(item.key, 1)} className="px-3 py-1 font-bold text-gray-500">+</button>
                        </div>
                        <button onClick={() => removeLine(item.key)} className="text-xs text-red-500 font-semibold">Remove</button>
                      </div>
                    </div>
                  ))}
                </div>
                <label className="flex items-center gap-2 text-xs mb-2"><input type="checkbox" checked={isPreorder} onChange={e=>setIsPreorder(e.target.checked)}/> Pre-order (schedule for later)</label>
                {isPreorder && <input type="datetime-local" value={scheduledAt} onChange={e=>setScheduledAt(e.target.value)} className="w-full border rounded-xl p-3 text-sm mb-2" />}
                <textarea value={specialNotes} onChange={(e) => setSpecialNotes(e.target.value)} placeholder="Special notes for the kitchen (optional)" className="w-full border rounded-xl p-3 text-sm mb-4" rows={2} />
                <div className="flex justify-between text-sm py-2 border-t">
                  <span className="text-gray-500">Subtotal</span>
                  <span className="font-bold text-gray-900">{formatPrice(cartSubtotal, currency)}</span>
                </div>
                <p className="text-[11px] text-gray-400 mb-4">Taxes are calculated at checkout. Payment: cash at the counter.</p>
                {checkoutError && <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl p-3 mb-4">{checkoutError}</div>}
                <button onClick={placeOrder} disabled={submitting} className="w-full py-4 rounded-full text-white font-semibold text-sm shadow-md disabled:opacity-60" style={{ backgroundColor: primaryColor }}>
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
