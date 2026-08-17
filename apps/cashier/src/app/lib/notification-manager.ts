/**
 * Cashier notification manager — Phase 4 P0.
 *
 * Manages the Socket.io connection to the API's KDS gateway, receives
 * real-time new-order notifications, maintains a set of unacknowledged
 * orders, plays a persistent notification sound, and exposes volume control.
 *
 * Design decisions:
 *   - Sound uses the Web Audio API (OscillatorNode) so no external audio
 *     file is needed and volume is directly controllable.
 *   - The unacknowledged set is in-memory AND mirrored to localStorage so it
 *     survives a normal page reload (per-device preference, consistent with
 *     the cashier PWA's existing offline-first model — volume is already
 *     persisted the same way, and offline orders use IndexedDB).
 *   - The notification sound loops (a two-tone chime) while there are
 *     unacknowledged orders. It stops when the caller signals a terminating
 *     action via `acknowledgeOrder(orderId)` or `openOrder(orderId)`.
 */

/* eslint-disable */
import { io, Socket } from 'socket.io-client';

/** Shape of the server-pushed cashier notification. */
export interface CashierNewOrderNotification {
  orderId: string;
  orderNumber: string;
  branchId: string;
  status: string;
  total: number;
  taxAmount: number;
  subtotal: number;
  type: string;
  createdAt: string;
  customerName: string | null;
  items: Array<{ name: string; quantity: number }>;
}

export type TerminatingAction = 'acknowledged' | 'opened' | 'accepted' | 'cancelled';

/** Default volume (0.0–1.0). 0.5 is a reasonable default for a restaurant. */
const DEFAULT_VOLUME = 0.5;
const VOLUME_STORAGE_KEY = 'zayjar:cashier:notificationVolume';
/** Persisted unacknowledged notification metadata (survives page reloads). */
const PENDING_STORAGE_KEY = 'zayjar:cashier:pendingNotifications';

interface PendingNotificationRecord {
  orderId: string;
  orderNumber: string;
  branchId: string;
  total: number;
  type: string;
  status: string;
  createdAt: string;
  acknowledged: boolean;
}

/**
 * Returns the persisted volume preference, or the default.
 */
export function loadVolume(): number {
  if (typeof window === 'undefined') return DEFAULT_VOLUME;
  try {
    const stored = localStorage.getItem(VOLUME_STORAGE_KEY);
    if (stored !== null) {
      const v = parseFloat(stored);
      if (v >= 0 && v <= 1) return v;
    }
  } catch { /* localStorage unavailable */ }
  return DEFAULT_VOLUME;
}

/**
 * Persists the volume preference.
 */
export function saveVolume(volume: number): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(VOLUME_STORAGE_KEY, String(Math.min(1, Math.max(0, volume))));
  } catch { /* localStorage unavailable */ }
}

/**
 * Loads the persisted pending-notification list from localStorage.
 * Returns an empty array when nothing is stored or storage is unavailable.
 */
export function loadPendingNotifications(): PendingNotificationRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(PENDING_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as PendingNotificationRecord[];
  } catch { /* corrupt/absent */ }
  return [];
}

/**
 * Persists the pending-notification list to localStorage.
 */
export function savePendingNotifications(records: PendingNotificationRecord[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(PENDING_STORAGE_KEY, JSON.stringify(records));
  } catch { /* localStorage unavailable — state is in-memory only */ }
}

/**
 * Creates and manages the notification sound using the Web Audio API.
 *
 * Plays a two-tone chime (a short rising tone pattern) in a loop while
 * `isActive` is true. The volume is controlled via `setVolume`.
 * Respects browser autoplay restrictions: the AudioContext is created on
 * first user interaction (lazy initialisation).
 */
export class NotificationSound {
  private ctx: AudioContext | null = null;
  private oscillator: OscillatorNode | null = null;
  private gainNode: GainNode | null = null;
  private isPlaying = false;
  private _volume = loadVolume();
  private timeoutId: ReturnType<typeof setTimeout> | null = null;

  get volume(): number { return this._volume; }

  setVolume(v: number): void {
    this._volume = Math.min(1, Math.max(0, v));
    saveVolume(this._volume);
    if (this.gainNode) {
      this.gainNode.gain.setValueAtTime(this._volume, this.ctx!.currentTime);
    }
  }

