/** @type {import('tailwindcss').Config} */
module.exports = {
  // Scan every source file that can emit class names. Tailwind JIT only
  // generates CSS for classes it finds here, so a missing path silently
  // produces unstyled markup — the exact failure mode this app shipped with.
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      // Tenant branding is delivered at runtime as JSONB (Tenant.branding) and
      // applied via inline styles / CSS variables, so brand colours are NOT
      // hardcoded here. These tokens only back the neutral chrome.
      colors: {
        brand: {
          DEFAULT: 'var(--brand-primary, #0B5FFF)',
          secondary: 'var(--brand-secondary, #FFFFFF)',
        },
      },
    },
  },
  plugins: [],
};
