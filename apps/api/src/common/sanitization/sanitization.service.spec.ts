import { Test, TestingModule } from '@nestjs/testing';
import { SanitizationService } from './sanitization.service';

describe('SanitizationService Unit Tests - DOC-006 §5.4', () => {
  let service: SanitizationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SanitizationService],
    }).compile();

    service = module.get<SanitizationService>(SanitizationService);
  });

  describe('sanitizeString()', () => {
    it('should strip all HTML tags from a script injection', () => {
      const input = '<script>alert("xss")</script>Hello';
      expect(service.sanitizeString(input)).toBe('Hello');
    });

    it('should strip img onerror XSS payload', () => {
      const input = '<img src=x onerror=alert(1)>';
      expect(service.sanitizeString(input)).toBe('');
    });

    it('should strip event handler attributes', () => {
      const input = '<div onmouseover="alert(1)">hover me</div>';
      expect(service.sanitizeString(input)).toBe('hover me');
    });

    it('should strip javascript: protocol URLs', () => {
      const input = '<a href="javascript:alert(1)">click</a>';
      expect(service.sanitizeString(input)).toBe('click');
    });

    it('should pass through plain text unchanged', () => {
      const input = 'Hello World 123';
      expect(service.sanitizeString(input)).toBe('Hello World 123');
    });

    it('should return empty string for empty input', () => {
      expect(service.sanitizeString('')).toBe('');
    });

    it('should handle SVG-based XSS', () => {
      const input = '<svg onload="alert(1)">';
      expect(service.sanitizeString(input)).toBe('');
    });

    it('should strip nested script tags', () => {
      const input = '<scr<script>ipt>alert(1)</scr</script>ipt>';
      // sanitize-html handles mutation attempts
      const result = service.sanitizeString(input);
      expect(result).not.toContain('<script>');
      expect(result).not.toContain('alert');
    });

    it('should strip iframe injection', () => {
      const input = '<iframe src="https://evil.com"></iframe>';
      expect(service.sanitizeString(input)).toBe('');
    });

    it('should strip style-based XSS with expression()', () => {
      const input = '<div style="background:expression(alert(1))">test</div>';
      expect(service.sanitizeString(input)).toBe('test');
    });
  });

  describe('sanitize() - recursive object sanitization', () => {
    it('should sanitize a flat object with string values', () => {
      const input = {
        name: '<script>alert("xss")</script>John',
        email: 'john@example.com',
      };
      const result = service.sanitize(input);
      expect(result.name).toBe('John');
      expect(result.email).toBe('john@example.com');
    });

    it('should sanitize deeply nested objects', () => {
      const input = {
        user: {
          profile: {
            bio: '<img src=x onerror=alert(1)>Safe bio',
          },
        },
      };
      const result = service.sanitize(input);
      expect((result as any).user.profile.bio).toBe('Safe bio');
    });

    it('should sanitize arrays of objects', () => {
      const input = {
        items: [
          { name: '<script>evil</script>Item 1' },
          { name: 'Item 2' },
        ],
      };
      const result = service.sanitize(input);
      expect(result.items[0].name).toBe('Item 1');
      expect(result.items[1].name).toBe('Item 2');
    });

    it('should preserve numbers, booleans, and null', () => {
      const input = {
        count: 42,
        active: true,
        deleted: null,
        undefined_field: undefined,
      };
      const result = service.sanitize(input);
      expect(result.count).toBe(42);
      expect(result.active).toBe(true);
      expect(result.deleted).toBeNull();
      expect(result.undefined_field).toBeUndefined();
    });

    it('should not mutate the original object', () => {
      const input = {
        name: '<script>evil</script>Safe',
      };
      const original = { ...input };
      service.sanitize(input);
      expect(input).toEqual(original);
    });

    it('should return null for null input', () => {
      expect(service.sanitize(null)).toBeNull();
    });

    it('should return undefined for undefined input', () => {
      expect(service.sanitize(undefined)).toBeUndefined();
    });

    it('should return numbers unchanged', () => {
      expect(service.sanitize(42)).toBe(42);
    });

    it('should handle an array as top-level input', () => {
      const input = ['<script>evil</script>Safe', 'Normal'];
      const result = service.sanitize(input);
      expect(result).toEqual(['Safe', 'Normal']);
    });

    it('should sanitize complex real-world order payload', () => {
      const input = {
        branchId: 'abc-123',
        type: 'DINE_IN',
        specialNotes: '<img src=x onerror=alert(document.cookie)>Extra cheese',
        items: [
          {
            productId: 'prod-1',
            quantity: 2,
            addons: [{ name: '<script>steal</script>Sauce' }],
          },
        ],
      };
      const result = service.sanitize(input);
      expect(result.specialNotes).toBe('Extra cheese');
      expect(result.items[0].addons[0].name).toBe('Sauce');
      expect(result.branchId).toBe('abc-123');
    });

    it('should handle null values inside objects', () => {
      const input = {
        name: 'Test',
        metadata: null,
      };
      const result = service.sanitize(input);
      expect(result.name).toBe('Test');
      expect(result.metadata).toBeNull();
    });

    it('should handle mixed-type arrays', () => {
      const input = ['<b>bold</b>', 42, true, null, { nested: '<i>italic</i>' }];
      const result = service.sanitize(input);
      expect(result[0]).toBe('bold');
      expect(result[1]).toBe(42);
      expect(result[2]).toBe(true);
      expect(result[3]).toBeNull();
      expect((result[4] as any).nested).toBe('italic');
    });
  });
});
