'use client';
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-function-return-type, curly, no-console */

import React, { useState, useMemo } from 'react';
import Image from 'next/image';

interface ProductSize {
  id: string;
  name: string;
  priceAdjustment: number;
}

interface ProductVariant {
  id: string;
  name: string;
  price: number;
  stockQuantity: number;
}

interface AddonItem {
  id: string;
  name: string;
  price: number;
  isAvailable: boolean;
}

interface ProductAddonGroup {
  id: string;
  name: string;
  minSelections: number;
  maxSelections: number;
  options: AddonItem[];
}

interface Product {
  id: string;
  name: string;
  description: string;
  imageUrl: string | null;
  basePrice: number;
  calories: number | null;
  isAvailable: boolean;
  sizes: ProductSize[];
  variants: ProductVariant[];
  addons: ProductAddonGroup[];
}

interface Category {
  id: string;
  name: string;
  products: Product[];
}

interface MenuBrowserProps {
  categories: Category[];
  primaryColor: string;
}

export const MenuBrowser: React.FC<MenuBrowserProps> = ({ categories, primaryColor }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  const [activeCartProduct, setActiveCartProduct] = useState<Product | null>(null);

  // Cart Configuration States
  const [selectedSize, setSelectedSize] = useState<ProductSize | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(null);
  const [selectedAddons, setSelectedAddons] = useState<AddonItem[]>([]);
  const [quantity, setQuantity] = useState(1);

  // Filter Categories & Products dynamically
  const filteredCategories = useMemo(() => {
    return categories
      .map((category) => {
        const matchingProducts = category.products.filter((product) => {
          const matchesSearch = product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            product.description.toLowerCase().includes(searchQuery.toLowerCase());
          return product.isAvailable && matchesSearch;
        });

        return { ...category, products: matchingProducts };
      })
      .filter((category) => {
        const matchesCategorySelection = selectedCategoryId === 'all' || category.id === selectedCategoryId;
        return matchesCategorySelection && category.products.length > 0;
      });
  }, [categories, searchQuery, selectedCategoryId]);

  // Dynamic Inheritance Pricing Logic per DOC-005 4.3
  const calculatedUnitPrice = useMemo(() => {
    if (!activeCartProduct) return 0;
    
    let base = Number(activeCartProduct.basePrice);

    // Apply Size Adjustment (Condition B)
    if (selectedSize) {
      base += Number(selectedSize.priceAdjustment);
    }

    // Apply Variant Absolute Override (Condition C)
    if (selectedVariant) {
      base = Number(selectedVariant.price);
    }

    // Add selected customizations (Condition D)
    const addonsTotal = selectedAddons.reduce((sum, addon) => sum + Number(addon.price), 0);

    return base + addonsTotal;
  }, [activeCartProduct, selectedSize, selectedVariant, selectedAddons]);

  const handleAddonClick = (addon: AddonItem, group: ProductAddonGroup) => {
    const isActive = selectedAddons.some((item) => item.id === addon.id);
    if (isActive) {
      setSelectedAddons(selectedAddons.filter((item) => item.id !== addon.id));
    } else {
      // Validate Selection Upper Bounds
      const activeGroupSelections = selectedAddons.filter((item) => 
        group.options.some((opt) => opt.id === item.id)
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
                        <p className="text-gray-500 text-xs mt-1 line-clamp-2">{product.description}</p>
                        <span className="text-gray-900 font-bold text-sm block mt-2">
                          ${Number(product.basePrice).toFixed(2)}
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
                      {size.name} (+${Number(size.priceAdjustment).toFixed(2)})
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
                      <span className="font-bold">${Number(variant.price).toFixed(2)}</span>
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
                        <span className="font-bold">+${Number(addon.price).toFixed(2)}</span>
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
                className="px-6 py-3 rounded-full text-white font-semibold text-sm shadow-md"
                style={{ backgroundColor: primaryColor }}
              >
                Add to Cart (${(calculatedUnitPrice * quantity).toFixed(2)})
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
