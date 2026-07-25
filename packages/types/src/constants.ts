export const PLATFORM_LIMITS = {
  BRONZE: {
    maxBranches: 1,
    maxRestaurants: 1,
    maxProductsPerBranch: 100,
    allowCustomDomains: false,
    allowOnlinePayments: false,
    allowAnalytics: false,
  },
  SILVER: {
    maxBranches: 3,
    maxRestaurants: 1,
    maxProductsPerBranch: 500,
    allowCustomDomains: false,
    allowOnlinePayments: true,
    allowAnalytics: true,
  },
  GOLD: {
    maxBranches: 9999, // Unlimited
    maxRestaurants: 9999,
    maxProductsPerBranch: 99999,
    allowCustomDomains: true,
    allowOnlinePayments: true,
    allowAnalytics: true,
  },
};

export const SECURITY_CONFIG = {
  accessTokenExpiry: '15m',
  refreshTokenExpiry: '7d',
  cookieMaxAge: 7 * 24 * 60 * 60 * 1000, // 7 Days in ms
};

export const IMAGE_LIMITS = {
  logoMaxSize: 2 * 1024 * 1024, // 2MB
  bannerMaxSize: 4 * 1024 * 1024, // 4MB
  productMaxSize: 5 * 1024 * 1024, // 5MB
  allowedTypes: ['image/jpeg', 'image/png', 'image/webp'],
};

/** @deprecated Use MEDIA_TYPE_CONFIG instead */
export const BRAND_DEFAULTS = {
  primaryColor: '#000000',
  secondaryColor: '#FFFFFF',
};

export const MEDIA_TYPE_CONFIG = {
  IMAGE: {
    maxSize: 5 * 1024 * 1024,
    allowedTypes: ['image/jpeg', 'image/png', 'image/webp'],
    dimensions: {
      thumbnail: { width: 200, height: 200, fit: 'cover' as const },
      medium:    { width: 600, height: 600, fit: 'inside' as const },
      large:     { width: 1200, height: 1200, fit: 'inside' as const },
    },
  },
  LOGO: {
    maxSize: 2 * 1024 * 1024,
    allowedTypes: ['image/jpeg', 'image/png', 'image/webp'],
    dimensions: {
      thumbnail: { width: 128, height: 128, fit: 'cover' as const },
      medium:    { width: 256, height: 256, fit: 'cover' as const },
      large:     { width: 512, height: 512, fit: 'cover' as const },
    },
  },
  BANNER: {
    maxSize: 4 * 1024 * 1024,
    allowedTypes: ['image/jpeg', 'image/png', 'image/webp'],
    dimensions: {
      thumbnail: { width: 400, height: 200, fit: 'cover' as const },
      medium:    { width: 800, height: 400, fit: 'cover' as const },
      large:     { width: 1920, height: 960, fit: 'cover' as const },
    },
  },
  AVATAR: {
    maxSize: 2 * 1024 * 1024,
    allowedTypes: ['image/jpeg', 'image/png', 'image/webp'],
    dimensions: {
      thumbnail: { width: 96, height: 96, fit: 'cover' as const },
      medium:    { width: 192, height: 192, fit: 'cover' as const },
      large:     { width: 384, height: 384, fit: 'cover' as const },
    },
  },
  DOCUMENT: {
    maxSize: 10 * 1024 * 1024,
    allowedTypes: ['application/pdf'],
    dimensions: null,
  },
} as const;
