module.exports = {
  testEnvironment: 'jest-fixed-jsdom',
  setupFilesAfterEnv: ['<rootDir>/../../packages/jest-preset/jest-setup.js'],
  moduleNameMapper: {
    '^next/image$': '<rootDir>/__mocks__/next-image.js',
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      isolatedModules: true,
      diagnostics: false,
      tsconfig: {
        jsx: 'react-jsx',
        module: 'commonjs',
        moduleResolution: 'node',
        esModuleInterop: true,
        strict: false,
        skipLibCheck: true,
      },
    }],
  },
  moduleDirectories: ['node_modules', '../../node_modules'],
  testMatch: ['**/*.spec.tsx', '**/*.spec.ts'],
};
