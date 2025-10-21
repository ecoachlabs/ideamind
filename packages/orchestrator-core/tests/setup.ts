/**
 * Jest Test Setup
 *
 * Global setup for all tests
 */

// Set test environment variables
process.env.NODE_ENV = 'test';

// Suppress console logs during tests (unless DEBUG=true)
if (!process.env.DEBUG) {
  global.console = {
    ...console,
    log: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    // Keep error for debugging test failures
    error: console.error,
  };
}

// Set default test database URL if not provided
if (!process.env.TEST_DATABASE_URL) {
  process.env.TEST_DATABASE_URL = 'postgresql://localhost:5432/ideamine_test';
}

// Extend Jest timeout for integration tests
jest.setTimeout(30000);

// Global test utilities
global.testUtils = {
  async delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  },

  generateTestId(prefix: string = 'TEST'): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  },
};

// Type definitions for global test utilities
declare global {
  var testUtils: {
    delay(ms: number): Promise<void>;
    generateTestId(prefix?: string): string;
  };
}

export {};
