import { Request, Response, NextFunction } from 'express';
import { CorrelationIdMiddleware } from './correlation-id.middleware';

describe('CorrelationIdMiddleware', () => {
  let middleware: CorrelationIdMiddleware;
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;

  beforeEach(() => {
    middleware = new CorrelationIdMiddleware();
    req = {
      headers: {},
    };
    res = {
      setHeader: jest.fn(),
    };
    next = jest.fn();
  });

  it('should generate a correlation ID when none provided', () => {
    middleware.use(req as Request, res as Response, next);
    expect(req.headers['x-request-id']).toBeDefined();
    expect(typeof req.headers['x-request-id']).toBe('string');
    expect((req as any).correlationId).toBe(req.headers['x-request-id']);
  });

  it('should use existing correlation ID from request headers', () => {
    req.headers['x-request-id'] = 'existing-id-123';
    middleware.use(req as Request, res as Response, next);
    expect(req.headers['x-request-id']).toBe('existing-id-123');
    expect((req as any).correlationId).toBe('existing-id-123');
  });

  it('should set correlation ID on response', () => {
    middleware.use(req as Request, res as Response, next);
    expect(res.setHeader).toHaveBeenCalledWith('X-Request-ID', expect.any(String));
  });

  it('should call next()', () => {
    middleware.use(req as Request, res as Response, next);
    expect(next).toHaveBeenCalled();
  });

  it('should generate UUID format correlation IDs', () => {
    middleware.use(req as Request, res as Response, next);
    const id = req.headers['x-request-id'] as string;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
    expect(uuidRegex.test(id)).toBe(true);
  });
});
