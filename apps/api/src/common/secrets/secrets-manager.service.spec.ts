import { SecretsManagerService } from './secrets-manager.service';

jest.mock('@aws-sdk/client-secrets-manager', () => {
  const mockSend = jest.fn();
  return {
    SecretsManagerClient: jest.fn().mockImplementation(() => ({
      send: mockSend,
    })),
    GetSecretValueCommand: jest.fn().mockImplementation((input) => input),
    __mockSend: mockSend,
  };
});

describe('SecretsManagerService (DOC-006 §5.9)', () => {
  let service: SecretsManagerService;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    service = new SecretsManagerService();
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.AWS_SECRETS_MANAGER_SECRET_ID;
    delete process.env.AWS_REGION;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('loadSecrets()', () => {
    it('should skip loading when AWS_SECRETS_MANAGER_SECRET_ID is not set', async () => {
      await service.loadSecrets();

      expect(service.isLoaded()).toBe(true);
      const { SecretsManagerClient } = require('@aws-sdk/client-secrets-manager');
      expect(SecretsManagerClient).not.toHaveBeenCalled();
    });

    it('should load secrets from AWS Secrets Manager and inject into process.env', async () => {
      process.env.AWS_SECRETS_MANAGER_SECRET_ID = 'zayjar/prod/secrets';
      process.env.AWS_REGION = 'me-south-1';

      const { __mockSend } = require('@aws-sdk/client-secrets-manager');
      __mockSend.mockResolvedValueOnce({
        SecretString: JSON.stringify({
          DATABASE_URL: 'postgresql://admin:secret@host:5432/db',
          JWT_SECRET: 'super-secret-jwt-key',
          STRIPE_SECRET_KEY: 'sk_live_123',
        }),
      });

      await service.loadSecrets();

      expect(service.isLoaded()).toBe(true);
      expect(process.env.DATABASE_URL).toBe('postgresql://admin:secret@host:5432/db');
      expect(process.env.JWT_SECRET).toBe('super-secret-jwt-key');
      expect(process.env.STRIPE_SECRET_KEY).toBe('sk_live_123');
      expect(service.getSecret('DATABASE_URL')).toBe('postgresql://admin:secret@host:5432/db');
    });

    it('should not overwrite existing env vars with empty secret values', async () => {
      process.env.AWS_SECRETS_MANAGER_SECRET_ID = 'zayjar/prod/secrets';
      process.env.EXISTING_KEY = 'keep-this';

      const { __mockSend } = require('@aws-sdk/client-secrets-manager');
      __mockSend.mockResolvedValueOnce({
        SecretString: JSON.stringify({
          EXISTING_KEY: '',
          NEW_KEY: 'new-value',
        }),
      });

      await service.loadSecrets();

      expect(process.env.EXISTING_KEY).toBe('keep-this');
      expect(process.env.NEW_KEY).toBe('new-value');
    });

    it('should handle AWS Secrets Manager errors gracefully and fall back to env vars', async () => {
      process.env.AWS_SECRETS_MANAGER_SECRET_ID = 'zayjar/prod/secrets';
      process.env.FALLBACK_KEY = 'fallback-value';

      const { __mockSend } = require('@aws-sdk/client-secrets-manager');
      __mockSend.mockRejectedValueOnce(new Error('AccessDenied'));

      await service.loadSecrets();

      expect(service.isLoaded()).toBe(true);
      expect(process.env.FALLBACK_KEY).toBe('fallback-value');
    });

    it('should handle empty SecretString from AWS Secrets Manager', async () => {
      process.env.AWS_SECRETS_MANAGER_SECRET_ID = 'zayjar/prod/secrets';

      const { __mockSend } = require('@aws-sdk/client-secrets-manager');
      __mockSend.mockResolvedValueOnce({ SecretString: undefined });

      await service.loadSecrets();

      expect(service.isLoaded()).toBe(true);
    });

    it('should accept override secret ID parameter', async () => {
      const { __mockSend } = require('@aws-sdk/client-secrets-manager');
      __mockSend.mockResolvedValueOnce({
        SecretString: JSON.stringify({ OVERRIDE_KEY: 'override-value' }),
      });

      await service.loadSecrets('custom-secret-id');

      expect(service.isLoaded()).toBe(true);
      expect(process.env.OVERRIDE_KEY).toBe('override-value');
    });

    it('should not load secrets twice (idempotent)', async () => {
      process.env.AWS_SECRETS_MANAGER_SECRET_ID = 'zayjar/prod/secrets';

      const { __mockSend, SecretsManagerClient } = require('@aws-sdk/client-secrets-manager');
      __mockSend.mockResolvedValueOnce({
        SecretString: JSON.stringify({ KEY: 'value' }),
      });

      await service.loadSecrets();
      await service.loadSecrets();

      expect(SecretsManagerClient).toHaveBeenCalledTimes(1);
    });
  });

  describe('getSecret()', () => {
    it('should return undefined for keys not loaded from Secrets Manager', () => {
      expect(service.getSecret('nonexistent')).toBeUndefined();
    });

    it('should return cached value after loading', async () => {
      process.env.AWS_SECRETS_MANAGER_SECRET_ID = 'zayjar/prod/secrets';

      const { __mockSend } = require('@aws-sdk/client-secrets-manager');
      __mockSend.mockResolvedValueOnce({
        SecretString: JSON.stringify({ MY_KEY: 'my-value' }),
      });

      await service.loadSecrets();

      expect(service.getSecret('MY_KEY')).toBe('my-value');
    });
  });
});
