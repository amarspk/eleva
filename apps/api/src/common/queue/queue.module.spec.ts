import { QueueModule } from './queue.module';
import { QueueHealthService } from './queue-health.service';

describe('QueueModule — DOC-010 §9.4', () => {
  it('should be defined', () => {
    expect(QueueModule).toBeDefined();
  });

  it('should be a valid NestJS module', () => {
    expect(typeof QueueModule).toBe('function');
  });

  it('should export QueueHealthService', () => {
    const metadata = Reflect.getMetadata('exports', QueueModule) || [];
    expect(metadata).toContain(QueueHealthService);
  });

  it('should provide QueueHealthService', () => {
    const metadata = Reflect.getMetadata('providers', QueueModule) || [];
    expect(metadata).toContain(QueueHealthService);
  });
});
