import { LoggerService } from '@nestjs/common';
import * as winston from 'winston';
import * as path from 'path';
import { sensitiveFieldsMask } from './sensitive-data.mask';

const LOG_DIR = process.env.LOG_DIR || path.join(process.cwd(), 'logs');
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const NODE_ENV = process.env.NODE_ENV || 'development';

const SENSITIVE_FIELDS = [
  'password', 'passwd', 'secret', 'token', 'api_key', 'apiKey',
  'authorization', 'cookie', 'session', 'credit_card', 'creditCard',
  'ssn', 'pin', 'otp', 'access_token', 'accessToken', 'refresh_token',
  'refreshToken', 'private_key', 'privateKey', 'secret_key', 'secretKey',
];

const maskTransform = winston.format((info) => {
  if (info.meta && typeof info.meta === 'object') {
    info.meta = sensitiveFieldsMask(info.meta, SENSITIVE_FIELDS);
  }
  return info;
});

function createWinstonLogger(): winston.Logger {
  const transports: winston.transport[] = [
    new winston.transports.Console({
      level: LOG_LEVEL,
      format: NODE_ENV === 'production'
        ? winston.format.combine(
            winston.format.timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' }),
            winston.format.errors({ stack: true }),
            maskTransform(),
            winston.format.json(),
          )
        : winston.format.combine(
            winston.format.colorize(),
            winston.format.timestamp({ format: 'HH:mm:ss.SSS' }),
            winston.format.errors({ stack: true }),
            maskTransform(),
            winston.format.printf(({ timestamp, level, context, message, meta, stack }) => {
              const ctx = context ? `[${context}]` : '';
              const metaStr = meta && Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
              const stackStr = stack ? `\n${stack}` : '';
              return `${timestamp} ${level} ${ctx} ${message}${metaStr}${stackStr}`;
            }),
          ),
    }),
  ];

  if (NODE_ENV === 'production' || process.env.LOG_FILE_ENABLED === 'true') {
    transports.push(
      new winston.transports.DailyRotateFile({
        level: LOG_LEVEL,
        dirname: LOG_DIR,
        filename: 'zayjar-api-%DATE%.log',
        datePattern: 'YYYY-MM-DD',
        maxSize: '50m',
        maxFiles: '14d',
        zippedArchive: true,
        format: winston.format.combine(
          winston.format.timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' }),
          winston.format.errors({ stack: true }),
          maskTransform(),
          winston.format.json(),
        ),
      }),
      new winston.transports.DailyRotateFile({
        level: 'error',
        dirname: LOG_DIR,
        filename: 'zayjar-error-%DATE%.log',
        datePattern: 'YYYY-MM-DD',
        maxSize: '50m',
        maxFiles: '30d',
        zippedArchive: true,
        format: winston.format.combine(
          winston.format.timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' }),
          winston.format.errors({ stack: true }),
          maskTransform(),
          winston.format.json(),
        ),
      }),
    );
  }

  return winston.createLogger({
    level: LOG_LEVEL,
    defaultMeta: { service: 'zayjar-api' },
    transports,
  });
}

export class ZayjarLogger implements LoggerService {
  private winston: winston.Logger;
  private contextName: string;

  constructor(context?: string) {
    this.winston = createWinstonLogger();
    this.contextName = context || 'Application';
  }

  setContext(context: string): void {
    this.contextName = context;
  }

  error(message: string, trace?: string, context?: string): void {
    this.winston.error(message, {
      context: context || this.contextName,
      stack: trace,
    });
  }

  warn(message: string, context?: string): void {
    this.winston.warn(message, {
      context: context || this.contextName,
    });
  }

  log(message: string, context?: string): void {
    this.winston.info(message, {
      context: context || this.contextName,
    });
  }

  debug(message: string, context?: string): void {
    this.winston.debug(message, {
      context: context || this.contextName,
    });
  }

  verbose(message: string, context?: string): void {
    this.winston.verbose(message, {
      context: context || this.contextName,
    });
  }

  logRequest(method: string, url: string, statusCode: number, duration: number, meta?: Record<string, unknown>): void {
    this.winston.info('HTTP Request', {
      context: 'HTTP',
      method,
      url,
      statusCode,
      duration,
      ...meta,
    });
  }

  logError(error: Error, context?: string, meta?: Record<string, unknown>): void {
    this.winston.error(error.message, {
      context: context || this.contextName,
      stack: error.stack,
      name: error.name,
      ...meta,
    });
  }

  logPerformance(operation: string, duration: number, meta?: Record<string, unknown>): void {
    this.winston.info('Performance', {
      context: 'Performance',
      operation,
      duration,
      ...meta,
    });
  }

  child(context: string): ZayjarLogger {
    const childLogger = new ZayjarLogger(context);
    childLogger.winston = this.winston.child({ context });
    return childLogger;
  }
}

let globalLogger: ZayjarLogger;

export function getGlobalLogger(): ZayjarLogger {
  if (!globalLogger) {
    globalLogger = new ZayjarLogger('Application');
  }
  return globalLogger;
}

export function createLogger(context: string): ZayjarLogger {
  return new ZayjarLogger(context);
}
