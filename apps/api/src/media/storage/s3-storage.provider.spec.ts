describe('S3StorageProvider', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('constructor validation (Fix E)', () => {
    it('should throw when S3_BUCKET is missing', () => {
      delete process.env.S3_BUCKET;
      process.env.AWS_ACCESS_KEY_ID = 'key';
      process.env.AWS_SECRET_ACCESS_KEY = 'secret';

      jest.isolateModules(() => {
        jest.mock('@aws-sdk/client-s3', () => ({}), { virtual: true });
        const { S3StorageProvider } = require('./s3-storage.provider');
        expect(() => new S3StorageProvider()).toThrow('S3_BUCKET');
      });
    });

    it('should throw when AWS_ACCESS_KEY_ID is missing', () => {
      process.env.S3_BUCKET = 'my-bucket';
      delete process.env.AWS_ACCESS_KEY_ID;
      process.env.AWS_SECRET_ACCESS_KEY = 'secret';

      jest.isolateModules(() => {
        jest.mock('@aws-sdk/client-s3', () => ({}), { virtual: true });
        const { S3StorageProvider } = require('./s3-storage.provider');
        expect(() => new S3StorageProvider()).toThrow('AWS_ACCESS_KEY_ID');
      });
    });

    it('should throw when AWS_SECRET_ACCESS_KEY is missing', () => {
      process.env.S3_BUCKET = 'my-bucket';
      process.env.AWS_ACCESS_KEY_ID = 'key';
      delete process.env.AWS_SECRET_ACCESS_KEY;

      jest.isolateModules(() => {
        jest.mock('@aws-sdk/client-s3', () => ({}), { virtual: true });
        const { S3StorageProvider } = require('./s3-storage.provider');
        expect(() => new S3StorageProvider()).toThrow('AWS_SECRET_ACCESS_KEY');
      });
    });

    it('should throw when both AWS credentials are empty strings', () => {
      process.env.S3_BUCKET = 'my-bucket';
      process.env.AWS_ACCESS_KEY_ID = '';
      process.env.AWS_SECRET_ACCESS_KEY = '';

      jest.isolateModules(() => {
        jest.mock('@aws-sdk/client-s3', () => ({}), { virtual: true });
        const { S3StorageProvider } = require('./s3-storage.provider');
        expect(() => new S3StorageProvider()).toThrow('AWS_ACCESS_KEY_ID');
      });
    });
  });
});
