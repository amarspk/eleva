import { ZayjarLogger } from './logger.service';

export function createPerformanceLogger(context: string) {
  const logger = new ZayjarLogger(context);
  const timers = new Map<string, number>();

  return {
    start(operation: string): void {
      timers.set(operation, Date.now());
    },

    end(operation: string, meta?: Record<string, unknown>): number {
      const start = timers.get(operation);
      if (start === undefined) { return 0; }
      const duration = Date.now() - start;
      timers.delete(operation);
      logger.logPerformance(operation, duration, meta);
      return duration;
    },

    measure<T>(operation: string, fn: () => T, meta?: Record<string, unknown>): T {
      const start = Date.now();
      try {
        const result = fn();
        const duration = Date.now() - start;
        logger.logPerformance(operation, duration, meta);
        return result;
      } catch (error) {
        const duration = Date.now() - start;
        logger.logPerformance(operation, duration, { ...meta, error: (error as Error).message });
        throw error;
      }
    },

    async measureAsync<T>(operation: string, fn: () => Promise<T>, meta?: Record<string, unknown>): Promise<T> {
      const start = Date.now();
      try {
        const result = await fn();
        const duration = Date.now() - start;
        logger.logPerformance(operation, duration, meta);
        return result;
      } catch (error) {
        const duration = Date.now() - start;
        logger.logPerformance(operation, duration, { ...meta, error: (error as Error).message });
        throw error;
      }
    },
  };
}