  /** Start the notification sound loop. Safe to call multiple times. */
  start(): void {
    if (this.isPlaying) return;
    this.isPlaying = true;

    try {
      // Lazy-init AudioContext on first use (must be after user gesture).
      if (!this.ctx) {
        const Ctor = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
        this.ctx = new Ctor();
      }
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => { /* browser may block autoplay */ });
      }

      this.gainNode = this.ctx.createGain();
      this.gainNode.gain.setValueAtTime(this._volume, this.ctx.currentTime);
      this.gainNode.connect(this.ctx.destination);

      this.playTone();
    } catch {
      // Web Audio API unavailable — notification is visual-only.
      this.isPlaying = false;
    }
  }

  /** Stop the notification sound. */
  stop(): void {
    this.isPlaying = false;
    if (this.timeoutId !== null) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    if (this.oscillator) {
      try { this.oscillator.stop(); } catch { /* ignore */ }
      this.oscillator.disconnect();
      this.oscillator = null;
    }
    if (this.gainNode) {
      this.gainNode.disconnect();
      this.gainNode = null;
    }
  }

  /** Plays a single two-tone chime, then schedules the next one. */
  private playTone(): void {
    if (!this.isPlaying || !this.ctx || !this.gainNode) return;

    const now = this.ctx.currentTime;

    // First tone (higher pitch, ~150ms)
    const osc1 = this.ctx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(880, now);          // A5
    osc1.frequency.setValueAtTime(1100, now + 0.08);  // ~C#6 rising
    const gain1 = this.ctx.createGain();
    gain1.gain.setValueAtTime(this._volume, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    osc1.connect(gain1);
    gain1.connect(this.ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.2);

    // Second tone (lower pitch, ~200ms, starting 0.25s after first)
    const osc2 = this.ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(660, now + 0.25);   // E5
    osc2.frequency.setValueAtTime(880, now + 0.33);   // A5 rising
    const gain2 = this.ctx.createGain();
    gain2.gain.setValueAtTime(this._volume, now + 0.25);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    osc2.connect(gain2);
    gain2.connect(this.ctx!.destination);
    osc2.start(now + 0.25);
    osc2.stop(now + 0.5);

    // Schedule next chime after a ~2s pause
    this.timeoutId = setTimeout(() => this.playTone(), 2800);
  }
}

/**
 * Cashier notification client.
 *
 * Connects to the API Socket.io server with the JWT, joins the branch room,
 * listens for `notification:newOrder` events, and calls the provided callback.
 */
export class CashierNotificationClient {
  private socket: Socket | null = null;
  private sound = new NotificationSound();

  /** Currently unacknowledged order IDs. */
  unacknowledgedIds: Set<string> = new Set();
  /** Latest notification per orderId (only the most recent event). */
  orderNotifications: Map<string, CashierNewOrderNotification> = new Map();

  /**
   * @param apiUrl  API base URL (e.g. `http://localhost:8000`)
   * @param token   JWT access token
   * @param branchId  The cashier's assigned branch
   * @param onNewOrder  Called when a new-order notification arrives
   * @param onError  Called on connection/error events
   */
  constructor(
    private apiUrl: string,
    private token: string,
    private branchId: string,
    private onNewOrder: (n: CashierNewOrderNotification) => void,
    private onError?: (msg: string) => void,
  ) {
    // Restore pending (unacknowledged) notifications from localStorage so a
    // normal page reload does not silently drop them. Each record is replayed
    // through the same onNewOrder path; sound restarts if any remain.
    const restored = loadPendingNotifications().filter((r) => !r.acknowledged);
    for (const rec of restored) {
      if (this.unacknowledgedIds.has(rec.orderId)) continue;
      this.unacknowledgedIds.add(rec.orderId);
      this.orderNotifications.set(rec.orderId, {
        orderId: rec.orderId,
        orderNumber: rec.orderNumber,
        branchId: rec.branchId,
        status: rec.status,
        total: rec.total,
        taxAmount: 0,
        subtotal: 0,
        type: rec.type,
        createdAt: rec.createdAt,
        customerName: null,
        items: [],
      });
    }
    if (this.unacknowledgedIds.size > 0) {
      this.sound.start();
    }
  }

