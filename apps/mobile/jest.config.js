/**
 * Jest is the second test runner in this monorepo, scoped to apps/mobile only
 * (ADR-025). React Native / Expo cannot run under Vitest, so the mobile unit and
 * component tests use jest-expo + @testing-library/react-native.
 */
module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest-setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  // Transform ESM/Flow-published deps. pnpm nests packages under `.pnpm/`, so
  // the negative lookahead must optionally skip that segment and match package
  // dir prefixes (scopes are `+`-encoded, e.g. `@react-native+js-polyfills@…`).
  transformIgnorePatterns: [
    'node_modules/(?!(?:\\.pnpm/)?(?:jest-)?(@?react-native|@react-native-community|expo|@expo|@expo-google-fonts|react-navigation|@react-navigation|@unimodules|unimodules|sentry-expo|native-base|react-native-svg|@tamagui|tamagui|uuid|@autodidact))',
  ],
  testMatch: [
    '<rootDir>/src/**/__tests__/**/*.test.{ts,tsx}',
    '<rootDir>/app/**/__tests__/**/*.test.{ts,tsx}',
  ],
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/*.d.ts', '!src/design/**'],
};
