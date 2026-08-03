import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import { initializeApp, cert, App } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';

export interface FcmSendResult {
  successCount: number;
  failureCount: number;
  unregisteredTokens: string[];
}

/**
 * Firebase Cloud Messaging sender (Sprint 2 Task 7).
 *
 * Replaces the log-only FCM stub with a real provider backed by the
 * `firebase-admin` SDK. Initialization is lazy and driven by environment:
 *   - `FIREBASE_SERVICE_ACCOUNT`     : the full service-account JSON (string)
 *   - `FIREBASE_SERVICE_ACCOUNT_PATH`: path to a service-account JSON file
 * When neither is configured the service reports `isAvailable() === false` and
 * callers keep their previous behavior (no crash, no failed sends) — this
 * preserves dev/test runtime exactly.
 */
@Injectable()
export class FcmService {
  private readonly logger = new Logger(FcmService.name);
  private app: App | null = null;
  private initAttempted = false;

  /** True once firebase-admin is initialized with a real credential. */
  isAvailable(): boolean {
    this.ensureInitialized();
    return this.app !== null;
  }

  private ensureInitialized(): void {
    if (this.app !== null || this.initAttempted) {
      return;
    }
    this.initAttempted = true;
    try {
      const rawJson = process.env.FIREBASE_SERVICE_ACCOUNT;
      const path = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
      if (rawJson) {
        this.app = initializeApp({ credential: cert(JSON.parse(rawJson)) });
      } else if (path) {
        const fileContents = fs.readFileSync(path, 'utf8');
        this.app = initializeApp({ credential: cert(JSON.parse(fileContents)) });
      } else {
        this.logger.warn(
          'FCM disabled: set FIREBASE_SERVICE_ACCOUNT (service-account JSON) or FIREBASE_SERVICE_ACCOUNT_PATH to enable push.',
        );
        return;
      }
      this.logger.log('Firebase Cloud Messaging initialized.');
    } catch (err) {
      this.logger.error(`FCM initialization failed: ${(err as Error).message}`);
    }
  }

  /**
   * Sends a push notification to the given registration tokens via FCM
   * multicast. Returns per-batch success/failure counts and the subset of
   * tokens that are no longer registered (so callers can prune them).
   *
   * Any send-level error is caught and reported as a full failure — callers
   * must never crash because of an FCM outage.
   */
  async sendPush(
    tokens: string[],
    title: string,
    body: string,
    data?: Record<string, unknown>,
  ): Promise<FcmSendResult> {
    this.ensureInitialized();
    if (this.app === null || tokens.length === 0) {
      return { successCount: 0, failureCount: tokens.length, unregisteredTokens: [] };
    }
    try {
      const messaging = getMessaging();
      const batch = await messaging.sendEachForMulticast({
        tokens,
        notification: { title, body },
        data: data
          ? Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)]))
          : undefined,
      });
      const unregisteredTokens = batch.responses
        .map((response, index) => ({ response, token: tokens[index] }))
        .filter(
          ({ response }) =>
            !response.success &&
            (response.error as { code?: string } | undefined)?.code ===
              'messaging/registration-token-not-registered',
        )
        .map(({ token }) => token);
      return {
        successCount: batch.successCount,
        failureCount: batch.failureCount,
        unregisteredTokens,
      };
    } catch (err) {
      this.logger.error(`FCM send failed: ${(err as Error).message}`);
      return { successCount: 0, failureCount: tokens.length, unregisteredTokens: [] };
    }
  }
}
