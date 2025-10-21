/**
 * IdeaMine Tools SDK - Schema Validation
 * JSON Schema validation using Ajv
 */

import Ajv, { ValidateFunction, ErrorObject } from 'ajv';
import addFormats from 'ajv-formats';
import { JSONSchema } from '../types';

export class SchemaValidator {
  private ajv: Ajv;
  private validators: Map<string, ValidateFunction>;

  constructor() {
    this.ajv = new Ajv({
      allErrors: true,
      verbose: true,
      strict: false, // Allow additional keywords
      validateFormats: true,
    });

    // Add format validators (email, uri, date-time, etc.)
    addFormats(this.ajv);

    this.validators = new Map();
  }

  /**
   * Compile and cache a JSON Schema
   */
  compile(schemaId: string, schema: JSONSchema): ValidateFunction {
    if (this.validators.has(schemaId)) {
      return this.validators.get(schemaId)!;
    }

    const validator = this.ajv.compile(schema);
    this.validators.set(schemaId, validator);
    return validator;
  }

  /**
   * Validate data against a schema
   */
  validate(
    schema: JSONSchema | ValidateFunction,
    data: any
  ): ValidationResult {
    let validator: ValidateFunction;

    if (typeof schema === 'function') {
      validator = schema;
    } else {
      // Compile on the fly
      validator = this.ajv.compile(schema);
    }

    const valid = validator(data);

    if (valid) {
      return { valid: true };
    }

    return {
      valid: false,
      errors: this.formatErrors(validator.errors || []),
    };
  }

  /**
   * Validate input against tool's input schema
   */
  validateInput(
    schemaId: string,
    schema: JSONSchema,
    input: any
  ): ValidationResult {
    const validator = this.compile(`${schemaId}:input`, schema);
    return this.validate(validator, input);
  }

  /**
   * Validate output against tool's output schema
   */
  validateOutput(
    schemaId: string,
    schema: JSONSchema,
    output: any
  ): ValidationResult {
    const validator = this.compile(`${schemaId}:output`, schema);
    return this.validate(validator, output);
  }

  /**
   * Format Ajv errors into human-readable messages
   */
  private formatErrors(errors: ErrorObject[]): ValidationError[] {
    return errors.map((error) => ({
      path: error.instancePath || '/',
      keyword: error.keyword,
      message: error.message || 'Validation failed',
      params: error.params,
      schemaPath: error.schemaPath,
    }));
  }

  /**
   * Clear all cached validators
   */
  clearCache(): void {
    this.validators.clear();
  }

  /**
   * Get cached validator
   */
  getValidator(schemaId: string): ValidateFunction | undefined {
    return this.validators.get(schemaId);
  }
}

// ============================================================================
// TYPES
// ============================================================================

export interface ValidationResult {
  valid: boolean;
  errors?: ValidationError[];
}

export interface ValidationError {
  path: string; // JSON Pointer path: "/field/subfield"
  keyword: string; // "required", "type", "minimum", etc.
  message: string; // Human-readable error
  params?: Record<string, any>; // Error-specific parameters
  schemaPath?: string; // Path in the schema
}

// ============================================================================
// VALIDATION ERROR CLASS
// ============================================================================

export class SchemaValidationError extends Error {
  public readonly errors: ValidationError[];

  constructor(message: string, errors: ValidationError[]) {
    super(message);
    this.name = 'SchemaValidationError';
    this.errors = errors;

    // Maintain proper stack trace (only available in V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, SchemaValidationError);
    }
  }

  /**
   * Format all errors as a single string
   */
  formatErrors(): string {
    return this.errors
      .map((err) => `  - ${err.path}: ${err.message}`)
      .join('\n');
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Assert that data is valid against schema, throw if not
 */
export function assertValid(
  validator: SchemaValidator,
  schema: JSONSchema,
  data: any,
  errorMessage: string = 'Validation failed'
): void {
  const result = validator.validate(schema, data);

  if (!result.valid) {
    throw new SchemaValidationError(
      `${errorMessage}:\n${formatValidationErrors(result.errors!)}`,
      result.errors!
    );
  }
}

/**
 * Format validation errors as human-readable string
 */
export function formatValidationErrors(errors: ValidationError[]): string {
  return errors.map((err) => `  - ${err.path}: ${err.message}`).join('\n');
}

// ============================================================================
// SINGLETON INSTANCE (optional convenience)
// ============================================================================

export const defaultValidator = new SchemaValidator();
