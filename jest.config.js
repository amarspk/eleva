module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  // Root test contract: server/API specs only (testEnvironment 'node').
  // Frontend specs run under each app's own jest config (jsdom preset).
  testMatch: ['**/*.spec.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/tests/e2e/', '/playwright/'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      isolatedModules: true,
      diagnostics: false,
    }],
  },
};
