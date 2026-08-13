import { dbTenantContext, prisma } from '@zayjar/db';
import { DesignData, DesignService } from './design.service';

jest.mock('@zayjar/db', () => ({
  prisma: {
    tenantDesign: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    tenantDesignVersion: { count: jest.fn(), findFirst: jest.fn(), create: jest.fn(), delete: jest.fn(), findMany: jest.fn() },
    platformDesign: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
  },
  dbTenantContext: { run: jest.fn((_store: unknown, callback: () => unknown) => callback()) },
}));

const TENANT_A = 'aaaaaaaa-1111-4aaa-8aaa-aaaaaaaaaaaa';
const PRIVATE_DRAFT: DesignData = { colors: { primary: '#111111' }, sections: [] };
const TENANT_PUBLISHED: DesignData = { colors: { primary: '#222222' }, sections: [] };
const PLATFORM_DRAFT: DesignData = { colors: { primary: '#333333' }, sections: [] };
const PLATFORM_PUBLISHED: DesignData = { colors: { primary: '#444444' }, sections: [] };

describe('DesignService A1 — published-only public projections', () => {
  let service: DesignService;
  const tenantDesign = (prisma as unknown as { tenantDesign: Record<string, jest.Mock> }).tenantDesign;
  const tenantDesignVersion = (prisma as unknown as { tenantDesignVersion: Record<string, jest.Mock> }).tenantDesignVersion;
  const platformDesign = (prisma as unknown as { platformDesign: Record<string, jest.Mock> }).platformDesign;
  const contextRun = dbTenantContext.run as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new DesignService();
    tenantDesignVersion.count.mockResolvedValue(0);
    tenantDesignVersion.create.mockResolvedValue({});
  });

  it('returns only the published tenant projection and never loads draft', async () => {
    tenantDesign.findUnique.mockResolvedValue({ draft: PRIVATE_DRAFT, published: TENANT_PUBLISHED });
    await expect(service.getPublishedDesign(TENANT_A)).resolves.toEqual(TENANT_PUBLISHED);
    expect(tenantDesign.findUnique).toHaveBeenCalledWith({ where: { tenantId: TENANT_A }, select: { published: true } });
    expect(contextRun).toHaveBeenCalledWith({ tenantId: TENANT_A }, expect.any(Function));
  });

  it('returns null for a tenant with no published design row without creating one', async () => {
    tenantDesign.findUnique.mockResolvedValue(null);
    await expect(service.getPublishedDesign(TENANT_A)).resolves.toBeNull();
    expect(tenantDesign.create).not.toHaveBeenCalled();
  });

  it('returns private builder defaults without creating or publishing on the first read', async () => {
    tenantDesign.findUnique.mockResolvedValue(null);
    const result = await service.getDesign(TENANT_A, true);
    expect(result).toMatchObject({ published: {}, version: 0, publishedAt: null });
    expect((result as any).preview).toEqual(result.draft);
    expect(tenantDesign.create).not.toHaveBeenCalled();
  });

  it('does not publish a first private tenant draft implicitly', async () => {
    tenantDesign.findUnique.mockResolvedValue(null);
    tenantDesign.create.mockResolvedValue({ version: 1, draft: PRIVATE_DRAFT, published: {} });
    await service.saveDraft(TENANT_A, PRIVATE_DRAFT);
    expect(tenantDesign.create).toHaveBeenCalledWith({ data: { tenantId: TENANT_A, draft: PRIVATE_DRAFT, published: {} } });
  });

  it('returns only published platform data to public callers', async () => {
    platformDesign.findFirst.mockResolvedValue({ draft: PLATFORM_DRAFT, published: PLATFORM_PUBLISHED });
    await expect(service.getPublishedPlatformDesign()).resolves.toEqual(PLATFORM_PUBLISHED);
    expect(platformDesign.findFirst).toHaveBeenCalledWith({ select: { published: true } });
    expect(contextRun).toHaveBeenCalledWith({ isPlatformOwner: true }, expect.any(Function));
  });

  it('keeps platform draft access on the separate protected service path', async () => {
    platformDesign.findFirst.mockResolvedValue({ draft: PLATFORM_DRAFT });
    await expect(service.getPlatformPreview()).resolves.toEqual(PLATFORM_DRAFT);
    expect(platformDesign.findFirst).toHaveBeenCalledWith({ select: { draft: true } });
  });

  it('does not publish a first private platform draft implicitly', async () => {
    platformDesign.findFirst.mockResolvedValue(null);
    platformDesign.create.mockResolvedValue({ draft: PLATFORM_DRAFT, published: {} });
    await service.savePlatformDraft(PLATFORM_DRAFT);
    expect(platformDesign.create).toHaveBeenCalledWith({ data: { draft: PLATFORM_DRAFT, published: {} } });
  });
});
