/**
 * IdeaMine Tools SDK - TypeScript
 * Main export file for tool SDK
 */

// ============================================================================
// CLIENT EXPORTS
// ============================================================================

export {
  ToolClient,
  createToolClient,
  HTTPTransport,
  createHTTPTransport,
  buildQueryString,
  withRetry,
  RetryConfig,
  DEFAULT_RETRY_CONFIG,
  aggressiveRetryPolicy,
  conservativeRetryPolicy,
  noRetryPolicy,
  CircuitBreaker,
} from './client';

// ============================================================================
// SERVER EXPORTS
// ============================================================================

export {
  ToolServer,
  createToolServer,
  runToolServer,
  createHandler,
  StdinHandler,
  StdoutWriter,
  createStdinHandler,
  createStdoutWriter,
  processStdinRequest,
  createServerLogger,
  createExecutionLogger,
} from './server';

// ============================================================================
// VALIDATION EXPORTS
// ============================================================================

export {
  SchemaValidator,
  assertValid,
  formatValidationErrors,
  defaultValidator,
  SchemaValidationError,
} from './validation/schema-validator';

// ============================================================================
// TELEMETRY EXPORTS
// ============================================================================

export {
  ToolTelemetry,
  getTraceContext,
  injectTraceContext,
  defaultTelemetry,
} from './utils/telemetry';

// ============================================================================
// UTILITY EXPORTS
// ============================================================================

export {
  // Crypto
  sha256,
  sha256Object,
  md5,
  computeExecutionKey,
  computeInputHash,
  computeArtifactHash,
  normalizeObject,
  randomHex,
  randomUUID,
  generateExecutionId,
  generateIdempotencyToken,
  verifyArtifactHash,
  constantTimeCompare,
  toBase64,
  fromBase64,
  fromBase64ToBuffer,
  toBase64Url,
  fromBase64Url,

  // Errors
  ToolSDKError,
  ValidationError,
  InputValidationError,
  OutputValidationError,
  ToolExecutionException,
  ToolTimeoutError,
  ResourceLimitError,
  TransportError,
  NetworkError,
  HTTPError,
  ToolNotFoundError,
  ToolDeprecatedError,
  AccessDeniedError,
  ConfigurationError,
  toToolExecutionError,
  isRetryableError,
  getErrorMessage,

  // Logger
  createLogger,
  WinstonToolLogger,
  NoOpLogger,
  defaultLogger,
  createExecutionLogger as createClientExecutionLogger,
  createServerLogger as createClientServerLogger,
  createClientLogger,
  sanitizeLogData,
} from './utils';

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export * from './types';

// ============================================================================
// VERSION
// ============================================================================

export const SDK_VERSION = '1.0.0';
