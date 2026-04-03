import type { Config } from 'jest';

const config: Config = {
  preset: 'jest-expo/ios',
  roots: ['<rootDir>/tests'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|@shopify/.*|posthog-react-native|drizzle-orm|uniwind)',
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  setupFiles: ['<rootDir>/tests/setup.ts'],
  testMatch: ['<rootDir>/tests/**/*.test.ts'],
  // better-sqlite3 is native C++ — never transform it
  modulePathIgnorePatterns: ['<rootDir>/node_modules/better-sqlite3/'],
  testPathIgnorePatterns: ['/node_modules/'],
  forceExit: true,
};

export default config;
