import { Injectable, Logger } from '@nestjs/common';
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';

/**
 * Required environment variable that points to the AWS Secrets Manager secret ID or ARN.
 * When set, the service fetches secrets from AWS Secrets Manager at startup.
 * When unset, the service falls back to existing environment variables (local dev).
 */
const SECRETS_ID_ENV = 'AWS_SECRETS_MANAGER_SECRET_ID';
const AWS_REGION_ENV = 'AWS_REGION';

@Injectable()
export class SecretsManagerService {
  private readonly logger = new Logger(SecretsManagerService.name);
  private readonly cache = new Map<string, string>();
  private loaded = false;

  /**
   * Loads secrets from AWS Secrets Manager and injects them into process.env.
   * Falls back to existing process.env values when AWS Secrets Manager is not configured.
   *
   * The secret in AWS Secrets Manager must be a JSON string with key-value pairs
   * matching the expected environment variable names (e.g., {"DATABASE_URL": "...", "JWT_SECRET": "..."}).
   *
   * @param overrideSecretId - Optional secret ID to use instead of AWS_SECRETS_MANAGER_SECRET_ID env var
   */
  async loadSecrets(overrideSecretId?: string): Promise<void> {
    if (this.loaded) {
      this.logger.debug('Secrets already loaded, skipping.');
      return;
    }

    const secretId = overrideSecretId || process.env[SECRETS_ID_ENV];

    if (!secretId) {
      this.logger.warn(
        `${SECRETS_ID_ENV} not set — falling back to environment variables. ` +
        'In production, configure AWS Secrets Manager for centralized secrets management.',
      );
      this.loaded = true;
      return;
    }

    this.logger.log(`Fetching secrets from AWS Secrets Manager: ${secretId}`);

    try {
      const client = new SecretsManagerClient({
        region: process.env[AWS_REGION_ENV] || 'us-east-1',
      });

      const command = new GetSecretValueCommand({ SecretId: secretId });
      const response = await client.send(command);

      if (!response.SecretString) {
        this.logger.error('AWS Secrets Manager returned empty SecretString.');
        this.loaded = true;
        return;
      }

      const secrets: Record<string, string> = JSON.parse(response.SecretString);

      let injectedCount = 0;
      for (const [key, value] of Object.entries(secrets)) {
        if (typeof value === 'string' && value.length > 0) {
          process.env[key] = value;
          this.cache.set(key, value);
          injectedCount++;
        }
      }

      this.logger.log(
        `Successfully injected ${injectedCount} secrets from AWS Secrets Manager.`,
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to fetch secrets from AWS Secrets Manager: ${message}. ` +
        'Falling back to environment variables.',
      );
    }

    this.loaded = true;
  }

  /**
   * Returns a cached secret value by key.
   * Returns undefined if the key was not loaded from Secrets Manager.
   */
  getSecret(key: string): string | undefined {
    return this.cache.get(key);
  }

  /**
   * Returns whether secrets have been loaded.
   */
  isLoaded(): boolean {
    return this.loaded;
  }
}
