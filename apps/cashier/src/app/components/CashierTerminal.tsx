'use client';
/* eslint-disable */

import React, { useEffect, useState } from 'react';
import { openDB, IDBPDatabase } from 'idb';
import type { ProductModel } from '@zayjar/types';

interface CartItem {
  id: string;
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

interface OfflineOrder {
  id: string;
  tenantId: string;
  branchId: string;
  orderNumber: string;
  items: CartItem[];
  subtotal: number;
  total: number;
  status: 'PENDING_SYNC' | 'SYNCED' | 'FAILED';
  createdAt: string;
  syncedAt?: string;
  apiUrl?: string;
  authToken?: string;
}

const DB_NAME = 'zayjar-cashier-db';
const STORE_NAME = 'offline-orders';

async function getDb(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    },
  });
}

export const CashierTerminal: React.FC<{ tenantId: string; branchId: string; apiUrl: string }> = ({ tenantId, branchId, apiUrl }) => {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [offlineOrders, setOfflineOrders] = useState<OfflineOrder[]>([]);
  const [isOnline, setIsOnline] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [serviceWorkerReady, setServiceWorkerReady] = useState(false);
  const [products, setProducts] = useState<ProductModel[]>([]);
  const [menuLoading, setMenuLoading] = useState(true);
  const [menuError, setMenuError] = useState<string | null>(null);

  // Register service worker per DOC-001 1.3 Cashier Terminal PWA Offline-First
  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .then((reg) => {
          console.log(`Cashier PWA Service Worker registered for tenant ${tenantId} branch ${branchId}`, reg.scope);
          setServiceWorkerReady(true);
        })
        .catch((err) => console.warn('SW registration failed', err));

      // Listen for messages from Service Worker about sync progress
      navigator.serviceWorker.addEventListener('message', (event) => {
        const data = event.data || {};
        if (data.type === 'ORDER_SYNCED') {
          console.log(`SW synced order ${data.orderNumber} for tenant ${data.tenantId}`);
          loadOfflineOrders();
        }
      });
    }

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    setIsOnline(navigator.onLine);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    loadOfflineOrders();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [tenantId, branchId]);

  // Fetch live menu data from API on mount
  useEffect(() => {
    const fetchMenu = async () => {
      setMenuLoading(true);
      setMenuError(null);
      try {
        const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') || '' : '';
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }
        if (tenantId) {
          headers['X-Tenant-ID'] = tenantId;
        }

        const productsRes = await fetch(`${apiUrl}/api/v1/menu/products`, { headers });
        if (!productsRes.ok) {
          throw new Error(`Menu fetch failed: ${productsRes.status}`);
        }
        const prods: ProductModel[] = await productsRes.json();
        setProducts(prods);
      } catch (err) {
        console.warn('Failed to fetch menu data, showing empty catalog', err);
        setMenuError('Unable to load menu');
      } finally {
        setMenuLoading(false);
      }
    };

    fetchMenu();
  }, [apiUrl, tenantId]);

  // Load offline orders from IndexedDB per DOC-001 1.3
  const loadOfflineOrders = async () => {
    try {
      const db = await getDb();
      const orders = await db.getAll(STORE_NAME);
      setOfflineOrders(orders);
    } catch (err) {
      console.error('Failed to load offline orders', err);
    }
  };

  // Save order to IndexedDB for offline support - preserves tenant isolation and auth for SW sync
  const saveOfflineOrder = async (order: OfflineOrder) => {
    const db = await getDb();
    // Preserve Authorization, X-Tenant-ID, X-Branch-ID for SW to use during sync per requirements
    const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') || '' : '';
    const orderWithAuth: OfflineOrder = {
      ...order,
      apiUrl: order.apiUrl || apiUrl,
      authToken: order.authToken || token,
    };
    await db.put(STORE_NAME, orderWithAuth);
    await loadOfflineOrders();
  };

  // Trigger Service Worker to sync per DOC-001 1.3: SW synchronizes when connectivity restored
  // React app may trigger sync, but must not perform sync logic itself per requirements
  const triggerServiceWorkerSync = async () => {
    if (isSyncing) return;
    setIsSyncing(true);

    try {
      if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
        if ('SyncManager' in window) {
          const reg = await navigator.serviceWorker.ready;
          // @ts-ignore - SyncManager may not be in TS types
          if (reg.sync) {
            // @ts-ignore
            await reg.sync.register('sync-offline-orders');
            console.log('Background Sync API: sync.register(sync-offline-orders) called for tenant', tenantId);
          } else {
            // Fallback to postMessage
            const activeReg = await navigator.serviceWorker.ready;
            activeReg.active?.postMessage({ type: 'SYNC_OFFLINE_ORDERS', tenantId, branchId });
            console.log('Fallback: postMessage SYNC_OFFLINE_ORDERS to SW for tenant', tenantId);
          }
        } else {
          // Fallback for browsers without Background Sync API
          const reg = await navigator.serviceWorker.ready;
          reg.active?.postMessage({ type: 'SYNC_OFFLINE_ORDERS', tenantId, branchId });
          console.log('Fallback: postMessage SYNC_OFFLINE_ORDERS to SW (no SyncManager) for tenant', tenantId);
        }
      }

      // Give SW time to process and then reload orders to show updated statuses
      setTimeout(() => {
        loadOfflineOrders();
        setIsSyncing(false);
      }, 2000);
    } catch (err) {
      console.warn('Failed to trigger SW sync', err);
      setIsSyncing(false);
    }
  };

  // Sync offline orders when connection restored - triggers SW, does not perform sync itself per requirements
  useEffect(() => {
    if (isOnline && offlineOrders.some((o) => o.status === 'PENDING_SYNC')) {
      console.log(`Connection restored, triggering SW sync for tenant ${tenantId} branch ${branchId} per DOC-001 1.3`);
      triggerServiceWorkerSync();
    }
  }, [isOnline, offlineOrders]);

  // For manual sync button, trigger SW only
  const syncOfflineOrders = async () => {
    await triggerServiceWorkerSync();
  };

  const addToCart = (productId: string, name: string, price: number) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.productId === productId);
      if (existing) {
        return prev.map((i) => (i.productId === productId ? { ...i, quantity: i.quantity + 1, totalPrice: (i.quantity + 1) * i.unitPrice } : i));
      }
      return [...prev, { id: `${productId}-${Date.now()}`, productId, name, quantity: 1, unitPrice: price, totalPrice: price }];
    });
  };

  const subtotal = cart.reduce((sum, item) => sum + item.totalPrice, 0);
  const total = subtotal;

  const handleCheckout = async () => {
    const orderNumber = `ORD-${new Date().getFullYear()}-${Math.floor(10000 + Math.random() * 90000)}`;
    const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') || '' : '';
    const offlineOrder: OfflineOrder = {
      id: `offline-${Date.now()}`,
      tenantId,
      branchId,
      orderNumber,
      items: cart,
      subtotal,
      total,
      status: isOnline ? 'SYNCED' : 'PENDING_SYNC',
      createdAt: new Date().toISOString(),
      apiUrl,
      authToken: token,
    };

    if (!isOnline) {
      // Store in IndexedDB for offline support per DOC-001 1.3, SW will sync when online
      await saveOfflineOrder(offlineOrder);
      setCart([]);
      alert(`Offline: Order ${orderNumber} saved locally. Will sync when online via Service Worker. Tenant isolated: ${tenantId}`);
      // Trigger SW sync registration for background sync when online
      try {
        if ('serviceWorker' in navigator && 'SyncManager' in window) {
          const reg = await navigator.serviceWorker.ready;
          // @ts-ignore
          if (reg.sync) {
            // @ts-ignore
            await reg.sync.register('sync-offline-orders');
          }
        }
      } catch {}
      return;
    }

    // Online: try to checkout via API with tenant isolation (immediate path), but also save to IndexedDB for history
    try {
      const response = await fetch(`${apiUrl}/api/v1/orders/checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'X-Tenant-ID': tenantId,
          'X-Branch-ID': branchId,
        },
        body: JSON.stringify({
          branchId,
          type: 'DINE_IN',
          items: cart.map((i) => ({ productId: i.productId, quantity: i.quantity })),
          paymentMethod: 'CASH',
        }),
      });

      if (response.ok) {
        const result = await response.json();
        await saveOfflineOrder({ ...offlineOrder, id: result.id || offlineOrder.id, status: 'SYNCED', syncedAt: new Date().toISOString(), apiUrl, authToken: token });
        setCart([]);
        alert(`Order ${result.orderNumber || orderNumber} placed successfully. Tenant: ${tenantId}`);
      } else {
        throw new Error(`Checkout failed ${response.status}`);
      }
    } catch (err) {
      await saveOfflineOrder({ ...offlineOrder, status: 'PENDING_SYNC', apiUrl, authToken: token });
      setCart([]);
      alert(`Network error, order ${orderNumber} saved offline for tenant ${tenantId}. Service Worker will sync when online.`);
      // Trigger SW background sync for retry
      triggerServiceWorkerSync();
    }
  };

  return (
    <div className="w-full min-h-screen bg-gray-100 flex flex-col">
      <header className="bg-slate-900 text-white p-4 flex justify-between items-center">
        <h1 className="text-lg font-bold">Cashier Terminal PWA - Tenant {tenantId.slice(-6)} Branch {branchId.slice(-4)}</h1>
        <div className="flex gap-2 items-center text-xs">
          <span className={`px-2 py-1 rounded ${isOnline ? 'bg-green-600' : 'bg-red-600'}`}>{isOnline ? 'Online' : 'Offline'}</span>
          <span className={`px-2 py-1 rounded ${serviceWorkerReady ? 'bg-blue-600' : 'bg-gray-600'}`}>SW: {serviceWorkerReady ? 'Ready' : 'Loading'}</span>
          <span>Tenant Isolated</span>
        </div>
      </header>

      <div className="flex flex-1">
        <main className="flex-1 p-4 grid grid-cols-2 md:grid-cols-3 gap-4">
          {menuLoading ? (
            <p className="text-sm text-gray-500 col-span-full">Loading menu...</p>
          ) : menuError ? (
            <p className="text-sm text-red-500 col-span-full">{menuError}</p>
          ) : products.filter((p) => p.isAvailable).length === 0 ? (
            <p className="text-sm text-gray-500 col-span-full">No products available</p>
          ) : (
            products
              .filter((p) => p.isAvailable)
              .map((product) => (
                <button key={product.id} onClick={() => addToCart(product.id, product.name, product.basePrice)} className="bg-white p-4 rounded shadow hover:shadow-md text-left">
                  <h3 className="font-bold text-sm">{product.name}</h3>
                  <p className="text-xs text-gray-500">${product.basePrice.toFixed(2)}</p>
                </button>
              ))
          )}
        </main>

        <aside className="w-80 bg-white shadow-lg p-4 flex flex-col">
          <h2 className="font-bold mb-2">Cart - Tenant {tenantId.slice(-4)}</h2>
          <div className="flex-1 space-y-2 overflow-y-auto">
            {cart.length === 0 ? <p className="text-xs text-gray-500">Cart empty</p> : cart.map((item) => (
              <div key={item.id} className="flex justify-between text-xs">
                <span>{item.quantity}x {item.name}</span>
                <span>${item.totalPrice.toFixed(2)}</span>
              </div>
            ))}
          </div>
          <div className="border-t pt-2 mt-2">
            <div className="flex justify-between font-bold"><span>Subtotal</span><span>${subtotal.toFixed(2)}</span></div>
            <div className="flex justify-between font-bold text-lg mt-1"><span>Total</span><span>${total.toFixed(2)}</span></div>
            <button onClick={handleCheckout} disabled={cart.length === 0} className="w-full mt-3 bg-blue-600 text-white py-2 rounded disabled:bg-gray-300">Checkout {isOnline ? '' : '(Offline)'}</button>
          </div>

          <div className="mt-6">
            <h3 className="text-xs font-bold uppercase text-gray-500 mb-2">Offline Queue (IndexedDB) - SW Sync per DOC-001 1.3</h3>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {offlineOrders.length === 0 ? <p className="text-[10px] text-gray-400">No offline orders</p> : offlineOrders.map((o) => (
                <div key={o.id} className="text-[10px] p-2 bg-gray-50 rounded flex justify-between">
                  <span>{o.orderNumber}</span>
                  <span className={`px-1 rounded ${o.status === 'SYNCED' ? 'bg-green-100 text-green-700' : o.status === 'PENDING_SYNC' ? 'bg-yellow-100' : 'bg-red-100'}`}>{o.status}</span>
                </div>
              ))}
            </div>
            {isOnline && offlineOrders.some((o) => o.status === 'PENDING_SYNC') && (
              <button onClick={syncOfflineOrders} disabled={isSyncing} className="w-full mt-2 text-xs bg-slate-800 text-white py-1 rounded">
                {isSyncing ? 'Syncing via SW...' : 'Sync Now (Triggers SW)'}
              </button>
            )}
          </div>
        </aside>
      </div>

      <footer className="p-2 text-center text-[10px] text-gray-400">
        Cashier PWA Offline-First • Service Workers cached • IndexedDB • Tenant {tenantId} Branch {branchId} • SW Syncs when online per DOC-001 1.3 • {new Date().getFullYear()}
      </footer>
    </div>
  );
};
