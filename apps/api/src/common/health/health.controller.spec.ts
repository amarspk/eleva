import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it('should return status ok', () => {
    const result = controller.getHealth();
    expect(result.status).toBe('ok');
    expect(result.timestamp).toBeDefined();
    expect(result.uptime).toBeGreaterThanOrEqual(0);
  });

  it('should return a valid ISO timestamp', () => {
    const result = controller.getHealth();
    const parsed = new Date(result.timestamp);
    expect(parsed.toString()).not.toBe('Invalid Date');
  });
});
