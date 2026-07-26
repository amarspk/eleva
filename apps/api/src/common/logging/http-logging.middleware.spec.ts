import { HttpLoggingMiddleware } from './http-logging.middleware';
import { getGlobalLogger } from './logger.service';

jest.mock('./logger.service');

describe('HttpLoggingMiddleware', () => {
  let middleware: HttpLoggingMiddleware;
  let req: any;
  let res: any;
  let next: jest.Mock;

  beforeEach(() => {
    middleware = new HttpLoggingMiddleware();
    req = {
      method: 'GET',
      url: '/api/v1/health',
      ip: '127.0.0.1',
      headers: {
        'user-agent': 'test-agent',
        'x-request-id': 'test-correlation-id',
      },
    };
    res = {
      statusCode: 200,
      getHeader: jest.fn().mockReturnValue('100'),
      setHeader: jest.fn(),
      end: jest.fn(),
    };
    next = jest.fn();
    jest.clearAllMocks();
  });

  it('should call next()', () => {
    middleware.use(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('should wrap res.end to log after response', () => {
    middleware.use(req, res, next);
    expect(typeof res.end).toBe('function');
  });

  it('should log request on response end', () => {
    const mockLogger = {
      logRequest: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      child: jest.fn().mockReturnThis(),
    };
    (getGlobalLogger as jest.Mock).mockReturnValue(mockLogger);

    middleware.use(req, res, next);
    res.end();

    expect(mockLogger.logRequest).toHaveBeenCalledWith(
      'GET',
      '/api/v1/health',
      200,
      expect.any(Number),
      expect.objectContaining({
        correlationId: 'test-correlation-id',
      }),
    );
  });

  it('should log errors for 5xx status codes', () => {
    const mockLogger = {
      logRequest: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      child: jest.fn().mockReturnThis(),
    };
    (getGlobalLogger as jest.Mock).mockReturnValue(mockLogger);

    res.statusCode = 500;
    middleware.use(req, res, next);
    res.end();

    expect(mockLogger.error).toHaveBeenCalled();
  });

  it('should log warnings for 4xx status codes', () => {
    const mockLogger = {
      logRequest: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      child: jest.fn().mockReturnThis(),
    };
    (getGlobalLogger as jest.Mock).mockReturnValue(mockLogger);

    res.statusCode = 404;
    middleware.use(req, res, next);
    res.end();

    expect(mockLogger.warn).toHaveBeenCalled();
  });
});
