import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { createClient, RedisClientType } from 'redis';

@Injectable()
export class CacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('CacheService');
  private redisClient: RedisClientType | null = null;
  private isConnected = false;

  async onModuleInit(): Promise<void> {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    this.logger.log(`Initializing Redis client mapping to target: ${redisUrl}`);

    try {
      this.redisClient = createClient({ url: redisUrl });

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
