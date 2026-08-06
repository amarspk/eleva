import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { createClient, RedisClientType } from 'redis';

@Injectable()
export class CacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('CacheService');
  private redisClient: RedisClientType | null = null;
  private isConnected = false;

  /**
   * Upper bound for a durable (security-control) write. Kept well under the
   * default 5s Prisma interactive-transaction budget, because `setStrict` is
   * called from inside a transaction that can hold a per-tenant advisory lock.
   */
  private static readonly STRICT_WRITE_TIMEOUT_MS = 1500;

  async onModuleInit(): Promise<void> {
    const redisUrl = process.env.REDIS_URL || '';

    /* Skip Redis entirely when REDIS_URL is empty or explicitly disabled.
       This allows the API to run on resource-constrained hosts (e.g. Render
       free tier) without Redis. All cache operations fall through to the
       database fetch path, which is correct but slower. */
    if (!redisUrl || redisUrl === 'none' || redisUrl === 'disabled') {
      this.logger.warn('REDIS_URL not configured — cache bypass enabled (all reads go to DB).');
      this.redisClient = null;
      this.isConnected = false;
      return;
    }

    this.logger.log(`Initializing Redis client mapping to target: ${redisUrl}`);

    try {
      const useTls = process.env.REDIS_TLS === 'true';
      const clientOptions: Record<string, unknown> = { url: redisUrl };

      if (useTls) {
        clientOptions.socket = {
          tls: true,
          rejectUnauthorized: false,
        };
        this.logger.log('Redis TLS enabled via REDIS_TLS=true');
      }

      this.redisClient = createClient(clientOptions);

      this.redisClient.on('error', (err) => {
        this.logger.error(`Redis client connection failure: ${err.message}`);
        this.isConnected = false;
      });

      this.redisClient.on('connect', () => {
        this.logger.log('Redis client successfully connected.');
        this.isConnected = true;
      });

      this.redisClient.on('reconnecting', () => {
        this.logger.warn('Redis client is reconnecting to host...');
        this.isConnected = false;
      });

      await this.redisClient.connect();
    } catch (err) {
      this.logger.error(`A fatal exception occurred during Redis initialization: ${(err as Error).message}`);
      this.redisClient = null;
      this.isConnected = false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redisClient && this.isConnected) {
      this.logger.log('Disconnecting active Redis client sessions.');
      await this.redisClient.disconnect();
    }
  }

  /**
   * Evaluates the Cache-Aside design pattern.
   * If a key exists inside Redis, deserializes and returns it.
   * If there is a cache miss or Redis is offline, resolves the backup fetch function,
   * caches the result asynchronously, and returns it to the client.
   */
  async get<T>(key: string, fetchFn: () => Promise<T>, ttlSeconds = 7200): Promise<T> {
    if (!this.redisClient || !this.isConnected) {
      this.logger.warn(`Redis client is offline. Bypassing cache checks for key: [${key}]`);
      return fetchFn();
    }

    try {
      const cachedValue = await this.redisClient.get(key);
      
      if (cachedValue !== null) {
        this.logger.debug(`Cache HIT for key: [${key}]`);
        return JSON.parse(cachedValue) as T;
      }

      this.logger.log(`Cache MISS for key: [${key}]. Resolving fallback data handler...`);
      const result = await fetchFn();

      // Write results to cache asynchronously (fire-and-forget to minimize latency)
      this.set(key, result, ttlSeconds).catch((err) => {
        this.logger.error(`Failed to write fallback data back to cache key [${key}]: ${err.message}`);
      });

      return result;
    } catch (err) {
      this.logger.error(`Error during Cache-Aside retrieval for key [${key}]: ${(err as Error).message}`);
      return fetchFn(); // Fail-safe: fallback to database
    }
  }

  /**
   * Serializes and writes a key-value pair to Redis with a dynamic TTL.
   */
  async set(key: string, value: unknown, ttlSeconds = 7200): Promise<void> {
    if (!this.redisClient || !this.isConnected) {
      return;
    }

    try {
      const serializedValue = JSON.stringify(value);
      await this.redisClient.set(key, serializedValue, { EX: ttlSeconds });
      this.logger.debug(`Cached key successfully: [${key}] with TTL: ${ttlSeconds}s`);
    } catch (err) {
      this.logger.error(`Failed to cache key [${key}]: ${(err as Error).message}`);
    }
  }

  /**
   * Durable write for values that are SECURITY CONTROLS rather than cache.
   *
   * `set()` above is intentionally best-effort: a cache miss is harmless, so it
   * swallows an offline client and returns as if it succeeded. That contract is
   * wrong for data whose absence means "no restriction" — for example the
   * per-user token-revocation marker consumed by `JwtStrategy`. With `set()`,
   * revoking a deleted user's sessions while Redis was down reported success
   * but stored nothing, leaving the victim's JWT valid until expiry
   * (fail-OPEN on a security control).
   *
   * This variant reports the truth: it returns `false` (and never throws) when
   * the value could not be persisted, so callers can fail closed.
   */
  async setStrict(key: string, value: unknown, ttlSeconds = 7200): Promise<boolean> {
    if (!this.redisClient || !this.isConnected) {
      this.logger.error(
        `Durable write REJECTED for key [${key}]: Redis is unavailable. Caller must fail closed.`,
      );
      return false;
    }

    try {
      const serializedValue = JSON.stringify(value);
      // Bounded wait. Callers invoke this from inside a database transaction
      // that may hold a per-tenant advisory lock, so an unbounded Redis command
      // could stall the lock and blow the interactive-transaction budget. A
      // connected-but-slow store degrades to a clean "not persisted" result,
      // which the caller turns into a retryable 503.
      await this.withTimeout(
        this.redisClient.set(key, serializedValue, { EX: ttlSeconds }),
        CacheService.STRICT_WRITE_TIMEOUT_MS,
      );
      return true;
    } catch (err) {
      this.logger.error(`Durable write FAILED for key [${key}]: ${(err as Error).message}`);
      return false;
    }
  }

  /**
   * Rejects if `promise` has not settled within `ms`. The underlying Redis
   * command is not cancellable; this only bounds how long the caller waits.
   */
  private async withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error(`Redis command timed out after ${ms}ms`)), ms);
        }),
      ]);
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }

  /**
   * Removes a specific key from the cache cluster immediately.
   */
  async del(key: string): Promise<void> {
    if (!this.redisClient || !this.isConnected) {
      return;
    }

    try {
      await this.redisClient.del(key);
      this.logger.log(`Evicted cache key successfully: [${key}]`);
    } catch (err) {
      this.logger.error(`Failed to evict cache key [${key}]: ${(err as Error).message}`);
    }
  }

  /**
   * Flushes all active caches from the local database cleanly.
   */
  async flush(): Promise<void> {
    if (!this.redisClient || !this.isConnected) {
      return;
    }

    try {
      await this.redisClient.flushDb();
      this.logger.log('Database flushed successfully.');
    } catch (err) {
      this.logger.error(`Failed to flush database: ${(err as Error).message}`);
    }
  }

  /**
   * Diagnostics: Check connection status
   */
  isCacheActive(): boolean {
    return this.isConnected;
  }
}
