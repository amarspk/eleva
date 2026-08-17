/**
 * Phase 4 P0 — cashier notification manager unit tests.
 *
 * Verifies the local persistence of volume + pending notifications, the
 * duplicate-suppression invariant, and the acknowledge/open terminating
 * actions without a live Socket.io server (the socket module is mocked).
 */
import {
  CashierNotificationClient,
  loadVolume,
  saveVolume,
  loadPendingNotifications,
  savePendingNotifications,
} from './notification-manager';

// Mock the Socket.io client module so no real connection is attempted.
const emitMock = jest.fn();
const onMock = jest.fn();
const disconnectMock = jest.fn();
const fakeSocket = {
  emit: emitMock,
  on: onMock,
  disconnect: disconnectMock,
  connected: true,
};

jest.mock('socket.io-client', () => ({
  io: jest.fn(() => fakeSocket),
}));

/**
 * In-memory localStorage. The repo's jsdom (jest-fixed-jsdom) does not
 * actually persist across setItem/getItem, so we substitute a working map for
 * these unit tests.
 */
function createMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() { return store.size; },
    clear: () => store.clear(),
    getItem: (k: string) => store.has(k) ? store.get(k)! : null,
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    removeItem: (k: string) => { store.delete(k); },
    setItem: (k: string, v: string) => { store.set(k, String(v)); },
  };
}

describe('notification-manager (Phase 4 P0)', () => {
  const originalLocalStorage = (global as { localStorage?: Storage }).localStorage;

  beforeEach(() => {
    jest.clearAllMocks();
    // Replace jsdom's non-persistent localStorage with an in-memory map.
    (global as { localStorage?: Storage }).localStorage = createMemoryStorage();
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: (global as { localStorage?: Storage }).localStorage,
    });
  });

  afterAll(() => {
    (global as { localStorage?: Storage }).localStorage = originalLocalStorage;
  });

  describe('volume persistence', () => {
    it('defaults to 0.5 when nothing is stored', () => {
      expect(loadVolume()).toBe(0.5);
    });

    it('persists and restores a chosen volume', () => {
      saveVolume(0.8);
      expect(loadVolume()).toBe(0.8);
    });

    it('clamps out-of-range values on save', () => {
      saveVolume(5);
      expect(loadVolume()).toBe(1);
      saveVolume(-1);
      expect(loadVolume()).toBe(0);
    });
  });

  describe('pending notification persistence', () => {
    it('returns an empty array when nothing is stored', () => {
      expect(loadPendingNotifications()).toEqual([]);
    });

    it('round-trips pending notification records', () => {
      const records = [
        {
          orderId: 'order-1',
          orderNumber: 'ORD-2026-1',
          branchId: 'branch-1',
          total: 12.5,
          type: 'DINE_IN',
          status: 'PENDING',
          createdAt: '2026-08-17T00:00:00.000Z',
          acknowledged: false,
        },
      ];
      savePendingNotifications(records);
      expect(loadPendingNotifications()).toEqual(records);
    });
  });

  describe('CashierNotificationClient', () => {
    // Registers the socket event handlers (they are bound inside connect()).
    const makeClient = (onNewOrder: (n: unknown) => void = jest.fn()) => {
      const client = new CashierNotificationClient('http://api', 'token', 'branch-1', onNewOrder as never);
      client.connect();
      return client;
    };

    it('does not add a duplicate notification for the same orderId', () => {
      const onNewOrder = jest.fn();
      const client = makeClient(onNewOrder);

      // Simulate two deliveries of the same order (e.g. reconnect re-delivery)
      const handler = onMock.mock.calls.find((c) => c[0] === 'notification:newOrder')?.[1] as (d: unknown) => void;
      const payload = {
        orderId: 'order-1',
        orderNumber: 'ORD-2026-1',
        branchId: 'branch-1',
        status: 'PENDING',
        total: 10,
        taxAmount: 0,
        subtotal: 10,
        type: 'DINE_IN',
        createdAt: '2026-08-17T00:00:00.000Z',
        customerName: null,
        items: [],
      };
      handler(payload);
      handler(payload);

      expect(onNewOrder).toHaveBeenCalledTimes(1);
      expect(client.unacknowledgedIds.size).toBe(1);
    });

    it('acknowledgeOrder removes the order and stops pending sound when empty', () => {
      const client = makeClient();
      const handler = onMock.mock.calls.find((c) => c[0] === 'notification:newOrder')?.[1] as (d: unknown) => void;
      handler({
        orderId: 'order-1', orderNumber: 'ORD-2026-1', branchId: 'branch-1',
        status: 'PENDING', total: 10, taxAmount: 0, subtotal: 10,
        type: 'DINE_IN', createdAt: '2026-08-17T00:00:00.000Z',
        customerName: null, items: [],
      });

      expect(client.unacknowledgedIds.size).toBe(1);
      client.acknowledgeOrder('order-1');
      expect(client.unacknowledgedIds.size).toBe(0);
    });

    it('openOrder stops the sound for an order while preserving the record (distinct from acknowledge)', () => {
      const client = makeClient();
      const handler = onMock.mock.calls.find((c) => c[0] === 'notification:newOrder')?.[1] as (d: unknown) => void;
      handler({
        orderId: 'order-1', orderNumber: 'ORD-2026-1', branchId: 'branch-1',
        status: 'PENDING', total: 10, taxAmount: 0, subtotal: 10,
        type: 'DINE_IN', createdAt: '2026-08-17T00:00:00.000Z',
        customerName: null, items: [],
      });

      // openOrder clears the pending set (stops sound) but keeps the record
      // so the UI can still show it until a full acknowledge.
      client.openOrder('order-1');
      expect(client.unacknowledgedIds.size).toBe(0);
      expect(client.orderNotifications.has('order-1')).toBe(true);
    });
  });
});
