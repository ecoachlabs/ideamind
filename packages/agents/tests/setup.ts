/**
 * Jest test setup for agents package
 */

// Set test environment variables
process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || 'test-api-key';
process.env.NODE_ENV = 'test';

// Global test timeout (20 seconds for LLM calls)
jest.setTimeout(20000);
