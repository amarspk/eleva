/**
 * Narrow escape hatch for Prisma models that exist in the live schema
 * but not yet in the tracked generated client (ENVIRONMENT BLOCKED).
 * Casts only — no runtime behavior.
 */
export interface CustomerWalletRow {
  id: string;
  tenantId: string;
  balance: unknown;
}

export interface WelcomeOfferConfigRow {
  enabled: unknown;
  discountType: string;
  discountValue: unknown;
  minOrderAmount: unknown;
}

export interface Phase4Delegates {
  loyaltyRule: {
    findUnique: (args: unknown) => Promise<Record<string, unknown> | null>;
    upsert: (args: unknown) => Promise<Record<string, unknown>>;
  };
  welcomeOfferConfig: {
    findUnique: (args: unknown) => Promise<WelcomeOfferConfigRow | null>;
    findFirst: (args: unknown) => Promise<WelcomeOfferConfigRow | null>;
    upsert: (args: unknown) => Promise<WelcomeOfferConfigRow>;
  };
  welcomeRedemption: {
    findUnique: (args: unknown) => Promise<Record<string, unknown> | null>;
  };
  customerWallet: {
    findUnique: (args: unknown) => Promise<CustomerWalletRow | null>;
    create: (args: unknown) => Promise<CustomerWalletRow>;
    update: (args: unknown) => Promise<CustomerWalletRow>;
  };
  walletTransaction: {
    findMany: (args: unknown) => Promise<Array<Record<string, unknown>>>;
    create: (args: unknown) => Promise<Record<string, unknown>>;
  };
  tenantDesign: {
    findUnique: (args: unknown) => Promise<{ published?: unknown } | null>;
  };
  customer: {
    findUnique: (args: unknown) => Promise<Record<string, unknown> | null>;
    update: (args: unknown) => Promise<Record<string, unknown>>;
  };
  discount: {
    create: (args: unknown) => Promise<unknown>;
  };
  loyaltyTransaction: {
    create: (args: unknown) => Promise<unknown>;
  };
  $transaction: <T>(fn: (tx: Phase4Delegates) => Promise<T>) => Promise<T>;
}

export function phase4Prisma(client: unknown): Phase4Delegates {
  return client as Phase4Delegates;
}
