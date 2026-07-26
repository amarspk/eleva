import { Test, TestingModule } from '@nestjs/testing';
import { SanitizationMiddleware } from './sanitization.middleware';
import { SanitizationService } from './sanitization.service';

describe('SanitizationMiddleware Unit Tests - DOC-006 §5.4', () => {
  let middleware: SanitizationMiddleware;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SanitizationMiddleware, SanitizationService],
    }).compile();

    middleware = module.get<SanitizationMiddleware>(SanitizationMiddleware);
  });

  it('should sanitize req.body containing XSS payload', () => {
    const req = {
      body: {
        name: '<script>alert("xss")</script>John',
        email: 'john@example.com',
      },
      path: '/api/v1/customers',
    } as any;
    const res = {} as any;
    const next = jest.fn();

    middleware.use(req, res, next);

    expect(req.body.name).toBe('John');
    expect(req.body.email).toBe('john@example.com');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('should call next() when body is absent', () => {
    const req = {
      body: undefined,
      path: '/api/v1/auth/login',
    } as any;
    const res = {} as any;
    const next = jest.fn();

    middleware.use(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('should call next() when body is null', () => {
    const req = {
      body: null,
      path: '/api/v1/menu/products',
    } as any;
    const res = {} as any;
    const next = jest.fn();

    middleware.use(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('should skip sanitization for Stripe webhook path', () => {
    const rawBody = '<script>evil</script>{"type":"invoice.paid"}';
    const req = {
      body: rawBody,
      path: '/api/v1/webhooks/stripe',
    } as any;
    const res = {} as any;
    const next = jest.fn();

    middleware.use(req, res, next);

    // Body should NOT be modified — raw body preserved for signature verification
    expect(req.body).toBe(rawBody);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('should sanitize deeply nested body payloads', () => {
    const req = {
      body: {
        user: {
          profile: {
            bio: '<img src=x onerror=alert(1)>Safe bio',
          },
        },
      },
      path: '/api/v1/tenants',
    } as any;
    const res = {} as any;
    const next = jest.fn();

    middleware.use(req, res, next);

    expect(req.body.user.profile.bio).toBe('Safe bio');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('should sanitize arrays in request body', () => {
    const req = {
      body: {
        items: [
          { name: '<script>evil</script>Item 1' },
          { name: 'Clean Item' },
        ],
      },
      path: '/api/v1/orders/checkout',
    } as any;
    const res = {} as any;
    const next = jest.fn();

    middleware.use(req, res, next);

    expect(req.body.items[0].name).toBe('Item 1');
    expect(req.body.items[1].name).toBe('Clean Item');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('should preserve numeric and boolean values in body', () => {
    const req = {
      body: {
        quantity: 5,
        price: 19.99,
        active: true,
        notes: '<b>bold</b>plain',
      },
      path: '/api/v1/menu/products',
    } as any;
    const res = {} as any;
    const next = jest.fn();

    middleware.use(req, res, next);

    expect(req.body.quantity).toBe(5);
    expect(req.body.price).toBe(19.99);
    expect(req.body.active).toBe(true);
    expect(req.body.notes).toBe('boldplain');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('should handle string-only body (non-object JSON)', () => {
    const req = {
      body: '<script>evil</script>',
      path: '/api/v1/auth/login',
    } as any;
    const res = {} as any;
    const next = jest.fn();

    // String body is not typeof 'object', so middleware skips it
    middleware.use(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('should sanitize a realistic menu product creation payload', () => {
    const req = {
      body: {
        name: '<img src=x onerror=alert(document.cookie)>Grilled Chicken',
        description: '<script>steal()</script>Delicious grilled chicken with herbs',
        categoryId: 'cat-uuid-123',
        basePrice: 25.00,
        isAvailable: true,
        variants: [
          {
            name: '<b onclick="xss()">Large</b>Regular',
            price: 30.00,
          },
        ],
      },
      path: '/api/v1/menu/products',
    } as any;
    const res = {} as any;
    const next = jest.fn();

    middleware.use(req, res, next);

    expect(req.body.name).toBe('Grilled Chicken');
    expect(req.body.description).toBe('Delicious grilled chicken with herbs');
    expect(req.body.variants[0].name).toBe('LargeRegular');
    expect(req.body.basePrice).toBe(25.00);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
