/**
 * Standardized Error Handling with Result Type Pattern
 * LOW PRIORITY FIX #24: Consistent error handling across codebase
 *
 * Provides:
 * - Type-safe error handling
 * - No exceptions in happy path
 * - Clear success/failure semantics
 * - Composable error handling
 */

/**
 * Result type for operations that can fail
 *
 * Success: { success: true, value: T }
 * Failure: { success: false, error: E }
 */
export type Result<T, E = Error> =
  | { success: true; value: T }
  | { success: false; error: E };

/**
 * Create a successful result
 */
export function Ok<T>(value: T): Result<T, never> {
  return { success: true, value };
}

/**
 * Create a failed result
 */
export function Err<E = Error>(error: E): Result<never, E> {
  return { success: false, error };
}

/**
 * Check if result is successful
 */
export function isOk<T, E>(result: Result<T, E>): result is { success: true; value: T } {
  return result.success === true;
}

/**
 * Check if result is a failure
 */
export function isErr<T, E>(result: Result<T, E>): result is { success: false; error: E } {
  return result.success === false;
}

/**
 * Unwrap a result, throwing if it's an error
 */
export function unwrap<T, E>(result: Result<T, E>): T {
  if (isOk(result)) {
    return result.value;
  }
  throw result.error;
}

/**
 * Unwrap a result, returning default value if it's an error
 */
export function unwrapOr<T, E>(result: Result<T, E>, defaultValue: T): T {
  if (isOk(result)) {
    return result.value;
  }
  return defaultValue;
}

/**
 * Map the success value of a result
 */
export function map<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => U
): Result<U, E> {
  if (isOk(result)) {
    return Ok(fn(result.value));
  }
  return result;
}

/**
 * Map the error value of a result
 */
export function mapErr<T, E, F>(
  result: Result<T, E>,
  fn: (error: E) => F
): Result<T, F> {
  if (isErr(result)) {
    return Err(fn(result.error));
  }
  return result;
}

/**
 * Chain operations that return Results
 */
export function andThen<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => Result<U, E>
): Result<U, E> {
  if (isOk(result)) {
    return fn(result.value);
  }
  return result;
}

/**
 * Wrap a promise in a Result
 */
export async function fromPromise<T, E = Error>(
  promise: Promise<T>
): Promise<Result<T, E>> {
  try {
    const value = await promise;
    return Ok(value);
  } catch (error) {
    return Err(error as E);
  }
}

/**
 * Wrap a function that might throw in a Result
 */
export function tryCatch<T, E = Error>(
  fn: () => T
): Result<T, E> {
  try {
    return Ok(fn());
  } catch (error) {
    return Err(error as E);
  }
}

/**
 * Async version of tryCatch
 */
export async function tryCatchAsync<T, E = Error>(
  fn: () => Promise<T>
): Promise<Result<T, E>> {
  try {
    const value = await fn();
    return Ok(value);
  } catch (error) {
    return Err(error as E);
  }
}

/**
 * Collect multiple Results into a single Result of an array
 * Fails if any of the Results is an error
 */
export function collect<T, E>(results: Result<T, E>[]): Result<T[], E> {
  const values: T[] = [];

  for (const result of results) {
    if (isErr(result)) {
      return result;
    }
    values.push(result.value);
  }

  return Ok(values);
}

/**
 * Standard application error types
 */
export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 500,
    public readonly details?: any
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 'VALIDATION_ERROR', 400, details);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    super(
      id ? `${resource} with id ${id} not found` : `${resource} not found`,
      'NOT_FOUND',
      404
    );
    this.name = 'NotFoundError';
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized') {
    super(message, 'UNAUTHORIZED', 401);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Forbidden') {
    super(message, 'FORBIDDEN', 403);
    this.name = 'ForbiddenError';
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 'CONFLICT', 409, details);
    this.name = 'ConflictError';
  }
}

export class RateLimitError extends AppError {
  constructor(retryAfter?: number) {
    super(
      'Rate limit exceeded',
      'RATE_LIMIT',
      429,
      retryAfter ? { retryAfter } : undefined
    );
    this.name = 'RateLimitError';
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(service: string) {
    super(`Service ${service} is unavailable`, 'SERVICE_UNAVAILABLE', 503);
    this.name = 'ServiceUnavailableError';
  }
}

/**
 * Convert error to app error
 */
export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }

  if (error instanceof Error) {
    return new AppError(error.message, 'INTERNAL_ERROR', 500);
  }

  return new AppError('Unknown error occurred', 'UNKNOWN_ERROR', 500);
}

/**
 * Example usage:
 *
 * async function getUserById(id: string): Promise<Result<User, AppError>> {
 *   const result = await tryCatchAsync(async () => {
 *     const user = await db.user.findUnique({ where: { id } });
 *     if (!user) {
 *       throw new NotFoundError('User', id);
 *     }
 *     return user;
 *   });
 *
 *   return mapErr(result, toAppError);
 * }
 *
 * // Calling code:
 * const result = await getUserById('123');
 * if (isOk(result)) {
 *   console.log('User:', result.value);
 * } else {
 *   console.error('Error:', result.error.message);
 * }
 */
