import { ZayjarLogger } from './logger.service';

describe('ZayjarLogger', () => {
  let logger: ZayjarLogger;

  beforeEach(() => {
    logger = new ZayjarLogger('TestContext');
  });

  it('should create a logger with context', () => {
    expect(logger).toBeDefined();
    logger.setContext('NewContext');
  });

  it('should log info messages', () => {
    const spy = jest.spyOn((logger as any).winston, 'info');
    logger.log('test message');
    expect(spy).toHaveBeenCalledWith('test message', expect.objectContaining({
      context: 'TestContext',
    }));
  });

  it('should log error messages', () => {
    const spy = jest.spyOn((logger as any).winston, 'error');
    logger.error('error message', 'stack trace');
    expect(spy).toHaveBeenCalledWith('error message', expect.objectContaining({
      context: 'TestContext',
      stack: 'stack trace',
    }));
  });

  it('should log warn messages', () => {
    const spy = jest.spyOn((logger as any).winston, 'warn');
    logger.warn('warn message');
    expect(spy).toHaveBeenCalledWith('warn message', expect.objectContaining({
      context: 'TestContext',
    }));
  });

  it('should log debug messages', () => {
    const spy = jest.spyOn((logger as any).winston, 'debug');
    logger.debug('debug message');
    expect(spy).toHaveBeenCalledWith('debug message', expect.objectContaining({
      context: 'TestContext',
    }));
  });

  it('should log verbose messages', () => {
    const spy = jest.spyOn((logger as any).winston, 'verbose');
    logger.verbose('verbose message');
    expect(spy).toHaveBeenCalledWith('verbose message', expect.objectContaining({
      context: 'TestContext',
    }));
  });

  it('should log HTTP requests', () => {
    const spy = jest.spyOn((logger as any).winston, 'info');
    logger.logRequest('GET', '/api/v1/health', 200, 15);
    expect(spy).toHaveBeenCalledWith('HTTP Request', expect.objectContaining({
      context: 'HTTP',
      method: 'GET',
      url: '/api/v1/health',
      statusCode: 200,
      duration: 15,
    }));
  });

  it('should log errors with metadata', () => {
    const spy = jest.spyOn((logger as any).winston, 'error');
    const error = new Error('test error');
    logger.logError(error, 'TestService', { userId: '123' });
    expect(spy).toHaveBeenCalledWith(error.message, expect.objectContaining({
      context: 'TestService',
      stack: error.stack,
      userId: '123',
    }));
  });

  it('should log performance metrics', () => {
    const spy = jest.spyOn((logger as any).winston, 'info');
    logger.logPerformance('db.query', 42, { query: 'SELECT' });
    expect(spy).toHaveBeenCalledWith('Performance', expect.objectContaining({
      context: 'Performance',
      operation: 'db.query',
      duration: 42,
      query: 'SELECT',
    }));
  });

  it('should create child loggers', () => {
    const child = logger.child('ChildContext');
    expect(child).toBeDefined();
    expect(child).toBeInstanceOf(ZayjarLogger);
  });

  it('should handle undefined context gracefully', () => {
    const defaultLogger = new ZayjarLogger();
    const spy = jest.spyOn((defaultLogger as any).winston, 'info');
    defaultLogger.log('test');
    expect(spy).toHaveBeenCalled();
  });
});
