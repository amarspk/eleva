import { ConsoleLogger } from '@nestjs/common';
import { sensitiveFieldsMask } from './sensitive-data.mask';

const MASKED_FIELDS = [
  'password', 'passwd', 'secret', 'token', 'api_key', 'apiKey',
  'authorization', 'cookie', 'session', 'credit_card', 'creditCard',
  'ssn', 'pin', 'otp', 'access_token', 'accessToken', 'refresh_token',
  'refreshToken', 'private_key', 'privateKey', 'secret_key', 'secretKey',
];

export class MaskedConsoleLogger extends ConsoleLogger {
  protected formatMessage(message: string): string {
    return message;
  }

  protected formatContext(context: string): string {
    return `[${context}]`;
  }

  protected formatStack(stack: string): string {
    return stack;
  }

  log(message: string, ...args: unknown[]): void {
    const masked = this.maskArgs(args);
    super.log(message, ...masked);
  }

  error(message: string, ...args: unknown[]): void {
    const masked = this.maskArgs(args);
    super.error(message, ...masked);
  }

  warn(message: string, ...args: unknown[]): void {
    const masked = this.maskArgs(args);
    super.warn(message, ...masked);
  }

  debug(message: string, ...args: unknown[]): void {
    const masked = this.maskArgs(args);
    super.debug(message, ...masked);
  }

  verbose(message: string, ...args: unknown[]): void {
    const masked = this.maskArgs(args);
    super.verbose(message, ...masked);
  }

  private maskArgs(args: unknown[]): unknown[] {
    return args.map((arg) => {
      if (arg && typeof arg === 'object' && !Array.isArray(arg)) {
        return sensitiveFieldsMask(arg as Record<string, unknown>, MASKED_FIELDS);
      }
      return arg;
    });
  }
}
