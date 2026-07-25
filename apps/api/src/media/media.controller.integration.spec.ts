import { Test, TestingModule } from '@nestjs/testing';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';

describe('MediaController (integration)', () => {
  let controller: MediaController;
  let mockService: MediaService;

  beforeEach(async () => {
    mockService = {
      upload: jest.fn(),
      findAll: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      remove: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MediaController],
      providers: [
        { provide: MediaService, useValue: mockService },
      ],
    }).compile();

    controller = module.get<MediaController>(MediaController);
  });

  describe('findAll', () => {
    it('should return empty array when no media', async () => {
      const req = { user: { tenantId: 't1' } };
      const result = await controller.findAll(req, undefined, undefined);
      expect(result).toEqual([]);
      expect(mockService.findAll).toHaveBeenCalledWith('t1', undefined, undefined);
    });

    it('should pass entityType and entityId to service', async () => {
      const req = { user: { tenantId: 't1' } };
      await controller.findAll(req, 'product', 'p1');
      expect(mockService.findAll).toHaveBeenCalledWith('t1', 'product', 'p1');
    });
  });

  describe('findOne', () => {
    it('should return a media record', async () => {
      const mockMedia = { id: 'm1', tenantId: 't1' };
      mockService.findOne = jest.fn().mockResolvedValue(mockMedia);
      const req = { user: { tenantId: 't1' } };
      const result = await controller.findOne('m1', req);
      expect(result).toEqual(mockMedia);
    });
  });

  describe('remove', () => {
    it('should delete media and return success message', async () => {
      mockService.remove = jest.fn().mockResolvedValue(undefined);
      const req = { user: { tenantId: 't1' } };
      const result = await controller.remove('m1', req);
      expect(result).toEqual({ message: 'Media deleted successfully' });
      expect(mockService.remove).toHaveBeenCalledWith('m1', 't1');
    });
  });
});
