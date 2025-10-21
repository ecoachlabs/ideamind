/**
 * IdeaMine Tools SDK - Error Classes
 * Comprehensive error types for tool execution and validation
 */

import { ToolExecutionError } from '../types';

// ============================================================================
// BASE ERROR CLASS
// ============================================================================

export class ToolSDKError extends Error {
  public readonly code: string;
  public readonly retryable: boolean;
  public readonly statusCode?: number;

  constructor(
    message: string,
    code: string = 'TOOL_SDK_ERROR',
    retryable: boolean = false,
    statusCode?: number
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.retryable = retryable;
    this.statusCode = statusCode;

    // Maintain proper stack trace (only available in V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  toJSON(): Record<string, any> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      retryable: this.retryable,
      statusCode: this.statusCode,
      stack: this.stack,
    };
  }
}

// ============================================================================
// VALIDATION ERRORS
// ============================================================================

export class ValidationError extends ToolSDKError {
  public readonly errors: Array<{
    path: string;
    message: string;
    keyword: string;
  }>;

  constructor(message: string, errors: any[] = []) {
    super(message, 'VALIDATION_ERROR', false, 400);
    this.errors = errors;
  }

  toToolExecutionError(): ToolExecutionError {
    return {
      type: 'validation',
      message: this.message,
      stack: this.stack,
      retryable: false,
    };
  }
}

export class InputValidationError extends ValidationError {
  constructor(message: string, errors: any[] = []) {
    super(`Input validation failed: ${message}`, errors);
    this.code = 'INPUT_VALIDATION_ERROR';
  }
}

export class OutputValidationError extends ValidationError {
  constructor(message: string, errors: any[] = []) {
    super(`Output validation failed: ${message}`, errors);
    this.code = 'OUTPUT_VALIDATION_ERROR';
  }
}

// ============================================================================
// EXECUTION ERRORS
// ============================================================================

export class ToolExecutionException extends ToolSDKError {
  public readonly executionId?: string;
  public readonly toolId?: string;
  public readonly version?: string;

  constructor(
    message: string,
    retryable: boolean = false,
    metadata?: {
      executionId?: string;
      toolId?: string;
      version?: string;
    }
  ) {
    super(message, 'TOOL_EXECUTION_ERROR', retryable, 500);
    this.executionId = metadata?.executionId;
    this.toolId = metadata?.toolId;
    this.version = metadata?.version;
  }

  toToolExecutionError(): ToolExecutionError {
    return {
      type: 'runtime',
      message: this.message,
      stack: this.stack,
      retryable: this.retryable,
    };
  }
}

export class ToolTimeoutError extends ToolSDKError {
  public readonly timeoutMs: number;

  constructor(message: string, timeoutMs: number) {
    super(message, 'TOOL_TIMEOUT_ERROR', false, 408);
    this.timeoutMs = timeoutMs;
  }

  toToolExecutionError(): ToolExecutionError {
    return {
      type: 'timeout',
      message: this.message,
      stack: this.stack,
      retryable: false,
    };
  }
}

export class ResourceLimitError extends ToolSDKError {
  public readonly limitType: 'cpu' | 'memory' | 'cost';
  public readonly limit: number;
  public readonly actual: number;

  constructor(
    message: string,
    limitType: 'cpu' | 'memory' | 'cost',
    limit: number,
    actual: number
  ) {
    super(message, 'RESOURCE_LIMIT_ERROR', false, 429);
    this.limitType = limitType;
    this.limit = limit;
    this.actual = actual;
  }

  toToolExecutionError(): ToolExecutionError {
    return {
      type: 'resource_limit',
      message: this.message,
      stack: this.stack,
      retryable: false,
    };
  }
}

// ============================================================================
// TRANSPORT ERRORS
// ============================================================================

export class TransportError extends ToolSDKError {
  public readonly originalError?: Error;

  constructor(message: string, retryable: boolean = true, originalError?: Error) {
    super(message, 'TRANSPORT_ERROR', retryable, 503);
    this.originalError = originalError;
  }
}

export class NetworkError extends TransportError {
  constructor(message: string, originalError?: Error) {
    super(`Network error: ${message}`, true, originalError);
    this.code = 'NETWORK_ERROR';
  }
}

export class HTTPError extends TransportError {
  public readonly statusCode: number;
  public readonly responseBody?: string;

