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
  accessTokenExpiry: '15m',

  refreshTokenSecret: requireSecret('JWT_REFRESH_SECRET', 'zayjar-default-refresh-secret-key-999!'),
  refreshTokenExpiry: '7d',

  cookieOptions: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  }
};
