module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/index.ts',
    '!src/**/index.ts',
  ],
  coverageThreshold: {
    global: {
      branches: 60,
      functions: 65,
      lines: 70,
      statements: 70,
    },
  },
  moduleNameMapper: {
    '^@ideamine/agent-sdk(.*)$': '<rootDir>/../agent-sdk/src$1',
    '^@ideamine/tool-sdk(.*)$': '<rootDir>/../tool-sdk/src$1',
    '^@ideamine/event-schemas$': '<rootDir>/../event-schemas/src',
    '^@ideamine/artifact-schemas$': '<rootDir>/../artifact-schemas/src',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: {
          esModuleInterop: true,
          allowSyntheticDefaultImports: true,
          module: 'commonjs',
        },
      },
    ],
  },
  maxWorkers: '50%',
  testTimeout: 30000, // 30 seconds for integration tests
  verbose: true,
};