  constructor(
    message: string,
    statusCode: number,
    responseBody?: string,
    retryable: boolean = false
  ) {
    super(message, retryable);
    this.code = 'HTTP_ERROR';
    this.statusCode = statusCode;
    this.responseBody = responseBody;
  }

  static fromResponse(statusCode: number, responseBody?: string): HTTPError {
    const retryable = statusCode >= 500 || statusCode === 429 || statusCode === 408;
    return new HTTPError(
      `HTTP ${statusCode}: ${getStatusMessage(statusCode)}`,
      statusCode,
      responseBody,
      retryable
    );
  }
}

// ============================================================================
// REGISTRY ERRORS
// ============================================================================

export class ToolNotFoundError extends ToolSDKError {
  public readonly toolId: string;
  public readonly version?: string;

  constructor(toolId: string, version?: string) {
    const message = version
      ? `Tool '${toolId}' version '${version}' not found`
      : `Tool '${toolId}' not found`;
    super(message, 'TOOL_NOT_FOUND', false, 404);
    this.toolId = toolId;
    this.version = version;
  }
}

export class ToolDeprecatedError extends ToolSDKError {
  public readonly toolId: string;
  public readonly version: string;
  public readonly reason?: string;

  constructor(toolId: string, version: string, reason?: string) {
    super(
      `Tool '${toolId}' version '${version}' is deprecated${reason ? `: ${reason}` : ''}`,
      'TOOL_DEPRECATED',
      false,
      410
    );
    this.toolId = toolId;
    this.version = version;
    this.reason = reason;
  }
}

export class AccessDeniedError extends ToolSDKError {
  public readonly toolId: string;
  public readonly agentId?: string;
  public readonly phase?: string;

  constructor(toolId: string, reason?: string, metadata?: { agentId?: string; phase?: string }) {
    super(
      reason || `Access denied to tool '${toolId}'`,
      'ACCESS_DENIED',
      false,
      403
    );
    this.toolId = toolId;
    this.agentId = metadata?.agentId;
    this.phase = metadata?.phase;
  }
}

// ============================================================================
// CONFIGURATION ERRORS
// ============================================================================

export class ConfigurationError extends ToolSDKError {
  public readonly parameterName?: string;

  constructor(message: string, parameterName?: string) {
    super(message, 'CONFIGURATION_ERROR', false, 500);
    this.parameterName = parameterName;
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get human-readable HTTP status message
 */
function getStatusMessage(statusCode: number): string {
  const messages: Record<number, string> = {
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    408: 'Request Timeout',
    409: 'Conflict',
    410: 'Gone',
    422: 'Unprocessable Entity',
    429: 'Too Many Requests',
    500: 'Internal Server Error',
    502: 'Bad Gateway',
    503: 'Service Unavailable',
    504: 'Gateway Timeout',
  };

  return messages[statusCode] || 'Unknown Status';
}

/**
 * Convert any error to ToolExecutionError
 */
export function toToolExecutionError(error: unknown): ToolExecutionError {
  if (error instanceof ValidationError) {
    return error.toToolExecutionError();
  }

  if (error instanceof ToolTimeoutError) {
    return error.toToolExecutionError();
  }

  if (error instanceof ResourceLimitError) {
    return error.toToolExecutionError();
  }

  if (error instanceof ToolExecutionException) {
    return error.toToolExecutionError();
  }

  if (error instanceof ToolSDKError) {
    return {
      type: 'runtime',
      message: error.message,
      stack: error.stack,
      retryable: error.retryable,
    };
  }

  if (error instanceof Error) {
    return {
      type: 'unknown',
      message: error.message,
      stack: error.stack,
      retryable: false,
    };
  }

  return {
    type: 'unknown',
    message: String(error),
    retryable: false,
  };
}

/**
 * Check if error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof ToolSDKError) {
    return error.retryable;
  }

  if (error instanceof Error) {
    // Network errors are typically retryable
    const message = error.message.toLowerCase();
    return (
      message.includes('timeout') ||
      message.includes('econnrefused') ||
      message.includes('econnreset') ||
      message.includes('etimedout') ||
      message.includes('network')
    );
  }

  return false;
}

/**
 * Extract error message safely
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  return 'Unknown error occurred';
}
