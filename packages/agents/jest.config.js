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
      branches: 70,
      functions: 75,
      lines: 80,
      statements: 80,
    },
  },
  moduleNameMapper: {
    '^@ideamine/agent-sdk$': '<rootDir>/../agent-sdk/src',
    '^@ideamine/schemas$': '<rootDir>/../schemas/src',
    '^@ideamine/tools$': '<rootDir>/../tools/src',
    '^@ideamine/event-bus$': '<rootDir>/../event-bus/src',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: {
          esModuleInterop: true,
          allowSyntheticDefaultImports: true,
        },
      },
    ],
  },
  maxWorkers: '50%',
  testTimeout: 20000,
};
