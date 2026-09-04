/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        gold: {
          50: '#fdf9f0',
          100: '#f7edcc',
          200: '#efd699',
          300: '#e4bf66',
          400: '#d9a83d',
          500: '#c79a2e',
          600: '#a67c22',
          700: '#7d5d1b',
          800: '#544115',
          900: '#2b240d',
        },
        luxury: {
          black: '#08080b',
          panel: '#111118',
          elevated: '#1a1a22',
          border: '#2a2a34',
          muted: '#b2b2c5',
        },
      },
    },
  },
  plugins: [],
};
