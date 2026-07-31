import type { SignOptions } from 'jsonwebtoken';

// CAT-5: jsonwebtoken v9 (`@types/jsonwebtoken` 9.0.10) types
// `SignOptions.expiresIn` as `number | StringValue`; the untyped config
// literals widened to `string`. Assert the exact signer-accepted duration type
// at the two config sites (values unchanged — runtime identical). The type is
// derived from `SignOptions` itself because `@types/ms` is not linked into the
// app's visible node_modules scope (direct `from 'ms'` is TS2307 here).
type TokenExpiry = NonNullable<SignOptions['expiresIn']> & string;
function requireSecret(envVar: string, fallback: string): string {
  const value = process.env[envVar];
  if (value) {
    return value;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error(`FATAL: ${envVar} must be set in production. Refusing to start with default secret.`);
  }
  return fallback;
}

export const JWT_CONFIG = {
  accessTokenSecret: requireSecret('JWT_SECRET', 'zayjar-default-secret-key-12345!'),
  accessTokenExpiry: '15m' as TokenExpiry,

  refreshTokenSecret: requireSecret('JWT_REFRESH_SECRET', 'zayjar-default-refresh-secret-key-999!'),
  refreshTokenExpiry: '7d' as TokenExpiry,

  cookieOptions: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  }
};
