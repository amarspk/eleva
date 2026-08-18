import { BadRequestException } from '@nestjs/common';
import { PromotionService } from './promotion.service';

jest.mock('@zayjar/db', () => {
  const mock = {
    prisma: {
      customer: { findUnique: jest.fn() },
    },
    __welcomeRedemption: { findUnique: jest.fn(), create: jest.fn() },
    __welcomeOfferConfig: { findUnique: jest.fn(), upsert: jest.fn(), findFirst: jest.fn() },
  };
  (mock.prisma as Record<string, unknown>).welcomeRedemption = mock.__welcomeRedemption;
  (mock.prisma as Record<string, unknown>).welcomeOfferConfig = mock.__welcomeOfferConfig;
  return mock;
});

const mockDb = jest.requireMock('@zayjar/db') as {
  prisma: { customer: { findUnique: jest.Mock } };
  __welcomeRedemption: { findUnique: jest.Mock; create: jest.Mock };
  __welcomeOfferConfig: { findUnique: jest.Mock; upsert: jest.Mock; findFirst: jest.Mock };
};

const cfgRow = {
  id: 'cfg-1', tenantId: 'tenant-1', enabled: true,
  discountType: 'PERCENTAGE', discountValue: 10, minOrderAmount: 5,
};

describe('PromotionService (Phase 4 — Welcome Offer)', () => {
  let service: PromotionService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PromotionService();
  });

  describe('config management', () => {
    it('returns null when no config exists', async () => {
      mockDb.__welcomeOfferConfig.findUnique.mockResolvedValue(null);
      const result = await service.getConfig('tenant-1');
      expect(result).toBeNull();
    });

    it('upserts and returns the config', async () => {
      mockDb.__welcomeOfferConfig.upsert.mockResolvedValue(cfgRow);
      const result = await service.upsertConfig('tenant-1', { enabled: true, discountType: 'PERCENTAGE', discountValue: 10 });
      expect(result.enabled).toBe(true);
      expect(result.discountValue).toBe(10);
    });
  });

  describe('customer eligibility', () => {
    it('returns eligible=true with offer details for a genuinely new customer', async () => {
      mockDb.prisma.customer.findUnique.mockResolvedValue({ id: 'customer-1' });
      mockDb.__welcomeRedemption.findUnique.mockResolvedValue(null);
      mockDb.__welcomeOfferConfig.findFirst.mockResolvedValue(cfgRow);

      const result = await service.checkEligibility('customer-1');
      expect(result.eligible).toBe(true);
      expect(result.offer?.discountValue).toBe(10);
    });

    it('returns eligible=false for a non-existent customer', async () => {
      mockDb.prisma.customer.findUnique.mockResolvedValue(null);
      const result = await service.checkEligibility('missing');
      expect(result.eligible).toBe(false);
    });

    it('returns eligible=false for a customer who already used the welcome offer', async () => {
      mockDb.prisma.customer.findUnique.mockResolvedValue({ id: 'customer-1' });
      mockDb.__welcomeRedemption.findUnique.mockResolvedValue({ id: 'r1' });

      const result = await service.checkEligibility('customer-1');
      expect(result.eligible).toBe(false);
    });

    it('returns eligible=false when the welcome offer is not configured', async () => {
      mockDb.prisma.customer.findUnique.mockResolvedValue({ id: 'customer-1' });
      mockDb.__welcomeRedemption.findUnique.mockResolvedValue(null);
      mockDb.__welcomeOfferConfig.findFirst.mockResolvedValue(null);

      const result = await service.checkEligibility('customer-1');
      expect(result.eligible).toBe(false);
    });

    it('returns eligible=false for a customer from another tenant (tenant-scoped)', async () => {
      mockDb.prisma.customer.findUnique.mockResolvedValue(null);
      expect((await service.checkEligibility('foreign-customer')).eligible).toBe(false);
    });
  });
});