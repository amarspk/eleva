import { ImageProcessorService } from './image-processor.service';

jest.mock('sharp', () => {
  const pipeline = {
    rotate: jest.fn().mockReturnThis(),
    resize: jest.fn().mockReturnThis(),
    webp: jest.fn().mockReturnThis(),
    toBuffer: jest.fn().mockResolvedValue({
      data: Buffer.from('processed'),
      info: { width: 800, height: 600 },
    }),
  };
  return jest.fn(() => pipeline);
});

describe('ImageProcessorService', () => {
  let service: ImageProcessorService;

  beforeEach(() => {
    service = new ImageProcessorService();
  });

  describe('computeChecksum', () => {
    it('should compute SHA-256 checksum of a buffer', () => {
      const buffer = Buffer.from('hello world');
      const checksum = service.computeChecksum(buffer);
      expect(checksum).toHaveLength(64);
      expect(checksum).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should produce consistent checksums for same input', () => {
      const buffer = Buffer.from('test data');
      const c1 = service.computeChecksum(buffer);
      const c2 = service.computeChecksum(buffer);
      expect(c1).toBe(c2);
    });

    it('should produce different checksums for different input', () => {
      const c1 = service.computeChecksum(Buffer.from('data1'));
      const c2 = service.computeChecksum(Buffer.from('data2'));
      expect(c1).not.toBe(c2);
    });
  });

  describe('processImage', () => {
    it('should return buffer unchanged for DOCUMENT type', async () => {
      const input = Buffer.from('pdf-content');
      const result = await service.processImage(input, 'DOCUMENT');
      expect(result).toEqual({ buffer: input });
    });

    it('should process IMAGE type with sharp pipeline', async () => {
      const input = Buffer.from('image-content');
      const result = await service.processImage(input, 'IMAGE');
      expect('original' in result).toBe(true);
      if ('original' in result) {
        expect(result.original.buffer).toBeDefined();
        expect(result.thumbnail).toBeDefined();
        expect(result.medium).toBeDefined();
        expect(result.large).toBeDefined();
      }
    });

    it('should throw on unknown media type', async () => {
      await expect(
        service.processImage(Buffer.from('test'), 'UNKNOWN' as any),
      ).rejects.toThrow();
    });
  });
});
