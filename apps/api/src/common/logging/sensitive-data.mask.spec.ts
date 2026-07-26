import { sensitiveFieldsMask, maskValue, isSensitiveKey } from './sensitive-data.mask';

describe('Sensitive Data Masking', () => {
  describe('maskValue', () => {
    it('should mask strings longer than 4 characters', () => {
      const result = maskValue('abcdef123456');
      expect(typeof result).toBe('string');
      expect((result as string).length).toBeGreaterThan(4);
      expect(result).not.toBe('abcdef123456');
    });

    it('should mask short strings with ****', () => {
      expect(maskValue('abc')).toBe('****');
      expect(maskValue('ab')).toBe('****');
    });

    it('should preserve first 2 and last 2 characters for longer strings', () => {
      const result = maskValue('abcdefghij') as string;
      expect(result.startsWith('ab')).toBe(true);
      expect(result.endsWith('ij')).toBe(true);
    });

    it('should return non-string values as-is', () => {
      expect(maskValue(123)).toBe(123);
      expect(maskValue(null)).toBe(null);
      expect(maskValue(undefined)).toBe(undefined);
    });
  });

  describe('isSensitiveKey', () => {
    it('should detect password fields', () => {
      expect(isSensitiveKey('password')).toBe(true);
      expect(isSensitiveKey('userPassword')).toBe(true);
      expect(isSensitiveKey('PASSWORD')).toBe(true);
    });

    it('should detect token fields', () => {
      expect(isSensitiveKey('token')).toBe(true);
      expect(isSensitiveKey('accessToken')).toBe(true);
      expect(isSensitiveKey('jwt_token')).toBe(true);
    });

    it('should detect secret fields', () => {
      expect(isSensitiveKey('secret')).toBe(true);
      expect(isSensitiveKey('secretKey')).toBe(true);
      expect(isSensitiveKey('apiKey')).toBe(true);
    });

    it('should detect authorization fields', () => {
      expect(isSensitiveKey('authorization')).toBe(true);
      expect(isSensitiveKey('Authorization')).toBe(true);
    });

    it('should not flag non-sensitive fields', () => {
      expect(isSensitiveKey('name')).toBe(false);
      expect(isSensitiveKey('email')).toBe(false);
      expect(isSensitiveKey('id')).toBe(false);
      expect(isSensitiveKey('status')).toBe(false);
    });
  });

  describe('sensitiveFieldsMask', () => {
    it('should mask sensitive fields in an object', () => {
      const input = {
        name: 'John',
        password: 'secret123',
        token: 'abc123def456',
      };
      const result = sensitiveFieldsMask(input);
      expect(result.name).toBe('John');
      expect(result.password).not.toBe('secret123');
      expect(result.token).not.toBe('abc123def456');
    });

    it('should handle nested objects', () => {
      const input = {
        user: {
          name: 'John',
          credentials: {
            password: 'secret123',
          },
        },
      };
      const result = sensitiveFieldsMask(input) as any;
      expect(result.user.name).toBe('John');
      expect(result.user.credentials.password).not.toBe('secret123');
    });

    it('should handle arrays', () => {
      const input = {
        tokens: ['token1', 'token2'],
        names: ['John', 'Jane'],
      };
      const result = sensitiveFieldsMask(input) as any;
      expect(result.names).toEqual(['John', 'Jane']);
      expect(result.tokens[0]).not.toBe('token1');
    });

    it('should handle empty objects', () => {
      expect(sensitiveFieldsMask({})).toEqual({});
    });

    it('should not modify non-sensitive fields', () => {
      const input = { name: 'John', age: 30, active: true };
      const result = sensitiveFieldsMask(input);
      expect(result).toEqual(input);
    });

    it('should respect additional patterns', () => {
      const input = { custom_field: 'value123' };
      const result = sensitiveFieldsMask(input, ['custom_field']);
      expect(result.custom_field).not.toBe('value123');
    });

    it('should mask deeply nested sensitive fields', () => {
      const input = {
        level1: {
          level2: {
            level3: {
              secret: 'deep-secret',
              normal: 'visible',
            },
          },
        },
      };
      const result = sensitiveFieldsMask(input) as any;
      expect(result.level1.level2.level3.secret).not.toBe('deep-secret');
      expect(result.level1.level2.level3.normal).toBe('visible');
    });
  });
});