  connect(): void {
    if (this.socket?.connected) return;

    // The API's KDS gateway listens on the '/kds' Socket.io namespace.
    this.socket = io(`${this.apiUrl}/kds`, {
      transports: ['websocket'],
      auth: { token: this.token },
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 2000,
    });

    // Wait for the server's `connected` event (emitted by handleConnection
    // AFTER the JWT has been verified and client.data.user has been set)
    // before requesting the branch room. Emitting joinBranch on the raw
    // `connect` event races the async server-side authentication and would be
    // rejected as unauthenticated.
    this.socket.on('connected', () => {
      // Join the branch-specific room — server-side authorisation is enforced
      // by the KdsGateway.joinBranch handler using the JWT's `branches` claim.
      this.socket!.emit('joinBranch', { branchId: this.branchId });
    });

    this.socket.on('notification:newOrder', (envelope: unknown) => {
      // The KDS gateway broadcasts an enriched envelope
      // `{ event, tenantId, branchId, timestamp, data }`; the actual order
      // payload lives in `data`. Accept both shapes defensively.
      const payload = (envelope && (envelope as { data?: CashierNewOrderNotification }).data)
        ? (envelope as { data: CashierNewOrderNotification }).data
        : (envelope as CashierNewOrderNotification);

      // Prevent duplicate notifications for the same order (WebSocket
      // reconnect + re-delivery would otherwise create duplicates).
      if (this.unacknowledgedIds.has(payload.orderId)) return;

      this.unacknowledgedIds.add(payload.orderId);
      this.orderNotifications.set(payload.orderId, payload);
      this.persistPending();
      this.startSoundIfNeeded();
      this.onNewOrder(payload);
    });

    // When the order is accepted or cancelled (server emits `order.accepted`
    // / `order.cancelled` through the same KDS broadcast path), remove it from
    // the unacknowledged set so the sound stops when a colleague or an
    // automated process handles it. The payload is the enriched KDS envelope
    // `{ event, tenantId, branchId, timestamp, data }` where `data` is the
    // order object carrying `id`.
    const handleOrderTerminated = (envelope: { data?: { id?: string } }) => {
      const orderId = envelope?.data?.id;
      if (orderId) {
        this.acknowledgeOrder(orderId);
      }
    };
    this.socket.on('order.accepted', handleOrderTerminated);
    this.socket.on('order.cancelled', handleOrderTerminated);

    this.socket.on('connect_error', (err) => {
      this.onError?.(`WebSocket connection error: ${err.message}`);
    });

    this.socket.on('error', (err: { message?: string }) => {
      this.onError?.(err.message || 'WebSocket error');
    });
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
    this.sound.stop();
  }

  /**
   * Terminating action "acknowledge" — the cashier dismissed the notification
   * without necessarily viewing the order. Removes it from the pending set,
   * persists the update, and stops the sound when nothing remains.
   */
  acknowledgeOrder(orderId: string): void {
    this.unacknowledgedIds.delete(orderId);
    this.orderNotifications.delete(orderId);
    this.persistPending();
    if (this.unacknowledgedIds.size === 0) {
      this.sound.stop();
    }
  }

  /**
   * Terminating action "opened" — the cashier viewed/opened the order
   * (order-detail view). Semantically distinct from acknowledge: it also stops
   * the sound for this order, but the caller keeps the notification visible
   * in the "opened" state until it is fully acknowledged.
   */
  openOrder(orderId: string): void {
    this.unacknowledgedIds.delete(orderId);
    this.persistPending();
    if (this.unacknowledgedIds.size === 0) {
      this.sound.stop();
    }
  }

  /** Set notification volume. */
  setVolume(v: number): void {
    this.sound.setVolume(v);
  }

  get volume(): number { return this.sound.volume; }

  /** Number of orders still producing the persistent sound. */
  get pendingCount(): number { return this.unacknowledgedIds.size; }

  private persistPending(): void {
    const records: PendingNotificationRecord[] = [];
    for (const n of this.orderNotifications.values()) {
      records.push({
        orderId: n.orderId,
        orderNumber: n.orderNumber,
        branchId: n.branchId,
        total: n.total,
        type: n.type,
        status: n.status,
        createdAt: n.createdAt,
        acknowledged: !this.unacknowledgedIds.has(n.orderId),
      });
    }
    savePendingNotifications(records);
  }

  private startSoundIfNeeded(): void {
    if (this.unacknowledgedIds.size > 0 && !this.sound['isPlaying']) {
      this.sound.start();
    }
  }
}